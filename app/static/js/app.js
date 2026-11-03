/**
 * BoardScores - Progressive Web App Client
 * Minimalist Dark Mobile-first SPA with Event-Sourced Undo/Redo & Stepper Wizard
 */

// Curated Harmonious Player Color Palette
const PLAYER_PALETTE = [
  { bg: '#2563eb', text: '#ffffff', light: '#eff6ff', border: '#93c5fd' }, // Blue
  { bg: '#059669', text: '#ffffff', light: '#ecfdf5', border: '#6ee7b7' }, // Emerald
  { bg: '#7c3aed', text: '#ffffff', light: '#f5f3ff', border: '#c4b5fd' }, // Violet
  { bg: '#d97706', text: '#ffffff', light: '#fffbeb', border: '#fcd34d' }, // Amber
  { bg: '#db2777', text: '#ffffff', light: '#fdf2f8', border: '#fbcfe8' }, // Pink
  { bg: '#0891b2', text: '#ffffff', light: '#ecfeff', border: '#67e8f9' }, // Cyan
  { bg: '#ea580c', text: '#ffffff', light: '#fff7ed', border: '#fdba74' }, // Orange
  { bg: '#4f46e5', text: '#ffffff', light: '#eef2ff', border: '#a5b4fc' }, // Indigo
  { bg: '#0d9488', text: '#ffffff', light: '#f0fdfa', border: '#5eead4' }, // Teal
  { bg: '#c026d3', text: '#ffffff', light: '#fdf4ff', border: '#f0abfc' }, // Fuchsia
  { bg: '#e11d48', text: '#ffffff', light: '#fff1f2', border: '#fda4af' }, // Rose
  { bg: '#0284c7', text: '#ffffff', light: '#f0f9ff', border: '#7dd3fc' }, // Sky
];

function getPlayerColor(playerOrName) {
  const str = (typeof playerOrName === 'string' ? playerOrName : (playerOrName?.name || playerOrName?.id || '')) || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PLAYER_PALETTE.length;
  return PLAYER_PALETTE[index];
}

// Application State
const state = {
  currentView: 'leaderboard',
  previousView: 'leaderboard',
  filterCategory: 'games', // 'games' | 'players' | 'sessions'
  historyMode: 'sessions', // 'sessions' (default) | 'global'
  selectedLbGameId: null, // null for global, or game_id
  selectedLbPlayerId: null, // null or player_id
  selectedLbSessionId: null, // null or session_id
  leaderboardSort: 'score', // 'score' (default) | 'ratio' | 'wins'
  players: [],
  games: [],
  sessions: [],
  history: [],
  leaderboard: [],

  // Add Match Wizard State
  wizardStep: 1,
  wizardGameId: null,
  selectedMatchPlayerIds: new Set(),
  matchScores: {}, // player_id -> { score: 0, is_winner: false }

  // Game creation state
  newGameImgMode: 'upload', // 'upload' | 'url'
  pendingGameUploadFile: null,
  autoSelectInWizard: false,

  // History filters
  historyFilterType: 'ALL',
  historyFilterDate: null,
};

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initServiceWorker();
  initLongPressDelegation();
  checkMobileInstallBanner();
  window.addEventListener('resize', checkMobileInstallBanner);
  setupInitialDateTime();
  loadAllData();
});

// ==========================================
// PWA & SERVICE WORKER
// ==========================================
let deferredInstallPrompt = null;

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        console.log('[SW] Nouveau service worker actif, actualisation automatique...');
        window.location.reload();
      }
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('[SW] Service Worker enregistré :', reg.scope);
          // Check for update immediately on load
          reg.update().catch(() => {});

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[SW] Nouvelle version prête, activation...');
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                }
              });
            }
          });
        })
        .catch((err) => console.warn('[SW] Échec enregistrement :', err));
    });

    // When returning to app from background, check for updates
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) reg.update().catch(() => {});
        }).catch(() => {});
      }
    });
  }

  // Handle Chrome / Android PWA installation prompt if fired
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    checkMobileInstallBanner();
  });

  // Handle app installed
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    dismissPwaBanner();
    showToast('Application installée sur votre appareil !', 'success');
  });
}

function isPwaStandalone() {
  if (window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches) {
    return true;
  }
  if (window.navigator.standalone === true) {
    return true;
  }
  if (document.referrer && document.referrer.startsWith('android-app://')) {
    return true;
  }
  return false;
}

function checkMobileInstallBanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (!banner) return;

  // Once installed and running inside the PWA app: NEVER show the banner
  if (isPwaStandalone()) {
    banner.style.display = 'none';
    return;
  }

  // Always show on mobile screen width (<= 768px) upon each refresh
  const isMobileSize = window.innerWidth <= 768 || window.matchMedia('(max-width: 768px)').matches;
  if (isMobileSize) {
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function dismissPwaBanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) {
    banner.style.display = 'none';
  }
}

async function triggerPwaInstall() {
  // 1. If native browser installation prompt is available
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      dismissPwaBanner();
    }
    deferredInstallPrompt = null;
    return;
  }

  // 2. If native prompt is not exposed (e.g. testing via local HTTP or iOS Safari)
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const sub = document.querySelector('#pwaInstallBanner .pwa-install-subtitle');
  const btn = document.getElementById('btnPwaInstall');

  if (isIos) {
    if (sub) sub.innerHTML = "Sur iPhone : appuyez sur <strong>Partager</strong> puis <strong>'Sur l'écran d'accueil'</strong>";
    if (btn) btn.style.display = 'none';
    showToast("Sur iPhone : appuyez sur Partager puis 'Sur l'écran d'accueil'", 'info', 6000);
  } else {
    if (sub) sub.innerHTML = "Dans Chrome : appuyez sur <strong>⋮ (3 points)</strong> > <strong>'Installer l'application'</strong>";
    if (btn) {
      btn.textContent = 'Compris';
      btn.onclick = () => dismissPwaBanner();
    }
    showToast("Dans Chrome : appuyez sur ⋮ en haut à droite puis 'Installer l'application'", 'info', 6000);
  }
}

// ==========================================
// DATA LOADING & API
// ==========================================
async function apiCall(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, options);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: res.statusText }));
      let msg = 'Erreur réseau';
      if (typeof errData.detail === 'string') {
        msg = errData.detail;
      } else if (Array.isArray(errData.detail)) {
        msg = errData.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
      } else if (errData.detail) {
        msg = JSON.stringify(errData.detail);
      }
      throw new Error(msg);
    }
    return await res.json();
  } catch (err) {
    console.error(`API Call failed on ${endpoint}:`, err);
    throw err;
  }
}

async function loadAllData() {
  try {
    await Promise.all([
      loadPlayers(),
      loadGames(),
      loadSessions(),
      loadLeaderboard(),
      loadHistory(),
    ]);
  } catch (err) {
    showToast('Erreur lors du chargement des données', 'error');
  }
}

async function loadSessions() {
  try {
    const data = await apiCall('/api/matches/sessions');
    state.sessions = data;
    if (state.filterCategory === 'sessions') {
      renderLeaderboardChipsCarousel();
    }
    if (state.currentView === 'history' && state.historyMode === 'sessions') {
      renderHistorySessions();
    }
  } catch (err) {
    console.warn('Erreur chargement sessions:', err);
  }
}

async function loadPlayers() {
  const data = await apiCall('/api/players');
  state.players = data;
  renderPlayers();
  if (state.filterCategory === 'players') {
    renderLeaderboardChipsCarousel();
  }
  if (state.currentView === 'addMatch' && state.wizardStep === 2) {
    renderWizardPlayers();
  }
}

async function loadGames() {
  const data = await apiCall('/api/games');
  state.games = data;
  renderGames();
  renderLeaderboardChipsCarousel();
  if (state.currentView === 'addMatch' && state.wizardStep === 1) {
    renderWizardGames();
  }
}

