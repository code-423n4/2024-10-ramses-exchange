// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import {AccessControlEnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/extensions/AccessControlEnumerableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {AccessManagedUpgradeable} from "@openzeppelin/contracts-upgradeable/access/manager/AccessManagedUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {RewardClaimers} from "./libraries/RewardClaimers.sol";

import {IVoter} from "./interfaces/IVoter.sol";

import {IGaugeV3} from "./CL/gauge/interfaces/IGaugeV3.sol";

import {IFeeDistributor} from "./interfaces/IFeeDistributor.sol";
import {IFeeDistributorFactory} from "./interfaces/IFeeDistributorFactory.sol";
import {IGauge} from "./interfaces/IGauge.sol";
import {IGaugeFactory} from "./interfaces/IGaugeFactory.sol";
import {IMinter} from "./interfaces/IMinter.sol";
import {IPair} from "./interfaces/IPair.sol";
import {IPairFactory} from "./interfaces/IPairFactory.sol";
import {IPairFees} from "./interfaces/IPairFees.sol";
import {IPairFeeFactory} from "./interfaces/IPairFeeFactory.sol";
import {IVotingEscrow} from "./interfaces/IVotingEscrow.sol";

import {IRamsesV3Factory} from "./CL/core/interfaces/IRamsesV3Factory.sol";
import "./CL/core/interfaces/IRamsesV3Pool.sol";
import {IClGaugeFactory} from "./CL/gauge/interfaces/IClGaugeFactory.sol";
import "./CL/gauge/interfaces/IFeeCollector.sol";
import {IRebaseDistributor} from "./interfaces/IRebaseDistributor.sol";

