// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @title EmissionsToken contract
/// @dev standard ERC20 built for vote-governance emissions

contract EmissionsToken is ERC20, ERC20Burnable, ERC20Permit {
    error NotMinter();
    /// @notice minter contract address
    address public minter;

    constructor(
        address _minter
    ) ERC20("RAMSES V3", "RAM") ERC20Permit("RAMSES V3") {
        minter = _minter;
    }

    /// @notice mint function called by minter weekly
    /// @param to the address to mint to
    /// @param amount amount of tokens
    function mint(address to, uint256 amount) public {
        require(msg.sender == minter, NotMinter());
        _mint(to, amount);
    }
}
