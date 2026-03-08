import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

// TODO: Update with your deployed subgraph URL after deployment
const SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_SUBGRAPH_URL ||
  "https://api.studio.thegraph.com/query/<SUBGRAPH_ID>/deal-or-not/v1.0.0";

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: SUBGRAPH_URL,
  }),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          markets: {
            // Enable pagination
            keyArgs: ["where", "orderBy", "orderDirection"],
            merge(existing = [], incoming) {
              return [...existing, ...incoming];
            },
          },
          bets: {
            keyArgs: ["where", "orderBy", "orderDirection"],
            merge(existing = [], incoming) {
              return [...existing, ...incoming];
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: "cache-and-network",
      errorPolicy: "all",
    },
    query: {
      fetchPolicy: "cache-first",
      errorPolicy: "all",
    },
  },
});
