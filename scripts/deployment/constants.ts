import { ethers } from "hardhat";

export const MULTISIG = "0x20D630cF1f5628285BfB91DfaC8C89eB9087BE1A";
export const PAIR_FACTORY = "0xAAA20D08e59F6561f242b08513D36266C5A29415";
export const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const MAX_UINT = ethers.MaxUint256;

export const WEEK = 7 * 24 * 60 * 60;
export const FEES = { STABLE: 500, NORMAL: 3000, EXOTIC: 10000 };
export const TICK_SPACINGS = { STABLE: 10, NORMAL: 50, EXOTIC: 100 };
export const FEES_TO_TICK_SPACINGS: Record<number, number> = {
    100: 1,
    250: 5,
    500: 10,
    3000: 50,
    10000: 100,
    20000: 200,
};
