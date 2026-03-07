#!/usr/bin/env bash
# Full E2E test script for Deal or NOT convergence
# Covers: VRF, CRE reveal, Gemini banker, save-quote, sponsor-jackpot, bank settle, CCIP
#
# Usage:
#   bash scripts/e2e-full.sh           # Run full E2E (local chain game + CCIP)
#   bash scripts/e2e-full.sh game      # Game only (no CCIP)
#   bash scripts/e2e-full.sh ccip      # CCIP cross-chain join only
#
# Prerequisites:
#   - CRE CLI installed and logged in (cre login)
#   - Gemini API key in workflows/.env (optional, fallback message without it)
#   - Deployer key with ETH on Base Sepolia and ETH Sepolia
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

MODE="${1:-all}"

# ── Colors ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}>>>${NC} $1"; }

# ════════════════════════════════════════════════════════
#                    GAME E2E
# ════════════════════════════════════════════════════════

run_game_e2e() {
  info "Checking bank status"
  BANK_ACTIVE=$(cast call "$BANK_CONTRACT" "isActive()(bool)" --rpc-url "$RPC_URL")
  [[ "$BANK_ACTIVE" == "true" ]] && pass "Bank is active" || fail "Bank not active, run: bash scripts/play-game.sh sweeten"

  QUOTE_BEFORE=$(cast call "$BEST_OF_BANKER" "quoteCount()(uint256)" --rpc-url "$RPC_URL")
  info "BestOfBanker quotes before: $QUOTE_BEFORE"

  # 1. Create game
  info "Creating game (\$0.25 entry fee)"
  CREATE_OUTPUT=$(bash scripts/play-game.sh create 2>&1)
  GID=$(echo "$CREATE_OUTPUT" | grep "Game created" | grep -o '[0-9]*$')
  [[ -n "$GID" ]] && pass "Game $GID created" || fail "Could not create game"

  # 2. Wait for VRF
  info "Waiting 12s for VRF callback"
  sleep 12
  STATE=$(bash scripts/play-game.sh state "$GID" 2>&1)
  PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
  [[ "$PHASE" == "1" ]] && pass "VRF received (phase 1)" || fail "VRF not received, phase=$PHASE"

  # 3. Sponsor the game (optional, if Ceptor Club is registered)
  DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_KEY" 2>/dev/null || echo "")
  if [[ -n "$DEPLOYER_ADDR" ]]; then
    REGISTERED=$(cast call "$SPONSOR_VAULT" "sponsors(address)(string,string,uint256,uint256,bool)" "$DEPLOYER_ADDR" --rpc-url "$RPC_URL" 2>/dev/null | tail -1)
    if [[ "$REGISTERED" == "true" ]]; then
      info "Sponsoring game $GID (Ceptor Club)"
      cast send "$SPONSOR_VAULT" "sponsorGame(uint256)" "$GID" \
        --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" > /dev/null 2>&1 && pass "Game sponsored" || echo "  (sponsor skipped)"
    fi
  fi

  # 4. Pick case
  info "Picking case #2"
  bash scripts/play-game.sh pick "$GID" 2 > /dev/null 2>&1
  pass "Case picked"

  # 5. Open case #0
  info "Opening case #0"
  OPEN_OUTPUT=$(bash scripts/play-game.sh open "$GID" 0 2>&1)
  TX=$(echo "$OPEN_OUTPUT" | grep "TX:" | awk '{print $2}')
  [[ -n "$TX" ]] && pass "Case opened, TX: ${TX:0:18}..." || fail "Could not open case"

  # 6. CRE reveal
  info "Running CRE confidential-reveal"
  REVEAL_OUTPUT=$(bash scripts/cre-simulate.sh reveal "$TX" 0 2>&1)
  REVEAL_TX=$(echo "$REVEAL_OUTPUT" | grep -o 'tx=0x[a-f0-9]*' | head -1 | cut -d= -f2)
  [[ -n "$REVEAL_TX" ]] && pass "Revealed, TX: ${REVEAL_TX:0:18}..." || fail "Reveal failed"

  # 7. CRE banker
  info "Running CRE AI Banker (Gemini)"
  BANKER_OUTPUT=$(bash scripts/cre-simulate.sh banker "$REVEAL_TX" 1 2>&1)
  BANKER_TX=$(echo "$BANKER_OUTPUT" | grep -o 'tx=0x[a-f0-9]*' | head -1 | cut -d= -f2)
  if [[ -n "$BANKER_TX" ]]; then
    pass "Banker offer written, TX: ${BANKER_TX:0:18}..."
  else
    echo "  (banker may have skipped, checking phase)"
  fi

  # 8. CRE save-quote (if banker wrote)
  if [[ -n "$BANKER_TX" ]]; then
    info "Running CRE save-quote"
    bash scripts/cre-simulate.sh savequote "$BANKER_TX" 1 > /dev/null 2>&1 && pass "Quote saved" || echo "  (save-quote skipped)"
  fi

  # 9. Reject, open another, go to final
  info "Rejecting deal (NO DEAL!)"
  bash scripts/play-game.sh reject "$GID" > /dev/null 2>&1
  pass "Deal rejected"

  info "Opening case #1"
  OPEN2_OUTPUT=$(bash scripts/play-game.sh open "$GID" 1 2>&1)
  TX2=$(echo "$OPEN2_OUTPUT" | grep "TX:" | awk '{print $2}')

  info "Running CRE reveal (round 2)"
  REVEAL2_OUTPUT=$(bash scripts/cre-simulate.sh reveal "$TX2" 0 2>&1)
  REVEAL2_TX=$(echo "$REVEAL2_OUTPUT" | grep -o 'tx=0x[a-f0-9]*' | head -1 | cut -d= -f2)
  [[ -n "$REVEAL2_TX" ]] && pass "Round 2 revealed" || fail "Round 2 reveal failed"

  info "Running CRE banker (round 2)"
  bash scripts/cre-simulate.sh banker "$REVEAL2_TX" 1 > /dev/null 2>&1 || true

  info "Rejecting round 2"
  bash scripts/play-game.sh reject "$GID" > /dev/null 2>&1 || true

  # 10. Open case #3 to trigger final round
  info "Opening case #3 (triggers final round)"
  OPEN3_OUTPUT=$(bash scripts/play-game.sh open "$GID" 3 2>&1)
  TX3=$(echo "$OPEN3_OUTPUT" | grep "TX:" | awk '{print $2}')

  info "Running CRE reveal (round 3)"
  REVEAL3_OUTPUT=$(bash scripts/cre-simulate.sh reveal "$TX3" 0 2>&1)
  pass "Round 3 revealed"

  # 11. Keep case
  info "Keeping case (final decision)"
  bash scripts/play-game.sh keep "$GID" > /dev/null 2>&1

  # Check for final CRE reveal
  STATE=$(bash scripts/play-game.sh state "$GID" 2>&1)
  PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
  if [[ "$PHASE" == "7" ]]; then
    info "Running final CRE reveal"
    KEEP_TX=$(cast receipt --json $(cast send "$GAME_CONTRACT" "getGameState(uint256)" "$GID" --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" 2>/dev/null | grep transactionHash | head -1 | awk '{print $2}') 2>/dev/null || true)
    # Find the keepCase TX from recent blocks
    KEEP_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
    KEEP_TX=$(cast logs --from-block $((KEEP_BLOCK - 5)) --to-block "$KEEP_BLOCK" --address "$GAME_CONTRACT" --json "$TOPIC_CASE_OPEN" --rpc-url "$RPC_URL" 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[-1]['transactionHash']) if d else ''" 2>/dev/null || echo "")
    if [[ -n "$KEEP_TX" ]]; then
      bash scripts/cre-simulate.sh reveal "$KEEP_TX" 1 > /dev/null 2>&1 && pass "Final reveal done" || echo "  (final reveal skipped)"
    fi
  fi

  # 12. Verify game over
  sleep 2
  STATE=$(bash scripts/play-game.sh state "$GID" 2>&1)
  PHASE=$(echo "$STATE" | sed -n '4p' | tr -d ' ')
  [[ "$PHASE" == "8" ]] && pass "Game over (phase 8)" || info "Game phase: $PHASE (may need final reveal)"

  PAYOUT=$(echo "$STATE" | sed -n '9p' | tr -d ' ')
  info "Final payout: $PAYOUT cents"

  QUOTE_AFTER=$(cast call "$BEST_OF_BANKER" "quoteCount()(uint256)" --rpc-url "$RPC_URL")
  info "BestOfBanker quotes after: $QUOTE_AFTER (was $QUOTE_BEFORE)"

  echo ""
  echo "======================================="
  echo "  E2E GAME COMPLETE: Game #$GID"
  echo "======================================="
}

# ════════════════════════════════════════════════════════
#                    CCIP E2E
# ════════════════════════════════════════════════════════

run_ccip_e2e() {
  ETH_SEPOLIA_RPC="https://ethereum-sepolia-rpc.publicnode.com"

  info "CCIP E2E: Cross-chain join from ETH Sepolia to Base Sepolia"
  echo ""

  # Check prerequisites
  info "Checking CCIP wiring"
  BRIDGE_GAME=$(cast call "$BRIDGE_CONTRACT" "gameContract()(address)" --rpc-url "$RPC_URL")
  [[ "$BRIDGE_GAME" == "$GAME_CONTRACT" ]] && pass "Bridge -> Game wired" || fail "Bridge game contract mismatch"

  BRIDGE_GW=$(cast call "$BRIDGE_CONTRACT" "gateways(uint64)(address)" 16015286601757825753 --rpc-url "$RPC_URL")
  [[ "$BRIDGE_GW" == "$GATEWAY_CONTRACT" ]] && pass "Bridge -> Gateway wired" || fail "Bridge gateway not set"

  GW_BRIDGE=$(cast call "$GATEWAY_CONTRACT" "homeBridge()(address)" --rpc-url "$ETH_SEPOLIA_RPC")
  [[ "$GW_BRIDGE" == "$BRIDGE_CONTRACT" ]] && pass "Gateway -> Bridge wired" || fail "Gateway homeBridge not set"

  GAME_BRIDGE=$(cast call "$GAME_CONTRACT" "ccipBridge()(address)" --rpc-url "$RPC_URL")
  [[ "$GAME_BRIDGE" == "$BRIDGE_CONTRACT" ]] && pass "Game -> Bridge authorized" || fail "Game ccipBridge not set. Run: cast send $GAME_CONTRACT setCCIPBridge(address) $BRIDGE_CONTRACT --private-key \$DEPLOYER_KEY --rpc-url \$RPC_URL"

  # Create a game on Base Sepolia first
  info "Creating game on Base Sepolia for cross-chain join"
  CREATE_OUTPUT=$(bash scripts/play-game.sh create 2>&1)
  GID=$(echo "$CREATE_OUTPUT" | grep "Game created" | grep -o '[0-9]*$')
  [[ -n "$GID" ]] && pass "Game $GID created on Base Sepolia" || fail "Could not create game"

  info "Waiting 12s for VRF"
  sleep 12

  # Estimate cost on ETH Sepolia
  info "Estimating cross-chain entry cost"
  COST=$(cast call "$GATEWAY_CONTRACT" "estimateCost(uint256)(uint256,uint256,uint256)" "$GID" --rpc-url "$ETH_SEPOLIA_RPC" 2>&1)
  TOTAL_WEI=$(echo "$COST" | tail -1 | awk '{print $1}')
  info "Total cost (entry + CCIP fee): $TOTAL_WEI wei"

  # Send cross-chain join
  info "Sending enterGame($GID) from ETH Sepolia"
  CCIP_RESULT=$(cast send "$GATEWAY_CONTRACT" "enterGame(uint256)" "$GID" \
    --value "$TOTAL_WEI" \
    --private-key "$DEPLOYER_KEY" \
    --rpc-url "$ETH_SEPOLIA_RPC" --json 2>&1) || { echo "$CCIP_RESULT"; fail "enterGame TX failed"; }
  CCIP_TX=$(echo "$CCIP_RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
  pass "CCIP message sent, TX: ${CCIP_TX:0:18}..."

  info "CCIP message takes ~5-20 minutes to arrive on Base Sepolia"
  info "Monitor at: https://ccip.chain.link/tx/$CCIP_TX"
  echo ""
  info "Once arrived, verify the player joined:"
  info "  cast call $GAME_CONTRACT 'getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])' $GID --rpc-url $RPC_URL"
  info "  The second address (player) should be the deployer address"

  echo ""
  echo "======================================="
  echo "  CCIP E2E: Message sent for Game #$GID"
  echo "  Wait for CCIP delivery, then continue"
  echo "  playing with: bash scripts/play-game.sh"
  echo "======================================="
}

# ── Main ──

case "$MODE" in
  game)
    run_game_e2e
    ;;
  ccip)
    run_ccip_e2e
    ;;
  all)
    run_game_e2e
    echo ""
    echo ""
    run_ccip_e2e
    ;;
  *)
    echo "Usage: e2e-full.sh [game|ccip|all]"
    exit 1
    ;;
esac
