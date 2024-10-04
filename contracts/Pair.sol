// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20Extended} from "./interfaces/IERC20Extended.sol";
import {UQ112x112} from "./libraries/UQ112x112.sol";
import {IPairCallee} from "./interfaces/IPairCallee.sol";
import {IPairFactory} from "./interfaces/IPairFactory.sol";
import {IPair} from "./interfaces/IPair.sol";

contract Pair is IPair, ERC20, ReentrancyGuard {
    using UQ112x112 for uint224;

    error Unauthorized();
    /// @dev safe transfer failed
    error STF();
    error OVERFLOW();
    /// @dev skim disabled
    error SD();
    /// @dev insufficient liquidity minted
    error ILM();
    /// @dev insufficient liquidity burned
    error ILB();
    /// @dev insufficient output amount
    error IOA();
    /// @dev insufficient input amount
    error IIA();
    error IL();
    error IT();
    error K();

    /// @notice min liquidity amount which is burned on creation
    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;

    /// @notice legacy factory address
    address public immutable factory;
    /// @notice token0 in the pool
    address public token0;
    /// @notice token1 in the pool
    address public token1;
    /// @notice where the swap fees accrue to
    address public pairFees;

    /// @dev uses single storage slot, accessible via getReserves
    uint112 private reserve0;
    /// @dev uses single storage slot, accessible via getReserves
    uint112 private reserve1;
    /// @dev uses single storage slot, accessible via getReserves
    uint32 private blockTimestampLast;

    uint256 public reserve0CumulativeLast;
    uint256 public reserve1CumulativeLast;
    /// @dev reserve0 * reserve1, as of immediately after the most recent liquidity event
    uint256 public kLast;
    /// @dev the portion that goes to PairFees, rest goes to LPs. 100% of the fees goes to PairFees if it's set to 10000
    uint256 public feeSplit;
    uint256 public fee;

    uint256 internal decimals0;
    uint256 internal decimals1;
    /// @dev first MINIMUM_LIQUIDITY tokens are permanently locked
    uint256 internal constant MINIMUM_K = 10 ** 9;
    /// @dev 1m = 100%
    uint256 internal constant FEE_DENOM = 1_000_000;

    /// @notice whether the pool uses the xy(x^2 * y + y^2 * x) >= k swap curve
    bool public stable;

    string internal _name;
    string internal _symbol;
    constructor() ERC20("", "") {
        /// @dev initialize the factory address
        factory = msg.sender;
    }

    /// @inheritdoc IPair
    function initialize(
        address _token0,
        address _token1,
        bool _stable
    ) external {
        /// @dev prevent anyone other than the factory from calling
        require(msg.sender == factory, Unauthorized());
        token0 = _token0;
        token1 = _token1;

        string memory __name;
        string memory __symbol;
        stable = _stable;
        if (_stable) {
            __name = string(
                string.concat(
                    "Legacy Correlated- ",
                    IERC20Extended(token0).symbol(),
                    "/",
                    IERC20Extended(token1).symbol()
                )
            );
            __symbol = string(
                string.concat(
                    "cAMM-",
                    IERC20Extended(token0).symbol(),
                    "/",
                    IERC20Extended(token1).symbol()
                )
            );
        } else {
            __name = string(
                string.concat(
                    "Legacy Volatile- ",
                    IERC20Extended(token0).symbol(),
                    "/",
                    IERC20Extended(token1).symbol()
                )
            );
            __symbol = string(
                string.concat(
                    "vAMM-",
                    IERC20Extended(token0).symbol(),
                    "/",
                    IERC20Extended(token1).symbol()
                )
            );
        }

        _name = __name;
        _symbol = __symbol;

        decimals0 = 10 ** IERC20Extended(token0).decimals();
        decimals1 = 10 ** IERC20Extended(token1).decimals();
    }
    /// @inheritdoc IPair
    function getReserves()
        public
        view
        returns (
            uint112 _reserve0,
            uint112 _reserve1,
            uint32 _blockTimestampLast
        )
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) = token.call(
            abi.encodeCall(IERC20Extended.transfer, (to, value))
        );
        if (!(success && (data.length == 0 || abi.decode(data, (bool))))) {
            revert STF();
        }
    }

    /// @dev update reserves and, on the first call per block, reserve accumulators
    function _update(
        uint256 balance0,
        uint256 balance1,
        uint112 _reserve0,
        uint112 _reserve1
    ) private {
        require(
            balance0 <= type(uint112).max && balance1 <= type(uint112).max,
            OVERFLOW()
        );

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed;
        unchecked {
            /// @dev overflow is desired
            timeElapsed = blockTimestamp - blockTimestampLast;
            if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
                reserve0CumulativeLast += _reserve0 * timeElapsed;
                reserve1CumulativeLast += _reserve1 * timeElapsed;
            }
        }

        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    /// @dev if fee is on, mint liquidity up to the entire growth in sqrt(k)
    function _mintFee(
        uint112 _reserve0,
        uint112 _reserve1
    ) private returns (bool feeOn) {
        /// @dev goes to voters
        address _pairFees = pairFees;
        /// @dev gas savings
        uint256 _kLast = kLast;

        feeOn = _pairFees != address(0);

        if (feeOn) {
            /// @dev portion of protocol fees that go to PairFees
            uint256 _feeSplit = feeSplit;

            if (_kLast != 0) {
                if (stable) {
                    uint256 k = _k(_reserve0, _reserve1);

                    if (k > _kLast) {
                        uint256 fourthRoote18 = Math.sqrt(
                            Math.mulDiv(Math.sqrt(_kLast), 1e36, Math.sqrt(k))
                        );

                        uint256 numerator = _feeSplit *
                            (1e18 - fourthRoote18) *
                            1e18;
                        uint256 denominator = ((10000 * 1e18) -
                            (_feeSplit * (1e18 - fourthRoote18)));

                        /// @dev new liquidity to be minted
                        uint256 feeAsLiquidity = (totalSupply() * numerator) /
                            denominator /
                            1e18;

                        if (feeAsLiquidity > 0) {
                            _mint(_pairFees, feeAsLiquidity);
                        }
                    }
                } else {
                    uint256 rootK = Math.sqrt(
                        _k(uint256(_reserve0), uint256(_reserve1))
                    );
                    uint256 rootKLast = Math.sqrt(_kLast);
                    if (rootK > rootKLast) {
                        /// @dev P in UniswapV2 docs
                        uint256 dueToProtocol = ((rootK - rootKLast) *
                            _feeSplit) / 10000;

                        /// @dev d in UniswapV2 docs
                        uint256 dueToLp = rootKLast +
                            (((rootK - rootKLast) * (10000 - _feeSplit)) /
                                10000);

                        /// @dev new liquidity to be minted
                        /// @dev n = s*P/d
                        uint256 feeAsLiquidity = (totalSupply() *
                            dueToProtocol) / dueToLp;

                        if (feeAsLiquidity > 0) {
                            _mint(_pairFees, feeAsLiquidity);
                        }
                    }
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }
    /// @inheritdoc IPair
    /// @dev this low-level function should be called from a contract which performs important safety checks
    function mint(
        address to
    ) external nonReentrant returns (uint256 liquidity) {
        /// @dev gas savings
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        uint256 balance0 = IERC20Extended(token0).balanceOf(address(this));
        uint256 balance1 = IERC20Extended(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        /// @dev gas savings, must be defined here since totalSupply can update in _mintFee
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            /// @dev permanently lock the first MINIMUM_LIQUIDITY tokens
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
            if (stable) {
                require(_k(amount0, amount1) >= MINIMUM_K, K());
            }
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        if (liquidity == 0) revert ILM();
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        /// @dev reserve0 and reserve1 are up-to-date
        if (feeOn) kLast = _k(uint256(reserve0), uint256(reserve1));
        emit Mint(msg.sender, amount0, amount1);
    }
    /// @inheritdoc IPair
    /// @dev this low-level function should be called from a contract which performs important safety checks
    function burn(
        address to
    ) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        /// @dev gas savings
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        /// @dev gas savings
        address _token0 = token0;
        /// @dev gas savings
        address _token1 = token1;
        uint256 balance0 = IERC20Extended(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20Extended(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        bool feeOn = _mintFee(_reserve0, _reserve1);
        /// @dev gas savings, must be defined here since totalSupply can update in _mintFee
        uint256 _totalSupply = totalSupply();
        /// @dev using balances ensures pro-rata distribution
        amount0 = (liquidity * balance0) / _totalSupply;
        /// @dev using balances ensures pro-rata distribution
        amount1 = (liquidity * balance1) / _totalSupply;
        require(amount0 != 0 && amount1 != 0, ILB());

        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);
        balance0 = IERC20Extended(_token0).balanceOf(address(this));
        balance1 = IERC20Extended(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        /// @dev reserve0 and reserve1 are up-to-date
        if (feeOn) kLast = _k(reserve0, reserve1);
        emit Burn(msg.sender, amount0, amount1, to);
    }
    /// @inheritdoc IPair
    /// @dev this low-level function should be called from a contract which performs important safety checks
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external nonReentrant {
        require(amount0Out != 0 || amount1Out != 0, IOA());

        /// @dev gas savings
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves();
        require(amount0Out <= _reserve0 && amount1Out <= reserve1, IL());

        address _token0 = token0;
        address _token1 = token1;
        require(to != _token0 && to != _token1, IT());
        /// @dev optimistically transfer tokens
        if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out);
        /// @dev optimistically transfer tokens
        if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out);
        if (data.length > 0)
            IPairCallee(to).hook(msg.sender, amount0Out, amount1Out, data);
        uint256 balance0 = IERC20Extended(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20Extended(_token1).balanceOf(address(this));

        uint256 amount0In;
        uint256 amount1In;
        unchecked {
            amount0In = balance0 > _reserve0 - amount0Out
                ? balance0 - (_reserve0 - amount0Out)
                : 0;
            amount1In = balance1 > _reserve1 - amount1Out
                ? balance1 - (_reserve1 - amount1Out)
                : 0;
        }
        require(amount0In != 0 || amount1In != 0, IIA());

        /// @dev FEE_DENOM as the denominator invariant for calculating swap fees
        uint256 balance0Adjusted = balance0 - ((amount0In * fee) / FEE_DENOM);
        uint256 balance1Adjusted = balance1 - ((amount1In * fee) / FEE_DENOM);

        if (
            _k(balance0Adjusted, balance1Adjusted) <
            _k(uint256(_reserve0), uint256(_reserve1))
        ) revert K();

        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @inheritdoc IPair
    function skim(address to) external nonReentrant {
        /// @dev if skim disabled, revert
        /// @dev by default it is disabled as it uses a mapping in the pair factory contract
        require((IPairFactory(factory).skimEnabled(address(this))), SD());
        /// @dev gas savings
        address _token0 = token0;
        /// @dev gas savings
        address _token1 = token1;
        _safeTransfer(
            _token0,
            to,
            IERC20Extended(_token0).balanceOf(address(this)) - reserve0
        );
        _safeTransfer(
            _token1,
            to,
            IERC20Extended(_token1).balanceOf(address(this)) - reserve1
        );
    }

    /// @inheritdoc IPair
    function sync() external nonReentrant {
        _update(
            IERC20Extended(token0).balanceOf(address(this)),
            IERC20Extended(token1).balanceOf(address(this)),
            reserve0,
            reserve1
        );
    }
    /// @inheritdoc IPair
    function setPairFees(address _pairFees) external {
        require(msg.sender == factory, Unauthorized());
        pairFees = _pairFees;
    }
    /// @inheritdoc IPair
    function setFeeSplit(uint256 _feeSplit) external {
        require(msg.sender == factory, Unauthorized());
        feeSplit = _feeSplit;
    }
    /// @inheritdoc IPair
    function setFee(uint256 _fee) external {
        require(msg.sender == factory, Unauthorized());
        fee = _fee;
    }
    /// @inheritdoc IPair
    function mintFee() external nonReentrant {
        uint112 _reserve0 = reserve0;
        uint112 _reserve1 = reserve1;
        bool feeOn = _mintFee(_reserve0, _reserve1);

        if (feeOn) kLast = _k(uint256(_reserve0), uint256(_reserve1));
    }

    function _k(uint256 x, uint256 y) internal view returns (uint256) {
        if (stable) {
            uint256 _x = (x * 10 ** 18) / decimals0;
            uint256 _y = (y * 10 ** 18) / decimals1;
            uint256 _a = (_x * _y) / 10 ** 18;
            uint256 _b = ((_x * _x) / 10 ** 18 + (_y * _y) / 10 ** 18);
            /// @dev x3y+y3x >= k
            return (_a * _b) / 10 ** 18;
        } else {
            /// @dev xy >= k
            return x * y;
        }
    }

    function _f(uint256 x0, uint256 y) internal pure returns (uint256) {
        return
            (x0 * ((((y * y) / 1e18) * y) / 1e18)) /
            1e18 +
            (((((x0 * x0) / 1e18) * x0) / 1e18) * y) /
            1e18;
    }

    function _d(uint256 x0, uint256 y) internal pure returns (uint256) {
        return
            (3 * x0 * ((y * y) / 1e18)) /
            1e18 +
            ((((x0 * x0) / 1e18) * x0) / 1e18);
    }

    function _get_y(
        uint256 x0,
        uint256 xy,
        uint256 y
    ) internal pure returns (uint256) {
        for (uint256 i = 0; i < 255; ++i) {
            uint256 y_prev = y;
            uint256 k = _f(x0, y);
            if (k < xy) {
                uint256 dy = ((xy - k) * 1e18) / _d(x0, y);
                y = y + dy;
            } else {
                uint256 dy = ((k - xy) * 1e18) / _d(x0, y);
                y = y - dy;
            }
            if (y > y_prev) {
                if (y - y_prev <= 1) {
                    return y;
                }
            } else {
                if (y_prev - y <= 1) {
                    return y;
                }
            }
        }
        return y;
    }
    /// @inheritdoc IPair
    function getAmountOut(
        uint256 amountIn,
        address tokenIn
    ) external view returns (uint256) {
        (uint256 _reserve0, uint256 _reserve1) = (reserve0, reserve1);
        /// @dev remove fee from amount received
        amountIn -= (amountIn * fee) / FEE_DENOM;

        return _getAmountOut(amountIn, tokenIn, _reserve0, _reserve1) - 1;
    }

    function _getAmountOut(
        uint256 amountIn,
        address tokenIn,
        uint256 _reserve0,
        uint256 _reserve1
    ) internal view returns (uint256) {
        if (stable) {
            uint256 xy = _k(_reserve0, _reserve1);
            _reserve0 = (_reserve0 * 1e18) / decimals0;
            _reserve1 = (_reserve1 * 1e18) / decimals1;
            (uint256 reserveA, uint256 reserveB) = tokenIn == token0
                ? (_reserve0, _reserve1)
                : (_reserve1, _reserve0);
            amountIn = tokenIn == token0
                ? (amountIn * 1e18) / decimals0
                : (amountIn * 1e18) / decimals1;
            uint256 y = reserveB - _get_y(amountIn + reserveA, xy, reserveB);
            return (y * (tokenIn == token0 ? decimals1 : decimals0)) / 1e18;
        } else {
            (uint256 reserveA, uint256 reserveB) = tokenIn == token0
                ? (_reserve0, _reserve1)
                : (_reserve1, _reserve0);
            return (amountIn * reserveB) / (reserveA + amountIn);
        }
    }

    function metadata()
        external
        view
        returns (
            uint256 _decimals0,
            uint256 _decimals1,
            uint256 _reserve0,
            uint256 _reserve1,
            bool _stable,
            address _token0,
            address _token1
        )
    {
        return (
            decimals0,
            decimals1,
            reserve0,
            reserve1,
            stable,
            token0,
            token1
        );
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
}
