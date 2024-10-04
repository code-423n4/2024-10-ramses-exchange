// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {IRamsesV3PoolActions, IRamsesV3PoolDerivedState, IRamsesV3PoolOwnerActions, IRamsesV3Pool} from './interfaces/IRamsesV3Pool.sol';

import {SafeCast} from './libraries/SafeCast.sol';
import {Tick} from './libraries/Tick.sol';
import {TickBitmap} from './libraries/TickBitmap.sol';
import {Position} from './libraries/Position.sol';
import {Oracle} from './libraries/Oracle.sol';

import {FullMath} from './libraries/FullMath.sol';
import {FixedPoint128} from './libraries/FixedPoint128.sol';
import {TransferHelper} from './libraries/TransferHelper.sol';
import {TickMath} from './libraries/TickMath.sol';
import {SqrtPriceMath} from './libraries/SqrtPriceMath.sol';
import {SwapMath} from './libraries/SwapMath.sol';

import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';
import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';
import {IERC20Minimal} from './interfaces/IERC20Minimal.sol';
import {IUniswapV3MintCallback} from './interfaces/callback/IUniswapV3MintCallback.sol';
import {IUniswapV3SwapCallback} from './interfaces/callback/IUniswapV3SwapCallback.sol';
import {IUniswapV3FlashCallback} from './interfaces/callback/IUniswapV3FlashCallback.sol';

import {ProtocolActions} from './libraries/ProtocolActions.sol';
import {PoolStorage, Slot0, Observation, PositionInfo, TickInfo, PeriodInfo, ProtocolFees} from './libraries/PoolStorage.sol';
import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';

