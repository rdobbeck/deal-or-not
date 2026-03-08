# Deal or NOT: Two-Tier Jackpot System Roadmap

## Vision

Transform Deal or NOT from a single 5-case QuickPlay game into a two-tier casino economy:

**Tier 1: QuickPlay** → Fast $0.25 games that award jackpot tickets for winning the $1.00 case

**Tier 2: Weekly Live Jackpot Games** → VRF lottery selects ticket holders to compete for $500-$5,000 in 12-case games broadcast live on Discord

## Current Status (Q1 2026)

✅ **Shipped in PR #16 (feat/convergence-quickplay):**
- Production DealOrNotQuickPlay (5 cases, $0.25 entry, real ETH payouts)
- Bank custody system with sweetening mechanism
- SponsorVault with jackpot infrastructure
- 6 CRE workflows (VRF reveal, AI Banker, quote gallery, agent orchestrator, timer, CCIP bridge)
- 47 tests, 244 total test suite
- Deployed on Base Sepolia

🚧 **In Progress (feat/two-tier-jackpot-tickets):**
- JackpotTicket.sol (ERC-721 NFT tickets)
- LotteryDraw.sol (VRF-based weekly draws)
- DealOrNot12Case.sol (12-case jackpot games)
- CRE workflows for ticket minting and draw execution

## Architecture

### Tier 1: QuickPlay Ticket Generator

```
Player pays $0.25 entry fee
  ↓
Plays 5-case game (values: $0.01, $0.05, $0.10, $0.50, $1.00)
  ↓
If wins $1.00 case → Mint JackpotTicket NFT
  ↓
Ticket valid for upcoming weekly draw
```

**Economics:**
- Entry fee: $0.25
- Expected value: $0.332 (EV of all 5 cases)
- **House edge: -$0.082/game (LOSS LEADER)**
- Ticket value: ~$0.10-0.50 (depends on jackpot size and ticket pool)

**Why operate at a loss?**
- QuickPlay is a funnel, not profit center
- High volume (1,000 games/week) = 1,000 tickets in lottery pool
- Sponsors pay for Tier 2 visibility
- Platform makes money on jackpot game fees (10%)

### Tier 2: Weekly Jackpot Games

```
Sunday 8pm UTC: CRE cron triggers LotteryDraw.executeDraw()
  ↓
Chainlink VRF selects random JackpotTicket from pool
  ↓
Winner announced via event
  ↓
12-case game created for winner (values: $0.10 - $100)
  ↓
Game broadcast live on Discord with sponsor branding
  ↓
Winner plays for $500-$5,000 jackpot
```

**Economics:**
- Sponsor deposits: $500-$5,000 per draw
- Platform fee: 10% ($50-$500)
- Jackpot game payout: 90% to winner's pool
- Live event branding exposure for sponsor

**Revenue Model:**
| Source | Amount | Frequency | Annual |
|--------|--------|-----------|--------|
| Platform fees (10% of jackpots) | $50-$500 | 52 draws/year | $2,600-$26,000 |
| QuickPlay volume | -$0.08/game | 50,000 games/year | -$4,000 |
| **Net platform revenue** | | | **-$1,400 to +$22,000** |

**Breakeven:** Need $500+ average jackpot to be revenue positive

## Smart Contract System

### Core Contracts

#### **JackpotTicket.sol** (ERC-721)
- Each ticket tied to specific `drawId` (weekly draws)
- Metadata: QuickPlay gameId, timestamp, player address
- Only mintable by DealOrNotQuickPlay contract
- Burned when used in lottery draw
- OpenSea compatible (tradeable NFTs)

**Key Functions:**
```solidity
function mint(address player, uint256 gameId) external returns (uint256 ticketId);
function claimTicket(uint256 ticketId) external;  // Burn after draw
function getDrawTickets(uint256 drawId) external view returns (uint256[] memory);
function scheduleNextDraw(uint256 drawTime) external;
```

#### **LotteryDraw.sol** (VRF Manager)
- Manages weekly VRF-based lottery draws
- Sponsor creates draw with jackpot amount
- VRF random selection from ticket holders
- Winner announced via event
- Automatic 12-case game creation

