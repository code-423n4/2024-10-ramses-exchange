// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';

import {RamsesV3Pool} from './RamsesV3Pool.sol';
import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';

contract RamsesV3PoolDeployer is IRamsesV3PoolDeployer {
    address public immutable RamsesV3Factory;

    constructor(address _RamsesV3Factory) {
        RamsesV3Factory = _RamsesV3Factory;
    }

    /// @dev Deploys a pool with the given parameters by transiently setting the parameters storage slot and then
    /// clearing it after deploying the pool.
    /// @param token0 The first token of the pool by address sort order
    /// @param token1 The second token of the pool by address sort order
    /// @param tickSpacing The tickSpacing of the pool
    function deploy(address token0, address token1, int24 tickSpacing) external returns (address pool) {
        require(msg.sender == RamsesV3Factory);
        pool = address(new RamsesV3Pool{salt: keccak256(abi.encodePacked(token0, token1, tickSpacing))}());
    }

    function parameters()
        external
        view
        returns (address factory, address token0, address token1, uint24 fee, int24 tickSpacing)
    {
        (factory, token0, token1, fee, tickSpacing) = IRamsesV3Factory(RamsesV3Factory).parameters();
    }

    function poolBytecode() external pure returns (bytes memory _bytecode) {
        _bytecode = type(RamsesV3Pool).creationCode;
    }
}
