// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IPair {
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(
        address indexed sender,
        uint256 amount0,
        uint256 amount1,
        address indexed to
    );
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @notice initialize the pool, called only once programatically
    function initialize(
        address _token0,
        address _token1,
        bool _stable
    ) external;

    /// @notice calculate the current reserves of the pool and their last 'seen' timestamp
    /// @return _reserve0 amount of token0 in reserves
    /// @return _reserve1 amount of token1 in reserves
    /// @return _blockTimestampLast the timestamp when the pool was last updated
    function getReserves()
        external
        view
        returns (
            uint112 _reserve0,
            uint112 _reserve1,
            uint32 _blockTimestampLast
        );

    /// @notice mint the pair tokens (LPs)
    /// @param to where to mint the LP tokens to
    /// @return liquidity amount of LP tokens to mint
    function mint(address to) external returns (uint256 liquidity);

    /// @notice burn the pair tokens (LPs)
    /// @param to where to send the underlying
    /// @return amount0 amount of amount0
    /// @return amount1 amount of amount1
    function burn(
        address to
    ) external returns (uint256 amount0, uint256 amount1);

    /// @notice direct swap through the pool
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to,
        bytes calldata data
    ) external;

    /// @notice force balances to match reserves, can be used to harvest rebases from rebasing tokens or other external factors
    /// @param to where to send the excess tokens to
    function skim(address to) external;

    /// @notice force reserves to match balances, prevents skim excess if skim is enabled
    function sync() external;

    /// @notice set the pair fees contract address
    function setPairFees(address _pairFees) external;

    /// @notice set the feesplit variable
    function setFeeSplit(uint256 _feeSplit) external;

    /// @notice sets the swap fee of the pair
    /// @dev max of 10_000 (10%)
    /// @param _fee the fee
    function setFee(uint256 _fee) external;

    /// @notice 'mint' the fees as LP tokens
    /// @dev this is used for protocol/voter fees
    function mintFee() external;

    /// @notice calculates the amount of tokens to receive post swap
    /// @param amountIn the token amount
    /// @param tokenIn the address of the token
    function getAmountOut(
        uint256 amountIn,
        address tokenIn
    ) external view returns (uint256 amountOut);

    /// @notice returns various metadata about the pair
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
        );

    /// @notice returns the feeSplit of the pair
    function feeSplit() external view returns (uint256);
}
