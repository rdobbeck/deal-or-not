/**
 * CRE Workflow: Agent Gameplay Orchestrator (Log Trigger)
 *
 * TRIGGER: EVM Log — multiple events from DealOrNotAgents
 *
 * FLOW:
 *   1. Listen for game state change events from DealOrNotAgents
 *   2. Check event type (VRFSeedReceived, CasePicked, BankerOfferMade, DealRejected, GameResolved)
 *   3. Read game state from chain
 *   4. Fetch agent's API endpoint from AgentRegistry
 *   5. Call agent API via ConfidentialHTTPClient (enclave-only, protects agent strategy)
 *   6. Execute agent decision on-chain via writeReport → KeystoneForwarder → onReport
 *
 * KEY DESIGN:
 *   DealOrNotAgents accepts all agent actions through onReport, NOT direct calls.
 *   The report payload is: bytes4(selector) + abi.encode(args)
 *   onReport decodes the selector and routes to the correct internal function.
 *   This solves the msg.sender blocker — CRE forwarder is the only caller.
 *
 * CONVERGENCE CHANGES (vs prototype):
 *   - Uses cre.capabilities.EVMClient (new SDK style)
 *   - Uses cre.handler (new SDK style)
 *   - getGameState returns 11 values (no host/mode, has agent/agentId)
 *   - DealOrNotAgents now integrates with Bank for real ETH payouts
 *   - encryptOutput: true on agent API call
 */

import {
  bytesToHex,
  cre,
  type EVMLog,
  encodeCallMsg,
  getNetwork,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  ok,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  decodeFunctionResult,
  parseAbi,
  keccak256,
  toBytes,
  zeroAddress,
  type Address,
} from "viem";

// ── Config ──

type Config = {
  contractAddress: string;       // DealOrNotAgents address
  agentRegistryAddress: string;  // AgentRegistry address
  chainSelectorName: string;
  gasLimit: string;
  owner: string;                 // For vault DON secrets
};

// ── Phase enum (must match DealOrNotAgents.sol) ──

enum Phase {
  WaitingForVRF = 0,
  Created = 1,       // pick case
  Round = 2,         // open case
  WaitingForCRE = 3,
  AwaitingOffer = 4,
  BankerOffer = 5,   // deal or no-deal
  FinalRound = 6,    // keep or swap
  WaitingForFinalCRE = 7,
  GameOver = 8,
}

// ── Event signatures (keccak256 hashes from DealOrNotAgents) ──

const EVENT_VRF_SEED_RECEIVED = keccak256(toBytes("VRFSeedReceived(uint256,uint256)"));
const EVENT_CASE_PICKED = keccak256(toBytes("CasePicked(uint256,uint8)"));
const EVENT_BANKER_OFFER_MADE = keccak256(toBytes("BankerOfferMade(uint256,uint8,uint256)"));
const EVENT_DEAL_REJECTED = keccak256(toBytes("DealRejected(uint256,uint8)"));
const EVENT_GAME_RESOLVED = keccak256(toBytes("GameResolved(uint256,uint256,bool)"));

// ── ABI Fragments ──

// DealOrNotAgents view functions (convergence: 11 return values, no host/mode)
const agentsAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address agent, uint256 agentId, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  // Agent action selectors (used to build report payloads for onReport)
  "function agentPickCase(uint256 gameId, uint8 caseIndex)",
  "function agentOpenCase(uint256 gameId, uint8 caseIndex)",
  "function agentAcceptDeal(uint256 gameId)",
  "function agentRejectDeal(uint256 gameId)",
  "function agentKeepCase(uint256 gameId)",
  "function agentSwapCase(uint256 gameId)",
]);

// AgentRegistry view functions
const registryAbi = parseAbi([
  "function isAgentEligible(address player) view returns (bool)",
  "function getAgentEndpoint(address player) view returns (string)",
  "function getAgentId(address player) view returns (uint256)",
]);

// ── Agent API Types ──

