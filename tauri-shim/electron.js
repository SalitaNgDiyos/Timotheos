'use strict';
// What main.js asks of Electron, answered inside the worker. Everything that needs the window, dialogs or the
// clipboard is passed on to the page (host.js), which has the Tauri API.
const { Buffer } = require('buffer');
const N = require('./native');
const handlers = new Map();
let readyResolve; const ready = new Promise(r => { readyResolve = r; });
let seq = 0; const pending = new Map();
const post = m => self.postMessage(m);
function hostCall(op, ...args) { return new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); post({ t: 'host', id, op, args }); }); }
function onHostReply(m) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.err ? p.rej(new Error(m.err)) : p.res(m.val); }

async function dispatch(m) {
  await ready;
  const h = handlers.get(m.ch);
  const e = { sender: { send: (ch, data) => post({ t: 'event', ch, data }), isDestroyed: () => false } };
  let r;
  try { if (!h) throw new Error('unknown channel ' + m.ch); r = await h(e, ...(m.args || [])); }
  catch (err) { r = { ok: false, error: err.message || String(err) }; }
  post({ t: 'ipc-res', id: m.id, res: r });
}

const ipcMain = { handle: (name, fn) => handlers.set(name, fn) };
let userData = null;
const app = {
  whenReady: () => Promise.resolve(),
  getPath(n) { const h = globalThis.__HOST; if (n === 'userData') return userData || h.dataDir; if (n === 'appData') return h.dataDir.replace(/[\\/][^\\/]*$/, ''); if (n === 'temp') return h.tmp; return h.home; },
  setPath(n, p) { if (n === 'userData') userData = p; },
  isPackaged: true, getAppPath: () => '/', getVersion: () => globalThis.__HOST.version,
  quit: () => hostCall('quit'), on() {},
};
const wc = () => ({ once() {}, on() {}, send: (ch, data) => post({ t: 'event', ch, data }), setWindowOpenHandler() {}, toggleDevTools: () => hostCall('devtools'),
  print: (o, cb) => hostCall('print').then(() => cb(true)), isDestroyed: () => false, executeJavaScript: async () => {}, capturePage: async () => ({ toPNG: () => Buffer.alloc(0) }) });
let windows = [];
class BrowserWindow {
  constructor() { this.n = windows.length; this.webContents = wc(); windows.push(this); if (this.n === 0) readyResolve(); }
  loadFile(f, o) { if (/guide\.html$/.test(f)) { this.skin = (o && o.query && o.query.skin) || ''; hostCall('guide', this.skin); } }
  on() {} once() {} isDestroyed() { return false; } isMaximized() { return false; } isMinimized() { return false; } isFullScreen() { return false; }
  maximize() {} setFullScreen() {} getBounds() { return { width: 0, height: 0, x: 0, y: 0 }; } getNormalBounds() { return this.getBounds(); }
  setTitle(t) { if (this.n === 0) hostCall('title', t); } restore() {} show() {} minimize() {}
  focus() { if (this.n === 0) hostCall('front'); else hostCall('guide', this.skin || ''); }
  setTitleBarOverlay() {}
  static getAllWindows() { return windows; } static getFocusedWindow() { return windows[0]; }
}
const dialog = {
  showOpenDialog: (w, o) => hostCall('open', o || w), showSaveDialog: (w, o) => hostCall('save', o || w),
};
const shell = {
  openExternal: u => hostCall('openUrl', u), openPath: p => hostCall('openPath', p),
  trashItem: async p => { N.json('trash', { p }); },
};
const clipboard = { readText: () => hostCall('clipRead'), write: o => hostCall('clipWrite', o) };
module.exports = { app, BrowserWindow, ipcMain, dialog, shell, Menu: { setApplicationMenu() {} },
  session: { defaultSession: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} } },
  nativeTheme: { themeSource: 'system' }, clipboard, screen: { getAllDisplays: () => [] },
  __dispatch: dispatch, __onHostReply: onHostReply };
