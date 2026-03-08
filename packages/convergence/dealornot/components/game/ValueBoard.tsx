"use client";

import { CASE_VALUES_CENTS } from "@/types/game";
import { centsToUsd } from "@/lib/utils";

interface ValueBoardProps {
  /** Cent values that have been revealed/collapsed */
  eliminatedValues: Set<number>;
}

export default function ValueBoard({ eliminatedValues }: ValueBoardProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs text-gray-500 uppercase tracking-wider text-center mb-1">
        Prize Values
      </h3>
      {CASE_VALUES_CENTS.map((cents) => {
        const eliminated = eliminatedValues.has(cents);
        const isHigh = cents >= 50;
        return (
          <div
            key={cents}
            className={`px-4 py-1.5 rounded-lg text-sm font-mono text-right transition-all duration-500 ${
              eliminated
                ? "bg-gray-800/30 text-gray-600 line-through opacity-40 scale-95"
                : isHigh
                ? "bg-amber-900/40 text-amber-300 border border-amber-700/50"
                : "bg-blue-900/40 text-blue-300 border border-blue-700/50"
            }`}
          >
            {centsToUsd(cents)}
          </div>
        );
      })}
    </div>
  );
}