async function loadLeaderboard() {
  const params = new URLSearchParams();
  if (state.selectedLbGameId) params.set('game_id', state.selectedLbGameId);
  else if (state.selectedLbPlayerId) params.set('player_id', state.selectedLbPlayerId);
  else if (state.selectedLbSessionId) params.set('session_id', state.selectedLbSessionId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await apiCall(`/api/leaderboard${qs}`);
  state.leaderboard = data;
  updateFilterBarState();
  renderLeaderboard();
}

async function loadHistory() {
  const data = await apiCall('/api/history?limit=100');
  state.history = data;
  if (state.historyMode === 'sessions') {
    renderHistorySessions();
  } else {
    renderHistory();
  }
}

// ==========================================
// VIEW NAVIGATION
// ==========================================
function switchView(viewName) {
  if (state.currentView !== 'addMatch' && viewName === 'addMatch') {
    state.previousView = state.currentView || 'leaderboard';
  }
  state.currentView = viewName;

  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

  // Center button active highlight
  const centerBtn = document.getElementById('btnCenterAddScore');
  if (centerBtn) {
    centerBtn.classList.toggle('active', viewName === 'addMatch');
  }

  const viewId = 'view' + viewName.charAt(0).toUpperCase() + viewName.slice(1);
  const navId = 'nav' + viewName.charAt(0).toUpperCase() + viewName.slice(1);

  const targetView = document.getElementById(viewId);
  const targetNav = document.getElementById(navId);

  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  // Instant render from cached state for maximum responsiveness, then refresh in background
  if (viewName === 'leaderboard') {
    if (state.leaderboard && state.leaderboard.length) renderLeaderboard();
    loadLeaderboard();
  } else if (viewName === 'history') {
    if (state.historyMode === 'sessions' && state.sessions && state.sessions.length) {
      renderHistorySessions();
    } else if (state.history && state.history.length) {
      renderHistory();
    }
    loadHistory();
    loadSessions();
  } else if (viewName === 'games') {
    if (state.games && state.games.length) renderGames();
    loadGames();
  } else if (viewName === 'players') {
    if (state.players && state.players.length) renderPlayers();
    loadPlayers();
  } else if (viewName === 'addMatch') {
    resetAndOpenWizard();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// LEADERBOARD MINIMALIST INLINE FILTERS
// ==========================================
function updateFilterBarState() {
  const carousel = document.getElementById('lbChipsCarousel');

  // Update active category tab
  ['games', 'players', 'sessions'].forEach(cat => {
    const btn = document.getElementById(`btnType${cat.charAt(0).toUpperCase() + cat.slice(1)}`);
    if (btn) btn.classList.toggle('active', state.filterCategory === cat);
  });

  if (carousel) {
    carousel.style.display = 'flex';
  }
}

function setFilterCategory(category) {
  state.filterCategory = category;
  // Switching category clears any active filter to enforce strict exclusive single filter
  state.selectedLbGameId = null;
  state.selectedLbPlayerId = null;
  state.selectedLbSessionId = null;

  updateFilterBarState();
  renderLeaderboardChipsCarousel();
  loadLeaderboard();
}

function renderLeaderboardChipsCarousel() {
  const carousel = document.getElementById('lbChipsCarousel');
  if (!carousel) return;

  const cat = state.filterCategory || 'games';

  if (cat === 'games') {
    // Render Games Chips: 5 most played games + "..." button
    const isGlobalActive = !state.selectedLbGameId;
    let html = `
      <button type="button" class="game-filter-chip ${isGlobalActive ? 'active' : ''}" onclick="selectGameFilter(null)">
        <span>Tous les jeux</span>
      </button>
    `;

    const sortedGames = [...state.games].sort((a, b) => {
      const countA = a.matches_played || 0;
      const countB = b.matches_played || 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });

    const topGames = sortedGames.slice(0, 5);
    if (state.selectedLbGameId && !topGames.some(g => g.id === state.selectedLbGameId)) {
      const activeGame = sortedGames.find(g => g.id === state.selectedLbGameId);
      if (activeGame) topGames.push(activeGame);
    }

    topGames.forEach(game => {
      const isSelected = state.selectedLbGameId === game.id;
      html += `
        <button type="button" class="game-filter-chip ${isSelected ? 'active' : ''}" onclick="selectGameFilter('${game.id}')">
          <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" 
               class="pressable-target" data-long-press="edit-game-image" data-id="${game.id}" title="Appui long pour changer l'image"
               onerror="this.src='/static/icons/default-game.svg'" loading="lazy" decoding="async">
          <span>${escapeHtml(game.name)}</span>
        </button>
      `;
    });

    // 3 petits points chip redirecting to Games tab
    html += `
      <button type="button" class="game-filter-chip lb-more-chip" onclick="switchView('games')" title="Voir tous les jeux">
        <span>•••</span>
      </button>
    `;
    carousel.innerHTML = html;

  } else if (cat === 'players') {
    // Render Players Chips: 5 players with the most games played + "..." button
    const isGlobalActive = !state.selectedLbPlayerId;
    let html = `
      <button type="button" class="game-filter-chip ${isGlobalActive ? 'active' : ''}" onclick="selectPlayerFilter(null)">
        <span>Tous les joueurs</span>
      </button>
    `;

    // Compute games played per player
    const playerCounts = {};
    if (state.history && state.history.length > 0) {
      state.history.forEach(act => {
        if (act.action_type === 'RECORD_MATCH' && act.is_active && act.payload && act.payload.scores) {
          act.payload.scores.forEach(sc => {
            playerCounts[sc.player_id] = (playerCounts[sc.player_id] || 0) + 1;
          });
        }
      });
    }

    const sortedPlayers = [...state.players].sort((a, b) => {
      const countA = playerCounts[a.id] || 0;
      const countB = playerCounts[b.id] || 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });

    const topPlayers = sortedPlayers.slice(0, 5);
    if (state.selectedLbPlayerId && !topPlayers.some(p => p.id === state.selectedLbPlayerId)) {
      const activePlayer = sortedPlayers.find(p => p.id === state.selectedLbPlayerId);
      if (activePlayer) topPlayers.push(activePlayer);
    }

    topPlayers.forEach(p => {
      const isSelected = state.selectedLbPlayerId === p.id;
      const color = getPlayerColor(p.name);
      const initial = p.name.charAt(0).toUpperCase();
      const avHtml = p.image_url 
        ? `<img src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}" style="width:18px; height:18px; border-radius:50%; object-fit:cover;" onerror="this.remove()">`
        : `<span style="width:18px; height:18px; border-radius:50%; background:${color.bg}; color:${color.text}; font-size:0.65rem; display:inline-flex; align-items:center; justify-content:center; font-weight:700;">${escapeHtml(initial)}</span>`;

      html += `
        <button type="button" class="game-filter-chip ${isSelected ? 'active' : ''}" onclick="selectPlayerFilter('${p.id}')">
          ${avHtml}
          <span>${escapeHtml(p.name)}</span>
        </button>
      `;
    });

    // 3 petits points chip redirecting to Players tab
    html += `
      <button type="button" class="game-filter-chip lb-more-chip" onclick="switchView('players')" title="Voir tous les joueurs">
        <span>•••</span>
      </button>
    `;
    carousel.innerHTML = html;

  } else if (cat === 'sessions') {
    // Render Sessions Chips: 5 most recent sessions + "..." button
    const isGlobalActive = !state.selectedLbSessionId;
    let html = `
      <button type="button" class="game-filter-chip ${isGlobalActive ? 'active' : ''}" onclick="selectSessionFilter(null)">
        <span>Toutes</span>
      </button>
    `;

    const topSessions = state.sessions.slice(0, 5);
    if (state.selectedLbSessionId && !topSessions.some(s => s.id === state.selectedLbSessionId)) {
      const activeSession = state.sessions.find(s => s.id === state.selectedLbSessionId);
      if (activeSession) topSessions.push(activeSession);
    }

    topSessions.forEach(s => {
      const isSelected = state.selectedLbSessionId === s.id;
      const label = s.short_name || s.name;
      html += `
        <button type="button" class="game-filter-chip ${isSelected ? 'active' : ''}" onclick="selectSessionFilter('${s.id}')" title="${escapeHtml(s.name)} (${s.matches_count} parties)">
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    });

    // 3 petits points chip redirecting to Sessions History
    html += `
      <button type="button" class="game-filter-chip lb-more-chip" onclick="switchView('history'); setHistoryMode('sessions');" title="Voir l'historique des sessions">
        <span>•••</span>
      </button>
    `;
    carousel.innerHTML = html;
  }
}

function selectGameFilter(gameId) {
  state.selectedLbGameId = (state.selectedLbGameId === gameId) ? null : gameId;
  state.selectedLbPlayerId = null;
  state.selectedLbSessionId = null;
  renderLeaderboardChipsCarousel();
  loadLeaderboard();
}

function selectPlayerFilter(playerId) {
  state.selectedLbPlayerId = (state.selectedLbPlayerId === playerId) ? null : playerId;
  state.selectedLbGameId = null;
  state.selectedLbSessionId = null;
  renderLeaderboardChipsCarousel();
  loadLeaderboard();
}

function selectSessionFilter(sessionId) {
  state.selectedLbSessionId = (state.selectedLbSessionId === sessionId) ? null : sessionId;
  state.selectedLbGameId = null;
  state.selectedLbPlayerId = null;
  renderLeaderboardChipsCarousel();
  loadLeaderboard();
}

function clearAllLeaderboardFilters() {
  state.selectedLbGameId = null;
  state.selectedLbPlayerId = null;
  state.selectedLbSessionId = null;
  renderLeaderboardChipsCarousel();
  loadLeaderboard();
}

function selectLeaderboardGame(gameId) {
  state.filterCategory = 'games';
  selectGameFilter(gameId);
}

function setLeaderboardSort(mode) {
  if (state.leaderboardSort === mode) return;
  state.leaderboardSort = mode;

  const btnScore = document.getElementById('btnSortScore');
  const btnRatio = document.getElementById('btnSortRatio');
  const btnWins = document.getElementById('btnSortWins');
  if (btnScore) btnScore.classList.toggle('active', mode === 'score');
  if (btnRatio) btnRatio.classList.toggle('active', mode === 'ratio');
  if (btnWins) btnWins.classList.toggle('active', mode === 'wins');

  const subtitle = document.getElementById('lbSubtitle');
  if (subtitle) {
    if (mode === 'score') {
      subtitle.textContent = 'Basé sur le score';
    } else if (mode === 'ratio') {
      subtitle.textContent = 'Basé sur le ratio';
    } else {
      subtitle.textContent = 'Basé sur les wins';
    }
  }

  renderLeaderboard();
}

function renderAvatarHtml(name, imageUrl, sizePx = 32, extraAttrs = '') {
  const color = getPlayerColor(name);
  const initial = (name || '?').charAt(0).toUpperCase();
  if (imageUrl) {
    return `
      <div class="player-avatar-wrap lb-player-avatar pressable-target" style="width:${sizePx}px; height:${sizePx}px; background-color:${color.bg}; color:${color.text};" ${extraAttrs}>
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="player-avatar-photo" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" loading="lazy" decoding="async">
        <span style="display:none; width:100%; height:100%; align-items:center; justify-content:center; font-weight:700;">${escapeHtml(initial)}</span>
      </div>
    `;
  }
  return `
    <div class="player-avatar-wrap lb-player-avatar pressable-target" style="width:${sizePx}px; height:${sizePx}px; background-color:${color.bg}; color:${color.text};" ${extraAttrs}>
      <span style="display:flex; width:100%; height:100%; align-items:center; justify-content:center; font-weight:700;">${escapeHtml(initial)}</span>
    </div>
  `;
}

function renderLeaderboard() {
  const podiumEl = document.getElementById('podiumContainer');
  const listEl = document.getElementById('leaderboardList');
  if (!listEl) return;

  // Filter by active players if players list is loaded
  const activeIds = state.players.length > 0 ? new Set(state.players.map(p => p.id)) : null;
  let entries = activeIds ? state.leaderboard.filter(e => activeIds.has(e.player_id)) : [...state.leaderboard];

  if (entries.length === 0) {
    if (podiumEl) {
      podiumEl.style.display = 'none';
      podiumEl.innerHTML = '';
    }
    listEl.innerHTML = `
      <div style="text-align:center; padding:32px 16px; color:var(--text-muted);">
        <p style="font-size:0.95rem; font-weight:600;">Aucune partie ne correspond aux filtres actuels</p>
        <button type="button" class="btn btn-sm btn-secondary" style="margin-top:10px;" onclick="clearAllLeaderboardFilters()">Réinitialiser les filtres</button>
      </div>
    `;
    return;
  }

  // Calculate global winrate across all participating entries in this view
  const totalWins = entries.reduce((acc, e) => acc + (e.matches_won || 0), 0);
  const totalPlayed = entries.reduce((acc, e) => acc + (e.matches_played || 0), 0);
  const globalWinrate = totalPlayed > 0 ? (totalWins / totalPlayed) : 0;

  // Compute score for each entry: (victoires_joueur + 5 * winrate_global) / (parties_joueur + 5)
  // If player has 0 matches played, score is 0.
  entries.forEach(e => {
    const played = e.matches_played || 0;
    const won = e.matches_won || 0;
    if (played === 0) {
      e.score = 0;
    } else {
      e.score = (won + 5 * globalWinrate) / (played + 5);
    }
  });

  // Sort based on state.leaderboardSort ('score', 'wins', or 'ratio')
  const sortMode = state.leaderboardSort || 'score';
  entries.sort((a, b) => {
    if (sortMode === 'wins') {
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      if (b.score !== a.score) return b.score - a.score;
      if (b.win_ratio !== a.win_ratio) return b.win_ratio - a.win_ratio;
      return b.matches_played - a.matches_played;
    } else if (sortMode === 'ratio') {
      if (b.win_ratio !== a.win_ratio) return b.win_ratio - a.win_ratio;
      if (b.score !== a.score) return b.score - a.score;
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      return b.matches_played - a.matches_played;
    } else {
      // Default: 'score'
      if (b.score !== a.score) return b.score - a.score;
      if (b.win_ratio !== a.win_ratio) return b.win_ratio - a.win_ratio;
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      return b.matches_played - a.matches_played;
    }
  });

  // Re-assign ranks based on sorted order
  entries = entries.map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  // Helper for podium metrics
  const formatPodiumMetric = (p) => {
    const winsLabel = p.matches_won > 1 ? 'wins' : 'win';
    const gamesLabel = p.matches_played > 1 ? 'games' : 'game';
    const scoreVal = p.matches_played > 0 ? `${Math.round(p.score * 1000)}` : '0';
    const ratioPct = p.matches_played > 0 ? `${(p.win_ratio * 100).toFixed(0)}%` : '0%';

    if (sortMode === 'score') {
      return `
        <div class="podium-ratio">${scoreVal}</div>
        <div class="podium-sub">${p.matches_won} ${winsLabel} • ${ratioPct} ratio</div>
      `;
    } else if (sortMode === 'wins') {
      return `
        <div class="podium-ratio">${p.matches_won} ${winsLabel}</div>
        <div class="podium-sub">${scoreVal} score • ${ratioPct} ratio</div>
      `;
    } else {
      return `
        <div class="podium-ratio">${ratioPct}</div>
        <div class="podium-sub">${p.matches_won} ${winsLabel} • ${scoreVal} score</div>
      `;
    }
  };

  // --- PODIUM (Top 3) ---
  const top3 = entries.slice(0, 3);
  if (podiumEl && top3.length > 0) {
    podiumEl.style.display = 'flex';
    let podiumHtml = '';

    // Rank 2 (Left)
    if (top3[1]) {
      const p2 = top3[1];
      const avHtml2 = renderAvatarHtml(p2.player_name, p2.player_image_url, 46, `data-long-press="edit-player-image" data-id="${p2.player_id}" title="Appui long pour changer la photo"`);
      podiumHtml += `
        <div class="podium-step rank-2">
          <div class="podium-avatar-wrap">
            ${avHtml2}
          </div>
          <div class="podium-name pressable-target" data-long-press="edit-player-name" data-id="${p2.player_id}" title="Appui long pour renommer">${escapeHtml(p2.player_name)}</div>
          ${formatPodiumMetric(p2)}
          <div class="podium-block">2</div>
        </div>
      `;
    } else {
      podiumHtml += `<div class="podium-step rank-2" style="visibility:hidden;"><div class="podium-block"></div></div>`;
    }

    // Rank 1 (Center)
    const p1 = top3[0];
    const avHtml1 = renderAvatarHtml(p1.player_name, p1.player_image_url, 56, `data-long-press="edit-player-image" data-id="${p1.player_id}" title="Appui long pour changer la photo"`);
    podiumHtml += `
      <div class="podium-step rank-1">
        <div class="podium-avatar-wrap">
          <svg class="podium-crown-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
          </svg>
          ${avHtml1}
        </div>
        <div class="podium-name pressable-target" data-long-press="edit-player-name" data-id="${p1.player_id}" title="Appui long pour renommer">${escapeHtml(p1.player_name)}</div>
        ${formatPodiumMetric(p1)}
        <div class="podium-block">1</div>
      </div>
    `;

    // Rank 3 (Right)
    if (top3[2]) {
      const p3 = top3[2];
      const avHtml3 = renderAvatarHtml(p3.player_name, p3.player_image_url, 46, `data-long-press="edit-player-image" data-id="${p3.player_id}" title="Appui long pour changer la photo"`);
      podiumHtml += `
        <div class="podium-step rank-3">
          <div class="podium-avatar-wrap">
            ${avHtml3}
          </div>
          <div class="podium-name pressable-target" data-long-press="edit-player-name" data-id="${p3.player_id}" title="Appui long pour renommer">${escapeHtml(p3.player_name)}</div>
          ${formatPodiumMetric(p3)}
          <div class="podium-block">3</div>
        </div>
      `;
    } else {
      podiumHtml += `<div class="podium-step rank-3" style="visibility:hidden;"><div class="podium-block"></div></div>`;
    }

    podiumEl.innerHTML = podiumHtml;
  } else if (podiumEl) {
    podiumEl.style.display = 'none';
    podiumEl.innerHTML = '';
  }

  // --- LEADERBOARD LIST ---
  // The podium already displays the top 3 players prominently.
  // The list below only shows the remaining players from rank 4 onward to avoid duplicates.
  const remainingEntries = entries.slice(3);
  let listHtml = '';
  remainingEntries.forEach((entry) => {
    const rankBadgeHtml = `<div class="lb-rank">#${entry.rank}</div>`;

    const winsLabel = entry.matches_won > 1 ? 'wins' : 'win';
    const gamesLabel = entry.matches_played > 1 ? 'games' : 'game';

    let cardRightHtml = '';
    const scoreVal = entry.matches_played > 0 ? `${Math.round(entry.score * 1000)}` : '0';
    const ratioPct = entry.matches_played > 0 ? `${(entry.win_ratio * 100).toFixed(0)}%` : '0%';

    if (sortMode === 'score') {
      cardRightHtml = `
        <div class="lb-ratio">${scoreVal}</div>
        <div class="lb-ratio-label">Score</div>
      `;
    } else if (sortMode === 'wins') {
      cardRightHtml = `
        <div class="lb-ratio">${entry.matches_won}</div>
        <div class="lb-ratio-label">${winsLabel}</div>
      `;
    } else {
      cardRightHtml = `
        <div class="lb-ratio">${ratioPct}</div>
        <div class="lb-ratio-label">Ratio</div>
      `;
    }

    const avatarHtml = renderAvatarHtml(entry.player_name, entry.player_image_url, 36, `data-long-press="edit-player-image" data-id="${entry.player_id}" title="Appui long pour changer la photo"`);

    listHtml += `
      <div class="lb-card">
        <div class="lb-card-left">
          ${rankBadgeHtml}
          ${avatarHtml}
          <div>
            <div class="lb-player-name pressable-target" data-long-press="edit-player-name" data-id="${entry.player_id}" title="Appui long pour renommer">${escapeHtml(entry.player_name)}</div>
            <div class="lb-player-sub">
              ${entry.matches_won} ${winsLabel} • ${entry.matches_played} ${gamesLabel}
            </div>
          </div>
        </div>
        <div class="lb-card-right">
          ${cardRightHtml}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = listHtml;
}

// ==========================================
// STEP-BY-STEP MATCH WIZARD (LOG PARTIE)
// ==========================================
async function resetAndOpenWizard() {
  state.wizardStep = 1;
  state.wizardGameId = null;
  state.selectedMatchPlayerIds.clear();
  state.matchScores = {};
  const searchInput = document.getElementById('wizardGameSearchInput');
  if (searchInput) searchInput.value = '';
  const clearBtn = document.getElementById('btnWizardClearGameSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  setupInitialDateTime();
  await autoPreselectRecentPlayers();
  goToWizardStep(1);
}

async function autoPreselectRecentPlayers() {
  try {
    const res = await apiCall('/api/matches/recent-players');
    if (res && res.player_ids && res.player_ids.length > 0) {
      res.player_ids.forEach(pid => {
        if (state.players.some(p => p.id === pid)) {
          state.selectedMatchPlayerIds.add(pid);
          state.matchScores[pid] = { is_winner: false };
        }
      });
    }
  } catch (err) {
    console.warn('Erreur présélection récents:', err);
  }
}

function wizardSelectAllPlayers() {
  state.players.forEach(p => {
    state.selectedMatchPlayerIds.add(p.id);
    if (!state.matchScores[p.id]) {
      state.matchScores[p.id] = { is_winner: false };
    }
  });
  renderWizardPlayers();
}

function wizardClearAllPlayers() {
  state.selectedMatchPlayerIds.clear();
  state.matchScores = {};
  renderWizardPlayers();
}

function goToWizardStep(stepNum) {
  state.wizardStep = stepNum;

  // Update Dots and Lines
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dotStep${i}`);
    if (dot) {
      dot.classList.remove('active', 'completed');
      if (i < stepNum) dot.classList.add('completed');
      else if (i === stepNum) dot.classList.add('active');
    }
    const line = document.getElementById(`lineStep${i}`);
    if (line) {
      line.classList.toggle('completed', i < stepNum);
    }
  }

  // Update Counter Label
  const counterLabel = document.getElementById('stepCounterLabel');
  if (counterLabel) counterLabel.textContent = `Étape ${stepNum}/4`;

  // Update Back Button Label
  const backBtnText = document.getElementById('wizardBackText');
  if (backBtnText) {
    backBtnText.textContent = (stepNum === 1) ? 'Annuler' : 'Précédent';
  }

  // Switch Active Step View
  document.querySelectorAll('.wizard-step').forEach(step => step.classList.remove('active'));
  const targetStep = document.getElementById(`wizardStep${stepNum}`);
  if (targetStep) targetStep.classList.add('active');

  // Trigger step specific rendering
  if (stepNum === 1) {
    renderWizardGames();
  } else if (stepNum === 2) {
    renderWizardPlayers();
  } else if (stepNum === 3) {
    renderWizardScores();
  } else if (stepNum === 4) {
    renderWizardSummary();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function wizardBack() {
  if (state.wizardStep > 1) {
    goToWizardStep(state.wizardStep - 1);
  } else {
    // Exit wizard and return to previous view
    switchView(state.previousView || 'leaderboard');
  }
}

// --- STEP 1: Choisir le jeu ---
function renderWizardGames(filterQuery) {
  const container = document.getElementById('wizardGameGrid');
  if (!container) return;

  const searchInput = document.getElementById('wizardGameSearchInput');
  const query = ((filterQuery !== undefined ? filterQuery : searchInput?.value) || '').trim().toLowerCase();
  const clearBtn = document.getElementById('btnWizardClearGameSearch');
  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

  let filteredGames = state.games;
  if (query) {
    filteredGames = state.games.filter(g => g.name.toLowerCase().includes(query));
  }

  let html = '';

  filteredGames.forEach(game => {
    const isSelected = state.wizardGameId === game.id;
    html += `
      <div class="wizard-game-card ${isSelected ? 'selected' : ''}" onclick="selectWizardGame('${game.id}')">
        <div class="wizard-game-img-wrap">
          <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" class="wizard-game-img" onerror="this.src='/static/icons/default-game.svg'" loading="lazy" decoding="async">
          <div class="wizard-game-check">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
        <div class="wizard-game-name">${escapeHtml(game.name)}</div>
      </div>
    `;
  });

  // Card to create a new game
  html += `
    <div class="wizard-game-card add-new" onclick="toggleWizardAddGame(true, '${escapeHtml(query)}')">
      <div class="add-new-icon">+</div>
      <div style="font-weight:700; font-size:0.92rem; color:var(--accent);">Nouveau jeu</div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Ajouter à la bibliothèque</div>
    </div>
  `;

  if (filteredGames.length === 0 && query) {
    html = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 20px 14px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius); margin-bottom: 8px;">
        <div style="font-weight: 700; font-size: 0.92rem; color: var(--text); margin-bottom: 4px;">Aucun jeu ne correspond à "${escapeHtml(query)}"</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">Vous pouvez créer ce jeu en un clic pour enregistrer votre partie.</div>
        <button type="button" class="btn btn-sm btn-vibrant" onclick="toggleWizardAddGame(true, '${escapeHtml(query)}')">
          + Créer le jeu "${escapeHtml(query)}"
        </button>
      </div>
    ` + html;
  }

  container.innerHTML = html;
}

let _wizardFilterTimer = null;
function filterWizardGames(query) {
  clearTimeout(_wizardFilterTimer);
  _wizardFilterTimer = setTimeout(() => {
    renderWizardGames(query);
  }, 90);
}

function clearWizardGameSearch() {
  const searchInput = document.getElementById('wizardGameSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  const clearBtn = document.getElementById('btnWizardClearGameSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  renderWizardGames('');
}

function handleWizardGameSearchKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const query = (e.target.value || '').trim().toLowerCase();
    if (!query) return;
    const matches = state.games.filter(g => g.name.toLowerCase().includes(query));
    if (matches.length > 0) {
      selectWizardGame(matches[0].id);
    } else {
      toggleWizardAddGame(true, e.target.value.trim());
    }
  } else if (e.key === 'Escape') {
    clearWizardGameSearch();
  }
}

function selectWizardGame(gameId) {
  state.wizardGameId = gameId;
  renderWizardGames();
  // Automatically advance to Step 2 smoothly
  setTimeout(() => {
    goToWizardStep(2);
  }, 120);
}

// --- STEP 2: Sélectionner les participants ---
function renderWizardPlayers() {
  const container = document.getElementById('wizardPlayerGrid');
  const countEl = document.getElementById('selectedPlayersCount');
  const nextBtn = document.getElementById('btnStep2Next');
  if (!container) return;

  if (state.players.length === 0) {
    container.innerHTML = '';
  } else {
    let html = '';
    state.players.forEach(p => {
      const isSelected = state.selectedMatchPlayerIds.has(p.id);
      const avatarHtml = renderAvatarHtml(p.name, p.image_url, 36);

      html += `
        <div class="wizard-player-card ${isSelected ? 'selected' : ''}" onclick="toggleWizardPlayer('${p.id}')">
          <div class="wizard-player-left">
            ${avatarHtml}
            <div class="wizard-player-name">${escapeHtml(p.name)}</div>
          </div>
          <div class="wizard-player-checkbox">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  const selectedCount = state.selectedMatchPlayerIds.size;
  const labelEl = document.getElementById('btnStep2NextLabel');
  if (labelEl) {
    const plural = selectedCount > 1 ? 'joueurs' : 'joueur';
    labelEl.innerHTML = `Continuer avec <span id="selectedPlayersCount">${selectedCount}</span> ${plural}`;
  } else if (countEl) {
    countEl.textContent = selectedCount;
  }
  if (nextBtn) nextBtn.disabled = (selectedCount < 1);
}

function toggleWizardPlayer(playerId) {
  if (state.selectedMatchPlayerIds.has(playerId)) {
    state.selectedMatchPlayerIds.delete(playerId);
    delete state.matchScores[playerId];
  } else {
    state.selectedMatchPlayerIds.add(playerId);
    state.matchScores[playerId] = { is_winner: false };
  }
  renderWizardPlayers();
}

// --- STEP 3: Résultat de la partie (Gagné ou Perdu) ---
function renderWizardScores() {
  const container = document.getElementById('wizardScoresList');
  if (!container) return;

  if (state.selectedMatchPlayerIds.size === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  state.selectedMatchPlayerIds.forEach(pid => {
    const player = state.players.find(p => p.id === pid);
    if (!player) return;

    if (!state.matchScores[pid]) {
      state.matchScores[pid] = { is_winner: false };
    }
    const isWinner = Boolean(state.matchScores[pid].is_winner);
    const avatarHtml = renderAvatarHtml(player.name, player.image_url, 36);

    html += `
      <div class="wizard-score-card ${isWinner ? 'is-winner' : ''}">
        <div class="wizard-score-player">
          ${avatarHtml}
          <div>
            <div style="font-weight:700; font-size:1.02rem;">${escapeHtml(player.name)}</div>
            <div style="margin-top:2px;">
              ${isWinner ? '<span class="winner-tag">Vainqueur</span>' : '<span style="font-size:0.75rem; color:var(--text-muted);">Participant</span>'}
            </div>
          </div>
        </div>

        <div class="outcome-toggle-wrap">
          <button type="button" class="outcome-btn btn-won ${isWinner ? 'active' : ''}" 
                  onclick="setWizardOutcome('${pid}', true)">
            Gagné
          </button>
          <button type="button" class="outcome-btn btn-lost ${!isWinner ? 'active' : ''}" 
                  onclick="setWizardOutcome('${pid}', false)">
            Perdu
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function setWizardOutcome(playerId, isWon) {
  if (!state.matchScores[playerId]) {
    state.matchScores[playerId] = {};
  }
  state.matchScores[playerId].is_winner = isWon;
  renderWizardScores();
}

// --- STEP 4: Récapitulatif & Validation ---
function renderWizardSummary() {
  const card = document.getElementById('wizardSummaryCard');
  if (!card) return;

  const game = state.games.find(g => g.id === state.wizardGameId);
  const gameName = game ? game.name : 'Jeu de société';
  const gameImg = game ? game.image_url : '/static/icons/default-game.svg';

  let scoresHtml = '';
  state.selectedMatchPlayerIds.forEach(pid => {
    const player = state.players.find(p => p.id === pid);
    const isWinner = Boolean(state.matchScores[pid]?.is_winner);
    const pName = player ? player.name : 'Joueur';
    const avatarHtml = renderAvatarHtml(pName, player?.image_url, 26);

    scoresHtml += `
      <div class="recap-score-row">
        <div style="display:flex; align-items:center; gap:8px;">
          ${avatarHtml}
          <span style="font-weight:700;">${escapeHtml(pName)}</span>
        </div>
        <div>
          <span class="recap-outcome-badge ${isWinner ? 'won' : 'lost'}">${isWinner ? 'Gagné' : 'Perdu'}</span>
        </div>
      </div>
    `;
  });

  card.innerHTML = `
    <div class="recap-header">
      <img src="${escapeHtml(gameImg)}" alt="${escapeHtml(gameName)}" class="recap-game-img" onerror="this.src='/static/icons/default-game.svg'">
      <div>
        <div class="recap-game-name">${escapeHtml(gameName)}</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">${state.selectedMatchPlayerIds.size} ${state.selectedMatchPlayerIds.size > 1 ? 'joueurs participants' : 'joueur participant'}</div>
      </div>
    </div>
    <div class="recap-scores-grid">
      ${scoresHtml}
    </div>
  `;
}

async function submitWizardMatch() {
  if (!state.wizardGameId) {
    showToast('Erreur : aucun jeu sélectionné', 'error');
    goToWizardStep(1);
    return;
  }
  if (state.selectedMatchPlayerIds.size === 0) {
    showToast('Erreur : aucun participant sélectionné', 'error');
    goToWizardStep(2);
    return;
  }

  const playedAtVal = document.getElementById('wizardPlayedAt')?.value;

  const scoresPayload = Array.from(state.selectedMatchPlayerIds).map(pid => ({
    player_id: pid,
    score: state.matchScores[pid]?.is_winner ? 1.0 : 0.0,
    is_winner: Boolean(state.matchScores[pid]?.is_winner),
  }));

  try {
    await apiCall('/api/matches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        game_id: state.wizardGameId,
        played_at: playedAtVal ? new Date(playedAtVal).toISOString() : new Date().toISOString(),
        scores: scoresPayload,
        notes: null,
      }),
    });

    showToast('Partie enregistrée avec succès !', 'success');
    await loadAllData();
    switchView('leaderboard');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// HISTORY RENDERING & UNDO/REINSTATE
// ==========================================
function setHistoryTypeFilter(type, btn) {
  state.historyFilterType = type;
  document.querySelectorAll('.history-chip').forEach(c => c.classList.remove('active'));
  btn?.classList.add('active');
  renderHistory();
}

function onHistoryDateChange(val) {
  state.historyFilterDate = val || null;
  const clearBtn = document.getElementById('btnClearHistoryDate');
  if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';
  renderHistory();
}

function clearHistoryDateFilter() {
  state.historyFilterDate = null;
  const input = document.getElementById('historyDateInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btnClearHistoryDate');
  if (clearBtn) clearBtn.style.display = 'none';
  renderHistory();
}

function renderHistory() {
  const listEl = document.getElementById('historyList');
  if (!listEl) return;

  // Filter by Type
  let filtered = state.history;
  if (state.historyFilterType && state.historyFilterType !== 'ALL') {
    if (state.historyFilterType === 'MODIFICATIONS') {
      filtered = filtered.filter(a => a.action_type === 'UPDATE_GAME' || a.action_type === 'UPDATE_PLAYER');
    } else {
      filtered = filtered.filter(a => a.action_type === state.historyFilterType);
    }
  }

  // Filter by Date (YYYY-MM-DD)
  if (state.historyFilterDate) {
    filtered = filtered.filter(a => a.created_at && a.created_at.slice(0, 10) === state.historyFilterDate);
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  let html = '';
  filtered.forEach((action) => {
    const isActive = action.is_active;
    const dateFormatted = formatIsoDate(action.created_at);

    // Icon & Type
    let iconClass = 'match';
    let iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>';
    if (action.action_type === 'CREATE_GAME') {
      iconClass = 'game';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="4"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="16" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="16" r="1.5" fill="currentColor"/><circle cx="16" cy="16" r="1.5" fill="currentColor"/></svg>';
    } else if (action.action_type === 'CREATE_PLAYER') {
      iconClass = 'player';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
    } else if (action.action_type === 'UPDATE_GAME' || action.action_type === 'UPDATE_PLAYER') {
      iconClass = 'edit';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    } else if (action.action_type === 'UNDO_ACTION') {
      iconClass = 'undo';
      iconSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    }

    // Action button
    let actionBtnHtml = '';
    if (isActive) {
      actionBtnHtml = `
        <button class="btn-history-action btn-undo" onclick="triggerUndo('${action.id}')" title="Annuler cette action">
          Annuler
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn-history-action btn-reinstate" onclick="triggerReinstate('${action.id}')" title="Rétablir cette action">
          Rétablir
        </button>
      `;
    }

    // Details snippet
    let detailsHtml = '';
    if (action.action_type === 'RECORD_MATCH' && action.details?.participants) {
      const parts = action.details.participants
        .map(p => {
          const col = getPlayerColor(p.player_name);
          return `<span class="history-participant-item"><strong style="color:${col.bg};">${escapeHtml(p.player_name)}</strong> <span class="recap-outcome-badge ${p.is_winner ? 'won' : 'lost'}">${p.is_winner ? 'Gagné' : 'Perdu'}</span></span>`;
        })
        .join(' ');
      detailsHtml = `<div class="history-details-compact">${parts}</div>`;
    } else if (action.action_type === 'UNDO_ACTION') {
      detailsHtml = `<div class="history-details-compact" style="font-style: italic;">Cible : ${escapeHtml(action.details?.target_summary || 'Action')}</div>`;
    }

    html += `
      <div class="history-card compact ${isActive ? '' : 'is-cancelled'}">
        <div class="history-row-main">
          <div class="history-left">
            <div class="history-icon-badge ${iconClass}">${iconSvg}</div>
            <div class="history-meta">
              <div class="history-title">${escapeHtml(action.summary)}</div>
              <div class="history-time">${dateFormatted}</div>
            </div>
          </div>
          <div class="history-right">
            ${actionBtnHtml}
          </div>
        </div>
        ${detailsHtml}
      </div>
    `;
  });

  listEl.innerHTML = html;
}

async function triggerUndo(actionId) {
  try {
    await apiCall(`/api/history/${actionId}/undo`, { method: 'POST' });
    showToast('Action annulée avec succès', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message || 'Impossible d\'annuler cette action', 'error');
  }
}

async function triggerReinstate(actionId) {
  try {
    await apiCall(`/api/history/${actionId}/reinstate`, { method: 'POST' });
    showToast('Action rétablie avec succès', 'success');
    await loadAllData();
  } catch (err) {
    showToast(err.message || 'Impossible de rétablir cette action', 'error');
  }
}

// ==========================================
// SESSIONS HISTORY & MODE SWITCHING
// ==========================================
function setHistoryMode(mode) {
  state.historyMode = mode;
  const btnGlobal = document.getElementById('btnHistModeGlobal');
  const btnSessions = document.getElementById('btnHistModeSessions');
  const globalSection = document.getElementById('historyGlobalSection');
  const sessionsSection = document.getElementById('historySessionsSection');
  const subtitle = document.getElementById('historySubtitle');

  if (btnGlobal && btnSessions) {
    btnGlobal.classList.toggle('active', mode === 'global');
    btnSessions.classList.toggle('active', mode === 'sessions');
  }

  if (globalSection && sessionsSection) {
    globalSection.style.display = (mode === 'global') ? 'block' : 'none';
    sessionsSection.style.display = (mode === 'sessions') ? 'block' : 'none';
  }

  if (subtitle) {
    subtitle.textContent = (mode === 'global')
      ? 'Chaque action est enregistrée et réversible'
      : 'Regroupement chronologique des sessions de jeux';
  }

  if (mode === 'sessions') {
    renderHistorySessions();
  } else {
    renderHistory();
  }
}

function renderHistorySessions() {
  const container = document.getElementById('historySessionsList');
  if (!container) return;

  if (!state.sessions || state.sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 16px; text-align: center; color: var(--text-secondary);">
        <p>Aucune session enregistrée pour le moment.</p>
      </div>
    `;
    return;
  }

  const playerMap = {};
  state.players.forEach(p => { playerMap[p.id] = p; });

  const gameMap = {};
  state.games.forEach(g => {
    gameMap[g.id] = g;
    gameMap[g.name] = g;
  });

  let html = '';
  state.sessions.forEach(s => {
    let timeRange = '';
    if (s.start_time) {
      const dtStart = new Date(s.start_time);
      const startStr = dtStart.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      if (s.end_time) {
        const dtEnd = new Date(s.end_time);
        const endStr = dtEnd.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        timeRange = (startStr !== endStr) ? `${startStr} → ${endStr}` : startStr;
      } else {
        timeRange = startStr;
      }
    }

    const gamesList = s.games || (s.game_names || []).map(name => gameMap[name] || { name });
    const gamesHtml = gamesList.map(g => {
      const gName = g.name || g;
      const foundGame = gameMap[g.id] || gameMap[gName] || g;
      const imgUrl = foundGame.image_url || '/static/icons/default-game.svg';
      return `
        <span class="session-game-tag">
          <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(gName)}" onerror="this.src='/static/icons/default-game.svg'">
          <span>${escapeHtml(gName)}</span>
        </span>
      `;
    }).join('');

    const playersHtml = (s.player_ids || []).map(pid => {
      const p = playerMap[pid] || { name: '?', image_url: null };
      return renderAvatarHtml(p.name, p.image_url, 26, `title="${escapeHtml(p.name)}"`);
    }).join('');

    html += `
      <div class="session-card-item" onclick="openSessionDetailModal('${s.id}')">
        <div class="session-card-header">
          <div class="session-card-title">
            <span>${escapeHtml(s.name)}</span>
          </div>
          <span class="session-badge">${s.matches_count} ${s.matches_count > 1 ? 'parties' : 'partie'}</span>
        </div>

        ${timeRange ? `<div style="font-size: 0.78rem; color: var(--text-secondary); display:flex; align-items:center; gap:5px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> <span>${escapeHtml(timeRange)}</span></div>` : ''}

        ${gamesHtml ? `<div class="session-card-games">${gamesHtml}</div>` : ''}

        <div class="session-card-footer">
          <div class="session-players-avatars">
            ${playersHtml}
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); viewSessionFromHistory('${s.id}')" style="font-size:0.75rem; padding: 4px 10px; display:inline-flex; align-items:center; gap:5px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7.5c-.28 0-.5.22-.5.5v1.5c0 .28.22.5.5.5h9c.28 0 .5-.22.5-.5V19c0-.28-.22-.5-.5-.5H15c-.55 0-1-.45-1-1v-2.34"/><path d="M18 4H6v7a6 6 0 0 0 12 0V4z"/></svg>
            <span>Classement</span>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function viewSessionFromHistory(sessionId) {
  state.filterCategory = 'sessions';
  state.selectedLbSessionId = sessionId;
  state.selectedLbGameId = null;
  state.selectedLbPlayerId = null;
  updateFilterBarState();
  renderLeaderboardChipsCarousel();
  switchView('leaderboard');
}

async function openSessionDetailModal(sessionId) {
  openAppModal(`
    <div class="modal-header">
      <div class="modal-title">Détails de la session</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center; padding:36px 16px;">
      <div style="color:var(--text-muted); font-size:0.9rem;">Chargement des statistiques...</div>
    </div>
  `);

  try {
    const details = await apiCall(`/api/matches/sessions/${sessionId}`);
    renderSessionDetailContent(details);
  } catch (err) {
    showToast('Erreur lors du chargement des statistiques de la session', 'error');
    closeAppModal();
  }
}

function renderSessionDetailContent(d) {
  // 1. Highlights block
  let highlightsHtml = '';
  const highlightItems = [];

  if (d.mvp && d.mvp.matches_won > 0) {
    highlightItems.push(`
      <div class="session-highlight-row">
        <div class="session-highlight-left">
          <span style="font-size:1.1rem; line-height:1;">👑</span>
          <span>Grand vainqueur</span>
        </div>
        <div class="session-highlight-right">${escapeHtml(d.mvp.player_name)} (${d.mvp.matches_won} ${d.mvp.matches_won > 1 ? 'victoires' : 'victoire'})</div>
      </div>
    `);
  }

  if (d.top_game) {
    highlightItems.push(`
      <div class="session-highlight-row">
        <div class="session-highlight-left">
          <span style="font-size:1.1rem; line-height:1;">🎲</span>
          <span>Jeu le plus disputé</span>
        </div>
        <div class="session-highlight-right">${escapeHtml(d.top_game.name)} (${d.top_game.matches_count} ${d.top_game.matches_count > 1 ? 'parties' : 'partie'})</div>
      </div>
    `);
  }

  if (d.win_streak) {
    highlightItems.push(`
      <div class="session-highlight-row">
        <div class="session-highlight-left">
          <span style="font-size:1.1rem; line-height:1;">🔥</span>
          <span>Série de victoires</span>
        </div>
        <div class="session-highlight-right">${escapeHtml(d.win_streak.player_name)} (${d.win_streak.streak} d'affilée)</div>
      </div>
    `);
  }

  if (d.rivalry) {
    highlightItems.push(`
      <div class="session-highlight-row">
        <div class="session-highlight-left">
          <span style="font-size:1.1rem; line-height:1;">⚔️</span>
          <span>Face-à-face</span>
        </div>
        <div class="session-highlight-right">${escapeHtml(d.rivalry.p1_name)} (${d.rivalry.p1_wins}) vs ${escapeHtml(d.rivalry.p2_name)} (${d.rivalry.p2_wins})</div>
      </div>
    `);
  }

  if (d.best_score) {
    highlightItems.push(`
      <div class="session-highlight-row">
        <div class="session-highlight-left">
          <span style="font-size:1.1rem; line-height:1;">🎯</span>
          <span>Meilleur score</span>
        </div>
        <div class="session-highlight-right">${d.best_score.score} pts (${escapeHtml(d.best_score.player_name)} • ${escapeHtml(d.best_score.game_name)})</div>
      </div>
    `);
  }

  if (highlightItems.length > 0) {
    highlightsHtml = `
      <div class="session-highlight-box">
        ${highlightItems.join('')}
      </div>
    `;
  }

  // 2. Leaderboard rows
  let lbRowsHtml = '';
  (d.leaderboard || []).forEach(p => {
    const avHtml = renderAvatarHtml(p.player_name, p.player_image_url, 30);
    let rankBadge = `<span style="font-weight:700; font-size:0.82rem; min-width:24px; color:var(--text-muted);">#${p.rank}</span>`;
    if (p.rank === 1) rankBadge = `<span class="lb-medal medal-gold" style="width:22px; height:22px; font-size:0.75rem;">1</span>`;
    else if (p.rank === 2) rankBadge = `<span class="lb-medal medal-silver" style="width:22px; height:22px; font-size:0.75rem;">2</span>`;
    else if (p.rank === 3) rankBadge = `<span class="lb-medal medal-bronze" style="width:22px; height:22px; font-size:0.75rem;">3</span>`;

    lbRowsHtml += `
      <div class="session-player-rank-row">
        <div class="session-player-rank-left">
          ${rankBadge}
          ${avHtml}
          <div>
            <div style="font-weight:700; font-size:0.88rem;">${escapeHtml(p.player_name)}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">${p.matches_won} win${p.matches_won > 1 ? 's' : ''} / ${p.matches_played} game${p.matches_played > 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="session-player-rank-right">
          <div style="font-weight:800; font-size:0.95rem; color:var(--accent);">${p.win_percentage}%</div>
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Ratio</div>
        </div>
      </div>
    `;
  });

  // 3. Chronological matches
  let matchesHtml = '';
  (d.matches || []).forEach((m) => {
    const scoresPills = (m.scores || []).map(s => {
      const winnerClass = s.is_winner ? 'winner' : '';
      const scoreStr = (s.score !== null && s.score !== undefined && s.score > 0) ? ` : ${s.score} pts` : '';
      return `
        <span class="session-score-pill ${winnerClass}">
          ${escapeHtml(s.player_name)}${scoreStr}
        </span>
      `;
    }).join('');

    matchesHtml += `
      <div class="session-match-card-compact">
        <div class="session-match-card-top">
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${escapeHtml(m.game_image_url)}" alt="${escapeHtml(m.game_name)}" style="width:20px; height:20px; border-radius:4px; object-fit:cover;" onerror="this.src='/static/icons/default-game.svg'">
            <span>${escapeHtml(m.game_name)}</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:600;">${escapeHtml(m.time_str)}</span>
        </div>
        <div class="session-match-scores-pills">
          ${scoresPills}
        </div>
      </div>
    `;
  });

  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">
        <span>${escapeHtml(d.name)}</span>
      </div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
      <!-- Key Metrics 4-tile grid -->
      <div class="session-stats-grid">
        <div class="session-stat-tile">
          <div class="session-stat-tile-val">${escapeHtml(d.duration_str)}</div>
          <div class="session-stat-tile-lbl">Durée</div>
        </div>
        <div class="session-stat-tile">
          <div class="session-stat-tile-val">${d.matches_count}</div>
          <div class="session-stat-tile-lbl">Parties</div>
        </div>
        <div class="session-stat-tile">
          <div class="session-stat-tile-val">${d.games_count}</div>
          <div class="session-stat-tile-lbl">Jeux</div>
        </div>
        <div class="session-stat-tile">
          <div class="session-stat-tile-val">${d.players_count}</div>
          <div class="session-stat-tile-lbl">Joueurs</div>
        </div>
      </div>

      <!-- Highlights -->
      ${highlightsHtml}

      <!-- Session Leaderboard -->
      <div class="session-detail-section-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 4H6v7a6 6 0 0 0 12 0V4z"/></svg>
        <span>Classement de la session</span>
      </div>
      <div style="margin-bottom:14px;">
        ${lbRowsHtml}
      </div>

      <!-- Match History Timeline -->
      <div class="session-detail-section-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Parties jouées (${d.matches_count})</span>
      </div>
      <div>
        ${matchesHtml}
      </div>
    </div>
    <div class="modal-footer" style="gap:8px;">
      <button type="button" class="btn btn-secondary" style="flex:1;" onclick="closeAppModal()">Fermer</button>
      <button type="button" class="btn btn-vibrant" style="flex:2; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="closeAppModal(); viewSessionFromHistory('${d.id}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>Voir le classement complet</span>
      </button>
    </div>
  `;

  const container = document.getElementById('appModalContent');
  if (container) container.innerHTML = modalHtml;
}

// ==========================================
// GAMES LIBRARY RENDERING
// ==========================================
function renderGames() {
  const gridEl = document.getElementById('gamesGrid');
  if (!gridEl) return;

  if (state.games.length === 0) {
    gridEl.innerHTML = '';
    return;
  }

  // Sort games from most played to least played descending
  const sortedGames = [...state.games].sort((a, b) => {
    const countA = a.matches_played || 0;
    const countB = b.matches_played || 0;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name);
  });

  let html = '';
  sortedGames.forEach(game => {
    const count = game.matches_played || 0;
    const countLabel = count > 1 ? `${count} parties jouées` : `${count} partie jouée`;

    html += `
      <div class="game-card">
        <div class="game-card-img-wrap pressable-target" data-long-press="edit-game-image" data-id="${game.id}" title="Appui long pour changer l'image">
          <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" class="game-card-img" onerror="this.src='/static/icons/default-game.svg'" loading="lazy" decoding="async">
        </div>
        <div class="game-card-body">
          <div class="game-card-title pressable-target" data-long-press="edit-game-name" data-id="${game.id}" title="Appui long pour renommer">${escapeHtml(game.name)}</div>
          <div class="game-card-sub">${countLabel}</div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-secondary" style="flex:1;" onclick="viewGameLeaderboard('${game.id}')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Stats
            </button>
            <button class="btn btn-sm btn-vibrant" style="flex:1;" onclick="quickStartGameMatch('${game.id}')">
              + Jouer
            </button>
          </div>
        </div>
      </div>
    `;
  });

  gridEl.innerHTML = html;
}

function viewGameLeaderboard(gameId) {
  state.filterCategory = 'games';
  state.selectedLbGameId = gameId;
  state.selectedLbPlayerId = null;
  state.selectedLbSessionId = null;
  updateFilterBarState();
  renderLeaderboardChipsCarousel();
  switchView('leaderboard');
}

function viewPlayerLeaderboard(playerId) {
  state.filterCategory = 'players';
  state.selectedLbPlayerId = playerId;
  state.selectedLbGameId = null;
  state.selectedLbSessionId = null;
  updateFilterBarState();
  renderLeaderboardChipsCarousel();
  switchView('leaderboard');
}

function quickStartGameMatch(gameId) {
  state.wizardGameId = gameId;
  switchView('addMatch');
  goToWizardStep(2); // Jump straight to choosing players for this game!
}

// ==========================================
// PLAYERS RENDERING
// ==========================================
function renderPlayers(filterQuery) {
  const listEl = document.getElementById('playersList');
  if (!listEl) return;

  const searchInput = document.getElementById('playerSearchInput');
  const query = ((filterQuery !== undefined ? filterQuery : searchInput?.value) || '').trim().toLowerCase();
  const clearBtn = document.getElementById('btnPlayerClearSearch');
  if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';

  let filteredPlayers = state.players;
  if (query) {
    filteredPlayers = state.players.filter(p => p.name.toLowerCase().includes(query));
  }

  if (filteredPlayers.length === 0) {
    if (query) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 24px 16px; background: var(--surface); border: 1px dashed var(--border); border-radius: var(--radius); margin-top: 8px;">
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--text); margin-bottom: 4px;">Aucun joueur trouvé pour "${escapeHtml(query)}"</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">Vous pouvez créer ce joueur pour l'enregistrer dans la communauté.</div>
          <button type="button" class="btn btn-sm btn-primary" onclick="openCreatePlayerModal('playersView', '${escapeHtml(query)}')">
            + Créer le joueur "${escapeHtml(query)}"
          </button>
        </div>
      `;
    } else {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 0.9rem;">
          Aucun joueur enregistré pour le moment.
        </div>
      `;
    }
    return;
  }

  let html = '';
  filteredPlayers.forEach(p => {
    const avatarHtml = renderAvatarHtml(p.name, p.image_url, 44, `data-long-press="edit-player-image" data-id="${p.id}" title="Appui long pour changer la photo"`);
    html += `
      <div class="player-card" onclick="viewPlayerLeaderboard('${p.id}')">
        <div class="player-card-left">
          ${avatarHtml}
          <div>
            <div class="pressable-target" style="font-weight: 700; font-size: 1.05rem;" data-long-press="edit-player-name" data-id="${p.id}" title="Appui long pour renommer">
              ${escapeHtml(p.name)}
            </div>
          </div>
        </div>
        <div style="color: var(--text-muted); font-size: 1.25rem; font-weight: 300; line-height: 1; padding-right: 2px;">
          ›
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

let _playerFilterTimer = null;
function filterPlayers(query) {
  clearTimeout(_playerFilterTimer);
  _playerFilterTimer = setTimeout(() => {
    renderPlayers(query);
  }, 90);
}

function clearPlayerSearch() {
  const searchInput = document.getElementById('playerSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  const clearBtn = document.getElementById('btnPlayerClearSearch');
  if (clearBtn) clearBtn.style.display = 'none';
  renderPlayers('');
}

// ==========================================
// INLINE CREATION & REAL-TIME AUTOCOMPLETE
// ==========================================
function toggleInlineAddGame(show) {
  const panel = document.getElementById('inlineAddGamePanel');
  const btn = document.getElementById('btnToggleAddGame');
  if (!panel) return;
  const isOpening = (show !== undefined) ? show : panel.style.display === 'none';
  panel.style.display = isOpening ? 'block' : 'none';
  if (btn) btn.textContent = isOpening ? 'Fermer' : '+ Nouveau jeu';
  if (isOpening) {
    document.getElementById('formInlineGame')?.reset();
    const previewWrap = document.getElementById('gamePreviewWrap_gamesView');
    if (previewWrap) previewWrap.style.display = 'none';
    document.getElementById('inlineGameName_gamesView')?.focus();
  }
}

function toggleWizardAddGame(show, prefillName = '') {
  const panel = document.getElementById('wizardAddGamePanel');
  if (!panel) return;
  const isOpening = (show !== undefined) ? show : panel.style.display === 'none';
  panel.style.display = isOpening ? 'block' : 'none';
  if (isOpening) {
    document.getElementById('formWizardGame')?.reset();
    const previewWrap = document.getElementById('gamePreviewWrap_wizard');
    if (previewWrap) previewWrap.style.display = 'none';
    const input = document.getElementById('inlineGameName_wizard');
    if (input) {
      if (prefillName) input.value = prefillName;
      input.focus();
    }
  }
}

function triggerFileInput(inputId) {
  const el = document.getElementById(inputId);
  if (el) el.click();
}

function clearGameUploadPreview(context) {
  state.pendingGameUploadFile = null;
  state._lastOriginalGameFile = null;
  const fileInput = document.getElementById(`inlineGameFile_${context}`);
  if (fileInput) fileInput.value = '';
  const wrap = document.getElementById(`gamePreviewWrap_${context}`);
  if (wrap) wrap.style.display = 'none';
  const img = document.getElementById(`gamePreviewImg_${context}`);
  if (img) img.src = '';
}

async function autoFindGameCover(context) {
  const nameInput = document.getElementById(`inlineGameName_${context}`);
  const gameName = nameInput ? nameInput.value.trim() : '';

  if (!gameName) {
    showToast("Veuillez d'abord saisir le nom du jeu", 'warning');
    if (nameInput) nameInput.focus();
    return;
  }

  const btn = document.getElementById(`btnAutoCover_${context}`);
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> <span>Recherche...</span>`;
  }

  try {
    const res = await fetch(`/api/games/search-cover?name=${encodeURIComponent(gameName)}`);
    const data = await res.json();

    if (data.found && data.image_url) {
      state._lastOriginalGameFile = data.image_url;
      state._lastGameCoverCandidates = data.candidates || [data.image_url];

      openImageCropper({
        source: data.image_url,
        mode: 'square',
        title: `Boîte : ${gameName}`,
        onComplete: (croppedFile, dataUrl) => {
          state.pendingGameUploadFile = croppedFile;
          const img = document.getElementById(`gamePreviewImg_${context}`);
          const wrap = document.getElementById(`gamePreviewWrap_${context}`);
          if (img && wrap) {
            img.src = dataUrl;
            wrap.style.display = 'block';
          }
        },
      });
    } else {
      showToast(`Aucune image trouvée pour "${gameName}". Vous pouvez importer votre propre image.`, 'warning');
    }
  } catch (err) {
    console.error('Error auto-searching game cover:', err);
    showToast("Erreur lors de la recherche de l'image", 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
}

function previewGameUpload(input, context) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    state._lastOriginalGameFile = file;
    openImageCropper({
      source: file,
      mode: 'square',
      title: "Recadrer l'image du jeu",
      onComplete: (croppedFile, dataUrl) => {
        state.pendingGameUploadFile = croppedFile;
        const img = document.getElementById(`gamePreviewImg_${context}`);
        const wrap = document.getElementById(`gamePreviewWrap_${context}`);
        if (img && wrap) {
          img.src = dataUrl;
          wrap.style.display = 'block';
        }
      },
    });
  }
}

function reopenCropperForContext(type, context) {
  const source = state._lastOriginalGameFile || state.pendingGameUploadFile;
  if (!source) return;
  openImageCropper({
    source: source,
    mode: 'square',
    title: "Recadrer l'image du jeu",
    onComplete: (croppedFile, dataUrl) => {
      state.pendingGameUploadFile = croppedFile;
      const img = document.getElementById(`gamePreviewImg_${context}`);
      if (img) img.src = dataUrl;
    },
  });
}

// Autocomplete for Players
let _playerSuggestTimer = null;
function onPlayerInputTyping(val, context) {
  clearTimeout(_playerSuggestTimer);
  _playerSuggestTimer = setTimeout(() => {
    _renderPlayerSuggestions(val, context);
  }, 90);
}

function _renderPlayerSuggestions(val, context) {
  const query = val.trim().toLowerCase();
  const container = document.getElementById(`playerSuggestions_${context}`);
  if (!container) return;

  if (!query) {
    container.innerHTML = '';
    container.classList.remove('active');
    return;
  }

  const matches = state.players.filter(p => p.name.toLowerCase().includes(query));
  if (matches.length === 0) {
    container.innerHTML = '';
    container.classList.remove('active');
    return;
  }

  let html = '';
  matches.slice(0, 5).forEach(p => {
    const isSelectedInWizard = (context === 'wizard' && state.selectedMatchPlayerIds.has(p.id));
    const badgeText = isSelectedInWizard ? 'Déjà sélectionné' : 'Joueur existant';
    html += `
      <div class="suggestion-item" onclick="pickPlayerSuggestion('${p.id}', '${context}')">
        <div class="suggestion-label">
          <span>${escapeHtml(p.name)}</span>
        </div>
        <span class="suggestion-badge">${badgeText}</span>
      </div>
    `;
  });

  container.innerHTML = html;
  container.classList.add('active');
}

function pickPlayerSuggestion(playerId, context) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;

  const container = document.getElementById(`playerSuggestions_${context}`);
  if (container) {
    container.innerHTML = '';
    container.classList.remove('active');
  }

  if (context === 'wizard') {
    if (!state.selectedMatchPlayerIds.has(playerId)) {
      state.selectedMatchPlayerIds.add(playerId);
      state.matchScores[playerId] = { is_winner: false };
      renderWizardPlayers();
    }
    const input = document.getElementById('quickWizardPlayerInput');
    if (input) input.value = '';
    showToast(`Joueur '${player.name}' sélectionné`, 'info');
  } else if (context === 'playersView') {
    const input = document.getElementById('inlinePlayerInput');
    if (input) input.value = player.name;
    showToast(`Le joueur '${player.name}' existe déjà`, 'info');
  }
}

// Autocomplete for Games
let _gameSuggestTimer = null;
function onGameInputTyping(val, context) {
  clearTimeout(_gameSuggestTimer);
  _gameSuggestTimer = setTimeout(() => {
    _renderGameSuggestions(val, context);
  }, 90);
}

function _renderGameSuggestions(val, context) {
  const query = val.trim().toLowerCase();
  const container = document.getElementById(`gameSuggestions_${context}`);
  if (!container) return;

  if (!query) {
    container.innerHTML = '';
    container.classList.remove('active');
    return;
  }

  const matches = state.games.filter(g => g.name.toLowerCase().includes(query));
  if (matches.length === 0) {
    container.innerHTML = '';
    container.classList.remove('active');
    return;
  }

  let html = '';
  matches.slice(0, 5).forEach(g => {
    html += `
      <div class="suggestion-item" onclick="pickGameSuggestion('${g.id}', '${context}')">
        <div class="suggestion-label">
          <img src="${escapeHtml(g.image_url)}" style="width:20px; height:20px; border-radius:3px; object-fit:cover;" onerror="this.src='/static/icons/default-game.svg'" loading="lazy" decoding="async">
          <span>${escapeHtml(g.name)}</span>
        </div>
        <span class="suggestion-badge">Jeu existant</span>
      </div>
    `;
  });

  container.innerHTML = html;
  container.classList.add('active');
}

function pickGameSuggestion(gameId, context) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const container = document.getElementById(`gameSuggestions_${context}`);
  if (container) {
    container.innerHTML = '';
    container.classList.remove('active');
  }

  if (context === 'wizard') {
    toggleWizardAddGame(false);
    selectWizardGame(game.id);
    showToast(`Jeu '${game.name}' sélectionné`, 'info');
  } else if (context === 'gamesView') {
    toggleInlineAddGame(false);
    showToast(`Le jeu '${game.name}' existe déjà`, 'info');
    viewGameLeaderboard(game.id);
  }
}

// Close autocomplete suggestions on clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.input-autocomplete-wrap')) {
    document.querySelectorAll('.autocomplete-suggestions').forEach(el => {
      el.classList.remove('active');
    });
  }
});

async function submitInlineGame(e, context) {
  e.preventDefault();
  const nameInput = document.getElementById(`inlineGameName_${context}`);
  const name = nameInput?.value.trim();
  if (!name) return;

  // Check if game already exists
  const existing = state.games.find(g => g.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (context === 'wizard') {
      selectWizardGame(existing.id);
      showToast(`Jeu existant '${existing.name}' sélectionné`, 'info');
      toggleWizardAddGame(false);
      return;
    } else {
      showToast(`Le jeu '${existing.name}' existe déjà`, 'error');
      return;
    }
  }

  let imageUrl = null;
  try {
    if (state.pendingGameUploadFile) {
      const formData = new FormData();
      formData.append('file', state.pendingGameUploadFile);
      const uploadRes = await fetch('/api/games/upload-image', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Échec du téléversement de l\'image');
      const uploadData = await uploadRes.json();
      imageUrl = uploadData.url;
    }

    const newGame = await apiCall('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, image_url: imageUrl }),
    });

    state.games.push(newGame);
    state.pendingGameUploadFile = null;
    showToast(`Jeu '${newGame.name}' ajouté !`, 'success');
    await loadGames();
    await loadHistory();

    if (context === 'wizard') {
      toggleWizardAddGame(false);
      selectWizardGame(newGame.id);
    } else {
      toggleInlineAddGame(false);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitInlinePlayer(context) {
  const inputId = (context === 'wizard') ? 'quickWizardPlayerInput' : 'inlinePlayerInput';
  const input = document.getElementById(inputId);
  const name = input?.value.trim();
  if (!name) return;

  // Check if player already exists
  const existing = state.players.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (context === 'wizard') {
      state.selectedMatchPlayerIds.add(existing.id);
      if (!state.matchScores[existing.id]) {
        state.matchScores[existing.id] = { is_winner: false };
      }
      renderWizardPlayers();
      input.value = '';
      showToast(`Joueur '${existing.name}' sélectionné`, 'info');
      return;
    } else {
      showToast(`Le joueur '${existing.name}' existe déjà`, 'error');
      return;
    }
  }

  try {
    const newPlayer = await apiCall('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    state.players.push(newPlayer);
    input.value = '';

    if (context === 'wizard') {
      state.selectedMatchPlayerIds.add(newPlayer.id);
      state.matchScores[newPlayer.id] = { is_winner: false };
      renderWizardPlayers();
    } else {
      renderPlayers();
    }

    showToast(`Joueur '${newPlayer.name}' ajouté`, 'success');
    await loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// UTILITIES
// ==========================================
function setupInitialDateTime() {
  const dateInput = document.getElementById('wizardPlayedAt');
  if (dateInput) {
    const now = new Date();
    const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    dateInput.value = localIso;
  }
}

function showToast(message, type = 'info', duration = 3200) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconSvg = type === 'success'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    : type === 'error'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `
    ${iconSvg}
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatIsoDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

// ==========================================
// MODALS SYSTEM (Game Image, Player Name, Player Photo, Leaderboard Filters)
// ==========================================
function openAppModal(htmlContent) {
  const overlay = document.getElementById('appModalOverlay');
  const container = document.getElementById('appModalContent');
  if (!overlay || !container) return;
  container.innerHTML = htmlContent;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeAppModal() {
  const overlay = document.getElementById('appModalOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.style.overflow = '';
}

// Escape key closes modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAppModal();
});

// Live image URL validator
// ------------------------------------------
// Minimalist Guided Photo Viewer & Actions (Long-press)
// ------------------------------------------
function openEditGameImageModal(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const currentImg = game.image_url || '/static/icons/default-game.svg';
  const hasCustomImg = Boolean(game.image_url && !game.image_url.includes('default-game.svg'));

  const previewHtml = `
    <div class="photo-preview-big game-photo-square">
      <img src="${escapeHtml(currentImg)}" alt="${escapeHtml(game.name)}" onerror="this.src='/static/icons/default-game.svg'">
    </div>
  `;

  const actionsHtml = hasCustomImg
    ? `
      <div class="photo-actions-stack">
        <button type="button" class="btn btn-secondary" onclick="cropExistingGameImage('${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
          <span>Recadrer / Ajuster</span>
        </button>
        <button type="button" class="btn btn-vibrant" onclick="guidedTriggerFilePick('game', '${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Importer une image</span>
        </button>
        <button type="button" id="btnAutoCoverModal_${game.id}" class="btn btn-secondary" onclick="autoFindCoverForExistingGame('${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <span>Rechercher automatiquement</span>
        </button>
        <button type="button" class="btn btn-outline-danger" onclick="deleteGameImage('${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Rétablir l'icône par défaut</span>
        </button>
      </div>
    `
    : `
      <div class="photo-actions-stack">
        <button type="button" class="btn btn-vibrant" onclick="guidedTriggerFilePick('game', '${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Importer une image</span>
        </button>
        <button type="button" id="btnAutoCoverModal_${game.id}" class="btn btn-secondary" onclick="autoFindCoverForExistingGame('${game.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          <span>Rechercher automatiquement</span>
        </button>
      </div>
    `;

  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(game.name)}</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;">
      ${previewHtml}
      ${actionsHtml}

      <input type="file" id="guidedFileInput_game_${game.id}" accept="image/*" style="display:none;" onchange="onGuidedFileChosen(this, 'game', '${game.id}')">
    </div>
  `;

  openAppModal(modalHtml);
}

async function autoFindCoverForExistingGame(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const btn = document.getElementById(`btnAutoCoverModal_${gameId}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> <span>Recherche...</span>`;
  }

  try {
    const res = await fetch(`/api/games/search-cover?name=${encodeURIComponent(game.name)}`);
    const data = await res.json();
    if (data.found && data.image_url) {
      closeAppModal();
      openImageCropper({
        source: data.image_url,
        mode: 'square',
        title: `Boîte : ${game.name}`,
        onComplete: async (croppedFile) => {
          await saveGuidedCroppedImage('game', game.id, croppedFile);
        },
      });
    } else {
      showToast(`Aucune boîte trouvée pour "${game.name}"`, 'warning');
    }
  } catch (err) {
    console.error('Error auto-searching game cover:', err);
    showToast("Erreur lors de la recherche automatique", 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
}

function openEditPlayerImageModal(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;

  const currentImg = player.image_url || '';
  const initial = player.name.charAt(0).toUpperCase();
  const color = getPlayerColor(player.name);

  const previewHtml = currentImg
    ? `<div class="photo-preview-big player-photo-circle">
         <img src="${escapeHtml(currentImg)}" alt="${escapeHtml(player.name)}">
       </div>`
    : `<div class="photo-preview-big player-photo-circle" style="background-color:${color.bg}; color:${color.text}; font-size:3.5rem; font-weight:800;">
         ${escapeHtml(initial)}
       </div>`;

  const actionsHtml = currentImg
    ? `
      <div class="photo-actions-stack">
        <button type="button" class="btn btn-secondary" onclick="cropExistingPlayerImage('${player.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
          <span>Recadrer / Ajuster</span>
        </button>
        <button type="button" class="btn btn-vibrant" onclick="guidedTriggerFilePick('player', '${player.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Changer la photo</span>
        </button>
        <button type="button" class="btn btn-outline-danger" onclick="deletePlayerImage('${player.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>Supprimer la photo</span>
        </button>
      </div>
    `
    : `
      <div class="photo-actions-stack">
        <button type="button" class="btn btn-vibrant" onclick="guidedTriggerFilePick('player', '${player.id}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span>Ajouter une photo</span>
        </button>
      </div>
    `;

  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">${escapeHtml(player.name)}</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;">
      ${previewHtml}
      ${actionsHtml}

      <input type="file" id="guidedFileInput_player_${player.id}" accept="image/*" style="display:none;" onchange="onGuidedFileChosen(this, 'player', '${player.id}')">
    </div>
  `;

  openAppModal(modalHtml);
}

function guidedTriggerFilePick(type, id) {
  const fileInput = document.getElementById(`guidedFileInput_${type}_${id}`);
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

function onGuidedFileChosen(input, type, id) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    openImageCropper({
      source: file,
      mode: type === 'player' ? 'circle' : 'square',
      title: type === 'player' ? "Recadrer la photo" : "Recadrer l'image du jeu",
      onComplete: async (croppedFile) => {
        await saveGuidedCroppedImage(type, id, croppedFile);
      }
    });
  }
}

function cropExistingGameImage(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game || !game.image_url) return;

  openImageCropper({
    source: game.image_url,
    mode: 'square',
    title: "Recadrer l'image du jeu",
    onComplete: async (croppedFile) => {
      await saveGuidedCroppedImage('game', gameId, croppedFile);
    }
  });
}

function cropExistingPlayerImage(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player || !player.image_url) return;

  openImageCropper({
    source: player.image_url,
    mode: 'circle',
    title: "Recadrer la photo",
    onComplete: async (croppedFile) => {
      await saveGuidedCroppedImage('player', playerId, croppedFile);
    }
  });
}

async function saveGuidedCroppedImage(type, id, croppedFile) {
  try {
    showToast("Enregistrement de l'image...", 'info');
    const formData = new FormData();
    formData.append('file', croppedFile);
    const uploadUrl = type === 'player' ? '/api/players/upload-image' : '/api/games/upload-image';
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}));
      throw new Error(err.detail || 'Échec du téléversement');
    }
    const uploadData = await uploadRes.json();
    const updateUrl = type === 'player' ? `/api/players/${id}/image` : `/api/games/${id}/image`;
    await apiCall(updateUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: uploadData.url }),
    });

    closeAppModal();
    showToast(type === 'player' ? 'Photo de profil mise à jour !' : 'Image du jeu mise à jour !', 'success');
    if (type === 'player') {
      await loadPlayers();
    } else {
      await loadGames();
    }
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteGameImage(gameId) {
  if (!confirm("Rétablir l'image par défaut pour ce jeu ?")) return;
  try {
    await apiCall(`/api/games/${gameId}/image`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: '/static/icons/default-game.svg' }),
    });
    closeAppModal();
    showToast("Image du jeu réinitialisée", 'info');
    await loadGames();
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deletePlayerImage(playerId) {
  if (!confirm('Supprimer la photo de ce joueur ?')) return;
  try {
    await apiCall(`/api/players/${playerId}/image`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: null }),
    });
    closeAppModal();
    showToast('Photo de profil supprimée', 'info');
    await loadPlayers();
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ------------------------------------------
// Modal 3: Edit Player Name
// ------------------------------------------
function openEditPlayerNameModal(playerId) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return;

  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">Renommer le joueur</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <form onsubmit="submitEditPlayerName(event, '${player.id}')">
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="editPlayerNameInput">Nouveau pseudo</label>
          <input type="text" id="editPlayerNameInput" class="custom-input" value="${escapeHtml(player.name)}" required autocomplete="off" maxlength="50">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" style="flex:1;" onclick="closeAppModal()">Annuler</button>
        <button type="submit" id="btnSavePlayerName" class="btn btn-vibrant" style="flex:1;">Enregistrer</button>
      </div>
    </form>
  `;

  openAppModal(modalHtml);
  setTimeout(() => {
    const input = document.getElementById('editPlayerNameInput');
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

async function submitEditPlayerName(e, playerId) {
  e.preventDefault();
  const input = document.getElementById('editPlayerNameInput');
  const newName = input?.value.trim();
  if (!newName) return;

  const player = state.players.find(p => p.id === playerId);
  if (player && player.name.toLowerCase() === newName.toLowerCase()) {
    closeAppModal();
    return;
  }

  const btn = document.getElementById('btnSavePlayerName');
  if (btn) btn.disabled = true;

  try {
    await apiCall(`/api/players/${playerId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });

    closeAppModal();
    showToast(`Joueur renommé en '${newName}' !`, 'success');
    await loadPlayers();
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ------------------------------------------
// Modal 4: Edit Game Name
// ------------------------------------------
function openEditGameNameModal(gameId) {
  const game = state.games.find(g => g.id === gameId);
  if (!game) return;

  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">Renommer le jeu</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <form onsubmit="submitEditGameName(event, '${game.id}')">
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="editGameNameInput">Nouveau nom du jeu</label>
          <input type="text" id="editGameNameInput" class="custom-input" value="${escapeHtml(game.name)}" required autocomplete="off" maxlength="100">
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" style="flex:1;" onclick="closeAppModal()">Annuler</button>
        <button type="submit" id="btnSaveGameName" class="btn btn-vibrant" style="flex:1;">Enregistrer</button>
      </div>
    </form>
  `;

  openAppModal(modalHtml);
  setTimeout(() => {
    const input = document.getElementById('editGameNameInput');
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

async function submitEditGameName(e, gameId) {
  e.preventDefault();
  const input = document.getElementById('editGameNameInput');
  const newName = input?.value.trim();
  if (!newName) return;

  const game = state.games.find(g => g.id === gameId);
  if (game && game.name.toLowerCase() === newName.toLowerCase()) {
    closeAppModal();
    return;
  }

  const btn = document.getElementById('btnSaveGameName');
  if (btn) btn.disabled = true;

  try {
    await apiCall(`/api/games/${gameId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });

    closeAppModal();
    showToast(`Jeu renommé en '${newName}' !`, 'success');
    await loadGames();
    await loadLeaderboard();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ==========================================
// UNIVERSAL LONG-PRESS DELEGATION
// ==========================================
function initLongPressDelegation() {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let hasTriggered = false;

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const start = (e) => {
    const target = e.target.closest('[data-long-press]');
    if (!target) return;

    hasTriggered = false;
    const touch = e.touches ? e.touches[0] : e;
    startX = touch.clientX;
    startY = touch.clientY;

    cancel();
    timer = setTimeout(() => {
      hasTriggered = true;
      setTimeout(() => { hasTriggered = false; }, 800);
      if (navigator.vibrate) {
        try { navigator.vibrate(50); } catch (_) {}
      }
      const action = target.getAttribute('data-long-press');
      const id = target.getAttribute('data-id');
      handleLongPressAction(action, id);
    }, 450);
  };

  const move = (e) => {
    if (!timer) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (dx > 10 || dy > 10) {
      cancel();
    }
  };

  document.addEventListener('touchstart', start, { passive: true });
  document.addEventListener('touchmove', move, { passive: true });
  document.addEventListener('touchend', () => cancel());
  document.addEventListener('touchcancel', () => cancel());

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    start(e);
  });
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', () => cancel());

  // Prevent click after triggering long-press
  document.addEventListener('click', (e) => {
    if (hasTriggered) {
      e.preventDefault();
      e.stopPropagation();
      hasTriggered = false;
    }
  }, true);

  // Right-click support on desktop
  document.addEventListener('contextmenu', (e) => {
    const target = e.target.closest('[data-long-press]');
    if (target) {
      e.preventDefault();
      hasTriggered = true;
      setTimeout(() => { hasTriggered = false; }, 800);
      const action = target.getAttribute('data-long-press');
      const id = target.getAttribute('data-id');
      handleLongPressAction(action, id);
    }
  });
}

