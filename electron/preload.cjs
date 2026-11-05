'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['state:changed', 'overlay:changed', 'locker:changed', 'client:cleared', 'stats:updated']);
contextBridge.exposeInMainWorld('vts', Object.freeze({
  openTracker: riotId => ipcRenderer.invoke('client:tracker',riotId),
  clientLocker: () => ipcRenderer.invoke('client:locker'),
  clientEquip: change => ipcRenderer.invoke('client:equip',change),
  clientStats: puuid => ipcRenderer.invoke('client:stats',puuid),
  clientConnect: () => ipcRenderer.invoke('client:connect'),
  clientDisconnect: () => ipcRenderer.invoke('client:disconnect'),
  clientShop: () => ipcRenderer.invoke('client:shop'),
  clientPlayers: () => ipcRenderer.invoke('client:players'),
  clientLobby: () => ipcRenderer.invoke('client:lobby'),
  clientAction: (action, agent) => ipcRenderer.invoke('client:action', action, agent),
  getState: () => ipcRenderer.invoke('app:state'),
  saveSettings: (value) => ipcRenderer.invoke('app:settings', value),
  importMatches: () => ipcRenderer.invoke('app:import'),
  clearMatches: () => ipcRenderer.invoke('app:clear-matches'),
  chooseFolder: () => ipcRenderer.invoke('app:choose-folder'),
  syncFolder: () => ipcRenderer.invoke('app:sync-folder'),
  exportCsv: () => ipcRenderer.invoke('app:export-csv'),
  catalog: (kind) => ipcRenderer.invoke('app:catalog', kind),
  riotLogin: () => ipcRenderer.invoke('app:rso'),
  riotSync: () => ipcRenderer.invoke('app:rso-sync'),
  riotDisconnect: () => ipcRenderer.invoke('app:rso-disconnect'),
  leaderboard: () => ipcRenderer.invoke('app:leaderboard'),
  overlay: (action) => ipcRenderer.invoke('overlay:action', action),
  windowAction: (action) => ipcRenderer.invoke('window:action', action),
  on: (channel, listener) => {
    if (!channels.has(channel) || typeof listener !== 'function') return () => {};
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
}));
