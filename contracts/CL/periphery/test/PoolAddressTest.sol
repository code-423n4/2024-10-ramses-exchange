// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import '../libraries/PoolAddress.sol';

contract PoolAddressTest {
    function POOL_INIT_CODE_HASH() external pure returns (bytes32) {
        return PoolAddress.POOL_INIT_CODE_HASH;
    }

    function computeAddress(
        address deployer,
        address token0,
        address token1,
        int24 tickSpacing
    ) external pure returns (address) {
        return
            PoolAddress.computeAddress(
                deployer,
                PoolAddress.PoolKey({token0: token0, token1: token1, tickSpacing: tickSpacing})
            );
    }

    function getGasCostOfComputeAddress(
        address deployer,
        address token0,
        address token1,
        int24 tickSpacing
    ) external view returns (uint256) {
        uint256 gasBefore = gasleft();
        PoolAddress.computeAddress(
            deployer,
            PoolAddress.PoolKey({token0: token0, token1: token1, tickSpacing: tickSpacing})
        );
        return gasBefore - gasleft();
    }
}
