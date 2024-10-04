// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
import {IPairFees} from "./interfaces/IPairFees.sol";
import {IPairFeeFactory} from "./interfaces/IPairFeeFactory.sol";

/// @notice Pair Fees contract is used as a 1:1 pair relationship to split out fees, this ensures that the curve does not need to be modified for LP shares
contract PairFees is IPairFees {
    error STF();
    error Unauthorized();
    /// @notice The pair it is bonded to
    address public immutable pair;
    /// @notice voter contract which fees are gated to be claimed by 
    address public immutable voter;
    /// @notice feedist contract where pairfees will be sent to 
    address public feeDistributor;
    /// @notice factory contract for pairfees (legacy fees) 
    address public immutable pairFeeFactory; 

    constructor(address _pair, address _voter, address _pairFeeFactory) {
        pair = _pair;
        voter = _voter;
        pairFeeFactory = _pairFeeFactory;
    }

    /// @notice initialize the PairFees contract, gated to voter
    function initialize(address _feeDistributor) external {
        require(msg.sender == voter, Unauthorized());
        feeDistributor = _feeDistributor;
        IERC20(pair).approve(_feeDistributor, type(uint256).max);
    }

    /// @notice notifies the fees
    function notifyFees() external {
        /// @dev limit calling notifyFees() to the voter contract
        require(msg.sender == voter, Unauthorized());

        uint256 amount = IERC20(pair).balanceOf(address(this));
        uint256 feeToTreasury = IPairFeeFactory(pairFeeFactory).feeToTreasury();
        if (feeToTreasury > 0) {
            address treasury = IPairFeeFactory(pairFeeFactory).treasury();
            uint256 amountToTreasury = (amount * feeToTreasury) / 10000;
            amount -= amountToTreasury;
            IERC20(pair).transfer(treasury, amountToTreasury);
        }

        if (amount > 0) {
            
            IFeeDistributor(feeDistributor).notifyRewardAmount(pair, amount);
        }
    }
}
