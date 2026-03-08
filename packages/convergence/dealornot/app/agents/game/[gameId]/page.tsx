"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { GlassCard, GlassButton, GlassBriefcase, GlassBriefcaseGrid } from "@/components/glass";
import { useAgentGameState } from "@/hooks/useAgentGame";
import { useAgent } from "@/hooks/useAgents";
import { Phase, PHASE_NAMES, CASE_VALUES_CENTS, CASE_VALUES_USD } from "@/types/game";
import { centsToUsd } from "@/lib/utils";

const PHASE_COLORS: Record<number, string> = {
  [Phase.WaitingForVRF]: "text-purple-400",
  [Phase.Created]: "text-blue-400",
  [Phase.Round]: "text-cyan-400",
  [Phase.WaitingForCRE]: "text-purple-400",
  [Phase.AwaitingOffer]: "text-yellow-400",
  [Phase.BankerOffer]: "text-yellow-400",
  [Phase.FinalRound]: "text-orange-400",
  [Phase.WaitingForFinalCRE]: "text-purple-400",
  [Phase.GameOver]: "text-green-400",
};

export default function AgentGamePage() {
  const params = useParams();
  const router = useRouter();
  const gameId = BigInt(params.gameId as string);

  const { gameState, isLoading } = useAgentGameState(gameId);
  const { agent } = useAgent(gameState ? Number(gameState.agentId) : undefined);

  if (isLoading || !gameState) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <GlassCard className="p-12 text-center">
          <p className="text-white/60 text-lg animate-pulse">
            {isLoading ? "Loading agent game from chain..." : "Game not found."}
          </p>
        </GlassCard>
      </div>
    );
  }

  const phase = gameState.phase;
  const isOver = phase === Phase.GameOver;
  const agentName = agent?.name ?? `Agent #${gameState.agentId.toString()}`;

  // Build eliminated values set
  const eliminatedValues = new Set<number>();
  for (let i = 0; i < 5; i++) {
    if (gameState.opened[i] && gameState.caseValues[i] > 0n) {
      eliminatedValues.add(Number(gameState.caseValues[i]));
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back nav */}
      <button
        onClick={() => router.push("/agents")}
        className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
      >
        &larr; Back to Agent Arena
      </button>

      {/* Spectator banner */}
      <GlassCard className="flex items-center justify-between px-5 py-3 mb-6 border-yellow-500/20" tint="yellow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">&#129302;</span>
          <div>
            <p className="text-yellow-400 font-bold text-sm">
              Spectating Agent Game #{gameId.toString()}
            </p>
            <p className="text-white/40 text-xs">
              <Link href={`/agents/${gameState.agentId.toString()}`} className="text-blue-400 hover:text-blue-300">
                {agentName}
              </Link>
              {" "}is playing autonomously via CRE
            </p>
          </div>
        </div>
        <div className={`text-sm font-bold ${PHASE_COLORS[phase] ?? "text-white/60"}`}>
          {PHASE_NAMES[phase]}
        </div>
      </GlassCard>

      {/* Game status bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <GlassCard className="p-4 text-center">
          <div className={`text-xl font-bold ${PHASE_COLORS[phase]}`}>
            {PHASE_NAMES[phase]}
          </div>
          <div className="text-xs text-gray-400 mt-1">Phase</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-xl font-bold text-white">
            {gameState.currentRound} / 4
          </div>
          <div className="text-xs text-gray-400 mt-1">Round</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-xl font-bold text-yellow-400">
            {gameState.bankerOffer > 0n ? centsToUsd(gameState.bankerOffer) : "---"}
          </div>
          <div className="text-xs text-gray-400 mt-1">Banker Offer</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className={`text-xl font-bold ${isOver ? "text-green-400" : "text-white/30"}`}>
            {isOver ? centsToUsd(gameState.finalPayout) : "---"}
          </div>
          <div className="text-xs text-gray-400 mt-1">Final Payout</div>
        </GlassCard>
      </div>

      {/* Briefcases */}
      <GlassCard className="p-6 mb-6">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-4 text-center">Briefcases</p>
        <GlassBriefcaseGrid columns={5}>
          {[0, 1, 2, 3, 4].map((i) => (
            <GlassBriefcase
              key={i}
              caseNumber={i}
              opened={gameState.opened[i]}
              playerCase={gameState.playerCase === i}
              value={gameState.opened[i] && gameState.caseValues[i] > 0n ? Number(gameState.caseValues[i]) : undefined}
              disabled
            />
          ))}
        </GlassBriefcaseGrid>
      </GlassCard>

      {/* Value board */}
      <GlassCard className="p-6 mb-6">
        <p className="text-white/40 text-xs uppercase tracking-wider mb-4 text-center">Value Board</p>
        <div className="flex justify-center gap-3 flex-wrap">
          {CASE_VALUES_CENTS.map((val, i) => {
            const eliminated = eliminatedValues.has(val);
            return (
              <div
                key={val}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  eliminated
                    ? "bg-red-500/20 text-red-400/40 line-through"
                    : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                }`}
              >
                {CASE_VALUES_USD[i]}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* Phase-specific info */}
      {phase === Phase.WaitingForVRF && (
        <GlassCard className="p-8 text-center">
          <div className="animate-spin h-10 w-10 border-4 border-purple-400/40 border-t-purple-400 rounded-full mx-auto mb-4" />
          <p className="text-purple-400 font-bold">Quantum Seed Incoming...</p>
          <p className="text-white/30 text-sm">Chainlink VRF is generating randomness for this game.</p>
        </GlassCard>
      )}

      {(phase === Phase.WaitingForCRE || phase === Phase.WaitingForFinalCRE) && (
        <GlassCard className="p-8 text-center">
          <div className="animate-spin h-10 w-10 border-4 border-purple-400/40 border-t-purple-400 rounded-full mx-auto mb-4" />
          <p className="text-purple-400 font-bold">CRE Computing...</p>
          <p className="text-white/30 text-sm">Confidential compute enclave is revealing the case value.</p>
        </GlassCard>
      )}

      {phase === Phase.AwaitingOffer && (
        <GlassCard className="p-8 text-center">
          <div className="animate-pulse text-yellow-400 text-4xl mb-4">&#128222;</div>
          <p className="text-yellow-400 font-bold">The Banker Is Calculating...</p>
          <p className="text-white/30 text-sm">Gemini 2.5 Flash is crafting an offer inside the CRE enclave.</p>
        </GlassCard>
      )}

      {phase === Phase.BankerOffer && (
        <GlassCard className="p-8 text-center gold-glow">
          <p className="text-yellow-500/60 text-xs uppercase tracking-wider mb-2">The Banker Offers</p>
          <p className="text-5xl font-black text-yellow-400 mb-3">
            {centsToUsd(gameState.bankerOffer)}
          </p>
          <p className="text-white/40 text-sm animate-pulse">
            Waiting for {agentName} to decide: Deal or No Deal?
          </p>
        </GlassCard>
      )}

      {phase === Phase.FinalRound && (
        <GlassCard className="p-8 text-center">
          <p className="text-orange-400 font-bold text-xl mb-2">Final Decision</p>
          <p className="text-white/40 text-sm">
            {agentName} must choose: keep their case or swap for the last remaining case.
          </p>
        </GlassCard>
      )}

      {phase === Phase.GameOver && (
        <GlassCard className="p-8 text-center border-2 border-green-400/30">
          <p className="text-green-400/60 text-xs uppercase tracking-wider mb-2">Game Over</p>
          <p className="text-4xl font-black text-green-400 mb-2">
            {centsToUsd(gameState.finalPayout)}
          </p>
          <p className="text-white/40 text-sm mb-4">
            {agentName} {gameState.bankerOffer > 0n && gameState.finalPayout === gameState.bankerOffer
              ? "accepted the deal"
              : "went all the way"
            }
          </p>
          <GlassButton variant="strong" onClick={() => router.push("/agents")}>
            Back to Arena
          </GlassButton>
        </GlassCard>
      )}

      {/* Auto-refresh notice */}
      {!isOver && (
        <p className="text-white/15 text-xs text-center mt-6 italic">
          Auto-refreshing every 3 seconds. The Banker knows you&apos;re watching.
        </p>
      )}
    </div>
  );
}
