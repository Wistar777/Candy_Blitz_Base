const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * Candy Blitz MiniApp configuration.
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: "",
  },
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "Candy Blitz",
    subtitle: "On-chain Match-3 Game",
    description: "Match candies, beat records, climb the leaderboard — all on Base!",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0a0014",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["game", "match3", "onchain", "leaderboard", "candy"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Match, Score, Win!",
    ogTitle: "Candy Blitz",
    ogDescription: "On-chain Match-3 Game on Base",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
