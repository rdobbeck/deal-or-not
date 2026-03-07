#!/usr/bin/env bash
# CRE Simulate — single script for all CRE workflows
# Usage: ./scripts/cre-simulate.sh <reveal|banker|savequote|support> [args...]
#
# Commands:
#   reveal    <TX_HASH> [EVENT_INDEX]  Reveal case value (CaseOpenRequested)
#   banker    <TX_HASH> [EVENT_INDEX]  AI Banker offer (RoundComplete)
#   savequote <TX_HASH> [EVENT_INDEX]  Save banker quote to BestOfBanker (BankerMessage)
#   support   <GAME_ID> [POLL]         Auto-watch game and trigger workflows
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

WORKFLOWS="$PROJECT_DIR/workflows"

CMD="${1:?Usage: cre-simulate.sh <reveal|banker|savequote|support> [args...]}"
shift

# ── Helpers ──

get_phase() {
  local raw
  raw=$(cast call "$GAME_CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$1" --rpc-url "$RPC_URL" 2>/dev/null) || { echo "-1"; return; }
  readarray -t fields <<< "$raw"
  echo "${fields[3]}"
}

find_event_in_range() {
  local topic="$1" from="$2" to="$3"
  [[ $from -lt 0 ]] && from=0
  local window_end=$to
  while [[ $window_end -ge $from ]]; do
    local window_from=$((window_end - 9))
    [[ $window_from -lt $from ]] && window_from=$from
    local result
    result=$(cast logs --from-block "$window_from" --to-block "$window_end" --address "$GAME_CONTRACT" --json "$topic" --rpc-url "$RPC_URL" 2>/dev/null) || { window_end=$((window_end - 10)); continue; }
    local tx
    tx=$(echo "$result" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[-1]['transactionHash']) if d else None" 2>/dev/null)
    if [[ -n "$tx" && "$tx" != "None" ]]; then
      echo "$tx"
      return 0
    fi
    window_end=$((window_end - 10))
  done
  echo ""
  return 0
}

run_reveal() {
  local tx="$1" event_idx="${2:-0}"
  echo "Running CRE confidential-reveal..."
  echo "  TX:    $tx"
  echo "  Event: log index $event_idx"
  cd "$WORKFLOWS"
  cre workflow simulate ./confidential-reveal \
    --evm-tx-hash "$tx" \
    --evm-event-index "$event_idx" \
    -T staging-settings \
    --broadcast \
    --non-interactive \
    --trigger-index 0
}

run_banker() {
  local tx="$1" event_idx="${2:-1}"
  echo "Running CRE AI Banker..."
  echo "  TX:    $tx"
  echo "  Event: log index $event_idx (RoundComplete)"

  cd "$WORKFLOWS"

  # Inject Gemini API key for simulate mode (restore on exit)
  local config="$WORKFLOWS/banker-ai/config.staging.json"
  if [[ -n "$GEMINI_API_KEY_ALL" ]]; then
    local backup
    backup=$(cat "$config")
    # shellcheck disable=SC2064
    trap "cat <<'RESTORE' > '$config'
$backup
RESTORE" EXIT
    python3 -c "
import json
with open('$config') as f:
    c = json.load(f)
c['geminiApiKey'] = '${GEMINI_API_KEY_ALL}'
with open('$config', 'w') as f:
    json.dump(c, f, indent=2)
"
    echo "  Gemini API key injected"
  else
    echo "  WARNING: No GEMINI_API_KEY_ALL — AI Banker will use fallback message"
  fi

  cre workflow simulate ./banker-ai \
    --evm-tx-hash "$tx" \
    --evm-event-index "$event_idx" \
    -T staging-settings \
    --broadcast \
    --non-interactive \
    --trigger-index 0
}

run_jackpot() {
  local tx="$1" event_idx="${2:-0}"
  cd "$WORKFLOWS"
  cre workflow simulate ./sponsor-jackpot \
    --evm-tx-hash "$tx" \
    --evm-event-index "$event_idx" \
    -T staging-settings \
    --broadcast \
    --non-interactive \
    --trigger-index 0 2>&1 || echo "(jackpot skipped — non-critical)"
}

run_save_quote() {
  local tx="$1" event_idx="${2:-0}"
  echo "Running CRE save-quote..."
  echo "  TX:    $tx"
  echo "  Event: log index $event_idx (BankerMessage)"
  cd "$WORKFLOWS"
  cre workflow simulate ./save-quote \
    --evm-tx-hash "$tx" \
    --evm-event-index "$event_idx" \
    -T staging-settings \
    --broadcast \
    --non-interactive \
    --trigger-index 0 2>&1 || echo "(save-quote skipped — non-critical)"
}

# ── Commands ──

