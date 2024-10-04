// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import {Tick} from '../libraries/Tick.sol';
import {TickInfo} from '../libraries/PoolStorage.sol';

contract TickTest {
    using Tick for mapping(int24 => TickInfo);

    mapping(int24 => TickInfo) public ticks;

    function tickSpacingToMaxLiquidityPerTick(int24 tickSpacing) external pure returns (uint128) {
        return Tick.tickSpacingToMaxLiquidityPerTick(tickSpacing);
    }

    struct SetTickParams {
        int24 tick;
        uint128 liquidityGross;
        int128 liquidityNet;
        uint128 boostedLiquidityGross;
        int128 boostedLiquidityNet;
        uint256 feeGrowthOutside0X128;
        uint256 feeGrowthOutside1X128;
        int56 tickCumulativeOutside;
        uint160 secondsPerLiquidityOutsideX128;
        uint32 secondsOutside;
        bool initialized;
    }

    function setTick(SetTickParams calldata params) external {
        ticks[params.tick].liquidityGross = params.liquidityGross;
        ticks[params.tick].liquidityNet = params.liquidityNet;
        ticks[params.tick].feeGrowthOutside0X128 = params.feeGrowthOutside0X128;
        ticks[params.tick].feeGrowthOutside1X128 = params.feeGrowthOutside1X128;
        ticks[params.tick].tickCumulativeOutside = params.tickCumulativeOutside;
        ticks[params.tick].secondsPerLiquidityOutsideX128 = params.secondsPerLiquidityOutsideX128;
        ticks[params.tick].secondsOutside = params.secondsOutside;
        ticks[params.tick].initialized = params.initialized;
    }

    function getFeeGrowthInside(
        int24 tickLower,
        int24 tickUpper,
        int24 tickCurrent,
        uint256 feeGrowthGlobal0X128,
        uint256 feeGrowthGlobal1X128
    ) external view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) {
        return ticks.getFeeGrowthInside(tickLower, tickUpper, tickCurrent, feeGrowthGlobal0X128, feeGrowthGlobal1X128);
    }

    function update(
        int24 tick,
        int24 tickCurrent,
        int128 liquidityDelta,
        uint256 feeGrowthGlobal0X128,
        uint256 feeGrowthGlobal1X128,
        uint160 secondsPerLiquidityCumulativeX128,
        int56 tickCumulative,
        uint32 time,
        bool upper,
        uint128 maxLiquidity
    ) external returns (bool flipped) {
        return
            ticks.update(
                tick,
                tickCurrent,
                liquidityDelta,
                feeGrowthGlobal0X128,
                feeGrowthGlobal1X128,
                secondsPerLiquidityCumulativeX128,
                tickCumulative,
                time,
                upper,
                maxLiquidity
            );
    }

    function clear(int24 tick) external {
        ticks.clear(tick, block.timestamp / 1 weeks);
    }

    function cross(
        int24 tick,
        uint256 feeGrowthGlobal0X128,
        uint256 feeGrowthGlobal1X128,
        uint160 secondsPerLiquidityCumulativeX128,
        int56 tickCumulative,
        uint32 time
    ) external returns (int128 liquidityNet) {
        return
            ticks.cross(
                tick,
                feeGrowthGlobal0X128,
                feeGrowthGlobal1X128,
                secondsPerLiquidityCumulativeX128,
                tickCumulative,
                time,
                0,
                0
            );
    }
}
