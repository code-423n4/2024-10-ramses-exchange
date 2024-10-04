// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

import {IPair} from "./../../../../../interfaces/IPair.sol";
import {RamsesLegacyLibrary} from "./RamsesLegacyLibrary.sol";
import {RouterImmutables} from "../../../base/RouterImmutables.sol";
import {Payments} from "../../Payments.sol";
import {Permit2Payments} from "../../Permit2Payments.sol";
import {Constants} from "../../../libraries/Constants.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SwapRoute} from "../../../libraries/SwapRoute.sol";
import {IPairFactory} from "./../../../../../interfaces/IPairFactory.sol";

/// @title Router for Uniswap v2 Trades
abstract contract V2SwapRouter is RouterImmutables, Permit2Payments {
    error V2TooLittleReceived();
    error V2TooMuchRequested();
    error V2InvalidPath();

    function _v2Swap(
        SwapRoute.Route[] memory path,
        address recipient,
        address pair
    ) private {
        unchecked {
            // cached to save on duplicate operations
            (address token0, ) = RamsesLegacyLibrary.sortTokens(
                path[0].from,
                path[0].to
            );

            uint256 lastIndex = path.length - 1;
            for (uint256 i; i < path.length; i++) {
                (address input, address output) = (path[i].from, path[i].to);
                (
                    uint256 decimals0,
                    uint256 decimals1,
                    uint256 reserve0,
                    uint256 reserve1,
                    ,
                    ,

                ) = IPair(pair).metadata();
                (
                    uint256 reserveInput,
                    uint256 reserveOutput,
                    uint256 decimalsInput,
                    uint256 decimalsOutput
                ) = input == token0
                        ? (reserve0, reserve1, decimals0, decimals1)
                        : (reserve1, reserve0, decimals1, decimals0);
                uint256 amountInput = ERC20(input).balanceOf(pair) -
                    reserveInput;
                amountInput -=
                    (amountInput *
                        IPairFactory(UNISWAP_V2_FACTORY).pairFee(pair)) /
                    10000;
                uint256 amountOutput = RamsesLegacyLibrary.getAmountOut(
                    amountInput,
                    reserveInput,
                    reserveOutput,
                    path[i].stable,
                    decimalsInput,
                    decimalsOutput
                );
                (uint256 amount0Out, uint256 amount1Out) = input == token0
                    ? (uint256(0), amountOutput)
                    : (amountOutput, uint256(0));
                address nextPair;
                (nextPair, token0) = i < lastIndex
                    ? RamsesLegacyLibrary.pairAndToken0For(
                        UNISWAP_V2_FACTORY,
                        UNISWAP_V2_PAIR_INIT_CODE_HASH,
                        output,
                        path[i + 1].to,
                        path[i + 1].stable
                    )
                    : (recipient, address(0));
                IPair(pair).swap(
                    amount0Out,
                    amount1Out,
                    nextPair,
                    new bytes(0)
                );
                pair = nextPair;
            }
        }
    }

    /// @notice Performs a Uniswap v2 exact input swap
    /// @param recipient The recipient of the output tokens
    /// @param amountIn The amount of input tokens for the trade
    /// @param amountOutMinimum The minimum desired amount of output tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    function v2SwapExactInput(
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        SwapRoute.Route[] memory path,
        address payer
    ) internal {
        address firstPair = RamsesLegacyLibrary.pairFor(
            UNISWAP_V2_FACTORY,
            UNISWAP_V2_PAIR_INIT_CODE_HASH,
            path[0].from,
            path[0].to,
            path[0].stable
        );
        if (
            amountIn != Constants.ALREADY_PAID // amountIn of 0 to signal that the pair already has the tokens
        ) {
            payOrPermit2Transfer(path[0].from, payer, firstPair, amountIn);
        }

        ERC20 tokenOut = ERC20(path[path.length - 1].to);
        uint256 balanceBefore = tokenOut.balanceOf(recipient);

        _v2Swap(path, recipient, firstPair);

        uint256 amountOut = tokenOut.balanceOf(recipient) - balanceBefore;
        if (amountOut < amountOutMinimum) revert V2TooLittleReceived();
    }

    /// @notice Performs a Uniswap v2 exact output swap
    /// @param recipient The recipient of the output tokens
    /// @param amountOut The amount of output tokens to receive for the trade
    /// @param amountInMaximum The maximum desired amount of input tokens
    /// @param path The path of the trade as an array of token addresses
    /// @param payer The address that will be paying the input
    function v2SwapExactOutput(
        address recipient,
        uint256 amountOut,
        uint256 amountInMaximum,
        SwapRoute.Route[] memory path,
        address payer
    ) internal {
        (uint256 amountIn, address firstPair) = RamsesLegacyLibrary
            .getAmountInMultihop(
                UNISWAP_V2_FACTORY,
                UNISWAP_V2_PAIR_INIT_CODE_HASH,
                amountOut,
                path
            );
        if (amountIn > amountInMaximum) revert V2TooMuchRequested();

        payOrPermit2Transfer(path[0].from, payer, firstPair, amountIn);
        _v2Swap(path, recipient, firstPair);
    }
}
