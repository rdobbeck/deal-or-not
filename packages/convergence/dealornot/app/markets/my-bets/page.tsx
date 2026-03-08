"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { GlassCard, GlassButton } from "@/components/glass";
import {
  useUserBets,
  useAllMarkets,
  useClaimPayout,
  MarketStatus,
  MARKET_TYPE_LABELS,
  STATUS_LABELS,
} from "@/hooks/useMarkets";
import { useAllAgents } from "@/hooks/useAgents";
import { useMockDataToggle } from "@/contexts/MockDataContext";

export default function MyBetsPage() {
  const router = useRouter();
  const { useMockData, toggleMockData } = useMockDataToggle();
  const { isConnected } = useAccount();
  const [filter, setFilter] = useState<"all" | "active" | "claimable">("all");

  const { bets, isLoading: betsLoading } = useUserBets();
  const { markets } = useAllMarkets();
  const { agents } = useAllAgents();
  const { claimPayout, isPending: isClaiming } = useClaimPayout();
  const [claimingBetId, setClaimingBetId] = useState<number | null>(null);

  // Build lookups
  const marketMap: Record<number, { status: MarketStatus; type: number; gameId: number; outcome: boolean; targetValue: number; totalPool: number; yesPool: number; noPool: number }> = {};
  markets.forEach(m => {
    marketMap[m.marketId] = { status: m.status, type: m.marketType, gameId: m.gameId, outcome: m.outcome, targetValue: m.targetValue, totalPool: m.totalPool, yesPool: m.yesPool, noPool: m.noPool };
  });
  const agentNames: Record<number, string> = {};
  agents.forEach(a => { agentNames[a.id] = a.name; });

  if (!isConnected && !useMockData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <GlassCard className="p-12 text-center">
          <h1 className="text-3xl font-bold text-white mb-4">My Bets</h1>
          <p className="text-gray-400 mb-6">
            Connect your wallet to view your bets and claim payouts.
          </p>
          <p className="text-white/30 text-sm italic">
            No wallet, no bets. The prophecy remains unwritten.
          </p>
        </GlassCard>
      </div>
    );
  }

  // Enrich bets with market data
  const enrichedBets = bets.map(bet => {
    const market = marketMap[bet.marketId];
    const marketTitle = market ? MARKET_TYPE_LABELS[market.type as keyof typeof MARKET_TYPE_LABELS] || "Unknown" : "Unknown";
    const marketStatus = market?.status ?? MarketStatus.Open;
    const outcome = market?.outcome;
    const isWinner = marketStatus === MarketStatus.Resolved && outcome === bet.prediction;
    // Estimate payout for mock
    const payout = isWinner && market
      ? (bet.amount * (market.totalPool * 0.98)) / (bet.prediction ? market.yesPool : market.noPool)
      : 0;

    return {
      ...bet,
      marketTitle,
      marketStatus,
      gameId: market?.gameId ?? 0,
      outcome,
      payout: isWinner ? payout : 0,
    };
  });

  const filteredBets = enrichedBets.filter((bet) => {
    if (filter === "active")
      return bet.marketStatus === MarketStatus.Open || bet.marketStatus === MarketStatus.Locked;
    if (filter === "claimable") return bet.canClaim;
    return true;
  });

  const handleClaimPayout = async (betId: number) => {
    setClaimingBetId(betId);
    if (useMockData) {
      await new Promise(r => setTimeout(r, 1000));
      alert("Claimed (mock)!");
      setClaimingBetId(null);
      return;
    }
    try {
      await claimPayout(betId);
      alert("Payout claimed!");
    } catch (error) {
      console.error("Claim failed:", error);
      alert("Claim failed. See console for details.");
    } finally {
      setClaimingBetId(null);
    }
  };

  const totalBets = bets.length;
  const activeBets = enrichedBets.filter(
    b => b.marketStatus === MarketStatus.Open || b.marketStatus === MarketStatus.Locked
  ).length;
  const claimableBets = bets.filter(b => b.canClaim).length;
  const totalStaked = bets.reduce((sum, b) => sum + b.amount, 0);
  const totalWon = enrichedBets
    .filter(b => b.claimed && b.payout > 0)
    .reduce((sum, b) => sum + b.payout - b.amount, 0);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back to Markets
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold text-white mb-2">My Bets</h1>
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
        <p className="text-gray-400">Track your predictions and claim your winnings.</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{betsLoading ? "..." : totalBets}</div>
          <div className="text-xs text-gray-400 mt-1">Total Bets</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">{betsLoading ? "..." : activeBets}</div>
          <div className="text-xs text-gray-400 mt-1">Active</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{betsLoading ? "..." : claimableBets}</div>
          <div className="text-xs text-gray-400 mt-1">Claimable</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{betsLoading ? "..." : totalStaked.toFixed(3)}</div>
          <div className="text-xs text-gray-400 mt-1">Total Staked</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className={`text-2xl font-bold ${totalWon >= 0 ? "text-green-400" : "text-red-400"}`}>
            {betsLoading ? "..." : `${totalWon >= 0 ? "+" : ""}${totalWon.toFixed(3)}`}
          </div>
          <div className="text-xs text-gray-400 mt-1">Profit/Loss</div>
        </GlassCard>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        <GlassButton onClick={() => setFilter("all")} variant={filter === "all" ? "strong" : "regular"}>
          All Bets
        </GlassButton>
        <GlassButton onClick={() => setFilter("active")} variant={filter === "active" ? "strong" : "regular"}>
          Active
        </GlassButton>
        <GlassButton onClick={() => setFilter("claimable")} variant={filter === "claimable" ? "strong" : "regular"}>
          Claimable ({claimableBets})
        </GlassButton>
      </div>

      {/* Bets List */}
      <div className="space-y-4">
        {betsLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg animate-pulse">Loading your bets...</p>
          </GlassCard>
        ) : filteredBets.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">
              {filter === "claimable"
                ? "No bets to claim. Keep grinding."
                : "No bets found. Time to make some predictions."}
            </p>
          </GlassCard>
        ) : (
          filteredBets.map((bet) => (
            <GlassCard key={bet.betId} className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full ${
                        bet.marketStatus === MarketStatus.Open
                          ? "bg-green-500/20 text-green-400"
                          : bet.marketStatus === MarketStatus.Locked
                            ? "bg-yellow-500/20 text-yellow-400"
                            : bet.marketStatus === MarketStatus.Resolved
                              ? "bg-blue-500/20 text-blue-400"
                              : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {STATUS_LABELS[bet.marketStatus]}
                    </span>
                    <Link
                      href={`/markets/${bet.marketId}`}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Market #{bet.marketId}
                    </Link>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-400">Game #{bet.gameId}</span>
                  </div>

                  <h3 className="text-xl font-bold text-white mb-2">
                    {bet.marketTitle}
                  </h3>

                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Your Prediction: </span>
                      <span className={`font-semibold ${bet.prediction ? "text-green-400" : "text-red-400"}`}>
                        {bet.prediction ? "YES" : "NO"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Amount: </span>
                      <span className="text-white font-semibold">{bet.amount.toFixed(3)} ETH</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col justify-center items-end min-w-[180px]">
                  {bet.marketStatus === MarketStatus.Resolved && (
                    <>
                      {bet.outcome !== undefined && (
                        <div className="mb-3 text-center">
                          <p className="text-sm text-gray-400 mb-1">Outcome</p>
                          <p className={`text-2xl font-bold ${bet.outcome === bet.prediction ? "text-green-400" : "text-red-400"}`}>
                            {bet.outcome ? "YES" : "NO"}
                          </p>
                        </div>
                      )}

                      {bet.canClaim && bet.payout > 0 && (
                        <div className="text-center mb-3">
                          <p className="text-sm text-gray-400">Payout</p>
                          <p className="text-2xl font-bold text-green-400">{bet.payout.toFixed(4)} ETH</p>
                          <p className="text-xs text-green-400">+{(bet.payout - bet.amount).toFixed(4)} ETH profit</p>
                        </div>
                      )}

                      {bet.canClaim ? (
                        <GlassButton
                          variant="prominent"
                          onClick={() => handleClaimPayout(bet.betId)}
                          disabled={claimingBetId === bet.betId || isClaiming}
                        >
                          {claimingBetId === bet.betId ? "Claiming..." : "Claim Payout"}
                        </GlassButton>
                      ) : bet.claimed ? (
                        <div className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg text-sm">
                          ✓ Claimed
                        </div>
                      ) : (
                        <div className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm">
                          Lost
                        </div>
                      )}
                    </>
                  )}

                  {(bet.marketStatus === MarketStatus.Open || bet.marketStatus === MarketStatus.Locked) && (
                    <Link href={`/markets/${bet.marketId}`}>
                      <GlassButton variant="strong" size="sm">View Market</GlassButton>
                    </Link>
                  )}
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>
    </div>
  );
}
