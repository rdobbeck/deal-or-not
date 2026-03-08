"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";
import {
  useAllMarkets,
  MarketStatus,
  MarketType,
  MARKET_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
} from "@/hooks/useMarkets";
import { useAllAgents } from "@/hooks/useAgents";
import { useMockDataToggle } from "@/contexts/MockDataContext";

export default function MarketsPage() {
  const router = useRouter();
  const { useMockData, toggleMockData } = useMockDataToggle();
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");

  const { markets, isLoading } = useAllMarkets();
  const { agents } = useAllAgents();

  // Build agent name lookup
  const agentNames: Record<number, string> = {};
  agents.forEach(a => { agentNames[a.id] = a.name; });

  const filteredMarkets = markets.filter((market) => {
    if (filter === "open") return market.status === MarketStatus.Open;
    if (filter === "resolved") return market.status === MarketStatus.Resolved;
    return true;
  });

  const totalVolume = markets.reduce((sum, m) => sum + m.totalPool, 0);
  const activeMarkets = markets.filter((m) => m.status === MarketStatus.Open).length;
  const resolvedMarkets = markets.filter((m) => m.status === MarketStatus.Resolved).length;

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
        <button
          onClick={toggleMockData}
          className="inline-flex items-center gap-2 mt-2 px-3 py-1 text-xs rounded-full border cursor-pointer transition-all hover:scale-105"
          style={{
            background: useMockData ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.2)",
            borderColor: useMockData ? "rgba(234,179,8,0.3)" : "rgba(34,197,94,0.3)",
            color: useMockData ? "#facc15" : "#22c55e",
          }}
        >
          <span className={`inline-block w-2 h-2 rounded-full ${useMockData ? "bg-yellow-400" : "bg-green-400"}`} />
          {useMockData ? "Mock Data" : "Live On-Chain"}
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-green-400">
            {isLoading ? "..." : activeMarkets}
          </div>
          <div className="text-sm text-gray-400 mt-1">Open Markets</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-blue-400">
            {isLoading ? "..." : resolvedMarkets}
          </div>
          <div className="text-sm text-gray-400 mt-1">Resolved</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-purple-400">
            {isLoading ? "..." : `${totalVolume.toFixed(2)} ETH`}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Volume</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400">
            {isLoading ? "..." : markets.reduce((sum, m) => sum + m.totalBets, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Bets</div>
        </GlassCard>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
        <div className="flex gap-2">
          <GlassButton onClick={() => setFilter("all")} variant={filter === "all" ? "strong" : "regular"}>
            All Markets
          </GlassButton>
          <GlassButton onClick={() => setFilter("open")} variant={filter === "open" ? "strong" : "regular"}>
            Open
          </GlassButton>
          <GlassButton onClick={() => setFilter("resolved")} variant={filter === "resolved" ? "strong" : "regular"}>
            Resolved
          </GlassButton>
        </div>

        <Link href="/markets/my-bets">
          <GlassButton variant="prominent">My Bets</GlassButton>
        </Link>
      </div>

      {/* Market List */}
      <div className="space-y-4">
        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg animate-pulse">Loading markets from chain...</p>
          </GlassCard>
        ) : filteredMarkets.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">
              No markets found. The prophecy remains unwritten.
            </p>
          </GlassCard>
        ) : (
          filteredMarkets.map((market) => {
            const now = Math.floor(Date.now() / 1000);
            const lockTimeLeft = market.lockTime - now;
            const hoursLeft = Math.max(0, Math.floor(lockTimeLeft / 3600));
            const minutesLeft = Math.max(0, Math.floor((lockTimeLeft % 3600) / 60));
            const agentName = agentNames[market.agentId] || `Agent #${market.agentId}`;

            return (
              <GlassCard
                key={market.marketId}
                className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
                onClick={() => router.push(`/markets/${market.marketId}`)}
              >
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-xs font-bold uppercase tracking-wider ${STATUS_COLORS[market.status]}`}>
                        {STATUS_LABELS[market.status]}
                      </span>
                      <span className="text-xs text-gray-400">Game #{market.gameId}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <Link
                        href={`/agents/${market.agentId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        {agentName}
                      </Link>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">
                      {MARKET_TYPE_LABELS[market.marketType]}
                      {market.marketType === MarketType.EarningsOver &&
                        ` $${(market.targetValue / 100).toFixed(2)}`}
                      {market.marketType === MarketType.RoundPrediction &&
                        ` Round ${market.targetValue}`}
                    </h3>

                    {market.status === MarketStatus.Open && (
                      <p className="text-sm text-gray-400">
                        Locks in {hoursLeft}h {minutesLeft}m
                      </p>
                    )}

                    {market.status === MarketStatus.Resolved && (
                      <p className="text-sm text-green-400 font-semibold">
                        Outcome: {market.outcome ? "YES" : "NO"}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col justify-center gap-2 min-w-[200px]">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Total Pool:</span>
                      <span className="text-lg font-semibold text-white">{market.totalPool.toFixed(3)} ETH</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-400">Total Bets:</span>
                      <span className="text-lg font-semibold text-white">{market.totalBets}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[180px]">
                    <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3">
                      <div className="text-xs text-green-400 font-semibold mb-1">YES</div>
                      <div className="text-2xl font-bold text-green-400">{(market.yesOdds / 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-400">{market.yesPool.toFixed(3)} ETH</div>
                    </div>
                    <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
                      <div className="text-xs text-red-400 font-semibold mb-1">NO</div>
                      <div className="text-2xl font-bold text-red-400">{(market.noOdds / 100).toFixed(1)}%</div>
                      <div className="text-xs text-gray-400">{market.noPool.toFixed(3)} ETH</div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <GlassButton
                      size="sm"
                      variant="prominent"
                      onClick={(e) => { e.stopPropagation(); router.push(`/markets/${market.marketId}`); }}
                      disabled={market.status !== MarketStatus.Open}
                    >
                      {market.status === MarketStatus.Open ? "Place Bet" : "View"}
                    </GlassButton>
                  </div>
                </div>
              </GlassCard>
            );
          })
        )}
      </div>

      {/* Info Banner */}
      <GlassCard className="mt-8 p-6 border-2 border-blue-400/30">
        <h3 className="text-lg font-bold text-blue-400 mb-2">How Prediction Markets Work</h3>
        <ul className="text-sm text-gray-300 space-y-2">
          <li>• <strong>Parimutuel Betting:</strong> All bets go into a pool. Winners split the pool proportionally.</li>
          <li>• <strong>Platform Fee:</strong> 2% fee on total pool (8% less than FanDuel).</li>
          <li>• <strong>Odds Change:</strong> As people bet, odds shift based on pool sizes.</li>
          <li>• <strong>Lock Time:</strong> Betting closes before the game starts.</li>
        </ul>
      </GlassCard>
    </div>
  );
}
