// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {PredictionMarket} from "../contracts/PredictionMarket.sol";

abstract contract PredictionMarketTestBase is Test {
    PredictionMarket public market;

    address public admin = address(this);
    address public resolver = address(0x7E50);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);

    uint256 public marketId;

    function setUp() public virtual {
        market = new PredictionMarket();
        market.authorizeResolver(resolver);

        vm.prank(resolver);
        marketId = market.createMarket(
            1, 1, PredictionMarket.MarketType.WillWin, 0, block.timestamp + 1 hours
        );
    }

    receive() external payable {}
}

contract PredictionMarketTest is PredictionMarketTestBase {

    function test_CreateMarket() public {
        assertEq(marketId, 1);
        (uint256 gId, uint256 aId,, PredictionMarket.MarketStatus st,) = market.getMarketCore(marketId);
        assertEq(gId, 1);
        assertEq(aId, 1);
        assertTrue(st == PredictionMarket.MarketStatus.Open);
    }

    function test_CreateMarket_Unauthorized_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.createMarket(2, 1, PredictionMarket.MarketType.WillWin, 0, block.timestamp + 1 hours);
    }

    function test_CreateMarket_MultipleTypes() public {
        vm.startPrank(resolver);
        uint256 m2 = market.createMarket(1, 1, PredictionMarket.MarketType.EarningsOver, 50, block.timestamp + 1 hours);
        uint256 m3 = market.createMarket(1, 1, PredictionMarket.MarketType.WillAcceptOffer, 0, block.timestamp + 1 hours);
        uint256 m4 = market.createMarket(1, 1, PredictionMarket.MarketType.RoundPrediction, 3, block.timestamp + 1 hours);
        vm.stopPrank();

        assertEq(m2, 2);
        assertEq(m3, 3);
        assertEq(m4, 4);

        uint256[] memory gameMarkets = market.getGameMarkets(1);
        assertEq(gameMarkets.length, 4);
    }

    function test_PlaceBet_Yes() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);
        assertEq(betId, 1);

        (uint256 tp, uint256 yp, uint256 np,) = market.getMarketPools(marketId);
        assertEq(yp, 0.1 ether);
        assertEq(np, 0);
        assertEq(tp, 0.1 ether);
        assertEq(market.totalVolume(), 0.1 ether);
    }

    function test_PlaceBet_No() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        market.placeBet{value: 0.05 ether}(marketId, false);

        (, , uint256 np,) = market.getMarketPools(marketId);
        assertEq(np, 0.05 ether);
    }

    function test_PlaceBet_TooSmall_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.BetTooSmall.selector);
        market.placeBet{value: 0.0001 ether}(marketId, true);
    }

    function test_PlaceBet_AfterLock_Reverts() public {
        vm.warp(block.timestamp + 2 hours);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketLocked.selector);
        market.placeBet{value: 0.1 ether}(marketId, true);
    }

    function test_PlaceBet_ClosedMarket_Reverts() public {
        vm.prank(resolver);
        market.lockMarket(marketId);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.MarketNotOpen.selector);
        market.placeBet{value: 0.1 ether}(marketId, true);
    }

    function test_PlaceBet_MultipleBettors() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.3 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.2 ether}(marketId, false);

        (uint256 tp, uint256 yp, uint256 np,) = market.getMarketPools(marketId);
        assertEq(tp, 0.5 ether);
        assertEq(yp, 0.3 ether);
        assertEq(np, 0.2 ether);
    }

    function test_GetMarketOdds_NoBets() public view {
        (uint256 yesOdds, uint256 noOdds) = market.getMarketOdds(marketId);
        assertEq(yesOdds, 5000);
        assertEq(noOdds, 5000);
    }

    function test_GetMarketOdds_WithBets() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.75 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.25 ether}(marketId, false);

        (uint256 yesOdds, uint256 noOdds) = market.getMarketOdds(marketId);
        assertEq(yesOdds, 7500);
        assertEq(noOdds, 2500);
    }

    function test_LockMarket() public {
        vm.prank(resolver);
        market.lockMarket(marketId);

        (,,, PredictionMarket.MarketStatus st,) = market.getMarketCore(marketId);
        assertTrue(st == PredictionMarket.MarketStatus.Locked);
    }

    function test_ResolveMarket_YesWins() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);

        vm.prank(resolver);
        market.lockMarket(marketId);
        vm.prank(resolver);
        market.resolveMarket(marketId, true);

        (,,, PredictionMarket.MarketStatus st, bool outcome) = market.getMarketCore(marketId);
        assertTrue(st == PredictionMarket.MarketStatus.Resolved);
        assertTrue(outcome);
    }

    function test_ResolveMarket_Unauthorized_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.resolveMarket(marketId, true);
    }
}

