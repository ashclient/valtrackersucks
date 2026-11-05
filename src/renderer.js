'use strict';

const AGENTS = [
  'Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher', 'Deadlock',
  'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett', 'KAY/O', 'Killjoy', 'Neon',
  'Omen', 'Phoenix', 'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo',
  'Viper', 'Vyse', 'Waylay', 'Yoru'
];
const titles = {
  overview: 'Overview', career: 'My career', matches: 'Match history',
  agents: 'Agent presets', leaderboard: 'Leaderboard', library: 'Collection library', settings: 'Settings'
};
const overlayMode = new URLSearchParams(location.search).get('mode') === 'overlay';
document.body.classList.toggle('is-overlay', overlayMode);
let current = null;
let activePage = 'overview';
let toastTimeout = null;
let agentCatalog = [];
let weaponCatalog = [];
let catalogRequested = false;

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined && text !== null) e.textContent = String(text);
  return e;
};
function empty(parent) { parent.replaceChildren(); }
function imageElement(src, label, styleName) {
  if (typeof src !== 'string' || !src.startsWith('https://media.valorant-api.com/')) return null;
  const img = node('img', styleName || 'catalog-image');
  img.src = src; img.alt = label || ''; img.loading = 'lazy'; img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', () => img.remove(), {once:true});
  return img;
}
function agentByName(name) {
  return agentCatalog.find(x => x.name.toLowerCase() === String(name).toLowerCase());
}
function text(id, value) { const e = $(id); if (e) e.textContent = String(value); }
function metric(value, suffix) {
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : String(value) + (suffix || '');
}
function shortDate(timestamp) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Unknown date';
}
function showToast(message, error) {
  if (overlayMode) return;
  const toast = $('toast');
  toast.textContent = String(message);
  toast.classList.remove('hidden');
  toast.classList.toggle('error', !!error);
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 4500);
}
function showPage(page) {
  if (overlayMode || !titles[page]) return;
  activePage = page;
  document.querySelectorAll('.view').forEach(e => e.classList.toggle('active', e.dataset.view === page));
  document.querySelectorAll('.nav-btn').forEach(e => e.classList.toggle('active', e.dataset.viewTarget === page));
  text('breadcrumb', titles[page]);
  document.querySelector('.content-scroll').scrollTop = 0;
}
function renderMatch(parent, match) {
  const row = node('div', 'match-row');
  const result = match.result === 'WIN' ? 'win' : match.result === 'LOSS' ? 'loss' : 'unknown';
  row.appendChild(node('div', 'result-stroke ' + result));
  row.appendChild(node('div', 'map-icon', (match.map || '?').charAt(0).toUpperCase()));
  const details = node('div', 'match-details');
  details.appendChild(node('strong', '', match.map || 'Unknown map'));
  details.appendChild(node('small', '', String(match.queue || 'Unknown').toUpperCase() + ' · ' + shortDate(match.timestamp)));
  row.appendChild(details);
  const score = node('div', 'match-score');
  score.appendChild(node('strong', result === 'win' ? 'win-text' : result === 'loss' ? 'loss-text' : '', match.result));
  score.appendChild(node('small', '', match.kills + ' / ' + match.deaths + ' / ' + match.assists + ' KDA'));
  row.appendChild(score);
  parent.appendChild(row);
}
function renderMatches() {
  const matches = current.matches;
  const recent = $('overview-matches');
  const all = $('all-matches');
  empty(recent); empty(all);
  if (!matches.length) {
    recent.appendChild(node('div', 'empty-inline', 'No matches imported yet. Add official match JSON to start tracking your performance.'));
    all.appendChild(node('div', 'empty-state', 'Your private match history will appear here after you import your own games.'));
  } else {
    matches.slice(0, 4).forEach(m => renderMatch(recent, m));
    matches.forEach(m => renderMatch(all, m));
  }
  text('match-counter', current.matchCount + ' imported ' + (current.matchCount === 1 ? 'match' : 'matches'));
}
function favoriteRow(name, position) {
  const row = node('div', 'favorite-row');
  row.appendChild(node('div', 'favorite-number', String(position).padStart(2, '0')));
  const bubble = node('div', 'favorite-bubble', (name || '?').slice(0, 1));
  const asset = agentByName(name);
  const portrait = asset && imageElement(asset.portrait || asset.icon, name, 'agent-avatar');
  if (portrait) {bubble.textContent = '';bubble.appendChild(portrait);}
  row.appendChild(bubble);
  const details = node('div');
  details.appendChild(node('div', 'favorite-name', name));
  details.appendChild(node('span', 'favorite-hint', position === 1 ? 'Primary pick' : position === 2 ? 'Backup pick' : 'Flex option'));
  row.appendChild(details);
  return row;
}
function renderFavorites() {
  const favorites = current.settings.favorites || [];
  const parent = $('overview-favorites');
  empty(parent);
  if (!favorites.length) parent.appendChild(node('div', 'empty-inline', 'Choose up to three agents from Agent presets.'));
  else favorites.forEach((agent, i) => parent.appendChild(favoriteRow(agent, i + 1)));
  const slots = $('agent-picks');
  empty(slots);
  for (let i = 0; i < 3; i++) {
    const agent = favorites[i];
    const card = node('div', 'priority-card' + (agent ? '' : ' empty'));
    card.appendChild(node('div', 'priority-number', 'PRIORITY ' + String(i + 1).padStart(2, '0')));
    card.appendChild(node('strong', '', agent || 'Empty slot'));
    card.appendChild(node('small', '', agent ? ['Your first choice', 'If your first is taken', 'Your alternate'][i] : 'Select an agent below'));
    slots.appendChild(card);
  }
  text('agent-count', favorites.length + ' / 3 SELECTED');
  const grid = $('agent-grid');
  empty(grid);
  const agentNames = agentCatalog.length ? agentCatalog.map(x => x.name).sort((a,b)=>a.localeCompare(b)) : AGENTS;
  agentNames.forEach(agent => {
    const selected = favorites.includes(agent);
    const tile = node('button', 'agent-tile' + (selected ? ' selected' : ''));
    tile.type = 'button';
    tile.setAttribute('aria-pressed', String(selected));
    const asset = agentByName(agent);
    const icon = asset && imageElement(asset.portrait || asset.icon, agent, 'agent-tile-portrait');
    if (icon) tile.appendChild(icon);
    else tile.appendChild(node('span', 'agent-initial', agent.slice(0, 1)));
    if (asset) tile.title = asset.role + ' · ' + asset.description;
    if (selected) tile.appendChild(node('span', 'agent-check', '✓ PICK ' + (favorites.indexOf(agent) + 1)));
    const name = node('span', 'agent-name', agent);
    tile.appendChild(name);
    if (asset) tile.appendChild(node('small', 'agent-role', asset.role));
    tile.addEventListener('click', () => toggleAgent(agent));
    grid.appendChild(tile);
  });
  const overlay = $('overlay-picks');
  empty(overlay);
  for (let i = 0; i < 3; i++) {
    const name = favorites[i];
    const row = node('div', 'overlay-pick');
    row.appendChild(node('span', 'overlay-pick-num', String(i + 1).padStart(2, '0')));
    const circle = node('span', 'overlay-pick-avatar', name ? name.charAt(0) : '—');
    const asset = agentByName(name);
    const portrait = asset && imageElement(asset.portrait || asset.icon, name, 'overlay-avatar-image');
    if (portrait) {circle.textContent='';circle.appendChild(portrait);}
    row.appendChild(circle);
    const content = node('div');
    content.appendChild(node('div', 'overlay-pick-name', name || 'No agent selected'));
    content.appendChild(node('small', '', ['PRIMARY', 'BACKUP', 'FLEX'][i]));
    row.appendChild(content);
    overlay.appendChild(row);
  }
}
async function toggleAgent(agent) {
  const favorites = [...current.settings.favorites];
  const index = favorites.indexOf(agent);
  if (index !== -1) favorites.splice(index, 1);
  else if (favorites.length < 3) favorites.push(agent);
  else { showToast('You can have three favorite agents. Remove one first.', true); return; }
  try {
    current = await window.vts.saveSettings({ ...current.settings, favorites });
    renderAll();
  } catch (error) { showToast(error.message, true); }
}
function renderMetrics() {
  const m = current.metrics;
  text('metric-win', metric(m.winRate, '%'));
  text('metric-kd', metric(m.kd));
  text('metric-hs', metric(m.hs, '%'));
  text('metric-acs', metric(m.acs));
  text('career-played', m.played);
  text('career-wins', m.wins);
  text('career-adr', metric(m.adr));
  text('career-win', metric(m.winRate, '%'));
  text('mode-indicator', m.played ? m.played + ' MATCHES ANALYZED' : 'NO MATCHES IMPORTED');
  text('overview-subtitle', m.played ? 'Your personal trends across ' + m.played + ' imported games.' : 'Your imported matches, summarized.');
  text('career-name', current.settings.riotId || 'Your profile');
  text('career-region', 'Region: ' + current.settings.region.toUpperCase() + ' · Local imported history only');
  text('data-status', m.played ? 'LOCAL DATA READY' : 'LOCAL MODE');
  text('key-status', current.apiConfigured ? 'Official Riot API key detected in environment' : 'No approved Riot API key configured');
  text('riot-connect-title', current.linkedAccount ?
    'Connected: ' + (current.linkedAccount.gameName || 'Riot player') + '#' + (current.linkedAccount.tagLine || '') :
    (current.rsoConfigured ? 'Riot OAuth available' : 'Riot Sign On • approval required'));
  text('riot-connect-description', current.linkedAccount ?
    'Your account has explicitly opted in. Use Sync Riot to import your own completed matches.' :
    (current.rsoConfigured ? 'Secure browser-based linking is available through the configured Riot-approved service.' :
    'The app needs an approved Riot RSO client and secure backend. No login credentials are bundled.'));
  $('riot-connect').classList.toggle('hidden', !!current.linkedAccount);
  $('riot-disconnect').classList.toggle('hidden', !current.linkedAccount);
  text('matches-riot-sync', current.linkedAccount ? 'Sync Riot matches' : 'Sync Riot (sign in)');
  text('version-text', 'VTS ' + (current.version || 'developer preview'));
  text('folder-path', current.settings.syncFolder || 'No folder selected');
  $('key-status').classList.toggle('ok', current.apiConfigured);
  text('overlay-match-count', m.played + ' local ' + (m.played === 1 ? 'match' : 'matches') + ' analyzed');
}
function renderMaps() {
  const parent = $('map-breakdown');
  empty(parent);
  if (!current.matches.length) {
    parent.appendChild(node('div', 'empty-inline', 'Map-specific win rates appear after you import match history.'));
    return;
  }
  const data = new Map();
  current.matches.forEach(m => {
    if (m.result !== 'WIN' && m.result !== 'LOSS') return;
    const entry = data.get(m.map) || { played: 0, won: 0 };
    entry.played++;
    if (m.result === 'WIN') entry.won++;
    data.set(m.map, entry);
  });
  if (!data.size) parent.appendChild(node('div', 'empty-inline', 'No decided matches are available.'));
  [...data.entries()].sort((a, b) => b[1].played - a[1].played).forEach(([name, entry]) => {
    const percent = Math.round(100 * entry.won / entry.played);
    const row = node('div', 'map-row');
    row.appendChild(node('span', 'map-name', name));
    const track = node('div', 'bar-track');
    const fill = node('div', 'bar-fill');
    fill.style.width = percent + '%';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(node('span', 'map-percent', percent + '%'));
    parent.appendChild(row);
  });
}
function renderAll() {
  if (!current) return;
  renderMetrics();
  renderMatches();
  renderFavorites();
  renderMaps();
}
async function importMatches() {
  try {
    const result = await window.vts.importMatches();
    if (result.canceled) return;
    if (result.ok) {
      showToast('Imported ' + result.count + ' new match summaries.' + (result.errors.length ? ' Some files failed.' : ''));
      showPage('matches');
    } else {
      showToast(result.error || (result.errors || []).join('; ') || 'No matches were imported.', true);
      if (result.error && result.error.includes('PUUID')) showPage('settings');
    }
  } catch (error) { showToast('Import error: ' + error.message, true); }
}
async function overlayAction(action) {
  try {
    const result = await window.vts.overlay(action);
    if (!overlayMode) showToast('Overlay ' + (result.visible ? 'visible' : 'hidden') + (result.interactive ? ' · interactive' : ' · click-through'));
  } catch (error) { showToast(error.message, true); }
}
async function loadLeaderboard() {
  const button = $('load-board');
  button.disabled = true;
  text('board-status', 'Loading official data…');
  $('board-message').classList.remove('hidden');
  $('board-table').classList.add('hidden');
  text('board-message', 'Contacting Riot API…');
  try {
    const result = await window.vts.leaderboard();
    if (!result.ok) {
      text('board-status', 'Unavailable');
      text('board-message', result.error);
      return;
    }
    text('board-status', result.region.toUpperCase() + ' · ' + result.act);
    const parent = $('board-rows');
    empty(parent);
    result.rows.forEach(player => {
      const tr = node('tr');
      [player.rank || '—', player.name, player.rating + ' RR', player.wins].forEach(item => {
        tr.appendChild(node('td', '', item));
      });
      parent.appendChild(tr);
    });
    if (result.rows.length) {
      $('board-message').classList.add('hidden');
      $('board-table').classList.remove('hidden');
    } else text('board-message', 'The current act returned no leaderboard players.');
  } catch (error) {
    text('board-message', 'Unable to load leaderboard: ' + error.message);
    text('board-status', 'Unavailable');
  } finally { button.disabled = false; }
}
function fillSettings() {
  $('setting-riotid').value = current.settings.riotId;
  $('setting-puuid').value = current.settings.puuid;
  $('setting-region').value = current.settings.region;
  $('setting-startup').checked = current.settings.launchAtLogin === true;
  $('setting-tray').checked = current.settings.minimizeToTray !== false;
  $('setting-opacity').value = Math.round((current.settings.overlayOpacity || 0.98) * 100);
  text('opacity-label', $('setting-opacity').value + '%');
}

