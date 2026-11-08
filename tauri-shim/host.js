/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// The page side of Timotheos for Tauri: provides `window.api` (what preload.js gave in Electron), starts the worker
// that runs main.js, and does the things only the page can: dialogs, clipboard, window, drag and drop.
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open as dlgOpen, save as dlgSave } from '@tauri-apps/plugin-dialog';
import { readText, writeText, writeHtml } from '@tauri-apps/plugin-clipboard-manager';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { installAndroidSpeech } from './tts.js';

let info = null;
const isAndroid = /Android/i.test(navigator.userAgent);
const isMobile = isAndroid || /iPhone|iPad/i.test(navigator.userAgent);
document.documentElement.classList.toggle('mobile', isMobile);
if (isAndroid) installAndroidSpeech();
const win = getCurrentWindow();

/* ---------- worker ---------- */
const worker = new Worker('worker.js');
let started; const startedP = new Promise(r => { started = r; });
let seq = 0; const waiting = new Map(); const listeners = {};
const on = (ch, fn) => { (listeners[ch] = listeners[ch] || []).push(fn); };
worker.onmessage = async ev => {
  const m = ev.data;
  if (m.t === 'started') started();
  else if (m.t === 'ipc-res') { const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.res); } }
  else if (m.t === 'event') (listeners[m.ch] || []).forEach(f => { try { f(m.data); } catch (e) { console.error(e); } });
  else if (m.t === 'host') {
    try { worker.postMessage({ t: 'host-res', id: m.id, val: await hostOp(m.op, m.args) }); }
    catch (e) { worker.postMessage({ t: 'host-res', id: m.id, err: String(e && e.message || e) }); }
  }
};
worker.onerror = e => console.error('worker error', e.message, e.filename, e.lineno);
const infoP = invoke('host_info').then(i => { info = i; worker.postMessage({ t: 'init', info: i }); return i; });

async function call(ch, ...args) {
  await infoP; await startedP;
  const r = await new Promise(res => { const id = ++seq; waiting.set(id, res); worker.postMessage({ t: 'ipc', id, ch, args }); });
  if (!r || !r.ok) throw new Error(r ? r.error : 'no answer');
  return r.data;
}

