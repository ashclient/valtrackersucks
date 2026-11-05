'use strict';

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeTheme, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeMatch, summary } = require('../src/analytics.cjs');

const REGIONS = new Set(['na', 'eu', 'ap', 'kr', 'br', 'latam']);
const AGENTS = new Set(['Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo', 'Viper', 'Vyse', 'Waylay', 'Yoru']);
const DEFAULTS = Object.freeze({
  riotId: '', puuid: '', region: 'na', favorites: ['Jett', 'Omen', 'Sage']
});
let mainWindow = null;
let overlayWindow = null;
let preferences = { ...DEFAULTS };
let matches = [];
let overlayInteractive = false;
let isQuitting = false;
const responseCache = new Map();

function storePath(name) {
  return path.join(app.getPath('userData'), name);
}
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(storePath(name), 'utf8')); }
  catch (_) { return fallback; }
}
function writeJSON(name, value) {
  const filename = storePath(name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, filename);
}
function sanitizeSettings(input) {
  const value = input && typeof input === 'object' ? input : {};
  const id = String(value.riotId || '').slice(0, 70).trim();
  const puuid = String(value.puuid || '').slice(0, 128).trim();
  const region = String(value.region || 'na').toLowerCase();
  const favorites = Array.isArray(value.favorites) ? value.favorites : DEFAULTS.favorites;
  return {
    riotId: id,
    puuid: puuid,
    region: REGIONS.has(region) ? region : 'na',
    favorites: [...new Set(favorites.filter(x => AGENTS.has(x)))].slice(0, 3)
  };
}
function safeMatches(input) {
  if (!Array.isArray(input)) return [];
  return input.filter(x => x && typeof x === 'object' && typeof x.id === 'string')
    .slice(0, 500).map(x => ({
      id: String(x.id).slice(0, 128), timestamp: Number(x.timestamp) || Date.now(),
      map: String(x.map || 'Unknown').slice(0, 50),
      agentId: String(x.agentId || '').slice(0, 70),
      queue: String(x.queue || 'Unknown').slice(0, 32),
      result: ['WIN', 'LOSS', 'UNKNOWN'].includes(x.result) ? x.result : 'UNKNOWN',
      kills: Number(x.kills) || 0, deaths: Number(x.deaths) || 0, assists: Number(x.assists) || 0,
      kd: Number(x.kd) || 0, acs: Number(x.acs) || 0, adr: x.adr == null ? null : Number(x.adr),
      hs: x.hs == null ? null : Number(x.hs), rounds: Number(x.rounds) || 0
    }));
}
function appState() {
  return {
    settings: preferences,
    matches: matches.slice(0, 40),
    metrics: summary(matches),
    matchCount: matches.length,
    overlay: { visible: !!(overlayWindow && overlayWindow.isVisible()), interactive: overlayInteractive },
    apiConfigured: !!process.env.RIOT_API_KEY
  };
}
function broadcast(channel, payload) {
  [mainWindow, overlayWindow].forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  });
}
function notifyChanged() {
  broadcast('state:changed', appState());
}
function secureWindow(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}
function openLocal(win, overlay) {
  win.loadFile(path.join(__dirname, '../src/index.html'), {
    query: { mode: overlay ? 'overlay' : 'desktop' }
  });
}
function createMain() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 770, minWidth: 940, minHeight: 630,
    frame: false, show: false, backgroundColor: '#0d1018',
    title: 'VTS — VALORANT companion', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, backgroundThrottling: true
    }
  });
  secureWindow(mainWindow);
  openLocal(mainWindow, false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}
