// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {DealOrNotGateway} from "../contracts/DealOrNotGateway.sol";
import {MockV3Aggregator} from "@chainlink/contracts/src/v0.8/tests/MockV3Aggregator.sol";
import {MockCCIPRouter} from "@chainlink/contracts/src/v0.8/ccip/test/mocks/MockRouter.sol";

contract DealOrNotGatewayTest is Test {
    DealOrNotGateway public gateway;
    MockCCIPRouter public ccipRouter;
    MockV3Aggregator public priceFeed;

    address public owner;
    address public player;
    address public homeBridge;

    uint64 constant BASE_SEPOLIA_SELECTOR = 10344971235874465080;

    function setUp() public {
        owner = address(this);
        player = makeAddr("player");
        homeBridge = makeAddr("homeBridge");

        // Deploy mocks
        ccipRouter = new MockCCIPRouter();
        priceFeed = new MockV3Aggregator(8, 2000e8); // ETH = $2000

        // Deploy gateway
        gateway = new DealOrNotGateway(
            address(ccipRouter),
            address(priceFeed),
            BASE_SEPOLIA_SELECTOR
        );

        // Configure
        gateway.setHomeBridge(homeBridge);

        vm.deal(player, 10 ether);
    }

    /*//////////////////////////////////////////////////////////////
                        USD TO WEI CONVERSION
    //////////////////////////////////////////////////////////////*/

    function test_UsdToWei_Conversion() public view {
        // At $2000/ETH, 25 cents = (25 * 1e24) / (2000 * 1e8) = 125_000_000_000_000 wei
        uint256 expected = (25 * 1e24) / (2000e8);
        uint256 actual = gateway.usdToWei(25);
        assertEq(actual, expected, "25 cents at $2000 should convert correctly");
        assertTrue(actual > 0, "Should be non-zero");
    }

    function test_UsdToWei_RevertIfStalePriceFeed() public {
        // Deploy a stale price feed (price = 0)
        MockV3Aggregator staleFeed = new MockV3Aggregator(8, 0);
        DealOrNotGateway staleGateway = new DealOrNotGateway(
            address(ccipRouter),
            address(staleFeed),
            BASE_SEPOLIA_SELECTOR
        );

        vm.expectRevert(DealOrNotGateway.StalePriceFeed.selector);
        staleGateway.usdToWei(25);
    }

    /*//////////////////////////////////////////////////////////////
                        ENTER GAME
    //////////////////////////////////////////////////////////////*/

    function test_EnterGame_Success() public {
        uint256 gameId = 1;

        // MockCCIPRouter.getFee returns 0 by default
        uint256 entryFee = gateway.usdToWei(25);
        uint256 withSlippage = (entryFee * 10500) / 10000;

        vm.prank(player);
        gateway.enterGame{value: withSlippage}(gameId);

        // Gateway should have retained the entry fee (minus any excess refund)
        // With 0 CCIP fee, the full withSlippage is kept (no excess since exact amount sent)
    }

    function test_EnterGame_RevertIfHomeBridgeNotSet() public {
        // Deploy a fresh gateway without setting homeBridge
        DealOrNotGateway freshGateway = new DealOrNotGateway(
            address(ccipRouter),
            address(priceFeed),
            BASE_SEPOLIA_SELECTOR
        );

        vm.deal(player, 1 ether);
        vm.prank(player);
        vm.expectRevert(DealOrNotGateway.HomeBridgeNotSet.selector);
        freshGateway.enterGame{value: 0.1 ether}(1);
    }

    function test_EnterGame_RevertIfInsufficientFee() public {
        vm.prank(player);
        vm.expectRevert(); // InsufficientEntryFee
        gateway.enterGame{value: 1 wei}(1);
    }

    function test_EnterGame_RefundsExcess() public {
        uint256 gameId = 1;
        uint256 entryFee = gateway.usdToWei(25);
        uint256 withSlippage = (entryFee * 10500) / 10000;
        uint256 overpayment = 1 ether; // Way more than needed

        uint256 balBefore = player.balance;

        vm.prank(player);
        gateway.enterGame{value: overpayment}(gameId);

        uint256 balAfter = player.balance;
        uint256 spent = balBefore - balAfter;

        // Should have spent approximately withSlippage (+ 0 CCIP fee)
        assertEq(spent, withSlippage, "Should only spend entry fee with slippage");
    }

    function test_EstimateCost() public view {
        (uint256 entryFeeWei, uint256 ccipFeeWei, uint256 totalWei) = gateway.estimateCost(1);

        assertTrue(entryFeeWei > 0, "Entry fee should be positive");
        assertEq(ccipFeeWei, 0, "Mock CCIP fee should be 0");
        assertTrue(totalWei > 0, "Total should be positive");
        assertTrue(totalWei >= entryFeeWei, "Total should be >= entry fee");
    }

    /*//////////////////////////////////////////////////////////////
                        ADMIN
    //////////////////////////////////////////////////////////////*/

    function test_SetHomeBridge_OnlyOwner() public {
        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert(DealOrNotGateway.NotOwner.selector);
        gateway.setHomeBridge(makeAddr("newBridge"));
    }

    function test_Withdraw_OnlyOwner() public {
        // Send some ETH to the gateway
        vm.deal(address(gateway), 1 ether);

        address notOwner = makeAddr("notOwner");
        vm.prank(notOwner);
        vm.expectRevert(DealOrNotGateway.NotOwner.selector);
        gateway.withdraw(notOwner);
    }

    function test_Withdraw_Works() public {
        // Send some ETH to the gateway
        vm.deal(address(gateway), 1 ether);

        address recipient = makeAddr("recipient");
        uint256 balBefore = recipient.balance;

        gateway.withdraw(recipient);

        assertEq(recipient.balance - balBefore, 1 ether, "Should withdraw full balance");
        assertEq(address(gateway).balance, 0, "Gateway should be empty");
    }
}
