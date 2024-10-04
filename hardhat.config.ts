import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";

import { resolve } from "path";
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: resolve(__dirname, "./.env") });

import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-solhint";
//import "@nomicfoundation/hardhat-ignition-ethers";
//import "@nomicfoundation/hardhat-foundry";

const POOL_COMPILER_SETTINGS = {
    version: "0.8.26",
    settings: {
        viaIR: true,
        optimizer: {
            enabled: true,
            runs: 800,
        },
        evmVersion: "cancun",
        metadata: {
            bytecodeHash: "none",
        },
    },
};

const accounts = process.env.PRIVATE_KEY
    ? [process.env.PRIVATE_KEY]
    : undefined;

const voterCompilerSettings = {
    version: "0.8.26",
    settings: {
        optimizer: {
            enabled: true,
            runs: 1,
        },
        evmVersion: "cancun",
        viaIR: false,
        metadata: {
            bytecodeHash: "none",
        },
    },
};

const poolDeployerCompilerSettings = {
    version: "0.8.26",
    settings: {
        optimizer: {
            enabled: true,
            runs: 200,
        },
        evmVersion: "cancun",
        viaIR: true,
        metadata: {
            bytecodeHash: "none",
        },
    },
};

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.4.18",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 930,
                    },
                    evmVersion: "cancun",
                    metadata: {
                        bytecodeHash: "none",
                    },
                },
            },
            {
                version: "0.8.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800,
                    },
                    viaIR: true,
                    metadata: {
                        // do not include the metadata hash, since this is machine dependent
                        // and we want all generated code to be deterministic
                        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
                        bytecodeHash: "none",
                    },
                },
            },
            {
                version: "0.8.26",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 930,
                    },
                    evmVersion: "cancun",
                    viaIR: true,
                    metadata: {
                        bytecodeHash: "none",
                    },
                },
            },
        ],
        overrides: {
            "contracts/Voter.sol": voterCompilerSettings,
            "contracts/libraries/RewardClaimers.sol": voterCompilerSettings,
            "contracts/CL/core/RamsesV3PoolDeployer.sol":
                poolDeployerCompilerSettings,
        },
    },

    networks: {
        hardhat: {
            chainId: 1,
            initialBaseFeePerGas: 0,
            mining: { interval: 0, auto: true },
            allowBlocksWithSameTimestamp: true,
            gas: 8_000_000,
            gasPrice: 1_000_000_000,
            allowUnlimitedContractSize: true,
        },
        localhost: {
            accounts: accounts,
        },
        fantom: {
            url: process.env.RPC ?? "https://rpc3.fantom.network",
            accounts: accounts,
        },
    },

    etherscan: {
        apiKey: {
            fantom: process.env.API_KEY!,
        },
    },

    gasReporter: {
        enabled: process.env.REPORT_GAS?.toLowerCase() == "true" ?? false,
    },

    paths: {
        tests: "test/v3",
    },
};

export default config;
