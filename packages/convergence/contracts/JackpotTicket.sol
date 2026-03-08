// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title JackpotTicket -- NFT tickets for weekly Deal or NOT jackpot lottery
/// @notice ERC-721 NFT minted when a player wins the $1.00 case in QuickPlay.
///         Each ticket is valid for a specific weekly draw.
///         Winner selected via VRF in LotteryDraw.sol, then ticket is burned.
///
/// FLOW:
///   1. Player wins $1.00 in QuickPlay → DealOrNotQuickPlay mints ticket
///   2. Ticket assigned to current draw window (e.g., "Draw #5: Sunday Feb 11, 8pm ET")
///   3. Sunday 8pm: CRE cron triggers LotteryDraw.executeDraw()
///   4. VRF selects random ticket from draw pool
///   5. Winner announced, ticket burned, 12-case jackpot game created
///
/// ECONOMICS:
///   - Winning $1.00 case in QuickPlay (~1/5 chance if you go all the way) = 1 ticket
///   - Typical weekly pool: 500-2,000 tickets (depending on QuickPlay volume)
///   - Jackpot: $500-$5,000 (sponsor-funded)
///   - Tickets are tradeable NFTs (OpenSea compatible)
contract JackpotTicket is ERC721, Ownable {
    // ── Structs ──

    struct Ticket {
        uint256 gameId;        // QuickPlay game that issued this ticket
        uint256 drawId;        // Which weekly draw it's valid for
        address player;        // Original winner (for historical reference)
        uint256 mintedAt;      // Block timestamp
        bool claimed;          // True if used in a draw (ticket burned)
    }

    // ── State ──

    uint256 public nextTicketId = 1;
    uint256 public currentDrawId = 1;
    uint256 public nextDrawTime;  // Unix timestamp for upcoming draw (e.g., next Sunday 8pm)

    mapping(uint256 => Ticket) public tickets;
    mapping(address => bool) public authorizedMinters;  // DealOrNotQuickPlay address
    mapping(uint256 => uint256[]) private _drawTickets;   // drawId => ticketIds[]
    mapping(address => uint256[]) private _playerTickets; // player => ticketIds[]

    // ── Events ──

    event TicketMinted(
        uint256 indexed ticketId,
        address indexed player,
        uint256 gameId,
        uint256 drawId,
        uint256 mintedAt
    );
    event TicketClaimed(uint256 indexed ticketId, uint256 indexed drawId, address indexed winner);
    event DrawScheduled(uint256 indexed drawId, uint256 drawTime);
    event MinterAuthorized(address indexed minter, bool authorized);

    // ── Errors ──

    error NotAuthorizedMinter();
    error TicketAlreadyClaimed(uint256 ticketId);
    error TicketNotFound(uint256 ticketId);
    error DrawTimeInPast(uint256 providedTime, uint256 currentTime);
    error InvalidDrawId(uint256 drawId);

    // ── Constructor ──

    constructor() ERC721("Deal or NOT Jackpot Ticket", "DONTKT") Ownable(msg.sender) {
        // Initialize first draw to next Sunday 8pm UTC (placeholder)
        // In production, owner sets this after deployment
        nextDrawTime = block.timestamp + 7 days;
    }

    // ════════════════════════════════════════════════════════
    //                      MINTING
    // ════════════════════════════════════════════════════════

    /// @notice Mint a jackpot ticket. Callable only by authorized minter (DealOrNotQuickPlay).
    /// @param player The QuickPlay winner receiving the ticket
    /// @param gameId The QuickPlay gameId that triggered the ticket
    /// @return ticketId The minted ticket's ID
    function mint(address player, uint256 gameId) external returns (uint256 ticketId) {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();

        ticketId = nextTicketId++;

        tickets[ticketId] = Ticket({
            gameId: gameId,
            drawId: currentDrawId,
            player: player,
            mintedAt: block.timestamp,
            claimed: false
        });

        _drawTickets[currentDrawId].push(ticketId);
        _playerTickets[player].push(ticketId);

        _safeMint(player, ticketId);

        emit TicketMinted(ticketId, player, gameId, currentDrawId, block.timestamp);
    }

    // ════════════════════════════════════════════════════════
    //                   CLAIM / BURN
    // ════════════════════════════════════════════════════════

    /// @notice Mark ticket as claimed and burn it. Called by LotteryDraw after winner selected.
    /// @param ticketId The winning ticket to claim
    function claimTicket(uint256 ticketId) external {
        if (!authorizedMinters[msg.sender]) revert NotAuthorizedMinter();

        Ticket storage ticket = tickets[ticketId];
        if (ticket.mintedAt == 0) revert TicketNotFound(ticketId);
        if (ticket.claimed) revert TicketAlreadyClaimed(ticketId);

        ticket.claimed = true;

        address winner = ownerOf(ticketId);
        _burn(ticketId);

        emit TicketClaimed(ticketId, ticket.drawId, winner);
    }

    // ════════════════════════════════════════════════════════
    //                  DRAW MANAGEMENT
    // ════════════════════════════════════════════════════════

    /// @notice Schedule the next draw. Increments drawId and sets new draw time.
    ///         Called by owner or LotteryDraw contract after executing current draw.
    /// @param drawTime Unix timestamp for next draw (must be in future)
    function scheduleNextDraw(uint256 drawTime) external onlyOwner {
        if (drawTime <= block.timestamp) revert DrawTimeInPast(drawTime, block.timestamp);

        currentDrawId++;
        nextDrawTime = drawTime;

        emit DrawScheduled(currentDrawId, drawTime);
    }

    // ════════════════════════════════════════════════════════
    //                    VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    /// @notice Get all ticket IDs owned by a player (includes unclaimed only)
    /// @param player The player's address
    /// @return Array of ticket IDs
    function getPlayerTickets(address player) external view returns (uint256[] memory) {
        uint256[] memory allTickets = _playerTickets[player];
        uint256 unclaimedCount = 0;

        // Count unclaimed tickets
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                unclaimedCount++;
            }
        }

        // Build unclaimed array
        uint256[] memory unclaimed = new uint256[](unclaimedCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                unclaimed[idx++] = allTickets[i];
            }
        }

        return unclaimed;
    }

    /// @notice Get all ticket IDs for a specific draw (unclaimed only)
    /// @param drawId The draw ID
    /// @return Array of ticket IDs
    function getDrawTickets(uint256 drawId) external view returns (uint256[] memory) {
        uint256[] memory allTickets = _drawTickets[drawId];
        uint256 unclaimedCount = 0;

        // Count unclaimed tickets
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                unclaimedCount++;
            }
        }

        // Build unclaimed array
        uint256[] memory unclaimed = new uint256[](unclaimedCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                unclaimed[idx++] = allTickets[i];
            }
        }

        return unclaimed;
    }

    /// @notice Get ticket count for a draw (unclaimed only)
    /// @param drawId The draw ID
    /// @return count Number of unclaimed tickets
    function getDrawTicketCount(uint256 drawId) external view returns (uint256 count) {
        uint256[] memory allTickets = _drawTickets[drawId];
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                count++;
            }
        }
    }

    /// @notice Get ticket details
    /// @param ticketId The ticket ID
    /// @return ticket The ticket struct
    function getTicket(uint256 ticketId) external view returns (Ticket memory) {
        if (tickets[ticketId].mintedAt == 0) revert TicketNotFound(ticketId);
        return tickets[ticketId];
    }

    /// @notice Check if a draw has any unclaimed tickets
    /// @param drawId The draw ID
    /// @return hasTickets True if draw has at least one unclaimed ticket
    function drawHasTickets(uint256 drawId) external view returns (bool hasTickets) {
        uint256[] memory allTickets = _drawTickets[drawId];
        for (uint256 i = 0; i < allTickets.length; i++) {
            if (!tickets[allTickets[i]].claimed) {
                return true;
            }
        }
        return false;
    }

    // ════════════════════════════════════════════════════════
    //                       ADMIN
    // ════════════════════════════════════════════════════════

    /// @notice Authorize a contract to mint tickets (DealOrNotQuickPlay)
    /// @param minter The minter address
    /// @param authorized True to authorize, false to revoke
    function setAuthorizedMinter(address minter, bool authorized) external onlyOwner {
        authorizedMinters[minter] = authorized;
        emit MinterAuthorized(minter, authorized);
    }

    /// @notice Get current draw info
    /// @return drawId Current draw ID
    /// @return drawTime Next draw timestamp
    function getCurrentDraw() external view returns (uint256 drawId, uint256 drawTime) {
        return (currentDrawId, nextDrawTime);
    }

    /// @notice ERC-721 metadata override (for OpenSea display)
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);

        Ticket memory ticket = tickets[tokenId];

        // In production, this would return a JSON URI with ticket metadata
        // For now, return a placeholder
        return string(abi.encodePacked(
            "https://dealornot.game/api/ticket/",
            _toString(tokenId),
            "?draw=",
            _toString(ticket.drawId),
            "&game=",
            _toString(ticket.gameId)
        ));
    }

    // ════════════════════════════════════════════════════════
    //                      HELPERS
    // ════════════════════════════════════════════════════════

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";

        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + (value % 10)));
            value /= 10;
        }

        return string(buffer);
    }
}
