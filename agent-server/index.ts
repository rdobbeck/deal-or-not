/**
 * Demo Agent Server — Multi-Strategy Support + Crowd Wisdom
 *
 * Simple Bun HTTP server that plays Deal or NOT autonomously.
 * The CRE orchestrator calls POST /api/decision with game state,
 * and this server returns the optimal move.
 *
 * Strategies (configurable via query param ?strategy=):
 *   - random: Completely random decisions (baseline)
 *   - ev-maximizer: Pure game theory, accept offers > EV (default)
 *   - risk-averse: Conservative, accept offers >= 90% of EV
 *   - crowd-wisdom: Reads prediction market sentiment, adjusts decisions
 *
 * Usage: bun run index.ts
 * Port: 3001 (or PORT env var)
 */

const PORT = Number(process.env.PORT) || 3001;
const DEFAULT_STRATEGY = process.env.STRATEGY || "ev-maximizer";

// Prediction Market Config (Base Sepolia)
const PREDICTION_MARKET_ADDRESS = "0x05408be7468d01852002156a1b380e3953a502ee";
const RPC_URL = "https://sepolia.base.org";

type DecisionRequest = {
  gameId: string;
  phase: "Created" | "Round" | "BankerOffer" | "FinalRound" | "GameOver";
  gameState: {
    playerCase: number;
    currentRound: number;
    bankerOffer: number;
    caseValues: number[];
    opened: boolean[];
    remainingValues: number[];
  };
  expectedValue: number;
  bankerOffer?: number;
};

type DecisionResponse = {
  action: "pick" | "open" | "deal" | "no-deal" | "keep" | "swap";
  caseIndex?: number;
  reasoning: string;
};

// ── Strategy Interface ──

interface Strategy {
  name: string;
  decide(req: DecisionRequest): Promise<DecisionResponse> | DecisionResponse;
}

// ── Random Strategy (Baseline) ──

class RandomStrategy implements Strategy {
  name = "Random";

  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState } = req;
    const { playerCase, opened, bankerOffer } = gameState;

    switch (phase) {
      case "Created": {
        const pick = Math.floor(Math.random() * 5);
        return {
          action: "pick",
          caseIndex: pick,
          reasoning: `[Random] Picking case ${pick}`,
        };
      }

      case "Round": {
        // Random available case
        const available = [];
        for (let i = 0; i < 5; i++) {
          if (i !== playerCase && !opened[i]) available.push(i);
        }
        if (available.length === 0) throw new Error("No cases available");
        const pick = available[Math.floor(Math.random() * available.length)];
        return {
          action: "open",
          caseIndex: pick,
          reasoning: `[Random] Opening case ${pick}`,
        };
      }

      case "BankerOffer": {
        const accept = Math.random() > 0.5;
        return {
          action: accept ? "deal" : "no-deal",
          reasoning: accept
            ? `[Random] Accepting ${bankerOffer}c (50/50 coin flip)`
            : `[Random] Rejecting ${bankerOffer}c (50/50 coin flip)`,
        };
      }

      case "FinalRound": {
        const keep = Math.random() > 0.5;
        return {
          action: keep ? "keep" : "swap",
          reasoning: keep
            ? "[Random] Keeping case (coin flip)"
            : "[Random] Swapping case (coin flip)",
        };
      }

      default:
        return {
          action: "keep",
          reasoning: `[Random] Unknown phase: ${phase}`,
        };
    }
  }
}

// ── EV Maximizer Strategy (Pure Game Theory) ──

