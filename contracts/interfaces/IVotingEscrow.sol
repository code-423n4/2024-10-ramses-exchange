// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC721.sol";

interface IVotingEscrow is IERC721 {
    /// @notice check if the "spender" is authorized
    /// @param spender the address to check
    /// @param tokenId the tokenID to check against
    function checkAuthorized(address spender, uint256 tokenId) external view;

    /// @notice check if the "operator" is authorized to vote on behalf of an owner
    /// @param operator the address to check
    /// @param tokenId the tokenID to check against
    function checkAuthorizedOrDelegated(
        address operator,
        uint256 tokenId
    ) external view;

    /// @notice the voting power of a tokenID
    /// @dev since we removed the length - this should not decay weekly
    /// @param tokenId the tokenID to check
    /// @return amount the amount of voting power the veNFT has
    function votingPower(
        uint256 tokenId
    ) external view returns (uint256 amount);

    /// @notice increase the ve power of a tokenID by depositing emissionsTokens to be burned
    /// @param amount the amount of emissionsTokens to add
    /// @param tokenId the tokenID of the veNFT
    function increaseAmount(uint256 amount, uint256 tokenId) external;
}
