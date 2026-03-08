# Market Creator Workflow

**CRE Workflow** — Automatically creates prediction markets when agent games are created

---

## Problem Statement

**Current Issue**: Prediction markets aren't showing up when games are created because:
1. Markets must be manually created via `PredictionMarket.createMarket()`
2. Only authorized resolvers can create markets (`onlyAuthorized` modifier)
3. No automation exists to watch for `GameCreated` events and trigger market creation
4. Frontend shows mock data because no real markets exist

**This workflow solves it** by:
- Listening for `GameCreated` events from `DealOrNotConfidential.sol`
- Checking if the player is a registered agent
- Auto-creating 3 prediction markets per agent game:
  1. **Will Win?** — Will agent win anything?
  2. **Earnings Over $25** — Will agent earn more than $25?
  3. **Will Accept Offer?** — Will agent accept the banker's offer?

---

## Architecture

```
GameCreated Event (on-chain)
  ↓
CRE Workflow Triggered
  ↓
Check AgentRegistry.isAgentEligible(player)
  ↓ (if YES)
Fetch agent details (agentId, name)
  ↓
Calculate lockTime (createdAt + 1 hour)
  ↓
Create 3 markets via PredictionMarket.createMarket()
  ↓
Markets visible on /markets page!
```

---

## Implementation Plan for Tippi

### Phase 1: Prerequisites (5 minutes)

**1. Verify contract deployments:**

```bash
cd /Users/uni/deal-or-not/prototype/contracts

# Check PredictionMarket address
echo "PredictionMarket: 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4"

# Verify it's deployed
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "admin()(address)" \
  --rpc-url https://sepolia.base.org

# Check AgentRegistry address
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "nextAgentId()(uint256)" \
  --rpc-url https://sepolia.base.org
```

**2. Authorize the CRE workflow to create markets:**

```bash
# The workflow will use a dedicated wallet address
# You need to authorize it in PredictionMarket contract

# First, get the deployer private key from .env
source /Users/uni/deal-or-not/prototype/.env

# Authorize CRE workflow wallet (we'll generate this in Phase 2)
# This command will be run after you have the workflow wallet address
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "authorizeResolver(address)" \
  <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY
```

---

### Phase 2: Setup Workflow (10 minutes)

**1. Install dependencies:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install
```

**2. Generate dedicated wallet for workflow:**

```bash
# Generate new private key
cast wallet new

# Save the output:
# Address: 0x...
# Private Key: 0x...

# Fund it with ~0.01 ETH on Base Sepolia for gas
# Use a faucet or transfer from deployer wallet
```

**3. Store secrets in CRE Vault:**

```bash
# Login to CRE CLI
cre login

# Store workflow private key
cre secret set PRIVATE_KEY "0x..." --vault deal-or-not/market-creator-key

# Store RPC URL (optional, uses public RPC by default)
cre secret set BASE_SEPOLIA_RPC "https://sepolia.base.org" --vault deal-or-not/base-rpc
```

**4. Update workflow.yaml with wallet address:**

Edit `workflow.yaml` line 28 to add the workflow wallet as authorized resolver.

---

### Phase 3: Local Testing (15 minutes)

**1. Test workflow locally:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

# Set environment variables
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

# Edit src/index.ts line 134 with a real agent address
# Get agent address from AgentRegistry:
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "getAgentByIndex(uint256)(address,string,string,uint256,uint256,uint256,uint256,bool)" \
  0 \
  --rpc-url https://sepolia.base.org

# Run test
bun run dev
```

**Expected Output:**
```
[Market Creator] Processing GameCreated event for gameId=1
[Market Creator] Checking if player 0x... is an agent...
[Market Creator] ✓ Player is a registered agent
[Market Creator] Agent: #1 "AgentName"
[Market Creator] Creating 3 prediction markets...
[Market Creator] ✓ Ready to create 3 markets
```

**2. Test market creation manually:**

```bash
# Manually create one market to verify contract works
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "createMarket(uint256,uint256,uint8,uint256,uint256)" \
  1 \
  1 \
  0 \
  0 \
  $(($(date +%s) + 3600)) \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify market was created
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org
```

---

### Phase 4: Deploy to CRE Staging (20 minutes)

**1. Simulate workflow:**

```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

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

**1. Create a test agent game:**

```bash
cd /Users/uni/deal-or-not/prototype/contracts

