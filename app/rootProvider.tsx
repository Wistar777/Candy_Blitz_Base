"use client";
import { ReactNode } from "react";
import dynamic from "next/dynamic";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";
import { base } from "wagmi/chains";

const API_KEY = process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY;

// Dynamic import WagmiProvider with ssr:false (critical for Base App)
// Per official demo: https://github.com/base/demos/tree/master/mini-apps/templates/farcaster-sdk/mini-app-full-demo
const WagmiProviderWrapper = dynamic(
  () => import("@/components/WagmiProviderWrapper"),
  { ssr: false }
);

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderWrapper>
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
    </WagmiProviderWrapper>
  );
}
