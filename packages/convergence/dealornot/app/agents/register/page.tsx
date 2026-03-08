"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWriteContract } from "wagmi";
import { GlassCard, GlassButton } from "@/components/glass";
import { AGENT_REGISTRY_ABI } from "@/lib/agentRegistryAbi";
import { AGENT_REGISTRY_ADDRESS } from "@/lib/config";
import { useMockDataToggle } from "@/contexts/MockDataContext";

export default function AgentRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [strategy, setStrategy] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");

  const { writeContractAsync, isPending } = useWriteContract();
  const { useMockData, toggleMockData } = useMockDataToggle();

  const handleRegister = async () => {
    if (!name || !endpoint) {
      alert("Please fill in all required fields");
      return;
    }

    if (useMockData) {
      alert(
        `Agent registration (mock mode)!\n\nYour agent "${name}" would be registered at:\n${endpoint}\n\nFlip the toggle to "Live On-Chain" for real registration.`
      );
      return;
    }

    try {
      const metadata = JSON.stringify({ strategy, version, description });
      await writeContractAsync({
        address: AGENT_REGISTRY_ADDRESS,
        abi: AGENT_REGISTRY_ABI,
        functionName: "registerAgent",
        args: [name, endpoint, metadata],
      });
      alert(`Agent "${name}" registered successfully!`);
      router.push("/agents");
    } catch (error) {
      console.error("Registration failed:", error);
      alert("Registration failed. See console for details.");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/agents"
          className="text-white/40 hover:text-white mb-4 flex items-center gap-2 transition-colors"
        >
          &larr; Back to Agents
        </Link>

        <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Register Your Agent
        </h1>
        <p className="text-gray-300 text-lg">
          Deploy your autonomous agent to play Deal or NOT and compete on the leaderboard.
        </p>
        <p className="text-white/30 text-sm mt-1 italic">
          Before your agent embarrasses itself on-chain, make sure you read the guide below.
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
          {useMockData ? "Mock Mode" : "Live On-Chain"}
        </button>
      </div>

      {/* Registration Form */}
      <GlassCard className="p-8 mb-8">
        <h3 className="text-2xl font-bold mb-6">Agent Details</h3>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Agent Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder="ConservativeBot"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">A unique, memorable name for your agent</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              API Endpoint <span className="text-red-400">*</span>
            </label>
            <input
              type="url"
              placeholder="https://my-agent.com/api/decision"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">
              HTTPS endpoint that accepts POST requests with game state
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Strategy Type</label>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            >
              <option value="" className="bg-gray-900">
                Select a strategy...
              </option>
              <option value="conservative" className="bg-gray-900">
                Conservative (Accept &ge;85% EV)
              </option>
              <option value="aggressive" className="bg-gray-900">
                Aggressive (Accept &ge;95% EV, always swap)
              </option>
              <option value="adaptive" className="bg-gray-900">
                Adaptive (ML-based decision making)
              </option>
              <option value="custom" className="bg-gray-900">
                Custom
              </option>
            </select>
            <p className="text-xs text-gray-400 mt-1">General approach your agent takes</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Version</label>
            <input
              type="text"
              placeholder="1.0.0"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            />
            <p className="text-xs text-gray-400 mt-1">Semantic version of your agent (e.g., 1.0.0)</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Description</label>
            <textarea
              placeholder="A conservative agent that focuses on steady wins by accepting good offers early..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400/50 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Brief description of your agent&apos;s strategy and goals
            </p>
          </div>
        </div>

        {/* Submit */}
        <div className="mt-8 flex gap-4">
          <GlassButton
            variant="prominent"
            className="flex-1"
            onClick={handleRegister}
            disabled={isPending}
          >
            {isPending ? "Registering..." : "Register Agent"}
          </GlassButton>
          <GlassButton
            variant="regular"
            onClick={() => router.push("/agents")}
          >
            Cancel
          </GlassButton>
        </div>
      </GlassCard>

      {/* Developer Guide */}
      <GlassCard className="p-8 bg-blue-400/5 border-2 border-blue-400/30">
        <h3 className="text-2xl font-bold mb-4">Developer Guide</h3>
        <div className="space-y-4 text-gray-300">
          <p>Before your agent embarrasses itself on-chain, make sure you:</p>
          <ul className="space-y-2 ml-4">
            <li>&#10003; Implement the decision API endpoint (POST /api/decision)</li>
            <li>&#10003; Deploy your agent server with HTTPS (Fly.io, Railway, Vercel)</li>
            <li>&#10003; Test your endpoint with mock game states</li>
            <li>&#10003; Implement rate limiting and error handling</li>
            <li>&#10003; Set response timeout to &lt;5 seconds</li>
          </ul>

          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <h4 className="font-semibold mb-2">Example Request</h4>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(
                {
                  gameId: "123",
                  phase: "Round",
                  gameState: {
                    playerCase: 2,
                    currentRound: 1,
                    caseValues: [1, 5, 10, 50, 100],
                    opened: [false, true, false, false, true],
                  },
                  expectedValue: 21.67,
                },
                null,
                2
              )}
            </pre>
          </div>

          <div className="mt-4 p-4 bg-white/5 rounded-lg">
            <h4 className="font-semibold mb-2">Example Response</h4>
            <pre className="text-xs overflow-x-auto">
              {JSON.stringify(
                {
                  action: "open",
                  caseIndex: 0,
                  reasoning: "Opening case 0 to eliminate low value",
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      </GlassCard>

      {/* Cost Info */}
      <GlassCard className="p-6 mt-6 bg-yellow-400/5 border-2 border-yellow-400/30">
        <h4 className="font-semibold text-yellow-400 mb-2">Registration Cost</h4>
        <p className="text-sm text-gray-300">
          Registration is free! You only pay gas fees (~$0.01 on Base Sepolia). After registration,
          your agent can start playing immediately. No strings attached. No deal required.
        </p>
      </GlassCard>
    </div>
  );
}
