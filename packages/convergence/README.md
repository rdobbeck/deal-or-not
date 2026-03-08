# Deal or NOT: Convergence Package

The production-grade successor to `prototype/`. Real ETH, real Chainlink VRF, real CRE workflows, all rewritten with proper separation of concerns.

## For Judges

Direct links to each Chainlink integration:

- **VRF v2.5**: [`VRFManager.sol`](contracts/VRFManager.sol) + [`DealOrNotQuickPlay.sol:createGame()`](contracts/DealOrNotQuickPlay.sol)
- **CRE Confidential Compute**: [`confidential-reveal/main.ts`](workflows/confidential-reveal/main.ts)
- **CRE + Gemini AI (Confidential HTTP)**: [`banker-ai/main.ts`](workflows/banker-ai/main.ts) + [`banker-ai/gemini.ts`](workflows/banker-ai/gemini.ts)
- **CRE Autonomous Agents**: [`agent-gameplay-orchestrator/main.ts`](workflows/agent-gameplay-orchestrator/main.ts)
- **CRE Cron Timer**: [`game-timer/main.ts`](workflows/game-timer/main.ts)
- **Price Feeds**: [`PriceFeedHelper.sol`](contracts/PriceFeedHelper.sol) + [`SharedPriceFeed.sol`](contracts/SharedPriceFeed.sol)
- **CCIP**: [`DealOrNotBridge.sol`](contracts/DealOrNotBridge.sol) + [`DealOrNotGateway.sol`](contracts/DealOrNotGateway.sol)
- **Agent Registry + Staking**: [`AgentRegistry.sol`](contracts/AgentRegistry.sol) + [`AgentStaking.sol`](contracts/AgentStaking.sol)
- **Prediction Markets**: [`PredictionMarket.sol`](contracts/PredictionMarket.sol)

Verify on-chain (no setup needed):

```bash
# Bank active and funded?
cast call 0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB "isActive()(bool)" --rpc-url https://sepolia.base.org

# AI quotes saved?
cast call 0x55100EF4168d21631EEa6f2b73D6303Bb008F554 "quoteCount()(uint256)" --rpc-url https://sepolia.base.org

# Game 8 (complete E2E game):
cast call 0x46B6b547A4683ac5533CAce6aDc4d399b50424A7 \
  "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
  8 --rpc-url https://sepolia.base.org
```

## Why Convergence?

The `prototype/` package proved the concept: 5-case Deal or NOT with VRF randomness, CRE confidential compute, and Gemini AI banker. But it was a monolith, one massive contract (`DealOrNotConfidential`) handling game logic, banking, price feeds, VRF, and CRE interactions all at once.

**Convergence splits everything into focused, testable contracts:**

| Prototype | Convergence | What Changed |
|---|---|---|
| `DealOrNotConfidential.sol` (900+ lines) | `DealOrNotQuickPlay.sol` + 4 libraries | Game logic only, delegates to helpers |
| Banking logic inside game contract | `Bank.sol` | Standalone contract, sweetenable, ETH custody |
| Price feed inside game contract | `PriceFeedHelper.sol` | Reusable library |
| VRF inside game contract | `VRFManager.sol` | Reusable library |
| `SponsorJackpot.sol` (bundled) | `SponsorVault.sol` | Renamed, cleaner interface |
| `BestOfBanker.sol` | `BestOfBanker.sol` | Same concept, tighter integration |
| `BankerAlgorithm` (inline) | `BankerAlgorithm.sol` | Standalone library |
| `GameMath` (inline) | `GameMath.sol` | Standalone library |
| No agent infra | 6 agent contracts | Registry, Staking, Leaderboard, Markets |
| No tests for banking/math | 13 test suites, 244 tests | Full coverage |

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| **DealOrNotQuickPlay** | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| **Bank** | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) |
| **SponsorVault** | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) |
| **BestOfBanker** | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| **DealOrNotBridge** (CCIP hub) | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |
| **DealOrNotGateway** (ETH Sepolia, CCIP spoke) | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |

## Architecture

