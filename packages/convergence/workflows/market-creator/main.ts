/**
 * CRE Workflow: Market Creator (Log Trigger)
 *
 * TRIGGER: EVM Log — GameCreated(uint256 indexed gameId, address indexed agent, uint256 agentId)
 *          from DealOrNotAgents contract
 *
 * FLOW:
 *   1. Listen for GameCreated from DealOrNotAgents
 *   2. Decode gameId and agentId from event
 *   3. Encode createMarketBatch() with 3 market types
 *   4. Write via report → KeystoneForwarder → PredictionMarket
 */

import {
  bytesToHex,
  cre,
  type EVMLog,
  getNetwork,
  hexToBase64,
  Runner,
  type Runtime,
  TxStatus,
} from "@chainlink/cre-sdk";
import {
  encodeFunctionData,
  parseAbi,
  type Address,
} from "viem";

// ── Config (from config.staging.json / config.production.json) ──

type Config = {
  contractAddress: string; // DealOrNotAgents (trigger source)
  predictionMarketAddress: string; // PredictionMarket (write target)
  chainSelectorName: string;
  gasLimit: string;
  lockTimeOffset: string; // seconds after game creation to lock betting
  earningsTargetCents: string; // target for EarningsOver market (e.g. "50" = $0.50)
};

// ── ABI Fragments ──

const predictionMarketAbi = parseAbi([
  "function createMarketBatch(uint256 gameId, uint256 agentId, uint8[] calldata marketTypes, uint256[] calldata targetValues, uint256 lockTime) external returns (uint256[])",
]);

// MarketType enum values from PredictionMarket.sol
const MARKET_TYPE_WILL_WIN = 0;
const MARKET_TYPE_EARNINGS_OVER = 1;
const MARKET_TYPE_WILL_ACCEPT_OFFER = 2;

// ── Log Trigger Handler ──

const onGameCreated = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 3) {
    throw new Error("GameCreated: expected 3 topics (sig, gameId, agent)");
  }

  // Decode event: GameCreated(uint256 indexed gameId, address indexed agent, uint256 agentId)
  // topics[0] = event signature hash
  // topics[1] = gameId (indexed)
  // topics[2] = agent address (indexed)
  // data = agentId (non-indexed)
  const gameId = BigInt(bytesToHex(topics[1]));
  const agentId = BigInt(bytesToHex(log.data));

  runtime.log(`GameCreated: game=${gameId}, agentId=${agentId}`);

  // Calculate lock time: current block timestamp approximation
  // Games expire after 10 min, so 1 hour lock gives plenty of betting window
  const lockTimeOffset = BigInt(runtime.config.lockTimeOffset || "3600");
  const earningsTarget = BigInt(runtime.config.earningsTargetCents || "50");

  // Use block timestamp from the log + offset for lock time
  // Since we can't read block.timestamp directly in CRE, use a generous offset
  // The contract's lockTime is compared against block.timestamp at bet time
  const now = BigInt(Math.floor(Date.now() / 1000));
  const lockTime = now + lockTimeOffset;

  runtime.log(`Lock time: ${lockTime} (now + ${lockTimeOffset}s)`);

  // Encode createMarketBatch: 3 markets per agent game
  // - WillWin (0): binary, will agent earn anything?
  // - EarningsOver (1): will agent earn > target cents?
  // - WillAcceptOffer (2): binary, will agent take the deal?
  const marketTypes = [MARKET_TYPE_WILL_WIN, MARKET_TYPE_EARNINGS_OVER, MARKET_TYPE_WILL_ACCEPT_OFFER];
  const targetValues = [0n, earningsTarget, 0n];

  const callData = encodeFunctionData({
    abi: predictionMarketAbi,
    functionName: "createMarketBatch",
    args: [gameId, agentId, marketTypes, targetValues, lockTime],
  });

  runtime.log(`Encoding createMarketBatch: game=${gameId}, agent=${agentId}, types=[${marketTypes}], targets=[${targetValues}]`);

  // Sign and write report
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(callData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  // Set up EVM client for writeReport
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.predictionMarketAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`createMarketBatch failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`Markets created: game=${gameId}, agentId=${agentId}, tx=${bytesToHex(txHash)}`);

  return `Game ${gameId}: 3 prediction markets created`;
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
      onGameCreated
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
