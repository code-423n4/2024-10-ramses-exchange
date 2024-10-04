// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title The interface for the CL gauge Factory
/// @notice Deploys CL gauges
interface IClGaugeFactory {
    /// @notice Emitted when the owner of the factory is changed
    /// @param oldOwner The owner before the owner was changed
    /// @param newOwner The owner after the owner was changed
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    /// @notice Emitted when a gauge is created
    /// @param pool The address of the pool
    /// @param pool The address of the created gauge
    event GaugeCreated(address indexed pool, address gauge);

    /// @notice Emitted when the fee collector is changed
    /// @param oldFeeCollector The previous implementation
    /// @param newFeeCollector The new implementation
    event FeeCollectorChanged(
        address indexed oldFeeCollector,
        address indexed newFeeCollector
    );

    /// @notice Returns the NFP Manager address
    function nfpManager() external view returns (address);

    /// @notice Returns the votingEscrow address
    function votingEscrow() external view returns (address);

    /// @notice Returns Voter
    function voter() external view returns (address);

    /// @notice Returns the gauge address for a given pool, or address 0 if it does not exist
    /// @param pool The pool address
    /// @return gauge The gauge address
    function getGauge(address pool) external view returns (address gauge);

    /// @notice Returns the address of the fee collector contract
    /// @dev Fee collector decides where the protocol fees go (fee distributor, treasury, etc.)
    function feeCollector() external view returns (address);

    /// @notice Creates a gauge for the given pool
    /// @param pool One of the desired gauge
    /// @return gauge The address of the newly created gauge
    function createGauge(address pool) external returns (address gauge);
}
