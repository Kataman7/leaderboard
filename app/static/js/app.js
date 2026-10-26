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
  selectedLbGameId: null, // null for global, or game_id for specific game
  leaderboardSort: 'ratio', // 'ratio' | 'wins'
  players: [],
  games: [],
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
  setupInitialDateTime();
  loadAllData();
});

// ==========================================
// PWA & SERVICE WORKER
// ==========================================
let deferredInstallPrompt = null;

function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker enregistré :', reg.scope))
        .catch((err) => console.warn('Service Worker échec :', err));
    });
  }

  // Handle Chrome / Android PWA installation prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showPwaInstallBanner();
  });

  // Handle app installed
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    dismissPwaBanner();
    showToast('Application installée sur votre appareil !', 'success');
  });

  // Check iOS Safari install hint
  checkIosInstallPrompt();
}

function showPwaInstallBanner() {
  const dismissedTime = localStorage.getItem('pwa_dismissed_at');
  if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 43200000) {
    return;
  }
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) {
    banner.style.display = 'flex';
  }
}

function dismissPwaBanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) {
    banner.style.display = 'none';
  }
  localStorage.setItem('pwa_dismissed_at', Date.now().toString());
}

async function triggerPwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      dismissPwaBanner();
    }
    deferredInstallPrompt = null;
  }
}

function checkIosInstallPrompt() {
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isIos && !isStandalone) {
    const dismissedTime = localStorage.getItem('pwa_dismissed_at');
    if (dismissedTime && Date.now() - parseInt(dismissedTime, 10) < 43200000) {
      return;
    }
    const banner = document.getElementById('pwaInstallBanner');
    const sub = banner ? banner.querySelector('.pwa-install-subtitle') : null;
    const btn = document.getElementById('btnPwaInstall');
    if (sub) {
      sub.textContent = "Partager ⎋ puis 'Sur l'écran d'accueil'";
    }
    if (btn) {
      btn.style.display = 'none';
    }
    if (banner) {
      banner.style.display = 'flex';
    }
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
      loadLeaderboard(),
      loadHistory(),
    ]);
  } catch (err) {
    showToast('Erreur lors du chargement des données', 'error');
  }
}

async function loadPlayers() {
  const data = await apiCall('/api/players');
  state.players = data;
  renderPlayers();
  if (state.currentView === 'addMatch' && state.wizardStep === 2) {
    renderWizardPlayers();
  }
}

async function loadGames() {
  const data = await apiCall('/api/games');
  state.games = data;
  renderGames();
  renderLeaderboardGameCarousel();
  if (state.currentView === 'addMatch' && state.wizardStep === 1) {
    renderWizardGames();
  }
}

async function loadLeaderboard() {
  let endpoint = '/api/leaderboard';
  if (state.selectedLbGameId) {
    endpoint = `/api/leaderboard/game/${state.selectedLbGameId}`;
  }
  const data = await apiCall(endpoint);
  state.leaderboard = data;
  renderLeaderboard();
}

