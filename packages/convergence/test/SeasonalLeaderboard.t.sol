// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {SeasonalLeaderboard} from "../contracts/SeasonalLeaderboard.sol";

contract SeasonalLeaderboardTest is Test {
    AgentRegistry public registry;
    SeasonalLeaderboard public leaderboard;

    address public admin = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);
    address public gameContract = address(0x6A3E);

    uint256 public agent1;
    uint256 public agent2;
    uint256 public agent3;

    function setUp() public {
        registry = new AgentRegistry();
        leaderboard = new SeasonalLeaderboard(address(registry));
        leaderboard.authorizeRecorder(gameContract);

        // Register agents
        vm.prank(alice);
        agent1 = registry.registerAgent("AliceBot", "https://a.com", "{}");
        vm.prank(bob);
        agent2 = registry.registerAgent("BobBot", "https://b.com", "{}");
        vm.prank(carol);
        agent3 = registry.registerAgent("CarolBot", "https://c.com", "{}");
    }

    // ── Season Management ──

    function test_StartSeason() public {
        uint256 seasonId = leaderboard.startSeason();
        assertEq(seasonId, 1);
        assertEq(leaderboard.currentSeasonId(), 1);
        assertTrue(leaderboard.isSeasonActive());
    }

    function test_StartSeason_WhileActive_Reverts() public {
        leaderboard.startSeason();
        vm.expectRevert(SeasonalLeaderboard.SeasonAlreadyActive.selector);
        leaderboard.startSeason();
    }

    function test_StartSeason_NotAdmin_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(SeasonalLeaderboard.Unauthorized.selector);
        leaderboard.startSeason();
    }

    function test_EndSeason() public {
        leaderboard.startSeason();

        // Warp past 30 days
        vm.warp(block.timestamp + 30 days + 1);

        leaderboard.endSeason();
        assertFalse(leaderboard.isSeasonActive());
    }

    function test_EndSeason_TooEarly_Reverts() public {
        leaderboard.startSeason();

        // Only 10 days in
        vm.warp(block.timestamp + 10 days);

        vm.expectRevert(SeasonalLeaderboard.SeasonNotActive.selector);
        leaderboard.endSeason();
    }

    function test_EndSeason_NoSeason_Reverts() public {
        vm.expectRevert(SeasonalLeaderboard.InvalidSeason.selector);
        leaderboard.endSeason();
    }

    // ── Recording Game Results ──

    function test_RecordGameResult_Win() public {
        leaderboard.startSeason();

        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 75);

        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        assertEq(stats.gamesPlayed, 1);
        assertEq(stats.gamesWon, 1);
        assertEq(stats.totalEarnings, 75);
        // Points: 100 (win) + 7 (75 cents * 10 / 100) = 107
        assertEq(stats.points, 107);
    }

    function test_RecordGameResult_Loss() public {
        leaderboard.startSeason();

        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, false, 10);

        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        assertEq(stats.gamesPlayed, 1);
        assertEq(stats.gamesWon, 0);
        assertEq(stats.totalEarnings, 10);
        // Points: 0 (no win) + 1 (10 cents * 10 / 100) = 1
        assertEq(stats.points, 1);
    }

    function test_RecordGameResult_PerfectGame() public {
        leaderboard.startSeason();

        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 100); // $1.00 = perfect

        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        // Points: 100 (win) + 10 (100 cents * 10 / 100) + 500 (perfect game) = 610
        assertEq(stats.points, 610);
    }

    function test_RecordGameResult_HighestSingleGame() public {
        leaderboard.startSeason();

        vm.startPrank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);
        leaderboard.recordGameResult(agent1, true, 80);
        leaderboard.recordGameResult(agent1, false, 30);
        vm.stopPrank();

        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        assertEq(stats.highestSingleGame, 80);
    }

    function test_RecordGameResult_NoActiveSeason_Skips() public {
        // No season started — should silently skip, not revert
        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);
        // No revert = success
    }

    function test_RecordGameResult_Unauthorized_Reverts() public {
        leaderboard.startSeason();

        vm.prank(alice);
        vm.expectRevert(SeasonalLeaderboard.Unauthorized.selector);
        leaderboard.recordGameResult(agent1, true, 50);
    }

    function test_RecordGameResult_ParticipantCount() public {
        leaderboard.startSeason();

        vm.startPrank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);
        leaderboard.recordGameResult(agent1, true, 30); // same agent, count stays at 1
        leaderboard.recordGameResult(agent2, false, 10); // new agent, count becomes 2
        vm.stopPrank();

        // Can't directly check participatingAgents from outside easily,
        // but we can verify through multiple games
        SeasonalLeaderboard.AgentSeasonStats memory s1 = leaderboard.getCurrentAgentStats(agent1);
        SeasonalLeaderboard.AgentSeasonStats memory s2 = leaderboard.getCurrentAgentStats(agent2);
        assertEq(s1.gamesPlayed, 2);
        assertEq(s2.gamesPlayed, 1);
    }

    // ── Prize Distribution ──

    function test_AddPrizePool() public {
        leaderboard.startSeason();

        vm.deal(admin, 10 ether);
        leaderboard.addPrizePool{value: 5 ether}();

        // Verify prize pool via season struct (startTime, endTime, totalPrizePool...)
        (,,uint256 totalPrizePool,,,) = leaderboard.seasons(1);
        assertEq(totalPrizePool, 5 ether);
    }

    function test_DistributePrizes_SingleWinner() public {
        leaderboard.startSeason();

        // Agent 1 plays and wins
        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 100);

        // Add prize pool
        vm.deal(admin, 10 ether);
        leaderboard.addPrizePool{value: 1 ether}();

        // End season
        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();

        // Distribute prizes — agent1 is sole winner, gets 50% (rank 1)
        uint256 aliceBal = alice.balance;
        leaderboard.distributePrizes();

        // First place gets 50% = 0.5 ETH
        assertEq(alice.balance - aliceBal, 0.5 ether);
    }

    function test_DistributePrizes_ThreeWinners() public {
        leaderboard.startSeason();

        // Different performance levels
        vm.startPrank(gameContract);
        leaderboard.recordGameResult(agent1, true, 100); // 610 points (perfect)
        leaderboard.recordGameResult(agent2, true, 50);   // 105 points
        leaderboard.recordGameResult(agent3, false, 10);  // 1 point
        vm.stopPrank();

        vm.deal(admin, 10 ether);
        leaderboard.addPrizePool{value: 1 ether}();

        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();

        uint256 aliceBal = alice.balance;
        uint256 bobBal = bob.balance;
        uint256 carolBal = carol.balance;

        leaderboard.distributePrizes();

        // 1st: 50% = 0.5, 2nd: 25% = 0.25, 3rd: 15% = 0.15
        assertEq(alice.balance - aliceBal, 0.5 ether);
        assertEq(bob.balance - bobBal, 0.25 ether);
        assertEq(carol.balance - carolBal, 0.15 ether);
    }

    function test_DistributePrizes_SeasonStillActive_Reverts() public {
        leaderboard.startSeason();

        vm.deal(admin, 1 ether);
        leaderboard.addPrizePool{value: 1 ether}();

        vm.expectRevert(SeasonalLeaderboard.SeasonNotActive.selector);
        leaderboard.distributePrizes();
    }

    function test_DistributePrizes_AlreadyDistributed_Reverts() public {
        leaderboard.startSeason();

        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);

        vm.deal(admin, 2 ether);
        leaderboard.addPrizePool{value: 1 ether}();

        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();
        leaderboard.distributePrizes();

        vm.expectRevert(SeasonalLeaderboard.PrizesAlreadyDistributed.selector);
        leaderboard.distributePrizes();
    }

    function test_DistributePrizes_NoPrizePool_Reverts() public {
        leaderboard.startSeason();

        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);

        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();

        vm.expectRevert(SeasonalLeaderboard.InsufficientPrizePool.selector);
        leaderboard.distributePrizes();
    }

    // ── View Functions ──

    function test_GetCurrentAgentStats_NoSeason() public view {
        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        assertEq(stats.gamesPlayed, 0);
        assertEq(stats.points, 0);
    }

    function test_IsSeasonActive() public {
        assertFalse(leaderboard.isSeasonActive());
        leaderboard.startSeason();
        assertTrue(leaderboard.isSeasonActive());
    }

    function test_GetSeasonLeaderboard_AfterEnd() public {
        leaderboard.startSeason();

        vm.startPrank(gameContract);
        leaderboard.recordGameResult(agent1, true, 100); // 610 pts
        leaderboard.recordGameResult(agent2, true, 50);   // 105 pts
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();

        SeasonalLeaderboard.LeaderboardEntry[] memory lb = leaderboard.getSeasonLeaderboard(1, 10);
        assertEq(lb.length, 2);
        assertEq(lb[0].agentId, agent1); // Higher points first
        assertEq(lb[0].rank, 1);
        assertEq(lb[1].agentId, agent2);
        assertEq(lb[1].rank, 2);
    }

    function test_GetCurrentLeaderboard_NoSeason() public view {
        SeasonalLeaderboard.LeaderboardEntry[] memory lb = leaderboard.getCurrentLeaderboard(10);
        assertEq(lb.length, 0);
    }

    // ── Multiple Seasons ──

    function test_MultipleSeason() public {
        // Season 1
        leaderboard.startSeason();
        vm.prank(gameContract);
        leaderboard.recordGameResult(agent1, true, 50);
        vm.warp(block.timestamp + 30 days + 1);
        leaderboard.endSeason();

        // Season 2
        uint256 s2 = leaderboard.startSeason();
        assertEq(s2, 2);
        assertEq(leaderboard.totalSeasons(), 2);

        // Stats reset for new season
        SeasonalLeaderboard.AgentSeasonStats memory stats = leaderboard.getCurrentAgentStats(agent1);
        assertEq(stats.gamesPlayed, 0);
    }

    // ── Receive ETH via fallback ──

    function test_ReceiveETH_AddsToPrizePool() public {
        leaderboard.startSeason();

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(leaderboard).call{value: 0.5 ether}("");
        assertTrue(ok);

        (,,uint256 totalPrizePool,,,) = leaderboard.seasons(1);
        assertEq(totalPrizePool, 0.5 ether);
    }

    // ── Admin ──

    function test_AuthorizeRecorder() public {
        address newRecorder = address(0x1234);
        leaderboard.authorizeRecorder(newRecorder);
        assertTrue(leaderboard.authorizedRecorders(newRecorder));
    }

    function test_RevokeRecorder() public {
        leaderboard.revokeRecorder(gameContract);
        assertFalse(leaderboard.authorizedRecorders(gameContract));
    }

    function test_AuthorizeRecorder_NotAdmin_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(SeasonalLeaderboard.Unauthorized.selector);
        leaderboard.authorizeRecorder(address(0x1234));
    }

    // Needed to receive ETH
    receive() external payable {}
}
