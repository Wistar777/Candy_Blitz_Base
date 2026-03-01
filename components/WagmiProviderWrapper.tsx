"use client";

import { createConfig, http, createStorage, cookieStorage, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";

const API_KEY = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

// Wagmi config per official Base docs:
// https://docs.base.org/mini-apps/core-concepts/base-account
const config = createConfig({
    chains: [base],
    connectors: [
        farcasterMiniApp(),
        baseAccount({
            appName: "Candy Blitz",
        }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
        [base.id]: API_KEY
            ? http(`https://api.developer.coinbase.com/rpc/v1/base/${API_KEY}`)
            : http(),
    },
});

const queryClient = new QueryClient();

export default function WagmiProviderWrapper({ children }: { children: ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        </WagmiProvider>
    );
}
