"use client";

import { useAccount, useReadContract } from "wagmi";
import { useSendCalls } from "wagmi/experimental";
import { encodeFunctionData } from "viem";
import { CANDY_BLITZ_ADDRESS, CANDY_BLITZ_ABI } from "./contract";
import { useState, useCallback, useRef, useEffect } from "react";
import { Attribution } from "ox/erc8021";

// Builder Code for Base attribution (base.dev > Settings > Builder Codes)
const BUILDER_DATA_SUFFIX = Attribution.toDataSuffix({
    codes: ["bc_6zhlgf07"],
});

// Paymaster URL — auto-generated from OnchainKit API key
const PAYMASTER_URL = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY
    ? `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}`
    : null;

// ===== Wallet Hook =====

export function useWallet() {
    const { address, isConnected, chain } = useAccount();
    return { address, isConnected, chain };
}

// ===== Read Player Data (free, no gas) =====

export function usePlayerData(address?: `0x${string}`) {
    const result = useReadContract({
        address: CANDY_BLITZ_ADDRESS,
        abi: CANDY_BLITZ_ABI,
        functionName: "getPlayer",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address && !!CANDY_BLITZ_ADDRESS,
        },
    });

    const data = result.data;

    return {
        bestScores: data ? (data[0] as unknown as bigint[]).map(Number) : Array(6).fill(0),
        stars: data ? (data[1] as unknown as number[]) : Array(6).fill(0),
        completedLevels: data ? Number(data[2]) : 0,
        gamesPlayed: data ? Number(data[3]) : 0,
        isLoading: result.isLoading,
        refetch: result.refetch,
    };
}

// ===== Submit Score (Sponsored via Paymaster) =====

export function useSubmitScore() {
    const { sendCalls, data: callsId, isPending, error: sendCallsError } = useSendCalls();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // When sendCalls succeeds
    const prevCallsIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const id = callsId?.id;
        if (id && id !== prevCallsIdRef.current) {
            prevCallsIdRef.current = id;
            console.log(`[Contract] TX submitted: ${id}`);
            setIsSuccess(true);
            setTxHash(id as `0x${string}`);
        }
    }, [callsId]);

    // Track errors
    useEffect(() => {
        if (sendCallsError) {
            console.error("[Contract] sendCalls error:", sendCallsError);
            setError(sendCallsError);
        }
    }, [sendCallsError]);

    const submitScore = useCallback(
        async (levelId: number, score: number, starCount: number) => {
            if (!CANDY_BLITZ_ADDRESS) {
                console.warn("[Contract] Address not set — skipping TX");
                return;
            }

            setIsSubmitting(true);
            setIsSuccess(false);
            setError(null);

            // Encode the contract call data
            const callData = encodeFunctionData({
                abi: CANDY_BLITZ_ABI,
                functionName: "submitScore",
                args: [levelId, BigInt(score), starCount],
            });

            // Append Builder Code suffix
            const dataWithSuffix = (callData + BUILDER_DATA_SUFFIX.slice(2)) as `0x${string}`;

            try {
                // Always use sendCalls — works with both farcasterMiniApp and baseAccount connectors
                // If paymaster is configured, add paymasterService capability 
                // The wallet will use it if supported, otherwise ignore it
                console.log("[Contract] Submitting TX via sendCalls...", PAYMASTER_URL ? "(with paymaster)" : "(no paymaster)");

                sendCalls({
                    calls: [{
                        to: CANDY_BLITZ_ADDRESS,
                        data: dataWithSuffix,
                    }],
                    capabilities: PAYMASTER_URL ? {
                        paymasterService: {
                            url: PAYMASTER_URL,
                        },
                    } : undefined,
                });
            } catch (err) {
                console.error("[Contract] submitScore failed:", err);
                setError(err as Error);
            } finally {
                setIsSubmitting(false);
            }
        },
        [sendCalls]
    );

    return {
        submitScore,
        txHash,
        isPending: isPending || isSubmitting,
        isConfirming: false,
        isSuccess,
        error,
    };
}

// ===== Leaderboard =====

export function useLeaderboard(limit: number = 50) {
    const countResult = useReadContract({
        address: CANDY_BLITZ_ADDRESS,
        abi: CANDY_BLITZ_ABI,
        functionName: "getPlayerCount",
        query: {
            enabled: !!CANDY_BLITZ_ADDRESS,
        },
    });

    const playerCount = countResult.data ? Number(countResult.data) : 0;

    const batchResult = useReadContract({
        address: CANDY_BLITZ_ADDRESS,
        abi: CANDY_BLITZ_ABI,
        functionName: "getLeaderboardBatch",
        args: [BigInt(0), BigInt(Math.min(playerCount, limit))],
        query: {
            enabled: playerCount > 0,
        },
    });

    const data = batchResult.data;

    let entries: Array<{
        address: string;
        totalScore: number;
        totalStars: number;
        gamesPlayed: number;
    }> = [];

    if (data) {
        const [addrs, scores, stars, games] = data;
        entries = addrs
            .map((addr, i) => ({
                address: addr as string,
                totalScore: Number(scores[i]),
                totalStars: Number(stars[i]),
                gamesPlayed: Number(games[i]),
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
    }

    return {
        entries,
        playerCount,
        isLoading: countResult.isLoading || batchResult.isLoading,
        refetch: () => {
            countResult.refetch();
            batchResult.refetch();
        },
    };
}

// ===== Total Score =====

export function useTotalScore(address?: `0x${string}`) {
    const result = useReadContract({
        address: CANDY_BLITZ_ADDRESS,
        abi: CANDY_BLITZ_ABI,
        functionName: "getTotalScore",
        args: address ? [address] : undefined,
        query: {
            enabled: !!address && !!CANDY_BLITZ_ADDRESS,
        },
    });

    return {
        totalScore: result.data ? Number(result.data) : 0,
        isLoading: result.isLoading,
    };
}
