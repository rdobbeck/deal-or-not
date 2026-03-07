# Deal or NOT!

An on-chain game show powered by Chainlink. The name is the product: Deal Or Not = DON, running on the Chainlink DON (Decentralized Oracle Network). The Banker IS the DON.

Convergence: A Chainlink Hackathon (Feb 6 - Mar 8, 2026). Built by Ryan & Tippi Fifestarr.

## The Vision

Deal or NOT is not just a dApp. It is a live on-chain game show format.

The format: host a Discord livestream, run a lottery round where audience buys in via CCIP from any chain, select a contestant, play the game live with the AI Banker trash-talking in real time, audience watches cases open on the watch page. Sponsors buy per-round placement. Seasons with leaderboards, grand finales with accumulated jackpots.

This is why CCIP is core, not a stretch goal. Every spoke chain is a distribution channel and a potential sponsor.

## The Security Problem We Solved

On a blockchain, every storage slot is public. For Deal or No Deal, that is fatal. If a player can read case values, they can game the system. We [started this project at ETHDenver](https://devfolio.co/projects/deal-or-not-9c01) and tried three approaches before finding the right one:

1. **Fisher-Yates shuffle**: all values stored on-chain. Anyone can read them with `eth_getStorageAt`. Broken.
2. **ZK proofs (Groth16)**: host commits a Merkle root, proves values with ZK. But we shipped with a `MockGroth16Verifier` that accepts everything. Broken.
3. **Commit-reveal ("quantum collapse")**: values "don't exist" until opened via `hash(vrfSeed, caseIndex, blockhash)`. Sounds good, but the player can simulate the outcome after the commit block and abort if the result is bad. Cost of attack: ~$0.005 on Base. Broken.
4. **CRE Confidential Compute**: VRF seed on-chain for fairness + CRE-held secret for privacy + DON attestation for integrity. The player is missing a piece of the puzzle that only exists inside the CRE enclave. This is the solution.

These alternatives were not just insecure, they were slow to develop and hard to test. Chainlink CRE + VRF gave us fast development (CRE SDK, VRF callbacks, Price Feed helpers), real security guarantees, and a working E2E prototype in days.

The full technical journey is in [`Whitepaper.md`](Whitepaper.md).

## Five Chainlink Products

| Product | Role | Source | Deployed |
|---------|------|--------|----------|
| **VRF v2.5** | Provably random seed at game creation. Ensures fair case value derivation. | [`VRFManager.sol`](packages/convergence/src/VRFManager.sol), [`DealOrNotQuickPlay.sol`](packages/convergence/src/DealOrNotQuickPlay.sol) | [BaseScan](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| **CRE Confidential Compute** | Case values derived from `hash(vrfSeed, caseIndex, CRE_SECRET, bitmap)`. Player cannot precompute. | [`confidential-reveal/main.ts`](packages/convergence/workflows/confidential-reveal/main.ts) | Writes to [game contract](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| **CRE + Gemini 2.5 Flash** | AI Banker personality. Computes EV-based offer, calls Gemini for snarky messages. | [`banker-ai/main.ts`](packages/convergence/workflows/banker-ai/main.ts), [`gemini.ts`](packages/convergence/workflows/banker-ai/gemini.ts) | Writes to [game](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) + [BestOfBanker](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| **Price Feeds** | ETH/USD conversion for entry fees, payouts, $0.02 upvotes on BestOfBanker gallery. | [`PriceFeedHelper.sol`](packages/convergence/src/PriceFeedHelper.sol), [`BestOfBanker.sol`](packages/convergence/src/BestOfBanker.sol) | [Bank](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB), [BestOfBanker](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| **CCIP** | Cross-chain play. Start games from ETH Sepolia, execute on Base Sepolia. | [`DealOrNotGateway.sol`](packages/convergence/src/DealOrNotGateway.sol), [`DealOrNotBridge.sol`](packages/convergence/src/DealOrNotBridge.sol) | [Gateway (EtherScan)](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A), [Bridge (BaseScan)](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |

### CRE Workflows (4 total)

| Workflow | Trigger | What It Does |
|----------|---------|--------------|
| **confidential-reveal** | `CaseOpenRequested` | Reads VRF seed + game state, derives case value with CRE secret via Confidential HTTP, writes `fulfillCaseValue()` |
| **banker-ai** | `RoundComplete` | Computes EV-based offer, calls Gemini 2.5 Flash for personality message, writes offer + message to game contract |
| **save-quote** | `BankerMessage` | Archives banker quote to BestOfBanker gallery contract |
| **sponsor-jackpot** | `CaseOpenRequested` | Adds jackpot bonus from sponsor funds to player's game |

## Deployed Contracts (Convergence)

### Base Sepolia

| Contract | Address |
|----------|---------|
| **DealOrNotQuickPlay** | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| **Bank** | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) |
| **SponsorVault** | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) |
| **BestOfBanker** | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| **DealOrNotBridge** (CCIP hub) | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |

### ETH Sepolia

| Contract | Address |
|----------|---------|
| **DealOrNotGateway** (CCIP spoke) | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

### Chainlink Infrastructure

| Service | Address |
|---------|---------|
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| CRE Keystone Forwarder | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` |

## Architecture

```
                              CHAINLINK DON
                    +-----------------------------------+
                    |  CRE Workflows:                   |
                    |                                   |
                    |  confidential-reveal              |
                    |    VRF seed + CRE secret           |
                    |    -> fulfillCaseValue()            |
                    |                                   |
                    |  banker-ai                        |
                    |    EV offer + Gemini 2.5 Flash     |
                    |    -> setBankerOfferWithMessage()   |
                    |                                   |
                    |  save-quote                       |
                    |    -> saveQuote() (BestOfBanker)    |
                    |                                   |
                    |  sponsor-jackpot                  |
                    |    -> addToJackpot()                |
                    +----------------+------------------+
                                     | writeReport via
                                     | Keystone Forwarder
                                     v
  ETH Sepolia              BASE SEPOLIA
  +--------------+         +-----------------------------------+
  | Gateway      |  CCIP   | DealOrNotQuickPlay                |
  | (CCIP spoke) | ------> |   + VRF v2.5 + Price Feeds         |
  +--------------+         |   + Bank (standalone)              |
                           |                                   |
                           | SponsorVault . BestOfBanker        |
                           | DealOrNotBridge (CCIP hub)         |
                           +-----------------------------------+
                                          ^
                                          |
                                   +------+------+
                                   |  Frontend   |
                                   |  Next.js    |
                                   +-------------+
```

## Game Flow

```
createGame() --> VRF generates seed (~10s on Base Sepolia)
pickCase()   --> Choose your case (0-4)
openCase()   --> Emits CaseOpenRequested --> CRE reveals value
                                         --> CRE adds jackpot
             --> After reveal: RoundComplete --> CRE AI Banker
                   Gemini generates snarky message
                   Offer appears on-chain

Player decides: DEAL (acceptDeal) or NOT (rejectDeal)
  NOT -> next round -> openCase -> CRE reveal -> CRE banker -> repeat
  DEAL -> game over, payout settled from Bank

Final Round: 2 cases left -> keepCase() or swapCase()
  CRE reveals remaining values -> game over
```

## Quick Start for Judges

### Verify on-chain (no setup required)

```bash
# Check bank is active and funded
cast call 0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB "isActive()(bool)" --rpc-url https://sepolia.base.org

# Check BestOfBanker has AI quotes
cast call 0x55100EF4168d21631EEa6f2b73D6303Bb008F554 "quoteCount()(uint256)" --rpc-url https://sepolia.base.org

# Read a game state (game 8 is a complete game)
cast call 0x46B6b547A4683ac5533CAce6aDc4d399b50424A7 \
  "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
  8 --rpc-url https://sepolia.base.org
```

### Play a full game (requires Foundry + CRE CLI)

```bash
cd packages/convergence

# Create game, wait for VRF, pick case, open case, run CRE
bash scripts/play-game.sh create
bash scripts/play-game.sh state <GID>
bash scripts/play-game.sh pick <GID> 2
bash scripts/play-game.sh open <GID> 0
bash scripts/cre-simulate.sh reveal <TX> 0
bash scripts/cre-simulate.sh banker <REVEAL_TX> 1
bash scripts/play-game.sh reject <GID>
# ... repeat until final round
bash scripts/play-game.sh keep <GID>
```

### Run the frontend

```bash
cd prototype/frontend
npm install
npm run dev
# Visit http://localhost:3000
# Watch a game: http://localhost:3000/watch/8
```

## Project Structure

```
deal-or-not/
+-- packages/convergence/        # Production rewrite (active)
|   +-- src/                     # Solidity contracts (10 files)
|   +-- test/                    # Forge tests (47 tests)
|   +-- workflows/               # CRE workflows (4 total)
|   +-- scripts/                 # CLI game + CRE helpers
|   +-- script/                  # Forge deploy scripts
|
+-- prototype/                   # CRE Confidential prototype (original)
|   +-- contracts/               # Foundry, monolith contract
|   +-- frontend/                # Next.js frontend (shared)
|   +-- workflows/               # CRE workflows (original versions)
|   +-- scripts/                 # Testing scripts
|
+-- Whitepaper.md                # 4 approaches to hiding case values
+-- PRD.md                       # Product requirements
+-- HACKATHON.md                 # Hackathon submission details
|
+-- packages/foundry/            # ETHDenver legacy (ZK Mode)
+-- deal/                        # ETHDenver legacy (Brodinger's Case)
```

The `packages/convergence/` package is the production version. It splits the prototype monolith into focused, testable contracts. The `prototype/` package proved the concept. The `prototype/frontend/` is shared and points to convergence contract addresses.

## Origin: ETHDenver 2026

We [built the first version at ETHDenver](https://devfolio.co/projects/deal-or-not-9c01). Two separate game contracts (ZK Mode and Brodinger's Case), a working frontend, and good ideas, but neither approach was actually secure. The Chainlink Convergence hackathon gave us the right tool: CRE Confidential Compute. See [`Whitepaper.md`](Whitepaper.md) for the full analysis.

## Sponsor Technologies

- **Chainlink**: VRF v2.5 (fairness), CRE Confidential Compute (privacy), CRE HTTP + Gemini (AI Banker), Price Feeds (USD conversion), CCIP (cross-chain play)
- **Google Gemini**: Gemini 2.5 Flash for AI Banker personality via CRE HTTP consensus
- **Base**: Primary deployment chain (Base Sepolia)
- **Scaffold-ETH 2**: Development framework and UI components

## License

MIT
