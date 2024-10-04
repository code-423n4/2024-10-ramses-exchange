// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import {IRamsesV3PoolDeployer} from '../interfaces/IRamsesV3PoolDeployer.sol';
import {MockTimeRamsesV3Pool} from './MockTimeRamsesV3Pool.sol';
import {IRamsesV3Factory} from '../interfaces/IRamsesV3Factory.sol';

contract MockTimeRamsesV3PoolDeployer {
    //event PoolDeployed(address pool);

    address public immutable ramsesV3Factory;

    constructor(address _ramsesV3Factory) {
        ramsesV3Factory = _ramsesV3Factory;
    }

    function deploy(address token0, address token1, int24 tickSpacing) external returns (address pool) {
        pool = address(new MockTimeRamsesV3Pool{salt: keccak256(abi.encodePacked(token0, token1, tickSpacing))}());
        //emit PoolDeployed(pool);
    }

    function parameters()
        external
        view
        returns (address factory, address token0, address token1, uint24 fee, int24 tickSpacing)
    {
        (factory, token0, token1, fee, tickSpacing) = IRamsesV3Factory(ramsesV3Factory).parameters();
    }
}
