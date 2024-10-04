// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;
pragma abicoder v2;

import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import {ERC721Enumerable, IERC165} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol';
import {Multicall} from '@openzeppelin/contracts/utils/Multicall.sol';

import {IRamsesV3Pool} from '../core/interfaces/IRamsesV3Pool.sol';
import {FixedPoint128} from '../core/libraries/FixedPoint128.sol';
import {FullMath} from '../core/libraries/FullMath.sol';

import {INonfungiblePositionManager, IERC721, IERC721Metadata} from './interfaces/INonfungiblePositionManager.sol';
import {INonfungibleTokenPositionDescriptor} from './interfaces/INonfungibleTokenPositionDescriptor.sol';
import {PositionKey} from './libraries/PositionKey.sol';
import {PoolAddress} from './libraries/PoolAddress.sol';
import {LiquidityManagement} from './base/LiquidityManagement.sol';
import {PeripheryImmutableState} from './base/PeripheryImmutableState.sol';
import {PeripheryValidation} from './base/PeripheryValidation.sol';
import {PoolInitializer} from './base/PoolInitializer.sol';

import {IGaugeV3} from '../gauge/interfaces/IGaugeV3.sol';
import {IVoter} from '../../interfaces/IVoter.sol';

/// @title NFT positions
/// @notice Wraps Ramses V3 positions in the ERC721 non-fungible token interface
contract NonfungiblePositionManager is
    Multicall,
    PeripheryImmutableState,
    PoolInitializer,
    LiquidityManagement,
    PeripheryValidation,
    ERC721,
    ERC721Enumerable,
    INonfungiblePositionManager
{
    /// @dev details about the Ramses position
    struct Position {
        /// @dev the ID of the pool with which this token is connected
        uint80 poolId;
        /// @dev the tick range of the position
        int24 tickLower;
        int24 tickUpper;
        /// @dev the liquidity of the position
        uint128 liquidity;
        /// @dev the fee growth of the aggregate position as of the last action on the individual position
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        /// @dev how many uncollected tokens are owed to the position, as of the last computation
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    /// @dev IDs of pools assigned by this contract
    mapping(address pool => uint80 id) private _poolIds;

    /// @dev Pool keys by pool ID, to save on SSTOREs for position data
    mapping(uint80 id => PoolAddress.PoolKey key) private _poolIdToPoolKey;

    /// @dev The token ID position data
    mapping(uint256 tokenId => Position position) private _positions;

    /// @dev The ID of the next token that will be minted. Skips 0
    uint176 private _nextId = 1;
    /// @dev The ID of the next pool that is used for the first time. Skips 0
    uint80 private _nextPoolId = 1;

    /// @dev The address of the token descriptor contract, which handles generating token URIs for position tokens
    address private immutable _tokenDescriptor;

    address private immutable voter;

    constructor(
        address _deployer,
        address _WETH9,
        address _tokenDescriptor_,
        address _voter
    ) ERC721('Ramses V3 Positions NFT', 'RAM-V3-NFP') PeripheryImmutableState(_deployer, _WETH9) {
        _tokenDescriptor = _tokenDescriptor_;
        voter = _voter;
    }

    /// @inheritdoc INonfungiblePositionManager
    function positions(
        uint256 tokenId
    )
        external
        view
        override
        returns (
            address token0,
            address token1,
            int24 tickSpacing,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position memory position = _positions[tokenId];
        if (position.poolId == 0) revert InvalidTokenId(tokenId);
        PoolAddress.PoolKey memory poolKey = _poolIdToPoolKey[position.poolId];
        return (
            poolKey.token0,
            poolKey.token1,
            poolKey.tickSpacing,
            position.tickLower,
            position.tickUpper,
            position.liquidity,
            position.feeGrowthInside0LastX128,
            position.feeGrowthInside1LastX128,
            position.tokensOwed0,
            position.tokensOwed1
        );
    }

    /// @dev Caches a pool key
    function cachePoolKey(address pool, PoolAddress.PoolKey memory poolKey) private returns (uint80 poolId) {
        poolId = _poolIds[pool];
        if (poolId == 0) {
            _poolIds[pool] = (poolId = _nextPoolId++);
            _poolIdToPoolKey[poolId] = poolKey;
        }
    }

    /// @inheritdoc INonfungiblePositionManager
    function mint(
        MintParams calldata params
    )
        external
        payable
        override
        checkDeadline(params.deadline)
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        IRamsesV3Pool pool;
        unchecked {
            tokenId = _nextId++;
        }
        (liquidity, amount0, amount1, pool) = addLiquidity(
            AddLiquidityParams({
                token0: params.token0,
                token1: params.token1,
                tickSpacing: params.tickSpacing,
                recipient: address(this),
                index: tokenId,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min
            })
        );

        _mint(params.recipient, tokenId);

        bytes32 positionKey = PositionKey.compute(address(this), tokenId, params.tickLower, params.tickUpper);
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);

        /// @dev idempotent set
        uint80 poolId = cachePoolKey(
            address(pool),
            PoolAddress.PoolKey({token0: params.token0, token1: params.token1, tickSpacing: params.tickSpacing})
        );

        _positions[tokenId] = Position({
            poolId: poolId,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            feeGrowthInside0LastX128: feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: feeGrowthInside1LastX128,
            tokensOwed0: 0,
            tokensOwed1: 0
        });

        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    modifier isAuthorizedForToken(uint256 tokenId) {
        address owner = _ownerOf(tokenId);
        _checkAuthorized(owner, msg.sender, tokenId);
        _;
    }

    function tokenURI(uint256 tokenId) public view override(ERC721, IERC721Metadata) returns (string memory) {
        _requireOwned(tokenId);
        return INonfungibleTokenPositionDescriptor(_tokenDescriptor).tokenURI(this, tokenId);
    }

    /// @inheritdoc INonfungiblePositionManager
    function increaseLiquidity(
        IncreaseLiquidityParams calldata params
    )
        external
        payable
        override
        checkDeadline(params.deadline)
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        Position storage position = _positions[params.tokenId];

        PoolAddress.PoolKey memory poolKey = _poolIdToPoolKey[position.poolId];

        IRamsesV3Pool pool;
        (liquidity, amount0, amount1, pool) = addLiquidity(
            AddLiquidityParams({
                token0: poolKey.token0,
                token1: poolKey.token1,
                tickSpacing: poolKey.tickSpacing,
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                amount0Desired: params.amount0Desired,
                amount1Desired: params.amount1Desired,
                amount0Min: params.amount0Min,
                amount1Min: params.amount1Min,
                recipient: address(this),
                index: params.tokenId
            })
        );

        bytes32 positionKey = PositionKey.compute(
            address(this),
            params.tokenId,
            position.tickLower,
            position.tickUpper
        );

        /// @dev this is now updated to the current transaction
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);

        unchecked {
            position.tokensOwed0 += uint128(
                FullMath.mulDiv(
                    feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,
                    position.liquidity,
                    FixedPoint128.Q128
                )
            );
            position.tokensOwed1 += uint128(
                FullMath.mulDiv(
                    feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,
                    position.liquidity,
                    FixedPoint128.Q128
                )
            );
        }

        position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;

        unchecked {
            position.liquidity += liquidity;
        }

        emit IncreaseLiquidity(params.tokenId, liquidity, amount0, amount1);
    }

    /// @inheritdoc INonfungiblePositionManager
    function decreaseLiquidity(
        DecreaseLiquidityParams calldata params
    )
        external
        payable
        override
        isAuthorizedForToken(params.tokenId)
        checkDeadline(params.deadline)
        returns (uint256 amount0, uint256 amount1)
    {
        require(params.liquidity > 0);
        Position storage position = _positions[params.tokenId];

        uint128 positionLiquidity = position.liquidity;
        require(positionLiquidity >= params.liquidity);

        PoolAddress.PoolKey memory poolKey = _poolIdToPoolKey[position.poolId];
        IRamsesV3Pool pool = IRamsesV3Pool(PoolAddress.computeAddress(deployer, poolKey));
        (amount0, amount1) = pool.burn(params.tokenId, position.tickLower, position.tickUpper, params.liquidity);

        if (amount0 < params.amount0Min || amount1 < params.amount1Min) revert CheckSlippage();

        bytes32 positionKey = PositionKey.compute(
            address(this),
            params.tokenId,
            position.tickLower,
            position.tickUpper
        );
        /// @dev this is now updated to the current transaction
        (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(positionKey);

        unchecked {
            position.tokensOwed0 +=
                uint128(amount0) +
                uint128(
                    FullMath.mulDiv(
                        feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,
                        positionLiquidity,
                        FixedPoint128.Q128
                    )
                );
            position.tokensOwed1 +=
                uint128(amount1) +
                uint128(
                    FullMath.mulDiv(
                        feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,
                        positionLiquidity,
                        FixedPoint128.Q128
                    )
                );
        }

        position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
        position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        /// @dev subtraction is safe because we checked positionLiquidity is gte params.liquidity
        unchecked {
            position.liquidity = positionLiquidity - params.liquidity;
        }

        emit DecreaseLiquidity(params.tokenId, params.liquidity, amount0, amount1);
    }

    /// @inheritdoc INonfungiblePositionManager
    function collect(
        CollectParams calldata params
    ) external payable override isAuthorizedForToken(params.tokenId) returns (uint256 amount0, uint256 amount1) {
        require(params.amount0Max > 0 || params.amount1Max > 0);
        /// @dev allow collecting to the nft position manager address with address 0
        address recipient = params.recipient == address(0) ? address(this) : params.recipient;

        Position storage position = _positions[params.tokenId];

        PoolAddress.PoolKey memory poolKey = _poolIdToPoolKey[position.poolId];

        IRamsesV3Pool pool = IRamsesV3Pool(PoolAddress.computeAddress(deployer, poolKey));

        (uint128 tokensOwed0, uint128 tokensOwed1) = (position.tokensOwed0, position.tokensOwed1);

        /// @dev trigger an update of the position fees owed and fee growth snapshots if it has any liquidity
        if (position.liquidity > 0) {
            pool.burn(params.tokenId, position.tickLower, position.tickUpper, 0);
            (, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, , ) = pool.positions(
                PositionKey.compute(address(this), params.tokenId, position.tickLower, position.tickUpper)
            );

            unchecked {
                tokensOwed0 += uint128(
                    FullMath.mulDiv(
                        feeGrowthInside0LastX128 - position.feeGrowthInside0LastX128,
                        position.liquidity,
                        FixedPoint128.Q128
                    )
                );
                tokensOwed1 += uint128(
                    FullMath.mulDiv(
                        feeGrowthInside1LastX128 - position.feeGrowthInside1LastX128,
                        position.liquidity,
                        FixedPoint128.Q128
                    )
                );
            }

            position.feeGrowthInside0LastX128 = feeGrowthInside0LastX128;
            position.feeGrowthInside1LastX128 = feeGrowthInside1LastX128;
        }

        /// @dev compute the arguments to give to the pool#collect method
        (uint128 amount0Collect, uint128 amount1Collect) = (
            params.amount0Max > tokensOwed0 ? tokensOwed0 : params.amount0Max,
            params.amount1Max > tokensOwed1 ? tokensOwed1 : params.amount1Max
        );

        /// @dev the actual amounts collected are returned
        (amount0, amount1) = pool.collect(
            recipient,
            params.tokenId,
            position.tickLower,
            position.tickUpper,
            amount0Collect,
            amount1Collect
        );

        /// @dev sometimes there will be a few less wei than expected due to rounding down in core, but we just subtract the full amount expected
        /// @dev instead of the actual amount so we can burn the token
        unchecked {
            (position.tokensOwed0, position.tokensOwed1) = (tokensOwed0 - amount0Collect, tokensOwed1 - amount1Collect);
        }

        emit Collect(params.tokenId, recipient, amount0Collect, amount1Collect);
    }

    /// @inheritdoc INonfungiblePositionManager
    function burn(uint256 tokenId) external payable override isAuthorizedForToken(tokenId) {
        Position storage position = _positions[tokenId];
        if (position.liquidity > 0 || position.tokensOwed0 > 0 || position.tokensOwed1 > 0) revert NotCleared();
        delete _positions[tokenId];
        _burn(tokenId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, IERC165, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function getReward(uint256 tokenId, address[] calldata tokens) external isAuthorizedForToken(tokenId) {
        Position storage position = _positions[tokenId];

        PoolAddress.PoolKey memory poolKey = _poolIdToPoolKey[position.poolId];
        IGaugeV3 gauge = IGaugeV3(IVoter(voter).gaugeForPool(PoolAddress.computeAddress(deployer, poolKey)));

        gauge.getRewardForOwner(tokenId, tokens);
    }
}
