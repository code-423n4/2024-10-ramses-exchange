// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IVoter} from "./interfaces/IVoter.sol";
import {IGauge} from "./interfaces/IGauge.sol";

/// @notice Gauges are used to incentivize pools, they emit reward tokens over 7 days for staked LP tokens
contract Gauge is IGauge, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice the LP token that needs to be staked for rewards
    address public immutable stake;
    /// @notice the address of the voter contract
    address public immutable voter;
    /// @dev rewards in the array
    address[] internal rewards;

    uint256 public totalSupply;
    /// @dev rewards are released over 7 days
    uint256 internal constant DURATION = 7 days;
    uint256 internal constant PRECISION = 10 ** 18;

    mapping(address user => uint256) public balanceOf;
    mapping(address token => Reward) internal _rewardData;
    mapping(address user => mapping(address token => uint256 rewardPerToken))
        public userRewardPerTokenStored;
    mapping(address user => mapping(address token => uint256 reward))
        public storedRewardsPerUser;
    mapping(address token => bool _isReward) public isReward;

    EnumerableSet.AddressSet tokenWhitelists;

    constructor(address _stake, address _voter) {
        stake = _stake;
        voter = _voter;

        tokenWhitelists.add(IVoter(_voter).emissionsToken());
    }

    /// @dev compiled with via-ir, caching is less efficient
    modifier updateReward(address account) {
        for (uint256 i; i < rewards.length; i++) {
            _rewardData[rewards[i]].rewardPerTokenStored = rewardPerToken(
                rewards[i]
            );
            _rewardData[rewards[i]].lastUpdateTime = lastTimeRewardApplicable(
                rewards[i]
            );
            if (account != address(0)) {
                storedRewardsPerUser[account][rewards[i]] = earned(
                    rewards[i],
                    account
                );
                userRewardPerTokenStored[account][rewards[i]] = _rewardData[
                    rewards[i]
                ].rewardPerTokenStored;
            }
        }
        _;
    }

    /// @inheritdoc IGauge
    function rewardsList() external view returns (address[] memory _rewards) {
        _rewards = rewards;
    }

    /// @inheritdoc IGauge
    function rewardsListLength() external view returns (uint256 _length) {
        _length = rewards.length;
    }

    /// @inheritdoc IGauge
    function lastTimeRewardApplicable(
        address token
    ) public view returns (uint256) {
        return Math.min(block.timestamp, _rewardData[token].periodFinish);
    }

    /// @inheritdoc IGauge
    function rewardData(
        address token
    ) external view override returns (Reward memory data) {
        data = _rewardData[token];
    }

    /// @inheritdoc IGauge
    function earned(
        address token,
        address account
    ) public view returns (uint256 _reward) {
        _reward =
            ((balanceOf[account] *
                (rewardPerToken(token) -
                    userRewardPerTokenStored[account][token])) / PRECISION) +
            storedRewardsPerUser[account][token];
    }

    /// @inheritdoc IGauge
    function getReward(
        address account,
        address[] calldata tokens
    ) public updateReward(account) nonReentrant {
        require(msg.sender == account || msg.sender == voter, Unauthorized());

        for (uint256 i; i < tokens.length; i++) {
            uint256 _reward = storedRewardsPerUser[account][tokens[i]];
            if (_reward > 0) {
                storedRewardsPerUser[account][tokens[i]] = 0;
                _safeTransfer(tokens[i], account, _reward);
                emit ClaimRewards(account, tokens[i], _reward);
            }
        }
    }

    /// @inheritdoc IGauge
    function rewardPerToken(address token) public view returns (uint256) {
        if (totalSupply == 0) {
            return _rewardData[token].rewardPerTokenStored;
        }
        return
            _rewardData[token].rewardPerTokenStored +
            ((lastTimeRewardApplicable(token) -
                _rewardData[token].lastUpdateTime) *
                _rewardData[token].rewardRate) /
            totalSupply;
    }

    /// @inheritdoc IGauge
    function depositAll() external {
        deposit(IERC20(stake).balanceOf(msg.sender));
    }

    /// @inheritdoc IGauge
    function depositFor(
        address recipient,
        uint256 amount
    ) public updateReward(recipient) nonReentrant {
        require(amount != 0, ZeroAmount());
        _safeTransferFrom(stake, msg.sender, address(this), amount);
        totalSupply += amount;
        balanceOf[recipient] += amount;

        emit Deposit(recipient, amount);
    }

    /// @inheritdoc IGauge
    function deposit(uint256 amount) public {
        depositFor(msg.sender, amount);
    }

    /// @inheritdoc IGauge
    function withdrawAll() external {
        withdraw(balanceOf[msg.sender]);
    }

    /// @inheritdoc IGauge
    function withdraw(
        uint256 amount
    ) public updateReward(msg.sender) nonReentrant {
        require(amount != 0, ZeroAmount());
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        _safeTransfer(stake, msg.sender, amount);

        emit Withdraw(msg.sender, amount);
    }

    /// @inheritdoc IGauge
    function left(address token) public view returns (uint256) {
        if (block.timestamp >= _rewardData[token].periodFinish) return 0;
        uint256 _remaining = _rewardData[token].periodFinish - block.timestamp;
        return (_remaining * _rewardData[token].rewardRate) / PRECISION;
    }

    /// @inheritdoc IGauge
    function whitelistReward(address _reward) external {
        require(msg.sender == voter, Unauthorized());
        tokenWhitelists.add(_reward);
        emit RewardWhitelisted(_reward, true);
    }

    /// @inheritdoc IGauge
    function removeRewardWhitelist(address _reward) external {
        require(msg.sender == voter, Unauthorized());
        tokenWhitelists.remove(_reward);
        emit RewardWhitelisted(_reward, false);
    }

    /// @inheritdoc IGauge
    /**
     * @notice amount must be greater than left() for the token, this is to prevent greifing attacks
     * @notice notifying rewards is completely permissionless
     * @notice if nobody registers for a newly added reward for the period it will remain in the contract indefinitely
     */
    function notifyRewardAmount(
        address token,
        uint256 amount
    ) external updateReward(address(0)) nonReentrant {
        require(token != stake, NotifyStakingToken());
        require(amount != 0, ZeroAmount());
        require(tokenWhitelists.contains(token), NotWhitelisted());

        _rewardData[token].rewardPerTokenStored = rewardPerToken(token);

        if (!isReward[token]) {
            rewards.push(token);
            isReward[token] = true;
        }

        /// @dev check actual amount transferred for compatibility with fee on transfer tokens.
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        _safeTransferFrom(token, msg.sender, address(this), amount);
        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        amount = balanceAfter - balanceBefore;

        if (block.timestamp >= _rewardData[token].periodFinish) {
            _rewardData[token].rewardRate = (amount * PRECISION) / DURATION;
        } else {
            uint256 remaining = _rewardData[token].periodFinish -
                block.timestamp;
            uint256 _left = remaining * _rewardData[token].rewardRate;
            require(amount * PRECISION > _left);
            _rewardData[token].rewardRate =
                (amount * PRECISION + _left) /
                DURATION;
        }

        _rewardData[token].lastUpdateTime = block.timestamp;
        _rewardData[token].periodFinish = block.timestamp + DURATION;

        uint256 balance = IERC20(token).balanceOf(address(this));

        require(
            _rewardData[token].rewardRate <= (balance * PRECISION) / DURATION,
            RewardTooHigh()
        );

        emit NotifyReward(msg.sender, token, amount);
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
