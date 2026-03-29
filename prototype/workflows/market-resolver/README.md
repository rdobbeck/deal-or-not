# Market Resolver Workflow

**CRE Workflow** — Automatically resolves prediction markets when games complete

---

## Problem Statement

**Current Issue**: Markets are created but never resolved:
- market-creator workflow creates markets ✅
- Games complete, payouts calculated ✅
- Markets stay in "Open" or "Locked" status ❌
- Bettors can't claim winnings ❌

**This workflow solves it** by:
- Listening for `GameComplete` events from `DealOrNotConfidential.sol`
- Fetching all markets for that game
- Determining outcome for each market type based on game results
- Calling `resolveMarket(marketId, outcome)` to enable payout claims

---

## Architecture

```
GameComplete(gameId, player, finalPayout)  [on-chain event]
           ↓
   CRE Workflow Triggered
           ↓
   Fetch game state (finalPayout, phase, round, bankerOffer)
           ↓
   Get all markets: PredictionMarket.getGameMarkets(gameId)
           ↓
   For each market, determine outcome:
     • WillWin? → finalPayout > 0
     • EarningsOver? → finalPayout > target
     • WillAcceptOffer? → phase == DealAccepted
     • RoundPrediction? → currentRound == target
           ↓
   Call resolveMarket(marketId, outcome) for each
           ↓
   Bettors can now claim winnings!
```

---

## Resolution Logic

### Market Type 1: WillWin (0)

**Question**: Did the agent win anything?

**Outcome**:
- `YES` if `game.finalPayout > 0`
- `NO` if `game.finalPayout == 0`

**Example**:
```
Game finalPayout: 500000000000000000 wei (0.5 ETH)
Outcome: YES (agent won)
```

---

### Market Type 2: EarningsOver (1)

**Question**: Did the agent earn more than the target amount?

**Outcome**:
- `YES` if `game.finalPayout > market.targetValue`
- `NO` if `game.finalPayout <= market.targetValue`

**Example**:
```
Target: $25 (market.targetValue = 2500 cents)
finalPayout: 0.03 ETH (≈ $60 at $2000/ETH)
Outcome: YES (earnings over $25)
```

**Note**: Currently simplified to compare wei values. Production should convert using `game.ethPerDollar` from Chainlink Price Feed.

---

### Market Type 3: WillAcceptOffer (2)

**Question**: Did the agent accept the banker's offer?

**Outcome**:
- `YES` if `game.phase == DealAccepted (5)`
- `NO` if game ended any other way

**Example**:
```
Banker offer: 4000 cents ($40)
Game phase: DealAccepted
Outcome: YES (agent took the deal)
```

---

### Market Type 4: RoundPrediction (3)

**Question**: Did the agent finish in the predicted round?

**Outcome**:
- `YES` if `game.currentRound == market.targetValue`
- `NO` otherwise

**Example**:
```
Predicted round: 3
Actual round finished: 3
Outcome: YES (correct prediction)
```

---

## Implementation Plan for Tippi

### Phase 1: Prerequisites (5 minutes)

**1. Verify market-creator is deployed:**

```bash
# Check if market-creator workflow is running
cre workflow list | grep market-creator

# If not deployed yet, deploy market-creator first
# (see market-creator/README.md)
```

**2. Verify markets exist:**

```bash
# Check market count
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org

# Should return > 1 if markets were created
```

---

### Phase 2: Setup Workflow (10 minutes)

**1. Install dependencies:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-resolver

# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
```

**2. Generate dedicated wallet for workflow:**

```bash
# Generate new private key (or reuse market-creator wallet)
cast wallet new

# Save the output:
# Address: 0x...
# Private Key: 0x...

# Fund it with ~0.01 ETH on Base Sepolia
# Use faucet or transfer from deployer wallet
```

**3. Authorize wallet in PredictionMarket:**

```bash
# The workflow needs authorizedResolvers permission
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "authorizeResolver(address)" \
  <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify authorization
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "authorizedResolvers(address)(bool)" \
  <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org
# Should return: true
```

**4. Store secrets in CRE Vault:**

```bash
# Login to CRE CLI
cre login

# Store workflow private key
cre secret set PRIVATE_KEY "0x..." --vault deal-or-not/market-resolver-key

# Store RPC URL (optional, uses public RPC by default)
cre secret set BASE_SEPOLIA_RPC "https://sepolia.base.org" --vault deal-or-not/base-rpc
```

---

### Phase 3: Local Testing (15 minutes)

**1. Test workflow locally:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-resolver

# Set environment variables
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

# Edit src/index.ts line 280 with a completed game ID
# Get a completed game:
cast call 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "getGame(uint256)" \
  <GAME_ID> \
  --rpc-url https://sepolia.base.org

# Run test
bun run dev
```