function handleLongPressAction(action, id) {
  if (action === 'edit-game-image') {
    openEditGameImageModal(id);
  } else if (action === 'edit-game-name') {
    openEditGameNameModal(id);
  } else if (action === 'edit-player-image') {
    openEditPlayerImageModal(id);
  } else if (action === 'edit-player-name') {
    openEditPlayerNameModal(id);
  }
}

// ------------------------------------------
// Modal 5: Create Player with optional photo
// ------------------------------------------
let _createPlayerPendingFile = null;

function openCreatePlayerModal(context = 'playersView', prefillName = '') {
  _createPlayerPendingFile = null;

  const prefillVal = prefillName ? escapeHtml(prefillName) : '';
  const modalHtml = `
    <div class="modal-header">
      <div class="modal-title">Nouveau joueur</div>
      <button type="button" class="modal-close-btn" onclick="closeAppModal()">✕</button>
    </div>
    <form onsubmit="submitCreatePlayerWithPhoto(event, '${context}')">
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="createPlayerNameInput">Pseudo du joueur</label>
          <input type="text" id="createPlayerNameInput" class="custom-input" placeholder="Ex: Thomas, Sarah..." value="${prefillVal}" required autocomplete="off" maxlength="50">
        </div>

        <div class="form-group" style="margin-top:14px;">
          <label class="form-label">Photo de profil (optionnelle)</label>
          <input type="file" id="createPlayerFileInput" accept="image/*" class="custom-input" onchange="onCreatePlayerFileChange(this)">

          <div id="createPlayerPreviewWrap" style="margin-top:10px; text-align:center;">
            <img id="createPlayerPreviewImg" src="" alt="Aperçu" style="max-height:80px; border-radius:50%; width:80px; height:80px; object-fit:cover; display:none; margin:0 auto; border:1px solid var(--border);">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" style="flex:1;" onclick="closeAppModal()">Annuler</button>
        <button type="submit" id="btnSubmitCreatePlayer" class="btn btn-vibrant" style="flex:1;">Créer le joueur</button>
      </div>
    </form>
  `;
  openAppModal(modalHtml);
  setTimeout(() => document.getElementById('createPlayerNameInput')?.focus(), 100);
}

