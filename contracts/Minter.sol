// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";

import {IERC20Extended} from "./interfaces/IERC20Extended.sol";
import {IMinter} from "./interfaces/IMinter.sol";
import {IVoter} from "./interfaces/IVoter.sol";
import {IRebaseDistributor} from "./interfaces/IRebaseDistributor.sol";

contract Minter is IMinter, AccessManaged {
    /// @notice emissions value
    uint256 public weeklyEmissions;
    /// @notice controls emissions growth or decay
    uint256 public emissionsMultiplier;
    /// @notice contributor rate of total emissions, default 5%
    uint256 public contributorRate = 500;
    /// @notice unix timestamp of the first period
    uint256 public firstPeriod;
    /// @notice currently active unix timestamp of epoch start
    uint256 public activePeriod;
    /// @notice % rebase, defaults to 20%
    uint256 public rebaseRate = 2000;
    /// @notice minimum rebase rate of 2%
    uint256 public constant MIN_REBASE = 200;
    /// @notice rebase cannot exceed 40.00%
    uint256 public constant MAX_REBASE = 4000;
    /// @notice basis invariant 10_000 = 100%
    uint256 public constant BASIS = 10000;
    /// @notice max amount to multisig - 5%
    uint256 public constant MAX_CONTRIBUTOR = 500;

    /// @notice multisig address
    address public contributorMultisig;
    /// @notice governance emissions token
    address public emissionsToken;
    /// @notice central voter contract
    address public voter;
    /// @notice rebasing contract
    address public rebaseDistributor;

    constructor(address _accessManager) AccessManaged(_accessManager) {}

    /// @inheritdoc IMinter
    function kickoff(
        address _emissionsToken,
        address _voter,
        uint256 initialSupply,
        address _multisig,
        address _rebaseDistributor,
        uint256 _initialWeeklyEmissions
    ) external restricted {
        require(emissionsToken == address(0), Started());
        emissionsToken = _emissionsToken;
        voter = _voter;
        contributorMultisig = _multisig;
        rebaseDistributor = _rebaseDistributor;
        /// @dev starting emissions
        weeklyEmissions = _initialWeeklyEmissions;
        emit SetVoter(_voter);

        /// @dev if initial supply is greater than 0, mint the supply to the multisig
        if (initialSupply > 0) {
            IERC20Extended(emissionsToken).mint(
                contributorMultisig,
                initialSupply
            );
        }
    }

    /// @inheritdoc IMinter
    function updatePeriod() external returns (uint256 period) {
        /// @dev set period equal to the current activePeriod
        period = activePeriod;

        /// @dev if >= Thursday 0 UTC
        if (getPeriod() > period) {
            period = getPeriod();
            activePeriod = period;
            uint256 _weeklyEmissions = calculateWeeklyEmissions();

            uint256 weeklyRebase = calculateRebase(_weeklyEmissions);

            uint256 _contributorEmissions = ((contributorRate *
                (_weeklyEmissions + weeklyRebase)) / BASIS);

            weeklyEmissions = _weeklyEmissions;

            /// @dev mint emissions to the Minter contract
            IERC20Extended(emissionsToken).mint(
                address(this),
                _weeklyEmissions + weeklyRebase
            );
            /// @dev contributor emissions
            IERC20Extended(emissionsToken).mint(
                contributorMultisig,
                _contributorEmissions
            );
            /// @dev approvals for emissionsToken on voter and rebaseDistributor
            IERC20Extended(emissionsToken).approve(voter, _weeklyEmissions);
            IERC20Extended(emissionsToken).approve(
                rebaseDistributor,
                weeklyRebase
            );

            /// @dev notifes emissions to the voter contract
            IVoter(voter).notifyRewardAmount(_weeklyEmissions);
            /// @dev notifies rebase to the distributor
            IRebaseDistributor(rebaseDistributor).notifyRewardAmount(
                weeklyRebase
            );

            emit Mint(msg.sender, _weeklyEmissions, weeklyRebase);
        }
    }

    /// @inheritdoc IMinter
    function startEmissions() external restricted {
        /// @dev ensure epoch 0 has not started yet
        require(firstPeriod == 0, Started());
        activePeriod = getPeriod();
        firstPeriod = activePeriod;
        /// @dev mints the epoch 0 emissions for manual distribution
        IERC20Extended(emissionsToken).mint(
            contributorMultisig,
            weeklyEmissions
        );
    }

    /// @inheritdoc IMinter
    function updateEmissionsMultiplier(
        uint256 _emissionsMultiplier
    ) external restricted {
        emissionsMultiplier = _emissionsMultiplier;
        emit EmissionsMultiplierUpdated(_emissionsMultiplier);
    }

    /// @inheritdoc IMinter
    function updateRebaseRate(uint256 _rebaseRate) external restricted {
        require(_rebaseRate >= MIN_REBASE, VTL());
        require(_rebaseRate <= MAX_REBASE, VTH());
        rebaseRate = _rebaseRate;
        emit RebaseRateUpdated(_rebaseRate);
    }

    /// @inheritdoc IMinter
    function updateContributorRate(uint256 _newRate) external restricted {
        require(_newRate <= MAX_CONTRIBUTOR, VTH());
        contributorRate = _newRate;
        emit ContributorRateUpdated(_newRate);
    }

    /// @inheritdoc IMinter
    function calculateWeeklyEmissions()
        public
        view
        returns (uint256 _weeklyEmissions)
    {
        _weeklyEmissions = (weeklyEmissions * emissionsMultiplier) / BASIS;
    }

    /// @inheritdoc IMinter
    function calculateRebase(
        uint256 _weeklyEmissions
    ) public view returns (uint256 rebase) {
        rebase = (_weeklyEmissions * rebaseRate) / BASIS;
    }

    /// @inheritdoc IMinter
    function getPeriod() public view returns (uint256 period) {
        period = block.timestamp / 1 weeks;
    }

    /// @inheritdoc IMinter
    function getEpoch() public view returns (uint256 _epoch) {
        /// @dev if it's before epoch 1, return epoch 0
        _epoch = (
            ((activePeriod - firstPeriod) < 1 weeks)
                ? 0
                : ((activePeriod - firstPeriod) / 1 weeks)
        );
    }
}
