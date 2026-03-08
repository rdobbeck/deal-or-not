// Glass Morphism Utilities
// Inspired by Apple's Liquid Glass design system, adapted for web

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Glass effect CSS properties
 * Translates iOS .glassEffect() to web backdrop-filter
 */
export const glassEffects = {
  regular: {
    background: "rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(10px) saturate(180%)",
    WebkitBackdropFilter: "blur(10px) saturate(180%)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
  },
  strong: {
    background: "rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(20px) saturate(200%)",
    WebkitBackdropFilter: "blur(20px) saturate(200%)",
    border: "1px solid rgba(255, 255, 255, 0.3)",
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.5)",
  },
  subtle: {
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(5px) saturate(150%)",
    WebkitBackdropFilter: "blur(5px) saturate(150%)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "0 4px 16px 0 rgba(0, 0, 0, 0.2)",
  },
} as const;

/**
 * Tinted glass effects
 */
export function tintedGlass(color: string, opacity = 0.1) {
  return {
    background: `${color}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`,
    backdropFilter: "blur(10px) saturate(180%)",
    WebkitBackdropFilter: "blur(10px) saturate(180%)",
    border: `1px solid ${color}33`,
    boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
  };
}

/**
 * Glass Tailwind classes
 * Use these for quick glass effects
 */
export const glassClasses = {
  // Base glass with backdrop blur
  base: "bg-white/10 backdrop-blur-md backdrop-saturate-[180%] border border-white/20 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]",

  // Interactive glass (hover states)
  interactive: "transition-all duration-200 hover:bg-white/15 hover:border-white/30 hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.45)] active:scale-[0.98]",

  // Shape variants
  capsule: "rounded-full",
  rounded: "rounded-2xl",
  card: "rounded-xl",

  // Tinted variants
  blue: "bg-blue-500/10 border-blue-500/30",
  green: "bg-green-500/10 border-green-500/30",
  red: "bg-red-500/10 border-red-500/30",
  yellow: "bg-yellow-500/10 border-yellow-500/30",
  purple: "bg-purple-500/10 border-purple-500/30",
} as const;

/**
 * Get glass classes based on variant
 */
export function getGlassClasses(
  variant: "regular" | "strong" | "subtle" = "regular",
  shape: "rounded" | "capsule" | "card" = "rounded",
  interactive = false,
  tint?: keyof typeof glassClasses
) {
  return cn(
    glassClasses.base,
    variant === "strong" && "backdrop-blur-xl",
    variant === "subtle" && "backdrop-blur-sm bg-white/5 border-white/10",
    glassClasses[shape],
    interactive && glassClasses.interactive,
    tint && glassClasses[tint]
  );
}

/**
 * Animation presets for glass morphing
 */
export const glassAnimations = {
  // Morphing transition (like iOS .glassEffectID)
  morph: {
    layout: true,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
  },

  // Fade in glass effect
  fadeIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },

  // Interactive hover/press
  interactive: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 17,
    },
  },

  // Slide in from bottom
  slideIn: {
    initial: { y: 100, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: 100, opacity: 0 },
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 20,
    },
  },
} as const;
