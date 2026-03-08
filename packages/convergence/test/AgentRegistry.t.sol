// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public admin = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public gameContract = address(0x6A3E);

    function setUp() public {
        registry = new AgentRegistry();
    }

    // ── Registration ──

    function test_RegisterAgent() public {
        vm.prank(alice);
        uint256 agentId = registry.registerAgent("TestBot", "https://api.test.com", '{"v":"1"}');
        assertEq(agentId, 1);
        assertEq(registry.totalAgents(), 1);
        assertEq(registry.playerToAgentId(alice), 1);
    }

    function test_RegisterAgent_EmptyName_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.EmptyName.selector);
        registry.registerAgent("", "https://api.test.com", "{}");
    }

    function test_RegisterAgent_EmptyEndpoint_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.InvalidEndpoint.selector);
        registry.registerAgent("Bot", "", "{}");
    }

    function test_RegisterAgent_PlayerToAgentId() public {
        vm.prank(alice);
        registry.registerAgent("Bot1", "https://a.com", "{}");
        vm.prank(alice);
        registry.registerAgent("Bot2", "https://b.com", "{}");
        // Second registration overwrites mapping
        assertEq(registry.playerToAgentId(alice), 2);
    }

    function test_RegisterAgent_OwnerAgents() public {
        vm.prank(alice);
        registry.registerAgent("Bot1", "https://a.com", "{}");
        vm.prank(alice);
        registry.registerAgent("Bot2", "https://b.com", "{}");

        uint256[] memory agents = registry.getOwnerAgents(alice);
        assertEq(agents.length, 2);
        assertEq(agents[0], 1);
        assertEq(agents[1], 2);
    }

    function test_RegisterAgent_IncrementingIds() public {
        vm.prank(alice);
        uint256 id1 = registry.registerAgent("A", "https://a.com", "{}");
        vm.prank(bob);
        uint256 id2 = registry.registerAgent("B", "https://b.com", "{}");
        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    // ── Updates ──

    function test_UpdateAgent() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://old.com", "{}");

        vm.prank(alice);
        registry.updateAgent(1, "https://new.com", '{"updated":true}');

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.apiEndpoint, "https://new.com");
    }

    function test_UpdateAgent_NotOwner_Reverts() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        vm.prank(bob);
        vm.expectRevert(AgentRegistry.Unauthorized.selector);
        registry.updateAgent(1, "https://b.com", "{}");
    }

    function test_UpdateAgent_Banned_Reverts() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.banAgent(1, "bad behavior");

        vm.prank(alice);
        vm.expectRevert(AgentRegistry.AgentIsBanned.selector);
        registry.updateAgent(1, "https://new.com", "{}");
    }

    // ── Admin ──

    function test_AuthorizeContract() public {
        registry.authorizeContract(gameContract);
        assertTrue(registry.authorizedCallers(gameContract));
    }

    function test_RevokeContract() public {
        registry.authorizeContract(gameContract);
        registry.revokeContract(gameContract);
        assertFalse(registry.authorizedCallers(gameContract));
    }

    function test_AuthorizeContract_NotAdmin_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(AgentRegistry.Unauthorized.selector);
        registry.authorizeContract(gameContract);
    }

    function test_BanAgent() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.banAgent(1, "cheating");

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertTrue(agent.isBanned);
    }

    function test_UnbanAgent() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.banAgent(1, "oops");
        registry.unbanAgent(1);

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertFalse(agent.isBanned);
    }

    function test_BanAgent_NotAdmin_Reverts() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        vm.prank(alice);
        vm.expectRevert(AgentRegistry.Unauthorized.selector);
        registry.banAgent(1, "nope");
    }

    // ── Stats ──

    function test_RecordGame() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.authorizeContract(gameContract);

        vm.prank(gameContract);
        registry.recordGame(1, true, 75);

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 1);
        assertEq(agent.totalEarnings, 75);
    }

    function test_RecordGame_Loss() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.authorizeContract(gameContract);

        vm.prank(gameContract);
        registry.recordGame(1, false, 10);

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 0);
        assertEq(agent.totalEarnings, 10);
    }

    function test_RecordGame_Unauthorized_Reverts() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        vm.prank(bob);
        vm.expectRevert(AgentRegistry.Unauthorized.selector);
        registry.recordGame(1, true, 50);
    }

    function test_UpdateAgentStats() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");

        registry.authorizeContract(gameContract);

        vm.prank(gameContract);
        registry.updateAgentStats(1, 42, 75, true);

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.gamesPlayed, 1);
        assertEq(agent.gamesWon, 1);
        assertEq(agent.totalEarnings, 75);
    }

    function test_RecordGame_MultipleGames() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        registry.authorizeContract(gameContract);

        vm.startPrank(gameContract);
        registry.recordGame(1, true, 100);
        registry.recordGame(1, false, 20);
        registry.recordGame(1, true, 80);
        vm.stopPrank();

        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.gamesPlayed, 3);
        assertEq(agent.gamesWon, 2);
        assertEq(agent.totalEarnings, 200);
    }

    // ── View Functions ──

    function test_GetAgentStats_WinRate() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        registry.authorizeContract(gameContract);

        vm.startPrank(gameContract);
        registry.recordGame(1, true, 100);
        registry.recordGame(1, false, 20);
        registry.recordGame(1, true, 80);
        registry.recordGame(1, false, 10);
        vm.stopPrank();

        AgentRegistry.AgentStats memory stats = registry.getAgentStats(1);
        // 2 wins / 4 games = 50% = 5000 basis points
        assertEq(stats.winRate, 5000);
        // avg earnings = 210 / 4 = 52 cents
        assertEq(stats.avgEarnings, 52);
    }

    function test_IsAgentEligible_ById() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        assertTrue(registry.isAgentEligible(1));
    }

    function test_IsAgentEligible_ByAddress() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        assertTrue(registry.isAgentEligible(alice));
    }

    function test_IsAgentEligible_Banned_False() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        registry.banAgent(1, "bad");
        assertFalse(registry.isAgentEligible(1));
        assertFalse(registry.isAgentEligible(alice));
    }

    function test_IsAgentEligible_NotRegistered_False() public {
        assertFalse(registry.isAgentEligible(alice));
        assertFalse(registry.isAgentEligible(uint256(999)));
    }

    function test_GetAgentEndpoint_ById() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://api.bot.com", "{}");
        assertEq(registry.getAgentEndpoint(uint256(1)), "https://api.bot.com");
    }

    function test_GetAgentEndpoint_ByAddress() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://api.bot.com", "{}");
        assertEq(registry.getAgentEndpoint(alice), "https://api.bot.com");
    }

    function test_GetAgentEndpoint_Banned_Reverts() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        registry.banAgent(1, "bad");

        vm.expectRevert(AgentRegistry.AgentIsBanned.selector);
        registry.getAgentEndpoint(uint256(1));

        vm.expectRevert(AgentRegistry.AgentIsBanned.selector);
        registry.getAgentEndpoint(alice);
    }

    function test_GetAgentEndpoint_NotFound_Reverts() public {
        vm.expectRevert(AgentRegistry.AgentNotFound.selector);
        registry.getAgentEndpoint(uint256(999));

        vm.expectRevert(AgentRegistry.AgentNotFound.selector);
        registry.getAgentEndpoint(alice);
    }

    function test_GetAgentId() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        assertEq(registry.getAgentId(alice), 1);
        assertEq(registry.getAgentId(bob), 0);
    }

    function test_GetTopAgents_Sorted() public {
        registry.authorizeContract(gameContract);

        vm.prank(alice);
        registry.registerAgent("Low", "https://a.com", "{}");
        vm.prank(bob);
        registry.registerAgent("High", "https://b.com", "{}");

        vm.startPrank(gameContract);
        registry.recordGame(1, true, 20);
        registry.recordGame(2, true, 100);
        vm.stopPrank();

        uint256[] memory top = registry.getTopAgents(10);
        assertEq(top.length, 2);
        assertEq(top[0], 2); // Higher earnings first
        assertEq(top[1], 1);
    }

    // ── Edge Cases ──

    function test_UnbanRestoresEligibility() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        registry.banAgent(1, "temp");
        assertFalse(registry.isAgentEligible(1));
        registry.unbanAgent(1);
        assertTrue(registry.isAgentEligible(1));
    }

    function test_AdminCanRecordGame() public {
        vm.prank(alice);
        registry.registerAgent("Bot", "https://a.com", "{}");
        // Admin (this contract) is always authorized
        registry.recordGame(1, true, 50);
        AgentRegistry.Agent memory agent = registry.getAgent(1);
        assertEq(agent.gamesPlayed, 1);
    }
}
