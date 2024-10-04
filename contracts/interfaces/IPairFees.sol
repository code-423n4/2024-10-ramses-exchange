// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPairFees {
    function initialize(address _feeDistributor) external;
    function notifyFees() external;
}
