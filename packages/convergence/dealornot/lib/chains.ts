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
    // Agent infra (convergence deployment)
    agentRegistry: "0x2eDE9C65F4Ff33F4190aee798478bb579f248F52" as `0x${string}`,
    dealOrNotAgents: "0xa04cF1072A33B3FF4aB6bb1E054e69e66BaD5430" as `0x${string}`,
    agentStaking: "0xaFb6D74eD5286158312163671E93fba8A6Fd058e" as `0x${string}`,
    seasonalLeaderboard: "0x2C91eF4616f7D4386F27C237D77169395e9EfCE0" as `0x${string}`,
    predictionMarket: "0x1B995CC591Ec168df03339Fae74B0752Aa1259d8" as `0x${string}`,
    sharedPriceFeed: "0x9AB27e309E677c0ec488E37E8F3B193958D2bBc7" as `0x${string}`,
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
