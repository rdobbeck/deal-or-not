# Deal or NOT — Frontend

Playable Deal or No Deal with CRE Confidential Compute on Base Sepolia.

## Quick Start

```bash
cd prototype/frontend
npm install
npm run dev
```

Open http://localhost:3000, connect MetaMask to Base Sepolia.

## Before Playing

1. **Add contract as VRF consumer** on the Chainlink VRF subscription (requires the subscription owner wallet):
   - Go to https://vrf.chain.link on Base Sepolia
   - Find subscription `20136374336138753384898843390506225296052091906296406953567310616148092014984`
   - Add `0xd9D4A974021055c46fD834049e36c21D7EE48137` as a consumer
2. **Import a burner wallet** into MetaMask on Base Sepolia
   - Deployer PK: `0x671ea01f6ac1b2d53d49eea104c69e64680ddecc230e5faed864ecd055fbb6fd`
   - Player PK: `0x7bccdcecede835466aafe20ea5aa11bad825c5bea940473e4f865b8013fc2340`
   - Both have Base Sepolia ETH

## Deployed Addresses (Base Sepolia 84532)

All addresses are hardcoded in `lib/config.ts` — no `.env` needed.

| Contract | Address |
|----------|---------|
| **DealOrNotConfidential** (CRE) | `0xd9D4A974021055c46fD834049e36c21D7EE48137` |
| **SponsorJackpot** | `0xc6b4Ba33f59816F1B47818EFf928e9a48F7ddC95` |
| VRF Coordinator | `0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE` |
| ETH/USD Price Feed | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |
| LINK Token | `0xE4aB69C077896252FAFBD49EFD26B5D171A32410` |

### CRE Forwarder Addresses (Base Sepolia)

| Environment | Address |
|-------------|---------|
| **Simulation** (MockKeystoneForwarder) | `0x82300bd7c3958625581cc2f77bc6464dcecdf3e5` |
| **Production** (KeystoneForwarder) | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

Currently set to MockKeystoneForwarder for `cre simulate --broadcast` testing. Switch to production via:
```bash
cast send 0xd9D4A974021055c46fD834049e36c21D7EE48137 "setCREForwarder(address)" 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 --private-key $DEPLOYER_PK --rpc-url https://base-sepolia-rpc.publicnode.com
```

| Wallet | Address |
|--------|---------|
| Deployer / Host | `0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1` |
| Player | `0xC96Bcb1EACE35d09189a6e52758255b8951a7587` |

VRF Subscription ID: `20136374336138753384898843390506225296052091906296406953567310616148092014984`

## Game Flow

1. **New Game** — calls `createGame()`, requests Chainlink VRF seed
2. **Pick Your Case** — choose 1 of 5 briefcases (value unknown — quantum superposition)
3. **Rounds 1-3** — CRE confidential case opening:
   - Select a case -> **Open Case** (1 TX — no commit-reveal needed)
   - CRE enclave computes the collapsed value using VRF seed + game secret
   - **Ring the Banker** -> on-chain offer calculated with EV + variance + psychology
   - **DEAL** (accept offer, game over) or **NO DEAL** (next round)
4. **Final Decision** — 2 cases remain: **KEEP** your case or **SWAP**
5. **Game Over** — all cases revealed, final payout shown + jackpot if sponsored

## Sponsor Jackpot (CRE Log Trigger)

A CRE log-trigger workflow adds to the jackpot on each case opening. The amount is drawn from the range between the 2nd-highest and highest remaining case values. If the player goes "no deal" all the way, they can claim the jackpot. Games have a 10-minute timer — if the game expires, the jackpot is returned to the sponsor.

## Tech Stack

- Next.js 16, React 19, TypeScript
- wagmi v2 + viem v2 + TanStack Query
- Tailwind CSS 4
- Chainlink VRF v2.5 + Price Feeds (ETH/USD)
- Chainlink CRE (Confidential Compute + Cron Workflows)

## Case Values

$0.01, $0.05, $0.10, $0.50, $1.00

## Watch Mode (Spectator UX)

No wallet needed. Spectate any game in real time.

- `/watch` — lobby with game ID input + "jump to latest" shortcut
- `/watch/[id]` — full spectator view with sidebar, rotating sponsor ads, event log
- Channel controls: ◀ Choose Game ▶ to navigate between games
- Ads are seeded by gameId for deterministic per-game shuffle order

## Sponsor Ads

Typed ad system in `lib/ads.ts` with `SponsorAd` interface. Unified `RotatingAd` component supports `sidebar` and `break` variants. Sponsor logos in `public/sponsors/`.

Current sponsors: Ceptor Club, Chainlink, letswritean.email, Wingbird Enterprises, CyberJam, ENS, Deal or NOT, Rick Roll University, The Banker's Therapy Fund.

**Future**: Refactor `SponsorJackpot` into separate `Sponsor` and `Jackpot` contracts. Sponsors write ads on-chain by sending funds — the Sponsor contract stores ad text/logo and forwards funds to the Jackpot. The frontend reads ads from the Sponsor contract instead of the static `lib/ads.ts` array.

### Running Tests

```bash
npx tsx --test lib/ads.test.ts
```

## Known Issues

### Banker Message Timing

The AI Banker's Gemini-generated message is written on-chain in two places:
1. **Game contract** — via `setBankerOfferWithMessage()` (writeReport #1, emits `BankerMessage` event) — **reliable**
2. **BestOfBanker gallery** — via `saveQuote()` (writeReport #2) — **sometimes fails** due to CRE nonce collision

The frontend reads from BestOfBanker (`useBankerMessage` hook), so when writeReport #2 fails, no message is found. The UI shows "The Banker is composing a message..." for up to 8 seconds, then falls back to a generic quote.

**TODO**: Read the message from the `BankerMessage` event log (always present in writeReport #1) instead of relying on BestOfBanker. The message is already on-chain — the frontend just needs to read from event logs.

### Progress Bar at GameOver

Fixed: progress bar now shows 4/4 (green) at GameOver and FinalRound phases.

## Key Files

| File | Purpose |
|------|---------|
| `lib/config.ts` | All contract addresses and chain config |
| `lib/abi.ts` | Contract ABI (from forge output) |
| `lib/ads.ts` | Sponsor ad data (typed `SponsorAd[]`) |
| `lib/ads.test.ts` | Tests for seeded shuffle + ad data validation |
| `hooks/useGameContract.ts` | All contract read/write hooks |
| `components/game/GameBoard.tsx` | Main game orchestrator (9 phases) |
| `components/game/CommitReveal.tsx` | CRE-powered 1-step case opening UX |
| `components/game/BankerOffer.tsx` | DEAL/NO DEAL modal with quality bar |
| `components/RotatingAd.tsx` | Unified rotating ad component (sidebar + break variants) |
| `app/watch/page.tsx` | Watch lobby page |
| `app/watch/[id]/page.tsx` | Spectator view for a specific game |
| `types/game.ts` | Phase enum, GameState, SponsorAd interfaces |
