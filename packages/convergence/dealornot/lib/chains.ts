import { baseSepolia, sepolia } from "wagmi/chains";

// ── Per-Chain Contract Addresses ──

export const CHAIN_CONTRACTS = {
  [baseSepolia.id]: {
    dealOrNot: "0x46B6b547A4683ac5533CAce6aDc4d399b50424A7" as `0x${string}`,
    bank: "0x5de581956fcceaae90a0c4cf02e4bddc7f1253bb" as `0x${string}`,
    sponsorJackpot: "0x14a26cb376d8e36c47261A46d6b203A7BaADaE53" as `0x${string}`,
    bestOfBanker: "0x55100EF4168d21631EEa6f2b73D6303Bb008F554" as `0x${string}`,
    bridge: "0xb233efd1623f843151c97a1fb32f9115aae6a875" as `0x${string}`,
    priceFeed: "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" as `0x${string}`,
    // Agent infra — shared with prototype (already deployed + verified on Sourcify)
    agentRegistry: "0xf3B0d29416d3504c802bab4A799349746A37E788" as `0x${string}`,
    dealOrNotAgents: "0x12e23ff7954c62ae18959c5fd4aed6b51ebcd627" as `0x${string}`,
    agentStaking: "0xd46eba96e29e83952ec0ef74eed3c7eb1a4ba6b4" as `0x${string}`,
    seasonalLeaderboard: "0x13c3c750ed19c935567dcb54ee4e88ff6789001a" as `0x${string}`,
    predictionMarket: "0x05408be7468d01852002156a1b380e3953a502ee" as `0x${string}`,
    sharedPriceFeed: "0x91d8104e6e138607c00dd0bc132e1291a641c36d" as `0x${string}`,
  },
  [sepolia.id]: {
    gateway: "0x366215e1f493f3420abd5551c0618c2b28cbc18a" as `0x${string}`,
    priceFeed: "0x694AA1769357215DE4FAC081bf1f309aDC325306" as `0x${string}`, // Chainlink ETH/USD on Sepolia
  },
} as const;

// ── Chain Metadata ──

export const SUPPORTED_CHAINS = [baseSepolia, sepolia] as const;

export const CHAIN_META = {
  [baseSepolia.id]: {
    label: "Base Sepolia",
    shortLabel: "Base",
    color: "#0052FF",
    role: "home" as const, // Game runs here
  },
  [sepolia.id]: {
    label: "ETH Sepolia",
    shortLabel: "ETH",
    color: "#627EEA",
    role: "spoke" as const, // Cross-chain entry via Gateway
  },
} as const;

// ── CCIP Config ──

export const CCIP_EXPLORER_URL = "https://ccip.chain.link";

export function isHomeChain(chainId: number): boolean {
  return chainId === baseSepolia.id;
}

export function isSpokeChain(chainId: number): boolean {
  return chainId === sepolia.id;
}
