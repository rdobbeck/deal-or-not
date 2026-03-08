"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@apollo/client/react";
import { formatEther } from "viem";
import { GlassCard, GlassButton } from "@/components/glass";
import { MarketCardSkeleton } from "@/components/markets/MarketSkeleton";
import { GET_MARKETS, GET_GLOBAL_STATS } from "@/lib/queries";

enum MarketType {
  WillWin = "WillWin",
  EarningsOver = "EarningsOver",
  WillAcceptOffer = "WillAcceptOffer",
  RoundPrediction = "RoundPrediction",
}

enum MarketStatus {
  Open = "Open",
  Locked = "Locked",
  Resolved = "Resolved",
  Cancelled = "Cancelled",
}

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  [MarketType.WillWin]: "Will Win?",
  [MarketType.EarningsOver]: "Earnings Over",
  [MarketType.WillAcceptOffer]: "Will Accept Offer?",
  [MarketType.RoundPrediction]: "Round Prediction",
};

const STATUS_COLORS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "text-green-400",
  [MarketStatus.Locked]: "text-yellow-400",
  [MarketStatus.Resolved]: "text-blue-400",
  [MarketStatus.Cancelled]: "text-red-400",
};

const STATUS_LABELS: Record<MarketStatus, string> = {
  [MarketStatus.Open]: "Open",
  [MarketStatus.Locked]: "Locked",
  [MarketStatus.Resolved]: "Resolved",
  [MarketStatus.Cancelled]: "Cancelled",
};

