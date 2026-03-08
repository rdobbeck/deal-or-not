// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {VRFManager} from "./VRFManager.sol";
import {PriceFeedHelper} from "./PriceFeedHelper.sol";
import {GameMath} from "./GameMath.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";
import {Bank} from "./Bank.sol";

/// @notice IReceiver -- Keystone Forwarder delivers CRE reports via this interface.
interface IReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title DealOrNotQuickPlay -- Real ETH Quick Play (5 Cases, $0.25 Entry)
/// @notice On-chain Deal or No Deal with Chainlink VRF + Price Feeds + CRE Confidential Compute.
///         This is the convergence of the prototype (CRE + VRF + AI Banker) with real ETH.
///
///         Key changes from DealOrNotConfidential:
///           - createGame() is payable ($0.25 entry fee)
///           - Requires bank.isActive() -- reverts if bank needs sweetening
///           - Entry fee ETH forwarded to Bank
///           - On GameOver: Bank.settle() pays winner from global pot
///
///         Everything else (CRE phases, case opening, banker offers, CCIP bridge) stays identical.
///
///      SECURITY MODEL: VRF + CRE Secret + Attestation (same as prototype)
///
///      In multiplayer 12-case version: sponsor creates game -> lottery window -> VRF draws winner -> winner plays.
contract DealOrNotQuickPlay is VRFManager, IReceiver {
    using BankerAlgorithm for uint256[];
    using PriceFeedHelper for AggregatorV3Interface;

    // ── Constants ──
    uint8 public constant NUM_CASES = 5;
    uint8 public constant NUM_ROUNDS = 4;
    uint256[5] public CASE_VALUES_CENTS = [1, 5, 10, 50, 100]; // $0.01 -> $1.00

    uint256 public constant ENTRY_FEE_CENTS = 25;  // $0.25
    uint256 public constant SLIPPAGE_BPS = 500;     // 5%

    // ── Chainlink Config ──
    AggregatorV3Interface public immutable priceFeed;

    // ── External Contracts ──
    Bank public bank;

    // ── CRE Config ──
    address public creForwarder;

    // ── CCIP Config ──
    address public ccipBridge;

    // ── Enums ──
    enum GameMode { SinglePlayer, MultiPlayer }
    enum Phase {
        WaitingForVRF,         // 0
        Created,               // 1
        Round,                 // 2
        WaitingForCRE,         // 3
        AwaitingOffer,         // 4
        BankerOffer,           // 5
        FinalRound,            // 6
        WaitingForFinalCRE,    // 7
        GameOver               // 8
    }

    // ── Structs ──
    struct Banker {
        bool isAllowed;
        bool isContract;
        bool isHuman;
        bool isBanned;
    }

    struct Game {
        address host;
        address player;
        GameMode mode;
        Phase phase;
        uint8 playerCase;
        uint8 currentRound;
        uint8 totalCollapsed;
        uint256 bankerOffer;
        uint256 finalPayout;
        uint256 ethPerDollar;
        uint256 vrfRequestId;
        uint256 vrfSeed;
        uint256 usedValuesBitmap;
        uint256[5] caseValues;
        bool[5] opened;
        uint8 pendingCaseIndex;
        bytes32 gameSecret;
        uint256 createdAt;
        uint256 entryDeposit;   // NEW: wei deposited as entry fee
    }

    // ── State ──
    mapping(uint256 => Game) internal _games;
    mapping(uint256 => mapping(address => Banker)) public gameBankers;
    uint256 public nextGameId;

    // ── Events ──
    event GameCreated(uint256 indexed gameId, address indexed host, GameMode mode);
    event EntryFeePaid(uint256 indexed gameId, address indexed player, uint256 weiAmount, uint256 centEquivalent);
    event CasePicked(uint256 indexed gameId, uint8 caseIndex);
    event CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex);
    event CaseRevealed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents);
    event RoundComplete(uint256 indexed gameId, uint8 round);
    event BankerAdded(uint256 indexed gameId, address indexed banker, bool isContract);
    event BankerBanned(uint256 indexed gameId, address indexed banker);
    event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents);
    event DealAccepted(uint256 indexed gameId, uint256 payoutCents);
    event DealRejected(uint256 indexed gameId, uint8 round);
    event FinalCaseRequested(uint256 indexed gameId);
    event GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped);
    event GameSecretPublished(uint256 indexed gameId, bytes32 secret);
    event BankerMessage(uint256 indexed gameId, string message);
    event PlayerJoinedCrossChain(uint256 indexed gameId, address indexed player);
    event GameExpired(uint256 indexed gameId);
    event FundsRescued(address indexed to, uint256 amount);

    // ── Errors ──
    error WrongPhase(Phase expected, Phase actual);
    error NotHost();
    error NotPlayer();
    error NotAllowedBanker();
    error NotCREForwarder();
    error InvalidCase(uint8 index);
    error CaseAlreadyOpened(uint8 index);
    error CannotOpenOwnCase();
    error InvalidValue();
    error GameNotOver();
    error SecretAlreadyPublished();
    error GameNotActive();
    error GameNotExpired();
    error NoFundsToRescue();
    error TransferFailed();
    error NotCCIPBridge();
    error GameAlreadyHasPlayer();
    error MessageTooLong();
    error BankNotActive();

    // ── Constructor ──
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _priceFeed,
        address _creForwarder,
        address _bank
    ) VRFManager(_vrfCoordinator, _subscriptionId, _keyHash) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        creForwarder = _creForwarder;
        bank = Bank(payable(_bank));
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a single-player game. Pays $0.25 entry fee in ETH.
    ///         Requires bank to be active (sweetened). Entry fee forwarded to Bank.
    function createGame() external payable returns (uint256 gameId) {
        // Require bank to be active
        if (!bank.isActive()) revert BankNotActive();

        // Validate entry fee
        uint256 requiredWei = priceFeed.usdToWei(ENTRY_FEE_CENTS);
        GameMath.validateDeposit(msg.value, requiredWei, SLIPPAGE_BPS);

        gameId = nextGameId++;
        Game storage g = _games[gameId];
        g.host = msg.sender;
        g.player = msg.sender;
        g.mode = GameMode.SinglePlayer;
        g.phase = Phase.WaitingForVRF;
        g.entryDeposit = msg.value;

        // Snapshot ETH/USD price for this game (reject stale feed > 1 hour)
        g.ethPerDollar = priceFeed.snapshotPriceWithStaleness(3600);

        // Forward entry fee to Bank
        bank.receiveEntryFee{value: msg.value}();

        emit EntryFeePaid(gameId, msg.sender, msg.value, ENTRY_FEE_CENTS);

        // Request VRF seed
        uint256 requestId = _requestVRFSeed(gameId);
        g.vrfRequestId = requestId;

        // Host is automatically an allowed human banker
        gameBankers[gameId][msg.sender] = Banker({
            isAllowed: true,
            isContract: false,
            isHuman: true,
            isBanned: false
        });

        emit GameCreated(gameId, msg.sender, GameMode.SinglePlayer);
    }

    // ════════════════════════════════════════════════════════
    //                    VRF CALLBACK
    // ════════════════════════════════════════════════════════

    function _onVRFSeedReceived(uint256 gameId, uint256 seed) internal override {
        Game storage g = _games[gameId];
        g.vrfSeed = seed;
        g.createdAt = block.timestamp;
        g.phase = Phase.Created;
    }

    // ════════════════════════════════════════════════════════
    //                 BANKER MANAGEMENT
    // ════════════════════════════════════════════════════════

    function addBanker(uint256 gameId, address banker, bool isContract, bool isHuman) external {
        if (msg.sender != _games[gameId].host) revert NotHost();
        gameBankers[gameId][banker] = Banker({
            isAllowed: true,
            isContract: isContract,
            isHuman: isHuman,
            isBanned: false
        });
        emit BankerAdded(gameId, banker, isContract);
    }

    function banBanker(uint256 gameId, address banker) external {
        if (msg.sender != _games[gameId].host) revert NotHost();
        gameBankers[gameId][banker].isBanned = true;
        emit BankerBanned(gameId, banker);
    }

    // ════════════════════════════════════════════════════════
    //                    GAME PLAY
    // ════════════════════════════════════════════════════════

    function pickCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Created);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);

        g.playerCase = caseIndex;
        g.phase = Phase.Round;

        emit CasePicked(gameId, caseIndex);
    }

    function openCase(uint256 gameId, uint8 caseIndex) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.Round);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        if (caseIndex == g.playerCase) revert CannotOpenOwnCase();
        if (g.opened[caseIndex]) revert CaseAlreadyOpened(caseIndex);

        g.pendingCaseIndex = caseIndex;
        g.phase = Phase.WaitingForCRE;

        emit CaseOpenRequested(gameId, caseIndex);
    }

    function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) external {
        _requireCRE();
        _fulfillCaseValue(gameId, caseIndex, valueCents);
    }

    function setBankerOffer(uint256 gameId, uint256 offerCents) external {
        _requireBankerAuth(gameId);
        _setBankerOffer(gameId, offerCents);
    }

    function setBankerOfferWithMessage(uint256 gameId, uint256 offerCents, string calldata message) external {
        _requireBankerAuth(gameId);
        if (bytes(message).length > 512) revert MessageTooLong();
        _setBankerOffer(gameId, offerCents);
        emit BankerMessage(gameId, message);
    }

    /// @notice DEAL -- accept the banker's offer. Game over. Bank settles payout.
    function acceptDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        g.finalPayout = g.bankerOffer;
        g.phase = Phase.GameOver;

        // Settle payout from Bank
        bank.settle(g.finalPayout, g.player, g.ethPerDollar);

        emit DealAccepted(gameId, g.bankerOffer);
        emit GameResolved(gameId, g.finalPayout, false);
    }

    function rejectDeal(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.BankerOffer);

        emit DealRejected(gameId, g.currentRound);

        g.currentRound++;
        g.bankerOffer = 0;
        g.phase = Phase.Round;
    }

    function keepCase(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.FinalRound);

        uint8 lastCase = _findLastCase(g);
        g.pendingCaseIndex = lastCase;
        g.phase = Phase.WaitingForFinalCRE;

        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, lastCase);
    }

    function swapCase(uint256 gameId) external {
        Game storage g = _games[gameId];
        _requirePlayer(g);
        _requirePhase(g, Phase.FinalRound);

        uint8 lastCase = _findLastCase(g);
        uint8 oldPlayerCase = g.playerCase;
        g.playerCase = lastCase;

        g.pendingCaseIndex = oldPlayerCase;
        g.phase = Phase.WaitingForFinalCRE;

        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, oldPlayerCase);
    }

    function publishGameSecret(uint256 gameId, bytes32 secret) external {
        _requireCRE();
        _publishGameSecret(gameId, secret);
    }

    function expireGame(uint256 gameId) external {
        _requireCRE();
        _expireGame(gameId);
    }

    // ════════════════════════════════════════════════════════
    //              CCIP CROSS-CHAIN JOIN
    // ════════════════════════════════════════════════════════

    function joinGameCrossChain(uint256 gameId, address player) external {
        if (msg.sender != ccipBridge) revert NotCCIPBridge();
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.Created);
        if (g.player != g.host) revert GameAlreadyHasPlayer();
        g.player = player;
        emit PlayerJoinedCrossChain(gameId, player);
    }

    // ════════════════════════════════════════════════════════
    //              IReceiver (KEYSTONE FORWARDER)
    // ════════════════════════════════════════════════════════

    function onReport(bytes calldata /* metadata */, bytes calldata report) external override {
        if (msg.sender != creForwarder) revert NotCREForwarder();

        bytes4 selector = bytes4(report[:4]);

        if (selector == this.fulfillCaseValue.selector) {
            (uint256 gameId, uint8 caseIndex, uint256 valueCents) =
                abi.decode(report[4:], (uint256, uint8, uint256));
            _fulfillCaseValue(gameId, caseIndex, valueCents);
        } else if (selector == this.setBankerOfferWithMessage.selector) {
            (uint256 gameId, uint256 offerCents, string memory message) =
                abi.decode(report[4:], (uint256, uint256, string));
            _setBankerOfferWithMessage(gameId, offerCents, message);
        } else if (selector == this.publishGameSecret.selector) {
            (uint256 gameId, bytes32 secret) =
                abi.decode(report[4:], (uint256, bytes32));
            _publishGameSecret(gameId, secret);
        } else if (selector == this.expireGame.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _expireGame(gameId);
        } else {
            revert("Unknown report selector");
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId
            || interfaceId == 0x01ffc9a7;
    }

    // ════════════════════════════════════════════════════════
    //                  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    function calculateBankerOffer(uint256 gameId) external view returns (uint256) {
        Game storage g = _games[gameId];
        uint256[] memory pool = _getRemainingValuePool(g);
        return pool.calculateOffer(g.currentRound);
    }

    function calculateBankerOfferFull(uint256 gameId) external view returns (uint256) {
        Game storage g = _games[gameId];
        uint256[] memory pool = _getRemainingValuePool(g);
        uint256[] memory fullPool = _getFullValuePool();
        uint256 initialEV = fullPool.expectedValue();
        return pool.calculateOfferWithVariance(
            g.currentRound, initialEV, bytes32(g.vrfSeed)
        );
    }

    function getRemainingValuePool(uint256 gameId) external view returns (uint256[] memory) {
        return _getRemainingValuePool(_games[gameId]);
    }

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
    ) {
        Game storage g = _games[gameId];
        return (
            g.host,
            g.player,
            uint8(g.mode),
            uint8(g.phase),
            g.playerCase,
            g.currentRound,
            g.totalCollapsed,
            g.bankerOffer,
            g.finalPayout,
            g.ethPerDollar,
            g.caseValues,
            g.opened
        );
    }

    function getGameSecret(uint256 gameId) external view returns (bytes32) {
        return _games[gameId].gameSecret;
    }

    function getGameCreatedAt(uint256 gameId) external view returns (uint256) {
        return _games[gameId].createdAt;
    }

    function getEntryDeposit(uint256 gameId) external view returns (uint256) {
        return _games[gameId].entryDeposit;
    }

    function getBanker(uint256 gameId, address banker) external view returns (
        bool isAllowed, bool isContract, bool isHuman, bool isBanned
    ) {
        Banker storage b = gameBankers[gameId][banker];
        return (b.isAllowed, b.isContract, b.isHuman, b.isBanned);
    }

    function centsToWei(uint256 gameId, uint256 cents) external view returns (uint256) {
        return (cents * _games[gameId].ethPerDollar) / 100;
    }

    /// @notice Estimate entry fee in wei (for frontend).
    function estimateEntryFee() external view returns (uint256 baseWei, uint256 withSlippage) {
        baseWei = priceFeed.usdToWei(ENTRY_FEE_CENTS);
        withSlippage = GameMath.requiredWithSlippage(baseWei, SLIPPAGE_BPS);
    }

    function verifyGame(uint256 gameId) external view returns (bool) {
        Game storage g = _games[gameId];
        if (g.gameSecret == bytes32(0)) return false;

        uint256 replayBitmap = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (g.caseValues[i] == 0) continue;

            uint256 derivedValue = _deriveValue(g.vrfSeed, i, g.gameSecret, replayBitmap);
            if (derivedValue != g.caseValues[i]) return false;

            for (uint8 j = 0; j < NUM_CASES; j++) {
                if (CASE_VALUES_CENTS[j] == derivedValue && (replayBitmap & (1 << j)) == 0) {
                    replayBitmap |= (1 << j);
                    break;
                }
            }
        }
        return true;
    }

    // ════════════════════════════════════════════════════════
    //                  RESCUE / ADMIN
    // ════════════════════════════════════════════════════════

    function rescueETH(address to) external onlyOwner {
        uint256 bal = address(this).balance;
        if (bal == 0) revert NoFundsToRescue();
        (bool ok,) = to.call{value: bal}("");
        if (!ok) revert TransferFailed();
        emit FundsRescued(to, bal);
    }

    function setCREForwarder(address _creForwarder) external onlyOwner {
        creForwarder = _creForwarder;
    }

    function setCCIPBridge(address _ccipBridge) external onlyOwner {
        ccipBridge = _ccipBridge;
    }

    function setBank(address _bank) external onlyOwner {
        bank = Bank(payable(_bank));
    }

    receive() external payable {}

    // ════════════════════════════════════════════════════════
    //            CRE CONFIDENTIAL COLLAPSE ENGINE
    // ════════════════════════════════════════════════════════

    function _deriveValue(
        uint256 vrfSeed,
        uint8 caseIndex,
        bytes32 secret,
        uint256 bitmap
    ) internal view returns (uint256) {
        uint8 remaining = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((bitmap & (1 << i)) == 0) remaining++;
        }
        if (remaining == 0) return 0;

        uint256 pick = uint256(keccak256(abi.encodePacked(
            vrfSeed, caseIndex, secret, bitmap
        ))) % remaining;

        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((bitmap & (1 << i)) == 0) {
                if (count == pick) {
                    return CASE_VALUES_CENTS[i];
                }
                count++;
            }
        }
        return 0;
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    function _fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) internal {
        Game storage g = _games[gameId];

        if (g.phase != Phase.WaitingForCRE && g.phase != Phase.WaitingForFinalCRE) {
            revert WrongPhase(Phase.WaitingForCRE, g.phase);
        }
        if (caseIndex != g.pendingCaseIndex) revert InvalidCase(caseIndex);
        if (!_isValidUnusedValue(g, valueCents)) revert InvalidValue();

        g.caseValues[caseIndex] = valueCents;
        g.opened[caseIndex] = true;
        _markValueUsed(g, valueCents);
        g.totalCollapsed++;

        emit CaseRevealed(gameId, caseIndex, valueCents);

        if (g.phase == Phase.WaitingForFinalCRE) {
            _completeFinalReveal(g, gameId);
            return;
        }

        uint8 remaining = _countRemaining(g);
        if (remaining == 1) {
            g.phase = Phase.FinalRound;
        } else {
            g.phase = Phase.AwaitingOffer;
        }
        emit RoundComplete(gameId, g.currentRound);
    }

    function _completeFinalReveal(Game storage g, uint256 gameId) internal {
        uint256 playerValue = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                playerValue = CASE_VALUES_CENTS[i];
                g.usedValuesBitmap |= (1 << i);
                break;
            }
        }

        g.caseValues[g.playerCase] = playerValue;
        g.totalCollapsed++;
        g.finalPayout = playerValue;
        g.phase = Phase.GameOver;

        // Settle payout from Bank
        bank.settle(g.finalPayout, g.player, g.ethPerDollar);

        emit CaseRevealed(gameId, g.playerCase, playerValue);
        emit GameResolved(gameId, g.finalPayout, false);
    }

    function _publishGameSecret(uint256 gameId, bytes32 secret) internal {
        Game storage g = _games[gameId];
        if (g.phase != Phase.GameOver) revert GameNotOver();
        if (g.gameSecret != bytes32(0)) revert SecretAlreadyPublished();

        g.gameSecret = secret;
        emit GameSecretPublished(gameId, secret);
    }

    function _setBankerOffer(uint256 gameId, uint256 offerCents) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.AwaitingOffer);

        g.bankerOffer = offerCents;
        g.phase = Phase.BankerOffer;

        emit BankerOfferMade(gameId, g.currentRound, offerCents);
    }

    function _setBankerOfferWithMessage(uint256 gameId, uint256 offerCents, string memory message) internal {
        if (bytes(message).length > 512) revert MessageTooLong();
        _setBankerOffer(gameId, offerCents);
        emit BankerMessage(gameId, message);
    }

    function _expireGame(uint256 gameId) internal {
        Game storage g = _games[gameId];
        if (g.phase == Phase.GameOver) revert GameNotActive();
        if (g.createdAt == 0 || block.timestamp <= g.createdAt + 600) revert GameNotExpired();

        g.finalPayout = 0;
        g.phase = Phase.GameOver;
        emit GameExpired(gameId);
    }

    function _isValidUnusedValue(Game storage g, uint256 valueCents) internal view returns (bool) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == valueCents && (g.usedValuesBitmap & (1 << i)) == 0) {
                return true;
            }
        }
        return false;
    }

    function _markValueUsed(Game storage g, uint256 valueCents) internal {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == valueCents && (g.usedValuesBitmap & (1 << i)) == 0) {
                g.usedValuesBitmap |= (1 << i);
                return;
            }
        }
    }

    function _countRemaining(Game storage g) internal view returns (uint8) {
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!g.opened[i] && i != g.playerCase) count++;
        }
        return count;
    }

    function _findLastCase(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (!g.opened[i] && i != g.playerCase) return i;
        }
        revert("no remaining case");
    }

    function _getRemainingValuePool(Game storage g) internal view returns (uint256[] memory) {
        uint8 count = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) count++;
        }
        uint256[] memory vals = new uint256[](count);
        uint8 idx = 0;
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if ((g.usedValuesBitmap & (1 << i)) == 0) {
                vals[idx++] = CASE_VALUES_CENTS[i];
            }
        }
        return vals;
    }

    function _getFullValuePool() internal view returns (uint256[] memory) {
        uint256[] memory pool = new uint256[](NUM_CASES);
        for (uint8 i = 0; i < NUM_CASES; i++) {
            pool[i] = CASE_VALUES_CENTS[i];
        }
        return pool;
    }

    function _requirePlayer(Game storage g) internal view {
        if (msg.sender != g.player) revert NotPlayer();
    }

    function _requirePhase(Game storage g, Phase expected) internal view {
        if (g.phase != expected) revert WrongPhase(expected, g.phase);
    }

    function _requireBankerAuth(uint256 gameId) internal view {
        Banker storage b = gameBankers[gameId][msg.sender];
        if (!b.isAllowed || b.isBanned) revert NotAllowedBanker();
    }

    function _requireCRE() internal view {
        if (msg.sender != creForwarder) revert NotCREForwarder();
    }
}
