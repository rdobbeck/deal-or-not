import { formatEther } from "viem";

export function centsToUsd(cents: number | bigint): string {
  const n = Number(cents) / 100;
  return `$${n.toFixed(2)}`;
}

export function formatWei(wei: bigint): string {
  return `${Number(formatEther(wei)).toFixed(6)} ETH`;
}

/** Deal quality as percentage of EV (100 = fair) */
export function dealQualityPercent(offerCents: bigint, remainingValues: bigint[]): number {
  if (remainingValues.length === 0) return 0;
  const sum = remainingValues.reduce((a, b) => a + b, 0n);
  const ev = sum / BigInt(remainingValues.length);
  if (ev === 0n) return 0;
  return Number((offerCents * 100n) / ev);
}

export function qualityColor(percent: number): string {
  if (percent >= 90) return "text-green-400";
  if (percent >= 70) return "text-yellow-400";
  if (percent >= 50) return "text-orange-400";
  return "text-red-400";
}

export function qualityLabel(percent: number): string {
  if (percent >= 90) return "Excellent";
  if (percent >= 70) return "Good";
  if (percent >= 50) return "Fair";
  if (percent >= 30) return "Poor";
  return "Terrible";
}
