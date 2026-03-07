// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {PriceFeedHelper} from "./PriceFeedHelper.sol";

/// @title Bank — Game payout custody for Deal or NOT
/// @notice The house bank that pays out case values and deal amounts in real ETH.
///         Must be "sweetened" (preseeded) before games can be created.
///         Entry fees flow in, payouts flow out. Global pool, not per-game.
///
/// In 12-case version, Bank also receives from lottery entry fees and sponsor deposits.
/// Higher max payout ($10).
contract Bank is Ownable {
    using PriceFeedHelper for AggregatorV3Interface;

    // ── Config ──
    AggregatorV3Interface public immutable priceFeed;
    uint256 public constant MAX_PAYOUT_CENTS = 100; // $1.00 max payout per game
    uint256 public constant MIN_BALANCE_CENTS = 100; // $1.00 minimum to stay active

    // ── State ──
    mapping(address => bool) public authorizedGames; // game contracts that can settle

    // ── Events ──
    event Sweetened(address indexed donor, uint256 amount);
    event EntryFeeReceived(address indexed gameContract, uint256 amount);
    event Settled(address indexed player, uint256 payoutCents, uint256 payoutWei);
    event Rescued(address indexed to, uint256 amount);
    event GameAuthorized(address indexed game, bool authorized);

    // ── Errors ──
    error BankNotActive();
    error NotAuthorizedGame();
    error PayoutExceedsMax(uint256 requestedCents, uint256 maxCents);
    error TransferFailed();
    error NoFundsToRescue();
    error InsufficientBalance();

    constructor(address _priceFeed) Ownable(msg.sender) {
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    // ── Activation ──

    /// @notice Sweeten the pot. Anyone can contribute ETH to keep the bank active.
    ///         Bank activates once balance >= $1.00 equivalent in ETH.
    function sweeten() external payable {
        emit Sweetened(msg.sender, msg.value);
    }

    /// @notice Check if the bank has enough ETH to cover the max payout ($1.00).
    function isActive() public view returns (bool) {
        uint256 minWei = priceFeed.usdToWei(MIN_BALANCE_CENTS);
        return address(this).balance >= minWei;
    }

    /// @notice Get the bank balance in USD cents.
    function balanceInCents() external view returns (uint256) {
        return priceFeed.weiToUsd(address(this).balance);
    }

    // ── Entry Fees ──

    /// @notice Receive entry fee from a game contract. Callable by authorized games.
    function receiveEntryFee() external payable {
        if (!authorizedGames[msg.sender]) revert NotAuthorizedGame();
        emit EntryFeeReceived(msg.sender, msg.value);
    }

    // ── Settlement ──

    /// @notice Settle a game payout. Converts cents to wei using the game's price snapshot.
    /// @param payoutCents The payout in USD cents (max $1.00 = 100 cents)
    /// @param player The winner's address
    /// @param ethPerDollar The game's snapshot price (from PriceFeedHelper.snapshotPrice)
    function settle(uint256 payoutCents, address player, uint256 ethPerDollar) external {
        if (!authorizedGames[msg.sender]) revert NotAuthorizedGame();
        if (payoutCents > MAX_PAYOUT_CENTS) revert PayoutExceedsMax(payoutCents, MAX_PAYOUT_CENTS);
        if (payoutCents == 0) return;

        uint256 payoutWei = PriceFeedHelper.centsToWeiSnapshot(payoutCents, ethPerDollar);

        // Cap at actual balance to avoid revert
        if (payoutWei > address(this).balance) {
            payoutWei = address(this).balance;
        }

        emit Settled(player, payoutCents, payoutWei);

        (bool ok,) = payable(player).call{value: payoutWei}("");
        if (!ok) revert TransferFailed();
    }

    // ── Admin ──

    /// @notice Authorize a game contract to receive entry fees and settle payouts.
    function setAuthorizedGame(address game, bool authorized) external onlyOwner {
        authorizedGames[game] = authorized;
        emit GameAuthorized(game, authorized);
    }

    /// @notice Rescue excess ETH above the minimum threshold. Owner only.
    function rescueETH(address to) external onlyOwner {
        uint256 minWei = priceFeed.usdToWei(MIN_BALANCE_CENTS);
        uint256 bal = address(this).balance;
        if (bal <= minWei) revert NoFundsToRescue();

        uint256 excess = bal - minWei;
        emit Rescued(to, excess);

        (bool ok,) = payable(to).call{value: excess}("");
        if (!ok) revert TransferFailed();
    }

    receive() external payable {
        emit Sweetened(msg.sender, msg.value);
    }
}
