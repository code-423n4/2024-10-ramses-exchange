import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
    MockTimeRamsesV3Pool,
    TestERC20,
    TestRamsesV3Callee,
    TestRamsesV3Router,
    RamsesV3Factory,
} from "../../typechain-types";
import { expect } from "./shared/expect";

import { poolFixture } from "./shared/fixtures";

import {
    FeeAmount,
    TICK_SPACINGS,
    createPoolFunctions,
    PoolFunctions,
    createMultiPoolFunctions,
    encodePriceSqrt,
    getMinTick,
    getMaxTick,
    expandTo18Decimals,
} from "./shared/utilities";
const feeAmount = FeeAmount.MEDIUM;
const tickSpacing = TICK_SPACINGS[feeAmount];

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

describe("RamsesV3Pool", () => {
    let wallet: Wallet, other: Wallet;

    let token0: TestERC20;
    let token1: TestERC20;
    let token2: TestERC20;
    let factory: RamsesV3Factory;
    let pool0: MockTimeRamsesV3Pool;
    let pool1: MockTimeRamsesV3Pool;

    let pool0Functions: PoolFunctions;
    let pool1Functions: PoolFunctions;

    let minTick: number;
    let maxTick: number;

    let swapTargetCallee: TestRamsesV3Callee;
    let swapTargetRouter: TestRamsesV3Router;

    let createPool: ThenArg<ReturnType<typeof poolFixture>>["createPool"];

    before("create fixture loader", async () => {
        [wallet, other] = await (ethers as any).getSigners();
    });

    beforeEach("deploy first fixture", async () => {
        ({
            token0,
            token1,
            token2,
            factory,
            createPool,
            swapTargetCallee,
            swapTargetRouter,
        } = await loadFixture(poolFixture));

        const createPoolWrapped = async (
            amount: number,
            spacing: number,
            firstToken: TestERC20,
            secondToken: TestERC20,
        ): Promise<[MockTimeRamsesV3Pool, any]> => {
            const pool = await createPool(spacing, 0n, firstToken, secondToken);
            await pool._setFee(amount);
            const poolFunctions = createPoolFunctions({
                swapTarget: swapTargetCallee,
                token0: firstToken,
                token1: secondToken,
                pool,
            });
            minTick = getMinTick(spacing);
            maxTick = getMaxTick(spacing);
            return [pool, poolFunctions];
        };

        // default to the 30 bips pool
        [pool0, pool0Functions] = await createPoolWrapped(
            feeAmount,
            tickSpacing,
            token0,
            token1,
        );
        [pool1, pool1Functions] = await createPoolWrapped(
            feeAmount,
            tickSpacing,
            token1,
            token2,
        );
    });

    it("constructor initializes immutables", async () => {
        expect(await pool0.factory()).to.eq(await factory.getAddress());
        expect(await pool0.token0()).to.eq(await token0.getAddress());
        expect(await pool0.token1()).to.eq(await token1.getAddress());
        expect(await pool1.factory()).to.eq(await factory.getAddress());
        expect(await pool1.token0()).to.eq(await token1.getAddress());
        expect(await pool1.token1()).to.eq(await token2.getAddress());
    });

    describe("multi-swaps", () => {
        let inputToken: TestERC20;
        let outputToken: TestERC20;

        beforeEach("initialize both pools", async () => {
            inputToken = token0;
            outputToken = token2;

            await pool0.initialize(encodePriceSqrt(1n, 1n).toString());
            await pool1.initialize(encodePriceSqrt(1n, 1n).toString());

            await pool0Functions.mint(
                wallet.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
            await pool1Functions.mint(
                wallet.address,
                0n,
                minTick,
                maxTick,
                expandTo18Decimals(1n),
            );
        });

        it("multi-swap", async () => {
            const token0OfPoolOutput = await pool1.token0();
            const ForExact0 =
                (await outputToken.getAddress()) === token0OfPoolOutput;

            const { swapForExact0Multi, swapForExact1Multi } =
                createMultiPoolFunctions({
                    inputToken: token0,
                    swapTarget: swapTargetRouter,
                    poolInput: pool0,
                    poolOutput: pool1,
                });

            const method = ForExact0 ? swapForExact0Multi : swapForExact1Multi;

            await expect(method(100n, wallet.address))
                .to.emit(outputToken, "Transfer")
                .withArgs(await pool1.getAddress(), wallet.address, 100)
                .to.emit(token1, "Transfer")
                .withArgs(
                    await pool0.getAddress(),
                    await pool1.getAddress(),
                    102,
                )
                .to.emit(inputToken, "Transfer")
                .withArgs(wallet.address, await pool0.getAddress(), 104);
        });
    });
});
