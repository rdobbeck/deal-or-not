// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {SharedPriceFeed} from "../contracts/SharedPriceFeed.sol";
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/tests/MockV3Aggregator.sol";

contract SharedPriceFeedTest is Test {
    SharedPriceFeed public feed;
    MockV3Aggregator public mockAggregator;

    address public owner;
    address public alice;

    function setUp() public {
        owner = address(this);
        alice = makeAddr("alice");

        // ETH = $2000 (8 decimals)
        mockAggregator = new MockV3Aggregator(8, 2000e8);
        feed = new SharedPriceFeed(address(mockAggregator));
    }

    /*//////////////////////////////////////////////////////////////
                        CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_SetsFeed() public view {
        assertEq(address(feed.priceFeed()), address(mockAggregator));
    }

    function test_Constructor_SetsOwner() public view {
        assertEq(feed.owner(), owner);
    }

    function test_Constructor_RevertsOnZeroAddress() public {
        vm.expectRevert(SharedPriceFeed.ZeroAddress.selector);
        new SharedPriceFeed(address(0));
    }

    /*//////////////////////////////////////////////////////////////
                        USD TO WEI
    //////////////////////////////////////////////////////////////*/

    function test_UsdToWei_25Cents() public view {
        // At $2000/ETH, 25 cents = (25 * 1e24) / (2000 * 1e8)
        uint256 expected = (25 * 1e24) / (2000e8);
        uint256 actual = feed.usdToWei(25);
        assertEq(actual, expected);
        assertTrue(actual > 0);
    }

    function test_UsdToWei_OneDollar() public view {
        // At $2000/ETH, $1.00 = 100 cents
        uint256 expected = (100 * 1e24) / (2000e8);
        uint256 actual = feed.usdToWei(100);
        assertEq(actual, expected);
    }

    function test_UsdToWei_ZeroCents() public view {
        assertEq(feed.usdToWei(0), 0);
    }

    function test_UsdToWei_RevertsOnZeroPrice() public {
        MockV3Aggregator staleFeed = new MockV3Aggregator(8, 0);
        SharedPriceFeed stalePriceFeed = new SharedPriceFeed(address(staleFeed));
        vm.expectRevert(SharedPriceFeed.PriceNotPositive.selector);
        stalePriceFeed.usdToWei(25);
    }

    function test_UsdToWei_RevertsOnNegativePrice() public {
        MockV3Aggregator negativeFeed = new MockV3Aggregator(8, -100e8);
        SharedPriceFeed negPriceFeed = new SharedPriceFeed(address(negativeFeed));
        vm.expectRevert(SharedPriceFeed.PriceNotPositive.selector);
        negPriceFeed.usdToWei(25);
    }

    /*//////////////////////////////////////////////////////////////
                        WEI TO USD
    //////////////////////////////////////////////////////////////*/

    function test_WeiToUsd_RoundTrip() public view {
        // Convert 25 cents to wei, then back to cents
        uint256 weiAmount = feed.usdToWei(25);
        uint256 centsBacked = feed.weiToUsd(weiAmount);
        // Allow rounding error of 1 cent
        assertApproxEqAbs(centsBacked, 25, 1);
    }

    function test_WeiToUsd_OneEther() public view {
        // 1 ETH at $2000 = 200000 cents
        uint256 cents = feed.weiToUsd(1 ether);
        assertEq(cents, 200000);
    }

    function test_WeiToUsd_ZeroWei() public view {
        assertEq(feed.weiToUsd(0), 0);
    }

    /*//////////////////////////////////////////////////////////////
                        GET PRICE
    //////////////////////////////////////////////////////////////*/

    function test_GetEthUsdPrice() public view {
        assertEq(feed.getEthUsdPrice(), 2000e8);
    }

    function test_GetEthUsdPrice_AfterUpdate() public {
        mockAggregator.updateAnswer(3500e8);
        assertEq(feed.getEthUsdPrice(), 3500e8);
    }

    /*//////////////////////////////////////////////////////////////
                        SNAPSHOTS
    //////////////////////////////////////////////////////////////*/

    function test_SnapshotPrice() public view {
        // ethPerDollar = 1e26 / price
        uint256 expected = 1e26 / 2000e8;
        assertEq(feed.snapshotPrice(), expected);
    }

    function test_SnapshotPriceWithStaleness_Fresh() public view {
        // Mock aggregator sets updatedAt to block.timestamp, so it's fresh
        uint256 ethPerDollar = feed.snapshotPriceWithStaleness(3600);
        uint256 expected = 1e26 / 2000e8;
        assertEq(ethPerDollar, expected);
    }

    function test_SnapshotPriceWithStaleness_Stale() public {
        // Warp forward 2 hours, making the 1-hour staleness check fail
        vm.warp(block.timestamp + 7200);
        vm.expectRevert(SharedPriceFeed.StalePriceFeed.selector);
        feed.snapshotPriceWithStaleness(3600);
    }

    /*//////////////////////////////////////////////////////////////
                        CENTS TO WEI SNAPSHOT
    //////////////////////////////////////////////////////////////*/

    function test_CentsToWeiSnapshot() public view {
        uint256 ethPerDollar = feed.snapshotPrice();
        // 50 cents = (50 * ethPerDollar) / 100
        uint256 expected = (50 * ethPerDollar) / 100;
        assertEq(feed.centsToWeiSnapshot(50, ethPerDollar), expected);
    }

    function test_CentsToWeiSnapshot_ZeroCents() public view {
        uint256 ethPerDollar = feed.snapshotPrice();
        assertEq(feed.centsToWeiSnapshot(0, ethPerDollar), 0);
    }

    function test_CentsToWeiSnapshot_MatchesLiveConversion() public view {
        // Snapshot and live should give same results at same price
        uint256 ethPerDollar = feed.snapshotPrice();
        uint256 snapshotResult = feed.centsToWeiSnapshot(25, ethPerDollar);
        uint256 liveResult = feed.usdToWei(25);
        // They use slightly different math paths, allow small rounding diff
        assertApproxEqRel(snapshotResult, liveResult, 0.01e18); // 1% tolerance
    }

    /*//////////////////////////////////////////////////////////////
                        STALENESS CHECKS
    //////////////////////////////////////////////////////////////*/

    function test_IsFresh_True() public view {
        assertTrue(feed.isFresh(3600));
    }

    function test_IsFresh_False() public {
        vm.warp(block.timestamp + 7200);
        assertFalse(feed.isFresh(3600));
    }

    function test_LastUpdatedAt() public view {
        uint256 updatedAt = feed.lastUpdatedAt();
        assertEq(updatedAt, block.timestamp);
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_UpdateFeed() public {
        MockV3Aggregator newAggregator = new MockV3Aggregator(8, 3000e8);
        feed.updateFeed(address(newAggregator));
        assertEq(address(feed.priceFeed()), address(newAggregator));
        assertEq(feed.getEthUsdPrice(), 3000e8);
    }

    function test_UpdateFeed_EmitsEvent() public {
        MockV3Aggregator newAggregator = new MockV3Aggregator(8, 3000e8);
        vm.expectEmit(true, true, false, false);
        emit SharedPriceFeed.PriceFeedUpdated(address(mockAggregator), address(newAggregator));
        feed.updateFeed(address(newAggregator));
    }

    function test_UpdateFeed_RevertsOnZeroAddress() public {
        vm.expectRevert(SharedPriceFeed.ZeroAddress.selector);
        feed.updateFeed(address(0));
    }

    function test_UpdateFeed_RevertsIfNotOwner() public {
        MockV3Aggregator newAggregator = new MockV3Aggregator(8, 3000e8);
        vm.prank(alice);
        vm.expectRevert();
        feed.updateFeed(address(newAggregator));
    }

    /*//////////////////////////////////////////////////////////////
                        PRICE MOVEMENT
    //////////////////////////////////////////////////////////////*/

    function test_UsdToWei_ChangesWithPrice() public {
        uint256 weiAt2000 = feed.usdToWei(100);
        mockAggregator.updateAnswer(4000e8);
        uint256 weiAt4000 = feed.usdToWei(100);
        // At double the price, same USD buys half the ETH
        assertApproxEqRel(weiAt2000, weiAt4000 * 2, 0.001e18);
    }

    function test_Snapshot_LocksPrice() public {
        uint256 ethPerDollar = feed.snapshotPrice();
        // Price doubles
        mockAggregator.updateAnswer(4000e8);
        // Snapshot conversion still uses old rate
        uint256 snapshotWei = feed.centsToWeiSnapshot(100, ethPerDollar);
        uint256 liveWei = feed.usdToWei(100);
        // Snapshot should give ~2x the live amount (old price was half)
        assertApproxEqRel(snapshotWei, liveWei * 2, 0.001e18);
    }

    /*//////////////////////////////////////////////////////////////
                        DECIMALS VALIDATION
    //////////////////////////////////////////////////////////////*/

    function test_Constructor_RevertsOnWrongDecimals() public {
        MockV3Aggregator wrongDecimals = new MockV3Aggregator(18, 2000e18);
        vm.expectRevert(SharedPriceFeed.UnexpectedDecimals.selector);
        new SharedPriceFeed(address(wrongDecimals));
    }

    /*//////////////////////////////////////////////////////////////
                        DEFAULT STALENESS
    //////////////////////////////////////////////////////////////*/

    function test_GetPrice_RevertsWhenStale() public {
        vm.warp(block.timestamp + 3601);
        vm.expectRevert(SharedPriceFeed.StalePriceFeed.selector);
        feed.getEthUsdPrice();
    }

    function test_UsdToWei_RevertsWhenStale() public {
        vm.warp(block.timestamp + 3601);
        vm.expectRevert(SharedPriceFeed.StalePriceFeed.selector);
        feed.usdToWei(25);
    }

    /*//////////////////////////////////////////////////////////////
                        FUZZ TESTS
    //////////////////////////////////////////////////////////////*/

    function testFuzz_UsdToWei_Roundtrip(uint256 cents) public view {
        // Bound to reasonable range: 1 cent to $1M
        cents = bound(cents, 1, 100_000_000);
        uint256 weiAmount = feed.usdToWei(cents);
        uint256 centsBack = feed.weiToUsd(weiAmount);
        // Allow 1 cent rounding
        assertApproxEqAbs(centsBack, cents, 1);
    }

    function testFuzz_CentsToWeiSnapshot(uint256 cents, int256 price) public {
        // Bound price to realistic range: $100-$100k (8 decimals)
        price = int256(bound(uint256(price), 100e8, 100_000e8));
        cents = bound(cents, 0, 100_000_000);

        mockAggregator.updateAnswer(price);
        uint256 ethPerDollar = feed.snapshotPrice();
        uint256 weiResult = feed.centsToWeiSnapshot(cents, ethPerDollar);

        if (cents == 0) {
            assertEq(weiResult, 0);
        } else {
            assertTrue(weiResult > 0);
        }
    }
}
