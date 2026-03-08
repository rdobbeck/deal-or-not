"use client";

import { Phase } from "@/types/game";
import type { GameState } from "@/types/game";
import BriefcaseRow from "./BriefcaseRow";
import VideoWait from "./VideoWait";

interface FinalDecisionProps {
  gameState: GameState;
  gameId: bigint;
  onKeepCase: () => Promise<void>;
  onSwapCase: () => Promise<void>;
  isPending: boolean;
}

export default function FinalDecision({
  gameState,
  gameId,
  onKeepCase,
  onSwapCase,
  isPending,
}: FinalDecisionProps) {
  const isWaiting = gameState.phase === Phase.WaitingForFinalCRE;

  return (
    <div className="space-y-6">
      <BriefcaseRow
        opened={gameState.opened}
        playerCase={gameState.playerCase}
        caseValues={gameState.caseValues}
        disabled
      />

      {!isWaiting ? (
        <div className="text-center space-y-4">
          <p className="text-amber-300 text-xl font-semibold">
            Two cases remain. Keep your case or swap?
          </p>
          <p className="text-gray-400 text-sm">
            Your Case: #{gameState.playerCase}
          </p>
          <div className="flex gap-4 justify-center">
            <button
              className="bg-gradient-to-b from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50"
              onClick={onKeepCase}
              disabled={isPending}
            >
              {isPending ? "Deciding..." : "KEEP Case"}
            </button>
            <button
              className="bg-gradient-to-b from-amber-500 to-amber-700 hover:from-amber-400 hover:to-amber-600 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
              onClick={onSwapCase}
              disabled={isPending}
            >
              {isPending ? "Deciding..." : "SWAP Case"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <VideoWait
            message="The moment of truth approaches..."
            submessage="CRE enclave is revealing the final case"
          />
        </div>
      )}
    </div>
  );
}
