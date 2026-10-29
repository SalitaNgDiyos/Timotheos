'use strict';
// The bridge between Tanglaw's screens and Electron's main process (main.cjs). Only these calls are offered.
const { contextBridge, ipcRenderer } = require('electron');
async function invoke(cmd, args) {
  const r = await ipcRenderer.invoke('tanglaw', String(cmd), args || {});
  if (!r || !r.ok) throw (r && r.error) || 'failed'; // like Tauri: the error is a plain message
  return r.data;
}
const info = ipcRenderer.sendSync('tanglaw-sync', 'platform') || {};
contextBridge.exposeInMainWorld('tanglawNative', { invoke, platform: info.platform, overlay: !!info.overlay, electron: true });
// test scripts written for the Tauri edition report through this name
contextBridge.exposeInMainWorld('__TAURI_INTERNALS__', { invoke: (cmd, args) => invoke(cmd, args) });
window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.classList.add('electron');
  if (info.overlay) document.documentElement.classList.add('wco');
});