contract Voter is
    IVoter,
    Initializable,
    AccessControlEnumerableUpgradeable,
    ReentrancyGuardUpgradeable,
    AccessManagedUpgradeable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    error ActiveGauge(address gauge);

    error InactiveGauge();

    error AlreadyWhitelisted();

    error Unauthorized(address caller);

    error NotWhitelisted();

    error NotPool();

    error IsForbidden();

    error Uninitialized();

    error LengthMismatch();

    error NoGauge();

    address public legacyFactory;
    address public emissionsToken;
    address public gaugefactory;
    address public feeDistributorFactory;
    address public minter;
    address public governor;
    address public clFactory;
    address public clGaugeFactory;
    address public nfpManager;
    address public pairFeeFactory;
    address public votingEscrow;
    address public rebaseDistributor;

    uint256 internal constant DURATION = 7 days;
    EnumerableSet.AddressSet pools;
    EnumerableSet.AddressSet customPools;
    EnumerableSet.AddressSet gauges;
    EnumerableSet.AddressSet feeDistributors;

    mapping(address pool => address gauge) public gaugeForPool;
    mapping(address gauge => address pool) public poolForGauge;
    mapping(address gauge => address feeDistributor)
        public feeDistributorForGauge;

    mapping(address pool => mapping(uint256 period => uint256 totalVotes))
        public poolTotalVotesPerPeriod;
    mapping(uint256 tokenId => mapping(uint256 period => mapping(address pool => uint256 totalVote)))
        public tokenIdVotesForPoolPerPeriod;
    mapping(uint256 tokenId => mapping(uint256 period => address[] pools))
        public tokenIdVotedPoolsPerPeriod;
    mapping(uint256 tokenId => mapping(uint256 period => uint256 votingPower))
        public tokenIdVotingPowerPerPeriod;
    mapping(uint256 tokenId => uint256 period) public lastVoted;

    mapping(uint256 period => uint256 rewards) public totalRewardPerPeriod;
    mapping(uint256 period => uint256 weight) public totalVotesPerPeriod;

    mapping(address gauge => mapping(uint256 period => bool distributed))
        public gaugePeriodDistributed;

    mapping(address gauge => uint256 period) public lastDistro;

    mapping(address gauge => bool legacyGauge) public isLegacyGauge;
    mapping(address gauge => bool arbitraryGauge) public isArbitraryGauge;
    mapping(address => bool) public isWhitelisted;
    mapping(address => bool) public isAlive;
    mapping(address => bool) public isForbidden;
    mapping(address => bool) public isClGauge;

    mapping(address token0 => mapping(address token1 => bool stable))
        internal _mainCurveIsStable;
    mapping(address token0 => mapping(address token1 => mapping(bool stable => address gauge)))
        internal _gaugeForLegacyPool;

    /// @dev How many different CL pools there are for the same token pair
    mapping(address token0 => mapping(address token1 => int24[]))
        internal _tickSpacingsForPair;
    mapping(address token0 => mapping(address token1 => int24))
        internal _mainTickSpacingForPair;
    mapping(address token0 => mapping(address token1 => mapping(int24 tickSpacing => address gauge)))
        internal _gaugeForClPool;
    /// @dev this is only exposed to retrieve addresses, use feeDistributorForGauge for the most up-to-date data
    mapping(address clGauge => address feeDist) public feeDistributorForClGauge;
    /// @dev redirects votes from other tick spacings/curve to the main pool
    mapping(address fromPool => address toPool) public poolRedirect;

    // End of storage slots //

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    struct InitializeInputs {
        address _emissionsToken;
        address _legacyFactory;
        address _gauges;
        address _feeDistributorFactory;
        address _minter;
        address _msig;
        address _clFactory;
        address _clGaugeFactory;
        address _nfpManager;
        address _pairFeeFactory;
        address _accessManager;
        address _votingEscrow;
        address _rebaseDistributor;
    }

    function initialize(
        InitializeInputs calldata inputs,
        address[] calldata _tokens
    ) external initializer {
        __ReentrancyGuard_init();
        __AccessManaged_init(inputs._accessManager);

        legacyFactory = inputs._legacyFactory;
        emissionsToken = inputs._emissionsToken;
        gaugefactory = inputs._gauges;
        feeDistributorFactory = inputs._feeDistributorFactory;
        minter = inputs._minter;
        governor = inputs._msig;
        pairFeeFactory = inputs._pairFeeFactory;
        votingEscrow = inputs._votingEscrow;

        for (uint256 i = 0; i < _tokens.length; ++i) {
            isWhitelisted[_tokens[i]] = true;
            emit Whitelisted(msg.sender, _tokens[i]);
        }

        clFactory = inputs._clFactory;
        clGaugeFactory = inputs._clGaugeFactory;
        nfpManager = inputs._nfpManager;

        rebaseDistributor = inputs._rebaseDistributor;
    }

    ////////////////////////////////
    // Governance Gated Functions //
    ////////////////////////////////

    /// @inheritdoc IVoter
    function setGovernor(address _governor) external restricted {
        governor = _governor;
        emit NewGovernor(msg.sender, _governor);
    }
    /// @inheritdoc IVoter
    function whitelist(address _token) public restricted {
        if (isWhitelisted[_token]) revert AlreadyWhitelisted();
        isWhitelisted[_token] = true;
        /// @dev ensure token is not forbidden when whitelisting
        isForbidden[_token] = false;
        emit Whitelisted(msg.sender, _token);
    }
    /// @inheritdoc IVoter
    function forbid(address _token) public restricted {
        if (isForbidden[_token]) revert IsForbidden();
        isForbidden[_token] = true;
        /// @dev remove from whitelist when forbidding
        isWhitelisted[_token] = false;
        emit Forbidden(msg.sender, _token, true);
    }
    /// @inheritdoc IVoter
    function killGauge(address _gauge) public restricted {
        if (!isAlive[_gauge]) revert InactiveGauge();
        isAlive[_gauge] = false;
        address pool = poolForGauge[_gauge];
        if (isLegacyGauge[_gauge]) {
            /// @dev killed legacy gauges behave the same whether it has a main gauge or not
            bool FeeSplitWhenNoGauge = IPairFactory(legacyFactory)
                .feeSplitWhenNoGauge();
            if (FeeSplitWhenNoGauge) {
                /// @dev What used to go to PairFees will go to treasury
                /// @dev we are assuming voter.governor is the intended receiver (== factory.treasury)
                IPairFactory(legacyFactory).setPairFees(pool, governor);
            } else {
                /// @dev the fees are handed to LPs instead of pairFees
                IPairFactory(legacyFactory).setPairFees(pool, address(0));
            }
        }

        uint256 _lastDistro = lastDistro[_gauge];
        uint256 currentPeriod = getPeriod();
        uint256 _claimable;
        for (uint256 period = _lastDistro; period <= currentPeriod; period++) {
            if (!gaugePeriodDistributed[_gauge][period]) {
                uint256 additionalClaimable = _claimablePerPeriod(pool, period);
                _claimable += additionalClaimable;

                /// @dev prevent gaugePeriodDistributed being marked true when the minter hasn't updated yet
                if (additionalClaimable > 0) {
                    gaugePeriodDistributed[_gauge][period] = true;
                }
            }
        }

        if (_claimable > 0) {
            IERC20(emissionsToken).transfer(governor, _claimable);
        }

        lastDistro[_gauge] = currentPeriod;
        emit GaugeKilled(_gauge);
    }
    /// @inheritdoc IVoter
    function reviveGauge(address _gauge) public restricted {
        if (isAlive[_gauge]) revert ActiveGauge(_gauge);
        isAlive[_gauge] = true;
        if (isLegacyGauge[_gauge]) {
            address pool = poolForGauge[_gauge];
            address pairFees = IPairFeeFactory(pairFeeFactory).pairFeesForPair(
                pool
            );
            IPairFactory(legacyFactory).setPairFees(pool, pairFees);
        }
        lastDistro[_gauge] = getPeriod();
        emit GaugeRevived(_gauge);
    }
    /// @inheritdoc IVoter
    ///@dev in case of emission stuck due to killed gauges and unsupported operations
    function stuckEmissionsRecovery(
        address _gauge,
        uint256 _period
    ) external restricted {
        if (isAlive[_gauge]) revert ActiveGauge(_gauge);

        if (!gaugePeriodDistributed[_gauge][_period]) {
            address pool = poolForGauge[_gauge];
            uint256 _claimable = _claimablePerPeriod(pool, _period);

            if (_claimable > 0) {
                IERC20(emissionsToken).transfer(governor, _claimable);
                gaugePeriodDistributed[_gauge][_period] = true;
            }
        }
    }
    /// @inheritdoc IVoter
    function whitelistGaugeRewards(
        address _gauge,
        address _reward
    ) external restricted {
        if (isClGauge[_gauge]) {
            IGaugeV3(_gauge).addRewards(_reward);
        } else {
            IGauge(_gauge).whitelistReward(_reward);
        }
    }
    /// @inheritdoc IVoter
    function removeGaugeRewardWhitelist(
        address _gauge,
        address _reward
    ) external restricted {
        if (isClGauge[_gauge]) {
            IGaugeV3(_gauge).removeRewards(_reward);
        } else {
            IGauge(_gauge).removeRewardWhitelist(_reward);
        }
    }

    ////////////
    // Voting //
    ////////////

    /// @inheritdoc IVoter
    function reset(uint256 tokenId) external {
        IVotingEscrow(votingEscrow).checkAuthorizedOrDelegated(
            msg.sender,
            tokenId
        );

        _reset(tokenId);
    }

    function _reset(uint256 tokenId) internal {
        /// @dev voting for the next period
        uint256 nextPeriod = getPeriod() + 1;
        address[] storage votedPools = tokenIdVotedPoolsPerPeriod[tokenId][
            nextPeriod
        ];
        uint256 votingPower = tokenIdVotingPowerPerPeriod[tokenId][nextPeriod];
        if (votingPower > 0) {
            IRebaseDistributor(rebaseDistributor)._withdraw(
                votingPower,
                tokenId
            );
            for (uint256 i; i < votedPools.length; i++) {
                uint256 userVote = tokenIdVotesForPoolPerPeriod[tokenId][
                    nextPeriod
                ][votedPools[i]];

                poolTotalVotesPerPeriod[votedPools[i]][nextPeriod] -= userVote;
                delete tokenIdVotesForPoolPerPeriod[tokenId][nextPeriod][
                    votedPools[i]
                ];
                address gauge = gaugeForPool[votedPools[i]];
                address feeDistributor = isClGauge[gauge]
                    ? feeDistributorForClGauge[gauge]
                    : feeDistributorForGauge[gauge];
                IFeeDistributor(feeDistributor)._withdraw(userVote, tokenId);

                emit Abstained(tokenId, userVote);
            }
            totalVotesPerPeriod[nextPeriod] -= votingPower;
            delete tokenIdVotingPowerPerPeriod[tokenId][nextPeriod];
            delete tokenIdVotedPoolsPerPeriod[tokenId][nextPeriod];
        }
    }
    /// @inheritdoc IVoter
    function poke(uint256 tokenId) external {
        uint256 _lastVoted = lastVoted[tokenId] + 1;
        /// @dev hasn't voted yet
        if (_lastVoted == 1) return;
        /// @dev re-cast last vote
        address[] storage votedPools = tokenIdVotedPoolsPerPeriod[tokenId][
            _lastVoted
        ];
        uint256 votingPower = tokenIdVotingPowerPerPeriod[tokenId][_lastVoted];
        if (votingPower == 0) return;

        uint256 poolsLength = votedPools.length;
        uint256[] memory voteWeights = new uint256[](poolsLength);
        address[] memory votePools = new address[](poolsLength);

        for (uint256 i; i < poolsLength; i++) {
            votePools[i] = votedPools[i];
            voteWeights[i] = tokenIdVotesForPoolPerPeriod[tokenId][_lastVoted][
                votedPools[i]
            ];
        }

        _vote(tokenId, votePools, voteWeights);
    }
    /// @inheritdoc IVoter
    function getPeriod() public view returns (uint256 period) {
        period = (block.timestamp / 1 weeks);
    }
    /// @inheritdoc IVoter
    function vote(
        uint256 tokenId,
        address[] calldata _pools,
        uint256[] calldata _weights
    ) external {
        /// @dev check authorization of the caller for the tokenId
        IVotingEscrow(votingEscrow).checkAuthorizedOrDelegated(
            msg.sender,
            tokenId
        );
        /// @dev if there's a mismatch in the lengths, revert
        if (_pools.length != _weights.length) {
            revert LengthMismatch();
        }
        _vote(tokenId, _pools, _weights);
    }

    function _vote(
        uint256 tokenId,
        address[] memory _pools,
        uint256[] memory _weights
    ) internal {
        /// @dev voting for the next period
        uint256 nextPeriod = getPeriod() + 1; 

        _reset(tokenId);

        uint256 votingPower = IVotingEscrow(votingEscrow).votingPower(tokenId);
        uint256 totalUsedWeight;
        /// @dev can be different from votingPower due to rounding, invalid pools, etc.
        /// @dev tracking totalUsedWeight lessens the amount of emission token stuck in voter
        /// @dev since wasted votes means there's more difference between
        /// @dev the summed total of votes and totalVotesPerPeriod

        uint256 totalVoteWeight;
        for (uint256 i; i < _pools.length; i++) {
            totalVoteWeight += _weights[i];
        }

        /// @dev To make sure the recorded pools are all valid so there's no problem with poke and reset
        address[] memory validPools = new address[](_pools.length);
        uint256 validPoolsLength;

        for (uint256 i; i < _pools.length; i++) {
            /// @dev redirect votes if needed
            address redirectedPool = poolRedirect[_pools[i]];
            if (redirectedPool != address(0)) {
                _pools[i] = redirectedPool;
            }

            address _gauge = gaugeForPool[_pools[i]];

            /// @dev to avoid repeated votes
            /// @dev arbitrary gauges shouldn't get votes
            if (
                isAlive[_gauge] &&
                !isArbitraryGauge[_gauge] &&
                tokenIdVotesForPoolPerPeriod[tokenId][nextPeriod][_pools[i]] ==
                0
            ) {
                uint256 _poolWeight = (_weights[i] * votingPower) /
                    totalVoteWeight;

                if (_weights[i] == 0) {
                    continue;
                }

                validPools[validPoolsLength] = _pools[i];
                validPoolsLength++;

                poolTotalVotesPerPeriod[_pools[i]][nextPeriod] += _poolWeight;
                totalUsedWeight += _poolWeight;
                tokenIdVotesForPoolPerPeriod[tokenId][nextPeriod][
                    _pools[i]
                ] = _poolWeight;

                IFeeDistributor(feeDistributorForGauge[_gauge])._deposit(
                    _poolWeight,
                    tokenId
                );

                emit Voted(tokenId, _poolWeight);
            }
        }

        /// @dev trim validPools length if needed
        if (validPoolsLength != _pools.length) {
            assembly ("memory-safe") {
                mstore(validPools, validPoolsLength)
            }
        }

        tokenIdVotingPowerPerPeriod[tokenId][nextPeriod] = totalUsedWeight;
        totalVotesPerPeriod[nextPeriod] += totalUsedWeight;

        /// @dev 'check' into the active rebasing
        IRebaseDistributor(rebaseDistributor)._deposit(
            totalUsedWeight,
            tokenId
        );
        /// @dev update voting mappings
        tokenIdVotedPoolsPerPeriod[tokenId][nextPeriod] = validPools;
        lastVoted[tokenId] = nextPeriod - 1;
    }

    ////////////////////
    // Gauge Creation //
    ////////////////////

    /// @inheritdoc IVoter
    function createGauge(address _pool) external returns (address) {
        /// @dev if the gauge for the pool already exists, revert
        if (gaugeForPool[_pool] != address(0)) {
            revert ActiveGauge(gaugeForPool[_pool]);
        }
        /// @dev check if the pair exists
        bool isPair = IPairFactory(legacyFactory).isPair(_pool);
        if (!isPair) revert NotPool();

        (, , , , bool stable, address token0, address token1) = IPair(_pool)
            .metadata();
        /// @dev if the msg.sender is not the governor - revert before creation
        if (msg.sender != governor) {
            if (isForbidden[token0] || isForbidden[token1])
                revert IsForbidden();
            if (!isWhitelisted[token0] || !isWhitelisted[token1]) {
                revert NotWhitelisted();
            }
        }

        address pairFees = IPairFeeFactory(pairFeeFactory).createPairFees(
            _pool
        );
        address _feeDistributor = IFeeDistributorFactory(feeDistributorFactory)
            .createFeeDistributor(pairFees);

        IPairFees(pairFees).initialize(_feeDistributor);
        IPairFactory(legacyFactory).setPairFees(_pool, pairFees);

        uint256 feeSplit = IPair(_pool).feeSplit();
        if (feeSplit == 0) {
            address _legacyFactory = legacyFactory;
            feeSplit = IPairFactory(_legacyFactory).feeSplit();
            IPairFactory(_legacyFactory).setPairFeeSplit(_pool, feeSplit);
        }

        address _gauge = IGaugeFactory(gaugefactory).createGauge(_pool);

        IERC20(emissionsToken).approve(_gauge, type(uint256).max);
        feeDistributorForGauge[_gauge] = _feeDistributor;
        gaugeForPool[_pool] = _gauge;
        poolForGauge[_gauge] = _pool;
        isAlive[_gauge] = true;
        pools.add(_pool);
        gauges.add(_gauge);
        feeDistributors.add(_feeDistributor);
        isLegacyGauge[_gauge] = true;
        lastDistro[_gauge] = getPeriod();
        emit GaugeCreated(_gauge, msg.sender, _feeDistributor, _pool);

        {
            _gaugeForLegacyPool[token0][token1][stable] = _gauge;

            bool mainCurveIsStable = _mainCurveIsStable[token0][token1];
            address mainGauge = _gaugeForLegacyPool[token0][token1][
                mainCurveIsStable
            ];

            /// @dev check if the other curve exists
            if (mainGauge == address(0)) {
                /// @dev populate _mainCurveIsStable if no other gauge
                _mainCurveIsStable[token0][token1] = stable;

                emit MainCurveChanged(token0, token1, stable);
            } else {
                /// @dev redirect future votes and fee distributor to the main curve instead
                /// @dev if there is already a main curve, new gauges that aren't the main curve aren't alive by default
                poolRedirect[_pool] = poolForGauge[mainGauge];

                killGauge(_gauge);
            }
        }

        return _gauge;
    }
    /// @inheritdoc IVoter
    function createCLGauge(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external returns (address) {
        /// @dev fetch the pool by tickspacing
        address _pool = IRamsesV3Factory(clFactory).getPool(
            tokenA,
            tokenB,
            tickSpacing
        );
        /// @dev if the pool does not exist, revert
        if (_pool == address(0)) revert NotPool();
        /// @dev check reentrancy lock
        (, , , , , , bool unlocked) = IRamsesV3Pool(_pool).slot0();
        if (!unlocked) revert Uninitialized();
        /// @dev if a gauge for the pool already exists
        if (gaugeForPool[_pool] != address(0)) {
            revert ActiveGauge(gaugeForPool[_pool]);
        }
        /// @dev if the caller is not the governor
        if (msg.sender != governor) {
            if (isForbidden[tokenA] || isForbidden[tokenB])
                revert IsForbidden();
            if (!isWhitelisted[tokenA] || !isWhitelisted[tokenB]) {
                revert NotWhitelisted();
            }
        }

        address _feeCollector = IRamsesV3Factory(clFactory).feeCollector();
        address _feeDistributor = IFeeDistributorFactory(feeDistributorFactory)
            .createFeeDistributor(_feeCollector);
        address _gauge = IClGaugeFactory(clGaugeFactory).createGauge(_pool);
        /// @dev infinite approval to the gauge so voter can distribute emissions
        IERC20(emissionsToken).approve(_gauge, type(uint256).max);
        feeDistributorForClGauge[_gauge] = _feeDistributor;
        gaugeForPool[_pool] = _gauge;
        poolForGauge[_gauge] = _pool;
        lastDistro[_gauge] = getPeriod();
        /// @dev add to set
        pools.add(_pool);
        gauges.add(_gauge);
        feeDistributors.add(_feeDistributor);

        isClGauge[_gauge] = true;
        /// @dev assigns the pool's feeProtocol based on the factory
        IRamsesV3PoolOwnerActions(_pool).setFeeProtocol();
        emit GaugeCreated(_gauge, msg.sender, _feeDistributor, _pool);

        {
            (address token0, address token1) = _sortTokens(tokenA, tokenB);

            _tickSpacingsForPair[token0][token1].push(tickSpacing);
            _gaugeForClPool[token0][token1][tickSpacing] = _gauge;

            int24 mainTickSpacing = _mainTickSpacingForPair[token0][token1];
            if (mainTickSpacing == 0) {
                /// @dev populate _mainTickSpacingForPair if empty
                _mainTickSpacingForPair[token0][token1] = tickSpacing;
                feeDistributorForGauge[_gauge] = _feeDistributor;
                isAlive[_gauge] = true;

                emit MainTickSpacingChanged(token0, token1, tickSpacing);
            } else {
                if (msg.sender != governor) revert Unauthorized(msg.sender);

                /// @dev redirect future votes and fee distributor to the main tick spacing instead
                /// @dev if there is already a main tick spacing, new gauges that aren't the main tick spacing aren't alive by default
                address mainGauge = _gaugeForClPool[token0][token1][
                    mainTickSpacing
                ];
                poolRedirect[_pool] = poolForGauge[mainGauge];
                feeDistributorForGauge[_gauge] = feeDistributorForClGauge[
                    mainGauge
                ];

                emit GaugeKilled(_gauge);
            }
        }

        return _gauge;
    }
    /// @inheritdoc IVoter
    function createArbitraryGauge(
        address _token
    ) external restricted returns (address _newGauge) {
        /// @dev if there exists a gauge for the stake token, revert
        if (gaugeForPool[_token] != address(0)) {
            revert ActiveGauge(gaugeForPool[_token]);
        }
        address _gauge = IGaugeFactory(gaugefactory).createGauge(_token);

        IERC20(emissionsToken).approve(_gauge, type(uint256).max);
        gaugeForPool[_token] = _gauge;
        poolForGauge[_gauge] = _token;
        isAlive[_gauge] = true;
        customPools.add(_token);
        gauges.add(_gauge);
        isArbitraryGauge[_gauge] = true;
        lastDistro[_gauge] = getPeriod();

        emit CustomGaugeCreated(_gauge, msg.sender, _token);

        return _gauge;
    }
    /// @inheritdoc IVoter
    function setMainCurve(
        address tokenA,
        address tokenB,
        bool stable
    ) external restricted {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        address mainGauge = _gaugeForLegacyPool[token0][token1][stable];
        if (mainGauge == address(0)) revert NoGauge();
        address mainPool = poolForGauge[mainGauge];
        _mainCurveIsStable[token0][token1] = stable;
        poolRedirect[mainPool] = mainPool;

        /// @dev direct future votes to new main gauge
        /// @dev already cast votes won't be moved, voters should update their votes or call poke()
        /// @dev change feeDist for gauges to the main feeDist, so FeeCollector sends fees to the right place
        /// @dev kill from gauge if needed
        address fromGauge = _gaugeForLegacyPool[token0][token1][!stable];
        if (fromGauge != address(0)) {
            address fromPool = poolForGauge[fromGauge];
            poolRedirect[fromPool] = mainPool;

            /// @dev kill gauges if needed
            if (isAlive[fromGauge]) {
                killGauge(fromGauge);
            }
        }

        /// @dev revive main gauge if needed
        if (!isAlive[mainGauge]) {
            reviveGauge(mainGauge);
        }

        emit MainCurveChanged(token0, token1, stable);
    }
    /// @inheritdoc IVoter
    function setMainTickSpacing(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external restricted {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        address mainGauge = _gaugeForClPool[token0][token1][tickSpacing];
        if (mainGauge == address(0)) revert NoGauge();
        address mainPool = poolForGauge[mainGauge];
        address mainFeeDist = feeDistributorForClGauge[mainGauge];
        _mainTickSpacingForPair[token0][token1] = tickSpacing;
        uint256 _gaugeLength = _tickSpacingsForPair[token0][token1].length;

        /// @dev direct future votes to new main gauge
        /// @dev already cast votes won't be moved, voters should update their votes or call poke()
        /// @dev change feeDist for gauges to the main feeDist, so FeeCollector sends fees to the right place
        /// @dev kill from gauge if needed
        for (uint256 i = 0; i < _gaugeLength; i++) {
            int24 _fromTickSapcing = _tickSpacingsForPair[token0][token1][i];
            address _fromGauge = _gaugeForClPool[token0][token1][
                _fromTickSapcing
            ];
            address _fromPool = poolForGauge[_fromGauge];
            poolRedirect[_fromPool] = mainPool;
            feeDistributorForGauge[_fromGauge] = mainFeeDist;

            /// @dev kill gauges if needed
            if (_fromGauge != mainGauge && isAlive[_fromGauge]) {
                killGauge(_fromGauge);
            }
        }

        /// @dev revive main gauge if needed
        if (!isAlive[mainGauge]) {
            reviveGauge(mainGauge);
        }

        emit MainTickSpacingChanged(token0, token1, tickSpacing);
    }

    /////////////////////////////
    // One-stop Reward Claimer //
    /////////////////////////////

    /// @inheritdoc IVoter
    function claimClGaugeRewards(
        address[] calldata _gauges,
        address[][] calldata _tokens,
        uint256[][] calldata _nfpTokenIds
    ) external {
        RewardClaimers.claimClGaugeRewards(
            nfpManager,
            _gauges,
            _tokens,
            _nfpTokenIds
        );
    }
    /// @inheritdoc IVoter
    function claimIncentives(
        uint256 tokenId,
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external {
        RewardClaimers.claimIncentives(
            votingEscrow,
            tokenId,
            _feeDistributors,
            _tokens
        );
    }
    /// @inheritdoc IVoter
    function claimRewards(
        address[] calldata _gauges,
        address[][] calldata _tokens
    ) external {
        RewardClaimers.claimRewards(_gauges, _tokens);
    }

    //////////////////////////
    // Emission Calculation //
    //////////////////////////

    /// @inheritdoc IVoter
    function notifyRewardAmount(uint256 amount) external {
        /// @dev prevents bricking distribute
        if (msg.sender != minter) revert Unauthorized(msg.sender);

        IERC20(emissionsToken).transferFrom(msg.sender, address(this), amount);
        uint256 period = getPeriod();
        totalRewardPerPeriod[period] += amount;
        emit NotifyReward(msg.sender, emissionsToken, amount);
    }

    ///////////////////////////
    // Emission Distribution //
    ///////////////////////////

    function _distribute(
        address _gauge,
        uint256 _claimable,
        uint256 _period
    ) internal nonReentrant {
        if (isAlive[_gauge]) {
            if (_claimable == 0) return;

            if (gaugePeriodDistributed[_gauge][_period]) return;

            /// @dev can only distribute if the distributed amount / week > 0 and is > left()
            bool canDistribute = true;

            if (_claimable > 0) {
                if (
                    _claimable / DURATION == 0 ||
                    _claimable < IGauge(_gauge).left(emissionsToken)
                ) {
                    canDistribute = false;
                }
            }

            if (canDistribute) {
                gaugePeriodDistributed[_gauge][_period] = true;

                if (_claimable > 0) {
                    /// @dev notify emissions
                    IGauge(_gauge).notifyRewardAmount(
                        emissionsToken,
                        _claimable
                    );
                }

                emit DistributeReward(msg.sender, _gauge, _claimable);
            }
        }
    }
    /// @inheritdoc IVoter
    function distribute(address _gauge) public {
        IMinter(minter).updatePeriod();
        uint256 _lastDistro = lastDistro[_gauge];
        uint256 currentPeriod = getPeriod();
        address pool = poolForGauge[_gauge];

        for (
            uint256 period = _lastDistro + 1;
            period <= currentPeriod;
            period++
        ) {
            uint256 claimable = _claimablePerPeriod(pool, period);
            _distribute(_gauge, claimable, period);
        }

        if (_lastDistro != currentPeriod) {
            if (isClGauge[_gauge]) {
                IRamsesV3Pool(pool)._advancePeriod();
                address feeCollector = IRamsesV3Factory(clFactory)
                    .feeCollector();
                IFeeCollector(feeCollector).collectProtocolFees(
                    IRamsesV3Pool(pool)
                );
            } else if (isLegacyGauge[_gauge]) {
                IPair(pool).mintFee();
                address pairFees = IPairFeeFactory(pairFeeFactory)
                    .pairFeesForPair(pool);
                IPairFees(pairFees).notifyFees();
            }
            /// @dev no actions needed for custom gauge
        }

        lastDistro[_gauge] = currentPeriod;
    }
    /// @inheritdoc IVoter
    function distributeForPeriod(address _gauge, uint256 _period) public {
        IMinter(minter).updatePeriod();
        address pool = poolForGauge[_gauge];
        uint256 claimable = _claimablePerPeriod(pool, _period);

        /// @dev we dont update lastDistro here, nor push fees

        _distribute(_gauge, claimable, _period);
    }
    /// @inheritdoc IVoter
    function distributeAll() external {
        uint256 gaugesLength = gauges.length();
        for (uint256 i; i < gaugesLength; i++) {
            distribute(gauges.at(i));
        }
    }
    /// @inheritdoc IVoter
    function batchDistribute(address[] calldata _gauges) external {
        for (uint256 i; i < _gauges.length; ++i) {
            distribute(_gauges[i]);
        }
    }
    /// @inheritdoc IVoter
    function batchDistributeByIndexNoPush(
        uint256 startIndex,
        uint256 endIndex
    ) external {
        uint256 gaugesLength = gauges.length();

        if (endIndex > gaugesLength) {
            endIndex = gaugesLength;
        }

        /// @dev distribute without pushing fees for updating last
        for (uint256 i = startIndex; i < endIndex; i++) {
            distributeForPeriod(gauges.at(i), getPeriod());
        }
    }

    /// @inheritdoc IVoter
    function batchDistributeByIndex(
        uint256 startIndex,
        uint256 endIndex
    ) external {
        uint256 gaugesLength = gauges.length();

        if (endIndex > gaugesLength) {
            endIndex = gaugesLength;
        }

        for (uint256 i = startIndex; i < endIndex; i++) {
            distribute(gauges.at(i));
        }
    }

    ////////////////////
    // View Functions //
    ////////////////////

    /// @inheritdoc IVoter
    function getVotes(
        uint256 tokenId
    ) external view returns (address[] memory votes, uint256[] memory weights) {
        uint256 nextPeriod = getPeriod() + 1;
        votes = tokenIdVotedPoolsPerPeriod[tokenId][nextPeriod];
        weights = new uint256[](votes.length);

        for (uint256 i; i < votes.length; i++) {
            weights[i] = tokenIdVotesForPoolPerPeriod[tokenId][nextPeriod][
                votes[i]
            ];
        }
    }
    /// @inheritdoc IVoter
    function getAllPools() external view returns (address[] memory _pools) {
        _pools = pools.values();
    }
    /// @inheritdoc IVoter
    function getAllCustomPools()
        external
        view
        returns (address[] memory _customPools)
    {
        _customPools = customPools.values();
    }
    /// @inheritdoc IVoter
    function getAllGauges() external view returns (address[] memory _gauges) {
        _gauges = gauges.values();
    }
    /// @inheritdoc IVoter
    function getAllFeeDistributors()
        external
        view
        returns (address[] memory _feeDistributors)
    {
        _feeDistributors = feeDistributors.values();
    }
    /// @inheritdoc IVoter
    function isGauge(address _gauge) external view returns (bool) {
        return gauges.contains(_gauge);
    }
    /// @inheritdoc IVoter
    function isFeeDistributor(
        address _feeDistributor
    ) external view returns (bool) {
        return feeDistributors.contains(_feeDistributor);
    }
    /// @inheritdoc IVoter
    function mainCurveForPair(
        address tokenA,
        address tokenB
    ) public view returns (bool) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        return _mainCurveIsStable[token0][token1];
    }
    /// @inheritdoc IVoter
    function tickSpacingsForPair(
        address tokenA,
        address tokenB
    ) public view returns (int24[] memory) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        return _tickSpacingsForPair[token0][token1];
    }
    /// @inheritdoc IVoter
    function mainTickSpacingForPair(
        address tokenA,
        address tokenB
    ) public view returns (int24) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        return _mainTickSpacingForPair[token0][token1];
    }
    /// @inheritdoc IVoter
    function gaugeForLegacyPool(
        address tokenA,
        address tokenB,
        bool stable
    ) public view returns (address) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        return _gaugeForLegacyPool[token0][token1][stable];
    }

    /// @inheritdoc IVoter
    function gaugeForClPool(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) public view returns (address) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);

        return _gaugeForClPool[token0][token1][tickSpacing];
    }

    function _claimablePerPeriod(
        address pool,
        uint256 period
    ) internal view returns (uint256) {
        uint256 numerator = (totalRewardPerPeriod[period] *
            poolTotalVotesPerPeriod[pool][period]) * 1e18;

        /// @dev return 0 if this happens, or else there could be a divide by zero next
        if (numerator == 0) {
            return 0;
        }

        return numerator / totalVotesPerPeriod[period] / 1e18;
    }

    function _sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        token0 = tokenA < tokenB ? tokenA : tokenB;
        token1 = token0 == tokenA ? tokenB : tokenA;
    }
}