function createOverlay() {
  overlayWindow = new BrowserWindow({
    width: 360, height: 426, x: 48, y: 48,
    frame: false, show: false, transparent: true, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, hasShadow: false, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true, contextIsolation: true, nodeIntegration: false,
      webSecurity: true, backgroundThrottling: true
    }
  });
  overlayWindow.setAlwaysOnTop(true, 'floating');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  secureWindow(overlayWindow);
  openLocal(overlayWindow, true);
  overlayWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault();
      overlayWindow.hide();
      broadcast('overlay:changed', appState().overlay);
      notifyChanged();
    }
  });
}
function toggleOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return appState().overlay;
  if (overlayWindow.isVisible()) overlayWindow.hide();
  else overlayWindow.showInactive();
  const state = appState().overlay;
  broadcast('overlay:changed', state);
  notifyChanged();
  return state;
}
function toggleInteractive() {
  overlayInteractive = !overlayInteractive;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(!overlayInteractive, { forward: true });
    if (overlayInteractive && !overlayWindow.isVisible()) overlayWindow.showInactive();
  }
  const state = appState().overlay;
  broadcast('overlay:changed', state);
  notifyChanged();
  return state;
}
async function importMatches() {
  if (!preferences.puuid) return { ok: false, error: 'Set your own PUUID in Settings before importing.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import your own official VALORANT match JSON files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };
  let imported = 0;
  const errors = [];
  for (const file of result.filePaths.slice(0, 30)) {
    try {
      if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('file too large (8 MB maximum)');
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = Array.isArray(data) ? data : (Array.isArray(data.matches) ? data.matches : [data]);
      for (const raw of entries.slice(0, 100)) {
        const item = analyzeMatch(raw, preferences.puuid);
        const index = matches.findIndex(x => x.id === item.id);
        if (index === -1) imported++;
        if (index !== -1) matches.splice(index, 1);
        matches.push(item);
      }
    } catch (error) { errors.push(path.basename(file) + ': ' + error.message); }
  }
  matches = safeMatches(matches).sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
  writeJSON('matches.json', matches);
  notifyChanged();
  return { ok: imported > 0, count: imported, errors };
}
async function getJSON(url) {
  const cache = responseCache.get(url);
  if (cache && cache.expiry > Date.now()) return cache.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { 'X-Riot-Token': process.env.RIOT_API_KEY, 'Accept': 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      if (response.status === 429) throw new Error('Rate limited by Riot. Try again shortly.');
      if (response.status === 403) throw new Error('Riot rejected this API key or permission.');
      throw new Error('Riot API returned HTTP ' + response.status);
    }
    const value = await response.json();
    responseCache.set(url, { value, expiry: Date.now() + 5 * 60 * 1000 });
    return value;
  } finally { clearTimeout(timeout); }
}
async function getLeaderboard() {
  if (!process.env.RIOT_API_KEY) {
    return { ok: false, error: 'Official leaderboard requires a Riot-approved API key. Set RIOT_API_KEY before launching VTS.' };
  }
  try {
    const host = 'https://' + preferences.region + '.api.riotgames.com';
    const content = await getJSON(host + '/val/content/v1/contents?locale=en-US');
    const acts = Array.isArray(content.acts) ? content.acts : [];
    const current = acts.find(x => x.type === 'act' && x.isActive);
    if (!current) throw new Error('Riot did not return an active competitive act.');
    const board = await getJSON(host + '/val/ranked/v1/leaderboards/by-act/' + encodeURIComponent(current.id) + '?size=25&startIndex=0');
    const rows = (Array.isArray(board.players) ? board.players : []).slice(0, 25).map(x => ({
      rank: Number(x.leaderboardRank) || null,
      name: x.gameName && x.tagLine ? String(x.gameName).slice(0, 48) + '#' + String(x.tagLine).slice(0, 12) : 'Anonymous',
      rating: Number(x.rankedRating) || 0,
      wins: Number(x.numberOfWins) || 0
    }));
    return { ok: true, rows, act: String(current.name || ''), region: preferences.region };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}
function registerIPC() {
  ipcMain.handle('app:state', () => appState());
  ipcMain.handle('app:settings', (_event, settings) => {
    const oldPuuid = preferences.puuid;
    preferences = sanitizeSettings(settings);
    if (oldPuuid && preferences.puuid !== oldPuuid) {
      // Imported summaries belong to the previous account.
      matches = [];
      writeJSON('matches.json', []);
    }
    writeJSON('settings.json', preferences);
    notifyChanged();
    return appState();
  });
  ipcMain.handle('app:import', importMatches);
  ipcMain.handle('app:clear-matches', () => {
    matches = []; writeJSON('matches.json', []); notifyChanged(); return appState();
  });
  ipcMain.handle('app:leaderboard', getLeaderboard);
  ipcMain.handle('overlay:action', (_event, action) => {
    if (action === 'toggle') return toggleOverlay();
    if (action === 'interaction') return toggleInteractive();
    if (action === 'hide' && overlayWindow) {
      overlayWindow.hide(); notifyChanged(); return appState().overlay;
    }
    return appState().overlay;
  });
  ipcMain.handle('window:action', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (action === 'minimize') win.minimize();
    if (action === 'maximize' && win === mainWindow) win.isMaximized() ? win.unmaximize() : win.maximize();
    if (action === 'close') {
      if (win === mainWindow) app.quit();
      else win.hide();
    }
    return true;
  });
}
app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  preferences = sanitizeSettings(readJSON('settings.json', DEFAULTS));
  matches = safeMatches(readJSON('matches.json', [])).sort((a, b) => b.timestamp - a.timestamp);
  registerIPC();
  createMain();
  createOverlay();
  globalShortcut.register('CommandOrControl+Shift+V', toggleOverlay);
  globalShortcut.register('CommandOrControl+Shift+I', toggleInteractive);
});
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
