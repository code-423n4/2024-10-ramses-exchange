import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { Wallet } from "ethers";
import { MockTimeRamsesV3Pool } from "../../typechain-types";
import { expect } from "./shared/expect";

import { poolFixture } from "./shared/fixtures";
import snapshotGasCost from "./shared/snapshotGasCost";

import {
    expandTo18Decimals,
    FeeAmount,
    getMinTick,
    encodePriceSqrt,
    TICK_SPACINGS,
    createPoolFunctions,
    SwapFunction,
    MintFunction,
    getMaxTick,
    MaxUint128,
    SwapToPriceFunction,
    MAX_SQRT_RATIO,
    MIN_SQRT_RATIO,
} from "./shared/utilities";

describe("RamsesV3Pool gas tests", () => {
    let wallet: Wallet, other: Wallet;

    before("create fixture loader", async () => {
        [wallet, other] = await (ethers as any).getSigners();
    });

    for (const feeProtocol of [0, 6]) {
        describe(feeProtocol > 0 ? "fee is on" : "fee is off", () => {
            const startingPrice = encodePriceSqrt(100001n, 100000n).toString();
            const startingTick = 0;
            const feeAmount = FeeAmount.MEDIUM;
            const tickSpacing = TICK_SPACINGS[feeAmount];
            const minTick = getMinTick(tickSpacing);
            const maxTick = getMaxTick(tickSpacing);

            const gasTestFixture = async () => {
                const fix = await poolFixture();

                const pool = await fix.createPool(tickSpacing, startingPrice);

                const {
                    swapExact0For1,
                    swapToHigherPrice,
                    mint,
                    swapToLowerPrice,
                } = await createPoolFunctions({
                    swapTarget: fix.swapTargetCallee,
                    token0: fix.token0,
                    token1: fix.token1,
                    pool,
                });

                await fix.factory.setFeeCollector(wallet.address);
                await fix.factory.setFeeProtocol(BigInt(feeProtocol));
                await pool.setFeeProtocol();
                await pool.increaseObservationCardinalityNext(4);
                await pool.advanceTime(1);
                await mint(
                    wallet.address,
                    0n,
                    minTick,
                    maxTick,
                    expandTo18Decimals(2n),
                );

                await swapExact0For1(expandTo18Decimals(1n), wallet.address);
                await pool.advanceTime(1);
                await swapToHigherPrice(BigInt(startingPrice), wallet.address);
                await pool.advanceTime(1);
                expect((await pool.slot0()).tick).to.eq(startingTick);
                expect((await pool.slot0()).sqrtPriceX96).to.eq(startingPrice);

                return {
                    pool,
                    swapExact0For1,
                    mint,
                    swapToHigherPrice,
                    swapToLowerPrice,
                };
            };

            let swapExact0For1: SwapFunction;
            let swapToHigherPrice: SwapToPriceFunction;
            let swapToLowerPrice: SwapToPriceFunction;
            let pool: MockTimeRamsesV3Pool;
            let mint: MintFunction;

            beforeEach("load the fixture", async () => {
                ({
                    swapExact0For1,
                    pool,
                    mint,
                    swapToHigherPrice,
                    swapToLowerPrice,
                } = await loadFixture(gasTestFixture));
            });

            describe("#swapExact0For1", () => {
                it("first swap in block with no tick movement", async () => {
                    await snapshotGasCost(
                        swapExact0For1(2000n, wallet.address),
                    );
                    expect((await pool.slot0()).sqrtPriceX96).to.not.eq(
                        startingPrice,
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick);
                });

                it("first swap in block moves tick, no initialized crossings", async () => {
                    await snapshotGasCost(
                        swapExact0For1(
                            expandTo18Decimals(1n) / 10000n,
                            wallet.address,
                        ),
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick - 1);
                });

                it("second swap in block with no tick movement", async () => {
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 10000n,
                        wallet.address,
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick - 1);
                    await snapshotGasCost(
                        swapExact0For1(2000n, wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick - 1);
                });

                it("second swap in block moves tick, no initialized crossings", async () => {
                    await swapExact0For1(1000n, wallet.address);
                    expect((await pool.slot0()).tick).to.eq(startingTick);
                    await snapshotGasCost(
                        swapExact0For1(
                            expandTo18Decimals(1n) / 10000n,
                            wallet.address,
                        ),
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick - 1);
                });

                it("first swap in block, large swap, no initialized crossings", async () => {
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(10n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.eq(-35787);
                });

                it("first swap in block, large swap crossing several initialized ticks", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 3 * tickSpacing,
                        startingTick - tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 4 * tickSpacing,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    expect((await pool.slot0()).tick).to.eq(startingTick);
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        startingTick - 4 * tickSpacing,
                    ); // we crossed the last tick
                });

                it("first swap in block, large swap crossing a single initialized tick", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        minTick,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        startingTick - 2 * tickSpacing,
                    ); // we crossed the last tick
                });

                it("second swap in block, large swap crossing several initialized ticks", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 3 * tickSpacing,
                        startingTick - tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 4 * tickSpacing,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 10000n,
                        wallet.address,
                    );
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        startingTick - 4 * tickSpacing,
                    );
                });

                it("second swap in block, large swap crossing a single initialized tick", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        minTick,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 10000n,
                        wallet.address,
                    );
                    expect((await pool.slot0()).tick).to.be.gt(
                        startingTick - 2 * tickSpacing,
                    ); // we didn't cross the initialized tick
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        startingTick - 2 * tickSpacing,
                    ); // we crossed the last tick
                });

                it("large swap crossing several initialized ticks after some time passes", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 3 * tickSpacing,
                        startingTick - tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 4 * tickSpacing,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(2n, wallet.address);
                    await pool.advanceTime(1);
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        startingTick - 4 * tickSpacing,
                    );
                });

                it("large swap crossing several initialized ticks second time after some time passes", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 3 * tickSpacing,
                        startingTick - tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await mint(
                        wallet.address,
                        0n,
                        startingTick - 4 * tickSpacing,
                        startingTick - 2 * tickSpacing,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n),
                        wallet.address,
                    );
                    await swapToHigherPrice(
                        BigInt(startingPrice),
                        wallet.address,
                    );
                    await pool.advanceTime(1);
                    await snapshotGasCost(
                        swapExact0For1(expandTo18Decimals(1n), wallet.address),
                    );
                    expect((await pool.slot0()).tick).to.be.lt(
                        tickSpacing * -4,
                    );
                });
            });

            describe("#mint", () => {
                for (const { description, tickLower, tickUpper } of [
                    {
                        description: "around current price",
                        tickLower: startingTick - tickSpacing,
                        tickUpper: startingTick + tickSpacing,
                    },
                    {
                        description: "below current price",
                        tickLower: startingTick - 2 * tickSpacing,
                        tickUpper: startingTick - tickSpacing,
                    },
                    {
                        description: "above current price",
                        tickLower: startingTick + tickSpacing,
                        tickUpper: startingTick + 2 * tickSpacing,
                    },
                ]) {
                    describe(description, () => {
                        it("new position mint first in range", async () => {
                            await snapshotGasCost(
                                mint(
                                    wallet.address,
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                        it("add to position existing", async () => {
                            await mint(
                                wallet.address,
                                0n,
                                tickLower,
                                tickUpper,
                                expandTo18Decimals(1n),
                            );
                            await snapshotGasCost(
                                mint(
                                    wallet.address,
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                        it("second position in same range", async () => {
                            await mint(
                                wallet.address,
                                1n,
                                tickLower,
                                tickUpper,
                                expandTo18Decimals(1n),
                            );
                            await snapshotGasCost(
                                mint(
                                    other.address,
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                        it("add to position after some time passes", async () => {
                            await mint(
                                wallet.address,
                                0n,
                                tickLower,
                                tickUpper,
                                expandTo18Decimals(1n),
                            );
                            await pool.advanceTime(1);
                            await snapshotGasCost(
                                mint(
                                    wallet.address,
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                    });
                }
            });

            describe("#burn", () => {
                for (const { description, tickLower, tickUpper } of [
                    {
                        description: "around current price",
                        tickLower: startingTick - tickSpacing,
                        tickUpper: startingTick + tickSpacing,
                    },
                    {
                        description: "below current price",
                        tickLower: startingTick - 2 * tickSpacing,
                        tickUpper: startingTick - tickSpacing,
                    },
                    {
                        description: "above current price",
                        tickLower: startingTick + tickSpacing,
                        tickUpper: startingTick + 2 * tickSpacing,
                    },
                ]) {
                    describe(description, () => {
                        const liquidityAmount = expandTo18Decimals(1n);
                        beforeEach("mint a position", async () => {
                            await mint(
                                wallet.address,
                                0n,
                                tickLower,
                                tickUpper,
                                liquidityAmount,
                            );
                        });

                        it("burn when only position using ticks", async () => {
                            await snapshotGasCost(
                                pool.burn(
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                        it("partial position burn", async () => {
                            await snapshotGasCost(
                                pool.burn(
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n) / 2n,
                                ),
                            );
                        });
                        it("entire position burn but other positions are using the ticks", async () => {
                            await mint(
                                other.address,
                                0n,
                                tickLower,
                                tickUpper,
                                expandTo18Decimals(1n),
                            );
                            await snapshotGasCost(
                                pool.burn(
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                        it("burn entire position after some time passes", async () => {
                            await pool.advanceTime(1);
                            await snapshotGasCost(
                                pool.burn(
                                    0n,
                                    tickLower,
                                    tickUpper,
                                    expandTo18Decimals(1n),
                                ),
                            );
                        });
                    });
                }
            });

            describe("#poke", () => {
                const tickLower = startingTick - tickSpacing;
                const tickUpper = startingTick + tickSpacing;

                it("best case", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        tickLower,
                        tickUpper,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 100n,
                        wallet.address,
                    );
                    await pool.burn(0n, tickLower, tickUpper, 0);
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 100n,
                        wallet.address,
                    );
                    await snapshotGasCost(
                        pool.burn(0n, tickLower, tickUpper, 0),
                    );
                });
            });

            describe("#collect", () => {
                const tickLower = startingTick - tickSpacing;
                const tickUpper = startingTick + tickSpacing;

                it("close to worst case", async () => {
                    await mint(
                        wallet.address,
                        0n,
                        tickLower,
                        tickUpper,
                        expandTo18Decimals(1n),
                    );
                    await swapExact0For1(
                        expandTo18Decimals(1n) / 100n,
                        wallet.address,
                    );
                    await pool.burn(0n, tickLower, tickUpper, 0); // poke to accumulate fees
                    await snapshotGasCost(
                        pool.collect(
                            wallet.address,
                            0n,
                            tickLower,
                            tickUpper,
                            MaxUint128,
                            MaxUint128,
                        ),
                    );
                });
            });

            describe("#increaseObservationCardinalityNext", () => {
                it("grow by 1 slot", async () => {
                    await snapshotGasCost(
                        pool.increaseObservationCardinalityNext(5),
                    );
                });
                it("no op", async () => {
                    await snapshotGasCost(
                        pool.increaseObservationCardinalityNext(3),
                    );
                });
            });

            describe("#snapshotCumulativesInside", () => {
                it("tick inside", async () => {
                    await snapshotGasCost(
                        pool.snapshotCumulativesInside.estimateGas(
                            minTick,
                            maxTick,
                        ),
                    );
                });
                it("tick above", async () => {
                    await swapToHigherPrice(
                        MAX_SQRT_RATIO - 1n,
                        wallet.address,
                    );
                    await snapshotGasCost(
                        pool.snapshotCumulativesInside.estimateGas(
                            minTick,
                            maxTick,
                        ),
                    );
                });
                it("tick below", async () => {
                    await swapToLowerPrice(MIN_SQRT_RATIO + 1n, wallet.address);
                    await snapshotGasCost(
                        pool.snapshotCumulativesInside.estimateGas(
                            minTick,
                            maxTick,
                        ),
                    );
                });
            });
        });
    }
});
