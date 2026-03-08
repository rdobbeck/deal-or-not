// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title VRFManager — Abstract VRF seed management for Deal or NOT
/// @notice Handles VRF request/callback and stores seeds per gameId.
///         Exposes getVRFSeed() and getVRFRequestId() for frontend display.
///         Frontend can link to vrf.chain.link subscription page for proof verification.
///
/// In 12-case version, VRF also seeds the lottery winner draw.
abstract contract VRFManager is VRFConsumerBaseV2Plus {
    // ── VRF Config ──
    uint256 public s_subscriptionId;
    bytes32 public s_keyHash;
    uint32 public s_callbackGasLimit = 200000;
    uint16 public s_requestConfirmations = 1;

    // ── VRF State ──
    mapping(uint256 => uint256) public vrfRequestToGame;
    mapping(uint256 => uint256) internal _vrfSeeds;
    mapping(uint256 => uint256) internal _vrfRequestIds;

    // ── Events ──
    event VRFSeedReceived(uint256 indexed gameId, uint256 requestId);

    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        s_subscriptionId = _subscriptionId;
        s_keyHash = _keyHash;
    }

    /// @notice Request a VRF seed for a game. Returns the VRF requestId.
    function _requestVRFSeed(uint256 gameId) internal returns (uint256 requestId) {
        requestId = s_vrfCoordinator.requestRandomWords(
            VRFV2PlusClient.RandomWordsRequest({
                keyHash: s_keyHash,
                subId: s_subscriptionId,
                requestConfirmations: s_requestConfirmations,
                callbackGasLimit: s_callbackGasLimit,
                numWords: 1,
                extraArgs: VRFV2PlusClient._argsToBytes(
                    VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
                )
            })
        );
        _vrfRequestIds[gameId] = requestId;
        vrfRequestToGame[requestId] = gameId;
    }

    /// @dev VRF Coordinator callback. Subclasses implement _onVRFSeedReceived.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        uint256 gameId = vrfRequestToGame[requestId];
        _vrfSeeds[gameId] = randomWords[0];
        emit VRFSeedReceived(gameId, requestId);
        _onVRFSeedReceived(gameId, randomWords[0]);
    }

    /// @notice Hook for subclass to react when VRF seed arrives.
    function _onVRFSeedReceived(uint256 gameId, uint256 seed) internal virtual;

    // ── View Functions ──

    /// @notice Get the VRF seed for a game (publicly verifiable).
    function getVRFSeed(uint256 gameId) external view returns (uint256) {
        return _vrfSeeds[gameId];
    }

    /// @notice Get the VRF request ID for a game (for vrf.chain.link lookup).
    function getVRFRequestId(uint256 gameId) external view returns (uint256) {
        return _vrfRequestIds[gameId];
    }

    // ── Admin ──

    /// @notice Owner can update VRF config.
    function setVRFConfig(
        uint256 subscriptionId,
        bytes32 keyHash,
        uint32 callbackGasLimit,
        uint16 requestConfirmations
    ) external onlyOwner {
        s_subscriptionId = subscriptionId;
        s_keyHash = keyHash;
        s_callbackGasLimit = callbackGasLimit;
        s_requestConfirmations = requestConfirmations;
    }
}
