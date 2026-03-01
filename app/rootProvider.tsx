"use client";
import { ReactNode } from "react";
import { createConfig, http, createStorage, cookieStorage, WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount } from "wagmi/connectors";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

const API_KEY = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

// Custom wagmi config per Base docs:
// https://docs.base.org/mini-apps/core-concepts/base-account
const wagmiConfig = createConfig({
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

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: "auto",
            },
            wallet: {
              display: "modal",
              preference: "all",
            },
          }}
          miniKit={{
            enabled: true,
            autoConnect: true,
            notificationProxyUrl: undefined,
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
