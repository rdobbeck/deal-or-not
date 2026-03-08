"use client";

import { Phase, PHASE_NAMES } from "@/types/game";

interface GameStatusProps {
  phase: Phase;
  currentRound: number;
  gameId: bigint;
  player?: string;
  isPlayer?: boolean;
}

export default function GameStatus({
  phase,
  currentRound,
  gameId,
  player,
  isPlayer,
}: GameStatusProps) {
  const phaseBadgeColor: Record<Phase, string> = {
    [Phase.WaitingForVRF]: "bg-purple-900/50 text-purple-300 border-purple-700",
    [Phase.Created]: "bg-blue-900/50 text-blue-300 border-blue-700",
    [Phase.Round]: "bg-cyan-900/50 text-cyan-300 border-cyan-700",
    [Phase.WaitingForCRE]: "bg-yellow-900/50 text-yellow-300 border-yellow-700",
    [Phase.AwaitingOffer]: "bg-orange-900/50 text-orange-300 border-orange-700",
    [Phase.BankerOffer]: "bg-red-900/50 text-red-300 border-red-700",
    [Phase.FinalRound]: "bg-pink-900/50 text-pink-300 border-pink-700",
    [Phase.WaitingForFinalCRE]: "bg-pink-900/50 text-pink-300 border-pink-700",
    [Phase.GameOver]: "bg-green-900/50 text-green-300 border-green-700",
  };

  return (
    <div className="text-center space-y-2">
      <div className="flex items-center justify-center gap-3">
        <span
          className={`px-3 py-1 rounded-full text-xs border ${phaseBadgeColor[phase]}`}
        >
          {PHASE_NAMES[phase]}
        </span>
        {phase !== Phase.WaitingForVRF && phase !== Phase.GameOver && (
          <span className="text-gray-500 text-xs">
            Round {currentRound + 1} / 4
          </span>
        )}
      </div>
      <p className="text-gray-600 text-xs">
        Game #{gameId.toString()}
        {player && (
          <span> &middot; {player.slice(0, 6)}...{player.slice(-4)}</span>
        )}
      </p>
      {isPlayer === false && (
        <p className="text-red-400 text-xs font-semibold">
          Not your game — connected wallet is not the player
        </p>
      )}
    </div>
  );
}
