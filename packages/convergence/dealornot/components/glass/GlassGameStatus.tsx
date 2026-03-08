"use client";

import { motion } from "framer-motion";
import { cn, getGlassClasses } from "@/lib/glass";

/**
 * GlassGameStatus
 * Display game phase and round information with glass styling
 */

interface GlassGameStatusProps {
  phase: string;
  round?: number;
  maxRounds?: number;
  playerAddress?: string;
  className?: string;
  onClick?: () => void;
}

export function GlassGameStatus({
  phase,
  round,
  maxRounds = 4,
  playerAddress,
  className,
  onClick,
}: GlassGameStatusProps) {
  const getPhaseColor = () => {
    if (phase.includes("Waiting")) return undefined;
    if (phase.includes("Round")) return "blue";
    if (phase.includes("Banker")) return "yellow";
    if (phase.includes("GameOver")) return "green";
    return undefined;
  };

  const getPhaseText = () => {
    if (phase.includes("WaitingForVRF") || phase === "0") return "Shuffling cases...";
    if (phase.includes("Created") || phase === "1") return "Game ready!";
    if (phase.includes("Round") || phase === "2") return `Round ${(round ?? 0) + 1} of ${maxRounds}`;
    if (phase.includes("WaitingForCRE") || phase === "3") return "Opening case...";
    if (phase.includes("AwaitingOffer") || phase === "4") return "Banker is thinking...";
    if (phase.includes("BankerOffer") || phase === "5") return "Banker's Offer!";
    if (phase.includes("FinalRound") || phase === "6") return "Final Round!";
    if (phase.includes("WaitingForFinalCRE") || phase === "7") return "Revealing case...";
    if (phase.includes("GameOver") || phase === "8") return "Game Over!";
    return phase;
  };

  return (
    <motion.div
      className={cn(
        getGlassClasses("regular", "card", false, getPhaseColor()),
        "p-6 space-y-3",
        onClick && "cursor-pointer hover:ring-1 hover:ring-yellow-400/40 transition-shadow",
        className
      )}
      layout
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
      }}
      onClick={onClick}
    >
      {/* Phase indicator */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-sm text-white/60 uppercase tracking-wider">
            Game Status
          </div>
          <div className="text-2xl font-bold text-white">
            {getPhaseText()}
          </div>
        </div>

        {/* Animated status dot */}
        {phase.includes("Waiting") && (
          <motion.div
            className="w-4 h-4 rounded-full bg-yellow-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </div>

      {/* Round progress bar */}
      {round !== undefined && maxRounds && (() => {
        const isComplete = phase.includes("GameOver") || phase === "8";
        const isFinal = phase.includes("Final") || phase === "6" || phase === "7";
        const displayRound = isComplete || isFinal ? maxRounds : round + 1;
        return (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-white/60">
              <span>Progress</span>
              <span>{displayRound} / {maxRounds}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className={cn(
                  "h-full bg-gradient-to-r",
                  isComplete ? "from-green-500 to-emerald-400" : "from-blue-500 to-purple-500"
                )}
                initial={{ width: 0 }}
                animate={{ width: `${(displayRound / maxRounds) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
          </div>
        );
      })()}

      {/* Player info */}
      {playerAddress && (
        <div className="text-xs text-white/50">
          Player: {playerAddress.slice(0, 6)}...{playerAddress.slice(-4)}
        </div>
      )}
    </motion.div>
  );
}

/**
 * GlassExpectedValue
 * Display current expected value with trend indicator
 */

interface GlassExpectedValueProps {
  currentEV: number; // In cents
  initialEV: number; // In cents
  className?: string;
}

export function GlassExpectedValue({
  currentEV,
  initialEV,
  className,
}: GlassExpectedValueProps) {
  const percentChange = initialEV > 0
    ? ((currentEV - initialEV) / initialEV) * 100
    : 0;
  const isPositive = percentChange >= 0;

  return (
    <motion.div
      className={cn(
        getGlassClasses("strong", "card", false),
        "p-6 space-y-2",
        className
      )}
      layout
    >
      <div className="text-sm text-white/60 uppercase tracking-wider">
        Expected Value
      </div>

      <div className="flex items-baseline gap-2">
        <motion.div
          className="text-4xl font-bold text-white"
          key={currentEV}
          initial={{ scale: 1.2, color: "rgb(250, 204, 21)" }}
          animate={{ scale: 1, color: "rgb(255, 255, 255)" }}
          transition={{ duration: 0.3 }}
        >
          ${(currentEV / 100).toFixed(2)}
        </motion.div>

        {/* Trend indicator */}
        <div className={cn(
          "text-sm font-medium",
          isPositive ? "text-green-400" : "text-red-400"
        )}>
          {isPositive ? "↑" : "↓"} {Math.abs(percentChange).toFixed(1)}%
        </div>
      </div>

      <div className="text-xs text-white/50">
        Started at ${(initialEV / 100).toFixed(2)}
      </div>
    </motion.div>
  );
}
