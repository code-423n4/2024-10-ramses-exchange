import bn from "bignumber.js";
import { Contract, ContractTransactionResponse, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
    MockTimeRamsesV3Pool,
    TestERC20,
    TestRamsesV3Callee,
    TestRamsesV3Router,
} from "../../../typechain-types";

export const MaxUint128 = 2n ** 128n - 1n;

export const getMinTick = (tickSpacing: number) =>
    Math.ceil(-887272 / tickSpacing) * tickSpacing;

export const getMaxTick = (tickSpacing: number) =>
    Math.floor(887272 / tickSpacing) * tickSpacing;

export const getMaxLiquidityPerTick = (tickSpacing: number) => {
    const minTick = getMinTick(tickSpacing);
    const maxTick = getMaxTick(tickSpacing);
    return (
        (BigInt(2) ** BigInt(128) - BigInt(1)) /
        BigInt((maxTick - minTick) / tickSpacing + 1)
    );
};

export const MIN_SQRT_RATIO = 4295128739n;
export const MAX_SQRT_RATIO =
    1461446703485210103287273052203988822378723970342n;

export enum FeeAmount {
    LOW = 500,
    MEDIUM = 3000,
    HIGH = 10000,
}

export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
    [FeeAmount.LOW]: 10,
    [FeeAmount.MEDIUM]: 50,
    [FeeAmount.HIGH]: 100,
};

export function expandTo18Decimals(n: bigint): bigint {
    return n * 10n ** 18n;
}

export function getCreate2Address(
    factoryAddress: string,
    [tokenA, tokenB]: [string, string],
    tickSpacing: number,
    bytecode: string,
): string {
    const [token0, token1] =
        tokenA.toLowerCase() < tokenB.toLowerCase()
            ? [tokenA, tokenB]
            : [tokenB, tokenA];
    const constructorArgumentsEncoded = ethers.solidityPacked(
        ["address", "address", "int24"],
        [token0, token1, tickSpacing],
    );
    const create2Inputs = [
        "0xff",
        factoryAddress,
        // salt
        ethers.keccak256(constructorArgumentsEncoded),
        // init code. bytecode + constructor arguments
        ethers.keccak256(bytecode),
    ];
    const sanitizedInputs = `0x${create2Inputs.map((i) => i.slice(2)).join("")}`;
    return ethers.getAddress(
        `0x${ethers.keccak256(sanitizedInputs).slice(-40)}`,
    );
}

bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

// returns the sqrt price as a 64x96
export function encodePriceSqrt(reserve1: bigint, reserve0: bigint): bn {
    return new bn(reserve1.toString())
        .div(reserve0.toString())
        .sqrt()
        .multipliedBy(new bn(2).pow(96))
        .integerValue(3);
}

export function getPositionKey(
    address: string,
    lowerTick: number,
    upperTick: number,
    index: number = 0,
): string {
    return ethers.keccak256(
        ethers.solidityPacked(
            ["address", "uint256", "int24", "int24"],
            [address, index, lowerTick, upperTick],
        ),
    );
}

