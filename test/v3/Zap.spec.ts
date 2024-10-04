import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { testFixture } from "../../scripts/deployment/testFixture";
import { Voter } from "../../typechain-types";
import { expect } from "../uniswapV3CoreTests/shared/expect";
import * as typechain from "../../typechain-types";

describe("Zap", () => {
    let c: Awaited<ReturnType<typeof zapTestFixture>>;
    let voter: Voter;
    let router: typechain.Router;
    let pair: typechain.Pair;
    let gauge: typechain.Gauge;
    let wethPair: typechain.Pair;
    let wethGauge: typechain.Gauge;
    let deployer: HardhatEthersSigner;
    let attacker: HardhatEthersSigner;
    const fixture = testFixture;

    async function zapTestFixture() {
        const suite = await loadFixture(fixture);
        await suite.weth.approve(suite.router, ethers.MaxUint256);

        // create a weth pool
        const pairAddress = await suite.pairFactory.createPair.staticCall(
            await suite.weth.getAddress(),
            await suite.usdc.getAddress(),
            true,
        );
        await suite.pairFactory.createPair(
            await suite.weth.getAddress(),
            await suite.usdc.getAddress(),
            true,
        );

        let wethPair = await ethers.getContractAt("Pair", pairAddress);

        const gaugeAddress =
            await suite.voter.createGauge.staticCall(pairAddress);
        await suite.voter.createGauge(pairAddress);
        const wethGauge = await ethers.getContractAt("Gauge", gaugeAddress);

        // set pool fees to 0.25% so it's uniform
        await suite.pairFactory.setPairFee(suite.pair, 25);

        // set protocol fees for cl to be 100% so it's easier to track fee changes
        await suite.factory.setFeeProtocol(100);
        await suite.factory.setPoolFeeProtocol(suite.clPool, 100);

        // set fees to be 0.25% so it's uniform across legacy and cl
        await suite.factory.setFee(suite.clPool, 2500);
        await suite.pairFactory.setFee(25);
        return { ...suite, wethPair, wethGauge };
    }

    beforeEach("deploy fixture", async () => {
        c = await loadFixture(zapTestFixture);

        voter = c.voter;
        router = c.router;
        pair = c.pair;
        gauge = c.gauge;
        wethPair = c.wethPair;
        wethGauge = c.wethGauge;
        [deployer, attacker] = await ethers.getSigners();
    });

    describe("#zap in", () => {
        it("addLiquidityAndStake", async () => {
            expect(
                await gauge.balanceOf(deployer),
                "there shouldn't be starting balance",
            ).eq(0n);
            expect(
                await pair.balanceOf(deployer),
                "there shouldn't be starting balance",
            ).eq(0n);

            // zap into gauge
            await c.router.addLiquidityAndStake(
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

            expect(
                await pair.balanceOf(deployer),
                "balance shouldn't go to user",
            ).eq(0n);
            expect(
                await gauge.balanceOf(deployer),
                "user should have stakes",
            ).matchSnapshot();
        });
        it("addLiquidityETHAndStake", async () => {
            expect(
                await wethGauge.balanceOf(deployer),
                "there shouldn't be starting balance",
            ).eq(0n);
            expect(
                await wethPair.balanceOf(deployer),
                "there shouldn't be starting balance",
            ).eq(0n);

            // zap into gauge
            await c.router.addLiquidityETHAndStake(
                c.usdc.getAddress(),
                true,
                ethers.parseEther("1000"),
                0n,
                0n,
                deployer.address,
                ethers.MaxUint256,
                { value: ethers.parseEther("1000") },
            );

            expect(
                await wethPair.balanceOf(deployer),
                "balance shouldn't go to user",
            ).eq(0n);
            expect(
                await wethGauge.balanceOf(deployer),
                "user should have stakes",
            ).matchSnapshot();
        });
    });
});
