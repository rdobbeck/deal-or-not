// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title PriceFeedHelper — ETH/USD conversion utilities
/// @notice Wraps Chainlink AggregatorV3Interface for USD<->Wei conversions
///         with staleness checks and price snapshots.
///
/// In 12-case version, this feeds the Sponsor contract for on-chain ad pricing too.
library PriceFeedHelper {
    error StalePriceFeed();
    error PriceNotPositive();

    /// @notice Convert USD cents to ETH wei using a live price feed.
    ///         Pattern: (usdCents * 1e24) / ethUsdPrice
    /// @param feed The Chainlink ETH/USD price feed
    /// @param usdCents Amount in USD cents (e.g., 25 = $0.25)
    function usdToWei(AggregatorV3Interface feed, uint256 usdCents) internal view returns (uint256) {
        (, int256 ethUsdPrice,,,) = feed.latestRoundData();
        if (ethUsdPrice <= 0) revert PriceNotPositive();
        return (usdCents * 1e24) / uint256(ethUsdPrice);
    }

    /// @notice Convert ETH wei to USD cents using a live price feed.
    /// @param feed The Chainlink ETH/USD price feed
    /// @param weiAmount Amount in wei
    function weiToUsd(AggregatorV3Interface feed, uint256 weiAmount) internal view returns (uint256) {
        (, int256 ethUsdPrice,,,) = feed.latestRoundData();
        if (ethUsdPrice <= 0) revert PriceNotPositive();
        // Inverse of usdToWei: cents = weiAmount * ethUsdPrice / 1e24
        return (weiAmount * uint256(ethUsdPrice)) / 1e24;
    }

    /// @notice Get the current ETH/USD price (8 decimals).
    function getEthUsdPrice(AggregatorV3Interface feed) internal view returns (uint256) {
        (, int256 ethUsdPrice,,,) = feed.latestRoundData();
        if (ethUsdPrice <= 0) revert PriceNotPositive();
        return uint256(ethUsdPrice);
    }

    /// @notice Snapshot ethPerDollar for a game. Stores a fixed conversion rate
    ///         so the game settles at the price when it started, not when it ends.
    ///         Returns: 1e26 / ethUsdPrice (same pattern as DealOrNotConfidential.sol:181)
    function snapshotPrice(AggregatorV3Interface feed) internal view returns (uint256 ethPerDollar) {
        (, int256 price,,,) = feed.latestRoundData();
        if (price <= 0) revert PriceNotPositive();
        ethPerDollar = 1e26 / uint256(price);
    }

    /// @notice Snapshot with staleness check.
    /// @param feed The Chainlink ETH/USD price feed
    /// @param maxStaleness Maximum acceptable age in seconds (e.g., 3600 for 1 hour)
    function snapshotPriceWithStaleness(
        AggregatorV3Interface feed,
        uint256 maxStaleness
    ) internal view returns (uint256 ethPerDollar) {
        (, int256 price,, uint256 updatedAt,) = feed.latestRoundData();
        if (price <= 0) revert PriceNotPositive();
        if (block.timestamp - updatedAt > maxStaleness) revert StalePriceFeed();
        ethPerDollar = 1e26 / uint256(price);
    }

    /// @notice Convert cents to wei using a snapshot ethPerDollar (not live feed).
    ///         Used during game settlement with the price locked at game start.
    function centsToWeiSnapshot(uint256 cents, uint256 ethPerDollar) internal pure returns (uint256) {
        return (cents * ethPerDollar) / 100;
    }
}