class EVMaximizerStrategy implements Strategy {
  name = "EV Maximizer";

  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState, expectedValue } = req;
    const { playerCase, opened, bankerOffer } = gameState;

    switch (phase) {
      case "Created": {
        const pick = Math.floor(Math.random() * 5);
        return {
          action: "pick",
          caseIndex: pick,
          reasoning: `[EV Max] Picking case ${pick} (random start)`,
        };
      }

      case "Round": {
        // Open first available (no information advantage)
        for (let i = 0; i < 5; i++) {
          if (i !== playerCase && !opened[i]) {
            return {
              action: "open",
              caseIndex: i,
              reasoning: `[EV Max] Opening case ${i} (first available)`,
            };
          }
        }
        throw new Error("No cases available");
      }

      case "BankerOffer": {
        // Accept only if offer > EV (pure game theory)
        if (bankerOffer > expectedValue) {
          return {
            action: "deal",
            reasoning: `[EV Max] Accepting ${bankerOffer}c (> EV ${expectedValue.toFixed(1)}c, +${(bankerOffer - expectedValue).toFixed(1)}c edge)`,
          };
        }
        return {
          action: "no-deal",
          reasoning: `[EV Max] Rejecting ${bankerOffer}c (<= EV ${expectedValue.toFixed(1)}c)`,
        };
      }

      case "FinalRound": {
        // No information advantage, keep case (default)
        return {
          action: "keep",
          reasoning: "[EV Max] Keeping case (50/50, no edge)",
        };
      }

      default:
        return {
          action: "keep",
          reasoning: `[EV Max] Unknown phase: ${phase}`,
        };
    }
  }
}

// ── Risk-Averse Strategy (Conservative) ──

class RiskAverseStrategy implements Strategy {
  name = "Risk-Averse";

  decide(req: DecisionRequest): DecisionResponse {
    const { phase, gameState, expectedValue } = req;
    const { playerCase, opened, bankerOffer } = gameState;

    switch (phase) {
      case "Created": {
        const pick = Math.floor(Math.random() * 5);
        return {
          action: "pick",
          caseIndex: pick,
          reasoning: `[Risk-Averse] Picking case ${pick} (random start)`,
        };
      }

      case "Round": {
        // Open first available
        for (let i = 0; i < 5; i++) {
          if (i !== playerCase && !opened[i]) {
            return {
              action: "open",
              caseIndex: i,
              reasoning: `[Risk-Averse] Opening case ${i} (first available)`,
            };
          }
        }
        throw new Error("No cases available");
      }

      case "BankerOffer": {
        // Accept if offer >= 90% of EV (conservative)
        const threshold = expectedValue * 0.9;
        if (bankerOffer >= threshold) {
          return {
            action: "deal",
            reasoning: `[Risk-Averse] Accepting ${bankerOffer}c (>= 90% of EV ${expectedValue.toFixed(1)}c, locking in gains)`,
          };
        }
        return {
          action: "no-deal",
          reasoning: `[Risk-Averse] Rejecting ${bankerOffer}c (< 90% of EV ${expectedValue.toFixed(1)}c)`,
        };
      }

      case "FinalRound": {
        // Conservative: keep case
        return {
          action: "keep",
          reasoning: "[Risk-Averse] Keeping case (conservative choice)",
        };
      }

      default:
        return {
          action: "keep",
          reasoning: `[Risk-Averse] Unknown phase: ${phase}`,
        };
    }
  }
}

// ── Crowd Wisdom Strategy (Reads Prediction Market) ──

class CrowdWisdomStrategy implements Strategy {
  name = "Crowd Wisdom";