export type SwapFunction = (
    amount: bigint,
    to: Wallet | string,
    sqrtPriceLimitX96?: bigint,
) => Promise<ContractTransactionResponse>;
export type SwapToPriceFunction = (
    sqrtPriceX96: bigint,
    to: Wallet | string,
) => Promise<ContractTransactionResponse>;
export type FlashFunction = (
    amount0: bigint,
    amount1: bigint,
    to: Wallet | string,
    pay0?: bigint,
    pay1?: bigint,
) => Promise<ContractTransactionResponse>;
export type MintFunction = (
    recipient: string,
    index: bigint,
    tickLower: number,
    tickUpper: number,
    liquidity: bigint,
) => Promise<ContractTransactionResponse>;
export interface PoolFunctions {
    swapToLowerPrice: SwapToPriceFunction;
    swapToHigherPrice: SwapToPriceFunction;
    swapExact0For1: SwapFunction;
    swap0ForExact1: SwapFunction;
    swapExact1For0: SwapFunction;
    swap1ForExact0: SwapFunction;
    mint: MintFunction;
    flash: FlashFunction;
}
export function createPoolFunctions({
    swapTarget,
    token0,
    token1,
    pool,
}: {
    swapTarget: TestRamsesV3Callee;
    token0: TestERC20;
    token1: TestERC20;
    pool: MockTimeRamsesV3Pool;
}): PoolFunctions {
    async function swapToSqrtPrice(
        inputToken: TestERC20,
        targetPrice: bigint,
        to: Wallet | string,
    ): Promise<ContractTransactionResponse> {
        const method =
            inputToken === token0
                ? swapTarget.swapToLowerSqrtPrice
                : swapTarget.swapToHigherSqrtPrice;

        await inputToken.approve(swapTarget.getAddress(), ethers.MaxUint256);

        const toAddress = typeof to === "string" ? to : to.getAddress();

        return method(await pool.getAddress(), targetPrice, toAddress);
    }

    async function swap(
        inputToken: TestERC20,
        [amountIn, amountOut]: [bigint, bigint],
        to: Wallet | string,
        sqrtPriceLimitX96?: bigint,
    ): Promise<ContractTransactionResponse> {
        const exactInput = amountOut === 0n;

        const method =
            inputToken === token0
                ? exactInput
                    ? swapTarget.swapExact0For1
                    : swapTarget.swap0ForExact1
                : exactInput
                  ? swapTarget.swapExact1For0
                  : swapTarget.swap1ForExact0;

        if (typeof sqrtPriceLimitX96 === "undefined") {
            if (inputToken === token0) {
                sqrtPriceLimitX96 = MIN_SQRT_RATIO + 1n;
            } else {
                sqrtPriceLimitX96 = MAX_SQRT_RATIO - 1n;
            }
        }
        await inputToken.approve(swapTarget.getAddress(), ethers.MaxUint256);

        const toAddress = typeof to === "string" ? to : to.getAddress();

        return method(
            await pool.getAddress(),
            exactInput ? amountIn : amountOut,
            toAddress,
            sqrtPriceLimitX96,
        );
    }

    const swapToLowerPrice: SwapToPriceFunction = (sqrtPriceX96, to) => {
        return swapToSqrtPrice(token0, sqrtPriceX96, to);
    };

    const swapToHigherPrice: SwapToPriceFunction = (sqrtPriceX96, to) => {
        return swapToSqrtPrice(token1, sqrtPriceX96, to);
    };

    const swapExact0For1: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
        return swap(token0, [amount, 0n], to, sqrtPriceLimitX96);
    };

    const swap0ForExact1: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
        return swap(token0, [0n, amount], to, sqrtPriceLimitX96);
    };

    const swapExact1For0: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
        return swap(token1, [amount, 0n], to, sqrtPriceLimitX96);
    };

    const swap1ForExact0: SwapFunction = (amount, to, sqrtPriceLimitX96) => {
        return swap(token1, [0n, amount], to, sqrtPriceLimitX96);
    };

    const mint: MintFunction = async (
        recipient,
        index,
        tickLower,
        tickUpper,
        liquidity,
    ) => {
        await token0.approve(swapTarget.getAddress(), ethers.MaxUint256);
        await token1.approve(swapTarget.getAddress(), ethers.MaxUint256);
        return swapTarget.mint(
            pool.getAddress(),
            recipient,
            index,
            tickLower,
            tickUpper,
            liquidity,
        );
    };
    const flash: FlashFunction = async (
        amount0,
        amount1,
        to,
        pay0?: bigint,
        pay1?: bigint,
    ) => {
        const fee = await pool.fee();
        if (typeof pay0 === "undefined") {
            pay0 = pay0 =
                (amount0 * fee + (10n ** 6n - 1n)) / 10n ** 6n + amount0;
        }
        if (typeof pay1 === "undefined") {
            pay1 = (amount1 * fee + (10n ** 6n - 1n)) / 10n ** 6n + amount1;
        }
        return swapTarget.flash(
            await pool.getAddress(),
            typeof to === "string" ? to : to.address,
            amount0,
            amount1,
            pay0,
            pay1,
        );
    };
    return {
        swapToLowerPrice,
        swapToHigherPrice,
        swapExact0For1,
        swap0ForExact1,
        swapExact1For0,
        swap1ForExact0,
        mint,
        flash,
    };
}

export interface MultiPoolFunctions {
    swapForExact0Multi: SwapFunction;
    swapForExact1Multi: SwapFunction;
}

