/**
 * CRE Workflow: Sponsor Jackpot (Log Trigger)
 *
 * TRIGGER: EVM Log — CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex)
 *
 * FLOW:
 *   1. Listen for CaseOpenRequested from DealOrNotConfidential
 *   2. Check if game has a sponsor assigned
 *   3. Read remaining value pool, sort desc, take top 2 as [low, high]
 *   4. Deterministic random amount in [low, high] using keccak256
 *   5. Write addToJackpot(gameId, amount) via report → KeystoneForwarder → SponsorJackpot
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

// ── Config (from config.staging.json / config.production.json) ──

type Config = {
  contractAddress: string;
  sponsorJackpotAddress: string;
  chainSelectorName: string;
  gasLimit: string;
};

// ── ABI Fragments ──

const dealOrNotAbi = parseAbi([
  "function getRemainingValuePool(uint256 gameId) view returns (uint256[])",
]);

const sponsorJackpotAbi = parseAbi([
  "function gameSponsor(uint256 gameId) view returns (address)",
  "function addToJackpot(uint256 gameId, uint256 amountCents)",
]);

// ── Log Trigger Handler ──

const onCaseOpenRequested = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topics = log.topics;
  if (topics.length < 2) {
    throw new Error("CaseOpenRequested: missing topics");
  }

  // Decode event: CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex)
  const gameId = BigInt(bytesToHex(topics[1]));
  const caseIndex = Number(BigInt(bytesToHex(log.data)) & 0xffn);

  runtime.log(`CaseOpenRequested: game=${gameId}, case=${caseIndex}`);

  // Set up EVM client
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: runtime.config.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Network not found: ${runtime.config.chainSelectorName}`);

  const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector);
  const contractAddr = runtime.config.contractAddress as Address;
  const sponsorAddr = runtime.config.sponsorJackpotAddress as Address;

  // 1. Check if game has a sponsor
  const sponsorCallData = encodeFunctionData({
    abi: sponsorJackpotAbi,
    functionName: "gameSponsor",
    args: [gameId],
  });

  const sponsorResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: sponsorAddr,
        data: sponsorCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const gameSponsor = decodeFunctionResult({
    abi: sponsorJackpotAbi,
    functionName: "gameSponsor",
    data: bytesToHex(sponsorResult.data),
  });

  if (gameSponsor === zeroAddress) {
    runtime.log(`Game ${gameId}: no sponsor assigned, skipping`);
    return `Game ${gameId}: no sponsor`;
  }

  // 2. Read remaining value pool
  const poolCallData = encodeFunctionData({
    abi: dealOrNotAbi,
    functionName: "getRemainingValuePool",
    args: [gameId],
  });

  const poolResult = evmClient
    .callContract(runtime, {
      call: encodeCallMsg({
        from: zeroAddress,
        to: contractAddr,
        data: poolCallData,
      }),
      blockNumber: LATEST_BLOCK_NUMBER,
    })
    .result();

  const remaining = decodeFunctionResult({
    abi: dealOrNotAbi,
    functionName: "getRemainingValuePool",
    data: bytesToHex(poolResult.data),
  }) as readonly bigint[];

  if (remaining.length < 2) {
    runtime.log(`Game ${gameId}: fewer than 2 values remaining, skipping`);
    return `Game ${gameId}: too few values`;
  }

  // 3. Sort descending, take top 2 as [high, low]
  const sorted = [...remaining].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
  const high = sorted[0];
  const low = sorted[1];

  // 4. Deterministic random in [low, high]
  // keccak256(gameId, caseIndex, "sponsor") — all DON nodes compute the same result
  const hash = keccak256(
    encodePacked(
      ["uint256", "uint8", "string"],
      [gameId, caseIndex, "sponsor"]
    )
  );
  const range = high - low + 1n;
  const amount = low + (BigInt(hash) % range);

  runtime.log(`Game ${gameId}: remaining top 2 = [${low}, ${high}], sponsor amount = ${amount} cents`);

  // 5. Write addToJackpot via report → KeystoneForwarder → SponsorJackpot
  const addCallData = encodeFunctionData({
    abi: sponsorJackpotAbi,
    functionName: "addToJackpot",
    args: [gameId, amount],
  });

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(addCallData),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const writeResult = evmClient
    .writeReport(runtime, {
      receiver: runtime.config.sponsorJackpotAddress,
      report: reportResponse,
      gasConfig: {
        gasLimit: runtime.config.gasLimit,
      },
    })
    .result();

  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`addToJackpot failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`Jackpot increased: game=${gameId}, amount=${amount} cents, tx=${bytesToHex(txHash)}`);

  return `Game ${gameId}: jackpot +${amount} cents`;
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
      onCaseOpenRequested
    ),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}

main();
