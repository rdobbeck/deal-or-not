"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn, getGlassClasses } from "@/lib/glass";
import { GlassButton } from "./GlassButton";

/**
 * GlassFloatingActionBar
 * Floating action bar for game controls
 *
 * Features:
 * - Sticks to bottom of screen
 * - Morphs based on available actions
 * - Smooth entrance/exit animations
 */

interface Action {
  label: string;
  onClick: () => void;
  variant?: "regular" | "strong" | "prominent";
  tint?: "blue" | "green" | "red" | "yellow" | "purple";
  disabled?: boolean;
}

interface GlassFloatingActionBarProps {
  actions: Action[];
  message?: string;
  className?: string;
}

export function GlassFloatingActionBar({
  actions,
  message,
  className,
}: GlassFloatingActionBarProps) {
  const hasActions = actions.length > 0;

  return (
    <AnimatePresence>
      {hasActions && (
        <motion.div
          className={cn(
            "fixed bottom-8 left-1/2 -translate-x-1/2 z-40",
            "w-full max-w-2xl px-4",
            className
          )}
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
        >
          <div
            className={cn(
              getGlassClasses("strong", "card", false),
              "p-4 space-y-3"
            )}
          >
            {/* Message */}
            {message && (
              <motion.div
                className="text-center text-white/80 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {message}
              </motion.div>
            )}

            {/* Action buttons */}
            <div className={cn(
              "grid gap-3",
              actions.length === 1 && "grid-cols-1",
              actions.length === 2 && "grid-cols-2",
              actions.length >= 3 && "grid-cols-3"
            )}>
              {actions.map((action, index) => (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <GlassButton
                    variant={action.variant ?? "prominent"}
                    tint={action.tint}
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className="w-full"
                  >
                    {action.label}
                  </GlassButton>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * GlassInstructionBanner
 * Top banner for instructions and tips
 */

interface GlassInstructionBannerProps {
  instruction: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export function GlassInstructionBanner({
  instruction,
  dismissible = false,
  onDismiss,
  className,
}: GlassInstructionBannerProps) {
  return (
    <motion.div
      className={cn(
        getGlassClasses("subtle", "rounded", false),
        "p-4 flex items-center justify-between",
        className
      )}
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -20, opacity: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
      }}
    >
      <div className="flex-1 text-white/80 text-sm">
        {instruction}
      </div>

      {dismissible && onDismiss && (
        <motion.button
          className="ml-4 text-white/60 hover:text-white/90 transition-colors"
          onClick={onDismiss}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          ✕
        </motion.button>
      )}
    </motion.div>
  );
}