export function createMultiPoolFunctions({
    inputToken,
    swapTarget,
    poolInput,
    poolOutput,
}: {
    inputToken: TestERC20;
    swapTarget: TestRamsesV3Router;
    poolInput: MockTimeRamsesV3Pool;
    poolOutput: MockTimeRamsesV3Pool;
}): MultiPoolFunctions {
    async function swapForExact0Multi(
        amountOut: bigint,
        to: Wallet | string,
    ): Promise<ContractTransactionResponse> {
        const method = swapTarget.swapForExact0Multi;
        await inputToken.approve(swapTarget.getAddress(), ethers.MaxUint256);
        const toAddress = typeof to === "string" ? to : to.getAddress();
        return method(
            toAddress,
            poolInput.getAddress(),
            poolOutput.getAddress(),
            amountOut,
        );
    }

    async function swapForExact1Multi(
        amountOut: bigint,
        to: Wallet | string,
    ): Promise<ContractTransactionResponse> {
        const method = swapTarget.swapForExact1Multi;
        await inputToken.approve(swapTarget.getAddress(), ethers.MaxUint256);
        const toAddress = typeof to === "string" ? to : to.getAddress();
        return method(
            toAddress,
            poolInput.getAddress(),
            poolOutput.getAddress(),
            amountOut,
        );
    }

    return {
        swapForExact0Multi,
        swapForExact1Multi,
    };
}

function divRoundingUp(a: bigint, b: bigint): bigint {
    let c = a / b;
    if (c * b < a) {
        c = c + 1n;
    }
    return c;
}

export function getAmount0Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean = false,
): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
        [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    const numerator1 = liquidity * 2n ** 96n;
    const numerator2 = sqrtRatioBX96 - sqrtRatioAX96;

    if (sqrtRatioAX96 == 0n) {
        throw new Error("sqrtRatioAX96 must be greater than 0");
    }

    return roundUp
        ? divRoundingUp(
              divRoundingUp(numerator1 * numerator2, sqrtRatioBX96),
              sqrtRatioAX96,
          )
        : (numerator1 * numerator2) / sqrtRatioBX96 / sqrtRatioAX96;
}

export function getAmount1Delta(
    sqrtRatioAX96: bigint,
    sqrtRatioBX96: bigint,
    liquidity: bigint,
    roundUp: boolean = false,
): bigint {
    if (sqrtRatioAX96 > sqrtRatioBX96) {
        [sqrtRatioAX96, sqrtRatioBX96] = [sqrtRatioBX96, sqrtRatioAX96];
    }

    const amountDelta = sqrtRatioBX96 - sqrtRatioAX96;

    return roundUp
        ? divRoundingUp(liquidity * amountDelta, 2n ** 96n)
        : (liquidity * amountDelta) / 2n ** 96n;
}

export function getMintAmounts(
    slot0: [bigint, number, number, number, number, number, boolean] & {
        sqrtPriceX96: bigint;
        tick: number;
        observationIndex: number;
        observationCardinality: number;
        observationCardinalityNext: number;
        feeProtocol: number;
        unlocked: boolean;
    },
    tickLower: bigint,
    tickUpper: bigint,
    liquidity: bigint,
): {
    amount0: bigint;
    amount1: bigint;
} {
    let amount0 = 0n;
    let amount1 = 0n;

    const _currentTick = slot0.tick;
    const _tickUpper = tickUpper;
    const _tickLower = tickLower;
    const _liquidity = liquidity;

    if (_currentTick < _tickLower) {
        amount0 = getAmount0Delta(
            getSqrtRatioAtTick(_tickLower),
            getSqrtRatioAtTick(_tickUpper),
            _liquidity,
            true,
        );
    } else if (_currentTick < _tickUpper) {
        amount0 = getAmount0Delta(
            slot0.sqrtPriceX96,
            getSqrtRatioAtTick(_tickUpper),
            _liquidity,
            true,
        );
        amount1 = getAmount1Delta(
            getSqrtRatioAtTick(_tickLower),
            slot0.sqrtPriceX96,
            _liquidity,
            true,
        );
    } else {
        amount1 = getAmount1Delta(
            getSqrtRatioAtTick(_tickLower),
            getSqrtRatioAtTick(_tickUpper),
            _liquidity,
            true,
        );
    }

    return { amount0, amount1 };
}

