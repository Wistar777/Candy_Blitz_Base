"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useMiniKit, useAuthenticate } from "@coinbase/onchainkit/minikit";
import { Name, Avatar, Identity } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import GameWrapper from "@/components/GameWrapper";
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signIn } = useAuthenticate();
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
    }
  }, [isConnected, walletModalOpen]);

  // Called by game iframe via postMessage
  const openWalletModal = useCallback(() => {
    setWalletModalOpen(true);
  }, []);

  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    try {
      const result = await signIn();
      if (result) {
        console.log("[Auth] Sign in successful");
        setWalletModalOpen(false);
      } else {
        console.warn("[Auth] Sign in cancelled or failed");
      }
    } catch (err) {
      console.error("[Auth] Sign in error:", err);
    } finally {
      setIsSigningIn(false);
    }
  }, [signIn]);

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
