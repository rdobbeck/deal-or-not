/**
 * CRE Workflow: Game Timer (Cron Trigger)
 *
 * TRIGGER: Cron — runs periodically (e.g. every 5 minutes)
 *
 * FLOW:
 *   1. Scan last N games for stale/expired games
 *   2. Call expireGame() for games past expiry (30 min default)
 *   3. Call clearExpiredJackpot() on SponsorVault for expired sponsored games
 *   4. Dual-mode: scans both DealOrNotQuickPlay AND DealOrNotAgents
 *
 * CONVERGENCE:
 *   - Uses cre.capabilities.EVMClient (new SDK)
 *   - Supports both game contracts via config
 *   - expireGame routed through onReport → KeystoneForwarder
 */

import {
  bytesToHex,
  cre,
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
  zeroAddress,
  type Address,
} from "viem";

// ── Config ──

type Config = {
  quickPlayAddress: string;
  agentsAddress: string;
  chainSelectorName: string;
  gasLimit: string;
  scanWindow: string; // how many recent games to check
};

// ── Phase enum (shared across both contracts) ──

enum Phase {
  WaitingForVRF = 0,
  Created = 1,
  Round = 2,
  WaitingForCRE = 3,
  AwaitingOffer = 4,
  BankerOffer = 5,
  FinalRound = 6,
  WaitingForFinalCRE = 7,
  GameOver = 8,
}

// ── ABI ──

// QuickPlay: 12 return values
const quickPlayAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256 entryDeposit, uint256[5] caseValues, bool[5] opened)",
  "function nextGameId() view returns (uint256)",
  "function expireGame(uint256 gameId)",
]);

// DealOrNotAgents: 11 return values (no host/player, has agent/agentId)
const agentsAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address agent, uint256 agentId, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function nextGameId() view returns (uint256)",
  "function expireGame(uint256 gameId)",
]);

// ── Expiry check ──

const EXPIRY_SECONDS = 30 * 60; // 30 minutes

function isExpired(createdAt: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return now - createdAt > EXPIRY_SECONDS;
}

// ── Scan and expire games for a contract ──

function scanAndExpire(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  contractAddr: Address,
  abi: ReturnType<typeof parseAbi>,
  label: string,
  scanWindow: number,
  phaseIndex: number
): string[] {
  const results: string[] = [];

  // Read nextGameId
  const nextIdResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: encodeFunctionData({ abi, functionName: "nextGameId", args: [] }),
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const nextId = Number(
    decodeFunctionResult({ abi, functionName: "nextGameId", data: bytesToHex(nextIdResult.data) })
  );

  if (nextId === 0) {
    runtime.log(`${label}: no games yet`);
    return results;
  }

  const startId = Math.max(0, nextId - scanWindow);
  runtime.log(`${label}: scanning games ${startId} to ${nextId - 1}`);

  for (let gameId = startId; gameId < nextId; gameId++) {
    try {
      const stateResult = evmClient
        .callContract(runtime, {
          call: encodeCallMsg({
            from: zeroAddress,
            to: contractAddr,
            data: encodeFunctionData({ abi, functionName: "getGameState", args: [BigInt(gameId)] }),
          }),
          blockNumber: LATEST_BLOCK_NUMBER,
        })
        .result();

      const state = decodeFunctionResult({
        abi,
        functionName: "getGameState",
        data: bytesToHex(stateResult.data),
      });

      const phase = Number(state[phaseIndex]);

      // Skip games that are already over or waiting for VRF
      if (phase === Phase.GameOver || phase === Phase.WaitingForVRF) continue;

      // Check if game is stale (active but idle for 30+ min)
      // We use a heuristic: if game is in phases 1-7 and hasn't progressed
      // The contract itself tracks createdAt and enforces the expiry window
      runtime.log(`${label} game ${gameId}: phase=${phase}, attempting expiry...`);

      const expireCallData = encodeFunctionData({
        abi,
        functionName: "expireGame",
        args: [BigInt(gameId)],
      });

      const reportResponse = runtime
        .report({
          encodedPayload: hexToBase64(expireCallData),
          encoderName: "evm",
          signingAlgo: "ecdsa",
          hashingAlgo: "keccak256",
        })
        .result();

      const writeResult = evmClient
        .writeReport(runtime, {
          receiver: contractAddr,
          report: reportResponse,
          gasConfig: { gasLimit: runtime.config.gasLimit },
        })
        .result();

      if (writeResult.txStatus === TxStatus.SUCCESS) {
        const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
        runtime.log(`${label} game ${gameId}: expired, tx=${txHash}`);
        results.push(`${label} game ${gameId} expired: ${txHash}`);
      } else {
        // Game may not actually be expired yet — contract will revert
        runtime.log(`${label} game ${gameId}: not expired yet (contract reverted)`);
      }
    } catch {
      // Game may not exist or read failed — skip
      continue;
    }
  }

  return results;
}

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
  const scanWindow = parseInt(config.scanWindow || "5");

  return [
    cre.handler(
      cre.triggers.cronTrigger({ schedule: "*/5 * * * *" }),
      (runtime: Runtime<Config>): string => {
        runtime.log("Game timer triggered — scanning for expired games...");

        const allResults: string[] = [];

        // Scan QuickPlay
        if (config.quickPlayAddress) {
          const qpResults = scanAndExpire(
            runtime,
            evmClient,
            config.quickPlayAddress as Address,
            quickPlayAbi,
            "QuickPlay",
            scanWindow,
            2 // phase is index 2 in QuickPlay getGameState
          );
          allResults.push(...qpResults);
        }

        // Scan DealOrNotAgents
        if (config.agentsAddress) {
          const agentResults = scanAndExpire(
            runtime,
            evmClient,
            config.agentsAddress as Address,
            agentsAbi,
            "Agents",
            scanWindow,
            2 // phase is index 2 in Agents getGameState
          );
          allResults.push(...agentResults);
        }

        if (allResults.length === 0) {
          runtime.log("No expired games found");
          return "No expired games";
        }

        return `Expired ${allResults.length} game(s): ${allResults.join(", ")}`;
      }
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
