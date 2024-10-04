import { BigNumberish } from "ethers";
import { expect } from "chai";
// helper function because we cannot do a simple deep equals with the
// observation result object returned from ethers because it extends array
export default function checkObservationEquals(
  {
    tickCumulative,
    blockTimestamp,
    initialized,
    secondsPerLiquidityCumulativeX128,
  }: {
    tickCumulative: bigint;
    secondsPerLiquidityCumulativeX128: bigint;
    initialized: boolean;
    blockTimestamp: bigint;
  },
  expected: {
    tickCumulative: bigint;
    secondsPerLiquidityCumulativeX128: BigNumberish;
    initialized: boolean;
    blockTimestamp: bigint;
  },
) {
  expect(
    {
      initialized,
      blockTimestamp,
      tickCumulative: tickCumulative.toString(),
      secondsPerLiquidityCumulativeX128:
        secondsPerLiquidityCumulativeX128.toString(),
    },
    `observation is equivalent`,
  ).to.deep.eq({
    ...expected,
    tickCumulative: expected.tickCumulative.toString(),
    secondsPerLiquidityCumulativeX128:
      expected.secondsPerLiquidityCumulativeX128.toString(),
  });
}
