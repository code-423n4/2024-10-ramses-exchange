// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

interface IFeeDistributor {
    error Unauthorized();

    event Deposit(uint256 tokenId, uint256 amount);

    event Withdraw(uint256 tokenId, uint256 amount);

    event NotifyReward(
        address indexed from,
        address indexed reward,
        uint256 amount,
        uint256 period
    );

    event VotesIncentivized(
        address indexed from,
        address indexed reward,
        uint256 amount,
        uint256 period
    );

    event ClaimRewards(
        uint256 period,
        uint256 tokenId,
        address receiver,
        address reward,
        uint256 amount
    );

    function _deposit(uint256 amount, uint256 tokenId) external;

    function _withdraw(uint256 amount, uint256 tokenId) external;

    /// @notice function to claim rewards on behalf of another
    /// @param tokenId veNFT ID
    /// @param tokens an array of the tokens
    function getRewardForOwner(
        uint256 tokenId,
        address[] memory tokens
    ) external;

    /// @notice function for sending fees directly to be claimable (in system where fees are distro'd through the week)
    /// @dev for lumpsum - this would operate similarly to incentivize
    /// @param token the address of the token to send for notifying
    /// @param amount the amount of token to send
    function notifyRewardAmount(address token, uint256 amount) external;

    /// @notice gives an array of reward tokens for the feedist
    /// @return _rewards array of rewards
    function getRewardTokens()
        external
        view
        returns (address[] memory _rewards);

    /// @notice shows the earned incentives in the feedist
    /// @param token the token address to check
    /// @param tokenId the veNFT ID
    /// @return reward the amount earned/claimable
    function earned(
        address token,
        uint256 tokenId
    ) external view returns (uint256 reward);

    /// @notice function to submit incentives to voters for the upcoming flip
    /// @param token the address of the token to send for incentivization
    /// @param amount the amount of token to send
    function incentivize(address token, uint256 amount) external;

    /// @notice get the rewards for a specific period
    function getPeriodReward(
        uint256 period,
        uint256 tokenId,
        address token
    ) external;
    /// @notice get the fees and incentives
    function getReward(uint256 tokenId, address[] memory tokens) external;
}
