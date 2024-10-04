// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import {RamsesV3Pool} from '../RamsesV3Pool.sol';
import {PoolStorage} from '../libraries/PoolStorage.sol';

// used for testing time dependent behavior
contract MockTimeRamsesV3Pool is RamsesV3Pool {
    // Monday, October 5, 2020 9:00:00 AM GMT-05:00
    uint256 public time = 1601906400;

    function setFeeGrowthGlobal0X128(uint256 _feeGrowthGlobal0X128) external {
        PoolStorage.getStorage().feeGrowthGlobal0X128 = _feeGrowthGlobal0X128;
    }

    function setFeeGrowthGlobal1X128(uint256 _feeGrowthGlobal1X128) external {
        PoolStorage.getStorage().feeGrowthGlobal1X128 = _feeGrowthGlobal1X128;
    }

    function advanceTime(uint256 by) external {
        time += by;
    }

    function _blockTimestamp() internal view override returns (uint32) {
        return uint32(time);
    }

    function _setFee(uint24 _fee) external {
        PoolStorage.PoolState storage $ = PoolStorage.getStorage();
        $.fee = _fee;
    }
}
