'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['state:changed', 'overlay:changed']);
contextBridge.exposeInMainWorld('vts', Object.freeze({
  getState: () => ipcRenderer.invoke('app:state'),
  saveSettings: (value) => ipcRenderer.invoke('app:settings', value),
  importMatches: () => ipcRenderer.invoke('app:import'),
  clearMatches: () => ipcRenderer.invoke('app:clear-matches'),
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
