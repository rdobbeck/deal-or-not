"use client";

import { useReadContract } from "wagmi";
import { DEAL_OR_NOT_AGENTS_ABI } from "@/lib/dealOrNotAgentsAbi";
import { DEAL_OR_NOT_AGENTS_ADDRESS } from "@/lib/config";
import { Phase } from "@/types/game";
import { useMemo } from "react";

const contractConfig = {
  address: DEAL_OR_NOT_AGENTS_ADDRESS,
  abi: DEAL_OR_NOT_AGENTS_ABI,
} as const;

export type AgentGameState = {
  agent: `0x${string}`;
  agentId: bigint;
  phase: Phase;
  playerCase: number;
  currentRound: number;
  totalCollapsed: number;
  bankerOffer: bigint;
  finalPayout: bigint;
  ethPerDollar: bigint;
  caseValues: readonly bigint[];
  opened: readonly boolean[];
};

export function useAgentGameState(gameId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getGameState",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 3000,
    },
  });

  const gameState: AgentGameState | null = useMemo(() => {
    if (!data) return null;
    const [
      agent, agentId, phase, playerCase, currentRound, totalCollapsed,
      bankerOffer, finalPayout, ethPerDollar, caseValues, opened,
    ] = data;
    return {
      agent,
      agentId,
      phase: Number(phase) as Phase,
      playerCase: Number(playerCase),
      currentRound: Number(currentRound),
      totalCollapsed: Number(totalCollapsed),
      bankerOffer,
      finalPayout,
      ethPerDollar,
      caseValues,
      opened,
    };
  }, [data]);

  return { gameState, isLoading, refetch };
}

export function useAgentNextGameId() {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "nextGameId",
    query: { refetchInterval: 5000 },
  });
  return { nextGameId: data as bigint | undefined, refetch };
}
