# Prediction Markets - Complete Test Plan

**Test Scope:** End-to-end verification of prediction market creation and resolution workflows for Deal or NOT hackathon submission.

---

## Test Environment

- **Network:** Base Sepolia
- **RPC:** https://sepolia.base.org
- **Contracts:**
  - DealOrNotConfidential: `0xd9D4A974021055c46fD834049e36c21D7EE48137`
  - PredictionMarket: `0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4`
  - AgentRegistry: `0xf3B0d29416d3504c802bab4A799349746A37E788`

---

## Phase 1: Pre-Flight Checks (5 minutes)

### Test 1.1: Verify Contract Deployments

**Commands:**
```bash
# Check PredictionMarket is deployed
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "admin()(address)" \
  --rpc-url https://sepolia.base.org

# Check AgentRegistry is deployed
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "nextAgentId()(uint256)" \
  --rpc-url https://sepolia.base.org

# Check DealOrNotConfidential is deployed
cast call 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "nextGameId()(uint256)" \
  --rpc-url https://sepolia.base.org
```

**Pass Criteria:**
- ✅ All contracts return valid responses (not reverts)
- ✅ AgentRegistry has at least 1 agent registered
- ✅ DealOrNot has nextGameId > 0

### Test 1.2: Verify Agent Registration

**Commands:**
```bash
# Get first agent
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "getAgentByIndex(uint256)" \
  0 \
  --rpc-url https://sepolia.base.org

# Check agent is eligible
cast call 0xf3B0d29416d3504c802bab4A799349746A37E788 \
  "isAgentEligible(address)" \
  <AGENT_ADDRESS> \
  --rpc-url https://sepolia.base.org
```

**Pass Criteria:**
- ✅ At least one agent exists
- ✅ Agent is marked as eligible (returns `true`)
- ✅ Agent has valid address and name

---

## Phase 2: Market Creation Workflow Tests (15 minutes)

### Test 2.1: Verify market-creator Workflow is Deployed

**Commands:**
```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

# Check workflow status (requires CRE CLI)
cre workflow status wf_market_creator_<ID>

# Check recent logs
cre workflow logs wf_market_creator_<ID> --tail 20
```

**Pass Criteria:**
- ✅ Workflow exists and is enabled
- ✅ No recent errors in logs
- ✅ Workflow wallet has sufficient balance (> 0.005 ETH)

### Test 2.2: Local Test - Market Creator

**Commands:**
```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-creator

# Set environment
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

# Edit src/index.ts line 195 with real agent address
# Then run:
bun run dev
```

**Expected Output:**
```
[Market Creator] Processing GameCreated event for gameId=1
[Market Creator] ✓ Player is a registered agent
[Market Creator] Agent: #1 "AgentName"
[Market Creator] Creating 3 prediction markets...
[Market Creator] ✓ Ready to create 3 markets
```

**Pass Criteria:**
- ✅ Workflow detects agent successfully
- ✅ 3 markets prepared (WillWin, EarningsOver $25, WillAcceptOffer)
- ✅ Lock time calculated correctly (createdAt + 1 hour)

### Test 2.3: E2E Test - Create Game and Verify Markets

**Commands:**
```bash
# Step 1: Get current market count
BEFORE_COUNT=$(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org)

echo "Markets before: $BEFORE_COUNT"

# Step 2: Create agent game
GAME_TX=$(cast send 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "createGame()" \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key <AGENT_PRIVATE_KEY> \
  --json)

GAME_ID=$(echo $GAME_TX | jq -r '.logs[] | select(.topics[0] == "GameCreated") | .topics[1]' | xargs printf "%d\n")

echo "Created game ID: $GAME_ID"

# Step 3: Wait 30 seconds for workflow
sleep 30

# Step 4: Check markets were created
AFTER_COUNT=$(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org)

echo "Markets after: $AFTER_COUNT"

# Step 5: Get markets for this game
MARKET_IDS=$(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  $GAME_ID \
  --rpc-url https://sepolia.base.org)

echo "Market IDs for game $GAME_ID: $MARKET_IDS"

# Step 6: Verify market details
for MARKET_ID in $(echo $MARKET_IDS | tr -d '[],' ); do
  echo "Market $MARKET_ID:"
  cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
    "markets(uint256)" \
    $MARKET_ID \
    --rpc-url https://sepolia.base.org
done
```

