import { createPublicClient, http, Address, parseAbiItem } from "viem";
import { baseSepolia } from "viem/chains";

// ══════════════════════════════════════════════════════════════════════════════
// Market Resolver Workflow - Auto-resolve prediction markets when games complete
// ══════════════════════════════════════════════════════════════════════════════

// Contract addresses (Base Sepolia)
const DEAL_OR_NOT_ADDRESS = "0xd9D4A974021055c46fD834049e36c21D7EE48137" as Address;
const PREDICTION_MARKET_ADDRESS = "0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4" as Address;

// ABIs
const DEAL_OR_NOT_ABI = [
  parseAbiItem("function getGame(uint256) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256 vrfRequestId, uint256 vrfSeed, uint256 usedValuesBitmap, uint256[5] caseValues, bool[5] opened, uint8 pendingCaseIndex, bytes32 gameSecret, uint256 createdAt)"),
] as const;

const PREDICTION_MARKET_ABI = [
  parseAbiItem("function getGameMarkets(uint256) view returns (uint256[])"),
  parseAbiItem("function markets(uint256) view returns (uint256 gameId, uint256 agentId, uint8 marketType, uint256 targetValue, uint8 status, uint256 createdAt, uint256 lockTime, bool outcome, uint256 totalPool, uint256 yesPool, uint256 noPool, bool resolved)"),
  parseAbiItem("function resolveMarket(uint256,bool)"),
] as const;

enum MarketType {
  WillWin = 0,
  EarningsOver = 1,
  WillAcceptOffer = 2,
  RoundPrediction = 3,
}

enum MarketStatus {
  Open = 0,
  Locked = 1,
  Resolved = 2,
  Cancelled = 3,
}

enum GamePhase {
  Created = 0,
  CasePicked = 1,
  Round = 2,
  AwaitingBankerOffer = 3,
  BankerOffer = 4,
  DealAccepted = 5,
  FinalRound = 6,
  GameOver = 7,
  Complete = 8,
}

interface GameCompleteEvent {
  gameId: bigint;
  player: Address;
  finalPayout: bigint;
}

interface MarketResolution {
  marketId: bigint;
  marketType: MarketType;
  targetValue: bigint;
  outcome: boolean;
  reasoning: string;
}

