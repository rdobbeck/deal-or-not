// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SponsorVault} from "../src/SponsorVault.sol";

/// @dev Mock game contract that returns controlled game state
contract MockGameContract {
    struct MockState {
        address host;
        address player;
        uint8 phase;
        uint8 playerCase;
        uint8 totalCollapsed;
        uint256 ethPerDollar;
        uint256[5] caseValues;
    }

    mapping(uint256 => MockState) public states;

    function setGameState(
        uint256 gameId,
        address player,
        uint8 phase,
        uint8 playerCase,
        uint8 totalCollapsed,
        uint256 ethPerDollar,
        uint256[5] memory caseValues
    ) external {
        states[gameId] = MockState({
            host: player,
            player: player,
            phase: phase,
            playerCase: playerCase,
            totalCollapsed: totalCollapsed,
            ethPerDollar: ethPerDollar,
            caseValues: caseValues
        });
    }

    function getGameState(uint256 gameId) external view returns (
        address host, address player, uint8 mode, uint8 phase,
        uint8 playerCase, uint8 currentRound, uint8 totalCollapsed,
        uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar,
        uint256[5] memory caseValues, bool[5] memory opened
    ) {
        MockState storage s = states[gameId];
        bool[5] memory o;
        return (s.host, s.player, 0, s.phase, s.playerCase, 0, s.totalCollapsed, 0, 0, s.ethPerDollar, s.caseValues, o);
    }
}

contract SponsorVaultTest is Test {
    SponsorVault vault;
    MockGameContract mockGame;
    address sponsor = makeAddr("sponsor");
    address player = makeAddr("player");
    address owner;

    uint256 constant ETH_PER_DOLLAR = 500000000000000; // $2000/ETH

    function setUp() public {
        owner = address(this);
        mockGame = new MockGameContract();
        vault = new SponsorVault(address(mockGame));

        // Register sponsor with 1 ETH
        vm.deal(sponsor, 2 ether);
        vm.prank(sponsor);
        vault.registerSponsor{value: 1 ether}("TestSponsor", "ipfs://logo");
    }

    function test_registerSponsor() public view {
        (string memory name, string memory logo, uint256 balance, uint256 spent, bool registered) = vault.sponsors(sponsor);
        assertEq(name, "TestSponsor");
        assertEq(logo, "ipfs://logo");
        assertEq(balance, 1 ether);
        assertEq(spent, 0);
        assertTrue(registered);
    }

    function test_sponsorGame() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        assertEq(vault.gameSponsor(0), sponsor);
    }

    function test_addToJackpot() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);

        // Owner adds to jackpot (simulating CRE)
        vault.addToJackpot(0, 10); // 10 cents
        assertEq(vault.getJackpot(0), 10);

        vault.addToJackpot(0, 15);
        assertEq(vault.getJackpot(0), 25);
    }

    function test_claimJackpot_topCase_5050Split() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        vault.addToJackpot(0, 100); // $1.00 jackpot

        // Set game state: player has case 0, value = 100 ($1.00), game over, all collapsed
        uint256[5] memory values = [uint256(100), 50, 10, 5, 1];
        mockGame.setGameState(0, player, 8, 0, 5, ETH_PER_DOLLAR, values);

        // Claim
        vm.prank(player);
        vault.claimJackpot(0);

        // Player gets 50% = 50 cents = 50 * 500000000000000 / 100 = 250000000000000 wei
        assertEq(player.balance, 250000000000000);

        // Rolling jackpot gets the other 50 cents
        assertEq(vault.getRollingJackpot(), 50);

        // Game jackpot is zero
        assertEq(vault.getJackpot(0), 0);
        assertTrue(vault.claimed(0));
    }

    function test_claimJackpot_notTopCase_reverts() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        vault.addToJackpot(0, 100);

        // Player's case value is 50 (not 100)
        uint256[5] memory values = [uint256(50), 100, 10, 5, 1];
        mockGame.setGameState(0, player, 8, 0, 5, ETH_PER_DOLLAR, values);

        vm.prank(player);
        vm.expectRevert(SponsorVault.NotTopCase.selector);
        vault.claimJackpot(0);
    }

    function test_claimJackpot_didNotGoAllTheWay_reverts() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        vault.addToJackpot(0, 100);

        // totalCollapsed = 3 (not 5)
        uint256[5] memory values = [uint256(100), 50, 10, 5, 1];
        mockGame.setGameState(0, player, 8, 0, 3, ETH_PER_DOLLAR, values);

        vm.prank(player);
        vm.expectRevert(SponsorVault.DidNotGoAllTheWay.selector);
        vault.claimJackpot(0);
    }

    function test_claimJackpot_gameNotOver_reverts() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        vault.addToJackpot(0, 100);

        // phase = 5 (BankerOffer, not GameOver)
        uint256[5] memory values = [uint256(100), 50, 10, 5, 1];
        mockGame.setGameState(0, player, 5, 0, 5, ETH_PER_DOLLAR, values);

        vm.prank(player);
        vm.expectRevert(SponsorVault.GameNotOver.selector);
        vault.claimJackpot(0);
    }

    function test_clearExpiredJackpot() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);
        vault.addToJackpot(0, 50);

        // Game over (expired)
        uint256[5] memory values;
        mockGame.setGameState(0, player, 8, 0, 0, ETH_PER_DOLLAR, values);

        vault.clearExpiredJackpot(0);
        assertEq(vault.getJackpot(0), 0);
        assertTrue(vault.claimed(0));
    }

    function test_topUp() public {
        vm.prank(sponsor);
        vault.topUp{value: 0.5 ether}();

        (, , uint256 balance, ,) = vault.sponsors(sponsor);
        assertEq(balance, 1.5 ether);
    }

    function test_getGameSponsorInfo() public {
        vm.prank(sponsor);
        vault.sponsorGame(0);

        (string memory name, string memory logo, address addr) = vault.getGameSponsorInfo(0);
        assertEq(name, "TestSponsor");
        assertEq(logo, "ipfs://logo");
        assertEq(addr, sponsor);
    }
}
