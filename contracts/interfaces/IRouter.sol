// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.20;

interface IRouter {
    struct route {
        /// @dev token from
        address from;
        /// @dev token to
        address to;
        /// @dev is stable route
        bool stable;
    }

    /// @notice sorts the tokens to see what the expected LP output would be for token0 and token1 (A/B)
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @return token0 address of which becomes token0
    /// @return token1 address of which becomes token1
    function sortTokens(
        address tokenA,
        address tokenB
    ) external pure returns (address token0, address token1);

    /// @notice calculates the CREATE2 address for a pair without making any external calls
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @return pair address of the pair
    function pairFor(
        address tokenA,
        address tokenB,
        bool stable
    ) external view returns (address pair);

    /// @notice fetches and sorts the reserves for a pair
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @return reserveA get the reserves for tokenA
    /// @return reserveB get the reserves for tokenB
    function getReserves(
        address tokenA,
        address tokenB,
        bool stable
    ) external view returns (uint256 reserveA, uint256 reserveB);

    /// @notice performs chained getAmountOut calculations on any number of pairs
    /// @param amountIn the amount of tokens of routes[0] to swap
    /// @param routes the struct of the hops the swap should take
    /// @return amounts uint array of the amounts out
    function getAmountsOut(
        uint256 amountIn,
        route[] memory routes
    ) external view returns (uint256[] memory amounts);

    /// @notice performs chained getAmountOut calculations on any number of pairs
    /// @param amountIn amount of tokenIn
    /// @param tokenIn address of the token going in
    /// @param tokenOut address of the token coming out
    /// @return amount uint amount out
    /// @return stable if the curve used is stable or not
    function getAmountOut(
        uint256 amountIn,
        address tokenIn,
        address tokenOut
    ) external view returns (uint256 amount, bool stable);

    /// @notice performs calculations to determine the expected state when adding liquidity
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @param amountADesired amount of tokenA desired to be added
    /// @param amountBDesired amount of tokenB desired to be added
    /// @return amountA amount of tokenA added
    /// @return amountB amount of tokenB added
    /// @return liquidity liquidity value added
    function quoteAddLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 amountADesired,
        uint256 amountBDesired
    )
        external
        view
        returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @param liquidity liquidity value to remove
    /// @return amountA amount of tokenA removed
    /// @return amountB amount of tokenB removed
    function quoteRemoveLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity
    ) external view returns (uint256 amountA, uint256 amountB);

    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @param amountADesired amount of tokenA desired to be added
    /// @param amountBDesired amount of tokenB desired to be added
    /// @param amountAMin slippage for tokenA calculated from this param
    /// @param amountBMin slippage for tokenB calculated from this param
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountA amount of tokenA used
    /// @return amountB amount of tokenB used
    /// @return liquidity amount of liquidity minted
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
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @param token the address of token
    /// @param stable if the pair is using the stable curve
    /// @param amountTokenDesired desired amount for token
    /// @param amountTokenMin slippage for token
    /// @param amountETHMin minimum amount of ETH added (slippage)
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountToken amount of the token used
    /// @return amountETH amount of ETH used
    /// @return liquidity amount of liquidity minted
    function addLiquidityETH(
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
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @param amountADesired amount of tokenA desired to be added
    /// @param amountBDesired amount of tokenB desired to be added
    /// @param amountAMin slippage for tokenA calculated from this param
    /// @param amountBMin slippage for tokenB calculated from this param
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountA amount of tokenA used
    /// @return amountB amount of tokenB used
    /// @return liquidity amount of liquidity minted
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
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /// @notice adds liquidity to a legacy pair using ETH, and stakes it into a gauge on "to's" behalf
    /// @param token the address of token
    /// @param stable if the pair is using the stable curve
    /// @param amountTokenDesired amount of token to be used
    /// @param amountTokenMin slippage of token
    /// @param amountETHMin slippage of ETH
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountA amount of tokenA used
    /// @return amountB amount of tokenB used
    /// @return liquidity amount of liquidity minted
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
        returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    /// @param tokenA the address of tokenA
    /// @param tokenB the address of tokenB
    /// @param stable if the pair is using the stable curve
    /// @param liquidity amount of LP tokens to remove
    /// @param amountAMin slippage of tokenA
    /// @param amountBMin slippage of tokenB
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountA amount of tokenA used
    /// @return amountB amount of tokenB used
    function removeLiquidity(
        address tokenA,
        address tokenB,
        bool stable,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);
    /// @param token address of the token
    /// @param stable if the pair is using the stable curve
    /// @param liquidity liquidity tokens to remove
    /// @param amountTokenMin slippage of token
    /// @param amountETHMin slippage of ETH
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amountToken amount of token used
    /// @return amountETH amount of ETH used
    function removeLiquidityETH(
        address token,
        bool stable,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountETH);
    /// @param amountIn amount to send ideally
    /// @param amountOutMin slippage of amount out
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        route[] memory routes,
        address to,
        uint deadline
    ) external returns (uint256[] memory amounts);
    /// @param amountOutMin slippage of token
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapExactETHForTokens(
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);
    /// @param amountOut amount of tokens to get out
    /// @param amountInMax max amount of tokens to put in to achieve amountOut (slippage)
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapTokensForExactETH(
        uint amountOut,
        uint amountInMax,
        route[] calldata routes,
        address to,
        uint deadline
    ) external returns (uint256[] memory amounts);
    /// @param amountIn amount of tokens to swap
    /// @param amountOutMin slippage of token
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
    /// @param amountOut exact amount out or revert
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    /// @return amounts amounts returned
    function swapETHForExactTokens(
        uint amountOut,
        route[] calldata routes,
        address to,
        uint deadline
    ) external payable returns (uint256[] memory amounts);

    /// @param amountIn token amount to swap
    /// @param amountOutMin slippage of token
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external;

    /// @param amountOutMin slippage of token
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external payable;

    /// @param amountIn token amount to swap
    /// @param amountOutMin slippage of token
    /// @param routes the hops the swap should take
    /// @param to the address the liquidity tokens should be minted to
    /// @param deadline timestamp deadline
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        route[] calldata routes,
        address to,
        uint256 deadline
    ) external;

    /// @notice **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens)****
    /// @param token address of the token
    /// @param stable if the swap curve is stable
    /// @param liquidity liquidity value (lp tokens)
    /// @param amountTokenMin slippage of token
    /// @param amountETHMin slippage of ETH
    /// @param to address to send to
    /// @param deadline timestamp deadline
    /// @return amountToken amount of token received
    /// @return amountETH amount of ETH received
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        bool stable,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountToken, uint256 amountETH);
}
