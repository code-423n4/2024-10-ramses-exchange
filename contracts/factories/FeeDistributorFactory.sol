// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {FeeDistributor} from "./../FeeDistributor.sol";

contract FeeDistributorFactory {
    address public lastFeeDistributor;

    function createFeeDistributor(address pairFees) external returns (address) {
        lastFeeDistributor = address(new FeeDistributor(msg.sender, pairFees));

        return lastFeeDistributor;
    }
}
