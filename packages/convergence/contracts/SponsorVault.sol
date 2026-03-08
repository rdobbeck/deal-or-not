// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Bank} from "./Bank.sol";

/// @dev Minimal interface to read DealOrNotQuickPlay game state.
interface IDealOrNotQuickPlay {
    function getGameState(uint256 gameId) external view returns (
        address host,
        address player,
        uint8 mode,
        uint8 phase,
        uint8 playerCase,
        uint8 currentRound,
        uint8 totalCollapsed,
        uint256 bankerOffer,
        uint256 finalPayout,
        uint256 ethPerDollar,
        uint256[5] memory caseValues,
        bool[5] memory opened
    );
}

/// @notice IReceiver -- Keystone Forwarder delivers CRE reports via this interface.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title SponsorVault -- Sponsorship + Jackpot for Deal or NOT
/// @notice Refactored from SponsorJackpot.sol. Sponsors register with branding,
///         deposit ETH for jackpots. Jackpot triggers if player gets the $1.00 case
///         (highest value) AND goes "no deal" all the way -- 50/50 split:
///         half to player, half rolls into next jackpot.
///
/// In 12-case version, sponsor creates game -> lottery window -> VRF draws winner -> winner plays.
/// Jackpot scales with 12-case values.
contract SponsorVault is Ownable, IReceiver {

    // ── Constants ──
    uint8 constant PHASE_GAME_OVER = 8;
    uint8 constant NUM_CASES = 5;
    uint256 constant JACKPOT_CASE_VALUE = 100; // $1.00 -- the highest case value

    // ── Structs ──
    struct Sponsor {
        string name;
        string logoUrl;
        uint256 balance;     // ETH available for jackpots
        uint256 totalSpent;  // ETH distributed lifetime
        bool registered;
    }

    // ── State ──
    IDealOrNotQuickPlay public gameContract;
    address public keystoneForwarder;

    mapping(address => Sponsor) public sponsors;
    mapping(uint256 => address) public gameSponsor;   // gameId -> sponsor address
    mapping(uint256 => uint256) public jackpots;      // gameId -> accumulated cents
    mapping(uint256 => bool) public claimed;

    /// @notice Rolling jackpot seed -- 50% of unclaimed jackpots roll here
    uint256 public rollingJackpotCents;

    // ── Events ──
    event SponsorRegistered(address indexed sponsor, string name, string logoUrl, uint256 deposit);
    event SponsorToppedUp(address indexed sponsor, uint256 amount, uint256 newBalance);
    event GameSponsored(uint256 indexed gameId, address indexed sponsor, string name);
    event JackpotIncreased(uint256 indexed gameId, uint256 amountCents, uint256 newTotal);
    event JackpotClaimed(uint256 indexed gameId, address indexed player, uint256 playerCents, uint256 weiPaid, uint256 rolledCents);
    event JackpotRolled(uint256 indexed gameId, uint256 cents, uint256 newRollingTotal);
    event JackpotCleared(uint256 indexed gameId, address indexed sponsor, uint256 amountCents);
    event BankSweetened(address indexed sponsor, address indexed bank, uint256 amount);

    // ── Errors ──
    error NotAuthorized();
    error AlreadyRegistered();
    error NotRegistered();
    error GameAlreadySponsored();
    error NoSponsor();
    error GameNotOver();
    error DidNotGoAllTheWay();
    error NotTopCase();
    error NotPlayer();
    error AlreadyClaimed();
    error NoJackpot();
    error InsufficientSponsorBalance();
    error TransferFailed();

    // ── Constructor ──
    constructor(address _gameContract) Ownable(msg.sender) {
        gameContract = IDealOrNotQuickPlay(_gameContract);
    }

    // ════════════════════════════════════════════════════════
    //                  SPONSOR REGISTRATION
    // ════════════════════════════════════════════════════════

    /// @notice Register as a sponsor with branding. Deposit ETH for jackpots.
    function registerSponsor(string calldata name, string calldata logoUrl) external payable {
        if (sponsors[msg.sender].registered) revert AlreadyRegistered();
        sponsors[msg.sender] = Sponsor({
            name: name,
            logoUrl: logoUrl,
            balance: msg.value,
            totalSpent: 0,
            registered: true
        });
        emit SponsorRegistered(msg.sender, name, logoUrl, msg.value);
    }

    /// @notice Add more ETH to your sponsor balance.
    function topUp() external payable {
        if (!sponsors[msg.sender].registered) revert NotRegistered();
        sponsors[msg.sender].balance += msg.value;
        emit SponsorToppedUp(msg.sender, msg.value, sponsors[msg.sender].balance);
    }

    /// @notice Assign yourself as sponsor for a game.
    function sponsorGame(uint256 gameId) external {
        if (!sponsors[msg.sender].registered) revert NotRegistered();
        if (gameSponsor[gameId] != address(0)) revert GameAlreadySponsored();
        gameSponsor[gameId] = msg.sender;
        emit GameSponsored(gameId, msg.sender, sponsors[msg.sender].name);
    }

    /// @notice Sponsor sends ETH directly to the Bank to keep games active.
    function sweetenBank(address bankAddress) external payable {
        if (!sponsors[msg.sender].registered) revert NotRegistered();
        Bank(payable(bankAddress)).sweeten{value: msg.value}();
        emit BankSweetened(msg.sender, bankAddress, msg.value);
    }

    // ════════════════════════════════════════════════════════
    //                     CRE WRITES
    // ════════════════════════════════════════════════════════

    /// @notice Add to a game's jackpot. Called by CRE log-trigger workflow on case opens.
    function addToJackpot(uint256 gameId, uint256 amountCents) external {
        if (msg.sender != keystoneForwarder && msg.sender != owner()) revert NotAuthorized();
        _addToJackpot(gameId, amountCents);
    }

    /// @notice Clear a game's jackpot and return to sponsor. Called by CRE when game expires.
    function clearExpiredJackpot(uint256 gameId) external {
        if (msg.sender != keystoneForwarder && msg.sender != owner()) revert NotAuthorized();
        _clearExpiredJackpot(gameId);
    }

    // ════════════════════════════════════════════════════════
    //              IReceiver (KEYSTONE FORWARDER)
    // ════════════════════════════════════════════════════════

    /// @notice Called by KeystoneForwarder to deliver CRE workflow reports.
    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {
        if (msg.sender != keystoneForwarder) revert NotAuthorized();

        bytes4 selector = bytes4(report[:4]);

        if (selector == this.addToJackpot.selector) {
            (uint256 gameId, uint256 amountCents) =
                abi.decode(report[4:], (uint256, uint256));
            _addToJackpot(gameId, amountCents);
        } else if (selector == this.clearExpiredJackpot.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _clearExpiredJackpot(gameId);
        } else {
            revert("Unknown report selector");
        }
    }

    /// @notice ERC165 -- declares support for IReceiver.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId
            || interfaceId == 0x01ffc9a7; // IERC165
    }

    // ════════════════════════════════════════════════════════
    //                     PLAYER CLAIMS
    // ════════════════════════════════════════════════════════

    /// @notice Claim the jackpot. Only triggers if player's final case value == $1.00
    ///         (the highest value) AND went "no deal" all the way (totalCollapsed == 5).
    ///         50/50 split: half to player, half rolls into next jackpot seed.
    function claimJackpot(uint256 gameId) external {
        if (claimed[gameId]) revert AlreadyClaimed();

        uint256 pot = jackpots[gameId];
        if (pot == 0) revert NoJackpot();

        address sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr == address(0)) revert NoSponsor();

        (
            ,
            address player,
            ,
            uint8 phase,
            uint8 playerCase,
            ,
            uint8 totalCollapsed,
            ,
            ,
            uint256 ethPerDollar,
            uint256[5] memory caseValues,
        ) = gameContract.getGameState(gameId);

        if (phase != PHASE_GAME_OVER) revert GameNotOver();
        if (totalCollapsed != NUM_CASES) revert DidNotGoAllTheWay();
        if (msg.sender != player) revert NotPlayer();

        // Jackpot only triggers if the player's case was the $1.00 (highest value)
        if (caseValues[playerCase] != JACKPOT_CASE_VALUE) revert NotTopCase();

        // 50/50 split
        uint256 playerShare = pot / 2;
        uint256 rolloverShare = pot - playerShare;

        // Convert player's share to ETH
        uint256 weiAmount = (playerShare * ethPerDollar) / 100;

        Sponsor storage s = sponsors[sponsorAddr];
        if (s.balance < weiAmount) revert InsufficientSponsorBalance();

        // State updates before transfer
        claimed[gameId] = true;
        jackpots[gameId] = 0;
        s.balance -= weiAmount;
        s.totalSpent += weiAmount;
        rollingJackpotCents += rolloverShare;

        (bool ok,) = payable(player).call{value: weiAmount}("");
        if (!ok) revert TransferFailed();

        emit JackpotClaimed(gameId, player, playerShare, weiAmount, rolloverShare);
    }

    // ════════════════════════════════════════════════════════
    //                       VIEWS
    // ════════════════════════════════════════════════════════

    function getJackpot(uint256 gameId) external view returns (uint256) {
        return jackpots[gameId];
    }

    function getRollingJackpot() external view returns (uint256) {
        return rollingJackpotCents;
    }

    function getGameSponsorInfo(uint256 gameId) external view returns (
        string memory name,
        string memory logoUrl,
        address sponsorAddr
    ) {
        sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr != address(0)) {
            Sponsor storage s = sponsors[sponsorAddr];
            name = s.name;
            logoUrl = s.logoUrl;
        }
    }

    function getSponsorBalance(address sponsor) external view returns (uint256) {
        return sponsors[sponsor].balance;
    }

    // ════════════════════════════════════════════════════════
    //                       ADMIN
    // ════════════════════════════════════════════════════════

    function setKeystoneForwarder(address _forwarder) external onlyOwner {
        keystoneForwarder = _forwarder;
    }

    function setGameContract(address _gameContract) external onlyOwner {
        gameContract = IDealOrNotQuickPlay(_gameContract);
    }

    function rescueETH(address to) external onlyOwner {
        uint256 bal = address(this).balance;
        (bool ok,) = payable(to).call{value: bal}("");
        if (!ok) revert TransferFailed();
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    function _addToJackpot(uint256 gameId, uint256 amountCents) internal {
        if (gameSponsor[gameId] == address(0)) revert NoSponsor();
        jackpots[gameId] += amountCents;
        emit JackpotIncreased(gameId, amountCents, jackpots[gameId]);
    }

    function _clearExpiredJackpot(uint256 gameId) internal {
        if (claimed[gameId]) revert AlreadyClaimed();

        uint256 pot = jackpots[gameId];
        if (pot == 0) revert NoJackpot();

        address sponsorAddr = gameSponsor[gameId];
        if (sponsorAddr == address(0)) revert NoSponsor();

        (, , , uint8 phase, , , , , , , ,) = gameContract.getGameState(gameId);
        if (phase != PHASE_GAME_OVER) revert GameNotOver();

        // Zero the cents ledger -- sponsor's ETH balance is unaffected
        claimed[gameId] = true;
        jackpots[gameId] = 0;
        emit JackpotCleared(gameId, sponsorAddr, pot);
    }
}
