"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { BEST_OF_BANKER_ABI } from "@/lib/bestOfBankerAbi";
import { BEST_OF_BANKER_ADDRESS } from "@/lib/config";
import { formatEther } from "viem";

type QuoteEntry = {
  id: bigint;
  gameId: bigint;
  message: string;
  upvotes: bigint;
};

export default function BestOfBanker() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [votingId, setVotingId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [allQuotes, setAllQuotes] = useState<QuoteEntry[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  const { data: topData, refetch } = useReadContract({
    address: BEST_OF_BANKER_ADDRESS,
    abi: BEST_OF_BANKER_ABI,
    functionName: "getTopQuotes",
    args: [5n],
    query: { refetchInterval: 10000 },
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
    query: { refetchInterval: 10000 },
  });

  const fetchAllQuotes = useCallback(async () => {
    if (!publicClient || !quoteCount || quoteCount === 0n) return;
    setLoadingAll(true);
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
        const [gameId, , message, upvotes] = result as [bigint, number, string, bigint, bigint];
        if (message && message.length > 0) {
          quotes.push({ id: BigInt(i), gameId, message, upvotes });
        }
      }
      // Sort by upvotes descending
      quotes.sort((a, b) => (b.upvotes > a.upvotes ? 1 : b.upvotes < a.upvotes ? -1 : 0));
      setAllQuotes(quotes);
    } finally {
      setLoadingAll(false);
    }
  }, [publicClient, quoteCount]);

  useEffect(() => {
    if (showAll) {
      fetchAllQuotes();
    }
  }, [showAll, fetchAllQuotes]);

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
    } catch {
      // user rejected or error
    } finally {
      setVotingId(null);
    }
  };

  if (!topData) return null;

  const [ids, gameIds, messages, upvoteCounts] = topData as [
    readonly bigint[],
    readonly bigint[],
    readonly string[],
    readonly bigint[],
  ];

  // Filter out empty entries
  const topEntries: QuoteEntry[] = ids
    .map((id, i) => ({
      id,
      gameId: gameIds[i],
      message: messages[i],
      upvotes: upvoteCounts[i],
    }))
    .filter((e) => e.message && e.message.length > 0);

  if (topEntries.length === 0) return null;

  const displayEntries = showAll ? allQuotes : topEntries;
  const totalQuotes = quoteCount ? Number(quoteCount) : 0;
  const hasMore = totalQuotes > 5;

  const renderQuote = (entry: QuoteEntry, i: number) => (
    <div
      key={Number(entry.id)}
      className="bg-gray-900/80 border border-gray-700/50 rounded-xl p-4 flex items-start gap-3"
    >
      <div className="text-2xl font-bold text-amber-500/60 w-8 text-center shrink-0">
        {i + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-gray-200 text-sm italic leading-relaxed">
          &ldquo;{entry.message}&rdquo;
        </p>
        <p className="text-gray-600 text-xs mt-1">Game #{entry.gameId.toString()}</p>
      </div>
      <button
        onClick={() => handleUpvote(entry.id)}
        disabled={!isConnected || votingId !== null}
        className="shrink-0 flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-600/30 transition-colors disabled:opacity-40"
        title={
          costWei
            ? `Upvote for $0.02 (~${formatEther(costWei as bigint).slice(0, 10)} ETH)`
            : "Upvote"
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

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <h2 className="text-amber-400 text-lg font-bold text-center mb-4 tracking-wide">
        Best of the Banker
      </h2>
      <div className="space-y-3">
        {loadingAll && showAll
          ? topEntries.map(renderQuote)
          : displayEntries.map(renderQuote)}
      </div>
      {hasMore && (
        <div className="text-center mt-4">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-amber-400/80 hover:text-amber-400 text-sm transition-colors"
          >
            {loadingAll
              ? "Loading..."
              : showAll
                ? "Show Top 5"
                : `View All Quotes (${totalQuotes})`}
          </button>
        </div>
      )}
      {costWei && (
        <p className="text-gray-600 text-xs text-center mt-3">
          Upvote costs $0.02 (~{formatEther(costWei as bigint).slice(0, 10)} ETH) via Chainlink Price Feed
        </p>
      )}
    </div>
  );
}
