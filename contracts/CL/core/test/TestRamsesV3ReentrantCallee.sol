// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import {TickMath} from '../libraries/TickMath.sol';

import {IUniswapV3SwapCallback} from '../interfaces/callback/IUniswapV3SwapCallback.sol';

import {IRamsesV3Pool} from '../interfaces/IRamsesV3Pool.sol';

contract TestRamsesV3ReentrantCallee is IUniswapV3SwapCallback {
    string private constant expectedError = 'LOK()';

    function swapToReenter(address pool) external {
        IRamsesV3Pool(pool).swap(address(0), false, 1, TickMath.MAX_SQRT_RATIO - 1, new bytes(0));
    }

    function uniswapV3SwapCallback(int256, int256, bytes calldata) external override {
        // try to reenter swap
        try IRamsesV3Pool(msg.sender).swap(address(0), false, 1, 0, new bytes(0)) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        // try to reenter mint
        try IRamsesV3Pool(msg.sender).mint(address(0), 0, 0, 0, 0, new bytes(0)) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        // try to reenter collect
        try IRamsesV3Pool(msg.sender).collect(address(0), 0, 0, 0, 0, 0) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        // try to reenter burn
        try IRamsesV3Pool(msg.sender).burn(0, 0, 0, 0) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        // try to reenter flash
        try IRamsesV3Pool(msg.sender).flash(address(0), 0, 0, new bytes(0)) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        // try to reenter collectProtocol
        try IRamsesV3Pool(msg.sender).collectProtocol(address(0), 0, 0) {} catch (bytes memory error) {
            require(keccak256(error) == keccak256(abi.encodeWithSignature(expectedError)));
        }

        require(false, 'Unable to reenter');
    }
}
