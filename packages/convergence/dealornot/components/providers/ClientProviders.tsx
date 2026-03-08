"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

const ApolloProvider = dynamic(
  () => import("@/components/providers/ApolloProvider"),
  { ssr: false }
);
const Web3Provider = dynamic(
  () => import("@/components/providers/Web3Provider"),
  { ssr: false }
);
const Nav = dynamic(() => import("@/components/Nav"), { ssr: false });

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ApolloProvider>
      <Web3Provider>
        <Nav />
        {children}
        <Toaster position="top-right" theme="dark" />
      </Web3Provider>
    </ApolloProvider>
  );
}
