// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PriceFeedHelper} from "./PriceFeedHelper.sol";

/// @title GameMath — Entry fee calculation + deposit validation
/// @notice Utilities for pricing game entry and validating ETH deposits.
///
/// In 12-case version, adds lottery math: ticket pricing, partial refund calc.
library GameMath {
    using PriceFeedHelper for AggregatorV3Interface;

    error InsufficientDeposit(uint256 required, uint256 sent);

    /// @notice Calculate the entry fee in wei from a USD cents amount.
    /// @param feed The Chainlink ETH/USD price feed
    /// @param feeCents Entry fee in USD cents (e.g., 25 = $0.25)
    function calculateEntryFeeWei(
        AggregatorV3Interface feed,
        uint256 feeCents
    ) internal view returns (uint256) {
        return feed.usdToWei(feeCents);
    }

    /// @notice Validate that msg.value covers the required amount with slippage.
    /// @param sent The msg.value sent by the player
    /// @param requiredWei The base required amount in wei
    /// @param slippageBps Slippage tolerance in basis points (e.g., 500 = 5%)
    function validateDeposit(
        uint256 sent,
        uint256 requiredWei,
        uint256 slippageBps
    ) internal pure {
        uint256 withSlippage = (requiredWei * (10000 + slippageBps)) / 10000;
        if (sent < withSlippage) {
            revert InsufficientDeposit(withSlippage, sent);
        }
    }

    /// @notice Calculate required deposit with slippage included.
    function requiredWithSlippage(uint256 baseWei, uint256 slippageBps) internal pure returns (uint256) {
        return (baseWei * (10000 + slippageBps)) / 10000;
    }
}
