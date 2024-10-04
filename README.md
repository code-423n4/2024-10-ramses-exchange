# Ramses Exchange audit details
- Total Prize Pool: $120,000 in USDC
  - HM awards: $76,800 in USDC
  - QA awards: $3,200 in USDC
  - Judge awards: $9,750 in USDC
  - Validator awards: $9,750 in USDC 
  - Scout awards: $500 in USDC
  - Test coverage invitational: $20,000 in USDC
- [Read our guidelines for more details](https://docs.code4rena.com/roles/wardens)
- Starts October 8, 2024 20:00 UTC
- Ends October 29, 2024 20:00 UTC

ℹ️ This competition will include [Rolling Triage](https://code4rena.notion.site/Rolling-triage-how-it-works-11298baa1c14807ebd69cf43bf4f67c6?pvs=25). Questions/feedback can be shared in [this Discord thread](https://discord.com/channels/810916927919620096/1291194011012567051).

*Note: This competition will be followed by a private Zenith mitigation review.*

## Automated Findings / Publicly Known Issues

The 4naly3er report can be found [here](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/4naly3er-report.md).



_Note for C4 wardens: Anything included in this `Automated Findings / Publicly Known Issues` section is considered a publicly known issue and is ineligible for awards._

fee-on-transfer tokens (tax tokens) are not compatible with the concentrated liquidity system.

✅ SCOUTS: Please format the response above 👆 so its not a wall of text and its readable.

# Overview

[ ⭐️ SPONSORS: add info here ]

## Links

- **Previous audits:**  Consensys Diligence audit (concluded as of today, remediations will be made and updated to the repo shortly)
  - ✅ SCOUTS: If there are multiple report links, please format them in a list.
- **Documentation:** https://docs.ramses.exchange/
- **Website:** 🐺 CA: add a link to the sponsor's website
- **X/Twitter:** 🐺 CA: add a link to the sponsor's Twitter
- **Discord:** 🐺 CA: add a link to the sponsor's Discord

---

# Scope

[ ✅ SCOUTS: add scoping and technical details here ]

*See [scope.txt](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/scope.txt)*

### Files in scope


| File   | Logic Contracts | Interfaces | nSLOC | Purpose | Libraries used |
| ------ | --------------- | ---------- | ----- | -----   | ------------ |
| /contracts/AccessManager.sol | ****| **** | 2 | |@openzeppelin/contracts/access/manager/AccessManager.sol|
| /contracts/CL/core/RamsesV3Factory.sol | 1| **** | 116 | |@openzeppelin/contracts/access/manager/AccessManaged.sol|
| /contracts/CL/core/RamsesV3Pool.sol | 1| **** | 621 | |@openzeppelin/contracts/interfaces/IERC20.sol|
| /contracts/CL/core/RamsesV3PoolDeployer.sol | 1| **** | 20 | ||
| /contracts/CL/core/interfaces/IERC20Minimal.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/IRamsesV3Factory.sol | ****| 1 | 20 | ||
| /contracts/CL/core/interfaces/IRamsesV3Pool.sol | ****| 1 | 18 | ||
| /contracts/CL/core/interfaces/IRamsesV3PoolDeployer.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/callback/IUniswapV3FlashCallback.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/callback/IUniswapV3MintCallback.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/callback/IUniswapV3SwapCallback.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolActions.sol | ****| 1 | 4 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolDerivedState.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolErrors.sol | ****| 1 | 16 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolEvents.sol | ****| 1 | 52 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolImmutables.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolOwnerActions.sol | ****| 1 | 3 | ||
| /contracts/CL/core/interfaces/pool/IRamsesV3PoolState.sol | ****| 1 | 3 | ||
| /contracts/CL/core/libraries/BitMath.sol | 1| **** | 79 | ||
| /contracts/CL/core/libraries/FixedPoint128.sol | 1| **** | 4 | ||
| /contracts/CL/core/libraries/FixedPoint32.sol | 1| **** | 5 | ||
| /contracts/CL/core/libraries/FixedPoint96.sol | 1| **** | 5 | ||
| /contracts/CL/core/libraries/FullMath.sol | 1| **** | 59 | ||
| /contracts/CL/core/libraries/Oracle.sol | 1| **** | 308 | ||
| /contracts/CL/core/libraries/PoolStorage.sol | 1| **** | 79 | ||
| /contracts/CL/core/libraries/Position.sol | 1| **** | 282 | ||
| /contracts/CL/core/libraries/ProtocolActions.sol | 1| **** | 47 | ||
| /contracts/CL/core/libraries/SafeCast.sol | 1| **** | 13 | ||
| /contracts/CL/core/libraries/SqrtPriceMath.sol | 1| **** | 106 | ||
| /contracts/CL/core/libraries/SwapMath.sol | 1| **** | 61 | ||
| /contracts/CL/core/libraries/Tick.sol | 1| **** | 93 | ||
| /contracts/CL/core/libraries/TickBitmap.sol | 1| **** | 41 | ||
| /contracts/CL/core/libraries/TickMath.sol | 1| **** | 180 | ||
| /contracts/CL/core/libraries/TransferHelper.sol | 1| **** | 11 | ||
| /contracts/CL/core/libraries/UnsafeMath.sol | 1| **** | 8 | ||
| /contracts/CL/core/test/BitMathEchidnaTest.sol | 1| **** | 18 | ||
| /contracts/CL/core/test/BitMathTest.sol | 1| **** | 20 | ||
| /contracts/CL/core/test/FullMathEchidnaTest.sol | 1| **** | 48 | ||
| /contracts/CL/core/test/FullMathTest.sol | 1| **** | 10 | ||
| /contracts/CL/core/test/MockAccessManager.sol | 1| **** | 7 | ||
| /contracts/CL/core/test/MockTimeRamsesV3Pool.sol | 1| **** | 22 | ||
| /contracts/CL/core/test/MockTimeRamsesV3PoolDeployer.sol | 1| **** | 16 | ||
| /contracts/CL/core/test/OracleEchidnaTest.sol | 1| **** | 94 | ||
| /contracts/CL/core/test/OracleTest.sol | 1| **** | 79 | ||
| /contracts/CL/core/test/RamsesV3PoolSwapTest.sol | 1| **** | 26 | ||
| /contracts/CL/core/test/SqrtPriceMathEchidnaTest.sol | 1| **** | 140 | ||
| /contracts/CL/core/test/SqrtPriceMathTest.sol | 1| **** | 36 | ||
| /contracts/CL/core/test/SwapMathEchidnaTest.sol | 1| **** | 40 | ||
| /contracts/CL/core/test/SwapMathTest.sol | 1| **** | 12 | ||
| /contracts/CL/core/test/TestERC20.sol | 1| **** | 42 | ||
| /contracts/CL/core/test/TestRamsesV3Callee.sol | 1| **** | 63 | ||
| /contracts/CL/core/test/TestRamsesV3ReentrantCallee.sol | 1| **** | 31 | ||
| /contracts/CL/core/test/TestRamsesV3Router.sol | 1| **** | 64 | ||
| /contracts/CL/core/test/TestRamsesV3SwapPay.sol | 1| **** | 23 | ||
| /contracts/CL/core/test/TickBitmapEchidnaTest.sol | 1| **** | 35 | ||
| /contracts/CL/core/test/TickBitmapTest.sol | 1| **** | 26 | ||
| /contracts/CL/core/test/TickEchidnaTest.sol | 1| **** | 17 | ||
| /contracts/CL/core/test/TickMathEchidnaTest.sol | 1| **** | 16 | ||
| /contracts/CL/core/test/TickMathTest.sol | 1| **** | 26 | ||
| /contracts/CL/core/test/TickOverflowSafetyEchidnaTest.sol | 1| **** | 97 | ||
| /contracts/CL/core/test/TickTest.sol | 1| **** | 67 | ||
| /contracts/CL/core/test/UnsafeMathEchidnaTest.sol | 1| **** | 14 | ||
| /contracts/CL/core/test/WETH9.sol | 1| **** | 47 | ||
| /contracts/CL/gauge/ClGaugeFactory.sol | 1| **** | 29 | ||
| /contracts/CL/gauge/FeeCollector.sol | 1| **** | 100 | |@openzeppelin/contracts/proxy/utils/Initializable.sol<br>@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol|
| /contracts/CL/gauge/GaugeV3.sol | 1| **** | 393 | |@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol<br>@openzeppelin/contracts/utils/math/Math.sol|
| /contracts/CL/gauge/interfaces/IClGaugeFactory.sol | ****| 1 | 9 | ||
| /contracts/CL/gauge/interfaces/IFeeCollector.sol | ****| 1 | 13 | ||
| /contracts/CL/gauge/interfaces/IGaugeV3.sol | ****| 1 | 24 | ||
| /contracts/CL/gauge/test/MockTimeGaugeV2.sol | 1| 1 | 14 | ||
| /contracts/CL/periphery/NonfungiblePositionManager.sol | 1| **** | 288 | |@openzeppelin/contracts/token/ERC721/ERC721.sol<br>@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol<br>@openzeppelin/contracts/utils/Multicall.sol|
| /contracts/CL/periphery/NonfungibleTokenPositionDescriptor.sol | 1| **** | 85 | ||
| /contracts/CL/periphery/SwapRouter.sol | 1| **** | 144 | ||
| /contracts/CL/periphery/base/BlockTimestamp.sol | 1| **** | 6 | ||
| /contracts/CL/periphery/base/LiquidityManagement.sol | 1| **** | 65 | ||
| /contracts/CL/periphery/base/Multicall.sol | 1| **** | 19 | ||
| /contracts/CL/periphery/base/PeripheryImmutableState.sol | 1| **** | 10 | ||
| /contracts/CL/periphery/base/PeripheryPayments.sol | 1| **** | 39 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/base/PeripheryPaymentsWithFee.sol | 1| **** | 29 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/base/PeripheryValidation.sol | 1| **** | 9 | ||
| /contracts/CL/periphery/base/PoolInitializer.sol | 1| **** | 19 | ||
| /contracts/CL/periphery/base/SelfPermit.sol | 1| **** | 20 | |@openzeppelin/contracts/token/ERC20/IERC20.sol<br>@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol|
| /contracts/CL/periphery/interfaces/IERC20Metadata.sol | ****| 1 | 4 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/interfaces/IMulticall.sol | ****| 1 | 4 | ||
| /contracts/CL/periphery/interfaces/INonfungiblePositionManager.sol | ****| 1 | 57 | |@openzeppelin/contracts/token/ERC721/IERC721.sol<br>@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol<br>@openzeppelin/contracts/token/ERC721/extensions/IERC721Enumerable.sol|
| /contracts/CL/periphery/interfaces/INonfungibleTokenPositionDescriptor.sol | ****| 1 | 4 | ||
| /contracts/CL/periphery/interfaces/IPeripheryErrors.sol | ****| 1 | 6 | ||
| /contracts/CL/periphery/interfaces/IPeripheryImmutableState.sol | ****| 1 | 3 | ||
| /contracts/CL/periphery/interfaces/IPeripheryPayments.sol | ****| 1 | 3 | ||
| /contracts/CL/periphery/interfaces/IPeripheryPaymentsWithFee.sol | ****| 1 | 4 | ||
| /contracts/CL/periphery/interfaces/IPoolInitializer.sol | ****| 1 | 4 | ||
| /contracts/CL/periphery/interfaces/IQuoter.sol | ****| 1 | 4 | ||
| /contracts/CL/periphery/interfaces/IQuoterV2.sol | ****| 1 | 18 | ||
| /contracts/CL/periphery/interfaces/ISelfPermit.sol | ****| 1 | 3 | ||
| /contracts/CL/periphery/interfaces/ISwapRouter.sol | ****| 1 | 39 | ||
| /contracts/CL/periphery/interfaces/ITickLens.sol | ****| 1 | 9 | ||
| /contracts/CL/periphery/interfaces/IV3Migrator.sol | ****| 1 | 22 | ||
| /contracts/CL/periphery/interfaces/external/IERC1271.sol | ****| 1 | 3 | ||
| /contracts/CL/periphery/interfaces/external/IERC20PermitAllowed.sol | ****| 1 | 3 | ||
| /contracts/CL/periphery/interfaces/external/IWETH9.sol | ****| 1 | 4 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/lens/Quoter.sol | 1| **** | 110 | ||
| /contracts/CL/periphery/lens/QuoterV2.sol | 1| **** | 173 | ||
| /contracts/CL/periphery/lens/TickLens.sol | 1| **** | 30 | ||
| /contracts/CL/periphery/lens/UniswapInterfaceMulticall.sol | 1| **** | 35 | ||
| /contracts/CL/periphery/libraries/AddressStringUtil.sol | 1| **** | 24 | ||
| /contracts/CL/periphery/libraries/BytesLib.sol | 1| **** | 52 | ||
| /contracts/CL/periphery/libraries/CallbackValidation.sol | 1| **** | 12 | ||
| /contracts/CL/periphery/libraries/ChainId.sol | 1| **** | 8 | ||
| /contracts/CL/periphery/libraries/HexStrings.sol | 1| **** | 24 | ||
| /contracts/CL/periphery/libraries/LiquidityAmounts.sol | 1| **** | 61 | ||
| /contracts/CL/periphery/libraries/NFTDescriptor.sol | 1| **** | 414 | |@openzeppelin/contracts/utils/Strings.sol<br>@openzeppelin/contracts/utils/Base64.sol|
| /contracts/CL/periphery/libraries/NFTSVG.sol | 1| **** | 363 | |@openzeppelin/contracts/utils/Strings.sol<br>@openzeppelin/contracts/utils/Base64.sol|
| /contracts/CL/periphery/libraries/OracleLibrary.sol | 1| **** | 122 | ||
| /contracts/CL/periphery/libraries/Path.sol | 1| **** | 27 | ||
| /contracts/CL/periphery/libraries/PoolAddress.sol | 1| **** | 31 | ||
| /contracts/CL/periphery/libraries/PoolTicksCounter.sol | 1| **** | 62 | ||
| /contracts/CL/periphery/libraries/PositionKey.sol | 1| **** | 6 | ||
| /contracts/CL/periphery/libraries/PositionValue.sol | 1| **** | 115 | ||
| /contracts/CL/periphery/libraries/SafeERC20Namer.sol | 1| **** | 65 | ||
| /contracts/CL/periphery/libraries/SqrtPriceMathPartial.sol | 1| **** | 26 | ||
| /contracts/CL/periphery/libraries/TokenRatioSortOrder.sol | 1| **** | 9 | ||
| /contracts/CL/periphery/libraries/TransferHelper.sol | 1| **** | 22 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/test/Base64Test.sol | 1| **** | 12 | |@openzeppelin/contracts/utils/Base64.sol|
| /contracts/CL/periphery/test/LiquidityAmountsTest.sol | 1| **** | 52 | ||
| /contracts/CL/periphery/test/MockObservable.sol | 1| **** | 35 | ||
| /contracts/CL/periphery/test/MockObservations.sol | 1| **** | 52 | ||
| /contracts/CL/periphery/test/MockTimeNonfungiblePositionManager.sol | 1| **** | 18 | ||
| /contracts/CL/periphery/test/MockTimeSwapRouter.sol | 1| **** | 13 | ||
| /contracts/CL/periphery/test/NFTDescriptorTest.sol | 1| **** | 43 | ||
| /contracts/CL/periphery/test/NonfungiblePositionManagerPositionsGasTest.sol | 1| **** | 13 | ||
| /contracts/CL/periphery/test/OracleTest.sol | 1| **** | 34 | ||
| /contracts/CL/periphery/test/PathTest.sol | 1| **** | 21 | ||
| /contracts/CL/periphery/test/PeripheryImmutableStateTest.sol | 1| **** | 5 | ||
| /contracts/CL/periphery/test/PoolAddressTest.sol | 1| **** | 22 | ||
| /contracts/CL/periphery/test/PoolTicksCounterTest.sol | 1| **** | 9 | ||
| /contracts/CL/periphery/test/PositionValueTest.sol | 1| **** | 29 | ||
| /contracts/CL/periphery/test/SelfPermitTest.sol | 1| **** | 3 | ||
| /contracts/CL/periphery/test/TestCallbackValidation.sol | 1| **** | 7 | ||
| /contracts/CL/periphery/test/TestERC20.sol | 1| **** | 7 | |@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol|
| /contracts/CL/periphery/test/TestERC20Metadata.sol | 1| **** | 7 | |@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol|
| /contracts/CL/periphery/test/TestERC20PermitAllowed.sol | 1| **** | 10 | ||
| /contracts/CL/periphery/test/TestMulticall.sol | 1| **** | 22 | ||
| /contracts/CL/periphery/test/TestPositionNFTOwner.sol | 1| **** | 23 | ||
| /contracts/CL/periphery/test/TestRamsesV3Callee.sol | 1| **** | 29 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/periphery/test/TickLensTest.sol | 1| **** | 11 | ||
| /contracts/CL/universalRouter/UniversalRouter.sol | 1| **** | 37 | ||
| /contracts/CL/universalRouter/base/Callbacks.sol | 1| **** | 19 | |@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol<br>@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol<br>@openzeppelin/contracts/utils/introspection/IERC165.sol|
| /contracts/CL/universalRouter/base/Dispatcher.sol | 1| **** | 331 | |solmate/src/tokens/ERC721.sol<br>solmate/src/tokens/ERC1155.sol<br>solmate/src/tokens/ERC20.sol<br>permit2/src/interfaces/IAllowanceTransfer.sol|
| /contracts/CL/universalRouter/base/LockAndMsgSender.sol | 1| **** | 26 | ||
| /contracts/CL/universalRouter/base/RewardsCollector.sol | 1| **** | 17 | |solmate/src/tokens/ERC20.sol<br>solmate/src/utils/SafeTransferLib.sol|
| /contracts/CL/universalRouter/base/RouterImmutables.sol | 1| **** | 74 | |permit2/src/interfaces/IAllowanceTransfer.sol<br>solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/deploy/UnsupportedProtocol.sol | 1| **** | 7 | ||
| /contracts/CL/universalRouter/interfaces/IRewardsCollector.sol | ****| 1 | 4 | |solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/interfaces/IUniversalRouter.sol | ****| 1 | 10 | |@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol<br>@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol|
| /contracts/CL/universalRouter/interfaces/external/ICryptoPunksMarket.sol | ****| 1 | 3 | ||
| /contracts/CL/universalRouter/interfaces/external/IWETH9.sol | ****| 1 | 4 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /contracts/CL/universalRouter/libraries/Commands.sol | 1| **** | 40 | ||
| /contracts/CL/universalRouter/libraries/Constants.sol | 1| **** | 16 | ||
| /contracts/CL/universalRouter/libraries/SwapRoute.sol | 1| **** | 8 | ||
| /contracts/CL/universalRouter/modules/Payments.sol | 1| **** | 90 | |solmate/src/utils/SafeTransferLib.sol<br>solmate/src/tokens/ERC20.sol<br>solmate/src/tokens/ERC721.sol<br>solmate/src/tokens/ERC1155.sol|
| /contracts/CL/universalRouter/modules/Permit2Payments.sol | 1| **** | 34 | |permit2/src/interfaces/IAllowanceTransfer.sol<br>permit2/src/libraries/SafeCast160.sol<br>@openzeppelin/contracts/interfaces/IERC20.sol|
| /contracts/CL/universalRouter/modules/uniswap/v2/RamsesLegacyLibrary.sol | 1| **** | 179 | ||
| /contracts/CL/universalRouter/modules/uniswap/v2/V2SwapRouter.sol | 1| **** | 108 | |solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/modules/uniswap/v3/BytesLib.sol | 1| **** | 51 | ||
| /contracts/CL/universalRouter/modules/uniswap/v3/V3Path.sol | 1| **** | 21 | ||
| /contracts/CL/universalRouter/modules/uniswap/v3/V3SwapRouter.sol | 1| **** | 107 | |solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/test/ExampleModule.sol | 1| **** | 11 | ||
| /contracts/CL/universalRouter/test/ImportsForTypechain.sol | 1| **** | 4 | |solmate/src/tokens/ERC1155.sol<br>permit2/src/Permit2.sol|
| /contracts/CL/universalRouter/test/MintableERC20.sol | 1| **** | 11 | |solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/test/MockLooksRareRewardsDistributor.sol | 1| **** | 13 | |solmate/src/tokens/ERC20.sol|
| /contracts/CL/universalRouter/test/ReenteringProtocol.sol | 1| **** | 8 | ||
| /contracts/CL/universalRouter/test/TestCustomErrors.sol | 1| **** | 5 | ||
| /contracts/ContractDeployer.sol | 1| **** | 36 | |@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol|
| /contracts/EmissionsToken.sol | 1| **** | 17 | |@openzeppelin/contracts/token/ERC20/ERC20.sol<br>@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol<br>@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol|
| /contracts/FeeDistributor.sol | 1| **** | 162 | |@openzeppelin/contracts/utils/math/Math.sol<br>@openzeppelin/contracts/interfaces/IERC20.sol<br>@openzeppelin/contracts/utils/ReentrancyGuard.sol<br>@openzeppelin/contracts/utils/structs/EnumerableSet.sol|
| /contracts/Gauge.sol | 1| **** | 180 | |@openzeppelin/contracts/utils/math/Math.sol<br>@openzeppelin/contracts/interfaces/IERC20.sol<br>@openzeppelin/contracts/utils/ReentrancyGuard.sol<br>@openzeppelin/contracts/utils/structs/EnumerableSet.sol|
| /contracts/Minter.sol | 1| **** | 109 | |@openzeppelin/contracts/utils/math/Math.sol<br>@openzeppelin/contracts/access/manager/AccessManaged.sol|
| /contracts/Pair.sol | 1| **** | 383 | |@openzeppelin/contracts/token/ERC20/ERC20.sol<br>@openzeppelin/contracts/utils/ReentrancyGuard.sol<br>@openzeppelin/contracts/utils/math/Math.sol|
| /contracts/PairFees.sol | 1| **** | 37 | |@openzeppelin/contracts/interfaces/IERC20.sol|
| /contracts/ProxyAdmin.sol | ****| **** | 2 | |@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol|
| /contracts/RamsesERC1967Proxy.sol | 1| **** | 8 | |@openzeppelin/contracts/proxy/Proxy.sol<br>@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol|
| /contracts/RamsesTransparentUpgradeableProxy.sol | 1| 1 | 75 | |@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol<br>@openzeppelin/contracts/interfaces/IERC1967.sol|
| /contracts/RebaseDistributor.sol | 1| **** | 124 | |@openzeppelin/contracts/utils/math/Math.sol<br>@openzeppelin/contracts/interfaces/IERC20.sol|
| /contracts/Router.sol | 1| **** | 614 | |@openzeppelin/contracts/utils/math/Math.sol|
| /contracts/Token.sol | 1| **** | 7 | |@openzeppelin/contracts/token/ERC20/ERC20.sol|
| /contracts/Voter.sol | 1| **** | 697 | |@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol<br>@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol<br>@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol<br>@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol<br>@openzeppelin/contracts/token/ERC20/IERC20.sol<br>@openzeppelin/contracts/utils/structs/EnumerableSet.sol|
| /contracts/VotingEscrow.sol | 1| **** | 137 | |@openzeppelin/contracts/token/ERC721/ERC721.sol<br>@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol|
| /contracts/factories/FeeDistributorFactory.sol | 1| **** | 9 | ||
| /contracts/factories/GaugeFactory.sol | 1| **** | 12 | ||
| /contracts/factories/PairFactory.sol | 1| **** | 120 | |@openzeppelin/contracts/access/manager/AccessManaged.sol|
| /contracts/factories/PairFeeFactory.sol | 1| **** | 36 | |@openzeppelin/contracts/access/manager/AccessManaged.sol|
| /contracts/interfaces/IERC20Extended.sol | ****| 1 | 6 | |@openzeppelin/contracts/token/ERC20/IERC20.sol<br>@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol<br>@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol|
| /contracts/interfaces/IEmissionsToken.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IFeeDistributor.sol | ****| 1 | 25 | ||
| /contracts/interfaces/IFeeDistributorFactory.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IGauge.sol | ****| 1 | 27 | ||
| /contracts/interfaces/IGaugeFactory.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IMinter.sol | ****| 1 | 12 | ||
| /contracts/interfaces/IPair.sol | ****| 1 | 19 | ||
| /contracts/interfaces/IPairCallee.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IPairFactory.sol | ****| 1 | 17 | ||
| /contracts/interfaces/IPairFeeFactory.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IPairFees.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IProxyAdmin.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IRebaseDistributor.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IRouter.sol | ****| 1 | 8 | ||
| /contracts/interfaces/IVeArtProxy.sol | ****| 1 | 3 | ||
| /contracts/interfaces/IVoter.sol | ****| 1 | 58 | ||
| /contracts/interfaces/IVotingEscrow.sol | ****| 1 | 4 | |@openzeppelin/contracts/interfaces/IERC721.sol|
| /contracts/interfaces/IWETH.sol | ****| 1 | 3 | ||
| /contracts/libraries/RewardClaimers.sol | 1| **** | 50 | ||
| /contracts/libraries/UQ112x112.sol | 1| **** | 14 | ||
| /contracts/migration/RamsesTokenMigrator.sol | 1| 2 | 135 | |@openzeppelin/contracts/token/ERC20/IERC20.sol|
| /lib/permit2/src/AllowanceTransfer.sol | 1| **** | 97 | |solmate/src/tokens/ERC20.sol<br>solmate/src/utils/SafeTransferLib.sol|
| /lib/permit2/src/EIP712.sol | 1| **** | 23 | ||
| /lib/permit2/src/Permit2.sol | 1| **** | 5 | ||
| /lib/permit2/src/PermitErrors.sol | ****| **** | 3 | ||
| /lib/permit2/src/SignatureTransfer.sol | 1| **** | 70 | |solmate/src/tokens/ERC20.sol<br>solmate/src/utils/SafeTransferLib.sol|
| /lib/permit2/src/interfaces/IAllowanceTransfer.sol | ****| 1 | 52 | ||
| /lib/permit2/src/interfaces/IDAIPermit.sol | ****| 1 | 3 | ||
| /lib/permit2/src/interfaces/IERC1271.sol | ****| 1 | 3 | ||
| /lib/permit2/src/interfaces/ISignatureTransfer.sol | ****| 1 | 24 | ||
| /lib/permit2/src/libraries/Allowance.sol | 1| **** | 23 | ||
| /lib/permit2/src/libraries/Permit2Lib.sol | 1| **** | 67 | |solmate/src/tokens/ERC20.sol|
| /lib/permit2/src/libraries/PermitHash.sol | 1| **** | 97 | ||
| /lib/permit2/src/libraries/SafeCast160.sol | 1| **** | 8 | ||
| /lib/permit2/src/libraries/SignatureVerification.sol | 1| **** | 33 | ||
| **Totals** | **162** | **66** | **12106** | | |

### Files out of scope

*See [out_of_scope.txt](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/out_of_scope.txt)*

| File         |
| ------------ |
| Totals: 0 |

## Scoping Q &amp; A

### General questions
### Are there any ERC20's in scope?: Yes

✅ SCOUTS: If the answer above 👆 is "Yes", please add the tokens below 👇 to the table. Otherwise, update the column with "None".

Any (all possible ERC20s)


### Are there any ERC777's in scope?: No

✅ SCOUTS: If the answer above 👆 is "Yes", please add the tokens below 👇 to the table. Otherwise, update the column with "None".



### Are there any ERC721's in scope?: Yes

✅ SCOUTS: If the answer above 👆 is "Yes", please add the tokens below 👇 to the table. Otherwise, update the column with "None".

NonFungiblePositionManager

### Are there any ERC1155's in scope?: No

✅ SCOUTS: If the answer above 👆 is "Yes", please add the tokens below 👇 to the table. Otherwise, update the column with "None".



✅ SCOUTS: Once done populating the table below, please remove all the Q/A data above.

| Question                                | Answer                       |
| --------------------------------------- | ---------------------------- |
| ERC20 used by the protocol              |       🖊️             |
| Test coverage                           | ✅ SCOUTS: Please populate this after running the test coverage command                          |
| ERC721 used  by the protocol            |            🖊️              |
| ERC777 used by the protocol             |           🖊️                |
| ERC1155 used by the protocol            |              🖊️            |
| Chains the protocol will be deployed on | Arbitrum,Avax,Polygon,OtherArbitrum, Avalanche, Linea, Scroll, Fraxtal, Polygon, Mantle, and possibly other EVM compatible chains in the future.  |

### ERC20 token behaviors in scope

| Question                                                                                                                                                   | Answer |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Missing return values](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#missing-return-values)                                                      |   Out of scope  |
| [Fee on transfer](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#fee-on-transfer)                                                                  |  Out of scope  |
| [Balance changes outside of transfers](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#balance-modifications-outside-of-transfers-rebasingairdrops) | Out of scope    |
| [Upgradeability](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#upgradable-tokens)                                                                 |   Out of scope  |
| [Flash minting](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#flash-mintable-tokens)                                                              | Out of scope    |
| [Pausability](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#pausable-tokens)                                                                      | Out of scope    |
| [Approval race protections](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#approval-race-protections)                                              | Out of scope    |
| [Revert on approval to zero address](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-approval-to-zero-address)                            | Out of scope    |
| [Revert on zero value approvals](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-zero-value-approvals)                                    | Out of scope    |
| [Revert on zero value transfers](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-zero-value-transfers)                                    | Out of scope    |
| [Revert on transfer to the zero address](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-transfer-to-the-zero-address)                    | Out of scope    |
| [Revert on large approvals and/or transfers](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-large-approvals--transfers)                  | Out of scope    |
| [Doesn't revert on failure](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#no-revert-on-failure)                                                   |  Out of scope   |
| [Multiple token addresses](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#revert-on-zero-value-transfers)                                          | Out of scope    |
| [Low decimals ( < 6)](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#low-decimals)                                                                 |   Out of scope  |
| [High decimals ( > 18)](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#high-decimals)                                                              | Out of scope    |
| [Blocklists](https://github.com/d-xo/weird-erc20?tab=readme-ov-file#tokens-with-blocklists)                                                                | Out of scope    |

### External integrations (e.g., Uniswap) behavior in scope:


| Question                                                  | Answer |
| --------------------------------------------------------- | ------ |
| Enabling/disabling fees (e.g. Blur disables/enables fees) | No   |
| Pausability (e.g. Uniswap pool gets paused)               |  No   |
| Upgradeability (e.g. Uniswap gets upgraded)               |   No  |


### EIP compliance checklist
N/A

✅ SCOUTS: Please format the response above 👆 using the template below👇

| Question                                | Answer                       |
| --------------------------------------- | ---------------------------- |
| src/Token.sol                           | ERC20, ERC721                |
| src/NFT.sol                             | ERC721                       |


# Additional context

## Main invariants

- Users cannot withdraw liquidity from someone else's position unless explicitly given approval on-chain.
- Gauges should never be "bricked" or revert on claiming protocol emissions if they have emissions from being voted on.
- Only restricted roles can modify swap fee splits and dynamic fees between LPers and voters.
- Positions minted via NFPs should not be fundamentally different in how they operate as liquidity to direct pool mints (no NFP).

✅ SCOUTS: Please format the response above 👆 so its not a wall of text and its readable.

## Attack ideas (where to focus for bugs)
Finding cases where the math is irregular or returns improper results. Namely ensuring pool integrity and safety of user deposits. Secondly, reward accounting being accurate and not substantially inflated or deflated from reality are crucial.

✅ SCOUTS: Please format the response above 👆 so its not a wall of text and its readable.

## All trusted roles in the protocol

OZ AccessManager is used where necessary, limiting some functionality to the system "governor" who initially is a multisig of core contributors/stakeholders, but intend on moving all controls to a decentralized governance model over time.

✅ SCOUTS: Please format the response above 👆 using the template below👇

| Role                                | Description                       |
| --------------------------------------- | ---------------------------- |
| Owner                          | Has superpowers                |
| Administrator                             | Can change fees                       |

## Describe any novel or unique curve logic or mathematical models implemented in the contracts:

We use novel math in our position/rewards accounting system. These lay on top of the UniswapV3 pool code and are adapted within the core libraries. 

✅ SCOUTS: Please format the response above 👆 so its not a wall of text and its readable.

## Running tests

(roughly)
git clone
npx hardhat compile
npx hardhat test
npx hardhat test test/uniswapV3CoreTests/UniswapV3Pool.gas.spec.ts

✅ SCOUTS: Please format the response above 👆 using the template below👇

```bash
git clone https://github.com/code-423n4/2023-08-arbitrum
git submodule update --init --recursive
cd governance
foundryup
make install
make build
make sc-election-test
```
To run code coverage
```bash
make coverage
```
To run gas benchmarks
```bash
make gas
```

✅ SCOUTS: Add a screenshot of your terminal showing the gas report
✅ SCOUTS: Add a screenshot of your terminal showing the test coverage

## Miscellaneous
Employees of [SPONSOR NAME] and employees' family members are ineligible to participate in this audit.

Code4rena's rules cannot be overridden by the contents of this README. In case of doubt, please check with C4 staff.

