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

ℹ️ This competition includes [Rolling Triage](https://code4rena.notion.site/Rolling-triage-how-it-works-11298baa1c14807ebd69cf43bf4f67c6?pvs=25). The submission phases are as follows: 

- **Week 1:**
  - Oct 8-11 (Tue-Fri): submissions open (HMs only)
  - Oct 11-15 (Fri-Tue): submissions paused for triage
- **Week 2:**
  - Oct 15-18 (Tue-Fri): submissions open (HMs only)
  - Oct 18-22 (Fri-Tue): submissions paused for triage
- **Week 3:**
  - Oct 22-29 (Tue-Tue): submissions open (HM + QA)

The HM pool for this audit will divided into increasing shares as the audit progresses. 10% of the HM pool is allocated for findings surfaced in Week 1; 20% is allocated to Week 2; and 70% is allocated to Week 3. 

Low-risk issues (QA reports) should only be submitted in Week 3. Any QA reports submitted early will be invalidated and ineligible for awards. 

Questions about rolling triage may be asked in [this Discord thread](https://discord.com/channels/810916927919620096/1291194011012567051).

*Note: This competition will be followed by a private Zenith mitigation review.*

## Automated Findings / Publicly Known Issues

- The 4naly3er report can be found [here](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/4naly3er-report.md).
- Fee-on-transfer tokens (tax tokens) are not compatible with the concentrated liquidity system.
- Wardens who either: 
  - submitted findings during the first Rolling Triage cohort, and/or
  - have earned the SR role,

  may also view [preliminary known issues here](https://github.com/code-423n4/2024-10-ramses-exchange-known-issues), and [invalidated submissions here](https://github.com/code-423n4/2024-10-ramses-exchange-validation/issues).

Please also note:
- Ramses is a ve33 DEX with stableswap pools, univ2 pools and univ3 pools
- As such, wardens are advised to look carefully at modified code, vs code that has been forked intact from Univ2 and UniV3 live code.
- Any publicly known issues - e.g. [Uni V3 audits](https://github.com/Uniswap/v3-core/tree/main/audits) - and/or established design choices in UniV3 live code will be assumed to be out of scope for this audit as well.

_Note for C4 wardens: Anything included in this `Automated Findings / Publicly Known Issues` section is considered a publicly known issue and is ineligible for awards._

# Overview

The Ramses Kingdom is a next-generation decentralized exchange (DEX) suite, enhancing Uniswap V3's concentrated liquidity model. 
With advanced liquidity mining & a community-driven governance system, it delivers a seamless, innovative trading experience.

Ramses V3 (the codebase for this competition) refines our existing contracts from our V2 deployment, removing proxies, increasing gas efficiency, and further decentralizing control of the protocol.
The primary focus of the competition is to identify any findings related to concentrated liquidity provisioning, and rewards accrual from in range positions.

### Ramses V3 Systems & Architecture
![contract-infographic](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/diagram-1.png?raw=true)

## Links

- **Previous audits:**  N/A for V3, no **public** audit reports available at the time of competition.
- **Documentation:** 
  - V2 Documentation: https://docs.ramses.exchange/
  - V3 Documentation (early-release): https://v3-docs.ramses.exchange
- **Website:** https://www.ramses.exchange/
- **X/Twitter:** https://x.com/RamsesExchange
- **Discord:** https://discord.gg/ramses

---

# Scope


*See [scope.txt](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/scope.txt)*

### Files in scope


| File   | Logic Contracts | Interfaces | nSLOC | Purpose | Libraries used |
| ------ | --------------- | ---------- | ----- | -----   | ------------ |
| [/contracts/CL/core/RamsesV3Factory.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/RamsesV3Factory.sol) | 1| **** | 116 | |@openzeppelin/contracts/access/manager/AccessManaged.sol|
| [/contracts/CL/core/RamsesV3Pool.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/RamsesV3Pool.sol) | 1| **** | 621 | |@openzeppelin/contracts/interfaces/IERC20.sol|
| [/contracts/CL/core/RamsesV3PoolDeployer.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/RamsesV3PoolDeployer.sol) | 1| **** | 20 | ||
| [/contracts/CL/core/libraries/Oracle.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/libraries/Oracle.sol) | 1| **** | 308 | ||
| [/contracts/CL/core/libraries/Position.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/libraries/Position.sol) | 1| **** | 282 | ||
| [/contracts/CL/core/libraries/Tick.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/core/libraries/Tick.sol) | 1| **** | 93 | ||
| [/contracts/CL/gauge/ClGaugeFactory.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/gauge/ClGaugeFactory.sol) | 1| **** | 29 | ||
| [/contracts/CL/gauge/FeeCollector.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/gauge/FeeCollector.sol) | 1| **** | 100 | |@openzeppelin/contracts/proxy/utils/Initializable.sol<br>@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol|
| [/contracts/CL/gauge/GaugeV3.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/gauge/GaugeV3.sol) | 1| **** | 393 | |@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol<br>@openzeppelin/contracts/utils/math/Math.sol|
| [/contracts/CL/periphery/NonfungiblePositionManager.sol](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/contracts/CL/periphery/NonfungiblePositionManager.sol) | 1| **** | 288 | |@openzeppelin/contracts/token/ERC721/ERC721.sol<br>@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol<br>@openzeppelin/contracts/utils/Multicall.sol|
| **Totals** | **10** | **10** | **2250** | | |

### Files out of scope

* See [out_of_scope.txt](https://github.com/code-423n4/2024-10-ramses-exchange/blob/main/out_of_scope.txt)

* Any files not listed in the scope table is OOS

## Scoping Q &amp; A

### General questions


| Question                                | Answer                       |
| --------------------------------------- | ---------------------------- |
| ERC20 used by the protocol              |       Any (all possible ERC20s)            |
| Test coverage                           | The contest is subject to test coverage invitational competition                         |
| ERC721 used  by the protocol            |           NonFungiblePositionManager              |
| ERC777 used by the protocol             |           None               |
| ERC1155 used by the protocol            |              None            |
| Chains the protocol will be deployed on | Arbitrum, Avax, Polygon, OtherArbitrum, Avalanche, Linea, Scroll, Fraxtal, Polygon, Mantle, and possibly other EVM compatible chains in the future.  |

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


### EIP compliance 
None



# Additional context

## Main invariants

- Users cannot withdraw liquidity from someone else's position unless explicitly given approval on-chain.
- Gauges should never be "bricked" or revert on claiming protocol emissions if they have emissions from being voted on.
- Only restricted roles can modify swap fee splits and dynamic fees between LPers and voters.
- Positions minted via NFPs should not be fundamentally different in how they operate as liquidity to direct pool mints (no NFP).


## Attack ideas (where to focus for bugs)
- Finding cases where the math is irregular or returns improper results. Namely ensuring pool integrity and safety of user deposits. 
- Secondly, reward accounting being accurate and not substantially inflated or deflated from reality are crucial.


## All trusted roles in the protocol

- OZ AccessManager is used where necessary, limiting some functionality to the system "governor" who initially is a multisig of core contributors/stakeholders, but intend on moving all controls to a decentralized governance model over time.

      

## Describe any novel or unique curve logic or mathematical models implemented in the contracts:

- We use novel math in our position/rewards accounting system. These lay on top of the UniswapV3 pool code and are adapted within the core libraries. 



## Running tests


```bash
git clone --recurse https://github.com/code-423n4/2024-10-ramses-exchange.git
cd 2024-10-ramses-exchange
npx hardhat compile
npx hardhat test
```

To run `uniswapV3CoreTests` gas profiling;
```bash
npx hardhat test test/uniswapV3CoreTests/UniswapV3Pool.gas.spec.ts
```



## Miscellaneous
Employees of Ramses Exchange and employees' family members are ineligible to participate in this audit.

Code4rena's rules cannot be overridden by the contents of this README. In case of doubt, please check with C4 staff.

