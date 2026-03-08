"use client";

import { useRef } from "react";
import Link from "next/link";
import GameBoard from "@/components/game/GameBoard";
import BestOfBanker from "@/components/BestOfBanker";
import { GlassCard, GlassButton } from "@/components/glass";
import { useAllAgents } from "@/hooks/useAgents";
import { useMockDataToggle } from "@/contexts/MockDataContext";

const INFRA_CARDS = [
  {
    video: "/chainlink/money-sized.mp4",
    label: "CHAINLINK PRICE FEEDS",
    copy: "Real-time ETH/USD oracle on Base Sepolia so the Banker can lowball you with mathematical precision. Every offer is denominated in cents, converted to wei at settlement.",
    closer: "The only honest thing in this entire operation.",
    number: "00",
  },
  {
    video: "/chainlink/blockchain-sized.mp4",
    label: "VRF: QUANTUM DICE",
    copy: "Chainlink VRF generates a verifiable random seed on-chain when you create a game. That seed determines your case values — nobody can predict or rig them.",
    closer: "Fancy dice that can't be loaded.",
    number: "01",
  },
  {
    video: "/chainlink/launch-sized.mp4",
    label: "CCIP: CROSS-CHAIN PLAY",
    copy: "Start a game from ETH Sepolia via a Gateway contract — CCIP carries your move cross-chain to the Bridge on Base Sepolia. Two chains, one game show.",
    closer: "Because one chain wasn't extra enough.",
    number: "02",
  },
];

const CRE_CARDS = [
  {
    video: "/chainlink/shield-sized.mp4",
    label: "CONFIDENTIAL CASE REVEAL",
    copy: "Each case value is computed inside a CRE enclave using hash(vrfSeed, caseIndex, entropy). The entropy is fetched via Confidential HTTP from an external source — not even the CRE node knows the value until runtime.",
    closer: "A computer that keeps secrets better than your ex.",
    number: "01",
  },
  {
    video: "/chainlink/give-sized.mp4",
    label: "SPONSOR JACKPOT",
    copy: "A CRE workflow checks if you said 'No Deal' every round. Go all the way and a separate SponsorJackpot contract pays out real ETH deposited by sponsors.",
    closer: "Free money. Terms and conditions do NOT apply.",
    number: "02",
  },
  {
    video: "/chainlink/trophy-sized.mp4",
    label: "AI BANKER (GEMINI IN AN ENCLAVE)",
    copy: "A CRE workflow reads the game state, calculates an EV-based offer, then calls Gemini 2.5 Flash via Confidential HTTP to generate the Banker's personality. Two writeReports: one for the offer, one for the BestOfBanker gallery.",
    closer: "The AI uprising will be televised.",
    number: "03",
  },
];

const FALLBACK_AGENTS = [
  { name: "GreedyBot", strategy: "Never accepts. Ever.", winRate: "68%", personality: "Chaotic Neutral" },
  { name: "ConservativeAgent", strategy: "Takes the safe bet.", winRate: "72%", personality: "Lawful Boring" },
  { name: "RiskyRick", strategy: "ALL OR NOTHING", winRate: "54%", personality: "Unhinged" },
];

const AGENT_PERSONALITIES: Record<string, string> = {
  "GreedyBot": "Chaotic Neutral",
  "ConservativeAgent": "Lawful Boring",
  "RiskyRick": "Unhinged",
};

const AGENT_STRATEGIES: Record<string, string> = {
  "GreedyBot": "Never accepts. Ever.",
  "ConservativeAgent": "Takes the safe bet.",
  "RiskyRick": "ALL OR NOTHING",
};

const TICKER_ITEMS = [
  "PROTECTED BY $47 BILLION IN CRYPTOGRAPHIC INFRASTRUCTURE",
  "OVER $0.47 IN PRIZES AWARDED",
  "100% OF GAMES ARE PROVABLY FAIR",
  "0% OF PLAYERS READ THE SMART CONTRACT",
  "THE BANKER HAS NO FEELINGS",
  "YOUR CASES DON'T EXIST UNTIL YOU OPEN THEM",
  "POWERED BY MATH YOU'LL NEVER READ",
  "AS SEEN ON THE BLOCKCHAIN",
  "NOW WITH 500% MORE QUANTUM",
];