**Pass Criteria:**
- ✅ Market count increases by 3 (AFTER_COUNT = BEFORE_COUNT + 3)
- ✅ getGameMarkets() returns exactly 3 market IDs
- ✅ Market types are [0, 1, 2] (WillWin, EarningsOver, WillAcceptOffer)
- ✅ All markets have correct gameId and agentId
- ✅ Lock time is ~1 hour after game creation
- ✅ Markets are in "Open" status (status = 0)

---

## Phase 3: Market Resolution Workflow Tests (15 minutes)

### Test 3.1: Verify market-resolver Workflow is Deployed

**Note:** market-resolver workflow is on `feat/two-tier-jackpot-tickets` branch

**Commands:**
```bash
# Check workflow status
cre workflow status wf_market_resolver_<ID>

# Check recent logs
cre workflow logs wf_market_resolver_<ID> --tail 20
```

**Pass Criteria:**
- ✅ Workflow exists and is enabled
- ✅ No recent errors in logs
- ✅ Listening for GameComplete events

### Test 3.2: Local Test - Market Resolver

**Commands:**
```bash
cd /Users/uni/deal-or-not/prototype/workflows/market-resolver

# Set environment
export BASE_SEPOLIA_RPC="https://sepolia.base.org"

# Edit src/index.ts line 306 with real gameId
# Then run:
bun run dev
```

**Expected Output:**
```
[Market Resolver] Processing GameComplete event for gameId=X
[Market Resolver] Fetching game state...
[Market Resolver] Found 3 markets: [1, 2, 3]
[Market Resolver] Market 1 (WillWin): YES - Agent won 500000000000000000 wei
[Market Resolver] Market 2 (EarningsOver): YES - Earnings > target
[Market Resolver] Market 3 (WillAcceptOffer): NO - Agent rejected deal
[Market Resolver] ✓ Ready to resolve 3 markets
```

**Pass Criteria:**
- ✅ Workflow fetches game state successfully
- ✅ Finds all 3 markets for the game
- ✅ Determines correct outcomes for each market type
- ✅ Returns resolution data for writeReport

### Test 3.3: E2E Test - Complete Game and Verify Resolution

**Commands:**
```bash
# Use gameId from Phase 2, Test 2.3
GAME_ID=<GAME_ID_FROM_TEST_2_3>

# Step 1: Check markets before resolution
echo "Markets before game completion:"
for MARKET_ID in $(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  $GAME_ID \
  --rpc-url https://sepolia.base.org | tr -d '[],' ); do

  echo "Market $MARKET_ID status:"
  cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
    "markets(uint256)" \
    $MARKET_ID \
    --rpc-url https://sepolia.base.org | awk 'NR==5' # status field
done

# Step 2: Play and complete the game
# (Use frontend at http://localhost:3000/play or agent-gameplay-orchestrator workflow)

# Step 3: Wait 30 seconds for market-resolver workflow
sleep 30

# Step 4: Check markets after resolution
echo "Markets after game completion:"
for MARKET_ID in $(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getGameMarkets(uint256)(uint256[])" \
  $GAME_ID \
  --rpc-url https://sepolia.base.org | tr -d '[],' ); do

  echo "Market $MARKET_ID:"
  cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
    "markets(uint256)" \
    $MARKET_ID \
    --rpc-url https://sepolia.base.org
done

# Step 5: Verify outcomes match game result
GAME_STATE=$(cast call 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "getGame(uint256)" \
  $GAME_ID \
  --rpc-url https://sepolia.base.org)

echo "Game final state:"
echo "$GAME_STATE"
```

**Pass Criteria:**
- ✅ All 3 markets change status from "Open" (0) or "Locked" (1) to "Resolved" (2)
- ✅ Market outcomes match game results:
  - **WillWin**: outcome = true if finalPayout > 0
  - **EarningsOver**: outcome = true if finalPayout > targetValue
  - **WillAcceptOffer**: outcome = true if phase = DealAccepted (5)
- ✅ Markets are marked as `resolved = true`
- ✅ Winners can claim payouts (see Test 3.4)

### Test 3.4: Verify Payout Claims

**Commands:**
```bash
# Get a resolved market where user bet on winning side
MARKET_ID=<RESOLVED_MARKET_ID>
USER_ADDRESS=<BETTOR_ADDRESS>

# Check claimable amount
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "getClaimableAmount(uint256,address)" \
  $MARKET_ID \
  $USER_ADDRESS \
  --rpc-url https://sepolia.base.org

# Claim winnings
cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "claimWinnings(uint256)" \
  $MARKET_ID \
  --rpc-url https://sepolia.base.org \
  --private-key <BETTOR_PRIVATE_KEY>

# Verify claim was successful
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "hasClaimed(uint256,address)" \
  $MARKET_ID \
  $USER_ADDRESS \
  --rpc-url https://sepolia.base.org
```

