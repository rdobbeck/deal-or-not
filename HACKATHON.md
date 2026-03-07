# Chainlink Convergence Hackathon Submission

Deal or NOT! On-chain Deal or No Deal with AI Banker, Cross-Chain Play, and Confidential Compute.

## What Chainlink Solved

On a blockchain, every storage slot is public. For a game like Deal or No Deal, that is fatal. We tried three approaches before CRE:

1. Fisher-Yates shuffle: values readable with `eth_getStorageAt`
2. ZK proofs: shipped with `MockGroth16Verifier` that accepts everything
3. Commit-reveal: player can simulate outcomes and abort (~$0.005 per attempt)

CRE Confidential Compute solved it. VRF seed on-chain for fairness, CRE-held secret for privacy, DON attestation for integrity. The player is missing a piece of the puzzle that only exists inside the enclave.

The key insight: these alternatives were not just insecure, they were slow to build and hard to test. CRE + VRF gave us fast development, real security guarantees, and a working E2E prototype in days. Full analysis in [`Whitepaper.md`](Whitepaper.md).

---

## Multi-Track Qualification

| Track | Qualification |
|-------|---------------|
| CRE & AI | 4 production CRE workflows + Gemini AI banker |
| Privacy | CRE Confidential Compute for case values |
| Cross-Chain (CCIP) | Bridge + Gateway deployed, cross-chain entry flow wired |

---

## Track: CRE & AI

### 4 Production Workflows (all E2E tested on Base Sepolia)

**1. confidential-reveal**
- Trigger: `CaseOpenRequested` (EVM Log)
- Compute: `collapse(vrfSeed, caseIndex, SECRET, bitmap)` using Confidential HTTP for enclave-only entropy
- Action: `writeReport` -> `fulfillCaseValue()`
- Source: [`confidential-reveal/main.ts`](packages/convergence/workflows/confidential-reveal/main.ts)

**2. banker-ai**
- Trigger: `RoundComplete` (EVM Log)
- Compute: EV calculation + Gemini 2.5 Flash API call via CRE Confidential HTTP
- Action: `writeReport` -> game contract (offer + message)
- Source: [`banker-ai/main.ts`](packages/convergence/workflows/banker-ai/main.ts), [`gemini.ts`](packages/convergence/workflows/banker-ai/gemini.ts)

**3. save-quote**
- Trigger: `BankerMessage` (EVM Log)
- Compute: Extract quote text and game context
- Action: `writeReport` -> `BestOfBanker.saveQuote()`
- Source: [`save-quote/main.ts`](packages/convergence/workflows/save-quote/main.ts)

**4. sponsor-jackpot**
- Trigger: `CaseOpenRequested` (EVM Log)
- Compute: Calculate jackpot amount from sponsor funds
- Action: `writeReport` -> `SponsorVault.addToJackpot()`
- Source: [`sponsor-jackpot/main.ts`](packages/convergence/workflows/sponsor-jackpot/main.ts)

### Five Chainlink Services