function onCreatePlayerFileChange(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    openImageCropper({
      source: file,
      mode: 'circle',
      title: "Recadrer la photo du joueur",
      onComplete: (croppedFile, dataUrl) => {
        _createPlayerPendingFile = croppedFile;
        const img = document.getElementById('createPlayerPreviewImg');
        if (img) {
          img.src = dataUrl;
          img.style.display = 'block';
        }
      },
      onCancel: () => {
        if (!_createPlayerPendingFile) {
          const img = document.getElementById('createPlayerPreviewImg');
          if (img) img.style.display = 'none';
        }
      }
    });
  } else {
    _createPlayerPendingFile = null;
  }
}

async function submitCreatePlayerWithPhoto(e, context) {
  e.preventDefault();
  const name = document.getElementById('createPlayerNameInput')?.value.trim();
  if (!name) return;

  const btn = document.getElementById('btnSubmitCreatePlayer');
  if (btn) btn.disabled = true;

  try {
    let finalImageUrl = null;
    if (_createPlayerPendingFile) {
      const formData = new FormData();
      formData.append('file', _createPlayerPendingFile);
      const uploadRes = await fetch('/api/players/upload-image', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Échec du téléversement de la photo');
      const data = await uploadRes.json();
      finalImageUrl = data.url;
    }

    const newPlayer = await apiCall('/api/players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, image_url: finalImageUrl }),
    });

    state.players.push(newPlayer);
    closeAppModal();
    showToast(`Joueur '${newPlayer.name}' créé !`, 'success');

    if (context === 'wizard') {
      state.selectedMatchPlayerIds.add(newPlayer.id);
      state.matchScores[newPlayer.id] = { is_winner: false };
      renderWizardPlayers();
    } else {
      renderPlayers();
    }
    await loadHistory();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) btn.disabled = false;
  }
}

