"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useGameState,
  useRemainingPool,
  useCentsToWei,
  useJackpot,
  useJackpotClaimed,
  useGameSponsor,
} from "@/hooks/useGameContract";
import { useBankerMessage } from "@/hooks/useBankerMessage";
import { Phase } from "@/types/game";
import GameStatus from "@/components/game/GameStatus";
import BriefcaseRow from "@/components/game/BriefcaseRow";
import CommitReveal from "@/components/game/CommitReveal";
import ValueBoard from "@/components/game/ValueBoard";
import FinalDecision from "@/components/game/FinalDecision";
import GameOver from "@/components/game/GameOver";
import VideoWait from "@/components/game/VideoWait";
import JackpotDisplay from "@/components/game/JackpotDisplay";
import EventLog from "@/components/game/EventLog";
import {
  GlassBriefcase,
  GlassBriefcaseGrid,
  GlassBankerOffer,
  GlassGameStatus,
  GlassButton,
  GlassCard,
} from "@/components/glass";
import { centsToUsd } from "@/lib/utils";
import RotatingAd from "@/components/RotatingAd";

export default function WatchGame({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const gameId = BigInt(id);

  const { gameState, refetch } = useGameState(gameId);
  const { remainingValues } = useRemainingPool(gameId);
  const bankerMessage = useBankerMessage(gameId);
  const { jackpotCents } = useJackpot(gameId);
  const jackpotClaimed = useJackpotClaimed(gameId);
  const sponsorInfo = useGameSponsor(gameId);
  const payoutWei = useCentsToWei(gameId, gameState?.finalPayout);

  const [showBankerOfferModal, setShowBankerOfferModal] = useState(false);
  const [bankerOfferDismissed, setBankerOfferDismissed] = useState(false);

  useEffect(() => {
    if (gameState?.phase === Phase.BankerOffer) {
      setShowBankerOfferModal(true);
      setBankerOfferDismissed(false);
    }
  }, [gameState?.phase]);

  const eliminatedValues = new Set<number>();
  if (gameState) {
    for (let i = 0; i < 5; i++) {
      if (gameState.opened[i] && gameState.caseValues[i] > 0n) {
        eliminatedValues.add(Number(gameState.caseValues[i]));
      }
    }
  }

  if (!gameState) {
    return (
      <main className="min-h-[80vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin h-10 w-10 border-4 border-white/40 border-t-transparent rounded-full mx-auto" />
          <p className="text-white/60">Tuning into game #{id}...</p>
          <p className="text-white/20 text-xs italic">The Banker is adjusting his tie.</p>
        </div>
      </main>
    );
  }

  const phase = gameState.phase;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* Main game area */}
        <div className="flex-1 space-y-6">
          {/* Spectator bar */}
          <GlassCard className="flex items-center justify-between px-4 py-3" tint="blue">
            <div className="flex items-center gap-3">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-blue-300 text-sm font-bold uppercase tracking-wider">
                Live — Game #{id}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <GlassButton size="sm" variant="regular" onClick={() => { const prev = Number(id) - 1; if (prev >= 0) router.push(`/watch/${prev}`); }}>
                ◀
              </GlassButton>
              <GlassButton size="sm" variant="regular" onClick={() => router.push("/watch")}>
                Choose Game
              </GlassButton>
              <GlassButton size="sm" variant="regular" onClick={() => router.push(`/watch/${Number(id) + 1}`)}>
                ▶
              </GlassButton>
              <Link href="/">
                <GlassButton size="sm" variant="regular">
                  Exit
                </GlassButton>
              </Link>
            </div>
          </GlassCard>

          <GlassGameStatus
            phase={phase.toString()}
            round={gameState.currentRound}
            maxRounds={4}
            onClick={phase === Phase.BankerOffer && bankerOfferDismissed ? () => setBankerOfferDismissed(false) : undefined}
          />

          {jackpotCents !== undefined && jackpotCents > 0n && phase !== Phase.GameOver && (
            <JackpotDisplay
              jackpotCents={jackpotCents}
              sponsorName={sponsorInfo?.name}
              sponsorLogo={sponsorInfo?.logoUrl}
            />
          )}

          {phase === Phase.WaitingForVRF && (
            <VideoWait
              message="Quantum seed incoming..."
              submessage="Chainlink VRF is generating this game's randomness"
            />
          )}

          {phase === Phase.Created && (
            <div className="text-center space-y-6">
              <GlassCard className="p-6">
                <p className="text-white/90 text-xl font-semibold">
                  Waiting for player to pick a case...
                </p>
                <p className="text-white/30 text-sm mt-2 italic">
                  5 briefcases. Each containing between $0.01 and $1.00. Probably.
                </p>
              </GlassCard>
              <GlassBriefcaseGrid columns={5}>
                {[0, 1, 2, 3, 4].map((caseIndex) => (
                  <GlassBriefcase
                    key={caseIndex}
                    caseNumber={caseIndex}
                    opened={false}
                    playerCase={false}
                    disabled
                  />
                ))}
              </GlassBriefcaseGrid>
            </div>
          )}

          {(phase === Phase.Round || phase === Phase.WaitingForCRE) && (
            <div className="flex gap-8 justify-center items-start">
              <ValueBoard eliminatedValues={eliminatedValues} />
              <div className="flex-1">
                <CommitReveal
                  gameState={gameState}
                  gameId={gameId}
                  onOpenCase={async () => {}}
                  isPending={false}
                />
              </div>
            </div>
          )}

          {phase === Phase.AwaitingOffer && (
            <div className="flex gap-8 justify-center items-start">
              <ValueBoard eliminatedValues={eliminatedValues} />
              <div className="flex-1 text-center space-y-4">
                <BriefcaseRow
                  opened={gameState.opened}
                  playerCase={gameState.playerCase}
                  caseValues={gameState.caseValues}
                  disabled
                />
                <div className="space-y-3 pt-4">
                  <div className="animate-pulse text-amber-300 font-medium">
                    The Banker is thinking...
                  </div>
                  <p className="text-white/30 text-sm italic">
                    Gemini 2.5 Flash is crafting a psychologically devastating offer inside a CRE enclave.
                  </p>
                </div>
                <div className="pt-4">
                  <RotatingAd variant="break" seed={gameId} />
                </div>
              </div>
            </div>
          )}

          {phase === Phase.BankerOffer && (
            <>
              <div className="flex gap-8 justify-center items-start">
                <ValueBoard eliminatedValues={eliminatedValues} />
                <div className="flex-1">
                  <GlassBriefcaseGrid columns={5}>
                    {[0, 1, 2, 3, 4].map((caseIndex) => (
                      <GlassBriefcase
                        key={caseIndex}
                        caseNumber={caseIndex}
                        opened={gameState.opened[caseIndex]}
                        playerCase={gameState.playerCase === caseIndex}
                        value={gameState.opened[caseIndex] ? Number(gameState.caseValues[caseIndex]) : undefined}
                        disabled
                      />
                    ))}
                  </GlassBriefcaseGrid>
                </div>
              </div>
              <GlassBankerOffer
                offer={Number(gameState.bankerOffer)}
                expectedValue={remainingValues
                  ? remainingValues.reduce((sum, val) => sum + Number(val), 0) / remainingValues.length
                  : Number(gameState.bankerOffer)}
                round={gameState.currentRound}
                quip={bankerMessage ?? undefined}
                onDeal={async () => {}}
                onNoDeal={async () => {}}
                isOpen={showBankerOfferModal && !bankerOfferDismissed}
                seed={gameId}
                spectatorMode
                onDismiss={() => setBankerOfferDismissed(true)}
              />

              {/* Reopen pill when spectator dismissed the offer */}
              {bankerOfferDismissed && showBankerOfferModal && (
                <button
                  onClick={() => setBankerOfferDismissed(false)}
                  className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-yellow-500/30 text-yellow-400 text-sm font-bold hover:bg-black/80 hover:border-yellow-500/50 transition-all shadow-[0_0_20px_rgba(255,215,0,0.15)]"
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                  Show Banker Offer
                </button>
              )}
            </>
          )}

          {(phase === Phase.FinalRound || phase === Phase.WaitingForFinalCRE) && (
            <div className="flex gap-8 justify-center items-start">
              <ValueBoard eliminatedValues={eliminatedValues} />
              <div className="flex-1">
                <FinalDecision
                  gameState={gameState}
                  gameId={gameId}
                  onKeepCase={async () => {}}
                  onSwapCase={async () => {}}
                  isPending={false}
                />
              </div>
            </div>
          )}

          {phase === Phase.GameOver && (
            <GameOver
              gameState={gameState}
              payoutWei={payoutWei}
              onPlayAgain={() => router.push("/watch")}
              jackpotCents={jackpotCents}
              jackpotClaimed={jackpotClaimed}
              onClaimJackpot={async () => {}}
              claimPending={false}
              sponsorName={sponsorInfo?.name}
            />
          )}

          <EventLog gameId={gameId} />
        </div>

        {/* Sidebar — ads + commentary */}
        <div className="hidden lg:flex flex-col gap-4 w-64 shrink-0">
          <GlassCard className="p-4 text-center">
            <p className="text-white/30 text-[10px] uppercase tracking-widest mb-1">Audience</p>
            <p className="text-yellow-400 text-2xl font-black">1</p>
            <p className="text-white/20 text-xs">(it&apos;s you)</p>
          </GlassCard>

          <GlassCard className="p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-bold">Game Info</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/30">Host</span>
                <span className="text-white/60 font-mono text-xs">
                  {gameState.host.slice(0, 6)}...{gameState.host.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Player</span>
                <span className="text-white/60 font-mono text-xs">
                  {gameState.player.slice(0, 6)}...{gameState.player.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/30">Cases Open</span>
                <span className="text-white/60">{gameState.totalCollapsed} / 5</span>
              </div>
              {gameState.bankerOffer > 0n && (
                <div className="flex justify-between">
                  <span className="text-white/30">Last Offer</span>
                  <span className="text-yellow-400 font-bold">{centsToUsd(gameState.bankerOffer)}</span>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Rotating fake ads */}
          <RotatingAd variant="sidebar" seed={gameId} />

          <GlassCard className="p-4">
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-bold">
              Audience Commentary
            </p>
            <div className="space-y-2">
              <p className="text-white/30 text-xs italic">&ldquo;SWAP IT&rdquo; — Anonymous</p>
              <p className="text-white/30 text-xs italic">&ldquo;the banker is bluffing&rdquo; — 0xdead</p>
              <p className="text-white/30 text-xs italic">&ldquo;this is not financial advice&rdquo; — a lawyer</p>
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
