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

// ABIs
const AGENT_REGISTRY_ABI = [
  parseAbiItem("function getAgentId(address) view returns (uint256)"),
  parseAbiItem("function getAgent(uint256) view returns (address owner, string name, string apiEndpoint, string metadata, uint256 gamesPlayed, uint256 gamesWon, uint256 totalEarnings, uint256 registeredAt, bool isBanned, bool isActive)"),
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

  const agentId = await client.readContract({
    address: AGENT_REGISTRY_ADDRESS,
    abi: AGENT_REGISTRY_ABI,
    functionName: "getAgentId",
    args: [event.player],
  });

  console.log(`[Market Creator] Agent ID: ${agentId} (player: ${event.player})`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Calculate lock time (use current timestamp + 1 hour)
  // ──────────────────────────────────────────────────────────────────────────

  const createdAt = BigInt(Math.floor(Date.now() / 1000));
  const lockTime = createdAt + BigInt(LOCK_TIME_OFFSET);

  console.log(`[Market Creator] Lock time set to: ${new Date(Number(lockTime) * 1000).toISOString()}`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Define markets to create
  // ──────────────────────────────────────────────────────────────────────────

  // Create single prediction market: "Will agent win anything?"
  // Resolves to TRUE if finalPayout > 0, FALSE otherwise
  const marketsToCreate: MarketToCreate[] = [
    {
      gameId: event.gameId,
      agentId,
      marketType: MarketType.WillWin,
      targetValue: 0n,
      lockTime,
    },
  ];

  console.log(`[Market Creator] Creating prediction market: "Will agent win anything?" (finalPayout > 0)`);

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
  console.log(`[Market Creator] Markets:`, JSON.stringify(marketsToCreate, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

  // Return the first market for now (CRE limitation: one writeReport per workflow)
  // TODO: Enhance to support multiple writeReports or call createMarket in a loop
  const firstMarket = marketsToCreate[0];

  return {
    success: true,
    gameId: Number(event.gameId),
    agentId: Number(agentId),
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
  // Example test event using real agent
  const testEvent: GameCreatedEvent = {
    gameId: 999n, // Test game ID
    host: "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as Address,
    player: "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as Address, // Real agent address
  };

  console.log("Testing market creator workflow locally...\n");
  const result = await handler(testEvent);
  console.log("\nResult:", JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
}
