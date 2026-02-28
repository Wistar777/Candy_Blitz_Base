"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useSubmitScore, usePlayerData, useLeaderboard } from "@/lib/blockchain";

interface GameWrapperProps {
    onOpenWallet: () => void;
}

/**
 * GameWrapper — loads the existing vanilla JS game in an iframe
 * and bridges blockchain calls via postMessage.
 */
export default function GameWrapper({ onOpenWallet }: GameWrapperProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const { address, isConnected } = useAccount();
    const { submitScore, isSuccess, isPending: _isPending, error } = useSubmitScore();
    const playerData = usePlayerData(address as `0x${string}` | undefined);
    const leaderboard = useLeaderboard();

    // Send message to game iframe
    const sendToGame = useCallback((type: string, data?: unknown) => {
        iframeRef.current?.contentWindow?.postMessage({ type, data }, "*");
    }, []);

    // When wallet connects/disconnects, notify the game
    useEffect(() => {
        if (isConnected && address) {
            sendToGame("wallet-connected", { address });
        } else {
            sendToGame("wallet-disconnected");
        }
    }, [isConnected, address, sendToGame]);

    // When TX confirms or fails, notify the game
    useEffect(() => {
        if (isSuccess) {
            sendToGame("score-confirmed", { success: true });
        }
    }, [isSuccess, sendToGame]);

    useEffect(() => {
        if (error) {
            sendToGame("score-confirmed", { success: false });
        }
    }, [error, sendToGame]);

    // Listen for messages from the game iframe
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const { type, data } = event.data || {};

            switch (type) {
                case "game-ready":
                    if (isConnected && address) {
                        sendToGame("wallet-connected", { address });
                    }
                    break;

                case "connect-wallet":
                    onOpenWallet();
                    break;

                case "open-profile":
                    onOpenWallet();
                    break;

                case "submit-score":
                    if (data && isConnected) {
                        const { levelIndex, score, starCount } = data;
                        console.log(`[Bridge] Submitting score: level=${levelIndex}, score=${score}, stars=${starCount}`);
                        submitScore(levelIndex, score, starCount);
                        // NOTE: score-confirmed will be sent via the isSuccess/error effects above
                    }
                    break;

                case "fetch-leaderboard":
                    // Transform entries to match game's expected format: { player, totalScore }
                    const formattedEntries = leaderboard.entries.map(e => ({
                        player: e.address,
                        totalScore: e.totalScore,
                        totalStars: e.totalStars,
                        gamesPlayed: e.gamesPlayed,
                    }));
                    sendToGame("leaderboard-data", formattedEntries);
                    break;

                case "fetch-progress":
                    if (playerData.bestScores.some((s: number) => s > 0)) {
                        sendToGame("player-progress", {
                            bestScores: playerData.bestScores,
                            stars: playerData.stars,
                            completedLevels: playerData.completedLevels,
                            gamesPlayed: playerData.gamesPlayed,
                        });
                    } else {
                        sendToGame("player-progress", null);
                    }
                    break;

                case "check-wallet":
                    if (isConnected && address) {
                        sendToGame("wallet-connected", { address });
                    }
                    break;
            }
        };

        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, [isConnected, address, sendToGame, submitScore, leaderboard.entries, playerData, onOpenWallet]);

    return (
        <iframe
            ref={iframeRef}
            src="/game/index.html"
            style={{
                width: "100%",
                height: "100vh",
                border: "none",
                display: "block",
            }}
            allow="autoplay"
            title="Candy Blitz Game"
        />
    );
}