/* ---------- things done for the worker ---------- */
let importSeq = 0;
const fwd = p => String(p).replace(/\\/g, '/');   // Windows paths with forward slashes: one kind of path inside
// Android: the file picker of the web view (<input type=file>) gives each file with its real name, which the module
// recognition needs (.ont, .twm, ...); the dialog plugin only gives opaque content:// addresses. Each chosen file is
// copied piece by piece into the app's own folder and the import works on the copy.
function androidPick(multiple) {
  return new Promise(resolve => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = !!multiple; inp.style.display = 'none';
    inp.addEventListener('change', () => { const f = [...inp.files]; inp.remove(); resolve(f); });
    inp.addEventListener('cancel', () => { inp.remove(); resolve([]); });
    document.body.appendChild(inp); inp.click();
  });
}
async function androidCopy(file, dir) {
  const dest = dir + '/' + String(file.name || 'module').replace(/[\\/:*?"<>|]+/g, '_');
  const PIECE = 2 << 20; let first = true;
  for (let o = 0; o < file.size || first; o += PIECE) {
    const buf = new Uint8Array(await file.slice(o, o + PIECE).arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    await invoke('write_b64', { path: dest, data: btoa(bin), append: !first }); first = false;
  }
  return dest;
}
async function hostOp(op, a) {
  switch (op) {
    case 'open': {
      const o = a[0] || {}; const props = o.properties || [];
      if (isAndroid && props.includes('openDirectory')) throw new Error('Choosing a folder is not possible on Android. Use Import to add module files.');
      if (isAndroid) {
        const files = await androidPick(props.includes('multiSelections'));
        if (!files.length) return { canceled: true, filePaths: [] };
        const dir = info.tmp + '/import-' + (++importSeq) + '-' + Date.now();
        const out = []; for (const f of files) out.push(await androidCopy(f, dir));
        return { canceled: false, filePaths: out };
      }
      const r = await dlgOpen({ title: o.title, multiple: props.includes('multiSelections'), directory: props.includes('openDirectory'), filters: (o.filters || []).filter(f => !(f.extensions || []).includes('*')) });
      if (!r) return { canceled: true, filePaths: [] };
      return { canceled: false, filePaths: (Array.isArray(r) ? r : [r]).map(fwd) };
    }
    case 'save': {
      const o = a[0] || {};
      let dp = o.defaultPath;
      if (isAndroid) { return { canceled: false, filePath: info.dataDir + '/exports/' + String(dp || 'export').replace(/[\\/]/g, '_') }; }
      const p = await dlgSave({ title: o.title, defaultPath: dp, filters: (o.filters || []).filter(f => !(f.extensions || []).includes('*')) });
      return p ? { canceled: false, filePath: fwd(p) } : { canceled: true };
    }
    case 'openUrl': return openUrl(a[0]);
    case 'openPath': return openPath(a[0]);
    case 'clipRead': try { return await readText(); } catch (e) { return ''; }
    case 'clipWrite': {
      const o = a[0] || {};
      // Android's clipboard takes plain text only: the formatted version is tried, and the plain text is the fallback
      if (o.html && !isMobile) { try { await writeHtml(o.html, o.text); return true; } catch (e) { /* plain text below */ } }
      await writeText(o.text || ''); return true;
    }
    case 'title': return win.setTitle(a[0]);
    case 'front': try { await win.unminimize(); await win.show(); await win.setFocus(); } catch (e) { /* ignore */ } return true;
    case 'quit': return invoke('quit');
    case 'print': window.print(); return true;
    case 'devtools': return true;
    case 'guide': return openGuide(a[0]);
  }
  throw new Error('unknown host operation ' + op);
}

let guideBox = null;
async function openGuide(skin) {
  const url = 'guide.html' + (skin ? '?skin=' + encodeURIComponent(skin) : '');
  if (isMobile) {   // no second window on a phone: the guide lies over the page
    if (guideBox) return;
    guideBox = document.createElement('div'); guideBox.className = 'guidebox';
    guideBox.innerHTML = `<button type="button" aria-label="Close">✕</button><iframe src="${url}"></iframe>`;
    guideBox.querySelector('button').onclick = () => { guideBox.remove(); guideBox = null; };
    document.body.appendChild(guideBox); return;
  }
  const ex = await WebviewWindow.getByLabel('guide');
  if (ex) { try { await ex.setFocus(); return; } catch (e) { /* closed */ } }
  new WebviewWindow('guide', { url, title: 'Timotheos – User Guide', width: 980, height: 820, minWidth: 560, minHeight: 400 });
}

/* ---------- window.api (the former preload.js) ---------- */
const api = {
  getSettings: () => call('settings:get'), setSettings: p => call('settings:set', p),
  listModules: () => call('modules:list'), rescan: () => call('modules:rescan'), addFolder: () => call('modules:addFolder'),
  removeFolder: p => call('modules:removeFolder', p), importDialog: () => call('modules:importDialog'), importFiles: p => call('modules:import', p),
  removeImported: f => call('modules:removeImported', f), setHiddenModules: ids => call('modules:setHidden', ids), deleteModuleFile: id => call('modules:deleteFile', id),
  importedFolder: () => call('modules:importedFolder'), describeModules: () => call('modules:describe'),
  pathForFile: () => '',
  bibleInfo: (id, o) => call('bible:info', id, o), nav: ids => call('bible:nav', ids), chapter: (ids, b, c) => call('bible:chapter', ids, b, c),
  search: (ids, q, o) => call('search', ids, q, o), searchDescribe: (q, o) => call('search:describe', q, o), searchRanges: () => call('search:ranges'), checkRange: t => call('search:checkRange', t),
  userData: () => call('ud:get'), setUserData: (k, v) => call('ud:set', k, v),
  planPresets: () => call('plans:presets'), createPlan: (o, ids) => call('plans:create', o, ids), planCatchUp: p => call('plans:catchUp', p), planRestart: p => call('plans:restart', p),
  copyText: (t, h) => call('clipboard:write', t, h), print: () => call('print'), lookup: (k, key, b) => call('lookup', k, key, b),
  bookOpen: id => call('book:open', id), bookAbout: id => call('book:about', id), bookTopics: id => call('book:topics', id), bookSearch: (id, q) => call('book:search', id, q),
  bookSearchAll: (q, o) => call('bsearch', q, o), clipRead: () => call('clip:read'), findRefs: t => call('refs:find', t), exportSave: (n, f, d) => call('export:save', n, f, d),
  onBookSearchProgress: fn => on('bsearch:progress', fn),
  bookTopic: (id, t) => call('book:topic', id, t), bookLookup: (id, k) => call('book:lookup', id, k),
  commentaries: (b, c, v) => call('cmt:verse', b, c, v), commentaryMarks: (b, c) => call('cmt:marks', b, c),
  wordLookup: (w, f) => call('word:lookup', w, f), devotionsToday: (m, d) => call('dev:today', m, d),
  xrefsChapter: (b, c) => call('xrefs:chapter', b, c), xrefsAdd: (f, t) => call('xrefs:add', f, t), xrefsRemove: (f, t) => call('xrefs:remove', f, t),
  xrefsSets: () => call('xrefs:sets'), xrefsEnable: (i, o) => call('xrefs:enable', i, o),
  parseRef: s => call('ref:parse', s), books: () => call('canon:books'), openExternal: u => call('shell:open', u),
  modProps: id => call('mod:props', id), modSave: (id, c, a) => call('mod:save', id, c, a), modCompress: (id, o) => call('mod:compress', id, o), modRestore: id => call('mod:restore', id),
  userModCreate: o => call('usermod:create', o), userModSaveCmt: (id, r, h) => call('usermod:saveCmt', id, r, h), userModSaveTopic: (id, t) => call('usermod:saveTopic', id, t),
  userModRenameTopic: (id, t, s) => call('usermod:renameTopic', id, t, s), userModMoveTopic: (id, t, d) => call('usermod:moveTopic', id, t, d), userModDeleteTopic: (id, t) => call('usermod:deleteTopic', id, t),
  userModExportNotes: o => call('usermod:exportNotes', o), exportVsls: (n, l) => call('twstudy:exportVsls', n, l), exportRdp: p => call('twstudy:exportRdp', p),
  setTitleBar: async () => ({}),   // the buttons of the window are drawn in the page and take the colours of the skin by themselves
  appCmd: (cmd, arg) => call('app:cmd', cmd, arg),
  onMenu: fn => on('menu', fn), syncOut: p => call('sync:out', p), onExternalSync: fn => on('external:sync', fn),
};
window.api = api;
window.TimotheosHost = { isMobile, isAndroid, info: () => info };

/* ---------- window buttons, dragging, size memory (computer only) ---------- */
function windowButtons() {
  const bar = document.querySelector('.titlebar'); if (!bar || isMobile || bar.querySelector('.winctl')) return;
  const c = document.createElement('div'); c.className = 'winctl';
  c.innerHTML = '<button type="button" data-w="min" aria-label="Minimise"><svg viewBox="0 0 10 10"><path d="M1 5h8"/></svg></button><button type="button" data-w="max" aria-label="Maximise"><svg viewBox="0 0 10 10"><rect x="1.5" y="1.5" width="7" height="7" fill="none"/></svg></button><button type="button" data-w="close" aria-label="Close"><svg viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg></button>';
  c.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.w === 'min') win.minimize(); else if (b.dataset.w === 'max') win.toggleMaximize(); else win.close(); });
  bar.appendChild(c);
  bar.addEventListener('mousedown', e => { if (e.button === 0 && !e.target.closest('button,.tmwrap,.tmdrop,input,select,a,.winctl')) win.startDragging(); });
  bar.addEventListener('dblclick', e => { if (!e.target.closest('button,.tmwrap,.tmdrop,input,select,a,.winctl')) win.toggleMaximize(); });
}
async function restoreBounds() {
  if (isMobile) return;
  try {
    const s = await api.getSettings(); const b = s.windowBounds || {};
    if (b.width && b.height) await win.setSize(new LogicalSize(Math.max(360, b.width), Math.max(480, b.height)));
    if (b.maximized) await win.maximize();
    let t = null;
    const save = () => { clearTimeout(t); t = setTimeout(async () => {
      try { const max = await win.isMaximized(); const cur = { ...(((await api.getSettings()).windowBounds) || {}), maximized: max };
        if (!max) { const sz = (await win.innerSize()); const f = await win.scaleFactor(); cur.width = Math.round(sz.width / f); cur.height = Math.round(sz.height / f); }
        api.setSettings({ windowBounds: cur }); } catch (e) { /* closing */ } }, 400); };
    win.onResized(save);
  } catch (e) { /* defaults */ }
}
async function dragDrop() {
  if (isMobile) return;
  try {
    await getCurrentWebview().onDragDropEvent(ev => {
      const dz = document.getElementById('dropzone'); const p = ev.payload;
      if (p.type === 'enter' || p.type === 'over') { if (dz && p.paths !== undefined) dz.classList.remove('hidden'); }
      else if (p.type === 'leave') { if (dz) dz.classList.add('hidden'); }
      else if (p.type === 'drop') { if (dz) dz.classList.add('hidden'); if (p.paths && p.paths.length && window.importModules) window.importModules(p.paths); }
    });
  } catch (e) { /* no drag and drop */ }
}
window.addEventListener('DOMContentLoaded', () => {
  const t = setInterval(() => { if (document.querySelector('.titlebar .tmwrap, .titlebar *')) { clearInterval(t); windowButtons(); } }, 100);
  setTimeout(() => clearInterval(t), 8000);
  restoreBounds(); dragDrop();
  // test hook: run a script in the page, wait, then say that the picture can be taken
  infoP.then(async i => {
    if (!i.env.TIMOTHEOS_SCRIPT) return;
    let result = null; const log = console.log.bind(console);
    console.log = (...x) => { const t = x.join(' '); if (/^RESULT /.test(t)) result = t; log(...x); };   // the script itself is started by the program (src-tauri), after 3 seconds
    const t0 = Date.now();
    while (result === null && Date.now() - t0 < 240000) await new Promise(r => setTimeout(r, 200));
    await new Promise(r => setTimeout(r, +(i.env.TIMOTHEOS_WAIT || 800)));
    await invoke('test_report', { text: result || 'RESULT none' });
  });
});