**Key Functions:**
```solidity
function createDraw(uint256 jackpotCents, uint256 drawTime) external payable returns (uint256 drawId);
function executeDraw(uint256 drawId) external;  // Called by CRE cron
function createJackpotGame(uint256 drawId) external returns (uint256 gameId);
```

**Draw Lifecycle:**
1. **Monday-Saturday:** QuickPlay games issue tickets
2. **Sunday 8pm UTC:** CRE cron calls `executeDraw()`
3. **VRF callback (~10s):** Random ticket selected
4. **Immediate:** 12-case game created for winner
5. **Discord notification:** "🎉 @winner has been selected! Live game starts in 30 minutes"

#### **DealOrNot12Case.sol** (extends QuickPlay)
- 12 cases instead of 5
- Values: $0.10, $0.25, $0.50, $1.00, $2.50, $5.00, $7.50, $10.00, $25.00, $50.00, $75.00, $100.00
- No entry fee (winner plays free)
- Only `GameMode.MultiPlayer` allowed
- Sponsor branding displayed in UI
- Discord webhook for live updates

**Key Differences from QuickPlay:**
```solidity
uint8 public constant NUM_CASES = 12;
uint256[12] public CASE_VALUES_CENTS = [10, 25, 50, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];
uint256 public constant ENTRY_FEE_CENTS = 0;  // Free for lottery winners

function createMultiplayerGame(
    address winner,
    uint256 drawId,
    uint256 jackpotCents,
    address sponsor
) external returns (uint256 gameId);
```

### Modified Contracts

#### **DealOrNotQuickPlay.sol** (Modified)
Added ticket minting on $1.00 wins:

```solidity
// Line ~615, in _completeFinalReveal()
if (playerValue == CASE_VALUES_CENTS[NUM_CASES - 1] && address(jackpotTicketContract) != address(0)) {
    uint256 ticketId = jackpotTicketContract.mint(g.player, gameId);
    emit JackpotTicketMinted(gameId, g.player, ticketId);
}
```

#### **Bank.sol** (Modified)
Upgraded max payout for 12-case games:

```solidity
// Changed from constant to state variable
uint256 public MAX_PAYOUT_CENTS = 100;  // Default $1.00

// Admin function to increase for 12-case
function setMaxPayout(uint256 newMaxCents) external onlyOwner {
    MAX_PAYOUT_CENTS = newMaxCents;  // Set to 10000 ($100) for jackpot games
}
```

#### **SponsorVault.sol** (Modified)
Added draw funding mechanism:

```solidity
function fundDraw(uint256 drawId, uint256 jackpotCents) external {
    // Deduct from sponsor balance
    // Transfer to LotteryDraw contract
}
```

## CRE Workflows

### New Workflows

#### **ticket-minter** (Log Trigger)
- **Trigger:** `GameResolved` event from DealOrNotQuickPlay
- **Logic:**
  1. Read game state
  2. Check if `finalPayout == 100` (won $1.00)
  3. Check if `totalCollapsed == 5` (went all the way)
  4. If both true, mint ticket via `writeReport()`

#### **weekly-draw-scheduler** (Cron Trigger)
- **Trigger:** `0 20 * * SUN` (Sundays 8pm UTC)
- **Logic:**
  1. Call `LotteryDraw.executeDraw(currentDrawId)`
  2. Read ticket count
  3. If tickets exist, VRF selects winner
  4. Emit winner announcement

#### **jackpot-game-creator** (Log Trigger)
- **Trigger:** `DrawExecuted` event from LotteryDraw
- **Logic:**
  1. Read draw winner from event
  2. Call `DealOrNot12Case.createMultiplayerGame(...)`
  3. Post to Discord webhook: game link + sponsor branding

## Implementation Timeline

### Phase 1: Foundation (Completed - PR #16)
- ✅ DealOrNotQuickPlay with real ETH payouts
- ✅ Bank custody system
- ✅ SponsorVault jackpot infrastructure
- ✅ 6 CRE workflows operational
- ✅ Deployed on Base Sepolia