// ==========================================
// INTERACTIVE IMAGE CROPPER & ZOOM SYSTEM
// ==========================================
const cropperState = {
  isOpen: false,
  source: null,
  mode: 'square', // 'square' | 'circle'
  title: "Recadrer l'image",
  onComplete: null,
  onCancel: null,
  image: null,
  imgNaturalWidth: 0,
  imgNaturalHeight: 0,
  scale: 1,
  minScale: 1,
  zoomFactor: 1,
  rotation: 0,
  x: 0,
  y: 0,
  isDragging: false,
  startX: 0,
  startY: 0,
  initialX: 0,
  initialY: 0,
  _objectUrlToRevoke: null,
};

function initCropperEvents() {
  const viewport = document.getElementById('cropperViewport');
  if (!viewport || viewport._eventsInitialized) return;
  viewport._eventsInitialized = true;

  // Mouse drag
  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !cropperState.isOpen) return;
    e.preventDefault();
    cropperState.isDragging = true;
    cropperState.startX = e.clientX;
    cropperState.startY = e.clientY;
    cropperState.initialX = cropperState.x;
    cropperState.initialY = cropperState.y;
  });

  window.addEventListener('mousemove', (e) => {
    if (!cropperState.isDragging) return;
    const dx = e.clientX - cropperState.startX;
    const dy = e.clientY - cropperState.startY;
    cropperState.x = cropperState.initialX + dx;
    cropperState.y = cropperState.initialY + dy;
    clampCropperBounds();
    updateCropperTransform();
  });

  window.addEventListener('mouseup', () => {
    cropperState.isDragging = false;
  });

  // Mouse wheel zoom
  viewport.addEventListener('wheel', (e) => {
    if (!cropperState.isOpen) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.12 : -0.12;
    cropperZoomStep(delta);
  }, { passive: false });

  // Touch drag & pinch-to-zoom
  let initialPinchDist = 0;
  let initialPinchZoom = 1;

  viewport.addEventListener('touchstart', (e) => {
    if (!cropperState.isOpen) return;
    if (e.touches.length === 1) {
      cropperState.isDragging = true;
      cropperState.startX = e.touches[0].clientX;
      cropperState.startY = e.touches[0].clientY;
      cropperState.initialX = cropperState.x;
      cropperState.initialY = cropperState.y;
    } else if (e.touches.length === 2) {
      cropperState.isDragging = false;
      initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialPinchZoom = cropperState.zoomFactor;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', (e) => {
    if (!cropperState.isOpen) return;
    if (e.touches.length === 1 && cropperState.isDragging) {
      e.preventDefault();
      const dx = e.touches[0].clientX - cropperState.startX;
      const dy = e.touches[0].clientY - cropperState.startY;
      cropperState.x = cropperState.initialX + dx;
      cropperState.y = cropperState.initialY + dy;
      clampCropperBounds();
      updateCropperTransform();
    } else if (e.touches.length === 2 && initialPinchDist > 0) {
      e.preventDefault();
      const currentDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = currentDist / initialPinchDist;
      const newZoom = Math.max(1, Math.min(4, initialPinchZoom * factor));
      cropperState.zoomFactor = Math.round(newZoom * 100) / 100;
      clampCropperBounds();
      updateCropperTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      cropperState.isDragging = false;
      initialPinchDist = 0;
    } else if (e.touches.length === 1) {
      cropperState.isDragging = true;
      cropperState.startX = e.touches[0].clientX;
      cropperState.startY = e.touches[0].clientY;
      cropperState.initialX = cropperState.x;
      cropperState.initialY = cropperState.y;
      initialPinchDist = 0;
    }
  });
}

