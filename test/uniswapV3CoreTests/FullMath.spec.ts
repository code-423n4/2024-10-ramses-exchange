import { ethers } from "hardhat";
import { FullMathTest } from "./../../typechain-types";
import { expect } from "./shared/expect";
import { Decimal } from "decimal.js";

const Q128 = 2n ** 128n;

Decimal.config({ toExpNeg: -500, toExpPos: 500 });

describe("FullMath", () => {
    let fullMath: FullMathTest;
    before("deploy FullMathTest", async () => {
        const factory = await ethers.getContractFactory("FullMathTest");
        fullMath = (await factory.deploy()) as FullMathTest;
    });

    describe("#mulDiv", () => {
        it("reverts if denominator is 0", async () => {
            await expect(fullMath.mulDiv(Q128, 5, 0)).to.be.reverted;
        });
        it("reverts if denominator is 0 and numerator overflows", async () => {
            await expect(fullMath.mulDiv(Q128, Q128, 0)).to.be.reverted;
        });
        it("reverts if output overflows uint256", async () => {
            await expect(fullMath.mulDiv(Q128, Q128, 1)).to.be.reverted;
        });
        it("reverts if output overflows uint256", async () => {
            await expect(fullMath.mulDiv(Q128, Q128, 1)).to.be.reverted;
        });
        it("reverts on overflow with all max inputs", async () => {
            await expect(
                fullMath.mulDiv(
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                    ethers.MaxUint256 - 1n,
                ),
            ).to.be.reverted;
        });

        it("all max inputs", async () => {
            expect(
                await fullMath.mulDiv(
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                ),
            ).to.eq(ethers.MaxUint256);
        });

        it("accurate without phantom overflow", async () => {
            const result = Q128 / 3n;
            expect(
                await fullMath.mulDiv(
                    Q128,
                    /*0.5=*/ (50n * Q128) / 100n,
                    /*1.5=*/ (150n * Q128) / 100n,
                ),
            ).to.eq(result);
        });

        it("accurate with phantom overflow", async () => {
            const result = (4375n * Q128) / 1000n;
            expect(await fullMath.mulDiv(Q128, 35n * Q128, 8n * Q128)).to.eq(
                result,
            );
        });

        it("accurate with phantom overflow and repeating decimal", async () => {
            const result = (1n * Q128) / 3n;
            expect(
                await fullMath.mulDiv(Q128, 1000n * Q128, 3000n * Q128),
            ).to.eq(result);
        });
    });

    describe("#mulDivRoundingUp", () => {
        it("reverts if denominator is 0", async () => {
            await expect(fullMath.mulDivRoundingUp(Q128, 5, 0)).to.be.reverted;
        });
        it("reverts if denominator is 0 and numerator overflows", async () => {
            await expect(fullMath.mulDivRoundingUp(Q128, Q128, 0)).to.be
                .reverted;
        });
        it("reverts if output overflows uint256", async () => {
            await expect(fullMath.mulDivRoundingUp(Q128, Q128, 1)).to.be
                .reverted;
        });
        it("reverts on overflow with all max inputs", async () => {
            await expect(
                fullMath.mulDivRoundingUp(
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                    ethers.MaxUint256 - 1n,
                ),
            ).to.be.reverted;
        });

        it("reverts if mulDiv overflows 256 bits after rounding up", async () => {
            await expect(
                fullMath.mulDivRoundingUp(
                    "535006138814359",
                    "432862656469423142931042426214547535783388063929571229938474969",
                    "2",
                ),
            ).to.be.reverted;
        });

        it("reverts if mulDiv overflows 256 bits after rounding up case 2", async () => {
            await expect(
                fullMath.mulDivRoundingUp(
                    "115792089237316195423570985008687907853269984659341747863450311749907997002549",
                    "115792089237316195423570985008687907853269984659341747863450311749907997002550",
                    "115792089237316195423570985008687907853269984653042931687443039491902864365164",
                ),
            ).to.be.reverted;
        });

        it("all max inputs", async () => {
            expect(
                await fullMath.mulDivRoundingUp(
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                    ethers.MaxUint256,
                ),
            ).to.eq(ethers.MaxUint256);
        });

        it("accurate without phantom overflow", async () => {
            const result = Q128 / 3n + 1n;
            expect(
                await fullMath.mulDivRoundingUp(
                    Q128,
                    /*0.5=*/ (50n * Q128) / 100n,
                    /*1.5=*/ (150n * Q128) / 100n,
                ),
            ).to.eq(result);
        });

        it("accurate with phantom overflow", async () => {
            const result = (4375n * Q128) / 1000n;
            expect(
                await fullMath.mulDivRoundingUp(Q128, 35n * Q128, 8n * Q128),
            ).to.eq(result);
        });

        it("accurate with phantom overflow and repeating decimal", async () => {
            const result = (1n * Q128) / 3n + 1n;
            expect(
                await fullMath.mulDivRoundingUp(
                    Q128,
                    1000n * Q128,
                    3000n * Q128,
                ),
            ).to.eq(result);
        });
    });

    function pseudoRandomBigNumber() {
        return BigInt(
            new Decimal(ethers.MaxUint256.toString())
                .mul(Math.random().toString())
                .round()
                .toString(),
        );
    }

    // tiny fuzzer. unskip to run
    it.skip("check a bunch of random inputs against JS implementation", async () => {
        // generates random inputs
        const tests = Array(1_000)
            .fill(null)
            .map(() => {
                return {
                    x: pseudoRandomBigNumber(),
                    y: pseudoRandomBigNumber(),
                    d: pseudoRandomBigNumber(),
                };
            })
            .map(({ x, y, d }) => {
                return {
                    input: {
                        x,
                        y,
                        d,
                    },
                    floored: fullMath.mulDiv(x, y, d),
                    ceiled: fullMath.mulDivRoundingUp(x, y, d),
                };
            });

        await Promise.all(
            tests.map(async ({ input: { x, y, d }, floored, ceiled }) => {
                if (d == 0n) {
                    await expect(floored).to.be.reverted;
                    await expect(ceiled).to.be.reverted;
                    return;
                }

                if (x == 0n || y == 0n) {
                    expect(await floored).to.eq(0n);
                    expect(await ceiled).to.eq(0n);
                } else if ((x * y) / d > ethers.MaxUint256) {
                    await expect(floored).to.be.reverted;
                    await expect(ceiled).to.be.reverted;
                } else {
                    expect(await floored).to.eq((x * y) / d);
                    expect(await ceiled).to.eq(
                        (x * y) / d + ((x * y) % d > 0n ? 1n : 0n),
                    );
                }
            }),
        );
    });
});
