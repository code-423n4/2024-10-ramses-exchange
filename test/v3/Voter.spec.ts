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

describe("Voter", () => {
    let c: Awaited<ReturnType<typeof testFixture>>;
    let voter: Voter;
    let deployer: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    const fixture = testFixture;

    async function voterTestFixture() {
        const suite = await loadFixture(fixture);

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
        return suite;
    }

    async function createMorePools() {
        const pairAddress = await c.pairFactory.createPair.staticCall(
            await c.usdc.getAddress(),
            await c.dai.getAddress(),
            true,
        );
        await c.pairFactory.createPair(
            await c.usdc.getAddress(),
            await c.dai.getAddress(),
            true,
        );

        const pair = await ethers.getContractAt("Pair", pairAddress);

        const clPoolAddress = await c.factory.createPool.staticCall(
            c.usdc.getAddress(),
            c.dai.getAddress(),
            TICK_SPACINGS.STABLE,
            2n ** 96n,
        );
        await c.factory.createPool(
            c.usdc.getAddress(),
            c.dai.getAddress(),
            TICK_SPACINGS.STABLE,
            2n ** 96n,
        );
        const clPool = await ethers.getContractAt(
            "RamsesV3Pool",
            clPoolAddress,
        );

        await c.pairFactory.setPairFee(pair, 2500);
        await c.factory.setFee(clPool, 2500);

        return { pair, clPool };
    }

    async function createGauge(pairAddress: string): Promise<typechain.Gauge> {
        const gaugeAddress = await voter.createGauge.staticCall(pairAddress);
        await voter.createGauge(pairAddress);
        const gauge = await ethers.getContractAt("Gauge", gaugeAddress);
        return gauge;
    }

    async function createClGauge(
        poolAddress: string,
    ): Promise<typechain.GaugeV3> {
        const pool = await ethers.getContractAt("RamsesV3Pool", poolAddress);
        const token0 = await pool.token0();
        const token1 = await pool.token1();
        const tickSpacing = await pool.tickSpacing();
        const gaugeAddress = await voter.createCLGauge.staticCall(
            token0,
            token1,
            tickSpacing,
        );
        await voter.createCLGauge(token0, token1, tickSpacing);
        const gauge = await ethers.getContractAt("GaugeV3", gaugeAddress);
        return gauge;
    }

    async function washtradeForFees(
        token0: AddressLike,
        token1: AddressLike,
        legacy = false,
    ) {
        if (legacy) {
            await c.router.swapExactTokensForTokens(
                ethers.parseEther("100"),
                0n,
                [{ from: token0, to: token1, stable: true }],
                deployer.address,
                ethers.MaxUint256,
            );
            await c.router.swapExactTokensForTokens(
                ethers.parseEther("100"),
                0n,
                [{ from: token1, to: token0, stable: true }],
                deployer.address,
                ethers.MaxUint256,
            );
        } else {
            // make trades on the pairs to generate fees
            await c.swapRouter.exactInputSingle({
                tokenIn: token0,
                tokenOut: token1,
                fee: TICK_SPACINGS.STABLE,
                recipient: deployer.address,
                deadline: ethers.MaxUint256,
                amountIn: ethers.parseEther("100"),
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
            });
            await c.swapRouter.exactInputSingle({
                tokenIn: token1,
                tokenOut: token0,
                fee: TICK_SPACINGS.STABLE,
                recipient: deployer.address,
                deadline: ethers.MaxUint256,
                amountIn: ethers.parseEther("100"),
                amountOutMinimum: 0n,
                sqrtPriceLimitX96: 0n,
            });
        }
    }

    async function createArbitraryGauge() {
        const Token = await ethers.getContractFactory(
            "contracts/CL/periphery/test/TestERC20.sol:TestERC20",
        );
        const token = await Token.deploy(ethers.parseEther("1000000"));
        const customGaugeAddress = await voter.createArbitraryGauge.staticCall(
            token.getAddress(),
        );

        await voter.createArbitraryGauge(token.getAddress());
        const customGauge = await ethers.getContractAt(
            "Gauge",
            customGaugeAddress,
        );

        return { token, customGauge };
    }

    async function batchGaugesFixture() {
        const Token = await ethers.getContractFactory(
            "contracts/CL/periphery/test/TestERC20.sol:TestERC20",
        );
        const weights: bigint[] = [];
        for (let i = 0; i < 100; i++) {
            const tokenA = await Token.deploy(ethers.parseEther("1000000"));
            const tokenB = await Token.deploy(ethers.parseEther("1000000"));
            const pairAddress = await c.pairFactory.createPair.staticCall(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                true,
            );
            await c.pairFactory.createPair(
                await tokenA.getAddress(),
                await tokenB.getAddress(),
                true,
            );
            await voter.createGauge(pairAddress);
        }
        const normalPools = await voter.getAllPools();
        const customPools = await voter.getAllCustomPools();
        const pools = [...normalPools, ...customPools];

        pools.forEach((token) => {
            weights.push(1n);
        });

        await voter.vote(c.tokenId, pools, weights);
        await helpers.time.increase(86400 * 7);
        await c.minter.updatePeriod();
    }

    beforeEach("deploy fixture", async () => {
        c = await loadFixture(voterTestFixture);
        voter = c.voter;
        [deployer, attacker] = await ethers.getSigners();
    });

    describe("#initialization", () => {
        it("initialization", async () => {
            await expect(
                voter.initialize(
                    {
                        _emissionsToken: ethers.ZeroAddress,
                        _legacyFactory: ethers.ZeroAddress,
                        _gauges: ethers.ZeroAddress,
                        _feeDistributorFactory: ethers.ZeroAddress,
                        _minter: ethers.ZeroAddress,
                        _msig: ethers.ZeroAddress,
                        _clFactory: ethers.ZeroAddress,
                        _clGaugeFactory: ethers.ZeroAddress,
                        _nfpManager: ethers.ZeroAddress,
                        _pairFeeFactory: ethers.ZeroAddress,
                        _accessManager: ethers.ZeroAddress,
                        _votingEscrow: ethers.ZeroAddress,
                        _rebaseDistributor: ethers.ZeroAddress,
                    },
                    [],
                ),
                "reinitialization not reverted",
            ).to.be.revertedWithCustomError(voter, "InvalidInitialization");

            expect(
                await voter.emissionsToken(),
                "emission token address",
            ).equal(await c.emissionsToken.getAddress());
            expect(await voter.legacyFactory(), "legacyFactory address").equal(
                await c.pairFactory.getAddress(),
            );
            expect(await voter.gaugefactory(), "gaugefactory address").equal(
                await c.gaugeFactory.getAddress(),
            );
            expect(
                await voter.feeDistributorFactory(),
                "feeDistributorFactory address",
            ).equal(await c.feeDistributorFactory.getAddress());
            expect(await voter.minter(), "minter address").equal(
                await c.minter.getAddress(),
            );
            expect(await voter.governor(), "governor address").equal(
                deployer.address,
            );
            expect(
                await voter.pairFeeFactory(),
                "pairFeeFactory address",
            ).equal(await c.pairFeeFactory.getAddress());
            expect(await voter.votingEscrow(), "votingEscrow address").equal(
                await c.votingEscrow.getAddress(),
            );
            expect(await voter.clFactory(), "clFactory address").equal(
                await c.factory.getAddress(),
            );
            expect(
                await voter.clGaugeFactory(),
                "clGaugeFactory address",
            ).equal(await c.gaugeV3Factory.getAddress());
            expect(await voter.nfpManager(), "nfpManager address").equal(
                await c.nfpManager.getAddress(),
            );
            expect(
                await voter.rebaseDistributor(),
                "rebaseDistributor address",
            ).equal(await c.rebaseDistributor.getAddress());
        });
    });

    describe("#setGovernor", () => {
        it("set with deployer", async () => {
            await voter.connect(deployer).setGovernor(MULTISIG);
            expect(await voter.governor(), "governor not changed").equal(
                MULTISIG,
            );
        });
        it("set with attacker", async () => {
            await expect(
                voter.connect(attacker).setGovernor(MULTISIG),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#whitelist", () => {
        it("set with deployer", async () => {
            // whitelist something new
            await voter.whitelist(MULTISIG);
            expect(
                await voter.isWhitelisted(MULTISIG),
                "whitelist not changed",
            ).equal(true);

            // whitelist existing token
            await expect(
                voter.whitelist(MULTISIG),
            ).to.be.revertedWithCustomError(voter, "AlreadyWhitelisted");
        });
        it("set with attacker", async () => {
            await expect(
                voter.connect(attacker).whitelist(MULTISIG),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#forbid", () => {
        it("set with deployer", async () => {
            // forbid something new
            await voter.forbid(MULTISIG);
            expect(
                await voter.isForbidden(MULTISIG),
                "isForbidden not changed",
            ).equal(true);

            // remove forbid
            await voter.whitelist(MULTISIG);
            expect(
                await voter.isForbidden(MULTISIG),
                "isForbidden not changed",
            ).equal(false);
        });
        it("set with attacker", async () => {
            await expect(
                voter.connect(attacker).forbid(MULTISIG),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#killGauge", () => {
        describe("Edge case - no votes anywhere", () => {
            it("call with deployer", async () => {
                await voter.killGauge(c.gauge.getAddress());
            });
        });

        describe("Normal case - legacy gauges", () => {
            beforeEach("Normal case - legacy gauges", async () => {
                // get some votes in
                await voter.vote(c.tokenId, [c.clPool.getAddress()], [1]);
                // increase a week and advance period
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
            });

            afterEach("Try voting", async () => {
                // get some votes in
                await voter.vote(
                    c.tokenId,
                    [c.pair.getAddress(), c.clPool.getAddress()],
                    [1, 1],
                );
                // increase a week and advance period
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
                const period = await voter.getPeriod();
                expect({
                    pairVotes: await voter.poolTotalVotesPerPeriod(
                        c.pair.getAddress(),
                        period,
                    ),
                    clVotes: await voter.poolTotalVotesPerPeriod(
                        c.clPool.getAddress(),
                        period,
                    ),
                }).to.matchSnapshot("votes not matching snapshot");
            });

            it("no votes on pool", async () => {
                const tokensBefore = await c.emissionsToken.balanceOf(
                    deployer.address,
                );

                // kill gauge
                await voter.killGauge(c.gauge.getAddress());
                expect(
                    await voter.lastDistro(c.gauge.getAddress()),
                    "lastDistro wrong",
                ).eq(await voter.getPeriod());
                expect(
                    await c.emissionsToken.balanceOf(deployer.address),
                    "there should be no increase",
                ).eq(tokensBefore);
                expect(
                    await voter.isAlive(c.gauge.getAddress()),
                    "gauge still alive",
                ).eq(false);
            });

            it("some votes on pool", async () => {
                // get some votes into the pool
                await voter.vote(c.tokenId, [c.pair.getAddress()], [1]);
                // distribute older weeks
                await voter.distribute(c.gauge.getAddress());
                // increase a week and advance period
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();

                // kill gauge
                await voter.killGauge(c.gauge.getAddress());
                expect(
                    await voter.lastDistro(c.gauge.getAddress()),
                    "lastDistro wrong",
                ).eq(await voter.getPeriod());
                expect(
                    await c.emissionsToken.balanceOf(deployer.address),
                ).to.matchSnapshot("tokens should be sent to governor");
                expect(
                    await voter.isAlive(c.gauge.getAddress()),
                    "gauge still alive",
                ).eq(false);
            });

            it("FeeSplitWhenNoGauge == true", async () => {
                await c.pairFactory.setFeeSplitWhenNoGauge(true);
                // kill gauge
                await voter.killGauge(c.gauge.getAddress());
                expect(await c.pair.pairFees(), "pairFees wrong").eq(
                    deployer.address,
                );
            });

            it("FeeSplitWhenNoGauge == false", async () => {
                await c.pairFactory.setFeeSplitWhenNoGauge(false);
                // kill gauge
                await voter.killGauge(c.gauge.getAddress());
                expect(await c.pair.pairFees(), "pairFees wrong").eq(
                    ethers.ZeroAddress,
                );
            });
        });
    });

    describe("#reviveGauge", () => {
        it("Revive alive gauge", async () => {
            await expect(
                voter.reviveGauge(c.gauge.getAddress()),
                "Revive alive gauge not reverted",
            ).to.be.revertedWithCustomError(voter, "ActiveGauge");
        });

        describe("Revive killed gauges", () => {
            beforeEach("kill some gauges", async () => {
                // get some votes in
                await voter.vote(
                    c.tokenId,
                    [c.clPool.getAddress(), c.pair.getAddress()],
                    [1, 1],
                );
                // increase a week and advance period
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();

                // kill gauges
                await voter.killGauge(c.clGauge.getAddress());
                await voter.killGauge(c.gauge.getAddress());
            });

            afterEach("Try voting", async () => {
                // get some votes in
                await voter.vote(
                    c.tokenId,
                    [c.pair.getAddress(), c.clPool.getAddress()],
                    [1, 1],
                );
                // increase a week and advance period
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
                const period = await voter.getPeriod();
                expect({
                    pairVotes: await voter.poolTotalVotesPerPeriod(
                        c.pair.getAddress(),
                        period,
                    ),
                    clVotes: await voter.poolTotalVotesPerPeriod(
                        c.clPool.getAddress(),
                        period,
                    ),
                }).to.matchSnapshot("votes not matching snapshot");
            });

            it("revive legacy gauge", async () => {
                await voter.reviveGauge(c.gauge.getAddress());

                expect(
                    await voter.isAlive(c.gauge.getAddress()),
                    "gauge not revived",
                ).equal(true);
                expect(await c.pair.pairFees(), "pairFees not updated").equal(
                    await c.pairFeeFactory.pairFeesForPair(c.pair.getAddress()),
                );
                const period = await voter.getPeriod();
                expect(
                    await voter.lastDistro(c.gauge.getAddress()),
                    "lastDistro not updated",
                ).equal(period);
            });

            it("revive cl gauge", async () => {
                await voter.reviveGauge(c.clGauge.getAddress());

                expect(
                    await voter.isAlive(c.clGauge.getAddress()),
                    "gauge not revived",
                ).equal(true);
                const period = await voter.getPeriod();
                expect(
                    await voter.lastDistro(c.clGauge.getAddress()),
                    "lastDistro not updated",
                ).equal(period);
            });
        });
    });

    describe("#stuckEmissionsRecovery", () => {
        it("should revert for active gauge", async () => {
            const period = await voter.getPeriod();
            await expect(
                voter.stuckEmissionsRecovery(c.gauge.getAddress(), period),
            ).to.be.revertedWithCustomError(voter, "ActiveGauge");
        });
        describe("#recovery on killed gauges", () => {
            beforeEach("kill a gauge to be recovered", async () => {
                await voter.vote(c.tokenId, [c.pair.getAddress()], [1]);
                await voter.killGauge(c.gauge.getAddress());
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
            });

            it("normal operation", async () => {
                const period = await voter.getPeriod();
                const balanceBefore = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                // recover
                await voter.stuckEmissionsRecovery(
                    c.gauge.getAddress(),
                    period,
                );

                const balanceAfter = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                expect(balanceAfter, "voter didn't send tokens on recovery").lt(
                    balanceBefore,
                );

                expect(
                    await voter.gaugePeriodDistributed(
                        c.gauge.getAddress(),
                        period,
                    ),
                    "gaugePeriodDistributed not updated",
                ).eq(true);

                // calling stuckEmissionsRecovery again should not send more tokens
                await voter.stuckEmissionsRecovery(
                    c.gauge.getAddress(),
                    period,
                );

                expect(
                    await c.emissionsToken.balanceOf(voter.getAddress()),
                    "voter sent tokens after recovery",
                ).eq(balanceAfter);
            });

            it("calling on future period should have no effect", async () => {
                const period = (await voter.getPeriod()) + 2n;
                const balanceBefore = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                // recover
                await voter.stuckEmissionsRecovery(
                    c.gauge.getAddress(),
                    period,
                );

                const balanceAfter = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                expect(
                    balanceAfter,
                    "voter sent tokens when it's not supposed to",
                ).eq(balanceBefore);

                expect(
                    await voter.gaugePeriodDistributed(
                        c.gauge.getAddress(),
                        period,
                    ),
                    "gaugePeriodDistributed should stay false",
                ).eq(false);
            });

            it("should revert for attacker", async () => {
                const period = await voter.getPeriod();
                await expect(
                    voter
                        .connect(attacker)
                        .stuckEmissionsRecovery(c.gauge.getAddress(), period),
                ).to.be.revertedWithCustomError(
                    voter,
                    "AccessManagedUnauthorized",
                );
            });
        });
    });

    describe("#whitelistGaugeRewards", () => {
        it("normal operation on gauges", async () => {
            await voter.whitelistGaugeRewards(
                c.gauge.getAddress(),
                c.dai.getAddress(),
            );

            // should be able to add dai as reward to the gauge
            await c.dai.approve(c.gauge.getAddress(), ethers.MaxUint256);
            await c.gauge.notifyRewardAmount(
                c.dai.getAddress(),
                ethers.parseEther("100"),
            );
        });

        it("normal operation on cl gauges", async () => {
            await voter.whitelistGaugeRewards(
                c.clGauge.getAddress(),
                c.dai.getAddress(),
            );

            // should be able to add dai as reward to the gauge
            await c.dai.approve(c.clGauge.getAddress(), ethers.MaxUint256);
            await c.clGauge.notifyRewardAmount(
                c.dai.getAddress(),
                ethers.parseEther("100"),
            );
        });

        it("normal operation on custom gauges", async () => {
            const { customGauge, token } = await createArbitraryGauge();

            await voter.whitelistGaugeRewards(
                customGauge.getAddress(),
                c.dai.getAddress(),
            );

            // should be able to add dai as reward to the gauge
            await c.dai.approve(customGauge.getAddress(), ethers.MaxUint256);
            await customGauge.notifyRewardAmount(
                c.dai.getAddress(),
                ethers.parseEther("100"),
            );
        });

        it("should revert for attacker", async () => {
            await expect(
                voter
                    .connect(attacker)
                    .whitelistGaugeRewards(
                        c.gauge.getAddress(),
                        c.dai.getAddress(),
                    ),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#removeGaugeRewardWhitelist", () => {
        beforeEach("whitelist dai on gauges", async () => {
            await voter.whitelistGaugeRewards(
                c.gauge.getAddress(),
                c.dai.getAddress(),
            );
            await voter.whitelistGaugeRewards(
                c.clGauge.getAddress(),
                c.dai.getAddress(),
            );
        });

        it("normal operation on gauges", async () => {
            await voter.removeGaugeRewardWhitelist(
                c.gauge.getAddress(),
                c.dai.getAddress(),
            );

            // should not be able to add dai as reward to the gauge
            await c.dai.approve(c.gauge.getAddress(), ethers.MaxUint256);
            await expect(
                c.gauge.notifyRewardAmount(
                    c.dai.getAddress(),
                    ethers.parseEther("100"),
                ),
            ).to.be.revertedWithCustomError(c.gauge, "NotWhitelisted");
        });

        it("normal operation on cl gauges", async () => {
            await voter.removeGaugeRewardWhitelist(
                c.clGauge.getAddress(),
                c.dai.getAddress(),
            );

            await c.usdc.approve(c.clGauge.getAddress(), ethers.MaxUint256);
            expect(
                await c.clGauge.isReward(c.dai.getAddress()),
                "reward not removed from cl gauge",
            ).equal(false);
        });

        it("normal operation on custom gauges", async () => {
            const { customGauge, token } = await createArbitraryGauge();

            await voter.whitelistGaugeRewards(
                customGauge.getAddress(),
                c.dai.getAddress(),
            );

            await voter.removeGaugeRewardWhitelist(
                customGauge.getAddress(),
                c.dai.getAddress(),
            );

            // should not be able to add dai as reward to the gauge
            await c.dai.approve(customGauge.getAddress(), ethers.MaxUint256);
            await expect(
                customGauge.notifyRewardAmount(
                    c.dai.getAddress(),
                    ethers.parseEther("100"),
                ),
            ).to.be.revertedWithCustomError(customGauge, "NotWhitelisted");
        });

        it("should revert for attacker", async () => {
            await expect(
                voter
                    .connect(attacker)
                    .removeGaugeRewardWhitelist(
                        c.gauge.getAddress(),
                        c.usdc.getAddress(),
                    ),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#setMainCurve", () => {
        let pair: typechain.Pair;
        let gauge: typechain.Gauge;
        let otherPair: typechain.Pair;
        let otherGauge: typechain.Gauge;
        let feeDist: typechain.FeeDistributor;
        let otherFeeDist: typechain.FeeDistributor;

        beforeEach("deploy another pool of the same pair", async () => {
            await c.pairFactory.setFeeSplitWhenNoGauge(true);

            const pairAddress = await c.pairFactory.createPair.staticCall(
                await c.usdc.getAddress(),
                await c.usdt.getAddress(),
                false,
            );
            await c.pairFactory.createPair(
                await c.usdc.getAddress(),
                await c.usdt.getAddress(),
                false,
            );
            otherPair = await ethers.getContractAt("Pair", pairAddress);

            otherGauge = await createGauge(await otherPair.getAddress());
            otherFeeDist = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForGauge(otherGauge),
            );

            pair = c.pair;
            gauge = c.gauge;
            feeDist = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForGauge(gauge),
            );
        });

        it("initial state", async () => {
            expect(await voter.isAlive(gauge), "previous gauge should be alive")
                .true;
            expect(
                await voter.isAlive(otherGauge),
                "other gauge shouldn't be alive",
            ).false;

            expect(
                await voter.poolRedirect(pair),
                "previous pool shouldn't be redirected",
            ).eq(ethers.ZeroAddress);
            expect(
                await voter.poolRedirect(otherPair),
                "new pool should be redirected",
            ).eq(await pair.getAddress());

            expect(
                await voter.feeDistributorForGauge(gauge),
                "previous feeDist shouldn't be redirected",
            ).eq(await feeDist.getAddress());
            expect(
                await voter.feeDistributorForGauge(otherGauge),
                "new legacy pair feeDist shouldn't be redirected",
            ).eq(await otherFeeDist.getAddress());

            // vote and check
            await voter.vote(c.tokenId, [pair, otherPair], [1, 1]);

            // votes should only go to clPool
            const period = (await voter.getPeriod()) + 1n;

            expect(
                await voter.poolTotalVotesPerPeriod(pair, period),
                "votes should only go to 1 pool of pair",
            ).eq(await voter.totalVotesPerPeriod(period));

            // should also apply to poke()
            await voter.poke(c.tokenId);

            expect(
                await voter.poolTotalVotesPerPeriod(pair, period),
                "votes should only go to 1 pool of pair",
            ).eq(await voter.totalVotesPerPeriod(period));
        });

        it("normal operation", async () => {
            // first get some votes in
            await voter.vote(c.tokenId, [pair, otherPair], [1, 1]);

            // change main tick spacing
            await voter.setMainCurve(c.usdc, c.usdt, false);

            expect(
                await voter.isAlive(gauge),
                "previous gauge shouldn't be alive",
            ).false;
            expect(
                await voter.isAlive(otherGauge),
                "other gauge should be alive",
            ).true;

            expect(
                await voter.poolRedirect(pair),
                "previous pool should be redirected",
            ).eq(await otherPair.getAddress());
            expect(
                await voter.poolRedirect(otherPair),
                "new pool should be directed to itself",
            ).eq(await otherPair.getAddress());

            expect(
                await voter.feeDistributorForGauge(gauge),
                "previous legacy feeDist shouldn't be redirected",
            ).eq(await feeDist.getAddress());
            expect(
                await voter.feeDistributorForGauge(otherGauge),
                "new feeDist shouldn't be redirected",
            ).eq(await otherFeeDist.getAddress());

            const period = (await voter.getPeriod()) + 1n;

            expect(
                await voter.poolTotalVotesPerPeriod(pair, period),
                "votes shouldn't have changed",
            ).eq(await voter.totalVotesPerPeriod(period));

            // poking should change votes to the new main tick
            await voter.poke(c.tokenId);

            expect(
                await voter.poolTotalVotesPerPeriod(otherPair, period),
                "should change votes to the new main tick",
            ).eq(await voter.totalVotesPerPeriod(period));

            // voting the old pool shouold redirect votes to the new pool

            await voter.vote(c.tokenId, [pair], [1]);
            expect(
                await voter.poolTotalVotesPerPeriod(otherPair, period),
                "should change votes to the new main tick",
            ).eq(await voter.totalVotesPerPeriod(period));
            expect(
                await voter.poolTotalVotesPerPeriod(pair, period),
                "should change votes to the new main tick",
            ).eq(0n);

            // fees go to treasury for the killed gauge
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();

            // deposit into the gauges
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );

            await washtradeForFees(c.usdc, c.usdt, true);

            await pair.transfer(
                attacker.address,
                await pair.balanceOf(deployer.address),
            );

            const pairFeesAddress = await pair.pairFees();

            expect(
                await pair.balanceOf(deployer.address),
                "no fees should be in pair fees yet",
            ).eq(0n);

            await voter.distribute(gauge);

            expect(
                await pair.balanceOf(deployer.address),
                "fees should reach treasury",
            ).toMatchSnapshot();
        });

        it("should revert for attacker", async () => {
            await expect(
                voter
                    .connect(attacker)
                    .setMainCurve(
                        c.usdc.getAddress(),
                        c.usdt.getAddress(),
                        false,
                    ),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#setMainTickSpacing", () => {
        let clPool: typechain.RamsesV3Pool;
        let clGauge: typechain.GaugeV3;
        let otherClPool: typechain.RamsesV3Pool;
        let otherClGauge: typechain.GaugeV3;
        let feeDist: typechain.FeeDistributor;
        let otherFeeDist: typechain.FeeDistributor;

        beforeEach("deploy another pool of the same pair", async () => {
            const clPoolAddress = await c.factory.createPool.staticCall(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                TICK_SPACINGS.NORMAL,
                2n ** 96n,
            );
            await c.factory.createPool(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                TICK_SPACINGS.NORMAL,
                2n ** 96n,
            );
            otherClPool = await ethers.getContractAt(
                "RamsesV3Pool",
                clPoolAddress,
            );

            otherClGauge = await createClGauge(await otherClPool.getAddress());
            otherFeeDist = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForClGauge(otherClGauge),
            );

            clPool = c.clPool;
            clGauge = c.clGauge;
            feeDist = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForClGauge(clGauge),
            );
        });

        it("initial state", async () => {
            expect(
                await voter.isAlive(clGauge),
                "previous gauge should be alive",
            ).true;
            expect(
                await voter.isAlive(otherClGauge),
                "other gauge shouldn't be alive",
            ).false;

            expect(
                await voter.poolRedirect(clPool),
                "previous pool shouldn't be redirected",
            ).eq(ethers.ZeroAddress);
            expect(
                await voter.poolRedirect(otherClPool),
                "new pool should be redirected",
            ).eq(await clPool.getAddress());

            expect(
                await voter.feeDistributorForGauge(clGauge),
                "previous feeDist shouldn't be redirected",
            ).eq(await feeDist.getAddress());
            expect(
                await voter.feeDistributorForGauge(otherClGauge),
                "new feeDist should be redirected",
            ).eq(await feeDist.getAddress());

            // vote and check
            await voter.vote(c.tokenId, [clPool, otherClPool], [1, 1]);

            // votes should only go to clPool
            const period = (await voter.getPeriod()) + 1n;

            expect(
                await voter.poolTotalVotesPerPeriod(clPool, period),
                "votes should only go to 1 pool of each CL pair",
            ).eq(await voter.totalVotesPerPeriod(period));

            // should also apply to poke()
            await voter.poke(c.tokenId);

            expect(
                await voter.poolTotalVotesPerPeriod(clPool, period),
                "votes should only go to 1 pool of each CL pair",
            ).eq(await voter.totalVotesPerPeriod(period));
        });

        it("normal operation", async () => {
            // first get some votes in
            await voter.vote(c.tokenId, [clPool, otherClPool], [1, 1]);

            // change main tick spacing
            await voter.setMainTickSpacing(
                c.usdc,
                c.usdt,
                TICK_SPACINGS.NORMAL,
            );

            expect(
                await voter.isAlive(clGauge),
                "previous gauge shouldn't be alive",
            ).false;
            expect(
                await voter.isAlive(otherClGauge),
                "other gauge should be alive",
            ).true;

            expect(
                await voter.poolRedirect(clPool),
                "previous pool should be redirected",
            ).eq(await otherClPool.getAddress());
            expect(
                await voter.poolRedirect(otherClPool),
                "new pool should be directed to itself",
            ).eq(await otherClPool.getAddress());

            expect(
                await voter.feeDistributorForGauge(clGauge),
                "previous feeDist should be redirected",
            ).eq(await otherFeeDist.getAddress());
            expect(
                await voter.feeDistributorForGauge(otherClGauge),
                "new feeDist shouldn't be redirected",
            ).eq(await otherFeeDist.getAddress());

            const period = (await voter.getPeriod()) + 1n;

            expect(
                await voter.poolTotalVotesPerPeriod(clPool, period),
                "votes shouldn't have changed",
            ).eq(await voter.totalVotesPerPeriod(period));

            // poking should change votes to the new main tick
            await voter.poke(c.tokenId);

            expect(
                await voter.poolTotalVotesPerPeriod(otherClPool, period),
                "should change votes to the new main tick",
            ).eq(await voter.totalVotesPerPeriod(period));

            // voting the old pool shouold redirect votes to the new pool

            await voter.vote(c.tokenId, [clPool], [1]);
            expect(
                await voter.poolTotalVotesPerPeriod(otherClPool, period),
                "should change votes to the new main tick",
            ).eq(await voter.totalVotesPerPeriod(period));
            expect(
                await voter.poolTotalVotesPerPeriod(clPool, period),
                "should change votes to the new main tick",
            ).eq(0n);

            // fees should go to the new main gauge
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await c.nfpManager.mint({
                amount0Desired: ethers.parseEther("1000"),
                amount1Desired: ethers.parseEther("1000"),
                amount0Min: ethers.parseEther("0"),
                amount1Min: ethers.parseEther("0"),
                recipient: deployer.address,
                token0: c.usdt.getAddress(),
                token1: c.usdc.getAddress(),
                tickSpacing: TICK_SPACINGS.STABLE,
                tickLower: getMinTick(TICK_SPACINGS.STABLE),
                tickUpper: getMaxTick(TICK_SPACINGS.STABLE),
                deadline: ethers.MaxUint256,
            });
            await washtradeForFees(c.usdc, c.usdt, false);
            expect(
                await c.usdc.balanceOf(otherFeeDist),
                "no fees should be in fee dist yet",
            ).eq(0n);

            await voter.distribute(clGauge);
            expect(
                (await c.usdc.balanceOf(otherFeeDist)) > 0n,
                "fees should be redirected to the main tick spacing pool",
            ).true;
        });

        it("should revert for attacker", async () => {
            await expect(
                voter
                    .connect(attacker)
                    .setMainTickSpacing(
                        c.usdc.getAddress(),
                        c.usdt.getAddress(),
                        TICK_SPACINGS.NORMAL,
                    ),
            ).to.be.revertedWithCustomError(voter, "AccessManagedUnauthorized");
        });
    });

    describe("#vote, poke, reset", () => {
        afterEach("Check data and try poke, reset votes", async () => {
            const period = (await voter.getPeriod()) + 1n;
            expect({
                votingPowerUsed: await voter.tokenIdVotingPowerPerPeriod(
                    c.tokenId,
                    period,
                ),
                totalVotesPerPeriod: await voter.totalVotesPerPeriod(period),
                votes: {
                    clPool: await voter.poolTotalVotesPerPeriod(
                        c.clGauge.getAddress(),
                        period,
                    ),
                    pair: await voter.poolTotalVotesPerPeriod(
                        c.gauge.getAddress(),
                        period,
                    ),
                },
            }).to.matchSnapshot("Votes not matching snapshot");

            // votes can change from before if
            // - voting power goes down
            // - there were invalid pools in the previous vote
            //   (valid pools will get more votes when poked since invalid pools aren't recorded)
            await voter.poke(c.tokenId);
            expect({
                votingPowerUsed: await voter.tokenIdVotingPowerPerPeriod(
                    c.tokenId,
                    period,
                ),
                totalVotesPerPeriod: await voter.totalVotesPerPeriod(period),
                votes: {
                    clPool: await voter.poolTotalVotesPerPeriod(
                        c.clGauge.getAddress(),
                        period,
                    ),
                    pair: await voter.poolTotalVotesPerPeriod(
                        c.gauge.getAddress(),
                        period,
                    ),
                },
            }).to.matchSnapshot("Votes not matching snapshot after poke");

            await voter.reset(c.tokenId);

            expect({
                votingPowerUsed: await voter.tokenIdVotingPowerPerPeriod(
                    c.tokenId,
                    period,
                ),
                totalVotesPerPeriod: await voter.totalVotesPerPeriod(period),
                votes: {
                    clPool: await voter.poolTotalVotesPerPeriod(
                        c.clGauge.getAddress(),
                        period,
                    ),
                    pair: await voter.poolTotalVotesPerPeriod(
                        c.gauge.getAddress(),
                        period,
                    ),
                },
            }).to.matchSnapshot("Reset after voting not zero");
        });

        it("voting normally", async () => {
            await voter.vote(
                c.tokenId,
                [c.clPool.getAddress(), c.pair.getAddress()],
                [1, 1],
            );
        });

        it("voting for duplicate pools shouldn't cause problems", async () => {
            await voter.vote(
                c.tokenId,
                [c.clPool.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );
        });

        it("voting for pools without an active gauge should record the right totals", async () => {
            // this lessens the amount of emission token stuck in voter
            // since wasted votes means there's more difference between
            // the summed total of votes and totalVotesPerPeriod

            // kill a gauge
            await voter.killGauge(c.gauge.getAddress());
            await voter.vote(
                c.tokenId,
                [
                    c.clPool.getAddress(),
                    c.pair.getAddress(),
                    ethers.ZeroAddress,
                ],
                [2, 1, 1],
            );
        });

        it("mismatched lengths", async () => {
            await expect(
                voter.vote(
                    c.tokenId,
                    [c.clPool.getAddress(), c.pair.getAddress()],
                    [1],
                ),
            ).to.be.revertedWithCustomError(voter, "LengthMismatch");

            await expect(
                voter.vote(c.tokenId, [c.clPool.getAddress()], [1, 1]),
            ).to.be.revertedWithCustomError(voter, "LengthMismatch");
        });
    });

    describe("#createGauge, createCLGauge, createArbitraryGauge", () => {
        let pair: typechain.Pair;
        let clPool: typechain.RamsesV3Pool;
        let gauge: typechain.Gauge;
        let clGauge: typechain.GaugeV3;
        beforeEach("deploy new pairs", async () => {
            ({ pair, clPool } = await loadFixture(createMorePools));
        });

        it("#createGauge", async () => {
            const gaugeAddress = await c.voter.createGauge.staticCall(
                pair.getAddress(),
            );
            await c.voter.createGauge(pair.getAddress());
            gauge = await ethers.getContractAt("Gauge", gaugeAddress);

            expect(
                await voter.isGauge(gauge.getAddress()),
                "isGauge not right",
            ).equal(true);
            const pairFees = await ethers.getContractAt(
                "PairFees",
                await c.pairFeeFactory.pairFeesForPair(pair.getAddress()),
            );
            expect(await pair.pairFees(), "pairFees not set").equal(
                await pairFees.getAddress(),
            );
            expect(
                await pairFees.feeDistributor(),
                "feeDistributor not set",
            ).equal(await voter.feeDistributorForGauge(gauge.getAddress()));
            expect(
                await c.emissionsToken.allowance(
                    voter.getAddress(),
                    gauge.getAddress(),
                ),
                "emissions approval not set",
            ).gt(0);
            expect(
                await voter.feeDistributorForGauge(gauge.getAddress()),
                "feeDistributor not recorded",
            ).not.equal(ethers.ZeroAddress);
            expect(
                await voter.gaugeForPool(pair.getAddress()),
                "gaugeForPool not recorded",
            ).eq(await gauge.getAddress());
            expect(
                await voter.poolForGauge(gauge.getAddress()),
                "poolForGauge not recorded",
            ).eq(await pair.getAddress());
            expect(
                await voter.isAlive(gauge.getAddress()),
                "gauge not alive",
            ).eq(true);
            expect(
                await voter.isGauge(gauge.getAddress()),
                "gauge not recorded",
            ).eq(true);
            expect(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(gauge.getAddress()),
                ),
                "isFeeDistributor not recorded",
            ).eq(true);
            expect(
                await voter.isLegacyGauge(gauge.getAddress()),
                "isLegacyGauge not recorded",
            ).eq(true);
            expect(
                await voter.lastDistro(gauge.getAddress()),
                "lastDistro not recorded",
            ).not.equal(0n);
            expect(
                await voter.isClGauge(gauge.getAddress()),
                "isClGauge wrong",
            ).eq(false);
            expect(
                await voter.isArbitraryGauge(gauge.getAddress()),
                "isArbitraryGauge wrong",
            ).eq(false);
        });

        it("#createGauge not pool", async () => {
            await expect(
                c.voter.createGauge(ethers.ZeroAddress),
                "non-pool not reverted",
            ).to.be.revertedWithCustomError(voter, "NotPool");
        });

        it("#createGauge existing gauge", async () => {
            await expect(
                c.voter.createGauge(c.pair.getAddress()),
                "existing gauge not reverted",
            ).to.be.revertedWithCustomError(voter, "ActiveGauge");
        });

        it("#createCLGauge", async () => {
            const clGaugeAddress = await c.voter.createCLGauge.staticCall(
                c.usdc.getAddress(),
                c.dai.getAddress(),
                TICK_SPACINGS.STABLE,
            );
            await c.voter.createCLGauge(
                c.usdc.getAddress(),
                c.dai.getAddress(),
                TICK_SPACINGS.STABLE,
            );
            clGauge = await ethers.getContractAt("GaugeV3", clGaugeAddress);

            expect(
                await c.emissionsToken.allowance(
                    voter.getAddress(),
                    clGauge.getAddress(),
                ),
                "emissions approval not set",
            ).gt(0);
            expect(
                await voter.gaugeForPool(clPool.getAddress()),
                "gaugeForPool not recorded",
            ).eq(await clGauge.getAddress());
            expect(
                await voter.poolForGauge(clGauge.getAddress()),
                "poolForGauge not recorded",
            ).eq(await clPool.getAddress());
            expect(
                await voter.isAlive(clGauge.getAddress()),
                "gauge not alive",
            ).eq(true);
            expect(
                await voter.lastDistro(clGauge.getAddress()),
                "lastDistro not recorded",
            ).not.equal(0n);
            expect(
                await voter.isGauge(clGauge.getAddress()),
                "isGauge not right",
            ).equal(true);
            expect(
                await voter.feeDistributorForGauge(clGauge.getAddress()),
                "feeDistributor not recorded",
            ).not.equal(ethers.ZeroAddress);

            const slot0 = await clPool.slot0();
            const feeProtocol = slot0.feeProtocol;
            expect(feeProtocol, "feeProtocol not set").equal(
                await c.factory.poolFeeProtocol(clPool.getAddress()),
            );
            expect(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(clGauge.getAddress()),
                ),
                "isFeeDistributor not recorded",
            ).eq(true);
            expect(
                await voter.isClGauge(clGauge.getAddress()),
                "isClGauge not recorded",
            ).eq(true);
            expect(
                await voter.isLegacyGauge(clGauge.getAddress()),
                "isLegacyGauge wrong",
            ).eq(false);
            expect(
                await voter.isArbitraryGauge(clGauge.getAddress()),
                "isArbitraryGauge wrong",
            ).eq(false);
        });

        it("#createCLGauge not pool", async () => {
            await expect(
                c.voter.createCLGauge(
                    c.usdc.getAddress(),
                    ethers.ZeroAddress,
                    TICK_SPACINGS.STABLE,
                ),
                "non-pool not reverted",
            ).to.be.revertedWithCustomError(voter, "NotPool");
        });

        it("#createCLGauge existing gauge", async () => {
            await expect(
                c.voter.createCLGauge(
                    c.usdc.getAddress(),
                    c.usdt.getAddress(),
                    TICK_SPACINGS.STABLE,
                ),
                "existing gauge not reverted",
            ).to.be.revertedWithCustomError(voter, "ActiveGauge");
        });

        it("#createCLGauge IsForbidden", async () => {
            await voter.forbid(c.dai.getAddress());
            await expect(
                c.voter
                    .connect(attacker)
                    .createCLGauge(
                        c.usdc.getAddress(),
                        c.dai.getAddress(),
                        TICK_SPACINGS.STABLE,
                    ),
                "IsForbidden not reverted",
            ).to.be.revertedWithCustomError(voter, "IsForbidden");

            // should work for governor
            await c.voter.createCLGauge(
                c.usdc.getAddress(),
                c.dai.getAddress(),
                TICK_SPACINGS.STABLE,
            );
        });

        it("#createCLGauge NotWhitelisted", async () => {
            // create a pool without whitelisted tokens
            await c.factory.createPool(
                c.mim.getAddress(),
                c.dai.getAddress(),
                TICK_SPACINGS.STABLE,
                2n ** 96n,
            );
            expect(
                await voter.isWhitelisted(c.mim.getAddress()),
                "need to use non-whitelisted token",
            ).equal(false);
            expect(
                await voter.isWhitelisted(c.dai.getAddress()),
                "need to use non-whitelisted token",
            ).equal(false);

            await expect(
                c.voter
                    .connect(attacker)
                    .createCLGauge(
                        c.mim.getAddress(),
                        c.dai.getAddress(),
                        TICK_SPACINGS.STABLE,
                    ),
                "NotWhitelisted not reverted",
            ).to.be.revertedWithCustomError(voter, "NotWhitelisted");

            // should still work for governor
            await c.voter.createCLGauge(
                c.mim.getAddress(),
                c.dai.getAddress(),
                TICK_SPACINGS.STABLE,
            );
        });

        it("#createArbitraryGauge for existing pool", async () => {
            // create gauge for existing pool
            await c.voter.createGauge(pair.getAddress());

            // get data before creating custom gauge to make sure it's unchanged later
            const pairFees = await ethers.getContractAt(
                "PairFees",
                await c.pairFeeFactory.pairFeesForPair(pair.getAddress()),
            );
            const pairGaugeAddress = await voter.gaugeForPool(
                pair.getAddress(),
            );
            const pairFeeDistributorAddress =
                await voter.feeDistributorForGauge(pairGaugeAddress);

            const gaugeAddress = await c.voter.createArbitraryGauge.staticCall(
                c.dai.getAddress(),
            );
            await c.voter.createArbitraryGauge(c.dai.getAddress());
            gauge = await ethers.getContractAt("Gauge", gaugeAddress);

            // check unchanged data
            expect(await pair.pairFees(), "pairFees got overriden").equal(
                await pairFees.getAddress(),
            );
            expect(
                await voter.feeDistributorForGauge(pairGaugeAddress),
                "feeDistributor overriden",
            ).equal(pairFeeDistributorAddress);
            expect(
                await pairFees.feeDistributor(),
                "feeDistributor overriden on pairFees",
            ).equal(pairFeeDistributorAddress);

            // check new data
            expect(
                await voter.isGauge(gauge.getAddress()),
                "isGauge not right",
            ).equal(true);
            expect(
                await c.emissionsToken.allowance(
                    voter.getAddress(),
                    gauge.getAddress(),
                ),
                "emissions approval not set",
            ).gt(0);
            expect(
                await voter.feeDistributorForGauge(gauge.getAddress()),
                "feeDistributor should be 0",
            ).equal(ethers.ZeroAddress);
            expect(
                await voter.gaugeForPool(c.dai.getAddress()),
                "gaugeForPool not recorded",
            ).eq(await gauge.getAddress());
            expect(
                await voter.poolForGauge(gauge.getAddress()),
                "poolForGauge not recorded",
            ).eq(await c.dai.getAddress());
            expect(
                await voter.isAlive(gauge.getAddress()),
                "gauge not alive",
            ).eq(true);
            expect(
                await voter.isGauge(gauge.getAddress()),
                "gauge not recorded",
            ).eq(true);
            expect(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(gauge.getAddress()),
                ),
                "isFeeDistributor address(0) should not be a feeDist",
            ).eq(false);
            expect(
                await voter.lastDistro(gauge.getAddress()),
                "lastDistro not recorded",
            ).not.equal(0n);
            expect(
                await voter.isLegacyGauge(gauge.getAddress()),
                "isLegacyGauge wrong",
            ).eq(false);
            expect(
                await voter.isClGauge(gauge.getAddress()),
                "isClGauge wrong",
            ).eq(false);
            expect(
                await voter.isArbitraryGauge(gauge.getAddress()),
                "isArbitraryGauge not recorded",
            ).eq(true);
        });

        it("#createArbitraryGauge for existing pool when custom gauge already exists should succeed (multiple ALMs)", async () => {
            // create gauge for existing pool
            await c.voter.createGauge(pair.getAddress());

            await c.voter.createArbitraryGauge(c.dai.getAddress());
            await c.voter.createArbitraryGauge(c.usdt.getAddress());
        });

        it("#createArbitraryGauge for address(0)", async () => {
            const gaugeAddress = await c.voter.createArbitraryGauge.staticCall(
                c.dai.getAddress(),
            );
            await c.voter.createArbitraryGauge(c.dai.getAddress());
            gauge = await ethers.getContractAt("Gauge", gaugeAddress);

            // check new data
            expect(
                await voter.isGauge(gauge.getAddress()),
                "isGauge not right",
            ).equal(true);
            expect(
                await c.emissionsToken.allowance(
                    voter.getAddress(),
                    gauge.getAddress(),
                ),
                "emissions approval not set",
            ).gt(0);
            expect(
                await voter.feeDistributorForGauge(gauge.getAddress()),
                "feeDistributor should be address(0)",
            ).equal(ethers.ZeroAddress);
            expect(
                await voter.gaugeForPool(c.dai.getAddress()),
                "gaugeForPool not recorded",
            ).eq(await gauge.getAddress());
            expect(
                await voter.poolForGauge(gauge.getAddress()),
                "poolForGauge not recorded",
            ).eq(await c.dai.getAddress());
            expect(
                await voter.isAlive(gauge.getAddress()),
                "gauge not alive",
            ).eq(true);
            expect(
                await voter.isGauge(gauge.getAddress()),
                "gauge not recorded",
            ).eq(true);
            expect(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(gauge.getAddress()),
                ),
                "address(0) shouldn't be a feeDist",
            ).eq(false);
            expect(
                await voter.lastDistro(gauge.getAddress()),
                "lastDistro not recorded",
            ).not.equal(0n);
            expect(
                await voter.isLegacyGauge(gauge.getAddress()),
                "isLegacyGauge wrong",
            ).eq(false);
            expect(
                await voter.isClGauge(gauge.getAddress()),
                "isClGauge wrong",
            ).eq(false);
            expect(
                await voter.isArbitraryGauge(gauge.getAddress()),
                "isArbitraryGauge not recorded",
            ).eq(true);
        });

        it("#createArbitraryGauge for address(0) pool when custom gauge already exists should revert", async () => {
            await c.voter.createArbitraryGauge(c.dai.getAddress());
            await expect(
                c.voter.createArbitraryGauge(c.dai.getAddress()),
            ).to.be.revertedWithCustomError(voter, "ActiveGauge");
        });
    });

    describe("#claimClGaugeRewards, claimIncentives, claimRewards", () => {
        let tokenId: bigint;
        let nfpTokenIds: bigint[] = [];
        let pair: typechain.Pair;
        let otherPair: typechain.Pair;
        let clPool: typechain.RamsesV3Pool;
        let otherClPool: typechain.RamsesV3Pool;
        let gauge: typechain.Gauge;
        let otherGauge: typechain.Gauge;
        let clGauge: typechain.GaugeV3;
        let otherClGauge: typechain.GaugeV3;
        beforeEach("get some rewards into gauges", async () => {
            ({ tokenId, pair, clPool, gauge, clGauge } = c);
            await c.pairFactory.setFeeSplit(10000n);
            // create more pools
            ({ pair: otherPair, clPool: otherClPool } =
                await createMorePools());
            await c.pairFactory.setPairFeeSplit(pair.getAddress(), 10000n);
            await c.pairFactory.setPairFeeSplit(otherPair.getAddress(), 10000n);

            // create some NFPs
            const nfpTotalSupply = await c.nfpManager.totalSupply();
            nfpTokenIds = [];
            for (let i = 0; i < 4; i++) {
                nfpTokenIds.push(BigInt(i + 1) + nfpTotalSupply);
            }

            for (let i = 0; i < 2; i++) {
                await c.nfpManager.mint({
                    amount0Desired: ethers.parseEther("1000"),
                    amount1Desired: ethers.parseEther("1000"),
                    amount0Min: ethers.parseEther("0"),
                    amount1Min: ethers.parseEther("0"),
                    recipient: deployer.address,
                    token0: c.usdt.getAddress(),
                    token1: c.usdc.getAddress(),
                    tickSpacing: TICK_SPACINGS.STABLE,
                    tickLower: getMinTick(TICK_SPACINGS.STABLE),
                    tickUpper: getMaxTick(TICK_SPACINGS.STABLE),
                    deadline: ethers.MaxUint256,
                });
                await c.nfpManager.mint({
                    amount0Desired: ethers.parseEther("1000"),
                    amount1Desired: ethers.parseEther("1000"),
                    amount0Min: ethers.parseEther("0"),
                    amount1Min: ethers.parseEther("0"),
                    recipient: deployer.address,
                    token0: c.usdc.getAddress(),
                    token1: c.dai.getAddress(),
                    tickSpacing: TICK_SPACINGS.STABLE,
                    tickLower: getMinTick(TICK_SPACINGS.STABLE),
                    tickUpper: getMaxTick(TICK_SPACINGS.STABLE),
                    deadline: ethers.MaxUint256,
                });
            }

            // create more gauges
            otherGauge = await createGauge(await otherPair.getAddress());
            otherClGauge = await createClGauge(await otherClPool.getAddress());

            // deposit into the gauges
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.dai.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );
            await pair.approve(gauge.getAddress(), ethers.MaxUint256);
            await otherPair.approve(otherGauge.getAddress(), ethers.MaxUint256);
            await gauge.depositAll();
            await otherGauge.depositAll();

            // vote for the pools
            const votes = [
                pair.getAddress(),
                otherPair.getAddress(),
                clPool.getAddress(),
                otherClPool.getAddress(),
            ];
            const weights = [1, 1, 1, 1];

            await voter.vote(tokenId, votes, weights);

            // increase time and distribute
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await c.mim.approve(gauge.getAddress(), ethers.MaxUint256);
            await c.mim.approve(clGauge.getAddress(), ethers.MaxUint256);

            // add custom rewards
            await voter.whitelistGaugeRewards(
                clGauge.getAddress(),
                c.mim.getAddress(),
            );
            await voter.whitelistGaugeRewards(
                gauge.getAddress(),
                c.mim.getAddress(),
            );
            await c.clGauge.notifyRewardAmount(
                c.mim.getAddress(),
                ethers.parseEther("100"),
            );
            await c.gauge.notifyRewardAmount(
                c.mim.getAddress(),
                ethers.parseEther("100"),
            );

            await washtradeForFees(c.usdc, c.usdt, true);
            await washtradeForFees(c.usdc, c.usdt, false);
            await washtradeForFees(c.dai, c.usdc, true);
            await washtradeForFees(c.dai, c.usdc, false);

            await c.voter.distributeAll();

            // increase time to go over the whole week
            // so the reward snapshots are of the whole week
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await c.voter.distributeAll();
        });

        it("#claimClGaugeRewards", async () => {
            const mimBalanceBefore = await c.mim.balanceOf(deployer.address);
            const ramBalanceBefore = await c.emissionsToken.balanceOf(
                deployer.address,
            );

            await voter.claimClGaugeRewards(
                [await clGauge.getAddress(), await otherClGauge.getAddress()],
                [
                    [c.emissionsToken.getAddress(), c.mim.getAddress()],
                    [c.emissionsToken.getAddress(), c.mim.getAddress()],
                ],
                [nfpTokenIds, nfpTokenIds],
            );
            const mimBalance = await c.mim.balanceOf(deployer.address);
            const ramBalance = await c.emissionsToken.balanceOf(
                deployer.address,
            );
            const mimIncrease = mimBalance - mimBalanceBefore;
            const ramIncrease = ramBalance - ramBalanceBefore;

            expect(
                {
                    mimIncrease,
                    ramIncrease,
                },
                "rewards don't match snapshot",
            ).to.matchSnapshot();
        });

        it("#claimRewards", async () => {
            const mimBalanceBefore = await c.mim.balanceOf(deployer.address);
            const ramBalanceBefore = await c.emissionsToken.balanceOf(
                deployer.address,
            );

            await voter.claimRewards(
                [await gauge.getAddress(), await otherGauge.getAddress()],
                [
                    [c.emissionsToken.getAddress(), c.mim.getAddress()],
                    [c.emissionsToken.getAddress(), c.mim.getAddress()],
                ],
            );
            const mimBalance = await c.mim.balanceOf(deployer.address);
            const ramBalance = await c.emissionsToken.balanceOf(
                deployer.address,
            );
            const mimIncrease = mimBalance - mimBalanceBefore;
            const ramIncrease = ramBalance - ramBalanceBefore;

            expect(
                {
                    mimIncrease,
                    ramIncrease,
                },
                "rewards don't match snapshot",
            ).to.matchSnapshot();
        });

        it("#claimIncentives", async () => {
            const pairBalanceBefore = await pair.balanceOf(deployer.address);
            const otherPairBalanceBefore = await otherPair.balanceOf(
                deployer.address,
            );
            const usdcBalanceBefore = await c.usdc.balanceOf(deployer.address);
            const usdtBalanceBefore = await c.usdt.balanceOf(deployer.address);
            const daiBalanceBefore = await c.dai.balanceOf(deployer.address);
            const mimBalanceBefore = await c.mim.balanceOf(deployer.address);
            const ramBalanceBefore = await c.emissionsToken.balanceOf(
                deployer.address,
            );

            const tokens = [
                c.emissionsToken.getAddress(),
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                c.dai.getAddress(),
                c.mim.getAddress(),
                pair.getAddress(),
                otherPair.getAddress(),
            ];
            const gauges = [gauge, otherGauge, clGauge, otherClGauge];
            const feeDistributors: string[] = [];
            for (let i = 0; i < gauges.length; i++) {
                feeDistributors.push(
                    await voter.feeDistributorForGauge(gauges[i].getAddress()),
                );
            }
            const feeDistributor = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForGauge(gauge.getAddress()),
            );
            const pairFees = await ethers.getContractAt(
                "PairFees",
                await c.pairFeeFactory.pairFeesForPair(pair.getAddress()),
            );

            await voter.claimIncentives(tokenId, feeDistributors, [
                tokens,
                tokens,
                tokens,
                tokens,
            ]);

            const pairBalance = await pair.balanceOf(deployer.address);
            const otherPairBalance = await otherPair.balanceOf(
                deployer.address,
            );

            // remove the pair balance fees from the LP token
            await pair.approve(c.router.getAddress(), ethers.MaxUint256);
            await otherPair.approve(c.router.getAddress(), ethers.MaxUint256);

            await c.router.removeLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                await pair.balanceOf(deployer.address),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );
            await c.router.removeLiquidity(
                c.dai.getAddress(),
                c.usdc.getAddress(),
                true,
                await otherPair.balanceOf(deployer.address),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );

            const usdcBalance = await c.usdc.balanceOf(deployer.address);
            const usdtBalance = await c.usdt.balanceOf(deployer.address);
            const daiBalance = await c.dai.balanceOf(deployer.address);
            const mimBalance = await c.mim.balanceOf(deployer.address);
            const ramBalance = await c.emissionsToken.balanceOf(
                deployer.address,
            );

            const pairIncrease = pairBalance - pairBalanceBefore;
            const otherPairIncrease = otherPairBalance - otherPairBalanceBefore;
            const usdcIncrease = usdcBalance - usdcBalanceBefore;
            const usdtIncrease = usdtBalance - usdtBalanceBefore;
            const daiIncrease = daiBalance - daiBalanceBefore;
            const mimIncrease = mimBalance - mimBalanceBefore;
            const ramIncrease = ramBalance - ramBalanceBefore;

            // the snapshots have 1.00 USDC, 0.50USDT, 0.50DAI, which lines up with the following
            // 200USDC traded on legacy stable -> 0.50
            // 100USDT traded on legacy stable -> 0.25
            // 100DAI  traded on legacy stable -> 0.25
            // 200USDC traded on cl pool       -> 0.50
            // 100USDT traded on cl pool       -> 0.25
            // 100DAI  traded on cl pool       -> 0.25
            expect(
                {
                    pairIncrease,
                    otherPairIncrease,
                    usdcIncrease,
                    usdtIncrease,
                    daiIncrease,
                    mimIncrease,
                    ramIncrease,
                },
                "rewards don't match snapshot",
            ).to.matchSnapshot();
        });
    });

    describe("#notifyRewardAmount", () => {
        it("should revert other than for minter", async () => {
            // should revert even for deployer
            await expect(
                voter.notifyRewardAmount(1n),
            ).to.be.revertedWithCustomError(voter, "Unauthorized");

            // impersonate minter and add some ETH for gas
            await helpers.impersonateAccount(await c.minter.getAddress());
            const minterSigner = await ethers.getSigner(
                await c.minter.getAddress(),
            );
            await helpers.setBalance(
                await c.minter.getAddress(),
                ethers.parseEther("1000"),
            );

            // add some emission tokens
            await c.emissionsToken.transfer(c.minter.getAddress(), 1n);
            await c.emissionsToken
                .connect(minterSigner)
                .approve(voter.getAddress(), 1n);

            // tx should go through
            await voter.connect(minterSigner).notifyRewardAmount(1n);
        });
    });

    describe("#distribute, distributeForPeriod", () => {
        let emissions: bigint;
        beforeEach("get some votes and fees in", async () => {
            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );

            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();

            emissions = await c.minter.weeklyEmissions();
        });

        it("normal operation on distribute for legacy gauge", async () => {
            const period = await voter.getPeriod();

            const feeDistributor = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForGauge(c.gauge.getAddress()),
            );

            const feeBefore = await c.pair.balanceOf(feeDistributor);
            const rewardsBefore = await c.emissionsToken.balanceOf(c.gauge);

            // get some fees in for distribute to call notifyFees
            await c.pairFactory.setPairFeeSplit(c.pair, 10000);
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );
            await washtradeForFees(c.usdc, c.usdt, true);

            // distribute
            await voter.distribute(c.gauge.getAddress());

            expect(
                await voter.lastDistro(c.gauge.getAddress()),
                "lastDistro not updated",
            ).equal(period);
            expect(
                await voter.gaugePeriodDistributed(
                    c.gauge.getAddress(),
                    period,
                ),
                "gaugePeriodDistributed not updated",
            ).equal(true);
            expect(
                await c.pair.balanceOf(feeDistributor),
                "fee didn't get distributed",
            ).gt(feeBefore);
            expect(
                (await c.emissionsToken.balanceOf(c.gauge)) - rewardsBefore,
                "distributed emissions amount is wrong",
            ).eq(emissions / 2n); // divide by two because the two pools have equal votes
        });

        it("normal operation on distribute for cl gauge", async () => {
            const period = await voter.getPeriod();

            const feeDistributor = await ethers.getContractAt(
                "FeeDistributor",
                await voter.feeDistributorForGauge(c.clGauge.getAddress()),
            );

            // get some fees in for distribute to call notifyFees
            await c.factory.setPoolFeeProtocol(c.clPool, 100);
            await c.nfpManager.mint({
                amount0Desired: ethers.parseEther("1000"),
                amount1Desired: ethers.parseEther("1000"),
                amount0Min: ethers.parseEther("0"),
                amount1Min: ethers.parseEther("0"),
                recipient: deployer.address,
                token0: c.usdt.getAddress(),
                token1: c.usdc.getAddress(),
                tickSpacing: TICK_SPACINGS.STABLE,
                tickLower: getMinTick(TICK_SPACINGS.STABLE),
                tickUpper: getMaxTick(TICK_SPACINGS.STABLE),
                deadline: ethers.MaxUint256,
            });
            await washtradeForFees(c.usdc, c.usdt, false);

            const usdcFeesBefore = await c.usdc.balanceOf(feeDistributor);
            const usdtFeesBefore = await c.usdt.balanceOf(feeDistributor);

            const rewardsBefore = await c.emissionsToken.balanceOf(c.clGauge);

            // distribute
            await voter.distribute(c.clGauge.getAddress());

            const collectedFees = {
                usdc: (await c.usdc.balanceOf(feeDistributor)) - usdcFeesBefore,
                usdt: (await c.usdt.balanceOf(feeDistributor)) - usdtFeesBefore,
            };

            expect(
                await voter.lastDistro(c.clGauge.getAddress()),
                "lastDistro not updated",
            ).equal(period);
            expect(
                await voter.gaugePeriodDistributed(
                    c.clGauge.getAddress(),
                    period,
                ),
                "gaugePeriodDistributed not updated",
            ).equal(true);
            // snapshot is 0.25USDC and 0.25USDT, which is expected
            expect(collectedFees, "collected fees wrong").toMatchSnapshot();
            expect(
                (await c.emissionsToken.balanceOf(c.clGauge)) - rewardsBefore,
                "distributed emissions amount is wrong",
            ).eq(emissions / 2n); // divide by two because the two pools have equal votes
        });

        it("normal operation on distributeForPeriod", async () => {
            const lastDistro = await voter.lastDistro(c.gauge.getAddress());
            let rewardsBefore = await c.emissionsToken.balanceOf(c.clGauge);

            // advance the period just so there more periods to choose from
            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();

            const period = await voter.getPeriod();

            // distribute
            await voter.distributeForPeriod(
                c.clGauge.getAddress(),
                period - 1n,
            );

            expect(
                (await c.emissionsToken.balanceOf(c.clGauge)) - rewardsBefore,
                "distributed emissions amount is wrong",
            ).eq(emissions / 2n); // divide by two because the two pools have equal votes

            expect(
                await voter.gaugePeriodDistributed(c.clGauge, period - 1n),
                "gaugePeriodDistributed not updated",
            ).equal(true);
            emissions = await c.minter.weeklyEmissions();
            rewardsBefore = await c.emissionsToken.balanceOf(c.clGauge);

            // distribute again, with a different period
            await voter.distributeForPeriod(c.clGauge.getAddress(), period);

            expect(
                await voter.gaugePeriodDistributed(c.clGauge, period),
                "gaugePeriodDistributed not updated",
            ).equal(true);
            expect(
                (await c.emissionsToken.balanceOf(c.clGauge)) - rewardsBefore,
                "distributed emissions amount is wrong",
            ).eq(emissions / 2n); // divide by two because the two pools have equal votes
            rewardsBefore = await c.emissionsToken.balanceOf(c.clGauge);

            // distributing with a future period shouldn't send or update anything
            await voter.distributeForPeriod(c.clGauge, period + 1n);

            expect(
                await c.emissionsToken.balanceOf(c.clGauge),
                "distributing future period shouldn't send tokens",
            ).eq(rewardsBefore); // divide by two because the two pools have equal votes
            expect(
                await voter.gaugePeriodDistributed(c.clGauge, period + 1n),
                "gaugePeriodDistributed shouldn't update for a future period",
            ).equal(false);

            expect(
                await voter.lastDistro(c.clGauge),
                "lastDistro should not update",
            ).equal(lastDistro);
        });

        it("distribute should call Minter.updatePeriod() if needed", async () => {
            const activePeriodBefore = await c.minter.activePeriod();

            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );

            await helpers.time.increase(86400 * 7);

            // distribute
            await voter.distribute(c.gauge.getAddress());

            expect(await c.minter.activePeriod(), "minter not updated").not.eq(
                activePeriodBefore,
            );
        });

        it("distribute should call Pool._advancePeriod() if needed", async () => {
            const poolPeriodBefore = await c.clPool.lastPeriod();

            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );

            await helpers.time.increase(86400 * 7);

            // distribute
            await voter.distribute(c.clGauge.getAddress());

            expect(await c.clPool.lastPeriod(), "clPool not updated").not.eq(
                poolPeriodBefore,
            );
        });
    });

    describe("#distributeAll, batchDistribute, batchDistributeByIndex", () => {
        beforeEach("deploy gauges", async () => {
            await loadFixture(batchGaugesFixture);
        });

        it("normal operation on distributeAll", async () => {
            const period = await voter.getPeriod();

            const gauges = await voter.getAllGauges();

            await voter.distributeAll();

            for (let i = 0; i < gauges.length; i++) {
                expect(
                    await voter.gaugePeriodDistributed(gauges[i], period),
                    "gauge not distributed",
                ).equal(true);
            }
        });

        it("normal operation on batchDistribute", async () => {
            const period = await voter.getPeriod();

            const gauges = await voter.getAllGauges();

            await voter.batchDistribute([...gauges]);

            for (let i = 0; i < gauges.length; i++) {
                expect(
                    await voter.gaugePeriodDistributed(gauges[i], period),
                    "gauge not distributed",
                ).equal(true);
            }
        });

        it("normal operation on batchDistributeByIndex", async () => {
            const period = await voter.getPeriod();
            await voter.batchDistributeByIndex(50, 80);

            const gauges = await voter.getAllGauges();
            for (let i = 50; i < 80; i++) {
                expect(
                    await voter.gaugePeriodDistributed(gauges[i], period),
                    "gauge not distributed",
                ).equal(true);
            }
        });
    });

    describe("#view functions", () => {
        it("#getVotes", async () => {
            // should be 0 before any votes
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // vote only on one pool
            await voter.vote(c.tokenId, [c.pair], [1]);

            // should be 1000
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // vote 1:1 on the two pools
            await voter.vote(c.tokenId, [c.pair, c.clPool], [1, 1]);

            // should be 500 ,500
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // vote 1:3 on the two pools
            await voter.vote(c.tokenId, [c.pair, c.clPool], [1, 3]);

            // should be 250 ,750
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // poke votes
            await voter.poke(c.tokenId);

            // should be 250 ,750
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // advance period then poke
            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();
            await voter.poke(c.tokenId);

            // should be 250 ,750
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();

            // reset to 0
            await voter.reset(c.tokenId);

            // should be 0
            expect(await voter.getVotes(c.tokenId)).toMatchSnapshot();
        });

        it("#getAllPools", async () => {
            const allPools = await voter.getAllPools();

            expect(allPools.length, "allPools length not right").eq(2);
            assert(
                allPools.includes(await c.pair.getAddress()),
                "pair not in allPools",
            );
            assert(
                allPools.includes(await c.clPool.getAddress()),
                "clPool not in allPools",
            );
        });

        it("#getAllCustomPools", async () => {
            const customPoolLength = 10;
            const tokens = [];
            for (let i = 0; i < customPoolLength; i++) {
                const { token } = await createArbitraryGauge();
                tokens.push(token);
            }

            const allCustomPools = await voter.getAllCustomPools();

            expect(allCustomPools.length, "allPools length not right").eq(
                customPoolLength,
            );

            for (let i = 0; i < customPoolLength; i++) {
                assert(
                    allCustomPools.includes(await tokens[i].getAddress()),
                    "custom pool not in allCustomPools",
                );
            }
        });

        it("#getAllGauges", async () => {
            const allGauges = await voter.getAllGauges();

            expect(allGauges.length, "getAllGauges length not right").eq(2);
            assert(
                allGauges.includes(await c.gauge.getAddress()),
                "gauge not in allGauges",
            );
            assert(
                allGauges.includes(await c.clGauge.getAddress()),
                "clGauge not in allGauges",
            );
        });

        it("#getAllFeeDistributors", async () => {
            const allFeeDistributors = await voter.getAllFeeDistributors();

            expect(
                allFeeDistributors.length,
                "getAllFeeDistributors length not right",
            ).eq(2);
            assert(
                allFeeDistributors.includes(
                    await c.voter.feeDistributorForGauge(c.gauge),
                ),
                "gauge not in allFeeDistributors",
            );
            assert(
                allFeeDistributors.includes(
                    await c.voter.feeDistributorForGauge(c.clGauge),
                ),
                "clGauge not in allFeeDistributors",
            );
        });

        it("#isGauge", async () => {
            assert(await voter.isGauge(c.gauge), "isGauge for gauge not right");
            assert(
                await voter.isGauge(c.clGauge),
                "isGauge for clGauge not right",
            );
        });

        it("#isFeeDistributor", async () => {
            assert(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(c.gauge),
                ),
                "isFeeDistributor for gauge not right",
            );
            assert(
                await voter.isFeeDistributor(
                    await voter.feeDistributorForGauge(c.clGauge),
                ),
                "isFeeDistributor for clGauge not right",
            );
        });
    });

    describe("#edge cases", () => {
        describe("#Killed then revived gauge shouldn't get both distribute and recovery", () => {
            it("distribute first", async () => {
                // get some emission into the gauge
                await voter.vote(c.tokenId, [c.pair.getAddress()], [1]);
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();

                const period = await voter.getPeriod();
                const balanceBefore = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                // distribute
                await voter.distribute(c.gauge.getAddress());

                const balanceAfter = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                expect(balanceAfter, "balance change after distribute").lt(
                    balanceBefore,
                );

                // kill gauge
                await voter.killGauge(c.gauge.getAddress());

                // recovery shouldn't send tokens
                await voter.stuckEmissionsRecovery(
                    c.gauge.getAddress(),
                    period,
                );

                expect(
                    await c.emissionsToken.balanceOf(voter.getAddress()),
                    "voter sent tokens after already distributed",
                ).eq(balanceAfter);

                // revive gauge
                await voter.reviveGauge(c.gauge.getAddress());

                // second distribute shouldn't send tokens
                await voter.distribute(c.gauge.getAddress());

                expect(
                    await c.emissionsToken.balanceOf(voter.getAddress()),
                    "voter sent tokens after already distributed",
                ).eq(balanceAfter);
            });
            it("recovery first", async () => {
                // get some emission into the gauge
                await voter.vote(c.tokenId, [c.pair.getAddress()], [1]);

                // kill gauge
                await voter.killGauge(c.gauge.getAddress());

                // advance period to make the last period finalized
                await helpers.time.increase(86400 * 7);
                await c.minter.updatePeriod();
                const period = await voter.getPeriod();

                const balanceBefore = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                // recover
                await voter.stuckEmissionsRecovery(
                    c.gauge.getAddress(),
                    period,
                );

                const balanceAfter = await c.emissionsToken.balanceOf(
                    voter.getAddress(),
                );

                expect(balanceAfter, "voter didn't send tokens on recovery").lt(
                    balanceBefore,
                );

                // revive gauge
                await voter.reviveGauge(c.gauge.getAddress());

                // distribute should revert
                await voter.distribute(c.gauge.getAddress());

                expect(
                    await c.emissionsToken.balanceOf(voter.getAddress()),
                    "voter sent tokens after recovery",
                ).eq(balanceAfter);
            });
        });

        it.skip("if there isn't enough claimable to distribute", async () => {
            // currently rewards don't register as gaugePeriodDistributed if _claimable / DURATION == 0
            // and the reward is stuck in the voter indefinitely
            // this is basically dust amount to be fair

            // Ideally it should either accumulate the reward until _claimable / DURATION > 0
            // or be marked as distributed and forfeit the dust

            // @TODO: leaning towards forfeiting dust, it's only 86400 on a 18 decimal token

            // craft votes so _claimable / DURATION
            const emissions = await c.minter.calculateWeeklyEmissions();
            const tokenId = await c.votingEscrow.createLock.staticCall(
                emissions,
                deployer.address,
            );

            await c.votingEscrow.createLock(emissions, deployer.address);

            const DURATION = 86400n * 7n;

            await voter.vote(
                tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [DURATION - 1n, emissions - DURATION + 1n],
            );

            await helpers.time.increase(DURATION);
            await c.minter.updatePeriod();

            // distribute when _claimable / DURATION == 0 shouldn't send it to the gauge
            const balanceBefore = await c.emissionsToken.balanceOf(
                c.gauge.getAddress(),
            );
            await voter.distribute(c.gauge.getAddress());
            expect(
                await c.emissionsToken.balanceOf(c.gauge.getAddress()),
                "gauge notified when _claimable / DURATION == 0",
            ).equal(balanceBefore);

            // make some more votes and let reward accumulate to _claimable / DURATION > 1
            await voter.vote(
                tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [DURATION - 1n, emissions - DURATION + 1n],
            );

            // the rewards should either be distributed or marked as dust
            const period = await voter.getPeriod();
            expect(
                await voter.gaugePeriodDistributed(
                    c.gauge.getAddress(),
                    period,
                ),
                "dust not distributed or marked",
            ).equal(true);
        });

        it.skip("if a week of distribute is missed all distribute should happen at once", async () => {
            // currently rewards for legacy gauges aren't guaranteed to accumulate
            // since subsequent week's rewards can be smaller than left()

            // this means if the protocol misses distribution for a week it can delay all
            // subsequent weeks, and an attacker can start the sequence by manually notifying
            // some rewards

            // @TODO: let voter be able to override left() since it can't be malicious (worst case is it lengthens the distribution by 1 week)

            // simulate missing distribute for a week
            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );

            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();

            await voter.vote(
                c.tokenId,
                [c.pair.getAddress(), c.clPool.getAddress()],
                [1, 1],
            );

            await helpers.time.increase(86400 * 7);
            await c.minter.updatePeriod();

            // the rewards should either be distributed
            const period = await voter.getPeriod();
            expect(
                (await voter.gaugePeriodDistributed(
                    c.gauge.getAddress(),
                    period,
                )) &&
                    (await voter.gaugePeriodDistributed(
                        c.gauge.getAddress(),
                        period - 1n,
                    )),
                "not all rewards are distributed",
            ).equal(true);
        });

        it("delegate should reset on transfer", async () => {
            // delegate to a random address
            await c.votingEscrow.delegate(c.minter.getAddress(), c.tokenId);
            const delegateeBefore = await c.votingEscrow.idToDelegate(
                c.tokenId,
            );

            expect(delegateeBefore).eq(
                await c.minter.getAddress(),
                "delegate not working",
            );

            await c.votingEscrow["safeTransferFrom(address,address,uint256)"](
                deployer.address,
                attacker.address,
                c.tokenId,
            );
            const delegatee = await c.votingEscrow.idToDelegate(c.tokenId);

            expect(delegatee).eq(
                ethers.ZeroAddress,
                "delegate not reset after transfer",
            );
        });

        it("test router getAmountsIn with swapExactTokensForTokens", async () => {
            // deposit into the pair
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );

            // make the pair unbalanced
            await c.router.swapExactTokensForTokens(
                ethers.parseEther("20"),
                0n,
                [
                    {
                        from: await c.usdc.getAddress(),
                        to: await c.usdt.getAddress(),
                        stable: true,
                    },
                ],
                deployer.address,
                ethers.MaxUint256,
            );

            const targetOut = ethers.parseEther("100");
            const quoteIn = await c.router.getAmountsIn(targetOut, [
                {
                    from: await c.usdc.getAddress(),
                    to: await c.usdt.getAddress(),
                    stable: true,
                },
            ]);

            const balanceBefore = await c.usdt.balanceOf(deployer.address);

            await c.router.swapExactTokensForTokens(
                quoteIn[0],
                0n,
                [
                    {
                        from: await c.usdc.getAddress(),
                        to: await c.usdt.getAddress(),
                        stable: true,
                    },
                ],
                deployer.address,
                ethers.MaxUint256,
            );

            const amountOut =
                (await c.usdt.balanceOf(deployer.address)) - balanceBefore;

            expect(amountOut).eq(targetOut, "getAmountsIn not working");
        });

        it("test router getAmountsIn with swapTokensForExactTokens", async () => {
            // deposit into the pair
            await c.router.addLiquidity(
                c.usdc.getAddress(),
                c.usdt.getAddress(),
                true,
                ethers.parseEther("1000"),
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
            );

            // make the pair unbalanced
            await c.router.swapExactTokensForTokens(
                ethers.parseEther("20"),
                0n,
                [
                    {
                        from: await c.usdc.getAddress(),
                        to: await c.usdt.getAddress(),
                        stable: true,
                    },
                ],
                deployer.address,
                ethers.MaxUint256,
            );

            const targetOut = ethers.parseEther("100");
            const quoteIn = await c.router.getAmountsIn(targetOut, [
                {
                    from: await c.usdc.getAddress(),
                    to: await c.usdt.getAddress(),
                    stable: true,
                },
            ]);

            const balanceBefore = await c.usdc.balanceOf(deployer.address);

            await c.router.swapTokensForExactTokens(
                targetOut,
                ethers.MaxUint256,
                [
                    {
                        from: await c.usdc.getAddress(),
                        to: await c.usdt.getAddress(),
                        stable: true,
                    },
                ],
                deployer.address,
                ethers.MaxUint256,
            );

            const usdtPaid =
                balanceBefore - (await c.usdc.balanceOf(deployer.address));

            expect(usdtPaid).eq(quoteIn[0], "getAmountsIn not working");
        });
    });
});
