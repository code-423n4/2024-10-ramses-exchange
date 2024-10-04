import * as helper from "@nomicfoundation/hardhat-network-helpers";
import { ethers, network, upgrades } from "hardhat";
import { ContractFactory } from "ethers";
import * as typechain from "../typechain-types";

export type CoreConfig = {
    DEPLOYER: string;
    MULTISIG: string;
    SALTS: number[];
    PROXY_ADMIN?: string; // new ProxyAdmin will be deployed if not supplied
    CONTRACT_DEPLOYER?: string; // new ContractDeployer will be deployed if not supplied
    WETH: string;
    NATIVE_CURRENCY_LABEL_BYTES32: string;
    VETOKEN_NAME: string;
    VETOKEN_SYMBOL: string;
    IMMUTABLE_SALTS?: Record<keyof typeof ImmutableContracts, number>; // random addresses if not supplied
    IMMUTABLE_ADDRESSES?: Record<keyof typeof ImmutableContracts, string>; // only needed if IMMUTABLE_SALTS are supplied
    WHITELIST_TOKENS: string[];
    TOKEN_INITIAL_SUPPLY: bigint;
    INITIAL_WEEKLY_EMISSIONS: bigint;
    INITIAL_EMISSIONS_MULTIPLIER: bigint;
    INITIAL_REBASE_RATE: bigint;
    INITIAL_FEE_SPLIT: bigint;
    GO_LIVE: boolean;
};

export enum ImpToProxy {
    Voter,
    FeeCollector,
}

// the order of this enum is the deployment order
export enum ImmutableContracts {
    AccessManager,
    ClPoolFactory,
    Minter,
    EmissionsToken,
    VotingEscrow,
    RebaseDistributor,
    ClPoolDeployer,
    NonfungibleTokenPositionDescriptor,
    NonfungiblePositionManager,
    SwapRouter,
    Quoter,
    QuoterV2,
    TickLens,
    PairFeeFactory,
    GaugeFactory,
    FeeDistributorFactory,
    ClGaugeFactory,
    PairFactory,
    Router,
}

export enum ImpUnderFactory {
    FeeDistributor,
    Gauge,
    Pair,
    PairFees,
}