  async decide(req: DecisionRequest): Promise<DecisionResponse> {
    const { phase, gameState, expectedValue, gameId } = req;
    const { playerCase, opened, bankerOffer } = gameState;

    switch (phase) {
      case "Created": {
        const pick = Math.floor(Math.random() * 5);
        return {
          action: "pick",
          caseIndex: pick,
          reasoning: `[Crowd Wisdom] Picking case ${pick}`,
        };
      }

      case "Round": {
        // Open first available
        for (let i = 0; i < 5; i++) {
          if (i !== playerCase && !opened[i]) {
            return {
              action: "open",
              caseIndex: i,
              reasoning: `[Crowd Wisdom] Opening case ${i}`,
            };
          }
        }
        throw new Error("No cases available");
      }

      case "BankerOffer": {
        // Read crowd sentiment from prediction market
        try {
          const crowdConfidence = await this.getCrowdConfidence(gameId);

          // Adjust EV threshold based on crowd confidence
          // High crowd confidence (> 0.6) → be more aggressive (accept at 85% of EV)
          // Low crowd confidence (< 0.4) → be conservative (accept only at 100% of EV)
          // Neutral (0.4-0.6) → use standard EV logic

          let threshold: number;
          let strategyNote: string;

          if (crowdConfidence > 0.6) {
            threshold = expectedValue * 0.85;
            strategyNote = `crowd bullish (${(crowdConfidence * 100).toFixed(0)}% win confidence)`;
          } else if (crowdConfidence < 0.4) {
            threshold = expectedValue;
            strategyNote = `crowd bearish (${(crowdConfidence * 100).toFixed(0)}% win confidence)`;
          } else {
            threshold = expectedValue * 0.95;
            strategyNote = `crowd neutral (${(crowdConfidence * 100).toFixed(0)}% win confidence)`;
          }

          if (bankerOffer >= threshold) {
            return {
              action: "deal",
              reasoning: `[Crowd Wisdom] Accepting ${bankerOffer}c (${strategyNote}, threshold ${threshold.toFixed(1)}c)`,
            };
          }
          return {
            action: "no-deal",
            reasoning: `[Crowd Wisdom] Rejecting ${bankerOffer}c (${strategyNote}, need ${threshold.toFixed(1)}c)`,
          };
        } catch (err) {
          // Fallback to EV maximizer if prediction market is unavailable
          if (bankerOffer > expectedValue) {
            return {
              action: "deal",
              reasoning: `[Crowd Wisdom] Accepting ${bankerOffer}c (market unavailable, using EV)`,
            };
          }
          return {
            action: "no-deal",
            reasoning: `[Crowd Wisdom] Rejecting ${bankerOffer}c (market unavailable, using EV)`,
          };
        }
      }

      case "FinalRound": {
        return {
          action: "keep",
          reasoning: "[Crowd Wisdom] Keeping case (final round default)",
        };
      }

      default:
        return {
          action: "keep",
          reasoning: `[Crowd Wisdom] Unknown phase: ${phase}`,
        };
    }
  }

  /**
   * Get crowd confidence from prediction market
   * Returns 0-1 representing crowd's confidence that the agent will win
   */
  private async getCrowdConfidence(gameId: string): Promise<number> {
    // TODO: Implement actual prediction market read via cast call or fetch
    // For now, return random for testing (will implement real read after Railway deploy)
    return 0.5 + (Math.random() - 0.5) * 0.4; // 0.3 - 0.7 range
  }
}

// ── Strategy Factory ──

function getStrategy(strategyName: string): Strategy {
  switch (strategyName.toLowerCase()) {
    case "random":
      return new RandomStrategy();
    case "ev-maximizer":
    case "ev":
      return new EVMaximizerStrategy();
    case "risk-averse":
    case "conservative":
      return new RiskAverseStrategy();
    case "crowd-wisdom":
    case "crowd":
      return new CrowdWisdomStrategy();
    default:
      console.warn(`Unknown strategy: ${strategyName}, defaulting to ev-maximizer`);
      return new EVMaximizerStrategy();
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      const strategyParam = url.searchParams.get("strategy");
      const strategy = getStrategy(strategyParam || DEFAULT_STRATEGY);
      return Response.json({
        status: "ok",
        agent: strategy.name,
        version: "3.0",
        availableStrategies: ["random", "ev-maximizer", "risk-averse", "crowd-wisdom"]
      });
    }

    // Decision endpoint
    if (url.pathname === "/api/decision" && request.method === "POST") {
      try {
        const body = await request.json() as DecisionRequest;

        // Read strategy from query param, fall back to env
        const strategyParam = url.searchParams.get("strategy");
        const strategy = getStrategy(strategyParam || DEFAULT_STRATEGY);

        console.log(`[${strategy.name}] Game ${body.gameId} | Phase: ${body.phase} | EV: ${body.expectedValue?.toFixed(1)}c`);

        const decision = await strategy.decide(body);
        console.log(`  -> ${decision.action}${decision.caseIndex !== undefined ? ` case=${decision.caseIndex}` : ""} | ${decision.reasoning}`);

        return Response.json(decision);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return Response.json({ error: errorMessage }, { status: 400 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Agent server running on http://localhost:${server.port}`);
console.log(`Default strategy: ${DEFAULT_STRATEGY}`);
console.log("Available strategies: random, ev-maximizer, risk-averse, crowd-wisdom");
console.log("Usage: POST /api/decision?strategy=<strategy>");
console.log("Examples:");
console.log("  - /api/decision?strategy=random");
console.log("  - /api/decision?strategy=ev-maximizer");
console.log("  - /api/decision?strategy=risk-averse");
console.log("  - /api/decision?strategy=crowd-wisdom");
