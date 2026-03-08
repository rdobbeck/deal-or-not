"use client";

import { useState } from "react";
import { useAccount, useChainId, useWriteContract, useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { sepolia, baseSepolia } from "wagmi/chains";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/glass";
import { CHAIN_CONTRACTS, CCIP_EXPLORER_URL, isSpokeChain } from "@/lib/chains";
import { GlassButton } from "@/components/glass";

// Gateway ABI — just the functions we need
const GATEWAY_ABI = [
  {
    name: "enterGame",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
  },
  {
    name: "estimateCost",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "entryFeeWei", type: "uint256" },
      { name: "ccipFeeWei", type: "uint256" },
      { name: "totalWei", type: "uint256" },
    ],
  },
  {
    name: "ENTRY_FEE_CENTS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type BridgeState = "idle" | "estimating" | "confirming" | "bridging" | "success" | "error";

export default function CrossChainJoin({ gameId: gameIdProp }: { gameId?: number }) {
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const [bridgeState, setBridgeState] = useState<BridgeState>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [gameIdInput, setGameIdInput] = useState(gameIdProp?.toString() ?? "");

  const gameId = gameIdProp ?? (gameIdInput ? Number(gameIdInput) : undefined);
  const gatewayAddress = CHAIN_CONTRACTS[sepolia.id]?.gateway;

  // Estimate cost from Gateway contract
  const { data: costEstimate } = useReadContract({
    address: gatewayAddress,
    abi: GATEWAY_ABI,
    functionName: "estimateCost",
    args: gameId !== undefined ? [BigInt(gameId)] : undefined,
    chainId: sepolia.id,
    query: { enabled: isSpokeChain(chainId) && gameId !== undefined },
  });

  const { writeContractAsync } = useWriteContract();

  // Wait for TX receipt before showing success
  const { isSuccess: txConfirmed, isError: txFailed } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
    chainId: sepolia.id,
  });

  // Update bridge state based on TX receipt
  if (txConfirmed && bridgeState === "bridging") {
    setBridgeState("success");
  }
  if (txFailed && bridgeState === "bridging") {
    setBridgeState("error");
    setErrorMsg("Transaction failed on-chain");
  }

  // Only render on spoke chains (ETH Sepolia)
  if (!isSpokeChain(chainId)) return null;

  const entryFeeWei = costEstimate?.[0];
  const ccipFeeWei = costEstimate?.[1];
  const totalWei = costEstimate?.[2];

  async function handleBridge() {
    if (!gatewayAddress || !totalWei || gameId === undefined) return;

    try {
      setBridgeState("confirming");
      setErrorMsg(null);

      const hash = await writeContractAsync({
        address: gatewayAddress,
        abi: GATEWAY_ABI,
        functionName: "enterGame",
        args: [BigInt(gameId)],
        value: totalWei + (totalWei / 20n), // +5% buffer for gas fluctuation
        chainId: sepolia.id,
      });

      setTxHash(hash);
      setBridgeState("bridging");
      // TX receipt handled by useWaitForTransactionReceipt above
    } catch (err: unknown) {
      setBridgeState("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-xl border border-[#00f0ff]/20 bg-black/60 backdrop-blur-xl"
    >
      {/* Scan line overlay */}
      <div className="absolute inset-0 crt-overlay pointer-events-none" />

      {/* Header bar */}
      <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-[#00f0ff]/10 bg-[#00f0ff]/5">
        <div className="flex items-center gap-2">
          <span className="signal-text text-[0.65rem] font-bold tracking-[0.15em] uppercase">
            CCIP BRIDGE
          </span>
          <span className="broadcast-live">ACTIVE</span>
        </div>
        {gameIdProp !== undefined ? (
          <span className="text-white/20 text-[0.6rem] font-mono">
            GAME #{gameId}
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-white/20 text-[0.6rem] font-mono">GAME #</span>
            <input
              type="number"
              placeholder="ID"
              value={gameIdInput}
              onChange={(e) => setGameIdInput(e.target.value)}
              className="w-16 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[0.6rem] text-white/60 font-mono focus:border-[#00f0ff]/40 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Bridge visualization */}
      <div className="relative px-4 py-5">
        {/* Source → Destination */}
        <div className="flex items-center gap-3 mb-5">
          {/* Source chain */}
          <div className="flex-1 p-3 rounded-lg border border-[#627eea]/30 bg-[#627eea]/5">
            <div className="text-[0.6rem] text-white/30 tracking-[0.15em] uppercase mb-1">FROM</div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#627eea]/20 border border-[#627eea]/40 flex items-center justify-center">
                <span className="text-[0.55rem] font-bold text-[#a5b4fc]">E</span>
              </div>
              <div>
                <div className="text-xs font-bold text-[#a5b4fc]">ETH Sepolia</div>
                <div className="text-[0.6rem] text-white/20 font-mono">{chainId}</div>
              </div>
            </div>
          </div>

          {/* Animated bridge */}
          <div className="flex flex-col items-center gap-1 px-2">
            <div className="relative w-16 h-[2px] bg-white/10 overflow-hidden rounded">
              <motion.div
                className="absolute inset-y-0 w-6 bg-gradient-to-r from-transparent via-[#00f0ff] to-transparent"
                animate={{ x: [-24, 64] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <span className="text-[0.5rem] text-[#00f0ff]/50 tracking-widest">CCIP</span>
          </div>

          {/* Destination chain */}
          <div className="flex-1 p-3 rounded-lg border border-[#0052ff]/30 bg-[#0052ff]/5">
            <div className="text-[0.6rem] text-white/30 tracking-[0.15em] uppercase mb-1">TO</div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#0052ff]/20 border border-[#0052ff]/40 flex items-center justify-center">
                <span className="text-[0.55rem] font-bold text-[#4da3ff]">B</span>
              </div>
              <div>
                <div className="text-xs font-bold text-[#4da3ff]">Base Sepolia</div>
                <div className="text-[0.6rem] text-white/20 font-mono">{baseSepolia.id}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Fee breakdown — terminal style */}
        <div className="mb-4 p-3 rounded-lg bg-black/40 border border-white/5 font-mono text-[0.65rem]">
          <div className="flex justify-between mb-1">
            <span className="text-white/30">ENTRY_FEE</span>
            <span className="terminal-text">
              {entryFeeWei ? `${Number(formatEther(entryFeeWei)).toFixed(6)} ETH` : "..."}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-white/30">CCIP_GAS</span>
            <span className="signal-text">
              {ccipFeeWei ? `${Number(formatEther(ccipFeeWei)).toFixed(6)} ETH` : "..."}
            </span>
          </div>
          <div className="h-[1px] bg-white/10 my-1.5" />
          <div className="flex justify-between font-bold">
            <span className="text-white/50">TOTAL</span>
            <span className="text-white">
              {totalWei ? `${Number(formatEther(totalWei)).toFixed(6)} ETH` : "---"}
            </span>
          </div>
          <div className="text-right text-white/20 text-[0.55rem] mt-0.5">
            ~ $0.25 + gas
          </div>
        </div>

        {/* Action button */}
        <AnimatePresence mode="wait">
          {bridgeState === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button
                onClick={handleBridge}
                disabled={!isConnected || !totalWei || gameId === undefined}
                className={cn(
                  "w-full py-3 rounded-lg font-bold text-sm tracking-[0.1em] uppercase transition-all duration-200",
                  "border",
                  isConnected && totalWei && gameId !== undefined
                    ? "bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#00f0ff] hover:bg-[#00f0ff]/20 hover:border-[#00f0ff]/60"
                    : "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
                )}
                style={
                  isConnected && totalWei && gameId !== undefined
                    ? { textShadow: "0 0 10px rgba(0,240,255,0.4)" }
                    : undefined
                }
              >
                {!isConnected ? "CONNECT WALLET FIRST" : gameId === undefined ? "ENTER GAME ID" : !totalWei ? "ESTIMATING..." : "BRIDGE & JOIN GAME"}
              </button>
            </motion.div>
          )}

          {bridgeState === "confirming" && (
            <motion.div
              key="confirming"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-3"
            >
              <div className="text-[#ffd700] text-xs font-bold tracking-[0.1em] animate-pulse">
                CONFIRM IN WALLET...
              </div>
            </motion.div>
          )}

          {bridgeState === "bridging" && (
            <motion.div
              key="bridging"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-3 space-y-2"
            >
              <div className="signal-text text-xs font-bold tracking-[0.1em] animate-pulse">
                BRIDGING VIA CCIP...
              </div>
              <div className="text-white/20 text-[0.6rem]">
                ~2 min for cross-chain confirmation
              </div>
              {txHash && (
                <a
                  href={`${CCIP_EXPLORER_URL}/#/side-drawer/msg/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-[0.6rem] text-[#00f0ff]/60 hover:text-[#00f0ff] transition-colors underline"
                >
                  TRACK ON CCIP EXPLORER
                </a>
              )}
            </motion.div>
          )}

          {bridgeState === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-3 space-y-2"
            >
              <div className="terminal-text text-xs font-bold tracking-[0.1em]">
                BRIDGE TX CONFIRMED
              </div>
              <div className="text-white/30 text-[0.6rem]">
                Switch to Base Sepolia to play your game
              </div>
              {txHash && (
                <div className="hex-addr text-[0.55rem] break-all opacity-50 mt-1">
                  TX: {txHash}
                </div>
              )}
            </motion.div>
          )}

          {bridgeState === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-3 space-y-2"
            >
              <div className="text-[#ff1744] text-xs font-bold tracking-[0.1em]">
                BRIDGE FAILED
              </div>
              {errorMsg && (
                <div className="text-white/30 text-[0.55rem] break-all max-h-12 overflow-y-auto">
                  {errorMsg}
                </div>
              )}
              <button
                onClick={() => { setBridgeState("idle"); setErrorMsg(null); }}
                className="text-[0.65rem] text-[#00f0ff]/60 hover:text-[#00f0ff] underline transition-colors"
              >
                TRY AGAIN
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom status bar */}
      <div className="relative flex items-center justify-between px-4 py-1.5 border-t border-white/5 bg-white/[0.02]">
        <span className="text-[0.55rem] text-white/15 font-mono">
          CHAINLINK CCIP v1.5
        </span>
        <div className="flex items-center gap-1.5">
          <span className="signal-bars">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="bar" style={{ opacity: i <= 3 ? 1 : 0.2 }} />
            ))}
          </span>
          <span className="text-[0.55rem] text-white/15 font-mono">
            {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "NO WALLET"}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