async function loadHistory() {
  const data = await apiCall('/api/history?limit=100');
  state.history = data;
  renderHistory();
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

  // Trigger setup or refreshes
  if (viewName === 'leaderboard') {
    loadLeaderboard();
  } else if (viewName === 'history') {
    loadHistory();
  } else if (viewName === 'games') {
    loadGames();
  } else if (viewName === 'players') {
    loadPlayers();
  } else if (viewName === 'addMatch') {
    resetAndOpenWizard();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// LEADERBOARD RENDERING & CAROUSEL FILTER
// ==========================================
function renderLeaderboardGameCarousel() {
  const carousel = document.getElementById('lbGameCarousel');
  if (!carousel) return;

  const isGlobalActive = !state.selectedLbGameId;
  let html = `
    <button class="game-filter-chip ${isGlobalActive ? 'active' : ''}" onclick="selectLeaderboardGame(null)">
      <span>Tous les jeux</span>
    </button>
  `;

  // Sort games by matches_played descending
  const sortedGames = [...state.games].sort((a, b) => {
    const countA = a.matches_played || 0;
    const countB = b.matches_played || 0;
    if (countB !== countA) return countB - countA;
    return a.name.localeCompare(b.name);
  });

  // Display top 6 most played games
  const top6 = sortedGames.slice(0, 6);

  // If a game is currently selected but not in top 6, include it so the filter remains visible
  let visibleGames = [...top6];
  if (state.selectedLbGameId && !visibleGames.some(g => g.id === state.selectedLbGameId)) {
    const selectedGame = state.games.find(g => g.id === state.selectedLbGameId);
    if (selectedGame) {
      visibleGames.push(selectedGame);
    }
  }

  visibleGames.forEach(game => {
    const isSelected = state.selectedLbGameId === game.id;
    html += `
      <button class="game-filter-chip ${isSelected ? 'active' : ''}" onclick="selectLeaderboardGame('${game.id}')">
        <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" onerror="this.src='/static/icons/default-game.svg'">
        <span>${escapeHtml(game.name)}</span>
      </button>
    `;
  });

  // Button "..." navigating to the games tab where all games are listed
  html += `
    <button class="game-filter-chip btn-more-games" onclick="switchView('games')" title="Voir tous les jeux" aria-label="Voir tous les jeux">
      <span style="font-weight: 700; font-size: 1.1rem; letter-spacing: 1px; line-height: 1;">...</span>
    </button>
  `;

  carousel.innerHTML = html;
}

function selectLeaderboardGame(gameId) {
  state.selectedLbGameId = gameId;
  renderLeaderboardGameCarousel();
  loadLeaderboard();
}

function setLeaderboardSort(mode) {
  if (state.leaderboardSort === mode) return;
  state.leaderboardSort = mode;

  const btnRatio = document.getElementById('btnSortRatio');
  const btnWins = document.getElementById('btnSortWins');
  if (btnRatio && btnWins) {
    if (mode === 'ratio') {
      btnRatio.classList.add('active');
      btnWins.classList.remove('active');
    } else {
      btnRatio.classList.remove('active');
      btnWins.classList.add('active');
    }
  }

  const subtitle = document.getElementById('lbSubtitle');
  if (subtitle) {
    subtitle.textContent = mode === 'ratio' ? 'Basé sur le ratio' : 'Basé sur les wins';
  }

  renderLeaderboard();
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
    listEl.innerHTML = '';
    return;
  }

  // Sort based on state.leaderboardSort ('ratio' or 'wins')
  const sortByWins = state.leaderboardSort === 'wins';
  entries.sort((a, b) => {
    if (sortByWins) {
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      if (b.win_ratio !== a.win_ratio) return b.win_ratio - a.win_ratio;
      return b.matches_played - a.matches_played;
    } else {
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
    if (sortByWins) {
      return `
        <div class="podium-ratio">${p.matches_won} ${winsLabel}</div>
        <div class="podium-sub">${(p.win_ratio * 100).toFixed(0)}% • ${p.matches_played} ${gamesLabel}</div>
      `;
    } else {
      return `
        <div class="podium-ratio">${(p.win_ratio * 100).toFixed(0)}%</div>
        <div class="podium-sub">${p.matches_won} ${winsLabel} • ${p.matches_played} ${gamesLabel}</div>
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
      const col2 = getPlayerColor(p2.player_name);
      const init2 = p2.player_name.charAt(0).toUpperCase();
      podiumHtml += `
        <div class="podium-step rank-2">
          <div class="podium-avatar-wrap">
            <div class="podium-avatar" style="background-color: ${col2.bg}; color: ${col2.text};">
              ${escapeHtml(init2)}
            </div>
          </div>
          <div class="podium-name">${escapeHtml(p2.player_name)}</div>
          ${formatPodiumMetric(p2)}
          <div class="podium-block">2</div>
        </div>
      `;
    } else {
      podiumHtml += `<div class="podium-step rank-2" style="visibility:hidden;"><div class="podium-block"></div></div>`;
    }

    // Rank 1 (Center)
    const p1 = top3[0];
    const col1 = getPlayerColor(p1.player_name);
    const init1 = p1.player_name.charAt(0).toUpperCase();
    podiumHtml += `
      <div class="podium-step rank-1">
        <div class="podium-avatar-wrap">
          <svg class="podium-crown-icon" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/>
          </svg>
          <div class="podium-avatar" style="background-color: ${col1.bg}; color: ${col1.text};">
            ${escapeHtml(init1)}
          </div>
        </div>
        <div class="podium-name">${escapeHtml(p1.player_name)}</div>
        ${formatPodiumMetric(p1)}
        <div class="podium-block">1</div>
      </div>
    `;

    // Rank 3 (Right)
    if (top3[2]) {
      const p3 = top3[2];
      const col3 = getPlayerColor(p3.player_name);
      const init3 = p3.player_name.charAt(0).toUpperCase();
      podiumHtml += `
        <div class="podium-step rank-3">
          <div class="podium-avatar-wrap">
            <div class="podium-avatar" style="background-color: ${col3.bg}; color: ${col3.text};">
              ${escapeHtml(init3)}
            </div>
          </div>
          <div class="podium-name">${escapeHtml(p3.player_name)}</div>
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
  let listHtml = '';
  entries.forEach((entry, index) => {
    const color = getPlayerColor(entry.player_name);
    const initial = entry.player_name.charAt(0).toUpperCase();

    let rankBadgeHtml = '';
    if (index === 0) {
      rankBadgeHtml = `<span class="lb-medal medal-gold">1</span>`;
    } else if (index === 1) {
      rankBadgeHtml = `<span class="lb-medal medal-silver">2</span>`;
    } else if (index === 2) {
      rankBadgeHtml = `<span class="lb-medal medal-bronze">3</span>`;
    } else {
      rankBadgeHtml = `<div class="lb-rank">#${entry.rank}</div>`;
    }

    const winsLabel = entry.matches_won > 1 ? 'wins' : 'win';
    const gamesLabel = entry.matches_played > 1 ? 'games' : 'game';

    let cardRightHtml = '';
    if (sortByWins) {
      cardRightHtml = `
        <div class="lb-ratio">${entry.matches_won}</div>
        <div class="lb-ratio-label">${winsLabel}</div>
      `;
    } else {
      cardRightHtml = `
        <div class="lb-ratio">${(entry.win_ratio * 100).toFixed(0)}%</div>
        <div class="lb-ratio-label">Ratio</div>
      `;
    }

    listHtml += `
      <div class="lb-card">
        <div class="lb-card-left">
          ${rankBadgeHtml}
          <div class="lb-player-avatar" style="background-color: ${color.bg}; color: ${color.text};">
            ${escapeHtml(initial)}
          </div>
          <div>
            <div class="lb-player-name">${escapeHtml(entry.player_name)}</div>
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
function resetAndOpenWizard() {
  state.wizardStep = 1;
  state.wizardGameId = null;
  state.selectedMatchPlayerIds.clear();
  state.matchScores = {};
  setupInitialDateTime();
  goToWizardStep(1);
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
function renderWizardGames() {
  const container = document.getElementById('wizardGameGrid');
  if (!container) return;

  let html = '';

  state.games.forEach(game => {
    const isSelected = state.wizardGameId === game.id;
    html += `
      <div class="wizard-game-card ${isSelected ? 'selected' : ''}" onclick="selectWizardGame('${game.id}')">
        <div class="wizard-game-img-wrap">
          <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" class="wizard-game-img" onerror="this.src='/static/icons/default-game.svg'">
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
    <div class="wizard-game-card add-new" onclick="toggleWizardAddGame(true)">
      <div class="add-new-icon">+</div>
      <div style="font-weight:700; font-size:0.92rem; color:var(--accent);">Nouveau jeu</div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Ajouter à la bibliothèque</div>
    </div>
  `;

  container.innerHTML = html;
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
      const initial = p.name.charAt(0).toUpperCase();
      const color = getPlayerColor(p.name);

      html += `
        <div class="wizard-player-card ${isSelected ? 'selected' : ''}" onclick="toggleWizardPlayer('${p.id}')">
          <div class="wizard-player-left">
            <div class="wizard-player-avatar" style="background-color: ${color.bg}; color: ${color.text};">${escapeHtml(initial)}</div>
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
    const initial = player.name.charAt(0).toUpperCase();
    const color = getPlayerColor(player.name);

    html += `
      <div class="wizard-score-card ${isWinner ? 'is-winner' : ''}">
        <div class="wizard-score-player">
          <div class="wizard-player-avatar" style="background-color: ${color.bg}; color: ${color.text};">${escapeHtml(initial)}</div>
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
    const color = getPlayerColor(pName);

    scoresHtml += `
      <div class="recap-score-row">
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="lb-player-avatar" style="width:24px; height:24px; font-size:0.72rem; background-color: ${color.bg}; color: ${color.text};">
            ${escapeHtml(pName.charAt(0).toUpperCase())}
          </span>
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
    filtered = filtered.filter(a => a.action_type === state.historyFilterType);
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
    if (action.action_type === 'RECORD_MATCH' && action.details.participants) {
      const parts = action.details.participants
        .map(p => {
          const col = getPlayerColor(p.player_name);
          return `<strong style="color:${col.bg};">${escapeHtml(p.player_name)}</strong> <span class="recap-outcome-badge ${p.is_winner ? 'won' : 'lost'}">${p.is_winner ? 'Gagné' : 'Perdu'}</span>`;
        })
        .join(' &nbsp;•&nbsp; ');
      detailsHtml = `<div class="history-details-compact">${parts}</div>`;
    } else if (action.action_type === 'UNDO_ACTION') {
      detailsHtml = `<div class="history-details-compact" style="font-style: italic;">Cible : ${escapeHtml(action.details.target_summary || 'Action')}</div>`;
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
        <div class="game-card-img-wrap">
          <img src="${escapeHtml(game.image_url)}" alt="${escapeHtml(game.name)}" class="game-card-img" onerror="this.src='/static/icons/default-game.svg'">
        </div>
        <div class="game-card-body">
          <div class="game-card-title">${escapeHtml(game.name)}</div>
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
  state.selectedLbGameId = gameId;
  renderLeaderboardGameCarousel();
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
function renderPlayers() {
  const listEl = document.getElementById('playersList');
  if (!listEl) return;

  if (state.players.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  let html = '';
  state.players.forEach(p => {
    const initial = p.name.charAt(0).toUpperCase();
    const color = getPlayerColor(p.name);
    html += `
      <div class="player-card">
        <div class="player-card-left">
          <div class="player-avatar" style="background-color: ${color.bg}; color: ${color.text};">${escapeHtml(initial)}</div>
          <div>
            <div style="font-weight: 700; font-size: 1.05rem;">${escapeHtml(p.name)}</div>
            <div style="font-size: 0.8rem; color: var(--text-dim);">Profil actif</div>
          </div>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
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

function toggleWizardAddGame(show) {
  const panel = document.getElementById('wizardAddGamePanel');
  if (!panel) return;
  const isOpening = (show !== undefined) ? show : panel.style.display === 'none';
  panel.style.display = isOpening ? 'block' : 'none';
  if (isOpening) {
    document.getElementById('formWizardGame')?.reset();
    const previewWrap = document.getElementById('gamePreviewWrap_wizard');
    if (previewWrap) previewWrap.style.display = 'none';
    document.getElementById('inlineGameName_wizard')?.focus();
  }
}

function switchImgInputMode(mode, context) {
  state.newGameImgMode = mode;
  document.getElementById(`tabImgUpload_${context}`)?.classList.toggle('active', mode === 'upload');
  document.getElementById(`tabImgUrl_${context}`)?.classList.toggle('active', mode === 'url');
  const uploadContainer = document.getElementById(`imgUploadContainer_${context}`);
  const urlContainer = document.getElementById(`imgUrlContainer_${context}`);
  if (uploadContainer) uploadContainer.style.display = (mode === 'upload') ? 'block' : 'none';
  if (urlContainer) urlContainer.style.display = (mode === 'url') ? 'block' : 'none';
}

function previewGameUpload(input, context) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    state.pendingGameUploadFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.getElementById(`gamePreviewImg_${context}`);
      const wrap = document.getElementById(`gamePreviewWrap_${context}`);
      if (img && wrap) {
        img.src = e.target.result;
        wrap.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
}

function previewGameUrl(url, context) {
  const img = document.getElementById(`gamePreviewImg_${context}`);
  const wrap = document.getElementById(`gamePreviewWrap_${context}`);
  if (!url) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (img && wrap) {
    img.src = url;
    wrap.style.display = 'block';
  }
}

// Autocomplete for Players
function onPlayerInputTyping(val, context) {
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
function onGameInputTyping(val, context) {
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
          <img src="${escapeHtml(g.image_url)}" style="width:20px; height:20px; border-radius:3px; object-fit:cover;" onerror="this.src='/static/icons/default-game.svg'">
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
    if (state.newGameImgMode === 'upload' && state.pendingGameUploadFile) {
      const formData = new FormData();
      formData.append('file', state.pendingGameUploadFile);
      const uploadRes = await fetch('/api/games/upload-image', {
        method: 'POST',
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('Échec du téléversement de l\'image');
      const uploadData = await uploadRes.json();
      imageUrl = uploadData.url;
    } else if (state.newGameImgMode === 'url') {
      imageUrl = document.getElementById(`inlineGameImageUrl_${context}`)?.value.trim() || null;
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

function showToast(message, type = 'info') {
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
  }, 3200);
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