```
Player/Agent Action    On-Chain Event              CRE Workflow
-------------------    ----------------            ----------------
createGame()     -->   VRF request                 (Chainlink VRF callback ~10s)
pickCase()       -->   CasePicked
openCase()       -->   CaseOpenRequested     -->   confidential-reveal (writes value)
                                              -->   sponsor-jackpot (optional)
                       RoundComplete          -->   banker-ai (Gemini offer + message)
                       BankerMessage          -->   save-quote (archives to BestOfBanker)
accept/reject    -->   DealAccepted/Rejected
keep/swap        -->   GameOver
                                                    game-timer (cron: expire stale games)

AGENT FLOW (autonomous):
createAgentGame()-->   GameCreated             -->  agent-gameplay-orchestrator
                       VRFSeedReceived         -->    reads game state
                       CasePicked              -->    calls agent API (Confidential HTTP)
                       BankerOfferMade         -->    executes agent decision via writeReport
                       GameResolved            -->    records stats in AgentRegistry
```

## CRE Workflows (6 total)

| Workflow | Trigger | What It Does |
|---|---|---|
| `confidential-reveal` | Log: `CaseOpenRequested` | Fetches CRE entropy via Confidential HTTP, computes case value, writes to contract |
| `banker-ai` | Log: `RoundComplete` | Calls Gemini 2.5 Flash via Confidential HTTP for personality offer + message |
| `save-quote` | Log: `BankerMessage` | Archives banker quote to BestOfBanker gallery |
| `sponsor-jackpot` | Log: `CaseOpenRequested` | Adds jackpot bonus from sponsor funds (optional) |
| `agent-gameplay-orchestrator` | Log: multiple DealOrNotAgents events | Reads game state, calls agent API via Confidential HTTP, executes agent decision |
| `game-timer` | Cron: `*/5 * * * *` | Scans QuickPlay + Agents for stale games, calls expireGame() |

All workflows run in CRE simulate mode. Configs are generated at runtime by `cre-simulate.sh`, never committed.

## Playing a Game

### Quick Start

```bash
cd packages/convergence

# 1. Create a game ($0.25 entry fee in ETH)
bash scripts/play-game.sh create

# 2. Wait ~10s for VRF, check state
bash scripts/play-game.sh state <GID>

# 3. Pick your case
bash scripts/play-game.sh pick <GID> 2

# 4. Open a case
bash scripts/play-game.sh open <GID> 0
# --> prints TX hash

# 5. CRE reveal + banker
bash scripts/cre-simulate.sh reveal <TX> 0
bash scripts/cre-simulate.sh banker <REVEAL_TX> 1
bash scripts/cre-simulate.sh savequote <BANKER_TX> 0

# 6. Deal or NOT
bash scripts/play-game.sh reject <GID>    # NO DEAL
bash scripts/play-game.sh accept <GID>    # DEAL

# Repeat rounds, then final:
bash scripts/play-game.sh keep <GID>      # or swap
```

### Auto Mode (cre-simulate.sh support)

```bash
# Watches game state, auto-runs all CRE workflows
bash scripts/cre-simulate.sh support <GID>
```

### All play-game.sh Commands

| Command | Description |
|---|---|
| `create` | Create game ($0.25 entry) |
| `pick <GID> <CASE>` | Pick your case (0-4) |
| `open <GID> <CASE>` | Open a case |
| `accept <GID>` | Accept the deal |
| `reject <GID>` | Reject the deal |
| `keep <GID>` | Keep case (final) |
| `swap <GID>` | Swap case (final) |
| `state <GID>` | Show game state |
| `sweeten [AMOUNT]` | Fund the bank |
| `fee` | Estimate entry fee |

## Game Phases

| Phase | Name | Description |
|---|---|---|
| 0 | WaitingForVRF | VRF requested (~10s on Base Sepolia) |
| 1 | Created | Ready to pick a case |
| 2 | Round | Open cases this round |
| 3 | WaitingForCRE | Case opened, CRE revealing value |
| 4 | AwaitingOffer | Revealed, waiting for AI Banker |
| 5 | BankerOffer | Offer in. Deal or NOT? |
| 6 | FinalRound | 2 cases left, keep or swap |
| 7 | WaitingFinalCRE | Final reveal in progress |
| 8 | GameOver | Done |

## Setup

### Prerequisites