contract RamsesV3Pool is IRamsesV3Pool {
    using SafeCast for uint256;
    using SafeCast for int256;
    using Tick for mapping(int24 => TickInfo);
    using TickBitmap for mapping(int16 => uint256);
    using Position for mapping(bytes32 => PositionInfo);
    using Position for PositionInfo;

    address public immutable factory;
    address public immutable token0;
    address public immutable token1;

    int24 public immutable tickSpacing;
    uint128 public immutable maxLiquidityPerTick;

    /// @dev Mutually exclusive reentrancy protection into the pool to/from a method. This method also prevents entrance
    /// @dev to a function before the pool is initialized. The reentrancy guard is required throughout the contract because
    /// @dev we use balance checks to determine the payment status of interactions such as mint, swap and flash.
    modifier lock() {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();
        if (!$.slot0.unlocked) revert LOK();
        $.slot0.unlocked = false;
        _;
        $.slot0.unlocked = true;
    }

    /// @dev Advances period if it's a new week
    modifier advancePeriod() {
        _advancePeriod();
        _;
    }

    constructor() {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        (factory, token0, token1, $.fee, tickSpacing) = IRamsesV3PoolDeployer(msg.sender).parameters();

        maxLiquidityPerTick = Tick.tickSpacingToMaxLiquidityPerTick(tickSpacing);
    }

    /// @dev Common checks for valid tick inputs.
    function checkTicks(int24 tickLower, int24 tickUpper) private pure {
        /// @dev ensure lower tick is not greater than or equal to the upper tick
        if (tickLower >= tickUpper) revert TLU();
        /// @dev ensure tickLower is greater than the minimum tick
        if (tickLower < TickMath.MIN_TICK) revert TLM();
        /// @dev ensure tickUpper is less than the maximum tick
        if (tickUpper > TickMath.MAX_TICK) revert TUM();
    }

    /// @dev Returns the block timestamp truncated to 32 bits, i.e. mod 2**32. This method is overridden in tests.
    function _blockTimestamp() internal view virtual returns (uint32) {
        /// @dev truncation is desired
        return uint32(block.timestamp); 
    }

    /// @dev Get the pool's balance of token0
    /// @dev This function is gas optimized to avoid a redundant extcodesize check in addition to the returndatasize
    function balance0() internal view returns (uint256) {
        return IERC20(token0).balanceOf(address(this));
    }

    /// @dev Get the pool's balance of token1
    /// @dev This function is gas optimized to avoid a redundant extcodesize check in addition to the returndatasize
    function balance1() internal view returns (uint256) {
        return IERC20(token1).balanceOf(address(this));
    }

    /// @inheritdoc IRamsesV3PoolDerivedState
    function snapshotCumulativesInside(
        int24 tickLower,
        int24 tickUpper
    )
        external
        view
        override
        returns (int56 tickCumulativeInside, uint160 secondsPerLiquidityInsideX128, uint32 secondsInside)
    {
        checkTicks(tickLower, tickUpper);

        return Oracle.snapshotCumulativesInside(tickLower, tickUpper, _blockTimestamp());
    }

    /// @inheritdoc IRamsesV3PoolDerivedState
    function observe(
        uint32[] calldata secondsAgos
    )
        external
        view
        override
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        return
            Oracle.observe(
                $.observations,
                _blockTimestamp(),
                secondsAgos,
                $.slot0.tick,
                $.slot0.observationIndex,
                $.liquidity,
                $.slot0.observationCardinality
            );
    }

    /// @inheritdoc IRamsesV3PoolActions
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external override lock {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();
        /// @dev for the event
        uint16 observationCardinalityNextOld = $.slot0.observationCardinalityNext; 
        uint16 observationCardinalityNextNew = Oracle.grow(
            $.observations,
            observationCardinalityNextOld,
            observationCardinalityNext
        );
        $.slot0.observationCardinalityNext = observationCardinalityNextNew;
        if (observationCardinalityNextOld != observationCardinalityNextNew)
            emit IncreaseObservationCardinalityNext(observationCardinalityNextOld, observationCardinalityNextNew);
    }

    /// @dev init
    function initialize(uint160 sqrtPriceX96) external {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        if ($.slot0.sqrtPriceX96 != 0) revert AI();

        int24 tick = TickMath.getTickAtSqrtRatio(sqrtPriceX96);

        (uint16 cardinality, uint16 cardinalityNext) = Oracle.initialize($.observations, 0);

        _advancePeriod();

        $.slot0 = Slot0({
            sqrtPriceX96: sqrtPriceX96,
            tick: tick,
            observationIndex: 0,
            observationCardinality: cardinality,
            observationCardinalityNext: cardinalityNext,
            feeProtocol: 0,
            unlocked: true
        });

        emit Initialize(sqrtPriceX96, tick);
    }

    struct ModifyPositionParams {
        /// @dev the address that owns the position
        address owner;
        uint256 index;
        /// @dev the lower and upper tick of the position
        int24 tickLower;
        int24 tickUpper;
        /// @dev any change in liquidity
        int128 liquidityDelta;
    }

    /// @dev Effect some changes to a position
    /// @param params the position details and the change to the position's liquidity to effect
    /// @return position a storage pointer referencing the position with the given owner and tick range
    /// @return amount0 the amount of token0 owed to the pool, negative if the pool should pay the recipient
    /// @return amount1 the amount of token1 owed to the pool, negative if the pool should pay the recipient
    function _modifyPosition(
        ModifyPositionParams memory params
    ) private returns (PositionInfo storage position, int256 amount0, int256 amount1) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        checkTicks(params.tickLower, params.tickUpper);
        /// @dev SLOAD for gas optimization
        Slot0 memory _slot0 = $.slot0; 

        position = Position._updatePosition(
            Position.UpdatePositionParams({
                owner: params.owner,
                index: params.index,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidityDelta: params.liquidityDelta,
                tick: _slot0.tick,
                _blockTimestamp: _blockTimestamp(),
                tickSpacing: tickSpacing,
                maxLiquidityPerTick: maxLiquidityPerTick
            })
        );

        if (params.liquidityDelta != 0) {
            if (_slot0.tick < params.tickLower) {
                /// @dev current tick is below the passed range; liquidity can only become in range by crossing from left to
                /// @dev right, when we'll need _more_ token0 (it's becoming more valuable) so user must provide it
                amount0 = SqrtPriceMath.getAmount0Delta(
                    TickMath.getSqrtRatioAtTick(params.tickLower),
                    TickMath.getSqrtRatioAtTick(params.tickUpper),
                    params.liquidityDelta
                );
            } else if (_slot0.tick < params.tickUpper) {
                /// @dev current tick is inside the passed range
                /// @dev SLOAD for gas optimization
                uint128 liquidityBefore = $.liquidity; 

                /// @dev write an oracle entry
                ($.slot0.observationIndex, $.slot0.observationCardinality) = Oracle.write(
                    $.observations,
                    _slot0.observationIndex,
                    _blockTimestamp(),
                    _slot0.tick,
                    liquidityBefore,
                    _slot0.observationCardinality,
                    _slot0.observationCardinalityNext
                );

                amount0 = SqrtPriceMath.getAmount0Delta(
                    _slot0.sqrtPriceX96,
                    TickMath.getSqrtRatioAtTick(params.tickUpper),
                    params.liquidityDelta
                );
                amount1 = SqrtPriceMath.getAmount1Delta(
                    TickMath.getSqrtRatioAtTick(params.tickLower),
                    _slot0.sqrtPriceX96,
                    params.liquidityDelta
                );

                $.liquidity = params.liquidityDelta < 0
                    ? liquidityBefore - uint128(-params.liquidityDelta)
                    : liquidityBefore + uint128(params.liquidityDelta);
            } else {
                /// @dev current tick is above the passed range; liquidity can only become in range by crossing from right to
                /// @dev left, when we'll need _more_ token1 (it's becoming more valuable) so user must provide it
                amount1 = SqrtPriceMath.getAmount1Delta(
                    TickMath.getSqrtRatioAtTick(params.tickLower),
                    TickMath.getSqrtRatioAtTick(params.tickUpper),
                    params.liquidityDelta
                );
            }
        }
    }

    /// @inheritdoc IRamsesV3PoolActions
    function mint(
        address recipient,
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount,
        bytes calldata data
    ) external override lock advancePeriod returns (uint256 amount0, uint256 amount1) {
        require(amount > 0);
        (, int256 amount0Int, int256 amount1Int) = _modifyPosition(
            ModifyPositionParams({
                owner: recipient,
                index: index,
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(amount)).toInt128()
            })
        );

        amount0 = uint256(amount0Int);
        amount1 = uint256(amount1Int);

        uint256 balance0Before;
        uint256 balance1Before;
        if (amount0 > 0) balance0Before = balance0();
        if (amount1 > 0) balance1Before = balance1();
        IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback(amount0, amount1, data);
        if (amount0 > 0 && balance0Before + amount0 > balance0()) revert M0();
        if (amount1 > 0 && balance1Before + amount1 > balance1()) revert M1();

        emit Mint(msg.sender, recipient, tickLower, tickUpper, amount, amount0, amount1);
    }

    /// @inheritdoc IRamsesV3PoolActions
    function collect(
        address recipient,
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external override lock returns (uint128 amount0, uint128 amount1) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        /// @dev we don't need to checkTicks here, because invalid positions will never have non-zero tokensOwed{0,1}
        PositionInfo storage position = $.positions.get(msg.sender, index, tickLower, tickUpper);

        amount0 = amount0Requested > position.tokensOwed0 ? position.tokensOwed0 : amount0Requested;
        amount1 = amount1Requested > position.tokensOwed1 ? position.tokensOwed1 : amount1Requested;

        unchecked {
            if (amount0 > 0) {
                position.tokensOwed0 -= amount0;
                TransferHelper.safeTransfer(token0, recipient, amount0);
            }
            if (amount1 > 0) {
                position.tokensOwed1 -= amount1;
                TransferHelper.safeTransfer(token1, recipient, amount1);
            }
        }

        emit Collect(msg.sender, recipient, tickLower, tickUpper, amount0, amount1);
    }

    /// @inheritdoc IRamsesV3PoolActions
    function burn(
        uint256 index,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external override lock advancePeriod returns (uint256 amount0, uint256 amount1) {
        unchecked {
            (PositionInfo storage position, int256 amount0Int, int256 amount1Int) = _modifyPosition(
                ModifyPositionParams({
                    owner: msg.sender,
                    index: index,
                    tickLower: tickLower,
                    tickUpper: tickUpper,
                    liquidityDelta: -int256(uint256(amount)).toInt128()
                })
            );

            amount0 = uint256(-amount0Int);
            amount1 = uint256(-amount1Int);

            if (amount0 > 0 || amount1 > 0) {
                (position.tokensOwed0, position.tokensOwed1) = (
                    position.tokensOwed0 + uint128(amount0),
                    position.tokensOwed1 + uint128(amount1)
                );
            }

            emit Burn(msg.sender, tickLower, tickUpper, amount, amount0, amount1);
        }
    }

    struct SwapCache {
        /// @dev the protocol fee for the input token
        uint8 feeProtocol;
        /// @dev liquidity at the beginning of the swap
        uint128 liquidityStart;
        /// @dev the timestamp of the current block
        uint32 blockTimestamp;
        /// @dev the current value of the tick accumulator, computed only if we cross an initialized tick
        int56 tickCumulative;
        /// @dev the current value of seconds per liquidity accumulator, computed only if we cross an initialized tick
        uint160 secondsPerLiquidityCumulativeX128;
        /// @dev whether we've computed and cached the above two accumulators
        bool computedLatestObservation;
        /// @dev timestamp of the previous period
        uint32 previousPeriod;
    }

    /// @dev the top level state of the swap, the results of which are recorded in storage at the end
    struct SwapState {
        /// @dev the amount remaining to be swapped in/out of the input/output asset
        int256 amountSpecifiedRemaining;
        /// @dev the amount already swapped out/in of the output/input asset
        int256 amountCalculated;
        /// @dev current sqrt(price)
        uint160 sqrtPriceX96;
        /// @dev the tick associated with the current price
        int24 tick;
        /// @dev the global fee growth of the input token
        uint256 feeGrowthGlobalX128;
        /// @dev amount of input token paid as protocol fee
        uint128 protocolFee;
        /// @dev the current liquidity in range
        uint128 liquidity;
        /// @dev seconds per liquidity at the end of the previous period
        uint256 endSecondsPerLiquidityPeriodX128;
        /// @dev starting tick of the current period
        int24 periodStartTick;
    }

    struct StepComputations {
        /// @dev the price at the beginning of the step
        uint160 sqrtPriceStartX96;
        /// @dev the next tick to swap to from the current tick in the swap direction
        int24 tickNext;
        /// @dev whether tickNext is initialized or not
        bool initialized;
        /// @dev sqrt(price) for the next tick (1/0)
        uint160 sqrtPriceNextX96;
        /// @dev how much is being swapped in in this step
        uint256 amountIn;
        /// @dev how much is being swapped out
        uint256 amountOut;
        /// @dev how much fee is being paid in
        uint256 feeAmount;
    }

    /// @inheritdoc IRamsesV3PoolActions
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external override returns (int256 amount0, int256 amount1) {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        uint256 period = _blockTimestamp() / 1 weeks;
        Slot0 memory slot0Start = $.slot0;

        /// @dev if in a new week, record lastTick for the previous period
        /// @dev also record secondsPerLiquidityCumulativeX128 for the start of the new period
        uint256 _lastPeriod = $.lastPeriod;
        if (period != _lastPeriod) {
            $.lastPeriod = period;

            /// @dev start a new period in observations
            uint160 secondsPerLiquidityCumulativeX128 = Oracle.newPeriod(
                $.observations,
                slot0Start.observationIndex,
                period
            );

            /// @dev record last tick and secondsPerLiquidityCumulativeX128 for old period
            $.periods[_lastPeriod].lastTick = slot0Start.tick;
            $.periods[_lastPeriod].endSecondsPerLiquidityPeriodX128 = secondsPerLiquidityCumulativeX128;

            /// @dev record start tick and secondsPerLiquidityCumulativeX128 for new period
            PeriodInfo memory _newPeriod;

            _newPeriod.previousPeriod = uint32(_lastPeriod);
            _newPeriod.startTick = slot0Start.tick;
            $.periods[period] = _newPeriod;
        }

        if (amountSpecified == 0) revert AS();

        if (!slot0Start.unlocked) revert LOK();
        require(
            zeroForOne
                ? sqrtPriceLimitX96 < slot0Start.sqrtPriceX96 && sqrtPriceLimitX96 > TickMath.MIN_SQRT_RATIO
                : sqrtPriceLimitX96 > slot0Start.sqrtPriceX96 && sqrtPriceLimitX96 < TickMath.MAX_SQRT_RATIO,
            SPL()
        );

        $.slot0.unlocked = false;

        SwapCache memory cache = SwapCache({
            liquidityStart: $.liquidity,
            blockTimestamp: _blockTimestamp(),
            feeProtocol: slot0Start.feeProtocol,
            secondsPerLiquidityCumulativeX128: 0,
            tickCumulative: 0,
            computedLatestObservation: false,
            previousPeriod: $.periods[period].previousPeriod
        });

        bool exactInput = amountSpecified > 0;

        SwapState memory state = SwapState({
            amountSpecifiedRemaining: amountSpecified,
            amountCalculated: 0,
            sqrtPriceX96: slot0Start.sqrtPriceX96,
            tick: slot0Start.tick,
            feeGrowthGlobalX128: zeroForOne ? $.feeGrowthGlobal0X128 : $.feeGrowthGlobal1X128,
            protocolFee: 0,
            liquidity: cache.liquidityStart,
            endSecondsPerLiquidityPeriodX128: $.periods[cache.previousPeriod].endSecondsPerLiquidityPeriodX128,
            periodStartTick: $.periods[period].startTick
        });

        /// @dev continue swapping as long as we haven't used the entire input/output and haven't reached the price limit
        while (state.amountSpecifiedRemaining != 0 && state.sqrtPriceX96 != sqrtPriceLimitX96) {
            StepComputations memory step;

            step.sqrtPriceStartX96 = state.sqrtPriceX96;

            (step.tickNext, step.initialized) = $.tickBitmap.nextInitializedTickWithinOneWord(
                state.tick,
                tickSpacing,
                zeroForOne
            );

            /// @dev ensure that we do not overshoot the min/max tick, as the tick bitmap is not aware of these bounds
            if (step.tickNext < TickMath.MIN_TICK) {
                step.tickNext = TickMath.MIN_TICK;
            } else if (step.tickNext > TickMath.MAX_TICK) {
                step.tickNext = TickMath.MAX_TICK;
            }

            /// @dev get the price for the next tick
            step.sqrtPriceNextX96 = TickMath.getSqrtRatioAtTick(step.tickNext);

            /// @dev compute values to swap to the target tick, price limit, or point where input/output amount is exhausted
            (state.sqrtPriceX96, step.amountIn, step.amountOut, step.feeAmount) = SwapMath.computeSwapStep(
                state.sqrtPriceX96,
                (zeroForOne ? step.sqrtPriceNextX96 < sqrtPriceLimitX96 : step.sqrtPriceNextX96 > sqrtPriceLimitX96)
                    ? sqrtPriceLimitX96
                    : step.sqrtPriceNextX96,
                state.liquidity,
                state.amountSpecifiedRemaining,
                $.fee
            );

            if (exactInput) {
                /// @dev safe because we test that amountSpecified > amountIn + feeAmount in SwapMath
                unchecked {
                    state.amountSpecifiedRemaining -= (step.amountIn + step.feeAmount).toInt256();
                }
                state.amountCalculated -= step.amountOut.toInt256();
            } else {
                unchecked {
                    state.amountSpecifiedRemaining += step.amountOut.toInt256();
                }
                state.amountCalculated += (step.amountIn + step.feeAmount).toInt256();
            }

            /// @dev if the protocol fee is on, calculate how much is owed, decrement feeAmount, and increment protocolFee
            if (cache.feeProtocol > 0) {
                unchecked {
                    uint256 delta = (step.feeAmount * cache.feeProtocol) / 100;
                    step.feeAmount -= delta;
                    state.protocolFee += uint128(delta);
                }
            }

            /// @dev update global fee tracker
            if (state.liquidity > 0) {
                unchecked {
                    state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);
                }
            }

            /// @dev shift tick if we reached the next price
            if (state.sqrtPriceX96 == step.sqrtPriceNextX96) {
                /// @dev if the tick is initialized, run the tick transition
                if (step.initialized) {
                    /// @dev check for the placeholder value, which we replace with the actual value the first time the swap
                    /// @dev crosses an initialized tick
                    if (!cache.computedLatestObservation) {
                        (cache.tickCumulative, cache.secondsPerLiquidityCumulativeX128) = Oracle.observeSingle(
                            $.observations,
                            cache.blockTimestamp,
                            0,
                            slot0Start.tick,
                            slot0Start.observationIndex,
                            cache.liquidityStart,
                            slot0Start.observationCardinality
                        );
                        cache.computedLatestObservation = true;
                    }

                    uint256 _feeGrowthGlobal0X128;
                    uint256 _feeGrowthGlobal1X128;

                    if (zeroForOne) {
                        _feeGrowthGlobal0X128 = state.feeGrowthGlobalX128;
                        _feeGrowthGlobal1X128 = $.feeGrowthGlobal1X128;
                    } else {
                        _feeGrowthGlobal0X128 = $.feeGrowthGlobal0X128;
                        _feeGrowthGlobal1X128 = state.feeGrowthGlobalX128;
                    }

                    int128 liquidityNet = $._ticks.cross(
                        step.tickNext,
                        _feeGrowthGlobal0X128,
                        _feeGrowthGlobal1X128,
                        cache.secondsPerLiquidityCumulativeX128,
                        cache.tickCumulative,
                        cache.blockTimestamp,
                        state.endSecondsPerLiquidityPeriodX128,
                        state.periodStartTick
                    );
                    /// @dev if we're moving leftward, we interpret liquidityNet as the opposite sign
                    /// @dev safe because liquidityNet cannot be type(int128).min
                    unchecked {
                        if (zeroForOne) liquidityNet = -liquidityNet;
                    }

                    state.liquidity = liquidityNet < 0
                        ? state.liquidity - uint128(-liquidityNet)
                        : state.liquidity + uint128(liquidityNet);
                }

                unchecked {
                    state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;
                }
            } else if (state.sqrtPriceX96 != step.sqrtPriceStartX96) {
                /// @dev recompute unless we're on a lower tick boundary (i.e. already transitioned ticks), and haven't moved
                state.tick = TickMath.getTickAtSqrtRatio(state.sqrtPriceX96);
            }
        }

        /// @dev update tick and write an oracle entry if the tick change
        if (state.tick != slot0Start.tick) {
            (uint16 observationIndex, uint16 observationCardinality) = Oracle.write(
                $.observations,
                slot0Start.observationIndex,
                cache.blockTimestamp,
                slot0Start.tick,
                cache.liquidityStart,
                slot0Start.observationCardinality,
                slot0Start.observationCardinalityNext
            );
            ($.slot0.sqrtPriceX96, $.slot0.tick, $.slot0.observationIndex, $.slot0.observationCardinality) = (
                state.sqrtPriceX96,
                state.tick,
                observationIndex,
                observationCardinality
            );
        } else {
            /// @dev otherwise just update the price
            $.slot0.sqrtPriceX96 = state.sqrtPriceX96;
        }

        /// @dev update liquidity if it changed
        if (cache.liquidityStart != state.liquidity) $.liquidity = state.liquidity;

        /// @dev update fee growth global and, if necessary, protocol fees
        /// @dev overflow is acceptable, protocol has to withdraw before it hits type(uint128).max fees
        if (zeroForOne) {
            $.feeGrowthGlobal0X128 = state.feeGrowthGlobalX128;
            unchecked {
                if (state.protocolFee > 0) $.protocolFees.token0 += state.protocolFee;
            }
        } else {
            $.feeGrowthGlobal1X128 = state.feeGrowthGlobalX128;
            unchecked {
                if (state.protocolFee > 0) $.protocolFees.token1 += state.protocolFee;
            }
        }

        unchecked {
            (amount0, amount1) = zeroForOne == exactInput
                ? (amountSpecified - state.amountSpecifiedRemaining, state.amountCalculated)
                : (state.amountCalculated, amountSpecified - state.amountSpecifiedRemaining);
        }

        /// @dev do the transfers and collect payment
        if (zeroForOne) {
            unchecked {
                if (amount1 < 0) TransferHelper.safeTransfer(token1, recipient, uint256(-amount1));
            }

            uint256 balance0Before = balance0();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
            if (balance0Before + uint256(amount0) > balance0()) revert IIA();
        } else {
            unchecked {
                if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));
            }

            uint256 balance1Before = balance1();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
            if (balance1Before + uint256(amount1) > balance1()) revert IIA();
        }

        emit Swap(msg.sender, recipient, amount0, amount1, state.sqrtPriceX96, state.liquidity, state.tick);
        $.slot0.unlocked = true;
    }

    /// @inheritdoc IRamsesV3PoolActions
    function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override lock {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        uint128 _liquidity = $.liquidity;
        if (_liquidity <= 0) revert L();

        uint256 fee0 = FullMath.mulDivRoundingUp(amount0, $.fee, 1e6);
        uint256 fee1 = FullMath.mulDivRoundingUp(amount1, $.fee, 1e6);
        uint256 balance0Before = balance0();
        uint256 balance1Before = balance1();

        if (amount0 > 0) TransferHelper.safeTransfer(token0, recipient, amount0);
        if (amount1 > 0) TransferHelper.safeTransfer(token1, recipient, amount1);

        IUniswapV3FlashCallback(msg.sender).uniswapV3FlashCallback(fee0, fee1, data);

        uint256 balance0After = balance0();
        uint256 balance1After = balance1();

        if (balance0Before + fee0 > balance0After) revert F0();
        if (balance1Before + fee1 > balance1After) revert F1();

        unchecked {
            /// @dev sub is safe because we know balanceAfter is gt balanceBefore by at least fee
            uint256 paid0 = balance0After - balance0Before;
            uint256 paid1 = balance1After - balance1Before;

            uint8 feeProtocol = $.slot0.feeProtocol;
            if (paid0 > 0) {
                uint256 pFees0 = feeProtocol == 0 ? 0 : paid0 / feeProtocol;
                if (uint128(pFees0) > 0) $.protocolFees.token0 += uint128(pFees0);
                $.feeGrowthGlobal0X128 += FullMath.mulDiv(paid0 - pFees0, FixedPoint128.Q128, _liquidity);
            }
            if (paid1 > 0) {
                uint256 pFees1 = feeProtocol == 0 ? 0 : paid1 / feeProtocol;
                if (uint128(pFees1) > 0) $.protocolFees.token1 += uint128(pFees1);
                $.feeGrowthGlobal1X128 += FullMath.mulDiv(paid1 - pFees1, FixedPoint128.Q128, _liquidity);
            }

            emit Flash(msg.sender, recipient, amount0, amount1, paid0, paid1);
        }
    }

    /// @inheritdoc IRamsesV3PoolOwnerActions
    function setFeeProtocol() external override lock {
        ProtocolActions.setFeeProtocol(factory);
    }

    /// @inheritdoc IRamsesV3PoolOwnerActions
    function collectProtocol(
        address recipient,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external override lock returns (uint128 amount0, uint128 amount1) {
        require(msg.sender == IRamsesV3Factory(factory).feeCollector(), ProtocolActions.Unauthorized());

        return ProtocolActions.collectProtocol(recipient, amount0Requested, amount1Requested, token0, token1);
    }

    /// @inheritdoc IRamsesV3PoolOwnerActions
    function setFee(uint24 _fee) external override lock {
        ProtocolActions.setFee(_fee, factory);
    }

    /// @inheritdoc IRamsesV3Pool
    function _advancePeriod() public {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();

        /// @dev if in new week, record lastTick for previous period
        /// @dev also record secondsPerLiquidityCumulativeX128 for the start of the new period
        uint256 _lastPeriod = $.lastPeriod;
        if ((_blockTimestamp() / 1 weeks) != _lastPeriod) {
            Slot0 memory _slot0 = $.slot0;
            uint256 period = _blockTimestamp() / 1 weeks;
            $.lastPeriod = period;

            /// @dev start new period in observations
            uint160 secondsPerLiquidityCumulativeX128 = Oracle.newPeriod(
                $.observations,
                _slot0.observationIndex,
                period
            );

            /// @dev record last tick and secondsPerLiquidityCumulativeX128 for old period
            $.periods[_lastPeriod].lastTick = _slot0.tick;
            $.periods[_lastPeriod].endSecondsPerLiquidityPeriodX128 = secondsPerLiquidityCumulativeX128;

            /// @dev record start tick and secondsPerLiquidityCumulativeX128 for new period
            PeriodInfo memory _newPeriod;

            _newPeriod.previousPeriod = uint32(_lastPeriod);
            _newPeriod.startTick = _slot0.tick;
            $.periods[period] = _newPeriod;
        }
    }

    /// @notice get the fee charged by the pool for swaps and liquidity provision
    function fee() external view override returns (uint24) {
        return PoolStorage.getStorage().fee;
    }

    function readStorage(bytes32[] calldata slots) external view returns (bytes32[] memory returnData) {
        uint256 slotsLength = slots.length;
        returnData = new bytes32[](slotsLength);

        for (uint256 i = 0; i < slotsLength; ++i) {
            bytes32 slot = slots[i];
            bytes32 _returnData;
            assembly {
                _returnData := sload(slot)
            }
            returnData[i] = _returnData;
        }
    }

    /// @notice Get the Slot0 struct for the pool
    function slot0()
        external
        view
        override
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        )
    {
        Slot0 memory _slot0 = PoolStorage.getStorage().slot0;

        return (
            _slot0.sqrtPriceX96,
            _slot0.tick,
            _slot0.observationIndex,
            _slot0.observationCardinality,
            _slot0.observationCardinalityNext,
            _slot0.feeProtocol,
            _slot0.unlocked
        );
    }

    /// @notice Get the PeriodInfo struct for a given period in the pool
    function periods(
        uint256 period
    )
        external
        view
        returns (uint32 previousPeriod, int24 startTick, int24 lastTick, uint160 endSecondsPerLiquidityPeriodX128)
    {
        PeriodInfo memory periodData = PoolStorage.getStorage().periods[period];
        return (
            periodData.previousPeriod,
            periodData.startTick,
            periodData.lastTick,
            periodData.endSecondsPerLiquidityPeriodX128
        );
    }

    /// @notice Get the index of the last period in the pool
    function lastPeriod() external view returns (uint256) {
        return PoolStorage.getStorage().lastPeriod;
    }

    /// @notice Get the accumulated fee growth for the first token in the pool
    function feeGrowthGlobal0X128() external view override returns (uint256) {
        return PoolStorage.getStorage().feeGrowthGlobal0X128;
    }

    /// @notice Get the accumulated fee growth for the second token in the pool
    function feeGrowthGlobal1X128() external view override returns (uint256) {
        return PoolStorage.getStorage().feeGrowthGlobal1X128;
    }

    /// @notice Get the protocol fees accumulated by the pool
    function protocolFees() external view override returns (uint128, uint128) {
        ProtocolFees memory protocolFeesData = PoolStorage.getStorage().protocolFees;
        return (protocolFeesData.token0, protocolFeesData.token1);
    }

    /// @notice Get the total liquidity of the pool
    function liquidity() external view override returns (uint128) {
        return PoolStorage.getStorage().liquidity;
    }

    /// @notice Get the ticks of the pool
    function ticks(
        int24 tick
    )
        external
        view
        override
        returns (
            uint128 liquidityGross,
            int128 liquidityNet,
            uint256 feeGrowthOutside0X128,
            uint256 feeGrowthOutside1X128,
            int56 tickCumulativeOutside,
            uint160 secondsPerLiquidityOutsideX128,
            uint32 secondsOutside,
            bool initialized
        )
    {
        TickInfo storage tickData = PoolStorage.getStorage()._ticks[tick];
        liquidityGross = tickData.liquidityGross;
        liquidityNet = tickData.liquidityNet;
        feeGrowthOutside0X128 = tickData.feeGrowthOutside0X128;
        feeGrowthOutside1X128 = tickData.feeGrowthOutside1X128;
        tickCumulativeOutside = tickData.tickCumulativeOutside;
        secondsPerLiquidityOutsideX128 = tickData.secondsPerLiquidityOutsideX128;
        secondsOutside = tickData.secondsOutside;
        initialized = tickData.initialized;
    }

    /// @notice Get the tick bitmap of the pool
    function tickBitmap(int16 tick) external view override returns (uint256) {
        return PoolStorage.getStorage().tickBitmap[tick];
    }

    /// @notice Get information about a specific position in the pool
    function positions(
        bytes32 key
    )
        external
        view
        override
        returns (
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        PositionInfo storage positionData = PoolStorage.getStorage().positions[key];
        return (
            positionData.liquidity,
            positionData.feeGrowthInside0LastX128,
            positionData.feeGrowthInside1LastX128,
            positionData.tokensOwed0,
            positionData.tokensOwed1
        );
    }

    /// @notice Get the period seconds in range of a specific position
    function positionPeriodSecondsInRange(
        uint256 period,
        address owner,
        uint256 index,
        int24 tickLower,
        int24 tickUpper
    ) external view returns (uint256 periodSecondsInsideX96) {
        periodSecondsInsideX96 = Position.positionPeriodSecondsInRange(
            Position.PositionPeriodSecondsInRangeParams({
                period: period,
                owner: owner,
                index: index,
                tickLower: tickLower,
                tickUpper: tickUpper,
                _blockTimestamp: _blockTimestamp()
            })
        );

        return periodSecondsInsideX96;
    }

    /// @notice Get the observations recorded by the pool
    function observations(
        uint256 index
    )
        external
        view
        override
        returns (
            uint32 blockTimestamp,
            int56 tickCumulative,
            uint160 secondsPerLiquidityCumulativeX128,
            bool initialized
        )
    {
        Observation memory observationData = PoolStorage.getStorage().observations[index];
        return (
            observationData.blockTimestamp,
            observationData.tickCumulative,
            observationData.secondsPerLiquidityCumulativeX128,
            observationData.initialized
        );
    }
}
