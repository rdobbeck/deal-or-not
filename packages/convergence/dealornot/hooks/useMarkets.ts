"use client";

import { useReadContract, useReadContracts, useWriteContract, useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import { PREDICTION_MARKET_ABI } from "@/lib/predictionMarketAbi";
import { PREDICTION_MARKET_ADDRESS } from "@/lib/config";
import { useMockDataToggle } from "@/contexts/MockDataContext";
import { useMemo } from "react";

// ── Types ──

export enum MarketType {
  WillWin = 0,
  EarningsOver = 1,
  WillAcceptOffer = 2,
  RoundPrediction = 3,
}

export enum MarketStatus {
  Open = 0,
  Locked = 1,
  Resolved = 2,
  Cancelled = 3,
}

export type MarketData = {
  marketId: number;
  gameId: number;
  agentId: number;
  marketType: MarketType;
  targetValue: number;
  status: MarketStatus;
  outcome: boolean;
  lockTime: number;
  createdAt: number;
  totalPool: number; // in ETH (float)
  yesPool: number;
  noPool: number;
  yesOdds: number; // basis points (7200 = 72%)
  noOdds: number;
  totalBets: number;
};

export type BetData = {
  betId: number;
  bettor: string;
  marketId: number;
  prediction: boolean;
  amount: number; // ETH float
  claimed: boolean;
  canClaim: boolean;
};

export const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.WillWin]: "Will Win?",
  [MarketType.EarningsOver]: "Earnings Over",
  [MarketType.WillAcceptOffer]: "Will Accept Offer?",
  [MarketType.RoundPrediction]: "Round Prediction",
};

export const STATUS_LABELS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "Open",
  [MarketStatus.Locked]: "Locked",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};

export const STATUS_COLORS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "text-green-400",
  [MarketStatus.Locked]: "text-yellow-400",
  [MarketStatus.Resolved]: "text-blue-400",
  [MarketStatus.Cancelled]: "text-red-400",
};

const marketConfig = {
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
} as const;

// ── Mock Data ──

const MOCK_MARKETS: MarketData[] = [
  {
    marketId: 1, gameId: 42, agentId: 1, marketType: MarketType.WillWin,
    targetValue: 0, status: MarketStatus.Open, outcome: false,
    lockTime: Math.floor(Date.now() / 1000) + 3600, createdAt: Math.floor(Date.now() / 1000) - 7200,
    totalPool: 2.5, yesPool: 1.8, noPool: 0.7, yesOdds: 7200, noOdds: 2800, totalBets: 12,
  },
  {
    marketId: 2, gameId: 43, agentId: 2, marketType: MarketType.EarningsOver,
    targetValue: 50, status: MarketStatus.Open, outcome: false,
    lockTime: Math.floor(Date.now() / 1000) + 7200, createdAt: Math.floor(Date.now() / 1000) - 3600,
    totalPool: 4.1, yesPool: 2.3, noPool: 1.8, yesOdds: 5610, noOdds: 4390, totalBets: 18,
  },
  {
    marketId: 3, gameId: 41, agentId: 1, marketType: MarketType.WillAcceptOffer,
    targetValue: 0, status: MarketStatus.Resolved, outcome: false,
    lockTime: Math.floor(Date.now() / 1000) - 3600, createdAt: Math.floor(Date.now() / 1000) - 14400,
    totalPool: 1.8, yesPool: 0.6, noPool: 1.2, yesOdds: 3333, noOdds: 6667, totalBets: 9,
  },
  {
    marketId: 4, gameId: 44, agentId: 3, marketType: MarketType.RoundPrediction,
    targetValue: 5, status: MarketStatus.Locked, outcome: false,
    lockTime: Math.floor(Date.now() / 1000) - 600, createdAt: Math.floor(Date.now() / 1000) - 10800,
    totalPool: 3.2, yesPool: 1.5, noPool: 1.7, yesOdds: 4688, noOdds: 5312, totalBets: 14,
  },
];

