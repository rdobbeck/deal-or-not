"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";
import { formatEther, parseEther } from "viem";
import { useAgent } from "@/hooks/useAgents";
import { useMockDataToggle } from "@/contexts/MockDataContext";

type AgentGame = {
  gameId: number;
  timestamp: number;
  earnings: number;
  won: boolean;
  rounds: number;
  finalAction: "deal" | "keep" | "swap";
};

const MOCK_GAMES: AgentGame[] = [
  { gameId: 156, timestamp: Date.now() - 3600000, earnings: 75, won: true, rounds: 3, finalAction: "deal" },
  { gameId: 155, timestamp: Date.now() - 7200000, earnings: 100, won: true, rounds: 4, finalAction: "keep" },
  { gameId: 154, timestamp: Date.now() - 10800000, earnings: 10, won: false, rounds: 2, finalAction: "deal" },
  { gameId: 153, timestamp: Date.now() - 14400000, earnings: 50, won: true, rounds: 4, finalAction: "swap" },
  { gameId: 152, timestamp: Date.now() - 18000000, earnings: 25, won: false, rounds: 3, finalAction: "deal" },
];

const MOCK_STAKING = {
  totalStaked: parseEther("2.5"),
  stakers: 12,
  yourStake: parseEther("0"),
};

// Rich mock metadata for the detail page
const MOCK_METADATA: Record<number, { version: string; strategy: string; description: string; uptime: string }> = {
  1: { version: "2.1.0", strategy: "aggressive", description: "Aggressive strategy — always rejects early offers", uptime: "99.2%" },
  2: { version: "1.2.0", strategy: "conservative", description: "A cautious agent that accepts offers ≥85% of expected value", uptime: "99.8%" },
  3: { version: "0.9.0", strategy: "yolo", description: "YOLO strategy — always goes to the end", uptime: "97.5%" },
};

const MOCK_PERFORMANCE: Record<number, { dealRate: string; avgRoundExit: string; swapRate: string; perfectGames: number }> = {
  1: { dealRate: "12%", avgRoundExit: "3.8", swapRate: "35%", perfectGames: 1 },
  2: { dealRate: "42%", avgRoundExit: "2.8", swapRate: "18%", perfectGames: 3 },
  3: { dealRate: "5%", avgRoundExit: "4.2", swapRate: "50%", perfectGames: 0 },
};

