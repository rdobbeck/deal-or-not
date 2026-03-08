// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @notice Lightweight VRF mock that replaces VRFCoordinatorV2_5Mock to avoid
///         Yul stack-too-deep errors when compiling with via_ir = true.
///         Only implements the subset of IVRFCoordinatorV2Plus our tests need.
contract LightVRFMock is IVRFCoordinatorV2Plus {
    uint256 private _nextSubId = 1;
    uint256 private _nextRequestId = 1;

    struct Request {
        uint256 subId;
        address consumer;
        uint32 numWords;
    }

    mapping(uint256 => bool) public subs;
    mapping(uint256 => mapping(address => bool)) public consumers;
    mapping(uint256 => Request) public requests;

    // ── Subscription Management ──

    function createSubscription() external override returns (uint256 subId) {
        subId = _nextSubId++;
        subs[subId] = true;
    }

    function addConsumer(uint256 subId, address consumer) external override {
        require(subs[subId], "sub not found");
        consumers[subId][consumer] = true;
    }

    function removeConsumer(uint256 subId, address consumer) external override {
        consumers[subId][consumer] = false;
    }

    function cancelSubscription(uint256 subId, address) external override {
        subs[subId] = false;
    }

    function fundSubscriptionWithNative(uint256) external payable override {}

    /// @dev No-op for test compatibility (called as fundSubscription in old mock)
    function fundSubscription(uint256, uint256) external {}

    function getSubscription(uint256 subId)
        external
        view
        override
        returns (uint96 balance, uint96 nativeBalance, uint64 reqCount, address owner, address[] memory _consumers)
    {
        balance = type(uint96).max;
        nativeBalance = type(uint96).max;
        reqCount = 0;
        owner = address(this);
        _consumers = new address[](0);
    }

    function getActiveSubscriptionIds(uint256, uint256) external pure override returns (uint256[] memory) {
        return new uint256[](0);
    }

    function pendingRequestExists(uint256) external pure override returns (bool) {
        return false;
    }

    function acceptSubscriptionOwnerTransfer(uint256) external override {}
    function requestSubscriptionOwnerTransfer(uint256, address) external override {}

    // ── Random Words ──

    function requestRandomWords(
        VRFV2PlusClient.RandomWordsRequest calldata req
    ) external override returns (uint256 requestId) {
        require(subs[req.subId], "sub not found");
        require(consumers[req.subId][msg.sender], "consumer not added");

        requestId = _nextRequestId++;
        requests[requestId] = Request({
            subId: req.subId,
            consumer: msg.sender,
            numWords: req.numWords
        });
    }

    /// @notice Fulfill random words — deterministic based on requestId for reproducible tests
    function fulfillRandomWords(uint256 requestId, address consumer) external {
        Request memory req = requests[requestId];
        require(req.consumer == consumer, "wrong consumer");

        uint256[] memory words = new uint256[](req.numWords);
        for (uint256 i = 0; i < req.numWords; i++) {
            words[i] = uint256(keccak256(abi.encode(requestId, i)));
        }

        // Call rawFulfillRandomWords on the consumer (VRFConsumerBaseV2Plus expects this)
        (bool success,) = consumer.call(
            abi.encodeWithSignature("rawFulfillRandomWords(uint256,uint256[])", requestId, words)
        );
        require(success, "fulfillRandomWords failed");
    }
}