function clampCropperBounds() {
  const VIEWPORT_SIZE = 270;
  const isRotated = (cropperState.rotation % 180 !== 0);
  const effectiveW = isRotated ? cropperState.imgNaturalHeight : cropperState.imgNaturalWidth;
  const effectiveH = isRotated ? cropperState.imgNaturalWidth : cropperState.imgNaturalHeight;

  if (!effectiveW || !effectiveH) return;

  cropperState.minScale = Math.max(VIEWPORT_SIZE / effectiveW, VIEWPORT_SIZE / effectiveH);
  cropperState.scale = cropperState.minScale * cropperState.zoomFactor;

  const renderedW = effectiveW * cropperState.scale;
  const renderedH = effectiveH * cropperState.scale;

  const maxX = Math.max(0, (renderedW - VIEWPORT_SIZE) / 2);
  const maxY = Math.max(0, (renderedH - VIEWPORT_SIZE) / 2);

  cropperState.x = Math.max(-maxX, Math.min(maxX, cropperState.x));
  cropperState.y = Math.max(-maxY, Math.min(maxY, cropperState.y));
}

function updateCropperTransform() {
  const imgEl = document.getElementById('cropperImage');
  if (!imgEl) return;
  imgEl.style.transform = `translate(-50%, -50%) translate3d(${cropperState.x}px, ${cropperState.y}px, 0) rotate(${cropperState.rotation}deg) scale(${cropperState.scale})`;

  const range = document.getElementById('cropperZoomRange');
  if (range) {
    range.value = cropperState.zoomFactor;
  }
}

