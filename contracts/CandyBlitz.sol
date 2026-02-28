// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CandyBlitz
 * @notice On-chain Match-3 game score tracker on Base.
 *         Players submit scores when they beat level records.
 *         Supports leaderboard via on-chain player list.
 */
contract CandyBlitz {
    uint8 public constant MAX_LEVELS = 6;

    struct Player {
        uint64[6] bestScores;
        uint8[6]  stars;
        uint8     completedLevels;
        uint32    gamesPlayed;
    }

    mapping(address => Player) private players;
    address[] public playerList;
    mapping(address => bool) private registered;

    event ScoreSubmitted(
        address indexed player,
        uint8   indexed levelId,
        uint64  score,
        uint8   stars
    );

    /**
     * @notice Submit a score for a level. Only updates if it's a new record.
     * @param levelId Level index (0-5)
     * @param score   The score achieved
     * @param starCount Stars earned (0-3)
     */
    function submitScore(uint8 levelId, uint64 score, uint8 starCount) external {
        require(levelId < MAX_LEVELS, "Invalid level");
        require(starCount <= 3, "Invalid stars");

        Player storage p = players[msg.sender];

        // Register new player
        if (!registered[msg.sender]) {
            playerList.push(msg.sender);
            registered[msg.sender] = true;
        }

        // Update best score
        if (score > p.bestScores[levelId]) {
            p.bestScores[levelId] = score;
        }

        // Update best stars
        if (starCount > p.stars[levelId]) {
            p.stars[levelId] = starCount;
        }

        // Recalculate completed levels
        uint8 completed = 0;
        for (uint8 i = 0; i < MAX_LEVELS; i++) {
            if (p.bestScores[i] > 0) completed++;
        }
        p.completedLevels = completed;
        p.gamesPlayed++;

        emit ScoreSubmitted(msg.sender, levelId, score, starCount);
    }

    // ===== View Functions (free, no gas) =====

    function getPlayer(address addr) external view returns (
        uint64[6] memory bestScores,
        uint8[6]  memory stars,
        uint8     completedLevels,
        uint32    gamesPlayed
    ) {
        Player storage p = players[addr];
        return (p.bestScores, p.stars, p.completedLevels, p.gamesPlayed);
    }

    function getPlayerCount() external view returns (uint256) {
        return playerList.length;
    }

    function getPlayerAt(uint256 idx) external view returns (address) {
        require(idx < playerList.length, "Index out of bounds");
        return playerList[idx];
    }

    /**
     * @notice Get total score across all levels for a player.
     *         Used for leaderboard ranking.
     */
    function getTotalScore(address addr) external view returns (uint64 total) {
        Player storage p = players[addr];
        for (uint8 i = 0; i < MAX_LEVELS; i++) {
            total += p.bestScores[i];
        }
    }

    /**
     * @notice Batch fetch leaderboard data (max 50 players per call).
     * @param offset Start index in playerList
     * @param limit  Max players to return
     */
    function getLeaderboardBatch(uint256 offset, uint256 limit) external view returns (
        address[] memory addrs,
        uint64[]  memory totalScores,
        uint8[]   memory totalStars,
        uint32[]  memory games
    ) {
        uint256 count = playerList.length;
        if (offset >= count) {
            return (new address[](0), new uint64[](0), new uint8[](0), new uint32[](0));
        }

        uint256 end = offset + limit;
        if (end > count) end = count;
        uint256 size = end - offset;

        addrs = new address[](size);
        totalScores = new uint64[](size);
        totalStars = new uint8[](size);
        games = new uint32[](size);

        for (uint256 i = 0; i < size; i++) {
            address addr = playerList[offset + i];
            Player storage p = players[addr];

            addrs[i] = addr;
            games[i] = p.gamesPlayed;

            uint64 ts = 0;
            uint8 ss = 0;
            for (uint8 j = 0; j < MAX_LEVELS; j++) {
                ts += p.bestScores[j];
                ss += p.stars[j];
            }
            totalScores[i] = ts;
            totalStars[i] = ss;
        }
    }
}
