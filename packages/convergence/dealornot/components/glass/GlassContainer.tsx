"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { cn, getGlassClasses } from "@/lib/glass";

/**
 * GlassContainer
 * Equivalent to SwiftUI's GlassEffectContainer
 *
 * Wraps multiple glass elements for proper blending and morphing transitions.
 * The spacing prop controls when effects merge together.
 */

interface GlassContainerProps {
  children: ReactNode;
  className?: string;
  spacing?: number; // Controls when glass effects merge (in pixels)
  variant?: "regular" | "strong" | "subtle";
}

export function GlassContainer({
  children,
  className,
  spacing = 40,
  variant = "regular",
}: GlassContainerProps) {
  return (
    <div
      className={cn("relative", className)}
      style={{
        // Container doesn't have glass itself
        // Children have individual glass effects
        gap: `${spacing}px`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * GlassCard
 * Basic glass card component
 */

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "regular" | "strong" | "subtle";
  shape?: "rounded" | "capsule" | "card";
  interactive?: boolean;
  tint?: "blue" | "green" | "red" | "yellow" | "purple";
  onClick?: () => void;
}

export function GlassCard({
  children,
  className,
  variant = "regular",
  shape = "card",
  interactive = false,
  tint,
  onClick,
}: GlassCardProps) {
  const Component = interactive || onClick ? motion.div : "div";

  return (
    <Component
      className={cn(
        getGlassClasses(variant, shape, interactive, tint),
        className
      )}
      onClick={onClick}
      {...(interactive && {
        whileHover: { scale: 1.02 },
        whileTap: { scale: 0.98 },
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 17,
        },
      })}
    >
      {children}
    </Component>
  );
}
