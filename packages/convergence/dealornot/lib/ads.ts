import { SponsorAd } from "@/types/game";

// TODO: Replace with on-chain sponsor ads from a Sponsor contract.
// Future: sponsors write ads by sending ETH/LINK to the Sponsor contract,
// which funds the Jackpot contract. Ad text + logo stored on-chain or IPFS.
// This static array is the placeholder until that's built.

export const SPONSOR_ADS: SponsorAd[] = [
  // ── letswritean.email ──
  { text: "letswritean.email", tagline: "Dear Sir/Madam, I accept the deal. Send.", url: "https://letswritean.email", bg: "from-pink-600/20 to-purple-600/20", logo: "/sponsors/letswritean-email.png" },
  { text: "letswritean.email", tagline: "The Banker's offers? Could've been an email.", url: "https://letswritean.email", bg: "from-purple-600/20 to-pink-600/20", logo: "/sponsors/letswritean-email.png" },
  { text: "letswritean.email", tagline: "Write the email you've been avoiding since 2019.", url: "https://letswritean.email", bg: "from-pink-600/20 to-fuchsia-600/20", logo: "/sponsors/letswritean-email.png" },

  // ── Ceptor Club (general) ──
  { text: "Ceptor Club", tagline: "Roll for initiative. On-chain. Nat 1 is permanent.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-green-600/20 to-emerald-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "3 hackathon wins. 0 failed saving throws. (We don't talk about SmartCon.)", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-lime-600/20 to-green-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "Art, Tech, and Games. On-chain TTRPG experiences since Block Magic.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-green-700/20 to-lime-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "D&D but your DM is a smart contract.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-emerald-600/20 to-teal-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "Create a DND 5E character in two clicks. The AI avatar is free. The regret isn't.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-emerald-700/20 to-green-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "Scroll of Artistry: commission TTRPG art on-chain. Your bard deserves a portrait.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-green-600/20 to-teal-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "Your sword is an NFT. Your regrets are free.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-teal-600/20 to-green-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "The guild where your character sheet lives on-chain and your HP does not.", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-teal-600/20 to-emerald-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "Meet your CCID: a cross-chain identity for players and game masters. We use CCIP!", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-lime-600/20 to-emerald-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor Club", tagline: "AR dungeons. AI avatars. A 3D die powered by Chainlink VRF. Weekly art challenges. SocialFi?!!", url: "https://devpost.com/software/search?query=ceptor+club", bg: "from-emerald-600/20 to-lime-600/20", logo: "/sponsors/ceptor-club.png" },

  // ── Ceptor Club (per-project) ──
  { text: "Ceptor — Game Mechanics", tagline: "Two clicks, one quiz, and Chainlink VRF. Your half-orc bard is ready.", url: "https://devpost.com/software/ceptor-game-mechanics", bg: "from-emerald-500/20 to-teal-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — Scroll of Artistry", tagline: "Commission a portrait of your dragonborn warlock. On-chain. As one does.", url: "https://devpost.com/software/ceptor-s-scroll-of-artistry", bg: "from-teal-500/20 to-green-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — Games Team", tagline: "A 3D die powered by Chainlink VRF. Your DM was definitely lying about that nat 20.", url: "https://devpost.com/software/ceptor-club-games-team", bg: "from-lime-500/20 to-green-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — CCID", tagline: "One ID to rule them all. Cross-chain. Weekly art challenges. SocialFi?!!", url: "https://devpost.com/software/ceptor-tech-ccid-for-players-and-gamemasters", bg: "from-green-700/20 to-lime-500/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — AR Dungeons", tagline: "Point your phone at the table. Watch the dungeon come alive. Mint the evidence.", url: "https://devpost.com/software/ceptor-art-ar-artour-d-d-experience", bg: "from-teal-600/20 to-emerald-500/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — Character Quiz", tagline: "AI avatar. NFT mint. Twitter flex. The modern adventurer's pipeline.", url: "https://devpost.com/software/ceptor-club", bg: "from-emerald-600/20 to-lime-600/20", logo: "/sponsors/ceptor-club.png" },
  { text: "Ceptor — Tech Team", tagline: "Decentralized sign-ups for gaming guilds. Because even your login deserves a blockchain.", url: "https://devpost.com/software/ceptor-tech-team", bg: "from-green-600/20 to-teal-500/20", logo: "/sponsors/ceptor-club.png" },

  // ── Chainlink ──
  { text: "Chainlink", tagline: "We power this game. We are not liable.", url: "https://chain.link", bg: "from-blue-600/20 to-cyan-600/20", logo: "/sponsors/chainlink.svg" },
  { text: "Chainlink", tagline: "Verifiable randomness. Unverifiable life choices.", url: "https://chain.link", bg: "from-indigo-600/20 to-blue-600/20", logo: "/sponsors/chainlink.svg" },
  { text: "Chainlink", tagline: "Even our oracles can't predict your next move.", url: "https://chain.link", bg: "from-cyan-600/20 to-blue-600/20", logo: "/sponsors/chainlink.svg" },
  { text: "Chainlink Convergence", tagline: "The hackathon where this game was born. CRE + VRF + Gemini in a confidential enclave. We regret nothing.", url: "https://chain.link/hackathon", bg: "from-blue-700/20 to-indigo-600/20", logo: "/sponsors/chainlink.svg" },
  { text: "Chainlink Convergence", tagline: "48 hours. One CRE workflow. Zero sleep. This is the hackathon life.", url: "https://chain.link/hackathon", bg: "from-indigo-700/20 to-blue-600/20", logo: "/sponsors/chainlink.svg" },
  { text: "Chainlink CRE", tagline: "Confidential compute, on-chain callbacks, and an AI banker who judges your life choices. Built with CRE.", url: "https://chain.link/cre", bg: "from-blue-600/20 to-violet-600/20", logo: "/sponsors/chainlink.svg" },

  // ── Deal or NOT ──
  { text: "Deal or NOT — LIVE", tagline: "You're watching it. You could be playing it.", url: "/", bg: "from-yellow-600/20 to-amber-600/20" },
  { text: "Deal or NOT", tagline: "No deal? No problem. Actually, big problem.", url: "/", bg: "from-orange-600/20 to-yellow-600/20" },
  { text: "Deal or NOT", tagline: "A game show where the house always loses. On purpose.", url: "/", bg: "from-amber-600/20 to-orange-600/20" },

  // ── Other sponsors ──
  { text: "ENS", tagline: "You could've just sent it to banker.eth. But no.", url: "https://ens.domains", bg: "from-sky-600/20 to-blue-600/20" },
  { text: "Wingbird Enterprises", tagline: "Global Wingbirds. Fly with you FTW.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-sky-600/20 to-violet-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "Wingbird Enterprises", tagline: "Wingbird your next hackathon. With CyberJam.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-violet-600/20 to-sky-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "CyberJam 2026", tagline: "Multi-round. Multi-city. 5 roles. 1 Traveller. Chicago → SF → ???. The hackathon that travels with you.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-fuchsia-600/20 to-violet-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "CyberJam 2026", tagline: "Artist. Engineer. Local. Traveller. Robot. Every team needs all five. No exceptions.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-violet-600/20 to-fuchsia-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "CyberJam 2026", tagline: "Build a Box, a Booth, or an entire Room. Phygital builds only. Your laptop demo won't cut it here.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-fuchsia-500/20 to-pink-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "CyberJam 2026", tagline: "Round 3 location revealed 72 hours before it starts. Pack a bag. Trust the process.", url: "https://paragraph.com/@cyberjam.art/cyberjam-2024-winners-and-keep-building-round-2-announcement", bg: "from-pink-600/20 to-violet-600/20", logo: "/sponsors/wingbird.svg" },
  { text: "Rick Roll University", tagline: "Never gonna give you up. Never gonna let you graduate.", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", bg: "from-red-600/20 to-orange-600/20" },
  { text: "Tippi Fifestarr", tagline: "Born in the driver's seat. Forged in the fires of Chainlink's hackathons.", url: "https://devpost.com/tippi-fifestarr", bg: "from-amber-600/20 to-red-600/20" },
  { text: "The Banker's Therapy Fund", tagline: "He doesn't need it. (He does.)", url: "#", bg: "from-blue-600/20 to-indigo-600/20" },
  { text: "Harding Cafe", tagline: "Tasty pancakes and chilaquiles. The only deal worth taking before noon.", url: "#harding-cafe", bg: "from-amber-500/20 to-orange-600/20" },
  { text: "Harding Cafe", tagline: "Chicago breakfast so good you'll sleep through your hackathon. Worth it.", url: "#harding-cafe", bg: "from-orange-500/20 to-amber-600/20" },
];
