// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";

contract ContractDeployer is AccessControlEnumerable {
    bytes32 public constant DEPLOYER_ROLE = keccak256("DEPLOYER_ROLE");
    address public lastContract;
    address[] public deployedContracts;

    constructor(address admin, address deployer) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(DEPLOYER_ROLE, deployer);
    }

    function deploy(
        bytes memory bytecode,
        uint256 _salt
    ) public onlyRole(DEPLOYER_ROLE) returns (address contractAddress) {
        assembly {
            contractAddress := create2(
                0,
                add(bytecode, 32),
                mload(bytecode),
                _salt
            )
        }
        require(contractAddress != address(0), "create2 failed");

        deployedContracts.push(contractAddress);
        lastContract = contractAddress;
    }

    function deployMany(
        bytes memory bytecode,
        uint256[] memory salts
    )
        external
        onlyRole(DEPLOYER_ROLE)
        returns (address[] memory contractAddresses)
    {
        contractAddresses = new address[](salts.length);
        for (uint256 i; i < contractAddresses.length; ++i) {
            contractAddresses[i] = deploy(bytecode, salts[i]);
        }
    }

    function deployedContractsLength() external view returns (uint256) {
        return deployedContracts.length;
    }

    function getDeployedContracts() external view returns (address[] memory) {
        return deployedContracts;
    }
}
