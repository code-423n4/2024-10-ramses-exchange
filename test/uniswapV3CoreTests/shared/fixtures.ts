import { ethers } from "hardhat";
import {
    MockTimeRamsesV3Pool,
    RamsesV3Factory,
    TestERC20,
    TestRamsesV3Callee,
    TestRamsesV3Router,
} from "../../../typechain-types";
import { BigNumberish } from "ethers";
interface FactoryFixture {
    factory: RamsesV3Factory;
}

async function factoryFixture(): Promise<FactoryFixture> {
    const AccessManager = await ethers.getContractFactory("MockAccessManager");
    const accessManager = await AccessManager.deploy();

    const factoryFactory = await ethers.getContractFactory("RamsesV3Factory");
    const factory = await factoryFactory.deploy(
        await accessManager.getAddress(),
    );

    const Oracle = await ethers.getContractFactory("Oracle");
    const oracle = await Oracle.deploy();
    const Position = await ethers.getContractFactory("Position", {
        libraries: { Oracle: await oracle.getAddress() },
    });
    const position = await Position.deploy();
    const ProtocolActions = await ethers.getContractFactory("ProtocolActions");
    const protocolActions = await ProtocolActions.deploy();

    const deployerFactory = await ethers.getContractFactory(
        "MockTimeRamsesV3PoolDeployer",
        {
            libraries: {
                Oracle: await oracle.getAddress(),
                Position: await position.getAddress(),
                ProtocolActions: await protocolActions.getAddress(),
            },
        },
    );

    const deployer = await deployerFactory.deploy(factory.getAddress());

    await factory.initialize(deployer.getAddress());
    return { factory };
}

interface TokensFixture {
    token0: TestERC20;
    token1: TestERC20;
    token2: TestERC20;
}

async function tokensFixture(): Promise<TokensFixture> {
    const tokenFactory = await ethers.getContractFactory("contracts/CL/core/test/TestERC20.sol:TestERC20");
    const tokenA = (await tokenFactory.deploy(2n ** 255n)) as TestERC20;
    const tokenB = (await tokenFactory.deploy(2n ** 255n)) as TestERC20;
    const tokenC = (await tokenFactory.deploy(2n ** 255n)) as TestERC20;

    const tokensWithAddresses = await Promise.all(
        [tokenA, tokenB, tokenC].map(async (token) => ({
            token,
            address: (await token.getAddress()).toLowerCase(),
        })),
    );

    tokensWithAddresses.sort((a, b) => a.address.localeCompare(b.address));

    const [token0, token1, token2] = tokensWithAddresses.map((t) => t.token);

    return { token0, token1, token2 };
}

type TokensAndFactoryFixture = FactoryFixture & TokensFixture;

interface PoolFixture extends TokensAndFactoryFixture {
    swapTargetCallee: TestRamsesV3Callee;
    swapTargetRouter: TestRamsesV3Router;
    createPool(
        tickSpacing: number,
        sqrtPriceX96: BigNumberish,
        firstToken?: TestERC20,
        secondToken?: TestERC20,
    ): Promise<MockTimeRamsesV3Pool>;
}

// Monday, October 5, 2020 9:00:00 AM GMT-05:00
export const TEST_POOL_START_TIME = 1601906400;
export const TEST_POOL_START_PERIOD_TIME = 1601510400;
export const SECONDS_PER_LIQUIDITY_INIT =
    "545100501377799618628145949242437061247919718400"; // 1601906400 * 2 ** 128
export const SECONDS_PER_LIQUIDITY_PERIOD_INIT =
    "544965749560498926996614452897894081036183142400"; // 1601510400 * 2 ** 128

export async function poolFixture(): Promise<PoolFixture> {
    const { factory } = await factoryFixture();

    const { token0, token1, token2 } = await tokensFixture();

    const Oracle = await ethers.getContractFactory("Oracle");
    const oracle = await Oracle.deploy();
    const Position = await ethers.getContractFactory("Position", {
        libraries: { Oracle: await oracle.getAddress() },
    });
    const position = await Position.deploy();
    const ProtocolActions = await ethers.getContractFactory("ProtocolActions");
    const protocolActions = await ProtocolActions.deploy();

    const MockTimeRamsesV3PoolFactory = await ethers.getContractFactory(
        "MockTimeRamsesV3Pool",
        {
            libraries: {
                Oracle: await oracle.getAddress(),
                Position: await position.getAddress(),
                ProtocolActions: await protocolActions.getAddress(),
            },
        },
    );

    const calleeContractFactory = await ethers.getContractFactory(
        "contracts/CL/core/test/TestRamsesV3Callee.sol:TestRamsesV3Callee",
    );
    const routerContractFactory = await ethers.getContractFactory(
        "TestRamsesV3Router",
    );

    const swapTargetCallee = await calleeContractFactory.deploy() as TestRamsesV3Callee;
    const swapTargetRouter = await routerContractFactory.deploy();

    return {
        token0,
        token1,
        token2,
        factory,
        swapTargetCallee,
        swapTargetRouter,
        createPool: async (
            tickSpacing,
            sqrtPriceX96,
            firstToken = token0,
            secondToken = token1,
        ) => {
            const tx = await factory.createPool(
                await firstToken.getAddress(),
                await secondToken.getAddress(),
                tickSpacing,
                sqrtPriceX96,
            );

            const receipt = await tx.wait();

            const logs = receipt?.logs[0]!;
            const event = factory.interface.parseLog(logs);
            const poolAddress = event?.args.pool;

            return MockTimeRamsesV3PoolFactory.attach(
                poolAddress,
            ) as MockTimeRamsesV3Pool;
        },
    };
}
