// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.4.0;

/// @title FixedPoint32
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
library FixedPoint32 {
    uint8 internal constant RESOLUTION = 32;
    uint256 internal constant Q32 = 0x100000000;
}
