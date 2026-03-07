#!/usr/bin/env bash
# QuickPlay game helper — creates game with real ETH, picks case, opens cases
# Usage: ./scripts/play-game.sh <command> [args...]
#
# Commands:
#   create              Create a new game ($0.25 entry fee in ETH)
#   pick  <GID> <CASE>  Pick your case (0-4)
#   open  <GID> <CASE>  Open a case -> CRE reveals value
#   accept <GID>        Accept the deal (Bank pays you)
#   reject <GID>        Reject the deal
#   keep  <GID>         Keep your case (final round)
#   swap  <GID>         Swap your case (final round)
#   state <GID>         Show game state
#   sweeten             Send ETH to sweeten the Bank
#   fee                 Estimate current entry fee
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../script/env.sh"

: "${GAME_CONTRACT:?Set GAME_CONTRACT in env.sh}"
: "${BANK_CONTRACT:?Set BANK_CONTRACT in env.sh}"
: "${DEPLOYER_KEY:=${PRIVATE_KEY:?Set PRIVATE_KEY or DEPLOYER_KEY}}"

CMD="${1:?Usage: play-game.sh <create|pick|open|accept|reject|keep|swap|state|sweeten|fee> [args...]}"
shift

case "$CMD" in
  create)
    echo "Estimating entry fee..."
    FEE=$(cast call "$GAME_CONTRACT" "estimateEntryFee()(uint256,uint256)" --rpc-url "$RPC_URL" | tail -1 | awk '{print $1}')
    echo "Entry fee (with slippage): $FEE wei"
    echo ""
    echo "Creating new QuickPlay game with \$0.25 entry..."
    cast send "$GAME_CONTRACT" "createGame()" \
      --value "$FEE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    NEXT=$(cast call "$GAME_CONTRACT" "nextGameId()(uint256)" --rpc-url "$RPC_URL" | awk '{print $1}')
    echo ""
    echo "Game created! Your game ID: $((NEXT - 1))"
    echo "Entry fee forwarded to Bank."
    echo "Wait ~10s for VRF, then: ./scripts/play-game.sh state $((NEXT - 1))"
    ;;

  pick)
    GAME_ID="${1:?Usage: play-game.sh pick <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-game.sh pick <GAME_ID> <CASE_INDEX>}"
    echo "Picking case #$CASE for game $GAME_ID..."
    cast send "$GAME_CONTRACT" "pickCase(uint256,uint8)" "$GAME_ID" "$CASE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  open)
    GAME_ID="${1:?Usage: play-game.sh open <GAME_ID> <CASE_INDEX>}"
    CASE="${2:?Usage: play-game.sh open <GAME_ID> <CASE_INDEX>}"
    echo "Opening case #$CASE for game $GAME_ID..."
    RESULT=$(cast send "$GAME_CONTRACT" "openCase(uint256,uint8)" "$GAME_ID" "$CASE" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL" --json 2>&1) || { echo "Error: $RESULT"; exit 1; }
    TX=$(echo "$RESULT" | python3 -c "import json,sys;print(json.load(sys.stdin)['transactionHash'])")
    echo "TX: $TX"
    echo "CRE will reveal the value. Run: ./scripts/cre-simulate.sh reveal $TX"
    ;;

  accept)
    GAME_ID="${1:?Usage: play-game.sh accept <GAME_ID>}"
    echo "Accepting deal for game $GAME_ID (Bank will pay you)..."
    cast send "$GAME_CONTRACT" "acceptDeal(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    echo "Deal accepted! Check your wallet for the payout."
    ;;

  reject)
    GAME_ID="${1:?Usage: play-game.sh reject <GAME_ID>}"
    echo "Rejecting deal for game $GAME_ID..."
    cast send "$GAME_CONTRACT" "rejectDeal(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  keep)
    GAME_ID="${1:?Usage: play-game.sh keep <GAME_ID>}"
    echo "Keeping case for game $GAME_ID..."
    cast send "$GAME_CONTRACT" "keepCase(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  swap)
    GAME_ID="${1:?Usage: play-game.sh swap <GAME_ID>}"
    echo "Swapping case for game $GAME_ID..."
    cast send "$GAME_CONTRACT" "swapCase(uint256)" "$GAME_ID" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    ;;

  state)
    GAME_ID="${1:-0}"
    echo "Game $GAME_ID state:"
    cast call "$GAME_CONTRACT" "getGameState(uint256)(address,address,uint8,uint8,uint8,uint8,uint8,uint256,uint256,uint256,uint256[5],bool[5])" "$GAME_ID" --rpc-url "$RPC_URL"
    echo ""
    echo "Bank active: $(cast call "$BANK_CONTRACT" "isActive()(bool)" --rpc-url "$RPC_URL")"
    echo "Bank balance: $(cast balance "$BANK_CONTRACT" --rpc-url "$RPC_URL") wei"
    ;;

  sweeten)
    AMOUNT="${1:-0.0025ether}"
    echo "Sweetening bank with $AMOUNT..."
    cast send "$BANK_CONTRACT" "sweeten()" \
      --value "$AMOUNT" \
      --private-key "$DEPLOYER_KEY" --rpc-url "$RPC_URL"
    echo "Bank active: $(cast call "$BANK_CONTRACT" "isActive()(bool)" --rpc-url "$RPC_URL")"
    ;;

  fee)
    echo "Current entry fee estimate:"
    cast call "$GAME_CONTRACT" "estimateEntryFee()(uint256,uint256)" --rpc-url "$RPC_URL"
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Usage: play-game.sh <create|pick|open|accept|reject|keep|swap|state|sweeten|fee> [args...]"
    exit 1
    ;;
esac
