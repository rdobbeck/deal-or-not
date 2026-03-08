"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { baseSepolia, sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import {
  RainbowKitProvider,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import { type ReactNode, useState, useEffect } from "react";
import { MockDataProvider } from "@/contexts/MockDataContext";
import "@rainbow-me/rainbowkit/styles.css";

const config = createConfig({
  chains: [baseSepolia, sepolia],
  connectors: [
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(
      process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || "https://sepolia.base.org"
    ),
    [sepolia.id]: http(
      process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || "https://rpc.sepolia.org"
    ),
  },
  ssr: true,
});

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#8B5CF6",
            accentColorForeground: "white",
            borderRadius: "large",
            overlayBlur: "small",
          })}
          initialChain={baseSepolia}
        >
          <MockDataProvider>
            {mounted ? children : <div style={{ visibility: "hidden" }}>{children}</div>}
          </MockDataProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export { config };
