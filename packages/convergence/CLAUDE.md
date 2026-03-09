# CLAUDE.md — Convergence Package

This is the production package for **Deal or NOT**, an on-chain game show powered by Chainlink. AI agents working here should read this before making changes.

## Package Layout

```
packages/convergence/
├── contracts/          # 16 Solidity contracts (source of truth)
├── test/               # Forge tests (246 tests, 13 suites)
├── script/             # Forge deploy scripts + env.sh
├── scripts/            # Bash CLI tools (play-game, play-agent, cre-simulate, e2e-full)
├── workflows/          # 7 CRE TypeScript workflows
├── dealornot/          # Next.js 16 frontend (separate app)
└── foundry.toml        # Forge config
```

There is also `prototype/` at the repo root — the original monolith. The convergence package rewrites it with proper separation of concerns. The `prototype/frontend/` is the legacy frontend; `dealornot/` is the new one.

## Contracts (16 total)

**Core game (4):** DealOrNotQuickPlay, Bank, SponsorVault, BestOfBanker
**Libraries (4):** VRFManager, PriceFeedHelper, BankerAlgorithm, GameMath
**CCIP (2):** DealOrNotBridge (Base Sepolia hub), DealOrNotGateway (ETH Sepolia spoke)
**Agent infra (6):** AgentRegistry, AgentStaking, DealOrNotAgents, SeasonalLeaderboard, PredictionMarket, SharedPriceFeed

All contracts live in `contracts/`. Tests in `test/`. Deployed addresses in `script/env.sh`.

### Key Contract Functions

**DealOrNotQuickPlay** — human game contract:
- `createGame()` payable — $0.25 entry fee, requests VRF
- `pickCase(uint256 gameId, uint8 caseIndex)` — choose your case (0-4)
- `openCase(uint256 gameId, uint8 caseIndex)` — open a case, emits `CaseOpenRequested`
- `acceptDeal(uint256 gameId)` — take the banker's offer
- `rejectDeal(uint256 gameId)` — reject, next round
- `keepCase(uint256 gameId)` / `swapCase(uint256 gameId)` — final decision
- `getGameState(uint256)` returns 12 values: `(host, player, mode, phase, playerCase, currentRound, totalCollapsed, bankerOffer, finalPayout, ethPerDollar, caseValues[5], opened[5])`
- `estimateEntryFee()` returns `(baseWei, withSlippage)`

**DealOrNotAgents** — agent game variant:
- `createAgentGame(address agentAddress)` payable
- `getGameState(uint256)` returns 11 values: `(agent, agentId, phase, playerCase, currentRound, totalCollapsed, bankerOffer, finalPayout, ethPerDollar, caseValues[5], opened[5])`

**Bank** — ETH custody:
- `sweeten()` payable — fund the bank
- `isActive()` — true when funded above minimum
- Entry fees flow: player → game contract → Bank
- Payouts flow: Bank → player (via game contract calling `payPlayer`)

**PriceFeedHelper** — library for ETH/USD conversions:
- `usdToWei(feed, usdCents)` / `weiToUsd(feed, weiAmount)`
- `snapshotPrice(feed)` → `ethPerDollar` (locks rate at game start)
- `centsToWeiSnapshot(cents, ethPerDollar)` — pure, uses locked rate

**SharedPriceFeed** — deployed singleton wrapping PriceFeedHelper:
- Same functions but callable as a contract: `usdToWei(usdCents)`, `weiToUsd(weiAmount)`, `getEthUsdPrice()`, `snapshotPrice()`, `isFresh(maxStaleness)`, `lastUpdatedAt()`
- Address: `0x9AB27e309E677c0ec488E37E8F3B193958D2bBc7`

## Scripts

All scripts source `script/env.sh` for contract addresses and keys. Scripts are modular — each can run standalone or be composed by other scripts.

### Game Scripts (play actions on-chain)

| Script | Purpose | Example |
|--------|---------|---------|
| `scripts/play-game.sh` | Human game CLI | `bash scripts/play-game.sh create` |
| `scripts/play-agent.sh` | Agent game CLI | `bash scripts/play-agent.sh info` |

**play-game.sh:** `create`, `pick <GID> <CASE>`, `open <GID> <CASE>`, `accept <GID>`, `reject <GID>`, `keep <GID>`, `swap <GID>`, `state <GID>`, `sweeten [AMOUNT]`, `fee`

**play-agent.sh:** `register <NAME> <ENDPOINT> [METADATA]`, `create [AGENT_ADDR]`, `state <GID>`, `info [ADDR]`, `stake <AGENT_ID> <AMOUNT>`, `leaderboard`

### CRE Script (runs Chainlink CRE workflows)

| Script | Purpose | Example |
|--------|---------|---------|
| `scripts/cre-simulate.sh` | Run CRE workflows | `bash scripts/cre-simulate.sh reveal <TX> 0` |

**Commands:** `reveal <TX> [IDX]`, `banker <TX> [IDX]`, `savequote <TX> [IDX]`, `jackpot <TX> [IDX]`, `agent <TX> [IDX]`, `market <TX> [IDX]`, `timer`, `support <GID> [POLL]`

### Diagnostic Scripts (test infrastructure without playing)

| Script | Purpose | Example |
|--------|---------|---------|
| `scripts/test-price-feed.sh` | Price feed conversions + staleness | `bash scripts/test-price-feed.sh` |
| `scripts/test-vrf.sh` | VRF coordinator + game VRF state | `bash scripts/test-vrf.sh wait <GID>` |
| `scripts/test-ccip.sh` | CCIP bridge/gateway wiring + costs | `bash scripts/test-ccip.sh wiring` |

