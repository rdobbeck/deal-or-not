"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePublicClient } from "wagmi";
import { parseAbiItem, decodeEventLog, type Log, type WatchContractEventReturnType } from "viem";
import { CONTRACT_ADDRESS } from "@/lib/config";
import { centsToUsd } from "@/lib/utils";

interface EventLogProps {
  gameId: bigint;
}

type GameEvent = {
  name: string;
  description: string;
  color: string;
  blockNumber: bigint;
};

const EVENT_DEFS = [
  { abi: "event GameCreated(uint256 indexed gameId, address indexed host, uint8 mode)", name: "GameCreated", color: "text-green-400" },
  { abi: "event VRFSeedReceived(uint256 indexed gameId)", name: "VRFSeedReceived", color: "text-blue-400" },
  { abi: "event CasePicked(uint256 indexed gameId, uint8 caseIndex)", name: "CasePicked", color: "text-cyan-400" },
  { abi: "event CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex)", name: "CaseOpenRequested", color: "text-yellow-400" },
  { abi: "event CaseRevealed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents)", name: "CaseRevealed", color: "text-purple-400" },
  { abi: "event RoundComplete(uint256 indexed gameId, uint8 round)", name: "RoundComplete", color: "text-orange-400" },
  { abi: "event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents)", name: "BankerOfferMade", color: "text-amber-400" },
  { abi: "event BankerMessage(uint256 indexed gameId, string message)", name: "BankerMessage", color: "text-amber-300" },
  { abi: "event DealAccepted(uint256 indexed gameId, uint256 payoutCents)", name: "DealAccepted", color: "text-green-300" },
  { abi: "event DealRejected(uint256 indexed gameId, uint8 round)", name: "DealRejected", color: "text-red-400" },
  { abi: "event FinalCaseRequested(uint256 indexed gameId)", name: "FinalCaseRequested", color: "text-pink-400" },
  { abi: "event GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped)", name: "GameResolved", color: "text-green-500" },
  { abi: "event GameSecretPublished(uint256 indexed gameId, bytes32 secret)", name: "GameSecretPublished", color: "text-indigo-400" },
  { abi: "event PlayerJoinedCrossChain(uint256 indexed gameId, address indexed player)", name: "PlayerJoinedCrossChain", color: "text-teal-400" },
  { abi: "event GameExpired(uint256 indexed gameId)", name: "GameExpired", color: "text-red-500" },
] as const;

function formatEventArgs(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "GameCreated": {
      const host = String(args.host ?? "").slice(0, 8);
      return `Host: ${host}...`;
    }
    case "CasePicked":
    case "CaseOpenRequested":
      return `Case #${args.caseIndex}`;
    case "CaseRevealed":
      return `Case #${args.caseIndex} = ${centsToUsd(BigInt(String(args.valueCents ?? 0)))}`;
    case "RoundComplete":
      return `Round ${Number(args.round) + 1}`;
    case "BankerOfferMade":
      return `R${Number(args.round) + 1}: ${centsToUsd(BigInt(String(args.offerCents ?? 0)))}`;
    case "BankerMessage": {
      const msg = String(args.message ?? "");
      return msg.length > 50 ? msg.slice(0, 47) + "..." : msg;
    }
    case "DealAccepted":
      return `Payout: ${centsToUsd(BigInt(String(args.payoutCents ?? 0)))}`;
    case "DealRejected":
      return `Round ${Number(args.round) + 1}`;
    case "GameResolved":
      return `${centsToUsd(BigInt(String(args.payoutCents ?? 0)))} ${args.swapped ? "(swapped)" : ""}`;
    case "PlayerJoinedCrossChain": {
      const p = String(args.player ?? "").slice(0, 8);
      return `Player: ${p}...`;
    }
    case "GameSecretPublished":
      return `Secret published`;
    default:
      return "";
  }
}

