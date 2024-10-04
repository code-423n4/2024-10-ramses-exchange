import { Decimal } from "decimal.js";
import { BigNumberish, ContractTransactionResponse, Wallet } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    MockTimeRamsesV3Pool,
    TestERC20,
    TestRamsesV3Callee,
} from "../../typechain-types";
import { expect } from "./shared/expect";
import { poolFixture } from "./shared/fixtures";
import { formatPrice, formatTokenAmount } from "./shared/format";
import {
    createPoolFunctions,
    encodePriceSqrt,
    expandTo18Decimals,
    FeeAmount,
    getMaxLiquidityPerTick,
    getMaxTick,
    getMinTick,
    MAX_SQRT_RATIO,
    MaxUint128,
    MIN_SQRT_RATIO,
    TICK_SPACINGS,
} from "./shared/utilities";

Decimal.config({ toExpNeg: -500, toExpPos: 500 });

interface BaseSwapTestCase {
    zeroForOne: boolean;
    sqrtPriceLimit?: bigint;
}
interface SwapExact0For1TestCase extends BaseSwapTestCase {
    zeroForOne: true;
    exactOut: false;
    amount0: bigint;
    sqrtPriceLimit?: bigint;
}
interface SwapExact1For0TestCase extends BaseSwapTestCase {
    zeroForOne: false;
    exactOut: false;
    amount1: bigint;
    sqrtPriceLimit?: bigint;
}
interface Swap0ForExact1TestCase extends BaseSwapTestCase {
    zeroForOne: true;
    exactOut: true;
    amount1: bigint;
    sqrtPriceLimit?: bigint;
}
interface Swap1ForExact0TestCase extends BaseSwapTestCase {
    zeroForOne: false;
    exactOut: true;
    amount0: bigint;
    sqrtPriceLimit?: bigint;
}
interface SwapToHigherPrice extends BaseSwapTestCase {
    zeroForOne: false;
    sqrtPriceLimit: bigint;
}
interface SwapToLowerPrice extends BaseSwapTestCase {
    zeroForOne: true;
    sqrtPriceLimit: bigint;
}
type SwapTestCase =
    | SwapExact0For1TestCase
    | Swap0ForExact1TestCase
    | SwapExact1For0TestCase
    | Swap1ForExact0TestCase
    | SwapToHigherPrice
    | SwapToLowerPrice;

function swapCaseToDescription(testCase: SwapTestCase): string {
    const priceClause = testCase?.sqrtPriceLimit
        ? ` to price ${formatPrice(testCase.sqrtPriceLimit)}`
        : "";
    if ("exactOut" in testCase) {
        if (testCase.exactOut) {
            if (testCase.zeroForOne) {
                return `swap token0 for exactly ${formatTokenAmount(
                    testCase.amount1,
                )} token1${priceClause}`;
            } else {
                return `swap token1 for exactly ${formatTokenAmount(
                    testCase.amount0,
                )} token0${priceClause}`;
            }
        } else {
            if (testCase.zeroForOne) {
                return `swap exactly ${formatTokenAmount(
                    testCase.amount0,
                )} token0 for token1${priceClause}`;
            } else {
                return `swap exactly ${formatTokenAmount(
                    testCase.amount1,
                )} token1 for token0${priceClause}`;
            }
        }
    } else {
        if (testCase.zeroForOne) {
            return `swap token0 for token1${priceClause}`;
        } else {
            return `swap token1 for token0${priceClause}`;
        }
    }
}

type PoolFunctions = ReturnType<typeof createPoolFunctions>;

// can't use address zero because the ERC20 token does not allow it
const SWAP_RECIPIENT_ADDRESS = ethers.ZeroAddress.slice(0, -1) + "1";
const POSITION_PROCEEDS_OUTPUT_ADDRESS = ethers.ZeroAddress.slice(0, -1) + "2";

