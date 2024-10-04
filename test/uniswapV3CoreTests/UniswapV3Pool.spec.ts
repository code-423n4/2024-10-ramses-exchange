import fs from "fs";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { BigNumberish, Wallet } from "ethers";
import {
    TestERC20,
    TickMathTest,
    SwapMathTest,
    RamsesV3Factory,
    MockTimeRamsesV3Pool,
    TestRamsesV3Callee,
    TestRamsesV3ReentrantCallee,
    TestRamsesV3SwapPay,
} from "../../typechain-types";
import checkObservationEquals from "./shared/checkObservationEquals";
import { expect } from "./shared/expect";

import {
    poolFixture,
    SECONDS_PER_LIQUIDITY_INIT,
    SECONDS_PER_LIQUIDITY_PERIOD_INIT,
    TEST_POOL_START_PERIOD_TIME,
    TEST_POOL_START_TIME,
} from "./shared/fixtures";

import {
    expandTo18Decimals,
    FeeAmount,
    getPositionKey,
    getMaxTick,
    getMinTick,
    encodePriceSqrt,
    TICK_SPACINGS,
    createPoolFunctions,
    SwapFunction,
    MintFunction,
    getMaxLiquidityPerTick,
    FlashFunction,
    MaxUint128,
    MAX_SQRT_RATIO,
    MIN_SQRT_RATIO,
    SwapToPriceFunction,
} from "./shared/utilities";
import { run } from "hardhat";
import * as hre from "hardhat";
import path from "path";

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