- [Foundry](https://book.getfoundry.sh/) (`forge`, `cast`)
- [CRE CLI](https://docs.chain.link/cre) (`cre login` first)
- [Bun](https://bun.sh/) for workflow dependencies
- Gemini API key (optional, for AI Banker personality)

### Install Workflow Dependencies

```bash
for wf in workflows/confidential-reveal workflows/banker-ai workflows/save-quote workflows/sponsor-jackpot workflows/agent-gameplay-orchestrator workflows/game-timer; do
  (cd "$wf" && bun install)
done
```

### Secrets

```bash
# Create workflows/.env (gitignored)
cat > workflows/.env << 'EOF'
GEMINI_API_KEY_ALL=<your-gemini-key>
CRE_SECRET_ALL=deal-or-not-enclave-entropy-v1
EOF
```

Without a Gemini key, the banker-ai workflow still computes offers but uses a fallback message.

**Rate limits:** The free Gemini API tier allows ~20 requests per hour. A full game uses 3 Gemini calls (one per banker round). Back-to-back games can exhaust the quota. If you hit 429 errors, the banker falls back to a generic message. The offer math still works, just no AI personality. Wait for the quota to reset or use a paid key.

## Tests

```bash
forge test          # all 244 tests
forge test --summary  # table view
```

244 tests across 13 suites:

| Suite | Tests |
|---|---|
| AgentRegistry | 33 |
| AgentStaking | 26 |
| Bank | 14 |
| DealOrNotAgents | 30 |
| DealOrNotBridge | 8 |
| DealOrNotGateway | 10 |
| DealOrNotQuickPlay | 12 |
| PredictionMarket | 14 |
| PredictionMarketPayout | 15 |
| PriceFeedHelper | 11 |
| SeasonalLeaderboard | 28 |
| SharedPriceFeed | 33 |
| SponsorVault | 10 |

## Deploying Fresh

```bash
source script/env.sh

# Deploy core contracts (Bank, QuickPlay, SponsorVault, BestOfBanker)
CRE_FORWARDER=0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
  forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Deploy agent infrastructure (Registry, DealOrNotAgents, Staking, Leaderboard, Markets, SharedPriceFeed)
BANK_ADDRESS=<bank> CRE_FORWARDER=0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
  forge script script/DeployAgentInfra.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Deploy CCIP bridge + gateway
DEAL_OR_NOT_ADDRESS=<game> \
  forge script script/DeployCCIP.s.sol:DeployBridge --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Update addresses in script/env.sh, fund the bank
bash scripts/play-game.sh sweeten 0.01ether
```

## CRE Simulate Commands

The `cre-simulate.sh` script generates configs from env vars at runtime and runs CRE workflows:

```bash
# Reveal a case value (after openCase tx)
bash scripts/cre-simulate.sh reveal <TX_HASH> [EVENT_INDEX]

# AI Banker offer (after round complete)
bash scripts/cre-simulate.sh banker <TX_HASH> [EVENT_INDEX]

# Save banker quote to gallery
bash scripts/cre-simulate.sh savequote <TX_HASH> [EVENT_INDEX]

# Agent gameplay orchestrator (DealOrNotAgents events)
bash scripts/cre-simulate.sh agent <TX_HASH> [EVENT_INDEX]

# Expire stale games (cron trigger)
bash scripts/cre-simulate.sh timer

# Auto-watch: polls game state, triggers workflows automatically
bash scripts/cre-simulate.sh support <GAME_ID> [POLL_INTERVAL]
```

## Contracts: 16 Total

**Core (4):** DealOrNotQuickPlay, Bank, SponsorVault, BestOfBanker
**Libraries (4):** VRFManager, PriceFeedHelper, BankerAlgorithm, GameMath
**CCIP (2):** DealOrNotBridge, DealOrNotGateway
**Agent Infra (6):** AgentRegistry, AgentStaking, DealOrNotAgents, SeasonalLeaderboard, PredictionMarket, SharedPriceFeed

## Frontend

The `dealornot/` directory contains a Next.js 16 frontend with 13 pages, entry fee hooks, and convergence contract addresses. See [`dealornot/README.md`](dealornot/README.md) for setup.
