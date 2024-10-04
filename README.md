# ✨ So you want to run an audit

This `README.md` contains a set of checklists for our audit collaboration.

Your audit will use two repos: 
- **an _audit_ repo** (this one), which is used for scoping your audit and for providing information to wardens
- **a _findings_ repo**, where issues are submitted (shared with you after the audit) 

Ultimately, when we launch the audit, this repo will be made public and will contain the smart contracts to be reviewed and all the information needed for audit participants. The findings repo will be made public after the audit report is published and your team has mitigated the identified issues.

Some of the checklists in this doc are for **C4 (🐺)** and some of them are for **you as the audit sponsor (⭐️)**.

---

# Audit setup

## 🐺 C4: Set up repos
- [ ] Create a new private repo named `YYYY-MM-sponsorname` using this repo as a template.
- [ ] Rename this repo to reflect audit date (if applicable)
- [ ] Rename audit H1 below
- [ ] Update pot sizes
  - [ ] Remove the "Bot race findings opt out" section if there's no bot race.
- [ ] Fill in start and end times in audit bullets below
- [ ] Add link to submission form in audit details below
- [ ] Add the information from the scoping form to the "Scoping Details" section at the bottom of this readme.
- [ ] Add matching info to the Code4rena site
- [ ] Add sponsor to this private repo with 'maintain' level access.
- [ ] Send the sponsor contact the url for this repo to follow the instructions below and add contracts here. 
- [ ] Delete this checklist.

# Repo setup

## ⭐️ Sponsor: Add code to this repo

- [ ] Create a PR to this repo with the below changes:
- [ ] Confirm that this repo is a self-contained repository with working commands that will build (at least) all in-scope contracts, and commands that will run tests producing gas reports for the relevant contracts.
- [ ] Please have final versions of contracts and documentation added/updated in this repo **no less than 48 business hours prior to audit start time.**
- [ ] Be prepared for a 🚨code freeze🚨 for the duration of the audit — important because it establishes a level playing field. We want to ensure everyone's looking at the same code, no matter when they look during the audit. (Note: this includes your own repo, since a PR can leak alpha to our wardens!)

## ⭐️ Sponsor: Repo checklist

- [ ] Modify the [Overview](#overview) section of this `README.md` file. Describe how your code is supposed to work with links to any relevent documentation and any other criteria/details that the auditors should keep in mind when reviewing. (Here are two well-constructed examples: [Ajna Protocol](https://github.com/code-423n4/2023-05-ajna) and [Maia DAO Ecosystem](https://github.com/code-423n4/2023-05-maia))
- [ ] Review the Gas award pool amount, if applicable. This can be adjusted up or down, based on your preference - just flag it for Code4rena staff so we can update the pool totals across all comms channels.
- [ ] Optional: pre-record a high-level overview of your protocol (not just specific smart contract functions). This saves wardens a lot of time wading through documentation.
- [ ] [This checklist in Notion](https://code4rena.notion.site/Key-info-for-Code4rena-sponsors-f60764c4c4574bbf8e7a6dbd72cc49b4#0cafa01e6201462e9f78677a39e09746) provides some best practices for Code4rena audit repos.

## ⭐️ Sponsor: Final touches
- [ ] Review and confirm the pull request created by the Scout (technical reviewer) who was assigned to your contest. *Note: any files not listed as "in scope" will be considered out of scope for the purposes of judging, even if the file will be part of the deployed contracts.*
- [ ] Check that images and other files used in this README have been uploaded to the repo as a file and then linked in the README using absolute path (e.g. `https://github.com/code-423n4/yourrepo-url/filepath.png`)
- [ ] Ensure that *all* links and image/file paths in this README use absolute paths, not relative paths
- [ ] Check that all README information is in markdown format (HTML does not render on Code4rena.com)
- [ ] Delete this checklist and all text above the line below when you're ready.

---

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
## 🐺 C4: Begin Gist paste here (and delete this line)





# Scope

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