export function getSqrtRatioAtTick(tick: bigint): bigint {
    const _tick = new bn(tick.toString());
    const absTick = _tick.abs().toNumber();

    const MAX_TICK = 887272;
    if (absTick > MAX_TICK) {
        throw new Error("Tick is too large");
    }

    let ratio: bn =
        (absTick & 0x1) != 0
            ? new bn("0xfffcb933bd6fad37aa2d162d1a594001")
            : new bn("0x100000000000000000000000000000000");
    if ((absTick & 0x2) != 0)
        ratio = ratio
            .multipliedBy("0xfff97272373d413259a46990580e213a")
            .div(new bn(2).pow(128));
    if ((absTick & 0x4) != 0)
        ratio = ratio
            .multipliedBy("0xfff2e50f5f656932ef12357cf3c7fdcc")
            .div(new bn(2).pow(128));
    if ((absTick & 0x8) != 0)
        ratio = ratio
            .multipliedBy("0xffe5caca7e10e4e61c3624eaa0941cd0")
            .div(new bn(2).pow(128));
    if ((absTick & 0x10) != 0)
        ratio = ratio
            .multipliedBy("0xffcb9843d60f6159c9db58835c926644")
            .div(new bn(2).pow(128));
    if ((absTick & 0x20) != 0)
        ratio = ratio
            .multipliedBy("0xff973b41fa98c081472e6896dfb254c0")
            .div(new bn(2).pow(128));
    if ((absTick & 0x40) != 0)
        ratio = ratio
            .multipliedBy("0xff2ea16466c96a3843ec78b326b52861")
            .div(new bn(2).pow(128));
    if ((absTick & 0x80) != 0)
        ratio = ratio
            .multipliedBy("0xfe5dee046a99a2a811c461f1969c3053")
            .div(new bn(2).pow(128));
    if ((absTick & 0x100) != 0)
        ratio = ratio
            .multipliedBy("0xfcbe86c7900a88aedcffc83b479aa3a4")
            .div(new bn(2).pow(128));
    if ((absTick & 0x200) != 0)
        ratio = ratio
            .multipliedBy("0xf987a7253ac413176f2b074cf7815e54")
            .div(new bn(2).pow(128));
    if ((absTick & 0x400) != 0)
        ratio = ratio
            .multipliedBy("0xf3392b0822b70005940c7a398e4b70f3")
            .div(new bn(2).pow(128));
    if ((absTick & 0x800) != 0)
        ratio = ratio
            .multipliedBy("0xe7159475a2c29b7443b29c7fa6e889d9")
            .div(new bn(2).pow(128));
    if ((absTick & 0x1000) != 0)
        ratio = ratio
            .multipliedBy("0xd097f3bdfd2022b8845ad8f792aa5825")
            .div(new bn(2).pow(128));
    if ((absTick & 0x2000) != 0)
        ratio = ratio
            .multipliedBy("0xa9f746462d870fdf8a65dc1f90e061e5")
            .div(new bn(2).pow(128));
    if ((absTick & 0x4000) != 0)
        ratio = ratio
            .multipliedBy("0x70d869a156d2a1b890bb3df62baf32f7")
            .div(new bn(2).pow(128));
    if ((absTick & 0x8000) != 0)
        ratio = ratio
            .multipliedBy("0x31be135f97d08fd981231505542fcfa6")
            .div(new bn(2).pow(128));
    if ((absTick & 0x10000) != 0)
        ratio = ratio
            .multipliedBy("0x9aa508b5b7a84e1c677de54f3e99bc9")
            .div(new bn(2).pow(128));
    if ((absTick & 0x20000) != 0)
        ratio = ratio
            .multipliedBy("0x5d6af8dedb81196699c329225ee604")
            .div(new bn(2).pow(128));
    if ((absTick & 0x40000) != 0)
        ratio = ratio
            .multipliedBy("0x2216e584f5fa1ea926041bedfe98")
            .div(new bn(2).pow(128));
    if ((absTick & 0x80000) != 0)
        ratio = ratio
            .multipliedBy("0x48a170391f7dc42444e8fa2")
            .div(new bn(2).pow(128));

    if (_tick.gt(0)) ratio = new bn(ethers.MaxUint256.toString()).div(ratio);

    // this divides by 1<<32 rounding up to go from a Q128.128 to a Q128.96.
    // we then downcast because we know the result always fits within 160 bits due to our tick input constraint
    // we round up in the division so getTickAtSqrtRatio of the output price is always consistent
    const sqrtPriceX96 = ratio
        .div(new bn(2).pow(32))
        .plus(ratio.mod(new bn(2).pow(32)).gt(0) ? new bn(1) : new bn(0));

    console.log("sqrtPriceX96", sqrtPriceX96.toString());

    return BigInt(sqrtPriceX96.decimalPlaces(0).toString());
}
