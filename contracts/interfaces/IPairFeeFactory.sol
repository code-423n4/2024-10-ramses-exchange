// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPairFeeFactory {
    /// @notice the pair fees for a specific pair
    /// @param pair the pair to check
    /// @return pairFees the pairfees contract address for the pair
    function pairFeesForPair(
        address pair
    ) external view returns (address pairFees);

    /// @notice the last pairFees address created
    /// @return _pairFees the address of the last pair fees contract
    function lastPairFees() external view returns (address _pairFees);
    /// @notice create the pair fees for a pair
    /// @param pair the address of the pair
    /// @return _pairFees the address of the newly created pairFees
    function createPairFees(address pair) external returns (address _pairFees);

    /// @notice the fee % going to the treasury
    /// @return _feeToTreasury the fee %
    function feeToTreasury() external view returns (uint256 _feeToTreasury);

    /// @notice get the treasury address
    /// @return _treasury address of the treasury
    function treasury() external view returns (address _treasury);

    /// @notice set the fee % to be sent to the treasury
    /// @param _feeToTreasury the fee % to be sent to the treasury
    function setFeeToTreasury(uint256 _feeToTreasury) external;

    /// @notice set a new treasury address
    /// @param _treasury the new address
    function setTreasury(address _treasury) external;
}
