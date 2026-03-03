// ===== IMPORTS =====
import { Storage } from './storage.js';
import { STAR_THRESHOLDS, LEVELS, GRID, HINT_DELAY, CANDY_TILES } from './config.js';
import { initAudio, playSound, startMusic, stopMusic, toggleMusic, changeVolume, changeSfxVolume, getMusicVolume, getSfxVolume } from './audio.js';
import { showCombo, spawnRocketTrail, spawnBombShockwave, spawnRainbowWave, spawnLightningEffect, spawnGodRays, spawnLightBurst, showCinematicVignette, showScreenTint, boardCinematicZoom, showCompliment, spawnParticles, showScorePopup, createConfetti, startFireworks, stopFireworks } from './effects.js';
import { initBlockchain, connectWallet, disconnectWallet, submitScore, isConnected, getWalletAddress, onWalletConnect, onWalletDisconnect, openProfile, getWalletStorageKey, tryAutoReconnect, fetchLeaderboard, getWalletBalance, startGameSession, recordSwap, delegatePlayerAccount, startSessionOnER, recordSwapOnER, commitAndUndelegate, fetchPlayerProgress, waitForPDASettlement, resolveAddresses } from './blockchain-bridge.js';

// Expose globals for HTML inline events
window.openSettings = openSettings;
window.changeVolume = function (val) { changeVolume(val); updateVolumeIcon(val); document.getElementById('volumeValue').textContent = val + '%'; };
window.changeSfxVolume = function (val) { changeSfxVolume(val); updateSfxIcon(val); document.getElementById('sfxValue').textContent = val + '%'; playSound('select'); };
window.showMap = showMap;
window.backToMap = backToMap;

window.openLeaderboard = async function () {
    showScreen('leaderboardScreen');
    const table = document.getElementById('leaderboardTable');
    const footer = document.querySelector('.lb-footer');
    if (footer) footer.textContent = '';

    // Show loading spinner
    const header = table.querySelector('.lb-header');
    table.innerHTML = '';
    if (header) table.appendChild(header);
    const spinner = document.createElement('div');
    spinner.className = 'lb-spinner';
    spinner.innerHTML = '<div class="lb-spinner-circle"></div><div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-top: 10px;">Loading leaderboard...</div>';
    table.appendChild(spinner);

    try {
        const players = await fetchLeaderboard();
        const header = table.querySelector('.lb-header');
        table.innerHTML = '';
        if (header) table.appendChild(header);

        if (players.length === 0) {
            if (footer) footer.textContent = 'No players on-chain yet. Be the first!';
            table.appendChild(footer);
            return;
        }

        const myWallet = isConnected() ? getWalletAddress() : '';

        // Resolve all addresses to Basenames
        const allAddresses = players.slice(0, 20).map(e => e.player);
        if (myWallet && !allAddresses.includes(myWallet)) allAddresses.push(myWallet);
        const names = await resolveAddresses(allAddresses);

        let rank = 1;
        let myRank = -1;
        let myEntry = null;

        for (let i = 0; i < players.length; i++) {
            if (players[i].player === myWallet) {
                myRank = i + 1;
                myEntry = players[i];
            }
        }

        for (const entry of players.slice(0, 20)) {
            const row = document.createElement('div');
            row.className = 'lb-row';
            const isMe = entry.player === myWallet;
            const basename = names[entry.player.toLowerCase()];
            const displayName = basename ? basename : `Player #${rank}`;
            const meTag = isMe ? ' (you)' : '';
            const nameStyle = isMe ? 'color: #14F195; font-weight: 700;' : '';

            row.innerHTML = `
                <span class="lb-rank">${rank}</span>
                <span class="lb-player" style="${nameStyle}" title="${entry.player}">${displayName}${meTag}</span>
                <span class="lb-score">${entry.totalScore.toLocaleString()}</span>
            `;
            table.appendChild(row);
            rank++;
        }

        // Show current player's position if not in top 20
        if (myEntry && myRank > 20) {
            const divider = document.createElement('div');
            divider.className = 'lb-row';
            divider.innerHTML = '<span style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.3);">• • •</span>';
            table.appendChild(divider);

            const myRow = document.createElement('div');
            myRow.className = 'lb-row';
            const myBasename = names[myEntry.player.toLowerCase()];
            const myDisplayName = myBasename ? myBasename : `Player #${myRank}`;
            myRow.innerHTML = `
                <span class="lb-rank">${myRank}</span>
                <span class="lb-player" style="color: #14F195; font-weight: 700;" title="${myEntry.player}">${myDisplayName} (you)</span>
                <span class="lb-score">${myEntry.totalScore.toLocaleString()}</span>
            `;
            table.appendChild(myRow);
        }

        if (footer) {
            footer.textContent = `${players.length} player${players.length > 1 ? 's' : ''} on-chain • Powered by Base`;
            footer.style.color = '#14F195';
            table.appendChild(footer);
        }
    } catch (err) {
        console.error('[Leaderboard] Error:', err);
        if (footer) footer.textContent = 'Failed to load on-chain scores';
    }
};
window.toggleHints = toggleHints;
window.manualShuffle = manualShuffle;
window.toggleMusic = toggleMusic;
window.retryLevel = retryLevel;
window.connectWallet = function () { connectWallet(); };
window.openProfile = function () { openProfile(); };

// Callback: runs after wallet successfully connects
onWalletConnect(async () => {
    // Update wallet button on splash
    const walletBtn = document.getElementById('walletBtn');
    const addr = getWalletAddress();
    if (walletBtn) {
        // Show shortened address first, then resolve basename
        walletBtn.textContent = '👤 ' + addr.slice(0, 6) + '...' + addr.slice(-4);
        walletBtn.classList.add('connected');
        // Async: resolve basename and update
        resolveAddresses([addr]).then(names => {
            const basename = names[addr.toLowerCase()];
            if (basename && walletBtn) {
                walletBtn.textContent = '👤 ' + basename;
            }
        });
    }
    // Update wallet button on map
    const mapBtn = document.getElementById('walletBtnMap');
    if (mapBtn) {
        mapBtn.textContent = '🔗';
        mapBtn.title = addr;
        mapBtn.classList.remove('wallet-reconnecting');
    }
    // Load wallet-specific progress (localStorage first, then on-chain)
    loadWalletProgress();
    renderMap();

    // --- Tutorial: show on first visit, then never again ---
    const tutorialBtn = document.getElementById('tutorialBtn');
    const playBtn = document.getElementById('playBtn');
    const profileCheck = document.getElementById('profileCheck');
    if (profileCheck) { profileCheck.classList.add('hidden'); profileCheck.style.display = 'none'; }

    const tutorialKey = 'candyblitz_tutorialSeen_' + addr.toLowerCase();
    const tutorialSeen = localStorage.getItem(tutorialKey);
    if (!tutorialSeen) {
        if (tutorialBtn) tutorialBtn.classList.remove('hidden');
        if (playBtn) playBtn.classList.add('hidden');
    } else {
        if (tutorialBtn) tutorialBtn.classList.add('hidden');
        if (playBtn) playBtn.classList.remove('hidden');
    }

    // Restore progress from on-chain (overrides localStorage if newer)
    (async () => {
        try {
            const progress = await fetchPlayerProgress();
            if (progress) {
                // Restore best scores from on-chain
                let updated = false;
                for (let i = 0; i < LEVELS.length && i < progress.bestScores.length; i++) {
                    const levelId = LEVELS[i].id;
                    const onChainScore = progress.bestScores[i];
                    const onChainStars = progress.stars[i];
                    if (onChainScore > (bestScores[levelId] || 0)) {
                        bestScores[levelId] = onChainScore;
                        updated = true;
                    }
                    if (onChainStars > (bestStars[levelId] || 0)) {
                        bestStars[levelId] = onChainStars;
                        updated = true;
                    }
                    // Restore completed levels: contract stores count, not bitmask
                    // So mark level as completed if it has a score > 0
                    if (onChainScore > 0) {
                        if (!completedLevels.includes(levelId)) {
                            completedLevels.push(levelId);
                            updated = true;
                        }
                    }
                }
                if (updated) {
                    Storage.save(storageKey('bestScores'), bestScores);
                    Storage.save(storageKey('bestStars'), bestStars);
                    Storage.save(storageKey('completed'), completedLevels);
                    renderMap();

                }
            }
        } catch (e) {
            console.warn('[Progress] On-chain sync failed (using local):', e);
        }
    })();
});

// Callback: runs after wallet disconnects
onWalletDisconnect(() => {
    // Hide Play, reset wallet buttons
    const playBtn = document.getElementById('playBtn');
    if (playBtn) playBtn.classList.add('hidden');
    const walletBtn = document.getElementById('walletBtn');
    if (walletBtn) {
        walletBtn.textContent = '🔗 Connect Wallet';
        walletBtn.classList.remove('connected');
    }
    const mapBtn = document.getElementById('walletBtnMap');
    if (mapBtn) {
        mapBtn.textContent = '🔗';
        mapBtn.title = '';
    }
    // Go back to splash
    showScreen('startScreen');
});


// ===== GAME STATE =====
function storageKey(key) {
    const prefix = getWalletStorageKey();
    return prefix + key;
}

function loadWalletProgress() {
    completedLevels = Storage.load(storageKey('completed'), []) || [];
    bestScores = Storage.load(storageKey('bestScores'), {}) || {};
    bestStars = Storage.load(storageKey('bestStars'), {}) || {};
}

let completedLevels = [];
let bestScores = {};
let bestStars = {};
let justUnlockedId = null;
let currentLevelIndex = 0;
let currentCandies = [];
let currentGoal = 3000;
let currentTime = 120;
let board = [];
let boardMask = null; // null = full grid, or 2D array of 0/1
let score = 0;
let timeLeft = 120;
let timerInterval = null;
let selected = null;
let busy = false;
let combo = 0;
let gameEnded = false;
let shuffleUsed = false;

// Board mask helper — returns true if cell is a hole (unplayable)
function isHole(r, c) {
    if (!boardMask) return false;
    return !boardMask[r][c];
}

// Diff-based rendering
let tileElements = [];
let previousBoard = [];

// Touch / swipe support
let touchStart = null;

// Hint system
let hintTimer = null;
let hintsEnabled = Storage.load('hintsEnabled', true);

// Special tiles
let specials = [];
let previousSpecials = [];

document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (btn && !btn.classList.contains('tile')) {
        initAudio(); // ensure AudioContext exists on first interaction
        playSound('button');
    }
});

// ===== SETTINGS =====
function openSettings() {
    // Sync music slider
    const slider = document.getElementById('volumeSlider');
    const pct = Math.round(getMusicVolume() * 100);
    slider.value = pct;
    document.getElementById('volumeValue').textContent = pct + '%';
    updateVolumeIcon(pct);

    // Sync SFX slider
    const sfxSlider = document.getElementById('sfxSlider');
    const sfxPct = Math.round(getSfxVolume() * 100);
    sfxSlider.value = sfxPct;
    document.getElementById('sfxValue').textContent = sfxPct + '%';
    updateSfxIcon(sfxPct);

    // Sync hint toggle
    document.getElementById('hintToggle').checked = hintsEnabled;

    showScreen('settingsScreen');
}

