// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import '../../core/interfaces/IRamsesV3Factory.sol';
import '../../core/interfaces/IRamsesV3Pool.sol';

import './PeripheryImmutableState.sol';
import '../interfaces/IPoolInitializer.sol';

/// @title Creates and initializes V3 Pools
abstract contract PoolInitializer is IPoolInitializer, PeripheryImmutableState {
    /// @inheritdoc IPoolInitializer
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        int24 tickSpacing,
        uint160 sqrtPriceX96
    ) external payable override returns (address pool) {
        require(token0 < token1);
        pool = IRamsesV3Factory(deployer).getPool(token0, token1, tickSpacing);

        if (pool == address(0)) {
            pool = IRamsesV3Factory(deployer).createPool(token0, token1, tickSpacing, sqrtPriceX96);
        } else {
            (uint160 sqrtPriceX96Existing, , , , , , ) = IRamsesV3Pool(pool).slot0();
            if (sqrtPriceX96Existing == 0) {
                IRamsesV3Pool(pool).initialize(sqrtPriceX96);
            }
        }
    }
}
