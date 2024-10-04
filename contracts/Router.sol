// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.20;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IERC20Extended} from "./interfaces/IERC20Extended.sol";
import {IPair} from "./interfaces/IPair.sol";
import {IPairFactory} from "./interfaces/IPairFactory.sol";
import {IVoter} from "./interfaces/IVoter.sol";
import {IGauge} from "./interfaces/IGauge.sol";
import {IRouter} from "./interfaces/IRouter.sol";
import {IWETH} from "./interfaces/IWETH.sol";

contract Router is IRouter {
    error Expired();
    error Identical();
    error ZeroAddress();
    error InsufficientAmount();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InvalidPath();
    error InsufficientBAmount();
    error InsufficientAAmount();
    error ExcessiveInputAmount();
    error ETHTransferFailed();
    error InvalidReserves();

    address public immutable factory;
    address public immutable WETH;
    uint256 internal constant MINIMUM_LIQUIDITY = 10 ** 3;
    bytes32 immutable pairCodeHash;
    /// @dev 1m = 100%
    uint256 internal constant FEE_DENOM = 1_000_000;

    modifier ensure(uint256 deadline) {
        require(block.timestamp <= deadline, Expired());
        _;
    }

    constructor(address _factory, address _weth) {
        factory = _factory;
        pairCodeHash = IPairFactory(_factory).pairCodeHash();
        WETH = _weth;
    }

    receive() external payable {
        /// @dev only accept ETH via fallback from the WETH contract
        assert(msg.sender == WETH);
    }

    /// @inheritdoc IRouter
    function sortTokens(
        address tokenA,
        address tokenB
    ) public pure returns (address token0, address token1) {
        require(tokenA != tokenB, Identical());
        (token0, token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), ZeroAddress());
    }

    /// @inheritdoc IRouter
    function pairFor(
        address tokenA,
        address tokenB,
        bool stable
    ) public view returns (address pair) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        pair = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            hex"ff",
                            factory,
                            keccak256(abi.encodePacked(token0, token1, stable)),
                            pairCodeHash /// @dev init code hash
                        )
                    )
                )
            )
        );
    }

    /// @dev given some amount of an asset and pair reserves, returns an equivalent amount of the other asset
    function quoteLiquidity(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) internal pure returns (uint256 amountB) {
        require(amountA != 0, InsufficientAmount());
        require(reserveA != 0 && reserveB != 0, InsufficientLiquidity());
        amountB = (amountA * reserveB) / reserveA;
    }

    /// @inheritdoc IRouter
    function getReserves(
        address tokenA,
        address tokenB,
        bool stable
    ) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0, ) = sortTokens(tokenA, tokenB);
        (uint256 reserve0, uint256 reserve1, ) = IPair(
            pairFor(tokenA, tokenB, stable)
        ).getReserves();
        (reserveA, reserveB) = tokenA == token0
            ? (reserve0, reserve1)
            : (reserve1, reserve0);
    }

    /// @inheritdoc IRouter
    function getAmountsOut(
        uint256 amountIn,
        route[] memory routes
    ) public view returns (uint256[] memory amounts) {
        require(routes.length >= 1, InvalidPath());
        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < routes.length; ++i) {
            address pair = pairFor(
                routes[i].from,
                routes[i].to,
                routes[i].stable
            );
            if (IPairFactory(factory).isPair(pair)) {
                amounts[i + 1] = IPair(pair).getAmountOut(
                    amounts[i],
                    routes[i].from
                );
            }
        }
    }

    function _k(
        uint256 x,
        uint256 y,
        bool _stable
    ) internal pure returns (uint256) {
        if (_stable) {
            uint256 _a = (x * y) / 10 ** 18;
            uint256 _b = ((x * x) / 10 ** 18 + (y * y) / 10 ** 18);
            return (_a * _b) / 10 ** 18; /// @dev x3y+y3x >= k
        } else {
            return x * y; /// @dev xy >= k
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

    /// @inheritdoc IRouter
    function getAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) public view returns (uint256 amount, bool stable) {
        address pair = pairFor(tokenIn, tokenOut, true);
        uint256 amountStable;
        uint256 amountVolatile;
        if (IPairFactory(factory).isPair(pair)) {
            amountStable = IPair(pair).getAmountOut(amountIn, tokenIn);
        }
        pair = pairFor(tokenIn, tokenOut, false);
        if (IPairFactory(factory).isPair(pair)) {
            amountVolatile = IPair(pair).getAmountOut(amountIn, tokenIn);
        }
        return
            amountStable > amountVolatile
                ? (amountStable, true)
                : (amountVolatile, false);
    }

    function _getAmountIn(
        uint256 amountOut,
        address tokenIn,
        address tokenOut,
        bool stable
    ) internal view returns (uint256 amountIn) {
        require(amountOut != 0, InsufficientOutputAmount());
        address pair = pairFor(tokenIn, tokenOut, stable);
        uint256 fee = IPairFactory(factory).pairFee(pair);

        (
            uint256 decimals0,
            uint256 decimals1,
            uint256 reserve0,
            uint256 reserve1,
            ,
            address token0,

        ) = IPair(pair).metadata();

        require(reserve0 != 0 && reserve1 != 0, InvalidReserves());

        /// @dev normalize the decimals
        reserve0 = (reserve0 * 1e18) / decimals0;
        reserve1 = (reserve1 * 1e18) / decimals1;
        amountOut = tokenOut == token0
            ? (amountOut * 1e18) / decimals0
            : (amountOut * 1e18) / decimals1;

        uint256 reserveIn = tokenIn == token0 ? reserve0 : reserve1;
        uint256 reserveOut = tokenOut == token0 ? reserve0 : reserve1;
        uint256 decimalsIn = tokenIn == token0 ? decimals0 : decimals1;

        if (stable) {
            uint256 k = _k(reserveIn, reserveOut, stable);
            amountIn = _get_y(reserveOut - amountOut, k, reserveIn) - reserveIn;
        } else {
            amountIn = ((reserveIn * amountOut) / (reserveOut - amountOut));
        }

        /// @dev multiply by a ratio to get the amount + fees and convert back to the right decimals
        amountIn =
            ((amountIn * FEE_DENOM * decimalsIn) / ((FEE_DENOM - fee) * 1e18)) +
            1;
    }

    /// @dev performs chained getAmountIn calculations on any number of pairs
    function getAmountsIn(
        uint256 amountOut,
        route[] memory routes
    ) public view returns (uint256[] memory amounts) {
        require(routes.length >= 1, InvalidPath());
        amounts = new uint256[](routes.length + 1);
        amounts[amounts.length - 1] = amountOut;

        for (uint i = 0; i < routes.length; i++) {
            uint256 j = routes.length - 1 - i;
            amounts[j] = _getAmountIn(
                amounts[j + 1],
                routes[j].from,
                routes[j].to,
                routes[j].stable
            );
        }
    }

    /// @inheritdoc IRouter
    function quoteAddLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired
    )
        external
        view
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        address _pair = IPairFactory(factory).getPair(tokenA, tokenB, stable);
        (uint256 reserveA, uint256 reserveB) = (0, 0);
        uint256 _totalSupply = 0;
        if (_pair != address(0)) {
            _totalSupply = IERC20Extended(_pair).totalSupply();
            (reserveA, reserveB) = getReserves(tokenA, tokenB, stable);
        }
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
            liquidity = Math.sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
        } else {
            uint256 amountBOptimal = quoteLiquidity(
                amountADesired,
                reserveA,
                reserveB
            );
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
                liquidity = Math.min(
                    (amountA * _totalSupply) / reserveA,
                    (amountB * _totalSupply) / reserveB
                );
            } else {
                uint256 amountAOptimal = quoteLiquidity(
                    amountBDesired,
                    reserveB,
                    reserveA
                );
                (amountA, amountB) = (amountAOptimal, amountBDesired);
                liquidity = Math.min(
                    (amountA * _totalSupply) / reserveA,
                    (amountB * _totalSupply) / reserveB
                );
            }
        }
    }

    /// @inheritdoc IRouter
    function quoteRemoveLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity
    ) external view returns (uint256 amountA, uint256 amountB) {
        address _pair = IPairFactory(factory).getPair(tokenA, tokenB, stable);

        if (_pair == address(0)) {
            return (0, 0);
        }

        (uint256 reserveA, uint256 reserveB) = getReserves(
            tokenA,
            tokenB,
            stable
        );
        uint256 _totalSupply = IERC20Extended(_pair).totalSupply();
        /// @dev using balances ensures pro-rata distribution
        amountA = (liquidity * reserveA) / _totalSupply;
        /// @dev using balances ensures pro-rata distribution
        amountB = (liquidity * reserveB) / _totalSupply;
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        require(amountADesired >= amountAMin);
        require(amountBDesired >= amountBMin);
        /// @dev create the pair if it doesn't exist yet
        address _pair = IPairFactory(factory).getPair(tokenA, tokenB, stable);
        if (_pair == address(0)) {
            _pair = IPairFactory(factory).createPair(tokenA, tokenB, stable);
        }
        (uint256 reserveA, uint256 reserveB) = getReserves(
            tokenA,
            tokenB,
            stable
        );
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quoteLiquidity(
                amountADesired,
                reserveA,
                reserveB
            );
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, InsufficientBAmount());
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quoteLiquidity(
                    amountBDesired,
                    reserveB,
                    reserveA
                );
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, InsufficientAAmount());
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    /// @inheritdoc IRouter
    function addLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        public
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            stable,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        address pair = pairFor(tokenA, tokenB, stable);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IPair(pair).mint(to);
    }

    /// @inheritdoc IRouter
    function addLiquidityETH(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        public
        payable
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            stable,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        address pair = pairFor(token, WETH, stable);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        assert(IWETH(WETH).transfer(pair, amountETH));
        liquidity = IPair(pair).mint(to);
        /// @dev refund dust eth, if any
        if (msg.value > amountETH)
            _safeTransferETH(msg.sender, msg.value - amountETH);
    }

    /// @inheritdoc IRouter
    function addLiquidityAndStake(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB, liquidity) = addLiquidity(
            tokenA,
            tokenB,
            stable,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin,
            address(this),
            deadline
        );
        address pair = pairFor(tokenA, tokenB, stable);
        address voter = IPairFactory(factory).voter();
        address gauge = IVoter(voter).gaugeForPool(pair);
        IERC20Extended(pair).approve(gauge, liquidity);
        IGauge(gauge).depositFor(to, liquidity);
    }

    /// @inheritdoc IRouter
    function addLiquidityETHAndStake(
        address token,
        bool stable,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        (amountA, amountB, liquidity) = addLiquidityETH(
            token,
            stable,
            amountTokenDesired,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        address pair = pairFor(token, WETH, stable);
        address voter = IPairFactory(factory).voter();
        address gauge = IVoter(voter).gaugeForPool(pair);
        IERC20Extended(pair).approve(gauge, liquidity);
        IGauge(gauge).depositFor(to, liquidity);
    }

    /// @inheritdoc IRouter
    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = pairFor(tokenA, tokenB, stable);
        /// @dev send liquidity to pair
        require(IERC20Extended(pair).transferFrom(msg.sender, pair, liquidity)); 
        (uint256 amount0, uint256 amount1) = IPair(pair).burn(to);
        (address token0, ) = sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0
            ? (amount0, amount1)
            : (amount1, amount0);

        require(amountA >= amountAMin, InsufficientAAmount());
        require(amountB >= amountBMin, InsufficientBAmount());
    }

    /// @inheritdoc IRouter
    function removeLiquidityETH(
        address token,
        bool stable,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            stable,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        _safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        _safeTransferETH(to, amountETH);
    }

    /// @dev requires the initial amount to have already been sent to the first pair
    function _swap(
        uint256[] memory amounts,
        route[] memory routes,
        address _to
    ) internal virtual {
        for (uint256 i = 0; i < routes.length; ++i) {
            (address token0, ) = sortTokens(routes[i].from, routes[i].to);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = routes[i].from == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < routes.length - 1
                ? pairFor(
                    routes[i + 1].from,
                    routes[i + 1].to,
                    routes[i + 1].stable
                )
                : _to;
            IPair(pairFor(routes[i].from, routes[i].to, routes[i].stable)).swap(
                    amount0Out,
                    amount1Out,
                    to,
                    new bytes(0)
                );
        }
    }

    /// @inheritdoc IRouter
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, routes);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            InsufficientOutputAmount()
        );
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amounts[0]
        );
        _swap(amounts, routes, to);
    }

    /// @inheritdoc IRouter
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        route[] memory routes,
        address to,
        uint deadline
    ) external ensure(deadline) returns (uint[] memory amounts) {
        amounts = getAmountsIn(amountOut, routes);
        require(amounts[0] <= amountInMax, ExcessiveInputAmount());
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amounts[0]
        );
        _swap(amounts, routes, to);
    }

    /// @inheritdoc IRouter
    function swapExactETHForTokens(
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(routes[0].from == WETH, InvalidPath());
        amounts = getAmountsOut(msg.value, routes);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            InsufficientOutputAmount()
        );
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(
            IWETH(WETH).transfer(
                pairFor(routes[0].from, routes[0].to, routes[0].stable),
                amounts[0]
            )
        );
        _swap(amounts, routes, to);
    }

    /// @inheritdoc IRouter
    function swapTokensForExactETH(
        uint amountOut,
        uint amountInMax,
        route[] calldata routes,
        address to,
        uint deadline
    ) external ensure(deadline) returns (uint[] memory amounts) {
        require(routes[routes.length - 1].to == WETH, InvalidPath());
        amounts = getAmountsIn(amountOut, routes);
        require(amounts[0] <= amountInMax, ExcessiveInputAmount());
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amounts[0]
        );
        _swap(amounts, routes, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /// @inheritdoc IRouter
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(routes[routes.length - 1].to == WETH, InvalidPath());
        amounts = getAmountsOut(amountIn, routes);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            InsufficientOutputAmount()
        );
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amounts[0]
        );
        _swap(amounts, routes, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        _safeTransferETH(to, amounts[amounts.length - 1]);
    }

    /// @inheritdoc IRouter
    function swapETHForExactTokens(
        uint amountOut,
        route[] calldata routes,
        address to,
        uint deadline
    ) external payable ensure(deadline) returns (uint[] memory amounts) {
        require(routes[0].from == WETH, InvalidPath());
        amounts = getAmountsIn(amountOut, routes);
        require(amounts[0] <= msg.value, ExcessiveInputAmount());
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(
            IWETH(WETH).transfer(
                pairFor(routes[0].from, routes[0].to, routes[0].stable),
                amounts[0]
            )
        );
        _swap(amounts, routes, to);
        /// @dev refund dust eth, if any
        if (msg.value > amounts[0])
            _safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    /// @dev **** SWAP (supporting fee-on-transfer tokens) ****
    /// @dev requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(
        route[] calldata routes,
        address _to
    ) internal virtual {
        for (uint256 i; i < routes.length; i++) {
            (address input, address output) = (routes[i].from, routes[i].to);
            (address token0, ) = sortTokens(input, output);
            IPair pair = IPair(
                pairFor(routes[i].from, routes[i].to, routes[i].stable)
            );
            uint256 amountInput;
            uint256 amountOutput;
            {
                /// @dev scope to avoid stack too deep errors
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, ) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);
                amountInput =
                    IERC20Extended(input).balanceOf(address(pair)) -
                    reserveInput;
                amountOutput = IPair(pair).getAmountOut(amountInput, input);
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < routes.length - 1
                ? pairFor(
                    routes[i + 1].from,
                    routes[i + 1].to,
                    routes[i + 1].stable
                )
                : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    /// @inheritdoc IRouter
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) {
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amountIn
        );
        uint256 balanceBefore = IERC20Extended(routes[routes.length - 1].to)
            .balanceOf(to);
        _swapSupportingFeeOnTransferTokens(routes, to);
        require(
            IERC20Extended(routes[routes.length - 1].to).balanceOf(to) -
                balanceBefore >=
                amountOutMin,
            InsufficientOutputAmount()
        );
    }

    /// @inheritdoc IRouter
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) {
        require(routes[0].from == WETH, InvalidPath());
        IWETH(WETH).deposit{value: msg.value}();
        assert(
            IWETH(WETH).transfer(
                pairFor(routes[0].from, routes[0].to, routes[0].stable),
                msg.value
            )
        );
        uint256 balanceBefore = IERC20Extended(routes[routes.length - 1].to)
            .balanceOf(to);
        _swapSupportingFeeOnTransferTokens(routes, to);
        require(
            IERC20Extended(routes[routes.length - 1].to).balanceOf(to) -
                balanceBefore >=
                amountOutMin,
            InsufficientOutputAmount()
        );
    }

    /// @inheritdoc IRouter
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external ensure(deadline) {
        require(routes[routes.length - 1].to == WETH, InvalidPath());
        _safeTransferFrom(
            routes[0].from,
            msg.sender,
            pairFor(routes[0].from, routes[0].to, routes[0].stable),
            amountIn
        );
        _swapSupportingFeeOnTransferTokens(routes, address(this));
        uint256 amountOut = IERC20Extended(WETH).balanceOf(address(this));
        require(amountOut >= amountOutMin, InsufficientOutputAmount());
        IWETH(WETH).withdraw(amountOut);
        _safeTransferETH(to, amountOut);
    }

    /// @inheritdoc IRouter
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        bool stable,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountETH) {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            stable,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        _safeTransfer(
            token,
            to,
            IERC20Extended(token).balanceOf(address(this))
        );
        IWETH(WETH).withdraw(amountETH);
        _safeTransferETH(to, amountETH);
    }

    function _safeTransferETH(address to, uint256 value) internal {
        (bool success, ) = to.call{value: value}(new bytes(0));
        require(success, ETHTransferFailed());
    }

    function _safeTransfer(address token, address to, uint256 value) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20Extended.transfer.selector, to, value)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }

    function _safeTransferFrom(
        address token,
        address from,
        address to,
        uint256 value
    ) internal {
        require(token.code.length > 0);
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(
                IERC20Extended.transferFrom.selector,
                from,
                to,
                value
            )
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))));
    }
}
