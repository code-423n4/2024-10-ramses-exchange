// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

import {IRamsesV3Factory} from './interfaces/IRamsesV3Factory.sol';
import {IRamsesV3PoolDeployer} from './interfaces/IRamsesV3PoolDeployer.sol';
import {IRamsesV3Pool} from './interfaces/IRamsesV3Pool.sol';
import {AccessManaged} from '@openzeppelin/contracts/access/manager/AccessManaged.sol';

/// @title Canonical Ramses V3 factory
/// @notice Deploys Ramses V3 pools and manages ownership and control over pool protocol fees
contract RamsesV3Factory is IRamsesV3Factory, AccessManaged {
    address public ramsesV3PoolDeployer;
    /// @inheritdoc IRamsesV3Factory
    mapping(int24 tickSpacing => uint24 initialFee) public override tickSpacingInitialFee;
    /// @inheritdoc IRamsesV3Factory
    mapping(address tokenA => mapping(address tokenB => mapping(int24 tickSpacing => address pool)))
        public
        override getPool;
    /// @dev pool specific fee protocol if set
    mapping(address pool => uint8 feeProtocol) _poolFeeProtocol;

    /// @inheritdoc IRamsesV3Factory
    uint8 public override feeProtocol;
    /// @inheritdoc IRamsesV3Factory
    address public feeCollector;

    struct Parameters {
        address factory;
        address token0;
        address token1;
        uint24 fee;
        int24 tickSpacing;
    }
    /// @inheritdoc IRamsesV3Factory
    Parameters public parameters;

    /// @dev set initial tickspacings and feeSplits
    constructor(address accessManager) AccessManaged(accessManager) {
        /// @dev 0.01% fee, 1bps tickspacing
        tickSpacingInitialFee[1] = 100;
        emit TickSpacingEnabled(1, 100);
        /// @dev 0.025% fee, 5bps tickspacing
        tickSpacingInitialFee[5] = 250;
        emit TickSpacingEnabled(5, 250);
        /// @dev 0.05% fee, 10bps tickspacing
        tickSpacingInitialFee[10] = 500;
        emit TickSpacingEnabled(10, 500);
        /// @dev 0.30% fee, 50bps tickspacing
        tickSpacingInitialFee[50] = 3000;
        emit TickSpacingEnabled(50, 3000);
        /// @dev 1.00% fee, 100 bps tickspacing
        tickSpacingInitialFee[100] = 10000;
        emit TickSpacingEnabled(100, 10000);
        /// @dev 2.00% fee, 200 bps tickspacing
        tickSpacingInitialFee[200] = 20000;
        emit TickSpacingEnabled(200, 20000);

        /// @dev the initial feeSplit of what is sent to the FeeCollector to be distributed to voters and the treasury
        /// @dev 80% to FeeCollector
        feeProtocol = 80;

        emit SetFeeProtocol(0, feeProtocol);
    }

    function initialize(address _ramsesV3PoolDeployer) external restricted {
        require(ramsesV3PoolDeployer == address(0));
        ramsesV3PoolDeployer = _ramsesV3PoolDeployer;
    }

    /// @inheritdoc IRamsesV3Factory
    function createPool(
        address tokenA,
        address tokenB,
        int24 tickSpacing,
        uint160 sqrtPriceX96
    ) external override returns (address pool) {
        require(tokenA != tokenB, IT());
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), A0());
        uint24 fee = tickSpacingInitialFee[tickSpacing];
        require(fee != 0, F0());
        require(getPool[token0][token1][tickSpacing] == address(0), PE());

        parameters = Parameters({
            factory: address(this),
            token0: token0,
            token1: token1,
            fee: fee,
            tickSpacing: tickSpacing
        });
        pool = IRamsesV3PoolDeployer(ramsesV3PoolDeployer).deploy(token0, token1, tickSpacing);
        delete parameters;

        getPool[token0][token1][tickSpacing] = pool;
        /// @dev populate mapping in the reverse direction, deliberate choice to avoid the cost of comparing addresses
        getPool[token1][token0][tickSpacing] = pool;
        emit PoolCreated(token0, token1, fee, tickSpacing, pool);

        /// @dev if there is a sqrtPrice, initialize it to the pool
        if (sqrtPriceX96 > 0) {
            IRamsesV3Pool(pool).initialize(sqrtPriceX96);
        }
    }

    /// @inheritdoc IRamsesV3Factory
    function enableTickSpacing(int24 tickSpacing, uint24 initialFee) external override restricted {
        require(initialFee < 1_000_000, FTL());
        /// @dev tick spacing is capped at 16384 to prevent the situation where tickSpacing is so large that
        /// @dev TickBitmap#nextInitializedTickWithinOneWord overflows int24 container from a valid tick
        /// @dev 16384 ticks represents a >5x price change with ticks of 1 bips
        require(tickSpacing > 0 && tickSpacing < 16384, 'TS');
        require(tickSpacingInitialFee[tickSpacing] == 0, 'TS!0');

        tickSpacingInitialFee[tickSpacing] = initialFee;
        emit TickSpacingEnabled(tickSpacing, initialFee);
    }

    /// @inheritdoc IRamsesV3Factory
    function setFeeProtocol(uint8 _feeProtocol) external override restricted {
        require(_feeProtocol <= 100, FTL());
        uint8 feeProtocolOld = feeProtocol;
        feeProtocol = _feeProtocol;
        emit SetFeeProtocol(feeProtocolOld, _feeProtocol);
    }

    /// @inheritdoc IRamsesV3Factory
    function setPoolFeeProtocol(address pool, uint8 _feeProtocol) external restricted {
        require(_feeProtocol <= 100, FTL());
        uint8 feeProtocolOld = poolFeeProtocol(pool);
        _poolFeeProtocol[pool] = _feeProtocol;
        emit SetPoolFeeProtocol(pool, feeProtocolOld, _feeProtocol == 0 ? feeProtocol : _feeProtocol);

        IRamsesV3Pool(pool).setFeeProtocol();
    }

    /// @inheritdoc IRamsesV3Factory
    function setPoolFeeProtocolBatch(address[] calldata pools, uint8 _feeProtocol) external restricted {
        require(_feeProtocol <= 100, FTL());
        for (uint i; i < pools.length; i++) {
            uint8 feeProtocolOld = poolFeeProtocol(pools[i]);
            _poolFeeProtocol[pools[i]] = _feeProtocol;
            emit SetPoolFeeProtocol(pools[i], feeProtocolOld, _feeProtocol == 0 ? feeProtocol : _feeProtocol);

            IRamsesV3Pool(pools[i]).setFeeProtocol();
        }
    }

    /// @inheritdoc IRamsesV3Factory
    function setPoolFeeProtocolBatch(address[] calldata pools, uint8[] calldata _feeProtocols) external restricted {
        /// @dev AL = Array Length
        require(pools.length == _feeProtocols.length, 'AL');
        for (uint i; i < pools.length; i++) {
            /// @dev fee cannot exceed 100%
            require(_feeProtocols[i] <= 100, FTL());
            uint8 feeProtocolOld = poolFeeProtocol(pools[i]);
            _poolFeeProtocol[pools[i]] = _feeProtocols[i];
            emit SetPoolFeeProtocol(pools[i], feeProtocolOld, _feeProtocols[i] == 0 ? feeProtocol : _feeProtocols[i]);

            IRamsesV3Pool(pools[i]).setFeeProtocol();
        }
    }

    /// @inheritdoc IRamsesV3Factory
    function poolFeeProtocol(address pool) public view override returns (uint8 __poolFeeProtocol) {
        return (_poolFeeProtocol[pool] == 0 ? feeProtocol : _poolFeeProtocol[pool]);
    }

    /// @inheritdoc IRamsesV3Factory
    function setFeeCollector(address _feeCollector) external override restricted {
        emit FeeCollectorChanged(feeCollector, _feeCollector);
        feeCollector = _feeCollector;
    }

    /// @inheritdoc IRamsesV3Factory
    function setFee(address _pool, uint24 _fee) external override restricted {
        IRamsesV3Pool(_pool).setFee(_fee);

        emit FeeAdjustment(_pool, _fee);
    }
}
