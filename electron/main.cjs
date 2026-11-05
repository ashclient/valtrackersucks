'use strict';

const { app, BrowserWindow, ipcMain, dialog, globalShortcut, nativeTheme, shell, Tray, Menu, nativeImage, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { analyzeMatch, summary } = require('../src/analytics.cjs');
const { importFiles, scanFolder, exportCSV, mergeMatches } = require('./local-data.cjs');
const { getCatalog } = require('./catalog.cjs');

const REGIONS = new Set(['na', 'eu', 'ap', 'kr', 'br', 'latam']);
const AGENTS = new Set(['Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon', 'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo', 'Viper', 'Vyse', 'Waylay', 'Yoru']);
const DEFAULTS = Object.freeze({
  riotId: '', puuid: '', region: 'na', favorites: ['Jett', 'Omen', 'Sage'],
  syncFolder: '', launchAtLogin: false, minimizeToTray: true, overlayOpacity: 0.98
});
let mainWindow = null;
let overlayWindow = null;
let preferences = { ...DEFAULTS };
let matches = [];
let overlayInteractive = false;
let isQuitting = false;
let linkedSession = null;
let tray = null;
let syncInterval = null;
const catalogCache = new Map();
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
    favorites: [...new Set(favorites.filter(x => AGENTS.has(x)))].slice(0, 3),
    syncFolder: typeof value.syncFolder === 'string' ? value.syncFolder.slice(0, 1200) : '',
    launchAtLogin: value.launchAtLogin === true,
    minimizeToTray: value.minimizeToTray !== false,
    overlayOpacity: Math.max(0.65, Math.min(1, Number(value.overlayOpacity) || 0.98))
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
    apiConfigured: !!process.env.RIOT_API_KEY,
    rsoConfigured: Boolean(process.env.VTS_API_BASE_URL),
    linkedAccount: linkedSession && linkedSession.account ? linkedSession.account : null,
    version: app.getVersion()
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
  mainWindow.on('close', e => {
    if (!isQuitting && preferences.minimizeToTray && tray) {
      e.preventDefault(); mainWindow.hide();
    }
  });
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
  overlayWindow.setOpacity(preferences.overlayOpacity);
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
  const outcome = importFiles(result.filePaths, preferences.puuid, matches);
  matches = safeMatches(outcome.matches);
  writeJSON('matches.json', matches);
  notifyChanged();
  return { ok: outcome.imported > 0, count: outcome.imported, errors: outcome.errors };
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

const trayIconData = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABfElEQVR42u2b2w3CMAxFG4sRYCFYA6aDNWAh2AG+KkFp09SxE7/yTdLe6+NHJTIMzlfCbnwez29JQg6PW2pigDThtUYkK8KxRiRrwrcaAZbFl2gAy+JLtIB18WuawIP4nDbwPgiBl+gvaQwCPEV/TmsQ4C36Uwp2NYfs71f03tfpQiZm6T1KnlGVApQiRLTBlquGHqrokxignYKuXaCWgtrokxmgmYKYA6gOwlKATQMK/IMAagN61wLM80UQsDUNqGYIFgO0dQQxNaA0qlTFj9UATRREF5BUkdfSgBr/IIDbAEoKOKLfhADpBTFSQOKIOsWdC/8goKUB1LWA6jyxBIzYU374dDdAYkcQXQM4i183A6RRoK4LUBsIFkTEHKDRAAwFHOQEAZYKmmkCuMwCq8I2GYC9bKDZpFEzWMa7ZP1E3su/xb6Jjza45IyH6AcBcwZYpmBOG5T+0KL4bApYMiGnBbAbLYj/mwNyy+3FSW1GsF2dlW6EhxmGZX0AOv6qL3BOCIwAAAAASUVORK5CYII=';
function createTray() {
  const icon = nativeImage.createFromDataURL('data:image/png;base64,' + trayIconData);
  tray = new Tray(icon.resize({width: 20, height: 20}));
  tray.setToolTip('VTS • VALORANT companion');
  const showDashboard = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: 'Open VTS', click: showDashboard},
    {label: 'Show / hide overlay', click: toggleOverlay},
    {label: 'Toggle overlay interaction', click: toggleInteractive},
    {type: 'separator'},
    {label: 'Quit VTS', click: () => app.quit()}
  ]));
  tray.on('double-click', showDashboard);
}
function syncLocalFolder(silent = false) {
  if (!preferences.syncFolder || !preferences.puuid) return {ok: false, reason: 'Set your own PUUID and export folder first.'};
  try {
    const res = scanFolder(preferences.syncFolder, preferences.puuid, matches);
    if (res.imported || res.matches.length !== matches.length) {
      matches = safeMatches(res.matches);
      writeJSON('matches.json', matches);
      notifyChanged();
    }
    return {ok: true, count: res.imported, examined: res.examined, errors: res.errors};
  } catch (error) {
    return {ok: false, reason: error.message};
  }
}
async function chooseSyncFolder() {
  const selected = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose your own exported match JSON folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (selected.canceled || !selected.filePaths.length) return {ok:false, canceled:true};
  preferences = sanitizeSettings({...preferences, syncFolder: selected.filePaths[0]});
  writeJSON('settings.json', preferences);
  notifyChanged();
  return {ok:true, folder:preferences.syncFolder};
}
async function exportLocalCSV() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export your private VALORANT career summary',
    defaultPath: 'VTS-match-history.csv',
    filters: [{name: 'CSV file', extensions: ['csv']}]
  });
  if (result.canceled || !result.filePath) return {ok:false, canceled:true};
  fs.writeFileSync(result.filePath, exportCSV(matches), {encoding:'utf8',flag:'w',mode:0o600});
  return {ok:true, path:result.filePath, count:matches.length};
}
async function getCachedCatalog(kind) {
  if (!['agents','maps','weapons'].includes(kind)) return {ok:false, error:'Unknown catalog'};
  const entry = catalogCache.get(kind);
  if (entry && entry.expires > Date.now()) return {ok:true, data:entry.data, cached:true};
  try {
    const data = await getCatalog(kind);
    catalogCache.set(kind, {data, expires:Date.now() + 6 * 60 * 60 * 1000});
    return {ok:true,data,cached:false};
  } catch(error) {
    if (entry) return {ok:true,data:entry.data,cached:true,stale:true};
    return {ok:false,error:error.message};
  }
}
function rsoBase() {
  const target = process.env.VTS_API_BASE_URL || '';
  if (!target) throw new Error('Riot linking needs a Riot-approved client and a deployed HTTPS VTS API backend.');
  const url = new URL(target);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.pathname !== '/')
    throw new Error('VTS_API_BASE_URL must be an HTTPS origin, e.g. https://api.example.com/');
  return url.origin;
}
function sessionFile() { return storePath('riot-session.enc'); }
function loadRiotSession() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const raw = fs.readFileSync(sessionFile());
    const decoded = JSON.parse(safeStorage.decryptString(raw));
    if (!/^[A-Za-z0-9_-]{30,120}$/.test(decoded.token)) return null;
    return decoded;
  } catch (_) { return null; }
}
function saveRiotSession(value) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(sessionFile(), safeStorage.encryptString(JSON.stringify(value)), {mode: 0o600});
  return true;
}
function wipeRiotSession() {
  try { fs.unlinkSync(sessionFile()); } catch (_) {}
}
async function backendJSON(pathname, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(rsoBase() + pathname, {
      method: options.method || 'POST',
      headers: {'Content-Type':'application/json','Accept':'application/json',
        ...(options.token ? {'Authorization':'Bearer '+options.token} : {})},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal:controller.signal
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'VTS account service returned ' + response.status);
    return value;
  } finally {clearTimeout(timeout);}
}
async function connectRiot() {
  try {
    const start = await backendJSON('/api/device/start');
    const login = new URL(start.loginUrl);
    if (login.origin !== rsoBase() || login.protocol !== 'https:')
      throw new Error('The account service returned an unsafe authorization URL');
    await shell.openExternal(login.href);
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const state = await backendJSON('/api/device/poll', {body:{pollSecret:start.pollSecret}});
      if (state.status === 'linked') {
        if (!state.account || !state.account.puuid || !state.sessionToken) throw new Error('Invalid account authorization response');
        const previousPuuid = preferences.puuid;
        linkedSession = {token:state.sessionToken,account:state.account};
        const persistent = saveRiotSession(linkedSession);
        preferences = sanitizeSettings({...preferences,
          riotId: (state.account.gameName || '') + '#' + (state.account.tagLine || ''),
          puuid:state.account.puuid});
        writeJSON('settings.json',preferences);
        if (previousPuuid && previousPuuid !== preferences.puuid) {
          matches=[];writeJSON('matches.json',[]);
        }
        notifyChanged();
        return {ok:true,account:state.account,persistent};
      }
    }
    return {ok:false,error:'Riot connection timed out. Try again.'};
  } catch(error) {return {ok:false,error:error.message};}
}
async function syncRiotMatches() {
  if (!linkedSession) return {ok:false,error:'Connect your Riot account first.'};
  try {
    const result = await backendJSON('/api/matches/sync',{
      token:linkedSession.token, body:{region:preferences.region}});
    const oldIds = new Set(matches.map(x => x.id));
    const incoming=safeMatches(result.matches || []);
    matches=safeMatches(mergeMatches(matches,incoming));
    writeJSON('matches.json',matches);
    notifyChanged();
    return {ok:true,count:incoming.filter(x => !oldIds.has(x.id)).length, examined:incoming.length};
  } catch(error) {return {ok:false,error:error.message};}
}
async function disconnectRiot() {
  if (linkedSession) {
    try {await backendJSON('/api/disconnect',{token:linkedSession.token});} catch (_) {}
  }
  linkedSession=null;
  wipeRiotSession();
  notifyChanged();
  return {ok:true};
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
    if (process.platform === 'win32') app.setLoginItemSettings({openAtLogin: preferences.launchAtLogin});
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.setOpacity(preferences.overlayOpacity);
    notifyChanged();
    return appState();
  });
  ipcMain.handle('app:import', importMatches);
  ipcMain.handle('app:choose-folder', chooseSyncFolder);
  ipcMain.handle('app:sync-folder', () => syncLocalFolder());
  ipcMain.handle('app:export-csv', exportLocalCSV);
  ipcMain.handle('app:catalog', (_event, kind) => getCachedCatalog(kind));
  ipcMain.handle('app:rso', connectRiot);
  ipcMain.handle('app:rso-sync', syncRiotMatches);
  ipcMain.handle('app:rso-disconnect', disconnectRiot);
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
  linkedSession = loadRiotSession();
  matches = safeMatches(readJSON('matches.json', [])).sort((a, b) => b.timestamp - a.timestamp);
  registerIPC();
  createMain();
  createOverlay();
  createTray();
  syncInterval = setInterval(() => { try { syncLocalFolder(true); } catch (_) {} }, 60000);
  syncInterval.unref();
  if (preferences.syncFolder) { try { syncLocalFolder(true); } catch (_) {} }
  globalShortcut.register('CommandOrControl+Shift+V', toggleOverlay);
  globalShortcut.register('CommandOrControl+Shift+I', toggleInteractive);
});
app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => {
  if (syncInterval) clearInterval(syncInterval);
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => app.quit());
