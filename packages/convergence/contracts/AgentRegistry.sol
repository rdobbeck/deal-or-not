// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry
/// @notice Registry for AI agents playing Deal or NOT
/// @dev Tracks agent metadata, stats, and reputation for hackathon multi-track qualification:
///      - CRE & AI Track: Agent gameplay integration
///      - Autonomous Agents Track: Agent identity and reputation
///      - Prediction Markets Track: Agent performance tracking
contract AgentRegistry {
    // ── Events ──
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string name,
        string apiEndpoint
    );
    event AgentUpdated(uint256 indexed agentId, string apiEndpoint, string metadata);
    event AgentStatsUpdated(
        uint256 indexed agentId,
        uint256 gamesPlayed,
        uint256 gamesWon,
        uint256 totalEarnings
    );
    event AgentBanned(uint256 indexed agentId, string reason);
    event AgentUnbanned(uint256 indexed agentId);

    // ── Structs ──
    struct Agent {
        address owner;           // Agent operator address
        string name;             // Display name
        string apiEndpoint;      // HTTP endpoint for decision requests (x402 compatible)
        string metadata;         // IPFS hash or JSON metadata
        uint256 gamesPlayed;     // Total games
        uint256 gamesWon;        // Games where agent won > 50 cents
        uint256 totalEarnings;   // Total earnings in cents
        uint256 registeredAt;    // Registration timestamp
        bool isBanned;           // Banned flag
        bool isActive;           // Active flag
    }

    struct AgentStats {
        uint256 winRate;         // Win rate (basis points, 10000 = 100%)
        uint256 avgEarnings;     // Average earnings per game (cents)
        uint256 reputation;      // Reputation score (0-10000)
        uint256 rank;            // Current leaderboard rank
    }

    // ── State ──
    mapping(uint256 => Agent) public agents;
    mapping(address => uint256[]) public ownerAgents;   // owner => agentIds
    mapping(address => uint256) public playerToAgentId; // player address => agentId (for orchestrator lookup)
    mapping(address => bool) public authorizedCallers;  // DealOrNotConfidential can update stats

    uint256 public nextAgentId;
    uint256 public totalAgents;
    address public admin;

    // ── Errors ──
    error Unauthorized();
    error AgentNotFound();
    error AgentIsBanned();
    error InvalidEndpoint();
    error EmptyName();

    // ── Modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedCallers[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAgentOwner(uint256 agentId) {
        if (agents[agentId].owner != msg.sender) revert Unauthorized();
        _;
    }

    // ── Constructor ──
    constructor() {
        admin = msg.sender;
        nextAgentId = 1; // Start at 1 (0 = invalid)
    }

    // ── Admin Functions ──

    /// @notice Authorize a contract to update agent stats (e.g., DealOrNotConfidential)
    function authorizeContract(address contractAddr) external onlyAdmin {
        authorizedCallers[contractAddr] = true;
    }

    /// @notice Revoke authorization
    function revokeContract(address contractAddr) external onlyAdmin {
        authorizedCallers[contractAddr] = false;
    }

    /// @notice Ban an agent for malicious behavior
    function banAgent(uint256 agentId, string calldata reason) external onlyAdmin {
        if (!agents[agentId].isActive) revert AgentNotFound();
        agents[agentId].isBanned = true;
        emit AgentBanned(agentId, reason);
    }

    /// @notice Unban an agent
    function unbanAgent(uint256 agentId) external onlyAdmin {
        if (!agents[agentId].isActive) revert AgentNotFound();
        agents[agentId].isBanned = false;
        emit AgentUnbanned(agentId);
    }

    // ── Agent Management ──

    /// @notice Register a new AI agent
    /// @param name Agent display name
    /// @param apiEndpoint HTTP endpoint for x402 decision requests
    /// @param metadata IPFS hash or JSON metadata
    /// @return agentId Unique agent ID
    function registerAgent(
        string calldata name,
        string calldata apiEndpoint,
        string calldata metadata
    ) external returns (uint256 agentId) {
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(apiEndpoint).length == 0) revert InvalidEndpoint();

        agentId = nextAgentId++;

        agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            apiEndpoint: apiEndpoint,
            metadata: metadata,
            gamesPlayed: 0,
            gamesWon: 0,
            totalEarnings: 0,
            registeredAt: block.timestamp,
            isBanned: false,
            isActive: true
        });

        ownerAgents[msg.sender].push(agentId);
        playerToAgentId[msg.sender] = agentId;  // Map player address to agentId
        totalAgents++;

        emit AgentRegistered(agentId, msg.sender, name, apiEndpoint);
    }

    /// @notice Update agent API endpoint and metadata
    function updateAgent(
        uint256 agentId,
        string calldata newApiEndpoint,
        string calldata newMetadata
    ) external onlyAgentOwner(agentId) {
        if (!agents[agentId].isActive) revert AgentNotFound();
        if (agents[agentId].isBanned) revert AgentIsBanned();

        agents[agentId].apiEndpoint = newApiEndpoint;
        agents[agentId].metadata = newMetadata;

        emit AgentUpdated(agentId, newApiEndpoint, newMetadata);
    }

    // ── Stats Management (called by authorized contracts) ──

    /// @notice Update agent stats after a game
    /// @dev Called by DealOrNotConfidential or CRE orchestrator after game completion
    function recordGame(
        uint256 agentId,
        bool won,
        uint256 earnings
    ) external onlyAuthorized {
        if (!agents[agentId].isActive) revert AgentNotFound();

        Agent storage agent = agents[agentId];
        agent.gamesPlayed++;
        if (won) agent.gamesWon++;
        agent.totalEarnings += earnings;

        emit AgentStatsUpdated(
            agentId,
            agent.gamesPlayed,
            agent.gamesWon,
            agent.totalEarnings
        );
    }

    /// @notice Alias for recordGame - for CRE orchestrator compatibility
    function updateAgentStats(
        uint256 agentId,
        uint256 gameId,
        uint256 earningsCents,
        bool won
    ) external onlyAuthorized {
        if (!agents[agentId].isActive) revert AgentNotFound();

        Agent storage agent = agents[agentId];
        agent.gamesPlayed++;
        if (won) agent.gamesWon++;
        agent.totalEarnings += earningsCents;

        emit AgentStatsUpdated(
            agentId,
            agent.gamesPlayed,
            agent.gamesWon,
            agent.totalEarnings
        );
    }

    // ── View Functions ──

    /// @notice Get agent details
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        if (!agents[agentId].isActive) revert AgentNotFound();
        return agents[agentId];
    }

    /// @notice Get computed agent stats
    function getAgentStats(uint256 agentId) external view returns (AgentStats memory stats) {
        if (!agents[agentId].isActive) revert AgentNotFound();

        Agent memory agent = agents[agentId];

        // Calculate win rate (basis points)
        stats.winRate = agent.gamesPlayed > 0
            ? (agent.gamesWon * 10000) / agent.gamesPlayed
            : 0;

        // Calculate average earnings
        stats.avgEarnings = agent.gamesPlayed > 0
            ? agent.totalEarnings / agent.gamesPlayed
            : 0;

        // Calculate reputation (simple formula: win rate * avg earnings / 100)
        stats.reputation = (stats.winRate * stats.avgEarnings) / 100;
        if (stats.reputation > 10000) stats.reputation = 10000;

        // Rank calculation would require off-chain sorting or on-chain leaderboard
        stats.rank = 0; // Placeholder
    }

    /// @notice Get all agents owned by an address
    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return ownerAgents[owner];
    }

    /// @notice Check if agent is eligible to play (by agentId)
    function isAgentEligible(uint256 agentId) external view returns (bool) {
        return agents[agentId].isActive && !agents[agentId].isBanned;
    }

    /// @notice Check if player address is a registered agent (for CRE orchestrator)
    /// @param player Player address to check
    /// @return bool True if player is a registered and eligible agent
    function isAgentEligible(address player) external view returns (bool) {
        uint256 agentId = playerToAgentId[player];
        if (agentId == 0) return false;
        return agents[agentId].isActive && !agents[agentId].isBanned;
    }

    /// @notice Get agent ID for a player address (for CRE orchestrator)
    /// @param player Player address
    /// @return agentId Agent ID (0 if not an agent)
    function getAgentId(address player) external view returns (uint256) {
        return playerToAgentId[player];
    }

    /// @notice Get agent API endpoint (for CRE workflow) - supports both agentId and address
    function getAgentEndpoint(uint256 agentId) external view returns (string memory) {
        if (!agents[agentId].isActive) revert AgentNotFound();
        if (agents[agentId].isBanned) revert AgentIsBanned();
        return agents[agentId].apiEndpoint;
    }

    /// @notice Get agent API endpoint by player address (for CRE orchestrator)
    /// @param player Player address
    /// @return endpoint API endpoint string
    function getAgentEndpoint(address player) external view returns (string memory) {
        uint256 agentId = playerToAgentId[player];
        if (agentId == 0) revert AgentNotFound();
        if (agents[agentId].isBanned) revert AgentIsBanned();
        return agents[agentId].apiEndpoint;
    }

    /// @notice Get top agents by total earnings (simple linear scan, limited to first 100)
    /// @dev For production, use off-chain indexing + leaderboard contract
    function getTopAgents(uint256 limit) external view returns (uint256[] memory topAgentIds) {
        uint256 count = totalAgents < limit ? totalAgents : limit;
        topAgentIds = new uint256[](count);

        // Simple linear scan for demo (not gas-efficient for large datasets)
        uint256 found = 0;
        for (uint256 i = 1; i < nextAgentId && found < count; i++) {
            if (agents[i].isActive && !agents[i].isBanned) {
                topAgentIds[found] = i;
                found++;
            }
        }

        // Bubble sort by totalEarnings (descending)
        for (uint256 i = 0; i < found; i++) {
            for (uint256 j = i + 1; j < found; j++) {
                if (agents[topAgentIds[i]].totalEarnings < agents[topAgentIds[j]].totalEarnings) {
                    uint256 temp = topAgentIds[i];
                    topAgentIds[i] = topAgentIds[j];
                    topAgentIds[j] = temp;
                }
            }
        }
    }
}
