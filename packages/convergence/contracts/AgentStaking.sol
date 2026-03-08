// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentRegistry} from "./AgentRegistry.sol";

/// @title AgentStaking
/// @notice Staking system for AI agents
/// @dev Users stake ETH on agents they believe will perform well
///      Stakers earn a share of agent winnings
///      Contributes to hackathon tracks: Autonomous Agents, Prediction Markets
contract AgentStaking {
    // ── Events ──
    event Staked(
        address indexed staker,
        uint256 indexed agentId,
        uint256 amount,
        uint256 stakeId
    );
    event Unstaked(
        address indexed staker,
        uint256 indexed agentId,
        uint256 amount,
        uint256 stakeId
    );
    event RewardsClaimed(
        address indexed staker,
        uint256 indexed agentId,
        uint256 amount
    );
    event AgentRewardAdded(
        uint256 indexed agentId,
        uint256 amount,
        uint256 gameId
    );

    // ── Structs ──
    struct Stake {
        address staker;
        uint256 agentId;
        uint256 amount;        // ETH staked
        uint256 stakedAt;      // Timestamp
        uint256 lastClaimAt;   // Last reward claim timestamp
        bool active;
    }

    struct AgentPool {
        uint256 totalStaked;     // Total ETH staked on this agent
        uint256 totalRewards;    // Total rewards accumulated
        uint256 rewardPerShare;  // Accumulated reward per share (scaled by 1e18)
        uint256 lastUpdateAt;    // Last reward update timestamp
    }

    // ── Constants ──
    uint256 public constant LOCKUP_PERIOD = 7 days;
    uint256 public constant AGENT_REVENUE_SHARE = 2000; // 20% of winnings go to stakers
    uint256 public constant SCALE = 1e18;

    // ── State ──
    AgentRegistry public immutable agentRegistry;

    mapping(uint256 => Stake) public stakes;
    mapping(uint256 => AgentPool) public agentPools;
    mapping(address => uint256[]) public stakerStakes;  // staker => stakeIds
    mapping(uint256 => uint256) public agentLifetimeRewards; // agentId => total rewards

    uint256 public nextStakeId;
    uint256 public totalStaked;
    uint256 public totalRewardsDistributed;

    address public admin;
    mapping(address => bool) public authorizedCallers;
    mapping(uint256 => uint256) public stakeRewardDebt; // stakeId => reward debt (for accurate reward tracking)

    // ── Errors ──
    error AgentNotEligible();
    error InsufficientStake();
    error StakeLocked();
    error StakeNotActive();
    error NoRewards();
    error Unauthorized();
    error ZeroAmount();
    error NoStakersToReward();

    // ── Modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    // ── Constructor ──
    constructor(address _agentRegistry) {
        agentRegistry = AgentRegistry(_agentRegistry);
        admin = msg.sender;
        nextStakeId = 1;
    }

    // ── Staking Functions ──

    /// @notice Stake ETH on an agent
    /// @param agentId The agent to stake on
    /// @return stakeId Unique stake ID
    function stake(uint256 agentId) external payable returns (uint256 stakeId) {
        if (msg.value == 0) revert ZeroAmount();
        if (!agentRegistry.isAgentEligible(agentId)) revert AgentNotEligible();

        stakeId = nextStakeId++;

        // Update agent pool before adding new stake
        _updateAgentPool(agentId);

        stakes[stakeId] = Stake({
            staker: msg.sender,
            agentId: agentId,
            amount: msg.value,
            stakedAt: block.timestamp,
            lastClaimAt: block.timestamp,
            active: true
        });

        stakerStakes[msg.sender].push(stakeId);

        AgentPool storage pool = agentPools[agentId];
        pool.totalStaked += msg.value;
        totalStaked += msg.value;

        // Set reward debt so new staker doesn't earn retroactive rewards
        stakeRewardDebt[stakeId] = (msg.value * pool.rewardPerShare) / SCALE;

        emit Staked(msg.sender, agentId, msg.value, stakeId);
    }

    /// @notice Unstake ETH from an agent
    /// @param stakeId The stake to unstake
    function unstake(uint256 stakeId) external {
        Stake storage s = stakes[stakeId];
        if (!s.active) revert StakeNotActive();
        if (s.staker != msg.sender) revert Unauthorized();
        if (block.timestamp < s.stakedAt + LOCKUP_PERIOD) revert StakeLocked();

        // Claim any pending rewards first
        _claimRewards(stakeId);

        // Update pool
        AgentPool storage pool = agentPools[s.agentId];
        pool.totalStaked -= s.amount;
        totalStaked -= s.amount;

        // Mark inactive
        s.active = false;

        // Transfer stake back
        (bool success, ) = payable(msg.sender).call{value: s.amount}("");
        require(success, "Transfer failed");

        emit Unstaked(msg.sender, s.agentId, s.amount, stakeId);
    }

    /// @notice Claim accumulated rewards for a stake
    /// @param stakeId The stake to claim rewards for
    function claimRewards(uint256 stakeId) external {
        Stake storage s = stakes[stakeId];
        if (!s.active) revert StakeNotActive();
        if (s.staker != msg.sender) revert Unauthorized();

        _claimRewards(stakeId);
    }

    // ── Internal Functions ──

    /// @notice Internal reward claim logic
    function _claimRewards(uint256 stakeId) internal {
        Stake storage s = stakes[stakeId];
        AgentPool storage pool = agentPools[s.agentId];

        // Calculate pending rewards
        uint256 pending = _calculatePendingRewards(stakeId);
        if (pending == 0) return; // Nothing to claim, don't revert (unstake calls this)

        // Update reward debt to current level
        stakeRewardDebt[stakeId] = (s.amount * pool.rewardPerShare) / SCALE;
        s.lastClaimAt = block.timestamp;

        // Transfer rewards
        (bool success, ) = payable(s.staker).call{value: pending}("");
        require(success, "Transfer failed");

        totalRewardsDistributed += pending;

        emit RewardsClaimed(s.staker, s.agentId, pending);
    }

    /// @notice Calculate pending rewards for a stake using rewardPerShare accumulator
    function _calculatePendingRewards(uint256 stakeId) internal view returns (uint256) {
        Stake memory s = stakes[stakeId];
        if (!s.active) return 0;

        AgentPool memory pool = agentPools[s.agentId];
        // Reward = stakeAmount * (currentRewardPerShare - debtPerShare) / SCALE
        uint256 accumulated = (s.amount * pool.rewardPerShare) / SCALE;
        uint256 debt = stakeRewardDebt[stakeId];
        if (accumulated <= debt) return 0;
        return accumulated - debt;
    }

    /// @notice Update agent pool before modifying stakes
    function _updateAgentPool(uint256 agentId) internal {
        agentPools[agentId].lastUpdateAt = block.timestamp;
    }

    // ── Reward Distribution (called by authorized contracts) ──

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    /// @notice Add rewards to an agent pool (called after agent wins)
    /// @param agentId Agent that earned the reward
    /// @param gameId Game ID for tracking
    function addAgentReward(uint256 agentId, uint256 gameId) external payable onlyAuthorized {
        if (msg.value == 0) revert ZeroAmount();

        AgentPool storage pool = agentPools[agentId];
        if (pool.totalStaked == 0) revert NoStakersToReward();
        // Update rewardPerShare so existing stakers get fair distribution
        pool.rewardPerShare += (msg.value * SCALE) / pool.totalStaked;
        pool.totalRewards += msg.value;
        agentLifetimeRewards[agentId] += msg.value;

        emit AgentRewardAdded(agentId, msg.value, gameId);
    }

    // ── View Functions ──

    /// @notice Get stake details
    function getStake(uint256 stakeId) external view returns (Stake memory) {
        return stakes[stakeId];
    }

    /// @notice Get agent pool details
    function getAgentPool(uint256 agentId) external view returns (AgentPool memory) {
        return agentPools[agentId];
    }

    /// @notice Get pending rewards for a stake
    function getPendingRewards(uint256 stakeId) external view returns (uint256) {
        return _calculatePendingRewards(stakeId);
    }

    /// @notice Get all stakes for a staker
    function getStakerStakes(address staker) external view returns (uint256[] memory) {
        return stakerStakes[staker];
    }

    /// @notice Get total value staked on an agent
    function getAgentTotalStaked(uint256 agentId) external view returns (uint256) {
        return agentPools[agentId].totalStaked;
    }

    /// @notice Check if stake can be unstaked
    function canUnstake(uint256 stakeId) external view returns (bool) {
        Stake memory s = stakes[stakeId];
        return s.active && block.timestamp >= s.stakedAt + LOCKUP_PERIOD;
    }

    // ── Admin Functions ──

    /// @notice Authorize a caller to add rewards (e.g. DealOrNotAgents)
    function setAuthorizedCaller(address caller, bool authorized) external onlyAdmin {
        authorizedCallers[caller] = authorized;
    }

    /// @notice Emergency withdraw excess ETH only (admin only, for contract upgrades)
    /// @dev Cannot withdraw user-staked funds — only surplus beyond totalStaked
    function emergencyWithdraw() external onlyAdmin {
        uint256 balance = address(this).balance;
        if (balance <= totalStaked) revert ZeroAmount();
        uint256 excess = balance - totalStaked;
        (bool success, ) = payable(admin).call{value: excess}("");
        require(success, "Transfer failed");
    }

    // ── Receive ETH ──
    receive() external payable {}
}
