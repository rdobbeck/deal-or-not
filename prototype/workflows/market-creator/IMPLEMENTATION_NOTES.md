# Implementation Notes for Tippi

## Quick Start (TL;DR)

```bash
# 1. Go to workflow directory
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

# 2. Install dependencies
bun install

# 3. Test locally
bun run dev

# 4. Deploy to CRE
cre workflow deploy --staging

# 5. Test with real game
# (Create agent game and watch /markets page)
```

---

## Why This Is Needed

**Current State:**
- Prediction markets exist as a contract (`PredictionMarket.sol`)
- Frontend exists at `/markets` but shows mock data
- When games are created, no markets appear
- Markets must be manually created by calling `createMarket()`

**After This Workflow:**
- Game created → Event emitted → CRE listens → Markets auto-created → Visible on frontend
- Fully automated, no manual intervention

---

## Key Implementation Decisions

### 1. Why 3 Markets Per Game?

We create 3 standard markets for every agent game:
1. **Will Win?** — Binary outcome, most popular
2. **Earnings Over $25** — Engagement bet with specific target
3. **Will Accept Offer?** — Banker interaction bet

**Rationale**: These cover the core gameplay decisions and provide variety for bettors.

### 2. Why 1 Hour Lock Time?

Markets lock 1 hour after game creation to:
- Give bettors time to place bets
- Prevent last-second betting
- Align with game timer workflow (games expire after 10 minutes idle)

**Adjustable**: Change `LOCK_TIME_OFFSET` in code if needed.

### 3. Why Check `isAgentEligible()`?

Only agent games should have prediction markets because:
- Human games are unpredictable (no strategy analysis)
- Agent games have consistent behavior (easier to bet on)
- Focuses betting on the "Autonomous Agents" track feature

### 4. CRE vs Smart Contract Logic?

**Why not put this in the smart contract?**
- Gas costs: Creating markets in `DealOrNotConfidential.createGame()` would add ~300k gas
- Flexibility: CRE workflow can be updated without contract redeployment
- Separation: Game logic stays clean, market creation is separate concern

---

## Technical Challenges & Solutions

### Challenge 1: Multiple writeReports

**Problem**: Need to create 3 markets, but CRE workflow.yaml only supports one `writeReport` action.

**Solutions Explored**:
1. ✅ **Call `writeContract` directly from TypeScript** (Recommended)
   - Use viem's `walletClient.writeContract()` in a loop
   - More flexible, full control over gas
   - Implemented in code comments

2. ❌ Run workflow 3 times per event
   - Inefficient, wastes gas on duplicate checks
   - Race conditions possible

3. ❌ Deploy 3 separate workflows
   - Maintenance nightmare
   - Harder to synchronize

**Current Implementation**: Uses single writeReport (creates 1 market only). See `src/index.ts` comments for how to extend to 3 markets.

### Challenge 2: Wallet Authorization

**Problem**: `PredictionMarket.createMarket()` requires `onlyAuthorized` modifier.

**Solution**:
```bash
# One-time setup: Authorize the CRE workflow wallet
cast send $PREDICTION_MARKET_ADDRESS \
  "authorizeResolver(address)" \
  $WORKFLOW_WALLET_ADDRESS \
  --private-key $DEPLOYER_PRIVATE_KEY
```

**Security**: Workflow wallet is dedicated to market creation only, private key stored in CRE Vault DON.

### Challenge 3: Event Detection Latency

**Problem**: GameCreated event → CRE detects → Creates markets = 10-30 seconds delay.

**Mitigation**:
- Set `confirmations: 1` in workflow.yaml (faster detection)
- Base has 2-second block times (fast finality)
- Total delay: ~5-15 seconds (acceptable UX)

**Future**: Could use webhooks for instant detection (CRE roadmap).

---

## Code Walkthrough

### src/index.ts Structure

