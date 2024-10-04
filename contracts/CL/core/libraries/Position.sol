// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {FullMath} from './FullMath.sol';
import {FixedPoint128} from './FixedPoint128.sol';
import {FixedPoint32} from './FixedPoint32.sol';
import {FixedPoint96} from './FixedPoint96.sol';
import {Oracle} from './Oracle.sol';
import {SafeCast} from './SafeCast.sol';
import {Tick} from './Tick.sol';
import {TickBitmap} from './TickBitmap.sol';

import {PoolStorage, PositionInfo, PositionCheckpoint, RewardInfo} from './PoolStorage.sol';

/// @title Position
/// @notice Positions represent an owner address' liquidity between a lower and upper tick boundary
/// @dev Positions store additional state for tracking fees owed to the position
library Position {
    error NP();
    error FTR();

    /// @notice Returns the hash used to store positions in a mapping
    /// @param owner The address of the position owner
    /// @param index The index of the position
    /// @param tickLower The lower tick boundary of the position
    /// @param tickUpper The upper tick boundary of the position
    /// @return _hash The hash used to store positions in a mapping
    function positionHash(
        address owner,
        uint256 index,
        int24 tickLower,
        int24 tickUpper
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, index, tickLower, tickUpper));
    }

    /// @notice Returns the Info struct of a position, given an owner and position boundaries
    /// @param self The mapping containing all user positions
    /// @param owner The address of the position owner
    /// @param tickLower The lower tick boundary of the position
    /// @param tickUpper The upper tick boundary of the position
    /// @return position The position info struct of the given owners' position
    function get(
        mapping(bytes32 => PositionInfo) storage self,
        address owner,
        uint256 index,
        int24 tickLower,
        int24 tickUpper
    ) internal view returns (PositionInfo storage position) {
        position = self[positionHash(owner, index, tickLower, tickUpper)];
    }

    /// @notice Credits accumulated fees to a user's position
    /// @param self The individual position to update
    /// @param liquidityDelta The change in pool liquidity as a result of the position update
    /// @param feeGrowthInside0X128 The all-time fee growth in token0, per unit of liquidity, inside the position's tick boundaries
    /// @param feeGrowthInside1X128 The all-time fee growth in token1, per unit of liquidity, inside the position's tick boundaries
    function update(
        PositionInfo storage self,
        int128 liquidityDelta,
        uint256 feeGrowthInside0X128,
        uint256 feeGrowthInside1X128,
        bytes32 _positionHash,
        uint256 period,
        uint160 secondsPerLiquidityPeriodX128
    ) internal {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        uint128 liquidity = self.liquidity;
        uint128 liquidityNext;

        if (liquidityDelta == 0) {
            /// @dev disallow pokes for 0 liquidity positions
            if (liquidity <= 0) revert NP();
            liquidityNext = liquidity;
        } else {
            liquidityNext = liquidityDelta < 0
                ? liquidity - uint128(-liquidityDelta)
                : liquidity + uint128(liquidityDelta);
        }

        /// @dev calculate accumulated fees. overflow in the subtraction of fee growth is expected
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        unchecked {
            tokensOwed0 = uint128(
                FullMath.mulDiv(feeGrowthInside0X128 - self.feeGrowthInside0LastX128, liquidity, FixedPoint128.Q128)
            );
            tokensOwed1 = uint128(
                FullMath.mulDiv(feeGrowthInside1X128 - self.feeGrowthInside1LastX128, liquidity, FixedPoint128.Q128)
            );

            /// @dev update the position
            if (liquidityDelta != 0) self.liquidity = liquidityNext;
            self.feeGrowthInside0LastX128 = feeGrowthInside0X128;
            self.feeGrowthInside1LastX128 = feeGrowthInside1X128;
            if (tokensOwed0 > 0 || tokensOwed1 > 0) {
                /// @dev overflow is acceptable, user must withdraw before they hit type(uint128).max fees
                self.tokensOwed0 += tokensOwed0;
                self.tokensOwed1 += tokensOwed1;
            }
        }

        /// @dev write checkpoint, push a checkpoint if the last period is different, overwrite if not
        uint256 checkpointLength = $.positionCheckpoints[_positionHash].length;
        if (checkpointLength == 0 || $.positionCheckpoints[_positionHash][checkpointLength - 1].period != period) {
            $.positionCheckpoints[_positionHash].push(PositionCheckpoint({period: period, liquidity: liquidityNext}));
        } else {
            $.positionCheckpoints[_positionHash][checkpointLength - 1].liquidity = liquidityNext;
        }

        int160 secondsPerLiquidityPeriodIntX128 = int160(secondsPerLiquidityPeriodX128);

        int160 secondsPerLiquidityPeriodStartX128 = self.periodRewardInfo[period].secondsPerLiquidityPeriodStartX128;

        /// @dev take the difference to make the delta positive or zero
        secondsPerLiquidityPeriodIntX128 -= secondsPerLiquidityPeriodStartX128;

        /// @dev these int should never be negative
        if (secondsPerLiquidityPeriodIntX128 < 0) {
            secondsPerLiquidityPeriodIntX128 = 0;
        }

        /// @dev secondsDebtDeltaX96 is declared differently based on the liquidityDelta
        int256 secondsDebtDeltaX96 = liquidityDelta > 0
        /// @dev case: delta > 0
            ? SafeCast.toInt256(
                /// @dev round upwards
                FullMath.mulDivRoundingUp(
                    uint256(uint128(liquidityDelta)),
                    uint256(uint160(secondsPerLiquidityPeriodIntX128)),
                    FixedPoint32.Q32
                )
            )
        /// @dev case: delta <= 0
            : SafeCast.toInt256(
                /// @dev round downwards 
                FullMath.mulDiv(
                    /// @dev flip liquidityDelta sign 
                    uint256(uint128(-liquidityDelta)),
                    uint256(uint160(secondsPerLiquidityPeriodIntX128)),
                    FixedPoint32.Q32
                )
            );

        self.periodRewardInfo[period].secondsDebtX96 = liquidityDelta > 0
            ? self.periodRewardInfo[period].secondsDebtX96 + secondsDebtDeltaX96 /// @dev can't overflow since each period is way less than uint31
            : self.periodRewardInfo[period].secondsDebtX96 - secondsDebtDeltaX96;
    }

    /// @notice gets the checkpoint directly before the period
    /// @dev returns the 0th index if there's no checkpoints
    /// @param checkpoints the position's checkpoints in storage
    /// @param period the period of interest
    function getCheckpoint(
        PositionCheckpoint[] storage checkpoints,
        uint256 period
    ) internal view returns (uint256 checkpointIndex, uint256 checkpointPeriod) {
        {
            uint256 checkpointLength = checkpoints.length;

            /// @dev return 0 if length is 0
            if (checkpointLength == 0) {
                return (0, 0);
            }

            checkpointPeriod = checkpoints[0].period;

            /// @dev return 0 if first checkpoint happened after period
            if (checkpointPeriod > period) {
                return (0, 0);
            }

            checkpointIndex = checkpointLength - 1;
        }

        checkpointPeriod = checkpoints[checkpointIndex].period;

        /// @dev Find relevant checkpoint if latest checkpoint isn't before period of interest
        if (checkpointPeriod > period) {
            uint256 lower = 0;
            uint256 upper = checkpointIndex;

            while (upper > lower) {
                /// @dev ceil, avoiding overflow
                uint256 center = upper - (upper - lower) / 2;
                checkpointPeriod = checkpoints[center].period;
                if (checkpointPeriod == period) {
                    checkpointIndex = center;
                    return (checkpointIndex, checkpointPeriod);
                } else if (checkpointPeriod < period) {
                    lower = center;
                } else {
                    upper = center - 1;
                }
            }
            checkpointIndex = lower;
            checkpointPeriod = checkpoints[checkpointIndex].period;
        }

        return (checkpointIndex, checkpointPeriod);
    }

    struct PositionPeriodSecondsInRangeParams {
        uint256 period;
        address owner;
        uint256 index;
        int24 tickLower;
        int24 tickUpper;
        uint32 _blockTimestamp;
    }

    /// @notice Get the period seconds in range of a specific position
    /// @return periodSecondsInsideX96 seconds the position was not in range for the period
    function positionPeriodSecondsInRange(
        PositionPeriodSecondsInRangeParams memory params
    ) public view returns (uint256 periodSecondsInsideX96) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        uint256 currentPeriod = $.lastPeriod;
        if (params.period > currentPeriod) revert FTR();

        bytes32 _positionHash = positionHash(params.owner, params.index, params.tickLower, params.tickUpper);

        uint256 liquidity;
        int160 secondsPerLiquidityPeriodStartX128;

        PositionCheckpoint[] storage checkpoints = $.positionCheckpoints[_positionHash];

        /// @dev get checkpoint at period, or last checkpoint before the period
        (uint256 checkpointIndex, uint256 checkpointPeriod) = getCheckpoint(checkpoints, params.period);

        /// @dev Return 0s if checkpointPeriod is 0
        if (checkpointPeriod == 0) {
            return 0;
        }

        liquidity = checkpoints[checkpointIndex].liquidity;

        secondsPerLiquidityPeriodStartX128 = $
            .positions[_positionHash]
            .periodRewardInfo[params.period]
            .secondsPerLiquidityPeriodStartX128;

        uint160 secondsPerLiquidityInsideX128 = Oracle.periodCumulativesInside(
            uint32(params.period),
            params.tickLower,
            params.tickUpper,
            params._blockTimestamp
        );

        /// @dev underflow will be protected by sanity check
        secondsPerLiquidityInsideX128 = uint160(
            int160(secondsPerLiquidityInsideX128) - secondsPerLiquidityPeriodStartX128
        );

        RewardInfo storage rewardInfo = $.positions[_positionHash].periodRewardInfo[params.period];
        int256 secondsDebtX96 = rewardInfo.secondsDebtX96;

        /// @dev addDelta checks for under and overflows
        periodSecondsInsideX96 = FullMath.mulDiv(liquidity, secondsPerLiquidityInsideX128, FixedPoint32.Q32);

        /// @dev Need to check if secondsDebtX96>periodSecondsInsideX96, since rounding can cause underflows
        if (secondsDebtX96 < 0 || periodSecondsInsideX96 > uint256(secondsDebtX96)) {
            periodSecondsInsideX96 = secondsDebtX96 < 0
                ? periodSecondsInsideX96 + uint256(-secondsDebtX96)
                : periodSecondsInsideX96 - uint256(secondsDebtX96);
        } else {
            periodSecondsInsideX96 = 0;
        }

        /// @dev sanity
        if (periodSecondsInsideX96 > 1 weeks * FixedPoint96.Q96) {
            periodSecondsInsideX96 = 0;
        }
    }

    struct UpdatePositionParams {
        /// @dev the owner of the position
        address owner;
        /// @dev the index of the position
        uint256 index;
        /// @dev the lower tick of the position's tick range
        int24 tickLower;
        /// @dev the upper tick of the position's tick range
        int24 tickUpper;
        /// @dev the amount liquidity changes by
        int128 liquidityDelta;
        /// @dev the current tick, passed to avoid sloads
        int24 tick;
        uint32 _blockTimestamp;
        int24 tickSpacing;
        uint128 maxLiquidityPerTick;
    }

    /// @dev Gets and updates a position with the given liquidity delta
    /// @param params the position details and the change to the position's liquidity to effect
    function _updatePosition(UpdatePositionParams memory params) external returns (PositionInfo storage position) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        /// @dev calculate the period once, and reuse it
        uint256 period = params._blockTimestamp / 1 weeks;

        /// @dev precompute the position hash
        bytes32 _positionHash = positionHash(params.owner, params.index, params.tickLower, params.tickUpper);

        /// @dev fetch the position using the precomputed _positionHash
        position = $.positions[_positionHash];

        /// @dev SLOAD for gas optimization
        uint256 _feeGrowthGlobal0X128 = $.feeGrowthGlobal0X128;
        uint256 _feeGrowthGlobal1X128 = $.feeGrowthGlobal1X128;

        /// @dev use the tick from `$.slot0` instead of `params.tick` for consistency
        int24 currentTick = $.slot0.tick;

        /// @dev check and update ticks if needed
        bool flippedLower;
        bool flippedUpper;
        if (params.liquidityDelta != 0) {
            /// @dev directly use params._blockTimestamp instead of creating a new `time` variable
            (int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128) = Oracle.observeSingle(
                $.observations,
                params._blockTimestamp,
                0,
                currentTick, /// @dev use `currentTick` consistently
                $.slot0.observationIndex,
                $.liquidity,
                $.slot0.observationCardinality
            );

            flippedLower = Tick.update(
                $._ticks,
                params.tickLower,
                currentTick, /// @dev use `currentTick` consistently
                params.liquidityDelta,
                _feeGrowthGlobal0X128,
                _feeGrowthGlobal1X128,
                secondsPerLiquidityCumulativeX128,
                tickCumulative,
                params._blockTimestamp,
                false,
                params.maxLiquidityPerTick
            );
            flippedUpper = Tick.update(
                $._ticks,
                params.tickUpper,
                currentTick, /// @dev use `currentTick` consistently
                params.liquidityDelta,
                _feeGrowthGlobal0X128,
                _feeGrowthGlobal1X128,
                secondsPerLiquidityCumulativeX128,
                tickCumulative,
                params._blockTimestamp,
                true,
                params.maxLiquidityPerTick
            );

            /// @dev flip ticks if needed
            if (flippedLower) {
                TickBitmap.flipTick($.tickBitmap, params.tickLower, params.tickSpacing);
            }
            if (flippedUpper) {
                TickBitmap.flipTick($.tickBitmap, params.tickUpper, params.tickSpacing);
            }
        }

        /// @dev calculate the fee growth inside
        (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128) = Tick.getFeeGrowthInside(
            $._ticks,
            params.tickLower,
            params.tickUpper,
            currentTick, /// @dev use `currentTick` consistently
            _feeGrowthGlobal0X128,
            _feeGrowthGlobal1X128
        );

        /// @dev get the seconds per liquidity period cumulatives
        uint160 secondsPerLiquidityPeriodX128 = Oracle.periodCumulativesInside(
            uint32(period),
            params.tickLower,
            params.tickUpper,
            params._blockTimestamp
        );

        /// @dev initialize position reward info if needed
        if (!position.periodRewardInfo[period].initialized || position.liquidity == 0) {
            initializeSecondsStart(
                position,
                PositionPeriodSecondsInRangeParams({
                    period: period,
                    owner: params.owner,
                    index: params.index,
                    tickLower: params.tickLower,
                    tickUpper: params.tickUpper,
                    _blockTimestamp: params._blockTimestamp
                }),
                secondsPerLiquidityPeriodX128
            );
        }

        /// @dev update the position
        update(
            position,
            params.liquidityDelta,
            feeGrowthInside0X128,
            feeGrowthInside1X128,
            _positionHash,
            period,
            secondsPerLiquidityPeriodX128
        );

        /// @dev clear tick data if liquidity delta is negative and the ticks no longer hold liquidity
        if (params.liquidityDelta < 0) {
            if (flippedLower) {
                Tick.clear($._ticks, params.tickLower, period);
            }
            if (flippedUpper) {
                Tick.clear($._ticks, params.tickUpper, period);
            }
        }
    }

    /// @notice Initializes secondsPerLiquidityPeriodStartX128 for a position
    /// @param position The individual position
    /// @param secondsInRangeParams Parameters used to find the seconds in range
    /// @param secondsPerLiquidityPeriodX128 The seconds in range gained per unit of liquidity, inside the position's tick boundaries for this period
    function initializeSecondsStart(
        PositionInfo storage position,
        PositionPeriodSecondsInRangeParams memory secondsInRangeParams,
        uint160 secondsPerLiquidityPeriodX128
    ) internal {
        /// @dev record initialized
        position.periodRewardInfo[secondsInRangeParams.period].initialized = true;

        /// @dev record owed tokens if liquidity > 0 (means position existed before period change)
        if (position.liquidity > 0) {
            uint256 periodSecondsInsideX96 = positionPeriodSecondsInRange(secondsInRangeParams);

            position.periodRewardInfo[secondsInRangeParams.period].secondsDebtX96 = -int256(periodSecondsInsideX96);
        }

        /// @dev convert uint to int
        /// @dev negative expected sometimes, which is allowed
        int160 secondsPerLiquidityPeriodIntX128 = int160(secondsPerLiquidityPeriodX128);

        position
            .periodRewardInfo[secondsInRangeParams.period]
            .secondsPerLiquidityPeriodStartX128 = secondsPerLiquidityPeriodIntX128;
    }
}
