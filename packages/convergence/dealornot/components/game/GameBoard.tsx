"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useBalance, usePublicClient, useSwitchChain } from "wagmi";
import {
  useGameState,
  useNextGameId,
  useRemainingPool,
  useBankerOfferCalc,
  useCentsToWei,
  useJackpot,
  useJackpotClaimed,
  useGameSponsor,
  useEntryFee,
} from "@/hooks/useGameContract";
import { useWriteContract } from "wagmi";
import { DEAL_OR_NOT_ABI } from "@/lib/abi";
import { SPONSOR_JACKPOT_ABI } from "@/lib/sponsorAbi";
import { CONTRACT_ADDRESS, SPONSOR_JACKPOT_ADDRESS, CHAIN_ID } from "@/lib/config";
import { isSpokeChain } from "@/lib/chains";
import CrossChainJoin from "./CrossChainJoin";
import { Phase } from "@/types/game";
import GameStatus from "./GameStatus";
import BriefcaseRow from "./BriefcaseRow";
import ValueBoard from "./ValueBoard";
import CommitReveal from "./CommitReveal";
import BankerOffer from "./BankerOffer";
import FinalDecision from "./FinalDecision";
import GameOver from "./GameOver";
import VideoWait from "./VideoWait";
import JackpotDisplay from "./JackpotDisplay";
import BankerMessageBubble from "./BankerMessageBubble";
import EventLog from "./EventLog";
import { useBankerMessage } from "@/hooks/useBankerMessage";
import { centsToUsd } from "@/lib/utils";
import {
  GlassBriefcase,
  GlassBriefcaseGrid,
  GlassBankerOffer,
  GlassGameStatus,
  GlassButton,
  GlassCard,
} from "../glass";

const EMPTY_OPENED = [false, false, false, false, false] as const;
const EMPTY_VALUES = [0n, 0n, 0n, 0n, 0n] as const;

const contractConfig = {
  address: CONTRACT_ADDRESS,
  abi: DEAL_OR_NOT_ABI,
} as const;

