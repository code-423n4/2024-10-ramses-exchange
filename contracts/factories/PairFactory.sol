// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import {IPairFactory} from "../interfaces/IPairFactory.sol";
import {IPair} from "./../interfaces/IPair.sol";
import {Pair} from "./../Pair.sol";

contract PairFactory is IPairFactory, AccessManaged {
    error FeeTooHigh();
    error ZeroFee();
    error IA();
    error ZA();
    error PE();
    error Unauthorized();
    error InvalidFeeSplit();

    /// @inheritdoc IPairFactory
    address public immutable voter;
    /// @inheritdoc IPairFactory
    address public treasury;

    address public immutable pairFeeFactory;

    uint256 public fee;
    /// @dev max swap fee set to 10%
    uint256 public constant MAX_FEE = 100_000;
    uint256 public feeSplit;

    mapping(address token0 => mapping(address token1 => mapping(bool stable => address pair)))
        public getPair;
    address[] public allPairs;
    /// @dev simplified check if its a pair, given that `stable` flag might not be available in peripherals
    mapping(address pair => bool isPair) public isPair;

    /// @dev pair => fee
    mapping(address pair => uint256 fee) public _pairFee;

    /// @dev whether the pair has skim enabled or not
    mapping(address pair => bool skimEnabled) public skimEnabled;

    /// @dev if enabled, fee split to treasury if no gauge
    bool public feeSplitWhenNoGauge;

    constructor(
        address _voter,
        address msig,
        address _accessManager,
        address _pairFeeFactory
    ) AccessManaged(_accessManager) {
        /// @dev default of 0.30%
        fee = 3000;
        voter = _voter;
        treasury = msig;
        pairFeeFactory = _pairFeeFactory;
    }

    modifier restrictedOrVoter() {
        _restrictedOrVoter();
        _;
    }

    function _restrictedOrVoter() private {
        if (msg.sender != voter) {
            _checkCanCall(msg.sender, msg.data);
        }
    }
    /// @inheritdoc IPairFactory
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }
    /// @inheritdoc IPairFactory
    function setFee(uint256 _fee) external restricted {
        if (_fee > MAX_FEE) revert FeeTooHigh();
        if (_fee == 0) revert ZeroFee();
        fee = _fee;
        emit SetFee(_fee);
    }
    /// @inheritdoc IPairFactory
    function setPairFee(address _pair, uint256 _fee) external restricted {
        if (_fee > MAX_FEE) revert FeeTooHigh();
        _pairFee[_pair] = _fee;
        /// @dev if _fee is set to 0, fallback to default fee for the pair
        IPair(_pair).setFee(_fee == 0 ? fee : _fee);
        emit SetPairFee(_pair, _fee);
    }
    /// @inheritdoc IPairFactory
    function pairFee(address _pair) public view returns (uint256) {
        uint256 __pairFee = _pairFee[_pair];
        if (__pairFee == 0) {
            return fee;
        } else {
            return __pairFee;
        }
    }

    /// @inheritdoc IPairFactory
    function setTreasury(address _treasury) external restricted {
        treasury = _treasury;
        emit NewTreasury(msg.sender, _treasury);
    }
    /// @inheritdoc IPairFactory
    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(abi.encodePacked(type(Pair).creationCode));
    }
    /// @inheritdoc IPairFactory
    /// @notice allow feeSplit directly to treasury if pairFees (gauge) does not exist
    function setFeeSplitWhenNoGauge(bool status) external restricted {
        feeSplitWhenNoGauge = status;
        emit FeeSplitWhenNoGauge(msg.sender, status);
    }
    /// @inheritdoc IPairFactory
    /// @notice set the percent of fee growth to mint in BP (9500 to mint 95% of fees)
    function setFeeSplit(uint256 _feeSplit) external restricted {
        if (_feeSplit > 10000) revert InvalidFeeSplit();
        feeSplit = _feeSplit;
        emit SetFeeSplit(_feeSplit);
    }
    /// @inheritdoc IPairFactory
    function setPairFeeSplit(
        address _pair,
        uint256 _feeSplit
    ) external restrictedOrVoter {
        if (_feeSplit > 10000) revert InvalidFeeSplit();
        IPair(_pair).setFeeSplit(_feeSplit);
        emit SetPairFeeSplit(_pair, _feeSplit);
    }
    /// @inheritdoc IPairFactory
    function createPair(
        address tokenA,
        address tokenB,
        bool stable
    ) external returns (address pair) {
        if (tokenA == tokenB) revert IA();
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        if (token0 == address(0)) revert ZA();
        if (getPair[token0][token1][stable] != address(0)) revert PE();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1, stable));

        pair = address(new Pair{salt: salt}());

        /// @dev initialize the pair upon creation
        IPair(pair).initialize(token0, token1, stable);
        IPair(pair).setFee(pairFee(pair));

        if (feeSplitWhenNoGauge) {
            IPair(pair).setPairFees(treasury);
            IPair(pair).setFeeSplit(feeSplit);
        }

        getPair[token0][token1][stable] = pair;
        /// @dev populate mapping in the reverse direction
        getPair[token1][token0][stable] = pair;
        allPairs.push(pair);
        isPair[pair] = true;

        emit PairCreated(token0, token1, pair, allPairs.length);
    }
    /// @inheritdoc IPairFactory
    function setPairFees(
        address _pair,
        address _pairFees
    ) external restrictedOrVoter {
        IPair(_pair).setPairFees(_pairFees);
        emit SetPairFees(_pair, _pairFees);
    }
    /// @inheritdoc IPairFactory
    /// @dev function restrict or enable skim functionality on legacy pairs
    function setSkimEnabled(
        address _pair,
        bool _status
    ) external restrictedOrVoter {
        if (skimEnabled[_pair] != _status) skimEnabled[_pair] = _status;
        emit SkimStatus(_pair, _status);
    }
}