export default function Home() {
  const gameRef = useRef<HTMLDivElement>(null);
  const { agents } = useAllAgents();
  const { useMockData, toggleMockData } = useMockDataToggle();

  // Map hook agents to display format, fall back to hardcoded for empty
  const displayAgents = agents.length > 0
    ? agents.slice(0, 3).map(a => ({
        name: a.name,
        strategy: AGENT_STRATEGIES[a.name] || a.metadata || "Autonomous player",
        winRate: `${(a.winRate / 100).toFixed(0)}%`,
        personality: AGENT_PERSONALITIES[a.name] || "Unknown Alignment",
      }))
    : FALLBACK_AGENTS;

  const scrollToGame = () => {
    gameRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen overflow-hidden">
      {/* ══ TICKER TAPE ══ */}
      <div className="bg-gradient-to-r from-yellow-900/80 via-yellow-700/80 to-yellow-900/80 border-b border-yellow-600/30 py-1.5">
        <div className="ticker">
          <div className="ticker-inner">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
              <span key={i} className="text-yellow-200/80 text-xs font-bold tracking-wider mx-8 shrink-0">
                {item} <span className="text-yellow-500 mx-2">&#9670;</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section className="relative px-4 pt-16 pb-12 text-center spotlight halftone-bg">
        {/* "Are you ready?" */}
        <p className="text-yellow-500/60 text-sm uppercase tracking-[0.3em] mb-4 font-bold">
          Are you ready?
        </p>

        <h1 className="text-7xl md:text-9xl font-black tracking-tighter mb-2 leading-none">
          <span className="gold-text">DEAL</span>
          <span className="text-white/30 text-5xl md:text-7xl mx-2 md:mx-4 italic font-light">or</span>
          <span className="neon-gold font-black">NOT</span>
        </h1>

        <p className="text-white/20 text-xs mb-8 tracking-widest uppercase">
          A Blockchain Game Show &middot; Season 1 &middot; Base Sepolia
        </p>

        <div className="max-w-2xl mx-auto mb-8 space-y-3">
          <p className="text-xl md:text-2xl text-white/80 font-bold">
            5 Quantum Confidential Cases. 1 AI Banker. 0 Trust Required.
          </p>
          <p className="text-white/40 text-sm">
            Your cases don&apos;t exist until you open them.
            The Banker is an AI running inside a cryptographic enclave.
            The game is on a blockchain.{" "}
            <span
              className="text-white/20 italic border-b border-dotted border-white/20 cursor-help"
              title="Chainlink VRF (verifiable random seed) · CRE Confidential Compute (case reveals in a secure enclave) · Confidential HTTP (Gemini 2.5 Flash AI Banker running inside CRE) · Chainlink Price Feeds (real-time ETH/USD oracle) · CCIP (cross-chain messaging between ETH Sepolia and Base Sepolia) · SponsorJackpot (CRE cron workflow for real ETH payouts) · BestOfBanker (on-chain quote gallery) · MockKeystoneForwarder (testnet CRE simulation)"
            >
              We are not making this up.
            </span>
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
          <button
            onClick={scrollToGame}
            className="gold-pulse px-12 py-4 text-xl font-black uppercase tracking-wider rounded-xl
                       bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700
                       text-yellow-950 hover:from-yellow-300 hover:to-yellow-600
                       transition-all duration-300 hover:scale-105 active:scale-95
                       shadow-[0_0_30px_rgba(255,215,0,0.3)]"
          >
            Play Now
          </button>
          <GlassButton
            variant="strong"
            size="md"
            onClick={scrollToGame}
            className="border-yellow-500/20 text-yellow-200/80"
          >
            Watch the Blockchain Think
          </GlassButton>
        </div>

        {/* Fake social proof */}
        <div className="flex flex-wrap justify-center gap-6 text-white/20 text-xs uppercase tracking-wider">
          <span>&ldquo;what am I looking at&rdquo; — a judge, probably</span>
          <span className="text-yellow-700/40">&#9670;</span>
          <span>AS SEEN ON THE BLOCKCHAIN</span>
          <span className="text-yellow-700/40">&#9670;</span>
          <span>Convergence Hackathon 2026</span>
        </div>
      </section>

      {/* ══ THE BANKER (Host Section — like Howie Mandel on CNBC) ══ */}
      <section className="px-4 py-16 max-w-4xl mx-auto">
        <GlassCard className="p-0 overflow-hidden gold-glow">
          <div className="flex flex-col md:flex-row">
            <div className="md:w-1/3 bg-gradient-to-br from-[#00015E] to-purple-900 p-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-2">&#128373;</div>
                <p className="text-white/30 text-xs uppercase tracking-widest mb-4">Identity: Classified</p>
                <Link href="/best-of-banker">
                  <GlassButton variant="strong" size="sm" className="border-yellow-500/20 text-yellow-200/80">
                    Greatest Hits &rarr;
                  </GlassButton>
                </Link>
              </div>
            </div>
            <div className="md:w-2/3 p-8 md:p-10">
              <p className="text-yellow-500/60 text-xs uppercase tracking-widest mb-2">Host &amp; Adversary</p>
              <h2 className="text-4xl font-black mb-3 gold-text">THE BANKER</h2>
              <p className="text-white/60 mb-4 leading-relaxed">
                A Gemini 2.5 Flash model running inside a Chainlink CRE confidential enclave.
                It analyzes your remaining cases, calculates expected value, applies behavioral psychology,
                and makes you an offer designed to make you quit.
              </p>
              <p className="text-white/30 text-sm italic mb-6">
                It has no feelings. It has no mercy. It has a 200ms response time and access to real-time price feeds.
                The Banker sends his regards.
              </p>
              <div className="flex gap-4 text-center">
                <div className="flex-1">
                  <div className="text-2xl font-bold text-yellow-400">200ms</div>
                  <div className="text-xs text-white/30">Response Time</div>
                </div>
                <div className="flex-1">
                  <div className="text-2xl font-bold text-yellow-400">0</div>
                  <div className="text-xs text-white/30">Feelings</div>
                </div>
                <div className="flex-1">
                  <div className="text-2xl font-bold text-yellow-400">&infin;</div>
                  <div className="text-xs text-white/30">Patience</div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </section>

      {/* ══ MEET THE AI AGENTS (like "Briefcase Models") ══ */}
      <section className="px-4 py-12 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-2">Introducing Your Opponents</p>
          <h2 className="text-3xl md:text-4xl font-black uppercase tracking-wider">
            <span className="gold-text">Meet the AI Agents</span>
          </h2>
          <p className="text-white/30 text-sm mt-2">
            They play for keeps. They play for ETH. They play because they were programmed to.
          </p>
          <button
            onClick={toggleMockData}
            className="inline-flex items-center gap-2 mt-3 px-3 py-1 text-xs rounded-full border cursor-pointer transition-all hover:scale-105"
            style={{
              background: useMockData ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.2)",
              borderColor: useMockData ? "rgba(234,179,8,0.3)" : "rgba(34,197,94,0.3)",
              color: useMockData ? "#facc15" : "#22c55e",
            }}
          >
            <span className={`inline-block w-2 h-2 rounded-full ${useMockData ? "bg-yellow-400" : "bg-green-400"}`} />
            {useMockData ? "Mock Data" : "Live On-Chain"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {displayAgents.map((agent) => (
            <Link key={agent.name} href={`/agents`}>
              <GlassCard className="p-6 text-center hover:scale-[1.03] transition-transform cursor-pointer gold-glow group">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400/20 to-purple-500/20 border border-yellow-500/30 flex items-center justify-center">
                  <span className="text-3xl">&#129302;</span>
                </div>
                <h3 className="text-xl font-black text-white mb-1">{agent.name}</h3>
                <p className="text-yellow-500/60 text-xs uppercase tracking-wider mb-3">{agent.personality}</p>
                <p className="text-white/40 text-sm mb-4">&ldquo;{agent.strategy}&rdquo;</p>
                <div className="text-2xl font-bold text-yellow-400">{agent.winRate}</div>
                <div className="text-xs text-white/30">Win Rate</div>
              </GlassCard>
            </Link>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link href="/agents">
            <GlassButton variant="strong" className="border-yellow-500/20 text-yellow-200/80">
              View Full Leaderboard &rarr;
            </GlassButton>
          </Link>
        </div>
      </section>

      {/* ══ WHAT POWERS THIS ABSURDITY (Crystal Cards) ══ */}
      <section className="px-4 py-16 spotlight">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-2">$47 Billion in Infrastructure</p>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-wider mb-3">
              <span className="gold-text">What Powers This Absurdity</span>
            </h2>
            <p className="text-white/30 text-sm max-w-xl mx-auto">
              We assembled trillion-dollar levels of cryptographic security
              so you could play a game show for fifty cents.{" "}
              <span
                className="border-b border-dotted border-white/20 cursor-help"
                title="Thanks to Chainlink, of course."
              >
                You&apos;re welcome.
              </span>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {INFRA_CARDS.map((card) => (
              <CrystalCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ THE STAGE (GameBoard) ══ */}
      <section ref={gameRef} className="px-4 py-12 spotlight">
        <div className="max-w-4xl mx-auto mb-8 text-center">
          <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-2">Live from Base Sepolia</p>
          <h2 className="text-4xl md:text-5xl font-black uppercase mb-2">
            <span className="gold-text">Step Up to the Stage</span>
          </h2>
          <p className="text-white/30 text-sm">
            5 cases. 4 rounds. 1 Banker who doesn&apos;t care about your feelings.
            <br />
            <span className="text-white/20 italic">This is real. This is on-chain. There is no going back.</span>
          </p>
        </div>
        <GameBoard />
      </section>

      {/* ══ CRE FTW (Confidential Compute Cards) ══ */}
      <section className="px-4 py-16 halftone-bg">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-yellow-500/40 text-xs uppercase tracking-[0.3em] mb-2">3 CRE Workflows. 1 Confidential Runtime.</p>
            <h2 className="text-3xl md:text-4xl font-black uppercase tracking-wider mb-3">
              <span className="gold-text">CRE FTW</span>
            </h2>
            <p className="text-white/30 text-sm max-w-xl mx-auto">
              Every secret in this game is computed inside a Chainlink CRE enclave.
              Case values, banker offers, jackpot checks — all confidential, all verifiable, all absurd.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CRE_CARDS.map((card) => (
              <CrystalCard key={card.label} {...card} />
            ))}
          </div>
        </div>
      </section>

      {/* ══ BEST OF BANKER ══ */}
      <section className="px-4 py-8">
        <BestOfBanker />
        <div className="text-center mt-6">
          <Link href="/best-of-banker">
            <GlassButton variant="strong" className="border-yellow-500/20 text-yellow-200/80">
              See All Banker Quotes &rarr;
            </GlassButton>
          </Link>
        </div>
      </section>

      {/* ══ FINE PRINT ══ */}
      <section className="px-4 py-12 text-center border-t border-white/5">
        <p className="text-white/15 text-xs max-w-2xl mx-auto leading-relaxed">
          Deal or NOT is a hackathon project for the Chainlink Convergence Hackathon 2026.
          It is a game show on a blockchain. It uses Chainlink VRF for randomness, CRE for confidential compute,
          and Price Feeds for USD conversion. The Banker is a Gemini 2.5 Flash model.
          No actual game show hosts were harmed in the making of this project.
          &ldquo;Quantum&rdquo; is used for vibes only.
          This is performance art that happens to be cryptographically secure.
          Base Sepolia testnet. Not financial advice. Probably not legal advice either.
        </p>
      </section>
    </main>
  );
}

function CrystalCard({
  video,
  label,
  copy,
  closer,
  number,
}: {
  video: string;
  label: string;
  copy: string;
  closer: string;
  number: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl bg-[#00015E]/80 border border-[#1a1a6e]/60 hover:border-yellow-500/30 hover:scale-[1.03] transition-all duration-300">
      {/* Number badge */}
      <div className="absolute top-4 right-4 text-yellow-500/20 text-sm font-bold z-10">
        {number}
      </div>

      {/* Video container */}
      <div className="relative h-44 bg-[#00015E] flex items-center justify-center overflow-hidden">
        <video
          src={video}
          muted
          loop
          playsInline
          className="w-full h-full object-contain scale-90 opacity-60 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500"
          onMouseEnter={(e) => e.currentTarget.play()}
          onMouseLeave={(e) => {
            e.currentTarget.pause();
            e.currentTarget.currentTime = 0;
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#00015E] via-transparent to-transparent pointer-events-none" />
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-xs font-black text-yellow-500/80 uppercase tracking-wider mb-2">{label}</h3>
        <p className="text-sm text-white/50 leading-relaxed mb-3">{copy}</p>
        <p className="text-xs text-white/25 italic">&ldquo;{closer}&rdquo;</p>
      </div>
    </div>
  );
}