async function executeSwap(
    pool: MockTimeRamsesV3Pool,
    testCase: SwapTestCase,
    poolFunctions: PoolFunctions,
): Promise<ContractTransactionResponse> {
    let swap: ContractTransactionResponse;
    if ("exactOut" in testCase) {
        if (testCase.exactOut) {
            if (testCase.zeroForOne) {
                swap = await poolFunctions.swap0ForExact1(
                    testCase.amount1,
                    SWAP_RECIPIENT_ADDRESS,
                    testCase.sqrtPriceLimit,
                );
            } else {
                swap = await poolFunctions.swap1ForExact0(
                    testCase.amount0,
                    SWAP_RECIPIENT_ADDRESS,
                    testCase.sqrtPriceLimit,
                );
            }
        } else {
            if (testCase.zeroForOne) {
                swap = await poolFunctions.swapExact0For1(
                    testCase.amount0,
                    SWAP_RECIPIENT_ADDRESS,
                    testCase.sqrtPriceLimit,
                );
            } else {
                swap = await poolFunctions.swapExact1For0(
                    testCase.amount1,
                    SWAP_RECIPIENT_ADDRESS,
                    testCase.sqrtPriceLimit,
                );
            }
        }
    } else {
        if (testCase.zeroForOne) {
            swap = await poolFunctions.swapToLowerPrice(
                testCase.sqrtPriceLimit,
                SWAP_RECIPIENT_ADDRESS,
            );
        } else {
            swap = await poolFunctions.swapToHigherPrice(
                testCase.sqrtPriceLimit,
                SWAP_RECIPIENT_ADDRESS,
            );
        }
    }
    return swap;
}

const DEFAULT_POOL_SWAP_TESTS: SwapTestCase[] = [
    // swap large amounts in/out
    {
        zeroForOne: true,
        exactOut: false,
        amount0: expandTo18Decimals(1n),
    },
    {
        zeroForOne: false,
        exactOut: false,
        amount1: expandTo18Decimals(1n),
    },
    {
        zeroForOne: true,
        exactOut: true,
        amount1: expandTo18Decimals(1n),
    },
    {
        zeroForOne: false,
        exactOut: true,
        amount0: expandTo18Decimals(1n),
    },
    // swap large amounts in/out with a price limit
    {
        zeroForOne: true,
        exactOut: false,
        amount0: expandTo18Decimals(1n),
        sqrtPriceLimit: BigInt(encodePriceSqrt(50n, 100n).toString()),
    },
    {
        zeroForOne: false,
        exactOut: false,
        amount1: expandTo18Decimals(1n),
        sqrtPriceLimit: BigInt(encodePriceSqrt(200n, 100n).toString()),
    },
    {
        zeroForOne: true,
        exactOut: true,
        amount1: expandTo18Decimals(1n),
        sqrtPriceLimit: BigInt(encodePriceSqrt(50n, 100n).toString()),
    },
    {
        zeroForOne: false,
        exactOut: true,
        amount0: expandTo18Decimals(1n),
        sqrtPriceLimit: BigInt(encodePriceSqrt(200n, 100n).toString()),
    },
    // swap small amounts in/out
    {
        zeroForOne: true,
        exactOut: false,
        amount0: 1000n,
    },
    {
        zeroForOne: false,
        exactOut: false,
        amount1: 1000n,
    },
    {
        zeroForOne: true,
        exactOut: true,
        amount1: 1000n,
    },
    {
        zeroForOne: false,
        exactOut: true,
        amount0: 1000n,
    },
    // swap arbitrary input to price
    {
        sqrtPriceLimit: BigInt(encodePriceSqrt(5n, 2n).toString()),
        zeroForOne: false,
    },
    {
        sqrtPriceLimit: BigInt(encodePriceSqrt(2n, 5n).toString()),
        zeroForOne: true,
    },
    {
        sqrtPriceLimit: BigInt(encodePriceSqrt(5n, 2n).toString()),
        zeroForOne: true,
    },
    {
        sqrtPriceLimit: BigInt(encodePriceSqrt(2n, 5n).toString()),
        zeroForOne: false,
    },
];

interface Position {
    tickLower: number;
    tickUpper: number;
    liquidity: bigint;
}

interface PoolTestCase {
    description: string;
    feeAmount: number;
    tickSpacing: number;
    startingPrice: bigint;
    positions: Position[];
    swapTests?: SwapTestCase[];
}