export async function deploy(config: CoreConfig) {
    const [
        ContractDeployer,
        PairFactory,
        Router,
        VotingEscrow,
        RebaseDistributor,
        Minter,
        ClPoolFactory,
        NFTDescriptor,
        SwapRouter,
        Quoter,
        QuoterV2,
        Oracle,
        Tick,
        TickLens,
        ClGaugeFactory,
        GaugeV3,
        FeeCollector,
        ProtocolActions,
        TransparentUpgradeableProxy,
        EmissionsToken,
        GaugeFactory,
        FeeDistributorFactory,
        Pair,
        Gauge,
        FeeDistributor,
        PairFees,
        PairFeeFactory,
        NonfungiblePositionManager,
        AccessManager,
        RewardClaimers,
    ] = await Promise.all([
        ethers.getContractFactory("ContractDeployer"),
        ethers.getContractFactory("PairFactory"),
        ethers.getContractFactory("Router"),
        ethers.getContractFactory("VotingEscrow"),
        ethers.getContractFactory("RebaseDistributor"),
        ethers.getContractFactory("Minter"),
        ethers.getContractFactory("RamsesV3Factory"),
        ethers.getContractFactory("NFTDescriptor"),
        ethers.getContractFactory("SwapRouter"),
        ethers.getContractFactory("Quoter"),
        ethers.getContractFactory("QuoterV2"),
        ethers.getContractFactory("Oracle"),
        ethers.getContractFactory("Tick"),
        ethers.getContractFactory("TickLens"),
        ethers.getContractFactory("ClGaugeFactory"),
        ethers.getContractFactory("GaugeV3"),
        ethers.getContractFactory("FeeCollector"),
        ethers.getContractFactory("ProtocolActions"),
        ethers.getContractFactory("RamsesTransparentUpgradeableProxy"),
        ethers.getContractFactory("EmissionsToken"),
        ethers.getContractFactory("GaugeFactory"),
        ethers.getContractFactory("FeeDistributorFactory"),
        ethers.getContractFactory("Pair"),
        ethers.getContractFactory("Gauge"),
        ethers.getContractFactory("FeeDistributor"),
        ethers.getContractFactory("PairFees"),
        ethers.getContractFactory("PairFeeFactory"),
        ethers.getContractFactory("NonfungiblePositionManager"),
        ethers.getContractFactory("AccessManager"),
        ethers.getContractFactory("RewardClaimers"),
    ]);

    const [deployer] = await ethers.getSigners();

    if (config.DEPLOYER && config.DEPLOYER != deployer.address) {
        throw "Wrong Deployer";
    }
    if (network.name == "local" || network.name == "hardhat") {
        await helper.setBalance(deployer.address, ethers.MaxUint256);
    }

    // check if there's enough salts
    if (config.SALTS.length < Object.keys(ImpToProxy).length / 2) {
        throw Error("Not enough SALTS");
    }

    let proxyAdmin: typechain.ProxyAdmin;

    if (config.PROXY_ADMIN) {
        proxyAdmin = await ethers.getContractAt(
            "ProxyAdmin",
            config.PROXY_ADMIN,
        );
    } else {
        const _proxyAdmin = await ethers.getContractFactory("ProxyAdmin");
        proxyAdmin = await _proxyAdmin.deploy(deployer.address);
        await proxyAdmin.waitForDeployment();
    }

    let contractDeployer: typechain.ContractDeployer;

    if (config.CONTRACT_DEPLOYER) {
        contractDeployer = await ethers.getContractAt(
            "ContractDeployer",
            config.CONTRACT_DEPLOYER,
        );
    } else {
        contractDeployer = await ContractDeployer.deploy(
            config.MULTISIG,
            deployer.address,
        );
        await contractDeployer.waitForDeployment();
    }

    console.log("Deploying proxies...");
    await (
        await contractDeployer.deployMany(
            (
                await TransparentUpgradeableProxy.getDeployTransaction(
                    proxyAdmin.getAddress(),
                )
            ).data,
            config.SALTS,
        )
    ).wait();

    const proxies = await contractDeployer.getDeployedContracts();

    console.log("Done");

    const proxyAddressesHandler = {
        get(_: any, contract: keyof typeof ImpToProxy) {
            return proxies[ImpToProxy[contract]];
        },
    };

    const proxyAddresses: Record<keyof typeof ImpToProxy, string> = new Proxy(
        {},
        proxyAddressesHandler,
    );

    const immutableAddresses: Partial<
        Record<keyof typeof ImmutableContracts, string>
    > = {};

    let immutableConstructors: Partial<
        Record<keyof typeof ImmutableContracts, (string | bigint | undefined)[]>
    > = {};

    Object.keys(config.IMMUTABLE_ADDRESSES ?? []).forEach((_contract) => {
        const contract = _contract as keyof typeof ImmutableContracts;
        immutableAddresses[contract] = config.IMMUTABLE_ADDRESSES?.[contract];
    });

    await updateConstructors();

    // doing it this way so test fixtures don't need to supply addresses
    async function updateConstructors() {
        immutableConstructors = {
            AccessManager: [deployer.address],
            ClPoolFactory: [immutableAddresses["AccessManager"]],
            EmissionsToken: [immutableAddresses["Minter"]],
            Minter: [immutableAddresses["AccessManager"]],
            VotingEscrow: [
                config.VETOKEN_NAME,
                config.VETOKEN_SYMBOL,
                immutableAddresses["EmissionsToken"],
                proxyAddresses["Voter"],
            ],
            RebaseDistributor: [
                proxyAddresses["Voter"],
                immutableAddresses["VotingEscrow"],
                immutableAddresses["EmissionsToken"],
            ],
            ClPoolDeployer: [immutableAddresses["ClPoolFactory"]],
            NonfungibleTokenPositionDescriptor: [
                config.WETH,
                config.NATIVE_CURRENCY_LABEL_BYTES32,
            ],
            NonfungiblePositionManager: [
                immutableAddresses["ClPoolDeployer"],
                config.WETH,
                immutableAddresses["NonfungibleTokenPositionDescriptor"],
                proxyAddresses["Voter"],
            ],
            SwapRouter: [immutableAddresses["ClPoolDeployer"], config.WETH],
            Quoter: [immutableAddresses["ClPoolDeployer"], config.WETH],
            QuoterV2: [immutableAddresses["ClPoolDeployer"], config.WETH],
            TickLens: [],
            PairFeeFactory: [
                config.MULTISIG,
                proxyAddresses["Voter"],
                immutableAddresses["AccessManager"],
            ],
            PairFactory: [
                proxyAddresses["Voter"],
                config.MULTISIG,
                immutableAddresses["AccessManager"],
                immutableAddresses["PairFeeFactory"],
            ],
            GaugeFactory: [],
            FeeDistributorFactory: [],
            Router: [immutableAddresses["PairFactory"], config.WETH],
            ClGaugeFactory: [
                immutableAddresses["NonfungiblePositionManager"],
                immutableAddresses["VotingEscrow"],
                proxyAddresses["Voter"],
                proxyAddresses["FeeCollector"],
            ],
        };
    }

    console.log("Deploying v3 libraries");
    // Deploy V3 libraries
    const libraryFactories = {
        NFTDescriptor,
        Oracle,
        Tick,
        ProtocolActions,
        RewardClaimers,
    };

    const libraries: Partial<Record<keyof typeof libraryFactories, any>> = {};

    for (const Factory of Object.keys(
        libraryFactories,
    ) as (keyof typeof libraryFactories)[]) {
        const implementation = await libraryFactories[Factory].deploy();
        await implementation.waitForDeployment();

        libraries[Factory] = implementation;
    }

    console.log("Done");

    const nftDescriptor = NFTDescriptor.attach(
        await libraries["NFTDescriptor"].getAddress(),
    ) as typechain.NFTDescriptor;

    const oracle = Oracle.attach(
        await libraries["Oracle"].getAddress(),
    ) as typechain.Oracle;

    const tick = Tick.attach(
        await libraries["Tick"].getAddress(),
    ) as typechain.Tick;

    const protocolActions = ProtocolActions.attach(
        await libraries["ProtocolActions"].getAddress(),
    ) as typechain.ProtocolActions;

    const rewardClaimers = RewardClaimers.attach(
        await libraries["RewardClaimers"].getAddress(),
    ) as typechain.RewardClaimers;

    // Need to declare here since it needs to link to an external library
    const NonfungibleTokenPositionDescriptor = await ethers.getContractFactory(
        "NonfungibleTokenPositionDescriptor",
        {
            libraries: {
                NFTDescriptor: await nftDescriptor.getAddress(),
            },
        },
    );

    const Position = await ethers.getContractFactory("Position", {
        libraries: {
            Oracle: await oracle.getAddress(),
        },
    });

    console.log("Deploying Position");
    const position = await Position.deploy();
    await position.waitForDeployment();

    console.log("Done");

    // declared here after libraries are deployed
    const ClPoolDeployer = await ethers.getContractFactory(
        "RamsesV3PoolDeployer",
        {
            libraries: {
                Oracle: await oracle.getAddress(),
                Position: await position.getAddress(),
                ProtocolActions: await protocolActions.getAddress(),
            },
        },
    );

    const Voter = await ethers.getContractFactory("Voter", {
        libraries: {
            RewardClaimers: await rewardClaimers.getAddress(),
        },
    });

    // @TODO factory types
    const factories: Record<
        keyof typeof ImmutableContracts | keyof typeof proxyAddresses,
        any
    > = {
        VotingEscrow: VotingEscrow,
        Minter: Minter,
        Voter: Voter,
        RebaseDistributor: RebaseDistributor,
        PairFactory: PairFactory,
        Router: Router,
        GaugeFactory: GaugeFactory,
        FeeDistributorFactory: FeeDistributorFactory,
        ClPoolFactory: ClPoolFactory,
        NonfungiblePositionManager: NonfungiblePositionManager,
        NonfungibleTokenPositionDescriptor: NonfungibleTokenPositionDescriptor,
        SwapRouter: SwapRouter,
        // PairFlash: PairFlash,
        Quoter: Quoter,
        QuoterV2: QuoterV2,
        // Lens: Lens,
        TickLens: TickLens,
        ClGaugeFactory: ClGaugeFactory,
        FeeCollector: FeeCollector,
        AccessManager: AccessManager,
        EmissionsToken: EmissionsToken,
        PairFeeFactory: PairFeeFactory,
        ClPoolDeployer: ClPoolDeployer,
    };

    console.log("Attaching factories to proxies");

    const voter = Voter.attach(proxies[ImpToProxy["Voter"]]) as typechain.Voter;

    const feeCollector = FeeCollector.attach(
        proxies[ImpToProxy["FeeCollector"]],
    ) as typechain.FeeCollector;

    // @TODO
    // const pairFlash = PairFlash.attach(
    //     proxies[impToProxy["PairFlash"]],
    // ) as typechain.PairFlash;

    // const lens = Lens.attach(proxies[impToProxy["Lens"]]) as typechain.Lens;

    console.log("Deploying immutable contracts");

    for (let i = 0; i < Object.keys(immutableConstructors).length; i++) {
        // cast type
        const contract = ImmutableContracts[
            i
        ] as keyof typeof immutableConstructors;
        console.log(contract);
        // console.log(immutableConstructors[contract]);

        const deployData = (
            await factories[contract].getDeployTransaction(
                // @ts-ignore @TODO
                ...immutableConstructors[contract],
            )
        ).data;

        // console.log(deployData);

        await (
            await contractDeployer.deploy(
                deployData,
                config.IMMUTABLE_SALTS?.[contract] ?? 100n + BigInt(i),
            )
        ).wait();

        immutableAddresses[contract] = await contractDeployer.lastContract();

        await updateConstructors();
    }

    console.log("Done");

    const emissionsToken = EmissionsToken.attach(
        immutableAddresses["EmissionsToken"]!,
    ) as typechain.EmissionsToken;
    const rebaseDistributor = RebaseDistributor.attach(
        immutableAddresses["RebaseDistributor"]!,
    ) as typechain.RebaseDistributor;
    const votingEscrow = VotingEscrow.attach(
        immutableAddresses["VotingEscrow"]!,
    ) as unknown as typechain.VotingEscrow;
    const clPoolFactory = ClPoolFactory.attach(
        immutableAddresses["ClPoolFactory"]!,
    ) as typechain.RamsesV3Factory;
    const clPoolDeployer = ClPoolDeployer.attach(
        immutableAddresses["ClPoolDeployer"]!,
    ) as typechain.RamsesV3PoolDeployer;
    const nfpManager = NonfungiblePositionManager.attach(
        immutableAddresses["NonfungiblePositionManager"]!,
    ) as typechain.NonfungiblePositionManager;
    const nfpTokenDescriptor = NonfungibleTokenPositionDescriptor.attach(
        immutableAddresses["NonfungibleTokenPositionDescriptor"]!,
    ) as typechain.NonfungibleTokenPositionDescriptor;
    const swapRouter = SwapRouter.attach(
        immutableAddresses["SwapRouter"]!,
    ) as typechain.SwapRouter;
    const quoter = Quoter.attach(
        immutableAddresses["Quoter"]!,
    ) as typechain.Quoter;
    const quoterV2 = QuoterV2.attach(
        immutableAddresses["QuoterV2"]!,
    ) as typechain.QuoterV2;
    const tickLens = TickLens.attach(
        immutableAddresses["TickLens"]!,
    ) as typechain.TickLens;
    const accessManager = AccessManager.attach(
        immutableAddresses["AccessManager"]!,
    ) as typechain.AccessManager;
    const pairFactory = PairFactory.attach(
        immutableAddresses["PairFactory"]!,
    ) as typechain.PairFactory;
    const router = Router.attach(
        immutableAddresses["Router"]!,
    ) as typechain.Router;
    const gaugeFactory = GaugeFactory.attach(
        immutableAddresses["GaugeFactory"]!,
    ) as typechain.GaugeFactory;
    const feeDistributorFactory = FeeDistributorFactory.attach(
        immutableAddresses["FeeDistributorFactory"]!,
    ) as typechain.FeeDistributorFactory;
    const pairFeeFactory = PairFeeFactory.attach(
        immutableAddresses["PairFeeFactory"]!,
    ) as typechain.PairFeeFactory;
    const clGaugeFactory = ClGaugeFactory.attach(
        immutableAddresses["ClGaugeFactory"]!,
    ) as typechain.ClGaugeFactory;
    const minter = Minter.attach(
        immutableAddresses["Minter"]!,
    ) as typechain.Minter;

    console.log("initialize some immutable contracts");

    await clPoolFactory.initialize(immutableAddresses["ClPoolDeployer"]!);

    console.log("Done");

    // the contracts are deployed in the order set in here
    const initializeCalldata: Record<keyof typeof ImpToProxy, string> = {
        Voter: (
            await voter.initialize.populateTransaction(
                {
                    _emissionsToken: emissionsToken.getAddress(),
                    _legacyFactory: pairFactory.getAddress(),
                    _gauges: gaugeFactory.getAddress(),
                    _feeDistributorFactory: feeDistributorFactory.getAddress(),
                    _minter: minter.getAddress(),
                    _msig: config.MULTISIG,
                    _clFactory: clPoolFactory.getAddress(),
                    _clGaugeFactory: clGaugeFactory.getAddress(),
                    _nfpManager: nfpManager.getAddress(),
                    _pairFeeFactory: pairFeeFactory.getAddress(),
                    _accessManager: accessManager.getAddress(),
                    _votingEscrow: votingEscrow.getAddress(),
                    _rebaseDistributor: rebaseDistributor.getAddress(),
                },
                config.WHITELIST_TOKENS,
            )
        ).data,

        // PairFlash: (
        //     await pairFlash.initialize.populateTransaction(
        //         swapRouter.getAddress(),
        //         clPoolFactory.getAddress(),
        //         config.WETH,
        //     )
        // ).data,

        // Lens: (
        //     await lens.initialize.populateTransaction(
        //         voter.getAddress(),
        //         router.getAddress(),
        //         clPoolFactory.getAddress(),
        //         nfpManager.getAddress(),
        //         swapRouter.getAddress(),
        //         quoterV2.getAddress(),
        //         pairFlash.getAddress(),
        //     )
        // ).data,

        FeeCollector: (
            await feeCollector.initialize.populateTransaction(
                config.MULTISIG,
                voter.getAddress(),
            )
        ).data,
    };

    for (const _contract of Object.keys(initializeCalldata)) {
        const contract = _contract as keyof typeof ImpToProxy;
        const Factory = factories[contract];
        console.log(`Deploying ${contract}`);

        const implementation = await Factory.deploy();
        await implementation.waitForDeployment();

        console.log("Done");

        console.log(`Initializing ${contract}`);

        await (
            await proxyAdmin.upgradeAndCall(
                proxyAddresses[contract],
                implementation.getAddress(),
                initializeCalldata[contract] ?? "0x",
            )
        ).wait();
        console.log("Done");
    }

    // extra settings for pool factories
    console.log("Setting FeeCollector");
    await (
        await clPoolFactory.setFeeCollector(feeCollector.getAddress())
    ).wait();

    console.log("Done");

    console.log("Setting feeSplit");
    await (await pairFactory.setFeeSplit(config.INITIAL_FEE_SPLIT)).wait();

    console.log("Done");

    // set some more minter configs
    console.log("Setting Minter");
    await minter.kickoff(
        immutableAddresses["EmissionsToken"]!,
        proxyAddresses["Voter"],
        config.TOKEN_INITIAL_SUPPLY,
        config.MULTISIG,
        immutableAddresses["RebaseDistributor"]!,
        config.INITIAL_WEEKLY_EMISSIONS,
    );
    await minter.updateEmissionsMultiplier(config.INITIAL_EMISSIONS_MULTIPLIER);
    await minter.updateRebaseRate(config.INITIAL_REBASE_RATE);
    console.log("Done");

    // make feeCollector live if needed
    if (config.GO_LIVE) {
        await feeCollector.setIsLive(true);
    }

    console.log("POOL_INIT_CODE_HASH");
    const POOL_INIT_BYTECODE = await clPoolDeployer.poolBytecode();
    const POOL_INIT_CODE_HASH = ethers.keccak256(POOL_INIT_BYTECODE);
    console.log(POOL_INIT_CODE_HASH);

    return {
        accessManager,
        proxyAdmin,
        contractDeployer,
        emissionsToken,
        gaugeFactory,
        feeDistributorFactory,
        pairFactory,
        router,
        votingEscrow,
        rebaseDistributor,
        voter,
        minter: minter,
        factory: clPoolFactory,
        nfpManager: nfpManager,
        nftDescriptor: nfpTokenDescriptor,
        swapRouter,
        // pairFlash,
        quoter,
        quoterV2,
        // lens,
        tickLens,
        gaugeV3Factory: clGaugeFactory,
        feeCollector,
        pairFeeFactory,
        clPoolDeployer: clPoolDeployer,
    };
}
