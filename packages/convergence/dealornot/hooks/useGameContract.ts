"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { SPONSOR_JACKPOT_ABI } from "@/lib/sponsorAbi";
import { CONTRACT_ADDRESS, SPONSOR_JACKPOT_ADDRESS } from "@/lib/config";
import { type GameState, Phase } from "@/types/game";
import { useMemo } from "react";

// Force all reads to Base Sepolia (home chain) regardless of connected chain.
// This lets ETH Sepolia users still view game state via cross-chain reads.
const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
  chainId: baseSepolia.id,
} as const;

// ── Read Hooks ──

export function useGameState(gameId: bigint | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getGameState",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 3000,
    },
  });

  const gameState: GameState | null = useMemo(() => {
    if (!data) return null;
    const [
      host, player, mode, phase, playerCase, currentRound, totalCollapsed,
      bankerOffer, finalPayout, ethPerDollar, caseValues, opened,
    ] = data;
    return {
      host,
      player,
      mode: Number(mode),
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

export function useNextGameId() {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "nextGameId",
    query: { refetchInterval: 5000 },
  });
  return { nextGameId: data as bigint | undefined, refetch };
}

export function useRemainingPool(gameId: bigint | undefined) {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "getRemainingValuePool",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined,
      refetchInterval: 3000,
    },
  });
  return { remainingValues: data as bigint[] | undefined, refetch };
}

export function useBankerOfferCalc(gameId: bigint | undefined, enabled: boolean) {
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "calculateBankerOfferFull",
    args: gameId !== undefined ? [gameId] : undefined,
    query: { enabled: enabled && gameId !== undefined },
  });
  return data as bigint | undefined;
}

export function useCentsToWei(gameId: bigint | undefined, cents: bigint | undefined) {
  const { data } = useReadContract({
    ...contractConfig,
    functionName: "centsToWei",
    args: gameId !== undefined && cents !== undefined ? [gameId, cents] : undefined,
    query: { enabled: gameId !== undefined && cents !== undefined },
  });
  return data as bigint | undefined;
}

// ── Jackpot Hooks ──

const jackpotConfig = {
  address: SPONSOR_JACKPOT_ADDRESS,
  abi: SPONSOR_JACKPOT_ABI,
  chainId: baseSepolia.id,
} as const;

export function useJackpot(gameId: bigint | undefined) {
  const { data, refetch } = useReadContract({
    ...jackpotConfig,
    functionName: "getJackpot",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined && SPONSOR_JACKPOT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 3000,
    },
  });
  return { jackpotCents: data as bigint | undefined, refetch };
}

export function useGameSponsor(gameId: bigint | undefined) {
  const { data } = useReadContract({
    ...jackpotConfig,
    functionName: "getGameSponsorInfo",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined && SPONSOR_JACKPOT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 5000,
    },
  });

  const sponsorInfo = useMemo(() => {
    if (!data) return null;
    const [name, logoUrl, sponsorAddr] = data as [string, string, string];
    if (sponsorAddr === "0x0000000000000000000000000000000000000000") return null;
    return { name, logoUrl, sponsorAddr };
  }, [data]);

  return sponsorInfo;
}

export function useJackpotClaimed(gameId: bigint | undefined) {
  const { data } = useReadContract({
    ...jackpotConfig,
    functionName: "claimed",
    args: gameId !== undefined ? [gameId] : undefined,
    query: {
      enabled: gameId !== undefined && SPONSOR_JACKPOT_ADDRESS !== "0x0000000000000000000000000000000000000000",
      refetchInterval: 5000,
    },
  });
  return data as boolean | undefined;
}

// ── Entry Fee (Convergence QuickPlay — payable createGame) ──

export function useEntryFee() {
  const { data, refetch } = useReadContract({
    ...contractConfig,
    functionName: "estimateEntryFee",
    query: { refetchInterval: 30000 },
  });
  return {
    baseWei: data ? (data as [bigint, bigint])[0] : undefined,
    withSlippage: data ? (data as [bigint, bigint])[1] : undefined,
    refetch,
  };
}

// ── Write Hook ──

export function useGameWrite() {
  const { writeContractAsync, isPending } = useWriteContract();

  const createGame = async (entryFeeWei?: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "createGame",
      value: entryFeeWei,
    });
  };

  const pickCase = async (gameId: bigint, caseIndex: number) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "pickCase",
      args: [gameId, caseIndex],
    });
  };

  const openCase = async (gameId: bigint, caseIndex: number) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "openCase",
      args: [gameId, caseIndex],
    });
  };

  const setBankerOffer = async (gameId: bigint, offerCents: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "setBankerOffer",
      args: [gameId, offerCents],
    });
  };

  const acceptDeal = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "acceptDeal",
      args: [gameId],
    });
  };

  const rejectDeal = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "rejectDeal",
      args: [gameId],
    });
  };

  const keepCase = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "keepCase",
      args: [gameId],
    });
  };

  const swapCase = async (gameId: bigint) => {
    return writeContractAsync({
      ...contractConfig,
      functionName: "swapCase",
      args: [gameId],
    });
  };

  return {
    createGame,
    pickCase,
    openCase,
    setBankerOffer,
    acceptDeal,
    rejectDeal,
    keepCase,
    swapCase,
    isPending,
  };
}
