"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Name, Avatar, Identity } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import GameWrapper from "@/components/GameWrapper";
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const connectAttemptRef = useRef(false);

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Log available connectors for debugging
  useEffect(() => {
    console.log("[Wallet] Available connectors:", connectors.map(c => `${c.name} (${c.type})`));
  }, [connectors]);

  // Auto-retry connection if farcaster connector appears later (race condition fix)
  useEffect(() => {
    if (isConnected || connectAttemptRef.current) return;

    const farcasterConnector = connectors.find(
      (c) => c.type === "farcasterFrame" || c.type === "farcasterMiniApp"
    );

    if (farcasterConnector) {
      console.log("[Wallet] Farcaster connector detected, auto-connecting...");
      connectAttemptRef.current = true;
      connect({ connector: farcasterConnector });
    }
  }, [connectors, isConnected, connect]);

  // Called by game iframe via postMessage
  const openWalletModal = useCallback(() => {
    if (isConnected) {
      setWalletModalOpen(true);
    } else {
      // Try farcaster connectors first (Base App / MiniKit — no popup)
      const farcasterConnector = connectors.find(
        (c) => c.type === "farcasterFrame" || c.type === "farcasterMiniApp"
      );

      if (farcasterConnector) {
        console.log(`[Wallet] Connecting via farcaster: ${farcasterConnector.name}`);
        connect({ connector: farcasterConnector });
      } else {
        // Fallback: try any available connector (browser mode)
        const connector = connectors[0];
        if (connector) {
          console.log(`[Wallet] Connecting via ${connector.type}: ${connector.name}`);
          connect({ connector });
        } else {
          console.warn("[Wallet] No connectors available");
        }
      }
    }
  }, [isConnected, connectors, connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    connectAttemptRef.current = false;
    setWalletModalOpen(false);
  }, [disconnect]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setWalletModalOpen(false);
    }
  }, []);

  return (
    <div className={styles.container}>
      {/* Profile modal overlay */}
      {walletModalOpen && isConnected && address && (
        <div className={styles.walletOverlay} onClick={handleOverlayClick}>
          <div className={styles.walletCard}>
            <div className={styles.walletHeader}>
              <Identity
                address={address}
                chain={base}
                className={styles.identityContainer}
              >
                <Avatar
                  address={address}
                  chain={base}
                  className={styles.avatarImg}
                />
                <Name
                  address={address}
                  chain={base}
                  className={styles.userName}
                />
              </Identity>
              <div className={styles.walletChain}>Base</div>
            </div>
            <div className={styles.walletDivider} />
            <button
              className={styles.walletAction}
              onClick={() => {
                window.open(`https://basescan.org/address/${address}`, "_blank");
                setWalletModalOpen(false);
              }}
            >
              🔍 View on BaseScan
            </button>
            <button
              className={`${styles.walletAction} ${styles.disconnectBtn}`}
              onClick={handleDisconnect}
            >
              🔌 Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Iframe — dimmed when wallet modal is open */}
      <div className={walletModalOpen ? styles.iframeDimmed : styles.iframeFull}>
        <GameWrapper onOpenWallet={openWalletModal} />
      </div>
    </div>
  );
}
