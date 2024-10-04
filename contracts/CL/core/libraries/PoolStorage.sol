// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

struct Slot0 {
    /// @dev the current price
    uint160 sqrtPriceX96;
    /// @dev the current tick
    int24 tick;
    /// @dev the most-recently updated index of the observations array
    uint16 observationIndex;
    /// @dev the current maximum number of observations that are being stored
    uint16 observationCardinality;
    /// @dev the next maximum number of observations to store, triggered in observations.write
    uint16 observationCardinalityNext;
    /// @dev the current protocol fee as a percentage of the swap fee taken on withdrawal
    /// @dev represented as an integer denominator (1/x)%
    uint8 feeProtocol;
    /// @dev whether the pool is locked
    bool unlocked;
}

struct Observation {
    /// @dev the block timestamp of the observation
    uint32 blockTimestamp;
    /// @dev the tick accumulator, i.e. tick * time elapsed since the pool was first initialized
    int56 tickCumulative;
    /// @dev the seconds per liquidity, i.e. seconds elapsed / max(1, liquidity) since the pool was first initialized
    uint160 secondsPerLiquidityCumulativeX128;
    /// @dev whether or not the observation is initialized
    bool initialized;
}

struct RewardInfo {
    /// @dev used to account for changes in the deposit amount
    int256 secondsDebtX96;
    /// @dev used to check if starting seconds have already been written
    bool initialized;
    /// @dev used to account for changes in secondsPerLiquidity
    int160 secondsPerLiquidityPeriodStartX128;
}

/// @dev info stored for each user's position
struct PositionInfo {
    /// @dev the amount of liquidity owned by this position
    uint128 liquidity;
    /// @dev fee growth per unit of liquidity as of the last update to liquidity or fees owed
    uint256 feeGrowthInside0LastX128;
    uint256 feeGrowthInside1LastX128;
    /// @dev the fees owed to the position owner in token0/token1
    uint128 tokensOwed0;
    uint128 tokensOwed1;
    mapping(uint256 => RewardInfo) periodRewardInfo;
}

/// @dev info stored for each initialized individual tick
struct TickInfo {
    /// @dev the total position liquidity that references this tick
    uint128 liquidityGross;
    /// @dev amount of net liquidity added (subtracted) when tick is crossed from left to right (right to left),
    int128 liquidityNet;
    /// @dev fee growth per unit of liquidity on the _other_ side of this tick (relative to the current tick)
    /// @dev only has relative meaning, not absolute — the value depends on when the tick is initialized
    uint256 feeGrowthOutside0X128;
    uint256 feeGrowthOutside1X128;
    /// @dev the cumulative tick value on the other side of the tick
    int56 tickCumulativeOutside;
    /// @dev the seconds per unit of liquidity on the _other_ side of this tick (relative to the current tick)
    /// @dev only has relative meaning, not absolute — the value depends on when the tick is initialized
    uint160 secondsPerLiquidityOutsideX128;
    /// @dev the seconds spent on the other side of the tick (relative to the current tick)
    /// @dev only has relative meaning, not absolute — the value depends on when the tick is initialized
    uint32 secondsOutside;
    /// @dev true iff the tick is initialized, i.e. the value is exactly equivalent to the expression liquidityGross != 0
    /// @dev these 8 bits are set to prevent fresh sstores when crossing newly initialized ticks
    bool initialized;
    /// @dev secondsPerLiquidityOutsideX128 separated into periods, placed here to preserve struct slots
    mapping(uint256 => uint256) periodSecondsPerLiquidityOutsideX128;
}

/// @dev info stored for each period
struct PeriodInfo {
    uint32 previousPeriod;
    int24 startTick;
    int24 lastTick;
    uint160 endSecondsPerLiquidityPeriodX128;
}

/// @dev accumulated protocol fees in token0/token1 units
struct ProtocolFees {
    uint128 token0;
    uint128 token1;
}

/// @dev Position period and liquidity
struct PositionCheckpoint {
    uint256 period;
    uint256 liquidity;
}

library PoolStorage {
    /// @dev keccak256(abi.encode(uint256(keccak256("pool.storage")) - 1)) & ~bytes32(uint256(0xff));
    bytes32 public constant POOL_STORAGE_LOCATION = 0xf047b0c59244a0faf8e48cb6b6fde518e6717176152b6dd953628cd9dccb2800;

    /// @custom꞉storage‑location erc7201꞉pool.storage
    struct PoolState {
        Slot0 slot0;
        uint24 fee;
        uint256 feeGrowthGlobal0X128;
        uint256 feeGrowthGlobal1X128;
        ProtocolFees protocolFees;
        uint128 liquidity;
        mapping(int24 => TickInfo) _ticks;
        mapping(int16 => uint256) tickBitmap;
        mapping(bytes32 => PositionInfo) positions;
        Observation[65535] observations;
        mapping(uint256 => PeriodInfo) periods;
        uint256 lastPeriod;
        mapping(bytes32 => PositionCheckpoint[]) positionCheckpoints;
        bool initialized;
        address nfpManager;
    }

    /// @dev Return state storage struct for reading and writing
    function getStorage() internal pure returns (PoolState storage $) {
        assembly {
            $.slot := POOL_STORAGE_LOCATION
        }
    }
}
