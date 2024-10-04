// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import "./interfaces/IERC20Extended.sol";

import {IVoter} from "./interfaces/IVoter.sol";

contract VotingEscrow is ERC721, ERC721Enumerable {
    error InUse();

    error DelegateToSelf();

    error SameToken();

    error ZeroSplit();

    address public immutable emissionsToken;

    address public immutable voter;

    uint256 private _nextTokenId;
    /// @notice total amount of burned tokens
    uint256 public totalBurned;

    /// @notice votingPower is the total amount of emissionsToken locked per tokenId
    mapping(uint256 tokenId => uint256 amount) public votingPower;

    /// @notice current delegate if any for the tokenId
    mapping(uint256 tokenId => address delegate) public idToDelegate;

    /// @notice if the owner delegated all tokenIds
    mapping(address owner => mapping(address delegate => bool)) delegateForAll;

    event Deposit(
        address indexed depositor,
        address indexed receiver,
        uint256 tokenId,
        uint256 amount
    );

    event Merge(uint256 from, uint256 to);

    event Split(uint256 from, uint256 to, uint256 amount);

    event Delegate(
        address indexed owner,
        address indexed delegate,
        uint256 indexed tokenId
    );

    event DelegateForAll(
        address indexed owner,
        address indexed delegate,
        bool approved
    );

    constructor(
        string memory name,
        string memory symbol,
        address _emissionsToken,
        address _voter
    ) ERC721(name, symbol) {
        emissionsToken = _emissionsToken;
        voter = _voter;
    }

    /// @notice Deposit `amount` of emissionsToken and mints an NFT for `to`
    /// @notice `emissionsToken` is burned from msg.sender upon NFT creation
    /// @param amount the amount of emissionsToken to burn
    /// @param to address that will receive the veNFT
    /// @return tokenId id of the new veNFT
    function createLock(
        uint256 amount,
        address to
    ) external returns (uint256 tokenId) {
        tokenId = _nextTokenId++;
        IERC20Extended(emissionsToken).burnFrom(msg.sender, amount);
        votingPower[tokenId] = amount;
        _safeMint(to, tokenId);
        totalBurned += amount;

        emit Deposit(msg.sender, to, tokenId, amount);
    }

    /// @notice Increase locked amount of tokenId
    /// @dev Fully permissionless, can increase any tokenId's locked amount
    /// @dev existence of token is checked on ownerOf call in Deposit event
    /// @param amount the amount of emissionsToken to add
    /// @param tokenId id of the veNFT to increase
    function increaseAmount(uint256 amount, uint256 tokenId) external {
        _requireOwned(tokenId);

        IERC20Extended(emissionsToken).burnFrom(msg.sender, amount);
        votingPower[tokenId] += amount;
        totalBurned += amount;

        emit Deposit(msg.sender, ownerOf(tokenId), tokenId, amount);
    }

    /// @notice combine the voting power of two veNFTs
    /// @param from the tokenId that will be merged into the other
    /// @param to the tokenId which will increase in value
    function merge(uint256 from, uint256 to) external {
        _requireOwned(to);
        require(from != to, SameToken());

        /// @dev nextPeriod naming for the NEXT period
        uint256 nextPeriod = (block.timestamp / 1 weeks) + 1;
        require(
            IVoter(voter).tokenIdVotingPowerPerPeriod(from, nextPeriod) == 0,
            InUse()
        );

        address owner = ownerOf(from);
        _checkAuthorized(owner, msg.sender, from);
        uint256 votingPowerFrom = votingPower[from];
        votingPower[from] = 0;
        _burn(from);
        votingPower[to] += votingPowerFrom;

        emit Merge(from, to);
    }

    /// @notice split off a veNFT to desired power amounts
    /// @param from the veNFT Id to split from
    /// @param amount the amount of tokens to split off
    /// @return newTokenId the new veNFT Id created from splitting
    function split(
        uint256 from,
        uint256 amount
    ) external returns (uint256 newTokenId) {
        require(amount > 0, ZeroSplit());

        /// @dev nextPeriod naming for the NEXT period
        uint256 nextPeriod = (block.timestamp / 1 weeks) + 1;
        require(
            IVoter(voter).tokenIdVotingPowerPerPeriod(from, nextPeriod) == 0,
            InUse()
        );

        address owner = ownerOf(from);
        _checkAuthorized(owner, msg.sender, from);
        newTokenId = _nextTokenId++;

        votingPower[from] -= amount;
        votingPower[newTokenId] = amount;
        _safeMint(msg.sender, newTokenId);
        emit Split(from, newTokenId, amount);
    }

    /// @notice delegate voting power to an operator for a tokenId
    /// @param operator the address to delegate to
    /// @param tokenId the veNFT Id
    function delegate(address operator, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        _checkAuthorized(owner, msg.sender, tokenId);

        idToDelegate[tokenId] = operator;

        emit Delegate(owner, operator, tokenId);
    }

    /// @notice sets delegated for all veNFTs to the operator
    /// @param operator the address operator
    /// @param approved whether to approve or not
    function setDelegateForAll(address operator, bool approved) external {
        require(operator != msg.sender, DelegateToSelf());
        delegateForAll[msg.sender][operator] = approved;
        emit DelegateForAll(msg.sender, operator, approved);
    }

    /// @notice reset delegate for _tokenId
    /// @dev only for idToDelegate, to reset delegateFor all call setDelegateForAll(false)
    function resetDelegate(uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        _checkAuthorized(owner, msg.sender, tokenId);
        delete idToDelegate[tokenId];
    }

    /// @notice calculate if a delegate is valid for a tokenId
    /// @param operator operator to check for validity
    /// @param tokenId the veNFT Id
    /// @return _tf whether true or false
    function isDelegate(
        address operator,
        uint256 tokenId
    ) public view returns (bool _tf) {
        address owner = ownerOf(tokenId);
        bool operatorIsDelegated = operator == idToDelegate[tokenId];
        bool operatorIsDelegatedForAll = (delegateForAll[owner])[operator];

        return operatorIsDelegated || operatorIsDelegatedForAll;
    }

    /// @notice checks if the spender is authorized
    /// @param spender the spender address to check
    /// @param tokenId the veNFT Id to check
    function checkAuthorized(address spender, uint256 tokenId) external view {
        address owner = ownerOf(tokenId);
        _checkAuthorized(owner, spender, tokenId);
    }

    /// @notice checks whether the operator is authorized or delegated to for the veNFT Id
    /// @param operator the address of the operator to check
    /// @param tokenId the veNFT Id
    function checkAuthorizedOrDelegated(
        address operator,
        uint256 tokenId
    ) external view {
        address owner = ownerOf(tokenId);
        if (isDelegate(operator, tokenId)) {
            return;
        }
        _checkAuthorized(owner, operator, tokenId);
    }

    /// @dev removes the delegate mappring
    function _resetDelegate(uint256 tokenId) internal {
        delete idToDelegate[tokenId];
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        _resetDelegate(tokenId);
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
