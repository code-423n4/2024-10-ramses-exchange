// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IGaugeFactory {
    /// @notice create a legacy gauge for a specific pool
    /// @param pool the address of the pool
    /// @return newGauge is the address of the created gauge
    function createGauge(address pool) external returns (address newGauge);
}
