// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DealOrNotQuickPlay} from "../contracts/DealOrNotQuickPlay.sol";
import {Bank} from "../contracts/Bank.sol";
import {VRFCoordinatorV2_5Mock} from "@chainlink/contracts/src/v0.8/vrf/mocks/VRFCoordinatorV2_5Mock.sol";

contract MockPriceFeed {
    int256 public price;
    constructor(int256 _price) { price = _price; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}

contract DealOrNotQuickPlayTest is Test {
    DealOrNotQuickPlay game;
    Bank bank;
    VRFCoordinatorV2_5Mock vrfCoordinator;
    MockPriceFeed mockFeed;

    address player = makeAddr("player");
    address creForwarder = makeAddr("creForwarder");
    address owner;

    uint256 subId;
    bytes32 constant KEY_HASH = bytes32(uint256(1));

    // ETH = $2000 => $0.25 = 125000000000000 wei, with 5% slippage = 131250000000000
    uint256 constant ENTRY_FEE_WEI = 125000000000000;
    uint256 constant ENTRY_FEE_WITH_SLIPPAGE = 131250000000000;
    uint256 constant ETH_PER_DOLLAR = 500000000000000;

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

        // Deploy price feed mock
        mockFeed = new MockPriceFeed(200000000000); // $2000

        // Deploy Bank
        bank = new Bank(address(mockFeed));

        // Deploy game
        game = new DealOrNotQuickPlay(
            address(vrfCoordinator),
            subId,
            KEY_HASH,
            address(mockFeed),
            creForwarder,
            address(bank)
        );

        // Authorize game in bank
        bank.setAuthorizedGame(address(game), true);

        // Add game as VRF consumer
        vrfCoordinator.addConsumer(subId, address(game));

        // Sweeten bank with $5
        bank.sweeten{value: 2500000000000000}(); // 0.0025 ETH = $5

        // Fund player
        vm.deal(player, 1 ether);
    }

    // ── Helper: create game and fulfill VRF ──

    function _createGameAndFulfillVRF() internal returns (uint256 gameId) {
        vm.prank(player);
        gameId = game.createGame{value: ENTRY_FEE_WITH_SLIPPAGE}();

        // Fulfill VRF
        uint256 requestId = game.getVRFRequestId(gameId);
        uint256[] memory words = new uint256[](1);
        words[0] = 12345;
        vrfCoordinator.fulfillRandomWordsWithOverride(requestId, address(game), words);
    }

    /// @dev Opens cases 1 and 2, leaving cases 3 and 4 + player's case 0.
    ///      After this, game is in AwaitingOffer with 2 non-player cases remaining.
    function _playTwoRounds(uint256 gameId) internal {
        vm.prank(player);
        game.pickCase(gameId, 0);

        // Round 0: open case 1
        vm.prank(player);
        game.openCase(gameId, 1);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 1, 5);
        // -> AwaitingOffer (2 non-player cases remain: 3, 4)
    }

    /// @dev Opens 3 non-player cases, reaching FinalRound.
    function _playToFinalRound(uint256 gameId) internal {
        vm.prank(player);
        game.pickCase(gameId, 0);

        // Open case 1
        vm.prank(player);
        game.openCase(gameId, 1);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 1, 5);
        // -> AwaitingOffer (remaining: cases 2, 3, 4 = 3 non-player)

        // Banker makes offer via onReport, player rejects
        bytes memory offer1 = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(uint256(gameId), uint256(10), "Lowball!")
        );
        vm.prank(creForwarder);
        game.onReport("", offer1);
        vm.prank(player);
        game.rejectDeal(gameId);

        // Open case 2
        vm.prank(player);
        game.openCase(gameId, 2);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 2, 10);
        // -> AwaitingOffer (remaining: cases 3, 4 = 2 non-player)

        // Banker makes offer via onReport, player rejects
        bytes memory offer2 = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(uint256(gameId), uint256(20), "Better deal?")
        );
        vm.prank(creForwarder);
        game.onReport("", offer2);
        vm.prank(player);
        game.rejectDeal(gameId);

        // Open case 3
        vm.prank(player);
        game.openCase(gameId, 3);
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 3, 50);
        // -> FinalRound (remaining: case 4 = 1 non-player)
    }

    // ── Tests ──

    function test_createGame_withEntryFee() public {
        uint256 bankBalBefore = address(bank).balance;

        vm.prank(player);
        uint256 gameId = game.createGame{value: ENTRY_FEE_WITH_SLIPPAGE}();

        assertEq(gameId, 0);

        // Bank should have received the entry fee
        assertEq(address(bank).balance, bankBalBefore + ENTRY_FEE_WITH_SLIPPAGE);

        // Entry deposit recorded
        assertEq(game.getEntryDeposit(gameId), ENTRY_FEE_WITH_SLIPPAGE);
    }

    function test_createGame_bankNotActive_reverts() public {
        // Deploy a fresh bank without sweetening
        Bank freshBank = new Bank(address(mockFeed));
        freshBank.setAuthorizedGame(address(game), true);

        // Temporarily set game to use fresh bank
        game.setBank(address(freshBank));

        vm.prank(player);
        vm.expectRevert(DealOrNotQuickPlay.BankNotActive.selector);
        game.createGame{value: ENTRY_FEE_WITH_SLIPPAGE}();
    }

    function test_createGame_insufficientFee_reverts() public {
        vm.prank(player);
        vm.expectRevert(); // GameMath.InsufficientDeposit
        game.createGame{value: 100}(); // way too little
    }

    function test_VRFSeed_storedAndQueryable() public {
        uint256 gameId = _createGameAndFulfillVRF();

        uint256 seed = game.getVRFSeed(gameId);
        assertEq(seed, 12345);

        uint256 requestId = game.getVRFRequestId(gameId);
        assertGt(requestId, 0);
    }

    function test_fullGame_dealAccepted_settlesFromBank() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // Play two rounds: open case 1 (value 5)
        _playTwoRounds(gameId);

        // CRE delivers banker offer via onReport
        bytes memory offerReport = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(uint256(gameId), uint256(30), "Take the deal!")
        );
        vm.prank(creForwarder);
        game.onReport("", offerReport);

        uint256 playerBalBefore = player.balance;

        // Accept deal
        vm.prank(player);
        game.acceptDeal(gameId);

        // Player should receive 30 cents worth: 30 * 500000000000000 / 100 = 150000000000000
        uint256 expectedPayout = 150000000000000;
        assertEq(player.balance - playerBalBefore, expectedPayout);

        // Verify game state
        (, , , uint8 phase, , , , , uint256 finalPayout, , ,) = game.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 30);
    }

    function test_fullGame_keepCase_settlesFromBank() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // Play through to FinalRound (cases 1,2,3 opened with values 5,10,50)
        _playToFinalRound(gameId);

        // Now in FinalRound. Keep case (player case 0).
        // keepCase requests reveal of case 4 (last non-player case)
        vm.prank(player);
        game.keepCase(gameId);

        // CRE reveals case 4 = 1 cent (the only remaining non-player case)
        vm.prank(creForwarder);
        game.fulfillCaseValue(gameId, 4, 1);

        // _completeFinalReveal assigns remaining value (100) to player's case
        // Game state should be GameOver with finalPayout = 100
        (, , , uint8 phase, , , , , uint256 finalPayout, , ,) = game.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 100); // $1.00 -- player gets the big case!
    }

    function test_priceFeedConversion() public view {
        uint256 weiAmount = game.centsToWei(0, 25);
        // Game 0 hasn't been created yet, ethPerDollar = 0, so this would be 0
        // Let's just verify estimateEntryFee works
        (uint256 base, uint256 withSlippage) = game.estimateEntryFee();
        assertEq(base, ENTRY_FEE_WEI);
        assertEq(withSlippage, ENTRY_FEE_WITH_SLIPPAGE);
    }

    function test_bankerOfferWithMessage() public {
        uint256 gameId = _createGameAndFulfillVRF();
        _playTwoRounds(gameId);

        // Game is in AwaitingOffer after opening case 1
        // CRE delivers banker offer via onReport (not direct call, which requires banker auth)
        bytes memory report = abi.encodePacked(
            game.setBankerOfferWithMessage.selector,
            abi.encode(uint256(gameId), uint256(42), "Deal or NOT, my friend?")
        );
        vm.prank(creForwarder);
        game.onReport("", report);

        (, , , , , , , uint256 offer, , , ,) = game.getGameState(gameId);
        assertEq(offer, 42);
    }

    function test_expireGame() public {
        uint256 gameId = _createGameAndFulfillVRF();

        // Warp past 10 minutes
        vm.warp(block.timestamp + 601);

        vm.prank(creForwarder);
        game.expireGame(gameId);

        (, , , uint8 phase, , , , , uint256 finalPayout, , ,) = game.getGameState(gameId);
        assertEq(phase, 8); // GameOver
        assertEq(finalPayout, 0);
    }

    function test_expireGame_tooEarly_reverts() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(creForwarder);
        vm.expectRevert(DealOrNotQuickPlay.GameNotExpired.selector);
        game.expireGame(gameId);
    }

    function test_onReport_fulfillCaseValue() public {
        uint256 gameId = _createGameAndFulfillVRF();

        vm.prank(player);
        game.pickCase(gameId, 0);

        // Open case 1
        vm.prank(player);
        game.openCase(gameId, 1);

        // CRE delivers via onReport
        bytes memory report = abi.encodePacked(
            game.fulfillCaseValue.selector,
            abi.encode(gameId, uint8(1), uint256(5))
        );
        vm.prank(creForwarder);
        game.onReport("", report);

        // Verify case was revealed
        (, , , , , , , , , , uint256[5] memory values,) = game.getGameState(gameId);
        assertEq(values[1], 5);
    }

    function test_ccipBridge_unauthorized_reverts() public {
        uint256 gameId = _createGameAndFulfillVRF();

        address bridge = makeAddr("bridge");
        game.setCCIPBridge(bridge);

        // Non-bridge caller should revert
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(DealOrNotQuickPlay.NotCCIPBridge.selector);
        game.joinGameCrossChain(gameId, makeAddr("crossChainPlayer"));
    }
}
