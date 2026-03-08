// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Bank} from "../contracts/Bank.sol";

contract MockPriceFeed {
    int256 public price;

    constructor(int256 _price) {
        price = _price;
    }

    function latestRoundData() external view returns (
        uint80, int256, uint256, uint256, uint80
    ) {
        return (1, price, block.timestamp, block.timestamp, 1);
    }
}

contract BankTest is Test {
    Bank bank;
    MockPriceFeed mockFeed;
    address player = makeAddr("player");
    address gameContract = makeAddr("gameContract");
    address owner;

    // ETH = $2000, so $1.00 = 0.0005 ETH = 500000000000000 wei
    uint256 constant ETH_PER_DOLLAR = 500000000000000; // 1e26 / 200000000000

    function setUp() public {
        owner = address(this);
        mockFeed = new MockPriceFeed(200000000000); // $2000
        bank = new Bank(address(mockFeed));
        bank.setAuthorizedGame(gameContract, true);
    }

    function test_sweeten_activatesBank() public {
        assertFalse(bank.isActive());
        // Sweeten with $5 worth of ETH (0.0025 ETH)
        bank.sweeten{value: 2500000000000000}();
        assertTrue(bank.isActive());
    }

    function test_isNotActive_withoutSweetening() public view {
        assertFalse(bank.isActive());
    }

    function test_receiveEntryFee_fromAuthorizedGame() public {
        vm.deal(gameContract, 1 ether);
        vm.prank(gameContract);
        bank.receiveEntryFee{value: 125000000000000}(); // $0.25
    }

    function test_receiveEntryFee_fromUnauthorized_reverts() public {
        address rando = makeAddr("rando");
        vm.deal(rando, 1 ether);
        vm.prank(rando);
        vm.expectRevert(Bank.NotAuthorizedGame.selector);
        bank.receiveEntryFee{value: 125000000000000}();
    }

    function test_settle_paysPlayer() public {
        // Sweeten bank
        bank.sweeten{value: 5000000000000000}(); // $10 worth

        // Settle $0.50 (50 cents) to player
        vm.prank(gameContract);
        bank.settle(50, player, ETH_PER_DOLLAR);

        // Player should have 50 * 500000000000000 / 100 = 250000000000000 wei
        assertEq(player.balance, 250000000000000);
    }

    function test_settle_zeroPayout() public {
        bank.sweeten{value: 1 ether}();
        vm.prank(gameContract);
        bank.settle(0, player, ETH_PER_DOLLAR);
        assertEq(player.balance, 0);
    }

    function test_settle_maxPayout() public {
        bank.sweeten{value: 1 ether}();
        vm.prank(gameContract);
        bank.settle(100, player, ETH_PER_DOLLAR); // $1.00 max
        assertEq(player.balance, 500000000000000); // 0.0005 ETH
    }

    function test_settle_exceedsMax_reverts() public {
        bank.sweeten{value: 1 ether}();
        vm.prank(gameContract);
        vm.expectRevert(
            abi.encodeWithSelector(Bank.PayoutExceedsMax.selector, 101, 100)
        );
        bank.settle(101, player, ETH_PER_DOLLAR);
    }

    function test_settle_capsAtBalance() public {
        // Only sweeten with barely enough
        uint256 smallAmount = 100000000000000; // Less than $1.00
        bank.sweeten{value: smallAmount}();

        vm.prank(gameContract);
        bank.settle(100, player, ETH_PER_DOLLAR);

        // Should get capped at bank balance
        assertEq(player.balance, smallAmount);
    }

    function test_deactivation_afterLargePayout() public {
        // Sweeten with exactly $1.00 worth
        bank.sweeten{value: 500000000000000}();
        assertTrue(bank.isActive());

        // Settle $1.00 — drains the bank
        vm.prank(gameContract);
        bank.settle(100, player, ETH_PER_DOLLAR);

        // Bank should be deactivated
        assertFalse(bank.isActive());
    }

    function test_rescueETH_excessOnly() public {
        bank.sweeten{value: 2000000000000000}(); // $4

        address rescueTo = makeAddr("rescue");
        bank.rescueETH(rescueTo);

        // Should only rescue excess above $1.00 minimum
        uint256 minWei = 500000000000000;
        assertEq(rescueTo.balance, 2000000000000000 - minWei);
        assertEq(address(bank).balance, minWei);
    }

    function test_rescueETH_nothingToRescue() public {
        bank.sweeten{value: 400000000000000}(); // Less than $1.00
        vm.expectRevert(Bank.NoFundsToRescue.selector);
        bank.rescueETH(makeAddr("rescue"));
    }

    function test_receive_sweetens() public {
        (bool ok,) = address(bank).call{value: 1 ether}("");
        assertTrue(ok);
        assertEq(address(bank).balance, 1 ether);
    }

    function test_unauthorizedGame_settle_reverts() public {
        bank.sweeten{value: 1 ether}();
        address rando = makeAddr("rando");
        vm.prank(rando);
        vm.expectRevert(Bank.NotAuthorizedGame.selector);
        bank.settle(50, player, ETH_PER_DOLLAR);
    }
}
