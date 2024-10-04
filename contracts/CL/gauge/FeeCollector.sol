// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.13;

import "./interfaces/IFeeCollector.sol";

import "../../interfaces/IVoter.sol";
import "../../interfaces/IFeeDistributor.sol";

import "../core/interfaces/IRamsesV3Pool.sol";

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

error Unauthorized();
error FTL();

contract FeeCollector is Initializable, IFeeCollector {
    using SafeERC20 for IERC20;

    uint256 public constant BASIS = 10_000;
    uint256 public treasuryFees;

    address public override treasury;
    IVoter public voter;

    bool public isTokenLive;

    /// @dev disables initializers on deploy
    constructor() {
        _disableInitializers();
    }

    /// @dev initializes the contract
    function initialize(
        address _treasury,
        address _voter
    ) external initializer {
        treasury = _treasury;
        voter = IVoter(_voter);
    }

    /// @dev Prevents calling a function from anyone except the treasury
    modifier onlyTreasury() {
        require(msg.sender == treasury, Unauthorized());
        _;
    }

    /// @inheritdoc IFeeCollector
    function setTreasury(address _treasury) external override onlyTreasury {
        emit TreasuryChanged(treasury, _treasury);

        treasury = _treasury;
    }

    /// @inheritdoc IFeeCollector
    function setTreasuryFees(
        uint256 _treasuryFees
    ) external override onlyTreasury {
        require(_treasuryFees <= BASIS, FTL());
        emit TreasuryFeesChanged(treasuryFees, _treasuryFees);

        treasuryFees = _treasuryFees;
    }

    /// @notice for tokenless deployments, disable fee distribution until ve system exists
    function setIsLive(bool status) external onlyTreasury {
        isTokenLive = status;
    }

    /// @inheritdoc IFeeCollector
    function collectProtocolFees(IRamsesV3Pool pool) external override {
        /// @dev get tokens
        IERC20 token0 = IERC20(pool.token0());
        IERC20 token1 = IERC20(pool.token1());

        /// @dev check if there's a gauge
        IVoter _voter = voter;
        address gauge = _voter.gaugeForPool(address(pool));
        bool isAlive = _voter.isAlive(gauge);

        /// @dev check if it's a cl gauge redirected to another gauge
        if (gauge == address(0) || !isAlive) {
            address toPool = _voter.poolRedirect(address(pool));
            gauge = _voter.gaugeForPool(address(toPool));
            isAlive = _voter.isAlive(gauge);
        }

        /// @dev if there's no gauge, there's no fee distributor, send everything to the treasury directly
        if (gauge == address(0) || !isAlive || !isTokenLive) {
            (uint128 _amount0, uint128 _amount1) = pool.collectProtocol(
                treasury,
                type(uint128).max,
                type(uint128).max
            );

            emit FeesCollected(address(pool), 0, 0, _amount0, _amount1);
            return;
        }

        /// @dev get the fee distributor
        IFeeDistributor feeDist = IFeeDistributor(
            _voter.feeDistributorForGauge(gauge)
        );

        /// @dev using uint128.max here since the pool automatically determines the owed amount
        pool.collectProtocol(
            address(this),
            type(uint128).max,
            type(uint128).max
        );

        /// @dev get balances, not using the return values in case of transfer fees
        uint256 amount0 = token0.balanceOf(address(this));
        uint256 amount1 = token1.balanceOf(address(this));

        uint256 amount0Treasury;
        uint256 amount1Treasury;

        /// @dev put into memory to save gas
        uint256 _treasuryFees = treasuryFees;
        if (_treasuryFees != 0) {
            amount0Treasury = (amount0 * _treasuryFees) / BASIS;
            amount1Treasury = (amount1 * _treasuryFees) / BASIS;

            amount0 = amount0 - amount0Treasury;
            amount1 = amount1 - amount1Treasury;

            address _treasury = treasury;
            /// @dev only send fees if > 0, prevents reverting on distribution
            if (amount0Treasury > 0)
                token0.safeTransfer(_treasury, amount0Treasury);
            if (amount1Treasury > 0)
                token1.safeTransfer(_treasury, amount1Treasury);
        }

        /// @dev approve then notify the fee distributor
        if (amount0 > 0) {
            token0.approve(address(feeDist), amount0);
            feeDist.notifyRewardAmount(address(token0), amount0);
        }
        if (amount1 > 0) {
            token1.approve(address(feeDist), amount1);
            feeDist.notifyRewardAmount(address(token1), amount1);
        }

        emit FeesCollected(
            address(pool),
            amount0,
            amount1,
            amount0Treasury,
            amount1Treasury
        );
    }
}
