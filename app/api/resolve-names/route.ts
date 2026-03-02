import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { normalize } from "viem/ens";

const client = createPublicClient({
    chain: base,
    transport: http(),
});

// Simple in-memory cache (lives for the lifetime of the serverless function)
const nameCache: Record<string, string | null> = {};

async function resolveBasename(address: string): Promise<string | null> {
    const lower = address.toLowerCase();
    if (lower in nameCache) return nameCache[lower];

    try {
        // Base L2 ENS reverse resolution
        const name = await client.getEnsName({
            address: address as `0x${string}`,
            universalResolverAddress: "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD",
        });
        nameCache[lower] = name || null;
        return name || null;
    } catch (e) {
        console.warn(`[resolve-names] Failed for ${address}:`, e);
        nameCache[lower] = null;
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { addresses } = await req.json();

        if (!Array.isArray(addresses) || addresses.length === 0) {
            return NextResponse.json({});
        }

        // Limit to 50 addresses per request
        const limited = addresses.slice(0, 50);
        const results: Record<string, string> = {};

        // Resolve all addresses in parallel
        const promises = limited.map(async (addr: string) => {
            const name = await resolveBasename(addr);
            if (name) {
                results[addr.toLowerCase()] = name;
            }
        });

        await Promise.all(promises);

        return NextResponse.json(results);
    } catch (e) {
        console.error("[resolve-names] Error:", e);
        return NextResponse.json({});
    }
}
