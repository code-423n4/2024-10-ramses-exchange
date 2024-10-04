// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import '../base/PeripheryImmutableState.sol';

contract PeripheryImmutableStateTest is PeripheryImmutableState {
    constructor(address _deployer, address _WETH9) PeripheryImmutableState(_deployer, _WETH9) {}
}
