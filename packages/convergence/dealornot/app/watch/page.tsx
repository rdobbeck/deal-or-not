"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GlassCard, GlassButton } from "@/components/glass";
import { useNextGameId } from "@/hooks/useGameContract";

export default function WatchLobby() {
  const [gameId, setGameId] = useState("");
  const router = useRouter();
  const { nextGameId } = useNextGameId();

  const latestGameId = nextGameId ? Number(nextGameId) - 1 : null;

  const handleWatch = () => {
    if (gameId) router.push(`/watch/${gameId}`);
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Header */}
        <div>
          <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-3 font-bold">
            Live from Base Sepolia
          </p>
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tight mb-3">
            <span className="gold-text">The Audience</span>
          </h1>
          <p className="text-white/40 text-sm">
            Watch a game unfold in real time. The Banker knows you&apos;re here.
          </p>
        </div>

        {/* Game ID Input */}
        <GlassCard className="p-8 space-y-6 gold-glow">
          <div>
            <p className="text-white/60 text-sm font-semibold mb-4 uppercase tracking-wider">
              Enter a Game ID
            </p>
            <div className="flex gap-3">
              <input
                type="number"
                placeholder="e.g. 28"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleWatch()}
                className="flex-1 bg-white/10 border border-white/20 rounded-xl px-5 py-4 text-white text-lg text-center font-bold
                           focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20
                           backdrop-blur-md placeholder:text-white/20"
              />
              <button
                onClick={handleWatch}
                disabled={!gameId}
                className="gold-pulse px-8 py-4 text-lg font-black uppercase tracking-wider rounded-xl
                           bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                           text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                           transition-all duration-300 hover:scale-105 active:scale-95
                           shadow-[0_0_30px_rgba(255,215,0,0.3)]
                           disabled:opacity-30 disabled:hover:scale-100 disabled:cursor-not-allowed"
              >
                Watch
              </button>
            </div>
          </div>

          {/* Quick pick: latest game */}
          {latestGameId !== null && latestGameId >= 0 && (
            <div className="border-t border-white/10 pt-4">
              <p className="text-white/30 text-xs uppercase tracking-wider mb-3">
                or jump to the latest
              </p>
              <button
                onClick={() => router.push(`/watch/${latestGameId}`)}
                className="group flex items-center justify-center gap-3 w-full py-3 px-4 rounded-xl
                           bg-white/5 border border-white/10 hover:border-yellow-500/30 hover:bg-white/10
                           transition-all duration-300"
              >
                <span className="text-white/60 group-hover:text-yellow-400 transition-colors font-bold text-lg">
                  Game #{latestGameId}
                </span>
                <span className="text-white/20 text-sm">&rarr;</span>
              </button>
            </div>
          )}
        </GlassCard>

        {/* Flavor text */}
        <p className="text-white/15 text-xs italic">
          &ldquo;The audience sees everything. The Banker sees more.&rdquo;
        </p>
      </div>
    </main>
  );
}