const TEST_POOLS: PoolTestCase[] = [
    {
        description: "low fee, 1:1 price, 2e18 max range liquidity",
        feeAmount: FeeAmount.LOW,
        tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.LOW]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.LOW]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "medium fee, 1:1 price, 2e18 max range liquidity",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "high fee, 1:1 price, 2e18 max range liquidity",
        feeAmount: FeeAmount.HIGH,
        tickSpacing: TICK_SPACINGS[FeeAmount.HIGH],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.HIGH]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.HIGH]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "medium fee, 10:1 price, 2e18 max range liquidity",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(10n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "medium fee, 1:10 price, 2e18 max range liquidity",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 10n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description:
            "medium fee, 1:1 price, 0 liquidity, all liquidity around current price",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: -TICK_SPACINGS[FeeAmount.MEDIUM],
                liquidity: expandTo18Decimals(2n),
            },
            {
                tickLower: TICK_SPACINGS[FeeAmount.MEDIUM],
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description:
            "medium fee, 1:1 price, additional liquidity around current price",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: -TICK_SPACINGS[FeeAmount.MEDIUM],
                liquidity: expandTo18Decimals(2n),
            },
            {
                tickLower: TICK_SPACINGS[FeeAmount.MEDIUM],
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description:
            "low fee, large liquidity around current price (stable swap)",
        feeAmount: FeeAmount.LOW,
        tickSpacing: TICK_SPACINGS[FeeAmount.LOW],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: -TICK_SPACINGS[FeeAmount.LOW],
                tickUpper: TICK_SPACINGS[FeeAmount.LOW],
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "medium fee, token0 liquidity only",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: 0,
                tickUpper: 2000 * TICK_SPACINGS[FeeAmount.MEDIUM],
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "medium fee, token1 liquidity only",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: -2000 * TICK_SPACINGS[FeeAmount.MEDIUM],
                tickUpper: 0,
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "close to max price",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(2n ** 127n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "close to min price",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 2n ** 127n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "max full range liquidity at 1:1 price with default fee",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: BigInt(encodePriceSqrt(1n, 1n).toString()),
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: getMaxLiquidityPerTick(
                    TICK_SPACINGS[FeeAmount.MEDIUM],
                ),
            },
        ],
    },
    {
        description: "initialized at the max ratio",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: MAX_SQRT_RATIO - 1n,
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
    {
        description: "initialized at the min ratio",
        feeAmount: FeeAmount.MEDIUM,
        tickSpacing: TICK_SPACINGS[FeeAmount.MEDIUM],
        startingPrice: MIN_SQRT_RATIO,
        positions: [
            {
                tickLower: getMinTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidity: expandTo18Decimals(2n),
            },
        ],
    },
];