**test-price-feed.sh:** `price`, `convert`, `snapshot`, `freshness`, `all`
**test-vrf.sh:** `coordinator`, `game <GID>`, `wait <GID>`, `all`
**test-ccip.sh:** `wiring`, `cost <GID>`, `status <GID>`, `all`

### E2E Test Runner (orchestrates full game flow)

| Script | Purpose | Example |
|--------|---------|---------|
| `scripts/e2e-full.sh` | Full E2E on live testnet | `bash scripts/e2e-full.sh game` |

**Modes:** `game` (full 3-round game + CRE), `ccip` (cross-chain join), `all`

### Script Architecture (vs Prototype)

The prototype used 6 separate CRE scripts (`cre-reveal.sh`, `cre-banker.sh`, etc.) with hardcoded configs. Convergence fixed this:

- **Config generation**: `cre-simulate.sh` generates workflow configs from env vars at runtime, deletes them on exit via `trap`. No config files committed.
- **Nonce collision fix**: Prototype's `cre-banker.sh` did 2 `writeReport` calls (offer + save-quote) in one workflow, causing nonce collisions. Convergence splits this into separate `banker` and `savequote` workflows with independent nonces.
- **Gemini key safety**: Prototype modified `config.staging.json` in place (crash = leaked key). Convergence generates configs in memory, guaranteed cleanup.
- **Consolidation**: 6 scripts → 1 `cre-simulate.sh` with 8 subcommands. Shared error handling and logging.

## CRE Workflows (7 total)

All in `workflows/`. Each has `main.ts`, `package.json`, `tsconfig.json`. Install deps with `bun install` in each.

| Workflow | Trigger Event | Action |
|----------|--------------|--------|
| `confidential-reveal` | `CaseOpenRequested` | Derives case value from VRF seed + CRE secret, writes `fulfillCaseValue()` |
| `banker-ai` | `RoundComplete` | Calls Gemini 2.5 Flash for offer + personality message |
| `save-quote` | `BankerMessage` | Archives banker quote to BestOfBanker |
| `sponsor-jackpot` | `CaseOpenRequested` | Adds jackpot bonus from sponsor funds |
| `market-creator` | `GameCreated` (Agents) | Auto-creates 3 prediction markets per agent game via `createMarketBatch()` |
| `agent-gameplay-orchestrator` | DealOrNotAgents events | Autonomous agent gameplay via Confidential HTTP |
| `game-timer` | Cron `*/5 * * * *` | Expires stale games |

**CRE gotcha:** `encryptOutput` goes inside the `request` object (field 9 of HTTPRequest), NOT on the outer ConfidentialHTTPRequest.

## Game Phases

| Phase | Name | Next Action |
|-------|------|-------------|
| 0 | WaitingForVRF | Wait ~10s for Chainlink VRF callback |
| 1 | Created | `pickCase()` |
| 2 | Round | `openCase()` |
| 3 | WaitingForCRE | CRE revealing value (~5s) |
| 4 | AwaitingOffer | CRE computing banker offer (~5-10s) |
| 5 | BankerOffer | `acceptDeal()` or `rejectDeal()` |
| 6 | FinalRound | `keepCase()` or `swapCase()` |
| 7 | WaitingFinalCRE | Final reveal in progress |
| 8 | GameOver | Done |

## Money Flow

1. Player calls `createGame()` with $0.25 in ETH → forwarded to Bank
2. If DEAL: Bank pays player the banker's offer amount
3. If NO DEAL through all rounds → `keepCase()` or `swapCase()`: Bank pays the final case value
4. Price is locked at game start via `snapshotPrice()` so settlement uses the same ETH/USD rate

## Frontend (dealornot/)

Next.js 16, React 19, Tailwind CSS 4, wagmi v2, viem v2, RainbowKit.

```bash
cd dealornot && bun install && bun run dev
```

Key pages: `/` (home), `/play` (game lobby + active games), `/play/[gameId]` (play a game), `/watch` (spectator lobby), `/watch/[id]` (spectator view), `/agents` (AI agent list), `/agents/register`, `/markets` (prediction markets — toggle Mock/Live On-Chain), `/best-of-banker` (AI quote gallery).

E2E tests: `bun run test:e2e` (Playwright, specs in `dealornot/e2e/`).

## Environment

- `script/env.sh` — all contract addresses, keys, RPC URLs, event topics
- `.env` (gitignored) — deployer/player private keys
- `workflows/.env` (gitignored) — `GEMINI_API_KEY_ALL`, `CRE_SECRET_ALL`
- `dealornot/.env.local` (gitignored) — `NEXT_PUBLIC_ALCHEMY_RPC_URL`

## Testing

```bash
# Solidity (244 tests)
forge test
forge test --summary

# Frontend E2E (Playwright)
cd dealornot && bun run test:e2e

# Live testnet: full game
bash scripts/play-game.sh create
# ... (see README.md for full walkthrough)

# Price feed diagnostics
bash scripts/test-price-feed.sh
```

## Common Pitfalls

- **VRF timing**: ~10s on Base Sepolia. Don't poll faster than 3s.
- **Gemini rate limits**: Free tier = 20 requests/hour. 3 calls per game.
- **CRE nonce collision**: Two writeReports in one workflow can share a nonce. Known issue with BestOfBanker saves.
- **getGameState return values**: QuickPlay has 12 fields (includes host+player+mode), Agents has 11 fields (agent+agentId, no host/mode). The phase field is at index 3 (QuickPlay) or index 2 (Agents).
- **env.sh doesn't persist across Bash tool calls**: Always inline `source script/env.sh && ...` or use the scripts which source it internally.
- **Price feed staleness**: Default 3600s (1 hour). SharedPriceFeed will revert with `StalePriceFeed()` if the oracle hasn't updated.
