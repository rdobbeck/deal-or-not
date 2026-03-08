import { createPublicClient, http, Address, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";

// ══════════════════════════════════════════════════════════════════════════════
// Market Creator Workflow - Auto-create prediction markets for agent games
// ══════════════════════════════════════════════════════════════════════════════

// Contract addresses (Base Sepolia)
const DEAL_OR_NOT_ADDRESS = "0xd9D4A974021055c46fD834049e36c21D7EE48137" as Address;
const AGENT_REGISTRY_ADDRESS = "0xf3B0d29416d3504c802bab4A799349746A37E788" as Address;
const PREDICTION_MARKET_ADDRESS = "0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4" as Address;

// Market configuration constants
const LOCK_TIME_OFFSET = 3600; // Lock betting 1 hour after game creation
const DEFAULT_EARNINGS_TARGET = 2500; // $25.00 target (in cents)

// ABIs
const AGENT_REGISTRY_ABI = [
  parseAbiItem("function getAgentByPlayer(address) view returns (uint256 agentId, string name, string endpoint, uint256 totalGames, uint256 totalWinnings, uint256 avgScore, uint256 registeredAt, bool active)"),
  parseAbiItem("function isAgentEligible(address) view returns (bool)"),
] as const;

const DEAL_OR_NOT_ABI = [
  parseAbiItem("function getGame(uint256) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256 vrfRequestId, uint256 vrfSeed, uint256 usedValuesBitmap, uint256[5] caseValues, bool[5] opened, uint8 pendingCaseIndex, bytes32 gameSecret, uint256 createdAt)"),
] as const;

enum MarketType {
  WillWin = 0,
  EarningsOver = 1,
  WillAcceptOffer = 2,
  RoundPrediction = 3,
}

interface GameCreatedEvent {
  gameId: bigint;
  host: Address;
  player: Address;
}

interface MarketToCreate {
  gameId: bigint;
  agentId: bigint;
  marketType: MarketType;
  targetValue: bigint;
  lockTime: bigint;
}

export default async function handler(event: GameCreatedEvent) {
  console.log(`[Market Creator] Processing GameCreated event for gameId=${event.gameId}`);

  // Initialize viem client
  const rpcUrl = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Check if player is a registered agent
  // ──────────────────────────────────────────────────────────────────────────

  console.log(`[Market Creator] Checking if player ${event.player} is an agent...`);

  const isAgent = await client.readContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "isAgentEligible",
    args: [event.player],
  });

  if (!isAgent) {
    console.log(`[Market Creator] Player is not an agent. Skipping market creation.`);
    return {
      success: false,
      reason: "Player is not a registered agent",
    };
  }

  console.log(`[Market Creator] ✓ Player is a registered agent`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Fetch agent details
  // ──────────────────────────────────────────────────────────────────────────

  const agentData = await client.readContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "getAgentByPlayer",
    args: [event.player],
  });

  const agentId = agentData[0];
  const agentName = agentData[1];

  console.log(`[Market Creator] Agent: #${agentId} "${agentName}"`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Fetch game details to get creation time
  // ──────────────────────────────────────────────────────────────────────────

  const gameData = await client.readContract({
    address: DEAL_OR_NOT_ADDRESS,
    abi: DEAL_OR_NOT_ABI,
    functionName: "getGame",
    args: [event.gameId],
  });

  const createdAt = gameData[17]; // gameData.createdAt
  const lockTime = createdAt + BigInt(LOCK_TIME_OFFSET);

  console.log(`[Market Creator] Game created at: ${new Date(Number(createdAt) * 1000).toISOString()}`);
  console.log(`[Market Creator] Markets will lock at: ${new Date(Number(lockTime) * 1000).toISOString()}`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Define markets to create
  // ──────────────────────────────────────────────────────────────────────────

  const marketsToCreate: MarketToCreate[] = [
    {
      gameId: event.gameId,
      agentId,
      marketType: MarketType.WillWin,
      targetValue: 0n,
      lockTime,
    },
    {
      gameId: event.gameId,
      agentId,
      marketType: MarketType.EarningsOver,
      targetValue: BigInt(DEFAULT_EARNINGS_TARGET), // $25.00
      lockTime,
    },
    {
      gameId: event.gameId,
      agentId,
      marketType: MarketType.WillAcceptOffer,
      targetValue: 0n,
      lockTime,
    },
  ];

  console.log(`[Market Creator] Creating ${marketsToCreate.length} prediction markets...`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 5: Return market creation data for CRE writeReport
  // ──────────────────────────────────────────────────────────────────────────

  // NOTE: CRE workflow will execute multiple writeReport calls (one per market)
  // This requires the workflow.yaml to support batching or we create them sequentially

  const reports = marketsToCreate.map((market) => ({
    functionName: "createMarket",
    args: [
      market.gameId,
      market.agentId,
      market.marketType,
      market.targetValue,
      market.lockTime,
    ],
  }));

  console.log(`[Market Creator] ✓ Ready to create ${reports.length} markets`);
  console.log(`[Market Creator] Markets:`, JSON.stringify(marketsToCreate, null, 2));

  // Return the first market for now (CRE limitation: one writeReport per workflow)
  // TODO: Enhance to support multiple writeReports or call createMarket in a loop
  const firstMarket = marketsToCreate[0];

  return {
    success: true,
    gameId: Number(event.gameId),
    agentId: Number(agentId),
    agentName,
    marketsCreated: marketsToCreate.length,
    // CRE writeReport expects these fields
    reportData: {
      gameId: firstMarket.gameId,
      agentId: firstMarket.agentId,
      marketType: firstMarket.marketType,
      targetValue: firstMarket.targetValue,
      lockTime: firstMarket.lockTime,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Local testing helper
// ══════════════════════════════════════════════════════════════════════════════

if (import.meta.main) {
  // Example test event
  const testEvent: GameCreatedEvent = {
    gameId: 1n,
    host: "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as Address,
    player: "0xC96Bcb1EACE35d09189a6e52758255b8951a7587" as Address, // Replace with agent address
  };

  console.log("Testing market creator workflow locally...\n");
  const result = await handler(testEvent);
  console.log("\nResult:", JSON.stringify(result, null, 2));
}
