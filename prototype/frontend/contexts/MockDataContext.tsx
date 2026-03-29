"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

type MockDataContextType = {
  useMockData: boolean;
  toggleMockData: () => void;
  autoDetected: boolean;
};

const MockDataContext = createContext<MockDataContextType>({
  useMockData: true,
  toggleMockData: () => {},
  autoDetected: false,
});

// Check if real markets exist onchain
async function detectRealMarkets(): Promise<boolean> {
  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http("https://sepolia.base.org"),
    });

    // Check if PredictionMarket contract has any markets
    const PREDICTION_MARKET_ADDRESS = "0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4";

    const data = await client.readContract({
      address: PREDICTION_MARKET_ADDRESS as `0x${string}`,
      abi: [
        {
          inputs: [],
          name: "nextMarketId",
          outputs: [{ type: "uint256" }],
          stateMutability: "view",
          type: "function",
        },
      ],
      functionName: "nextMarketId",
    });

    const marketCount = Number(data);

    // If nextMarketId > 1, real markets exist
    return marketCount > 1;
  } catch (error) {
    console.warn("[MockDataContext] Failed to detect real markets:", error);
    return false; // Default to mock data if detection fails
  }
}

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [useMockData, setUseMockData] = useState(true);
  const [autoDetected, setAutoDetected] = useState(false);

  useEffect(() => {
    // Auto-detect real markets on mount
    detectRealMarkets().then((hasRealMarkets) => {
      if (hasRealMarkets) {
        console.log("[MockDataContext] ✓ Real markets detected, switching to Live On-Chain");
        setUseMockData(false);
        setAutoDetected(true);
      } else {
        console.log("[MockDataContext] No real markets found, using Mock Data");
        setAutoDetected(true);
      }
    });
  }, []);

  return (
    <MockDataContext.Provider
      value={{
        useMockData,
        toggleMockData: () => setUseMockData((prev) => !prev),
        autoDetected,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
}

export function useMockDataToggle() {
  return useContext(MockDataContext);
}
