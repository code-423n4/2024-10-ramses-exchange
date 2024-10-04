// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.17;

library SwapRoute {
    struct Route {
        address from;
        address to;
        bool stable;
    }
}
