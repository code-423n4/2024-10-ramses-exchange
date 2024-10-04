// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import '../libraries/CallbackValidation.sol';

contract TestCallbackValidation {
    function verifyCallback(
        address deployer,
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external view returns (IRamsesV3Pool pool) {
        return CallbackValidation.verifyCallback(deployer, tokenA, tokenB, tickSpacing);
    }
}