describe("RamsesV3Pool", () => {
    let wallet: Wallet, other: Wallet;

    let token0: TestERC20;
    let token1: TestERC20;
    let token2: TestERC20;

    let factory: RamsesV3Factory;
    let pool: MockTimeRamsesV3Pool;

    let swapTarget: TestRamsesV3Callee;

    let swapToLowerPrice: SwapToPriceFunction;
    let swapToHigherPrice: SwapToPriceFunction;
    let swapExact0For1: SwapFunction;
    let swap0ForExact1: SwapFunction;
    let swapExact1For0: SwapFunction;
    let swap1ForExact0: SwapFunction;

    let feeAmount: number;
    let tickSpacing: number;

    let minTick: number;
    let maxTick: number;

    let mint: MintFunction;
    let flash: FlashFunction;

    let createPool: ThenArg<ReturnType<typeof poolFixture>>["createPool"];

    before("create fixture loader", async () => {
        [wallet, other] = await (ethers as any).getSigners();
    });

    beforeEach("deploy fixture", async () => {
        ({
            token0,
            token1,
            token2,
            factory,
            createPool,
            swapTargetCallee: swapTarget,
        } = await loadFixture(poolFixture));

        const oldCreatePool = createPool;
        createPool = async (_tickSpacing, _startingPrice) => {
            const pool = await oldCreatePool(_tickSpacing, _startingPrice);
            ({
                swapToLowerPrice,
                swapToHigherPrice,
                swapExact0For1,
                swap0ForExact1,
                swapExact1For0,
                swap1ForExact0,
                mint,
                flash,
            } = createPoolFunctions({
                token0,
                token1,
                swapTarget,
                pool,
            }));
            minTick = getMinTick(_tickSpacing!);
            maxTick = getMaxTick(_tickSpacing!);
            tickSpacing = _tickSpacing!;
            return pool;
        };

        // default to the 30 bips pool
        pool = await createPool(TICK_SPACINGS[FeeAmount.MEDIUM], 0n);
        feeAmount = FeeAmount.MEDIUM;
        await factory.setFeeCollector(wallet.address);
    });

    it("code size within limit", async () => {
        const filePath = path.join(__dirname, "__snapshots__", "codesize.txt");
        hre.config.contractSizer.only = ["RamsesV3Pool"];
        hre.config.contractSizer.outputFile = filePath;
        await run("size-contracts");

        function parseFileSize(text: string): number {
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith("|  RamsesV3Pool ")) {
                    const columns = line.split("·").map((col) => col.trim());
                    const sizeColumn = columns[1];
                    const size = parseFloat(sizeColumn);
                    return size;
                }
            }
            return -1; // Size not found
        }

        let fileSize = 0;

        const data = await fs.promises.readFile(filePath, { encoding: "utf8" });
        fileSize = parseFileSize(data);

        expect(fileSize).to.be.lessThan(24);
    });

    it("constructor initializes immutables", async () => {
        expect(await pool.factory()).to.eq(await factory.getAddress());
        expect(await pool.token0()).to.eq(await token0.getAddress());
        expect(await pool.token1()).to.eq(await token1.getAddress());
        expect(await pool.maxLiquidityPerTick()).to.eq(
            getMaxLiquidityPerTick(tickSpacing),
        );
    });

    describe("#initialize", () => {
        it("fails if already initialized", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await expect(pool.initialize(encodePriceSqrt(1n, 1n).toString())).to
                .be.reverted;
        });
        it("fails if starting price is too low", async () => {
            await expect(pool.initialize(1n)).to.be.revertedWithCustomError(
                pool,
                "R",
            );
            await expect(
                pool.initialize(MIN_SQRT_RATIO - 1n),
            ).to.be.revertedWithCustomError(pool, "R");
        });
        it("fails if starting price is too high", async () => {
            await expect(
                pool.initialize(MAX_SQRT_RATIO),
            ).to.be.revertedWithCustomError(pool, "R");
            await expect(
                pool.initialize(2n ** 160n - 1n),
            ).to.be.revertedWithCustomError(pool, "R");
        });
        it("can be initialized at MIN_SQRT_RATIO", async () => {
            await pool.initialize(MIN_SQRT_RATIO);
            expect((await pool.slot0()).tick).to.eq(getMinTick(1));
        });
        it("can be initialized at MAX_SQRT_RATIO - 1", async () => {
            await pool.initialize(MAX_SQRT_RATIO - 1n);
            expect((await pool.slot0()).tick).to.eq(getMaxTick(1) - 1);
        });
        it("sets initial variables", async () => {
            const price = encodePriceSqrt(1n, 2n).toString();
            await pool.initialize(price);

            const { sqrtPriceX96, observationIndex } = await pool.slot0();
            expect(sqrtPriceX96).to.eq(price);
            expect(observationIndex).to.eq(0);
            expect((await pool.slot0()).tick).to.eq(-6932);
        });
        it("initializes the first observations slot", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            checkObservationEquals(await pool.observations(0), {
                secondsPerLiquidityCumulativeX128:
                    SECONDS_PER_LIQUIDITY_PERIOD_INIT,
                initialized: true,
                blockTimestamp: BigInt(TEST_POOL_START_PERIOD_TIME),
                tickCumulative: 0n,
            });
        });
        it("emits a Initialized event with the input tick", async () => {
            const sqrtPriceX96 = encodePriceSqrt(1n, 2n).toString();
            await expect(pool.initialize(sqrtPriceX96))
                .to.emit(pool, "Initialize")
                .withArgs(sqrtPriceX96, -6932);
        });
    });

    describe("#flash", () => {
        it("fails if not initialized", async () => {
            await expect(flash(100n, 200n, other.address)).to.be.reverted;
            await expect(flash(100n, 0n, other.address)).to.be.reverted;
            await expect(flash(0n, 200n, other.address)).to.be.reverted;
        });
        it("fails if no liquidity", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await expect(
                flash(100n, 200n, other.address),
            ).to.be.revertedWithCustomError(pool, "L");
            await expect(
                flash(100n, 0n, other.address),
            ).to.be.revertedWithCustomError(pool, "L");
            await expect(
                flash(0n, 200n, other.address),
            ).to.be.revertedWithCustomError(pool, "L");
        });
        describe("after liquidity added", () => {
            let balance0: bigint;
            let balance1: bigint;
            beforeEach("add some tokens", async () => {
                await initializeAtZeroTick(pool);
                [balance0, balance1] = await Promise.all([
                    token0.balanceOf(pool.getAddress()),
                    token1.balanceOf(pool.getAddress()),
                ]);
            });

            describe("fee off", () => {
                it("emits an event", async () => {
                    await expect(flash(1001n, 2001n, other.address))
                        .to.emit(pool, "Flash")
                        .withArgs(
                            await swapTarget.getAddress(),
                            other.address,
                            1001n,
                            2001n,
                            4n,
                            7n,
                        );
                });

                it("transfers the amount0 to the recipient", async () => {
                    await expect(flash(100n, 200n, other.address))
                        .to.emit(token0, "Transfer")
                        .withArgs(await pool.getAddress(), other.address, 100n);
                });
                it("transfers the amount1 to the recipient", async () => {
                    await expect(flash(100n, 200n, other.address))
                        .to.emit(token1, "Transfer")
                        .withArgs(await pool.getAddress(), other.address, 200);
                });
                it("can flash only token0", async () => {
                    await expect(flash(101n, 0n, other.address))
                        .to.emit(token0, "Transfer")
                        .withArgs(await pool.getAddress(), other.address, 101n)
                        .to.not.emit(token1, "Transfer");
                });
                it("can flash only token1", async () => {
                    await expect(flash(0n, 102n, other.address))
                        .to.emit(token1, "Transfer")
                        .withArgs(await pool.getAddress(), other.address, 102n)
                        .to.not.emit(token0, "Transfer");
                });
                it("can flash entire token balance", async () => {
                    await expect(flash(balance0, balance1, other.address))
                        .to.emit(token0, "Transfer")
                        .withArgs(
                            await pool.getAddress(),
                            other.address,
                            balance0,
                        )
                        .to.emit(token1, "Transfer")
                        .withArgs(
                            await pool.getAddress(),
                            other.address,
                            balance1,
                        );
                });
                it("no-op if both amounts are 0", async () => {
                    await expect(flash(0n, 0n, other.address))
                        .to.not.emit(token0, "Transfer")
                        .to.not.emit(token1, "Transfer");
                });
                it("fails if flash amount is greater than token balance", async () => {
                    await expect(flash(balance0 + 1n, balance1, other.address))
                        .to.be.reverted;
                    await expect(flash(balance0, balance1 + 1n, other.address))
                        .to.be.reverted;
                });
                it("calls the flash callback on the sender with correct fee amounts", async () => {
                    await expect(flash(1001n, 2002n, other.address))
                        .to.emit(swapTarget, "FlashCallback")
                        .withArgs(4n, 7n);
                });
                it("increases the fee growth by the expected amount", async () => {
                    await flash(1001n, 2002n, other.address);
                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (4n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (7n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("fails if original balance not returned in either token", async () => {
                    await expect(flash(1000n, 0n, other.address, 999n, 0n)).to
                        .be.reverted;
                    await expect(flash(0n, 1000n, other.address, 0n, 999n)).to
                        .be.reverted;
                });
                it("fails if underpays either token", async () => {
                    await expect(flash(1000n, 0n, other.address, 1002n, 0n)).to
                        .be.reverted;
                    await expect(flash(0n, 1000n, other.address, 0n, 1002n)).to
                        .be.reverted;
                });
                it("allows donating token0", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 567n, 0n))
                        .to.emit(token0, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 567n)
                        .to.not.emit(token1, "Transfer");
                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (567n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("allows donating token1", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 0n, 678n))
                        .to.emit(token1, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 678n)
                        .to.not.emit(token0, "Transfer");
                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (678n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("allows donating token0 and token1 together", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 789n, 1234n))
                        .to.emit(token0, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 789n)
                        .to.emit(token1, "Transfer")
                        .withArgs(
                            wallet.address,
                            await pool.getAddress(),
                            1234n,
                        );

                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (789n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (1234n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
            });

            describe("fee on", () => {
                beforeEach("turn protocol fee on", async () => {
                    await factory.setFeeProtocol(6);
                    await pool.setFeeProtocol();
                });

                it("emits an event", async () => {
                    await expect(flash(1001n, 2001n, other.address))
                        .to.emit(pool, "Flash")
                        .withArgs(
                            await swapTarget.getAddress(),
                            other.address,
                            1001n,
                            2001n,
                            4n,
                            7n,
                        );
                });

                it("increases the fee growth by the expected amount", async () => {
                    await flash(2002n, 4004n, other.address);

                    const [token0ProtocolFees, token1ProtocolFees] =
                        await pool.protocolFees();
                    expect(token0ProtocolFees).to.eq(1);
                    expect(token1ProtocolFees).to.eq(2);

                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (6n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (11n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("allows donating token0", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 567n, 0n))
                        .to.emit(token0, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 567n)
                        .to.not.emit(token1, "Transfer");

                    const [token0ProtocolFees] = await pool.protocolFees();
                    expect(token0ProtocolFees).to.eq(94n);

                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (473n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("allows donating token1", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 0n, 678n))
                        .to.emit(token1, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 678n)
                        .to.not.emit(token0, "Transfer");

                    const [,token1ProtocolFees] = await pool.protocolFees();
                    expect(token1ProtocolFees).to.eq(113n);

                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (565n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
                it("allows donating token0 and token1 together", async () => {
                    await expect(flash(0n, 0n, ethers.ZeroAddress, 789n, 1234n))
                        .to.emit(token0, "Transfer")
                        .withArgs(wallet.address, await pool.getAddress(), 789n)
                        .to.emit(token1, "Transfer")
                        .withArgs(
                            wallet.address,
                            await pool.getAddress(),
                            1234n,
                        );

                    const [token0ProtocolFees, token1ProtocolFees] =
                        await pool.protocolFees();
                    expect(token0ProtocolFees).to.eq(131n);
                    expect(token1ProtocolFees).to.eq(205n);

                    expect(await pool.feeGrowthGlobal0X128()).to.eq(
                        (658n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                    expect(await pool.feeGrowthGlobal1X128()).to.eq(
                        (1029n * 2n ** 128n) / expandTo18Decimals(2n),
                    );
                });
            });
        });
    });

    describe("#increaseObservationCardinalityNext", () => {
        it("can only be called after initialize", async () => {
            await expect(
                pool.increaseObservationCardinalityNext(2),
            ).to.be.revertedWithCustomError(pool, "LOK");
        });
        it("emits an event including both old and new", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await expect(pool.increaseObservationCardinalityNext(2))
                .to.emit(pool, "IncreaseObservationCardinalityNext")
                .withArgs(1, 2);
        });
        it("does not emit an event for no op call", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await pool.increaseObservationCardinalityNext(3);
            await expect(
                pool.increaseObservationCardinalityNext(2),
            ).to.not.emit(pool, "IncreaseObservationCardinalityNext");
        });
        it("does not change cardinality next if less than current", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await pool.increaseObservationCardinalityNext(3);
            await pool.increaseObservationCardinalityNext(2);
            expect((await pool.slot0()).observationCardinalityNext).to.eq(3);
        });
        it("increases cardinality and cardinality next first time", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await pool.increaseObservationCardinalityNext(2);
            const { observationCardinality, observationCardinalityNext } =
                await pool.slot0();
            expect(observationCardinality).to.eq(1);
            expect(observationCardinalityNext).to.eq(2);
        });
    });

    describe("#mint", () => {
        it("fails if not initialized", async () => {
            await expect(
                mint(wallet.address, 0n, -tickSpacing, tickSpacing, 1n),
            ).to.be.revertedWithCustomError(pool, "LOK");
        });
        describe("after initialization", () => {
            beforeEach("initialize the pool at price of 10:1", async () => {
                await pool.initialize(encodePriceSqrt(1n, 10n).toString());
                await mint(wallet.address, 0n, minTick, maxTick, 3161n);
            });

            describe("failure cases", () => {
                it("fails if tickLower greater than tickUpper", async () => {
                    // should be TLU but...hardhat
                    await expect(mint(wallet.address, 0n, 1, 0, 1n)).to.be
                        .reverted;
                });
                it("fails if tickLower less than min tick", async () => {
                    // should be TLM but...hardhat
                    await expect(mint(wallet.address, 0n, -887273, 0, 1n)).to.be
                        .reverted;
                });
                it("fails if tickUpper greater than max tick", async () => {
                    // should be TUM but...hardhat
                    await expect(mint(wallet.address, 0n, 0, 887273, 1n)).to.be
                        .reverted;
                });
                it("fails if amount exceeds the max", async () => {
                    // these should fail with 'LO' but hardhat is bugged
                    const maxLiquidityGross = await pool.maxLiquidityPerTick();
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            maxLiquidityGross + 1n,
                        ),
                    ).to.be.reverted;
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            maxLiquidityGross,
                        ),
                    ).to.not.be.reverted;
                });
                it("fails if total amount at tick exceeds the max", async () => {
                    // these should fail with 'LO' but hardhat is bugged
                    await mint(
                        wallet.address,
                        0n,
                        minTick + tickSpacing,
                        maxTick - tickSpacing,
                        1000n,
                    );

                    const maxLiquidityGross = await pool.maxLiquidityPerTick();
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            maxLiquidityGross - 1000n + 1n,
                        ),
                    ).to.be.reverted;
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing * 2,
                            maxTick - tickSpacing,
                            maxLiquidityGross - 1000n + 1n,
                        ),
                    ).to.be.reverted;
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing * 2,
                            maxLiquidityGross - 1000n + 1n,
                        ),
                    ).to.be.reverted;
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            maxLiquidityGross - 1000n,
                        ),
                    ).to.not.be.reverted;
                });
                it("fails if amount is 0", async () => {
                    await expect(
                        mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            0n,
                        ),
                    ).to.be.reverted;
                });
            });

            describe("success cases", () => {
                it("initial balances", async () => {
                    expect(await token0.balanceOf(pool.getAddress())).to.eq(
                        9996,
                    );
                    expect(await token1.balanceOf(pool.getAddress())).to.eq(
                        1000,
                    );
                });

                it("initial tick", async () => {
                    expect((await pool.slot0()).tick).to.eq(-23028);
                });

                describe("above current price", () => {
                    it("transfers token0 only", async () => {
                        await expect(
                            mint(wallet.address, 0n, -22980, 0, 10000n),
                        )
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                21549,
                            )
                            .to.not.emit(token1, "Transfer");
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996 + 21549,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000,
                        );
                    });

                    it("max tick with max leverage", async () => {
                        await mint(
                            wallet.address,
                            0n,
                            maxTick - tickSpacing,
                            maxTick,
                            2n ** 102n,
                        );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996 + 828011525,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000,
                        );
                    });

                    it("works for max tick", async () => {
                        await expect(
                            mint(wallet.address, 0n, -22980, maxTick, 10000n),
                        )
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                31549,
                            );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996 + 31549,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000,
                        );
                    });

                    it("removing works", async () => {
                        await mint(wallet.address, 0n, -240, 0, 10000n);
                        await pool.burn(0, -240, 0, 10000);
                        const { amount0, amount1 } =
                            await pool.collect.staticCall(
                                wallet.address,
                                0n,
                                -240,
                                0,
                                MaxUint128,
                                MaxUint128,
                            );
                        expect(amount0, "amount0").to.eq(120);
                        expect(amount1, "amount1").to.eq(0);
                    });

                    it("adds liquidity to liquidityGross", async () => {
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        expect((await pool.ticks(-240)).liquidityGross).to.eq(
                            100,
                        );
                        expect((await pool.ticks(0)).liquidityGross).to.eq(100);
                        expect(
                            (await pool.ticks(tickSpacing)).liquidityGross,
                        ).to.eq(0);
                        expect(
                            (await pool.ticks(tickSpacing * 2)).liquidityGross,
                        ).to.eq(0);
                        await mint(wallet.address, 0n, -240, tickSpacing, 150n);
                        expect((await pool.ticks(-240)).liquidityGross).to.eq(
                            250,
                        );
                        expect((await pool.ticks(0)).liquidityGross).to.eq(100);
                        expect(
                            (await pool.ticks(tickSpacing)).liquidityGross,
                        ).to.eq(150);
                        expect(
                            (await pool.ticks(tickSpacing * 2)).liquidityGross,
                        ).to.eq(0);
                        await mint(wallet.address, 0n, 0, tickSpacing * 2, 60n);
                        expect((await pool.ticks(-240)).liquidityGross).to.eq(
                            250,
                        );
                        expect((await pool.ticks(0)).liquidityGross).to.eq(160);
                        expect(
                            (await pool.ticks(tickSpacing)).liquidityGross,
                        ).to.eq(150);
                        expect(
                            (await pool.ticks(tickSpacing * 2)).liquidityGross,
                        ).to.eq(60);
                    });

                    it("removes liquidity from liquidityGross", async () => {
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        await mint(wallet.address, 0n, -240, 0, 40n);
                        await pool.burn(0n, -240, 0, 90);
                        expect((await pool.ticks(-240)).liquidityGross).to.eq(
                            50,
                        );
                        expect((await pool.ticks(0)).liquidityGross).to.eq(50);
                    });

                    it("clears tick lower if last position is removed", async () => {
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        await pool.burn(0n, -240, 0, 100);
                        const {
                            liquidityGross,
                            feeGrowthOutside0X128,
                            feeGrowthOutside1X128,
                        } = await pool.ticks(-240);
                        expect(liquidityGross).to.eq(0);
                        expect(feeGrowthOutside0X128).to.eq(0);
                        expect(feeGrowthOutside1X128).to.eq(0);
                    });

                    it("clears tick upper if last position is removed", async () => {
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        await pool.burn(0, -240, 0, 100);
                        const {
                            liquidityGross,
                            feeGrowthOutside0X128,
                            feeGrowthOutside1X128,
                        } = await pool.ticks(0);
                        expect(liquidityGross).to.eq(0);
                        expect(feeGrowthOutside0X128).to.eq(0);
                        expect(feeGrowthOutside1X128).to.eq(0);
                    });
                    it("only clears the tick that is not used at all", async () => {
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        await mint(wallet.address, 0n, -tickSpacing, 0, 250n);
                        await pool.burn(0n, -240, 0, 100);

                        let {
                            liquidityGross,
                            feeGrowthOutside0X128,
                            feeGrowthOutside1X128,
                        } = await pool.ticks(-240);
                        expect(liquidityGross).to.eq(0);
                        expect(feeGrowthOutside0X128).to.eq(0);
                        expect(feeGrowthOutside1X128).to.eq(0);
                        ({
                            liquidityGross,
                            feeGrowthOutside0X128,
                            feeGrowthOutside1X128,
                        } = await pool.ticks(-tickSpacing));
                        expect(liquidityGross).to.eq(250);
                        expect(feeGrowthOutside0X128).to.eq(0);
                        expect(feeGrowthOutside1X128).to.eq(0);
                    });

                    it("does not write an observation", async () => {
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                BigInt(
                                    TEST_POOL_START_TIME -
                                        TEST_POOL_START_PERIOD_TIME,
                                ),
                            blockTimestamp: BigInt(TEST_POOL_START_TIME),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                SECONDS_PER_LIQUIDITY_INIT,
                        });
                        await pool.advanceTime(1);
                        await mint(wallet.address, 0n, -240, 0, 100n);
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                BigInt(
                                    TEST_POOL_START_TIME -
                                        TEST_POOL_START_PERIOD_TIME,
                                ),
                            blockTimestamp: BigInt(TEST_POOL_START_TIME),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                SECONDS_PER_LIQUIDITY_INIT,
                        });
                    });
                });

                describe("including current price", () => {
                    it("price within range: transfers current price of both tokens", async () => {
                        await expect(
                            mint(
                                wallet.address,
                                0n,
                                minTick + tickSpacing,
                                maxTick - tickSpacing,
                                100n,
                            ),
                        )
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                317,
                            )
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                32,
                            );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996 + 317,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000 + 32,
                        );
                    });

                    it("initializes lower tick", async () => {
                        await mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            100n,
                        );
                        const { liquidityGross } = await pool.ticks(
                            minTick + tickSpacing,
                        );
                        expect(liquidityGross).to.eq(100);
                    });

                    it("initializes upper tick", async () => {
                        await mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            100n,
                        );
                        const { liquidityGross } = await pool.ticks(
                            maxTick - tickSpacing,
                        );
                        expect(liquidityGross).to.eq(100);
                    });

                    it("works for min/max tick", async () => {
                        await expect(
                            mint(wallet.address, 0n, minTick, maxTick, 10000n),
                        )
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                31623,
                            )
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                3163,
                            );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996 + 31623,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000 + 3163,
                        );
                    });

                    it("removing works", async () => {
                        await mint(
                            wallet.address,
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            100n,
                        );
                        await pool.burn(
                            0n,
                            minTick + tickSpacing,
                            maxTick - tickSpacing,
                            100,
                        );
                        const { amount0, amount1 } =
                            await pool.collect.staticCall(
                                wallet.address,
                                0n,
                                minTick + tickSpacing,
                                maxTick - tickSpacing,
                                MaxUint128,
                                MaxUint128,
                            );
                        expect(amount0, "amount0").to.eq(316);
                        expect(amount1, "amount1").to.eq(31);
                    });

                    it("writes an observation", async () => {
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                BigInt(
                                    TEST_POOL_START_TIME -
                                        TEST_POOL_START_PERIOD_TIME,
                                ),
                            blockTimestamp: BigInt(TEST_POOL_START_TIME),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                SECONDS_PER_LIQUIDITY_INIT,
                        });
                        await pool.advanceTime(1);
                        await mint(wallet.address, 0n, minTick, maxTick, 100n);
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                    BigInt(
                                        TEST_POOL_START_TIME -
                                            TEST_POOL_START_PERIOD_TIME,
                                    ) +
                                -23028n,
                            blockTimestamp: BigInt(TEST_POOL_START_TIME + 1),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                BigInt(SECONDS_PER_LIQUIDITY_INIT) +
                                107650226801941937191829992860413859n,
                        });
                    });
                });

                describe("below current price", () => {
                    it("transfers token1 only", async () => {
                        await expect(
                            mint(wallet.address, 0n, -46080, -23040, 10000n),
                        )
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                2162,
                            )
                            .to.not.emit(token0, "Transfer");
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000 + 2162,
                        );
                    });

                    it("min tick with max leverage", async () => {
                        await mint(
                            wallet.address,
                            0n,
                            minTick,
                            minTick + tickSpacing,
                            2n ** 102n,
                        );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000 + 828011520,
                        );
                    });

                    it("works for min tick", async () => {
                        await expect(
                            mint(wallet.address, 0n, minTick, -23040, 10000n),
                        )
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                3161,
                            );
                        expect(await token0.balanceOf(pool.getAddress())).to.eq(
                            9996,
                        );
                        expect(await token1.balanceOf(pool.getAddress())).to.eq(
                            1000 + 3161,
                        );
                    });

                    it("removing works", async () => {
                        await mint(wallet.address, 0n, -46080, -46020, 10000n);
                        await pool.burn(0n, -46080, -46020, 10000);
                        const { amount0, amount1 } =
                            await pool.collect.staticCall(
                                wallet.address,
                                0n,
                                -46080,
                                -46020,
                                MaxUint128,
                                MaxUint128,
                            );
                        expect(amount0, "amount0").to.eq(0);
                        expect(amount1, "amount1").to.eq(3);
                    });

                    it("does not write an observation", async () => {
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                BigInt(
                                    TEST_POOL_START_TIME -
                                        TEST_POOL_START_PERIOD_TIME,
                                ),
                            blockTimestamp: BigInt(TEST_POOL_START_TIME),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                SECONDS_PER_LIQUIDITY_INIT,
                        });
                        await pool.advanceTime(1);
                        await mint(wallet.address, 0n, -46080, -23040, 100n);
                        checkObservationEquals(await pool.observations(0), {
                            tickCumulative:
                                -23028n *
                                BigInt(
                                    TEST_POOL_START_TIME -
                                        TEST_POOL_START_PERIOD_TIME,
                                ),
                            blockTimestamp: BigInt(TEST_POOL_START_TIME),
                            initialized: true,
                            secondsPerLiquidityCumulativeX128:
                                SECONDS_PER_LIQUIDITY_INIT,
                        });
                    });
                });
            });

            it("protocol fees accumulate as expected during swap", async () => {
                await factory.setFeeProtocol(80);
                await pool.setFeeProtocol();

                await mint(
                    wallet.address,
                    0n,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                    expandTo18Decimals(1n),
                );
                await swapExact0For1(
                    expandTo18Decimals(1n) / 10n,
                    wallet.address,
                );
                await swapExact1For0(
                    expandTo18Decimals(1n) / 100n,
                    wallet.address,
                );

                let protocolFees = await pool.protocolFees();
                expect(protocolFees[0]).to.eq("240000000000000");
                expect(protocolFees[1]).to.eq("24000000000000");
            });

            it("positions are protected before protocol fee is turned on", async () => {
                await mint(
                    wallet.address,
                    0n,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                    expandTo18Decimals(1n),
                );
                await swapExact0For1(
                    expandTo18Decimals(1n) / 10n,
                    wallet.address,
                );
                await swapExact1For0(
                    expandTo18Decimals(1n) / 100n,
                    wallet.address,
                );

                let protocolFees = await pool.protocolFees();
                expect(protocolFees[0]).to.eq(0);
                expect(protocolFees[1]).to.eq(0);

                await factory.setFeeProtocol(6);

                await pool.setFeeProtocol();
                protocolFees = await pool.protocolFees();
                expect(protocolFees[0]).to.eq(0);
                expect(protocolFees[1]).to.eq(0);
            });

            it("poke is not allowed on uninitialized position", async () => {
                await mint(
                    other.address,
                    0n,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                    expandTo18Decimals(1n),
                );
                await swapExact0For1(
                    expandTo18Decimals(1n) / 10n,
                    wallet.address,
                );
                await swapExact1For0(
                    expandTo18Decimals(1n) / 100n,
                    wallet.address,
                );

                // missing revert reason due to hardhat
                await expect(
                    pool.burn(
                        0n,
                        minTick + tickSpacing,
                        maxTick - tickSpacing,
                        0,
                    ),
                ).to.be.reverted;

                await mint(
                    wallet.address,
                    0n,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                    1n,
                );
                let {
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed1,
                    tokensOwed0,
                } = await pool.positions(
                    getPositionKey(
                        wallet.address,
                        minTick + tickSpacing,
                        maxTick - tickSpacing,
                    ),
                );
                expect(liquidity).to.eq(1);
                expect(feeGrowthInside0LastX128).to.eq(
                    "102084710076281216349243831104605583",
                );
                expect(feeGrowthInside1LastX128).to.eq(
                    "10208471007628121634924383110460558",
                );
                expect(tokensOwed0, "tokens owed 0 before").to.eq(0);
                expect(tokensOwed1, "tokens owed 1 before").to.eq(0);

                await pool.burn(
                    0n,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                    1,
                );
                ({
                    liquidity,
                    feeGrowthInside0LastX128,
                    feeGrowthInside1LastX128,
                    tokensOwed1,
                    tokensOwed0,
                } = await pool.positions(
                    getPositionKey(
                        wallet.address,
                        minTick + tickSpacing,
                        maxTick - tickSpacing,
                    ),
                ));
                expect(liquidity).to.eq(0);
                expect(feeGrowthInside0LastX128).to.eq(
                    "102084710076281216349243831104605583",
                );
                expect(feeGrowthInside1LastX128).to.eq(
                    "10208471007628121634924383110460558",
                );
                expect(tokensOwed0, "tokens owed 0 after").to.eq(3);
                expect(tokensOwed1, "tokens owed 1 after").to.eq(0);
            });
        });
    });

    describe("#burn", () => {
        beforeEach("initialize at zero tick", () => initializeAtZeroTick(pool));

        async function checkTickIsClear(tick: number) {
            const {
                liquidityGross,
                feeGrowthOutside0X128,
                feeGrowthOutside1X128,
                liquidityNet,
            } = await pool.ticks(tick);
            expect(liquidityGross).to.eq(0);
            expect(feeGrowthOutside0X128).to.eq(0);
            expect(feeGrowthOutside1X128).to.eq(0);
            expect(liquidityNet).to.eq(0);
        }

        async function checkTickIsNotClear(tick: number) {
            const { liquidityGross } = await pool.ticks(tick);
            expect(liquidityGross).to.not.eq(0);
        }

        it("does not clear the position fee growth snapshot if no more liquidity", async () => {
            // some activity that would make the ticks non-zero
            await pool.advanceTime(10);
            await mint(
                other.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
            await swapExact0For1(expandTo18Decimals(1n), wallet.address);
            await swapExact1For0(expandTo18Decimals(1n), wallet.address);
            await pool
                .connect(other)
                .burn(0n, minTick, maxTick, expandTo18Decimals(1n));
            const {
                liquidity,
                tokensOwed0,
                tokensOwed1,
                feeGrowthInside0LastX128,
                feeGrowthInside1LastX128,
            } = await pool.positions(
                getPositionKey(other.address, minTick, maxTick),
            );
            expect(liquidity).to.eq(0);
            expect(tokensOwed0).to.not.eq(0);
            expect(tokensOwed1).to.not.eq(0);
            expect(feeGrowthInside0LastX128).to.eq(
                "340282366920938463463374607431768211",
            );
            expect(feeGrowthInside1LastX128).to.eq(
                "340282366920938576890830247744589365",
            );
        });

        it("clears the tick if its the last position using it", async () => {
            const tickLower = minTick + tickSpacing;
            const tickUpper = maxTick - tickSpacing;
            // some activity that would make the ticks non-zero
            await pool.advanceTime(10);
            await mint(wallet.address, 0n, tickLower, tickUpper, 1n);
            await swapExact0For1(expandTo18Decimals(1n), wallet.address);
            await pool.burn(0n, tickLower, tickUpper, 1);
            await checkTickIsClear(tickLower);
            await checkTickIsClear(tickUpper);
        });

        it("clears only the lower tick if upper is still used", async () => {
            const tickLower = minTick + tickSpacing;
            const tickUpper = maxTick - tickSpacing;
            // some activity that would make the ticks non-zero
            await pool.advanceTime(10);
            await mint(wallet.address, 0n, tickLower, tickUpper, 1n);
            await mint(
                wallet.address,
                0n,
                tickLower + tickSpacing,
                tickUpper,
                1n,
            );
            await swapExact0For1(expandTo18Decimals(1n), wallet.address);
            await pool.burn(0n, tickLower, tickUpper, 1);
            await checkTickIsClear(tickLower);
            await checkTickIsNotClear(tickUpper);
        });

        it("clears only the upper tick if lower is still used", async () => {
            const tickLower = minTick + tickSpacing;
            const tickUpper = maxTick - tickSpacing;
            // some activity that would make the ticks non-zero
            await pool.advanceTime(10);
            await mint(wallet.address, 0n, tickLower, tickUpper, 1n);
            await mint(
                wallet.address,
                0n,
                tickLower,
                tickUpper - tickSpacing,
                1n,
            );
            await swapExact0For1(expandTo18Decimals(1n), wallet.address);
            await pool.burn(0n, tickLower, tickUpper, 1);
            await checkTickIsNotClear(tickLower);
            await checkTickIsClear(tickUpper);
        });
    });

    // the combined amount of liquidity that the pool is initialized with (including the 1 minimum liquidity that is burned)
    const initializeLiquidityAmount = expandTo18Decimals(2n);
    async function initializeAtZeroTick(
        pool: MockTimeRamsesV3Pool,
    ): Promise<void> {
        await pool.initialize(encodePriceSqrt(1n, 1n).toString());
        const tickSpacing = await pool.tickSpacing();
        const [min, max] = [
            getMinTick(Number(tickSpacing)),
            getMaxTick(Number(tickSpacing)),
        ];
        await mint(wallet.address, 0n, min, max, initializeLiquidityAmount);
    }

    describe("#observe", () => {
        beforeEach(() => initializeAtZeroTick(pool));

        // zero tick
        it("current tick accumulator increases by tick over time", async () => {
            let {
                tickCumulatives: [tickCumulative],
            } = await pool.observe([0]);
            expect(tickCumulative).to.eq(0);
            await pool.advanceTime(10);
            ({
                tickCumulatives: [tickCumulative],
            } = await pool.observe([0]));
            expect(tickCumulative).to.eq(0);
        });

        it("current tick accumulator after single swap", async () => {
            // moves to tick -1
            await swapExact0For1(1000n, wallet.address);
            await pool.advanceTime(4);
            let {
                tickCumulatives: [tickCumulative],
            } = await pool.observe([0]);
            expect(tickCumulative).to.eq(-4);
        });

        it("current tick accumulator after two swaps", async () => {
            await swapExact0For1(expandTo18Decimals(1n) / 2n, wallet.address);
            expect((await pool.slot0()).tick).to.eq(-4452);
            await pool.advanceTime(4);
            await swapExact1For0(expandTo18Decimals(1n) / 4n, wallet.address);
            expect((await pool.slot0()).tick).to.eq(-1558);
            await pool.advanceTime(6);
            let {
                tickCumulatives: [tickCumulative],
            } = await pool.observe([0]);
            // -4452*4 + -1558*6
            expect(tickCumulative).to.eq(-27156);
        });
    });

    describe("miscellaneous mint tests", () => {
        beforeEach("initialize at zero tick", async () => {
            pool = await createPool(TICK_SPACINGS[FeeAmount.LOW], 0);
            await initializeAtZeroTick(pool);
        });

        it("mint to the right of the current price", async () => {
            const liquidityDelta = 1000n;
            const lowerTick = tickSpacing;
            const upperTick = tickSpacing * 2;

            const liquidityBefore = await pool.liquidity();

            const b0 = await token0.balanceOf(pool.getAddress());
            const b1 = await token1.balanceOf(pool.getAddress());

            await mint(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                liquidityDelta,
            );

            const liquidityAfter = await pool.liquidity();
            expect(liquidityAfter).to.be.gte(liquidityBefore);

            expect((await token0.balanceOf(pool.getAddress())) - b0).to.eq(1);
            expect((await token1.balanceOf(pool.getAddress())) - b1).to.eq(0);
        });

        it("mint to the left of the current price", async () => {
            const liquidityDelta = 1000n;
            const lowerTick = -tickSpacing * 2;
            const upperTick = -tickSpacing;

            const liquidityBefore = await pool.liquidity();

            const b0 = await token0.balanceOf(pool.getAddress());
            const b1 = await token1.balanceOf(pool.getAddress());

            await mint(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                liquidityDelta,
            );

            const liquidityAfter = await pool.liquidity();
            expect(liquidityAfter).to.be.gte(liquidityBefore);

            expect((await token0.balanceOf(pool.getAddress())) - b0).to.eq(0);
            expect((await token1.balanceOf(pool.getAddress())) - b1).to.eq(1);
        });

        it("mint within the current price", async () => {
            const liquidityDelta = 1000n;
            const lowerTick = -tickSpacing;
            const upperTick = tickSpacing;

            const liquidityBefore = await pool.liquidity();

            const b0 = await token0.balanceOf(pool.getAddress());
            const b1 = await token1.balanceOf(pool.getAddress());

            await mint(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                liquidityDelta,
            );

            const liquidityAfter = await pool.liquidity();
            expect(liquidityAfter).to.be.gte(liquidityBefore);

            expect((await token0.balanceOf(pool.getAddress())) - b0).to.eq(1);
            expect((await token1.balanceOf(pool.getAddress())) - b1).to.eq(1);
        });

        it("cannot remove more than the entire position", async () => {
            const lowerTick = -tickSpacing;
            const upperTick = tickSpacing;
            await mint(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                expandTo18Decimals(1000n),
            );
            // should be 'LS', hardhat is bugged
            // no it's not, skill issue
            await expect(
                pool.burn(0n, lowerTick, upperTick, expandTo18Decimals(1001n)),
            ).to.be.reverted; //revertedWithCustomError(pool, "LS");
        });

        it("collect fees within the current price after swap", async () => {
            const liquidityDelta = expandTo18Decimals(100n);
            const lowerTick = -tickSpacing * 100;
            const upperTick = tickSpacing * 100;

            await mint(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                liquidityDelta,
            );

            const liquidityBefore = await pool.liquidity();

            const amount0In = expandTo18Decimals(1n);
            await swapExact0For1(amount0In, wallet.address);

            const liquidityAfter = await pool.liquidity();
            expect(liquidityAfter, "k increases").to.be.gte(liquidityBefore);

            const token0BalanceBeforePool = await token0.balanceOf(
                pool.getAddress(),
            );
            const token1BalanceBeforePool = await token1.balanceOf(
                pool.getAddress(),
            );
            const token0BalanceBeforeWallet = await token0.balanceOf(
                wallet.address,
            );
            const token1BalanceBeforeWallet = await token1.balanceOf(
                wallet.address,
            );

            await pool.burn(0n, lowerTick, upperTick, 0);
            await pool.collect(
                wallet.address,
                0n,
                lowerTick,
                upperTick,
                MaxUint128,
                MaxUint128,
            );

            await pool.burn(0n, lowerTick, upperTick, 0);
            const { amount0: fees0, amount1: fees1 } =
                await pool.collect.staticCall(
                    wallet.address,
                    0n,
                    lowerTick,
                    upperTick,
                    MaxUint128,
                    MaxUint128,
                );
            expect(fees0).to.be.eq(0);
            expect(fees1).to.be.eq(0);

            const token0BalanceAfterWallet = await token0.balanceOf(
                wallet.address,
            );
            const token1BalanceAfterWallet = await token1.balanceOf(
                wallet.address,
            );
            const token0BalanceAfterPool = await token0.balanceOf(
                pool.getAddress(),
            );
            const token1BalanceAfterPool = await token1.balanceOf(
                pool.getAddress(),
            );

            expect(token0BalanceAfterWallet).to.be.gt(
                token0BalanceBeforeWallet,
            );
            expect(token1BalanceAfterWallet).to.be.eq(
                token1BalanceBeforeWallet,
            );

            expect(token0BalanceAfterPool).to.be.lt(token0BalanceBeforePool);
            expect(token1BalanceAfterPool).to.be.eq(token1BalanceBeforePool);
        });
    });

    describe("post-initialize at medium fee", () => {
        describe("k (implicit)", () => {
            it("returns 0 before initialization", async () => {
                expect(await pool.liquidity()).to.eq(0);
            });
            describe("post initialized", () => {
                beforeEach(() => initializeAtZeroTick(pool));

                it("returns initial liquidity", async () => {
                    expect(await pool.liquidity()).to.eq(
                        expandTo18Decimals(2n),
                    );
                });
                it("returns in supply in range", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        -tickSpacing,
                        tickSpacing,
                        expandTo18Decimals(3n),
                    );
                    expect(await pool.liquidity()).to.eq(
                        expandTo18Decimals(5n),
                    );
                });
                it("excludes supply at tick above current tick", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        tickSpacing,
                        tickSpacing * 2,
                        expandTo18Decimals(3n),
                    );
                    expect(await pool.liquidity()).to.eq(
                        expandTo18Decimals(2n),
                    );
                });
                it("excludes supply at tick below current tick", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        -tickSpacing * 2,
                        -tickSpacing,
                        expandTo18Decimals(3n),
                    );
                    expect(await pool.liquidity()).to.eq(
                        expandTo18Decimals(2n),
                    );
                });
                it("updates correctly when exiting range", async () => {
                    const kBefore = await pool.liquidity();
                    expect(kBefore).to.be.eq(expandTo18Decimals(2n));

                    // add liquidity at and above current tick
                    const liquidityDelta = expandTo18Decimals(1n);
                    const lowerTick = 0;
                    const upperTick = tickSpacing;
                    await mint(
                        wallet.address,
                        0n,
                        lowerTick,
                        upperTick,
                        liquidityDelta,
                    );

                    // ensure virtual supply has increased appropriately
                    const kAfter = await pool.liquidity();
                    expect(kAfter).to.be.eq(expandTo18Decimals(3n));

                    // swap toward the left (just enough for the tick transition function to trigger)
                    await swapExact0For1(1n, wallet.address);
                    const { tick } = await pool.slot0();
                    expect(tick).to.be.eq(-1);

                    const kAfterSwap = await pool.liquidity();
                    expect(kAfterSwap).to.be.eq(expandTo18Decimals(2n));
                });
                it("updates correctly when entering range", async () => {
                    const kBefore = await pool.liquidity();
                    expect(kBefore).to.be.eq(expandTo18Decimals(2n));

                    // add liquidity below the current tick
                    const liquidityDelta = expandTo18Decimals(1n);
                    const lowerTick = -tickSpacing;
                    const upperTick = 0;
                    await mint(
                        wallet.address,
                        0n,
                        lowerTick,
                        upperTick,
                        liquidityDelta,
                    );

                    // ensure virtual supply hasn't changed
                    const kAfter = await pool.liquidity();
                    expect(kAfter).to.be.eq(kBefore);

                    // swap toward the left (just enough for the tick transition function to trigger)
                    await swapExact0For1(1n, wallet.address);
                    const { tick } = await pool.slot0();
                    expect(tick).to.be.eq(-1);

                    const kAfterSwap = await pool.liquidity();
                    expect(kAfterSwap).to.be.eq(expandTo18Decimals(3n));
                });
            });
        });
    });

    describe("limit orders", () => {
        beforeEach("initialize at tick 0", () => initializeAtZeroTick(pool));

        it("limit selling 0 for 1 at tick 0 thru 1", async () => {
            await expect(
                mint(wallet.address, 0n, 0, 120, expandTo18Decimals(1n)),
            )
                .to.emit(token0, "Transfer")
                .withArgs(
                    wallet.address,
                    await pool.getAddress(),
                    "5981737760509663",
                );
            // somebody takes the limit order
            await swapExact1For0(expandTo18Decimals(2n), other.address);
            await expect(pool.burn(0n, 0, 120, expandTo18Decimals(1n)))
                .to.emit(pool, "Burn")
                .withArgs(
                    wallet.address,
                    0,
                    120,
                    expandTo18Decimals(1n),
                    0,
                    "6017734268818165",
                )
                .to.not.emit(token0, "Transfer")
                .to.not.emit(token1, "Transfer");
            await expect(
                pool.collect(
                    wallet.address,
                    0n,
                    0,
                    120,
                    MaxUint128,
                    MaxUint128,
                ),
            )
                .to.emit(token1, "Transfer")
                .withArgs(
                    await pool.getAddress(),
                    wallet.address,
                    6017734268818165n + 18107525382602n,
                ) // roughly 0.3% despite other liquidity
                .to.not.emit(token0, "Transfer");
            expect((await pool.slot0()).tick).to.be.gte(120);
        });
        it("limit selling 1 for 0 at tick 0 thru -1", async () => {
            await expect(
                mint(wallet.address, 0n, -120, 0, expandTo18Decimals(1n)),
            )
                .to.emit(token1, "Transfer")
                .withArgs(
                    wallet.address,
                    await pool.getAddress(),
                    "5981737760509663",
                );
            // somebody takes the limit order
            await swapExact0For1(expandTo18Decimals(2n), other.address);
            await expect(pool.burn(0n, -120, 0, expandTo18Decimals(1n)))
                .to.emit(pool, "Burn")
                .withArgs(
                    wallet.address,
                    -120,
                    0,
                    expandTo18Decimals(1n),
                    "6017734268818165",
                    0,
                )
                .to.not.emit(token0, "Transfer")
                .to.not.emit(token1, "Transfer");
            await expect(
                pool.collect(
                    wallet.address,
                    0n,
                    -120,
                    0,
                    MaxUint128,
                    MaxUint128,
                ),
            )
                .to.emit(token0, "Transfer")
                .withArgs(
                    await pool.getAddress(),
                    wallet.address,
                    6017734268818165n + 18107525382602n,
                ); // roughly 0.3% despite other liquidity
            expect((await pool.slot0()).tick).to.be.lt(-120);
        });

        describe("fee is on", () => {
            beforeEach(async () => {
                await factory.setFeeProtocol(80);
                pool.setFeeProtocol();
            });
            it("limit selling 0 for 1 at tick 0 thru 1", async () => {
                await expect(
                    mint(wallet.address, 0n, 0, 120, expandTo18Decimals(1n)),
                )
                    .to.emit(token0, "Transfer")
                    .withArgs(
                        wallet.address,
                        await pool.getAddress(),
                        "5981737760509663",
                    );
                // somebody takes the limit order
                await swapExact1For0(expandTo18Decimals(2n), other.address);
                await expect(pool.burn(0n, 0, 120, expandTo18Decimals(1n)))
                    .to.emit(pool, "Burn")
                    .withArgs(
                        wallet.address,
                        0,
                        120,
                        expandTo18Decimals(1n),
                        0,
                        "6017734268818165",
                    )
                    .to.not.emit(token0, "Transfer")
                    .to.not.emit(token1, "Transfer");
                await expect(
                    pool.collect(
                        wallet.address,
                        0n,
                        0,
                        120,
                        MaxUint128,
                        MaxUint128,
                    ),
                )
                    .to.emit(token1, "Transfer")
                    .withArgs(
                        await pool.getAddress(),
                        wallet.address,
                        6017734268818165n + 3621505076520n,
                    ) // roughly 0.25% despite other liquidity
                    .to.not.emit(token0, "Transfer");
                expect((await pool.slot0()).tick).to.be.gte(120);
            });
            it("limit selling 1 for 0 at tick 0 thru -1", async () => {
                await expect(
                    mint(wallet.address, 0n, -120, 0, expandTo18Decimals(1n)),
                )
                    .to.emit(token1, "Transfer")
                    .withArgs(
                        wallet.address,
                        await pool.getAddress(),
                        "5981737760509663",
                    );
                // somebody takes the limit order
                await swapExact0For1(expandTo18Decimals(2n), other.address);
                await expect(pool.burn(0n, -120, 0, expandTo18Decimals(1n)))
                    .to.emit(pool, "Burn")
                    .withArgs(
                        wallet.address,
                        -120,
                        0,
                        expandTo18Decimals(1n),
                        "6017734268818165",
                        0,
                    )
                    .to.not.emit(token0, "Transfer")
                    .to.not.emit(token1, "Transfer");
                await expect(
                    pool.collect(
                        wallet.address,
                        0n,
                        -120,
                        0,
                        MaxUint128,
                        MaxUint128,
                    ),
                )
                    .to.emit(token0, "Transfer")
                    .withArgs(
                        await pool.getAddress(),
                        wallet.address,
                        6017734268818165n + 3621505076520n,
                    ); // roughly 0.25% despite other liquidity
                expect((await pool.slot0()).tick).to.be.lt(-120);
            });
        });
    });

    describe("#collect", () => {
        beforeEach(async () => {
            pool = await createPool(
                TICK_SPACINGS[FeeAmount.LOW],
                encodePriceSqrt(1n, 1n).toString(),
            );
        });

        it("works with multiple LPs", async () => {
            await mint(
                wallet.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
            await mint(
                wallet.address,
                0n,
                minTick + tickSpacing,
                maxTick - tickSpacing,
                expandTo18Decimals(2n),
            );

            await swapExact0For1(expandTo18Decimals(1n), wallet.address);

            // poke positions
            await pool.burn(0n, minTick, maxTick, 0);
            await pool.burn(
                0n,
                minTick + tickSpacing,
                maxTick - tickSpacing,
                0,
            );

            const { tokensOwed0: tokensOwed0Position0 } = await pool.positions(
                getPositionKey(wallet.address, minTick, maxTick),
            );
            const { tokensOwed0: tokensOwed0Position1 } = await pool.positions(
                getPositionKey(
                    wallet.address,
                    minTick + tickSpacing,
                    maxTick - tickSpacing,
                ),
            );

            expect(tokensOwed0Position0).to.be.eq("166666666666667");
            expect(tokensOwed0Position1).to.be.eq("333333333333334");
        });

        describe("works across large increases", () => {
            beforeEach(async () => {
                await mint(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    expandTo18Decimals(1n),
                );
            });

            // type(uint128).max * 2**128 / 1e18
            // https://www.wolframalpha.com/input/?i=%282**128+-+1%29+*+2**128+%2F+1e18
            const magicNumber =
                115792089237316195423570985008687907852929702298719625575994n;
            it("works just before the cap binds", async () => {
                await pool.setFeeGrowthGlobal0X128(magicNumber);
                await pool.burn(0n, minTick, maxTick, 0);

                const { tokensOwed0, tokensOwed1 } = await pool.positions(
                    getPositionKey(wallet.address, minTick, maxTick),
                );

                expect(tokensOwed0).to.be.eq(MaxUint128 - 1n);
                expect(tokensOwed1).to.be.eq(0);
            });

            it("works just after the cap binds", async () => {
                await pool.setFeeGrowthGlobal0X128(magicNumber + 1n);
                await pool.burn(0n, minTick, maxTick, 0);

                const { tokensOwed0, tokensOwed1 } = await pool.positions(
                    getPositionKey(wallet.address, minTick, maxTick),
                );

                expect(tokensOwed0).to.be.eq(MaxUint128);
                expect(tokensOwed1).to.be.eq(0);
            });

            it("works well after the cap binds", async () => {
                await pool.setFeeGrowthGlobal0X128(ethers.MaxUint256);
                await pool.burn(0n, minTick, maxTick, 0);

                const { tokensOwed0, tokensOwed1 } = await pool.positions(
                    getPositionKey(wallet.address, minTick, maxTick),
                );

                expect(tokensOwed0).to.be.eq(MaxUint128);
                expect(tokensOwed1).to.be.eq(0);
            });
        });

        describe("works across overflow boundaries", () => {
            beforeEach(async () => {
                await pool.setFeeGrowthGlobal0X128(ethers.MaxUint256);
                await pool.setFeeGrowthGlobal1X128(ethers.MaxUint256);
                await mint(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    expandTo18Decimals(10n),
                );
            });

            it("token0", async () => {
                await swapExact0For1(expandTo18Decimals(1n), wallet.address);
                await pool.burn(0n, minTick, maxTick, 0);
                const { amount0, amount1 } = await pool.collect.staticCall(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                );
                expect(amount0).to.be.eq("499999999999999");
                expect(amount1).to.be.eq(0);
            });
            it("token1", async () => {
                await swapExact1For0(expandTo18Decimals(1n), wallet.address);
                await pool.burn(0n, minTick, maxTick, 0);
                const { amount0, amount1 } = await pool.collect.staticCall(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                );
                expect(amount0).to.be.eq(0);
                expect(amount1).to.be.eq("499999999999999");
            });
            it("token0 and token1", async () => {
                await swapExact0For1(expandTo18Decimals(1n), wallet.address);
                await swapExact1For0(expandTo18Decimals(1n), wallet.address);
                await pool.burn(0n, minTick, maxTick, 0);
                const { amount0, amount1 } = await pool.collect.staticCall(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                );
                expect(amount0).to.be.eq("499999999999999");
                expect(amount1).to.be.eq("500000000000000");
            });
        });
    });

    describe("#feeProtocol", () => {
        const liquidityAmount = expandTo18Decimals(1000n);

        beforeEach(async () => {
            pool = await createPool(
                TICK_SPACINGS[FeeAmount.LOW],
                encodePriceSqrt(1n, 1n).toString(),
            );
            await mint(wallet.address, 0n, minTick, maxTick, liquidityAmount);
        });

        it("is initially set to 0", async () => {
            expect((await pool.slot0()).feeProtocol).to.eq(0);
        });

        async function swapAndGetFeesOwed({
            amount,
            zeroForOne,
            poke,
        }: {
            amount: bigint;
            zeroForOne: boolean;
            poke: boolean;
        }) {
            await (zeroForOne
                ? swapExact0For1(amount, wallet.address)
                : swapExact1For0(amount, wallet.address));

            if (poke) await pool.burn(0n, minTick, maxTick, 0);

            const { amount0: fees0, amount1: fees1 } =
                await pool.collect.staticCall(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                );

            expect(fees0, "fees owed in token0 are greater than 0").to.be.gte(
                0,
            );
            expect(fees1, "fees owed in token1 are greater than 0").to.be.gte(
                0,
            );

            return { token0Fees: fees0, token1Fees: fees1 };
        }

        it("position owner gets full fees when protocol fee is off", async () => {
            const { token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });

            // 6 bips * 1e18
            expect(token0Fees).to.eq("499999999999999");
            expect(token1Fees).to.eq(0);
        });

        it("swap fees accumulate as expected (0 for 1)", async () => {
            let token0Fees;
            let token1Fees;
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            }));
            expect(token0Fees).to.eq("499999999999999");
            expect(token1Fees).to.eq(0);
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            }));
            expect(token0Fees).to.eq("999999999999998");
            expect(token1Fees).to.eq(0);
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            }));
            expect(token0Fees).to.eq("1499999999999997");
            expect(token1Fees).to.eq(0);
        });

        it("swap fees accumulate as expected (1 for 0)", async () => {
            let token0Fees;
            let token1Fees;
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: false,
                poke: true,
            }));
            expect(token0Fees).to.eq(0);
            expect(token1Fees).to.eq("499999999999999");
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: false,
                poke: true,
            }));
            expect(token0Fees).to.eq(0);
            expect(token1Fees).to.eq("999999999999998");
            ({ token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: false,
                poke: true,
            }));
            expect(token0Fees).to.eq(0);
            expect(token1Fees).to.eq("1499999999999997");
        });

        it("position owner gets partial fees when protocol fee is on", async () => {
            await factory.setFeeProtocol(80);
            await pool.setFeeProtocol();

            const { token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });

            expect(token0Fees).to.be.eq("99999999999999");
            expect(token1Fees).to.be.eq(0);
        });

        describe("#collectProtocol", () => {
            it("returns 0 if no fees", async () => {
                await factory.setFeeProtocol(80);
                await pool.setFeeProtocol();

                // use owner as fee collector for testing
                await factory.setFeeCollector(wallet.address);

                const { amount0, amount1 } =
                    await pool.collectProtocol.staticCall(
                        wallet.address,
                        MaxUint128,
                        MaxUint128,
                    );
                expect(amount0).to.be.eq(0);
                expect(amount1).to.be.eq(0);
            });

            it("can collect fees", async () => {
                await factory.setFeeProtocol(80);
                await pool.setFeeProtocol();

                await swapAndGetFeesOwed({
                    amount: expandTo18Decimals(1n),
                    zeroForOne: true,
                    poke: true,
                });

                await expect(
                    pool.collectProtocol(other.address, MaxUint128, MaxUint128),
                )
                    .to.emit(token0, "Transfer")
                    .withArgs(
                        await pool.getAddress(),
                        other.address,
                        "399999999999999",
                    );
            });
        });

        it("fees collected by lp after two swaps should be double one swap", async () => {
            await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });
            const { token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });

            // 6 bips * 2e18
            expect(token0Fees).to.eq("999999999999998");
            expect(token1Fees).to.eq(0);
        });

        it("fees collected after two swaps with fee turned on in middle are fees from last swap (not confiscatory)", async () => {
            await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: false,
            });

            await factory.setFeeProtocol(80);
            await pool.setFeeProtocol();

            const { token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });

            expect(token0Fees).to.eq("599999999999999");
            expect(token1Fees).to.eq(0);
        });

        it("fees collected by lp after two swaps with intermediate withdrawal", async () => {
            await factory.setFeeProtocol(80);
            await pool.setFeeProtocol();

            const { token0Fees, token1Fees } = await swapAndGetFeesOwed({
                amount: expandTo18Decimals(1n),
                zeroForOne: true,
                poke: true,
            });

            expect(token0Fees).to.eq("99999999999999");
            expect(token1Fees).to.eq(0);

            // collect the fees
            await pool.collect(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );

            const { token0Fees: token0FeesNext, token1Fees: token1FeesNext } =
                await swapAndGetFeesOwed({
                    amount: expandTo18Decimals(1n),
                    zeroForOne: true,
                    poke: false,
                });

            expect(token0FeesNext).to.eq(0);
            expect(token1FeesNext).to.eq(0);

            let protocolFees = await pool.protocolFees();
            expect(protocolFees[0]).to.eq("800000000000000");
            expect(protocolFees[1]).to.eq(0);

            await pool.burn(0n, minTick, maxTick, 0); // poke to update fees
            await expect(
                pool.collect(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                ),
            )
                .to.emit(token0, "Transfer")
                .withArgs(
                    await pool.getAddress(),
                    wallet.address,
                    "99999999999999",
                );
            protocolFees = await pool.protocolFees();
            expect(protocolFees[0]).to.eq("800000000000000");
            expect(protocolFees[1]).to.eq(0);
        });
    });

    describe("#tickSpacing", () => {
        describe("tickSpacing = 12", () => {
            beforeEach("deploy pool", async () => {
                await factory.enableTickSpacing(12, FeeAmount.MEDIUM);
                pool = await createPool(12, 0n);
            });
            describe("post initialize", () => {
                beforeEach("initialize pool", async () => {
                    await pool.initialize(encodePriceSqrt(1n, 1n).toString());
                });
                it("mint can only be called for multiples of 12", async () => {
                    await expect(mint(wallet.address, 0n, -6, 0, 1n)).to.be
                        .reverted;
                    await expect(mint(wallet.address, 0n, 0, 6, 1n)).to.be
                        .reverted;
                });
                it("mint can be called with multiples of 12", async () => {
                    await mint(wallet.address, 0n, 12, 24, 1n);
                    await mint(wallet.address, 0n, -144, -120, 1n);
                });
                it("swapping across gaps works in 1 for 0 direction", async () => {
                    const liquidityAmount = expandTo18Decimals(1n) / 4n;
                    await mint(
                        wallet.address,
                        0n,
                        120000,
                        121200,
                        liquidityAmount,
                    );
                    await swapExact1For0(
                        expandTo18Decimals(1n),
                        wallet.address,
                    );
                    await expect(pool.burn(0n, 120000, 121200, liquidityAmount))
                        .to.emit(pool, "Burn")
                        .withArgs(
                            wallet.address,
                            120000,
                            121200,
                            liquidityAmount,
                            "30027458295511",
                            "996999999999999999",
                        )
                        .to.not.emit(token0, "Transfer")
                        .to.not.emit(token1, "Transfer");
                    expect((await pool.slot0()).tick).to.eq(120196);
                });
                it("swapping across gaps works in 0 for 1 direction", async () => {
                    const liquidityAmount = expandTo18Decimals(1n) / 4n;
                    await mint(
                        wallet.address,
                        0n,
                        -121200,
                        -120000,
                        liquidityAmount,
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n),
                        wallet.address,
                    );
                    await expect(
                        pool.burn(0n, -121200, -120000, liquidityAmount),
                    )
                        .to.emit(pool, "Burn")
                        .withArgs(
                            wallet.address,
                            -121200,
                            -120000,
                            liquidityAmount,
                            "996999999999999999",
                            "30027458295511",
                        )
                        .to.not.emit(token0, "Transfer")
                        .to.not.emit(token1, "Transfer");
                    expect((await pool.slot0()).tick).to.eq(-120197);
                });
            });
        });
    });

    // https://github.com/Uniswap/uniswap-v3-core/issues/214
    it("tick transition cannot run twice if zero for one swap ends at fractional price just below tick", async () => {
        await factory.enableTickSpacing(1, FeeAmount.MEDIUM);
        pool = await createPool(1, 0n);
        const sqrtTickMath = (await (
            await ethers.getContractFactory("TickMathTest")
        ).deploy()) as TickMathTest;
        const swapMath = (await (
            await ethers.getContractFactory("SwapMathTest")
        ).deploy()) as SwapMathTest;
        const p0 = (await sqrtTickMath.getSqrtRatioAtTick(-24081n)) + 1n;
        console.log(p0);
        // initialize at a price of ~0.3 token1/token0
        // meaning if you swap in 2 token0, you should end up getting 0 token1
        await pool.initialize(p0);
        expect(await pool.liquidity(), "current pool liquidity is 1").to.eq(0);
        expect((await pool.slot0()).tick, "pool tick is -24081").to.eq(-24081);

        // add a bunch of liquidity around current price
        const liquidity = expandTo18Decimals(1000n);
        await mint(wallet.address, 0n, -24082, -24080, liquidity);
        expect(
            await pool.liquidity(),
            "current pool liquidity is now liquidity + 1",
        ).to.eq(liquidity);

        await mint(wallet.address, 0n, -24082, -24081, liquidity);
        expect(
            await pool.liquidity(),
            "current pool liquidity is still liquidity + 1",
        ).to.eq(liquidity);

        // check the math works out to moving the price down 1, sending no amount out, and having some amount remaining
        {
            const { feeAmount, amountIn, amountOut, sqrtQ } =
                await swapMath.computeSwapStep(
                    p0,
                    p0 - 1n,
                    liquidity,
                    3,
                    FeeAmount.MEDIUM,
                );
            expect(sqrtQ, "price moves").to.eq(p0 - 1n);
            expect(feeAmount, "fee amount is 1").to.eq(1n);
            expect(amountIn, "amount in is 1").to.eq(1n);
            expect(amountOut, "zero amount out").to.eq(0n);
        }

        // swap 2 amount in, should get 0 amount out
        await expect(swapExact0For1(3n, wallet.address))
            .to.emit(token0, "Transfer")
            .withArgs(wallet.address, await pool.getAddress(), 3n)
            .to.not.emit(token1, "Transfer");

        const { tick, sqrtPriceX96 } = await pool.slot0();

        expect(tick, "pool is at the next tick").to.eq(-24082n);
        expect(sqrtPriceX96, "pool price is still on the p0 boundary").to.eq(
            p0 - 1n,
        );
        expect(
            await pool.liquidity(),
            "pool has run tick transition and liquidity changed",
        ).to.eq(liquidity * 2n);
    });

    describe("#increaseObservationCardinalityNext", () => {
        it("cannot be called before initialization", async () => {
            await expect(pool.increaseObservationCardinalityNext(2)).to.be
                .reverted;
        });
        describe("after initialization", () => {
            beforeEach("initialize the pool", () =>
                pool.initialize(encodePriceSqrt(1n, 1n).toString()),
            );
            it("oracle starting state after initialization", async () => {
                const {
                    observationCardinality,
                    observationIndex,
                    observationCardinalityNext,
                } = await pool.slot0();
                expect(observationCardinality).to.eq(1);
                expect(observationIndex).to.eq(0);
                expect(observationCardinalityNext).to.eq(1);
                const {
                    secondsPerLiquidityCumulativeX128,
                    tickCumulative,
                    initialized,
                    blockTimestamp,
                } = await pool.observations(0);
                expect(secondsPerLiquidityCumulativeX128).to.eq(
                    SECONDS_PER_LIQUIDITY_PERIOD_INIT,
                );
                expect(tickCumulative).to.eq(0);
                expect(initialized).to.eq(true);
                expect(blockTimestamp).to.eq(TEST_POOL_START_PERIOD_TIME);
            });
            it("increases observation cardinality next", async () => {
                await pool.increaseObservationCardinalityNext(2);
                const {
                    observationCardinality,
                    observationIndex,
                    observationCardinalityNext,
                } = await pool.slot0();
                expect(observationCardinality).to.eq(1);
                expect(observationIndex).to.eq(0);
                expect(observationCardinalityNext).to.eq(2);
            });
            it("is no op if target is already exceeded", async () => {
                await pool.increaseObservationCardinalityNext(5);
                await pool.increaseObservationCardinalityNext(3);
                const {
                    observationCardinality,
                    observationIndex,
                    observationCardinalityNext,
                } = await pool.slot0();
                expect(observationCardinality).to.eq(1);
                expect(observationIndex).to.eq(0);
                expect(observationCardinalityNext).to.eq(5);
            });
        });
    });

    describe("#setFeeProtocol", () => {
        beforeEach("initialize the pool", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
        });

        it("sets protocol fee", async () => {
            await factory.setFeeProtocol(7);
            await pool.setFeeProtocol();
            expect((await pool.slot0()).feeProtocol).to.eq(7);
        });
        it("can change protocol fee", async () => {
            await factory.setFeeProtocol(7);
            await pool.setFeeProtocol();
            await factory.setFeeProtocol(5);
            await pool.setFeeProtocol();
            expect((await pool.slot0()).feeProtocol).to.eq(5);
        });
        it("can turn off protocol fee", async () => {
            await factory.setFeeProtocol(7);
            await pool.setFeeProtocol();
            await factory.setFeeProtocol(0);
            await pool.setFeeProtocol();
            expect((await pool.slot0()).feeProtocol).to.eq(0);
        });
        it("emits an event when turned on", async () => {
            await factory.setFeeProtocol(7);
            await expect(pool.setFeeProtocol())
                .to.be.emit(pool, "SetFeeProtocol")
                .withArgs(0, 7);
        });
        it("emits an event when turned off", async () => {
            await factory.setFeeProtocol(7);
            await pool.setFeeProtocol();
            await factory.setFeeProtocol(0);

            await expect(pool.setFeeProtocol())
                .to.be.emit(pool, "SetFeeProtocol")
                .withArgs(7, 0);
        });
        it("emits an event when changed", async () => {
            await factory.setFeeProtocol(4);
            await pool.setFeeProtocol();
            await factory.setFeeProtocol(6);
            await expect(pool.setFeeProtocol())
                .to.be.emit(pool, "SetFeeProtocol")
                .withArgs(4, 6);
        });
        it("emits an event when unchanged", async () => {
            await factory.setFeeProtocol(5);
            await pool.setFeeProtocol();
            await factory.setFeeProtocol(5);
            await expect(pool.setFeeProtocol())
                .to.be.emit(pool, "SetFeeProtocol")
                .withArgs(5, 5);
        });
    });

    describe("#lock", () => {
        beforeEach("initialize the pool", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(
                wallet.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
        });

        it("cannot reenter from swap callback", async () => {
            const reentrant = (await (
                await ethers.getContractFactory("TestRamsesV3ReentrantCallee")
            ).deploy()) as TestRamsesV3ReentrantCallee;

            // the tests happen in solidity
            await expect(
                reentrant.swapToReenter(await pool.getAddress()),
            ).to.be.revertedWith("Unable to reenter");
        });
    });

    describe("#snapshotCumulativesInside", () => {
        const tickLower = -TICK_SPACINGS[FeeAmount.MEDIUM];
        const tickUpper = TICK_SPACINGS[FeeAmount.MEDIUM];
        const tickSpacing = TICK_SPACINGS[FeeAmount.MEDIUM];
        beforeEach(async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, tickLower, tickUpper, 10n);
        });
        it("throws if ticks are in reverse order", async () => {
            await expect(pool.snapshotCumulativesInside(tickUpper, tickLower))
                .to.be.reverted;
        });
        it("throws if ticks are the same", async () => {
            await expect(pool.snapshotCumulativesInside(tickUpper, tickUpper))
                .to.be.reverted;
        });
        it("throws if tick lower is too low", async () => {
            await expect(
                pool.snapshotCumulativesInside(
                    getMinTick(tickSpacing) - 1,
                    tickUpper,
                ),
            ).be.reverted;
        });
        it("throws if tick upper is too high", async () => {
            await expect(
                pool.snapshotCumulativesInside(
                    tickLower,
                    getMaxTick(tickSpacing) + 1,
                ),
            ).be.reverted;
        });
        it("throws if tick lower is not initialized", async () => {
            await expect(
                pool.snapshotCumulativesInside(
                    tickLower - tickSpacing,
                    tickUpper,
                ),
            ).to.be.reverted;
        });
        it("throws if tick upper is not initialized", async () => {
            await expect(
                pool.snapshotCumulativesInside(
                    tickLower,
                    tickUpper + tickSpacing,
                ),
            ).to.be.reverted;
        });
        it("is zero immediately after initialize", async () => {
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq(0);
            expect(tickCumulativeInside).to.eq(0);
            expect(secondsInside).to.eq(0);
        });
        it("increases by expected amount when time elapses in the range", async () => {
            await pool.advanceTime(5);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((5n << 128n) / 10n);
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(0);
            expect(secondsInside).to.eq(5);
        });
        it("does not account for time increase above range", async () => {
            await pool.advanceTime(5);
            await swapToHigherPrice(
                BigInt(encodePriceSqrt(2n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(7);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((5n << 128n) / 10n);
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(0);
            expect(secondsInside).to.eq(5);
        });
        it("does not account for time increase below range", async () => {
            await pool.advanceTime(5);
            await swapToLowerPrice(
                BigInt(encodePriceSqrt(1n, 2n).toString()),
                wallet.address,
            );
            await pool.advanceTime(7);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((5n << 128n) / 10n);
            // tick is 0 for 5 seconds, then not in range
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(0);
            expect(secondsInside).to.eq(5);
        });
        it("time increase below range is not counted", async () => {
            await swapToLowerPrice(
                BigInt(encodePriceSqrt(1n, 2n).toString()),
                wallet.address,
            );
            await pool.advanceTime(5);
            await swapToHigherPrice(
                BigInt(encodePriceSqrt(1n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(7);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((7n << 128n) / 10n);
            // tick is not in range then tick is 0 for 7 seconds
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(0);
            expect(secondsInside).to.eq(7);
        });
        it("time increase above range is not counted", async () => {
            await swapToHigherPrice(
                BigInt(encodePriceSqrt(2n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(5);
            await swapToLowerPrice(
                BigInt(encodePriceSqrt(1n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(7);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((7n << 128n) / 10n);
            expect((await pool.slot0()).tick).to.eq(-1); // justify the -7 tick cumulative inside value
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(-7);
            expect(secondsInside).to.eq(7);
        });
        it("positions minted after time spent", async () => {
            await pool.advanceTime(5);
            await mint(
                wallet.address,
                0n,
                tickUpper,
                getMaxTick(tickSpacing),
                15n,
            );
            await swapToHigherPrice(
                BigInt(encodePriceSqrt(2n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(8);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(
                tickUpper,
                getMaxTick(tickSpacing),
            );
            expect(secondsPerLiquidityInsideX128).to.eq((8n << 128n) / 15n);
            // the tick of 2/1 is 6931
            // 8 seconds * 6931 = 55448
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(55448);
            expect(secondsInside).to.eq(8);
        });
        it("overlapping liquidity is aggregated", async () => {
            await mint(
                wallet.address,
                0n,
                tickLower,
                getMaxTick(tickSpacing),
                15n,
            );
            await pool.advanceTime(5);
            await swapToHigherPrice(
                BigInt(encodePriceSqrt(2n, 1n).toString()),
                wallet.address,
            );
            await pool.advanceTime(8);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(tickLower, tickUpper);
            expect(secondsPerLiquidityInsideX128).to.eq((5n << 128n) / 25n);
            expect(tickCumulativeInside, "tickCumulativeInside").to.eq(0);
            expect(secondsInside).to.eq(5);
        });
        it("relative behavior of snapshots", async () => {
            await pool.advanceTime(5);
            await mint(
                wallet.address,
                0n,
                getMinTick(tickSpacing),
                tickLower,
                15n,
            );
            console.log("here");
            const {
                secondsPerLiquidityInsideX128:
                    secondsPerLiquidityInsideX128Start,
                tickCumulativeInside: tickCumulativeInsideStart,
                secondsInside: secondsInsideStart,
            } = await pool.snapshotCumulativesInside(
                getMinTick(tickSpacing),
                tickLower,
            );
            await pool.advanceTime(8);
            // 13 seconds in starting range, then 3 seconds in newly minted range
            await swapToLowerPrice(
                BigInt(encodePriceSqrt(1n, 2n).toString()),
                wallet.address,
            );
            await pool.advanceTime(3);
            const {
                secondsPerLiquidityInsideX128,
                tickCumulativeInside,
                secondsInside,
            } = await pool.snapshotCumulativesInside(
                getMinTick(tickSpacing),
                tickLower,
            );
            const expectedDiffSecondsPerLiquidity = (3n << 128n) / 15n;

            expect(
                secondsPerLiquidityInsideX128 -
                    secondsPerLiquidityInsideX128Start,
            ).to.eq(expectedDiffSecondsPerLiquidity);
            expect(secondsPerLiquidityInsideX128).to.not.eq(
                expectedDiffSecondsPerLiquidity,
            );
            // the tick is the one corresponding to the price of 1/2, or log base 1.0001 of 0.5
            // this is -6932, and 3 seconds have passed, so the cumulative computed from the diff equals 6932 * 3
            expect(
                tickCumulativeInside - tickCumulativeInsideStart,
                "tickCumulativeInside",
            ).to.eq(-20796);
            expect(secondsInside - secondsInsideStart).to.eq(3);
            expect(secondsInside).to.not.eq(3);
        });
    });

    describe("fees overflow scenarios", async () => {
        it("up to max uint 128", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, MaxUint128, MaxUint128);

            const [feeGrowthGlobal0X128, feeGrowthGlobal1X128] =
                await Promise.all([
                    pool.feeGrowthGlobal0X128(),
                    pool.feeGrowthGlobal1X128(),
                ]);

            // all 1s in first 128 bits
            expect(feeGrowthGlobal0X128).to.eq(MaxUint128 << 128n);
            expect(feeGrowthGlobal1X128).to.eq(MaxUint128 << 128n);
            await pool.burn(0, minTick, maxTick, 0);
            const { amount0, amount1 } = await pool.collect.staticCall(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );

            expect(amount0).to.eq(MaxUint128);
            expect(amount1).to.eq(MaxUint128);
        });

        it("overflow max uint 128", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, MaxUint128, MaxUint128);
            await flash(0n, 0n, wallet.address, 1n, 1n);

            const [feeGrowthGlobal0X128, feeGrowthGlobal1X128] =
                await Promise.all([
                    pool.feeGrowthGlobal0X128(),
                    pool.feeGrowthGlobal1X128(),
                ]);
            // all 1s in first 128 bits
            expect(feeGrowthGlobal0X128).to.eq(0);
            expect(feeGrowthGlobal1X128).to.eq(0);
            await pool.burn(0n, minTick, maxTick, 0);
            const { amount0, amount1 } = await pool.collect.staticCall(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );
            // fees burned
            expect(amount0).to.eq(0);
            expect(amount1).to.eq(0);
        });

        it("overflow max uint 128 after poke burns fees owed to 0", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, MaxUint128, MaxUint128);
            await pool.burn(0n, minTick, maxTick, 0);
            await flash(0n, 0n, wallet.address, 1n, 1n);
            await pool.burn(0n, minTick, maxTick, 0);

            const { amount0, amount1 } = await pool.collect.staticCall(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );
            // fees burned
            expect(amount0).to.eq(0);
            expect(amount1).to.eq(0);
        });

        it("two positions at the same snapshot", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, minTick, maxTick, 1n);
            await mint(other.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, MaxUint128, 0n);
            await flash(0n, 0n, wallet.address, MaxUint128, 0n);
            const feeGrowthGlobal0X128 = await pool.feeGrowthGlobal0X128();
            expect(feeGrowthGlobal0X128).to.eq(MaxUint128 << 128n);
            await flash(0n, 0n, wallet.address, 2n, 0n);
            await pool.burn(0n, minTick, maxTick, 0n);
            await pool.connect(other).burn(0n, minTick, maxTick, 0n);
            let { amount0 } = await pool.collect.staticCall(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );

            expect(amount0, "amount0 of wallet").to.eq(0);
            ({ amount0 } = await pool
                .connect(other)
                .collect.staticCall(
                    other.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                ));
            expect(amount0, "amount0 of other").to.eq(0);
        });

        it("two positions 1 wei of fees apart overflows exactly once", async () => {
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(wallet.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, 1n, 0n);
            await mint(other.address, 0n, minTick, maxTick, 1n);
            await flash(0n, 0n, wallet.address, MaxUint128, 0n);
            await flash(0n, 0n, wallet.address, MaxUint128, 0n);
            const feeGrowthGlobal0X128 = await pool.feeGrowthGlobal0X128();
            expect(feeGrowthGlobal0X128).to.eq(0);
            await flash(0n, 0n, wallet.address, 2n, 0n);
            await pool.burn(0n, minTick, maxTick, 0n);
            await pool.connect(other).burn(0n, minTick, maxTick, 0n);
            let { amount0 } = await pool.collect.staticCall(
                wallet.address,
                0n,
                minTick,
                maxTick,
                MaxUint128,
                MaxUint128,
            );

            expect(amount0, "amount0 of wallet").to.eq(1);
            ({ amount0 } = await pool
                .connect(other)
                .collect.staticCall(
                    other.address,
                    0n,
                    minTick,
                    maxTick,
                    MaxUint128,
                    MaxUint128,
                ));

            expect(amount0, "amount0 of other").to.eq(0);
        });
    });

    describe("swap underpayment tests", () => {
        let underpay: TestRamsesV3SwapPay;
        beforeEach("deploy swap test", async () => {
            const underpayFactory = await ethers.getContractFactory(
                "TestRamsesV3SwapPay",
            );
            underpay = (await underpayFactory.deploy()) as TestRamsesV3SwapPay;
            await token0.approve(underpay.getAddress(), ethers.MaxUint256);
            await token1.approve(underpay.getAddress(), ethers.MaxUint256);
            await pool.initialize(encodePriceSqrt(1n, 1n).toString());
            await mint(
                wallet.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
        });

        it("underpay zero for one and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    1000,
                    1,
                    0,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("pay in the wrong token zero for one and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    1000,
                    0,
                    2000,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("overpay zero for one and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    1000,
                    2000,
                    0,
                ),
            ).to.not.be.revertedWithCustomError(pool, "IIA");
        });
        it("underpay zero for one and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    -1000,
                    1,
                    0,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("pay in the wrong token zero for one and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    -1000,
                    0,
                    2000,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("overpay zero for one and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    true,
                    MIN_SQRT_RATIO + 1n,
                    -1000,
                    2000,
                    0,
                ),
            ).to.not.be.revertedWithCustomError(pool, "IIA");
        });
        it("underpay one for zero and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    1000,
                    0,
                    1,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("pay in the wrong token one for zero and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    1000,
                    2000,
                    0,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("overpay one for zero and exact in", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    1000,
                    0,
                    2000,
                ),
            ).to.not.be.revertedWithCustomError(pool, "IIA");
        });
        it("underpay one for zero and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    -1000,
                    0,
                    1,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("pay in the wrong token one for zero and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    -1000,
                    2000,
                    0,
                ),
            ).to.be.revertedWithCustomError(pool, "IIA");
        });
        it("overpay one for zero and exact out", async () => {
            await expect(
                underpay.swap(
                    pool.getAddress(),
                    wallet.address,
                    false,
                    MAX_SQRT_RATIO - 1n,
                    -1000,
                    0,
                    2000,
                ),
            ).to.not.be.revertedWithCustomError(pool, "IIA");
        });
    });
});
