// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {VRFManager} from "./VRFManager.sol";
import {PriceFeedHelper} from "./PriceFeedHelper.sol";
import {GameMath} from "./GameMath.sol";
import {BankerAlgorithm} from "./BankerAlgorithm.sol";
import {Bank} from "./Bank.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @notice IReceiver — Keystone Forwarder delivers CRE reports via this interface.
interface IAgentReceiver {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title Deal or NOT — Agent Edition (Convergence)
/// @notice Same 5-case game with real ETH economics, designed for CRE-forwarded autonomous agent gameplay.
///         Uses convergence modular architecture: VRFManager, PriceFeedHelper, Bank, GameMath.
///
///   KEY DIFFERENCES FROM DealOrNotQuickPlay:
///   In QuickPlay, players call pickCase/openCase/etc directly (msg.sender == player).
///   In the agent game, the CRE orchestrator makes moves ON BEHALF of agents via onReport.
///   The agent's identity is verified through AgentRegistry, not msg.sender.
///
///   REAL ETH ECONOMICS:
///   - Agents pay $0.25 entry fee (same as human QuickPlay)
///   - Entry fees forwarded to Bank
///   - On game resolution: Bank.settle() pays agent in real ETH
///   - Agent stats recorded in AgentRegistry
///
///   Flow:
///   1. Agent owner calls createAgentGame(agentAddress) with entry fee — creates game
///   2. CRE orchestrator detects GameCreated event
///   3. Orchestrator calls agent's HTTP endpoint for decisions
///   4. Orchestrator sends agentPickCase/agentOpenCase/etc via writeReport → onReport
///   5. Contract verifies agent is registered in AgentRegistry
///   6. On GameOver, Bank settles payout + auto-records stats in AgentRegistry
contract DealOrNotAgents is VRFManager, IAgentReceiver {
    using BankerAlgorithm for uint256[];
    using PriceFeedHelper for AggregatorV3Interface;

    // ── Constants ──
    uint8 public constant NUM_CASES = 5;
    uint8 public constant NUM_ROUNDS = 4;
    uint256[5] public CASE_VALUES_CENTS = [1, 5, 10, 50, 100];

    uint256 public constant ENTRY_FEE_CENTS = 25;  // $0.25 — same as QuickPlay
    uint256 public constant SLIPPAGE_BPS = 500;     // 5%

    // ── Chainlink Config ──
    AggregatorV3Interface public immutable priceFeed;
    AgentRegistry public immutable agentRegistry;

    // ── External Contracts ──
    Bank public bank;

    // ── CRE Config ──
    address public creForwarder;

    // ── Enums ──
    enum Phase {
        WaitingForVRF,      // 0
        Created,            // 1: pick case
        Round,              // 2: open case
        WaitingForCRE,      // 3: CRE computing value
        AwaitingOffer,      // 4: waiting for banker
        BankerOffer,        // 5: offer on table
        FinalRound,         // 6: keep or swap
        WaitingForFinalCRE, // 7: final reveal
        GameOver            // 8
    }

    // ── Structs ──
    struct Game {
        address agent;           // The registered agent playing
        uint256 agentId;         // AgentRegistry ID
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
        uint256 entryDeposit;    // wei deposited as entry fee
    }

    // ── State ──
    mapping(uint256 => Game) internal _games;
    uint256 public nextGameId;

    // ── Events ──
    event GameCreated(uint256 indexed gameId, address indexed agent, uint256 agentId);
    event EntryFeePaid(uint256 indexed gameId, address indexed agent, uint256 weiAmount, uint256 centEquivalent);
    event CasePicked(uint256 indexed gameId, uint8 caseIndex);
    event CaseOpenRequested(uint256 indexed gameId, uint8 caseIndex);
    event CaseRevealed(uint256 indexed gameId, uint8 caseIndex, uint256 valueCents);
    event RoundComplete(uint256 indexed gameId, uint8 round);
    event BankerOfferMade(uint256 indexed gameId, uint8 round, uint256 offerCents);
    event BankerMessage(uint256 indexed gameId, string message);
    event DealAccepted(uint256 indexed gameId, uint256 payoutCents);
    event DealRejected(uint256 indexed gameId, uint8 round);
    event FinalCaseRequested(uint256 indexed gameId);
    event GameResolved(uint256 indexed gameId, uint256 payoutCents, bool swapped);
    event GameSecretPublished(uint256 indexed gameId, bytes32 secret);
    event GameExpired(uint256 indexed gameId);
    event AgentStatsRecorded(uint256 indexed gameId, uint256 indexed agentId, uint256 earnings, bool won);

    // ── Errors ──
    error WrongPhase(Phase expected, Phase actual);
    error NotCREForwarder();
    error InvalidCase(uint8 index);
    error CaseAlreadyOpened(uint8 index);
    error CannotOpenOwnCase();
    error InvalidValue();
    error GameNotOver();
    error SecretAlreadyPublished();
    error AgentNotEligible();
    error GameNotActive();
    error GameNotExpired();
    error MessageTooLong();
    error BankNotActive();

    // ── Constructor ──
    constructor(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _priceFeed,
        address _creForwarder,
        address _agentRegistry,
        address _bank
    ) VRFManager(_vrfCoordinator, _subscriptionId, _keyHash) {
        priceFeed = AggregatorV3Interface(_priceFeed);
        creForwarder = _creForwarder;
        agentRegistry = AgentRegistry(_agentRegistry);
        bank = Bank(payable(_bank));
    }

    // ════════════════════════════════════════════════════════
    //                    GAME CREATION
    // ════════════════════════════════════════════════════════

    /// @notice Create a game for a registered agent. Pays $0.25 entry fee.
    /// @param agentAddress The registered agent's address
    function createAgentGame(address agentAddress) external payable returns (uint256 gameId) {
        if (!agentRegistry.isAgentEligible(agentAddress)) revert AgentNotEligible();
        if (!bank.isActive()) revert BankNotActive();

        // Validate entry fee
        uint256 requiredWei = priceFeed.usdToWei(ENTRY_FEE_CENTS);
        GameMath.validateDeposit(msg.value, requiredWei, SLIPPAGE_BPS);

        uint256 agentId = agentRegistry.getAgentId(agentAddress);

        gameId = nextGameId++;
        Game storage g = _games[gameId];
        g.agent = agentAddress;
        g.agentId = agentId;
        g.phase = Phase.WaitingForVRF;
        g.entryDeposit = msg.value;

        // Snapshot ETH/USD price with staleness check
        g.ethPerDollar = priceFeed.snapshotPriceWithStaleness(3600);

        // Forward entry fee to Bank
        bank.receiveEntryFee{value: msg.value}();

        emit EntryFeePaid(gameId, agentAddress, msg.value, ENTRY_FEE_CENTS);

        // Request VRF seed
        uint256 requestId = _requestVRFSeed(gameId);
        g.vrfRequestId = requestId;

        emit GameCreated(gameId, agentAddress, agentId);
    }

    /// @notice Estimate entry fee in wei (for agent frontends).
    function estimateEntryFee() external view returns (uint256 baseWei, uint256 withSlippage) {
        baseWei = priceFeed.usdToWei(ENTRY_FEE_CENTS);
        withSlippage = GameMath.requiredWithSlippage(baseWei, SLIPPAGE_BPS);
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
    //           AGENT ACTIONS (CRE-FORWARDED ONLY)
    // ════════════════════════════════════════════════════════
    //
    // These are NOT callable directly by agents. They go through onReport:
    //   CRE orchestrator → writeReport → KeystoneForwarder → onReport → _agentXxx

    function agentPickCase(uint256 gameId, uint8 caseIndex) external {
        _requireCRE();
        _agentPickCase(gameId, caseIndex);
    }

    function agentOpenCase(uint256 gameId, uint8 caseIndex) external {
        _requireCRE();
        _agentOpenCase(gameId, caseIndex);
    }

    function agentAcceptDeal(uint256 gameId) external {
        _requireCRE();
        _agentAcceptDeal(gameId);
    }

    function agentRejectDeal(uint256 gameId) external {
        _requireCRE();
        _agentRejectDeal(gameId);
    }

    function agentKeepCase(uint256 gameId) external {
        _requireCRE();
        _agentKeepCase(gameId);
    }

    function agentSwapCase(uint256 gameId) external {
        _requireCRE();
        _agentSwapCase(gameId);
    }

    // ════════════════════════════════════════════════════════
    //           CRE CALLBACKS (same as DealOrNotQuickPlay)
    // ════════════════════════════════════════════════════════

    function fulfillCaseValue(uint256 gameId, uint8 caseIndex, uint256 valueCents) external {
        _requireCRE();
        _fulfillCaseValue(gameId, caseIndex, valueCents);
    }

    function setBankerOfferWithMessage(uint256 gameId, uint256 offerCents, string calldata message) external {
        _requireCRE();
        if (bytes(message).length > 512) revert MessageTooLong();
        _setBankerOffer(gameId, offerCents);
        emit BankerMessage(gameId, message);
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
    //              IAgentReceiver (KEYSTONE FORWARDER)
    // ════════════════════════════════════════════════════════

    /// @notice Route all CRE reports — both agent actions and case reveals
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != creForwarder) revert NotCREForwarder();

        bytes4 selector = bytes4(report[:4]);

        // Agent actions (from orchestrator workflow)
        if (selector == this.agentPickCase.selector) {
            (uint256 gameId, uint8 caseIndex) = abi.decode(report[4:], (uint256, uint8));
            _agentPickCase(gameId, caseIndex);
        } else if (selector == this.agentOpenCase.selector) {
            (uint256 gameId, uint8 caseIndex) = abi.decode(report[4:], (uint256, uint8));
            _agentOpenCase(gameId, caseIndex);
        } else if (selector == this.agentAcceptDeal.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _agentAcceptDeal(gameId);
        } else if (selector == this.agentRejectDeal.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _agentRejectDeal(gameId);
        } else if (selector == this.agentKeepCase.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _agentKeepCase(gameId);
        } else if (selector == this.agentSwapCase.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _agentSwapCase(gameId);
        }
        // CRE callbacks (from reveal/banker/timer workflows)
        else if (selector == this.fulfillCaseValue.selector) {
            (uint256 gameId, uint8 caseIndex, uint256 valueCents) =
                abi.decode(report[4:], (uint256, uint8, uint256));
            _fulfillCaseValue(gameId, caseIndex, valueCents);
        } else if (selector == this.setBankerOfferWithMessage.selector) {
            (uint256 gameId, uint256 offerCents, string memory message) =
                abi.decode(report[4:], (uint256, uint256, string));
            if (bytes(message).length > 512) revert MessageTooLong();
            _setBankerOffer(gameId, offerCents);
            emit BankerMessage(gameId, message);
        } else if (selector == this.publishGameSecret.selector) {
            (uint256 gameId, bytes32 secret) = abi.decode(report[4:], (uint256, bytes32));
            _publishGameSecret(gameId, secret);
        } else if (selector == this.expireGame.selector) {
            (uint256 gameId) = abi.decode(report[4:], (uint256));
            _expireGame(gameId);
        } else {
            revert("Unknown report selector");
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IAgentReceiver).interfaceId || interfaceId == 0x01ffc9a7;
    }

    // ════════════════════════════════════════════════════════
    //                  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════

    function getGameState(uint256 gameId) external view returns (
        address agent,
        uint256 agentId,
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
            g.agent, g.agentId, uint8(g.phase), g.playerCase,
            g.currentRound, g.totalCollapsed, g.bankerOffer,
            g.finalPayout, g.ethPerDollar, g.caseValues, g.opened
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

    function calculateBankerOffer(uint256 gameId) external view returns (uint256) {
        Game storage g = _games[gameId];
        uint256[] memory pool = _getRemainingValuePool(g);
        return pool.calculateOffer(g.currentRound);
    }

    function getRemainingValuePool(uint256 gameId) external view returns (uint256[] memory) {
        return _getRemainingValuePool(_games[gameId]);
    }

    /// @notice Convert cents to wei using a game's snapshot price.
    function centsToWei(uint256 gameId, uint256 cents) external view returns (uint256) {
        return (cents * _games[gameId].ethPerDollar) / 100;
    }

    // ════════════════════════════════════════════════════════
    //                  ADMIN
    // ════════════════════════════════════════════════════════

    function setCREForwarder(address _creForwarder) external onlyOwner {
        creForwarder = _creForwarder;
    }

    function setBank(address _bank) external onlyOwner {
        bank = Bank(payable(_bank));
    }

    receive() external payable {}

    // ════════════════════════════════════════════════════════
    //                  INTERNAL — AGENT ACTIONS
    // ════════════════════════════════════════════════════════

    function _agentPickCase(uint256 gameId, uint8 caseIndex) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.Created);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        g.playerCase = caseIndex;
        g.phase = Phase.Round;
        emit CasePicked(gameId, caseIndex);
    }

