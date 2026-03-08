"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { BEST_OF_BANKER_ABI } from "@/lib/bestOfBankerAbi";
import { BEST_OF_BANKER_ADDRESS } from "@/lib/config";
import { formatEther } from "viem";
import { GlassCard } from "@/components/glass";
import RotatingAd from "@/components/RotatingAd";

type QuoteEntry = {
  id: bigint;
  gameId: bigint;
  round: number;
  message: string;
  upvotes: bigint;
  timestamp: bigint;
};

function QuoteCard({ entry, rank, isTop5, onUpvote, isConnected, votingId, costWei }: {
  entry: QuoteEntry; rank: number; isTop5: boolean;
  onUpvote: (id: bigint) => void; isConnected: boolean; votingId: number | null; costWei: unknown;
}) {
  return (
    <div
      className={`bg-gray-900/80 border rounded-xl p-4 flex items-start gap-3 transition-colors ${
        isTop5
          ? "border-amber-500/40 shadow-[0_0_12px_rgba(255,215,0,0.1)]"
          : "border-gray-700/50"
      }`}
    >
      <div className={`text-2xl font-bold w-8 text-center shrink-0 ${
        isTop5 ? "text-amber-400" : "text-amber-500/40"
      }`}>
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm italic leading-relaxed">
          &ldquo;{entry.message}&rdquo;
        </p>
        <div className="flex gap-3 mt-1">
          <span className="text-gray-600 text-xs">Game #{entry.gameId.toString()}</span>
          <span className="text-gray-600 text-xs">Round {entry.round}</span>
          {isTop5 && (
            <span className="text-amber-500/60 text-xs font-semibold">TOP 5</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onUpvote(entry.id)}
        disabled={!isConnected || votingId !== null}
        className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/30 transition-colors disabled:opacity-40"
        title={
          costWei
            ? `Give your two cents (~${formatEther(costWei as bigint).slice(0, 10)} ETH)`
            : "Give your two cents"
        }
      >
        <span className="text-amber-400 text-lg">
          {votingId === Number(entry.id) ? "..." : "\u25B2"}
        </span>
        <span className="text-gray-400 text-xs font-mono">
          {entry.upvotes.toString()}
        </span>
      </button>
    </div>
  );
}

export default function BestOfBankerPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [votingId, setVotingId] = useState<number | null>(null);
  const [allQuotes, setAllQuotes] = useState<QuoteEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: topData, refetch } = useReadContract({
    address: BEST_OF_BANKER_ADDRESS,
    abi: BEST_OF_BANKER_ABI,
    functionName: "getTopQuotes",
    args: [5n],
    query: { refetchInterval: 15000 },
  });

  const { data: costWei } = useReadContract({
    address: BEST_OF_BANKER_ADDRESS,
    abi: BEST_OF_BANKER_ABI,
    functionName: "upvoteCostWei",
  });

  const { data: quoteCount } = useReadContract({
    address: BEST_OF_BANKER_ADDRESS,
    abi: BEST_OF_BANKER_ABI,
    functionName: "quoteCount",
    query: { refetchInterval: 15000 },
  });

  const fetchAllQuotes = useCallback(async () => {
    if (!publicClient || !quoteCount || quoteCount === 0n) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const count = Number(quoteCount);
      const quotes: QuoteEntry[] = [];
      for (let i = 0; i < count; i++) {
        const result = await publicClient.readContract({
          address: BEST_OF_BANKER_ADDRESS,
          abi: BEST_OF_BANKER_ABI,
          functionName: "getQuote",
          args: [BigInt(i)],
        });
        const [gameId, round, message, upvotes, timestamp] = result as [bigint, number, string, bigint, bigint];
        if (message && message.length > 0) {
          quotes.push({ id: BigInt(i), gameId, round, message, upvotes, timestamp });
        }
      }
      quotes.sort((a, b) => (b.upvotes > a.upvotes ? 1 : b.upvotes < a.upvotes ? -1 : 0));
      setAllQuotes(quotes);
    } finally {
      setLoading(false);
    }
  }, [publicClient, quoteCount]);

  useEffect(() => {
    fetchAllQuotes();
  }, [fetchAllQuotes]);

  const handleUpvote = async (quoteId: bigint) => {
    if (!costWei || !isConnected) return;
    setVotingId(Number(quoteId));
    try {
      const hash = await writeContractAsync({
        address: BEST_OF_BANKER_ADDRESS,
        abi: BEST_OF_BANKER_ABI,
        functionName: "upvote",
        args: [quoteId],
        value: costWei as bigint,
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
      await fetchAllQuotes();
    } catch {
      // user rejected or error
    } finally {
      setVotingId(null);
    }
  };

  const totalQuotes = quoteCount ? Number(quoteCount) : 0;

  // Build top 5 IDs set for highlighting
  const topIds = new Set<number>();
  if (topData) {
    const [ids] = topData as [readonly bigint[], readonly bigint[], readonly string[], readonly bigint[]];
    ids.forEach(id => topIds.add(Number(id)));
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 pt-12 pb-8 text-center">
        <p className="text-yellow-500/60 text-xs uppercase tracking-[0.3em] mb-3">
          On-Chain Hall of Shame
        </p>
        <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 bg-clip-text text-transparent mb-4">
          Best of the Banker
        </h1>
        <p className="text-white/50 max-w-xl mx-auto leading-relaxed">
          Every quote below was generated by Gemini 2.5 Flash inside a Chainlink CRE confidential enclave,
          then written on-chain via <code className="text-amber-400/70 text-xs">writeReport</code> to
          the BestOfBanker contract. The AI never sees your strategy. The DON nodes never see the prompt.
          Only the snark survives.
        </p>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto px-4 mb-10">
        <GlassCard className="p-6">
          <h2 className="text-amber-400 text-sm font-bold uppercase tracking-wider mb-4">
            How Banker Quotes Get On-Chain
          </h2>
          <div className="grid md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl mb-1">1</div>
              <p className="text-white/80 text-sm font-semibold">Case Revealed</p>
              <p className="text-white/40 text-xs mt-1">CRE enclave decrypts case value, emits RoundComplete</p>
            </div>
            <div>
              <div className="text-2xl mb-1">2</div>
              <p className="text-white/80 text-sm font-semibold">Banker AI Runs</p>
              <p className="text-white/40 text-xs mt-1">Second CRE workflow reads game state, calculates EV-based offer</p>
            </div>
            <div>
              <div className="text-2xl mb-1">3</div>
              <p className="text-white/80 text-sm font-semibold">Gemini via Confidential HTTP</p>
              <p className="text-white/40 text-xs mt-1">CRE calls Gemini 2.5 Flash with game context inside the enclave</p>
            </div>
            <div>
              <div className="text-2xl mb-1">4</div>
              <p className="text-white/80 text-sm font-semibold">Written On-Chain</p>
              <p className="text-white/40 text-xs mt-1">writeReport #1 sets offer, #2 saves quote to BestOfBanker gallery</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Stats bar */}
      <div className="max-w-4xl mx-auto px-4 mb-8">
        <div className="flex justify-center gap-8 text-center">
          <div>
            <p className="text-amber-400 text-2xl font-bold font-mono">{totalQuotes}</p>
            <p className="text-white/40 text-xs">Quotes On-Chain</p>
          </div>
          <div>
            <p className="text-amber-400 text-2xl font-bold font-mono">
              {costWei ? `~${formatEther(costWei as bigint).slice(0, 8)}` : "..."}
            </p>
            <p className="text-white/40 text-xs">ETH per Upvote</p>
          </div>
          <div>
            <p className="text-amber-400 text-2xl font-bold font-mono">$0.02</p>
            <p className="text-white/40 text-xs">Your Two Cents</p>
          </div>
        </div>
      </div>

      {/* Quotes list */}
      <div className="max-w-3xl mx-auto px-4 mb-12">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm animate-pulse">The Banker is reviewing his greatest hits...</p>
          </div>
        ) : allQuotes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-white/40 text-sm">No quotes yet. Play a game to hear from the Banker.</p>
          </div>
        ) : (
          <>
            {/* Top 5 */}
            <div className="space-y-3">
              {allQuotes.slice(0, 5).map((entry, i) => (
                <QuoteCard key={Number(entry.id)} entry={entry} rank={i + 1} isTop5={true}
                  onUpvote={handleUpvote} isConnected={isConnected} votingId={votingId} costWei={costWei} />
              ))}
            </div>

            {/* Ad break between top 5 and the rest */}
            {allQuotes.length > 5 && (
              <div className="my-8">
                <RotatingAd variant="break" seed={BigInt(totalQuotes * 42 + 7)} />
              </div>
            )}

            {/* The rest */}
            {allQuotes.length > 5 && (
              <div className="space-y-3">
                <p className="text-white/30 text-xs uppercase tracking-widest text-center mb-4">
                  The Rest of the Banker&apos;s Ramblings
                </p>
                {allQuotes.slice(5).map((entry, i) => (
                  <QuoteCard key={Number(entry.id)} entry={entry} rank={i + 6} isTop5={false}
                    onUpvote={handleUpvote} isConnected={isConnected} votingId={votingId} costWei={costWei} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Contract info */}
      <div className="max-w-3xl mx-auto px-4 mb-8">
        <GlassCard className="p-5">
          <h3 className="text-amber-400/80 text-xs font-bold uppercase tracking-wider mb-3">Contract Details</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-white/40">BestOfBanker</span>
              <a
                href={`https://sepolia.basescan.org/address/${BEST_OF_BANKER_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400/70 hover:text-amber-400 font-mono"
              >
                {BEST_OF_BANKER_ADDRESS}
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Network</span>
              <span className="text-white/60">Base Sepolia</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Quote Source</span>
              <span className="text-white/60">CRE Banker AI Workflow + Gemini 2.5 Flash</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/40">Upvote Price</span>
              <span className="text-white/60">$0.02 via Chainlink Price Feed</span>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Rotating ads */}
      <div className="max-w-md mx-auto px-4 pb-16">
        <RotatingAd variant="sidebar" seed={BigInt(totalQuotes * 13 + 3)} />
      </div>
    </div>
  );
}
