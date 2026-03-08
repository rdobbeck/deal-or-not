#!/usr/bin/env bash
# Common environment for convergence scripts
# Source this: source packages/convergence/script/env.sh (from repo root)
#   or: source script/env.sh (from packages/convergence/)
#
# Keys are read from .env (gitignored) or .env.example (fallback).
# Works in both bash and zsh.

# Resolve script directory (bash and zsh compatible)
if [[ -n "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
elif [[ -n "${(%):-%x}" ]] 2>/dev/null; then
  SCRIPT_DIR="$(cd "$(dirname "${(%):-%x}")" && pwd)"
else
  SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
fi
PROJECT_DIR="$SCRIPT_DIR/.."

export PATH="$HOME/.foundry/bin:$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

# Read keys from .env (gitignored, preferred) or .env.example (fallback)
ENV_FILE=""
if [[ -f "$PROJECT_DIR/.env" ]]; then
  ENV_FILE="$PROJECT_DIR/.env"
elif [[ -f "$PROJECT_DIR/.env.example" ]]; then
  ENV_FILE="$PROJECT_DIR/.env.example"
fi

if [[ -n "$ENV_FILE" ]]; then
  export DEPLOYER_KEY=$(grep DEPLOYER_PRIVATE_KEY "$ENV_FILE" | cut -d= -f2)
  export DEPLOYER_ADDR=$(grep DEPLOYER_ADDRESS "$ENV_FILE" | cut -d= -f2)
  export PLAYER_KEY=$(grep PLAYER_PRIVATE_KEY "$ENV_FILE" | cut -d= -f2)
  export PLAYER_ADDR=$(grep PLAYER_ADDRESS "$ENV_FILE" | cut -d= -f2)
fi

# RPC URL: use env or Alchemy from frontend .env.local, or fall back to public
if [[ -z "$RPC_URL" && -f "$PROJECT_DIR/dealornot/.env.local" ]]; then
  RPC_URL=$(grep NEXT_PUBLIC_ALCHEMY_RPC_URL "$PROJECT_DIR/dealornot/.env.local" | cut -d= -f2)
fi
export RPC_URL="${RPC_URL:-https://sepolia.base.org}"

# Forge deploy scripts expect PRIVATE_KEY
export PRIVATE_KEY="${PRIVATE_KEY:-$DEPLOYER_KEY}"

# Contract addresses (Base Sepolia — convergence deployment)
export GAME_CONTRACT="${GAME_CONTRACT:-0x46B6b547A4683ac5533CAce6aDc4d399b50424A7}"
export BANK_CONTRACT="${BANK_CONTRACT:-0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB}"
export SPONSOR_VAULT="${SPONSOR_VAULT:-0x14a26cb376d8e36c47261A46d6b203A7BaADaE53}"
export BEST_OF_BANKER="${BEST_OF_BANKER:-0x55100EF4168d21631EEa6f2b73D6303Bb008F554}"

# Agent Infrastructure (deploy with DeployAgentInfra.s.sol)
export AGENTS_CONTRACT="${AGENTS_CONTRACT:-}"
export AGENT_REGISTRY="${AGENT_REGISTRY:-}"
export AGENT_STAKING="${AGENT_STAKING:-}"
export SEASONAL_LEADERBOARD="${SEASONAL_LEADERBOARD:-}"
export PREDICTION_MARKET="${PREDICTION_MARKET:-}"
export SHARED_PRICE_FEED="${SHARED_PRICE_FEED:-}"

# CCIP
export BRIDGE_CONTRACT="${BRIDGE_CONTRACT:-0xB233eFD1623f843151C97a1fB32f9115AaE6a875}"
export GATEWAY_CONTRACT="${GATEWAY_CONTRACT:-0x366215E1F493f3420AbD5551c0618c2B28CBc18A}"
export ETH_SEPOLIA_RPC="${ETH_SEPOLIA_RPC:-https://sepolia.gateway.tenderly.co}"

# Chainlink
export VRF_COORDINATOR="0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE"
export ETH_USD_FEED="0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1"
export CRE_FORWARDER="${CRE_FORWARDER:-0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5}"

# CRE CLI private key — uses deployer burner for simulate --broadcast
export CRE_ETH_PRIVATE_KEY="${CRE_ETH_PRIVATE_KEY:-${DEPLOYER_KEY#0x}}"

# Load CRE workflow secrets from workflows/.env (for simulate mode)
if [[ -f "$PROJECT_DIR/workflows/.env" ]]; then
  while IFS='=' read -r key val; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    export "$key=$val"
  done < "$PROJECT_DIR/workflows/.env"
fi

# Event topics (precomputed keccak256)
export TOPIC_CASE_OPEN="0xab3b62f6fd63e2b9a116e4f83e0a16b1e4df0ddf7a348ac2407e400fa73a29d8"
export TOPIC_ROUND_COMPLETE="0xc9cd1e1a7382c02c47d1955e4ac06db27ff51188b5a155faaafa0088150086a6"
export TOPIC_BANKER_MESSAGE="0xddc71f496db9ca8c3743866e843ec6c49194782533ce32135c8107cf53ff6f70"

# Phase names
PHASE_NAMES=("WaitingForVRF" "Created" "Round" "WaitingForCRE" "AwaitingOffer" "BankerOffer" "FinalRound" "WaitingFinalCRE" "GameOver")

# ── Pre-flight checks ──

preflight_check() {
  local script="${1:-generic}"
  local warnings=0

  if ! command -v cast &>/dev/null; then
    echo "WARNING: 'cast' not found. Install foundry: curl -L https://foundry.paradigm.xyz | bash"
    warnings=$((warnings + 1))
  fi

  if ! command -v cre &>/dev/null; then
    echo "WARNING: 'cre' CLI not found. CRE workflows will fail."
    warnings=$((warnings + 1))
  fi

  if [[ -z "$CRE_ETH_PRIVATE_KEY" ]]; then
    echo "WARNING: CRE_ETH_PRIVATE_KEY not set. CRE simulate --broadcast will fail."
    warnings=$((warnings + 1))
  fi

  case "$script" in
    cre-reveal)
      if [[ ! -d "$PROJECT_DIR/workflows/confidential-reveal/node_modules" ]]; then
        echo "WARNING: confidential-reveal deps not installed. Run: cd workflows/confidential-reveal && bun install"
        warnings=$((warnings + 1))
      fi
      ;;
    cre-banker)
      if [[ ! -d "$PROJECT_DIR/workflows/banker-ai/node_modules" ]]; then
        echo "WARNING: banker-ai deps not installed. Run: cd workflows/banker-ai && bun install"
        warnings=$((warnings + 1))
      fi
      if [[ -z "$GEMINI_API_KEY_ALL" ]]; then
        echo "WARNING: GEMINI_API_KEY_ALL not set — AI Banker will use fallback messages."
        warnings=$((warnings + 1))
      fi
      ;;
  esac

  if [[ $warnings -gt 0 ]]; then
    echo "($warnings warning(s) — script will continue but some features may degrade)"
    echo ""
  fi

  return 0
}