### Phase 2: Ticket System (In Progress - This Branch)
- ✅ JackpotTicket.sol ERC-721 contract
- ✅ LotteryDraw.sol VRF lottery
- ✅ DealOrNotQuickPlay ticket minting
- 🚧 DealOrNot12Case.sol (12-case jackpot game)
- 🚧 Bank.sol max payout upgrade
- 🚧 CRE workflows (ticket-minter, weekly-draw-scheduler, jackpot-game-creator)
- 🚧 Test suite (JackpotTicket, LotteryDraw, integration tests)
- **ETA:** 1 week post-hackathon

### Phase 3: Frontend & Live Events (Future)
- 📅 Next.js pages: `/tickets`, `/draws`, `/jackpot-game/:id`, `/sponsors`
- 📅 Discord bot integration for live game broadcasts
- 📅 Sponsor registration portal
- 📅 Ticket trading marketplace (OpenSea integration)
- 📅 Leaderboards for ticket earners
- **ETA:** 2-3 weeks post-hackathon

### Phase 4: Production Launch (Future)
- 📅 Mainnet deployment (Base L2)
- 📅 First sponsor onboarding
- 📅 First live jackpot game event
- 📅 Marketing campaign
- **ETA:** 4-6 weeks post-hackathon

## Economics Deep Dive

### QuickPlay Revenue Model (Tier 1)

**Current Model (Loss Leader):**
```
Entry fee:         $0.25
Expected value:    $0.332
Ticket premium:    $0.10 (estimated)
House edge:        -$0.082 per game

1,000 games/week = -$82/week = -$4,264/year
```

**Alternative Models:**

**Option A: Ticket Premium Pricing**
```
Entry fee:         $0.50
Expected value:    $0.332 (unchanged)
Ticket premium:    $0.10
House edge:        +$0.068 per game

1,000 games/week = +$68/week = +$3,536/year
```

**Option B: Reduced Max Payout**
```
Entry fee:         $0.25 (unchanged)
Max payout:        $0.50 (capped, not $1.00)
New expected value: ~$0.20
House edge:        +$0.05 per game

1,000 games/week = +$50/week = +$2,600/year
```

**Option C: Sponsor Subsidy (Recommended)**
```
Entry fee:         $0.25 (unchanged)
QuickPlay loss:    -$0.08 per game = -$4,264/year
Platform fee:      10% of jackpots = +$2,600-$26,000/year
Net revenue:       -$1,664 to +$21,736/year

Requires: ~$500 average jackpot to break even
```

### Jackpot Game Revenue (Tier 2)

**Per Draw Economics:**
```
Sponsor deposit:   $1,000 (example)
Platform fee (10%): $100
Net jackpot:       $900

Winner plays 12-case game:
- Best case (wins $100): Sponsor loses $900
- Worst case (wins $0.10): Sponsor loses $0.90

50% rollover on unclaimed jackpots
```

**Annual Revenue (52 draws):**
```
Low estimate:  52 × $50  = $2,600/year
Mid estimate:  52 × $200 = $10,400/year
High estimate: 52 × $500 = $26,000/year

Assumptions:
- Low: $500 average jackpot
- Mid: $2,000 average jackpot
- High: $5,000 average jackpot
```

### Sponsor Value Proposition

**What Sponsors Get:**
- Logo displayed in jackpot game UI
- Branding during live Discord event
- "Sponsored by [Company]" announcement to crypto-native audience
- Tweet/social media post with sponsor tag
- Lifetime stats: "Company X has sponsored 12 games, $50,000 in prizes"

**Cost Per Impression:**
```
$1,000 jackpot / 500 Discord viewers = $2.00 CPM (cost per thousand impressions)

Industry standard CPM: $10-30 for crypto/gaming content
Deal or NOT CPM: $2.00 (highly competitive)
```

**ROI Calculation:**
```
Sponsor investment:  $1,000
Platform fee:        $100 (10%)
Net jackpot:         $900

If winner loses:     Sponsor recovers $450 (50% rollover)
Effective cost:      $550 for branding

vs. Twitter ads:     $1,000 for 33,333 impressions
vs. Deal or NOT:     $550 for 500+ engaged viewers + brand integration
```

## Agent Incentives

### How Agents Earn Tickets

