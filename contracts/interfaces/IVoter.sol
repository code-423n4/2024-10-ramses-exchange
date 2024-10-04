// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;
pragma abicoder v2;

interface IVoter {
    event GaugeCreated(
        address indexed gauge,
        address creator,
        address feeDistributor,
        address indexed pool
    );

    event GaugeKilled(address indexed gauge);

    event GaugeRevived(address indexed gauge);

    event Voted(uint256 indexed tokenId, uint256 weight);

    event Abstained(uint256 tokenId, uint256 weight);

    event Deposit(
        address indexed lp,
        address indexed gauge,
        uint256 tokenId,
        uint256 amount
    );

    event Withdraw(
        address indexed lp,
        address indexed gauge,
        uint256 tokenId,
        uint256 amount
    );

    event NotifyReward(
        address indexed sender,
        address indexed reward,
        uint256 amount
    );

    event DistributeReward(
        address indexed sender,
        address indexed gauge,
        uint256 amount
    );

    event NewGovernor(address indexed sender, address indexed governor);

    event Whitelisted(address indexed whitelister, address indexed token);

    event Forbidden(
        address indexed forbidder,
        address indexed token,
        bool status
    );

    event CustomGaugeCreated(
        address indexed gauge,
        address creator,
        address indexed token
    );

    event MainTickSpacingChanged(
        address indexed token0,
        address indexed token1,
        int24 indexed newMainTickSpacing
    );

    event MainCurveChanged(
        address indexed token0,
        address indexed token1,
        bool indexed stable
    );

    /// @notice returns the address of the current governor
    /// @return _governor address of the governor
    function governor() external view returns (address _governor);

    /// @notice distributes emissions from the minter to the voter
    /// @param amount the amount of tokens to notify
    function notifyRewardAmount(uint256 amount) external;

    /// @notice distributes the emissions for a specific gauge
    /// @param _gauge the gauge address
    function distribute(address _gauge) external;

    /// @notice returns the address of the gauge factory
    /// @param _gaugeFactory gauge factory address
    function gaugefactory() external view returns (address _gaugeFactory);

    /// @notice returns the address of the feeDistributor factory
    /// @return _feeDistributorFactory feeDist factory address
    function feeDistributorFactory()
        external
        view
        returns (address _feeDistributorFactory);

    /// @notice returns the address of the minter contract
    /// @return _minter address of the minter
    function minter() external view returns (address _minter);

    /// @notice check if the gauge is active for governance use
    /// @param _gauge address of the gauge
    /// @return _trueOrFalse if the gauge is alive
    function isAlive(address _gauge) external view returns (bool _trueOrFalse);

    /// @notice allows the token to be paired with other whitelisted assets to participate in governance
    /// @param _token the address of the token
    function whitelist(address _token) external;

    /// @notice effectively disqualifies a token from governance
    /// @param _token the address of the token
    function forbid(address _token) external;

    /// @notice returns if the address is a gauge
    /// @param gauge address of the gauge
    /// @return _trueOrFalse boolean if the address is a gauge
    function isGauge(address gauge) external view returns (bool _trueOrFalse);

    /// @notice disable a gauge from governance
    /// @param _gauge address of the gauge
    function killGauge(address _gauge) external;

    /// @notice re-activate a dead gauge
    /// @param _gauge address of the gauge
    function reviveGauge(address _gauge) external;

    /// @notice re-cast a tokenID's votes
    /// @param tokenId the id of the veNFT
    function poke(uint256 tokenId) external;

    /// @notice set if a token pairing should be stable or volatile
    /// @param tokenA address of tokenA
    /// @param tokenB address of tokenB
    /// @param stable if the main curve should be stable or not
    function setMainCurve(address tokenA, address tokenB, bool stable) external;