export default function MarketsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  // Build where clause based on filter
  const where = filter === "open"
    ? { status: MarketStatus.Open }
    : filter === "resolved"
      ? { status: MarketStatus.Resolved }
      : {};

  // Fetch markets
  const { data: marketsData, loading: marketsLoading, error: marketsError } = useQuery<any>(GET_MARKETS, {
    variables: {
      first: 50,
      where,
      orderBy: "totalPool",
      orderDirection: "desc",
    },
    pollInterval: 10000, // Poll every 10s for updates
  });

  // Fetch global stats
  const { data: statsData } = useQuery<any>(GET_GLOBAL_STATS, {
    pollInterval: 10000,
  });

  const markets = marketsData?.markets || [];
  const stats = statsData?.globalStats || {
    activeMarkets: 0,
    resolvedMarkets: 0,
    totalVolume: "0",
    totalBets: 0,
  };

  const totalVolume = parseFloat(formatEther(BigInt(stats.totalVolume || 0)));

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-green-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          Prediction Markets
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Bet on agent game outcomes. Parimutuel betting with 2% platform fee. Like fantasy football, but for AIs.
        </p>
        <p className="text-white/30 text-sm mt-2 italic">
          The house always wins. Except here, the house is a smart contract.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-green-400">{stats.activeMarkets}</div>
          <div className="text-sm text-gray-400 mt-1">Open Markets</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-blue-400">{stats.resolvedMarkets}</div>
          <div className="text-sm text-gray-400 mt-1">Resolved</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-purple-400">
            {totalVolume.toFixed(2)} ETH
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Volume</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400">{stats.totalBets}</div>
          <div className="text-sm text-gray-400 mt-1">Total Bets</div>
        </GlassCard>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
        <div className="flex gap-2">
          <GlassButton
            onClick={() => setFilter("all")}
            variant={filter === "all" ? "strong" : "regular"}
          >
            All Markets
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("open")}
            variant={filter === "open" ? "strong" : "regular"}
          >
            Open
          </GlassButton>
          <GlassButton
            onClick={() => setFilter("resolved")}
            variant={filter === "resolved" ? "strong" : "regular"}
          >
            Resolved
          </GlassButton>
        </div>

        <Link href="/markets/my-bets">
          <GlassButton variant="prominent">My Bets</GlassButton>
        </Link>
      </div>

      {/* Market List */}
      <div className="space-y-4">
        {marketsError && (
          <GlassCard className="p-8 text-center border-2 border-red-500/50">
            <p className="text-red-400 mb-2">Failed to load markets</p>
            <p className="text-sm text-gray-400">{marketsError.message}</p>
          </GlassCard>
        )}

        {marketsLoading && !markets.length && (
          <>
            <MarketCardSkeleton />
            <MarketCardSkeleton />
            <MarketCardSkeleton />
          </>
        )}

        {!marketsLoading && markets.length === 0 && (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">
              No markets found. The prophecy remains unwritten.
            </p>
          </GlassCard>
        )}

        {markets.map((market: any) => {
          const lockTimeLeft = Number(market.lockTime) * 1000 - Date.now();
          const hoursLeft = Math.max(0, Math.floor(lockTimeLeft / 3600000));
          const minutesLeft = Math.max(
            0,
            Math.floor((lockTimeLeft % 3600000) / 60000)
          );

          const totalPool = parseFloat(formatEther(BigInt(market.totalPool)));
          const yesPool = parseFloat(formatEther(BigInt(market.yesPool)));
          const noPool = parseFloat(formatEther(BigInt(market.noPool)));
          const yesOdds = Number(market.yesOdds);
          const noOdds = Number(market.noOdds);

          return (
            <GlassCard
              key={market.id}
              className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
              onClick={() => router.push(`/markets/${market.id}`)}
            >
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left: Market Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[market.status as MarketStatus]}`}
                    >
                      {STATUS_LABELS[market.status as MarketStatus]}
                    </span>
                    <span className="text-xs text-gray-400">
                      Game #{market.gameId}
                    </span>
                    <span className="text-xs text-gray-500">•</span>
                    {market.agent && (
                      <Link
                        href={`/agents/${market.agentId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {market.agent.name}
                      </Link>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">
                    {MARKET_TYPE_LABELS[market.marketType as MarketType]}
                    {market.marketType === MarketType.EarningsOver &&
                      ` $${(Number(market.targetValue) / 100).toFixed(2)}`}
                    {market.marketType === MarketType.RoundPrediction &&
                      ` Round ${market.targetValue}`}
                  </h3>

                  {market.status === MarketStatus.Open && (
                    <p className="text-sm text-gray-400">
                      Locks in {hoursLeft}h {minutesLeft}m
                    </p>
                  )}

                  {market.status === MarketStatus.Resolved && market.outcome !== null && (
                    <p className="text-sm text-green-400 font-semibold">
                      Outcome: {market.outcome ? "YES" : "NO"}
                    </p>
                  )}
                </div>

                {/* Center: Pool Stats */}
                <div className="flex flex-col justify-center gap-2 min-w-[200px]">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Total Pool:</span>
                    <span className="text-lg font-semibold text-white">
                      {totalPool.toFixed(3)} ETH
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Total Bets:</span>
                    <span className="text-lg font-semibold text-white">
                      {market.totalBets}
                    </span>
                  </div>
                </div>

                {/* Right: Odds Display */}
                <div className="flex flex-col gap-2 min-w-[180px]">
                  <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3">
                    <div className="text-xs text-green-400 font-semibold mb-1">
                      YES
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                      {(yesOdds / 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {yesPool.toFixed(3)} ETH
                    </div>
                  </div>
                  <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                    <div className="text-xs text-red-400 font-semibold mb-1">
                      NO
                    </div>
                    <div className="text-2xl font-bold text-red-400">
                      {(noOdds / 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {noPool.toFixed(3)} ETH
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex items-center">
                  <GlassButton
                    size="sm"
                    variant="prominent"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/markets/${market.id}`);
                    }}
                    disabled={market.status !== MarketStatus.Open}
                  >
                    {market.status === MarketStatus.Open ? "Place Bet" : "View"}
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* Info Banner */}
      <GlassCard className="mt-8 p-6 border-2 border-blue-400/30">
        <h3 className="text-lg font-bold text-blue-400 mb-2">
          How Prediction Markets Work
        </h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>
            • <strong>Parimutuel Betting:</strong> All bets go into a pool. Winners
            split the pool proportionally.
          </li>
          <li>
            • <strong>Platform Fee:</strong> 2% fee on total pool (8% less than
            FanDuel).
          </li>
          <li>
            • <strong>Odds Change:</strong> As people bet, odds shift based on pool
            sizes.
          </li>
          <li>
            • <strong>Lock Time:</strong> Betting closes before the game starts.
          </li>
        </ul>
      </GlassCard>
    </div>
  );
}
