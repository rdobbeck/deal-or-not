# Convergence Upgrade Plan

Status as of March 7, 2026 (hackathon deadline: March 8).

## Current State

### Core Game (complete)
- `DealOrNotQuickPlay.sol` + 4 libraries (Bank, BankerAlgorithm, GameMath, PriceFeedHelper, VRFManager)
- 47 forge tests across 4 test files, all passing
- 8+ games played E2E on Base Sepolia (game IDs 1-8)
- VRF callback: ~10s on Base Sepolia

### Bank (complete)
- Standalone `Bank.sol`, active and funded
- Entry fee: $0.25 in ETH via Price Feed
- Sweetenable by anyone, settles payouts to players automatically
- Authorized game pattern for access control

### SponsorVault (complete)
- Ceptor Club registered as sponsor
- Jackpot accumulation verified per case opening
- CRE sponsor-jackpot workflow triggers on `CaseOpenRequested`

### BestOfBanker (complete)
- 10+ quotes saved on-chain from AI Banker rounds
- Upvoting works ($0.02 in ETH via Price Feed)
- CRE save-quote workflow archives quotes automatically

### CRE Workflows (4 running)
| Workflow | Status | Trigger |
|----------|--------|---------|
| confidential-reveal | Working | CaseOpenRequested |
| banker-ai | Working | RoundComplete |
| save-quote | Working | BankerMessage |
| sponsor-jackpot | Working | CaseOpenRequested |

All workflows run in CRE simulate mode with `--broadcast`. Configs are generated at runtime from `env.sh`, never committed.

### CCIP (deployed March 7)
| Contract | Chain | Address |
|----------|-------|---------|
| DealOrNotBridge | Base Sepolia | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |
| DealOrNotGateway | ETH Sepolia | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

Fully wired: Bridge -> Gateway, Gateway -> Bridge, Game -> Bridge (`setCCIPBridge` called). The game contract's `joinGameCrossChain` function is ready. Cross-chain `enterGame()` flow not yet tested E2E (CCIP message delivery takes 5-20 minutes). Test with `bash scripts/e2e-full.sh ccip`.

### Frontend (wired)
- `prototype/frontend/` points to convergence contract addresses
- Watch page (`/watch/[id]`) shows live game state, phase transitions, banker offers
- `npm run build` passes clean

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| DealOrNotQuickPlay | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| Bank | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) |
| SponsorVault | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) |
| BestOfBanker | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| DealOrNotBridge | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |
| DealOrNotGateway (ETH Sepolia) | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

## Agent Contracts (separate branch)

These contracts are being developed and tested in another branch:

- **AgentRegistry**:register agents with API endpoints, track performance stats
- **AgentStaking**:users stake ETH on agents, share in winnings
- **SeasonalLeaderboard**:monthly tournaments with points and prize distribution
- **PredictionMarket**:bet on agent outcomes (will win, earnings over X, etc.)

Plan: once validated, bring into convergence or update contract references. These contracts are standalone and do not require changes to the core game.

## Not Yet Ported

- **game-timer CRE workflow**:cron-based game expiry. Low priority since game expiry is rare in practice.
- **12-case game contract**:PRD-12.md design exists but implementation not started. Would be a separate contract (DealOrNotFullShow) reusing Bank, SponsorVault, and BestOfBanker.
- **CCIP E2E test**: Bridge, Gateway, and game contract are fully wired. Needs a live test with `bash scripts/e2e-full.sh ccip` (CCIP delivery takes 5-20 min).

## Roadmap

### Phase 1: QuickPlay (now)
Single player, 5-case game. CLI + web spectator. VRF + CRE + Gemini + Price Feeds + CCIP contracts deployed.

### Phase 2: Full Show (12-case)
12 cases, 6 rounds, lottery for contestant selection. PRD-12.md design exists. Reuses Bank, SponsorVault, BestOfBanker.

### Phase 3: Live Game Show
Discord livestream format. CCIP cross-chain entry from any spoke chain. Sponsor placements per round (Arbitrum sponsors Round 3, Optimism sponsors the Final Reveal).

### Phase 4: Seasons
SeasonalLeaderboard with monthly tournaments. Grand finales with accumulated jackpots. Agent tournaments.

### Phase 5: Agent Economy
Agent Registry + Staking live. Prediction market sidebar. x402 agent monetization for premium decision APIs.

Each phase builds on what exists. The contracts are modular (Bank, SponsorVault, BestOfBanker are all standalone) so new game modes reuse them without modification.