**Pass Criteria:**
- ✅ getClaimableAmount returns > 0 for winners
- ✅ claimWinnings transaction succeeds
- ✅ hasClaimed returns true after claiming
- ✅ User receives ETH to their wallet

---

## Phase 4: Frontend Integration Tests (10 minutes)

### Test 4.1: Markets Page Display

**Steps:**
1. Open http://localhost:3000/markets
2. Toggle "Live On-Chain" mode (if mock data toggle exists)
3. Verify markets are displayed

**Pass Criteria:**
- ✅ 3 markets appear for the test game
- ✅ Market types displayed correctly (Will Win?, Earnings Over $25, Accept Offer?)
- ✅ Agent name and game ID shown
- ✅ Lock time displayed correctly
- ✅ Pool amounts (yesPool, noPool) shown
- ✅ Odds calculated and displayed

### Test 4.2: Betting Flow

**Steps:**
1. Click "Bet YES" or "Bet NO" on an Open market
2. Enter bet amount (e.g., 0.01 ETH)
3. Confirm transaction
4. Wait for confirmation
5. Verify bet recorded

**Pass Criteria:**
- ✅ Bet button only enabled for Open markets
- ✅ Transaction prompt appears
- ✅ Transaction succeeds on-chain
- ✅ Pool amounts update after bet
- ✅ User's bet position shown in UI
- ✅ Odds recalculate after bet

### Test 4.3: Resolved Markets Display

**Steps:**
1. Navigate to resolved market (from Test 3.3)
2. Check outcome is displayed
3. Check claim button appears for winners

**Pass Criteria:**
- ✅ Market shows "Resolved" status
- ✅ Winning side highlighted (YES or NO)
- ✅ "Claim Winnings" button visible for winners
- ✅ Claimable amount displayed
- ✅ "Already Claimed" shown after claiming

---

## Phase 5: Edge Cases & Error Handling (10 minutes)

### Test 5.1: Non-Agent Game Does Not Create Markets

**Commands:**
```bash
# Create game as non-agent player
BEFORE_COUNT=$(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org)

cast send 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "createGame()" \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key <NON_AGENT_PRIVATE_KEY>

sleep 30

AFTER_COUNT=$(cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "nextMarketId()(uint256)" \
  --rpc-url https://sepolia.base.org)

echo "Markets before: $BEFORE_COUNT, after: $AFTER_COUNT"
```

**Pass Criteria:**
- ✅ Market count does NOT increase
- ✅ Workflow logs show "Player is not a registered agent"

### Test 5.2: Markets Already Resolved

**Commands:**
```bash
# Try to resolve already resolved market
MARKET_ID=<ALREADY_RESOLVED_MARKET_ID>

cast send 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "resolveMarket(uint256,bool)" \
  $MARKET_ID \
  true \
  --rpc-url https://sepolia.base.org \
  --private-key <AUTHORIZED_RESOLVER_KEY>
```

**Pass Criteria:**
- ✅ Transaction reverts with "Already resolved" error
- ✅ Market-resolver workflow skips already resolved markets in logs

### Test 5.3: Game Completes Before Markets Lock

**Scenario:** Game completes in < 1 hour, markets still Open

**Commands:**
```bash
# Create game, complete it immediately
GAME_ID=$(cast send 0xd9D4A974021055c46fD834049e36c21D7EE48137 \
  "createGame()" \
  --value 0.01ether \
  --rpc-url https://sepolia.base.org \
  --private-key <AGENT_KEY> \
  --json | jq -r '.logs[0].topics[1]' | xargs printf "%d\n")

# Complete game immediately (using orchestrator or manual play)
# ... play game ...

# Check market status
cast call 0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4 \
  "markets(uint256)" \
  <MARKET_ID> \
  --rpc-url https://sepolia.base.org
```

**Pass Criteria:**
- ✅ Market-resolver resolves markets even if still in "Open" status
- ✅ No race condition errors
- ✅ Resolution succeeds

---

## Phase 6: Performance & Gas Tests (5 minutes)

### Test 6.1: Market Creation Gas Cost

