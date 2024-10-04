import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { RamsesV3Factory, RamsesV3PoolDeployer } from "../../typechain-types";
import { expect } from "./shared/expect";
import snapshotGasCost from "./shared/snapshotGasCost";

import {
    encodePriceSqrt,
    FeeAmount,
    getCreate2Address,
    TICK_SPACINGS,
} from "./shared/utilities";

const TEST_ADDRESSES: [string, string] = [
    "0x1000000000000000000000000000000000000000",
    "0x2000000000000000000000000000000000000000",
];

describe("RamsesV3Factory", () => {
    let wallet: Wallet, other: Wallet;

    let factory: RamsesV3Factory;
    let poolBytecode: string;

    const fixture = async () => {
        const AccessManager =
            await ethers.getContractFactory("MockAccessManager");
        const accessManager = await AccessManager.deploy();

        const factoryFactory =
            await ethers.getContractFactory("RamsesV3Factory");

        const factory = await factoryFactory.deploy(accessManager.getAddress());

        const Oracle = await ethers.getContractFactory("Oracle");
        const oracle = await Oracle.deploy();
        const Position = await ethers.getContractFactory("Position", {
            libraries: { Oracle: await oracle.getAddress() },
        });
        const position = await Position.deploy();
        const ProtocolActions =
            await ethers.getContractFactory("ProtocolActions");
        const protocolActions = await ProtocolActions.deploy();

        const PoolDeployer = await ethers.getContractFactory(
            "RamsesV3PoolDeployer",
            {
                libraries: {
                    Oracle: await oracle.getAddress(),
                    Position: await position.getAddress(),
                    ProtocolActions: await protocolActions.getAddress(),
                },
            },
        );
        const poolDeployer = await PoolDeployer.deploy(factory.getAddress());

        await factory.initialize(poolDeployer.getAddress());

        poolBytecode = await poolDeployer.poolBytecode();

        return factory;
    };

    before("create fixture loader", async () => {
        [wallet, other] = await (ethers as any).getSigners();
    });

    beforeEach("deploy factory", async () => {
        factory = await loadFixture(fixture);
    });

    it("factory bytecode size", async () => {
        expect(
            ((await ethers.provider.getCode(factory.getAddress())).length - 2) /
                2,
        ).to.matchSnapshot();
    });

    it("pool bytecode size", async () => {
        await factory.createPool(
            TEST_ADDRESSES[0],
            TEST_ADDRESSES[1],
            50,
            encodePriceSqrt(1n, 1n).toString(),
        );
        const poolAddress = getCreate2Address(
            await factory.ramsesV3PoolDeployer(),
            TEST_ADDRESSES,
            50,
            poolBytecode,
        );
        expect(
            ((await ethers.provider.getCode(poolAddress)).length - 2) / 2,
        ).to.matchSnapshot();
    });

    it("initial enabled tickSpacings", async () => {
        expect(await factory.tickSpacingInitialFee(10)).to.eq(500);
        expect(await factory.tickSpacingInitialFee(50)).to.eq(3000);
        expect(await factory.tickSpacingInitialFee(100)).to.eq(10000);
    });

    async function createAndCheckPool(
        tokens: [string, string],
        feeAmount: FeeAmount,
        tickSpacing: number = TICK_SPACINGS[feeAmount],
    ) {
        const create2Address = getCreate2Address(
            await factory.ramsesV3PoolDeployer(),
            tokens,
            tickSpacing,
            poolBytecode,
        );
        const create = factory.createPool(
            tokens[0],
            tokens[1],
            tickSpacing,
            encodePriceSqrt(1n, 1n).toString(),
        );

        await expect(create)
            .to.emit(factory, "PoolCreated")
            .withArgs(
                TEST_ADDRESSES[0],
                TEST_ADDRESSES[1],
                feeAmount,
                tickSpacing,
                create2Address,
            );

        await expect(
            factory.createPool(
                tokens[0],
                tokens[1],
                tickSpacing,
                encodePriceSqrt(1n, 1n).toString(),
            ),
        ).to.be.reverted;
        await expect(
            factory.createPool(
                tokens[1],
                tokens[0],
                tickSpacing,
                encodePriceSqrt(1n, 1n).toString(),
            ),
        ).to.be.reverted;
        expect(
            await factory.getPool(tokens[0], tokens[1], tickSpacing),
            "getPool in order",
        ).to.eq(create2Address);
        expect(
            await factory.getPool(tokens[1], tokens[0], tickSpacing),
            "getPool in reverse",
        ).to.eq(create2Address);

        const pool = await ethers.getContractAt(
            "RamsesV3Pool",
            create2Address,
        );
        expect(await pool.factory(), "pool factory address").to.eq(
            await factory.getAddress(),
        );
        expect(await pool.token0(), "pool token0").to.eq(TEST_ADDRESSES[0]);
        expect(await pool.token1(), "pool token1").to.eq(TEST_ADDRESSES[1]);
        expect(await pool.fee(), "pool fee").to.eq(feeAmount);
        expect(await pool.tickSpacing(), "pool tick spacing").to.eq(
            tickSpacing,
        );
    }

    describe("#createPool", () => {
        it("succeeds for low fee pool", async () => {
            await createAndCheckPool(TEST_ADDRESSES, FeeAmount.LOW);
        });

        it("succeeds for medium fee pool", async () => {
            await createAndCheckPool(TEST_ADDRESSES, FeeAmount.MEDIUM);
        });
        it("succeeds for high fee pool", async () => {
            await createAndCheckPool(TEST_ADDRESSES, FeeAmount.HIGH);
        });

        it("succeeds if tokens are passed in reverse", async () => {
            await createAndCheckPool(
                [TEST_ADDRESSES[1], TEST_ADDRESSES[0]],
                FeeAmount.MEDIUM,
            );
        });

        it("fails if token a == token b", async () => {
            await expect(
                factory.createPool(
                    TEST_ADDRESSES[0],
                    TEST_ADDRESSES[0],
                    FeeAmount.LOW,
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            ).to.be.reverted;
        });

        it("fails if token a is 0 or token b is 0", async () => {
            await expect(
                factory.createPool(
                    TEST_ADDRESSES[0],
                    ethers.ZeroAddress,
                    TICK_SPACINGS[FeeAmount.LOW],
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            ).to.be.reverted;
            await expect(
                factory.createPool(
                    ethers.ZeroAddress,
                    TEST_ADDRESSES[0],
                    TICK_SPACINGS[FeeAmount.LOW],
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            ).to.be.reverted;
            await expect(
                factory.createPool(
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    TICK_SPACINGS[FeeAmount.LOW],
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            ).to.be.reverted;
        });

        it("fails if tick spacing is not enabled", async () => {
            await expect(
                factory.createPool(
                    TEST_ADDRESSES[0],
                    TEST_ADDRESSES[1],
                    300,
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            ).to.be.reverted;
        });

        it("gas", async () => {
            await snapshotGasCost(
                factory.createPool(
                    TEST_ADDRESSES[0],
                    TEST_ADDRESSES[1],
                    TICK_SPACINGS[FeeAmount.MEDIUM],
                    encodePriceSqrt(1n, 1n).toString(),
                ),
            );
        });
    });

    describe("#enableFeeAmount", () => {
        it("fails if fee is too great", async () => {
            await expect(factory.enableTickSpacing(300, 1000000)).to.be
                .reverted;
        });
        it("fails if tick spacing is too small", async () => {
            await expect(factory.enableTickSpacing(0, 500)).to.be.reverted;
        });
        it("fails if tick spacing is too large", async () => {
            await expect(factory.enableTickSpacing(16834, 500)).to.be.reverted;
        });
        it("fails if already initialized", async () => {
            await factory.enableTickSpacing(25, 99);
            await expect(factory.enableTickSpacing(25, 99)).to.be.reverted;
        });
        it("sets the fee amount in the mapping", async () => {
            await factory.enableTickSpacing(25, 99);
            expect(await factory.tickSpacingInitialFee(25)).to.eq(99);
        });
        it("emits an event", async () => {
            await expect(factory.enableTickSpacing(25, 99))
                .to.emit(factory, "TickSpacingEnabled")
                .withArgs(25, 99);
        });
        it("enables pool creation", async () => {
            await factory.enableTickSpacing(15, 250);
            await createAndCheckPool(
                [TEST_ADDRESSES[0], TEST_ADDRESSES[1]],
                //@ts-ignore:  Argument of type '250' is not assignable to parameter of type 'FeeAmount'.
                250,
                15,
            );
        });
    });
});
