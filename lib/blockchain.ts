"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { CANDY_BLITZ_ADDRESS, CANDY_BLITZ_ABI } from "./contract";
import { useState, useCallback } from "react";
import { Attribution } from "ox/erc8021";

// Builder Code for Base attribution (base.dev > Settings > Builder Codes)
const BUILDER_DATA_SUFFIX = Attribution.toDataSuffix({
    codes: ["bc_6zhlgf07"],
});

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

// ===== Submit Score (TX — gas needed or Paymaster) =====

export function useSubmitScore() {
    const { writeContract, data: txHash, isPending, error } = useWriteContract();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
        hash: txHash,
    });

    const submitScore = useCallback(
        async (levelId: number, score: number, starCount: number) => {
            if (!CANDY_BLITZ_ADDRESS) {
                console.warn("[Contract] Address not set — skipping TX");
                return;
            }

            setIsSubmitting(true);
            try {
                writeContract({
                    address: CANDY_BLITZ_ADDRESS,
                    abi: CANDY_BLITZ_ABI,
                    functionName: "submitScore",
                    args: [levelId, BigInt(score), starCount],
                    dataSuffix: BUILDER_DATA_SUFFIX,
                });
            } catch (err) {
                console.error("[Contract] submitScore failed:", err);
            } finally {
                setIsSubmitting(false);
            }
        },
        [writeContract]
    );

    return {
        submitScore,
        txHash,
        isPending: isPending || isSubmitting,
        isConfirming,
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