**Expected Output:**
```
[Market Resolver] Processing GameComplete event for gameId=1
[Market Resolver] Fetching game state...
[Market Resolver] Final payout: 500000000000000000 wei
[Market Resolver] Found 3 markets: 1, 2, 3
[Market Resolver] Market 1 (WillWin): YES - Agent won 500000000000000000 wei
[Market Resolver] Market 2 (EarningsOver): YES - Earnings > target
[Market Resolver] Market 3 (WillAcceptOffer): NO - Agent rejected deal
[Market Resolver] ✓ Ready to resolve 3 markets
```

**2. Test market resolution manually:**

```bash
# Manually resolve one market to verify contract works
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "resolveMarket(uint256,bool)" \
  1 \
  true \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify market was resolved
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "markets(uint256)" \
  1 \
  --rpc-url https://sepolia.base.org
# Check that status == 2 (Resolved)
```

---

### Phase 4: Deploy to CRE Staging (20 minutes)

**1. Simulate workflow:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-resolver

# Test workflow with CRE simulation
cre workflow simulate --broadcast --network base-sepolia
```

**2. Deploy workflow:**

```bash
# Deploy to CRE staging DON
cre workflow deploy --staging

# Save workflow ID from output
echo "Workflow ID: wf_..."

# Enable workflow
cre workflow enable wf_...
```

**3. Monitor logs:**

```bash
# Watch workflow logs in real-time
cre workflow logs wf_... --follow

# Or check recent logs
cre workflow logs wf_... --tail 50
```

---

### Phase 5: End-to-End Testing (30 minutes)

**1. Create and complete a test game:**

```bash
# Option A: Play a quick test game via CLI
cd /Users/uni/deal-or-not/prototype/scripts
./play-game.sh

# Option B: Complete an existing incomplete game
# (Pick case, open cases, accept/reject deal until complete)
```

**2. Wait for workflow to execute (10-30 seconds):**

```bash
# Watch CRE logs
cre workflow logs wf_... --follow

# Expected output:
# [Market Resolver] Processing GameComplete event for gameId=X
# [Market Resolver] Found 3 markets
# [Market Resolver] Market 1 (WillWin): YES
# [Market Resolver] Market 2 (EarningsOver): NO
# [Market Resolver] Market 3 (WillAcceptOffer): NO
# [Market Resolver] ✓ Markets resolved successfully
```

**3. Verify markets were resolved:**

```bash
# Check market status
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  <GAME_ID> \
  --rpc-url https://sepolia.base.org
# Returns: [1, 2, 3]

# For each market, check if resolved
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "markets(uint256)" \
  1 \
  --rpc-url https://sepolia.base.org
# Field [4] should be 2 (MarketStatus.Resolved)
# Field [7] should be true/false (outcome)
```

**4. Test payout claim (as bettor):**

```bash
# If you placed a winning bet, claim it
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "claimPayout(uint256)" \
  <BET_ID> \
  --rpc-url https://sepolia.base.org \
  --private-key <BETTOR_PRIVATE_KEY>

# Verify payout received
cast balance <BETTOR_ADDRESS> --rpc-url https://sepolia.base.org --ether
```

**5. Check frontend:**

```bash
cd /Users/uni/deal-or-not/prototype/frontend

# Open markets page
open http://localhost:3000/markets

# Markets should show "RESOLVED" status
# Winning bets should be claimable
```

---

## Known Issues & Solutions

### Issue 1: CRE Limitation - One writeReport per workflow

**Problem**: Need to resolve 3 markets, but CRE workflow.yaml only supports one `writeReport` action.

**Current Implementation**: Creates only **1 resolution** (first market).

**Solution**: Use viem `walletClient.writeContract()` in loop to resolve all markets. Add to `src/index.ts`:

```typescript
import { createWalletClient, privateKeyToAccount } from "viem";

// After determining resolutions
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
  account,
});

// Resolve all markets
for (const resolution of resolutions) {
  const hash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "resolveMarket",
    args: [resolution.marketId, resolution.outcome],
  });

  console.log(`[Market Resolver] Resolved market ${resolution.marketId}: ${hash}`);

  // Wait for confirmation
  await client.waitForTransactionReceipt({ hash });
}
```

### Issue 2: Earnings conversion (EarningsOver market)

**Problem**: `finalPayout` is in wei, `targetValue` is in USD cents. Need conversion.

**Solution**: Use `game.ethPerDollar` from Chainlink Price Feed:

```typescript
// In src/index.ts, resolveMarketOutcome() for EarningsOver
const finalPayoutUSD = (game.finalPayout * game.ethPerDollar) / 1e18; // Convert to cents
const targetUSD = market.targetValue; // Already in cents
outcome = finalPayoutUSD > targetUSD;
```

**Current**: Simplified to compare wei values directly.

### Issue 3: Race condition (game completes before market locked)

**Problem**: If game completes very quickly (<1 hour), market might still be "Open" (not locked).

**Solution**: Workflow already handles this - checks for both `Open` and `Locked` status. Contract allows resolving from either state.

### Issue 4: Workflow wallet runs out of gas

**Solution**: Set up monitoring alert when balance < 0.005 ETH:

```bash
# Check balance
cast balance <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org \
  --ether