const MOCK_BETS: BetData[] = [
  { betId: 1, bettor: "0x1234567890123456789012345678901234567890", marketId: 1, prediction: true, amount: 0.05, claimed: false, canClaim: false },
  { betId: 2, bettor: "0x1234567890123456789012345678901234567890", marketId: 3, prediction: false, amount: 0.1, claimed: false, canClaim: true },
  { betId: 3, bettor: "0x1234567890123456789012345678901234567890", marketId: 2, prediction: true, amount: 0.15, claimed: false, canClaim: false },
  { betId: 4, bettor: "0x1234567890123456789012345678901234567890", marketId: 5, prediction: true, amount: 0.08, claimed: true, canClaim: false },
];

// ── Hooks ──

export function useMarketCount() {
  const { useMockData } = useMockDataToggle();
  const { data, isLoading } = useReadContract({
    ...marketConfig,
    functionName: "nextMarketId",
    query: { enabled: !useMockData },
  });

  if (useMockData) return { count: MOCK_MARKETS.length, isLoading: false };
  // nextMarketId is 1-indexed, so count = nextMarketId - 1
  return { count: data ? Number(data) - 1 : 0, isLoading };
}

export function useAllMarkets() {
  const { useMockData } = useMockDataToggle();
  const { count } = useMarketCount();

  // Read market data via the `markets` public mapping (returns all fields in one call)
  const contracts = useMemo(() => {
    if (useMockData || count === 0) return [];
    return Array.from({ length: count }, (_, i) => {
      const id = BigInt(i + 1);
      return [
        { ...marketConfig, functionName: "markets" as const, args: [id] as const },
        { ...marketConfig, functionName: "getMarketStats" as const, args: [id] as const },
        { ...marketConfig, functionName: "getMarketOdds" as const, args: [id] as const },
      ];
    }).flat();
  }, [count]);

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !useMockData && contracts.length > 0 },
  });

  const markets: MarketData[] = useMemo(() => {
    if (useMockData) return MOCK_MARKETS;
    if (!data) return [];

    const result: MarketData[] = [];
    for (let i = 0; i < count; i++) {
      const base = i * 3;
      const mResult = data[base];
      const statsResult = data[base + 1];
      const oddsResult = data[base + 2];

      if (mResult?.status !== "success" || statsResult?.status !== "success" || oddsResult?.status !== "success") continue;

      const m = mResult.result as readonly [bigint, bigint, number, bigint, number, boolean, bigint, bigint, bigint, bigint, bigint];
      const stats = statsResult.result as readonly [bigint, bigint, bigint, bigint];
      const odds = oddsResult.result as readonly [bigint, bigint];

      result.push({
        marketId: i + 1,
        gameId: Number(m[0]),
        agentId: Number(m[1]),
        marketType: m[2] as MarketType,
        targetValue: Number(m[3]),
        status: m[4] as MarketStatus,
        outcome: m[5],
        createdAt: Number(m[6]),
        lockTime: Number(m[7]),
        totalPool: parseFloat(formatEther(m[8])),
        yesPool: parseFloat(formatEther(m[9])),
        noPool: parseFloat(formatEther(m[10])),
        yesOdds: Number(odds[0]),
        noOdds: Number(odds[1]),
        totalBets: Number(stats[0]),
      });
    }
    return result;
  }, [data, count]);

  return { markets, isLoading: useMockData ? false : isLoading };
}

