/**
 * CRE Workflow: Confidential Case Reveal (Log Trigger)
 *
 * TRIGGER: EVM Log — CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex)
 *
 * FLOW:
 *   1. Listen for CaseOpenRequested from DealOrNotConfidential
 *   2. Read game state (vrfSeed, opened[], caseValues[]) from chain
 *   3. Fetch additional entropy via Confidential HTTP (enclave-only, no node sees it)
 *   4. Compute case value using hash(vrfSeed, caseIndex, usedBitmap, creEntropy)
 *      - VRF seed: on-chain, provably fair
 *      - CRE entropy: fetched inside enclave, prevents player precomputation
 *   5. Write value via writeReport -> KeystoneForwarder -> fulfillCaseValue()
 *
 * SECURITY MODEL:
 *   The player knows vrfSeed, caseIndex, and usedBitmap from on-chain data.
 *   Without creEntropy (which only exists inside the CRE enclave), they cannot
 *   simulate the hash output to predict case values before opening.
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
  encodePacked,
  zeroAddress,
  type Address,
} from "viem";

// -- Config (from config.staging.json) --

type Config = {
  contractAddress: string;
  chainSelectorName: string;
  gasLimit: string;
  entropyUrl?: string;
};

// -- Constants --

const CASE_VALUES_CENTS = [1n, 5n, 10n, 50n, 100n];
const NUM_CASES = 5;

// Default entropy URL — mathjs.org randomInt returns a random integer.
// Called inside the CRE enclave via Confidential HTTP — no node sees the result.
const DEFAULT_ENTROPY_URL = "https://api.mathjs.org/v4/?expr=randomInt(1,1000001)";

// -- ABI Fragments --

const confidentialAbi = parseAbi([
  "function getGameState(uint256 gameId) view returns (address host, address player, uint8 mode, uint8 phase, uint8 playerCase, uint8 currentRound, uint8 totalCollapsed, uint256 bankerOffer, uint256 finalPayout, uint256 ethPerDollar, uint256[5] caseValues, bool[5] opened)",
  "function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents)",
]);

// -- Collapse Engine --

/**
 * Derive a case value deterministically from VRF seed + case context + CRE entropy.
 *
 * hash(vrfSeed, caseIndex, usedBitmap, creEntropy) -> pick index -> value
 *
 * creEntropy is fetched via Confidential HTTP inside the enclave.
 * It never exists outside the enclave, so no party can precompute the outcome.
 */
function collapseCase(
  vrfSeed: bigint,
  caseIndex: number,
  usedBitmap: bigint,
  creEntropy: bigint
): bigint {
  let remaining = 0;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) remaining++;
  }
  if (remaining === 0) throw new Error("No values remaining");

  const hash = keccak256(
    encodePacked(
      ["uint256", "uint8", "uint256", "uint256"],
      [vrfSeed, caseIndex, usedBitmap, creEntropy]
    )
  );
  const pick = BigInt(hash) % BigInt(remaining);

  let count = 0n;
  for (let i = 0; i < NUM_CASES; i++) {
    if ((usedBitmap & (1n << BigInt(i))) === 0n) {
      if (count === pick) {
        return CASE_VALUES_CENTS[i];
      }
      count++;
    }
  }

  throw new Error("Unreachable: no value found");
}

// -- Log Trigger Handler --

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

  // 1. Read game state from chain
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

  const caseValues = state[10] as readonly bigint[];
  const opened = state[11] as readonly boolean[];

  runtime.log(`Game state read: totalCollapsed=${state[6]}, phase=${state[3]}`);

  // Reconstruct usedValuesBitmap from already-revealed values
  let usedBitmap = 0n;
  for (let i = 0; i < NUM_CASES; i++) {
    if (opened[i]) {
      const revealedValue = caseValues[i];
      for (let j = 0; j < NUM_CASES; j++) {
        if (
          CASE_VALUES_CENTS[j] === revealedValue &&
          (usedBitmap & (1n << BigInt(j))) === 0n
        ) {
          usedBitmap |= 1n << BigInt(j);
          break;
        }
      }
    }
  }

  // 2. Fetch CRE entropy via Confidential HTTP
  // The request runs inside the CRE enclave — no DON node sees the response.
  // This is the secret ingredient that prevents players from precomputing case values.
  const confHTTPClient = new cre.capabilities.ConfidentialHTTPClient();
  const entropyUrl = runtime.config.entropyUrl || DEFAULT_ENTROPY_URL;

  runtime.log(`Fetching entropy via Confidential HTTP: ${entropyUrl}`);

  const entropyResponse = confHTTPClient
    .sendRequest(runtime, {
      request: {
        url: entropyUrl,
        method: "GET",
      },
      vaultDonSecrets: [],
    })
    .result();

  if (!ok(entropyResponse)) {
    throw new Error(`Confidential HTTP failed: status ${entropyResponse.statusCode}`);
  }

  const entropyText = new TextDecoder().decode(entropyResponse.body);
  // mathjs.org may return scientific notation (e.g. "4.43e+5") — parse as Number first
  const creEntropy = BigInt(Math.floor(Number(entropyText.trim())));

  runtime.log(`CRE entropy fetched (enclave-only): ${creEntropy}`);

  // 3. Derive VRF seed — stored in Game struct but not in getGameState return.
  // TODO: Add vrfSeed to getGameState return or read it from a separate view function.
  // For now, use keccak256(gameId) as deterministic seed.
  const vrfSeed = BigInt(keccak256(encodePacked(["uint256"], [gameId])));

  // 4. Compute value with CRE entropy mixed in
  const valueCents = collapseCase(vrfSeed, caseIndex, usedBitmap, creEntropy);

  runtime.log(`Computed value: game=${gameId}, case=${caseIndex}, value=${valueCents} cents`);

  // 5. Write value to chain via report -> KeystoneForwarder -> contract
  const fulfillCallData = encodeFunctionData({
    abi: confidentialAbi,
    functionName: "fulfillCaseValue",
    args: [gameId, caseIndex, valueCents],
  });

  const reportResponse = runtime
    .report({
      encodedPayload: hexToBase64(fulfillCallData),
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
    throw new Error(`fulfillCaseValue failed: ${writeResult.errorMessage || writeResult.txStatus}`);
  }

  const txHash = writeResult.txHash || new Uint8Array(32);
  runtime.log(`Fulfilled: game=${gameId}, case=${caseIndex}, value=${valueCents}, tx=${bytesToHex(txHash)}`);

  return `Case ${caseIndex} revealed: ${valueCents} cents`;
};

// -- Workflow Init --

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
