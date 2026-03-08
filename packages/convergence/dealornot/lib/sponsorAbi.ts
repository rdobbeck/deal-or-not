export const SPONSOR_JACKPOT_ABI = [
  // ── Read ──
  {
    type: "function",
    name: "getJackpot",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameSponsorInfo",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "logoUrl", type: "string" },
      { name: "sponsorAddr", type: "address" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSponsorBalance",
    inputs: [{ name: "sponsor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "jackpots",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "claimed",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "gameSponsor",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },

  // ── Write ──
  {
    type: "function",
    name: "registerSponsor",
    inputs: [
      { name: "name", type: "string" },
      { name: "logoUrl", type: "string" },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "topUp",
    inputs: [],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "sponsorGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claimJackpot",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ── Events ──
  {
    type: "event",
    name: "SponsorRegistered",
    inputs: [
      { name: "sponsor", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "logoUrl", type: "string", indexed: false },
      { name: "deposit", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameSponsored",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JackpotIncreased",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "amountCents", type: "uint256", indexed: false },
      { name: "newTotal", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "JackpotClaimed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "cents", type: "uint256", indexed: false },
      { name: "weiPaid", type: "uint256", indexed: false },
    ],
  },
] as const;
