import { baseSepolia } from "wagmi/chains";

// ── Contract Addresses (Base Sepolia — Convergence deployment) ──
export const CONTRACT_ADDRESS = "0x46B6b547A4683ac5533CAce6aDc4d399b50424A7" as `0x${string}`;
export const SPONSOR_JACKPOT_ADDRESS = "0x14a26cb376d8e36c47261A46d6b203A7BaADaE53" as `0x${string}`;
export const BEST_OF_BANKER_ADDRESS = "0x55100EF4168d21631EEa6f2b73D6303Bb008F554" as `0x${string}`;

// ── Chain Config ──
export const CHAIN = baseSepolia;
export const CHAIN_ID = baseSepolia.id; // 84532

// ── Chainlink Config ──
export const VRF_COORDINATOR = "0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE" as `0x${string}`;
export const VRF_SUB_ID = "20136374336138753384898843390506225296052091906296406953567310616148092014984";
export const VRF_KEY_HASH = "0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71";
export const ETH_USD_PRICE_FEED = "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" as `0x${string}`;
export const LINK_TOKEN = "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" as `0x${string}`;

// ── Burner Wallets (Base Sepolia testnet only) ──
export const DEPLOYER_ADDRESS = "0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1" as `0x${string}`;
export const PLAYER_ADDRESS = "0xC96Bcb1EACE35d09189a6e52758255b8951a7587" as `0x${string}`;
