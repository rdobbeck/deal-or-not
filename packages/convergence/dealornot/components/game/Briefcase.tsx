"use client";

import { centsToUsd } from "@/lib/utils";

interface BriefcaseProps {
  index: number;
  isOpened: boolean;
  isPlayerCase: boolean;
  value?: bigint;
  onClick?: () => void;
  disabled?: boolean;
  selectMode?: boolean;
}

export default function Briefcase({
  index,
  isOpened,
  isPlayerCase,
  value,
  onClick,
  disabled,
  selectMode,
}: BriefcaseProps) {
  const base =
    "w-24 h-28 rounded-xl flex flex-col items-center justify-center font-bold transition-all duration-300 select-none";

  if (isOpened && !isPlayerCase) {
    return (
      <div
        className={`${base} bg-gray-800/50 text-gray-500 border-2 border-gray-700 opacity-60`}
      >
        <span className="text-xs text-gray-600">#{index}</span>
        {value !== undefined && value > 0n && (
          <span className="text-sm text-amber-400/70 mt-1">
            {centsToUsd(value)}
          </span>
        )}
      </div>
    );
  }

  if (isPlayerCase) {
    return (
      <div
        className={`${base} bg-gradient-to-b from-amber-500 to-amber-700 text-white border-2 border-amber-300 shadow-lg shadow-amber-500/30`}
      >
        <span className="text-2xl">{index}</span>
        <span className="text-[10px] uppercase tracking-widest mt-1">
          Yours
        </span>
        {isOpened && value !== undefined && value > 0n && (
          <span className="text-xs mt-0.5">{centsToUsd(value)}</span>
        )}
      </div>
    );
  }

  // Clickable / quantum state
  return (
    <button
      className={`${base} ${
        disabled
          ? "bg-gray-700 text-gray-400 border-2 border-gray-600 cursor-not-allowed"
          : selectMode
          ? "bg-gradient-to-b from-purple-600 to-purple-800 text-white border-2 border-purple-400 hover:from-purple-500 hover:to-purple-700 hover:scale-105 active:scale-95 cursor-pointer"
          : "bg-gradient-to-b from-blue-600 to-blue-800 text-white border-2 border-blue-400 hover:from-blue-500 hover:to-blue-700 hover:scale-105 active:scale-95 cursor-pointer"
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span className="text-2xl">{index}</span>
      {!disabled && (
        <span className="text-[9px] uppercase tracking-wider mt-1 opacity-70">
          {selectMode ? "Select" : "Open"}
        </span>
      )}
    </button>
  );
}
