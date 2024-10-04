// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;
interface IRebaseDistributor {
    /// @notice returns the balanceOf a tokenID
    /// @param tokenId id of the veNFT
    /// @return amount the number of ve tokens held
    function balanceOf(uint256 tokenId) external view returns (uint256 amount);

    /// @notice returns the period
    /// @return _period the period
    function getPeriod() external view returns (uint256 _period);

    /// @notice claim the rebase for a tokenID
    /// @param tokenId the veNFT ID
    function claimRebase(uint256 tokenId) external;

    /// @notice claim the rebase for a tokenID at a period
    /// @param tokenId the veNFT ID
    /// @param period the period
    function claimPeriodRebase(uint256 tokenId, uint256 period) external;

    /// @notice the earned amount of a tokenID
    /// @param tokenId the veNFT ID
    /// @return _reward the rewards amount earned in wei
    function earned(uint256 tokenId) external view returns (uint256 _reward);

    /// @notice called by the minter to distribute the rebase
    /// @param amount the amount of emissionsToken to send to the rebaser
    function notifyRewardAmount(uint256 amount) external;

    /// @notice called by the voter
    /// @param amount the amount to deposit
    /// @param tokenId the veNFT ID
    function _deposit(uint256 amount, uint256 tokenId) external;

    /// @notice called by the voter
    /// @param amount the amount to be withdrawn
    /// @param tokenId the veNFT ID
    function _withdraw(uint256 amount, uint256 tokenId) external;
}
