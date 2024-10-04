import { CoreConfig, ImpToProxy, deploy } from "../../utils/deployment";
import { ethers, network, upgrades } from "hardhat";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { MULTISIG, TICK_SPACINGS } from "./constants";
import * as typechain from "../../typechain-types";

export async function testFixture() {
    // fixed starting timestamp
    await helpers.time.increaseTo(
        Math.floor(new Date("2030-01-01").valueOf() / 1000),
    );

    const [deployer] = await ethers.getSigners();
    // await helpers.impersonateAccount(MULTISIG);
    // await helpers.setBalance(MULTISIG, ethers.parseEther("100"));
    // const multisig = await ethers.getSigner(MULTISIG);

    const weth = await (await ethers.getContractFactory("WETH9")).deploy();

    const contractDeployer = await (
        await ethers.getContractFactory("ContractDeployer")
    ).deploy(deployer.address, deployer.address);
    await contractDeployer.waitForDeployment();

    // populate salts
    const salts: number[] = [];
    for (let i = 0; i < Object.keys(ImpToProxy).length / 2; i++) {
        salts.push(i);
    }

    const testConfig: CoreConfig = {
        DEPLOYER: deployer.address,
        MULTISIG: deployer.address,
        SALTS: salts,
        // PROXY_ADMIN?: string,
        CONTRACT_DEPLOYER: await contractDeployer.getAddress(),
        WETH: await weth.getAddress(),
        NATIVE_CURRENCY_LABEL_BYTES32:
            "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        VETOKEN_NAME: "Test VETOKEN",
        VETOKEN_SYMBOL: "testVETOKEN",
        WHITELIST_TOKENS: [],
        TOKEN_INITIAL_SUPPLY: ethers.parseEther("10000000"),
        INITIAL_WEEKLY_EMISSIONS: ethers.parseEther("1000"),
        INITIAL_EMISSIONS_MULTIPLIER: 9900n,
        INITIAL_REBASE_RATE: 4000n,
        INITIAL_FEE_SPLIT: 5000n,
        GO_LIVE: true,
    };

    // Deploy suite

    const suite = await deploy(testConfig);

    // Deploy test tokens

    const Token = await ethers.getContractFactory(
        "contracts/CL/periphery/test/TestERC20.sol:TestERC20",
    );
    const usdc = (await Token.deploy(
        ethers.parseEther("1000000"),
    )) as typechain.TestERC20;
    const usdt = (await Token.deploy(
        ethers.parseEther("1000000"),
    )) as typechain.TestERC20;
    const dai = (await Token.deploy(
        ethers.parseEther("1000000"),
    )) as typechain.TestERC20;
    const mim = (await Token.deploy(
        ethers.parseEther("1000000"),
    )) as typechain.TestERC20;

    // Deploy pairs and gauges

    const pairAddress = await suite.pairFactory.createPair.staticCall(
        await usdc.getAddress(),
        await usdt.getAddress(),
        true,
    );
    await suite.pairFactory.createPair(
        await usdc.getAddress(),
        await usdt.getAddress(),
        true,
    );
    const pair = await ethers.getContractAt("Pair", pairAddress);

    const gaugeAddress = await suite.voter.createGauge.staticCall(pairAddress);
    await suite.voter.createGauge(pairAddress);
    const gauge = await ethers.getContractAt("Gauge", gaugeAddress);

    const clPoolAddress = await suite.factory.createPool.staticCall(
        usdc.getAddress(),
        usdt.getAddress(),
        TICK_SPACINGS.STABLE,
        2n ** 96n,
    );
    await suite.factory.createPool(
        usdc.getAddress(),
        usdt.getAddress(),
        TICK_SPACINGS.STABLE,
        2n ** 96n,
    );
    const clPool = await ethers.getContractAt("RamsesV3Pool", clPoolAddress);

    const clGaugeAddress = await suite.voter.createCLGauge.staticCall(
        usdc.getAddress(),
        usdt.getAddress(),
        TICK_SPACINGS.STABLE,
    );
    await suite.voter.createCLGauge(
        usdc.getAddress(),
        usdt.getAddress(),
        TICK_SPACINGS.STABLE,
    );
    const clGauge = await ethers.getContractAt("GaugeV3", clGaugeAddress);

    // start emissions
    await suite.minter.connect(deployer).startEmissions();

    // make a veNFT
    await suite.emissionsToken.approve(
        suite.votingEscrow.getAddress(),
        ethers.MaxUint256,
    );
    const tokenId = await suite.votingEscrow.createLock.staticCall(
        ethers.parseEther("1000"),
        deployer.address,
    );

    await suite.votingEscrow.createLock(
        ethers.parseEther("1000"),
        deployer.address,
    );

    // approvals
    const tokens = [usdc, usdt, dai, mim];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        await token.approve(suite.nfpManager.getAddress(), ethers.MaxUint256);
        await token.approve(suite.swapRouter.getAddress(), ethers.MaxUint256);
        await token.approve(suite.router.getAddress(), ethers.MaxUint256);
    }

    // @TODO emit rewards to gauges, set up periods, vote to avoid div by zero

    return {
        ...suite,
        weth,
        usdc,
        usdt,
        dai,
        mim,
        pair,
        gauge,
        clPool,
        clGauge,
        tokenId,
    };
}

// testFixture()
//     .then(() => process.exit(0))
//     .catch((error) => {
//         console.error(error);
//         process.exit(1);
//     });
