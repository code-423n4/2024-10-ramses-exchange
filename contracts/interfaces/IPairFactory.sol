// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPairFactory {
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256
    );

    event SetFee(uint256 indexed fee);

    event SetPairFee(address indexed pair, uint256 indexed fee);

    event SetFeeSplit(uint256 indexed _feeSplit);

    event SetPairFeeSplit(address indexed pair, uint256 indexed _feeSplit);

    event SkimStatus(address indexed _pair, bool indexed _status);

    event NewTreasury(address indexed _caller, address indexed _newTreasury);

    event FeeSplitWhenNoGauge(address indexed _caller, bool indexed _status);

    event SetPairFees(address indexed pair, address indexed pairFees);

    /// @notice returns the total length of legacy pairs
    /// @return _length the length
    function allPairsLength() external view returns (uint256 _length);

    /// @notice calculates if the address is a legacy pair
    /// @param pair the address to check
    /// @return _boolean the bool return
    function isPair(address pair) external view returns (bool _boolean);

    /// @notice calculates the pairCodeHash
    /// @return _hash the pair code hash
    function pairCodeHash() external view returns (bytes32 _hash);

    /// @param tokenA address of tokenA
    /// @param tokenB address of tokenB
    /// @param stable whether it uses the stable curve
    /// @return _pair the address of the pair
    function getPair(
        address tokenA,
        address tokenB,
        bool stable
    ) external view returns (address _pair);

    /// @notice creates a new legacy pair
    /// @param tokenA address of tokenA
    /// @param tokenB address of tokenB
    /// @param stable whether it uses the stable curve
    /// @return pair the address of the created pair
    function createPair(
        address tokenA,
        address tokenB,
        bool stable
    ) external returns (address pair);

    /// @notice the address of the voter
    /// @return _voter the address of the voter
    function voter() external view returns (address _voter);

    /// @notice returns the address of a pair based on the index
    /// @param _index the index to check for a pair
    /// @return _pair the address of the pair at the index
    function allPairs(uint256 _index) external view returns (address _pair);

    /// @notice the swap fee of a pair
    /// @param _pair the address of the pair
    /// @return _fee the fee
    function pairFee(address _pair) external view returns (uint256 _fee);

    /// @notice the split of fees
    /// @return _split the feeSplit
    function feeSplit() external view returns (uint256 _split);

    /// @notice sets the swap fee for a pair
    /// @param _pair the address of the pair
    /// @param _fee the fee for the pair
    function setPairFee(address _pair, uint256 _fee) external;

    /// @notice set the swap fees of the pair
    /// @param _fee the fee, scaled to MAX 10% of 100_000
    function setFee(uint256 _fee) external;

    /// @notice the address for the treasury
    /// @return _treasury address of the treasury
    function treasury() external view returns (address _treasury);

    /// @notice sets the pairFees contract
    /// @param _pair the address of the pair
    /// @param _pairFees the address of the new Pair Fees
    function setPairFees(address _pair, address _pairFees) external;

    /// @notice sets the feeSplit for a pair
    /// @param _pair the address of the pair
    /// @param _feeSplit the feeSplit
    function setPairFeeSplit(address _pair, uint256 _feeSplit) external;

    /// @notice whether there is feeSplit when there's no gauge
    /// @return _boolean whether there is a feesplit when no gauge
    function feeSplitWhenNoGauge() external view returns (bool _boolean);

    /// @notice whether a pair can be skimmed
    /// @param _pair the pair address
    /// @return _boolean whether skim is enabled
    function skimEnabled(address _pair) external view returns (bool _boolean);

    /// @notice set whether skim is enabled for a specific pair
    function setSkimEnabled(address _pair, bool _status) external;

    /// @notice sets a new treasury address
    /// @param _treasury the new treasury address
    function setTreasury(address _treasury) external;

    /// @notice set whether there should be a feesplit without gauges
    /// @param status whether enabled or not
    function setFeeSplitWhenNoGauge(bool status) external;

    /// @notice sets the feesSplit of the pair
    /// @param _feeSplit the fee split
    function setFeeSplit(uint256 _feeSplit) external;
}