case "$CMD" in
  reveal)
    TX_HASH="${1:?Usage: cre-simulate.sh reveal <TX_HASH> [EVENT_INDEX]}"
    EVENT_INDEX="${2:-0}"
    run_reveal "$TX_HASH" "$EVENT_INDEX"
    ;;

  banker)
    TX_HASH="${1:?Usage: cre-simulate.sh banker <TX_HASH> [EVENT_INDEX]}"
    EVENT_INDEX="${2:-1}"
    run_banker "$TX_HASH" "$EVENT_INDEX"
    ;;

  savequote)
    TX_HASH="${1:?Usage: cre-simulate.sh savequote <TX_HASH> [EVENT_INDEX]}"
    EVENT_INDEX="${2:-0}"
    run_save_quote "$TX_HASH" "$EVENT_INDEX"
    ;;

  support)
    GAME_ID="${1:?Usage: cre-simulate.sh support <GAME_ID> [POLL_INTERVAL]}"
    POLL="${2:-5}"

    echo "======================================="
    echo "  CRE Support — QuickPlay Game #$GAME_ID"
    echo "  Polling every ${POLL}s"
    echo "  Press Ctrl+C to stop"
    echo "======================================="
    echo ""

    PREV_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
    PREV_PHASE=-1
    LAST_REVEAL_TX=""
    LAST_BANKER_TX=""

    while true; do
      PHASE=$(get_phase "$GAME_ID")
      [[ "$PHASE" == "-1" ]] && { sleep "$POLL"; continue; }

      CUR_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "$PREV_BLOCK")

      if [[ "$PHASE" != "$PREV_PHASE" ]]; then
        echo ""
        echo "--- Phase: ${PHASE_NAMES[$PHASE]:-Unknown} ($PHASE) ---"

        SEARCH_FROM=$((PREV_BLOCK - 5))
        SEARCH_TO=$CUR_BLOCK

        case "$PHASE" in
          0) echo "  Waiting for VRF callback (~10s)..." ;;
          1) echo "  Game ready! Pick a case." ;;
          2) echo "  Round in progress — open a case." ;;
          3|7)
            [[ "$PHASE" == "7" ]] && echo "  Final case — running CRE reveal..." || echo "  Case opened — running CRE reveal..."
            echo "  Searching blocks $SEARCH_FROM -> $SEARCH_TO..."

            OPEN_TX=$(find_event_in_range "$TOPIC_CASE_OPEN" "$SEARCH_FROM" "$SEARCH_TO")
            if [[ -n "$OPEN_TX" && "$OPEN_TX" != "$LAST_REVEAL_TX" ]]; then
              LAST_REVEAL_TX="$OPEN_TX"
              echo "  Found CaseOpenRequested TX: $OPEN_TX"
              [[ "$PHASE" == "7" ]] && EVENT_IDX=1 || EVENT_IDX=0

              echo ""
              run_reveal "$OPEN_TX" "$EVENT_IDX" 2>&1 | sed 's/^/  | /' || echo "  | reveal failed"
              echo ""
              run_jackpot "$OPEN_TX" "$EVENT_IDX" 2>&1 | sed 's/^/  | /' || true
            elif [[ -z "$OPEN_TX" ]]; then
              echo "  WARNING: Could not find CaseOpenRequested TX"
            fi
            ;;
          4)
            echo "  Awaiting offer — running AI Banker..."
            echo "  Searching blocks $SEARCH_FROM -> $SEARCH_TO..."

            REVEAL_TX=$(find_event_in_range "$TOPIC_ROUND_COMPLETE" "$SEARCH_FROM" "$SEARCH_TO")
            if [[ -n "$REVEAL_TX" && "$REVEAL_TX" != "$LAST_BANKER_TX" ]]; then
              LAST_BANKER_TX="$REVEAL_TX"
              echo "  Found RoundComplete TX: $REVEAL_TX"
              echo ""
              run_banker "$REVEAL_TX" 2>&1 | sed 's/^/  | /' || echo "  | banker failed"
            elif [[ -z "$REVEAL_TX" ]]; then
              echo "  WARNING: Could not find RoundComplete TX — falling back to on-chain offer..."
              OFFER=$(cast call "$GAME_CONTRACT" "calculateBankerOffer(uint256)(uint256)" "$GAME_ID" --rpc-url "$RPC_URL")
              echo "  Computed offer: $OFFER cents"
              cast send "$GAME_CONTRACT" "setBankerOffer(uint256,uint256)" "$GAME_ID" "$OFFER" \
                --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" 2>&1 | sed 's/^/  | /'
            fi
            ;;
          5)
            echo "  Banker offer is in! Saving quote to BestOfBanker..."
            echo "  Searching blocks $SEARCH_FROM -> $SEARCH_TO..."

            BANKER_MSG_TX=$(find_event_in_range "$TOPIC_BANKER_MESSAGE" "$SEARCH_FROM" "$SEARCH_TO")
            if [[ -n "$BANKER_MSG_TX" ]]; then
              echo "  Found BankerMessage TX: $BANKER_MSG_TX"
              echo ""
              run_save_quote "$BANKER_MSG_TX" 2>&1 | sed 's/^/  | /' || echo "  | save-quote failed"
            else
              echo "  WARNING: Could not find BankerMessage TX (quote not saved)"
            fi
            echo ""
            echo "  Deal or NOT?"
            ;;
          6) echo "  Final Round — keep or swap?" ;;
          8)
            echo "  GAME OVER!"
            echo ""
            cast call "$GAME_CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$GAME_ID" --rpc-url "$RPC_URL"
            echo ""
            echo "Bank balance: $(cast call "$BANK_CONTRACT" "balanceInCents()(uint256)" --rpc-url "$RPC_URL") cents"
            echo ""
            echo "CRE Support finished."
            exit 0
            ;;
        esac

        PREV_PHASE="$PHASE"
      fi

      PREV_BLOCK="$CUR_BLOCK"
      sleep "$POLL"
    done
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: cre-simulate.sh <reveal|banker|savequote|support> [args...]"
    exit 1
    ;;
esac
