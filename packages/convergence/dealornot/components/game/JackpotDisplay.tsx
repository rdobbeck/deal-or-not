"use client";

import { useEffect, useRef, useState } from "react";
import { centsToUsd } from "@/lib/utils";

interface JackpotDisplayProps {
  jackpotCents: bigint;
  sponsorName?: string;
  sponsorLogo?: string;
  compact?: boolean;
}

export default function JackpotDisplay({
  jackpotCents,
  sponsorName,
  sponsorLogo,
  compact,
}: JackpotDisplayProps) {
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(jackpotCents);

  const displayName = sponsorName || "Chainlink";

  // Flash animation when jackpot increases
  useEffect(() => {
    if (jackpotCents > prevRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      return () => clearTimeout(t);
    }
    prevRef.current = jackpotCents;
  }, [jackpotCents]);

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-500 ${
          flash
            ? "bg-amber-500/20 border-amber-400 shadow-lg shadow-amber-500/30"
            : "bg-gray-800/50 border-gray-700"
        }`}
      >
        <span className="text-gray-400 text-xs uppercase tracking-wider">Jackpot</span>
        <span className={`font-bold transition-colors duration-500 ${flash ? "text-amber-300" : "text-white"}`}>
          {centsToUsd(jackpotCents)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all duration-700 ${
        flash
          ? "border-amber-400 bg-amber-900/30 shadow-xl shadow-amber-500/20"
          : "border-gray-700 bg-gray-800/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {sponsorLogo && (
            <img
              src={sponsorLogo}
              alt={displayName}
              className="w-6 h-6 rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          )}
          <div className={`${!sponsorLogo ? "ml-5" : ""}`}>
            <p className="text-gray-400 text-xs uppercase tracking-[0.15em]">
              Sponsored by {displayName}
            </p>
            <p className={`text-2xl font-bold transition-all duration-500 ${flash ? "text-amber-300 scale-105" : "text-white"}`}>
              Jackpot: {centsToUsd(jackpotCents)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`w-2 h-2 rounded-full inline-block mr-1 ${flash ? "bg-amber-400 animate-ping" : "bg-green-500"}`} />
          <p className="text-gray-500 text-xs inline">CRE Live</p>
        </div>
      </div>
      {jackpotCents > 0n && (
        <p className="text-gray-500 text-xs mt-2 ml-5">
          Go all the way to win the jackpot
        </p>
      )}
    </div>
  );
}
