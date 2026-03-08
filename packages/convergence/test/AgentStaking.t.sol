// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentStaking} from "../contracts/AgentStaking.sol";

contract AgentStakingTest is Test {
    AgentRegistry public registry;
    AgentStaking public staking;

    address public admin = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public carol = address(0xCA201);

    uint256 public agentId;

    function setUp() public {
        registry = new AgentRegistry();
        staking = new AgentStaking(address(registry));

        // Register an agent
        vm.prank(alice);
        agentId = registry.registerAgent("TestBot", "https://api.test.com", "{}");
    }

    // ── Staking ──

    function test_Stake() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        assertEq(stakeId, 1);
        assertEq(staking.totalStaked(), 0.5 ether);

        AgentStaking.AgentPool memory pool = staking.getAgentPool(agentId);
        assertEq(pool.totalStaked, 0.5 ether);
    }

    function test_Stake_ZeroAmount_Reverts() public {
        vm.prank(bob);
        vm.expectRevert(AgentStaking.ZeroAmount.selector);
        staking.stake{value: 0}(agentId);
    }

    function test_Stake_IneligibleAgent_Reverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        // isAgentEligible(999) reverts AgentNotFound in registry's external call,
        // which propagates up. Use low-level call to check.
        (bool success,) = address(staking).call{value: 0.1 ether}(
            abi.encodeWithSelector(staking.stake.selector, uint256(999))
        );
        assertFalse(success);
    }

    function test_Stake_BannedAgent_Reverts() public {
        registry.banAgent(agentId, "bad");

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(AgentStaking.AgentNotEligible.selector);
        staking.stake{value: 0.1 ether}(agentId);
    }

    function test_Stake_MultipleStakers() public {
        vm.deal(bob, 2 ether);
        vm.deal(carol, 2 ether);

        vm.prank(bob);
        staking.stake{value: 1 ether}(agentId);
        vm.prank(carol);
        staking.stake{value: 0.5 ether}(agentId);

        assertEq(staking.totalStaked(), 1.5 ether);
        AgentStaking.AgentPool memory pool = staking.getAgentPool(agentId);
        assertEq(pool.totalStaked, 1.5 ether);
    }

    // ── Unstaking ──

    function test_Unstake_AfterLockup() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        // Warp past lockup
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(bob);
        staking.unstake(stakeId);

        assertEq(staking.totalStaked(), 0);
        assertEq(bob.balance, 1 ether); // got stake back
    }

    function test_Unstake_BeforeLockup_Reverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        vm.prank(bob);
        vm.expectRevert(AgentStaking.StakeLocked.selector);
        staking.unstake(stakeId);
    }

    function test_Unstake_NotOwner_Reverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(carol);
        vm.expectRevert(AgentStaking.Unauthorized.selector);
        staking.unstake(stakeId);
    }

    function test_Unstake_AlreadyInactive_Reverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        staking.unstake(stakeId);

        vm.prank(bob);
        vm.expectRevert(AgentStaking.StakeNotActive.selector);
        staking.unstake(stakeId);
    }

    // ── Rewards ──

    function test_AddReward_UpdatesPool() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        staking.stake{value: 1 ether}(agentId);

        // Admin adds reward
        vm.deal(admin, 1 ether);
        staking.addAgentReward{value: 0.1 ether}(agentId, 0);

        AgentStaking.AgentPool memory pool = staking.getAgentPool(agentId);
        assertEq(pool.totalRewards, 0.1 ether);
        assertEq(staking.agentLifetimeRewards(agentId), 0.1 ether);
    }

    function test_AddReward_Unauthorized_Reverts() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        vm.expectRevert(AgentStaking.Unauthorized.selector);
        staking.addAgentReward{value: 0.1 ether}(agentId, 0);
    }

    function test_AddReward_ZeroAmount_Reverts() public {
        vm.expectRevert(AgentStaking.ZeroAmount.selector);
        staking.addAgentReward{value: 0}(agentId, 0);
    }

    function test_AddReward_AuthorizedCaller() public {
        address gameContract = address(0x6A3E);
        staking.setAuthorizedCaller(gameContract, true);

        vm.deal(bob, 1 ether);
        vm.prank(bob);
        staking.stake{value: 1 ether}(agentId);

        vm.deal(gameContract, 1 ether);
        vm.prank(gameContract);
        staking.addAgentReward{value: 0.2 ether}(agentId, 42);

        assertEq(staking.agentLifetimeRewards(agentId), 0.2 ether);
    }

    function test_ClaimRewards_SingleStaker() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 1 ether}(agentId);

        // Add reward
        vm.deal(admin, 1 ether);
        staking.addAgentReward{value: 0.1 ether}(agentId, 0);

        uint256 pending = staking.getPendingRewards(stakeId);
        assertEq(pending, 0.1 ether);

        // Claim
        vm.prank(bob);
        staking.claimRewards(stakeId);

        assertEq(bob.balance, 0.1 ether); // original 1 ETH staked, got 0.1 reward
        assertEq(staking.totalRewardsDistributed(), 0.1 ether);
    }

    function test_ClaimRewards_ProportionalDistribution() public {
        vm.deal(bob, 2 ether);
        vm.deal(carol, 2 ether);

        // Bob stakes 0.75 ETH, Carol stakes 0.25 ETH (3:1 ratio)
        vm.prank(bob);
        uint256 bobStake = staking.stake{value: 0.75 ether}(agentId);
        vm.prank(carol);
        uint256 carolStake = staking.stake{value: 0.25 ether}(agentId);

        // Add 1 ETH reward
        vm.deal(admin, 1 ether);
        staking.addAgentReward{value: 1 ether}(agentId, 0);

        // Bob should get 75%, Carol 25%
        assertEq(staking.getPendingRewards(bobStake), 0.75 ether);
        assertEq(staking.getPendingRewards(carolStake), 0.25 ether);
    }

    function test_ClaimRewards_LateStakerNoRetroRewards() public {
        vm.deal(bob, 2 ether);
        vm.deal(carol, 2 ether);

        // Bob stakes first
        vm.prank(bob);
        uint256 bobStake = staking.stake{value: 1 ether}(agentId);

        // Reward comes in — only Bob should benefit
        vm.deal(admin, 1 ether);
        staking.addAgentReward{value: 0.5 ether}(agentId, 0);

        // Carol stakes after the reward
        vm.prank(carol);
        uint256 carolStake = staking.stake{value: 1 ether}(agentId);

        // Carol should have 0 pending (joined after reward)
        assertEq(staking.getPendingRewards(carolStake), 0);
        // Bob should have the full 0.5 ETH
        assertEq(staking.getPendingRewards(bobStake), 0.5 ether);
    }

    function test_UnstakeWithRewards() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 1 ether}(agentId);

        // Add reward
        vm.deal(admin, 1 ether);
        staking.addAgentReward{value: 0.2 ether}(agentId, 0);

        // Warp past lockup and unstake (should auto-claim rewards)
        vm.warp(block.timestamp + 7 days + 1);
        vm.prank(bob);
        staking.unstake(stakeId);

        // Bob gets stake + rewards
        assertEq(bob.balance, 1.2 ether);
    }

    // ── View Functions ──

    function test_CanUnstake() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        uint256 stakeId = staking.stake{value: 0.5 ether}(agentId);

        assertFalse(staking.canUnstake(stakeId));

        vm.warp(block.timestamp + 7 days + 1);
        assertTrue(staking.canUnstake(stakeId));
    }

    function test_GetStakerStakes() public {
        vm.deal(bob, 2 ether);

        vm.startPrank(bob);
        staking.stake{value: 0.5 ether}(agentId);
        staking.stake{value: 0.3 ether}(agentId);
        vm.stopPrank();

        uint256[] memory stakes = staking.getStakerStakes(bob);
        assertEq(stakes.length, 2);
        assertEq(stakes[0], 1);
        assertEq(stakes[1], 2);
    }

    function test_GetAgentTotalStaked() public {
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        staking.stake{value: 0.7 ether}(agentId);

        assertEq(staking.getAgentTotalStaked(agentId), 0.7 ether);
    }

    // ── Admin ──

    function test_SetAuthorizedCaller() public {
        address caller = address(0xCA11);
        staking.setAuthorizedCaller(caller, true);
        assertTrue(staking.authorizedCallers(caller));

        staking.setAuthorizedCaller(caller, false);
        assertFalse(staking.authorizedCallers(caller));
    }

    function test_SetAuthorizedCaller_NotAdmin_Reverts() public {
        vm.prank(bob);
        vm.expectRevert(AgentStaking.Unauthorized.selector);
        staking.setAuthorizedCaller(address(0xCA11), true);
    }

    function test_EmergencyWithdraw_OnlyExcess() public {
        // Bob stakes 1 ETH
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        staking.stake{value: 1 ether}(agentId);

        // Someone sends 2 ETH directly (excess)
        vm.deal(address(staking), 3 ether); // 1 staked + 2 excess

        uint256 before = admin.balance;
        staking.emergencyWithdraw();
        // Should only withdraw 2 ETH excess, not the 1 ETH staked
        assertEq(admin.balance, before + 2 ether);
        // Staked funds remain
        assertEq(address(staking).balance, 1 ether);
    }

    function test_EmergencyWithdraw_NoExcess_Reverts() public {
        // Bob stakes 1 ETH, no excess
        vm.deal(bob, 1 ether);
        vm.prank(bob);
        staking.stake{value: 1 ether}(agentId);

        vm.expectRevert(AgentStaking.ZeroAmount.selector);
        staking.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_NotAdmin_Reverts() public {
        vm.prank(bob);
        vm.expectRevert(AgentStaking.Unauthorized.selector);
        staking.emergencyWithdraw();
    }

    // ── Reward with no stakers ──

    function test_AddReward_NoStakers_Reverts() public {
        vm.deal(admin, 1 ether);
        vm.expectRevert(AgentStaking.NoStakersToReward.selector);
        staking.addAgentReward{value: 0.1 ether}(agentId, 0);
    }

    // Needed to receive ETH from emergency withdraw
    receive() external payable {}
}