```typescript
// 1. Define contracts and ABIs
const DEAL_OR_NOT_ADDRESS = "0x...";
const AGENT_REGISTRY_ABI = [...];

// 2. Handler function (triggered by CRE)
export default async function handler(event: GameCreatedEvent) {

  // 3. Initialize viem client
  const client = createPublicClient(...);

  // 4. Check if player is agent
  const isAgent = await client.readContract({...});
  if (!isAgent) return;

  // 5. Fetch agent details
  const agentData = await client.readContract({...});

  // 6. Calculate lock time
  const lockTime = createdAt + LOCK_TIME_OFFSET;

  // 7. Define markets to create
  const marketsToCreate = [
    { marketType: WillWin, ... },
    { marketType: EarningsOver, ... },
    { marketType: WillAcceptOffer, ... },
  ];

  // 8. Return data for CRE writeReport
  return { reportData: {...} };
}
```

### workflow.yaml Structure

```yaml
staging:
  triggers:
    - type: EVENT_LOG
      eventSignature: "GameCreated(uint256,address,address)"

  actions:
    - type: CRE_WORKFLOW  # Runs src/index.ts
    - type: WRITE_REPORT   # Calls createMarket()
```

---

## Testing Strategy

### Level 1: Local TypeScript Test
```bash
bun run dev
```
- Tests agent detection logic
- Verifies market data structure
- No on-chain interaction

### Level 2: Manual Contract Test
```bash
cast send $PREDICTION_MARKET "createMarket(...)"
```
- Tests contract directly
- Verifies authorization works
- Confirms gas costs

### Level 3: CRE Simulation
```bash
cre workflow simulate --broadcast
```
- Tests full workflow in CRE environment
- Uses testnet
- No production risk

### Level 4: End-to-End Test
```bash
# Create agent game → Wait → Check /markets page
```
- Full integration test
- Real events, real workflow
- Validates entire flow

---

## Deployment Checklist for Tippi

**Before Deploying:**
- [ ] Read README.md fully
- [ ] Understand why this is needed
- [ ] Have access to CRE CLI (`cre login` works)
- [ ] Have deployer wallet with ETH on Base Sepolia
- [ ] Contracts deployed (check addresses in code)

**During Deployment:**
- [ ] Follow Phase 1-7 in README.md
- [ ] Generate dedicated workflow wallet
- [ ] Authorize wallet in PredictionMarket contract
- [ ] Test locally first
- [ ] Deploy to staging (not production yet)
- [ ] Run end-to-end test

**After Deployment:**
- [ ] Monitor first 5 games
- [ ] Check frontend shows markets
- [ ] Verify gas costs match estimates
- [ ] Set up monitoring alerts

**Time Estimate**: 1-2 hours total (most time is waiting for transactions)

---

## What Could Go Wrong?

### Issue: "Transaction reverted"
**Cause**: Workflow wallet not authorized
**Fix**: Run `cast send ... authorizeResolver()`

### Issue: "Insufficient funds"
**Cause**: Workflow wallet out of gas
**Fix**: Send 0.01 ETH to workflow wallet

### Issue: "No markets showing on /markets"
**Cause**: Frontend still using mock data
**Fix**: Click "Live On-Chain" toggle

### Issue: "Workflow not triggering"
**Cause**: Wrong event signature or contract address
**Fix**: Verify `workflow.yaml` matches deployed contract

---

## Extending This Workflow

### Add More Market Types

Edit `src/index.ts` line 126:
```typescript
marketsToCreate.push({
  gameId: event.gameId,
  agentId,
  marketType: MarketType.RoundPrediction, // New market type
  targetValue: 3n, // Will finish in round 3?
  lockTime,
});
```

### Dynamic Earnings Targets

```typescript
// Calculate target based on agent history
const avgEarnings = agentData[4]; // totalWinnings / totalGames
const targetValue = avgEarnings * 120n / 100n; // 20% above average
```

### Conditional Market Creation

```typescript
// Only create "Earnings Over" if agent has >10 games
if (agentData[3] >= 10n) { // totalGames >= 10
  marketsToCreate.push({ marketType: EarningsOver, ... });
}
```

---

## Questions for Tippi?

**Reach out** if you hit any blockers:
- CRE CLI issues (login, deployment)
- Contract authorization errors
- Frontend not showing markets
- Workflow not triggering

**Success looks like**:
1. Create agent game
2. Wait 15 seconds
3. Refresh /markets page
4. See 3 new markets! 🎉

---

**Good luck! You got this.** 🚀