    /// @notice sets the main tickspacing of a token pairing
    /// @param tokenA address of tokenA
    /// @param tokenB address of tokenB
    /// @param tickSpacing the main tickspacing to set to
    function setMainTickSpacing(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external;

    /// @notice create a legacy-type gauge for an arbitrary token
    /// @param _token 'token' to be used
    /// @return _arbitraryGauge the address of the new custom gauge
    function createArbitraryGauge(
        address _token
    ) external returns (address _arbitraryGauge);

    /// @notice returns if the address is a fee distributor
    /// @param _feeDistributor address of the feeDist
    /// @return _trueOrFalse if the address is a fee distributor
    function isFeeDistributor(
        address _feeDistributor
    ) external view returns (bool _trueOrFalse);

    /// @notice returns the address of the emission's token
    /// @return _emissionsToken emissions token contract address
    function emissionsToken() external view returns (address _emissionsToken);

    /// @notice returns the address of the pool's gauge, if any
    /// @param _pool pool address
    /// @return _gauge gauge address
    function gaugeForPool(address _pool) external view returns (address _gauge);

    /// @notice returns the address of the pool's feeDistributor, if any
    /// @param _gauge address of the gauge
    /// @return _feeDistributor address of the pool's feedist
    function feeDistributorForGauge(
        address _gauge
    ) external view returns (address _feeDistributor);

    /// @notice return the ve contract address
    /// @return ve address of the voting escrow contract
    function votingEscrow() external view returns (address ve);

    /// @notice returns the veNFT's voting power during a specific period
    /// @param tokenId id of the veNFT
    /// @param period the value of the period
    /// @return tokenIdVotingPowerPerPeriod the voting power for the period
    function tokenIdVotingPowerPerPeriod(
        uint256 tokenId,
        uint256 period
    ) external view returns (uint256 tokenIdVotingPowerPerPeriod);

    /// @notice returns the new toPool that was redirected fromPool
    /// @param fromPool address of the original pool
    /// @return toPool the address of the redirected pool
    function poolRedirect(
        address fromPool
    ) external view returns (address toPool);

    /// @notice returns the gauge address of a CL pool
    /// @param tokenA address of token A in the pair
    /// @param tokenB address of token B in the pair
    /// @param tickSpacing tickspacing of the pool
    /// @return gauge address of the gauge
    function gaugeForClPool(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external view returns (address gauge);

    /// @notice returns if the stable curve is the main
    /// @param tokenA address of token A in the pair
    /// @param tokenB address of token B in the pair
    /// @return _trueOrFalse if the main curve is stable or not
    function mainCurveForPair(
        address tokenA,
        address tokenB
    ) external view returns (bool _trueOrFalse);

    /// @notice returns the array of all tickspacings for the tokenA/tokenB combination
    /// @param tokenA address of token A in the pair
    /// @param tokenB address of token B in the pair
    /// @return _ts array of all the tickspacings
    function tickSpacingsForPair(
        address tokenA,
        address tokenB
    ) external view returns (int24[] memory _ts);

    /// @notice returns the main tickspacing used in the gauge/governance process
    /// @param tokenA address of token A in the pair
    /// @param tokenB address of token B in the pair
    /// @return _ts the main tickspacing
    function mainTickSpacingForPair(
        address tokenA,
        address tokenB
    ) external view returns (int24 _ts);

    /// @notice returns the gauge for a legacy pair
    /// @param tokenA address of token A in the pair
    /// @param tokenB address of token B in the pair
    /// @param stable boolean if the legacy pool is stable or not
    /// @return _gauge address of the gauge
    function gaugeForLegacyPool(
        address tokenA,
        address tokenB,
        bool stable
    ) external view returns (address _gauge);

    /// @notice returns the block.timestamp divided by 1 week in seconds
    /// @return period the period used for gauges
    function getPeriod() external view returns (uint256 period);

    /// @notice cast a vote to direct emissions to gauges and earn incentives
    /// @param tokenId id of the veNFT
    /// @param _pools the list of pools to vote on
    /// @param _weights an arbitrary weight per pool which will be normalized to 100% regardless of numerical inputs
    function vote(
        uint256 tokenId,
        address[] calldata _pools,
        uint256[] calldata _weights
    ) external;

    /// @notice reset the vote of a veNFT
    /// @param tokenId id of the veNFT
    function reset(uint256 tokenId) external;

    /// @notice set the governor address
    /// @param _governor the new governor address
    function setGovernor(address _governor) external;

    /// @notice recover stuck emissions
    /// @param _gauge the gauge address
    /// @param _period the period
    function stuckEmissionsRecovery(address _gauge, uint256 _period) external;

    /// @notice whitelists extra rewards for a gauge
    /// @param _gauge the gauge to whitelist rewards to
    /// @param _reward the reward to whitelist
    function whitelistGaugeRewards(address _gauge, address _reward) external;

    /// @notice removes a reward from the gauge whitelist
    /// @param _gauge the gauge to remove the whitelist from
    /// @param _reward the reward to remove from the whitelist
    function removeGaugeRewardWhitelist(
        address _gauge,
        address _reward
    ) external;

    /// @notice creates a legacy gauge for the pool
    /// @param _pool pool's address
    /// @return _gauge address of the new gauge
    function createGauge(address _pool) external returns (address _gauge);

    /// @notice create a concentrated liquidity gauge
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param tickSpacing the tickspacing of the pool
    /// @return _clGauge address of the new gauge
    function createCLGauge(
        address tokenA,
        address tokenB,
        int24 tickSpacing
    ) external returns (address _clGauge);

    /// @notice claim concentrated liquidity gauge rewards for specific NFP token ids
    /// @param _gauges array of gauges
    /// @param _tokens two dimensional array for the tokens to claim
    /// @param _nfpTokenIds two dimensional array for the NFPs
    function claimClGaugeRewards(
        address[] calldata _gauges,
        address[][] calldata _tokens,
        uint256[][] calldata _nfpTokenIds
    ) external;

    /// @notice claim arbitrary rewards from specific feeDists
    /// @param _feeDistributors address of the feeDists
    /// @param _tokens two dimensional array for the tokens to claim
    function claimIncentives(
        uint256 tokenId,
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external;

    /// @notice claim arbitrary rewards from specific gauges
    /// @param _gauges address of the gauges
    /// @param _tokens two dimensional array for the tokens to claim
    function claimRewards(
        address[] calldata _gauges,
        address[][] calldata _tokens
    ) external;

    /// @notice distribute emissions to a gauge for a specific period
    /// @param _gauge address of the gauge
    /// @param _period value of the period
    function distributeForPeriod(address _gauge, uint256 _period) external;

    /// @notice attempt distribution of emissions to all gauges
    function distributeAll() external;

    function batchDistribute(address[] calldata _gauges) external;
    /// @notice distribute emissions to gauges by index
    /// @param startIndex start of the loop
    /// @param endIndex end of the loop
    function batchDistributeByIndex(
        uint256 startIndex,
        uint256 endIndex
    ) external;

    /// @notice distribute emissions to gauges by index without pushing fees or updating lastDistro
    /// @param startIndex start of the loop
    /// @param endIndex end of the loop
    function batchDistributeByIndexNoPush(
        uint256 startIndex,
        uint256 endIndex
    ) external;

    /// @notice returns the votes cast for a tokenID
    /// @param tokenId id of the veNFT
    /// @return votes an array of votes casted
    /// @return weights an array of the weights casted per pool
    function getVotes(
        uint256 tokenId
    ) external view returns (address[] memory votes, uint256[] memory weights);

    /// @notice returns an array of all the pools
    /// @return _pools the array of pools
    function getAllPools() external view returns (address[] memory _pools);

    /// @notice returns an array of all the custom pools
    /// @return _customPools the array of custom pools
    function getAllCustomPools()
        external
        view
        returns (address[] memory _customPools);

    /// @notice returns an array of all the gauges
    /// @return _gauges the array of gauges
    function getAllGauges() external view returns (address[] memory _gauges);

    /// @notice returns an array of all the feeDists
    /// @return _feeDistributors the array of feeDists
    function getAllFeeDistributors()
        external
        view
        returns (address[] memory _feeDistributors);
}
