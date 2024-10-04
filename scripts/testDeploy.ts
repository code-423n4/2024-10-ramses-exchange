import { ethers } from "hardhat";

async function main() {
    const Oracle = await ethers.getContractFactory("Oracle");
    const oracle = await Oracle.deploy();
    const Position = await ethers.getContractFactory("Position", {
        libraries: { Oracle: await oracle.getAddress() },
    });
    const ProtocolActions = await ethers.getContractFactory("ProtocolActions");

    const position = await Position.deploy();
    const protocolActions = await ProtocolActions.deploy();

    const Deployer = await ethers.getContractFactory(
        "MockTimeUniswapV3PoolDeployer",
        {
            libraries: {
                Oracle: await oracle.getAddress(),
                Position: await position.getAddress(),
                ProtocolActions: await protocolActions.getAddress(),
            },
        },
    );
    const deployer = await Deployer.deploy();

    const tokenFactory = await ethers.getContractFactory(
        "contracts/CL/test/TestERC20.sol:TestERC20",
    );
    const tokenA = await tokenFactory.deploy(2n ** 255n);
    const tokenB = await tokenFactory.deploy(2n ** 255n);

    await deployer.deploy(tokenA.getAddress(), tokenB.getAddress(), 10);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
