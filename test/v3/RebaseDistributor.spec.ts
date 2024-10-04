import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { testFixture } from "../../scripts/deployment/testFixture";
import { Voter } from "../../typechain-types";
import { expect } from "../uniswapV3CoreTests/shared/expect";
import { assert } from "chai";
import { MULTISIG, TICK_SPACINGS } from "../../scripts/deployment/constants";
import * as typechain from "../../typechain-types";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { getMaxTick, getMinTick } from "../uniswapV3CoreTests/shared/utilities";
import { AddressLike } from "ethers";

describe("RebaseDistributor", () => {
    let c: Awaited<ReturnType<typeof testFixture>>;
    let voter: Voter;
    let ve: typechain.VotingEscrow;
    let tokenId: bigint;
    let distributor: typechain.RebaseDistributor;
    let deployer: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    const fixture = testFixture;

    async function rebaseDistributorTestFixture() {
        const suite = await loadFixture(fixture);

        // set protocol fees for cl to be 100% so it's easier to track fee changes
        await suite.factory.setFeeProtocol(100);
        await suite.factory.setPoolFeeProtocol(suite.clPool, 100);

        // set fees to be 0.25% so it's uniform across legacy and cl
        await suite.factory.setFee(suite.clPool, 2500);
        return suite;
    }

    async function calculateRebase(): Promise<bigint> {
        const weeklyEmissions = await c.minter.weeklyEmissions();
        const rebase = await c.minter.calculateRebase(weeklyEmissions);
        return rebase;
    }

    beforeEach("deploy fixture", async () => {
        c = await loadFixture(rebaseDistributorTestFixture);
        voter = c.voter;
        ve = c.votingEscrow;
        distributor = c.rebaseDistributor;

        tokenId = c.tokenId;
        [deployer, attacker] = await ethers.getSigners();
    });

    describe("#initial states", () => {
        it("initial states", async () => {
            expect(await distributor.voter(), "voter address not right").equal(
                await voter.getAddress(),
            );
            expect(
                await distributor.votingEscrow(),
                "votingEscrow address not right",
            ).equal(await ve.getAddress());
            expect(
                await distributor.emissionsToken(),
                "emissionsToken address not right",
            ).equal(await c.emissionsToken.getAddress());
            expect(
                await distributor.firstPeriod(),
                "firstPeriod address not right",
            ).equal(await voter.getPeriod());
            expect(
                await c.emissionsToken.allowance(distributor, ve),
                "emissions token allowance not right",
            ).equal(ethers.MaxUint256);
        });
    });

    describe("#_deposit", () => {
        it("normal operation", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);

            const period = (await voter.getPeriod()) + 1n;
            const votingPower = await ve.votingPower(tokenId);

            expect(
                await distributor.balanceOf(tokenId),
                "balanceOf not right",
            ).equal(votingPower);

            expect(
                await distributor.userVotingPower(period, tokenId),
                "userVotingPower not right",
            ).equal(votingPower);

            expect(
                await distributor.votingPower(period),
                "votingPower not right",
            ).equal(votingPower);
        });

        it("past votes shouldn't be changeable", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);

            const period = (await voter.getPeriod()) + 1n;
            const votingPower = await ve.votingPower(tokenId);

            // advance period and vote for another pool
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await voter.vote(tokenId, [c.clPool], [1]);

            expect(
                await distributor.userVotingPower(period, tokenId),
                "userVotingPower not right",
            ).equal(votingPower);

            expect(
                await distributor.votingPower(period),
                "votingPower not right",
            ).equal(votingPower);
        });
    });

    describe("#_withdraw", () => {
        it("normal operation", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);

            // reset votes to trigger withdraw
            await voter.reset(tokenId);

            const period = (await voter.getPeriod()) + 1n;

            expect(
                await distributor.balanceOf(tokenId),
                "balanceOf not right",
            ).equal(0n);

            expect(
                await distributor.userVotingPower(period, tokenId),
                "userVotingPower not right",
            ).equal(0n);

            expect(
                await distributor.votingPower(period),
                "votingPower not right",
            ).equal(0n);
        });

        it("past votes shouldn't be changeable", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);

            const period = (await voter.getPeriod()) + 1n;
            const votingPower = await ve.votingPower(tokenId);

            // advance period and reset
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await voter.reset(tokenId);

            expect(
                await distributor.userVotingPower(period, tokenId),
                "userVotingPower not right",
            ).equal(votingPower);

            expect(
                await distributor.votingPower(period),
                "votingPower not right",
            ).equal(votingPower);
        });
    });

    describe("#claimRebase", () => {
        beforeEach("get votes in", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
        });

        it("normal operation", async () => {
            const rebase = await calculateRebase();
            const votingPowerBefore = await ve.votingPower(tokenId);
            const period = await voter.getPeriod();

            await distributor.claimRebase(tokenId);

            assert(rebase > 0n, "no rebase available");
            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase wasn't distributed",
            ).equal(rebase);
            expect(
                await distributor.userClaimed(period, tokenId),
                "claimed rebase wasn't recorded",
            ).equal(rebase);
            expect(
                await distributor.lastClaim(tokenId),
                "lastClaim wasn't recorded",
            ).equal(period);
        });

        it("normal operation - multiple weeks worth", async () => {
            const votingPowerBefore = await ve.votingPower(tokenId);
            let rebase = await calculateRebase();

            // vote and calculate expected rebase for a few weeks
            for (let i = 0; i < 5; i++) {
                await voter.vote(tokenId, [c.pair], [1]);
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
                rebase += await calculateRebase();
            }

            await distributor.claimRebase(tokenId);

            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase amount wasn't correct",
            ).equal(rebase);
        });

        it("shouldn't get anything if already claimed", async () => {
            // claim
            await distributor.claimRebase(tokenId);

            // record voting power after already claimed
            const votingPowerBefore = await ve.votingPower(tokenId);

            // claim again
            await distributor.claimRebase(tokenId);

            expect(
                await ve.votingPower(tokenId),
                "rebase should be 0 after claiming",
            ).equal(votingPowerBefore);
        });

        it("future periods shouldn't be affected", async () => {
            // claim
            await distributor.claimRebase(tokenId);

            // get vote for next week
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            const rebase = await calculateRebase();

            // record voting power before claiming next week
            const votingPowerBefore = await ve.votingPower(tokenId);

            // claim again
            await distributor.claimRebase(tokenId);

            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase amount wasn't correct",
            ).equal(rebase);
        });

        it("should be able to claim more if notify is called again", async () => {
            // claim
            await distributor.claimRebase(tokenId);

            // record voting power after claiming
            const votingPowerBefore = await ve.votingPower(tokenId);

            // notify more rebase
            const rebase = ethers.parseEther("1000");
            await c.emissionsToken.approve(distributor, ethers.MaxUint256);
            await distributor.notifyRewardAmount(rebase);

            // claim again
            await distributor.claimRebase(tokenId);

            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase amount wasn't correct",
            ).equal(rebase);
        });
    });

    describe("#claimPeriodRebase", () => {
        beforeEach("get votes in", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
        });

        it("normal operation", async () => {
            const rebase = await calculateRebase();
            const votingPowerBefore = await ve.votingPower(tokenId);
            const period = await voter.getPeriod();

            await distributor.claimPeriodRebase(tokenId, period);

            assert(rebase > 0n, "no rebase available");
            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase wasn't distributed",
            ).equal(rebase);
            expect(
                await distributor.userClaimed(period, tokenId),
                "claimed rebase wasn't recorded",
            ).equal(rebase);
            expect(
                await distributor.lastClaim(tokenId),
                "lastClaim wasn't recorded",
            ).equal(period - 1n);
        });

        it("shouldn't get anything if already claimed", async () => {
            const period = await voter.getPeriod();

            // claim
            await distributor.claimPeriodRebase(tokenId, period);

            // record voting power after already claimed
            const votingPowerBefore = await ve.votingPower(tokenId);

            // claim again
            await distributor.claimPeriodRebase(tokenId, period);

            expect(
                await ve.votingPower(tokenId),
                "rebase should be 0 after claiming",
            ).equal(votingPowerBefore);
        });

        it("future periods shouldn't be claimed", async () => {
            const period = (await voter.getPeriod()) + 1n;
            // claim
            await expect(
                distributor.claimPeriodRebase(tokenId, period),
            ).to.be.revertedWithCustomError(distributor, "VoteNotFinalized");
        });

        it("should be able to claim more if notify is called again", async () => {
            const period = await voter.getPeriod();

            // claim
            await distributor.claimPeriodRebase(tokenId, period);

            // record voting power after claiming
            const votingPowerBefore = await ve.votingPower(tokenId);

            // notify more rebase
            const rebase = ethers.parseEther("1000");
            await c.emissionsToken.approve(distributor, ethers.MaxUint256);
            await distributor.notifyRewardAmount(rebase);

            // claim again
            await distributor.claimPeriodRebase(tokenId, period);

            expect(
                (await ve.votingPower(tokenId)) - votingPowerBefore,
                "rebase amount wasn't correct",
            ).equal(rebase);
        });
    });

    describe("#earned", () => {
        beforeEach("get votes in", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
        });

        it("normal operation", async () => {
            const rebase = await calculateRebase();

            const earned = await distributor.earned(tokenId);

            assert(rebase > 0n, "no rebase available");
            expect(earned, "earned amount not correct").equal(rebase);
        });

        it("normal operation - multiple weeks worth", async () => {
            let rebase = await calculateRebase();

            // vote and calculate expected rebase for a few weeks
            for (let i = 0; i < 5; i++) {
                await voter.vote(tokenId, [c.pair], [1]);
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
                rebase += await calculateRebase();
            }

            const earned = await distributor.earned(tokenId);

            expect(earned, "earned amount wasn't correct").equal(rebase);
        });

        it("after claiming", async () => {
            // claim
            await distributor.claimRebase(tokenId);

            expect(
                await distributor.earned(tokenId),
                "earned should be 0 after claiming",
            ).equal(0n);
        });

        it("after claiming and notify is called again", async () => {
            // claim
            await distributor.claimRebase(tokenId);

            // notify more rebase
            const rebase = ethers.parseEther("1000");
            await c.emissionsToken.approve(distributor, ethers.MaxUint256);
            await distributor.notifyRewardAmount(rebase);

            expect(
                await distributor.earned(tokenId),
                "earned amount wasn't correct",
            ).equal(rebase);
        });
    });

    describe("#notifyRewardAmount", () => {
        it("normal operation", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);

            // update period should get rebases to the distributor
            await c.minter.updatePeriod();
            const rebase = await calculateRebase();
            const period = await voter.getPeriod();

            expect(
                await distributor.rewardSupply(period),
                "rewardSupply amount not correct",
            ).equal(rebase);
        });

        it("notified twice", async () => {
            // get votes in first
            await voter.vote(tokenId, [c.pair], [1]);
            await helpers.time.increase(86400 * 7);

            // update period should get rebases to the distributor
            await c.minter.updatePeriod();
            let rebase = await calculateRebase();
            const period = await voter.getPeriod();

            // notify more rebase
            const addedRebase = ethers.parseEther("1000");
            rebase += addedRebase;
            await c.emissionsToken.approve(distributor, ethers.MaxUint256);
            await distributor.notifyRewardAmount(addedRebase);

            expect(
                await distributor.rewardSupply(period),
                "rewardSupply amount not correct",
            ).equal(rebase);
        });

        it("notified for a week without votes", async () => {
            // the rebase is pushed one week into the future if there are no votes for the week
            // (this is only expected at the start of a new deployment)
            // since that week is in the future we don't know if there will be votes by the time it's finished or not
            // if that subsequent week also has no votes then there are bigger problems to the protocol than this

            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            let rebase = await calculateRebase();
            const period = await voter.getPeriod();

            expect(
                await distributor.rewardSupply(period),
                "week without votes shouldn't have rebases",
            ).equal(0n);
            expect(
                await distributor.rewardSupply(period + 1n),
                "rebases should've been pushed 1 week into the future",
            ).equal(rebase);
        });
    });
});
