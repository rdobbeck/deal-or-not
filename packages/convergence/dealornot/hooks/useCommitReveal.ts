"use client";

import { useCallback } from "react";
import { keccak256, encodePacked } from "viem";

interface StoredCommit {
  data: string; // hex-encoded packed data used for hash
  salt: string; // bigint as string
}

function generateSalt(): bigint {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return BigInt(
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

function storageKey(gameId: bigint, round: number | "final"): string {
  return `dond-commit-${gameId}-${round}`;
}

export function useCommitReveal() {
  /** Generate commit for opening a case: keccak256(caseIndex, salt) */
  const commitCase = useCallback(
    (gameId: bigint, round: number, caseIndex: number) => {
      const salt = generateSalt();
      const hash = keccak256(
        encodePacked(["uint8", "uint256"], [caseIndex, salt])
      );
      const commitHash = BigInt(hash);

      localStorage.setItem(
        storageKey(gameId, round),
        JSON.stringify({ data: `case-${caseIndex}`, salt: salt.toString() })
      );

      return { salt, commitHash, caseIndex };
    },
    []
  );

  /** Generate commit for final decision: keccak256(swap, salt) */
  const commitFinal = useCallback((gameId: bigint, swap: boolean) => {
    const salt = generateSalt();
    const hash = keccak256(encodePacked(["bool", "uint256"], [swap, salt]));
    const commitHash = BigInt(hash);

    localStorage.setItem(
      storageKey(gameId, "final"),
      JSON.stringify({ data: `swap-${swap}`, salt: salt.toString() })
    );

    return { salt, commitHash, swap };
  }, []);

  /** Retrieve stored commit for a round */
  const getCommit = useCallback(
    (gameId: bigint, round: number | "final"): StoredCommit | null => {
      try {
        const stored = localStorage.getItem(storageKey(gameId, round));
        if (!stored) return null;
        return JSON.parse(stored) as StoredCommit;
      } catch {
        return null;
      }
    },
    []
  );

  /** Get salt as bigint for reveal */
  const getSalt = useCallback(
    (gameId: bigint, round: number | "final"): bigint | null => {
      const commit = getCommit(gameId, round);
      if (!commit) return null;
      return BigInt(commit.salt);
    },
    [getCommit]
  );

  /** Get case index from stored commit */
  const getStoredCaseIndex = useCallback(
    (gameId: bigint, round: number): number | null => {
      const commit = getCommit(gameId, round);
      if (!commit || !commit.data.startsWith("case-")) return null;
      return parseInt(commit.data.split("-")[1], 10);
    },
    [getCommit]
  );

  /** Get swap decision from stored commit */
  const getStoredSwap = useCallback(
    (gameId: bigint): boolean | null => {
      const commit = getCommit(gameId, "final");
      if (!commit || !commit.data.startsWith("swap-")) return null;
      return commit.data === "swap-true";
    },
    [getCommit]
  );

  /** Clear commit after successful reveal */
  const clearCommit = useCallback(
    (gameId: bigint, round: number | "final") => {
      localStorage.removeItem(storageKey(gameId, round));
    },
    []
  );

  return {
    commitCase,
    commitFinal,
    getSalt,
    getStoredCaseIndex,
    getStoredSwap,
    clearCommit,
  };
}
