// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PredictionMarket
/// @notice Prediction market for Deal or NOT game outcomes
/// @dev Contributes to Prediction Markets track ($16K+ prizes)
///      Users bet on:
///      - Will agent win?
///      - Will agent earn > X cents?
///      - Will agent accept banker offer?
///      - What round will agent finish in?
contract PredictionMarket {
    // ── Events ──
    event MarketCreated(
        uint256 indexed marketId,
        uint256 indexed gameId,
        MarketType marketType,
        uint256 targetValue
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool prediction,
        uint256 amount,
        uint256 betId
    );
    event MarketResolved(
        uint256 indexed marketId,
        bool outcome,
        uint256 totalPool,
        uint256 winningPool
    );
    event PayoutClaimed(
        uint256 indexed marketId,
        address indexed winner,
        uint256 amount
    );

    // ── Enums ──
    enum MarketType {
        WillWin,              // Will agent win anything?
        EarningsOver,         // Will earnings exceed target?
        WillAcceptOffer,      // Will agent accept banker's offer?
        RoundPrediction       // Which round will agent finish in?
    }

    enum MarketStatus {
        Open,
        Locked,
        Resolved,
        Cancelled
    }

    // ── Structs ──
    struct Market {
        uint256 gameId;
        uint256 agentId;
        MarketType marketType;
        uint256 targetValue;      // For EarningsOver or RoundPrediction
        MarketStatus status;
        bool outcome;             // Resolved outcome
        uint256 createdAt;
        uint256 lockTime;         // When betting closes
        uint256 totalPool;
        uint256 yesPool;
        uint256 noPool;
    }

    struct Bet {
        address bettor;
        uint256 marketId;
        bool prediction;          // true = YES, false = NO
        uint256 amount;
        bool claimed;
    }

    // ── Constants ──
    uint256 public constant PLATFORM_FEE = 200;  // 2% fee (basis points)
    uint256 public constant MIN_BET = 0.001 ether;
    uint256 public constant LOCK_BEFORE_GAME_START = 5 minutes;

    // ── State ──
    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet) public bets;
    mapping(uint256 => uint256[]) public marketBets;   // marketId => betIds
    mapping(address => uint256[]) public userBets;     // user => betIds
    mapping(uint256 => uint256[]) public gameMarkets;  // gameId => marketIds

    uint256 public nextMarketId;
    uint256 public nextBetId;
    uint256 public totalVolume;
    uint256 public totalFeesCollected;

    address public admin;
    mapping(address => bool) public authorizedResolvers;  // Can resolve markets

    // ── Errors ──
    error MarketNotOpen();
    error MarketLocked();
    error MarketNotResolved();
    error BetTooSmall();
    error BetAlreadyClaimed();
    error NotWinner();
    error Unauthorized();
    error InvalidMarket();
    error ZeroAmount();

    // ── Modifiers ──
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier onlyAuthorized() {
        if (!authorizedResolvers[msg.sender] && msg.sender != admin) revert Unauthorized();
        _;
    }

    // ── Constructor ──
    constructor() {
        admin = msg.sender;
        nextMarketId = 1;
        nextBetId = 1;
    }

    // ── Market Creation ──

    /// @notice Create a prediction market for a game
    /// @param gameId Deal or NOT game ID
    /// @param agentId Agent playing the game
    /// @param marketType Type of prediction
    /// @param targetValue Target value for certain market types
    /// @param lockTime When betting closes (usually game start time)
    function createMarket(
        uint256 gameId,
        uint256 agentId,
        MarketType marketType,
        uint256 targetValue,
        uint256 lockTime
    ) external onlyAuthorized returns (uint256 marketId) {
        marketId = nextMarketId++;

        markets[marketId] = Market({
            gameId: gameId,
            agentId: agentId,
            marketType: marketType,
            targetValue: targetValue,
            status: MarketStatus.Open,
            outcome: false,
            createdAt: block.timestamp,
            lockTime: lockTime,
            totalPool: 0,
            yesPool: 0,
            noPool: 0
        });

        gameMarkets[gameId].push(marketId);

        emit MarketCreated(marketId, gameId, marketType, targetValue);
    }

    // ── Betting ──

    /// @notice Place a bet on a market
    /// @param marketId Market to bet on
    /// @param prediction true = YES, false = NO
    function placeBet(uint256 marketId, bool prediction) external payable returns (uint256 betId) {
        if (msg.value < MIN_BET) revert BetTooSmall();

        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.lockTime) revert MarketLocked();

        betId = nextBetId++;

        bets[betId] = Bet({
            bettor: msg.sender,
            marketId: marketId,
            prediction: prediction,
            amount: msg.value,
            claimed: false
        });

        marketBets[marketId].push(betId);
        userBets[msg.sender].push(betId);

        // Update pools
        market.totalPool += msg.value;
        if (prediction) {
            market.yesPool += msg.value;
        } else {
            market.noPool += msg.value;
        }

        totalVolume += msg.value;

        emit BetPlaced(marketId, msg.sender, prediction, msg.value, betId);
    }

    // ── Market Resolution ──

    /// @notice Lock market (prevent new bets)
    function lockMarket(uint256 marketId) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert InvalidMarket();
        market.status = MarketStatus.Locked;
    }

    /// @notice Resolve market with outcome
    /// @param marketId Market to resolve
    /// @param outcome true = YES wins, false = NO wins
    function resolveMarket(uint256 marketId, bool outcome) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Locked && market.status != MarketStatus.Open) {
            revert InvalidMarket();
        }

        market.status = MarketStatus.Resolved;
        market.outcome = outcome;
        // resolved is now derived from status == Resolved

        // Track collected fees for safe withdrawal
        uint256 fee = (market.totalPool * PLATFORM_FEE) / 10000;
        totalFeesCollected += fee;

        uint256 winningPool = outcome ? market.yesPool : market.noPool;

        emit MarketResolved(marketId, outcome, market.totalPool, winningPool);
    }

    /// @notice Cancel market and enable refunds
    function cancelMarket(uint256 marketId) external onlyAuthorized {
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.Resolved) revert InvalidMarket();
        market.status = MarketStatus.Cancelled;
    }

    // ── Payout ──

    /// @notice Claim winnings for a bet
    /// @param betId Bet ID to claim
    function claimPayout(uint256 betId) external {
        Bet storage bet = bets[betId];
        if (bet.claimed) revert BetAlreadyClaimed();
        if (bet.bettor != msg.sender) revert Unauthorized();

        Market storage market = markets[bet.marketId];

        // Handle cancelled market (refund)
        if (market.status == MarketStatus.Cancelled) {
            bet.claimed = true;
            (bool ok, ) = payable(msg.sender).call{value: bet.amount}("");
            require(ok, "Refund failed");
            emit PayoutClaimed(bet.marketId, msg.sender, bet.amount);
            return;
        }

        // Check if market resolved
        if (market.status != MarketStatus.Resolved) revert MarketNotResolved();

        // Check if bet won
        if (bet.prediction != market.outcome) revert NotWinner();

        // Calculate payout
        uint256 payout = _calculatePayout(betId);
        if (payout == 0) revert ZeroAmount();

        bet.claimed = true;

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Payout failed");

        emit PayoutClaimed(bet.marketId, msg.sender, payout);
    }

    // ── Internal Functions ──

    /// @notice Calculate payout for a winning bet
    function _calculatePayout(uint256 betId) internal view returns (uint256) {
        Bet storage b = bets[betId];
        Market storage m = markets[b.marketId];

        if (b.prediction != m.outcome) return 0;

        uint256 winPool = m.outcome ? m.yesPool : m.noPool;
        if (winPool == 0) return 0;

        uint256 payoutPool = m.totalPool - (m.totalPool * PLATFORM_FEE) / 10000;
        return (b.amount * payoutPool) / winPool;
    }

    // ── View Functions ──

    /// @notice Get market core info
    function getMarketCore(uint256 marketId) external view returns (
        uint256 gameId, uint256 agentId, MarketType mType, MarketStatus status, bool outcome
    ) {
        Market storage m = markets[marketId];
        return (m.gameId, m.agentId, m.marketType, m.status, m.outcome);
    }

    /// @notice Get market pool info
    function getMarketPools(uint256 marketId) external view returns (
        uint256 totalPool, uint256 yesPool, uint256 noPool, uint256 lockTime
    ) {
        Market storage m = markets[marketId];
        return (m.totalPool, m.yesPool, m.noPool, m.lockTime);
    }

    /// @notice Get bet details
    function getBet(uint256 betId) external view returns (Bet memory) {
        return bets[betId];
    }

    /// @notice Get all markets for a game
    function getGameMarkets(uint256 gameId) external view returns (uint256[] memory) {
        return gameMarkets[gameId];
    }

    /// @notice Get all bets for a user
    function getUserBets(address user) external view returns (uint256[] memory) {
        return userBets[user];
    }

    /// @notice Get market odds (implied probability)
    function getMarketOdds(uint256 marketId) external view returns (
        uint256 yesOdds,
        uint256 noOdds
    ) {
        Market storage m = markets[marketId];
        (yesOdds, noOdds) = _odds(m.yesPool, m.noPool, m.totalPool);
    }

    /// @notice Calculate potential payout for a bet amount
    function calculatePotentialPayout(
        uint256 marketId,
        bool prediction,
        uint256 betAmount
    ) external view returns (uint256) {
        Market storage m = markets[marketId];

        uint256 newTotal = m.totalPool + betAmount;
        uint256 newWin = prediction ? m.yesPool + betAmount : m.noPool + betAmount;
        uint256 payoutPool = newTotal - (newTotal * PLATFORM_FEE) / 10000;
        return (betAmount * payoutPool) / newWin;
    }

    /// @notice Check if bet can be claimed
    function canClaimBet(uint256 betId) external view returns (bool) {
        Bet storage b = bets[betId];
        Market storage m = markets[b.marketId];

        if (b.claimed) return false;
        if (m.status == MarketStatus.Cancelled) return true;
        if (m.status != MarketStatus.Resolved) return false;
        if (b.prediction != m.outcome) return false;

        return true;
    }

    /// @notice Get market stats (use getMarket + getMarketOdds for individual fields)
    function getMarketStats(uint256 marketId) external view returns (
        uint256 totalBets,
        uint256 totalPool,
        uint256 yesOdds,
        uint256 noOdds
    ) {
        Market storage m = markets[marketId];
        totalBets = marketBets[marketId].length;
        totalPool = m.totalPool;
        (yesOdds, noOdds) = _odds(m.yesPool, m.noPool, m.totalPool);
    }

    function _odds(uint256 yP, uint256 nP, uint256 tP) internal pure returns (uint256 y, uint256 n) {
        if (tP > 0) {
            y = (yP * 10000) / tP;
            n = (nP * 10000) / tP;
        } else {
            y = 5000;
            n = 5000;
        }
    }

    // ── Admin Functions ──

    /// @notice Authorize a resolver
    function authorizeResolver(address resolver) external onlyAdmin {
        authorizedResolvers[resolver] = true;
    }

    /// @notice Revoke resolver authorization
    function revokeResolver(address resolver) external onlyAdmin {
        authorizedResolvers[resolver] = false;
    }

    /// @notice Withdraw collected platform fees only
    function withdrawFees() external onlyAdmin {
        if (totalFeesCollected == 0) revert ZeroAmount();
        uint256 fees = totalFeesCollected;
        totalFeesCollected = 0;
        (bool success, ) = payable(admin).call{value: fees}("");
        require(success, "Withdrawal failed");
    }

    // ── Receive ETH ──
    receive() external payable {}
}
