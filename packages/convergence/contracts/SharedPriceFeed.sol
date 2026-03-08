// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SharedPriceFeed — ETH/USD conversion hub for Deal or NOT
/// @notice Deployed once per chain. All game contracts reference this for
///         USD<->Wei conversions, price snapshots, and staleness checks.
///
///         Ported from PriceFeedHelper (convergence branch) and promoted
///         from library to deployable contract so callers don't need to
///         know the feed address.
///
/// @dev Deploy with the chain's Chainlink ETH/USD feed:
///      - Base Sepolia: 0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1
///      - ETH Sepolia:  0x694AA1769357215DE4FAC081bf1f309aDC325306
contract SharedPriceFeed is Ownable {
    AggregatorV3Interface public priceFeed;

    error PriceNotPositive();
    error StalePriceFeed();
    error ZeroAddress();
    error UnexpectedDecimals();

    event PriceFeedUpdated(address indexed oldFeed, address indexed newFeed);

    uint256 public constant DEFAULT_MAX_STALENESS = 3600; // 1 hour

    constructor(address _priceFeed) Ownable(msg.sender) {
        if (_priceFeed == address(0)) revert ZeroAddress();
        AggregatorV3Interface feed = AggregatorV3Interface(_priceFeed);
        if (feed.decimals() != 8) revert UnexpectedDecimals();
        priceFeed = feed;
    }

    // ── Conversions (live) ──

    /// @notice Convert USD cents to ETH wei using the live price feed.
    ///         Pattern: (usdCents * 1e24) / ethUsdPrice
    /// @param usdCents Amount in USD cents (e.g., 25 = $0.25)
    function usdToWei(uint256 usdCents) external view returns (uint256) {
        uint256 price = _getPrice();
        return (usdCents * 1e24) / price;
    }

    /// @notice Convert ETH wei to USD cents using the live price feed.
    /// @param weiAmount Amount in wei
    function weiToUsd(uint256 weiAmount) external view returns (uint256) {
        uint256 price = _getPrice();
        return (weiAmount * price) / 1e24;
    }

    /// @notice Get the current ETH/USD price (8 decimals).
    function getEthUsdPrice() external view returns (uint256) {
        return _getPrice();
    }

    // ── Snapshots ──

    /// @notice Snapshot ethPerDollar for a game. Stores a fixed conversion rate
    ///         so the game settles at the price when it started, not when it ends.
    ///         Returns: 1e26 / ethUsdPrice
    function snapshotPrice() external view returns (uint256 ethPerDollar) {
        uint256 price = _getPrice();
        ethPerDollar = 1e26 / price;
    }

    /// @notice Snapshot with staleness check.
    /// @param maxStaleness Maximum acceptable age in seconds (e.g., 3600 for 1 hour)
    function snapshotPriceWithStaleness(uint256 maxStaleness) external view returns (uint256 ethPerDollar) {
        (, int256 price,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (price <= 0) revert PriceNotPositive();
        if (block.timestamp - updatedAt > maxStaleness) revert StalePriceFeed();
        ethPerDollar = 1e26 / uint256(price);
    }

    /// @notice Convert cents to wei using a previously snapshotted ethPerDollar.
    ///         Used during game settlement with the price locked at game start.
    function centsToWeiSnapshot(uint256 cents, uint256 ethPerDollar) external pure returns (uint256) {
        return (cents * ethPerDollar) / 100;
    }

    // ── Staleness ──

    /// @notice Check if the price feed is fresh (updated within maxStaleness seconds).
    function isFresh(uint256 maxStaleness) external view returns (bool) {
        (,,, uint256 updatedAt,) = priceFeed.latestRoundData();
        return block.timestamp - updatedAt <= maxStaleness;
    }

    /// @notice Get the timestamp of the last price update.
    function lastUpdatedAt() external view returns (uint256) {
        (,,, uint256 updatedAt,) = priceFeed.latestRoundData();
        return updatedAt;
    }

    // ── Admin ──

    /// @notice Update the price feed address (for feed migrations).
    function updateFeed(address newFeed) external onlyOwner {
        if (newFeed == address(0)) revert ZeroAddress();
        address oldFeed = address(priceFeed);
        priceFeed = AggregatorV3Interface(newFeed);
        emit PriceFeedUpdated(oldFeed, newFeed);
    }

    // ── Internal ──

    function _getPrice() internal view returns (uint256) {
        (, int256 price,, uint256 updatedAt,) = priceFeed.latestRoundData();
        if (price <= 0) revert PriceNotPositive();
        if (block.timestamp - updatedAt > DEFAULT_MAX_STALENESS) revert StalePriceFeed();
        return uint256(price);
    }
}
