/**
 * CandyBlitz contract ABI and address.
 * Deployed on Base Mainnet via Remix IDE.
 * Verified on Sourcify: https://repo.sourcify.dev/8453/0x534DBC807c11f445342810d84a8DDEff7a249Fee
 */

// Base Mainnet contract address
export const CANDY_BLITZ_ADDRESS = "0x534DBC807c11f445342810d84a8DDEff7a249Fee" as `0x${string}`;

export const CANDY_BLITZ_ABI = [
    // submitScore
    {
        type: "function",
        name: "submitScore",
        inputs: [
            { name: "levelId", type: "uint8" },
            { name: "score", type: "uint64" },
            { name: "starCount", type: "uint8" },
        ],
        outputs: [],
        stateMutability: "nonpayable",
    },
    // getPlayer
    {
        type: "function",
        name: "getPlayer",
        inputs: [{ name: "addr", type: "address" }],
        outputs: [
            { name: "bestScores", type: "uint64[6]" },
            { name: "stars", type: "uint8[6]" },
            { name: "completedLevels", type: "uint8" },
            { name: "gamesPlayed", type: "uint32" },
        ],
        stateMutability: "view",
    },
    // getTotalScore
    {
        type: "function",
        name: "getTotalScore",
        inputs: [{ name: "addr", type: "address" }],
        outputs: [{ name: "total", type: "uint64" }],
        stateMutability: "view",
    },
    // getPlayerCount
    {
        type: "function",
        name: "getPlayerCount",
        inputs: [],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    // getPlayerAt
    {
        type: "function",
        name: "getPlayerAt",
        inputs: [{ name: "idx", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    // getLeaderboardBatch
    {
        type: "function",
        name: "getLeaderboardBatch",
        inputs: [
            { name: "offset", type: "uint256" },
            { name: "limit", type: "uint256" },
        ],
        outputs: [
            { name: "addrs", type: "address[]" },
            { name: "totalScores", type: "uint64[]" },
            { name: "totalStars", type: "uint8[]" },
            { name: "games", type: "uint32[]" },
        ],
        stateMutability: "view",
    },
    // playerList
    {
        type: "function",
        name: "playerList",
        inputs: [{ name: "", type: "uint256" }],
        outputs: [{ name: "", type: "address" }],
        stateMutability: "view",
    },
    // MAX_LEVELS
    {
        type: "function",
        name: "MAX_LEVELS",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
    },
    // ScoreSubmitted event
    {
        type: "event",
        name: "ScoreSubmitted",
        inputs: [
            { name: "player", type: "address", indexed: true },
            { name: "levelId", type: "uint8", indexed: true },
            { name: "score", type: "uint64", indexed: false },
            { name: "stars", type: "uint8", indexed: false },
        ],
    },
] as const;
