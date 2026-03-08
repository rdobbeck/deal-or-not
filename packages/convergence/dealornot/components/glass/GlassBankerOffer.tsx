"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { cn, getGlassClasses } from "@/lib/glass";
import { GlassButton } from "./GlassButton";
import RotatingAd from "@/components/RotatingAd";

const BANKER_FALLBACKS = [
  "Make your choice wisely...",
  "The numbers don't lie. But I might.",
  "Every case you don't open is a mystery I enjoy.",
  "Tick tock. The offer won't improve with age.",
];

function BankerQuip({ quip }: { quip?: string }) {
  const [showFallback, setShowFallback] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (quip) {
      setShowFallback(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    timerRef.current = setTimeout(() => setShowFallback(true), 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [quip]);

  const text = quip ?? (showFallback ? BANKER_FALLBACKS[Math.floor(Math.random() * BANKER_FALLBACKS.length)] : null);

  return (
    <motion.div
      className={cn(getGlassClasses("subtle", "rounded", false), "p-4 text-center")}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      {text ? (
        <>
          <p className="text-lg text-white/90 italic">"{text}"</p>
          <p className="text-xs text-white/50 mt-2">— The Banker {quip ? "(AI)" : ""}</p>
        </>
      ) : (
        <p className="text-white/50 italic animate-pulse">The Banker is composing a message...</p>
      )}
    </motion.div>
  );
}

/**
 * GlassBankerOffer
 * Dramatic banker offer modal with countdown and animations
 *
 * Features:
 * - Glass morphism overlay
 * - Offer reveal animation
 * - Quality meter (offer vs EV)
 * - AI Banker quip display
 * - Deal/No Deal buttons
 */

interface GlassBankerOfferProps {
  offer: number; // In cents
  expectedValue: number; // In cents
  round: number;
  quip?: string; // AI Banker's one-liner
  reasoning?: string; // AI Banker's strategy
  onDeal: () => void;
  onNoDeal: () => void;
  isOpen: boolean;
  seed?: bigint;
  spectatorMode?: boolean; // When true, show X to dismiss + reopen pill
  onDismiss?: () => void; // Called when spectator closes modal
}

export function GlassBankerOffer({
  offer,
  expectedValue,
  round,
  quip,
  reasoning,
  onDeal,
  onNoDeal,
  isOpen,
  seed,
  spectatorMode = false,
  onDismiss,
}: GlassBankerOfferProps) {
  const [showOffer, setShowOffer] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (!isOpen) {
      setShowOffer(false);
      setCountdown(3);
      return;
    }

    // Countdown before showing offer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setTimeout(() => setShowOffer(true), 200);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Calculate offer quality (10000 = 100%)
  const quality = expectedValue > 0 ? (offer / expectedValue) * 100 : 0;

  const getQualityColor = () => {
    if (quality >= 90) return "green";
    if (quality >= 75) return "yellow";
    if (quality >= 60) return "yellow";
    return "red";
  };

  const getQualityText = () => {
    if (quality >= 90) return "EXCELLENT OFFER";
    if (quality >= 75) return "GOOD OFFER";
    if (quality >= 60) return "FAIR OFFER";
    return "LOW OFFER";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className={cn(
              getGlassClasses("strong", "card", false),
              "relative max-w-2xl w-full p-8 space-y-6"
            )}
            initial={{ scale: 0.8, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: 50, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
            }}
          >
            {/* Close button — always visible for spectators, hidden for players */}
            {spectatorMode && onDismiss && (
              <button
                onClick={onDismiss}
                className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/20 hover:border-white/40 text-white/60 hover:text-white transition-all duration-200"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}

            {/* Title */}
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-bold text-white">
                THE BANKER'S OFFER
              </h2>
              <p className="text-white/70">Round {round + 1} of 4</p>
            </div>

            {/* Countdown or Offer */}
            {!showOffer ? (
              <motion.div
                className="text-center py-6 space-y-6"
                key="countdown"
              >
                <motion.div
                  className="text-9xl font-bold text-white"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  {countdown > 0 ? countdown : "..."}
                </motion.div>
                <RotatingAd variant="break" seed={seed} />
              </motion.div>
            ) : (
              <motion.div
                className="space-y-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                key="offer"
              >
                {/* Offer Amount */}
                <div className="text-center">
                  <motion.div
                    className="text-7xl font-bold text-white"
                    initial={{ scale: 0.5 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 10,
                    }}
                  >
                    ${(offer / 100).toFixed(2)}
                  </motion.div>
                </div>

                {/* Quality Meter */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-white/70">
                    <span>Expected Value: ${(expectedValue / 100).toFixed(2)}</span>
                    <span className={cn(
                      "font-bold",
                      quality >= 75 && "text-green-400",
                      quality < 75 && quality >= 60 && "text-yellow-400",
                      quality < 60 && "text-red-400"
                    )}>
                      {getQualityText()}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={cn(
                        "h-full",
                        getQualityColor() === "green" && "bg-green-500",
                        getQualityColor() === "yellow" && "bg-yellow-500",
                        getQualityColor() === "red" && "bg-red-500"
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(quality, 100)}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>

                  <div className="text-center text-white/70 text-sm">
                    Offer is {quality.toFixed(0)}% of expected value
                  </div>
                </div>

                {/* AI Banker Quip */}
                <BankerQuip quip={quip} />

                {/* AI Reasoning (collapsible) */}
                {reasoning && (
                  <details className="text-sm text-white/60">
                    <summary className="cursor-pointer hover:text-white/80">
                      View AI Reasoning
                    </summary>
                    <p className="mt-2 pl-4 border-l-2 border-white/20">
                      {reasoning}
                    </p>
                  </details>
                )}

                {/* Decision Buttons */}
                {spectatorMode ? (
                  <div className="pt-4 space-y-4">
                    <p className="text-center text-white/40 text-sm italic">
                      Waiting for the player to decide...
                    </p>
                    <div className="flex items-center justify-center gap-4 text-2xl font-black tracking-wider">
                      <span className="text-green-400" style={{ textShadow: "0 0 12px rgba(74,222,128,0.4)" }}>DEAL</span>
                      <span className="text-white/20 text-base font-light italic">or</span>
                      <span className="text-red-400" style={{ textShadow: "0 0 12px rgba(248,113,113,0.4)" }}>NOT</span>
                    </div>
                    {onDismiss && (
                      <GlassButton
                        variant="regular"
                        size="md"
                        onClick={onDismiss}
                        className="w-full text-sm"
                      >
                        Close &amp; Keep Watching
                      </GlassButton>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 pt-4">
                    <GlassButton
                      variant="prominent"
                      tint="green"
                      size="lg"
                      onClick={onDeal}
                      className="font-bold text-xl"
                    >
                      DEAL!
                    </GlassButton>

                    <GlassButton
                      variant="prominent"
                      tint="red"
                      size="lg"
                      onClick={onNoDeal}
                      className="font-bold text-xl"
                    >
                      NO DEAL!
                    </GlassButton>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
