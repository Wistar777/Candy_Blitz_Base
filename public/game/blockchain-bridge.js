/**
 * blockchain-bridge.js — replaces blockchain.js for Base Mini App.
 * Communicates with the parent React app via postMessage.
 */

let _connected = false;
let _walletAddress = '';
let _walletBasename = '';
let _onConnectCbs = [];
let _onDisconnectCbs = [];
const _nameCache = {};

// Listen for messages from React parent
window.addEventListener('message', (event) => {
    const { type, data } = event.data || {};
    switch (type) {
        case 'wallet-connected':
            _connected = true;
            _walletAddress = data.address || '';
            _walletBasename = '';
            _onConnectCbs.forEach(cb => cb());
            break;
        case 'wallet-disconnected':
            _connected = false;
            _walletAddress = '';
            _walletBasename = '';
            _onDisconnectCbs.forEach(cb => cb());
            break;
        case 'wallet-basename':
            if (data?.basename) {
                _walletBasename = data.basename;
                // Also populate the name cache so leaderboard can use it
                if (data.address) {
                    _nameCache[data.address.toLowerCase()] = data.basename;
                }
                // Update wallet button if visible
                const walletBtn = document.getElementById('walletBtn');
                if (walletBtn && walletBtn.classList.contains('connected')) {
                    walletBtn.textContent = '👤 ' + data.basename;
                }
            }
            break;
        case 'score-confirmed':
            // Resolve the pending submitScore promise
            if (window._scoreResolve) {
                window._scoreResolve(data?.success !== false);
                window._scoreResolve = null;
            }
            break;
        case 'leaderboard-data':
            if (window._leaderboardResolve) {
                window._leaderboardResolve(data || []);
                window._leaderboardResolve = null;
            }
            break;
        case 'player-progress':
            if (window._progressResolve) {
                window._progressResolve(data);
                window._progressResolve = null;
            }
            break;
    }
});

// Notify parent that iframe game is ready
export function initBlockchain() {
    window.parent.postMessage({ type: 'game-ready' }, '*');
}

export function connectWallet() {
    window.parent.postMessage({ type: 'connect-wallet' }, '*');
}

export function disconnectWallet() {
    window.parent.postMessage({ type: 'disconnect-wallet' }, '*');
}

/**
 * Submit score — sends to React parent and WAITS for on-chain confirmation.
 * The UI will show the loading spinner until this resolves.
 */
export async function submitScore(levelIndex, score, starCount) {
    window.parent.postMessage({
        type: 'submit-score',
        data: { levelIndex, score, starCount }
    }, '*');

    // Wait for React to confirm the TX (up to 30 seconds)
    return new Promise((resolve) => {
        window._scoreResolve = resolve;
        setTimeout(() => {
            if (window._scoreResolve) {
                console.warn('[Bridge] Score submission timed out after 30s');
                window._scoreResolve(false);
                window._scoreResolve = null;
            }
        }, 30000);
    });
}

export function isConnected() {
    return _connected;
}

export function getWalletAddress() {
    return _walletAddress;
}

export function onWalletConnect(cb) {
    _onConnectCbs.push(cb);
}

export function onWalletDisconnect(cb) {
    _onDisconnectCbs.push(cb);
}

export function openProfile() {
    window.parent.postMessage({ type: 'open-profile' }, '*');
}

export function getWalletStorageKey() {
    return _walletAddress ? `cb_${_walletAddress}_` : 'cb_guest_';
}

export async function tryAutoReconnect() {
    window.parent.postMessage({ type: 'check-wallet' }, '*');
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 2000);
        const handler = (event) => {
            if (event.data?.type === 'wallet-connected') {
                clearTimeout(timeout);
                window.removeEventListener('message', handler);
                resolve(true);
            }
        };
        window.addEventListener('message', handler);
    });
}

export async function fetchLeaderboard() {
    window.parent.postMessage({ type: 'fetch-leaderboard' }, '*');
    return new Promise((resolve) => {
        window._leaderboardResolve = resolve;
        setTimeout(() => {
            if (window._leaderboardResolve) {
                window._leaderboardResolve([]);
                window._leaderboardResolve = null;
            }
        }, 10000);
    });
}

export async function getWalletBalance() {
    return 0; // Not needed for Base (gasless via Paymaster)
}

// ===== Stubs for MagicBlock ER functions (not used on Base) =====
export async function startGameSession() { return true; }
export function recordSwap() { }
export async function delegatePlayerAccount() { return true; }
export async function startSessionOnER() { return true; }
export function recordSwapOnER() { }

export async function commitAndUndelegate(starCount) {
    // On Base, no commit/undelegate — the score is submitted directly
    // Return true so the game flow proceeds to submitScore
    return true;
}

export async function fetchPlayerProgress() {
    window.parent.postMessage({ type: 'fetch-progress' }, '*');
    return new Promise((resolve) => {
        window._progressResolve = resolve;
        setTimeout(() => {
            if (window._progressResolve) {
                window._progressResolve(null);
                window._progressResolve = null;
            }
        }, 10000);
    });
}

export async function waitForPDASettlement() {
    // On Base, no PDA settlement needed
    return true;
}

// ===== BASENAME RESOLUTION =====

export async function resolveAddresses(addresses) {
    if (!addresses || addresses.length === 0) return {};

    // Check which addresses we still need to resolve
    const uncached = addresses.filter(a => !(a.toLowerCase() in _nameCache));

    if (uncached.length > 0) {
        try {
            const resp = await fetch('/api/resolve-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addresses: uncached }),
            });
            const names = await resp.json();
            // Store results in cache (including nulls for addresses without names)
            for (const addr of uncached) {
                _nameCache[addr.toLowerCase()] = names[addr.toLowerCase()] || null;
            }
        } catch (e) {
            console.warn('[resolveAddresses] API failed:', e);
            // Cache as null so we don't retry
            for (const addr of uncached) {
                _nameCache[addr.toLowerCase()] = null;
            }
        }
    }

    // Build result from cache
    const result = {};
    for (const addr of addresses) {
        const name = _nameCache[addr.toLowerCase()];
        if (name) result[addr.toLowerCase()] = name;
    }
    return result;
}
