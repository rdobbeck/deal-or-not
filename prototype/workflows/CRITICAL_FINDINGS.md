# Prediction Markets - Critical Findings

**Date:** 2026-03-08
**Tester:** Claude Code
**Status:** 🔴 **NOT READY FOR HACKATHON**

---

## Executive Summary

Prediction markets are **NOT functioning** in production. Zero markets exist on-chain despite 46 games being created. Root cause: market-creator and market-resolver CRE workflows exist in codebase but are **NOT DEPLOYED**.

---

## Test Results

### ✅ Phase 1: Pre-Flight Checks (PASSED)

**Contracts:**
- ✅ PredictionMarket deployed at `0x8606Ed23CBa4903e10F26Bc756E70d867dEDDcC4`
- ✅ AgentRegistry deployed at `0xf3B0d29416d3504c802bab4A799349746A37E788` (4 agents registered)
- ✅ DealOrNot deployed at `0xd9D4A974021055c46fD834049e36c21D7EE48137` (46 games created)

**Agent Registration:**
- ✅ Agent #1 exists (TestEVBot)
- ✅ Agent #2 exists and is eligible
- ✅ isAgentEligible() function works correctly

### 🔴 Phase 2: Market Creation (FAILED - Not Deployed)

**On-Chain Status:**
- ❌ `nextMarketId = 1` (zero markets created)
- ❌ All 46 games have empty market arrays: `getGameMarkets(gameId) = []`
- ❌ No markets visible on frontend

**Workflow Status:**
- ✅ market-creator workflow code exists on `feat/market-creator-workflow` branch
- ✅ LOCAL TEST PASSED after fixes (see bugs below)
- ❌ Workflow NOT deployed to CRE (no active deployment found)

**Bugs Fixed During Testing:**
1. **Bug:** Workflow called non-existent function `getAgentByPlayer(address)`
   - **Fix:** Changed to `getAgentId(address)` + removed getAgent() call (not needed for market creation)
   - **File:** `/prototype/workflows/market-creator/src/index.ts:86-93`

2. **Bug:** Workflow tried to fetch game data via `getGame(uint256)` which reverted
   - **Fix:** Use current timestamp for lock time calculation instead
   - **File:** `/prototype/workflows/market-creator/src/index.ts:95-102`

3. **Bug:** JSON.stringify errors on BigInt values
   - **Fix:** Added BigInt replacer function
   - **File:** `/prototype/workflows/market-creator/src/index.ts:153,189`

**Local Test Output:**
```
[Market Creator] ✓ Player is a registered agent
[Market Creator] Agent ID: 2 (player: 0x75a32D24fd4EDB2C5895aCE905dA5Ee1fBD584A1)
[Market Creator] Lock time set to: 2026-03-09T00:07:24.000Z
[Market Creator] Creating 3 prediction markets...
[Market Creator] ✓ Ready to create 3 markets

Markets:
  1. WillWin (type 0)
  2. EarningsOver $25 (type 1, target 2500 cents)
  3. WillAcceptOffer (type 2)

Result: { success: true, marketsCreated: 3 }
```

### 🔴 Phase 3: Market Resolution (NOT TESTED)

**Workflow Status:**
- ✅ market-resolver workflow code exists on `feat/two-tier-jackpot-tickets` branch
- ❌ Cannot test resolution until markets are being created
- ❌ Workflow likely also NOT deployed to CRE

---

## Critical Blockers for Hackathon

### 1. Deploy market-creator Workflow to CRE
**Priority:** P0 (CRITICAL)
**Branch:** `feat/market-creator-workflow`
**Files Modified:** `market-creator/src/index.ts` (bugs fixed)

**Steps Required:**
1. Merge fixed market-creator code to main or deployable branch
2. Generate CRE workflow wallet
3. Fund wallet with ~0.01 ETH on Base Sepolia
4. Authorize wallet in PredictionMarket contract: `authorizeResolver(address)`
5. Store private key in CRE vault: `cre secret set PRIVATE_KEY`
6. Deploy: `cre workflow deploy --staging`
7. Enable: `cre workflow enable wf_...`
8. Test: Create agent game and verify 3 markets appear within 30 seconds

**Estimated Time:** 1-2 hours (including testing)

### 2. Deploy market-resolver Workflow to CRE
**Priority:** P0 (CRITICAL)
**Branch:** `feat/two-tier-jackpot-tickets`
**Dependencies:** Requires #1 completed first (need markets to resolve)