export default function AgentDetailsPage({ params }: { params: Promise<{ agentId: string }> }) {
  const router = useRouter();
  const { useMockData, toggleMockData } = useMockDataToggle();
  const resolvedParams = use(params);
  const agentId = parseInt(resolvedParams.agentId);

  const [stakeAmount, setStakeAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "games" | "stake" | "strategy">("overview");

  const { agent, isLoading } = useAgent(agentId);

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <GlassCard className="p-12 text-center">
          <p className="text-white/60 text-lg animate-pulse">Loading agent data from chain...</p>
        </GlassCard>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link href="/agents" className="text-white/40 hover:text-white mb-4 flex items-center gap-2 transition-colors">
          &larr; Back to Agents
        </Link>
        <GlassCard className="p-12 text-center">
          <p className="text-white/60 text-lg">Agent not found. The uprising has been postponed.</p>
        </GlassCard>
      </div>
    );
  }

  const mockMeta = MOCK_METADATA[agentId] || { version: "1.0.0", strategy: "unknown", description: agent.metadata, uptime: "N/A" };
  const mockPerf = MOCK_PERFORMANCE[agentId] || { dealRate: "N/A", avgRoundExit: "N/A", swapRate: "N/A", perfectGames: 0 };

  const winRate = (agent.winRate / 100).toFixed(1);
  const avgEarnings = agent.gamesPlayed > 0 ? (agent.totalEarnings / agent.gamesPlayed / 100).toFixed(2) : "0.00";
  const totalEarnings = (agent.totalEarnings / 100).toFixed(2);
  const games = MOCK_GAMES;
  const staking = MOCK_STAKING;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/agents"
          className="text-white/40 hover:text-white mb-4 flex items-center gap-2 transition-colors"
        >
          &larr; Back to Agents
        </Link>

        <GlassCard className="p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center text-3xl font-bold">
                #{agent.id}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-bold mb-2">{agent.name}</h1>
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
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-400">{agent.owner.slice(0, 10)}...{agent.owner.slice(-6)}</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">{mockMeta.description}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-400">{winRate}%</div>
                <div className="text-xs text-gray-400">Win Rate</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-400">${totalEarnings}</div>
                <div className="text-xs text-gray-400">Total Earned</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-400">{agent.gamesPlayed}</div>
                <div className="text-xs text-gray-400">Games Played</div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <GlassButton onClick={() => setActiveTab("overview")} variant={activeTab === "overview" ? "strong" : "regular"}>
          Overview
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("games")} variant={activeTab === "games" ? "strong" : "regular"}>
          Game History
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("stake")} variant={activeTab === "stake" ? "strong" : "regular"}>
          Stake
        </GlassButton>
        <GlassButton onClick={() => setActiveTab("strategy")} variant={activeTab === "strategy" ? "strong" : "regular"}>
          Strategy
        </GlassButton>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Performance Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Games Played</span>
                <span className="text-xl font-semibold">{agent.gamesPlayed}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Games Won</span>
                <span className="text-xl font-semibold text-green-400">{agent.gamesWon}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Win Rate</span>
                <span className="text-xl font-semibold text-green-400">{winRate}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Avg Earnings</span>
                <span className="text-xl font-semibold text-purple-400">${avgEarnings}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Reputation Score</span>
                <span className="text-xl font-semibold text-yellow-400">91</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Staking</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Staked</span>
                <span className="text-xl font-semibold">{formatEther(staking.totalStaked)} ETH</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stakers</span>
                <span className="text-xl font-semibold">{staking.stakers}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Your Stake</span>
                <span className="text-xl font-semibold">
                  {Number(formatEther(staking.yourStake)) > 0
                    ? `${formatEther(staking.yourStake)} ETH`
                    : "None"}
                </span>
              </div>
              <GlassButton variant="prominent" className="w-full mt-4" onClick={() => setActiveTab("stake")}>
                Stake on this Agent
              </GlassButton>
            </div>
          </GlassCard>

          <GlassCard className="p-6 md:col-span-2">
            <h3 className="text-xl font-bold mb-4">API Information</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Endpoint</span>
                <span className="font-mono text-sm text-blue-400 break-all">{agent.endpoint}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Version</span>
                <span className="text-sm">{mockMeta.version}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Uptime</span>
                <span className="text-sm text-green-400">{mockMeta.uptime}</span>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "games" && (
        <div className="space-y-4">
          <GlassCard className="p-6">
            <h3 className="text-xl font-bold mb-4">Recent Games</h3>
            <div className="space-y-3">
              {games.map((game) => (
                <div
                  key={game.gameId}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                  onClick={() => router.push(`/?gameId=${game.gameId}`)}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${
                        game.won
                          ? "bg-green-400/20 text-green-400"
                          : "bg-red-400/20 text-red-400"
                      }`}
                    >
                      {game.won ? "✓" : "✗"}
                    </div>
                    <div>
                      <div className="font-semibold">Game #{game.gameId}</div>
                      <div className="text-sm text-gray-400">
                        {new Date(game.timestamp).toLocaleString()} • {game.rounds} rounds • {game.finalAction}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${game.won ? "text-green-400" : "text-red-400"}`}>
                      ${(game.earnings / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "stake" && (
        <div className="max-w-2xl mx-auto">
          <GlassCard className="p-8">
            <h3 className="text-2xl font-bold mb-6">Stake on {agent.name}</h3>
            <p className="text-gray-400 mb-6">
              Stake ETH on this agent to earn 80% of their winnings proportionally. The agent receives 20%.
            </p>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Total Staked</span>
                <span className="font-semibold">{formatEther(staking.totalStaked)} ETH</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Your Share</span>
                <span className="font-semibold">0%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">7-Day Unlock Period</span>
                <span className="font-semibold text-yellow-400">Yes</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2">Stake Amount (ETH)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.1"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
              />
            </div>

            <GlassButton
              variant="prominent"
              className="w-full"
              onClick={() => alert("Staking coming soon — AgentStaking contract is deployed but UI integration is next!")}
            >
              Stake {stakeAmount || "0"} ETH
            </GlassButton>

            <div className="mt-6 p-4 bg-blue-400/10 border border-blue-400/30 rounded-lg">
              <h4 className="font-semibold text-blue-400 mb-2">How Staking Works</h4>
              <ul className="text-sm text-gray-300 space-y-2">
                <li>• Earn 80% of agent winnings proportional to your stake</li>
                <li>• Agent receives 20% of winnings</li>
                <li>• 7-day unlock period for security</li>
                <li>• No risk of principal loss (agent never touches staked ETH)</li>
              </ul>
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === "strategy" && (
        <div className="max-w-4xl mx-auto">
          <GlassCard className="p-8">
            <h3 className="text-2xl font-bold mb-6">Agent Strategy</h3>

            <div className="space-y-6">
              <div>
                <h4 className="font-semibold text-lg mb-2">Strategy Type</h4>
                <p className="text-gray-300">{mockMeta.strategy}</p>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Description</h4>
                <p className="text-gray-300">{mockMeta.description}</p>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Decision-Making</h4>
                <ul className="text-gray-300 space-y-2">
                  <li>• Accepts banker offers based on expected value threshold</li>
                  <li>• Opens lowest-value cases first to maximize EV</li>
                  <li>• Adjusts thresholds based on round progression</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold text-lg mb-2">Performance Breakdown</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Deal Rate</div>
                    <div className="text-2xl font-bold text-blue-400">{mockPerf.dealRate}</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Avg Round Exit</div>
                    <div className="text-2xl font-bold text-purple-400">{mockPerf.avgRoundExit}</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Swap Rate</div>
                    <div className="text-2xl font-bold text-green-400">{mockPerf.swapRate}</div>
                  </div>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <div className="text-gray-400 text-sm">Perfect Games</div>
                    <div className="text-2xl font-bold text-yellow-400">{mockPerf.perfectGames}</div>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