# Get agent address
AGENT_ADDRESS=$(cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "getAgentByIndex(uint256)(address,string,string,uint256,uint256,uint256,uint256,bool)" \
  0 \
  --rpc-url https://sepolia.base.org | grep -oE '0x[a-fA-F0-9]{40}' | head -1)

# Create game as agent
cast send 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "createGame()" \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key <AGENT_PRIVATE_KEY>

# Note the gameId from events
```

**2. Wait for workflow to execute (10-30 seconds):**

```bash
# Watch CRE logs
cre workflow logs wf_... --follow

# Expected output:
# [Market Creator] Processing GameCreated event for gameId=X
# [Market Creator] ✓ Player is a registered agent
# [Market Creator] Creating 3 prediction markets...
# [Market Creator] ✓ Markets created successfully
```

**3. Verify markets were created:**

```bash
# Check market count
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org

# Get markets for gameId
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  <GAME_ID> \
  --rpc-url https://sepolia.base.org

# Should return [marketId1, marketId2, marketId3]
```

**4. Check frontend:**

```bash
cd /Users/uni/deal-or-not/prototype/frontend

# Make sure you're using live on-chain data (not mock data)
# Click the "Live On-Chain" toggle at /markets

# Open browser
open http://localhost:3000/markets

# You should see 3 markets for the game!
```

---

### Phase 6: Known Issues & Solutions

#### Issue 1: CRE Limitation - One writeReport per workflow

**Problem**: CRE workflows currently support one `writeReport` action per execution. We need to create 3 markets.

**Solutions**:
- **Option A (Current)**: Create only the "Will Win?" market per event
- **Option B (Recommended)**: Call `createMarket()` 3 times within the TypeScript code using viem
- **Option C (Future)**: Wait for CRE to support multiple writeReports

**Implementation for Option B:**

Edit `src/index.ts` to replace the return statement with:

```typescript
// Instead of returning reportData, execute writes directly
import { createWalletClient, privateKeyToAccount } from "viem";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const walletClient = createWalletClient({
  chain: baseSepolia,
  transport: http(rpcUrl),
  account,
});

// Create all 3 markets
for (const market of marketsToCreate) {
  const hash = await walletClient.writeContract({
    address: PREDICTION_MARKET_ADDRESS,
    abi: PREDICTION_MARKET_ABI,
    functionName: "createMarket",
    args: [
      market.gameId,
      market.agentId,
      market.marketType,
      market.targetValue,
      market.lockTime,
    ],
  });

  console.log(`[Market Creator] Created market tx: ${hash}`);

  // Wait for confirmation
  await client.waitForTransactionReceipt({ hash });
}
```

#### Issue 2: Workflow wallet runs out of gas

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

#### Issue 3: Events not triggering workflow

**Checklist**:
- [ ] Workflow is enabled: `cre workflow status wf_...`
- [ ] Contract address correct in `workflow.yaml`
- [ ] Event signature matches: `GameCreated(uint256,address,address)`
- [ ] Subscription active: Check CRE dashboard
- [ ] Confirmations set to 1 (not too high)

---

### Phase 7: Production Deployment

**When ready for mainnet:**

1. Update `workflow.yaml` production section with mainnet addresses
2. Generate new production wallet (never reuse testnet keys!)
3. Fund production wallet with ETH
4. Store production secrets in separate vault
5. Deploy: `cre workflow deploy --production`
6. Monitor first 10 games closely

---

## Monitoring & Alerts

### Metrics to Track

```bash
# Market creation success rate
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

# Alert on low gas
# (requires external monitoring script)
```

---

## Cost Estimation

**Per game with agent:**
- Gas per market creation: ~100k gas
- 3 markets × 100k gas = 300k gas total
- At 0.08 gwei Base gas price: ~$0.05 per game
- 100 games/day = $5/day = $150/month

**Optimization**: Batch create markets in single transaction (future enhancement)

---

## Testing Checklist

- [ ] Workflow deploys successfully to CRE
- [ ] GameCreated event triggers workflow
- [ ] Agent eligibility check works
- [ ] 3 markets created per agent game
- [ ] Markets have correct gameId, agentId
- [ ] Lock time set correctly (createdAt + 1 hour)
- [ ] Markets visible on frontend /markets page
- [ ] Non-agent games don't create markets
- [ ] Workflow logs show success
- [ ] Gas costs within expected range

---

## Troubleshooting

### Workflow not triggering

```bash
# Check workflow status
cre workflow status wf_...

# Check recent events
cast logs --address 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  --event "GameCreated(uint256,address,address)" \
  --from-block -100 \
  --rpc-url https://sepolia.base.org
```

### Markets not visible on frontend

```bash
# Check if markets exist on-chain
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org

# Make sure frontend is using live data (not mock)
# Toggle at /markets should show "Live On-Chain"
```

### Transaction failures

```bash
# Check workflow wallet balance
cast balance <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org \
  --ether

# Check if wallet is authorized
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "authorizedResolvers(address)(bool)" \
  <WORKFLOW_WALLET_ADDRESS> \
  --rpc-url https://sepolia.base.org
```

---

## Next Steps After Deployment

1. **Market Resolution Workflow** — Auto-resolve markets when games complete
2. **Market Locking Workflow** — Lock markets 5 minutes before game starts
3. **Analytics Dashboard** — Track market creation stats
4. **Dynamic Targets** — Create "Earnings Over" markets with varying targets based on agent history

---

## Resources

- **CRE Documentation**: https://docs.chain.link/chainlink-functions/resources/cre-cli
- **PredictionMarket.sol**: `/Users/uni/deal-or-not/prototype/contracts/src/PredictionMarket.sol`
- **Frontend Integration**: `/Users/uni/deal-or-not/prototype/frontend/app/markets/`
- **Other Workflows**: `/Users/uni/deal-or-not/prototype/workflows/`

---

## Success Criteria

✅ When a game is created with an agent player:
- 3 markets appear on `/markets` page within 30 seconds
- Markets have correct agent name and game ID
- Betting works immediately
- No manual intervention required

**Estimated Implementation Time**: 1-2 hours (including testing)

---

Built for Deal or NOT — The onchain game show where prediction markets let you bet on AI agents! 🎲📊
