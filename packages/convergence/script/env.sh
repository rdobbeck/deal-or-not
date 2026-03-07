#!/usr/bin/env bash
# Shared env vars for convergence scripts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."

export PATH="$HOME/.foundry/bin:$HOME/.cre/bin:$HOME/.bun/bin:$PATH"

# Base Sepolia RPC
export RPC_URL="${RPC_URL:-https://sepolia.base.org}"

# Contract addresses (Base Sepolia — deployed 2026-03-06)
export GAME_CONTRACT="${GAME_CONTRACT:-0x46B6b547A4683ac5533CAce6aDc4d399b50424A7}"
export BANK_CONTRACT="${BANK_CONTRACT:-0x5De581956fcCEAae90a0C4cf02E4bDDC7F1253BB}"
export SPONSOR_VAULT="${SPONSOR_VAULT:-0x14a26cb376d8e36c47261A46d6b203A7BaADaE53}"
export BEST_OF_BANKER="${BEST_OF_BANKER:-0x55100EF4168d21631EEa6f2b73D6303Bb008F554}"

# CCIP (deployed 2026-03-07)
export BRIDGE_CONTRACT="${BRIDGE_CONTRACT:-0xB233eFD1623f843151C97a1fB32f9115AaE6a875}"
export GATEWAY_CONTRACT="${GATEWAY_CONTRACT:-0x366215E1F493f3420AbD5551c0618c2B28CBc18A}"

# Chainlink
export VRF_COORDINATOR="0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE"
export ETH_USD_FEED="0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1"
export CRE_FORWARDER="${CRE_FORWARDER:-0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5}"

# Deployer key (testnet burner from prototype/.env.example)
export DEPLOYER_KEY="${PRIVATE_KEY:-0x671ea01f6ac1b2d53d49eea104c69e64680ddecc230e5faed864ecd055fbb6fd}"

# CRE CLI private key (no 0x prefix)
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
