"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { SPONSOR_ADS } from "@/lib/ads";
import type { SponsorAd } from "@/types/game";

function seededShuffle(arr: SponsorAd[], seed: bigint): SponsorAd[] {
  const shuffled = [...arr];
  let s = Number(seed % 2147483647n) || 1;
  for (let i = shuffled.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const VARIANTS = {
  sidebar: {
    interval: 5000,
    fadeDuration: 300,
    randomStart: false,
    className: "rounded-xl border-2 border-yellow-500/40 p-3 shadow-[0_0_12px_rgba(255,215,0,0.15)] hover:shadow-[0_0_20px_rgba(255,215,0,0.3)] hover:border-yellow-400/70",
    textSize: "text-sm",
    taglineSize: "text-xs",
    logoSize: 20,
    header: "Sponsored by absolutely no one",
    footer: null as string | null,
  },
  break: {
    interval: 6000,
    fadeDuration: 400,
    randomStart: true,
    className: "rounded-2xl border-2 border-yellow-500/50 p-6 shadow-[0_0_25px_rgba(255,215,0,0.2),inset_0_1px_0_rgba(255,215,0,0.1)] hover:shadow-[0_0_40px_rgba(255,215,0,0.35)] hover:border-yellow-400/80",
    textSize: "text-xl",
    taglineSize: "text-sm",
    logoSize: 32,
    header: "Commercial Break \u2014 The Banker Will Return",
    footer: "This ad is not real. Neither is the Banker\u2019s empathy.",
  },
} as const;

interface RotatingAdProps {
  variant: keyof typeof VARIANTS;
  ads?: SponsorAd[];
  seed?: bigint;
}

export default function RotatingAd({ variant, ads = SPONSOR_ADS, seed }: RotatingAdProps) {
  const config = VARIANTS[variant];
  const shuffledAds = useMemo(
    () => (seed ? seededShuffle(ads, seed) : ads),
    [ads, seed]
  );
  const [index, setIndex] = useState(() =>
    config.randomStart ? Math.floor(Math.random() * shuffledAds.length) : 0
  );
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % shuffledAds.length);
        setFade(true);
      }, config.fadeDuration);
    }, config.interval);
    return () => clearInterval(interval);
  }, [shuffledAds.length, config.fadeDuration, config.interval]);

  const ad = shuffledAds[index];
  return (
    <a
      href={ad.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full bg-gradient-to-r ${ad.bg} text-center
                  transition-all duration-300 hover:scale-[1.01]
                  ${config.className}
                  ${fade ? "opacity-100" : "opacity-0"}`}
    >
      <p className="text-yellow-500/50 text-[10px] uppercase tracking-[0.2em] mb-1">
        {config.header}
      </p>
      <div className="flex items-center justify-center gap-2">
        {ad.logo && (
          <Image src={ad.logo} alt="" width={config.logoSize} height={config.logoSize} className="rounded-sm" />
        )}
        <p className={`text-white/90 font-black ${config.textSize}`}>{ad.text}</p>
      </div>
      <p className={`text-white/40 ${config.taglineSize} italic mt-0.5`}>{ad.tagline}</p>
      {config.footer && (
        <p className="text-yellow-500/30 text-[9px] uppercase tracking-widest mt-2">
          {config.footer}
        </p>
      )}
    </a>
  );
}
