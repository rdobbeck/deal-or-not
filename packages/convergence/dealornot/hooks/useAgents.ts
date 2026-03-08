"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { AGENT_REGISTRY_ABI } from "@/lib/agentRegistryAbi";
import { AGENT_REGISTRY_ADDRESS } from "@/lib/config";
import { useMemo } from "react";
import { useMockDataToggle } from "@/contexts/MockDataContext";

export type AgentData = {
  id: number;
  owner: string;
  name: string;
  endpoint: string;
  metadata: string;
  gamesPlayed: number;
  gamesWon: number;
  totalEarnings: number;
  winRate: number;
  registeredAt: number;
  isBanned: boolean;
  isActive: boolean;
};

const registryConfig = {
  address: AGENT_REGISTRY_ADDRESS,
  abi: AGENT_REGISTRY_ABI,
} as const;

// ── Mock Data ──

const MOCK_AGENTS: AgentData[] = [
  {
    id: 1, owner: "0x1234567890123456789012345678901234567890",
    name: "GreedyBot", endpoint: "https://greedybot.ai/api/decision",
    metadata: "Aggressive strategy — always rejects early offers",
    gamesPlayed: 156, gamesWon: 106, totalEarnings: 5240, winRate: 6800,
    registeredAt: 1709251200, isBanned: false, isActive: true,
  },
  {
    id: 2, owner: "0x2345678901234567890123456789012345678901",
    name: "ConservativeAgent", endpoint: "https://conservative.agent.ai/decide",
    metadata: "Steady wins — accepts good offers early",
    gamesPlayed: 203, gamesWon: 146, totalEarnings: 6890, winRate: 7200,
    registeredAt: 1709337600, isBanned: false, isActive: true,
  },
  {
    id: 3, owner: "0x3456789012345678901234567890123456789012",
    name: "RiskyRick", endpoint: "https://risky.rick.dev/api/decision",
    metadata: "YOLO strategy — always goes to the end",
    gamesPlayed: 89, gamesWon: 48, totalEarnings: 2150, winRate: 5400,
    registeredAt: 1709424000, isBanned: false, isActive: true,
  },
];

// ── Hooks ──

export function useAgentCount() {
  const { useMockData } = useMockDataToggle();
  const { data, isLoading } = useReadContract({
    ...registryConfig,
    functionName: "totalAgents",
    query: { enabled: !useMockData },
  });

  if (useMockData) return { count: MOCK_AGENTS.length, isLoading: false };
  return { count: data ? Number(data) : 0, isLoading };
}

export function useAgent(agentId: number | undefined) {
  const { useMockData } = useMockDataToggle();
  const { data, isLoading } = useReadContract({
    ...registryConfig,
    functionName: "getAgent",
    args: agentId !== undefined ? [BigInt(agentId)] : undefined,
    query: { enabled: !useMockData && agentId !== undefined },
  });

  const agent: AgentData | null = useMemo(() => {
    if (useMockData) {
      return MOCK_AGENTS.find(a => a.id === agentId) ?? null;
    }
    if (!data || agentId === undefined) return null;
    const d = data as {
      owner: string; name: string; apiEndpoint: string; metadata: string;
      gamesPlayed: bigint; gamesWon: bigint; totalEarnings: bigint;
      registeredAt: bigint; isBanned: boolean; isActive: boolean;
    };
    const played = Number(d.gamesPlayed);
    const won = Number(d.gamesWon);
    return {
      id: agentId,
      owner: d.owner,
      name: d.name,
      endpoint: d.apiEndpoint,
      metadata: d.metadata,
      gamesPlayed: played,
      gamesWon: won,
      totalEarnings: Number(d.totalEarnings),
      winRate: played > 0 ? Math.round((won / played) * 10000) : 0,
      registeredAt: Number(d.registeredAt),
      isBanned: d.isBanned,
      isActive: d.isActive,
    };
  }, [data, agentId, useMockData]);

  return { agent, isLoading: useMockData ? false : isLoading };
}

export function useAllAgents() {
  const { useMockData } = useMockDataToggle();
  const { count } = useAgentCount();

  // Build contract calls for each agent
  const contracts = useMemo(() => {
    if (useMockData || count === 0) return [];
    return Array.from({ length: count }, (_, i) => ({
      ...registryConfig,
      functionName: "getAgent" as const,
      args: [BigInt(i + 1)] as const,
    }));
  }, [count]);

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !useMockData && contracts.length > 0 },
  });

  const agents: AgentData[] = useMemo(() => {
    if (useMockData) return MOCK_AGENTS;
    if (!data) return [];

    return data
      .map((result, i) => {
        if (result.status !== "success" || !result.result) return null;
        const d = result.result as {
          owner: string; name: string; apiEndpoint: string; metadata: string;
          gamesPlayed: bigint; gamesWon: bigint; totalEarnings: bigint;
          registeredAt: bigint; isBanned: boolean; isActive: boolean;
        };
        const played = Number(d.gamesPlayed);
        const won = Number(d.gamesWon);
        return {
          id: i + 1,
          owner: d.owner,
          name: d.name,
          endpoint: d.apiEndpoint,
          metadata: d.metadata,
          gamesPlayed: played,
          gamesWon: won,
          totalEarnings: Number(d.totalEarnings),
          winRate: played > 0 ? Math.round((won / played) * 10000) : 0,
          registeredAt: Number(d.registeredAt),
          isBanned: d.isBanned,
          isActive: d.isActive,
        };
      })
      .filter((a): a is AgentData => a !== null && a.isActive && !a.isBanned);
  }, [data, useMockData]);

  return { agents, isLoading: useMockData ? false : isLoading };
}
