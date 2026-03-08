// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DealOrNotAgents} from "../contracts/DealOrNotAgents.sol";
import {Bank} from "../contracts/Bank.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

contract MockAgentPriceFeed {
    int256 public price;
    constructor(int256 _price) { price = _price; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}

contract DealOrNotAgentsTest is Test {
    DealOrNotAgents agents;
    Bank bank;
    AgentRegistry registry;
    VRFCoordinatorV2_5Mock vrfCoordinator;
    MockAgentPriceFeed mockFeed;

    address agentOwner = makeAddr("agentOwner");
    address agentAddr = makeAddr("agentAddr");
    address creForwarder = makeAddr("creForwarder");
    address owner;

    uint256 subId;
    bytes32 constant KEY_HASH = bytes32(uint256(1));
    uint256 agentId;

    // ETH = $2000 => $0.25 = 125000000000000 wei, with 5% slippage = 131250000000000
    uint256 constant ENTRY_FEE_WITH_SLIPPAGE = 131250000000000;

    function setUp() public {
        owner = address(this);

        // Deploy VRF mock
        vrfCoordinator = new VRFCoordinatorV2_5Mock(
            100000000000000000, // base fee
            1000000000,         // gas price link
            4004423364025260    // LINK/ETH price
        );
        subId = vrfCoordinator.createSubscription();
        vrfCoordinator.fundSubscription(subId, 100 ether);

        // Deploy price feed mock ($2000)
        mockFeed = new MockAgentPriceFeed(200000000000);

        // Deploy Bank
        bank = new Bank(address(mockFeed));

        // Deploy AgentRegistry
        registry = new AgentRegistry();

        // Deploy DealOrNotAgents with Bank integration
        agents = new DealOrNotAgents(
            address(vrfCoordinator),
            subId,
            KEY_HASH,
            address(mockFeed),
            creForwarder,
            address(registry),
            address(bank)
        );

        // Authorize agents contract in bank
        bank.setAuthorizedGame(address(agents), true);

        // Authorize agents contract in registry (for recording stats)
        registry.authorizeContract(address(agents));

        // Add as VRF consumer
        vrfCoordinator.addConsumer(subId, address(agents));

        // Sweeten bank with $5
        bank.sweeten{value: 2500000000000000}();

        // Register an agent
        vm.prank(agentAddr);
        agentId = registry.registerAgent("TestBot", "https://api.example.com/agent", "{}");

        // Fund agent owner to pay entry fees
        vm.deal(agentOwner, 1 ether);
        vm.deal(address(this), 1 ether);
    }

    // ── Helpers ──

    function _createAgentGameAndFulfillVRF() internal returns (uint256 gameId) {
        gameId = agents.createAgentGame{value: ENTRY_FEE_WITH_SLIPPAGE}(agentAddr);

        uint256 requestId = agents.getVRFRequestId(gameId);
        uint256[] memory words = new uint256[](1);
        words[0] = 12345;
        vrfCoordinator.fulfillRandomWordsWithOverride(requestId, address(agents), words);
    }

    function _pickAndOpenCase(uint256 gameId, uint8 pickCase, uint8 openCaseIdx, uint256 valueCents) internal {
        // Pick case via CRE
        vm.prank(creForwarder);
        agents.agentPickCase(gameId, pickCase);

        // Open case via CRE
        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, openCaseIdx);

        // CRE reveals value
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, openCaseIdx, valueCents);
    }

    function _playToAwaitingOffer(uint256 gameId) internal {
        // Agent picks case 0, opens case 1 (value 5)
        vm.prank(creForwarder);
        agents.agentPickCase(gameId, 0);

        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, 1);

        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 1, 5);
        // -> AwaitingOffer (remaining: cases 2, 3, 4)
    }

    function _playToFinalRound(uint256 gameId) internal {
        vm.prank(creForwarder);
        agents.agentPickCase(gameId, 0);

        // Open case 1 = 5 cents
        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, 1);
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 1, 5);

        // Banker offer + reject
        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 10, "Lowball!");
        vm.prank(creForwarder);
        agents.agentRejectDeal(gameId);

        // Open case 2 = 10 cents
        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, 2);
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 2, 10);

        // Banker offer + reject
        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 20, "Better?");
        vm.prank(creForwarder);
        agents.agentRejectDeal(gameId);

        // Open case 3 = 50 cents
        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, 3);
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 3, 50);
        // -> FinalRound (remaining: case 4)
    }

    // ── Game Creation Tests ──

    function test_createAgentGame_withEntryFee() public {
        uint256 bankBalBefore = address(bank).balance;

        uint256 gameId = agents.createAgentGame{value: ENTRY_FEE_WITH_SLIPPAGE}(agentAddr);

        assertEq(gameId, 0);
        // Bank should have received the entry fee
        assertEq(address(bank).balance, bankBalBefore + ENTRY_FEE_WITH_SLIPPAGE);
        // Entry deposit recorded
        assertEq(agents.getEntryDeposit(gameId), ENTRY_FEE_WITH_SLIPPAGE);
    }

    function test_createAgentGame_bankNotActive_reverts() public {
        Bank freshBank = new Bank(address(mockFeed));
        freshBank.setAuthorizedGame(address(agents), true);
        agents.setBank(address(freshBank));

        vm.expectRevert(DealOrNotAgents.BankNotActive.selector);
        agents.createAgentGame{value: ENTRY_FEE_WITH_SLIPPAGE}(agentAddr);
    }

    function test_createAgentGame_insufficientFee_reverts() public {
        vm.expectRevert(); // GameMath.InsufficientDeposit
        agents.createAgentGame{value: 100}(agentAddr);
    }

    function test_createAgentGame_ineligibleAgent_reverts() public {
        address unregistered = makeAddr("unregistered");
        vm.expectRevert(DealOrNotAgents.AgentNotEligible.selector);
        agents.createAgentGame{value: ENTRY_FEE_WITH_SLIPPAGE}(unregistered);
    }

    function test_createAgentGame_bannedAgent_reverts() public {
        registry.banAgent(agentId, "cheating");
        vm.expectRevert(DealOrNotAgents.AgentNotEligible.selector);
        agents.createAgentGame{value: ENTRY_FEE_WITH_SLIPPAGE}(agentAddr);
    }

    // ── VRF Tests ──

    function test_VRFSeed_storedAndQueryable() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        assertEq(agents.getVRFSeed(gameId), 12345);
        assertGt(agents.getVRFRequestId(gameId), 0);
    }

    // ── Agent Actions Tests ──

    function test_agentPickCase() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(creForwarder);
        agents.agentPickCase(gameId, 2);

        (,, uint8 phase, uint8 playerCase,,,,,,,) = agents.getGameState(gameId);
        assertEq(phase, 2); // Round
        assertEq(playerCase, 2);
    }

    function test_agentPickCase_nonCRE_reverts() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(makeAddr("rando"));
        vm.expectRevert(DealOrNotAgents.NotCREForwarder.selector);
        agents.agentPickCase(gameId, 0);
    }

    function test_agentOpenCase_ownCase_reverts() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(creForwarder);
        agents.agentPickCase(gameId, 0);

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotAgents.CannotOpenOwnCase.selector);
        agents.agentOpenCase(gameId, 0);
    }

    // ── Deal Accept with Bank Settlement ──

    function test_agentAcceptDeal_settlesFromBank() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        // Banker offers 30 cents
        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 30, "Take it!");

        uint256 agentBalBefore = agentAddr.balance;

        // Agent accepts deal
        vm.prank(creForwarder);
        agents.agentAcceptDeal(gameId);

        // Agent should receive 30 cents worth of ETH
        // ethPerDollar = 1e26 / 200000000000 = 500000000000000
        // 30 * 500000000000000 / 100 = 150000000000000 wei
        uint256 expectedPayout = 150000000000000;
        assertEq(agentAddr.balance - agentBalBefore, expectedPayout);

        // Game state
        (,, uint8 phase,,,, uint256 bankerOffer, uint256 finalPayout,,,) = agents.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 30);
    }

    // ── Reject Deal ──

    function test_agentRejectDeal() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 30, "Take it!");

        vm.prank(creForwarder);
        agents.agentRejectDeal(gameId);

        (,, uint8 phase,, uint8 currentRound,, uint256 bankerOffer,,,,) = agents.getGameState(gameId);
        assertEq(phase, 2); // Round
        assertEq(currentRound, 1);
        assertEq(bankerOffer, 0);
    }

    // ── Keep Case (Final Round) ──

    function test_agentKeepCase_settlesFromBank() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToFinalRound(gameId);

        // Agent keeps case 0
        vm.prank(creForwarder);
        agents.agentKeepCase(gameId);

        // CRE reveals case 4 = 1 cent
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 4, 1);

        // Player case 0 gets remaining value (100 cents)
        (,, uint8 phase,,,, uint256 bankerOffer, uint256 finalPayout,,,) = agents.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 100); // $1.00
    }

    // ── Swap Case (Final Round) ──

    function test_agentSwapCase_settlesFromBank() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToFinalRound(gameId);

        // Agent swaps: player case becomes 4, old case 0 gets revealed
        vm.prank(creForwarder);
        agents.agentSwapCase(gameId);

        // CRE reveals old player case 0 = 1 cent
        vm.prank(creForwarder);
        agents.fulfillCaseValue(gameId, 0, 1);

        // New player case 4 gets remaining value (100 cents)
        (,, uint8 phase, uint8 playerCase,,,,uint256 finalPayout,,,) = agents.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(playerCase, 4);
        assertEq(finalPayout, 100);
    }

    // ── onReport Routing ──

    function test_onReport_agentPickCase() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        bytes memory report = abi.encodePacked(
            agents.agentPickCase.selector,
            abi.encode(gameId, uint8(2))
        );
        vm.prank(creForwarder);
        agents.onReport("", report);

        (,, uint8 phase, uint8 playerCase,,,,,,,) = agents.getGameState(gameId);
        assertEq(phase, 2); // Round
        assertEq(playerCase, 2);
    }

    function test_onReport_fulfillCaseValue() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(creForwarder);
        agents.agentPickCase(gameId, 0);
        vm.prank(creForwarder);
        agents.agentOpenCase(gameId, 1);

        bytes memory report = abi.encodePacked(
            agents.fulfillCaseValue.selector,
            abi.encode(gameId, uint8(1), uint256(5))
        );
        vm.prank(creForwarder);
        agents.onReport("", report);

        (,,,,,,,,,uint256[5] memory values,) = agents.getGameState(gameId);
        assertEq(values[1], 5);
    }

    function test_onReport_setBankerOfferWithMessage() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        bytes memory report = abi.encodePacked(
            agents.setBankerOfferWithMessage.selector,
            abi.encode(gameId, uint256(42), "Hello agent!")
        );
        vm.prank(creForwarder);
        agents.onReport("", report);

        (,,,,,, uint256 offer,,,,) = agents.getGameState(gameId);
        assertEq(offer, 42);
    }

    function test_onReport_nonForwarder_reverts() public {
        bytes memory report = abi.encodePacked(
            agents.agentPickCase.selector,
            abi.encode(uint256(0), uint8(0))
        );
        vm.prank(makeAddr("rando"));
        vm.expectRevert(DealOrNotAgents.NotCREForwarder.selector);
        agents.onReport("", report);
    }

    // ── Agent Stats Recording ──

    function test_agentStats_recordedOnGameOver() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 60, "Great offer!");
        vm.prank(creForwarder);
        agents.agentAcceptDeal(gameId);

        // Check agent stats in registry
        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 1); // 60 >= 50
        assertEq(agent.totalEarnings, 60);
    }

    function test_agentStats_lossRecorded() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 10, "Lowball!");
        vm.prank(creForwarder);
        agents.agentAcceptDeal(gameId);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 0); // 10 < 50 = loss
        assertEq(agent.totalEarnings, 10);
    }

    // ── Expire Game ──

    function test_expireGame() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.warp(block.timestamp + 601);

        vm.prank(creForwarder);
        agents.expireGame(gameId);

        (,, uint8 phase,,,, uint256 bankerOffer, uint256 finalPayout,,,) = agents.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 0);
    }

    function test_expireGame_tooEarly_reverts() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotAgents.GameNotExpired.selector);
        agents.expireGame(gameId);
    }

    function test_expireGame_statsRecorded() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.warp(block.timestamp + 601);
        vm.prank(creForwarder);
        agents.expireGame(gameId);

        AgentRegistry.Agent memory agent = registry.getAgent(agentId);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 0); // expired = loss
        assertEq(agent.totalEarnings, 0);
    }

    // ── Game Secret ──

    function test_publishGameSecret() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 30, "Deal!");
        vm.prank(creForwarder);
        agents.agentAcceptDeal(gameId);

        bytes32 secret = keccak256("my-secret");
        vm.prank(creForwarder);
        agents.publishGameSecret(gameId, secret);

        assertEq(agents.getGameSecret(gameId), secret);
    }

    function test_publishGameSecret_notGameOver_reverts() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotAgents.GameNotOver.selector);
        agents.publishGameSecret(gameId, keccak256("secret"));
    }

    function test_publishGameSecret_alreadyPublished_reverts() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        _playToAwaitingOffer(gameId);

        vm.prank(creForwarder);
        agents.setBankerOfferWithMessage(gameId, 30, "Deal!");
        vm.prank(creForwarder);
        agents.agentAcceptDeal(gameId);

        vm.prank(creForwarder);
        agents.publishGameSecret(gameId, keccak256("secret1"));

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotAgents.SecretAlreadyPublished.selector);
        agents.publishGameSecret(gameId, keccak256("secret2"));
    }

    // ── Entry Fee Estimate ──

    function test_estimateEntryFee() public view {
        (uint256 baseWei, uint256 withSlippage) = agents.estimateEntryFee();
        assertEq(baseWei, 125000000000000); // $0.25 at $2000/ETH
        assertEq(withSlippage, ENTRY_FEE_WITH_SLIPPAGE);
    }

    // ── Admin ──

    function test_setCREForwarder() public {
        address newForwarder = makeAddr("newForwarder");
        agents.setCREForwarder(newForwarder);
        // Verify old forwarder no longer works
        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotAgents.NotCREForwarder.selector);
        agents.agentPickCase(0, 0);
    }

    function test_setBank() public {
        Bank newBank = new Bank(address(mockFeed));
        agents.setBank(address(newBank));
        // Just verify no revert — admin only
    }

    function test_setCREForwarder_nonOwner_reverts() public {
        vm.prank(makeAddr("rando"));
        vm.expectRevert();
        agents.setCREForwarder(makeAddr("newForwarder"));
    }

    // ── Cents to Wei Conversion ──

    function test_centsToWei() public {
        uint256 gameId = _createAgentGameAndFulfillVRF();
        uint256 weiAmount = agents.centsToWei(gameId, 100);
        // ethPerDollar = 1e26 / 200000000000 = 500000000000000
        // 100 * 500000000000000 / 100 = 500000000000000
        assertEq(weiAmount, 500000000000000);
    }
}
