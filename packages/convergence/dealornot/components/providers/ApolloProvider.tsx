"use client";

import { ApolloProvider as ApolloClientProvider } from "@apollo/client/react";
import { apolloClient } from "@/lib/apollo";
import { ReactNode } from "react";

export default function ApolloProvider({ children }: { children: ReactNode }) {
  return (
    <ApolloClientProvider client={apolloClient}>
      {children}
    </ApolloClientProvider>
  );
}
