"use client";

import { useState } from "react";
import BriefcaseRow from "./BriefcaseRow";
import VideoWait from "./VideoWait";
import { Phase } from "@/types/game";
import type { GameState } from "@/types/game";

interface CaseOpenerProps {
  gameState: GameState;
  gameId: bigint;
  onOpenCase: (caseIndex: number) => Promise<void>;
  isPending: boolean;
}

export default function CommitReveal({
  gameState,
  gameId,
  onOpenCase,
  isPending,
}: CaseOpenerProps) {
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const isWaitingForCRE = gameState.phase === Phase.WaitingForCRE;

  const handleCaseClick = (index: number) => {
    if (isPending || isWaitingForCRE) return;
    setSelectedCase(index);
  };

  const handleOpenCase = async () => {
    if (selectedCase === null) return;
    await onOpenCase(selectedCase);
    setSelectedCase(null);
  };

  return (
    <div className="space-y-6">
      {/* Briefcases */}
      <BriefcaseRow
        opened={gameState.opened}
        playerCase={gameState.playerCase}
        caseValues={gameState.caseValues}
        onCaseClick={handleCaseClick}
        disabled={isPending || isWaitingForCRE}
      />

      {/* Select + Open step */}
      {!isWaitingForCRE && (
        <div className="text-center space-y-3">
          {selectedCase !== null ? (
            <>
              <p className="text-amber-300">
                Open Case <span className="font-bold text-lg">#{selectedCase}</span>?
              </p>
              <button
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 px-8 rounded-xl transition-all disabled:opacity-50"
                onClick={handleOpenCase}
                disabled={isPending}
              >
                {isPending ? "Opening..." : "Open Case"}
              </button>
            </>
          ) : (
            <p className="text-gray-400">Select a case to open</p>
          )}
        </div>
      )}

      {/* Waiting for CRE — video interstitial */}
      {isWaitingForCRE && (
        <div className="text-center space-y-4">
          <VideoWait
            message="Confidential compute in progress..."
            submessage="CRE enclave is computing the case value"
          />
        </div>
      )}
    </div>
  );
}