function renderLibrary() {
  const grid = $('library-grid');
  if (!grid) return;
  empty(grid);
  const search = String($('library-filter').value || '').trim().toLowerCase();
  const all = weaponCatalog.flatMap(weapon =>
    (weapon.skins || []).map(skin => ({...skin, weapon:weapon.name, category:weapon.category, cost:weapon.cost})));
  const filtered = all.filter(x => !search ||
    x.name.toLowerCase().includes(search) || x.weapon.toLowerCase().includes(search));
  text('library-status', filtered.length + ' cosmetic items' +
    (filtered.length > 100 ? ' · Showing first 100, type to filter' : '') +
    ' · Public catalog, not your personal daily shop');
  for (const skin of filtered.slice(0, 100)) {
    const card = node('article', 'skin-card');
    const imageBox = node('div', 'skin-image-box');
    const asset = imageElement(skin.image, skin.name, 'skin-image');
    if (asset) imageBox.appendChild(asset);
    card.appendChild(imageBox);
    card.appendChild(node('strong', 'skin-title', skin.name));
    card.appendChild(node('small', 'skin-sub', skin.weapon + ' · cosmetic preview'));
    grid.appendChild(card);
  }
  if (!filtered.length) grid.appendChild(node('div', 'empty-inline',
    weaponCatalog.length ? 'No cosmetic items match this search.' : 'The cosmetic catalog is unavailable. Try Reload assets.'));
}
async function loadCatalog(force = false) {
  if (catalogRequested && !force) return;
  catalogRequested = true;
  try {
    const res = await window.vts.catalog('agents');
    if (res.ok && Array.isArray(res.data)) {
      agentCatalog = res.data;
      text('agent-catalog-status', agentCatalog.length + ' playable agents loaded from public game data.');
      if (current) renderFavorites();
    } else text('agent-catalog-status', 'Agent artwork temporarily unavailable. Offline agent choices remain available.');
  } catch(error) {
    text('agent-catalog-status', 'Offline agent list loaded.');
  }
  if (overlayMode) return;
  try {
    const res = await window.vts.catalog('weapons');
    if (res.ok && Array.isArray(res.data)) weaponCatalog = res.data;
    else text('library-status', res.error || 'Public content service unavailable.');
    renderLibrary();
  } catch(error) {
    text('library-status', 'Public content service unavailable: ' + error.message);
  }
}

