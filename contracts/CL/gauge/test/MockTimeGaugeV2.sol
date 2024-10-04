// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.13;

import "../GaugeV3.sol";

interface IMockTimeClPool {
    function time() external view returns (uint256 _time);
}

contract MockTimeGaugeV3 is GaugeV3 {
    constructor(
        address _voter,
        address _nfpManager,
        address _feeCollector,
        address _pool
    ) GaugeV3(_voter, _nfpManager, _feeCollector, _pool) {}

    function _blockTimestamp() internal view override returns (uint256) {
        return IMockTimeClPool(address(pool)).time();
    }
}
