// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PriceFeedHelper} from "../src/PriceFeedHelper.sol";

contract MockPriceFeed {
    int256 public price;
    uint256 public updatedAt;

    constructor(int256 _price) {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData() external view returns (
        uint80 roundId, int256 answer, uint256 startedAt, uint256 _updatedAt, uint80 answeredInRound
    ) {
        return (1, price, block.timestamp, updatedAt, 1);
    }
}

contract PriceFeedHelperTest is Test {
    using PriceFeedHelper for AggregatorV3Interface;

    MockPriceFeed mockFeed;
    AggregatorV3Interface feed;

    function setUp() public {
        // ETH = $2,000 (8 decimals)
        mockFeed = new MockPriceFeed(200000000000);
        feed = AggregatorV3Interface(address(mockFeed));
    }

    function test_usdToWei_25cents() public view {
        // $0.25 at $2000/ETH = 0.000125 ETH = 125000000000000 wei
        uint256 wei25c = feed.usdToWei(25);
        assertEq(wei25c, 125000000000000); // 0.000125 ETH
    }

    function test_usdToWei_100cents() public view {
        // $1.00 at $2000/ETH = 0.0005 ETH = 500000000000000 wei
        uint256 wei1d = feed.usdToWei(100);
        assertEq(wei1d, 500000000000000);
    }

    function test_weiToUsd() public view {
        uint256 weiAmount = 500000000000000; // 0.0005 ETH
        uint256 cents = feed.weiToUsd(weiAmount);
        assertEq(cents, 100); // $1.00
    }

    function test_getEthUsdPrice() public view {
        uint256 price = feed.getEthUsdPrice();
        assertEq(price, 200000000000);
    }

    function test_snapshotPrice() public view {
        uint256 ethPerDollar = feed.snapshotPrice();
        // 1e26 / 200000000000 = 500000000000000
        assertEq(ethPerDollar, 500000000000000);
    }

    function test_centsToWeiSnapshot() public view {
        uint256 ethPerDollar = feed.snapshotPrice();
        uint256 weiAmount = PriceFeedHelper.centsToWeiSnapshot(25, ethPerDollar);
        // 25 * 500000000000000 / 100 = 125000000000000
        assertEq(weiAmount, 125000000000000);
    }

    function test_snapshotPriceWithStaleness_fresh() public view {
        uint256 ethPerDollar = feed.snapshotPriceWithStaleness(3600);
        assertEq(ethPerDollar, 500000000000000);
    }

    function test_snapshotPriceWithStaleness_stale() public {
        vm.warp(10000);
        mockFeed.setUpdatedAt(block.timestamp - 7200); // 2 hours ago
        vm.expectRevert(PriceFeedHelper.StalePriceFeed.selector);
        this.externalSnapshotWithStaleness(3600);
    }

    function externalSnapshotWithStaleness(uint256 maxStaleness) external view returns (uint256) {
        return feed.snapshotPriceWithStaleness(maxStaleness);
    }

    function test_usdToWei_zeroPrice_reverts() public {
        mockFeed.setPrice(0);
        vm.expectRevert(PriceFeedHelper.PriceNotPositive.selector);
        this.externalUsdToWei(25);
    }

    function test_usdToWei_negativePrice_reverts() public {
        mockFeed.setPrice(-1);
        vm.expectRevert(PriceFeedHelper.PriceNotPositive.selector);
        this.externalUsdToWei(25);
    }

    /// @dev External wrapper so vm.expectRevert can catch library reverts
    function externalUsdToWei(uint256 cents) external view returns (uint256) {
        return feed.usdToWei(cents);
    }

    function test_roundTrip_usdToWei_weiToUsd() public view {
        uint256 originalCents = 50;
        uint256 weiAmount = feed.usdToWei(originalCents);
        uint256 recoveredCents = feed.weiToUsd(weiAmount);
        assertEq(recoveredCents, originalCents);
    }
}
