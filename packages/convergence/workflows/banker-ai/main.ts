/**
 * CRE Workflow: AI Banker (Log Trigger)
 *
 * TRIGGER: EVM Log — RoundComplete(uint256 indexed gameId, uint8 round)
 *
 * FLOW:
 *   1. Listen for RoundComplete from DealOrNotConfidential
 *   2. Read game state (remaining values, opened cases, round info)
 *   3. Compute banker offer using BankerAlgorithm logic (EV * discount)
 *   4. Call Gemini LLM for a snarky banker personality message
 *   5. Write setBankerOfferWithMessage(gameId, offerCents, message) via
 *      report → KeystoneForwarder → contract
 */

import {
  bytesToHex,
  cre,
  type EVMLog,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  keccak256,
  encodePacked,
  zeroAddress,
  type Address,
} from "viem";
import { callGemini, type GameContext } from "./gemini";

// ── Config ──

type Config = {
  contractAddress: string;
  chainSelectorName: string;
  gasLimit: string;
  geminiModel: string;
  geminiApiKey?: string;  // fallback for simulate mode (prefer Vault DON secret)
  owner?: string;         // Vault DON secret owner for Confidential HTTP
};

// ── Constants ──

const CASE_VALUES_CENTS = [1n, 5n, 10n, 50n, 100n];
const NUM_CASES = 5;

// Discount curve per round (basis points) — matches BankerAlgorithm.sol
const DISCOUNT_BPS: Record<number, bigint> = {
  0: 3000n,  // 30% — lowball
  1: 5000n,  // 50%
  2: 7000n,  // 70%
  3: 8500n,  // 85%
};

// Variance-adjusted base discount (slightly lower to compensate)
const BASE_DISCOUNT_BPS: Record<number, bigint> = {
  0: 2700n,
  1: 4600n,
  2: 6500n,
  3: 8000n,
};

// ── Banker Algorithm (TypeScript mirror of BankerAlgorithm.sol) ──

function expectedValue(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  let sum = 0n;
  for (const v of values) sum += v;
  return sum / BigInt(values.length);
}

function calculateOffer(remainingValues: bigint[], round: number, vrfSeed: bigint): bigint {
  const ev = expectedValue(remainingValues);
  if (ev === 0n) return 0n;

  // Base discount with variance compensation
  const base = BASE_DISCOUNT_BPS[round] ?? 8500n;

  // Pseudo-random variance from VRF seed
  const entropy = BigInt(keccak256(encodePacked(["uint256", "uint256"], [vrfSeed, BigInt(round)])));
  const maxBps = round <= 1 ? 500n : round === 2 ? 1000n : 1500n;
  const range = maxBps * 2n;
  const variance = (entropy % range) - maxBps;

  // Context: compare current EV to initial EV ($0.33 for 5-case game)
  const initialEV = 33n; // $0.33 = 33 cents
  let context = 0n;
  if (round >= 1 && initialEV > 0n) {
    const evChange = ((ev - initialEV) * 10000n) / initialEV;
    if (evChange < -2000n) context = 300n;
    else if (evChange < -1000n) context = 150n;
    else if (evChange > 2000n) context = -300n;
    else if (evChange > 1000n) context = -150n;
  }

  // Clamp to [15%, 95%]
  let finalDiscount = base + variance + context;
  if (finalDiscount < 1500n) finalDiscount = 1500n;
  if (finalDiscount > 9500n) finalDiscount = 9500n;

  return (ev * finalDiscount) / 10000n;
}

// ── ABI Fragments ──

const confidentialAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function setBankerOfferWithMessage(uint256 gameId, uint256 offerCents, string message)",
]);

// ── Log Trigger Handler ──