# Refill if needed
cast send <WORKFLOW_WALLET_ADDRESS> \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

---

## Cost Estimation

**Per completed game:**
- Gas per market resolution: ~80k gas
- 3 markets × 80k gas = 240k gas total
- At 0.08 gwei Base gas price: ~$0.04 per game
- 100 games/day = $4/day = $120/month

**Combined with market-creator**:
- Creation: $0.05 per game
- Resolution: $0.04 per game
- **Total: $0.09 per agent game** = $270/month at 100 games/day

---

## Testing Checklist

- [ ] Workflow deploys successfully to CRE
- [ ] GameComplete event triggers workflow
- [ ] All 3 markets resolved with correct outcomes
- [ ] WillWin outcome correct (YES if finalPayout > 0)
- [ ] EarningsOver outcome correct (compares finalPayout vs target)
- [ ] WillAcceptOffer outcome correct (checks phase == DealAccepted)
- [ ] Markets status changes to "Resolved"
- [ ] Outcome stored correctly (true/false)
- [ ] Winners can claim payouts
- [ ] Losers can't claim
- [ ] Frontend shows resolved markets
- [ ] Workflow logs show success
- [ ] Gas costs within expected range

---

## Troubleshooting

### Workflow not triggering

```bash
# Check workflow status
cre workflow status wf_...

# Check recent GameComplete events
cast logs --address 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  --event "GameComplete(uint256,address,uint256)" \
  --from-block -100 \
  --rpc-url https://sepolia.base.org
```

### Markets not resolving

```bash
# Check if markets exist
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  <GAME_ID> \
  --rpc-url https://sepolia.base.org

# Check market status (should be Open or Locked, not Resolved)
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "markets(uint256)" \
  <MARKET_ID> \
  --rpc-url https://sepolia.base.org
```

### Wrong outcome resolved

```bash
# Check game state
cast call 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "getGame(uint256)" \
  <GAME_ID> \
  --rpc-url https://sepolia.base.org

# Verify phase (index 3): 5 = DealAccepted, 8 = Complete
# Verify finalPayout (index 8): Should be > 0 if agent won
```

### Can't claim payout

```bash
# Check if bet won
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "canClaimBet(uint256)(bool)" \
  <BET_ID> \
  --rpc-url https://sepolia.base.org

# Should return true if bet won and not claimed yet
```

---

## Monitoring & Alerts

### Metrics to Track

```bash
# Resolution success rate
cre workflow metrics wf_... --metric success_rate

# Average execution time
cre workflow metrics wf_... --metric avg_duration

# Gas usage
cre workflow metrics wf_... --metric gas_used
```

### Set Up Alerts

```bash
# Alert on workflow failures
cre workflow alert wf_... \
  --condition "error_count > 3" \
  --webhook https://hooks.slack.com/...

# Alert on resolution mismatches
# (requires manual verification comparing outcomes to game state)
```

---

## Production Deployment

**When ready for mainnet:**

1. Update `workflow.yaml` production section with mainnet addresses
2. Generate new production wallet (never reuse testnet keys!)
3. Authorize production wallet in mainnet PredictionMarket
4. Fund production wallet with ETH
5. Store production secrets in separate vault
6. Deploy: `cre workflow deploy --production`
7. Monitor first 10 resolutions closely
8. Verify outcomes match expected logic

---

## Next Steps After Deployment

1. **Test with 10+ completed games** — Verify all market types resolve correctly
2. **Monitor gas costs** — Confirm estimates match reality
3. **Optimize resolution logic** — Add proper USD conversion for EarningsOver
4. **Batch resolutions** — Resolve all markets in single transaction
5. **Add market locking workflow** — Lock markets 5 minutes before game completes
6. **Add analytics** — Track resolution accuracy, claim rates

---

## Resources

- **CRE Documentation**: https://docs.chain.link/chainlink-functions/resources/cre-cli
- **PredictionMarket.sol**: `/Users/uni/deal-or-not/prototype/contracts/src/PredictionMarket.sol`
- **DealOrNotConfidential.sol**: `/Users/uni/deal-or-not/prototype/contracts/src/DealOrNotConfidential.sol`
- **market-creator workflow**: `/Users/uni/deal-or-not/prototype/workflows/market-creator/`

---

## Success Criteria

✅ When a game completes:
- All 3 markets resolve within 30 seconds
- Outcomes match game results
- Winners can claim payouts immediately
- Frontend shows "RESOLVED" status
- No manual intervention required

**Estimated Implementation Time**: 1-2 hours (including testing)

---

Built for Deal or NOT — Chainlink Convergence Hackathon 2025 🏆
