# Report


## Gas Optimizations


| |Issue|Instances|
|-|:-|:-:|
| [GAS-1](#GAS-1) | Use ERC721A instead ERC721 | 1 |
| [GAS-2](#GAS-2) | `a = a + b` is more gas effective than `a += b` for state variables (excluding arrays and mappings) | 24 |
| [GAS-3](#GAS-3) | Using bools for storage incurs overhead | 4 |
| [GAS-4](#GAS-4) | Cache array length outside of loop | 9 |
| [GAS-5](#GAS-5) | For Operations that will not overflow, you could use unchecked | 273 |
| [GAS-6](#GAS-6) | Use Custom Errors instead of Revert Strings to save Gas | 11 |
| [GAS-7](#GAS-7) | Avoid contract existence checks by using low level calls | 10 |
| [GAS-8](#GAS-8) | Functions guaranteed to revert when called by normal users can be marked `payable` | 2 |
| [GAS-9](#GAS-9) | `++i` costs less gas compared to `i++` or `i += 1` (same for `--i` vs `i--` or `i -= 1`) | 6 |
| [GAS-10](#GAS-10) | Using `private` rather than `public` for constants, saves gas | 1 |
| [GAS-11](#GAS-11) | Use shift right/left instead of division/multiplication if possible | 2 |
| [GAS-12](#GAS-12) | Splitting require() statements that use && saves gas | 1 |
| [GAS-13](#GAS-13) | Use of `this` instead of marking as `public` an `external` function | 1 |
| [GAS-14](#GAS-14) | Increments/decrements can be unchecked in for-loops | 13 |
| [GAS-15](#GAS-15) | Use != 0 instead of > 0 for unsigned integer comparison | 38 |
| [GAS-16](#GAS-16) | WETH address definition can be use directly | 1 |
### <a name="GAS-1"></a>[GAS-1] Use ERC721A instead ERC721
ERC721A standard, ERC721A is an improvement standard for ERC721 tokens. It was proposed by the Azuki team and used for developing their NFT collection. Compared with ERC721, ERC721A is a more gas-efficient standard to mint a lot of of NFTs simultaneously. It allows developers to mint multiple NFTs at the same gas price. This has been a great improvement due to Ethereum's sky-rocketing gas fee.

    Reference: https://nextrope.com/erc721-vs-erc721a-2/

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

5: import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

```

### <a name="GAS-2"></a>[GAS-2] `a = a + b` is more gas effective than `a += b` for state variables (excluding arrays and mappings)
This saves **16 gas per instance.**

*Instances (24)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

534:                     state.amountSpecifiedRemaining += step.amountOut.toInt256();

536:                 state.amountCalculated += (step.amountIn + step.feeAmount).toInt256();

544:                     state.protocolFee += uint128(delta);

551:                     state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);

645:                 if (state.protocolFee > 0) $.protocolFees.token0 += state.protocolFee;

650:                 if (state.protocolFee > 0) $.protocolFees.token1 += state.protocolFee;

714:                 if (uint128(pFees0) > 0) $.protocolFees.token0 += uint128(pFees0);

715:                 $.feeGrowthGlobal0X128 += FullMath.mulDiv(paid0 - pFees0, FixedPoint128.Q128, _liquidity);

719:                 if (uint128(pFees1) > 0) $.protocolFees.token1 += uint128(pFees1);

720:                 $.feeGrowthGlobal1X128 += FullMath.mulDiv(paid1 - pFees1, FixedPoint128.Q128, _liquidity);

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

99:                 self.tokensOwed0 += tokensOwed0;

100:                 self.tokensOwed1 += tokensOwed1;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

160:         tokenTotalSupplyByPeriod[period][token] += amount;

176:         tokenTotalSupplyByPeriod[period][token] += amount;

194:         tokenTotalSupplyByPeriod[period][token] += amount;

221:             reward += periodEarned(

555:             periodClaimedAmount[period][_positionHash][token] += _reward;

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

237:             position.tokensOwed0 += uint128(

244:             position.tokensOwed1 += uint128(

257:             position.liquidity += liquidity;

296:             position.tokensOwed0 +=

305:             position.tokensOwed1 +=

350:                 tokensOwed0 += uint128(

357:                 tokensOwed1 += uint128(

```

### <a name="GAS-3"></a>[GAS-3] Using bools for storage incurs overhead
Use uint256(1) and uint256(2) for true/false to avoid a Gwarmaccess (100 gas), and to avoid Gsset (20000 gas) when changing from ‘false’ to ‘true’, after having been ‘true’ in the past. See [source](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/58f635312aa21f947cae5f8578638a85aa2519f5/contracts/security/ReentrancyGuard.sol#L23-L27).

*Instances (4)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

27:     bool public isTokenLive;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

24:     bool internal _unlocked;

40:     mapping(uint256 => mapping(bytes32 => bool)) internal periodAmountsWritten;

57:     mapping(address => bool) public isReward;

```

### <a name="GAS-4"></a>[GAS-4] Cache array length outside of loop
If not cached, the solidity compiler will always read the length of the array during each iteration. That is, if it is a storage array, this is an extra sload operation (100 additional extra gas for each iteration except for the first) and if it is a memory array, this is an extra mload operation (3 additional gas for each iteration except for the first).

*Instances (9)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

139:         for (uint i; i < pools.length; i++) {

152:         for (uint i; i < pools.length; i++) {

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

324:             for (uint256 i = 0; i < secondsAgos.length; i++) {

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

104:         for (uint256 i; i < rewards.length; i++) {

366:         for (uint256 i = 0; i < tokens.length; ++i) {

402:         for (uint256 i = 0; i < tokens.length; ++i) {

509:         for (uint256 i = 0; i < tokens.length; ++i) {

576:             for (uint256 i; i < rewards.length; ++i) {

583:             for (uint256 i = idx; i < rewards.length - 1; ++i) {

```

### <a name="GAS-5"></a>[GAS-5] For Operations that will not overflow, you could use unchecked

*Instances (273)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

4: import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';

5: import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';

6: import {IRamsesV3Pool} from './interfaces/IRamsesV3Pool.sol';

7: import {AccessManaged} from '@openzeppelin/contracts/access/manager/AccessManaged.sol';

139:         for (uint i; i < pools.length; i++) {

152:         for (uint i; i < pools.length; i++) {

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

4: import {IRamsesV3PoolActions, IRamsesV3PoolDerivedState, IRamsesV3PoolOwnerActions, IRamsesV3Pool} from './interfaces/IRamsesV3Pool.sol';

6: import {SafeCast} from './libraries/SafeCast.sol';

7: import {Tick} from './libraries/Tick.sol';

8: import {TickBitmap} from './libraries/TickBitmap.sol';

9: import {Position} from './libraries/Position.sol';

10: import {Oracle} from './libraries/Oracle.sol';

12: import {FullMath} from './libraries/FullMath.sol';

13: import {FixedPoint128} from './libraries/FixedPoint128.sol';

14: import {TransferHelper} from './libraries/TransferHelper.sol';

15: import {TickMath} from './libraries/TickMath.sol';

16: import {SqrtPriceMath} from './libraries/SqrtPriceMath.sol';

17: import {SwapMath} from './libraries/SwapMath.sol';

19: import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';

20: import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';

21: import {IERC20Minimal} from './interfaces/IERC20Minimal.sol';

22: import {IUniswapV3MintCallback} from './interfaces/callback/IUniswapV3MintCallback.sol';

23: import {IUniswapV3SwapCallback} from './interfaces/callback/IUniswapV3SwapCallback.sol';

24: import {IUniswapV3FlashCallback} from './interfaces/callback/IUniswapV3FlashCallback.sol';

26: import {ProtocolActions} from './libraries/ProtocolActions.sol';

27: import {PoolStorage, Slot0, Observation, PositionInfo, TickInfo, PeriodInfo, ProtocolFees} from './libraries/PoolStorage.sol';

28: import {IERC20} from '@openzeppelin/contracts/interfaces/IERC20.sol';

252:                     ? liquidityBefore - uint128(-params.liquidityDelta)

253:                     : liquidityBefore + uint128(params.liquidityDelta);

294:         if (amount0 > 0 && balance0Before + amount0 > balance0()) revert M0();

295:         if (amount1 > 0 && balance1Before + amount1 > balance1()) revert M1();

319:                 position.tokensOwed0 -= amount0;

323:                 position.tokensOwed1 -= amount1;

345:                     liquidityDelta: -int256(uint256(amount)).toInt128()

349:             amount0 = uint256(-amount0Int);

350:             amount1 = uint256(-amount1Int);

354:                     position.tokensOwed0 + uint128(amount0),

355:                     position.tokensOwed1 + uint128(amount1)

429:         uint256 period = _blockTimestamp() / 1 weeks;

529:                     state.amountSpecifiedRemaining -= (step.amountIn + step.feeAmount).toInt256();

531:                 state.amountCalculated -= step.amountOut.toInt256();

534:                     state.amountSpecifiedRemaining += step.amountOut.toInt256();

536:                 state.amountCalculated += (step.amountIn + step.feeAmount).toInt256();

542:                     uint256 delta = (step.feeAmount * cache.feeProtocol) / 100;

543:                     step.feeAmount -= delta;

544:                     state.protocolFee += uint128(delta);

551:                     state.feeGrowthGlobalX128 += FullMath.mulDiv(step.feeAmount, FixedPoint128.Q128, state.liquidity);

598:                         if (zeroForOne) liquidityNet = -liquidityNet;

602:                         ? state.liquidity - uint128(-liquidityNet)

603:                         : state.liquidity + uint128(liquidityNet);

607:                     state.tick = zeroForOne ? step.tickNext - 1 : step.tickNext;

645:                 if (state.protocolFee > 0) $.protocolFees.token0 += state.protocolFee;

650:                 if (state.protocolFee > 0) $.protocolFees.token1 += state.protocolFee;

656:                 ? (amountSpecified - state.amountSpecifiedRemaining, state.amountCalculated)

657:                 : (state.amountCalculated, amountSpecified - state.amountSpecifiedRemaining);

663:                 if (amount1 < 0) TransferHelper.safeTransfer(token1, recipient, uint256(-amount1));

668:             if (balance0Before + uint256(amount0) > balance0()) revert IIA();

671:                 if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));

676:             if (balance1Before + uint256(amount1) > balance1()) revert IIA();

703:         if (balance0Before + fee0 > balance0After) revert F0();

704:         if (balance1Before + fee1 > balance1After) revert F1();

708:             uint256 paid0 = balance0After - balance0Before;

709:             uint256 paid1 = balance1After - balance1Before;

713:                 uint256 pFees0 = feeProtocol == 0 ? 0 : paid0 / feeProtocol;

714:                 if (uint128(pFees0) > 0) $.protocolFees.token0 += uint128(pFees0);

715:                 $.feeGrowthGlobal0X128 += FullMath.mulDiv(paid0 - pFees0, FixedPoint128.Q128, _liquidity);

718:                 uint256 pFees1 = feeProtocol == 0 ? 0 : paid1 / feeProtocol;

719:                 if (uint128(pFees1) > 0) $.protocolFees.token1 += uint128(pFees1);

720:                 $.feeGrowthGlobal1X128 += FullMath.mulDiv(paid1 - pFees1, FixedPoint128.Q128, _liquidity);

755:         if ((_blockTimestamp() / 1 weeks) != _lastPeriod) {

757:             uint256 period = _blockTimestamp() / 1 weeks;

789:         for (uint256 i = 0; i < slotsLength; ++i) {

```

```solidity
File: ./contracts/CL/core/RamsesV3PoolDeployer.sol

4: import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';

6: import {RamsesV3Pool} from './RamsesV3Pool.sol';

7: import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

4: import {PoolStorage, Observation, TickInfo, Slot0} from './PoolStorage.sol';

31:             uint32 delta = blockTimestamp - last.blockTimestamp;

35:                     tickCumulative: last.tickCumulative + int56(tick) * int56(uint56(delta)),

36:                     secondsPerLiquidityCumulativeX128: last.secondsPerLiquidityCumulativeX128 +

37:                         ((uint160(delta) << 128) / (liquidity > 0 ? liquidity : 1)),

90:             if (cardinalityNext > cardinality && index == (cardinality - 1)) {

96:             indexUpdated = (index + 1) % cardinalityUpdated;

113:             for (uint16 i = current; i < next; i++) self[i].blockTimestamp = 1;

129:             uint256 aAdjusted = a > time ? a : a + 2 ** 32;

130:             uint256 bAdjusted = b > time ? b : b + 2 ** 32;

156:             uint256 l = (index + 1) % cardinality; 

158:             uint256 r = l + cardinality - 1; 

161:                 i = (l + r) / 2;

167:                     l = i + 1;

171:                 atOrAfter = self[(i + 1) % cardinality];

178:                 if (!targetAtOrAfter) r = i - 1;

179:                 else l = i + 1;

221:             beforeOrAt = self[(index + 1) % cardinality];

261:             uint32 target = time - secondsAgo;

281:                 uint32 observationTimeDelta = atOrAfter.blockTimestamp - beforeOrAt.blockTimestamp;

282:                 uint32 targetDelta = target - beforeOrAt.blockTimestamp;

284:                     beforeOrAt.tickCumulative +

285:                         ((atOrAfter.tickCumulative - beforeOrAt.tickCumulative) / int56(uint56(observationTimeDelta))) *

287:                     beforeOrAt.secondsPerLiquidityCumulativeX128 +

290:                                 atOrAfter.secondsPerLiquidityCumulativeX128 -

292:                             ) * targetDelta) / observationTimeDelta

324:             for (uint256 i = 0; i < secondsAgos.length; i++) {

347:             uint32 delta = uint32(period) * 1 weeks - 1 - last.blockTimestamp;

350:                 last.secondsPerLiquidityCumulativeX128 +

351:                 ((uint160(delta) << 128) / ($.liquidity > 0 ? $.liquidity : 1));

354:                 blockTimestamp: uint32(period) * 1 weeks - 1,

355:                 tickCumulative: last.tickCumulative + int56($.slot0.tick) * int56(uint56(delta)),

431:                     snapshot.tickCumulativeLower - snapshot.tickCumulativeUpper,

432:                     snapshot.secondsPerLiquidityOutsideLowerX128 - snapshot.secondsPerLiquidityOutsideUpperX128,

433:                     snapshot.secondsOutsideLower - snapshot.secondsOutsideUpper

448:                     cache.tickCumulative - snapshot.tickCumulativeLower - snapshot.tickCumulativeUpper,

449:                     cache.secondsPerLiquidityCumulativeX128 -

450:                         snapshot.secondsPerLiquidityOutsideLowerX128 -

452:                     cache.time - snapshot.secondsOutsideLower - snapshot.secondsOutsideUpper

456:                     snapshot.tickCumulativeUpper - snapshot.tickCumulativeLower,

457:                     snapshot.secondsPerLiquidityOutsideUpperX128 - snapshot.secondsPerLiquidityOutsideLowerX128,

458:                     snapshot.secondsOutsideUpper - snapshot.secondsOutsideLower

516:                 return snapshot.secondsPerLiquidityOutsideLowerX128 - snapshot.secondsPerLiquidityOutsideUpperX128;

523:                     if (cache.time >= currentPeriod * 1 weeks + 1 weeks) {

524:                         cache.time = uint32(currentPeriod * 1 weeks + 1 weeks - 1);

542:                     cache.secondsPerLiquidityCumulativeX128 -

543:                     snapshot.secondsPerLiquidityOutsideLowerX128 -

546:                 return snapshot.secondsPerLiquidityOutsideUpperX128 - snapshot.secondsPerLiquidityOutsideLowerX128;

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

4: import {FullMath} from './FullMath.sol';

5: import {FixedPoint128} from './FixedPoint128.sol';

6: import {FixedPoint32} from './FixedPoint32.sol';

7: import {FixedPoint96} from './FixedPoint96.sol';

8: import {Oracle} from './Oracle.sol';

9: import {SafeCast} from './SafeCast.sol';

10: import {Tick} from './Tick.sol';

11: import {TickBitmap} from './TickBitmap.sol';

13: import {PoolStorage, PositionInfo, PositionCheckpoint, RewardInfo} from './PoolStorage.sol';

78:                 ? liquidity - uint128(-liquidityDelta)

79:                 : liquidity + uint128(liquidityDelta);

87:                 FullMath.mulDiv(feeGrowthInside0X128 - self.feeGrowthInside0LastX128, liquidity, FixedPoint128.Q128)

90:                 FullMath.mulDiv(feeGrowthInside1X128 - self.feeGrowthInside1LastX128, liquidity, FixedPoint128.Q128)

99:                 self.tokensOwed0 += tokensOwed0;

100:                 self.tokensOwed1 += tokensOwed1;

106:         if (checkpointLength == 0 || $.positionCheckpoints[_positionHash][checkpointLength - 1].period != period) {

109:             $.positionCheckpoints[_positionHash][checkpointLength - 1].liquidity = liquidityNext;

117:         secondsPerLiquidityPeriodIntX128 -= secondsPerLiquidityPeriodStartX128;

140:                     uint256(uint128(-liquidityDelta)),

147:             ? self.periodRewardInfo[period].secondsDebtX96 + secondsDebtDeltaX96 /// @dev can't overflow since each period is way less than uint31

148:             : self.periodRewardInfo[period].secondsDebtX96 - secondsDebtDeltaX96;

174:             checkpointIndex = checkpointLength - 1;

186:                 uint256 center = upper - (upper - lower) / 2;

194:                     upper = center - 1;

254:             int160(secondsPerLiquidityInsideX128) - secondsPerLiquidityPeriodStartX128

266:                 ? periodSecondsInsideX96 + uint256(-secondsDebtX96)

267:                 : periodSecondsInsideX96 - uint256(secondsDebtX96);

273:         if (periodSecondsInsideX96 > 1 weeks * FixedPoint96.Q96) {

302:         uint256 period = params._blockTimestamp / 1 weeks;

326:                 currentTick, /// @dev use `currentTick` consistently

335:                 currentTick, /// @dev use `currentTick` consistently

348:                 currentTick, /// @dev use `currentTick` consistently

373:             currentTick, /// @dev use `currentTick` consistently

440:             position.periodRewardInfo[secondsInRangeParams.period].secondsDebtX96 = -int256(periodSecondsInsideX96);

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

4: import {SafeCast} from './SafeCast.sol';

6: import {TickMath} from './TickMath.sol';

8: import {TickInfo} from './PoolStorage.sol';

24:             int24 minTick = (TickMath.MIN_TICK / tickSpacing) * tickSpacing;

25:             int24 maxTick = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;

26:             uint24 numTicks = uint24((maxTick - minTick) / tickSpacing) + 1;

27:             return type(uint128).max / numTicks;

59:                 feeGrowthBelow0X128 = feeGrowthGlobal0X128 - lower.feeGrowthOutside0X128;

60:                 feeGrowthBelow1X128 = feeGrowthGlobal1X128 - lower.feeGrowthOutside1X128;

70:                 feeGrowthAbove0X128 = feeGrowthGlobal0X128 - upper.feeGrowthOutside0X128;

71:                 feeGrowthAbove1X128 = feeGrowthGlobal1X128 - upper.feeGrowthOutside1X128;

74:             feeGrowthInside0X128 = feeGrowthGlobal0X128 - feeGrowthBelow0X128 - feeGrowthAbove0X128;

75:             feeGrowthInside1X128 = feeGrowthGlobal1X128 - feeGrowthBelow1X128 - feeGrowthAbove1X128;

109:             ? liquidityGrossBefore - uint128(-liquidityDelta)

110:             : liquidityGrossBefore + uint128(liquidityDelta);

131:         info.liquidityNet = upper ? info.liquidityNet - liquidityDelta : info.liquidityNet + liquidityDelta;

165:             uint256 period = time / 1 weeks;

167:             info.feeGrowthOutside0X128 = feeGrowthGlobal0X128 - info.feeGrowthOutside0X128;

168:             info.feeGrowthOutside1X128 = feeGrowthGlobal1X128 - info.feeGrowthOutside1X128;

170:                 secondsPerLiquidityCumulativeX128 -

172:             info.tickCumulativeOutside = tickCumulative - info.tickCumulativeOutside;

173:             info.secondsOutside = time - info.secondsOutside;

180:                     secondsPerLiquidityCumulativeX128 -

185:                     secondsPerLiquidityCumulativeX128 -

```

```solidity
File: ./contracts/CL/gauge/ClGaugeFactory.sol

4: import "./interfaces/IClGaugeFactory.sol";

5: import "./GaugeV3.sol";

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

4: import "./interfaces/IFeeCollector.sol";

6: import "../../interfaces/IVoter.sol";

7: import "../../interfaces/IFeeDistributor.sol";

9: import "../core/interfaces/IRamsesV3Pool.sol";

11: import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

13: import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

123:             amount0Treasury = (amount0 * _treasuryFees) / BASIS;

124:             amount1Treasury = (amount1 * _treasuryFees) / BASIS;

126:             amount0 = amount0 - amount0Treasury;

127:             amount1 = amount1 - amount1Treasury;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

4: import "./interfaces/IGaugeV3.sol";

5: import "../periphery/interfaces/INonfungiblePositionManager.sol";

6: import "./interfaces/IFeeCollector.sol";

7: import "../core/libraries/FullMath.sol";

9: import "../core/interfaces/IRamsesV3Pool.sol";

11: import "../core/libraries/PoolStorage.sol";

13: import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

14: import "@openzeppelin/contracts/utils/math/Math.sol";

16: import "../../interfaces/IVoter.sol";

22:     uint256 internal constant PRECISION = 10 ** 18;

87:         firstPeriod = _blockTimestamp() / WEEK;

104:         for (uint256 i; i < rewards.length; i++) {

115:         uint256 period = _blockTimestamp() / WEEK;

116:         uint256 remainingTime = ((period + 1) * WEEK) - _blockTimestamp();

117:         return (tokenTotalSupplyByPeriod[period][token] * remainingTime) / WEEK;

122:         uint256 period = _blockTimestamp() / WEEK;

123:         return (tokenTotalSupplyByPeriod[period][token] / WEEK);

153:         uint256 period = _blockTimestamp() / WEEK;

159:         amount = balanceAfter - balanceBefore;

160:         tokenTotalSupplyByPeriod[period][token] += amount;

170:         uint256 period = (_blockTimestamp() / WEEK) + 1;

175:         amount = balanceAfter - balanceBefore;

176:         tokenTotalSupplyByPeriod[period][token] += amount;

188:         require(period > _blockTimestamp() / WEEK, "Retro");

193:         amount = balanceAfter - balanceBefore;

194:         tokenTotalSupplyByPeriod[period][token] += amount;

219:         uint256 currentPeriod = _blockTimestamp() / WEEK;

220:         for (uint256 period = lastClaim; period <= currentPeriod; ++period) {

221:             reward += periodEarned(

311:             if (period < _blockTimestamp() / WEEK && caching) {

329:             amount -= claimed;

366:         for (uint256 i = 0; i < tokens.length; ++i) {

367:             if (period < _blockTimestamp() / WEEK) {

402:         for (uint256 i = 0; i < tokens.length; ++i) {

403:             if (period < _blockTimestamp() / WEEK) {

426:         for (uint256 i = 0; i < length; ++i) {

507:         uint256 currentPeriod = _blockTimestamp() / WEEK;

509:         for (uint256 i = 0; i < tokens.length; ++i) {

517:                 ++period

530:             lastClaimByToken[tokens[i]][_positionHash] = currentPeriod - 1;

555:             periodClaimedAmount[period][_positionHash][token] += _reward;

576:             for (uint256 i; i < rewards.length; ++i) {

583:             for (uint256 i = idx; i < rewards.length - 1; ++i) {

584:                 rewards[i] = rewards[i + 1];

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

5: import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

6: import {ERC721Enumerable, IERC165} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';

7: import {Multicall} from '@openzeppelin/contracts/utils/Multicall.sol';

9: import {IRamsesV3Pool} from '../core/interfaces/IRamsesV3Pool.sol';

10: import {FixedPoint128} from '../core/libraries/FixedPoint128.sol';

11: import {FullMath} from '../core/libraries/FullMath.sol';

13: import {INonfungiblePositionManager, IERC721, IERC721Metadata} from './interfaces/INonfungiblePositionManager.sol';

14: import {INonfungibleTokenPositionDescriptor} from './interfaces/INonfungibleTokenPositionDescriptor.sol';

15: import {PositionKey} from './libraries/PositionKey.sol';

16: import {PoolAddress} from './libraries/PoolAddress.sol';

17: import {LiquidityManagement} from './base/LiquidityManagement.sol';

18: import {PeripheryImmutableState} from './base/PeripheryImmutableState.sol';

19: import {PeripheryValidation} from './base/PeripheryValidation.sol';

20: import {PoolInitializer} from './base/PoolInitializer.sol';

22: import {IGaugeV3} from '../gauge/interfaces/IGaugeV3.sol';

23: import {IVoter} from '../../interfaces/IVoter.sol';

78:     ) ERC721('Ramses V3 Positions NFT', 'RAM-V3-NFP') PeripheryImmutableState(_deployer, _WETH9) {

124:             _poolIds[pool] = (poolId = _nextPoolId++);

141:             tokenId = _nextId++;

237:             position.tokensOwed0 += uint128(

239:                     feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,

244:             position.tokensOwed1 += uint128(

246:                     feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,

257:             position.liquidity += liquidity;

296:             position.tokensOwed0 +=

297:                 uint128(amount0) +

300:                         feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,

305:             position.tokensOwed1 +=

306:                 uint128(amount1) +

309:                         feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,

320:             position.liquidity = positionLiquidity - params.liquidity;

350:                 tokensOwed0 += uint128(

352:                         feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,

357:                 tokensOwed1 += uint128(

359:                         feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,

389:             (position.tokensOwed0, position.tokensOwed1) = (tokensOwed0 - amount0Collect, tokensOwed1 - amount1Collect);

```

### <a name="GAS-6"></a>[GAS-6] Use Custom Errors instead of Revert Strings to save Gas
Custom errors are available from solidity version 0.8.4. Custom errors save [**~50 gas**](https://gist.github.com/IllIllI000/ad1bd0d29a0101b25e57c293b4b0c746) each time they're hit by [avoiding having to allocate and store the revert string](https://blog.soliditylang.org/2021/04/21/custom-errors/#errors-in-depth). Not defining the strings also save deployment gas

Additionally, custom errors can be used inside and outside of contracts (including interfaces and libraries).

Source: <https://blog.soliditylang.org/2021/04/21/custom-errors/>:

> Starting from [Solidity v0.8.4](https://github.com/ethereum/solidity/releases/tag/v0.8.4), there is a convenient and gas-efficient way to explain to users why an operation failed through the use of custom errors. Until now, you could already use strings to give more information about failures (e.g., `revert("Insufficient funds.");`), but they are rather expensive, especially when it comes to deploy cost, and it is difficult to use dynamic information in them.

Consider replacing **all revert strings** with custom errors in the solution, and particularly those that have multiple occurrences:

*Instances (11)*:
```solidity
File: ./contracts/CL/gauge/ClGaugeFactory.sol

40:         require(msg.sender == voter, "AUTH");

41:         require(getGauge[pool] == address(0), "GE");

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

62:         require(_unlocked, "LOK");

151:         require(isReward[token], "!Whitelisted");

169:         require(isReward[token], "!Whitelisted");

187:         require(isReward[token], "!Whitelisted");

188:         require(period > _blockTimestamp() / WEEK, "Retro");

394:         require(msg.sender == owner, "Not authorized");

489:         require(msg.sender == owner, "Not authorized");

563:         require(msg.sender == voter, "!AUTH");

572:         require(msg.sender == voter, "!AUTH");

```

### <a name="GAS-7"></a>[GAS-7] Avoid contract existence checks by using low level calls
Prior to 0.8.10 the compiler inserted extra code, including `EXTCODESIZE` (**100 gas**), to check for contract existence for external function calls. In more recent solidity versions, the compiler will not insert these checks if the external call has a return value. Similar behavior can be achieved in earlier versions by using low-level calls, since low level calls never check for contract existence

*Instances (10)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

89:         return IERC20(token0).balanceOf(address(this));

95:         return IERC20(token1).balanceOf(address(this));

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

114:         uint256 amount0 = token0.balanceOf(address(this));

115:         uint256 amount1 = token1.balanceOf(address(this));

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

155:         uint256 balanceBefore = IERC20(token).balanceOf(address(this));

157:         uint256 balanceAfter = IERC20(token).balanceOf(address(this));

171:         uint256 balanceBefore = IERC20(token).balanceOf(address(this));

173:         uint256 balanceAfter = IERC20(token).balanceOf(address(this));

189:         uint256 balanceBefore = IERC20(token).balanceOf(address(this));

191:         uint256 balanceAfter = IERC20(token).balanceOf(address(this));

```

### <a name="GAS-8"></a>[GAS-8] Functions guaranteed to revert when called by normal users can be marked `payable`
If a function modifier such as `onlyOwner` is used, the function will revert if a normal user tries to pay the function. Marking the function as `payable` will lower the gas cost for legitimate callers because the compiler will not include checks for whether a payment was provided.

*Instances (2)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

50:     function setTreasury(address _treasury) external override onlyTreasury {

67:     function setIsLive(bool status) external onlyTreasury {

```

### <a name="GAS-9"></a>[GAS-9] `++i` costs less gas compared to `i++` or `i += 1` (same for `--i` vs `i--` or `i -= 1`)
Pre-increments and pre-decrements are cheaper.

For a `uint256 i` variable, the following is true with the Optimizer enabled at 10k:

**Increment:**

- `i += 1` is the most expensive form
- `i++` costs 6 gas less than `i += 1`
- `++i` costs 5 gas less than `i++` (11 gas less than `i += 1`)

**Decrement:**

- `i -= 1` is the most expensive form
- `i--` costs 11 gas less than `i -= 1`
- `--i` costs 5 gas less than `i--` (16 gas less than `i -= 1`)

Note that post-increments (or post-decrements) return the old value before incrementing or decrementing, hence the name *post-increment*:

```solidity
uint i = 1;  
uint j = 2;
require(j == i++, "This will be false as i is incremented after the comparison");
```
  
However, pre-increments (or pre-decrements) return the new value:
  
```solidity
uint i = 1;  
uint j = 2;
require(j == ++i, "This will be true as i is incremented before the comparison");
```

In the pre-increment case, the compiler has to create a temporary variable (when used) for returning `1` instead of `2`.

Consider using pre-increments and pre-decrements where they are relevant (meaning: not where post-increments/decrements logic are relevant).

*Saves 5 gas per instance*

*Instances (6)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

139:         for (uint i; i < pools.length; i++) {

152:         for (uint i; i < pools.length; i++) {

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

113:             for (uint16 i = current; i < next; i++) self[i].blockTimestamp = 1;

324:             for (uint256 i = 0; i < secondsAgos.length; i++) {

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

104:         for (uint256 i; i < rewards.length; i++) {

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

141:             tokenId = _nextId++;

```

### <a name="GAS-10"></a>[GAS-10] Using `private` rather than `public` for constants, saves gas
If needed, the values can be read from the verified contract source code, or if there are multiple values there can be a single getter function that [returns a tuple](https://github.com/code-423n4/2022-08-frax/blob/90f55a9ce4e25bceed3a74290b854341d8de6afa/src/contracts/FraxlendPair.sol#L156-L178) of the values of all currently-public constants. Saves **3406-3606 gas** in deployment gas due to the compiler not having to create non-payable getter functions for deployment calldata, not having to store the bytes of the value outside of where it's used, and not adding another entry to the method ID table

*Instances (1)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

21:     uint256 public constant BASIS = 10_000;

```

### <a name="GAS-11"></a>[GAS-11] Use shift right/left instead of division/multiplication if possible
While the `DIV` / `MUL` opcode uses 5 gas, the `SHR` / `SHL` opcode only uses 3 gas. Furthermore, beware that Solidity's division operation also includes a division-by-0 prevention which is bypassed using shifting. Eventually, overflow checks are never performed for shift operations as they are done for arithmetic operations. Instead, the result is always truncated, so the calculation can be unchecked in Solidity version `0.8+`
- Use `>> 1` instead of `/ 2`
- Use `>> 2` instead of `/ 4`
- Use `<< 3` instead of `* 8`
- ...
- Use `>> 5` instead of `/ 2^5 == / 32`
- Use `<< 6` instead of `* 2^6 == * 64`

TL;DR:
- Shifting left by N is like multiplying by 2^N (Each bits to the left is an increased power of 2)
- Shifting right by N is like dividing by 2^N (Each bits to the right is a decreased power of 2)

*Saves around 2 gas + 20 for unchecked per instance*

*Instances (2)*:
```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

161:                 i = (l + r) / 2;

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

186:                 uint256 center = upper - (upper - lower) / 2;

```

### <a name="GAS-12"></a>[GAS-12] Splitting require() statements that use && saves gas

*Instances (1)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

111:         require(tickSpacing > 0 && tickSpacing < 16384, 'TS');

```

### <a name="GAS-13"></a>[GAS-13] Use of `this` instead of marking as `public` an `external` function
Using `this.` is like making an expensive external call. Consider marking the called function as public

*Saves around 2000 gas per instance*

*Instances (1)*:
```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

264:                 this.cachePeriodEarned,

```

### <a name="GAS-14"></a>[GAS-14] Increments/decrements can be unchecked in for-loops
In Solidity 0.8+, there's a default overflow check on unsigned integers. It's possible to uncheck this in for-loops and save some gas at each iteration, but at the cost of some code readability, as this uncheck cannot be made inline.

[ethereum/solidity#10695](https://github.com/ethereum/solidity/issues/10695)

The change would be:

```diff
- for (uint256 i; i < numIterations; i++) {
+ for (uint256 i; i < numIterations;) {
 // ...  
+   unchecked { ++i; }
}  
```

These save around **25 gas saved** per instance.

The same can be applied with decrements (which should use `break` when `i == 0`).

The risk of overflow is non-existent for `uint256`.

*Instances (13)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

139:         for (uint i; i < pools.length; i++) {

152:         for (uint i; i < pools.length; i++) {

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

789:         for (uint256 i = 0; i < slotsLength; ++i) {

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

113:             for (uint16 i = current; i < next; i++) self[i].blockTimestamp = 1;

324:             for (uint256 i = 0; i < secondsAgos.length; i++) {

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

104:         for (uint256 i; i < rewards.length; i++) {

220:         for (uint256 period = lastClaim; period <= currentPeriod; ++period) {

366:         for (uint256 i = 0; i < tokens.length; ++i) {

402:         for (uint256 i = 0; i < tokens.length; ++i) {

426:         for (uint256 i = 0; i < length; ++i) {

509:         for (uint256 i = 0; i < tokens.length; ++i) {

576:             for (uint256 i; i < rewards.length; ++i) {

583:             for (uint256 i = idx; i < rewards.length - 1; ++i) {

```

### <a name="GAS-15"></a>[GAS-15] Use != 0 instead of > 0 for unsigned integer comparison

*Instances (38)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

100:         if (sqrtPriceX96 > 0) {

111:         require(tickSpacing > 0 && tickSpacing < 16384, 'TS');

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

275:         require(amount > 0);

291:         if (amount0 > 0) balance0Before = balance0();

292:         if (amount1 > 0) balance1Before = balance1();

294:         if (amount0 > 0 && balance0Before + amount0 > balance0()) revert M0();

295:         if (amount1 > 0 && balance1Before + amount1 > balance1()) revert M1();

318:             if (amount0 > 0) {

322:             if (amount1 > 0) {

352:             if (amount0 > 0 || amount1 > 0) {

479:         bool exactInput = amountSpecified > 0;

540:             if (cache.feeProtocol > 0) {

549:             if (state.liquidity > 0) {

645:                 if (state.protocolFee > 0) $.protocolFees.token0 += state.protocolFee;

650:                 if (state.protocolFee > 0) $.protocolFees.token1 += state.protocolFee;

671:                 if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));

695:         if (amount0 > 0) TransferHelper.safeTransfer(token0, recipient, amount0);

696:         if (amount1 > 0) TransferHelper.safeTransfer(token1, recipient, amount1);

712:             if (paid0 > 0) {

714:                 if (uint128(pFees0) > 0) $.protocolFees.token0 += uint128(pFees0);

717:             if (paid1 > 0) {

719:                 if (uint128(pFees1) > 0) $.protocolFees.token1 += uint128(pFees1);

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

37:                         ((uint160(delta) << 128) / (liquidity > 0 ? liquidity : 1)),

351:                 ((uint160(delta) << 128) / ($.liquidity > 0 ? $.liquidity : 1));

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

97:             if (tokensOwed0 > 0 || tokensOwed1 > 0) {

125:         int256 secondsDebtDeltaX96 = liquidityDelta > 0

146:         self.periodRewardInfo[period].secondsDebtX96 = liquidityDelta > 0

437:         if (position.liquidity > 0) {

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

131:             if (amount0Treasury > 0)

133:             if (amount1Treasury > 0)

138:         if (amount0 > 0) {

142:         if (amount1 > 0) {

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

554:         if (_reward > 0) {

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

274:         require(params.liquidity > 0);

284:         if (amount0 < params.amount0Min || amount1 < params.amount1Min) revert CheckSlippage();

330:         require(params.amount0Max > 0 || params.amount1Max > 0);

343:         if (position.liquidity > 0) {

398:         if (position.liquidity > 0 || position.tokensOwed0 > 0 || position.tokensOwed1 > 0) revert NotCleared();

```

### <a name="GAS-16"></a>[GAS-16] WETH address definition can be use directly
WETH is a wrap Ether contract with a specific address in the Ethereum network, giving the option to define it may cause false recognition, it is healthier to define it directly.

    Advantages of defining a specific contract directly:
    
    It saves gas,
    Prevents incorrect argument definition,
    Prevents execution on a different chain and re-signature issues,
    WETH Address : 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

78:     ) ERC721('Ramses V3 Positions NFT', 'RAM-V3-NFP') PeripheryImmutableState(_deployer, _WETH9) {

```


## Non Critical Issues


| |Issue|Instances|
|-|:-|:-:|
| [NC-1](#NC-1) | abicoder v2 is enabled by default | 1 |
| [NC-2](#NC-2) | Use `string.concat()` or `bytes.concat()` instead of `abi.encodePacked` | 3 |
| [NC-3](#NC-3) | `constant`s should be defined rather than using magic numbers | 26 |
| [NC-4](#NC-4) | Control structures do not follow the Solidity Style Guide | 73 |
| [NC-5](#NC-5) | Dangerous `while(true)` loop | 1 |
| [NC-6](#NC-6) | Functions should not be longer than 50 lines | 45 |
| [NC-7](#NC-7) | Change uint to uint256 | 2 |
| [NC-8](#NC-8) | Use a `modifier` instead of a `require/if` statement for a special `msg.sender` actor | 11 |
| [NC-9](#NC-9) | Consider using named mappings | 15 |
| [NC-10](#NC-10) | Numeric values having to do with time should use time units for readability | 1 |
| [NC-11](#NC-11) | Take advantage of Custom Error's return value property | 22 |
| [NC-12](#NC-12) | Use scientific notation (e.g. `1e18`) rather than exponentiation (e.g. `10**18`) | 1 |
| [NC-13](#NC-13) | Avoid the use of sensitive terms | 3 |
| [NC-14](#NC-14) | Strings should use double quotes rather than single quotes | 4 |
| [NC-15](#NC-15) | Some require descriptions are not clear | 2 |
| [NC-16](#NC-16) | Use Underscores for Number Literals (add an underscore every 3 digits) | 7 |
| [NC-17](#NC-17) | Constants should be defined rather than using magic numbers | 2 |
| [NC-18](#NC-18) | Variables need not be initialized to zero | 7 |
### <a name="NC-1"></a>[NC-1] abicoder v2 is enabled by default
abicoder v2 is considered non-experimental as of Solidity 0.6.0 and it is enabled by default starting with Solidity 0.8.0. Therefore, there is no need to write.

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

3: pragma abicoder v2;

```

### <a name="NC-2"></a>[NC-2] Use `string.concat()` or `bytes.concat()` instead of `abi.encodePacked`
Solidity version 0.8.4 introduces `bytes.concat()` (vs `abi.encodePacked(<bytes>,<bytes>)`)

Solidity version 0.8.12 introduces `string.concat()` (vs `abi.encodePacked(<str>,<str>), which catches concatenation errors (in the event of a `bytes` data mixed in the concatenation)`)

*Instances (3)*:
```solidity
File: ./contracts/CL/core/RamsesV3PoolDeployer.sol

23:         pool = address(new RamsesV3Pool{salt: keccak256(abi.encodePacked(token0, token1, tickSpacing))}());

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

34:         return keccak256(abi.encodePacked(owner, index, tickLower, tickUpper));

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

143:         return keccak256(abi.encodePacked(owner, index, tickLower, tickUpper));

```

### <a name="NC-3"></a>[NC-3] `constant`s should be defined rather than using magic numbers
Even [assembly](https://github.com/code-423n4/2022-05-opensea-seaport/blob/9d7ce4d08bf3c3010304a0476a785c70c0e90ae7/contracts/lib/TokenTransferrer.sol#L35-L39) can benefit from using readable constants instead of hex/numeric literals

*Instances (26)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

40:         tickSpacingInitialFee[1] = 100;

41:         emit TickSpacingEnabled(1, 100);

43:         tickSpacingInitialFee[5] = 250;

44:         emit TickSpacingEnabled(5, 250);

46:         tickSpacingInitialFee[10] = 500;

47:         emit TickSpacingEnabled(10, 500);

49:         tickSpacingInitialFee[50] = 3000;

50:         emit TickSpacingEnabled(50, 3000);

52:         tickSpacingInitialFee[100] = 10000;

53:         emit TickSpacingEnabled(100, 10000);

55:         tickSpacingInitialFee[200] = 20000;

56:         emit TickSpacingEnabled(200, 20000);

60:         feeProtocol = 80;

111:         require(tickSpacing > 0 && tickSpacing < 16384, 'TS');

120:         require(_feeProtocol <= 100, FTL());

128:         require(_feeProtocol <= 100, FTL());

138:         require(_feeProtocol <= 100, FTL());

154:             require(_feeProtocols[i] <= 100, FTL());

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

542:                     uint256 delta = (step.feeAmount * cache.feeProtocol) / 100;

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

37:                         ((uint160(delta) << 128) / (liquidity > 0 ? liquidity : 1)),

129:             uint256 aAdjusted = a > time ? a : a + 2 ** 32;

130:             uint256 bAdjusted = b > time ? b : b + 2 ** 32;

161:                 i = (l + r) / 2;

351:                 ((uint160(delta) << 128) / ($.liquidity > 0 ? $.liquidity : 1));

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

186:                 uint256 center = upper - (upper - lower) / 2;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

324:             WEEK << 96

```

### <a name="NC-4"></a>[NC-4] Control structures do not follow the Solidity Style Guide
See the [control structures](https://docs.soliditylang.org/en/latest/style-guide.html#control-structures) section of the Solidity Style Guide

*Instances (73)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

50:         if (!$.slot0.unlocked) revert LOK();

73:         if (tickLower >= tickUpper) revert TLU();

75:         if (tickLower < TickMath.MIN_TICK) revert TLM();

77:         if (tickUpper > TickMath.MAX_TICK) revert TUM();

147:         if (observationCardinalityNextOld != observationCardinalityNextNew)

155:         if ($.slot0.sqrtPriceX96 != 0) revert AI();

192:     function _modifyPosition(

193:         ModifyPositionParams memory params

276:         (, int256 amount0Int, int256 amount1Int) = _modifyPosition(

291:         if (amount0 > 0) balance0Before = balance0();

292:         if (amount1 > 0) balance1Before = balance1();

294:         if (amount0 > 0 && balance0Before + amount0 > balance0()) revert M0();

295:         if (amount1 > 0 && balance1Before + amount1 > balance1()) revert M1();

339:             (PositionInfo storage position, int256 amount0Int, int256 amount1Int) = _modifyPosition(

383:         int256 amountSpecifiedRemaining;

423:         int256 amountSpecified,

457:         if (amountSpecified == 0) revert AS();

459:         if (!slot0Start.unlocked) revert LOK();

479:         bool exactInput = amountSpecified > 0;

482:             amountSpecifiedRemaining: amountSpecified,

522:                 state.amountSpecifiedRemaining,

529:                     state.amountSpecifiedRemaining -= (step.amountIn + step.feeAmount).toInt256();

534:                     state.amountSpecifiedRemaining += step.amountOut.toInt256();

598:                         if (zeroForOne) liquidityNet = -liquidityNet;

638:         if (cache.liquidityStart != state.liquidity) $.liquidity = state.liquidity;

645:                 if (state.protocolFee > 0) $.protocolFees.token0 += state.protocolFee;

650:                 if (state.protocolFee > 0) $.protocolFees.token1 += state.protocolFee;

656:                 ? (amountSpecified - state.amountSpecifiedRemaining, state.amountCalculated)

657:                 : (state.amountCalculated, amountSpecified - state.amountSpecifiedRemaining);

663:                 if (amount1 < 0) TransferHelper.safeTransfer(token1, recipient, uint256(-amount1));

668:             if (balance0Before + uint256(amount0) > balance0()) revert IIA();

671:                 if (amount0 < 0) TransferHelper.safeTransfer(token0, recipient, uint256(-amount0));

676:             if (balance1Before + uint256(amount1) > balance1()) revert IIA();

688:         if (_liquidity <= 0) revert L();

695:         if (amount0 > 0) TransferHelper.safeTransfer(token0, recipient, amount0);

696:         if (amount1 > 0) TransferHelper.safeTransfer(token1, recipient, amount1);

703:         if (balance0Before + fee0 > balance0After) revert F0();

704:         if (balance1Before + fee1 > balance1After) revert F1();

714:                 if (uint128(pFees0) > 0) $.protocolFees.token0 += uint128(pFees0);

719:                 if (uint128(pFees1) > 0) $.protocolFees.token1 += uint128(pFees1);

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

87:             if (last.blockTimestamp == blockTimestamp) return (index, cardinality);

108:             if (current <= 0) revert I();

110:             if (next <= current) return current;

127:             if (a <= time && b <= time) return a <= b;

176:                 if (targetAtOrAfter && lte(time, target, atOrAfter.blockTimestamp)) break;

178:                 if (!targetAtOrAfter) r = i - 1;

222:             if (!beforeOrAt.initialized) beforeOrAt = self[0];

225:             if (!lte(time, beforeOrAt.blockTimestamp, target)) revert OLD();

257:                 if (last.blockTimestamp != time) last = transform(last, time, tick, liquidity);

320:             if (cardinality <= 0) revert I();

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

74:             if (liquidity <= 0) revert NP();

94:             if (liquidityDelta != 0) self.liquidity = liquidityNext;

221:         if (params.period > currentPeriod) revert FTR();

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

112:         if (liquidityGrossAfter > maxLiquidity) revert LO();

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

4: import "./interfaces/IFeeCollector.sol";

7: import "../../interfaces/IFeeDistributor.sol";

102:         IFeeDistributor feeDist = IFeeDistributor(

131:             if (amount0Treasury > 0)

133:             if (amount1Treasury > 0)

140:             feeDist.notifyRewardAmount(address(token0), amount0);

144:             feeDist.notifyRewardAmount(address(token1), amount1);

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

6: import "./interfaces/IFeeCollector.sol";

28:     IFeeCollector public immutable feeCollector;

83:         feeCollector = IFeeCollector(_feeCollector);

147:     function notifyRewardAmount(

161:         emit NotifyReward(msg.sender, token, amount, period);

165:     function notifyRewardAmountNextPeriod(

178:         emit NotifyReward(msg.sender, token, amount, period);

182:     function notifyRewardAmountForPeriod(

196:         emit NotifyReward(msg.sender, token, amount, period);

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

104:         if (position.poolId == 0) revert InvalidTokenId(tokenId);

284:         if (amount0 < params.amount0Min || amount1 < params.amount1Min) revert CheckSlippage();

398:         if (position.liquidity > 0 || position.tokensOwed0 > 0 || position.tokensOwed1 > 0) revert NotCleared();

```

### <a name="NC-5"></a>[NC-5] Dangerous `while(true)` loop
Consider using for-loops to avoid all risks of an infinite-loop situation

*Instances (1)*:
```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

160:             while (true) {

```

### <a name="NC-6"></a>[NC-6] Functions should not be longer than 50 lines
Overly complex code can make understanding functionality more difficult, try to further modularize your code to ensure readability 

*Instances (45)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

65:     function initialize(address _ramsesV3PoolDeployer) external restricted {

106:     function enableTickSpacing(int24 tickSpacing, uint24 initialFee) external override restricted {

119:     function setFeeProtocol(uint8 _feeProtocol) external override restricted {

127:     function setPoolFeeProtocol(address pool, uint8 _feeProtocol) external restricted {

137:     function setPoolFeeProtocolBatch(address[] calldata pools, uint8 _feeProtocol) external restricted {

149:     function setPoolFeeProtocolBatch(address[] calldata pools, uint8[] calldata _feeProtocols) external restricted {

164:     function poolFeeProtocol(address pool) public view override returns (uint8 __poolFeeProtocol) {

169:     function setFeeCollector(address _feeCollector) external override restricted {

175:     function setFee(address _pool, uint24 _fee) external override restricted {

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

71:     function checkTicks(int24 tickLower, int24 tickUpper) private pure {

81:     function _blockTimestamp() internal view virtual returns (uint32) {

88:     function balance0() internal view returns (uint256) {

94:     function balance1() internal view returns (uint256) {

137:     function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external override lock {

152:     function initialize(uint160 sqrtPriceX96) external {

684:     function flash(address recipient, uint256 amount0, uint256 amount1, bytes calldata data) external override lock {

728:     function setFeeProtocol() external override lock {

744:     function setFee(uint24 _fee) external override lock {

781:     function fee() external view override returns (uint24) {

785:     function readStorage(bytes32[] calldata slots) external view returns (bytes32[] memory returnData) {

845:     function lastPeriod() external view returns (uint256) {

850:     function feeGrowthGlobal0X128() external view override returns (uint256) {

855:     function feeGrowthGlobal1X128() external view override returns (uint256) {

860:     function protocolFees() external view override returns (uint128, uint128) {

866:     function liquidity() external view override returns (uint128) {

900:     function tickBitmap(int16 tick) external view override returns (uint256) {

```

```solidity
File: ./contracts/CL/core/RamsesV3PoolDeployer.sol

21:     function deploy(address token0, address token1, int24 tickSpacing) external returns (address pool) {

34:     function poolBytecode() external pure returns (bytes memory _bytecode) {

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

106:     function grow(Observation[65535] storage self, uint16 current, uint16 next) internal returns (uint16) {

124:     function lte(uint32 time, uint32 a, uint32 b) private pure returns (bool) {

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

298:     function _updatePosition(UpdatePositionParams memory params) external returns (PositionInfo storage position) {

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

22:     function tickSpacingToMaxLiquidityPerTick(int24 tickSpacing) internal pure returns (uint128) {

138:     function clear(mapping(int24 => TickInfo) storage self, int24 tick, uint256 period) internal {

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

50:     function setTreasury(address _treasury) external override onlyTreasury {

67:     function setIsLive(bool status) external onlyTreasury {

72:     function collectProtocolFees(IRamsesV3Pool pool) external override {

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

109:     function _blockTimestamp() internal view virtual returns (uint256) {

114:     function left(address token) external view override returns (uint256) {

121:     function rewardRate(address token) external view returns (uint256) {

431:     function getReward(uint256 tokenId, address[] memory tokens) public lock {

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

121:     function cachePoolKey(address pool, PoolAddress.PoolKey memory poolKey) private returns (uint80 poolId) {

190:     function tokenURI(uint256 tokenId) public view override(ERC721, IERC721Metadata) returns (string memory) {

396:     function burn(uint256 tokenId) external payable override isAuthorizedForToken(tokenId) {

411:     function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {

421:     function getReward(uint256 tokenId, address[] calldata tokens) external isAuthorizedForToken(tokenId) {

```

### <a name="NC-7"></a>[NC-7] Change uint to uint256
Throughout the code base, some variables are declared as `uint`. To favor explicitness, consider changing all instances of `uint` to `uint256`

*Instances (2)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

139:         for (uint i; i < pools.length; i++) {

152:         for (uint i; i < pools.length; i++) {

```

### <a name="NC-8"></a>[NC-8] Use a `modifier` instead of a `require/if` statement for a special `msg.sender` actor
If a function is supposed to be access-controlled, a `modifier` should be used instead of a `require/if` statement for more readability.

*Instances (11)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

738:         require(msg.sender == IRamsesV3Factory(factory).feeCollector(), ProtocolActions.Unauthorized());

```

```solidity
File: ./contracts/CL/core/RamsesV3PoolDeployer.sol

22:         require(msg.sender == RamsesV3Factory);

```

```solidity
File: ./contracts/CL/gauge/ClGaugeFactory.sol

40:         require(msg.sender == voter, "AUTH");

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

45:         require(msg.sender == treasury, Unauthorized());

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

161:         emit NotifyReward(msg.sender, token, amount, period);

178:         emit NotifyReward(msg.sender, token, amount, period);

196:         emit NotifyReward(msg.sender, token, amount, period);

394:         require(msg.sender == owner, "Not authorized");

489:         require(msg.sender == owner, "Not authorized");

563:         require(msg.sender == voter, "!AUTH");

572:         require(msg.sender == voter, "!AUTH");

```

### <a name="NC-9"></a>[NC-9] Consider using named mappings
Consider moving to solidity version 0.8.18 or later, and using [named mappings](https://ethereum.stackexchange.com/questions/51629/how-to-name-the-arguments-in-mapping/145555#145555) to make it easier to understand the purpose of each mapping

*Instances (15)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

33:     using Tick for mapping(int24 => TickInfo);

34:     using TickBitmap for mapping(int16 => uint256);

35:     using Position for mapping(bytes32 => PositionInfo);

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

44:         mapping(bytes32 => PositionInfo) storage self,

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

41:         mapping(int24 => TickInfo) storage self,

93:         mapping(int24 => TickInfo) storage self,

138:     function clear(mapping(int24 => TickInfo) storage self, int24 tick, uint256 period) internal {

153:         mapping(int24 => TickInfo) storage self,

```

```solidity
File: ./contracts/CL/gauge/ClGaugeFactory.sol

17:     mapping(address => address) public override getGauge;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

36:     mapping(uint256 => mapping(address => uint256))

40:     mapping(uint256 => mapping(bytes32 => bool)) internal periodAmountsWritten;

42:     mapping(uint256 => mapping(bytes32 => uint256))

47:     mapping(uint256 => mapping(bytes32 => mapping(address => uint256)))

52:     mapping(address => mapping(bytes32 => uint256)) public lastClaimByToken;

57:     mapping(address => bool) public isReward;

```

### <a name="NC-10"></a>[NC-10] Numeric values having to do with time should use time units for readability
There are [units](https://docs.soliditylang.org/en/latest/units-and-global-variables.html#time-units) for seconds, minutes, hours, days, and weeks, and since they're defined, they should be used

*Instances (1)*:
```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

113:             for (uint16 i = current; i < next; i++) self[i].blockTimestamp = 1;

```

### <a name="NC-11"></a>[NC-11] Take advantage of Custom Error's return value property
An important feature of Custom Error is that values such as address, tokenID, msg.value can be written inside the () sign, this kind of approach provides a serious advantage in debugging and examining the revert details of dapps such as tenderly.

*Instances (22)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

50:         if (!$.slot0.unlocked) revert LOK();

73:         if (tickLower >= tickUpper) revert TLU();

75:         if (tickLower < TickMath.MIN_TICK) revert TLM();

77:         if (tickUpper > TickMath.MAX_TICK) revert TUM();

155:         if ($.slot0.sqrtPriceX96 != 0) revert AI();

294:         if (amount0 > 0 && balance0Before + amount0 > balance0()) revert M0();

295:         if (amount1 > 0 && balance1Before + amount1 > balance1()) revert M1();

457:         if (amountSpecified == 0) revert AS();

459:         if (!slot0Start.unlocked) revert LOK();

668:             if (balance0Before + uint256(amount0) > balance0()) revert IIA();

676:             if (balance1Before + uint256(amount1) > balance1()) revert IIA();

688:         if (_liquidity <= 0) revert L();

703:         if (balance0Before + fee0 > balance0After) revert F0();

704:         if (balance1Before + fee1 > balance1After) revert F1();

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

108:             if (current <= 0) revert I();

225:             if (!lte(time, beforeOrAt.blockTimestamp, target)) revert OLD();

320:             if (cardinality <= 0) revert I();

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

74:             if (liquidity <= 0) revert NP();

221:         if (params.period > currentPeriod) revert FTR();

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

112:         if (liquidityGrossAfter > maxLiquidity) revert LO();

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

284:         if (amount0 < params.amount0Min || amount1 < params.amount1Min) revert CheckSlippage();

398:         if (position.liquidity > 0 || position.tokensOwed0 > 0 || position.tokensOwed1 > 0) revert NotCleared();

```

### <a name="NC-12"></a>[NC-12] Use scientific notation (e.g. `1e18`) rather than exponentiation (e.g. `10**18`)
While this won't save gas in the recent solidity versions, this is shorter and more readable (this is especially true in calculations).

*Instances (1)*:
```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

22:     uint256 internal constant PRECISION = 10 ** 18;

```

### <a name="NC-13"></a>[NC-13] Avoid the use of sensitive terms
Use [alternative variants](https://www.zdnet.com/article/mysql-drops-master-slave-and-blacklist-whitelist-terminology/), e.g. allowlist/denylist instead of whitelist/blacklist

*Instances (3)*:
```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

151:         require(isReward[token], "!Whitelisted");

169:         require(isReward[token], "!Whitelisted");

187:         require(isReward[token], "!Whitelisted");

```

### <a name="NC-14"></a>[NC-14] Strings should use double quotes rather than single quotes
See the Solidity Style Guide: https://docs.soliditylang.org/en/v0.8.20/style-guide.html#other-recommendations

*Instances (4)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

111:         require(tickSpacing > 0 && tickSpacing < 16384, 'TS');

112:         require(tickSpacingInitialFee[tickSpacing] == 0, 'TS!0');

151:         require(pools.length == _feeProtocols.length, 'AL');

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

78:     ) ERC721('Ramses V3 Positions NFT', 'RAM-V3-NFP') PeripheryImmutableState(_deployer, _WETH9) {

```

### <a name="NC-15"></a>[NC-15] Some require descriptions are not clear
1. It does not comply with the general require error description model of the project (Either all of them should be debugged in this way, or all of them should be explained with a string not exceeding 32 bytes.)
2. For debug dapps like Tenderly, these debug messages are important, this allows the user to see the reasons for revert practically.

*Instances (2)*:
```solidity
File: ./contracts/CL/gauge/ClGaugeFactory.sol

41:         require(getGauge[pool] == address(0), "GE");

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

62:         require(_unlocked, "LOK");

```

### <a name="NC-16"></a>[NC-16] Use Underscores for Number Literals (add an underscore every 3 digits)

*Instances (7)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

49:         tickSpacingInitialFee[50] = 3000;

50:         emit TickSpacingEnabled(50, 3000);

52:         tickSpacingInitialFee[100] = 10000;

53:         emit TickSpacingEnabled(100, 10000);

55:         tickSpacingInitialFee[200] = 20000;

56:         emit TickSpacingEnabled(200, 20000);

111:         require(tickSpacing > 0 && tickSpacing < 16384, 'TS');

```

### <a name="NC-17"></a>[NC-17] Constants should be defined rather than using magic numbers

*Instances (2)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

50:         emit TickSpacingEnabled(50, 3000);

56:         emit TickSpacingEnabled(200, 20000);

```

### <a name="NC-18"></a>[NC-18] Variables need not be initialized to zero
The default value for variables is zero, so initializing them to zero is superfluous.

*Instances (7)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

789:         for (uint256 i = 0; i < slotsLength; ++i) {

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

324:             for (uint256 i = 0; i < secondsAgos.length; i++) {

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

181:             uint256 lower = 0;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

366:         for (uint256 i = 0; i < tokens.length; ++i) {

402:         for (uint256 i = 0; i < tokens.length; ++i) {

426:         for (uint256 i = 0; i < length; ++i) {

509:         for (uint256 i = 0; i < tokens.length; ++i) {

```


## Low Issues


| |Issue|Instances|
|-|:-|:-:|
| [L-1](#L-1) | `approve()`/`safeApprove()` may revert if the current approval is not zero | 2 |
| [L-2](#L-2) | Division by zero not prevented | 10 |
| [L-3](#L-3) | Initializers could be front-run | 7 |
| [L-4](#L-4) | Loss of precision | 15 |
| [L-5](#L-5) | Unsafe ERC20 operation(s) | 2 |
| [L-6](#L-6) | Upgradeable contract not initialized | 36 |
### <a name="L-1"></a>[L-1] `approve()`/`safeApprove()` may revert if the current approval is not zero
- Some tokens (like the *very popular* USDT) do not work when changing the allowance from an existing non-zero allowance value (it will revert if the current approval is not zero to protect against front-running changes of approvals). These tokens must first be approved for zero and then the actual allowance can be approved.
- Furthermore, OZ's implementation of safeApprove would throw an error if an approve is attempted from a non-zero value (`"SafeERC20: approve from non-zero to non-zero allowance"`)

Set the allowance to zero immediately before each of the existing allowance calls

*Instances (2)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

139:             token0.approve(address(feeDist), amount0);

143:             token1.approve(address(feeDist), amount1);

```

### <a name="L-2"></a>[L-2] Division by zero not prevented
The divisions below take an input parameter which does not have any zero-value checks, which may lead to the functions reverting when zero is passed.

*Instances (10)*:
```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

713:                 uint256 pFees0 = feeProtocol == 0 ? 0 : paid0 / feeProtocol;

718:                 uint256 pFees1 = feeProtocol == 0 ? 0 : paid1 / feeProtocol;

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

37:                         ((uint160(delta) << 128) / (liquidity > 0 ? liquidity : 1)),

285:                         ((atOrAfter.tickCumulative - beforeOrAt.tickCumulative) / int56(uint56(observationTimeDelta))) *

292:                             ) * targetDelta) / observationTimeDelta

351:                 ((uint160(delta) << 128) / ($.liquidity > 0 ? $.liquidity : 1));

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

24:             int24 minTick = (TickMath.MIN_TICK / tickSpacing) * tickSpacing;

25:             int24 maxTick = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;

26:             uint24 numTicks = uint24((maxTick - minTick) / tickSpacing) + 1;

27:             return type(uint128).max / numTicks;

```

### <a name="L-3"></a>[L-3] Initializers could be front-run
Initializers could be front-run, allowing an attacker to either set their own values, take ownership of the contract, and in the best case forcing a re-deployment

*Instances (7)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

65:     function initialize(address _ramsesV3PoolDeployer) external restricted {

101:             IRamsesV3Pool(pool).initialize(sqrtPriceX96);

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

152:     function initialize(uint160 sqrtPriceX96) external {

159:         (uint16 cardinality, uint16 cardinalityNext) = Oracle.initialize($.observations, 0);

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

48:     function initialize(

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

35:     function initialize(

38:     ) external initializer {

```

### <a name="L-4"></a>[L-4] Loss of precision
Division by large numbers may result in the result being zero, due to solidity not supporting fractions. Consider requiring a minimum amount for the numerator to ensure that it is always larger than the denominator

*Instances (15)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

123:             amount0Treasury = (amount0 * _treasuryFees) / BASIS;

124:             amount1Treasury = (amount1 * _treasuryFees) / BASIS;

```

```solidity
File: ./contracts/CL/gauge/GaugeV3.sol

87:         firstPeriod = _blockTimestamp() / WEEK;

115:         uint256 period = _blockTimestamp() / WEEK;

117:         return (tokenTotalSupplyByPeriod[period][token] * remainingTime) / WEEK;

122:         uint256 period = _blockTimestamp() / WEEK;

123:         return (tokenTotalSupplyByPeriod[period][token] / WEEK);

153:         uint256 period = _blockTimestamp() / WEEK;

170:         uint256 period = (_blockTimestamp() / WEEK) + 1;

188:         require(period > _blockTimestamp() / WEEK, "Retro");

219:         uint256 currentPeriod = _blockTimestamp() / WEEK;

311:             if (period < _blockTimestamp() / WEEK && caching) {

367:             if (period < _blockTimestamp() / WEEK) {

403:             if (period < _blockTimestamp() / WEEK) {

507:         uint256 currentPeriod = _blockTimestamp() / WEEK;

```

### <a name="L-5"></a>[L-5] Unsafe ERC20 operation(s)

*Instances (2)*:
```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

139:             token0.approve(address(feeDist), amount0);

143:             token1.approve(address(feeDist), amount1);

```

### <a name="L-6"></a>[L-6] Upgradeable contract not initialized
Upgradeable contracts are initialized via an initializer function rather than by a constructor. Leaving such a contract uninitialized may lead to it being taken over by a malicious user

*Instances (36)*:
```solidity
File: ./contracts/CL/core/RamsesV3Factory.sol

65:     function initialize(address _ramsesV3PoolDeployer) external restricted {

101:             IRamsesV3Pool(pool).initialize(sqrtPriceX96);

```

```solidity
File: ./contracts/CL/core/RamsesV3Pool.sol

152:     function initialize(uint160 sqrtPriceX96) external {

159:         (uint16 cardinality, uint16 cardinalityNext) = Oracle.initialize($.observations, 0);

173:         emit Initialize(sqrtPriceX96, tick);

408:         bool initialized;

499:             (step.tickNext, step.initialized) = $.tickBitmap.nextInitializedTickWithinOneWord(

558:                 if (step.initialized) {

885:             bool initialized

896:         initialized = tickData.initialized;

962:             bool initialized

970:             observationData.initialized

```

```solidity
File: ./contracts/CL/core/libraries/Oracle.sol

38:                     initialized: true

48:     function initialize(

56:             initialized: true

166:                 if (!beforeOrAt.initialized) {

222:             if (!beforeOrAt.initialized) beforeOrAt = self[0];

357:                 initialized: last.initialized

398:         bool initializedLower;

403:             initializedLower

408:             lower.initialized

410:         require(initializedLower);

412:         bool initializedUpper;

417:             initializedUpper

422:             upper.initialized

424:         require(initializedUpper);

```

```solidity
File: ./contracts/CL/core/libraries/Position.sol

387:         if (!position.periodRewardInfo[period].initialized || position.liquidity == 0) {

388:             initializeSecondsStart(

428:     function initializeSecondsStart(

434:         position.periodRewardInfo[secondsInRangeParams.period].initialized = true;

```

```solidity
File: ./contracts/CL/core/libraries/Tick.sol

125:             info.initialized = true;

```

```solidity
File: ./contracts/CL/gauge/FeeCollector.sol

31:         _disableInitializers();

35:     function initialize(

38:     ) external initializer {

```

```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

20: import {PoolInitializer} from './base/PoolInitializer.sol';

30:     PoolInitializer,

```


## Medium Issues


| |Issue|Instances|
|-|:-|:-:|
| [M-1](#M-1) | Centralization Risk for trusted owners | 1 |
| [M-2](#M-2) | `_safeMint()` should be used rather than `_mint()` wherever possible | 1 |
| [M-3](#M-3) | Direct `supportsInterface()` calls may cause caller to revert | 1 |
### <a name="M-1"></a>[M-1] Centralization Risk for trusted owners

#### Impact:
Contracts have owners with privileged rights to perform admin tasks and need to be trusted to not perform malicious updates or drain funds.

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

191:         _requireOwned(tokenId);

```

### <a name="M-2"></a>[M-2] `_safeMint()` should be used rather than `_mint()` wherever possible
`_mint()` is [discouraged](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4d8d2ed9798cc3383912a23b5e8d5cb602f7d4b/contracts/token/ERC721/ERC721.sol#L271) in favor of `_safeMint()` which ensures that the recipient is either an EOA or implements `IERC721Receiver`. Both open [OpenZeppelin](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/d4d8d2ed9798cc3383912a23b5e8d5cb602f7d4b/contracts/token/ERC721/ERC721.sol#L238-L250) and [solmate](https://github.com/Rari-Capital/solmate/blob/4eaf6b68202e36f67cab379768ac6be304c8ebde/src/tokens/ERC721.sol#L180) have versions of this function so that NFTs aren't lost if they're minted to contracts that cannot transfer them back out.

Be careful however to respect the CEI pattern or add a re-entrancy guard as `_safeMint` adds a callback-check (`_checkOnERC721Received`) and a malicious `onERC721Received` could be exploited if not careful.

Reading material:

- <https://blocksecteam.medium.com/when-safemint-becomes-unsafe-lessons-from-the-hypebears-security-incident-2965209bda2a>
- <https://samczsun.com/the-dangers-of-surprising-code/>
- <https://github.com/KadenZipfel/smart-contract-attack-vectors/blob/master/vulnerabilities/unprotected-callback.md>

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

159:         _mint(params.recipient, tokenId);

```

### <a name="M-3"></a>[M-3] Direct `supportsInterface()` calls may cause caller to revert
Calling `supportsInterface()` on a contract that doesn't implement the ERC-165 standard will result in the call reverting. Even if the caller does support the function, the contract may be malicious and consume all of the transaction's available gas. Call it via a low-level [staticcall()](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/f959d7e4e6ee0b022b41e5b644c79369869d8411/contracts/utils/introspection/ERC165Checker.sol#L119), with a fixed amount of gas, and check the return code, or use OpenZeppelin's [`ERC165Checker.supportsInterface()`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/f959d7e4e6ee0b022b41e5b644c79369869d8411/contracts/utils/introspection/ERC165Checker.sol#L36-L39).

*Instances (1)*:
```solidity
File: ./contracts/CL/periphery/NonfungiblePositionManager.sol

418:         return super.supportsInterface(interfaceId);

```
