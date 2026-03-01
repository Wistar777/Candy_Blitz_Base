"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Name, Avatar, Identity } from "@coinbase/onchainkit/identity";
import { base } from "viem/chains";
import GameWrapper from "@/components/GameWrapper";
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Called by game iframe via postMessage (for profile button)
  const openProfile = useCallback(() => {
    setProfileOpen(true);
  }, []);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setProfileOpen(false);
    }
  }, []);

  return (
    <div className={styles.container}>
      {/* Profile modal overlay */}
      {profileOpen && (
        <div className={styles.walletOverlay} onClick={handleOverlayClick}>
          <div className={styles.walletCard}>
            {isConnected && address ? (
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
                    setProfileOpen(false);
                  }}
                >
                  🔍 View on BaseScan
                </button>
              </>
            ) : (
              <>
                <div className={styles.walletHeader}>
                  <span style={{ fontSize: "28px" }}>⏳</span>
                  <div>
                    <div className={styles.userName}>Connecting...</div>
                    <div className={styles.walletChain}>Wallet auto-connects via Base App</div>
                  </div>
                </div>
              </>
            )}
            <button
              className={styles.walletAction}
              onClick={() => setProfileOpen(false)}
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}

      {/* Game iframe */}
      <div className={profileOpen ? styles.iframeDimmed : styles.iframeFull}>
        <GameWrapper onOpenWallet={openProfile} />
      </div>
    </div>
  );
}
