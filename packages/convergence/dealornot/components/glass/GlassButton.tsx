"use client";

import { motion } from "framer-motion";
import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn, getGlassClasses } from "@/lib/glass";

/**
 * GlassButton
 * Equivalent to SwiftUI's .buttonStyle(.glass)
 *
 * Interactive glass button with hover and press states
 */

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "regular" | "strong" | "prominent";
  tint?: "blue" | "green" | "red" | "yellow" | "purple";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function GlassButton({
  children,
  variant = "regular",
  tint,
  size = "md",
  className,
  disabled,
  onClick,
  type,
  ...props
}: GlassButtonProps) {
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <motion.button
      className={cn(
        getGlassClasses(
          variant === "prominent" ? "strong" : variant,
          "rounded",
          true,
          tint
        ),
        sizes[size],
        "font-semibold text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "prominent" && "bg-white/20 border-white/40",
        className
      )}
      whileHover={disabled ? undefined : { scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 17,
      }}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </motion.button>
  );
}

/**
 * GlassIconButton
 * Square or circular glass button for icons
 */

interface GlassIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "regular" | "strong";
  tint?: "blue" | "green" | "red" | "yellow" | "purple";
  shape?: "square" | "circle";
  className?: string;
}

export function GlassIconButton({
  children,
  variant = "regular",
  tint,
  shape = "circle",
  className,
  disabled,
  onClick,
  type,
}: GlassIconButtonProps) {
  return (
    <motion.button
      className={cn(
        getGlassClasses(
          variant,
          shape === "circle" ? "capsule" : "rounded",
          true,
          tint
        ),
        "w-12 h-12 flex items-center justify-center",
        "font-semibold text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      whileHover={disabled ? undefined : { scale: 1.1 }}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      transition={{
        type: "spring",
        stiffness: 400,
        damping: 17,
      }}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </motion.button>
  );
}
