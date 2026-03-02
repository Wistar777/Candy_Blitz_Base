"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useSubmitScore, usePlayerData, useLeaderboard } from "@/lib/blockchain";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";

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
    const { submitScore, txHash, isSuccess, isPending: _isPending, error } = useSubmitScore();
    const playerData = usePlayerData(address as `0x${string}` | undefined);
    const leaderboard = useLeaderboard();

    // Keep refs for latest data (avoids stale closures in message handler)
    const leaderboardRef = useRef(leaderboard);
    const playerDataRef = useRef(playerData);
    leaderboardRef.current = leaderboard;
    playerDataRef.current = playerData;

    // Track which txHash we already confirmed (to avoid duplicate confirmations)
    const confirmedTxRef = useRef<string | undefined>(undefined);

    // Send message to game iframe
    const sendToGame = useCallback((type: string, data?: unknown) => {
        iframeRef.current?.contentWindow?.postMessage({ type, data }, "*");
    }, []);

    // When wallet connects/disconnects, notify the game (with basename)
    useEffect(() => {
        if (isConnected && address) {
            // Send address immediately
            sendToGame("wallet-connected", { address });
            // Then resolve basename and send update
            getName({ address, chain: base }).then((basename) => {
                if (basename) {
                    sendToGame("wallet-basename", { address, basename });
                }
            }).catch(() => { });
        } else {
            sendToGame("wallet-disconnected");
        }
    }, [isConnected, address, sendToGame]);

    // When TX confirms, notify the game (only once per unique txHash)
    useEffect(() => {
        if (isSuccess && txHash && txHash !== confirmedTxRef.current) {
            confirmedTxRef.current = txHash;
            console.log(`[Bridge] TX confirmed: ${txHash}`);
            sendToGame("score-confirmed", { success: true });
        }
    }, [isSuccess, txHash, sendToGame]);

    // When TX fails, notify the game
    useEffect(() => {
        if (error) {
            console.error(`[Bridge] TX error:`, error);
            sendToGame("score-confirmed", { success: false });
        }
    }, [error, sendToGame]);

    // Listen for messages from the game iframe
    useEffect(() => {
        const handler = async (event: MessageEvent) => {
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
                    }
                    break;

                case "fetch-leaderboard":
                    // Refetch latest data from chain
                    try {
                        await leaderboardRef.current.refetch();
                    } catch (e) {
                        console.warn("[Bridge] Leaderboard refetch failed:", e);
                    }
                    // Small delay to let React state update after refetch
                    setTimeout(() => {
                        const lb = leaderboardRef.current;
                        const formattedEntries = lb.entries.map(e => ({
                            player: e.address,
                            totalScore: e.totalScore,
                            totalStars: e.totalStars,
                            gamesPlayed: e.gamesPlayed,
                        }));
                        console.log(`[Bridge] Sending leaderboard: ${formattedEntries.length} entries`);
                        sendToGame("leaderboard-data", formattedEntries);
                    }, 500);
                    break;

                case "fetch-progress":
                    try {
                        await playerDataRef.current.refetch();
                    } catch (e) {
                        console.warn("[Bridge] Player data refetch failed:", e);
                    }
                    setTimeout(() => {
                        const pd = playerDataRef.current;
                        if (pd.bestScores.some((s: number) => s > 0)) {
                            sendToGame("player-progress", {
                                bestScores: pd.bestScores,
                                stars: pd.stars,
                                completedLevels: pd.completedLevels,
                                gamesPlayed: pd.gamesPlayed,
                            });
                        } else {
                            sendToGame("player-progress", null);
                        }
                    }, 500);
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
    }, [isConnected, address, sendToGame, submitScore, onOpenWallet]);

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