type DecisionRequest = {
  gameId: string;
  phase: string;
  gameState: {
    playerCase: number;
    currentRound: number;
    bankerOffer: number;
    caseValues: number[];
    opened: boolean[];
    remainingValues: number[];
  };
  expectedValue: number;
  bankerOffer?: number;
};

type DecisionResponse = {
  action: "pick" | "open" | "deal" | "no-deal" | "keep" | "swap";
  caseIndex?: number;
  reasoning?: string;
};

// ── Helpers ──

const NUM_CASES = 5;

function expectedValue(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function phaseToString(phase: number): string {
  switch (phase) {
    case Phase.Created: return "Created";
    case Phase.Round: return "Round";
    case Phase.BankerOffer: return "BankerOffer";
    case Phase.FinalRound: return "FinalRound";
    case Phase.GameOver: return "GameOver";
    default: return "Unknown";
  }
}

// ── Core: Read game state, call agent, execute action ──

function handleAgentTurn(
  runtime: Runtime<Config>,
  evmClient: InstanceType<typeof cre.capabilities.EVMClient>,
  gameId: bigint,
  eventName: string
): string {
  const contractAddr = runtime.config.contractAddress as Address;
  const registryAddr = runtime.config.agentRegistryAddress as Address;

  // 1. Read game state
  const stateResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: encodeFunctionData({
          abi: agentsAbi,
          functionName: "getGameState",
          args: [gameId],
        }),
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const state = decodeFunctionResult({
    abi: agentsAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  // Convergence DealOrNotAgents: 11 return values
  // [0] agent, [1] agentId, [2] phase, [3] playerCase, [4] currentRound,
  // [5] totalCollapsed, [6] bankerOffer, [7] finalPayout, [8] ethPerDollar,
  // [9] caseValues, [10] opened
  const agentAddress = state[0] as Address;
  const phase = Number(state[2]);
  const playerCase = Number(state[3]);
  const currentRound = Number(state[4]);
  const bankerOffer = Number(state[6]);
  const caseValues = (state[9] as readonly bigint[]).map(Number);
  const opened = state[10] as readonly boolean[];

  runtime.log(`${eventName}: game=${gameId}, agent=${agentAddress}, phase=${phaseToString(phase)}`);

  // Skip if game is over or waiting for CRE (not agent's turn)
  if (phase === Phase.GameOver || phase === Phase.WaitingForCRE ||
      phase === Phase.WaitingForFinalCRE || phase === Phase.WaitingForVRF ||
      phase === Phase.AwaitingOffer) {
    runtime.log(`Game ${gameId}: phase ${phaseToString(phase)} — not agent's turn, skipping`);
    return `Game ${gameId}: skipped (phase=${phaseToString(phase)})`;
  }

  // 2. Get agent endpoint from registry
  const endpointResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: registryAddr,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "getAgentEndpoint",
          args: [agentAddress],
        }),
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const endpoint = decodeFunctionResult({
    abi: registryAbi,
    functionName: "getAgentEndpoint",
    data: bytesToHex(endpointResult.data),
  }) as string;

  if (!endpoint) {
    throw new Error(`Game ${gameId}: agent ${agentAddress} has no endpoint`);
  }

  // 3. Compute remaining values for EV calculation
  const remainingValues: number[] = [];
  for (let i = 0; i < NUM_CASES; i++) {
    if (!opened[i] && i !== playerCase) {
      remainingValues.push(caseValues[i]);
    }
  }
  if (playerCase >= 0 && playerCase < NUM_CASES && !opened[playerCase]) {
    remainingValues.push(caseValues[playerCase]);
  }

  const ev = expectedValue(remainingValues);

  // 4. Call agent API via ConfidentialHTTPClient (protects agent strategy)
  const confHTTPClient = new cre.capabilities.ConfidentialHTTPClient();

  const decisionRequest: DecisionRequest = {
    gameId: gameId.toString(),
    phase: phaseToString(phase),
    gameState: {
      playerCase,
      currentRound,
      bankerOffer,
      caseValues,
      opened: Array.from(opened),
      remainingValues,
    },
    expectedValue: ev,
    bankerOffer: phase === Phase.BankerOffer ? bankerOffer : undefined,
  };

  runtime.log(`Calling agent API: ${endpoint}`);

  const agentResponse = confHTTPClient
    .sendRequest(runtime, {
      request: {
        url: endpoint,
        method: "POST",
        multiHeaders: {
          "Content-Type": { values: ["application/json"] },
        },
        bodyString: JSON.stringify(decisionRequest),
      },
      encryptOutput: true,
      vaultDonSecrets: [],
    })
    .result();

  if (!ok(agentResponse)) {
    throw new Error(`Agent API failed: status ${agentResponse.statusCode}`);
  }

  const decision = JSON.parse(
    new TextDecoder().decode(agentResponse.body)
  ) as DecisionResponse;
  runtime.log(`Agent decision: ${decision.action}${decision.caseIndex !== undefined ? ` case=${decision.caseIndex}` : ""}`);

  // 5. Build report payload (selector + args) for DealOrNotAgents.onReport
  let reportPayload: `0x${string}`;

  switch (decision.action) {
    case "pick":
      if (decision.caseIndex === undefined || decision.caseIndex < 0 || decision.caseIndex >= NUM_CASES) {
        throw new Error(`Invalid caseIndex for pick: ${decision.caseIndex}`);
      }
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentPickCase",
        args: [BigInt(gameId), decision.caseIndex],
      });
      break;

    case "open":
      if (decision.caseIndex === undefined || decision.caseIndex < 0 || decision.caseIndex >= NUM_CASES) {
        throw new Error(`Invalid caseIndex for open: ${decision.caseIndex}`);
      }
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentOpenCase",
        args: [BigInt(gameId), decision.caseIndex],
      });
      break;

    case "deal":
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentAcceptDeal",
        args: [BigInt(gameId)],
      });
      break;

    case "no-deal":
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentRejectDeal",
        args: [BigInt(gameId)],
      });
      break;

    case "keep":
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentKeepCase",
        args: [BigInt(gameId)],
      });
      break;

    case "swap":
      reportPayload = encodeFunctionData({
        abi: agentsAbi,
        functionName: "agentSwapCase",
        args: [BigInt(gameId)],
      });
      break;

    default:
      throw new Error(`Unknown action: ${decision.action}`);
  }

  // 6. Write to DealOrNotAgents via report → KeystoneForwarder → onReport
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(reportPayload),
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
    throw new Error(
      `Agent action ${decision.action} failed: ${writeResult.errorMessage || writeResult.txStatus}`
    );
  }

  const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32));
  runtime.log(`Agent action executed: game=${gameId}, action=${decision.action}, tx=${txHash}`);

  return `Game ${gameId}: agent ${decision.action} executed`;
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

  // Single handler that catches all events from DealOrNotAgents, routes by topic[0]
  return [
    cre.handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.contractAddress)],
      }),
      (runtime: Runtime<Config>, log: EVMLog): string => {
        const eventSig = bytesToHex(log.topics[0]);

        switch (eventSig) {
          case EVENT_VRF_SEED_RECEIVED:
            return handleAgentTurn(runtime, evmClient, BigInt(bytesToHex(log.topics[1])), "VRFSeedReceived");
          case EVENT_CASE_PICKED:
            return handleAgentTurn(runtime, evmClient, BigInt(bytesToHex(log.topics[1])), "CasePicked");
          case EVENT_BANKER_OFFER_MADE:
            return handleAgentTurn(runtime, evmClient, BigInt(bytesToHex(log.topics[1])), "BankerOfferMade");
          case EVENT_DEAL_REJECTED:
            return handleAgentTurn(runtime, evmClient, BigInt(bytesToHex(log.topics[1])), "DealRejected");
          case EVENT_GAME_RESOLVED: {
            const gId = BigInt(bytesToHex(log.topics[1]));
            runtime.log(`GameResolved: game=${gId} — stats auto-recorded by DealOrNotAgents`);
            return `Game ${gId}: resolved`;
          }
          default:
            runtime.log(`Ignoring event: ${eventSig}`);
            return "Ignored event";
        }
      }
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
