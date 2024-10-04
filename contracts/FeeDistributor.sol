// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
import {IVoter} from "./interfaces/IVoter.sol";
import {IVotingEscrow} from "./interfaces/IVotingEscrow.sol";

contract FeeDistributor is IFeeDistributor, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    address public immutable voter;
    address public immutable votingEscrow;
    address public immutable pairFees;

    uint256 public immutable firstPeriod;

    /// @notice token id => amount
    mapping(uint256 tokenId => uint256 amount) public balanceOf;

    /// @notice total amount of votes per epoch
    mapping(uint256 period => uint256 weight) public votes;

    /// @notice period => token id => amount
    mapping(uint256 period => mapping(uint256 tokenId => uint256 weight))
        public userVotes;

    /// @notice period => token => total supply
    mapping(uint256 period => mapping(address token => uint256 amount))
        public rewardSupply;

    /// @notice period => token id => token => amount
    mapping(uint256 period => mapping(uint256 tokenId => mapping(address token => uint256 amount)))
        public userClaimed;

    /// @notice token => token id => period
    mapping(address token => mapping(uint256 tokenId => uint256 period))
        public lastClaimByToken;

    EnumerableSet.AddressSet rewards;

    constructor(address _voter, address _pairFees) {
        voter = _voter;
        votingEscrow = IVoter(_voter).votingEscrow();

        firstPeriod = getPeriod();
        pairFees = _pairFees;
    }
    /// @inheritdoc IFeeDistributor
    function _deposit(uint256 amount, uint256 tokenId) external {
        require(msg.sender == voter, Unauthorized());

        uint256 nextPeriod = getPeriod() + 1;

        balanceOf[tokenId] += amount;
        votes[nextPeriod] += amount;
        userVotes[nextPeriod][tokenId] += amount;

        emit Deposit(tokenId, amount);
    }
    /// @inheritdoc IFeeDistributor
    function _withdraw(uint256 amount, uint256 tokenId) external {
        require(msg.sender == voter, Unauthorized());

        uint256 nextPeriod = getPeriod() + 1;

        balanceOf[tokenId] -= amount;
        if (userVotes[nextPeriod][tokenId] > 0) {
            userVotes[nextPeriod][tokenId] -= amount;
            votes[nextPeriod] -= amount;
        }

        emit Withdraw(tokenId, amount);
    }
    /// @inheritdoc IFeeDistributor
    function getPeriodReward(
        uint256 period,
        uint256 tokenId,
        address token
    ) external nonReentrant {
        IVotingEscrow(votingEscrow).checkAuthorized(msg.sender, tokenId);
        _getReward(period, tokenId, token, msg.sender);
        lastClaimByToken[token][tokenId] = period - 1;
    }
    /// @inheritdoc IFeeDistributor
    function getReward(
        uint256 tokenId,
        address[] memory tokens
    ) external nonReentrant {
        IVotingEscrow(votingEscrow).checkAuthorized(msg.sender, tokenId);
        _getAllRewards(tokenId, tokens, msg.sender);
    }
    /// @inheritdoc IFeeDistributor
    /// @dev used by Voter to allow batched reward claims
    function getRewardForOwner(
        uint256 tokenId,
        address[] memory tokens
    ) external nonReentrant {
        require(msg.sender == voter, Unauthorized());
        address owner = IVotingEscrow(votingEscrow).ownerOf(tokenId);
        _getAllRewards(tokenId, tokens, owner);
    }
    /// @inheritdoc IFeeDistributor
    function notifyRewardAmount(
        address token,
        uint256 amount
    ) external nonReentrant {
        require(msg.sender == pairFees, Unauthorized());
        uint256 period = getPeriod();

        /// @notice there are no votes for the first period; distribute first period fees as vote incentives to second period voters
        if (votes[period] == 0) {
            period += 1;
        }

        rewards.add(token);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        amount = balanceAfter - balanceBefore;
        rewardSupply[period][token] += amount;
        emit NotifyReward(msg.sender, token, amount, period);
    }
    /// @inheritdoc IFeeDistributor
    /// @dev record incentives amount for next period
    function incentivize(address token, uint256 amount) external nonReentrant {
        uint256 nextPeriod = getPeriod() + 1;
        rewards.add(token);

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        amount = balanceAfter - balanceBefore;
        rewardSupply[nextPeriod][token] += amount;
        emit VotesIncentivized(msg.sender, token, amount, nextPeriod);
    }

    /// @inheritdoc IFeeDistributor
    function getRewardTokens()
        external
        view
        returns (address[] memory _rewards)
    {
        _rewards = rewards.values();
    }

    /// @inheritdoc IFeeDistributor
    function earned(
        address token,
        uint256 tokenId
    ) external view returns (uint256 reward) {
        uint256 currentPeriod = getPeriod();
        uint256 lastClaim = Math.max(
            lastClaimByToken[token][tokenId],
            firstPeriod
        );
        for (uint256 period = lastClaim; period <= currentPeriod; period += 1) {
            if (votes[period] != 0) {
                reward +=
                    ((rewardSupply[period][token] *
                        userVotes[period][tokenId]) * 1e18) /
                    votes[period] /
                    1e18;

                reward -= userClaimed[period][tokenId][token];
            }
        }
    }

    function getPeriod() public view returns (uint256) {
        return (block.timestamp / 1 weeks);
    }

    function _getReward(
        uint256 period,
        uint256 tokenId,
        address token,
        address receiver
    ) internal {
        if (votes[period] != 0) {
            uint256 _reward = ((rewardSupply[period][token] *
                userVotes[period][tokenId]) * 1e18) /
                votes[period] /
                1e18;

            _reward -= userClaimed[period][tokenId][token];
            userClaimed[period][tokenId][token] += _reward;

            if (_reward > 0) {
                _safeTransfer(token, receiver, _reward);
                emit ClaimRewards(period, tokenId, receiver, token, _reward);
            }
        }
    }

    function _getAllRewards(
        uint256 tokenId,
        address[] memory tokens,
        address receiver
    ) internal {
        uint256 currentPeriod = getPeriod();
        uint256 lastClaim;
        for (uint256 i = 0; i < tokens.length; ++i) {
            lastClaim = Math.max(
                lastClaimByToken[tokens[i]][tokenId],
                firstPeriod
            );
            for (
                uint256 period = lastClaim;
                period <= currentPeriod;
                period += 1
            ) {
                _getReward(period, tokenId, tokens[i], receiver);
            }
            lastClaimByToken[tokens[i]][tokenId] = currentPeriod - 1;
        }
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(
                IERC20.transferFrom.selector,
                from,
                to,
                value
            )
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }
}
