// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IVotingEscrow} from "./interfaces/IVotingEscrow.sol";
import {IRebaseDistributor} from "./interfaces/IRebaseDistributor.sol";

contract RebaseDistributor is IRebaseDistributor {
    /// @notice the voter contract address
    address public immutable voter;
    /// @notice ve address
    address public immutable votingEscrow;
    /// @notice emissions token address
    address public immutable emissionsToken;

    /// @notice the first period for governance
    uint256 public immutable firstPeriod;

    /// @notice total amount of voting power per epoch
    mapping(uint256 period => uint256 weight) public votingPower;

    /// @notice period => token id => amount
    mapping(uint256 period => mapping(uint256 tokenId => uint256 weight))
        public userVotingPower;

    /// @notice period => total supply
    mapping(uint256 period => uint256 amount) public rewardSupply;

    /// @notice period => token id => amount
    mapping(uint256 period => mapping(uint256 tokenId => uint256 amount))
        public userClaimed;

    /// @notice token => token id => period
    mapping(uint256 tokenId => uint256 period) public lastClaim;

    event Deposit(uint256 tokenId, uint256 amount);

    event Withdraw(uint256 tokenId, uint256 amount);

    event NotifyReward(
        address indexed from,
        address indexed reward,
        uint256 amount,
        uint256 period
    );

    event ClaimRebase(uint256 period, uint256 tokenId, uint256 amount);

    error VoteNotFinalized();

    constructor(
        address _voter,
        address _votingEscrow,
        address _emissionsToken
    ) {
        voter = _voter;
        votingEscrow = _votingEscrow;
        emissionsToken = _emissionsToken;
        firstPeriod = getPeriod();
        IERC20(emissionsToken).approve(votingEscrow, type(uint256).max);
    }

    /// @inheritdoc IRebaseDistributor
    function balanceOf(uint256 tokenId) external view returns (uint256) {
        uint256 nextPeriod = getPeriod() + 1;

        return userVotingPower[nextPeriod][tokenId];
    }

    /// @notice called by the voter
    function _deposit(uint256 amount, uint256 tokenId) external {
        require(msg.sender == voter);

        uint256 nextPeriod = getPeriod() + 1;

        userVotingPower[nextPeriod][tokenId] += amount;
        votingPower[nextPeriod] += amount;

        if (lastClaim[tokenId] == 0) {
            lastClaim[tokenId] = getPeriod() - 1;
        }

        emit Deposit(tokenId, amount);
    }

    /// @notice called by the voter
    function _withdraw(uint256 amount, uint256 tokenId) external {
        require(msg.sender == voter);

        uint256 nextPeriod = getPeriod() + 1;

        userVotingPower[nextPeriod][tokenId] -= amount;
        votingPower[nextPeriod] -= amount;

        emit Withdraw(tokenId, amount);
    }

    /// @inheritdoc IRebaseDistributor
    function getPeriod() public view returns (uint256) {
        return (block.timestamp / 1 weeks);
    }

    /// @inheritdoc IRebaseDistributor
    function claimRebase(uint256 tokenId) external {
        uint256 nextPeriod = getPeriod() + 1;
        uint256 _lastClaim = Math.max(lastClaim[tokenId], firstPeriod);
        for (uint256 period = _lastClaim; period < nextPeriod; period += 1) {
            if (votingPower[period] != 0) {
                uint256 _reward = (rewardSupply[period] *
                    userVotingPower[period][tokenId] *
                    1e18) /
                    votingPower[period] /
                    1e18;

                _reward -= userClaimed[period][tokenId];
                userClaimed[period][tokenId] += _reward;

                if (_reward > 0) {
                    IVotingEscrow(votingEscrow).increaseAmount(
                        _reward,
                        tokenId
                    );
                    emit ClaimRebase(period, tokenId, _reward);
                }
            }
        }
        lastClaim[tokenId] = nextPeriod - 1;
    }

    /// @inheritdoc IRebaseDistributor
    function claimPeriodRebase(uint256 tokenId, uint256 period) external {
        require(period <= getPeriod(), VoteNotFinalized());
        if (votingPower[period] != 0) {
            uint256 _reward = ((rewardSupply[period] *
                userVotingPower[period][tokenId]) * 1e18) /
                votingPower[period] /
                1e18;

            _reward -= userClaimed[period][tokenId];
            userClaimed[period][tokenId] += _reward;

            if (_reward > 0) {
                IVotingEscrow(votingEscrow).increaseAmount(_reward, tokenId);
                emit ClaimRebase(period, tokenId, _reward);
            }
        }
        lastClaim[tokenId] = period - 1;
    }

    /// @inheritdoc IRebaseDistributor
    function earned(uint256 tokenId) external view returns (uint256 reward) {
        uint256 nextPeriod = getPeriod() + 1;
        uint256 _lastClaim = Math.max(lastClaim[tokenId], firstPeriod);
        for (uint256 period = _lastClaim; period < nextPeriod; period += 1) {
            if (votingPower[period] != 0) {
                reward +=
                    (rewardSupply[period] *
                        userVotingPower[period][tokenId] *
                        1e18) /
                    votingPower[period] /
                    1e18;
                reward -= userClaimed[period][tokenId];
            }
        }
    }

    /// @inheritdoc IRebaseDistributor
    function notifyRewardAmount(uint256 amount) external {
        uint256 period = getPeriod();

        if (votingPower[period] == 0) period += 1;

        IERC20(emissionsToken).transferFrom(msg.sender, address(this), amount);
        rewardSupply[period] += amount;
        emit NotifyReward(msg.sender, emissionsToken, amount, period);
    }
}