const onRoundComplete = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("RoundComplete: missing topics");
  }

  // Decode event: RoundComplete(uint256 indexed gameId, uint8 round)
  const gameId = BigInt(bytesToHex(topics[1]));
  const round = Number(BigInt(bytesToHex(log.data)) & 0xffn);

  runtime.log(`RoundComplete: game=${gameId}, round=${round}`);

  // Check: only act on AwaitingOffer phases (not FinalRound)
  // RoundComplete fires for both normal rounds and the transition to FinalRound.
  // The AI Banker should only make offers during normal rounds (phase 4 = AwaitingOffer).

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;

  // 1. Read game state
  const readCallData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "getGameState",
    args: [gameId],
  });

  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: readCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: confidentialAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  // Destructure game state
  const phase = Number(state[3]);
  const currentRound = Number(state[5]);
  const caseValues = state[10] as readonly bigint[];
  const opened = state[11] as readonly boolean[];

  // Phase 4 = AwaitingOffer — only make offers in this phase
  if (phase !== 4) {
    runtime.log(`Game ${gameId}: phase=${phase}, not AwaitingOffer(4), skipping`);
    return `Game ${gameId}: not awaiting offer`;
  }

  // 2. Compute remaining values and revealed values
  const remainingValues: bigint[] = [];
  const revealedValues: bigint[] = [];

  for (let i = 0; i < NUM_CASES; i++) {
    if (opened[i]) {
      revealedValues.push(caseValues[i]);
    }
  }

  // Rebuild remaining pool from CASE_VALUES_CENTS minus revealed
  let usedBitmap = 0n;
  for (const revealed of revealedValues) {
    for (let j = 0; j < NUM_CASES; j++) {
      if (CASE_VALUES_CENTS[j] === revealed && (usedBitmap & (1n << BigInt(j))) === 0n) {
        usedBitmap |= 1n << BigInt(j);
        break;
      }
    }
  }
  for (let j = 0; j < NUM_CASES; j++) {
    if ((usedBitmap & (1n << BigInt(j))) === 0n) {
      remainingValues.push(CASE_VALUES_CENTS[j]);
    }
  }

  runtime.log(`Game ${gameId}: remaining=${remainingValues.join(",")}, revealed=${revealedValues.join(",")}`);

  // 3. Compute offer using banker algorithm
  // TODO: Read actual VRF seed from contract (add vrfSeed to getGameState return).
  // For now, use keccak256(gameId) as deterministic seed — offer may diverge from
  // on-chain calculateBankerOfferFull() which uses the real VRF seed.
  const vrfSeed = BigInt(keccak256(encodePacked(["uint256"], [gameId])));
  const offerCents = calculateOffer(remainingValues, currentRound, vrfSeed);

  if (offerCents === 0n) {
    runtime.log(`Game ${gameId}: offer computed as 0, skipping`);
    return `Game ${gameId}: zero offer`;
  }

  const ev = expectedValue(remainingValues);
  runtime.log(`Game ${gameId}: EV=${ev} cents, offer=${offerCents} cents (round ${currentRound})`);

  // 4. Call Gemini for banker personality message
  const gameContext: GameContext = {
    gameId,
    round: currentRound,
    remainingValues,
    revealedValues,
    offerCents,
    evCents: ev,
  };

  const bankerMessage = callGemini(runtime as Runtime<Config>, gameContext);
  runtime.log(`Banker says: "${bankerMessage}"`);

  // 5. Write setBankerOfferWithMessage on-chain
  const writeCallData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "setBankerOfferWithMessage",
    args: [gameId, offerCents, bankerMessage],
  });

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(writeCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.contractAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`setBankerOfferWithMessage failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`AI Banker offer: game=${gameId}, offer=${offerCents}c, tx=${bytesToHex(txHash)}`);

  // BestOfBanker quote save is handled by the separate save-quote workflow,
  // triggered by the BankerMessage event emitted from setBankerOfferWithMessage.

  return `Game ${gameId}: banker offers ${offerCents} cents — "${bankerMessage}"`;
};

// ── Workflow Init ──

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  });

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`);
  }

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
      }),
      onRoundComplete
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
