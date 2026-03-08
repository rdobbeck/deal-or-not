import { baseSepolia } from "wagmi/chains";
import { CHAIN_CONTRACTS, CCIP_EXPLORER_URL } from "./chains";

// ── Contract Addresses (Base Sepolia — home chain) ──
export const CONTRACT_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].dealOrNot;
export const SPONSOR_JACKPOT_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].sponsorJackpot;
export const BEST_OF_BANKER_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].bestOfBanker;

// ── Agent Infrastructure (Base Sepolia) ──
export const AGENT_REGISTRY_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].agentRegistry;
export const DEAL_OR_NOT_AGENTS_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].dealOrNotAgents;
export const AGENT_STAKING_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].agentStaking;
export const SEASONAL_LEADERBOARD_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].seasonalLeaderboard;
export const PREDICTION_MARKET_ADDRESS = CHAIN_CONTRACTS[baseSepolia.id].predictionMarket;
export const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

// ── Cross-Chain (ETH Sepolia — spoke) ──
export const GATEWAY_ADDRESS = CHAIN_CONTRACTS[11155111].gateway;
export const CCIP_EXPLORER = CCIP_EXPLORER_URL;

// ── Chain Config ──
export const CHAIN = baseSepolia;
export const CHAIN_ID = baseSepolia.id; // 84532
export const HOME_CHAIN_ID = baseSepolia.id;

// ── Chainlink Config ──
export const VRF_COORDINATOR = "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE" as `0x${string}`;
export const VRF_SUB_ID = "20136374336138753384898843390506225296052091906296406953567310616148092014984";
export const VRF_KEY_HASH = "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71";
export const ETH_USD_PRICE_FEED = CHAIN_CONTRACTS[baseSepolia.id].priceFeed;
export const LINK_TOKEN = "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" as `0x${string}`;

// ── Burner Wallets (Base Sepolia testnet only) ──
export const DEPLOYER_ADDRESS = "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as `0x${string}`;
export const PLAYER_ADDRESS = "0xC96Bcb1EACE35d09189a6e52758255b8951a7587" as `0x${string}`;