**Commands:**
```bash
# Check recent market creation transaction
cast tx <MARKET_CREATION_TX_HASH> \
  --rpc-url https://sepolia.base.org \
  --json | jq '{gasUsed, gasPrice, totalCost: (.gasUsed * .gasPrice)}'
```

**Pass Criteria:**
- ✅ Gas used < 150k per market
- ✅ Total cost for 3 markets < $0.10 (at 0.08 gwei)

### Test 6.2: Market Resolution Gas Cost

**Commands:**
```bash
# Check recent resolution transaction
cast tx <RESOLUTION_TX_HASH> \
  --rpc-url https://sepolia.base.org \
  --json | jq '{gasUsed, gasPrice, totalCost: (.gasUsed * .gasPrice)}'
```

**Pass Criteria:**
- ✅ Gas used < 100k per market resolution
- ✅ Total cost reasonable for mainnet deployment

### Test 6.3: Workflow Execution Time

**Commands:**
```bash
# Check workflow logs for execution time
cre workflow logs wf_market_creator_<ID> --tail 50 | grep "execution time"
cre workflow logs wf_market_resolver_<ID> --tail 50 | grep "execution time"
```

**Pass Criteria:**
- ✅ Market creation: < 30 seconds from GameCreated event
- ✅ Market resolution: < 30 seconds from GameComplete event

---

## Phase 7: Hackathon Demo Preparation (10 minutes)

### Test 7.1: Full Demo Flow

**Scenario:** Complete game lifecycle for judges

**Steps:**
1. Create agent game via frontend
2. Show 3 markets appear immediately
3. Place bets on markets
4. Complete game (agent plays to completion)
5. Show markets resolve automatically
6. Claim winnings

**Recording Checklist:**
- [ ] Screen record entire flow
- [ ] Show CRE workflow logs in separate terminal
- [ ] Highlight automatic creation/resolution
- [ ] Show frontend updates in real-time
- [ ] Demonstrate betting and claiming

### Test 7.2: Documentation Review

**Files to Review:**
- [ ] `/prototype/workflows/market-creator/README.md` - Complete and accurate
- [ ] `/prototype/workflows/market-resolver/README.md` - Complete and accurate
- [ ] Frontend `/markets` page has clear instructions
- [ ] Contract addresses documented in repo

---

## Summary of Test Results

Use this table to track test execution:

| Phase | Test | Status | Notes |
|-------|------|--------|-------|
| 1.1 | Contract Deployments | ⬜ Pending | |
| 1.2 | Agent Registration | ⬜ Pending | |
| 2.1 | Creator Workflow Deployed | ⬜ Pending | |
| 2.2 | Creator Local Test | ⬜ Pending | |
| 2.3 | Creator E2E Test | ⬜ Pending | |
| 3.1 | Resolver Workflow Deployed | ⬜ Pending | |
| 3.2 | Resolver Local Test | ⬜ Pending | |
| 3.3 | Resolver E2E Test | ⬜ Pending | |
| 3.4 | Payout Claims | ⬜ Pending | |
| 4.1 | Markets Page Display | ⬜ Pending | |
| 4.2 | Betting Flow | ⬜ Pending | |
| 4.3 | Resolved Markets Display | ⬜ Pending | |
| 5.1 | Non-Agent Skip | ⬜ Pending | |
| 5.2 | Already Resolved | ⬜ Pending | |
| 5.3 | Race Condition | ⬜ Pending | |
| 6.1 | Creation Gas Cost | ⬜ Pending | |
| 6.2 | Resolution Gas Cost | ⬜ Pending | |
| 6.3 | Workflow Timing | ⬜ Pending | |
| 7.1 | Demo Flow | ⬜ Pending | |
| 7.2 | Documentation | ⬜ Pending | |

---

## Critical Issues Found

Document any issues discovered during testing:

### Issue Template
```
**Issue:** [Brief description]
**Severity:** Critical / High / Medium / Low
**Test:** [Which test found it]
**Steps to Reproduce:**
1.
2.

**Expected:**
**Actual:**
**Fix:**
```

---

## Sign-Off

**Tester:** _____________
**Date:** _____________
**Overall Status:** ✅ Pass / ⚠️ Pass with Issues / ❌ Fail
**Ready for Hackathon Submission:** Yes / No

**Notes:**

---

Built for Deal or NOT — The onchain game show where prediction markets let you bet on AI agents! 🎲📊
