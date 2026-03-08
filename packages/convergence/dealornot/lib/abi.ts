export const DEAL_OR_NOT_ABI = [
  // ── Read Functions ──
  {
    type: "function",
    name: "getGameState",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [
      { name: "host", type: "address" },
      { name: "player", type: "address" },
      { name: "mode", type: "uint8" },
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
    name: "nextGameId",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRemainingValuePool",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateBankerOffer",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "calculateBankerOfferFull",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "centsToWei",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "cents", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBanker",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "banker", type: "address" },
    ],
    outputs: [
      { name: "isAllowed", type: "bool" },
      { name: "isContract", type: "bool" },
      { name: "isHuman", type: "bool" },
      { name: "isBanned", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameSecret",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "verifyGame",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getGameCreatedAt",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NUM_CASES",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "NUM_ROUNDS",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "CASE_VALUES_CENTS",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "priceFeed",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "creForwarder",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },

  // ── Write Functions ──
  {
    type: "function",
    name: "estimateEntryFee",
    inputs: [],
    outputs: [
      { name: "baseWei", type: "uint256" },
      { name: "withSlippage", type: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createGame",
    inputs: [],
    outputs: [{ name: "gameId", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "pickCase",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "caseIndex", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "openCase",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "caseIndex", type: "uint8" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setBankerOffer",
    inputs: [
      { name: "gameId", type: "uint256" },
      { name: "offerCents", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "acceptDeal",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "rejectDeal",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "keepCase",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "swapCase",
    inputs: [{ name: "gameId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },

  // ── Events ──
  {
    type: "event",
    name: "GameCreated",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "host", type: "address", indexed: true },
      { name: "mode", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VRFSeedReceived",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "CasePicked",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "caseIndex", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CaseOpenRequested",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "caseIndex", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CaseRevealed",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "caseIndex", type: "uint8", indexed: false },
      { name: "valueCents", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RoundComplete",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BankerOfferMade",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: false },
      { name: "offerCents", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DealAccepted",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "payoutCents", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "DealRejected",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "round", type: "uint8", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FinalCaseRequested",
    inputs: [{ name: "gameId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "GameResolved",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "payoutCents", type: "uint256", indexed: false },
      { name: "swapped", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameSecretPublished",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "secret", type: "bytes32", indexed: false },
    ],
  },

  {
    type: "event",
    name: "GameExpired",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "BankerMessage",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "message", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PlayerJoinedCrossChain",
    inputs: [
      { name: "gameId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
    ],
  },

  // ── Errors ──
  { type: "error", name: "WrongPhase", inputs: [{ name: "expected", type: "uint8" }, { name: "actual", type: "uint8" }] },
  { type: "error", name: "GameNotActive", inputs: [] },
  { type: "error", name: "GameNotExpired", inputs: [] },
  { type: "error", name: "NotPlayer", inputs: [] },
  { type: "error", name: "NotHost", inputs: [] },
  { type: "error", name: "NotAllowedBanker", inputs: [] },
  { type: "error", name: "NotCREForwarder", inputs: [] },
  { type: "error", name: "InvalidCase", inputs: [{ name: "index", type: "uint8" }] },
  { type: "error", name: "CaseAlreadyOpened", inputs: [{ name: "index", type: "uint8" }] },
  { type: "error", name: "CannotOpenOwnCase", inputs: [] },
  { type: "error", name: "InvalidValue", inputs: [] },
  { type: "error", name: "GameNotOver", inputs: [] },
  { type: "error", name: "SecretAlreadyPublished", inputs: [] },
  { type: "error", name: "SecretVerificationFailed", inputs: [] },
  { type: "error", name: "NotCCIPBridge", inputs: [] },
  { type: "error", name: "GameAlreadyHasPlayer", inputs: [] },
  { type: "error", name: "MessageTooLong", inputs: [] },
] as const;