function updateVolumeIcon(pct) {
    const icon = document.getElementById('volumeIcon');
    if (!icon) return;
    if (pct === 0) icon.textContent = '🔇';
    else if (pct < 40) icon.textContent = '🔉';
    else icon.textContent = '🔊';
}

function updateSfxIcon(pct) {
    const icon = document.getElementById('sfxIcon');
    if (!icon) return;
    if (pct === 0) icon.textContent = '🔇';
    else if (pct < 40) icon.textContent = '🔉';
    else icon.textContent = '🔊';
}



// ===== FLOATING HEARTS =====
let heartsInterval;
function spawnFloatingHearts() {
    const container = document.getElementById('floatingHearts');
    if (!container) return;
    const heartEmojis = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍪', '✨'];
    heartsInterval = setInterval(() => {
        const heart = document.createElement('div');
        heart.className = 'floating-heart';
        heart.textContent = heartEmojis[Math.floor(Math.random() * heartEmojis.length)];
        heart.style.left = Math.random() * 90 + 5 + '%';
        heart.style.fontSize = (1.5 + Math.random() * 1.5) + 'rem';
        heart.style.animationDuration = (4 + Math.random() * 3) + 's';
        container.appendChild(heart);
        setTimeout(() => heart.remove(), 8000);
    }, 600);
}
// Script is at bottom of body, DOM is ready
// spawnFloatingHearts(); // disabled

// ===== SCREENS =====
let screenTransitionTimeout = null;

function showScreen(id) {
    const screens = ['startScreen', 'mapScreen', 'gameScreen', 'winScreen', 'loseScreen', 'settingsScreen', 'congratsScreen', 'leaderboardScreen'];
    let activeScreen = null;

    screens.forEach(s => {
        const el = document.getElementById(s);
        if (el && !el.classList.contains('hidden') && !el.classList.contains('hiding') && s !== id) {
            activeScreen = el;
        }
    });

    if (screenTransitionTimeout) {
        clearTimeout(screenTransitionTimeout);
        screenTransitionTimeout = null;
        screens.forEach(s => {
            const el = document.getElementById(s);
            if (el && s !== id) {
                el.classList.remove('hiding');
                el.classList.add('hidden');
            }
        });
    }

    const nextScreen = document.getElementById(id);

    if (activeScreen) {
        activeScreen.classList.add('hiding');
        screenTransitionTimeout = setTimeout(() => {
            activeScreen.classList.remove('hiding');
            activeScreen.classList.add('hidden');
            if (nextScreen) nextScreen.classList.remove('hidden');
        }, 280);
    } else {
        if (nextScreen) nextScreen.classList.remove('hidden');
    }
}

// Card removed — candy splash instead

function showMap() {
    if (heartsInterval) { clearInterval(heartsInterval); heartsInterval = null; }
    const fh = document.getElementById('floatingHearts');
    if (fh) fh.style.display = 'none';
    stopFireworks();
    resetTheme();
    renderMap();
    showScreen('mapScreen');
    // Start music when entering the map (first user action)
    initAudio();
    startMusic();
}

function backToMap() {
    if (timerInterval) clearInterval(timerInterval);
    clearHintTimer();
    showMap();
}

// ===== MAP =====
function getStarCount(score) {
    let stars = 0;
    for (const threshold of STAR_THRESHOLDS) {
        if (score >= threshold) stars++;
    }
    return stars;
}

