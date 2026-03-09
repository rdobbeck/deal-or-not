"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type MockDataContextType = {
  useMockData: boolean;
  toggleMockData: () => void;
};

const MockDataContext = createContext<MockDataContextType>({
  useMockData: true,
  toggleMockData: () => {},
});

export function MockDataProvider({ children }: { children: ReactNode }) {
  const [useMockData, setUseMockData] = useState(
    process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true"
  );

  return (
    <MockDataContext.Provider
      value={{
        useMockData,
        toggleMockData: () => setUseMockData((prev) => !prev),
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
}

export function useMockDataToggle() {
  return useContext(MockDataContext);
}