| Service | Usage | Source | Deployed |
|---------|-------|--------|----------|
| VRF v2.5 | Fair random seed for case shuffle | [`DealOrNotQuickPlay.sol`](packages/convergence/src/DealOrNotQuickPlay.sol) | [BaseScan](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| Price Feeds | ETH/USD conversion, $0.02 upvotes | [`PriceFeedHelper.sol`](packages/convergence/src/PriceFeedHelper.sol), [`BestOfBanker.sol`](packages/convergence/src/BestOfBanker.sol) | [BaseScan](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| CRE Keystone | 4 autonomous workflows | [`workflows/`](packages/convergence/workflows/) | Triggers on [game contract](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| CRE Confidential HTTP | Secret entropy for case values, Gemini API key protection | [`confidential-reveal/`](packages/convergence/workflows/confidential-reveal/main.ts), [`banker-ai/`](packages/convergence/workflows/banker-ai/main.ts) | Writes to [game contract](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| CCIP | Cross-chain game joins | [`DealOrNotGateway.sol`](packages/convergence/src/DealOrNotGateway.sol), [`DealOrNotBridge.sol`](packages/convergence/src/DealOrNotBridge.sol) | [Gateway (EtherScan)](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A), [Bridge (BaseScan)](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |

### Evidence

- DealOrNotQuickPlay: [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) (Base Sepolia)
- BestOfBanker: [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) (Base Sepolia)
- 10+ AI banker quotes saved on-chain (verify: `cast call 0x55100EF4168d21631EEa6f2b73D6303Bb008F554 "quoteCount()(uint256)" --rpc-url https://sepolia.base.org`)
- 8 games played E2E through all CRE workflows

---

## Track: Privacy

### The Problem

Players must not be able to read case values before opening them. On a public blockchain, `eth_getStorageAt` reads any storage slot. Commit-reveal schemes fail because the player can simulate outcomes after the commit block and abort if unfavorable.

### Our Solution: CRE Confidential Compute

```
Player calls openCase(caseIndex)     [on-chain, no secret revealed]
  |
Emit CaseOpenRequested               [public event, CRE listening]
  |
CRE Enclave:
  1. Fetch entropy via Confidential HTTP (enclave-only, not visible to nodes)
  2. Compute: value = collapse(vrfSeed, caseIndex, CRE_ENTROPY, bitmap)
  3. Generate DON attestation
  |
CRE writeReport: fulfillCaseValue(gameId, caseIndex, value)
  |
Game contract: verify value is valid and unused, store on-chain
```

Properties:
- Fairness: VRF seed is publicly verifiable (Chainlink VRF v2.5)
- Privacy: CRE entropy never leaves the enclave, fetched via Confidential HTTP
- Integrity: DON attestation proves correct computation
- One TX per round, no commit-reveal delay

---

## Track: Cross-Chain (CCIP)

### Deployed Contracts

| Contract | Chain | Address |
|----------|-------|---------|
| DealOrNotBridge (CCIP hub) | Base Sepolia | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |
| DealOrNotGateway (CCIP spoke) | ETH Sepolia | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

### How It Works

Players on ETH Sepolia call `gateway.enterGame(gameId)` with entry fee + CCIP fee. The Gateway sends a CCIP message to the Bridge on Base Sepolia, which calls `joinGameCrossChain()` on the game contract. Entry fee is calculated using the ETH/USD Price Feed on the source chain.

This architecture scales to any number of spoke chains. Each spoke is a distribution channel and a potential sponsor.

---

## All Deployed Contracts

### Convergence (production, active)

| Contract | Chain | Address |
|----------|-------|---------|
| DealOrNotQuickPlay | Base Sepolia | [`0x46B6b547A4683ac5533CAce6aDc4d399b50424A7`](https://sepolia.basescan.org/address/0x46B6b547A4683ac5533CAce6aDc4d399b50424A7) |
| Bank | Base Sepolia | [`0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB`](https://sepolia.basescan.org/address/0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB) |
| SponsorVault | Base Sepolia | [`0x14a26cb376d8e36c47261A46d6b203A7BaADaE53`](https://sepolia.basescan.org/address/0x14a26cb376d8e36c47261A46d6b203A7BaADaE53) |
| BestOfBanker | Base Sepolia | [`0x55100EF4168d21631EEa6f2b73D6303Bb008F554`](https://sepolia.basescan.org/address/0x55100EF4168d21631EEa6f2b73D6303Bb008F554) |
| DealOrNotBridge | Base Sepolia | [`0xB233eFD1623f843151C97a1fB32f9115AaE6a875`](https://sepolia.basescan.org/address/0xB233eFD1623f843151C97a1fB32f9115AaE6a875) |
| DealOrNotGateway | ETH Sepolia | [`0x366215E1F493f3420AbD5551c0618c2B28CBc18A`](https://sepolia.etherscan.io/address/0x366215E1F493f3420AbD5551c0618c2B28CBc18A) |

### Prototype (original, for reference)

| Contract | Chain | Address |
|----------|-------|---------|
| DealOrNotConfidential | Base Sepolia | [`0xd9D4A974021055c46fD834049e36c21D7EE48137`](https://sepolia.basescan.org/address/0xd9D4A974021055c46fD834049e36c21D7EE48137) |
| SponsorJackpot | Base Sepolia | [`0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95`](https://sepolia.basescan.org/address/0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95) |
| BestOfBanker | Base Sepolia | [`0x05EdC924f92aBCbbB91737479948509dC7E23bF9`](https://sepolia.basescan.org/address/0x05EdC924f92aBCbbB91737479948509dC7E23bF9) |
| DealOrNotGateway | ETH Sepolia | [`0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124`](https://sepolia.etherscan.io/address/0xaB2995091CCE608d1F3f18f36F8e6615aB2fc124) |
| DealOrNotBridge | Base Sepolia | [`0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a`](https://sepolia.basescan.org/address/0xcF3B0d1575b30B53d8Db4EDe30Ebb47D51a2650a) |

---

## Technical Details

### Test Coverage

47 Foundry tests across 4 files (convergence), all passing:
- `Bank.t.sol`: deposit, withdraw, sweeten, entry fee math
- `SponsorVault.t.sol`: register, sponsor, jackpot, claim
- `PriceFeedHelper.t.sol`: ETH/USD conversion
- `DealOrNotQuickPlay.t.sol`: full game flow with mock VRF

```bash
cd packages/convergence && forge test
```

### Quick Verification

```bash
# Bank active?
cast call 0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB "isActive()(bool)" --rpc-url https://sepolia.base.org

# How many AI quotes saved?
cast call 0x55100EF4168d21631EEa6f2b73D6303Bb008F554 "quoteCount()(uint256)" --rpc-url https://sepolia.base.org

# Game 8 state (complete game, all phases verified)
cast call 0x46B6b547A4683ac5533CAce6aDc4d399b50424A7 \
  "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" \
  8 --rpc-url https://sepolia.base.org

# CCIP Bridge game contract set?
cast call 0xB233eFD1623f843151C97a1fB32f9115AaE6a875 "gameContract()(address)" --rpc-url https://sepolia.base.org

# CCIP Gateway home bridge set?
cast call 0x366215E1F493f3420AbD5551c0618c2B28CBc18A "homeBridge()(address)" --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

---

## Team

Built by Ryan & Tippi Fifestarr for Chainlink Convergence Hackathon (Feb 6 - Mar 8, 2026).

**Demo**: https://deal-or-not.vercel.app
**GitHub**: https://github.com/rdobbeck/deal-or-not

Built with Solidity, TypeScript, Next.js, Chainlink (VRF, CRE, CCIP, Price Feeds), Gemini AI, Base.