function renderMap() {
    const container = document.getElementById('mapPath');
    if (!container) return;
    container.innerHTML = '';

    const totalLevels = LEVELS.length;
    const rowHeight = 130;
    const mapHeight = (totalLevels + 1) * rowHeight;
    container.style.minHeight = mapHeight + 'px';
    const positions = [];
    for (let i = 0; i < totalLevels; i++) {
        const row = totalLevels - 1 - i;
        const xPct = (i % 2 === 0) ? 35 : 65;
        const y = rowHeight * 0.8 + row * rowHeight;
        positions.push({ x: xPct, y: y });
    }
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'path-svg');
    svg.setAttribute('viewBox', `0 0 100 ${mapHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    if (positions.length > 1) {
        // Path between levels removed for cleaner look
    }
    container.appendChild(svg);
    const decoEmojis = ['🍬', '🍭', '🍫', '🍩', '🧁', '🍪', '🌸', '🌺', '🦋', '⭐', '🌈', '🎀'];
    for (let d = 0; d < 15; d++) {
        const deco = document.createElement('div');
        deco.className = 'map-deco';
        deco.textContent = decoEmojis[Math.floor(Math.random() * decoEmojis.length)];
        deco.style.left = (5 + Math.random() * 90) + '%';
        deco.style.top = (5 + Math.random() * 90) + '%';
        deco.style.animationDelay = (Math.random() * 4) + 's';
        deco.style.fontSize = (1 + Math.random() * 1) + 'rem';
        container.appendChild(deco);
    }
    let currentNodeEl = null;
    LEVELS.forEach((level, i) => {
        const isCompleted = completedLevels.includes(level.id);
        const isUnlocked = i === 0 || completedLevels.includes(LEVELS[i - 1].id);
        const isCurrent = isUnlocked && !isCompleted;
        const stars = bestStars[level.id] || 0;
        const best = bestScores[level.id];

        const dot = document.createElement('div');
        dot.className = 'level-node'
            + (isCompleted ? ' completed' : '')
            + (!isUnlocked ? ' locked' : '')
            + (isCurrent ? ' current' : '');
        const pos = positions[i];
        dot.style.left = pos.x + '%';
        dot.style.top = pos.y + 'px';

        let innerHTML = '';
        if (isUnlocked && level.img) {
            innerHTML += `<div class="level-node-bg" style="background-image: url('${level.img}'); background-size: 220%; background-position: center; background-color: ${level.zone?.accent || '#333'};"></div>`;
        }

        if (!isUnlocked) {
            innerHTML += `<div class="level-node-icon">${level.icon}</div>`;
            innerHTML += '<div class="level-node-lock">🔒</div>';
        }
        if (isCompleted && stars > 0) innerHTML += `<div class="level-node-stars">${'⭐'.repeat(stars)}</div>`;
        if (isCompleted && best) innerHTML += `<div class="level-node-best">${best}</div>`;
        innerHTML += `<div class="level-node-name">${level.name}</div>`;

        dot.innerHTML = innerHTML;

        if (isUnlocked) {
            dot.onclick = () => startLevel(i);
        }

        // Unlock animation for newly unlocked level
        if (level.id === justUnlockedId) {
            dot.classList.add('unlock-anim');
            setTimeout(() => dot.classList.remove('unlock-anim'), 1500);
        }

        if (isCurrent) currentNodeEl = dot;
        container.appendChild(dot);
    });

    justUnlockedId = null;

    // ===== World 2 Portal (only after ALL levels completed) =====
    const allCompleted = completedLevels.length >= LEVELS.length;
    if (allCompleted && positions.length > 0) {
        const lastPos = positions[positions.length - 1];
        // Portal position: mirror of last level (same distance from left as level is from right)
        const portalX = 100 - lastPos.x;  // 65 → 35
        const portalY = lastPos.y;



        // Portal element
        const portal = document.createElement('div');
        portal.className = 'world-portal';
        portal.style.left = portalX + '%';
        portal.style.top = portalY + 'px';
        portal.innerHTML = `
            <div class="world-portal-glow"></div>
            <div class="world-portal-circle">
                <img class="world-portal-img" src="photos/portal.png" alt="Portal" />
                <div class="world-portal-vortex"></div>
            </div>
            <div class="world-portal-label">WORLD 2</div>
            <div class="world-portal-lock">🔒</div>
        `;
        portal.onclick = showComingSoonPopup;
        container.appendChild(portal);
    }

    const completed = completedLevels.length;
    document.getElementById('progressText').textContent = allCompleted
        ? `${completed}/${LEVELS.length} levels completed ✨`
        : `${completed}/${LEVELS.length} levels completed`;

    // Auto-scroll to current level
    const scrollContainer = document.getElementById('mapScroll');
    if (scrollContainer) {
        requestAnimationFrame(() => {
            if (currentNodeEl) {
                scrollContainer.scrollTop = currentNodeEl.offsetTop - scrollContainer.clientHeight / 2 + 40;
            } else {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        });
    }
}

// ===== Coming Soon Popup =====
function showComingSoonPopup() {
    // Remove existing modal if any
    const existing = document.querySelector('.coming-soon-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'coming-soon-overlay';
    overlay.innerHTML = `
        <div class="coming-soon-modal">
            <h2>✨ Pastry Paradise</h2>
            <p class="modal-subtitle">World 2 — Coming Soon</p>
            <div class="coming-soon-candies">🍰🧇🥞🍮🎂🥧</div>
            <div class="modal-badge">NEW WORLD • NEW CANDIES</div>
            <p style="color: rgba(255,255,255,0.5); font-size: 0.75rem; margin-top: 0.8rem;">
                6 new levels with unique challenges await!
            </p>
            <button class="modal-close">Got it! 🍬</button>
        </div>
    `;

    // Close on backdrop or button click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('modal-close')) {
            overlay.remove();
        }
    });

    document.body.appendChild(overlay);
    playSound('select');
}

// ===== MAP ZOOM & PAN =====
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
let mapPinchStartDist = 0;
let mapPinchStartZoom = 1;
let mapDragStart = null;
let mapDragStartPan = { x: 0, y: 0 };
let mapIsDragging = false;
let mapLastTap = 0;
let mapZoomInitialized = false;

function initMapZoom() {
    if (mapZoomInitialized) return;
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    mapZoomInitialized = true;

    // Pinch to zoom
    viewport.addEventListener('touchstart', onMapTouchStart, { passive: false });
    viewport.addEventListener('touchmove', onMapTouchMove, { passive: false });
    viewport.addEventListener('touchend', onMapTouchEnd, { passive: false });

    // Mouse wheel zoom (desktop)
    viewport.addEventListener('wheel', onMapWheel, { passive: false });

    // Mouse drag (desktop)
    viewport.addEventListener('mousedown', onMapMouseDown);
    window.addEventListener('mousemove', onMapMouseMove);
    window.addEventListener('mouseup', onMapMouseUp);
}

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function onMapTouchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        mapPinchStartDist = getTouchDist(e.touches);
        mapPinchStartZoom = mapZoom;
    } else if (e.touches.length === 1 && mapZoom > 1) {
        // Record drag start but DON'T preventDefault — allow tap-through to cities
        mapDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        mapDragStartPan = { x: mapPanX, y: mapPanY };
        mapIsDragging = false;
    }

    // Double tap detection
    if (e.touches.length === 1) {
        const now = Date.now();
        if (now - mapLastTap < 300) {
            e.preventDefault();
            if (mapZoom > 1) {
                resetMapZoom();
            } else {
                // Zoom in to 2x centered on tap point
                const viewport = document.getElementById('mapViewport');
                const rect = viewport.getBoundingClientRect();
                const cx = e.touches[0].clientX - rect.left;
                const cy = e.touches[0].clientY - rect.top;
                setMapZoom(2.5, cx, cy);
            }
        }
        mapLastTap = now;
    }
}

function onMapTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const newZoom = Math.min(3, Math.max(1, mapPinchStartZoom * (dist / mapPinchStartDist)));
        const viewport = document.getElementById('mapViewport');
        const rect = viewport.getBoundingClientRect();
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        setMapZoom(newZoom, cx, cy);
    } else if (e.touches.length === 1 && mapDragStart && mapZoom > 1) {
        const dx = e.touches[0].clientX - mapDragStart.x;
        const dy = e.touches[0].clientY - mapDragStart.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
            if (!mapIsDragging) e.preventDefault(); // prevent scrolling once drag starts
            mapIsDragging = true;
        }
        if (mapIsDragging) {
            e.preventDefault();
            mapPanX = mapDragStartPan.x + dx;
            mapPanY = mapDragStartPan.y + dy;
            clampPan();
            applyMapTransform();
        }
    }
}

function onMapTouchEnd(e) {
    if (e.touches.length < 2) {
        mapPinchStartDist = 0;
    }
    if (e.touches.length === 0) {
        if (mapIsDragging) {
            e.preventDefault();
        } else if (mapDragStart && mapZoom > 1) {
            // It was a tap (no drag) while zoomed — find and click the element under finger
            const touch = e.changedTouches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const dot = el.closest('.level-dot');
                if (dot) dot.click();
            }
        }
        mapDragStart = null;
        mapIsDragging = false;
    }
    if (mapZoom <= 1.05) resetMapZoom();
}

// Desktop: mouse wheel
function onMapWheel(e) {
    e.preventDefault();
    const viewport = document.getElementById('mapViewport');
    const rect = viewport.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(3, Math.max(1, mapZoom * delta));
    setMapZoom(newZoom, cx, cy);
    if (mapZoom <= 1.05) resetMapZoom();
}

// Desktop: mouse drag
function onMapMouseDown(e) {
    if (mapZoom > 1) {
        e.preventDefault();
        mapDragStart = { x: e.clientX, y: e.clientY };
        mapDragStartPan = { x: mapPanX, y: mapPanY };
        mapIsDragging = false;
    }
}

function onMapMouseMove(e) {
    if (mapDragStart && mapZoom > 1) {
        const dx = e.clientX - mapDragStart.x;
        const dy = e.clientY - mapDragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mapIsDragging = true;
        mapPanX = mapDragStartPan.x + dx;
        mapPanY = mapDragStartPan.y + dy;
        clampPan();
        applyMapTransform();
    }
}

function onMapMouseUp() {
    mapDragStart = null;
    mapIsDragging = false;
}

function setMapZoom(newZoom, cx, cy) {
    const container = document.getElementById('mapGrid');
    if (!container) return;

    // Adjust pan to keep the point under the cursor stable
    const ratio = newZoom / mapZoom;
    mapPanX = cx - ratio * (cx - mapPanX);
    mapPanY = cy - ratio * (cy - mapPanY);
    mapZoom = newZoom;

    clampPan();
    applyMapTransform();

    const viewport = document.getElementById('mapViewport');
    if (viewport) {
        viewport.classList.toggle('zoomed', mapZoom > 1.05);
    }
}

function clampPan() {
    const viewport = document.getElementById('mapViewport');
    if (!viewport) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const maxPanX = 0;
    const minPanX = vw - vw * mapZoom;
    const maxPanY = 0;
    const minPanY = vh - vh * mapZoom;
    mapPanX = Math.min(maxPanX, Math.max(minPanX, mapPanX));
    mapPanY = Math.min(maxPanY, Math.max(minPanY, mapPanY));
}

function applyMapTransform() {
    const container = document.getElementById('mapGrid');
    if (!container) return;
    container.style.transition = 'none';
    container.style.transform = `translate(${mapPanX}px, ${mapPanY}px) scale(${mapZoom})`;
}

function resetMapZoom() {
    mapZoom = 1;
    mapPanX = 0;
    mapPanY = 0;
    const container = document.getElementById('mapGrid');
    if (container) {
        container.style.transition = 'transform 0.3s ease-out';
        container.style.transform = 'translate(0, 0) scale(1)';
    }
    const viewport = document.getElementById('mapViewport');
    if (viewport) viewport.classList.remove('zoomed');
}

// Initialize zoom when map is first shown
const _origShowMap = showMap;
showMap = function () {
    _origShowMap();
    initMapZoom();
};

// Gallery and photo preloading removed — using emoji tiles

// ===== THEMES =====
function applyTheme(level) {
    const t = level.theme;
    if (!t) return;
    // body background stays consistent (dark glassmorphism)
    const boardContainer = document.querySelector('.board-container');
    if (boardContainer) {
        boardContainer.style.background = t.card;
        boardContainer.style.borderColor = t.border;
        boardContainer.style.boxShadow = `0 8px 32px ${t.border}`;
    }
    // Accent color for header and stats
    document.documentElement.style.setProperty('--theme-accent', t.accent);
}

function resetTheme() {
    // body background stays consistent (dark glassmorphism)
    const boardContainer = document.querySelector('.board-container');
    if (boardContainer) {
        boardContainer.style.background = '';
        boardContainer.style.borderColor = '';
        boardContainer.style.boxShadow = '';
    }
    document.documentElement.style.removeProperty('--theme-accent');
}

// ===== ONBOARDING =====
let pendingLevelIndex = null;

function showOnboarding(levelIndex) {
    pendingLevelIndex = levelIndex;
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        showOnboardingSlide(0);
    }
}

// Called from Tutorial button on splash screen
function startTutorialFromSplash() {
    pendingLevelIndex = null; // No pending level, just tutorial
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.style.display = 'flex';
        showOnboardingSlide(0);
    }
}

let currentOnboardingSlide = 0;
const totalOnboardingSlides = 4;

function showOnboardingSlide(index) {
    currentOnboardingSlide = index;
    for (let i = 0; i < totalOnboardingSlides; i++) {
        const slide = document.getElementById('onb-slide-' + i);
        if (slide) slide.style.display = i === index ? 'flex' : 'none';
    }
    // Update dots
    const dots = document.querySelectorAll('.onb-dot');
    dots.forEach((d, i) => {
        d.classList.toggle('active', i === index);
    });
    // Update buttons
    const nextBtn = document.getElementById('onbNextBtn');
    if (nextBtn) {
        nextBtn.textContent = index === totalOnboardingSlides - 1 ? 'Got it! 🎮' : 'Next →';
    }
}

function onboardingNext() {
    if (currentOnboardingSlide < totalOnboardingSlides - 1) {
        showOnboardingSlide(currentOnboardingSlide + 1);
    } else {
        dismissOnboarding();
    }
}

function dismissOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.style.display = 'none';
    }
    // Mark tutorial as seen for current wallet
    const addr = typeof getWalletAddress === 'function' ? getWalletAddress() : '';
    if (addr) localStorage.setItem('candyblitz_tutorialSeen_' + addr.toLowerCase(), 'true');
    if (pendingLevelIndex !== null) {
        // Came from startLevel — continue to the level
        startLevel(pendingLevelIndex);
        pendingLevelIndex = null;
    } else {
        // Came from splash Tutorial button — show Play button
        const tutorialBtn = document.getElementById('tutorialBtn');
        const playBtn = document.getElementById('playBtn');
        if (tutorialBtn) tutorialBtn.classList.add('hidden');
        if (playBtn) playBtn.classList.remove('hidden');
    }
}

// Expose onboarding functions to global scope (needed for inline onclick in module)
window.showOnboardingSlide = showOnboardingSlide;
window.onboardingNext = onboardingNext;
window.dismissOnboarding = dismissOnboarding;
window.startTutorialFromSplash = startTutorialFromSplash;

// ===== GAME =====
function startLevel(levelIndex) {
    currentLevelIndex = levelIndex;
    const level = LEVELS[levelIndex];

    currentGoal = level.goal;
    currentTime = level.time;
    currentCandies = CANDY_TILES.slice(0, level.types);

    // Apply candy theme
    applyTheme(level);

    // Update UI
    document.getElementById('levelHeader').textContent = level.icon + ' ' + level.name;
    currentProgressStage = 0; // reset for multi-stage progress bar

    // Show best score
    const best = bestScores[level.id];
    document.getElementById('bestScoreDisplay').textContent = best || '—';

    // Reset shuffle button
    shuffleUsed = false;
    const sBtn = document.getElementById('shuffleBtn');
    if (sBtn) {
        sBtn.style.opacity = '1';
        sBtn.style.cursor = 'pointer';
    }

    initAudio();
    score = 0;
    timeLeft = currentTime;
    combo = 0;
    selected = null;
    busy = false;
    gameEnded = false;

    // Start blockchain session for this level
    startGameSession(levelIndex);

    document.getElementById('score').textContent = '0';
    document.getElementById('timer').textContent = formatTime(timeLeft);
    document.getElementById('timerBox').classList.remove('warning');
    updateProgressBar();

    initBoard();
    createBoardDOM();

    // Show the game screen with ER loading overlay
    const erOverlay = document.getElementById('erLoadingOverlay');
    const erText = document.getElementById('erLoadingText');
    erOverlay.classList.remove('hidden');
    erText.textContent = '⏳ Preparing game...';
    busy = true; // Block board interactions

    showScreen('gameScreen');

    // Await ER delegation (with 10s timeout), THEN start the timer
    (async () => {
        let erReady = false;
        try {
            const erPromise = (async () => {
                erText.textContent = '⏳ Delegating account — approve in wallet...';
                const delegated = await delegatePlayerAccount();
                if (delegated) {
                    erText.textContent = '⚡ Starting session — approve in wallet...';
                    await startSessionOnER(levelIndex);
                    return true;
                }
                return false;
            })();

            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('ER timeout')), 30000)
            );

            erReady = await Promise.race([erPromise, timeoutPromise]);
        } catch (e) {
            console.warn('[Base] Setup failed/timed out, using fallback:', e.message);
        }

        // Hide overlay and start the game
        erOverlay.classList.add('hidden');
        busy = false;

        if (erReady) {
            erText.textContent = '✅ Connected!';

        } else {

        }

        // NOW start the timer
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            timeLeft--;
            document.getElementById('timer').textContent = formatTime(timeLeft);
            if (timeLeft <= 15) {
                document.getElementById('timerBox').classList.add('warning');
                if (timeLeft === 15) playSound('timer-warning');
            }
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                endGame();
            }
        }, 1000);

        startMusic();
        resetHintTimer();
    })();
}

function retryLevel() {
    startLevel(currentLevelIndex);
}

// ===== BOARD LOGIC =====
function initBoard() {
    const types = LEVELS[currentLevelIndex].types;
    boardMask = LEVELS[currentLevelIndex].mask || null;
    board = [];
    specials = [];
    for (let r = 0; r < GRID; r++) {
        board[r] = [];
        specials[r] = [];
        for (let c = 0; c < GRID; c++) {
            if (isHole(r, c)) {
                board[r][c] = -1; // hole marker
                specials[r][c] = null;
            } else {
                board[r][c] = Math.floor(Math.random() * types);
                specials[r][c] = null;
            }
        }
    }
    // Remove initial matches
    let attempts = 0;
    while (getMatches().length > 0 && attempts < 100) {
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (!isHole(r, c)) {
                    board[r][c] = Math.floor(Math.random() * types);
                }
            }
        }
        attempts++;
    }
    // Ensure at least one valid move
    if (!findPossibleMove()) {
        initBoard(); // retry
    }
}

// ===== DIFF-BASED RENDERING =====
function createBoardDOM() {
    const el = document.getElementById('board');
    el.innerHTML = '';
    tileElements = [];
    previousBoard = [];
    previousSpecials = [];

    for (let r = 0; r < GRID; r++) {
        tileElements[r] = [];
        previousBoard[r] = [];
        previousSpecials[r] = [];
        for (let c = 0; c < GRID; c++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.dataset.r = r;
            tile.dataset.c = c;

            if (isHole(r, c)) {
                tile.classList.add('hole');
            } else {
                // Click handler
                tile.addEventListener('click', () => clickTile(r, c));
                // Touch handlers for swipe
                setupTileTouch(tile, r, c);
            }

            el.appendChild(tile);
            tileElements[r][c] = tile;
            previousBoard[r][c] = -1; // force initial update
            previousSpecials[r][c] = null;
        }
    }
    updateBoard(false);
}

function updateBoard(animated) {
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const tile = tileElements[r][c];
            if (!tile) continue;
            if (isHole(r, c)) continue; // skip holes
            const type = board[r][c];

            if (previousBoard[r][c] !== type) {
                tile.style.backgroundImage = 'none';
                if (type !== null && type >= 0 && type < currentCandies.length) {
                    tile.textContent = currentCandies[type];
                } else {
                    tile.textContent = '';
                }
                previousBoard[r][c] = type;

                if (animated) {
                    tile.classList.add('falling');
                    setTimeout(() => tile.classList.remove('falling'), 500);
                }
            }

            // Clear interaction states
            tile.classList.remove('selected', 'matched', 'glowing', 'swapping', 'hint', 'activating');
            tile.style.transform = '';
            tile.style.opacity = '1';

            // Update special tile visuals
            const sp = specials[r] && specials[r][c];
            if (sp !== previousSpecials[r][c]) {
                tile.classList.remove('special-rocket-h', 'special-rocket-v', 'special-bomb', 'special-rainbow', 'special-lightning');
                if (sp) {
                    tile.classList.add('special-' + sp);
                    tile.textContent = '';
                } else {
                    // Restore candy emoji when special is removed
                    const type = board[r][c];
                    if (type !== null && type >= 0 && type < currentCandies.length) {
                        tile.textContent = currentCandies[type];
                    }
                }
                previousSpecials[r][c] = sp;
            }
        }
    }
}

function getTile(r, c) {
    return tileElements[r] && tileElements[r][c];
}

// ===== TOUCH / SWIPE SUPPORT =====
function setupTileTouch(tile, r, c) {
    tile.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        touchStart = { x: touch.clientX, y: touch.clientY, r: r, c: c };
    }, { passive: false });

    tile.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!touchStart) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - touchStart.x;
        const dy = touch.clientY - touchStart.y;
        const threshold = 25;

        if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) {
            // Tap — treat as click
            clickTile(touchStart.r, touchStart.c);
        } else {
            // Swipe — direct swap
            let tr = touchStart.r;
            let tc = touchStart.c;
            if (Math.abs(dx) > Math.abs(dy)) {
                tc += dx > 0 ? 1 : -1;
            } else {
                tr += dy > 0 ? 1 : -1;
            }
            if (tr >= 0 && tr < GRID && tc >= 0 && tc < GRID && !busy && !isHole(tr, tc) && !isHole(touchStart.r, touchStart.c)) {
                selected = null;
                clearHints();
                playSound('swap');
                trySwap(touchStart.r, touchStart.c, tr, tc);
            }
        }
        touchStart = null;
    }, { passive: false });
}

// ===== TILE INTERACTION =====
function clickTile(r, c) {
    if (busy || isHole(r, c)) return;
    clearHints();
    resetHintTimer();

    if (!selected) {
        selected = { r, c };
        getTile(r, c).classList.add('selected');
        playSound('select');
    } else if (selected.r === r && selected.c === c) {
        getTile(r, c).classList.remove('selected');
        selected = null;
        // Double-click on special tile: activate immediately
        if (specials[r][c]) {
            busy = true;
            combo = 0;
            clearHintTimer();
            const spType = specials[r][c];
            specials[r][c] = null;
            const cleared = new Set();
            // Add activation animation
            const activTile = getTile(r, c);
            if (activTile) activTile.classList.add('activating');
            if (spType === 'rainbow') {
                // Pick most common type on board
                const counts = {};
                for (let rr = 0; rr < GRID; rr++)
                    for (let cc = 0; cc < GRID; cc++) {
                        if (isHole(rr, cc)) continue;
                        const t = board[rr][cc];
                        if (t !== null) counts[t] = (counts[t] || 0) + 1;
                    }
                let bestType = 0, bestCount = 0;
                for (const t in counts) if (counts[t] > bestCount) { bestType = Number(t); bestCount = counts[t]; }
                activateRainbow(r, c, bestType).then(() => processMatches()).then(() => {
                    busy = false;
                    resetHintTimer();
                    checkDeadlock();
                });
            } else {
                collectSpecialEffect(r, c, spType, cleared);
                // Chain reaction
                let chainLoop = true;
                let chainIter = 0;
                while (chainLoop && chainIter < 20) {
                    chainLoop = false;
                    chainIter++;
                    for (const key of [...cleared]) {
                        const [rr, cc] = key.split(',').map(Number);
                        if (specials[rr] && specials[rr][cc]) {
                            const st = specials[rr][cc];
                            specials[rr][cc] = null;
                            collectSpecialEffect(rr, cc, st, cleared);
                            chainLoop = true;
                        }
                    }
                }
                (async () => {
                    let pts = 0;
                    for (const key of cleared) {
                        const [rr, cc] = key.split(',').map(Number);
                        if (board[rr][cc] !== null) {
                            pts += 12;
                            const tile = getTile(rr, cc);
                            if (tile) {
                                tile.classList.add('matched', 'glowing');
                                const rect = tile.getBoundingClientRect();
                                spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
                            }
                            board[rr][cc] = null;
                            specials[rr][cc] = null;
                        }
                    }
                    score += pts;
                    document.getElementById('score').textContent = score;
                    updateProgressBar();
                    playSound('combo');
                    await sleep(400);
                    doGravityAndFill();
                    invalidateClearedColumns(cleared);
                    updateBoard(true);
                    await sleep(300);
                    await processMatches();
                    busy = false;
                    resetHintTimer();
                    checkDeadlock();
                })();
            }
            return;
        }
    } else if (isAdj(selected, { r, c })) {
        getTile(selected.r, selected.c).classList.remove('selected');
        playSound('swap');
        trySwap(selected.r, selected.c, r, c);
        selected = null;
    } else {
        getTile(selected.r, selected.c).classList.remove('selected');
        selected = { r, c };
        getTile(r, c).classList.add('selected');
        playSound('select');
    }
}

function isAdj(a, b) {
    return (Math.abs(a.r - b.r) === 1 && a.c === b.c)
        || (Math.abs(a.c - b.c) === 1 && a.r === b.r);
}

// ===== SWAP LOGIC =====
async function trySwap(r1, c1, r2, c2) {
    // Block swap if either cell is a hole
    if (isHole(r1, c1) || isHole(r2, c2)) return;
    busy = true;
    combo = 0;
    clearHintTimer();

    const s1 = specials[r1][c1];
    const s2 = specials[r2][c2];

    // Animated swap
    const tile1 = getTile(r1, c1);
    const tile2 = getTile(r2, c2);
    const tileSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size'));
    const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--gap'));
    const step = tileSize + gap;

    if (tile1 && tile2) {
        tile1.classList.add('swapping');
        tile2.classList.add('swapping');
        const dx = (c2 - c1) * step;
        const dy = (r2 - r1) * step;
        tile1.style.transform = `translate(${dx}px, ${dy}px)`;
        tile2.style.transform = `translate(${-dx}px, ${-dy}px)`;
        await sleep(250);
    }

    swap(r1, c1, r2, c2);
    updateBoard(false);
    await sleep(50);

    // Special combo: two specials swapped together
    if (s1 && s2) {
        await activateSpecialCombo(r1, c1, r2, c2, s1, s2);
        busy = false;
        resetHintTimer();
        checkDeadlock();
        return;
    }

    // Rainbow swap: rainbow + any tile (no match needed)
    // NOTE: s1/s2 are pre-swap specials; after swap(), positions are swapped.
    // If s1 was rainbow at (r1,c1), after swap it's now at (r2,c2).
    if (s1 === 'rainbow' || s2 === 'rainbow') {
        const rainbowR = s1 === 'rainbow' ? r2 : r1;
        const rainbowC = s1 === 'rainbow' ? c2 : c1;
        const targetR = s1 === 'rainbow' ? r1 : r2;
        const targetC = s1 === 'rainbow' ? c1 : c2;
        const targetType = board[targetR][targetC];
        await activateRainbow(rainbowR, rainbowC, targetType);
        await processMatches();
        busy = false;
        resetHintTimer();
        checkDeadlock();
        return;
    }

    if (getMatches().length > 0) {
        // Record swap locally + on ER (fire-and-forget, no wallet popup — signed with ephemeral keypair)
        recordSwap(r1, c1, r2, c2, 0);
        const scoreBefore = score;
        await processMatches({ r1, c1, r2, c2 });
        const scoreDelta = score - scoreBefore;
        if (scoreDelta > 0) recordSwapOnER(scoreDelta);
    } else {
        // Swap back with animation
        const t1 = getTile(r1, c1);
        const t2 = getTile(r2, c2);
        if (t1 && t2) {
            t1.classList.add('swapping');
            t2.classList.add('swapping');
            const dx = (c2 - c1) * step;
            const dy = (r2 - r1) * step;
            t1.style.transform = `translate(${dx}px, ${dy}px)`;
            t2.style.transform = `translate(${-dx}px, ${-dy}px)`;
            await sleep(250);
        }
        swap(r1, c1, r2, c2);
        updateBoard(false);
    }

    busy = false;
    resetHintTimer();
    checkDeadlock();
}

function swap(r1, c1, r2, c2) {
    const tmp = board[r1][c1];
    board[r1][c1] = board[r2][c2];
    board[r2][c2] = tmp;
    const tmpS = specials[r1][c1];
    specials[r1][c1] = specials[r2][c2];
    specials[r2][c2] = tmpS;
}

// ===== MATCH DETECTION =====
function getMatches() {
    const matched = new Set();
    // Horizontal
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID - 2; c++) {
            const t = board[r][c];
            if (t === null || t === -1) continue;
            if (board[r][c + 1] === t && board[r][c + 2] === t) {
                let end = c + 2;
                while (end < GRID - 1 && board[r][end + 1] === t) end++;
                for (let i = c; i <= end; i++) matched.add(`${r},${i}`);
            }
        }
    }
    // Vertical
    for (let c = 0; c < GRID; c++) {
        for (let r = 0; r < GRID - 2; r++) {
            const t = board[r][c];
            if (t === null || t === -1) continue;
            if (board[r + 1][c] === t && board[r + 2][c] === t) {
                let end = r + 2;
                while (end < GRID - 1 && board[end + 1][c] === t) end++;
                for (let i = r; i <= end; i++) matched.add(`${i},${c}`);
            }
        }
    }
    // 2x2 Square
    for (let r = 0; r < GRID - 1; r++) {
        for (let c = 0; c < GRID - 1; c++) {
            const t = board[r][c];
            if (t === null || t === -1) continue;
            if (board[r][c + 1] === t && board[r + 1][c] === t && board[r + 1][c + 1] === t) {
                matched.add(`${r},${c}`);
                matched.add(`${r},${c + 1}`);
                matched.add(`${r + 1},${c}`);
                matched.add(`${r + 1},${c + 1}`);
            }
        }
    }
    return Array.from(matched).map(s => {
        const [r, c] = s.split(',').map(Number);
        return { r, c };
    });
}

// Find match groups with direction and length
function findMatchGroups() {
    const groups = [];
    // Horizontal groups
    for (let r = 0; r < GRID; r++) {
        let c = 0;
        while (c < GRID) {
            const t = board[r][c];
            if (t === null || t === -1) { c++; continue; }
            let end = c;
            while (end < GRID - 1 && board[r][end + 1] === t) end++;
            if (end - c + 1 >= 3) {
                const cells = [];
                for (let i = c; i <= end; i++) cells.push({ r, c: i });
                groups.push({ cells, len: end - c + 1, dir: 'h' });
            }
            c = end + 1;
        }
    }
    // Vertical groups
    for (let c = 0; c < GRID; c++) {
        let r = 0;
        while (r < GRID) {
            const t = board[r][c];
            if (t === null || t === -1) { r++; continue; }
            let end = r;
            while (end < GRID - 1 && board[end + 1][c] === t) end++;
            if (end - r + 1 >= 3) {
                const cells = [];
                for (let i = r; i <= end; i++) cells.push({ r: i, c });
                groups.push({ cells, len: end - r + 1, dir: 'v' });
            }
            r = end + 1;
        }
    }
    // 2x2 squares
    for (let r = 0; r < GRID - 1; r++) {
        for (let c = 0; c < GRID - 1; c++) {
            const t = board[r][c];
            if (t === null || t === -1) continue;
            if (board[r][c + 1] === t && board[r + 1][c] === t && board[r + 1][c + 1] === t) {
                groups.push({
                    cells: [{ r, c }, { r, c: c + 1 }, { r: r + 1, c }, { r: r + 1, c: c + 1 }],
                    len: 4, dir: 'square'
                });
            }
        }
    }
    return groups;
}

// ===== MATCH PROCESSING =====
async function processMatches(swapPos) {
    let allMatched = getMatches();
    while (allMatched.length > 0) {
        combo++;

        // Analyze match groups for special creation
        const groups = findMatchGroups();
        groups.sort((a, b) => b.len - a.len);

        const specialCreations = [];
        const protectedCells = new Set();

        for (const group of groups) {
            let specialType = null;
            if (group.len >= 5) {
                specialType = 'rainbow';
            } else if (group.len === 4 && group.dir !== 'square') {
                specialType = group.dir === 'h' ? 'rocket-v' : 'rocket-h';
            } else if (group.dir === 'square') {
                specialType = 'lightning';
            }

            if (specialType) {
                // Prefer the swapped tile position (Candy Crush style)
                let pos = null;
                if (swapPos) {
                    // Check if either swapped cell is in this group
                    const inGroup1 = group.cells.find(cell => cell.r === swapPos.r1 && cell.c === swapPos.c1);
                    const inGroup2 = group.cells.find(cell => cell.r === swapPos.r2 && cell.c === swapPos.c2);
                    if (inGroup1) pos = inGroup1;
                    else if (inGroup2) pos = inGroup2;
                }
                if (!pos) {
                    // Fallback to middle (for cascading matches)
                    const midIdx = Math.floor(group.cells.length / 2);
                    pos = group.cells[midIdx];
                }
                const key = `${pos.r},${pos.c}`;
                if (!protectedCells.has(key)) {
                    specialCreations.push({ r: pos.r, c: pos.c, type: specialType });
                    protectedCells.add(key);
                }
            }
        }

        // T/L shape detection: two 3-groups (one H, one V) sharing a cell → bomb
        const hGroups3 = groups.filter(g => g.len === 3 && g.dir === 'h');
        const vGroups3 = groups.filter(g => g.len === 3 && g.dir === 'v');
        for (const hg of hGroups3) {
            for (const vg of vGroups3) {
                // Find shared cell
                for (const hc of hg.cells) {
                    for (const vc of vg.cells) {
                        if (hc.r === vc.r && hc.c === vc.c) {
                            const key = `${hc.r},${hc.c}`;
                            if (!protectedCells.has(key)) {
                                // Check same tile type
                                if (board[hg.cells[0].r][hg.cells[0].c] === board[vg.cells[0].r][vg.cells[0].c]) {
                                    specialCreations.push({ r: hc.r, c: hc.c, type: 'bomb' });
                                    protectedCells.add(key);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Collect existing specials that will be destroyed
        const specialsToActivate = [];
        for (const m of allMatched) {
            const key = `${m.r},${m.c}`;
            if (specials[m.r][m.c] && !protectedCells.has(key)) {
                specialsToActivate.push({ r: m.r, c: m.c, type: specials[m.r][m.c] });
            }
        }

        // Score: base match + bonus for creating specials
        const comboMult = combo > 1 ? 1.5 * combo : 1;
        let basePts = allMatched.length * 10;
        // Bonus for special creations
        for (const sc of specialCreations) {
            if (sc.type === 'rainbow') basePts += 50;
            else if (sc.type === 'bomb') basePts += 25;
            else if (sc.type === 'rocket-h' || sc.type === 'rocket-v') basePts += 20;
            else if (sc.type === 'lightning') basePts += 15;
        }
        const pts = Math.round(basePts * comboMult);
        score += pts;
        document.getElementById('score').textContent = score;
        updateProgressBar();

        playSound('match');
        if (combo > 1) { showCombo(combo); playSound('combo'); }
        if (combo >= 2 && Math.random() < 0.5) showCompliment();

        // Animate matched tiles
        let centerX = 0, centerY = 0;
        for (const m of allMatched) {
            const tile = getTile(m.r, m.c);
            if (tile) {
                if (!protectedCells.has(`${m.r},${m.c}`)) {
                    tile.classList.add('matched');
                }
                tile.classList.add('glowing');
                const rect = tile.getBoundingClientRect();
                centerX += rect.left + rect.width / 2;
                centerY += rect.top + rect.height / 2;
                spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 2);
            }
        }

        if (allMatched.length > 0) {
            centerX /= allMatched.length;
            centerY /= allMatched.length;
            showScorePopup(pts, centerX, centerY);
        }

        await sleep(400);

        // Clear matched tiles (except protected cells where specials will be placed)
        for (const m of allMatched) {
            const key = `${m.r},${m.c}`;
            if (!protectedCells.has(key)) {
                board[m.r][m.c] = null;
                specials[m.r][m.c] = null;
            }
        }

        // Place new specials
        for (const sc of specialCreations) {
            specials[sc.r][sc.c] = sc.type;
            previousSpecials[sc.r][sc.c] = null; // force visual update
        }

        // Activate existing specials caught in the match
        const extraCleared = new Set();
        if (specialsToActivate.length > 0) {
            for (const sa of specialsToActivate) {
                const tile = getTile(sa.r, sa.c);
                if (tile) tile.classList.add('activating');
                collectSpecialEffect(sa.r, sa.c, sa.type, extraCleared);
            }
            // Chain reaction
            let chainLoop = true;
            let chainIter = 0;
            while (chainLoop && chainIter < 20) {
                chainLoop = false;
                chainIter++;
                for (const key of [...extraCleared]) {
                    const [rr, cc] = key.split(',').map(Number);
                    if (specials[rr] && specials[rr][cc] && !protectedCells.has(key)) {
                        const sType = specials[rr][cc];
                        specials[rr][cc] = null;
                        collectSpecialEffect(rr, cc, sType, extraCleared);
                        chainLoop = true;
                    }
                }
            }
            // Animate and clear extra tiles
            let extraPts = 0;
            for (const key of extraCleared) {
                const [rr, cc] = key.split(',').map(Number);
                if (board[rr][cc] !== null) {
                    extraPts += 15;
                    const tile = getTile(rr, cc);
                    if (tile) {
                        tile.classList.add('matched', 'glowing');
                        const rect = tile.getBoundingClientRect();
                        spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
                    }
                    board[rr][cc] = null;
                    specials[rr][cc] = null;
                }
            }
            if (extraPts > 0) {
                extraPts = Math.round(extraPts * comboMult);
                score += extraPts;
                document.getElementById('score').textContent = score;
                updateProgressBar();
                playSound('combo');
                await sleep(300);
            }
        }

        // Gravity + fill
        doGravityAndFill();

        // Invalidate affected columns (from matches AND special explosions)
        // Only invalidate rows from top down to the lowest affected row per column
        const colMaxRow = {};
        for (const m of allMatched) {
            if (colMaxRow[m.c] === undefined || m.r > colMaxRow[m.c]) {
                colMaxRow[m.c] = m.r;
            }
        }
        for (const key of extraCleared) {
            const [rr, cc] = key.split(',').map(Number);
            if (colMaxRow[cc] === undefined || rr > colMaxRow[cc]) {
                colMaxRow[cc] = rr;
            }
        }
        for (const col in colMaxRow) {
            for (let r = 0; r <= colMaxRow[col]; r++) {
                previousBoard[r][col] = -1;
                previousSpecials[r][col] = '_dirty_';
            }
        }

        updateBoard(true);
        await sleep(300);
        allMatched = getMatches();
        swapPos = null; // Only use swap position for the first match, not cascades
    }
}

// ===== SPECIAL TILE EFFECTS =====
function collectSpecialEffect(r, c, type, clearedSet) {
    switch (type) {
        case 'rocket-h':
            for (let cc = 0; cc < GRID; cc++) if (!isHole(r, cc)) clearedSet.add(`${r},${cc}`);
            spawnRocketTrail(r, c, 'h');
            break;
        case 'rocket-v':
            for (let rr = 0; rr < GRID; rr++) if (!isHole(rr, c)) clearedSet.add(`${rr},${c}`);
            spawnRocketTrail(r, c, 'v');
            break;
        case 'bomb':
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && !isHole(nr, nc)) clearedSet.add(`${nr},${nc}`);
                }
            }
            spawnBombShockwave(r, c);
            break;
        case 'rainbow':
            const targetType = board[r][c];
            if (targetType !== null) {
                for (let rr = 0; rr < GRID; rr++) {
                    for (let cc = 0; cc < GRID; cc++) {
                        if (board[rr][cc] === targetType) clearedSet.add(`${rr},${cc}`);
                    }
                }
            }
            spawnRainbowWave(r, c);
            break;
        case 'lightning':
            // Strike 5 random non-empty tiles
            const candidates = [];
            for (let rr = 0; rr < GRID; rr++) {
                for (let cc = 0; cc < GRID; cc++) {
                    if (board[rr][cc] !== null && board[rr][cc] !== -1 && !(rr === r && cc === c)) candidates.push(`${rr},${cc}`);
                }
            }
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            const strikes = candidates.slice(0, 5);

            strikes.forEach(k => clearedSet.add(k));
            spawnLightningEffect(r, c, strikes);
            break;
    }
}

async function activateRainbow(r, c, targetType) {
    specials[r][c] = null;
    board[r][c] = null;
    const cleared = new Set();
    spawnRainbowWave(r, c);
    if (targetType !== null) {
        for (let rr = 0; rr < GRID; rr++) {
            for (let cc = 0; cc < GRID; cc++) {
                if (!isHole(rr, cc) && board[rr][cc] === targetType) cleared.add(`${rr},${cc}`);
            }
        }
    }
    // Chain specials
    let chainLoop = true;
    let chainIter = 0;
    while (chainLoop && chainIter < 20) {
        chainLoop = false;
        chainIter++;
        for (const key of [...cleared]) {
            const [rr, cc] = key.split(',').map(Number);
            if (specials[rr] && specials[rr][cc]) {
                const sType = specials[rr][cc];
                specials[rr][cc] = null;
                collectSpecialEffect(rr, cc, sType, cleared);
                chainLoop = true;
            }
        }
    }
    let pts = 0;
    for (const key of cleared) {
        const [rr, cc] = key.split(',').map(Number);
        if (board[rr][cc] !== null) {
            pts += 10;
            const tile = getTile(rr, cc);
            if (tile) {
                tile.classList.add('matched', 'glowing');
                const rect = tile.getBoundingClientRect();
                spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
            }
            board[rr][cc] = null;
            specials[rr][cc] = null;
        }
    }
    score += pts;
    document.getElementById('score').textContent = score;
    updateProgressBar();
    playSound('combo');
    await sleep(400);
    doGravityAndFill();
    invalidateClearedColumns(cleared);
    updateBoard(true);
    await sleep(300);
}

// Immediately clear tiles visually during staged combos — awards points inline
function clearTilesVisually(clearedSet) {
    let pts = 0;
    for (const key of clearedSet) {
        const [r, c] = key.split(',').map(Number);
        if (board[r]?.[c] !== null && board[r]?.[c] !== undefined) {
            pts += 20;
            const tile = getTile(r, c);
            if (tile) {
                tile.classList.add('matched', 'glowing');
                const rect = tile.getBoundingClientRect();
                spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
            }
            board[r][c] = null;
            specials[r][c] = null;
        }
    }
    if (pts > 0) {
        score += pts;
        document.getElementById('score').textContent = score;
        updateProgressBar();
    }
    return pts;
}

async function activateSpecialCombo(r1, c1, r2, c2, s1, s2) {
    const cleared = new Set();
    if (s1 === 'rainbow' && s2 === 'rainbow') {
        // Rainbow + Rainbow = clear entire board
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++) cleared.add(`${r},${c}`);
        spawnRainbowWave(r1, c1);
        spawnGodRays();
    } else if (s1 === 'rainbow' || s2 === 'rainbow') {
        // NOTE: s1/s2 are pre-swap; after swap(), positions are swapped
        const otherType = s1 === 'rainbow' ? s2 : s1;
        const otherR = s1 === 'rainbow' ? r1 : r2;
        const otherC = s1 === 'rainbow' ? c1 : c2;
        const rainR = s1 === 'rainbow' ? r2 : r1;
        const rainC = s1 === 'rainbow' ? c2 : c1;
        const targetType = board[otherR][otherC];
        spawnRainbowWave(rainR, rainC);
        if (targetType !== null) {
            // Collect all tiles of this color
            const colorTiles = [];
            for (let r = 0; r < GRID; r++)
                for (let c = 0; c < GRID; c++)
                    if (board[r][c] === targetType) colorTiles.push({ r, c });

            if (otherType && otherType !== 'rainbow') {
                // Staged: place specials visually, then detonate one by one
                await sleep(200);
                // Step 1: Place specials visually on all color-matched tiles
                const rocketDirs = []; // for rockets, pre-generate directions
                for (const t of colorTiles) {
                    let sType = otherType;
                    if (otherType === 'rocket-h' || otherType === 'rocket-v') {
                        sType = Math.random() < 0.5 ? 'rocket-h' : 'rocket-v';
                    }
                    rocketDirs.push(sType);
                    specials[t.r][t.c] = sType;
                    previousSpecials[t.r][t.c] = null;
                }
                updateBoard(false);
                await sleep(500);
                // Step 2: Detonate one by one with 150ms gaps — clear tiles immediately
                for (let i = 0; i < colorTiles.length; i++) {
                    const t = colorTiles[i];
                    const sType = rocketDirs[i];
                    const before = new Set(cleared);
                    specials[t.r][t.c] = null;
                    cleared.add(`${t.r},${t.c}`);
                    collectSpecialEffect(t.r, t.c, sType, cleared);
                    if (sType === 'bomb') spawnBombShockwave(t.r, t.c);
                    else if (sType === 'rocket-h') spawnRocketTrail(t.r, t.c, 'h');
                    else if (sType === 'rocket-v') spawnRocketTrail(t.r, t.c, 'v');
                    else if (sType === 'lightning') spawnLightningEffect(t.r, t.c,
                        [...cleared].filter(k => { const [rr, cc] = k.split(',').map(Number); return board[rr]?.[cc] !== null; }).slice(0, 3));
                    // Immediately clear newly added tiles visually
                    const newlyCleared = new Set([...cleared].filter(k => !before.has(k)));
                    clearTilesVisually(newlyCleared);
                    playSound('match');
                    await sleep(150);
                }
            } else {
                // Rainbow + normal tile: just clear all of that color
                for (const t of colorTiles) cleared.add(`${t.r},${t.c}`);
            }
        }
    } else if ((s1 === 'rocket-h' || s1 === 'rocket-v') && (s2 === 'rocket-h' || s2 === 'rocket-v')) {
        // Rocket + Rocket = cross (full row + full column)
        for (let cc = 0; cc < GRID; cc++) cleared.add(`${r1},${cc}`);
        for (let rr = 0; rr < GRID; rr++) cleared.add(`${rr},${c1}`);
        spawnRocketTrail(r1, c1, 'h');
        spawnRocketTrail(r1, c1, 'v');
    } else if (s1 === 'bomb' && s2 === 'bomb') {
        // Bomb + Bomb = big 5x5 explosion
        for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++) {
                const nr = r1 + dr, nc = c1 + dc;
                if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID) cleared.add(`${nr},${nc}`);
            }
        spawnBombShockwave(r1, c1);
    } else if ((s1 === 'bomb' || s2 === 'bomb') && (s1 === 'rocket-h' || s1 === 'rocket-v' || s2 === 'rocket-h' || s2 === 'rocket-v')) {
        // Rocket + Bomb = big cross: 3 rows + 3 columns
        const centerR = s1 === 'bomb' ? r1 : r2;
        const centerC = s1 === 'bomb' ? c1 : c2;
        for (let dr = -1; dr <= 1; dr++) {
            for (let cc = 0; cc < GRID; cc++) {
                const nr = centerR + dr;
                if (nr >= 0 && nr < GRID) cleared.add(`${nr},${cc}`);
            }
        }
        for (let dc = -1; dc <= 1; dc++) {
            for (let rr = 0; rr < GRID; rr++) {
                const nc = centerC + dc;
                if (nc >= 0 && nc < GRID) cleared.add(`${rr},${nc}`);
            }
        }
        spawnBombShockwave(centerR, centerC);
        spawnRocketTrail(centerR, centerC, 'h');
        spawnRocketTrail(centerR, centerC, 'v');
    } else if (s1 === 'lightning' && s2 === 'lightning') {
        // Lightning + Lightning = 15 random strikes
        const cands = [];
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (board[r][c] !== null) cands.push(`${r},${c}`);
        for (let i = cands.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cands[i], cands[j]] = [cands[j], cands[i]];
        }
        const hits = cands.slice(0, 15);
        hits.forEach(k => cleared.add(k));
        spawnLightningEffect(r1, c1, hits.slice(0, 8));
        spawnLightningEffect(r2, c2, hits.slice(8));
    } else if ((s1 === 'lightning' || s2 === 'lightning') && (s1 === 'bomb' || s2 === 'bomb')) {
        // Lightning + Bomb = strike 3 tiles → place bombs → detonate one by one
        const lightR = s1 === 'lightning' ? r1 : r2;
        const lightC = s1 === 'lightning' ? c1 : c2;
        const cands = [];
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (board[r][c] !== null && !(r === r1 && c === c1) && !(r === r2 && c === c2))
                    cands.push(`${r},${c}`);
        for (let i = cands.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cands[i], cands[j]] = [cands[j], cands[i]];
        }
        const targets = cands.slice(0, 3);
        // Step 1: Lightning bolts strike
        spawnLightningEffect(lightR, lightC, targets);
        await sleep(200);
        // Step 2: Place bombs visually on struck tiles
        for (const k of targets) {
            const [tr, tc] = k.split(',').map(Number);
            specials[tr][tc] = 'bomb';
            previousSpecials[tr][tc] = null; // force visual update
        }
        updateBoard(false);
        await sleep(500);
        // Step 3: Detonate bombs one by one — clear tiles immediately
        for (const k of targets) {
            const [tr, tc] = k.split(',').map(Number);
            const before = new Set(cleared);
            specials[tr][tc] = null;
            collectSpecialEffect(tr, tc, 'bomb', cleared);
            spawnBombShockwave(tr, tc);
            const newlyCleared = new Set([...cleared].filter(k2 => !before.has(k2)));
            clearTilesVisually(newlyCleared);
            playSound('match');
            await sleep(200);
        }
    } else if ((s1 === 'lightning' || s2 === 'lightning') && (s1 === 'rocket-h' || s1 === 'rocket-v' || s2 === 'rocket-h' || s2 === 'rocket-v')) {
        // Lightning + Rocket = strike 3 tiles → place rockets → fire one by one
        const lightR = s1 === 'lightning' ? r1 : r2;
        const lightC = s1 === 'lightning' ? c1 : c2;
        const cands = [];
        for (let r = 0; r < GRID; r++)
            for (let c = 0; c < GRID; c++)
                if (board[r][c] !== null && !(r === r1 && c === c1) && !(r === r2 && c === c2))
                    cands.push(`${r},${c}`);
        for (let i = cands.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cands[i], cands[j]] = [cands[j], cands[i]];
        }
        const targets = cands.slice(0, 3);
        // Pre-generate rocket directions
        const rocketDirs = targets.map(() => Math.random() < 0.5 ? 'rocket-h' : 'rocket-v');
        // Step 1: Lightning bolts strike
        spawnLightningEffect(lightR, lightC, targets);
        await sleep(200);
        // Step 2: Place rockets visually on struck tiles
        for (let i = 0; i < targets.length; i++) {
            const [tr, tc] = targets[i].split(',').map(Number);
            specials[tr][tc] = rocketDirs[i];
            previousSpecials[tr][tc] = null; // force visual update
        }
        updateBoard(false);
        await sleep(500);
        // Step 3: Fire rockets one by one — clear tiles immediately
        for (let i = 0; i < targets.length; i++) {
            const [tr, tc] = targets[i].split(',').map(Number);
            const before = new Set(cleared);
            specials[tr][tc] = null;
            collectSpecialEffect(tr, tc, rocketDirs[i], cleared);
            spawnRocketTrail(tr, tc, rocketDirs[i] === 'rocket-h' ? 'h' : 'v');
            const newlyCleared = new Set([...cleared].filter(k => !before.has(k)));
            clearTilesVisually(newlyCleared);
            playSound('match');
            await sleep(200);
        }
    } else {
        collectSpecialEffect(r1, c1, s1, cleared);
        collectSpecialEffect(r2, c2, s2, cleared);
    }
    specials[r1][c1] = null;
    specials[r2][c2] = null;
    // Chain reaction
    let chainLoop = true;
    let chainIter = 0;
    while (chainLoop && chainIter < 20) {
        chainLoop = false;
        chainIter++;
        for (const key of [...cleared]) {
            const [r, c] = key.split(',').map(Number);
            if (specials[r] && specials[r][c]) {
                const sType = specials[r][c];
                specials[r][c] = null;
                collectSpecialEffect(r, c, sType, cleared);
                chainLoop = true;
            }
        }
    }
    let pts = 0;
    for (const key of cleared) {
        const [r, c] = key.split(',').map(Number);
        if (board[r][c] !== null) {
            pts += 20;
            const tile = getTile(r, c);
            if (tile) {
                tile.classList.add('matched', 'glowing');
                const rect = tile.getBoundingClientRect();
                spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 1);
            }
            board[r][c] = null;
            specials[r][c] = null;
        }
    }
    score += pts;
    document.getElementById('score').textContent = score;
    updateProgressBar();
    playSound('combo');
    await sleep(400);
    doGravityAndFill();
    invalidateClearedColumns(cleared);
    updateBoard(true);
    await sleep(300);
    await processMatches();
}

// ===== GRAVITY & FILL HELPERS =====
function doGravityAndFill() {
    for (let c = 0; c < GRID; c++) {
        // Collect playable positions in this column (bottom to top)
        const playable = [];
        for (let r = GRID - 1; r >= 0; r--) {
            if (!isHole(r, c)) playable.push(r);
        }
        // Collect existing candies in column (bottom to top)
        const candies = [];
        for (const r of playable) {
            if (board[r][c] !== null && board[r][c] !== -1) {
                candies.push({ val: board[r][c], sp: specials[r][c] });
            }
        }
        // Place candies from bottom, fill rest with new
        const types = LEVELS[currentLevelIndex].types;
        for (let i = 0; i < playable.length; i++) {
            const r = playable[i];
            if (i < candies.length) {
                board[r][c] = candies[i].val;
                specials[r][c] = candies[i].sp;
            } else {
                board[r][c] = Math.floor(Math.random() * types);
                specials[r][c] = null;
            }
        }
    }
}

function invalidateAllColumns() {
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            previousBoard[r][c] = -1;
            previousSpecials[r][c] = '_dirty_';
        }
    }
}

function invalidateClearedColumns(clearedSet) {
    const colMaxRow = {};
    for (const key of clearedSet) {
        const [rr, cc] = key.split(',').map(Number);
        if (colMaxRow[cc] === undefined || rr > colMaxRow[cc]) {
            colMaxRow[cc] = rr;
        }
    }
    for (const col in colMaxRow) {
        for (let r = 0; r <= colMaxRow[col]; r++) {
            previousBoard[r][col] = -1;
            previousSpecials[r][col] = '_dirty_';
        }
    }
}



// ===== DEADLOCK DETECTION =====
function findPossibleMove() {
    let bestMove = null;
    let bestScore = 0;

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (isHole(r, c)) continue;
            const neighbors = [];
            if (c < GRID - 1 && !isHole(r, c + 1)) neighbors.push({ r2: r, c2: c + 1 });
            if (r < GRID - 1 && !isHole(r + 1, c)) neighbors.push({ r2: r + 1, c2: c });

            for (const n of neighbors) {
                swap(r, c, n.r2, n.c2);
                const matches = getMatches();
                if (matches.length > 0) {
                    // Score: matched tiles + bonus for specials
                    const groups = findMatchGroups();
                    let score = matches.length;
                    for (const g of groups) {
                        if (g.len >= 5) score += 50;       // rainbow
                        else if (g.len === 4) score += 20;  // rocket
                        else if (g.dir === 'square') score += 15; // bomb
                    }
                    // Bonus if swapping involves a special tile
                    if (specials[r][c]) score += 30;
                    if (specials[n.r2][n.c2]) score += 30;

                    if (score > bestScore) {
                        bestScore = score;
                        bestMove = { r1: r, c1: c, r2: n.r2, c2: n.c2 };
                    }
                }
                swap(r, c, n.r2, n.c2);
            }
        }
    }
    return bestMove;
}

function checkDeadlock() {
    if (timeLeft <= 0) return; // game over, skip
    if (!findPossibleMove()) {
        showShuffleNotice();
        playSound('shuffle');
        shuffleBoard();
    }
}

function shuffleBoard() {
    const types = LEVELS[currentLevelIndex].types;
    let attempts = 0;

    // Clear all specials when shuffling (only playable cells)
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (!isHole(r, c)) specials[r][c] = null;
        }
    }

    do {
        // Fisher-Yates shuffle — only playable cells
        const flat = [];
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (!isHole(r, c)) flat.push(board[r][c]);
            }
        }
        for (let i = flat.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [flat[i], flat[j]] = [flat[j], flat[i]];
        }
        let idx = 0;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (!isHole(r, c)) board[r][c] = flat[idx++];
            }
        }

        // If there are initial matches after shuffle, just clear them
        while (getMatches().length > 0) {
            const m = getMatches();
            for (const { r, c } of m) {
                board[r][c] = Math.floor(Math.random() * types);
            }
        }
        attempts++;
    } while (!findPossibleMove() && attempts < 20);

    // Last resort: full reinit
    if (!findPossibleMove()) {
        initBoard();
    }

    invalidateAllColumns();
    updateBoard(true);
}

function showShuffleNotice() {
    const el = document.createElement('div');
    el.className = 'shuffle-notice';
    el.textContent = '🔀 Shuffling...';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
}

function manualShuffle() {
    if (busy || timeLeft <= 0 || shuffleUsed) return;

    shuffleUsed = true;
    const sBtn = document.getElementById('shuffleBtn');
    if (sBtn) {
        sBtn.style.opacity = '0.5';
        sBtn.style.cursor = 'not-allowed';
    }

    playSound('shuffle');
    showShuffleNotice();
    shuffleBoard();
    resetHintTimer();
}

// ===== HINT SYSTEM =====
function resetHintTimer() {
    clearHintTimer();
    if (hintsEnabled && timeLeft > 0 && !busy) {
        hintTimer = setTimeout(showHint, HINT_DELAY);
    }
}

function clearHintTimer() {
    if (hintTimer) {
        clearTimeout(hintTimer);
        hintTimer = null;
    }
    clearHints();
}

function toggleHints() {
    hintsEnabled = !hintsEnabled;
    Storage.save('hintsEnabled', hintsEnabled);
    if (!hintsEnabled) {
        clearHintTimer();
    } else {
        resetHintTimer();
    }
}

function clearHints() {
    if (tileElements.length === 0) return;
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const tile = tileElements[r] && tileElements[r][c];
            if (tile) tile.classList.remove('hint');
        }
    }
}

function showHint() {
    const move = findPossibleMove();
    if (move) {
        const tile1 = getTile(move.r1, move.c1);
        const tile2 = getTile(move.r2, move.c2);
        if (tile1) tile1.classList.add('hint');
        if (tile2) tile2.classList.add('hint');
    }
    // Keep showing hint; will reset when user acts
}

// ===== PROGRESS BAR =====
let currentProgressStage = 0; // track which stage we're in to detect transitions

function updateProgressBar() {
    const fill = document.getElementById('progressFill');
    const goalText = document.getElementById('goalText');
    const progressBar = document.querySelector('.progress-bar');
    if (!fill || !goalText) return;

    const level = LEVELS[currentLevelIndex];
    const best = bestScores[level.id] || 0;
    let stage, stageStart, stageEnd, stageLabel, stageClass;

    if (score < STAR_THRESHOLDS[0]) {
        // Stage 1: 0 → 1500 (1 star)
        stage = 1;
        stageStart = 0;
        stageEnd = STAR_THRESHOLDS[0];
        stageLabel = '⭐ Goal: ' + STAR_THRESHOLDS[0];
        stageClass = 'progress-stage-1';
    } else if (score < STAR_THRESHOLDS[1]) {
        // Stage 2: 1500 → 3000 (2 stars)
        stage = 2;
        stageStart = STAR_THRESHOLDS[0];
        stageEnd = STAR_THRESHOLDS[1];
        stageLabel = '⭐⭐ Goal: ' + STAR_THRESHOLDS[1];
        stageClass = 'progress-stage-2';
    } else if (score < STAR_THRESHOLDS[2]) {
        // Stage 3: 3000 → 4500 (3 stars)
        stage = 3;
        stageStart = STAR_THRESHOLDS[1];
        stageEnd = STAR_THRESHOLDS[2];
        stageLabel = '⭐⭐⭐ Goal: ' + STAR_THRESHOLDS[2];
        stageClass = 'progress-stage-3';
    } else {
        // Stage 4: 4500 → record (fiery)
        stage = 4;
        stageStart = STAR_THRESHOLDS[2];
        stageEnd = Math.max(best, score + 500); // target is previous record or current + 500
        stageLabel = '🔥 Best: ' + (best > STAR_THRESHOLDS[2] ? best : '—');
        stageClass = 'progress-stage-fire';
    }

    // Detect stage transition
    if (stage !== currentProgressStage && currentProgressStage > 0) {
        // Stage changed! Flash the bar
        if (progressBar) {
            progressBar.classList.add('progress-stage-transition');
            setTimeout(() => progressBar.classList.remove('progress-stage-transition'), 600);
        }
        playSound('stage-up');
    }
    currentProgressStage = stage;

    // Calculate fill percentage within current stage
    const progress = score - stageStart;
    const range = stageEnd - stageStart;
    const pct = Math.min(100, Math.round((progress / range) * 100));

    fill.style.width = pct + '%';

    // Update bar color class
    fill.className = 'progress-fill ' + stageClass;

    // Update goal text
    goalText.textContent = stageLabel;

    // Fire effect on bar container for stage 4
    if (progressBar) {
        if (stage === 4) {
            progressBar.classList.add('progress-fire');
        } else {
            progressBar.classList.remove('progress-fire');
        }
    }
}

// ===== EFFECTS =====
let comboFireTimeout = null;

// ===== SCORE SAVE WITH RETRY =====
async function attemptSaveScore(levelIndex, scoreVal, starCount, txLoading) {
    try {
        txLoading.querySelector('span').textContent = '⏳ Saving score...';
        const erOk = await commitAndUndelegate(starCount);

        if (erOk) {
            txLoading.querySelector('span').textContent = '⏳ Confirming on Base...';
            const settled = await waitForPDASettlement();

            if (settled) {
                txLoading.querySelector('span').textContent = '⏳ Saving score...';
                const txOk = await submitScore(levelIndex, scoreVal, starCount);
                if (txOk) {
                    txLoading.querySelector('span').textContent = 'Saved on Base! ✅';
                    return true;
                } else {
                    txLoading.querySelector('span').textContent = 'Transaction rejected ❌';
                    return false;
                }
            } else {
                txLoading.querySelector('span').textContent = 'Saved on Base! ⚡';
                return true;
            }
        } else {
            txLoading.querySelector('span').textContent = '⏳ Saving score...';
            const fallbackOk = await submitScore(levelIndex, scoreVal, starCount);
            if (fallbackOk) {
                txLoading.querySelector('span').textContent = 'Saved on-chain! ✅';
                return true;
            } else {
                txLoading.querySelector('span').textContent = 'Transaction rejected ❌';
                return false;
            }
        }
    } catch (e) {
        console.error('[TX] Score submission error:', e);
        txLoading.querySelector('span').textContent = 'Transaction failed ❌';
        return false;
    }
}

async function retrySaveScore() {
    const pending = window._pendingScore;
    if (!pending) return;

    const winMapBtn = document.getElementById('winMapBtn');
    const txLoading = document.getElementById('winTxLoading');
    const retryBtn = document.getElementById('winRetryBtn');
    const txError = document.getElementById('winTxError');

    retryBtn.classList.add('hidden');
    txError.classList.add('hidden');
    txLoading.classList.remove('hidden');

    const saved = await attemptSaveScore(pending.levelIndex, pending.score, pending.starCount, txLoading);

    if (saved) {
        // TX success on retry — NOW save progress to localStorage
        const levelId = LEVELS[pending.levelIndex].id;
        saveProgressLocally(levelId, pending.score, pending.starCount, pending.levelIndex);
        window._pendingScore = null;
        setTimeout(() => {
            winMapBtn.disabled = false;
            winMapBtn.classList.remove('btn-disabled');
            txLoading.classList.add('hidden');
        }, 1500);
    } else {
        txLoading.classList.add('hidden');
        retryBtn.classList.remove('hidden');
        txError.classList.remove('hidden');
    }
}

// Expose to global scope for inline onclick
window.retrySaveScore = retrySaveScore;

async function endGame() {
    if (gameEnded) return;
    gameEnded = true;
    clearInterval(timerInterval);
    clearHintTimer();

    if (score >= currentGoal) {
        playSound('win');

        const level = LEVELS[currentLevelIndex];

        // Calculate stars (needed for UI, but NOT saved yet)
        const starCount = getStarCount(score);

        // Update win screen (UI only — no localStorage yet)
        document.getElementById('winScore').textContent = score;

        // Star display with animation
        const starContainer = document.getElementById('winStars');
        if (starContainer) {
            starContainer.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                const star = document.createElement('span');
                star.className = 'win-star' + (i < starCount ? ' earned' : ' empty');
                star.textContent = i < starCount ? '⭐' : '☆';
                star.style.animationDelay = (i * 0.3) + 's';
                starContainer.appendChild(star);
            }
        }

        // Check if this is the first-ever completion of all levels
        const wouldComplete = !completedLevels.includes(level.id);
        const allWouldBeCompleted = wouldComplete
            ? completedLevels.length + 1 >= LEVELS.length
            : completedLevels.length >= LEVELS.length;
        const alreadyCelebratedFull = Storage.load('gameCompleted', null);
        let pendingCongrats = false;

        if (currentLevelIndex === LEVELS.length - 1 && allWouldBeCompleted && !alreadyCelebratedFull) {
            pendingCongrats = true;
            document.getElementById('winMsg').textContent = 'All levels completed! 🎉';
        } else if (starCount === 3) {
            document.getElementById('winMsg').textContent = 'Perfect! ⭐⭐⭐';
        } else if (starCount === 2) {
            document.getElementById('winMsg').textContent = 'Great job! ⭐⭐';
        } else {
            document.getElementById('winMsg').textContent = 'Level cleared! ⭐';
        }

        // Candy win messages
        const winMsgs = ['Sweet victory! 🍬', 'Sugar rush! 🍭', 'Delicious! 🍫', 'Yummy! 🧁'];
        document.getElementById('winBabyMsg').textContent = winMsgs[Math.floor(Math.random() * winMsgs.length)];

        createConfetti();
        showScreen('winScreen');

        // Trigger win screen entrance animation
        const winScreen = document.getElementById('winScreen');
        winScreen.classList.add('win-animate');
        setTimeout(() => winScreen.classList.remove('win-animate'), 2000);

        // --- Blockchain transaction: block button until confirmed ---
        const winMapBtn = document.getElementById('winMapBtn');
        const txLoading = document.getElementById('winTxLoading');
        const retryBtn = document.getElementById('winRetryBtn');
        const txError = document.getElementById('winTxError');

        if (isConnected()) {
            // Save pending score data for retry (progress NOT saved to localStorage yet)
            window._pendingScore = { levelIndex: currentLevelIndex, score, starCount };

            winMapBtn.disabled = true;
            winMapBtn.classList.add('btn-disabled');
            retryBtn.classList.add('hidden');
            txError.classList.add('hidden');
            txLoading.classList.remove('hidden');

            const saved = await attemptSaveScore(currentLevelIndex, score, starCount, txLoading);

            if (saved) {
                // TX success — NOW save progress to localStorage
                saveProgressLocally(level.id, score, starCount, currentLevelIndex);
                window._pendingScore = null;
                setTimeout(() => {
                    winMapBtn.disabled = false;
                    winMapBtn.classList.remove('btn-disabled');
                    txLoading.classList.add('hidden');
                    retryBtn.classList.add('hidden');
                    txError.classList.add('hidden');
                }, 1500);
            } else {
                // Failed — show retry, keep button locked, NO localStorage save
                txLoading.classList.add('hidden');
                retryBtn.classList.remove('hidden');
                txError.classList.remove('hidden');
            }
        } else {
            // Not connected — save locally as fallback
            saveProgressLocally(level.id, score, starCount, currentLevelIndex);
        }

        // If first full completion, replace "To Map" button behavior
        if (pendingCongrats) {
            const originalOnclick = winMapBtn.onclick;
            winMapBtn.textContent = 'Next ➡️';
            winMapBtn.onclick = function () {
                const totalStars = LEVELS.reduce((sum, l) => sum + (bestStars[l.id] || 0), 0);
                const totalScore = LEVELS.reduce((sum, l) => sum + (bestScores[l.id] || 0), 0);

                const cMsgs = ['You conquered all the candy levels! 🏆', 'A true candy master! 🍬👑'];
                document.getElementById('congratsMsg').textContent = cMsgs[Math.floor(Math.random() * cMsgs.length)];
                document.getElementById('congratsTotalStars').textContent = totalStars + '/' + (LEVELS.length * 3);
                document.getElementById('congratsTotalScore').textContent = totalScore;

                createConfetti();
                showScreen('congratsScreen');
                startFireworks();
                playSound('congrats');

                Storage.save('gameCompleted', 'true');

                winMapBtn.textContent = 'To Map 🗺️';
                winMapBtn.onclick = originalOnclick;
            };
        }
    } else {
        playSound('lose');

        document.getElementById('loseScore').textContent = score;
        document.getElementById('loseGoal').textContent = STAR_THRESHOLDS[0];

        // Candy lose messages
        const loseMsgs = ['Try again! 🍬', 'So close! 🍭', 'Don\'t give up! 💪'];
        document.getElementById('loseBabyMsg').textContent = loseMsgs[Math.floor(Math.random() * loseMsgs.length)];

        showScreen('loseScreen');
    }
}

// ===== HIGH SCORES =====

// Save progress to localStorage (called only after successful TX or when not connected)
function saveProgressLocally(levelId, scoreVal, starCount, levelIndex) {
    if (!completedLevels.includes(levelId)) {
        completedLevels.push(levelId);
        Storage.save(storageKey('completed'), completedLevels);
        // Mark next level for unlock animation
        if (levelIndex + 1 < LEVELS.length) {
            justUnlockedId = LEVELS[levelIndex + 1].id;
        }
    }
    const prevStars = bestStars[levelId] || 0;
    if (starCount > prevStars) {
        bestStars[levelId] = starCount;
        Storage.save(storageKey('bestStars'), bestStars);
    }
    saveBestScore(levelId, scoreVal);
}

function saveBestScore(levelId, newScore) {
    const current = bestScores[levelId] || 0;
    if (newScore > current) {
        bestScores[levelId] = newScore;
        Storage.save(storageKey('bestScores'), bestScores);
    }
}

// ===== UTILITIES =====
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ===== PWA SERVICE WORKER =====
// PWA service worker removed (not needed in Base App context)

// ===== INIT =====
initBlockchain();
renderMap();

// Try auto-reconnect on page load
(async () => {
    // Helper: dismiss the blocking reconnect overlay with a fade-out
    function dismissReconnectOverlay() {
        const overlay = document.getElementById('walletReconnectOverlay');
        if (overlay) {
            overlay.style.transition = 'opacity 0.4s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 400);
        }
    }

    const reconnected = await tryAutoReconnect();
    if (reconnected) {
        // Wallet reconnected — onWalletConnect callback handles UI + newcomer check
        dismissReconnectOverlay();
    } else {
        dismissReconnectOverlay();
        showScreen('startScreen');
    }
})();
