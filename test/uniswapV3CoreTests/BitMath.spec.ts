import { expect } from "./shared/expect";
import { BitMathTest } from "./../../typechain-types";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import snapshotGasCost from "./shared/snapshotGasCost";

describe("BitMath", () => {
    let bitMath: BitMathTest;
    const fixture = async () => {
        const factory = await ethers.getContractFactory("BitMathTest");
        return (await factory.deploy()) as BitMathTest;
    };
    beforeEach("deploy BitMathTest", async () => {
        bitMath = await loadFixture(fixture);
    });

    describe("#mostSignificantBit", () => {
        it("0", async () => {
            await expect(bitMath.mostSignificantBit(0)).to.be.reverted;
        });
        it("1", async () => {
            expect(await bitMath.mostSignificantBit(1)).to.eq(0);
        });
        it("2", async () => {
            expect(await bitMath.mostSignificantBit(2)).to.eq(1);
        });
        it("all powers of 2", async () => {
            const results = await Promise.all(
                [...Array(255)].map((_, i) =>
                    bitMath.mostSignificantBit(2n ** BigInt(i)),
                ),
            );
            expect(results).to.deep.eq([...Array(255)].map((_, i) => i));
        });
        it("uint256(-1)", async () => {
            expect(await bitMath.mostSignificantBit(2n ** 256n - 1n)).to.eq(
                255n,
            );
        });

        it("gas cost of smaller number", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfMostSignificantBit(3568n),
            );
        });
        it("gas cost of max uint128", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfMostSignificantBit(2n ** 128n - 1n),
            );
        });
        it("gas cost of max uint256", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfMostSignificantBit(2n ** 128n - 1n),
            );
        });
    });

    describe("#leastSignificantBit", () => {
        it("0", async () => {
            await expect(bitMath.leastSignificantBit(0)).to.be.reverted;
        });
        it("1", async () => {
            expect(await bitMath.leastSignificantBit(1)).to.eq(0);
        });
        it("2", async () => {
            expect(await bitMath.leastSignificantBit(2)).to.eq(1);
        });
        it("all powers of 2", async () => {
            const results = await Promise.all(
                [...Array(255)].map((_, i) =>
                    bitMath.leastSignificantBit(2n ** BigInt(i)),
                ),
            );
            expect(results).to.deep.eq([...Array(255)].map((_, i) => i));
        });
        it("uint256(-1)", async () => {
            expect(await bitMath.leastSignificantBit(2n ** 256n - 1n)).to.eq(0);
        });

        it("gas cost of smaller number", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfLeastSignificantBit(3568n),
            );
        });
        it("gas cost of max uint128", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfLeastSignificantBit(2n ** 128n - 1n),
            );
        });
        it("gas cost of max uint256", async () => {
            await snapshotGasCost(
                bitMath.getGasCostOfLeastSignificantBit(2n ** 256n - 1n),
            );
        });
    });
});
