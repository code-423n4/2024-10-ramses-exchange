// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {INonfungiblePositionManager} from "../CL/periphery/interfaces/INonfungiblePositionManager.sol";
import {IGauge} from "../interfaces/IGauge.sol";
import {IGaugeV3} from "../CL/gauge/interfaces/IGaugeV3.sol";
import {IVotingEscrow} from "../interfaces/IVotingEscrow.sol";
import {IFeeDistributor} from "../interfaces/IFeeDistributor.sol";

/// @title RewardClaimers
/// @notice Reward claimers logic for Voter
/// @dev Used to reduce Voter contract size by moving all reward claiming logic to a library
library RewardClaimers {
    error Unauthorized();

    function claimClGaugeRewards(
        address nfpManager,
        address[] calldata _gauges,
        address[][] calldata _tokens,
        uint256[][] calldata _nfpTokenIds
    ) external {
        for (uint256 i; i < _gauges.length; ++i) {
            for (uint256 j; j < _nfpTokenIds[i].length; ++j) {
                require(
                    msg.sender ==
                        INonfungiblePositionManager(nfpManager).ownerOf(
                            _nfpTokenIds[i][j]
                        ) ||
                        msg.sender ==
                        INonfungiblePositionManager(nfpManager).getApproved(
                            _nfpTokenIds[i][j]
                        ) ||
                        INonfungiblePositionManager(nfpManager)
                            .isApprovedForAll(
                                INonfungiblePositionManager(nfpManager).ownerOf(
                                    _nfpTokenIds[i][j]
                                ),
                                msg.sender
                            )
                );

                IGaugeV3(_gauges[i]).getRewardForOwner(
                    _nfpTokenIds[i][j],
                    _tokens[i]
                );
            }
        }
    }

    function claimIncentives(
        address votingEscrow,
        uint256 tokenId,
        address[] calldata _feeDistributors,
        address[][] calldata _tokens
    ) external {
        IVotingEscrow(votingEscrow).checkAuthorized(msg.sender, tokenId);

        for (uint256 i; i < _feeDistributors.length; ++i) {
            IFeeDistributor(_feeDistributors[i]).getRewardForOwner(
                tokenId,
                _tokens[i]
            );
        }
    }

    function claimRewards(
        address[] calldata _gauges,
        address[][] calldata _tokens
    ) external {
        for (uint256 i; i < _gauges.length; ++i) {
            IGauge(_gauges[i]).getReward(msg.sender, _tokens[i]);
        }
    }
}
