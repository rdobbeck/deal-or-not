"use client";

import { centsToUsd, formatWei, dealQualityPercent, qualityColor, qualityLabel } from "@/lib/utils";

interface BankerOfferProps {
  offerCents: bigint;
  offerWei?: bigint;
  remainingValues: bigint[];
  onAccept: () => void;
  onReject: () => void;
  isPending: boolean;
  jackpotCents?: bigint;
  bankerMessage?: string;
}

export default function BankerOffer({
  offerCents,
  offerWei,
  remainingValues,
  onAccept,
  onReject,
  isPending,
  jackpotCents,
  bankerMessage,
}: BankerOfferProps) {
  const quality = dealQualityPercent(offerCents, remainingValues);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-gray-900 border-2 border-amber-500 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl shadow-amber-500/20">
        <h2 className="text-amber-400 text-center text-sm uppercase tracking-[0.2em] mb-4">
          The Banker is Calling...
        </h2>

        {/* AI Banker message */}
        <div className="bg-gray-800/60 border border-amber-700/30 rounded-lg p-3 mb-4">
          {bankerMessage ? (
            <p className="text-amber-200 text-sm italic text-center leading-relaxed">
              &ldquo;{bankerMessage}&rdquo;
            </p>
          ) : (
            <p className="text-amber-200/50 text-sm italic text-center animate-pulse">
              The Banker is composing a message...
            </p>
          )}
        </div>

        {/* Offer amount */}
        <div className="text-center mb-6">
          <p className="text-white text-5xl font-bold mb-1">
            {centsToUsd(offerCents)}
          </p>
          {offerWei && (
            <p className="text-gray-400 text-sm">~{formatWei(offerWei)}</p>
          )}
        </div>

        {/* Deal quality indicator */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Deal Quality</span>
            <span className={qualityColor(quality)}>
              {quality}% of EV — {qualityLabel(quality)}
            </span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                quality >= 90
                  ? "bg-green-500"
                  : quality >= 70
                  ? "bg-yellow-500"
                  : quality >= 50
                  ? "bg-orange-500"
                  : "bg-red-500"
              }`}
              style={{ width: `${Math.min(quality, 100)}%` }}
            />
          </div>
        </div>

        {/* Jackpot warning */}
        {jackpotCents !== undefined && jackpotCents > 0n && (
          <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl p-3 mb-4 text-center">
            <p className="text-amber-400 text-sm">
              Jackpot if you go all the way:{" "}
              <span className="font-bold text-amber-300">{centsToUsd(jackpotCents)}</span>
            </p>
            <p className="text-amber-600 text-xs mt-1">
              Deal now and you forfeit the jackpot
            </p>
          </div>
        )}

        {/* DEAL / NO DEAL buttons */}
        <div className="flex gap-4">
          <button
            className="flex-1 bg-gradient-to-b from-green-500 to-green-700 hover:from-green-400 hover:to-green-600 text-white font-bold py-4 px-6 rounded-xl text-xl transition-all shadow-lg shadow-green-500/20 disabled:opacity-50"
            onClick={onAccept}
            disabled={isPending}
          >
            DEAL
          </button>
          <button
            className="flex-1 bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white font-bold py-4 px-6 rounded-xl text-xl transition-all shadow-lg shadow-red-500/20 disabled:opacity-50"
            onClick={onReject}
            disabled={isPending}
          >
            NO DEAL
          </button>
        </div>
      </div>
    </div>
  );
}
