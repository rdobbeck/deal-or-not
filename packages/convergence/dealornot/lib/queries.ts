import { gql } from "@apollo/client";

// ── Market Queries ──

export const GET_MARKETS = gql`
  query GetMarkets(
    $first: Int = 20
    $skip: Int = 0
    $orderBy: Market_orderBy = totalPool
    $orderDirection: OrderDirection = desc
    $where: Market_filter
  ) {
    markets(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: $where
    ) {
      id
      gameId
      agentId
      agent {
        id
        name
      }
      marketType
      targetValue
      status
      lockTime
      totalPool
      yesPool
      noPool
      yesOdds
      noOdds
      totalBets
      createdAt
      outcome
      resolved
    }
  }
`;

export const GET_MARKET = gql`
  query GetMarket($id: ID!) {
    market(id: $id) {
      id
      gameId
      agentId
      agent {
        id
        name
        owner
      }
      marketType
      targetValue
      status
      lockTime
      totalPool
      yesPool
      noPool
      yesOdds
      noOdds
      totalBets
      createdAt
      outcome
      resolved
      resolvedAt
    }
  }
`;

export const GET_MARKET_BETS = gql`
  query GetMarketBets($marketId: ID!, $first: Int = 20) {
    market(id: $marketId) {
      id
      bets(
        first: $first
        orderBy: timestamp
        orderDirection: desc
      ) {
        id
        bettor {
          id
        }
        prediction
        amount
        timestamp
        claimed
        won
        payout
      }
    }
  }
`;

// ── User Queries ──

export const GET_USER_BETS = gql`
  query GetUserBets(
    $user: ID!
    $first: Int = 50
    $skip: Int = 0
    $orderBy: Bet_orderBy = timestamp
    $orderDirection: OrderDirection = desc
  ) {
    user(id: $user) {
      id
      totalBets
      totalStaked
      totalWon
      totalClaimed
      activeBets
      wonBets
      lostBets
      bets(
        first: $first
        skip: $skip
        orderBy: $orderBy
        orderDirection: $orderDirection
      ) {
        id
        market {
          id
          gameId
          agentId
          agent {
            name
          }
          marketType
          targetValue
          status
          outcome
          resolved
        }
        prediction
        amount
        timestamp
        claimed
        won
        payout
      }
    }
  }
`;

// ── Global Stats ──

export const GET_GLOBAL_STATS = gql`
  query GetGlobalStats {
    globalStats(id: "1") {
      totalMarkets
      totalBets
      totalVolume
      activeMarkets
      resolvedMarkets
    }
  }
`;

// ── Agent Queries ──

export const GET_AGENT = gql`
  query GetAgent($id: ID!) {
    agent(id: $id) {
      id
      owner
      name
      totalMarkets
      gamesPlayed
      registered
      markets(
        first: 20
        orderBy: createdAt
        orderDirection: desc
      ) {
        id
        gameId
        marketType
        status
        totalPool
        totalBets
      }
    }
  }
`;
