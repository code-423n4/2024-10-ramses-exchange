// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import {IPairFeeFactory} from "../interfaces/IPairFeeFactory.sol";
import {PairFees} from "./../PairFees.sol";

contract PairFeeFactory is IPairFeeFactory, AccessManaged {
    error InvalidFeeToTreasury();
    error Unauthorized();

    /// @inheritdoc IPairFeeFactory
    address public lastPairFees;

    /// @inheritdoc IPairFeeFactory
    address public treasury;

    address public immutable voter;

    /// @inheritdoc IPairFeeFactory
    uint256 public feeToTreasury;

    /// @inheritdoc IPairFeeFactory
    mapping(address pair => address pairFees) public pairFeesForPair;

    event SetFeeToTreasury(uint256 indexed feeToTreasury);

    constructor(
        address _treasury,
        address _voter,
        address _accessManager
    ) AccessManaged(_accessManager) {
        treasury = _treasury;
        voter = _voter;
    }
    /// @inheritdoc IPairFeeFactory
    function createPairFees(address pair) external returns (address _pairFees) {
        /// @dev ensure caller is the voter
        require(msg.sender == voter, Unauthorized());

        _pairFees = address(new PairFees(pair, msg.sender, address(this)));
        /// @dev dont need to ensure that pairFees wasn't already made previously
        pairFeesForPair[pair] = _pairFees;
        lastPairFees = _pairFees;
    }
    /// @inheritdoc IPairFeeFactory
    function setFeeToTreasury(uint256 _feeToTreasury) external restricted {
        /// @dev ensure fee to treasury isn't too high
        require(_feeToTreasury <= 10000, InvalidFeeToTreasury());
        feeToTreasury = _feeToTreasury;
        emit SetFeeToTreasury(_feeToTreasury);
    }

    /// @inheritdoc IPairFeeFactory
    function setTreasury(address _treasury) external restricted {
        treasury = _treasury;
    }
}
