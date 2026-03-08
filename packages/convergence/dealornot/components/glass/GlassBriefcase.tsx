"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { cn, getGlassClasses } from "@/lib/glass";

/**
 * GlassBriefcase
 * Animated briefcase card for Deal or NOT!
 *
 * Features:
 * - Glass morphism design
 * - Morphing transitions when opened
 * - Tinted when player's case (blue) or revealed (green/red based on value)
 * - Interactive hover effects
 */

interface GlassBriefcaseProps {
  caseNumber: number;
  value?: number | null; // Value in cents (null = unrevealed, undefined = not opened yet)
  opened: boolean;
  playerCase: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function GlassBriefcase({
  caseNumber,
  value,
  opened,
  playerCase,
  disabled = false,
  onClick,
  className,
}: GlassBriefcaseProps) {
  const [isFlipping, setIsFlipping] = useState(false);

  // Determine tint based on state
  const getTint = () => {
    if (playerCase) return "blue";
    if (opened && value !== null && value !== undefined) {
      // High values = green, low values = red
      if (value >= 50) return "green";
      if (value <= 5) return "red";
      return "yellow";
    }
    return undefined;
  };

  const handleClick = () => {
    if (disabled || !onClick) return;
    setIsFlipping(true);
    setTimeout(() => setIsFlipping(false), 600);
    onClick();
  };

  return (
    <motion.div
      className={cn(
        getGlassClasses("regular", "card", !disabled, getTint()),
        "relative overflow-hidden cursor-pointer select-none",
        "min-h-[140px] p-6 flex flex-col items-center justify-center",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      layoutId={`briefcase-${caseNumber}`}
      onClick={handleClick}
      whileHover={disabled ? undefined : { scale: 1.05, y: -5 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      animate={isFlipping ? { rotateY: 360 } : undefined}
      transition={{
        type: "spring",
        stiffness: 260,
        damping: 20,
      }}
    >
      {/* Case Number (always visible) */}
      <div className="text-6xl font-bold text-white/90 mb-2">
        {caseNumber}
      </div>

      {/* Status indicator */}
      <div className="text-sm font-medium text-white/70">
        {playerCase && "YOUR CASE"}
        {!playerCase && !opened && "UNOPENED"}
        {!playerCase && opened && value === null && "REVEALING..."}
      </div>

      {/* Value reveal animation */}
      <AnimatePresence>
        {opened && value !== null && value !== undefined && (
          <motion.div
            className="mt-3 text-3xl font-bold text-white"
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 15,
            }}
          >
            ${(value / 100).toFixed(2)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sparkle effect for high values */}
      <AnimatePresence>
        {opened && value !== null && value !== undefined && value >= 50 && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-green-400/20 blur-xl" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opened indicator */}
      {opened && (
        <div className="absolute top-2 right-2">
          <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
        </div>
      )}

      {/* Player case indicator */}
      {playerCase && !opened && (
        <div className="absolute -top-1 -right-1 w-8 h-8">
          <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75" />
          <div className="relative w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
            YOU
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * GlassBriefcaseGrid
 * Layout component for briefcases
 */

interface GlassBriefcaseGridProps {
  children: React.ReactNode;
  columns?: number;
  className?: string;
}

export function GlassBriefcaseGrid({
  children,
  columns = 5,
  className,
}: GlassBriefcaseGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 5 && "grid-cols-5",
        columns === 3 && "grid-cols-3",
        columns === 2 && "grid-cols-2",
        "auto-rows-fr",
        className
      )}
    >
      {children}
    </div>
  );
}
