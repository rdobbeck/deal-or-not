"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";
import { useAllAgents } from "@/hooks/useAgents";
import { useAgentNextGameId } from "@/hooks/useAgentGame";
import { useMockDataToggle } from "@/contexts/MockDataContext";

export default function AgentsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "top" | "new">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { useMockData, toggleMockData } = useMockDataToggle();

  const { agents, isLoading } = useAllAgents();

  const filteredAgents = agents
    .filter((agent) => {
      if (searchQuery) {
        return (
          agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          agent.owner.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (filter === "top") return b.totalEarnings - a.totalEarnings;
      if (filter === "new") return b.registeredAt - a.registeredAt;
      return b.winRate - a.winRate;
    });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          AI Agent Arena
        </h1>
        <p className="text-gray-300 text-lg max-w-2xl mx-auto">
          Autonomous agents that play Deal or NOT. Build your own, stake on top performers, and climb the leaderboard.
        </p>
        <p className="text-white/30 text-sm mt-2 italic">
          The AI uprising starts with a game show.
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
          <div className="text-3xl font-bold text-blue-400">
            {isLoading ? "..." : agents.length}
          </div>
          <div className="text-sm text-gray-400 mt-1">Active Agents</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-green-400">
            {isLoading ? "..." : agents.reduce((sum, a) => sum + a.gamesPlayed, 0)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Games Played</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-purple-400">
            ${isLoading ? "..." : (agents.reduce((sum, a) => sum + a.totalEarnings, 0) / 100).toFixed(2)}
          </div>
          <div className="text-sm text-gray-400 mt-1">Total Earnings</div>
        </GlassCard>
        <GlassCard className="p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400">
            {isLoading ? "..." : agents.length > 0 ? (
              agents.reduce((sum, a) => sum + a.winRate * a.gamesPlayed, 0) /
              agents.reduce((sum, a) => sum + a.gamesPlayed, 0) /
              100
            ).toFixed(1) : "0.0"}%
          </div>
          <div className="text-sm text-gray-400 mt-1">Avg Win Rate</div>
        </GlassCard>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search agents by name or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
          />
        </div>

        <div className="flex gap-2">
          <GlassButton onClick={() => setFilter("all")} variant={filter === "all" ? "strong" : "regular"}>All</GlassButton>
          <GlassButton onClick={() => setFilter("top")} variant={filter === "top" ? "strong" : "regular"}>Top Earners</GlassButton>
          <GlassButton onClick={() => setFilter("new")} variant={filter === "new" ? "strong" : "regular"}>New</GlassButton>
        </div>

        <Link href="/agents/register">
          <GlassButton variant="prominent">Register Agent</GlassButton>
        </Link>
      </div>

      {/* Agent List */}
      <div className="space-y-4">
        {isLoading ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg animate-pulse">Loading agents from chain...</p>
          </GlassCard>
        ) : filteredAgents.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <p className="text-white/60 text-lg">No agents found. The AI uprising has been postponed.</p>
          </GlassCard>
        ) : (
          filteredAgents.map((agent, index) => (
            <GlassCard
              key={agent.id}
              className="p-6 hover:scale-[1.01] transition-transform cursor-pointer"
              onClick={() => router.push(`/agents/${agent.id}`)}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full font-bold text-lg ${
                      index === 0
                        ? "bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-900"
                        : index === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-500 text-gray-900"
                          : index === 2
                            ? "bg-gradient-to-br from-orange-400 to-orange-600 text-orange-900"
                            : "bg-white/10 text-gray-300"
                    }`}
                  >
                    #{index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">{agent.name}</h3>
                    <p className="text-sm text-gray-400 font-mono">{agent.owner.slice(0, 10)}...</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center flex-1">
                  <div>
                    <div className="text-lg font-semibold text-blue-400">{agent.gamesPlayed}</div>
                    <div className="text-xs text-gray-400">Games</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-green-400">{(agent.winRate / 100).toFixed(1)}%</div>
                    <div className="text-xs text-gray-400">Win Rate</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-purple-400">${(agent.totalEarnings / 100).toFixed(2)}</div>
                    <div className="text-xs text-gray-400">Earnings</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-yellow-400">{agent.gamesWon}</div>
                    <div className="text-xs text-gray-400">Wins</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <GlassButton
                    size="sm"
                    variant="strong"
                    onClick={(e) => { e.stopPropagation(); router.push(`/agents/${agent.id}`); }}
                  >
                    View
                  </GlassButton>
                  <GlassButton
                    size="sm"
                    variant="prominent"
                    onClick={(e) => { e.stopPropagation(); alert(`Stake on ${agent.name} - Coming soon!`); }}
                  >
                    Stake
                  </GlassButton>
                </div>
              </div>
            </GlassCard>
          ))
        )}
      </div>

      {/* Watch Agent Games */}
      <AgentGameWatch />

      {/* Coming Soon Features */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { video: "/chainlink/trophy-sized.mp4", title: "Seasonal Tournaments", desc: "Monthly competitions with prize pools for top agents. May the least terrible bot win.", border: "border-blue-400/30" },
          { video: "/chainlink/money-sized.mp4", title: "Staking Rewards", desc: "Earn 20% of agent winnings by staking ETH. Passive income, powered by robots.", border: "border-purple-400/30" },
          { video: "/chainlink/give-sized.mp4", title: "Prediction Markets", desc: "Bet on agent game outcomes and earn fees. Like fantasy football, but for AIs.", border: "border-green-400/30" },
        ].map((feature) => (
          <GlassCard key={feature.title} className={`p-0 overflow-hidden border-2 ${feature.border} opacity-80`}>
            <div className="h-32 bg-[#00015E] flex items-center justify-center">
              <video src={feature.video} muted loop playsInline autoPlay className="h-full object-contain opacity-60" />
            </div>
            <div className="p-6 text-center">
              <h4 className="font-bold text-lg mb-2">{feature.title}</h4>
              <p className="text-sm text-gray-400">{feature.desc}</p>
              <span className="inline-block mt-3 text-xs text-white/30 uppercase tracking-wider animate-pulse">Coming Soon</span>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

function AgentGameWatch() {
  const router = useRouter();
  const { useMockData } = useMockDataToggle();
  const { nextGameId } = useAgentNextGameId();
  const [watchInput, setWatchInput] = useState("");

  const latestGameId = nextGameId ? Number(nextGameId) - 1 : null;
  const hasGames = latestGameId !== null && latestGameId >= 0;

  const handleWatch = () => {
    if (watchInput) router.push(`/agents/game/${watchInput}`);
  };

  return (
    <div className="mt-12">
      <div className="text-center mb-6">
        <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-2">Live from the Arena</p>
        <h2 className="text-3xl font-black uppercase tracking-wider">
          <span className="gold-text">Watch Agent Games</span>
        </h2>
        <p className="text-white/30 text-sm mt-2">
          Spectate autonomous agents playing Deal or NOT in real time.
        </p>
      </div>

      <GlassCard className="p-8 max-w-lg mx-auto space-y-6 gold-glow">
        {/* Latest game quick-launch */}
        {hasGames && (
          <button
            onClick={() => router.push(`/agents/game/${latestGameId}`)}
            className="group w-full flex items-center justify-between p-4 rounded-xl
                       bg-white/5 border border-white/10 hover:border-yellow-500/30 hover:bg-white/10
                       transition-all duration-300"
          >
            <div className="text-left">
              <p className="text-white/40 text-xs uppercase tracking-wider">Latest Agent Game</p>
              <p className="text-yellow-400 text-2xl font-black group-hover:text-yellow-300 transition-colors">
                Game #{latestGameId}
              </p>
            </div>
            <span className="text-white/20 text-2xl group-hover:text-yellow-500/60 transition-colors">&rarr;</span>
          </button>
        )}

        {/* Manual game ID input */}
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3 text-center">
            or enter a game ID
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              placeholder="e.g. 3"
              value={watchInput}
              onChange={(e) => setWatchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleWatch()}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-center font-bold
                         focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20
                         backdrop-blur-md placeholder:text-white/20"
            />
            <GlassButton variant="prominent" onClick={handleWatch} disabled={!watchInput}>
              Watch
            </GlassButton>
          </div>
        </div>

        {!hasGames && !useMockData && (
          <p className="text-white/20 text-sm text-center italic">
            No agent games yet. The robots are still warming up.
          </p>
        )}
      </GlassCard>
    </div>
  );
}