**Primary Method: Win QuickPlay**
- Agent wins $1.00 case → 1 ticket
- Estimated win rate: ~20% (1 in 5 games if agent plays optimally)
- Cost: $0.25 per game

**Secondary Method: Staking Multipliers**
- Stake LINK or ETH in AgentStaking.sol
- Earn 2x tickets for same wins
- Example: Win $1.00 case while staked → 2 tickets

**Tertiary Method: Leaderboard Bonuses**
- Top 10 agents per season get bonus tickets
- Season 1: Top agent gets 50 bonus tickets

### Agent ROI

**EV-Maximizer Agent Playing QuickPlay:**
```
Games played:      100
Entry cost:        100 × $0.25 = $25
Wins (20%):        20 games
Tickets earned:    20 tickets
Prize pool avg:    20 × $0.332 = $6.64

Expected loss from QuickPlay: $25 - $6.64 = -$18.36
Ticket value (20 tickets):    $10-$100 (depends on jackpot)

If jackpot = $1,000 and 500 tickets in pool:
  20/500 = 4% chance to win $1,000
  EV = $40

Net ROI: $40 (ticket EV) - $18.36 (QuickPlay loss) = +$21.64
```

### Agent Strategy

**Optimal Play:**
1. Play QuickPlay with EV-Maximizer strategy
2. Stake LINK for 2x ticket multiplier
3. Accumulate tickets leading up to Sunday draw
4. Trade unwanted tickets on OpenSea (secondary market)

**Secondary Market:**
- Tickets are ERC-721 NFTs (tradeable)
- Price discovery based on jackpot size and ticket pool
- Example: $1,000 jackpot / 1,000 tickets = $1.00 floor price per ticket
- Agents can sell tickets if they don't want to compete

## Technical Specifications

### Contract Addresses (Post-Deployment)

| Contract | Address | Network |
|----------|---------|---------|
| JackpotTicket | TBD | Base Sepolia |
| LotteryDraw | TBD | Base Sepolia |
| DealOrNot12Case | TBD | Base Sepolia |
| DealOrNotQuickPlay | 0x46B6b547A4683ac5533CAce6aDc4d399b50424A7 | Base Sepolia |
| Bank | 0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB | Base Sepolia |
| SponsorVault | 0x14a26cb376d8e36c47261A46d6b203A7BaADaE53 | Base Sepolia |

### Gas Estimates

| Operation | Gas | Cost (Base L2) |
|-----------|-----|----------------|
| Mint JackpotTicket | ~150k | $0.003 |
| Execute lottery draw (VRF) | ~300k | $0.006 |
| Create 12-case game | ~500k | $0.010 |
| **Total per draw** | ~950k | **~$0.019** |

*Estimates based on 2 gwei Base L2 gas price*

### CRE Costs

| Workflow | Trigger | Executions/Week | Cost/Execution | Weekly Cost |
|----------|---------|-----------------|----------------|-------------|
| ticket-minter | GameResolved log | 1,000 games | $0.10 | $100 |
| weekly-draw-scheduler | Cron (Sunday) | 1 draw | $0.10 | $0.10 |
| jackpot-game-creator | DrawExecuted log | 1 game | $0.10 | $0.10 |
| **Total CRE costs** | | | | **~$100.20/week** |

**Annual CRE costs:** $100.20 × 52 weeks = **$5,210**

### Total Operational Costs

```
QuickPlay volume:  1,000 games/week
  VRF costs:       1,000 × $0.02 = $20/week
  CRE costs:       1,000 × $0.10 = $100/week
  Gas costs:       1,000 × $0.003 = $3/week

Lottery draws:     1 draw/week
  VRF costs:       1 × $0.50 = $0.50/week
  CRE costs:       1 × $0.20 = $0.20/week
  Gas costs:       1 × $0.019 = $0.019/week

Total weekly ops:  $123.72
Annual ops cost:   $6,433
```

**Breakeven analysis:**
- Need $6,433/year from platform fees
- Requires: $6,433 / 52 draws = $124/draw
- Requires: $124 / 10% fee = **$1,240 average jackpot**

## Risks & Mitigations

### Risk: Low QuickPlay Volume
**Problem:** Not enough tickets in weekly pool, lottery not attractive