describe("RamsesV3 swap tests", () => {
    let wallet: Wallet, other: Wallet;

    before("create fixture loader", async () => {
        [wallet, other] = await (ethers as any).getSigners();
    });

    for (const poolCase of TEST_POOLS) {
        describe(poolCase.description, () => {
            async function poolCaseFixture() {
                const {
                    createPool,
                    token0,
                    token1,
                    swapTargetCallee: swapTarget,
                } = await loadFixture(poolFixture);
                const pool = await createPool(
                    poolCase.tickSpacing,
                    poolCase.startingPrice,
                );
                await pool._setFee(poolCase.feeAmount);
                const poolFunctions = createPoolFunctions({
                    swapTarget,
                    token0,
                    token1,
                    pool,
                });
                //await pool["initialize(uint160)"](poolCase.startingPrice);
                // mint all positions
                for (const position of poolCase.positions) {
                    await poolFunctions.mint(
                        wallet.address,
                        0n,
                        position.tickLower,
                        position.tickUpper,
                        position.liquidity,
                    );
                }

                const [poolBalance0, poolBalance1] = await Promise.all([
                    token0.balanceOf(pool.getAddress()),
                    token1.balanceOf(pool.getAddress()),
                ]);

                return {
                    token0,
                    token1,
                    pool,
                    poolFunctions,
                    poolBalance0,
                    poolBalance1,
                    swapTarget,
                };
            }

            let token0: TestERC20;
            let token1: TestERC20;

            let poolBalance0: bigint;
            let poolBalance1: bigint;

            let pool: MockTimeRamsesV3Pool;
            let swapTarget: TestRamsesV3Callee;
            let poolFunctions: PoolFunctions;

            beforeEach("load fixture", async () => {
                ({
                    token0,
                    token1,
                    pool,
                    poolFunctions,
                    poolBalance0,
                    poolBalance1,
                    swapTarget,
                } = await loadFixture(poolCaseFixture));
            });

            afterEach("check can burn positions", async () => {
                for (const {
                    liquidity,
                    tickUpper,
                    tickLower,
                } of poolCase.positions) {
                    await pool.burn(0n, tickLower, tickUpper, liquidity);
                    await pool.collect(
                        POSITION_PROCEEDS_OUTPUT_ADDRESS,
                        0n,
                        tickLower,
                        tickUpper,
                        MaxUint128,
                        MaxUint128,
                    );
                }
            });

            for (const testCase of poolCase.swapTests ??
                DEFAULT_POOL_SWAP_TESTS) {
                it(swapCaseToDescription(testCase), async () => {
                    const slot0 = await pool.slot0();
                    const tx = executeSwap(pool, testCase, poolFunctions);
                    try {
                        await tx;
                    } catch (error) {
                        expect({
                            // @ts-ignore: error is type unknown
                            swapError: error.message,
                            poolBalance0: poolBalance0.toString(),
                            poolBalance1: poolBalance1.toString(),
                            poolPriceBefore: formatPrice(slot0.sqrtPriceX96),
                            tickBefore: slot0.tick,
                        }).to.matchSnapshot("swap error");
                        return;
                    }
                    const [
                        poolBalance0After,
                        poolBalance1After,
                        slot0After,
                        liquidityAfter,
                        feeGrowthGlobal0X128,
                        feeGrowthGlobal1X128,
                    ] = await Promise.all([
                        token0.balanceOf(pool.getAddress()),
                        token1.balanceOf(pool.getAddress()),
                        pool.slot0(),
                        pool.liquidity(),
                        pool.feeGrowthGlobal0X128(),
                        pool.feeGrowthGlobal1X128(),
                    ]);
                    const poolBalance0Delta = poolBalance0After - poolBalance0;
                    const poolBalance1Delta = poolBalance1After - poolBalance1;

                    // check all the events were emitted corresponding to balance changes
                    if (poolBalance0Delta == 0n)
                        await expect(tx).to.not.emit(token0, "Transfer");
                    else if (poolBalance0Delta < 0n)
                        await expect(tx)
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                await pool.getAddress(),
                                SWAP_RECIPIENT_ADDRESS,
                                poolBalance0Delta * -1n,
                            );
                    else
                        await expect(tx)
                            .to.emit(token0, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                poolBalance0Delta,
                            );

                    if (poolBalance1Delta == 0n)
                        await expect(tx).to.not.emit(token1, "Transfer");
                    else if (poolBalance1Delta < 0n)
                        await expect(tx)
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                await pool.getAddress(),
                                SWAP_RECIPIENT_ADDRESS,
                                poolBalance1Delta * -1n,
                            );
                    else
                        await expect(tx)
                            .to.emit(token1, "Transfer")
                            .withArgs(
                                wallet.address,
                                await pool.getAddress(),
                                poolBalance1Delta,
                            );

                    // check that the swap event was emitted too
                    await expect(tx)
                        .to.emit(pool, "Swap")
                        .withArgs(
                            await swapTarget.getAddress(),
                            SWAP_RECIPIENT_ADDRESS,
                            poolBalance0Delta,
                            poolBalance1Delta,
                            slot0After.sqrtPriceX96,
                            liquidityAfter,
                            slot0After.tick,
                        );

                    const executionPrice = new Decimal(
                        poolBalance1Delta.toString(),
                    )
                        .div(poolBalance0Delta.toString())
                        .mul(-1);

                    expect({
                        amount0Before: poolBalance0.toString(),
                        amount1Before: poolBalance1.toString(),
                        amount0Delta: poolBalance0Delta.toString(),
                        amount1Delta: poolBalance1Delta.toString(),
                        feeGrowthGlobal0X128Delta:
                            feeGrowthGlobal0X128.toString(),
                        feeGrowthGlobal1X128Delta:
                            feeGrowthGlobal1X128.toString(),
                        tickBefore: slot0.tick,
                        poolPriceBefore: formatPrice(slot0.sqrtPriceX96),
                        tickAfter: slot0After.tick,
                        poolPriceAfter: formatPrice(slot0After.sqrtPriceX96),
                        executionPrice: executionPrice.toPrecision(5),
                    }).to.matchSnapshot("balances");
                });
            }
        });
    }
});
