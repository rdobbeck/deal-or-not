// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VRFManager} from "./VRFManager.sol";
import {JackpotTicket} from "./JackpotTicket.sol";
import {SponsorVault} from "./SponsorVault.sol";

/// @title LotteryDraw -- Weekly VRF lottery for Deal or NOT jackpot games
/// @notice Manages weekly draws where JackpotTicket holders compete for sponsored jackpots.
///         Uses Chainlink VRF v2.5 for provably fair random winner selection.
///
/// FLOW:
///   1. Sponsor creates draw via SponsorVault (deposits ETH for jackpot)
///   2. Players win tickets from QuickPlay throughout the week
///   3. Sunday 8pm UTC: CRE cron workflow calls executeDraw()
///   4. VRF selects random ticket from pool
///   5. Winner announced, 12-case game created for them
///   6. Winner plays live on Discord for the jackpot
///
/// ECONOMICS:
///   - Sponsor pays jackpot ($500-$5,000) + platform fee (10%)
///   - Winner plays 12-case game ($0.10-$100 values)
///   - If winner loses, sponsor recovers 50% (other 50% rolls to next draw)
///   - Platform collects fee regardless of outcome
contract LotteryDraw is VRFManager {
    // ── Structs ──

    struct Draw {
        uint256 drawId;
        uint256 jackpotCents;      // Total jackpot in USD cents
        address sponsor;           // Who funded this draw
        uint256 drawTime;          // Scheduled execution timestamp
        uint256 vrfRequestId;      // Chainlink VRF request
        uint256 vrfSeed;           // VRF randomness result
        address winner;            // Selected winner address
        uint256 winningTicketId;   // Which ticket won
        uint256 jackpotGameId;     // Created 12-case game ID (0 if not yet created)
        bool executed;             // True after VRF callback
        bool claimed;              // True after winner plays jackpot game
        uint256 platformFeeCents;  // Platform's cut (10%)
    }

    // ── State ──

    JackpotTicket public immutable ticketContract;
    SponsorVault public immutable sponsorVault;
    address public jackpotGameContract;  // DealOrNot12Case.sol (deployed separately)

    mapping(uint256 => Draw) public draws;
    uint256 public nextDrawId = 1;
    uint256 public currentDrawId = 1;  // Active draw accepting tickets

    uint256 public constant PLATFORM_FEE_BPS = 1000;  // 10%
    uint256 public platformFeeBalance;  // Accumulated platform fees (in wei)

    // ── Events ──

    event DrawCreated(
        uint256 indexed drawId,
        address indexed sponsor,
        uint256 jackpotCents,
        uint256 drawTime,
        uint256 platformFeeCents
    );
    event DrawExecuted(
        uint256 indexed drawId,
        address indexed winner,
        uint256 winningTicketId,
        uint256 vrfSeed
    );
    event JackpotGameCreated(
        uint256 indexed drawId,
        uint256 indexed jackpotGameId,
        address indexed winner
    );
    event DrawCancelled(uint256 indexed drawId, string reason);
    event PlatformFeeWithdrawn(address indexed to, uint256 amount);

    // ── Errors ──

    error DrawNotScheduled(uint256 drawId);
    error DrawAlreadyExecuted(uint256 drawId);
    error DrawNotReady(uint256 drawTime, uint256 currentTime);
    error NoTicketsInDraw(uint256 drawId);
    error DrawNotExecuted(uint256 drawId);
    error GameContractNotSet();
    error InsufficientJackpot(uint256 provided, uint256 minimum);
    error DrawTimeInPast(uint256 drawTime, uint256 currentTime);
    error NotAuthorized();
    error NoPlatformFees();

    // ── Constructor ──

    constructor(
        address _ticketContract,
        address _sponsorVault,
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash
    ) VRFManager(_vrfCoordinator, _subscriptionId, _keyHash) {
        ticketContract = JackpotTicket(_ticketContract);
        sponsorVault = SponsorVault(_sponsorVault);
    }

    // ════════════════════════════════════════════════════════
    //                   DRAW CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a new draw. Callable by sponsor or owner.
    /// @param jackpotCents Total jackpot in USD cents (e.g., 50000 = $500)
    /// @param drawTime Unix timestamp when draw should execute
    function createDraw(uint256 jackpotCents, uint256 drawTime) external payable returns (uint256 drawId) {
        // Validate inputs
        if (jackpotCents < 10000) revert InsufficientJackpot(jackpotCents, 10000);  // Min $100
        if (drawTime <= block.timestamp) revert DrawTimeInPast(drawTime, block.timestamp);

        // Calculate platform fee (10%)
        uint256 platformFeeCents = (jackpotCents * PLATFORM_FEE_BPS) / 10000;
        uint256 netJackpotCents = jackpotCents - platformFeeCents;

        drawId = nextDrawId++;

        draws[drawId] = Draw({
            drawId: drawId,
            jackpotCents: netJackpotCents,
            sponsor: msg.sender,
            drawTime: drawTime,
            vrfRequestId: 0,
            vrfSeed: 0,
            winner: address(0),
            winningTicketId: 0,
            jackpotGameId: 0,
            executed: false,
            claimed: false,
            platformFeeCents: platformFeeCents
        });

        // Platform fee stays in this contract
        platformFeeBalance += (platformFeeCents * msg.value) / jackpotCents;

        emit DrawCreated(drawId, msg.sender, netJackpotCents, drawTime, platformFeeCents);
    }

    // ════════════════════════════════════════════════════════
    //                   DRAW EXECUTION
    // ════════════════════════════════════════════════════════

    /// @notice Execute a draw by requesting VRF randomness. Callable by anyone after drawTime.
    ///         In production, called by CRE cron workflow.
    /// @param drawId The draw to execute
    function executeDraw(uint256 drawId) external {
        Draw storage draw = draws[drawId];

        // Validation
        if (draw.drawTime == 0) revert DrawNotScheduled(drawId);
        if (draw.executed) revert DrawAlreadyExecuted(drawId);
        if (block.timestamp < draw.drawTime) revert DrawNotReady(draw.drawTime, block.timestamp);

        // Check if draw has tickets
        uint256 ticketCount = ticketContract.getDrawTicketCount(drawId);
        if (ticketCount == 0) {
            // Cancel draw, return funds to sponsor
            draw.executed = true;
            emit DrawCancelled(drawId, "No tickets");
            return;
        }

        // Request VRF for random winner selection
        uint256 requestId = _requestVRFSeed(drawId);
        draw.vrfRequestId = requestId;
    }

    /// @notice VRF callback - selects winner from ticket pool
    function _onVRFSeedReceived(uint256 drawId, uint256 seed) internal override {
        Draw storage draw = draws[drawId];
        draw.vrfSeed = seed;

        // Get all tickets for this draw
        uint256[] memory ticketIds = ticketContract.getDrawTickets(drawId);
        if (ticketIds.length == 0) {
            draw.executed = true;
            emit DrawCancelled(drawId, "No tickets at VRF callback");
            return;
        }

        // Select random ticket
        uint256 randomIndex = seed % ticketIds.length;
        uint256 winningTicketId = ticketIds[randomIndex];

        // Get winner address (ticket owner)
        address winner = ticketContract.ownerOf(winningTicketId);

        // Claim (burn) the winning ticket
        ticketContract.claimTicket(winningTicketId);

        // Update draw
        draw.winner = winner;
        draw.winningTicketId = winningTicketId;
        draw.executed = true;

        emit DrawExecuted(drawId, winner, winningTicketId, seed);
    }

    // ════════════════════════════════════════════════════════
    //              JACKPOT GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create 12-case jackpot game for the winner. Callable after draw executed.
    ///         In production, called by CRE workflow immediately after executeDraw.
    /// @param drawId The draw whose winner should get a game
    function createJackpotGame(uint256 drawId) external returns (uint256 gameId) {
        Draw storage draw = draws[drawId];

        if (!draw.executed) revert DrawNotExecuted(drawId);
        if (draw.winner == address(0)) revert DrawNotExecuted(drawId);  // Cancelled draw
        if (draw.jackpotGameId != 0) return draw.jackpotGameId;  // Already created
        if (jackpotGameContract == address(0)) revert GameContractNotSet();

        // Call DealOrNot12Case.createMultiplayerGame()
        // (Interface defined below - actual contract deployed separately)
        gameId = IDealOrNot12Case(jackpotGameContract).createMultiplayerGame(
            draw.winner,
            drawId,
            draw.jackpotCents,
            draw.sponsor
        );

        draw.jackpotGameId = gameId;

        emit JackpotGameCreated(drawId, gameId, draw.winner);
    }

    // ════════════════════════════════════════════════════════
    //                    VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice Get draw details
    function getDraw(uint256 drawId) external view returns (Draw memory) {
        return draws[drawId];
    }

    /// @notice Get current active draw info
    function getCurrentDraw() external view returns (uint256 drawId, uint256 drawTime, uint256 ticketCount) {
        drawId = currentDrawId;
        Draw storage draw = draws[drawId];
        drawTime = draw.drawTime;
        ticketCount = ticketContract.getDrawTicketCount(drawId);
    }

    /// @notice Check if a draw is ready to execute
    function isDrawReady(uint256 drawId) external view returns (bool) {
        Draw storage draw = draws[drawId];
        return !draw.executed && draw.drawTime > 0 && block.timestamp >= draw.drawTime;
    }

    /// @notice Get all draws (paginated)
    function getDraws(uint256 offset, uint256 limit) external view returns (Draw[] memory) {
        uint256 total = nextDrawId - 1;
        if (offset >= total) return new Draw[](0);

        uint256 end = offset + limit;
        if (end > total) end = total;

        Draw[] memory result = new Draw[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = draws[i + 1];  // drawId starts at 1
        }
        return result;
    }

    // ════════════════════════════════════════════════════════
    //                       ADMIN
    // ════════════════════════════════════════════════════════

    /// @notice Set the 12-case game contract address
    function setJackpotGameContract(address _gameContract) external onlyOwner {
        jackpotGameContract = _gameContract;
    }

    /// @notice Advance to next draw period. Called after current draw executes.
    function scheduleNextDraw(uint256 drawTime) external onlyOwner {
        currentDrawId++;
        ticketContract.scheduleNextDraw(drawTime);
    }

    /// @notice Withdraw accumulated platform fees
    function withdrawPlatformFees(address payable to) external onlyOwner {
        uint256 balance = platformFeeBalance;
        if (balance == 0) revert NoPlatformFees();

        platformFeeBalance = 0;

        (bool ok,) = to.call{value: balance}("");
        if (!ok) revert("Transfer failed");

        emit PlatformFeeWithdrawn(to, balance);
    }

    receive() external payable {}
}

// ── Interface for DealOrNot12Case.sol ──

interface IDealOrNot12Case {
    function createMultiplayerGame(
        address winner,
        uint256 drawId,
        uint256 jackpotCents,
        address sponsor
    ) external returns (uint256 gameId);
}
