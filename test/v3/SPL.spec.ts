import { ethers, network } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { testFixture } from "../../scripts/deployment/testFixture";
import { Voter } from "../../typechain-types";
import { expect } from "../uniswapV3CoreTests/shared/expect";
import { assert } from "chai";
import { MULTISIG, TICK_SPACINGS } from "../../scripts/deployment/constants";
import * as typechain from "../../typechain-types";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import {
    createPoolFunctions,
    encodePriceSqrt,
    getMaxTick,
    getMinTick,
    getSqrtRatioAtTick,
} from "../uniswapV3CoreTests/shared/utilities";
import { AddressLike } from "ethers";

const testStartTimestamp = Math.floor(new Date("2030-01-01").valueOf() / 1000);

describe("Audit", () => {
    let c: Awaited<ReturnType<typeof auditTestFixture>>;
    let voter: Voter;
    let wallet: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    const startPeriod: number = Math.floor(testStartTimestamp / 604800);
    const newPeriod: number = startPeriod + 1;
    const newPeriodTimestamp: number = newPeriod * 604800 - 1; //  ends at 604799
    const endPeriod: number = newPeriod + 1;
    const endPeriodTimestamp: number = endPeriod * 604800 - 1; //  ends at 604799
    const fixture = testFixture;

    async function auditTestFixture() {
        const suite = await loadFixture(fixture);
        [wallet, attacker] = await ethers.getSigners();

        // set pool fees to 0.25% so it's uniform
        await suite.pairFactory.setPairFee(suite.pair, 2500);

        // set protocol fees for cl to be 100% so it's easier to track fee changes
        await suite.factory.setFeeProtocol(100);
        await suite.factory.setPoolFeeProtocol(suite.clPool, 100);

        await suite.pairFactory.setFeeSplit(10000n);
        await suite.pairFactory.setPairFeeSplit(suite.pair, 10000n);

        // set fees to be 0.25% so it's uniform across legacy and cl
        await suite.factory.setFee(suite.clPool, 2500);
        await suite.pairFactory.setFee(25);

        const clPoolAddress = await suite.factory.createPool.staticCall(
            suite.dai.getAddress(),
            suite.mim.getAddress(),
            1,
            0n,
        );

        await suite.factory.createPool(
            suite.dai.getAddress(),
            suite.mim.getAddress(),
            1,
            0n,
        );

        const pool = await ethers.getContractAt("RamsesV3Pool", clPoolAddress);

        // start at 1:1, tick 0
        await pool.initialize(encodePriceSqrt(1n, 1n).toString());

        const swapTarget = await (
            await ethers.getContractFactory(
                "contracts/CL/core/test/TestRamsesV3Callee.sol:TestRamsesV3Callee",
            )
        ).deploy();

        const {
            swapToLowerPrice,
            swapToHigherPrice,
            swapExact0For1,
            swap0ForExact1,
            swapExact1For0,
            swap1ForExact0,
            mint,
            flash,
        } = createPoolFunctions({
            token0: suite.dai,
            token1: suite.mim,
            swapTarget: swapTarget,
            pool,
        });

        const minTick = getMinTick(50);
        const maxTick = getMaxTick(50);

        await mint(wallet.address, 0n, minTick, maxTick, 100n);
        // await ethers.provider.send("evm_setAutomine", [false]);

        return {
            ...suite,
            minTick,
            maxTick,
            pool,
            swapTarget,
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

    describe("#audit", () => {
        beforeEach("initialize the pool at price of 10:1", async () => {
            c = await loadFixture(auditTestFixture);
            voter = c.voter;
            [wallet, attacker] = await ethers.getSigners();
        });

        it("Normal scenario", async () => {
            // starting condition: tick:0, position at tick:[-1,1]
            // swap to tick 2 at t=2
            // swap to tick 0 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 4/2=2 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            await helpers.time.increaseTo(newPeriodTimestamp);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 2 at t=2
            await helpers.time.increaseTo(newPeriodTimestamp + 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(2n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 2").eq(2n);

            // swap to tick 0 at t=end-2
            await helpers.time.increaseTo(endPeriodTimestamp - 2);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(0n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.increaseTo(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            // seconds in range should be 4/2=2 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately((4n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("Normal scenario but burned while in range", async () => {
            // starting condition: tick:0, position at tick:[-1,1]
            // burn position at t=2
            // fast-forward to end of period
            // seconds in range should be 4/2=2 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            await helpers.time.increaseTo(newPeriodTimestamp);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // burn position at t=2
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 2);
            await c.pool.burn(0, -1, 1, 100n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.increaseTo(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            // seconds in range should be 4/2=2 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately((2n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("Normal scenario but burned and after being out of range", async () => {
            // starting condition: tick:0, position at tick:[-1,1]
            // swap to tick 2 at t=2
            // burn position
            // fast-forward to end of period
            // seconds in range should be 4/2=2 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            await helpers.time.increaseTo(newPeriodTimestamp);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 2 at t=2
            await helpers.time.increaseTo(newPeriodTimestamp + 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(2n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 2").eq(2n);
            await c.pool.burn(0, -1, 1, 100n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.increaseTo(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            // seconds in range should be 4/2=2 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately((2n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("Normal scenario but burned and after being out of range then cross back in range but liq = 0", async () => {
            // starting condition: tick:0, position at tick:[-1,1]
            // swap to tick 2 at t=2
            // burn position
            // swap to tick 0 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 4/2=2 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            await helpers.time.increaseTo(newPeriodTimestamp);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 2 at t=2
            await helpers.time.increaseTo(newPeriodTimestamp + 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(2n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 2").eq(2n);
            await c.pool.burn(0, -1, 1, 100n);

            // swap to tick 0 at t=end-2
            await helpers.time.increaseTo(endPeriodTimestamp - 2);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(0n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.increaseTo(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            // seconds in range should be 4/2=2 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately((2n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("Normal scenario but burned while in range then crossed lower", async () => {
            // starting condition: tick:0, position at tick:[-1,1]
            // swap to tick 2 at t=2
            // burn the position
            // swap to tick -2 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 4/2=2 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            await helpers.time.increaseTo(newPeriodTimestamp);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 2 at t=2
            await helpers.time.increaseTo(newPeriodTimestamp + 2);
            await c.pool.burn(0, -1, 1, 100n);

            // swap to tick -2
            await helpers.time.increaseTo(endPeriodTimestamp - 2);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.increaseTo(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            // seconds in range should be 4/2=2 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately((2n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("Mint above and below starting tick, out of current range", async () => {
            // starting condition: tick:0, no position
            // swap to tick 2 at t=2
            // mint position at [-1,1] (out of range, but above and below starting tick)
            // swap to tick 0 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 2/2=1 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp);
            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 100n);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 2 at t=2
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(2n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 2").eq(2n);

            await c.mint(wallet.address, 0n, -1, 1, 100n);
            await helpers.mine();

            // swap to tick 0 at t=end-2
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp - 2);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(0n) + 1n, // add 1 for rounding to tick 0
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            console.log("mint");
            await c.mint(wallet.address, 0n, 60, 120, 100n);
            console.log("minted");

            console.log("final");
            // seconds in range should be 2/2=1 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately(1n * 2n ** 96n, 1n); // using approximate due to rounding
        });

        it("Mint fully above starting tick, out of current range", async () => {
            // starting condition: tick:0, no position
            // swap to tick 5 at t=2
            // mint position at [2,4] (out of range, but fully above starting tick)
            // swap to tick 3 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 2/2=1 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp);
            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 100n);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick 5 at t=2
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(5n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 5").eq(5n);

            await c.mint(wallet.address, 0n, 2, 4, 100n);
            await helpers.mine();

            // swap to tick 0 at t=end-2
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp - 2);
            await c.swapToLowerPrice(getSqrtRatioAtTick(3n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 3").eq(3n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 100n);

            console.log("final");
            // seconds in range should be 2/2=1 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                2,
                4,
            );
            expect(secondsInRangeX96).approximately(1n * 2n ** 96n, 1n); // using approximate due to rounding
        });

        it("Mint fully below starting tick, out of current range", async () => {
            // starting condition: tick:0, no position
            // swap to tick -5 at t=2
            // mint position at [-2,-4] (out of range, but fully above starting tick)
            // swap to tick -3 at t=end-2
            // fast-forward to end of period
            // seconds in range should be 2/2=1 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp);
            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 100n);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // swap to tick -5 at t=2
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 2);
            await c.swapToLowerPrice(getSqrtRatioAtTick(-5n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not -5").eq(-5n);

            await c.mint(wallet.address, 0n, -4, -2, 100n);
            await helpers.mine();

            // swap to tick -3 at t=end-2
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp - 2);
            await c.swapToHigherPrice(getSqrtRatioAtTick(-3n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not -3").eq(-3n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            console.log("mint");
            await c.mint(wallet.address, 0n, 60, 120, 100n);
            console.log("minted");

            console.log("final");
            // seconds in range should be 2/2=1 seconds
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -4,
                -2,
            );
            expect(secondsInRangeX96).approximately(1n * 2n ** 96n, 1n); // using approximate due to rounding
        });

        it("Old Position should still have rewards", async () => {
            // corresponds to "SPL underflow" from the audit

            // starting condition: tick:0, position at [-2,0]
            // swap to tick -2 at t=1
            // swap to tick 0 at t=2
            // burn the position
            // swap to tick -3
            // fast-forward to t=end-1
            // mint a small position to update SPL
            // fast-forward to end of period
            // seconds in range should be 2/2=1 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);

            await c.mint(wallet.address, 0n, -1, 1, 100n);

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            // make some swaps to advance period
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 1);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);
            await c.swapToHigherPrice(
                getSqrtRatioAtTick(0n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            // make some swaps to advance period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);
            await c.swapToHigherPrice(
                getSqrtRatioAtTick(0n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            // make some swaps to advance period
            await helpers.time.setNextBlockTimestamp(
                endPeriodTimestamp + 604800 + 1,
            );
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);
            await c.swapToHigherPrice(
                getSqrtRatioAtTick(0n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //If you console.log the secondsInside previous to the sanity check, it returns a huge number
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                endPeriod,
                wallet.address,
                0n,
                -1,
                1,
            );
            expect(secondsInRangeX96).approximately(
                (604800n * 2n ** 96n) / 2n,
                1n,
            ); // using approximate due to rounding
        });

        it("SPL underflow", async () => {
            // corresponds to "SPL underflow" from the audit

            // starting condition: tick:0, position at [-2,0]
            // swap to tick -2 at t=1
            // swap to tick 0 at t=2
            // burn the position
            // swap to tick -3
            // fast-forward to t=end-1
            // mint a small position to update SPL
            // fast-forward to end of period
            // seconds in range should be 1/2=0.5 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);

            await c.mint(wallet.address, 0n, -2, 0, 100n);
            console.log(await c.pool.liquidity());

            console.log(
                "-------------------------------TEST START-----------------------",
            );

            //In this test we are trying to create an underflow in periodCumulativesInside to register no debt while minting at the end of the period, but at the same time register a huge SPL.
            //To do so we manipulate the ticks outside crossing the lowerTick twice with one second between crosses to register a higher outside SPL value in the upper than in the lower
            //We then burn the position and swap so that the currentTick is higher than tickUpper, calculating the periodCumulativesInside as Upper - Lower, which will underflow

            //Swap to record tickUpper's SPL outside as Cumulative SPL - lastPeriod end SPL, resulting in a really small value
            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 1);

            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);

            //1 second to increase the SPL inside
            await helpers.time.increase(1);

            //Swap to record new Cumulative SPL - (previousCumulativeSPL - lastPeriod end SPL)
            //this results in a higher value than the lastPeriod end SPL
            await c.swapToHigherPrice(getSqrtRatioAtTick(0n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //We burn the position clearing the ticks of liquidity, which makes ticks not record crosses
            await c.pool.burn(0, -2, 0, 100n);

            //We swap to a tick under tick lower
            await c.swapToLowerPrice(getSqrtRatioAtTick(-3n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not -3").eq(-3n);

            //We advance the time to one second before finishing the period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp - 1);

            //When we mint, its going to calculate the SPL cumulative inside as the lowerTick's SPL outside - the upperTick's SPL outside
            //This causes an underflow of a uint160 in an unchecked block
            await c.mint(wallet.address, 0n, -2, 0, 1n);
            //However, the uint160 is used in update, and it is casted to int160, overflowing the cast and resulting in a really large negative number as secondsPerLiquidityPeriodIntX128

            //We advance the time to be sure that we are on the next period
            // await c.pool.advanceTime(1);
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            //If you console.log the secondsInside previous to the sanity check, it returns a huge number
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -2,
                0,
            );
            expect(secondsInRangeX96).approximately((1n * 2n ** 96n) / 2n, 1n); // using approximate due to rounding
        });

        it("No rewards for a position that has been in range", async () => {
            // corresponds to "No rewards for a position that has been in range" from the audit

            // starting condition: tick:0, position at [-2,0]
            // swap to tick -2 at t=1, to register a small SPL
            // swap to tick 0 at t=half
            // burn the position
            // swap to tick -3
            // mint position again
            // swap to tick -2
            // fast-forward to end of period
            // seconds in range should be 604799/2=302399 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);

            await c.mint(wallet.address, 0n, -2, 0, 100n);

            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 1);

            console.log(
                "-------------------------------TEST START-----------------------",
            );
            //Swap to record tickUpper's SPL outside as Cumulative SPL - lastPeriod end SPL, resulting in a really small value
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);

            await helpers.time.increase(604800 / 2);

            //Swap to record new Cumulative SPL - (previousCumulativeSPL - lastPeriod end SPL)
            await c.swapToHigherPrice(getSqrtRatioAtTick(0n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

            //We burn the position clearing the ticks of liquidity, which makes ticks not record crosses
            await c.pool.burn(0, -2, 0, 100n);

            //We swap to a tick under tick lower
            await c.swapToLowerPrice(getSqrtRatioAtTick(-3n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not -3").eq(-3n);

            //When we mint, its going to calculate the SPL cumulative inside as the lowerTick's SPL outside - the upperTick's SPL outside
            //This causes an underflow of a uint160 in an unchecked block
            await c.mint(wallet.address, 0n, -2, 0, 100n);
            //We swap back so that the position is in range
            await c.swapToHigherPrice(getSqrtRatioAtTick(-2n), wallet.address);
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);

            //We advance the time to be sure that we are on the next period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            //The position has been in range for most of the period, and returns 0 seconds in range
            console.log("final");
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -2,
                0,
            );
            expect(secondsInRangeX96).approximately(
                (604799n * 2n ** 96n) / 2n,
                1n,
            ); // using approximate due to rounding
        });

        it("Repeatedly mint and burn", async () => {
            // corresponds to "No rewards for a position that has been in range" from the audit

            // starting condition: tick:0, position at [-2,0]
            // swap to tick -2 at t=1, to register a small SPL
            // loop start, for 10 loops
            // swap to tick 0 at t=i*1000
            // burn the position
            // swap to tick -3
            // mint position again
            // swap to tick -2
            // loop end
            // fast-forward to end of period
            // seconds in range should be 604790/2=302395 seconds
            // (divided by two because it only has half the liquidity when it's in range,
            // the other half is from the full range position)

            console.log("Current period", newPeriod); //timestamp
            console.log("newPeriodTimestamp", newPeriodTimestamp);

            await c.mint(wallet.address, 0n, -2, 0, 100n);

            await helpers.time.setNextBlockTimestamp(newPeriodTimestamp + 1);

            console.log(
                "-------------------------------TEST START-----------------------",
            );
            //Swap to record tickUpper's SPL outside as Cumulative SPL - lastPeriod end SPL, resulting in a really small value
            await c.swapToLowerPrice(
                getSqrtRatioAtTick(-2n) + 1n,
                wallet.address,
            );
            expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);

            for (let i = 0; i < 10; i++) {
                await helpers.time.increase(1000);

                //Swap to record new Cumulative SPL - (previousCumulativeSPL - lastPeriod end SPL)
                await c.swapToHigherPrice(
                    getSqrtRatioAtTick(0n),
                    wallet.address,
                );
                expect((await c.pool.slot0())[1], "tick is not 0").eq(0n);

                //We burn the position clearing the ticks of liquidity, which makes ticks not record crosses
                await c.pool.burn(0, -2, 0, 100n);

                //We swap to a tick under tick lower
                await c.swapToLowerPrice(
                    getSqrtRatioAtTick(-3n),
                    wallet.address,
                );
                expect((await c.pool.slot0())[1], "tick is not -3").eq(-3n);

                //When we mint, its going to calculate the SPL cumulative inside as the lowerTick's SPL outside - the upperTick's SPL outside
                //This causes an underflow of a uint160 in an unchecked block
                await c.mint(wallet.address, 0n, -2, 0, 100n);
                //We swap back so that the position is in range
                await c.swapToHigherPrice(
                    getSqrtRatioAtTick(-2n),
                    wallet.address,
                );
                expect((await c.pool.slot0())[1], "tick is not -2").eq(-2n);
            }

            //We advance the time to be sure that we are on the next period
            await helpers.time.setNextBlockTimestamp(endPeriodTimestamp + 1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            //The position has been in range for most of the period, and returns 0 seconds in range
            console.log("final");
            const secondsInRangeX96 = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -2,
                0,
            );
            expect(secondsInRangeX96).approximately(
                (604799n * 2n ** 96n) / 2n,
                1n,
            ); // using approximate due to rounding
        });
    });
});
