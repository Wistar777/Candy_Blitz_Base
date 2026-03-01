"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
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

// ===== Submit Score (Sponsored via Paymaster, fallback to direct TX) =====

export function useSubmitScore() {
    // Sponsored path (Smart Wallets — useSendCalls with paymaster)
    const {
        sendCalls,
        data: callsId,
        isPending: isSendCallsPending,
        error: sendCallsError,
    } = useSendCalls();

    // Fallback path (EOA wallets — useWriteContract)
    const {
        writeContract,
        data: fallbackTxHash,
        isPending: isWritePending,
        error: writeError,
    } = useWriteContract();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
    const [isSuccess, setIsSuccess] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Track fallback TX confirmation
    const { isSuccess: fallbackIsSuccess } = useWaitForTransactionReceipt({
        hash: fallbackTxHash,
    });

    // When sendCalls succeeds, extract hash from callsId
    const prevCallsIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        const id = callsId?.id;
        if (id && id !== prevCallsIdRef.current) {
            prevCallsIdRef.current = id;
            console.log(`[Contract] Sponsored TX batch submitted: ${id}`);
            // For sendCalls, we treat the callsId as success signal
            setIsSuccess(true);
            setTxHash(id as `0x${string}`);
        }
    }, [callsId]);

    // When fallback TX confirms
    useEffect(() => {
        if (fallbackIsSuccess && fallbackTxHash) {
            setIsSuccess(true);
            setTxHash(fallbackTxHash);
        }
    }, [fallbackIsSuccess, fallbackTxHash]);

    // Track errors
    useEffect(() => {
        if (sendCallsError) setError(sendCallsError);
        if (writeError) setError(writeError);
    }, [sendCallsError, writeError]);

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
                if (PAYMASTER_URL) {
                    // Try sponsored path first (Smart Wallets)
                    console.log("[Contract] Attempting sponsored TX via Paymaster...");
                    sendCalls({
                        calls: [{
                            to: CANDY_BLITZ_ADDRESS,
                            data: dataWithSuffix,
                        }],
                        capabilities: {
                            paymasterService: {
                                url: PAYMASTER_URL,
                            },
                        },
                    }, {
                        onError: (err) => {
                            // If sponsored fails (e.g. EOA wallet), fall back to direct TX
                            console.warn("[Contract] Sponsored TX failed, falling back to direct TX:", err.message);
                            writeContract({
                                address: CANDY_BLITZ_ADDRESS,
                                abi: CANDY_BLITZ_ABI,
                                functionName: "submitScore",
                                args: [levelId, BigInt(score), starCount],
                                dataSuffix: BUILDER_DATA_SUFFIX,
                            });
                        },
                    });
                } else {
                    // No paymaster configured — direct TX
                    writeContract({
                        address: CANDY_BLITZ_ADDRESS,
                        abi: CANDY_BLITZ_ABI,
                        functionName: "submitScore",
                        args: [levelId, BigInt(score), starCount],
                        dataSuffix: BUILDER_DATA_SUFFIX,
                    });
                }
            } catch (err) {
                console.error("[Contract] submitScore failed:", err);
                setError(err as Error);
            } finally {
                setIsSubmitting(false);
            }
        },
        [sendCalls, writeContract]
    );

    return {
        submitScore,
        txHash,
        isPending: isSendCallsPending || isWritePending || isSubmitting,
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
