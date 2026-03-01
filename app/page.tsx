"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useReconnect } from "wagmi";
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
  const { reconnect } = useReconnect();
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Auto-close modal when wallet connects
  useEffect(() => {
    if (isConnected && walletModalOpen) {
      setWalletModalOpen(false);
      setIsSigningIn(false);
    }
  }, [isConnected, walletModalOpen]);

  // Called by game iframe via postMessage
  const openWalletModal = useCallback(() => {
    setWalletModalOpen(true);
  }, []);

  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    console.log("[Auth] Available connectors:", connectors.map(c => `${c.name} (${c.type})`));

    try {
      // First try useReconnect (restores previous session)
      console.log("[Auth] Trying reconnect...");
      reconnect();

      // Give reconnect a moment to work
      await new Promise(resolve => setTimeout(resolve, 500));

      // If still not connected, try connecting with first available connector
      if (!document.hidden) {
        for (const connector of connectors) {
          try {
            console.log(`[Auth] Trying connector: ${connector.name} (${connector.type})`);
            connect({ connector });
            return; // Exit on first successful attempt
          } catch (err) {
            console.warn(`[Auth] Connector ${connector.name} failed:`, err);
          }
        }
      }
    } catch (err) {
      console.error("[Auth] Sign in error:", err);
    }
  }, [connectors, connect, reconnect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setWalletModalOpen(false);
  }, [disconnect]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setWalletModalOpen(false);
    }
  }, []);

  return (
    <div className={styles.container}>
      {/* Wallet modal overlay */}
      {walletModalOpen && (
        <div className={styles.walletOverlay} onClick={handleOverlayClick}>
          <div className={styles.walletCard}>
            {isConnected && address ? (
              /* Connected — show profile */
              <>
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
              </>
            ) : (
              /* Not connected — show Sign In */
              <>
                <h3 className={styles.walletTitle}>Sign In</h3>
                <p className={styles.walletSub}>Sign in to play and save scores on Base</p>
                <button
                  className={styles.signInBtn}
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                >
                  {isSigningIn ? "Signing in..." : "🔵 Sign In"}
                </button>
              </>
            )}
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