**Mitigation:**
- Minimum 100 tickets to execute draw (cancel if < 100)
- Marketing push: "Win $1.00 = Jackpot Ticket"
- Agent incentives: Staking multipliers, leaderboard bonuses

### Risk: Sponsor Onboarding
**Problem:** Hard to find sponsors willing to fund jackpots

**Mitigation:**
- Start with own funds (BuidlGuidl, Chainlink grants)
- Showcase first 10 draws as proof of concept
- Partner with crypto projects for co-marketing
- Show ROI data: CPM, engagement metrics, social reach

### Risk: Winner No-Show
**Problem:** Lottery winner doesn't play their jackpot game

**Mitigation:**
- 24-hour deadline to claim
- If unclaimed, re-draw from same pool
- 50% of jackpot rolls to next draw
- Discord notification with @mention

### Risk: Operational Costs Too High
**Problem:** CRE + VRF costs exceed revenue

**Mitigation:**
- Increase platform fee to 15%
- Reduce QuickPlay volume (quality over quantity)
- Batch ticket minting (1 CRE call per 10 tickets)
- Optimize workflows for gas efficiency

## Success Metrics

### Phase 2 (Ticket System Launch)
- 🎯 1,000+ QuickPlay games/week
- 🎯 200+ tickets minted/week
- 🎯 First successful lottery draw (any jackpot size)
- 🎯 Zero contract exploits or bugs

### Phase 3 (Live Events)
- 🎯 First sponsor-funded jackpot ($500+)
- 🎯 50+ concurrent Discord viewers for live game
- 🎯 5+ sponsors onboarded
- 🎯 Ticket trading volume on OpenSea ($1,000+/month)

### Phase 4 (Production)
- 🎯 Revenue positive (platform fees > operational costs)
- 🎯 10+ weekly active sponsors
- 🎯 5,000+ QuickPlay games/week
- 🎯 1,000+ tickets per draw
- 🎯 $10,000+ average jackpot

## Community & Marketing

### Launch Strategy

**Week 1: Testnet Demo**
- Deploy all contracts to Base Sepolia
- Run mock lottery with team members
- Debug any edge cases

**Week 2: Alpha Testing**
- Invite 50 early adopters
- Fund Bank with $100 for free plays
- Collect feedback on UX

**Week 3: First Live Draw**
- Announce on Twitter, Discord, Farcaster
- $500 jackpot (self-funded)
- Live stream on Discord
- Post-game recap with stats

**Week 4+: Growth**
- Onboard first external sponsor
- Publish case study: "How to Sponsor a Deal or NOT Jackpot"
- Launch ticket trading on OpenSea
- Weekly draw becomes recurring event

### Marketing Channels

- **Twitter:** Daily QuickPlay highlights, weekly draw announcements
- **Discord:** Live game broadcasts, community chat, sponsor showcases
- **Farcaster:** Frames for quick play, draw countdowns
- **OpenSea:** Ticket marketplace with featured collections
- **BuidlGuidl:** Dev community engagement, hackathon submissions
- **Chainlink:** Blog post on CRE + VRF + Price Feeds integration

## Conclusion

The two-tier jackpot system transforms Deal or NOT from a simple 5-case game into a **sustainable casino economy** with:

1. **High-velocity Tier 1** (QuickPlay) generating ticket volume
2. **High-value Tier 2** (Jackpot Games) monetizing via sponsor fees
3. **Agent ecosystem** earning tickets through optimal play
4. **Live entertainment** creating community engagement
5. **Crypto-native economics** with transparent on-chain randomness

**Next Steps:**
1. ✅ Complete contracts on feat/two-tier-jackpot-tickets branch
2. ✅ Write comprehensive test suite
3. 🚧 Deploy to Base Sepolia
4. 🚧 Build frontend pages for tickets/draws
5. 🚧 Run first testnet lottery draw
6. 📅 Onboard first sponsor
7. 📅 Launch to mainnet

**Timeline to Revenue Positive:** 4-6 weeks post-hackathon

---

*Last updated: March 8, 2026*
*Branch: feat/two-tier-jackpot-tickets*
*Contact: Deal or NOT team @BuidlGuidl*
