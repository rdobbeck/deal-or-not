export enum Phase {
  WaitingForVRF = 0,
  Created = 1,
  Round = 2,
  WaitingForCRE = 3,
  AwaitingOffer = 4,
  BankerOffer = 5,
  FinalRound = 6,
  WaitingForFinalCRE = 7,
  GameOver = 8,
}

export const PHASE_NAMES: Record<Phase, string> = {
  [Phase.WaitingForVRF]: "Quantum Seed Incoming...",
  [Phase.Created]: "Pick Your Case",
  [Phase.Round]: "Choose a Case to Open",
  [Phase.WaitingForCRE]: "CRE Computing Value...",
  [Phase.AwaitingOffer]: "Ring the Banker",
  [Phase.BankerOffer]: "The Banker Is Calling...",
  [Phase.FinalRound]: "Final Decision",
  [Phase.WaitingForFinalCRE]: "CRE Revealing Final Case...",
  [Phase.GameOver]: "Game Over",
};

export interface GameState {
  host: string;
  player: string;
  mode: number;
  phase: Phase;
  playerCase: number;
  currentRound: number;
  totalCollapsed: number;
  bankerOffer: bigint;
  finalPayout: bigint;
  ethPerDollar: bigint;
  caseValues: readonly bigint[];
  opened: readonly boolean[];
}

export interface SponsorAd {
  text: string;
  tagline: string;
  url: string;
  bg: string;
  logo?: string;
}

export const NUM_CASES = 5;
export const NUM_ROUNDS = 4;
export const CASE_VALUES_CENTS = [1, 5, 10, 50, 100] as const;
export const CASE_VALUES_USD = ["$0.01", "$0.05", "$0.10", "$0.50", "$1.00"] as const;