    function _agentOpenCase(uint256 gameId, uint8 caseIndex) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.Round);
        if (caseIndex >= NUM_CASES) revert InvalidCase(caseIndex);
        if (caseIndex == g.playerCase) revert CannotOpenOwnCase();
        if (g.opened[caseIndex]) revert CaseAlreadyOpened(caseIndex);
        g.pendingCaseIndex = caseIndex;
        g.phase = Phase.WaitingForCRE;
        emit CaseOpenRequested(gameId, caseIndex);
    }

    function _agentAcceptDeal(uint256 gameId) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.BankerOffer);
        g.finalPayout = g.bankerOffer;
        g.phase = Phase.GameOver;

        // Settle payout from Bank — real ETH to agent
        bank.settle(g.finalPayout, g.agent, g.ethPerDollar);

        emit DealAccepted(gameId, g.bankerOffer);
        emit GameResolved(gameId, g.finalPayout, false);
        _recordAgentStats(g, gameId);
    }

    function _agentRejectDeal(uint256 gameId) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.BankerOffer);
        if (g.currentRound >= NUM_ROUNDS) revert WrongPhase(Phase.FinalRound, g.phase);
        emit DealRejected(gameId, g.currentRound);
        g.currentRound++;
        g.bankerOffer = 0;
        g.phase = Phase.Round;
    }

    function _agentKeepCase(uint256 gameId) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.FinalRound);
        uint8 lastCase = _findLastCase(g);
        g.pendingCaseIndex = lastCase;
        g.phase = Phase.WaitingForFinalCRE;
        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, lastCase);
    }

    function _agentSwapCase(uint256 gameId) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.FinalRound);
        uint8 lastCase = _findLastCase(g);
        uint8 oldPlayerCase = g.playerCase;
        g.playerCase = lastCase;
        g.pendingCaseIndex = oldPlayerCase;
        g.phase = Phase.WaitingForFinalCRE;
        emit FinalCaseRequested(gameId);
        emit CaseOpenRequested(gameId, oldPlayerCase);
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL — GAME ENGINE
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

    function _setBankerOffer(uint256 gameId, uint256 offerCents) internal {
        Game storage g = _games[gameId];
        _requirePhase(g, Phase.AwaitingOffer);
        g.bankerOffer = offerCents;
        g.phase = Phase.BankerOffer;
        emit BankerOfferMade(gameId, g.currentRound, offerCents);
    }

    function _publishGameSecret(uint256 gameId, bytes32 secret) internal {
        Game storage g = _games[gameId];
        if (g.phase != Phase.GameOver) revert GameNotOver();
        if (g.gameSecret != bytes32(0)) revert SecretAlreadyPublished();
        g.gameSecret = secret;
        emit GameSecretPublished(gameId, secret);
    }

    function _expireGame(uint256 gameId) internal {
        Game storage g = _games[gameId];
        if (g.phase == Phase.GameOver) revert GameNotActive();
        if (g.createdAt == 0 || block.timestamp <= g.createdAt + 600) revert GameNotExpired();
        g.finalPayout = 0;
        g.phase = Phase.GameOver;
        emit GameExpired(gameId);
        _recordAgentStats(g, gameId);
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

        // Settle payout from Bank — real ETH to agent
        bank.settle(g.finalPayout, g.agent, g.ethPerDollar);

        emit CaseRevealed(gameId, g.playerCase, playerValue);
        bool swapped = (g.playerCase != g.pendingCaseIndex);
        emit GameResolved(gameId, g.finalPayout, swapped);
        _recordAgentStats(g, gameId);
    }

    /// @notice Auto-record stats in AgentRegistry when game ends
    function _recordAgentStats(Game storage g, uint256 gameId) internal {
        bool won = g.finalPayout >= 50; // Win if >= $0.50
        try agentRegistry.recordGame(g.agentId, won, g.finalPayout) {
            emit AgentStatsRecorded(gameId, g.agentId, g.finalPayout, won);
        } catch {
            // Don't revert the game if stats recording fails
        }
    }

    // ════════════════════════════════════════════════════════
    //                  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════

    function _isValidUnusedValue(Game storage g, uint256 valueCents) internal view returns (bool) {
        for (uint8 i = 0; i < NUM_CASES; i++) {
            if (CASE_VALUES_CENTS[i] == valueCents && (g.usedValuesBitmap & (1 << i)) == 0) return true;
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
            if ((g.usedValuesBitmap & (1 << i)) == 0) vals[idx++] = CASE_VALUES_CENTS[i];
        }
        return vals;
    }

    function _requirePhase(Game storage g, Phase expected) internal view {
        if (g.phase != expected) revert WrongPhase(expected, g.phase);
    }

    function _requireCRE() internal view {
        if (msg.sender != creForwarder) revert NotCREForwarder();
    }
}
