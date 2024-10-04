// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import './BlockTimestamp.sol';

abstract contract PeripheryValidation is BlockTimestamp {
    error Old();
    modifier checkDeadline(uint256 deadline) {
        if (_blockTimestamp() > deadline) revert Old();
        _;
    }
}
