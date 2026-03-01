"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Name, Avatar, Identity } from "@coinbase/onchainkit/identity";
import { Wallet, ConnectWallet } from "@coinbase/onchainkit/wallet";
import { base } from "viem/chains";
import GameWrapper from "@/components/GameWrapper";
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

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
                  onClick={() => setWalletModalOpen(false)}
                >
                  ✕ Close
                </button>
              </>
            ) : (
              /* Not connected — use OnchainKit ConnectWallet */
              <>
                <h3 className={styles.walletTitle}>Connect Wallet</h3>
                <p className={styles.walletSub}>Connect to play and save scores on Base</p>
                <div className={styles.connectWrapper}>
                  <Wallet>
                    <ConnectWallet
                      className={styles.connectBtn}
                    />
                  </Wallet>
                </div>
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
