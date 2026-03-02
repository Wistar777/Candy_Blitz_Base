import { NextRequest, NextResponse } from "next/server";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";

// Simple in-memory cache
const nameCache: Record<string, string | null> = {};

async function resolveBasename(address: string): Promise<string | null> {
    const lower = address.toLowerCase();
    if (lower in nameCache) return nameCache[lower];

    try {
        const name = await getName({
            address: address as `0x${string}`,
            chain: base,
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