contract PredictionMarketPayoutTest is PredictionMarketTestBase {

    function test_ClaimPayout_Winner() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        uint256 aliceBetId = market.placeBet{value: 0.3 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.2 ether}(marketId, false);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        market.claimPayout(aliceBetId);

        assertEq(alice.balance - balBefore, 0.49 ether);
    }

    function test_ClaimPayout_Loser_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);
        vm.prank(bob);
        uint256 bobBetId = market.placeBet{value: 0.1 ether}(marketId, false);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.NotWinner.selector);
        market.claimPayout(bobBetId);
    }

    function test_ClaimPayout_AlreadyClaimed_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        vm.prank(alice);
        market.claimPayout(betId);

        vm.prank(alice);
        vm.expectRevert(PredictionMarket.BetAlreadyClaimed.selector);
        market.claimPayout(betId);
    }

    function test_ClaimPayout_NotBettor_Reverts() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.claimPayout(betId);
    }

    function test_ClaimPayout_ProportionalSplit() public {
        vm.deal(alice, 2 ether);
        vm.deal(bob, 2 ether);
        vm.deal(carol, 2 ether);

        vm.prank(alice);
        uint256 aliceBet = market.placeBet{value: 0.6 ether}(marketId, true);
        vm.prank(bob);
        uint256 bobBet = market.placeBet{value: 0.2 ether}(marketId, true);
        vm.prank(carol);
        market.placeBet{value: 0.2 ether}(marketId, false);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        uint256 aliceBal = alice.balance;
        vm.prank(alice);
        market.claimPayout(aliceBet);
        assertEq(alice.balance - aliceBal, 0.735 ether);

        uint256 bobBal = bob.balance;
        vm.prank(bob);
        market.claimPayout(bobBet);
        assertEq(bob.balance - bobBal, 0.245 ether);
    }

    function test_CancelMarket_Refund() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.5 ether}(marketId, true);

        vm.prank(resolver);
        market.cancelMarket(marketId);

        uint256 balBefore = alice.balance;
        vm.prank(alice);
        market.claimPayout(betId);
        assertEq(alice.balance - balBefore, 0.5 ether);
    }

    function test_WithdrawFees() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.5 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.5 ether}(marketId, false);

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        assertEq(market.totalFeesCollected(), 0.02 ether);

        uint256 balBefore = admin.balance;
        market.withdrawFees();
        assertEq(admin.balance - balBefore, 0.02 ether);
        assertEq(market.totalFeesCollected(), 0);
    }

    function test_WithdrawFees_ZeroFees_Reverts() public {
        vm.expectRevert(PredictionMarket.ZeroAmount.selector);
        market.withdrawFees();
    }

    function test_WithdrawFees_NotAdmin_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PredictionMarket.Unauthorized.selector);
        market.withdrawFees();
    }

    function test_GetUserBets() public {
        vm.deal(alice, 1 ether);
        vm.startPrank(alice);
        market.placeBet{value: 0.1 ether}(marketId, true);
        market.placeBet{value: 0.05 ether}(marketId, false);
        vm.stopPrank();

        uint256[] memory bets = market.getUserBets(alice);
        assertEq(bets.length, 2);
    }

    function test_GetMarketStats() public {
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        vm.prank(alice);
        market.placeBet{value: 0.6 ether}(marketId, true);
        vm.prank(bob);
        market.placeBet{value: 0.4 ether}(marketId, false);

        (uint256 totalBets, uint256 totalPool, uint256 yesOdds, uint256 noOdds) =
            market.getMarketStats(marketId);

        assertEq(totalBets, 2);
        assertEq(totalPool, 1 ether);
        assertEq(yesOdds, 6000);
        assertEq(noOdds, 4000);
    }

    function test_CalculatePotentialPayout() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        market.placeBet{value: 0.5 ether}(marketId, true);

        uint256 potential = market.calculatePotentialPayout(marketId, true, 0.5 ether);
        assertEq(potential, 0.49 ether);
    }

    function test_CanClaimBet() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        uint256 betId = market.placeBet{value: 0.1 ether}(marketId, true);

        assertFalse(market.canClaimBet(betId));

        vm.startPrank(resolver);
        market.lockMarket(marketId);
        market.resolveMarket(marketId, true);
        vm.stopPrank();

        assertTrue(market.canClaimBet(betId));

        vm.prank(alice);
        market.claimPayout(betId);
        assertFalse(market.canClaimBet(betId));
    }

    function test_AuthorizeResolver() public {
        address newResolver = address(0x1234);
        market.authorizeResolver(newResolver);
        assertTrue(market.authorizedResolvers(newResolver));
    }

    function test_RevokeResolver() public {
        market.revokeResolver(resolver);
        assertFalse(market.authorizedResolvers(resolver));
    }
}
