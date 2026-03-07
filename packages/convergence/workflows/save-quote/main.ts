/**
 * CRE Workflow: Save Quote (Log Trigger)
 *
 * TRIGGER: EVM Log — BankerMessage(uint256 indexed gameId, string message)
 *
 * FLOW:
 *   1. Listen for BankerMessage from DealOrNotQuickPlay
 *   2. Read game state to get the current round
 *   3. Write saveQuote(gameId, round, message) to BestOfBanker
 *
 * Split from banker-ai to avoid nonce collision — each workflow
 * gets its own execution context and nonce sequence.
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
  decodeAbiParameters,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";

// ── Config (from config.staging.json / config.production.json) ──

type Config = {
  contractAddress: string;       // DealOrNotQuickPlay (trigger source + state reads)
  bestOfBankerAddress: string;   // BestOfBanker (write target)
  chainSelectorName: string;
  gasLimit: string;
};

// ── ABI Fragments ──

const gameAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
]);

const bestOfBankerAbi = parseAbi([
  "function saveQuote(uint256 gameId, uint8 round, string message)",
]);

// ── Log Trigger Handler ──

const onBankerMessage = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("BankerMessage: missing topics");
  }

  // Decode event: BankerMessage(uint256 indexed gameId, string message)
  const gameId = BigInt(bytesToHex(topics[1]));

  // The message is ABI-encoded as a dynamic string in log.data
  const [message] = decodeAbiParameters(
    [{ name: "message", type: "string" }],
    bytesToHex(log.data) as `0x${string}`
  );

  runtime.log(`BankerMessage: game=${gameId}, message="${message.slice(0, 60)}..."`);

  if (!message || message.length === 0) {
    runtime.log(`Game ${gameId}: empty message, skipping`);
    return `Game ${gameId}: empty message`;
  }

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;

  // 1. Read game state to get the current round
  const readCallData = encodeFunctionData({
    abi: gameAbi,
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
    abi: gameAbi,
    functionName: "getGameState",
    data: bytesToHex(stateResult.data),
  });

  const currentRound = Number(state[5]);
  runtime.log(`Game ${gameId}: round=${currentRound}`);

  // 2. Encode saveQuote call
  const saveCallData = encodeFunctionData({
    abi: bestOfBankerAbi,
    functionName: "saveQuote",
    args: [gameId, currentRound, message],
  });

  // 3. Generate report and write to BestOfBanker
  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(saveCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.bestOfBankerAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`saveQuote failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`Quote saved: game=${gameId}, round=${currentRound}, tx=${bytesToHex(txHash)}`);

  return `Game ${gameId}: quote saved for round ${currentRound}`;
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
      onBankerMessage
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
