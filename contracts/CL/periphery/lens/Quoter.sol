// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;
pragma abicoder v2;

import '../../core/libraries/SafeCast.sol';
import '../../core/libraries/TickMath.sol';
import '../../core/interfaces/IRamsesV3Pool.sol';
import '../../core/interfaces/callback/IUniswapV3SwapCallback.sol';

import '../interfaces/IQuoter.sol';
import '../base/PeripheryImmutableState.sol';
import '../libraries/Path.sol';
import '../libraries/PoolAddress.sol';
import '../libraries/CallbackValidation.sol';

/// @title Provides quotes for swaps
/// @notice Allows getting the expected amount out or amount in for a given swap without executing the swap
/// @dev These functions are not gas efficient and should _not_ be called on chain. Instead, optimistically execute
/// the swap and check the amounts in the callback.
contract Quoter is IQuoter, IUniswapV3SwapCallback, PeripheryImmutableState {
    using Path for bytes;
    using SafeCast for uint256;

    /// @dev Transient storage variable used to check a safety condition in exact output swaps.
    uint256 private amountOutCached;

    constructor(address _deployer, address _WETH9) PeripheryImmutableState(_deployer, _WETH9) {}

    function getPool(address tokenA, address tokenB, int24 tickSpacing) private view returns (IRamsesV3Pool) {
        return IRamsesV3Pool(PoolAddress.computeAddress(deployer, PoolAddress.getPoolKey(tokenA, tokenB, tickSpacing)));
    }

    /// @inheritdoc IUniswapV3SwapCallback
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes memory path) external view override {
        /// @dev swaps entirely within 0-liquidity regions are not supported
        require(amount0Delta > 0 || amount1Delta > 0); 
        (address tokenIn, address tokenOut, int24 tickSpacing) = path.decodeFirstPool();
        CallbackValidation.verifyCallback(deployer, tokenIn, tokenOut, tickSpacing);

        (bool isExactInput, uint256 amountToPay, uint256 amountReceived) = amount0Delta > 0
            ? (tokenIn < tokenOut, uint256(amount0Delta), uint256(-amount1Delta))
            : (tokenOut < tokenIn, uint256(amount1Delta), uint256(-amount0Delta));
        if (isExactInput) {
            assembly {
                let ptr := mload(0x40)
                mstore(ptr, amountReceived)
                revert(ptr, 32)
            }
        } else {
            /// @dev if the cache has been populated, ensure that the full output amount has been received
            if (amountOutCached != 0) require(amountReceived == amountOutCached);
            assembly {
                let ptr := mload(0x40)
                mstore(ptr, amountToPay)
                revert(ptr, 32)
            }
        }
    }

    /// @dev Parses a revert reason that should contain the numeric quote
    function parseRevertReason(bytes memory reason) private pure returns (uint256) {
        if (reason.length != 32) {
            if (reason.length < 68) revert('Unexpected error');
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256));
    }

    /// @inheritdoc IQuoter
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        int24 tickSpacing,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) public override returns (uint256 amountOut) {
        bool zeroForOne = tokenIn < tokenOut;

        try
            getPool(tokenIn, tokenOut, tickSpacing).swap(
                /// @dev address(0) might cause issues with some tokens
                address(this), 
                zeroForOne,
                amountIn.toInt256(),
                sqrtPriceLimitX96 == 0
                    ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                    : sqrtPriceLimitX96,
                abi.encodePacked(tokenIn, tickSpacing, tokenOut)
            )
        {} catch (bytes memory reason) {
            return parseRevertReason(reason);
        }
    }

    /// @inheritdoc IQuoter
    function quoteExactInput(bytes memory path, uint256 amountIn) external override returns (uint256 amountOut) {
        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            (address tokenIn, address tokenOut, int24 tickSpacing) = path.decodeFirstPool();

            /// @dev the outputs of prior swaps become the inputs to subsequent ones
            amountIn = quoteExactInputSingle(tokenIn, tokenOut, tickSpacing, amountIn, 0);

            /// @dev decide whether to continue or terminate
            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                return amountIn;
            }
        }
    }

    /// @inheritdoc IQuoter
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        int24 tickSpacing,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) public override returns (uint256 amountIn) {
        bool zeroForOne = tokenIn < tokenOut;

        /// @dev if no price limit has been specified, cache the output amount for comparison in the swap callback
        if (sqrtPriceLimitX96 == 0) amountOutCached = amountOut;
        try
            getPool(tokenIn, tokenOut, tickSpacing).swap(
                /// @dev address(0) might cause issues with some tokens
                address(this), 
                zeroForOne,
                -amountOut.toInt256(),
                sqrtPriceLimitX96 == 0
                    ? (zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1)
                    : sqrtPriceLimitX96,
                abi.encodePacked(tokenOut, tickSpacing, tokenIn)
            )
        {} catch (bytes memory reason) {
            /// @dev clear cache
            if (sqrtPriceLimitX96 == 0) delete amountOutCached; 
            return parseRevertReason(reason);
        }
    }

    /// @inheritdoc IQuoter
    function quoteExactOutput(bytes memory path, uint256 amountOut) external override returns (uint256 amountIn) {
        while (true) {
            bool hasMultiplePools = path.hasMultiplePools();

            (address tokenOut, address tokenIn, int24 tickSpacing) = path.decodeFirstPool();

            /// @dev the inputs of prior swaps become the outputs of subsequent ones
            amountOut = quoteExactOutputSingle(tokenIn, tokenOut, tickSpacing, amountOut, 0);

            /// @dev decide whether to continue or terminate
            if (hasMultiplePools) {
                path = path.skipToken();
            } else {
                return amountOut;
            }
        }
    }
}
