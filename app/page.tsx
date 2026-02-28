"use client";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import GameWrapper from "@/components/GameWrapper";
import styles from "./page.module.css";

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
  }, [setMiniAppReady, isMiniAppReady]);

  // Called by game iframe via postMessage
  const openWalletModal = useCallback(() => {
    if (isConnected) {
      // Already connected — show profile modal
      setWalletModalOpen(true);
    } else {
      // Not connected — show connector selection
      setWalletModalOpen(true);
    }
  }, [isConnected]);

  const handleConnect = useCallback((connectorIndex: number) => {
    const connector = connectors[connectorIndex];
    if (connector) {
      connect({ connector });
      setWalletModalOpen(false);
    }
  }, [connect, connectors]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setWalletModalOpen(false);
  }, [disconnect]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setWalletModalOpen(false);
    }
  }, []);

  const shortAddr = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  return (
    <div className={styles.container}>
      {/* Wallet modal overlay */}
      {walletModalOpen && (
        <div className={styles.walletOverlay} onClick={handleOverlayClick}>
          <div className={styles.walletCard}>
            {isConnected ? (
              /* Connected — show profile */
              <>
                <div className={styles.walletHeader}>
                  <div className={styles.walletAvatar}>🟢</div>
                  <div>
                    <div className={styles.walletAddr}>{shortAddr}</div>
                    <div className={styles.walletChain}>Base</div>
                  </div>
                </div>
                <div className={styles.walletDivider} />
                <button
                  className={styles.walletAction}
                  onClick={() => {
                    if (address) {
                      window.open(`https://basescan.org/address/${address}`, "_blank");
                    }
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
              /* Not connected — show connector list */
              <>
                <h3 className={styles.walletTitle}>Connect Wallet</h3>
                <p className={styles.walletSub}>Choose a wallet to connect to Base</p>
                <div className={styles.connectorList}>
                  {connectors.map((connector, i) => (
                    <button
                      key={connector.uid}
                      className={styles.connectorBtn}
                      onClick={() => handleConnect(i)}
                    >
                      <span className={styles.connectorIcon}>
                        {connector.name.includes("Coinbase") ? "🔵" :
                          connector.name.includes("MetaMask") ? "🦊" :
                            connector.name.includes("Farcaster") ? "🟣" : "🔗"}
                      </span>
                      <span>{connector.name}</span>
                    </button>
                  ))}
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
