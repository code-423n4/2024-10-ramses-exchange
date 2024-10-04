// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

interface IMinter {
    event SetVeDist(address _value);
    event SetVoter(address _value);
    event Mint(address indexed sender, uint256 weekly, uint256 rebase);

    event EmissionsMultiplierUpdated(uint256 _emissionsMultiplier);

    event RebaseRateUpdated(uint256 _rebaseRate);

    event ContributorRateUpdated(uint256 _contributorRate);

    /// @dev error for if epoch 0 has already started
    error Started();
    /// @dev value too high
    error VTH();
    /// @dev value too low
    error VTL();

    /// @notice decay or inflation scaled to 10_000 = 100%
    /// @return _multiplier the emissions multiplier
    function emissionsMultiplier() external view returns (uint256 _multiplier);

    /// @notice rebasing contract
    /// @return _rebaseDistributor the address of the rebase distributor contract
    function rebaseDistributor()
        external
        view
        returns (address _rebaseDistributor);

    /// @notice unix timestamp of current epoch's start
    /// @return _activePeriod the active period
    function activePeriod() external view returns (uint256 _activePeriod);

    /// @notice value of rebase scaled to 10_000 = 100%
    /// @return _rate the rebase rate
    function rebaseRate() external view returns (uint256 _rate);

    /// @notice update the epoch (period) -- callable once a week at >= Thursday 0 UTC
    /// @return period the new period
    function updatePeriod() external returns (uint256 period);

    /// @notice start emissions for epoch 0
    function startEmissions() external;

    /// @notice updates the decay or inflation scaled to 10_000 = 100%
    /// @param _emissionsMultiplier multiplier for emissions each week
    function updateEmissionsMultiplier(uint256 _emissionsMultiplier) external;

    /// @notice alters the constant rebase value
    /// @param _rebaseRate the rebase rate to change to
    function updateRebaseRate(uint256 _rebaseRate) external;

    /// @notice updates the contributor weekly rate
    /// @param _newRate capped by max rate
    function updateContributorRate(uint256 _newRate) external;

    /// @notice calculates the emissions to be sent to the voter
    /// @return _weeklyEmissions the amount of emissions for the week
    function calculateWeeklyEmissions()
        external
        view
        returns (uint256 _weeklyEmissions);

    /// @notice kicks off the initial minting and variable declarations
    function kickoff(
        address _emissionsToken,
        address _voter,
        uint256 initialSupply,
        address _multisig,
        address _rebaseDistributor,
        uint256 _initialWeeklyEmissions
    ) external;

    /// @notice calculates the current rebase rate scaled to 10_000 = 100%
    /// @param _weeklyEmissions the emissions parameter to input to determine rebase
    /// @return rebase amount of rebase for the specific parameters passed
    function calculateRebase(
        uint256 _weeklyEmissions
    ) external view returns (uint256 rebase);

    /// @notice returns (block.timestamp / 1 week) for gauge use
    /// @return period period number
    function getPeriod() external view returns (uint256 period);

    /// @notice returns the numerical value of the current epoch
    /// @return _epoch epoch number
    function getEpoch() external view returns (uint256 _epoch);
}
