# Deal or NOT -- Convergence Package

**The production-grade successor to `prototype/`.** Real ETH, real Chainlink VRF, real CRE workflows -- all rewritten with proper separation of concerns.

## Why Convergence?

The `prototype/` package proved the concept: 5-case Deal or NOT with VRF randomness, CRE confidential compute, and Gemini AI banker. But it was a monolith -- one massive contract (`DealOrNotConfidential`) handling game logic, banking, price feeds, VRF, and CRE interactions all at once.

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
| No tests for banking/math | 4 test files, 47 tests | Full coverage |

## Contracts (Base Sepolia)

| Contract | Address |
|---|---|
| **DealOrNotQuickPlay** | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| **Bank** | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) |
| **SponsorVault** | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) |
| **BestOfBanker** | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |

## Architecture

```
Player Action          On-Chain Event              CRE Workflow
--------------         ----------------            ----------------
createGame()     -->   VRF request                 (Chainlink VRF callback ~10s)
pickCase()       -->   CaseSelected
openCase()       -->   CaseOpenRequested     -->   confidential-reveal (writes value)
                                              -->   sponsor-jackpot (optional)
                       RoundComplete          -->   banker-ai (Gemini offer + message)
                       BankerMessage          -->   save-quote (archives to BestOfBanker)
accept/reject    -->   DealAccepted/Rejected
keep/swap        -->   GameOver
```

## CRE Workflows

| Workflow | Trigger Event | What It Does |
|---|---|---|
| `confidential-reveal` | `CaseOpenRequested` | Decrypts VRF seed, computes case value, writes to contract |
| `banker-ai` | `RoundComplete` | Calls Gemini 2.5 Flash for personality offer, writes offer + message |
| `save-quote` | `BankerMessage` | Archives banker quote to BestOfBanker gallery |
| `sponsor-jackpot` | `CaseOpenRequested` | Adds jackpot bonus from sponsor funds (optional) |

All workflows run in CRE simulate mode. Configs are generated at runtime from env vars -- never committed.

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
| 5 | BankerOffer | Offer in -- Deal or NOT? |
| 6 | FinalRound | 2 cases left -- keep or swap |
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
for wf in workflows/confidential-reveal workflows/banker-ai workflows/save-quote workflows/sponsor-jackpot; do
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

**Rate limits:** The free Gemini API tier allows ~20 requests per minute. A full game uses 3-4 Gemini calls (one per banker round). If you hit 429 errors, the banker falls back to a generic message -- the offer math still works, just no AI personality. Wait 30s or use a paid key for back-to-back games.

## Tests

```bash
forge test
```

47 tests across 4 files:
- `Bank.t.sol` -- deposit, withdraw, sweeten, entry fee math
- `SponsorVault.t.sol` -- register, sponsor, jackpot, claim
- `PriceFeedHelper.t.sol` -- ETH/USD conversion
- `DealOrNotQuickPlay.t.sol` -- full game flow with mock VRF

## Deploying Fresh

```bash
source script/env.sh

# Deploy all contracts
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_KEY

# Set CRE forwarder on game contract (critical!)
cast send <NEW_GAME_ADDRESS> "setForwarder(address)" 0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5 \
  --private-key $DEPLOYER_KEY --rpc-url $RPC_URL

# Update addresses in script/env.sh
# Fund the bank
bash scripts/play-game.sh sweeten 0.01ether
```

## Migration from Prototype

This package is the home of the hackathon project going forward. As we validate each piece in convergence, functions migrate from `prototype/`:

- Game logic: migrated, rewritten as QuickPlay + libraries
- Bank: new standalone contract (prototype had inline banking)
- CRE workflows: migrated, configs now generated at runtime
- Frontend: still in `prototype/frontend/` for now (or `packages/nextjs/`)
- CCIP bridge: `DealOrNotGateway` + `DealOrNotBridge` -- contracts exist in `src/` but not yet deployed in convergence
