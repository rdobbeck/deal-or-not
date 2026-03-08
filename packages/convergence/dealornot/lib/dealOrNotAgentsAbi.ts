// Minimal ABI for DealOrNotAgents — read-only for spectating agent games
export const DEAL_OR_NOT_AGENTS_ABI = [
  {
    type: "function",
    name: "nextGameId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameState",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "agent", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "phase", type: "uint8" },
      { name: "playerCase", type: "uint8" },
      { name: "currentRound", type: "uint8" },
      { name: "totalCollapsed", type: "uint8" },
      { name: "bankerOffer", type: "uint256" },
      { name: "finalPayout", type: "uint256" },
      { name: "ethPerDollar", type: "uint256" },
      { name: "caseValues", type: "uint256[5]" },
      { name: "opened", type: "bool[5]" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRemainingValuePool",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
] as const;
