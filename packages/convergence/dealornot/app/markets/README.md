# Prediction Markets Frontend

## Status: Mock Data Implementation ✅

The prediction market UI is complete with mock data. Once contracts are deployed, follow these steps to wire up to the `PredictionMarket.sol` contract.

## Files Created

1. **`/app/markets/page.tsx`** - Market listing page with filters and stats
2. **`/app/markets/[marketId]/page.tsx`** - Market detail page with betting interface
3. **`/app/markets/my-bets/page.tsx`** - User's bets and claim payouts page
4. **`/components/Nav.tsx`** - Updated to include "Markets" link

## Contract Integration TODOs

### 1. Add Contract ABI and Address

Once `PredictionMarket.sol` is deployed:

```typescript
// contracts/predictionMarket.ts
export const PREDICTION_MARKET_ADDRESS = "0x..."; // Deployed address
export const PREDICTION_MARKET_ABI = [...]; // Copy from artifacts
```

### 2. Replace Mock Data with Contract Reads

#### Markets Listing (`/app/markets/page.tsx`)

Replace line 62-110 with:

```typescript
// Read total markets
const { data: nextMarketId } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "nextMarketId",
});

// For each market ID (1 to nextMarketId-1), fetch market data
const { data: market } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getMarket",
  args: [marketId],
});

// Fetch market stats
const { data: stats } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getMarketStats",
  args: [marketId],
});
```

#### Market Detail Page (`/app/markets/[marketId]/page.tsx`)

Replace mock data with:

```typescript
// Market data
const { data: market } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getMarket",
  args: [BigInt(marketId)],
});

// Recent bets
const { data: marketBetIds } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "marketBets",
  args: [BigInt(marketId)],
});

// For each betId, fetch bet details
const { data: bet } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getBet",
  args: [betId],
});
```

#### Place Bet Action

Replace line 153 mock transaction with:

```typescript
const { writeContractAsync } = useWriteContract();

const handlePlaceBet = async () => {
  try {
    const hash = await writeContractAsync({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "placeBet",
      args: [BigInt(marketId), selectedPrediction],
      value: parseEther(betAmount),
    });

    // Wait for confirmation
    await waitForTransactionReceipt({ hash });

    alert("Bet placed successfully!");
  } catch (error) {
    console.error("Bet failed:", error);
  }
};
```

#### My Bets Page (`/app/markets/my-bets/page.tsx`)

Replace mock data with:

```typescript
const { address } = useAccount();

// Get user's bet IDs
const { data: userBetIds } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getUserBets",
  args: [address],
});

// For each betId, fetch bet details and check if claimable
const { data: bet } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "getBet",
  args: [betId],
});

const { data: canClaim } = useReadContract({
  address: PREDICTION_MARKET_ADDRESS,
  abi: PREDICTION_MARKET_ABI,
  functionName: "canClaimBet",
  args: [betId],
});
```

#### Claim Payout Action

Replace line 93 mock transaction with:

```typescript
const handleClaimPayout = async (betId: number) => {
  try {
    const hash = await writeContractAsync({
      address: PREDICTION_MARKET_ADDRESS,
      abi: PREDICTION_MARKET_ABI,
      functionName: "claimPayout",
      args: [BigInt(betId)],
    });

    await waitForTransactionReceipt({ hash });

    alert("Payout claimed!");
  } catch (error) {
    console.error("Claim failed:", error);
  }
};
```

## Contract Functions Reference

From `PredictionMarket.sol`:

### Read Functions
- `getMarket(uint256 marketId)` → Market struct
- `getMarketStats(uint256 marketId)` → (totalBets, totalPool, yesPool, noPool, yesOdds, noOdds)
- `getMarketOdds(uint256 marketId)` → (yesOdds, noOdds)
- `getBet(uint256 betId)` → Bet struct
- `getUserBets(address user)` → uint256[] betIds
- `getGameMarkets(uint256 gameId)` → uint256[] marketIds
- `canClaimBet(uint256 betId)` → bool
- `calculatePotentialPayout(uint256 marketId, bool prediction, uint256 betAmount)` → uint256

### Write Functions
- `placeBet(uint256 marketId, bool prediction)` payable → betId
- `claimPayout(uint256 betId)` → transfers payout

### Admin Functions (for authorized resolvers)
- `createMarket(uint256 gameId, uint256 agentId, MarketType marketType, uint256 targetValue, uint256 lockTime)` → marketId
- `lockMarket(uint256 marketId)` - lock betting
- `resolveMarket(uint256 marketId, bool outcome)` - resolve with outcome
- `cancelMarket(uint256 marketId)` - cancel (enables refunds)

## Market Types (Enum)
```solidity
enum MarketType {
    WillWin = 0,           // Will agent win anything?
    EarningsOver = 1,      // Will earnings exceed target?
    WillAcceptOffer = 2,   // Will agent accept banker's offer?
    RoundPrediction = 3    // Which round will agent finish in?
}
```

## Market Status (Enum)
```solidity
enum MarketStatus {
    Open = 0,      // Accepting bets
    Locked = 1,    // No new bets, game in progress
    Resolved = 2,  // Outcome determined, payouts claimable
    Cancelled = 3  // Cancelled, refunds available
}
```

## Testing Checklist

- [ ] Deploy PredictionMarket.sol to Base Sepolia
- [ ] Add contract address and ABI to frontend
- [ ] Test market listing loads correctly
- [ ] Test placing bets (YES and NO)
- [ ] Test odds update after bet placement
- [ ] Test market detail page with real data
- [ ] Test "My Bets" page shows user's bets
- [ ] Test claim payout for winning bets
- [ ] Test error handling (insufficient funds, market locked, etc.)
- [ ] Test mobile responsive layout

## Notes

- Platform fee: 2% on total pool
- Minimum bet: 0.001 ETH (MIN_BET constant)
- Parimutuel betting model: winners split the pool proportionally
- Odds change dynamically as bets are placed
- Markets lock before game starts (LOCK_BEFORE_GAME_START = 5 minutes)

## Future Enhancements

1. **Live Updates**: Use `useWatchContractEvent` to listen for `BetPlaced` events and update odds in real-time
2. **Market Creation UI**: Add admin interface to create markets for upcoming games
3. **Analytics**: Add charts showing odds history over time
4. **Notifications**: Toast notifications for successful bets and claimable payouts
5. **Market Search**: Add search and filtering by agent, game ID, or market type
6. **Bet History Export**: Allow users to export their bet history as CSV
7. **Social Features**: Share markets and bets on social media