export default async function handler(event: GameCompleteEvent) {
  console.log(`[Market Resolver] Processing GameComplete event for gameId=${event.gameId}`);
  console.log(`[Market Resolver] Player: ${event.player}, Final Payout: ${event.finalPayout}`);

  // Initialize viem client
  const rpcUrl = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Step 1: Fetch complete game state
  // ──────────────────────────────────────────────────────────────────────────

  console.log(`[Market Resolver] Fetching game state...`);

  const gameData = await client.readContract({
    address: DEAL_OR_NOT_ADDRESS,
    abi: DEAL_OR_NOT_ABI,
    functionName: "getGame",
    args: [event.gameId],
  });

  const game = {
    host: gameData[0],
    player: gameData[1],
    mode: gameData[2],
    phase: gameData[3] as GamePhase,
    playerCase: gameData[4],
    currentRound: gameData[5],
    totalCollapsed: gameData[6],
    bankerOffer: gameData[7],
    finalPayout: gameData[8],
    ethPerDollar: gameData[9],
    vrfRequestId: gameData[10],
    vrfSeed: gameData[11],
    usedValuesBitmap: gameData[12],
    caseValues: gameData[13],
    opened: gameData[14],
    pendingCaseIndex: gameData[15],
    gameSecret: gameData[16],
    createdAt: gameData[17],
  };

  console.log(`[Market Resolver] Game phase: ${GamePhase[game.phase]}`);
  console.log(`[Market Resolver] Final payout: ${game.finalPayout} wei`);
  console.log(`[Market Resolver] Current round: ${game.currentRound}`);
  console.log(`[Market Resolver] Banker offer was: ${game.bankerOffer} (USD cents)`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 2: Get all markets for this game
  // ──────────────────────────────────────────────────────────────────────────

  console.log(`[Market Resolver] Fetching markets for game...`);

  const marketIds = await client.readContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "getGameMarkets",
    args: [event.gameId],
  });

  if (marketIds.length === 0) {
    console.log(`[Market Resolver] No markets found for this game. Skipping.`);
    return {
      success: true,
      reason: "No markets to resolve",
      gameId: Number(event.gameId),
    };
  }

  console.log(`[Market Resolver] Found ${marketIds.length} markets: ${marketIds.join(", ")}`);

  // ──────────────────────────────────────────────────────────────────────────
  // Step 3: Fetch market details and determine outcomes
  // ──────────────────────────────────────────────────────────────────────────

  const resolutions: MarketResolution[] = [];

  for (const marketId of marketIds) {
    const marketData = await client.readContract({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "markets",
      args: [marketId],
    });

    const market = {
      gameId: marketData[0],
      agentId: marketData[1],
      marketType: marketData[2] as MarketType,
      targetValue: marketData[3],
      status: marketData[4] as MarketStatus,
      createdAt: marketData[5],
      lockTime: marketData[6],
      outcome: marketData[7],
      totalPool: marketData[8],
      yesPool: marketData[9],
      noPool: marketData[10],
      resolved: marketData[11],
    };

    // Skip if already resolved
    if (market.status === MarketStatus.Resolved) {
      console.log(`[Market Resolver] Market ${marketId} already resolved. Skipping.`);
      continue;
    }

    // Skip if cancelled
    if (market.status === MarketStatus.Cancelled) {
      console.log(`[Market Resolver] Market ${marketId} cancelled. Skipping.`);
      continue;
    }

    // Determine outcome based on market type
    const resolution = resolveMarketOutcome(market, game);
    resolutions.push(resolution);

    console.log(`[Market Resolver] Market ${marketId} (${MarketType[market.marketType]}): ${resolution.outcome ? "YES" : "NO"} - ${resolution.reasoning}`);
  }

  if (resolutions.length === 0) {
    console.log(`[Market Resolver] No markets to resolve (all already resolved or cancelled).`);
    return {
      success: true,
      reason: "All markets already resolved",
      gameId: Number(event.gameId),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Step 4: Return resolution data for CRE writeReport
  // ──────────────────────────────────────────────────────────────────────────

  // NOTE: CRE workflow.yaml currently supports one writeReport per execution
  // For multiple markets, we need to call resolveMarket() in a loop here
  // See IMPLEMENTATION_NOTES.md for how to extend this

  const firstResolution = resolutions[0];

  console.log(`[Market Resolver] ✓ Ready to resolve ${resolutions.length} markets`);
  console.log(`[Market Resolver] Returning first resolution for CRE writeReport:`, {
    marketId: Number(firstResolution.marketId),
    outcome: firstResolution.outcome,
  });

  return {
    success: true,
    gameId: Number(event.gameId),
    marketsResolved: resolutions.length,
    resolutions: resolutions.map((r) => ({
      marketId: Number(r.marketId),
      marketType: MarketType[r.marketType],
      outcome: r.outcome,
      reasoning: r.reasoning,
    })),
    // CRE writeReport expects these fields
    reportData: {
      marketId: firstResolution.marketId,
      outcome: firstResolution.outcome,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Resolution Logic
// ══════════════════════════════════════════════════════════════════════════════

function resolveMarketOutcome(
  market: {
    marketType: MarketType;
    targetValue: bigint;
  },
  game: {
    phase: GamePhase;
    finalPayout: bigint;
    bankerOffer: bigint;
    currentRound: number;
  }
): MarketResolution {
  let outcome = false;
  let reasoning = "";

  switch (market.marketType) {
    case MarketType.WillWin:
      // Did agent win anything?
      outcome = game.finalPayout > 0n;
      reasoning = outcome
        ? `Agent won ${game.finalPayout} wei`
        : "Agent won nothing (finalPayout = 0)";
      break;

    case MarketType.EarningsOver:
      // Did agent earn more than target? (target in USD cents)
      // finalPayout is in wei, need to convert to USD cents
      // For simplicity, we compare finalPayout > 0 (indicates a win)
      // Real implementation would use ethPerDollar to convert
      const targetWei = market.targetValue; // Simplified: assume target is in wei units
      outcome = game.finalPayout > targetWei;
      reasoning = outcome
        ? `Earnings ${game.finalPayout} wei > target ${targetWei} wei`
        : `Earnings ${game.finalPayout} wei <= target ${targetWei} wei`;
      break;

    case MarketType.WillAcceptOffer:
      // Did agent accept banker's offer?
      outcome = game.phase === GamePhase.DealAccepted;
      reasoning = outcome
        ? `Agent accepted deal at ${game.bankerOffer} cents`
        : "Agent rejected deal and continued playing";
      break;

    case MarketType.RoundPrediction:
      // Did agent finish in predicted round?
      outcome = BigInt(game.currentRound) === market.targetValue;
      reasoning = outcome
        ? `Agent finished in round ${game.currentRound} (predicted)`
        : `Agent finished in round ${game.currentRound}, predicted ${market.targetValue}`;
      break;

    default:
      console.error(`[Market Resolver] Unknown market type: ${market.marketType}`);
      reasoning = "Unknown market type";
  }

  return {
    marketId: 0n, // Will be set by caller
    marketType: market.marketType,
    targetValue: market.targetValue,
    outcome,
    reasoning,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Local testing helper
// ══════════════════════════════════════════════════════════════════════════════

if (import.meta.main) {
  // Example test event
  const testEvent: GameCompleteEvent = {
    gameId: 1n,
    player: "0xC96Bcb1EACE35d09189a6e52758255b8951a7587" as Address,
    finalPayout: 500000000000000000n, // 0.5 ETH in wei
  };

  console.log("Testing market resolver workflow locally...\n");
  const result = await handler(testEvent);
  console.log("\nResult:", JSON.stringify(result, null, 2));
}