function openImageCropper(options) {
  initCropperEvents();

  cropperState.isOpen = true;
  cropperState.source = options.source;
  cropperState.mode = options.mode || 'square';
  cropperState.title = options.title || "Recadrer l'image";
  cropperState.onComplete = options.onComplete || null;
  cropperState.onCancel = options.onCancel || null;
  cropperState.rotation = 0;
  cropperState.zoomFactor = 1;
  cropperState.x = 0;
  cropperState.y = 0;

  const titleEl = document.getElementById('cropperTitle');
  if (titleEl) titleEl.textContent = cropperState.title;

  const maskEl = document.getElementById('cropperMask');
  if (maskEl) {
    maskEl.className = 'cropper-mask-shape ' + (cropperState.mode === 'circle' ? 'mask-circle' : 'mask-square');
  }

  const overlay = document.getElementById('imageCropperOverlay');
  if (overlay) overlay.style.display = 'flex';

  const imgEl = document.getElementById('cropperImage');
  if (imgEl) imgEl.style.display = 'none';

  if (cropperState._objectUrlToRevoke) {
    URL.revokeObjectURL(cropperState._objectUrlToRevoke);
    cropperState._objectUrlToRevoke = null;
  }

  let srcUrl = '';
  if (options.source instanceof File || options.source instanceof Blob) {
    srcUrl = URL.createObjectURL(options.source);
    cropperState._objectUrlToRevoke = srcUrl;
  } else if (typeof options.source === 'string') {
    const rawUrl = options.source.trim();
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      srcUrl = `/api/games/proxy-image?url=${encodeURIComponent(rawUrl)}`;
    } else {
      srcUrl = rawUrl;
    }
  }

  if (!srcUrl) {
    showToast("Source d'image invalide", 'error');
    closeImageCropper();
    return;
  }

  const testImg = new Image();
  testImg.crossOrigin = 'anonymous';
  testImg.onload = () => {
    cropperState.image = testImg;
    cropperState.imgNaturalWidth = testImg.naturalWidth;
    cropperState.imgNaturalHeight = testImg.naturalHeight;

    if (imgEl) {
      imgEl.src = srcUrl;
      imgEl.style.display = 'block';
    }

    clampCropperBounds();
    updateCropperTransform();
  };
  testImg.onerror = () => {
    showToast("Impossible de charger l'image pour le recadrage", 'error');
    closeImageCropper();
  };
  testImg.src = srcUrl;
}