function bind() {
  document.querySelectorAll('[data-view-target]').forEach(button => {
    button.addEventListener('click', () => showPage(button.dataset.viewTarget));
  });
  document.querySelectorAll('[data-window-action]').forEach(button => {
    button.addEventListener('click', () => window.vts.windowAction(button.dataset.windowAction));
  });
  ['top-import', 'hero-import', 'matches-import'].forEach(id => $(id).addEventListener('click', importMatches));
  ['top-overlay', 'hero-overlay', 'settings-overlay'].forEach(id => $(id).addEventListener('click', () => overlayAction('toggle')));
  $('settings-interaction').addEventListener('click', () => overlayAction('interaction'));
  $('overlay-close').addEventListener('click', () => overlayAction('hide'));
  $('load-board').addEventListener('click', loadLeaderboard);
  $('setting-opacity').addEventListener('input', event => text('opacity-label', event.target.value + '%'));
  $('choose-folder').addEventListener('click', async () => {
    try {
      const result = await window.vts.chooseFolder();
      if (result.ok) {current = await window.vts.getState();renderAll();showToast('Local match folder selected.');}
    } catch(error) {showToast(error.message,true);}
  });
  $('sync-now').addEventListener('click', async () => {
    try {
      const result = await window.vts.syncFolder();
      showToast(result.ok ? 'Synced folder. ' + result.count + ' new matches found.' : result.reason, !result.ok);
    } catch(error) {showToast(error.message,true);}
  });
  $('matches-export').addEventListener('click', async () => {
    try {
      const result = await window.vts.exportCsv();
      if (result.ok) showToast('Exported ' + result.count + ' matches to ' + result.path);
    } catch(error) {showToast(error.message,true);}
  });
  $('riot-connect').addEventListener('click', async () => {
    const button = $('riot-connect');
    button.disabled = true;
    button.textContent = 'Waiting for Riot authorization…';
    showToast('A browser window will open for Riot authorization, if configured.');
    try {
      const result = await window.vts.riotLogin();
      if (result.ok) {
        current = await window.vts.getState();
        fillSettings();renderAll();
        showToast('Riot account connected. You can now sync your completed matches.');
      } else showToast(result.error || 'Account linking failed.', true);
    } catch(error) {showToast(error.message,true);}
    finally {button.disabled=false;button.textContent='Connect Riot account ↗';}
  });
  $('riot-disconnect').addEventListener('click', async () => {
    if (!confirm('Disconnect your Riot account? Your local match history will remain.')) return;
    try {
      await window.vts.riotDisconnect();
      current = await window.vts.getState();renderAll();
      showToast('Riot account disconnected.');
    } catch(error) {showToast(error.message,true);}
  });
  $('matches-riot-sync').addEventListener('click', async () => {
    if (!current.linkedAccount) {
      showPage('settings');showToast('Connect a Riot account first.',true);return;
    }
    const button = $('matches-riot-sync');
    button.disabled=true;button.textContent='Syncing matches…';
    try {
      const result=await window.vts.riotSync();
      if (result.ok) showToast('Synced ' + result.examined + ' completed matches (' + result.count + ' new).');
      else showToast(result.error,true);
    } catch(error) {showToast(error.message,true);}
    finally {button.disabled=false;button.textContent='Sync Riot matches';}
  });
  $('library-filter').addEventListener('input', renderLibrary);
  $('library-refresh').addEventListener('click', () => {weaponCatalog=[];loadCatalog(true);});
  $('clear-matches').addEventListener('click', async () => {
    if (!confirm('Delete every imported match summary stored on this computer?')) return;
    current = await window.vts.clearMatches();
    renderAll();
    showToast('Local match history cleared.');
  });
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    const next = {
      ...current.settings,
      riotId: $('setting-riotid').value.trim(),
      puuid: $('setting-puuid').value.trim(),
      region: $('setting-region').value,
      launchAtLogin: $('setting-startup').checked,
      minimizeToTray: $('setting-tray').checked,
      overlayOpacity: Number($('setting-opacity').value) / 100
    };
    if (next.puuid !== current.settings.puuid && current.matchCount &&
        !confirm('Changing your PUUID will clear match history associated with your previous player profile. Continue?')) return;
    try {
      current = await window.vts.saveSettings(next);
      renderAll();
      showToast('Preferences saved locally.');
    } catch (error) { showToast('Could not save: ' + error.message, true); }
  });
  window.vts.on('state:changed', next => { current = next; renderAll(); });
  window.vts.on('overlay:changed', next => {
    if (overlayMode) {
      const label = document.querySelector('.overlay-shortcut span');
      label.textContent = next.interactive ? 'CLICKABLE' : 'CLICK-THROUGH';
    }
  });
}
async function start() {
  if (!window.vts) {
    document.body.textContent = 'VTS must be launched with Electron. Run npm start.';
    return;
  }
  bind();
  try {
    current = await window.vts.getState();
    fillSettings();
    renderAll();
    loadCatalog();
  } catch (error) {
    if (!overlayMode) showToast('Cannot initialize app: ' + error.message, true);
  }
}
start();