export default function EventLog({ gameId }: EventLogProps) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenKeys = useRef(new Set<string>());
  const publicClient = usePublicClient();

  const addEvent = useCallback((evt: GameEvent) => {
    const key = `${evt.name}-${evt.blockNumber}`;
    if (seenKeys.current.has(key)) return;
    seenKeys.current.add(key);
    setEvents(prev => [...prev, evt].sort((a, b) => Number(a.blockNumber - b.blockNumber)));
  }, []);

  // Fetch historical events once on mount
  useEffect(() => {
    if (!publicClient) return;

    const fetchHistoricalEvents = async () => {
      try {
        // Get current block
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock - 10000n; // Look back ~10k blocks (~2 hours on Base)

        for (const def of EVENT_DEFS) {
          try {
            const logs = await publicClient.getLogs({
              address: CONTRACT_ADDRESS,
              event: parseAbiItem(def.abi),
              args: { gameId },
              fromBlock,
              toBlock: currentBlock,
            });

            for (const log of logs) {
              try {
                const decoded = decodeEventLog({
                  abi: [parseAbiItem(def.abi)],
                  data: log.data,
                  topics: log.topics,
                });

                console.log(`Historical Event: ${def.name}`, { args: decoded.args, log });

                addEvent({
                  name: def.name,
                  description: formatEventArgs(def.name, decoded.args as Record<string, unknown>),
                  color: def.color,
                  blockNumber: log.blockNumber ?? 0n,
                });
              } catch (decodeErr) {
                console.error(`Error decoding ${def.name}:`, decodeErr);
              }
            }
          } catch (err) {
            console.error(`Error fetching ${def.name}:`, err);
          }
        }
      } catch (err) {
        console.error('Error fetching historical events:', err);
      }
    };

    fetchHistoricalEvents();
  }, [publicClient, gameId, addEvent]);

  // Watch for new events in real-time
  useEffect(() => {
    if (!publicClient) return;

    const unwatchers: WatchContractEventReturnType[] = [];

    for (const def of EVENT_DEFS) {
      const unwatch = publicClient.watchContractEvent({
        address: CONTRACT_ADDRESS,
        abi: [parseAbiItem(def.abi)],
        args: { gameId },
        pollingInterval: 4_000,
        onLogs: (logs) => {
          for (const log of logs) {
            try {
              const decoded = decodeEventLog({
                abi: [parseAbiItem(def.abi)],
                data: log.data,
                topics: log.topics,
              });

              console.log(`Live Event: ${def.name}`, { args: decoded.args, log });

              addEvent({
                name: def.name,
                description: formatEventArgs(def.name, decoded.args as Record<string, unknown>),
                color: def.color,
                blockNumber: log.blockNumber ?? 0n,
              });
            } catch (decodeErr) {
              console.error(`Error decoding live ${def.name}:`, decodeErr);
            }
          }
        },
      });
      unwatchers.push(unwatch);
    }

    return () => {
      for (const unwatch of unwatchers) unwatch();
    };
  }, [publicClient, gameId, addEvent]);

  // Auto-scroll on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-800/50 hover:bg-gray-800 transition-colors"
      >
        <span className="text-gray-400 text-xs uppercase tracking-widest font-bold">
          Event Log ({events.length})
        </span>
        <span className="text-gray-500 text-xs">{collapsed ? "+" : "-"}</span>
      </button>

      {!collapsed && (
        <div
          ref={scrollRef}
          className="max-h-64 overflow-y-auto p-3 space-y-1 font-mono text-xs"
        >
          {events.length === 0 && (
            <p className="text-gray-600 text-center py-4">Watching for events...</p>
          )}
          {events.map((evt, i) => (
            <div key={`${evt.name}-${evt.blockNumber}-${i}`} className="flex gap-2 items-baseline">
              <span className="text-gray-600 shrink-0">
                #{evt.blockNumber.toString().slice(-4)}
              </span>
              <span className={`font-bold shrink-0 ${evt.color}`}>
                {evt.name}
              </span>
              {evt.description && (
                <span className="text-gray-400 truncate">
                  {evt.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