function cropperZoomStep(delta) {
  const newZoom = Math.max(1, Math.min(4, cropperState.zoomFactor + delta));
  cropperState.zoomFactor = Math.round(newZoom * 100) / 100;
  clampCropperBounds();
  updateCropperTransform();
}

function cropperOnZoomRange(val) {
  cropperState.zoomFactor = parseFloat(val);
  clampCropperBounds();
  updateCropperTransform();
}

function cropperRotate90() {
  cropperState.rotation = (cropperState.rotation + 90) % 360;
  clampCropperBounds();
  updateCropperTransform();
}

function cropperResetTransform() {
  cropperState.zoomFactor = 1;
  cropperState.rotation = 0;
  cropperState.x = 0;
  cropperState.y = 0;
  clampCropperBounds();
  updateCropperTransform();
}

function closeImageCropper() {
  cropperState.isOpen = false;
  const overlay = document.getElementById('imageCropperOverlay');
  if (overlay) overlay.style.display = 'none';

  if (cropperState._objectUrlToRevoke) {
    URL.revokeObjectURL(cropperState._objectUrlToRevoke);
    cropperState._objectUrlToRevoke = null;
  }

  const onCancel = cropperState.onCancel;
  cropperState.onComplete = null;
  cropperState.onCancel = null;
  if (onCancel) onCancel();
}

function applyImageCrop() {
  if (!cropperState.image || !cropperState.isOpen) return;

  const btn = document.getElementById('btnCropperApply');
  if (btn) btn.disabled = true;

  try {
    const OUTPUT_SIZE = (cropperState.mode === 'circle') ? 400 : 600;
    const VIEWPORT_SIZE = 270;
    const ratio = OUTPUT_SIZE / VIEWPORT_SIZE;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Move to center of canvas
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    // Apply pan offset
    ctx.translate(cropperState.x * ratio, cropperState.y * ratio);
    // Apply rotation
    ctx.rotate((cropperState.rotation * Math.PI) / 180);
    // Apply zoom
    const drawW = cropperState.imgNaturalWidth * cropperState.scale * ratio;
    const drawH = cropperState.imgNaturalHeight * cropperState.scale * ratio;
    ctx.drawImage(cropperState.image, -drawW / 2, -drawH / 2, drawW, drawH);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    canvas.toBlob((blob) => {
      if (btn) btn.disabled = false;
      if (!blob) {
        showToast('Erreur lors du recadrage', 'error');
        return;
      }
      const filename = (cropperState.mode === 'circle') ? 'player_avatar.jpg' : 'game_cover.jpg';
      const file = new File([blob], filename, { type: 'image/jpeg' });

      const onComplete = cropperState.onComplete;
      closeImageCropper();

      if (onComplete) {
        onComplete(file, dataUrl);
      }
    }, 'image/jpeg', 0.92);
  } catch (err) {
    if (btn) btn.disabled = false;
    console.error('Erreur canvas toBlob/toDataURL:', err);
    showToast("Impossible d'appliquer le recadrage : " + err.message, 'error');
  }
}