export function useMarket(marketId: number | undefined) {
  const { useMockData } = useMockDataToggle();
  const enabled = !useMockData && marketId !== undefined;
  const args = marketId !== undefined ? [BigInt(marketId)] as const : undefined;

  const { data: mData, isLoading: l1 } = useReadContract({
    ...marketConfig, functionName: "markets", args,
    query: { enabled },
  });
  const { data: statsData, isLoading: l2 } = useReadContract({
    ...marketConfig, functionName: "getMarketStats", args,
    query: { enabled },
  });
  const { data: oddsData, isLoading: l3 } = useReadContract({
    ...marketConfig, functionName: "getMarketOdds", args,
    query: { enabled },
  });

  const market: MarketData | null = useMemo(() => {
    if (useMockData) {
      return MOCK_MARKETS.find(m => m.marketId === marketId) ?? MOCK_MARKETS[0];
    }
    if (!mData || !statsData || !oddsData || marketId === undefined) return null;

    const m = mData as readonly [bigint, bigint, number, bigint, number, boolean, bigint, bigint, bigint, bigint, bigint];
    const stats = statsData as readonly [bigint, bigint, bigint, bigint];
    const odds = oddsData as readonly [bigint, bigint];

    return {
      marketId,
      gameId: Number(m[0]),
      agentId: Number(m[1]),
      marketType: m[2] as MarketType,
      targetValue: Number(m[3]),
      status: m[4] as MarketStatus,
      outcome: m[5],
      createdAt: Number(m[6]),
      lockTime: Number(m[7]),
      totalPool: parseFloat(formatEther(m[8])),
      yesPool: parseFloat(formatEther(m[9])),
      noPool: parseFloat(formatEther(m[10])),
      yesOdds: Number(odds[0]),
      noOdds: Number(odds[1]),
      totalBets: Number(stats[0]),
    };
  }, [mData, statsData, oddsData, marketId]);

  return { market, isLoading: useMockData ? false : (l1 || l2 || l3) };
}

export function useUserBets() {
  const { useMockData } = useMockDataToggle();
  const { address } = useAccount();

  const { data: betIds, isLoading: l1 } = useReadContract({
    ...marketConfig,
    functionName: "getUserBets",
    args: address ? [address] : undefined,
    query: { enabled: !useMockData && !!address },
  });

  // Build multicall for each bet
  const betContracts = useMemo(() => {
    if (useMockData || !betIds) return [];
    const ids = betIds as bigint[];
    return ids.flatMap(id => [
      { ...marketConfig, functionName: "getBet" as const, args: [id] as const },
      { ...marketConfig, functionName: "canClaimBet" as const, args: [id] as const },
    ]);
  }, [betIds]);

  const { data: betData, isLoading: l2 } = useReadContracts({
    contracts: betContracts,
    query: { enabled: !useMockData && betContracts.length > 0 },
  });

  const bets: BetData[] = useMemo(() => {
    if (useMockData) return MOCK_BETS;
    if (!betIds || !betData) return [];

    const ids = betIds as bigint[];
    const result: BetData[] = [];
    for (let i = 0; i < ids.length; i++) {
      const betResult = betData[i * 2];
      const claimResult = betData[i * 2 + 1];
      if (betResult?.status !== "success" || claimResult?.status !== "success") continue;

      const b = betResult.result as { bettor: string; marketId: bigint; prediction: boolean; amount: bigint; claimed: boolean };
      result.push({
        betId: Number(ids[i]),
        bettor: b.bettor,
        marketId: Number(b.marketId),
        prediction: b.prediction,
        amount: parseFloat(formatEther(b.amount)),
        claimed: b.claimed,
        canClaim: claimResult.result as boolean,
      });
    }
    return result;
  }, [betIds, betData]);

  return { bets, isLoading: useMockData ? false : (l1 || l2) };
}

export function usePlaceBet() {
  const { writeContractAsync, isPending } = useWriteContract();

  const placeBet = async (marketId: number, prediction: boolean, amountEth: string) => {
    return writeContractAsync({
      ...marketConfig,
      functionName: "placeBet",
      args: [BigInt(marketId), prediction],
      value: parseEther(amountEth),
    });
  };

  return { placeBet, isPending };
}

export function useClaimPayout() {
  const { writeContractAsync, isPending } = useWriteContract();

  const claimPayout = async (betId: number) => {
    return writeContractAsync({
      ...marketConfig,
      functionName: "claimPayout",
      args: [BigInt(betId)],
    });
  };

  return { claimPayout, isPending };
}