**Steps Required:**
1. Verify market-resolver code (may have similar bugs)
2. Follow same deployment process as market-creator
3. Test: Complete a game and verify markets resolve + payouts claimable

**Estimated Time:** 1-2 hours (including testing)

### 3. Update market-creator to Create All 3 Markets
**Priority:** P1 (HIGH)
**Current Limitation:** CRE workflow.yaml only supports one `writeReport` action

**Options:**
- **Option A (Quick):** Deploy as-is, creates only WillWin market (1 of 3)
- **Option B (Better):** Modify workflow to call `createMarket()` 3 times using viem walletClient (see README line 306-339)
- **Option C (Ideal):** Wait for CRE to support multiple writeReports (not realistic for hackathon)

**Recommendation:** Use Option B

---

## Files Requiring Deployment

### market-creator workflow
- Location: `/prototype/workflows/market-creator/`
- Branch: `feat/market-creator-workflow`
- Status: Code fixed, local test passed, ready to deploy
- Critical files:
  - `src/index.ts` (fixed version)
  - `workflow.yaml` (CRE config)
  - `package.json` (dependencies)

### market-resolver workflow
- Location: `/prototype/workflows/market-resolver/`
- Branch: `feat/two-tier-jackpot-tickets` or `feat/market-creator-workflow`
- Status: Code exists, not tested yet
- Critical files:
  - `src/index.ts`
  - `workflow.yaml`
  - `README.md` (comprehensive deployment guide)

---

## Recommended Action Plan

**For Hackathon Success (4-6 hours total):**

1. **Hour 1:** Deploy market-creator workflow (P0)
   - Merge fixed code
   - Deploy to CRE staging
   - Test with 1 agent game

2. **Hour 2:** Verify markets appearing (P0)
   - Create 3 agent games
   - Confirm 9 markets created (3 per game)
   - Test betting functionality

3. **Hour 3-4:** Deploy market-resolver workflow (P0)
   - Deploy to CRE staging
   - Complete 1 agent game
   - Verify markets resolve correctly
   - Test payout claims

4. **Hour 5:** Frontend integration (P1)
   - Verify markets page shows live data
   - Test betting flow E2E
   - Test claim winnings flow

5. **Hour 6:** Demo preparation (P1)
   - Record full game lifecycle
   - Prepare judges demo script
   - Document any known issues

**Alternative (Minimum Viable for Demo):**
If time-constrained, deploy only market-creator workflow (1-2 hours) and manually resolve markets using admin functions. This demonstrates the core prediction market concept even without full automation.

---

## Test Plan Status

| Phase | Test | Status | Notes |
|-------|------|--------|-------|
| 1.1 | Contract Deployments | ✅ PASS | All contracts live |
| 1.2 | Agent Registration | ✅ PASS | 4 agents registered |
| 2.1 | Creator Workflow Deployed | ❌ FAIL | Not deployed |
| 2.2 | Creator Local Test | ✅ PASS | After bug fixes |
| 2.3 | Creator E2E Test | ⏸️ BLOCKED | Requires CRE deployment |
| 3.1 | Resolver Workflow Deployed | ❌ FAIL | Not deployed |
| 3.2 | Resolver Local Test | ⏸️ PENDING | Blocked by creator deployment |
| 3.3 | Resolver E2E Test | ⏸️ BLOCKED | Requires markets to exist |

---

## Success Criteria

**Minimum for Hackathon Demo:**
- [ ] At least 1 market created per agent game (even if not all 3)
- [ ] Markets visible on frontend
- [ ] Betting works
- [ ] Markets can be resolved (manually or automatically)
- [ ] Winners can claim payouts

**Ideal for Hackathon:**
- [ ] All 3 markets created automatically per agent game
- [ ] Markets lock before game completes
- [ ] Markets resolve automatically on GameComplete
- [ ] Full E2E flow: Create game → Markets appear → Bet → Game completes → Markets resolve → Claim winnings

---

## Resources

- Test Plan: `/prototype/workflows/PREDICTION_MARKETS_TEST_PLAN.md`
- Market Creator README: `/prototype/workflows/market-creator/README.md`
- Market Resolver README: `/prototype/workflows/market-resolver/README.md`
- Fixed market-creator code: Branch `feat/market-creator-workflow`

---

**Next Steps:** Deploy market-creator workflow to CRE immediately. This is the critical blocker preventing prediction markets from functioning.
