// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {PoolStorage, Observation, TickInfo, Slot0} from './PoolStorage.sol';

/// @title Oracle
/// @notice Provides price and liquidity data useful for a wide variety of system designs
/// @dev Instances of stored oracle data, "observations", are collected in the oracle array
/// Every pool is initialized with an oracle array length of 1. Anyone can pay the SSTOREs to increase the
/// maximum length of the oracle array. New slots will be added when the array is fully populated.
/// Observations are overwritten when the full length of the oracle array is populated.
/// The most recent observation is available, independent of the length of the oracle array, by passing 0 to observe()
library Oracle {
    error I();
    error OLD();

    /// @notice Transforms a previous observation into a new observation, given the passage of time and the current tick and liquidity values
    /// @dev blockTimestamp _must_ be chronologically equal to or greater than last.blockTimestamp, safe for 0 or 1 overflows
    /// @param last The specified observation to be transformed
    /// @param blockTimestamp The timestamp of the new observation
    /// @param tick The active tick at the time of the new observation
    /// @param liquidity The total in-range liquidity at the time of the new observation
    /// @return Observation The newly populated observation
    function transform(
        Observation memory last,
        uint32 blockTimestamp,
        int24 tick,
        uint128 liquidity
    ) private pure returns (Observation memory) {
        unchecked {
            uint32 delta = blockTimestamp - last.blockTimestamp;
            return
                Observation({
                    blockTimestamp: blockTimestamp,
                    tickCumulative: last.tickCumulative + int56(tick) * int56(uint56(delta)),
                    secondsPerLiquidityCumulativeX128: last.secondsPerLiquidityCumulativeX128 +
                        ((uint160(delta) << 128) / (liquidity > 0 ? liquidity : 1)),
                    initialized: true
                });
        }
    }

    /// @notice Initialize the oracle array by writing the first slot. Called once for the lifecycle of the observations array
    /// @param self The stored oracle array
    /// @param time The time of the oracle initialization, via block.timestamp truncated to uint32
    /// @return cardinality The number of populated elements in the oracle array
    /// @return cardinalityNext The new length of the oracle array, independent of population
    function initialize(
        Observation[65535] storage self,
        uint32 time
    ) internal returns (uint16 cardinality, uint16 cardinalityNext) {
        self[0] = Observation({
            blockTimestamp: time,
            tickCumulative: 0,
            secondsPerLiquidityCumulativeX128: 0,
            initialized: true
        });
        return (1, 1);
    }

    /// @notice Writes an oracle observation to the array
    /// @dev Writable at most once per block. Index represents the most recently written element. cardinality and index must be tracked externally.
    /// If the index is at the end of the allowable array length (according to cardinality), and the next cardinality
    /// is greater than the current one, cardinality may be increased. This restriction is created to preserve ordering.
    /// @param self The stored oracle array
    /// @param index The index of the observation that was most recently written to the observations array
    /// @param blockTimestamp The timestamp of the new observation
    /// @param tick The active tick at the time of the new observation
    /// @param liquidity The total in-range liquidity at the time of the new observation
    /// @param cardinality The number of populated elements in the oracle array
    /// @param cardinalityNext The new length of the oracle array, independent of population
    /// @return indexUpdated The new index of the most recently written element in the oracle array
    /// @return cardinalityUpdated The new cardinality of the oracle array
    function write(
        Observation[65535] storage self,
        uint16 index,
        uint32 blockTimestamp,
        int24 tick,
        uint128 liquidity,
        uint16 cardinality,
        uint16 cardinalityNext
    ) internal returns (uint16 indexUpdated, uint16 cardinalityUpdated) {
        unchecked {
            Observation memory last = self[index];

            /// @dev early return if we've already written an observation this block
            if (last.blockTimestamp == blockTimestamp) return (index, cardinality);

            /// @dev if the conditions are right, we can bump the cardinality
            if (cardinalityNext > cardinality && index == (cardinality - 1)) {
                cardinalityUpdated = cardinalityNext;
            } else {
                cardinalityUpdated = cardinality;
            }

            indexUpdated = (index + 1) % cardinalityUpdated;
            self[indexUpdated] = transform(last, blockTimestamp, tick, liquidity);
        }
    }

    /// @notice Prepares the oracle array to store up to `next` observations
    /// @param self The stored oracle array
    /// @param current The current next cardinality of the oracle array
    /// @param next The proposed next cardinality which will be populated in the oracle array
    /// @return next The next cardinality which will be populated in the oracle array
    function grow(Observation[65535] storage self, uint16 current, uint16 next) internal returns (uint16) {
        unchecked {
            if (current <= 0) revert I();
            /// @dev no-op if the passed next value isn't greater than the current next value
            if (next <= current) return current;
            /// @dev store in each slot to prevent fresh SSTOREs in swaps
            /// @dev this data will not be used because the initialized boolean is still false
            for (uint16 i = current; i < next; i++) self[i].blockTimestamp = 1;
            return next;
        }
    }

    /// @notice comparator for 32-bit timestamps
    /// @dev safe for 0 or 1 overflows, a and b _must_ be chronologically before or equal to time
    /// @param time A timestamp truncated to 32 bits
    /// @param a A comparison timestamp from which to determine the relative position of `time`
    /// @param b From which to determine the relative position of `time`
    /// @return Whether `a` is chronologically <= `b`
    function lte(uint32 time, uint32 a, uint32 b) private pure returns (bool) {
        unchecked {
            /// @dev if there hasn't been overflow, no need to adjust
            if (a <= time && b <= time) return a <= b;

            uint256 aAdjusted = a > time ? a : a + 2 ** 32;
            uint256 bAdjusted = b > time ? b : b + 2 ** 32;

            return aAdjusted <= bAdjusted;
        }
    }

    /// @notice Fetches the observations beforeOrAt and atOrAfter a target, i.e. where [beforeOrAt, atOrAfter] is satisfied.
    /// The result may be the same observation, or adjacent observations.
    /// @dev The answer must be contained in the array, used when the target is located within the stored observation
    /// boundaries: older than the most recent observation and younger, or the same age as, the oldest observation
    /// @param self The stored oracle array
    /// @param time The current block.timestamp
    /// @param target The timestamp at which the reserved observation should be for
    /// @param index The index of the observation that was most recently written to the observations array
    /// @param cardinality The number of populated elements in the oracle array
    /// @return beforeOrAt The observation recorded before, or at, the target
    /// @return atOrAfter The observation recorded at, or after, the target
    function binarySearch(
        Observation[65535] storage self,
        uint32 time,
        uint32 target,
        uint16 index,
        uint16 cardinality
    ) private view returns (Observation memory beforeOrAt, Observation memory atOrAfter) {
        unchecked {
            /// @dev oldest observation
            uint256 l = (index + 1) % cardinality; 
            /// @dev newest observation
            uint256 r = l + cardinality - 1; 
            uint256 i;
            while (true) {
                i = (l + r) / 2;

                beforeOrAt = self[i % cardinality];

                /// @dev we've landed on an uninitialized tick, keep searching higher (more recently)
                if (!beforeOrAt.initialized) {
                    l = i + 1;
                    continue;
                }

                atOrAfter = self[(i + 1) % cardinality];

                bool targetAtOrAfter = lte(time, beforeOrAt.blockTimestamp, target);

                /// @dev check if we've found the answer!
                if (targetAtOrAfter && lte(time, target, atOrAfter.blockTimestamp)) break;

                if (!targetAtOrAfter) r = i - 1;
                else l = i + 1;
            }
        }
    }

    /// @notice Fetches the observations beforeOrAt and atOrAfter a given target, i.e. where [beforeOrAt, atOrAfter] is satisfied
    /// @dev Assumes there is at least 1 initialized observation.
    /// Used by observeSingle() to compute the counterfactual accumulator values as of a given block timestamp.
    /// @param self The stored oracle array
    /// @param time The current block.timestamp
    /// @param target The timestamp at which the reserved observation should be for
    /// @param tick The active tick at the time of the returned or simulated observation
    /// @param index The index of the observation that was most recently written to the observations array
    /// @param liquidity The total pool liquidity at the time of the call
    /// @param cardinality The number of populated elements in the oracle array
    /// @return beforeOrAt The observation which occurred at, or before, the given timestamp
    /// @return atOrAfter The observation which occurred at, or after, the given timestamp
    function getSurroundingObservations(
        Observation[65535] storage self,
        uint32 time,
        uint32 target,
        int24 tick,
        uint16 index,
        uint128 liquidity,
        uint16 cardinality
    ) private view returns (Observation memory beforeOrAt, Observation memory atOrAfter) {
        unchecked {
            /// @dev optimistically set before to the newest observation
            beforeOrAt = self[index];

            /// @dev if the target is chronologically at or after the newest observation, we can early return
            if (lte(time, beforeOrAt.blockTimestamp, target)) {
                if (beforeOrAt.blockTimestamp == target) {
                    /// @dev if newest observation equals target, we're in the same block, so we can ignore atOrAfter
                    return (beforeOrAt, atOrAfter);
                } else {
                    /// @dev otherwise, we need to transform
                    return (beforeOrAt, transform(beforeOrAt, target, tick, liquidity));
                }
            }

            /// @dev now, set before to the oldest observation
            beforeOrAt = self[(index + 1) % cardinality];
            if (!beforeOrAt.initialized) beforeOrAt = self[0];

            /// @dev ensure that the target is chronologically at or after the oldest observation
            if (!lte(time, beforeOrAt.blockTimestamp, target)) revert OLD();

            /// @dev if we've reached this point, we have to binary search
            return binarySearch(self, time, target, index, cardinality);
        }
    }

    /// @dev Reverts if an observation at or before the desired observation timestamp does not exist.
    /// 0 may be passed as `secondsAgo' to return the current cumulative values.
    /// If called with a timestamp falling between two observations, returns the counterfactual accumulator values
    /// at exactly the timestamp between the two observations.
    /// @param self The stored oracle array
    /// @param time The current block timestamp
    /// @param secondsAgo The amount of time to look back, in seconds, at which point to return an observation
    /// @param tick The current tick
    /// @param index The index of the observation that was most recently written to the observations array
    /// @param liquidity The current in-range pool liquidity
    /// @param cardinality The number of populated elements in the oracle array
    /// @return tickCumulative The tick * time elapsed since the pool was first initialized, as of `secondsAgo`
    /// @return secondsPerLiquidityCumulativeX128 The time elapsed / max(1, liquidity) since the pool was first initialized, as of `secondsAgo`
    function observeSingle(
        Observation[65535] storage self,
        uint32 time,
        uint32 secondsAgo,
        int24 tick,
        uint16 index,
        uint128 liquidity,
        uint16 cardinality
    ) internal view returns (int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128) {
        unchecked {
            if (secondsAgo == 0) {
                Observation memory last = self[index];
                if (last.blockTimestamp != time) last = transform(last, time, tick, liquidity);
                return (last.tickCumulative, last.secondsPerLiquidityCumulativeX128);
            }

            uint32 target = time - secondsAgo;

            (Observation memory beforeOrAt, Observation memory atOrAfter) = getSurroundingObservations(
                self,
                time,
                target,
                tick,
                index,
                liquidity,
                cardinality
            );

            if (target == beforeOrAt.blockTimestamp) {
                /// @dev we're at the left boundary
                return (beforeOrAt.tickCumulative, beforeOrAt.secondsPerLiquidityCumulativeX128);
            } else if (target == atOrAfter.blockTimestamp) {
                /// @dev we're at the right boundary
                return (atOrAfter.tickCumulative, atOrAfter.secondsPerLiquidityCumulativeX128);
            } else {
                /// @dev we're in the middle
                uint32 observationTimeDelta = atOrAfter.blockTimestamp - beforeOrAt.blockTimestamp;
                uint32 targetDelta = target - beforeOrAt.blockTimestamp;
                return (
                    beforeOrAt.tickCumulative +
                        ((atOrAfter.tickCumulative - beforeOrAt.tickCumulative) / int56(uint56(observationTimeDelta))) *
                        int56(uint56(targetDelta)),
                    beforeOrAt.secondsPerLiquidityCumulativeX128 +
                        uint160(
                            (uint256(
                                atOrAfter.secondsPerLiquidityCumulativeX128 -
                                    beforeOrAt.secondsPerLiquidityCumulativeX128
                            ) * targetDelta) / observationTimeDelta
                        )
                );
            }
        }
    }

    /// @notice Returns the accumulator values as of each time seconds ago from the given time in the array of `secondsAgos`
    /// @dev Reverts if `secondsAgos` > oldest observation
    /// @param self The stored oracle array
    /// @param time The current block.timestamp
    /// @param secondsAgos Each amount of time to look back, in seconds, at which point to return an observation
    /// @param tick The current tick
    /// @param index The index of the observation that was most recently written to the observations array
    /// @param liquidity The current in-range pool liquidity
    /// @param cardinality The number of populated elements in the oracle array
    /// @return tickCumulatives The tick * time elapsed since the pool was first initialized, as of each `secondsAgo`
    /// @return secondsPerLiquidityCumulativeX128s The cumulative seconds / max(1, liquidity) since the pool was first initialized, as of each `secondsAgo`
    function observe(
        Observation[65535] storage self,
        uint32 time,
        uint32[] memory secondsAgos,
        int24 tick,
        uint16 index,
        uint128 liquidity,
        uint16 cardinality
    ) internal view returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s) {
        unchecked {
            if (cardinality <= 0) revert I();

            tickCumulatives = new int56[](secondsAgos.length);
            secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
            for (uint256 i = 0; i < secondsAgos.length; i++) {
                (tickCumulatives[i], secondsPerLiquidityCumulativeX128s[i]) = observeSingle(
                    self,
                    time,
                    secondsAgos[i],
                    tick,
                    index,
                    liquidity,
                    cardinality
                );
            }
        }
    }

    function newPeriod(
        Observation[65535] storage self,
        uint16 index,
        uint256 period
    ) external returns (uint160 secondsPerLiquidityCumulativeX128) {
        Observation memory last = self[index];
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        unchecked {
            uint32 delta = uint32(period) * 1 weeks - 1 - last.blockTimestamp;

            secondsPerLiquidityCumulativeX128 =
                last.secondsPerLiquidityCumulativeX128 +
                ((uint160(delta) << 128) / ($.liquidity > 0 ? $.liquidity : 1));

            self[index] = Observation({
                blockTimestamp: uint32(period) * 1 weeks - 1,
                tickCumulative: last.tickCumulative + int56($.slot0.tick) * int56(uint56(delta)),
                secondsPerLiquidityCumulativeX128: secondsPerLiquidityCumulativeX128,
                initialized: last.initialized
            });
        }
    }

    struct SnapShot {
        int56 tickCumulativeLower;
        int56 tickCumulativeUpper;
        uint160 secondsPerLiquidityOutsideLowerX128;
        uint160 secondsPerLiquidityOutsideUpperX128;
        uint32 secondsOutsideLower;
        uint32 secondsOutsideUpper;
    }

    struct SnapshotCumulativesInsideCache {
        uint32 time;
        int56 tickCumulative;
        uint160 secondsPerLiquidityCumulativeX128;
    }

    /// @notice Returns a snapshot of the tick cumulative, seconds per liquidity and seconds inside a tick range
    /// @dev Snapshots must only be compared to other snapshots, taken over a period for which a position existed.
    /// I.e., snapshots cannot be compared if a position is not held for the entire period between when the first
    /// snapshot is taken and the second snapshot is taken. Boosted data is only valid if it's within the same period
    /// @param tickLower The lower tick of the range
    /// @param tickUpper The upper tick of the range
    /// @return tickCumulativeInside The snapshot of the tick accumulator for the range
    /// @return secondsPerLiquidityInsideX128 The snapshot of seconds per liquidity for the range
    /// @return secondsInside The snapshot of seconds per liquidity for the range
    function snapshotCumulativesInside(
        int24 tickLower,
        int24 tickUpper,
        uint32 _blockTimestamp
    ) external view returns (int56 tickCumulativeInside, uint160 secondsPerLiquidityInsideX128, uint32 secondsInside) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        TickInfo storage lower = $._ticks[tickLower];
        TickInfo storage upper = $._ticks[tickUpper];

        SnapShot memory snapshot;

        bool initializedLower;
        (
            snapshot.tickCumulativeLower,
            snapshot.secondsPerLiquidityOutsideLowerX128,
            snapshot.secondsOutsideLower,
            initializedLower
        ) = (
            lower.tickCumulativeOutside,
            lower.secondsPerLiquidityOutsideX128,
            lower.secondsOutside,
            lower.initialized
        );
        require(initializedLower);

        bool initializedUpper;
        (
            snapshot.tickCumulativeUpper,
            snapshot.secondsPerLiquidityOutsideUpperX128,
            snapshot.secondsOutsideUpper,
            initializedUpper
        ) = (
            upper.tickCumulativeOutside,
            upper.secondsPerLiquidityOutsideX128,
            upper.secondsOutside,
            upper.initialized
        );
        require(initializedUpper);

        Slot0 memory _slot0 = $.slot0;

        unchecked {
            if (_slot0.tick < tickLower) {
                return (
                    snapshot.tickCumulativeLower - snapshot.tickCumulativeUpper,
                    snapshot.secondsPerLiquidityOutsideLowerX128 - snapshot.secondsPerLiquidityOutsideUpperX128,
                    snapshot.secondsOutsideLower - snapshot.secondsOutsideUpper
                );
            } else if (_slot0.tick < tickUpper) {
                SnapshotCumulativesInsideCache memory cache;
                cache.time = _blockTimestamp;
                (cache.tickCumulative, cache.secondsPerLiquidityCumulativeX128) = observeSingle(
                    $.observations,
                    cache.time,
                    0,
                    _slot0.tick,
                    _slot0.observationIndex,
                    $.liquidity,
                    _slot0.observationCardinality
                );
                return (
                    cache.tickCumulative - snapshot.tickCumulativeLower - snapshot.tickCumulativeUpper,
                    cache.secondsPerLiquidityCumulativeX128 -
                        snapshot.secondsPerLiquidityOutsideLowerX128 -
                        snapshot.secondsPerLiquidityOutsideUpperX128,
                    cache.time - snapshot.secondsOutsideLower - snapshot.secondsOutsideUpper
                );
            } else {
                return (
                    snapshot.tickCumulativeUpper - snapshot.tickCumulativeLower,
                    snapshot.secondsPerLiquidityOutsideUpperX128 - snapshot.secondsPerLiquidityOutsideLowerX128,
                    snapshot.secondsOutsideUpper - snapshot.secondsOutsideLower
                );
            }
        }
    }

    /// @notice Returns the seconds per liquidity and seconds inside a tick range for a period
    /// @dev This does not ensure the range is a valid range
    /// @param period The timestamp of the period
    /// @param tickLower The lower tick of the range
    /// @param tickUpper The upper tick of the range
    /// @return secondsPerLiquidityInsideX128 The snapshot of seconds per liquidity for the range
    function periodCumulativesInside(
        uint32 period,
        int24 tickLower,
        int24 tickUpper,
        uint32 _blockTimestamp
    ) external view returns (uint160 secondsPerLiquidityInsideX128) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        TickInfo storage lower = $._ticks[tickLower];
        TickInfo storage upper = $._ticks[tickUpper];

        SnapShot memory snapshot;

        {
            int24 startTick = $.periods[period].startTick;
            uint256 previousPeriod = $.periods[period].previousPeriod;

            snapshot.secondsPerLiquidityOutsideLowerX128 = uint160(lower.periodSecondsPerLiquidityOutsideX128[period]);

            if (tickLower <= startTick && snapshot.secondsPerLiquidityOutsideLowerX128 == 0) {
                snapshot.secondsPerLiquidityOutsideLowerX128 = $
                    .periods[previousPeriod]
                    .endSecondsPerLiquidityPeriodX128;
            }

            snapshot.secondsPerLiquidityOutsideUpperX128 = uint160(upper.periodSecondsPerLiquidityOutsideX128[period]);
            if (tickUpper <= startTick && snapshot.secondsPerLiquidityOutsideUpperX128 == 0) {
                snapshot.secondsPerLiquidityOutsideUpperX128 = $
                    .periods[previousPeriod]
                    .endSecondsPerLiquidityPeriodX128;
            }
        }

        int24 lastTick;
        uint256 currentPeriod = $.lastPeriod;
        {
            /// @dev if period is already finalized, use period's last tick, if not, use current tick
            if (currentPeriod > period) {
                lastTick = $.periods[period].lastTick;
            } else {
                lastTick = $.slot0.tick;
            }
        }

        unchecked {
            if (lastTick < tickLower) {
                return snapshot.secondsPerLiquidityOutsideLowerX128 - snapshot.secondsPerLiquidityOutsideUpperX128;
            } else if (lastTick < tickUpper) {
                SnapshotCumulativesInsideCache memory cache;
                /// @dev if period's on-going, observeSingle, if finalized, use endSecondsPerLiquidityPeriodX128
                if (currentPeriod <= period) {
                    cache.time = _blockTimestamp;
                    /// @dev limit to the end of period
                    if (cache.time >= currentPeriod * 1 weeks + 1 weeks) {
                        cache.time = uint32(currentPeriod * 1 weeks + 1 weeks - 1);
                    }

                    Slot0 memory _slot0 = $.slot0;

                    (, cache.secondsPerLiquidityCumulativeX128) = observeSingle(
                        $.observations,
                        cache.time,
                        0,
                        _slot0.tick,
                        _slot0.observationIndex,
                        $.liquidity,
                        _slot0.observationCardinality
                    );
                } else {
                    cache.secondsPerLiquidityCumulativeX128 = $.periods[period].endSecondsPerLiquidityPeriodX128;
                }
                return
                    cache.secondsPerLiquidityCumulativeX128 -
                    snapshot.secondsPerLiquidityOutsideLowerX128 -
                    snapshot.secondsPerLiquidityOutsideUpperX128;
            } else {
                return snapshot.secondsPerLiquidityOutsideUpperX128 - snapshot.secondsPerLiquidityOutsideLowerX128;
            }
        }
    }
}
