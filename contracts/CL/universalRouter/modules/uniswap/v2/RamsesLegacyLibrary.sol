// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0;

import {IPair} from "./../../../../../interfaces/IPair.sol";
import {SwapRoute} from "../../../libraries/SwapRoute.sol";
import {IPairFactory} from "./../../../../../interfaces/IPairFactory.sol";

/// @title Ramses legacy Helper Library
/// @notice Calculates the recipient address for a command
library RamsesLegacyLibrary {
    error InvalidReserves();
    error InvalidPath();

    /// @notice Calculates the address for a pair without making any external calls
    /// @param factory The address of the factory
    /// @param initCodeHash The hash of the pair initcode
    /// @param tokenA One of the tokens in the pair
    /// @param tokenB The other token in the pair
    /// @param stable If pair is xy(x^2 + y^2)
    /// @return pair The resultant pair address
    function pairFor(
        address factory,
        bytes32 initCodeHash,
        address tokenA,
        address tokenB,
        bool stable
    ) internal pure returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = pairForPreSorted(factory, initCodeHash, token0, token1, stable);
    }

    /// @notice Calculates the address for a pair and the pair's token0
    /// @param factory The address of the factory
    /// @param initCodeHash The hash of the pair initcode
    /// @param tokenA One of the tokens in the pair
    /// @param tokenB The other token in the pair
    /// @param stable If pair is xy(x^2 + y^2)
    /// @return pair The resultant pair address
    /// @return token0 The token considered token0 in this pair
    function pairAndToken0For(
        address factory,
        bytes32 initCodeHash,
        address tokenA,
        address tokenB,
        bool stable
    ) internal pure returns (address pair, address token0) {
        address token1;
        (token0, token1) = sortTokens(tokenA, tokenB);
        pair = pairForPreSorted(factory, initCodeHash, token0, token1, stable);
    }

    /// @notice Calculates the address for a pair assuming the input tokens are pre-sorted
    /// @param factory The address of the factory
    /// @param initCodeHash The hash of the pair initcode
    /// @param token0 The pair's token0
    /// @param token1 The pair's token1
    /// @param stable If pair is xy(x^2 + y^2)
    /// @return pair The resultant pair address
    function pairForPreSorted(
        address factory,
        bytes32 initCodeHash,
        address token0,
        address token1,
        bool stable
    ) private pure returns (address pair) {
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1, stable)),
                            initCodeHash
                        )
                    )
                )
            )
        );
    }

    /// @notice Calculates the address for a pair and fetches the reserves for each token
    /// @param factory The address of the factory
    /// @param initCodeHash The hash of the pair initcode
    /// @param tokenA One of the tokens in the pair
    /// @param tokenB The other token in the pair
    /// @param stable If pair is xy(x^2 + y^2)
    /// @return pair The resultant pair address
    /// @return reserveA The reserves for tokenA
    /// @return reserveB The reserves for tokenB
    function pairAndReservesFor(
        address factory,
        bytes32 initCodeHash,
        address tokenA,
        address tokenB,
        bool stable
    )
        private
        view
        returns (
            address pair,
            uint256 reserveA,
            uint256 reserveB,
            uint256 decimalsA,
            uint256 decimalsB
        )
    {
        address token0;
        (pair, token0) = pairAndToken0For(
            factory,
            initCodeHash,
            tokenA,
            tokenB,
            stable
        );
        (
            uint256 decimals0,
            uint256 decimals1,
            uint256 reserve0,
            uint256 reserve1,
            ,
            ,

        ) = IPair(pair).metadata();
        (reserveA, reserveB) = tokenA == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
        if (stable) {
            (decimalsA, decimalsB) = tokenA == token0
                ? (decimals0, decimals1)
                : (decimals1, decimals0);
        }
    }

    /// @notice Given an input asset amount returns the maximum output amount of the other asset
    /// @param amountIn The token input amount
    /// @param reserveIn The reserves available of the input token
    /// @param reserveOut The reserves available of the output token
    /// @return amountOut The output amount of the output token
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut,
        bool stable,
        uint256 decimalsIn,
        uint256 decimalsOut
    ) internal pure returns (uint256 amountOut) {
        if (stable) {
            uint256 k = _k(reserveIn, reserveOut, decimalsIn, decimalsOut);
            reserveIn = (reserveIn * 1e18) / decimalsIn;
            reserveOut = (reserveOut * 1e18) / decimalsOut;
            amountIn = (amountIn * 1e18) / decimalsIn;
            uint256 y = reserveOut -
                _get_y(
                    amountIn + reserveIn,
                    k,
                    reserveOut,
                    decimalsIn,
                    decimalsOut
                );
            amountOut = (y * decimalsOut) / 1e18;
        } else {
            amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
        }
    }

    /// @notice Returns the input amount needed for a desired output amount in a single-hop trade
    /// @param amountOut The desired output amount
    /// @param reserveIn The reserves available of the input token
    /// @param reserveOut The reserves available of the output token
    /// @return amountIn The input amount of the input token
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 decimalsIn,
        uint256 decimalsOut,
        bool stable
    ) internal pure returns (uint256 amountIn) {
        if (reserveIn == 0 || reserveOut == 0) revert InvalidReserves();

        if (stable) {
            uint256 k = _k(reserveIn, reserveOut, decimalsIn, decimalsOut);
            reserveIn = (reserveIn * 1e18) / decimalsIn;
            reserveOut = (reserveOut * 1e18) / decimalsOut;
            amountOut = (amountOut * 1e18) / decimalsIn;
            uint256 y = _get_y(
                reserveOut - amountOut,
                k,
                reserveIn,
                decimalsIn,
                decimalsOut
            ) - reserveIn;
            amountIn = (y * decimalsIn) / 1e18;
        } else {
            amountIn = (reserveIn * amountOut) / (reserveOut - amountOut);
        }
    }

    /// @notice Returns the input amount needed for a desired output amount in a multi-hop trade
    /// @param factory The address of the v2 factory
    /// @param initCodeHash The hash of the pair initcode
    /// @param amountOut The desired output amount
    /// @param path The path of the multi-hop trade
    /// @return amount The input amount of the input token
    /// @return pair The first pair in the trade
    function getAmountInMultihop(
        address factory,
        bytes32 initCodeHash,
        uint256 amountOut,
        SwapRoute.Route[] memory path
    ) internal view returns (uint256 amount, address pair) {
        if (path.length < 2) revert InvalidPath();
        amount = amountOut;
        for (uint256 i = path.length - 1; i > 0; i--) {
            uint256 reserveIn;
            uint256 reserveOut;
            uint256 decimalsIn;
            uint256 decimalsOut;
            (
                pair,
                reserveIn,
                reserveOut,
                decimalsIn,
                decimalsOut
            ) = pairAndReservesFor(
                factory,
                initCodeHash,
                path[i].from,
                path[i].to,
                path[i].stable
            );
            amount = getAmountIn(
                amount,
                reserveIn,
                reserveOut,
                decimalsIn,
                decimalsOut,
                path[i].stable
            );
            amount += (amount * IPairFactory(factory).pairFee(pair)) / 10000;
        }
    }

    /// @notice Sorts two tokens to return token0 and token1
    /// @param tokenA The first token to sort
    /// @param tokenB The other token to sort
    /// @return token0 The smaller token by address value
    /// @return token1 The larger token by address value
    function sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
    }

    /// @notice solve k = xy(x^2 + y^2)
    /// @param reserve0 The reserves available of token0
    /// @param reserve1 The reserves available of token1
    /// @param decimals0 10** decimals of the token0
    /// @param decimals1 10**decimals of the token1
    /// @return k
    function _k(
        uint256 reserve0,
        uint256 reserve1,
        uint256 decimals0,
        uint256 decimals1
    ) internal pure returns (uint256 k) {
        uint256 _x = (reserve0 * 1e18) / decimals0;
        uint256 _y = (reserve1 * 1e18) / decimals1;
        uint256 _a = (_x * _y) / 1e18;
        uint256 _b = ((_x * _x) / 1e18 + (_y * _y) / 1e18);
        k = (_a * _b) / 1e18;
    }

    function _f(uint256 x0, uint256 y) internal pure returns (uint256) {
        uint256 _a = (x0 * y) / 1e18;
        uint256 _b = ((x0 * x0) / 1e18 + (y * y) / 1e18);
        return (_a * _b) / 1e18;
    }

    function _d(uint256 x0, uint256 y) internal pure returns (uint256) {
        return
            (3 * x0 * ((y * y) / 1e18)) /
            1e18 +
            ((((x0 * x0) / 1e18) * x0) / 1e18);
    }

    function _get_y(
        uint256 x0,
        uint256 xy,
        uint256 y,
        uint256 decimals0,
        uint256 decimals1
    ) internal pure returns (uint256 _y) {
        for (uint256 i = 0; i < 255; i++) {
            uint256 k = _f(x0, y);
            if (k < xy) {
                uint256 dy = ((xy - k) * 1e18) / _d(x0, y);
                if (dy == 0) {
                    if (k == xy) {
                        return y;
                    }
                    if (_k(x0, y + 1, decimals0, decimals1) > xy) {
                        return y + 1;
                    }
                    dy = 1;
                }
                y = y + dy;
            } else {
                uint256 dy = ((k - xy) * 1e18) / _d(x0, y);
                if (dy == 0) {
                    if (k == xy || _f(x0, y - 1) < xy) {
                        return y;
                    }
                    dy = 1;
                }
                y = y - dy;
            }
        }
    }
}