export default function GameBoard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const publicClient = usePublicClient();
  const isWrongChain = isConnected && chainId !== CHAIN_ID;

  const [gameId, setGameId] = useState<bigint | undefined>(undefined);
  const [joinInput, setJoinInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [spectatorMode, setSpectatorMode] = useState(false);
  const [showBankerOfferModal, setShowBankerOfferModal] = useState(false);
  const [bankerOfferDismissed, setBankerOfferDismissed] = useState(false);

  const { gameState, refetch } = useGameState(gameId);
  const { nextGameId } = useNextGameId();
  const { remainingValues } = useRemainingPool(gameId);
  const { writeContractAsync } = useWriteContract();

  // Jackpot + sponsor state
  const { jackpotCents } = useJackpot(gameId);
  const jackpotClaimed = useJackpotClaimed(gameId);
  const sponsorInfo = useGameSponsor(gameId);

  // Entry fee for convergence's payable createGame
  const { withSlippage: entryFeeWei } = useEntryFee();

  // Banker message from AI
  const bankerMessage = useBankerMessage(gameId);

  // Show banker offer modal when phase changes to BankerOffer
  useEffect(() => {
    if (gameState?.phase === Phase.BankerOffer) {
      setShowBankerOfferModal(true);
      setBankerOfferDismissed(false); // Reset dismiss on new offer
    }
  }, [gameState?.phase]);

  // Calculate banker offer when in AwaitingOffer phase
  const isAwaitingOffer = gameState?.phase === Phase.AwaitingOffer;
  const calculatedOffer = useBankerOfferCalc(gameId, isAwaitingOffer ?? false);
  const offerWei = useCentsToWei(gameId, gameState?.bankerOffer);
  const payoutWei = useCentsToWei(gameId, gameState?.finalPayout);

  // Build eliminated values set from case values
  const eliminatedValues = new Set<number>();
  if (gameState) {
    for (let i = 0; i < 5; i++) {
      if (gameState.opened[i] && gameState.caseValues[i] > 0n) {
        eliminatedValues.add(Number(gameState.caseValues[i]));
      }
    }
  }

  /** Write + wait for receipt + refetch game state */
  const sendTx = async (
    functionName: string,
    args?: readonly unknown[],
  ) => {
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName,
        args,
      } as Parameters<typeof writeContractAsync>[0]);
      // Wait for receipt
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
      return hash;
    } catch (e: unknown) {
      setError(parseContractError(e));
      throw e;
    } finally {
      setTxPending(false);
    }
  };

  function parseContractError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("User rejected") || msg.includes("user rejected")) return "Transaction rejected";
    if (msg.includes("NotPlayer")) return "Not your game — your wallet is not the player";
    if (msg.includes("NotHost")) return "Not your game — your wallet is not the host";
    if (msg.includes("NotAllowedBanker")) return "Not an allowed banker for this game";
    if (msg.includes("WrongPhase")) return "Wrong phase — the game is not in the expected state";
    if (msg.includes("CannotOpenOwnCase")) return "You cannot open your own case";
    if (msg.includes("CaseAlreadyOpened")) return "That case is already opened";
    if (msg.includes("InvalidCase")) return "Invalid case index";
    if (msg.includes("NotCREForwarder")) return "Not authorized — only the CRE enclave can call this";
    if (msg.includes("InvalidValue")) return "Invalid value — not in the remaining pool";
    // Fallback: trim to something readable
    const short = msg.replace(/^.*reason:\s*/i, "").replace(/\n.*/s, "");
    return short.slice(0, 150) || "Transaction failed";
  }

  // ── Handlers ──

  const handleCreateGame = async () => {
    try {
      const currentNextId = nextGameId ?? 0n;
      setError(null);
      setTxPending(true);
      const hash = await writeContractAsync({
        ...contractConfig,
        functionName: "createGame",
        value: entryFeeWei,
      });
      setGameId(currentNextId);
      if (publicClient) {
        publicClient.waitForTransactionReceipt({ hash }).finally(() => {
          setTxPending(false);
        });
      } else {
        setTxPending(false);
      }
    } catch (e: unknown) {
      setError(parseContractError(e));
      setTxPending(false);
    }
  };

  const handleJoinGame = () => {
    if (!joinInput) return;
    setGameId(BigInt(joinInput));
  };

  const handlePickCase = async (index: number) => {
    if (gameId === undefined) return;
    try {
      await sendTx("pickCase", [gameId, index]);
    } catch {}
  };

  const handleOpenCase = async (caseIndex: number) => {
    if (gameId === undefined) return;
    try {
      await sendTx("openCase", [gameId, caseIndex]);
    } catch {}
  };

  const handleRingBanker = async () => {
    if (gameId === undefined || calculatedOffer === undefined) return;
    try {
      await sendTx("setBankerOffer", [gameId, calculatedOffer]);
    } catch {}
  };

  const handleAcceptDeal = async () => {
    if (gameId === undefined) return;
    setShowBankerOfferModal(false);
    try { await sendTx("acceptDeal", [gameId]); } catch {}
  };

  const handleRejectDeal = async () => {
    if (gameId === undefined) return;
    setShowBankerOfferModal(false);
    try { await sendTx("rejectDeal", [gameId]); } catch {}
  };

  const handleKeepCase = async () => {
    if (gameId === undefined) return;
    try { await sendTx("keepCase", [gameId]); } catch {}
  };

  const handleSwapCase = async () => {
    if (gameId === undefined) return;
    try { await sendTx("swapCase", [gameId]); } catch {}
  };

  const handlePlayAgain = () => {
    setGameId(undefined);
    setError(null);
    setSpectatorMode(false);
  };

  const handleClaimJackpot = async () => {
    if (gameId === undefined) return;
    setError(null);
    setTxPending(true);
    try {
      const hash = await writeContractAsync({
        address: SPONSOR_JACKPOT_ADDRESS,
        abi: SPONSOR_JACKPOT_ABI,
        functionName: "claimJackpot",
        args: [gameId],
      });
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }
      await refetch();
    } catch (e: unknown) {
      setError(parseContractError(e));
    } finally {
      setTxPending(false);
    }
  };

  // ── Render ──

  if (!mounted) {
    return (
      <div className="text-center py-20">
        <div className="animate-spin h-10 w-10 border-4 border-white/40 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!isConnected && !spectatorMode) {
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-8">
        <GlassCard className="p-8 space-y-6 gold-glow">
          <p className="text-yellow-500/40 text-xs uppercase tracking-[0.2em] font-bold">
            Ladies and Gentlemen
          </p>
          <p className="text-white/80 text-xl font-bold">
            Connect your wallet to enter the stage.
          </p>
          <p className="text-white/30 text-sm italic">
            The Banker is watching. He has no feelings and infinite patience.
          </p>
          <button
            onClick={() => connect({ connector: connectors[0] })}
            className="gold-pulse w-full py-4 text-lg font-black uppercase tracking-wider rounded-xl
                       bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                       text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                       transition-all duration-300 hover:scale-105 active:scale-95
                       shadow-[0_0_30px_rgba(255,215,0,0.3)]"
          >
            Connect Wallet
          </button>
        </GlassCard>

        <div className="text-white/30 text-sm">or watch someone else suffer</div>
        <div className="flex gap-2 max-w-xs mx-auto">
          <input
            type="number"
            placeholder="Game ID"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && joinInput) {
                setGameId(BigInt(joinInput));
                setSpectatorMode(true);
              }
            }}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-white/40 focus:outline-none backdrop-blur-md"
          />
          <GlassButton
            variant="strong"
            onClick={() => {
              if (joinInput) {
                setGameId(BigInt(joinInput));
                setSpectatorMode(true);
              }
            }}
          >
            Watch
          </GlassButton>
        </div>
      </div>
    );
  }

  if (isWrongChain && !spectatorMode) {
    // Spoke chain (ETH Sepolia) — offer cross-chain bridge join
    if (chainId && isSpokeChain(chainId)) {
      return (
        <div className="max-w-lg mx-auto py-10 space-y-8">
          <CrossChainJoin />

          <div className="text-center space-y-4">
            <div className="text-white/30 text-sm">or switch to the home chain</div>
            <GlassButton
              variant="regular"
              size="md"
              onClick={() => switchChain({ chainId: CHAIN_ID })}
            >
              Switch to Base Sepolia
            </GlassButton>
          </div>

          <div className="text-center">
            <button
              onClick={() => disconnect()}
              className="text-white/30 text-xs hover:text-white/60 transition-colors"
            >
              Disconnect
            </button>
          </div>
        </div>
      );
    }

    // Unsupported chain — prompt to switch
    return (
      <div className="max-w-md mx-auto text-center py-12 space-y-6">
        <GlassCard className="p-8 space-y-6 border-red-500/30">
          <p className="text-red-400 text-xs uppercase tracking-widest font-bold">
            Wrong Stage
          </p>
          <p className="text-white/80 text-lg font-bold">
            You&apos;re on the wrong chain, contestant.
          </p>
          <p className="text-white/40 text-sm">
            The game show is on Base Sepolia. This is NOT where the cases are.
            The Banker is tapping his watch.
          </p>
          <GlassButton
            variant="prominent"
            size="lg"
            className="w-full"
            onClick={() => switchChain({ chainId: CHAIN_ID })}
          >
            Switch to Base Sepolia
          </GlassButton>
          <button
            onClick={() => disconnect()}
            className="text-white/30 text-xs hover:text-white/60 transition-colors"
          >
            Disconnect
          </button>
        </GlassCard>
      </div>
    );
  }

  // Lobby — no active game (only for connected users)
  if (gameId === undefined && !spectatorMode) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 space-y-8">
        <div>
          <GlassCard className="p-3 inline-block mb-4">
            <p className="text-white/50 text-sm">
              {address && <span className="text-xs font-mono">{address.slice(0, 6)}...{address.slice(-4)}</span>}
              {balance && <span className="text-yellow-500/60"> &middot; {(Number(balance.value) / 1e18).toFixed(4)} ETH</span>}
            </p>
          </GlassCard>
          <p className="text-white/30 text-xs uppercase tracking-widest">
            The stage is yours, contestant.
          </p>
        </div>

        <button
          onClick={handleCreateGame}
          disabled={txPending}
          className="gold-pulse w-full py-5 text-xl font-black uppercase tracking-wider rounded-xl
                     bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                     text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                     transition-all duration-300 hover:scale-105 active:scale-95
                     shadow-[0_0_30px_rgba(255,215,0,0.3)]
                     disabled:opacity-50 disabled:hover:scale-100"
        >
          {txPending ? "Creating Game..." : "New Game"}
        </button>

        <div className="text-white/30 text-sm">or crash someone else&apos;s show</div>

        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Game ID"
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-white/40 focus:outline-none backdrop-blur-md"
          />
          <GlassButton
            variant="prominent"
            tint="blue"
            onClick={handleJoinGame}
          >
            Join
          </GlassButton>
        </div>

        {error && (
          <GlassCard className="p-3 bg-red-500/10 border-red-500/30">
            <p className="text-red-400 text-sm">{error}</p>
          </GlassCard>
        )}

        <button
          onClick={() => disconnect()}
          className="text-white/30 text-xs hover:text-white/60 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Loading game state
  if (!gameState) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="animate-spin h-10 w-10 border-4 border-white/40 border-t-transparent rounded-full mx-auto" />
        <p className="text-white/60">Consulting the blockchain oracle...</p>
        <p className="text-white/30 text-xs italic" title="it's just math">(it&apos;s just math)</p>
      </div>
    );
  }

  // Shouldn't happen, but satisfies TS narrowing
  if (gameId === undefined) return null;

  // ── Active Game ──
  const phase = gameState.phase;
  const isPlayer = !spectatorMode && address?.toLowerCase() === gameState.player.toLowerCase();

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-8">
      {spectatorMode && (
        <GlassCard className="flex items-center justify-between px-4 py-2" tint="blue">
          <span className="text-blue-400 text-sm">
            You&apos;re watching game #{gameId?.toString()}. The Banker knows.
          </span>
          <GlassButton size="sm" variant="regular" onClick={handlePlayAgain}>
            Exit
          </GlassButton>
        </GlassCard>
      )}

      <GlassGameStatus
        phase={phase.toString()}
        round={gameState.currentRound}
        maxRounds={4}
        playerAddress={isPlayer ? gameState.player : undefined}
        onClick={phase === Phase.BankerOffer && bankerOfferDismissed ? () => setBankerOfferDismissed(false) : undefined}
      />

      {/* Jackpot display — shown during active gameplay */}
      {jackpotCents !== undefined && jackpotCents > 0n && phase !== Phase.GameOver && (
        <JackpotDisplay
          jackpotCents={jackpotCents}
          sponsorName={sponsorInfo?.name}
          sponsorLogo={sponsorInfo?.logoUrl}
        />
      )}

      {/* Phase: WaitingForVRF — video plays while VRF seed arrives */}
      {phase === Phase.WaitingForVRF && (
        <VideoWait
          message="Quantum seed incoming..."
          submessage="Chainlink VRF is generating your game's randomness"
        />
      )}

      {/* Phase: Created — pick your case */}
      {phase === Phase.Created && (
        <div className="text-center space-y-6">
          <GlassCard className="p-6 mb-4">
            <p className="text-white/90 text-xl font-semibold">
              Choose a briefcase to keep as yours
            </p>
          </GlassCard>

          <GlassBriefcaseGrid columns={5}>
            {[0, 1, 2, 3, 4].map((caseIndex) => (
              <GlassBriefcase
                key={caseIndex}
                caseNumber={caseIndex}
                opened={false}
                playerCase={false}
                disabled={txPending}
                onClick={() => handlePickCase(caseIndex)}
              />
            ))}
          </GlassBriefcaseGrid>

          {txPending && (
            <p className="text-amber-400 animate-pulse">Picking case...</p>
          )}
        </div>
      )}

      {/* Phase: Round / WaitingForCRE — open case (1 TX, CRE handles the rest) */}
      {(phase === Phase.Round || phase === Phase.WaitingForCRE) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <CommitReveal
              gameState={gameState}
              gameId={gameId}
              onOpenCase={handleOpenCase}
              isPending={txPending}
            />
          </div>
        </div>
      )}

      {/* Phase: AwaitingOffer — ring the banker */}
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
                Waiting for CRE AI Banker response...
              </div>
              <p className="text-gray-500 text-sm">
                The AI Banker (Gemini 2.5 Flash) is computing your offer via CRE Confidential Compute.
              </p>
              {calculatedOffer !== undefined && (
                <>
                  <div className="border-t border-gray-700 pt-3 mt-3">
                    <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">
                      Manual fallback
                    </p>
                    <p className="text-gray-400 text-sm">
                      On-chain offer:{" "}
                      <span className="text-amber-300 font-bold">
                        {centsToUsd(calculatedOffer)}
                      </span>
                    </p>
                  </div>
                  <button
                    className="bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium py-2 px-6 rounded-lg text-sm transition-all disabled:opacity-50"
                    onClick={handleRingBanker}
                    disabled={txPending}
                  >
                    {txPending ? "Calling..." : "Skip AI — Use On-Chain Offer"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Phase: BankerOffer — DEAL or NO DEAL */}
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

          {/* Glass Banker Offer Modal with AI message */}
          <GlassBankerOffer
            offer={Number(gameState.bankerOffer)}
            expectedValue={remainingValues
              ? remainingValues.reduce((sum, val) => sum + Number(val), 0) / remainingValues.length
              : Number(gameState.bankerOffer)}
            round={gameState.currentRound}
            quip={bankerMessage ?? undefined}
            onDeal={handleAcceptDeal}
            onNoDeal={handleRejectDeal}
            isOpen={showBankerOfferModal && !bankerOfferDismissed}
            seed={gameId}
            spectatorMode={spectatorMode}
            onDismiss={() => setBankerOfferDismissed(true)}
          />

          {/* Spectator: reopen pill when banker offer is dismissed */}
          {spectatorMode && bankerOfferDismissed && showBankerOfferModal && (
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

      {/* Phase: FinalRound / WaitingForFinalCRE */}
      {(phase === Phase.FinalRound || phase === Phase.WaitingForFinalCRE) && (
        <div className="flex gap-8 justify-center items-start">
          <ValueBoard eliminatedValues={eliminatedValues} />
          <div className="flex-1">
            <FinalDecision
              gameState={gameState}
              gameId={gameId}
              onKeepCase={handleKeepCase}
              onSwapCase={handleSwapCase}
              isPending={txPending}
            />
          </div>
        </div>
      )}

      {/* Phase: GameOver */}
      {phase === Phase.GameOver && (
        <GameOver
          gameState={gameState}
          payoutWei={payoutWei}
          onPlayAgain={handlePlayAgain}
          jackpotCents={jackpotCents}
          jackpotClaimed={jackpotClaimed}
          onClaimJackpot={handleClaimJackpot}
          claimPending={txPending}
          sponsorName={sponsorInfo?.name}
        />
      )}

      {/* Event Log — visible in spectator mode or always for observer */}
      {gameId !== undefined && (
        <EventLog gameId={gameId} />
      )}

      {/* Error display */}
      {error && (
        <p className="text-red-400 text-sm text-center bg-red-900/20 border border-red-700/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Pending indicator */}
      {txPending && (
        <p className="text-amber-400 text-sm text-center animate-pulse">
          Transaction pending...
        </p>
      )}
    </div>
  );
}
