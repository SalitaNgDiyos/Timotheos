/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session, nativeTheme, clipboard, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { Library } = require('./lib/library');
const canon = require('./lib/canon');
const { Xrefs } = require('./lib/xrefs');
const { importFiles } = require('./lib/importer');
const { UserData } = require('./lib/userdata');
const plans = require('./lib/plans');
const searchLib = require('./lib/search');
const modprops = require('./lib/modprops');
const usermod = require('./lib/usermod');
const twstudy = require('./lib/twstudy');

// [E3] Portable Mode detection: if "Timotheos Data" or "portable.json" exists next to the executable
// (or TIMOTHEOS_PORTABLE_DIR is set), keep settings, imported modules, and study data there.
(function detectPortableMode() {
  const exeDir = path.dirname(process.execPath);
  const candidates = [
    process.env.TIMOTHEOS_PORTABLE_DIR,
    fs.existsSync(path.join(exeDir, 'portable.json')) ? path.join(exeDir, 'Timotheos Data') : null,
    fs.existsSync(path.join(exeDir, 'Timotheos Data')) ? path.join(exeDir, 'Timotheos Data') : null,
    fs.existsSync(path.join(__dirname, '..', 'portable.json')) ? path.join(__dirname, '..', 'Timotheos Data') : null,
  ].filter(Boolean);
  if (candidates.length) {
    try {
      fs.mkdirSync(candidates[0], { recursive: true });
      app.setPath('userData', candidates[0]);
      process.env.TIMOTHEOS_IS_PORTABLE = '1';
    } catch (e) { /* fallback to standard userData */ }
  }
})();

// Timotheos was called Tanglaw Bible: on the first start, take over the settings, modules and study data of the old folder.
(function takeOverTanglaw() {
  try {
    const here = app.getPath('userData');
    if (fs.existsSync(path.join(here, 'settings.json'))) return;
    const exeDir = path.dirname(process.execPath);
    const olds = process.env.TIMOTHEOS_IS_PORTABLE === '1'
      ? [path.join(exeDir, 'Tanglaw Data')]
      : [path.join(app.getPath('appData'), 'Tanglaw Bible')];
    for (const o of olds) {
      if (o !== here && fs.existsSync(path.join(o, 'settings.json'))) { fs.cpSync(o, here, { recursive: true, force: false }); return; }
    }
  } catch (e) { /* start fresh */ }
})();

const MODULES_DIR = () => path.join(app.getPath('userData'), 'modules');   // imported & user modules live here
const USER_XREFS = () => path.join(app.getPath('userData'), 'My cross-references.xrefs.twm');

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = {
  moduleFolders: [], openBibles: [], ref: { b: 43, c: 1, v: 1 },
  greekDict: null, hebrewDict: null, morphDict: null,
  show: { strongs: false, morph: false, footnotes: true, headings: true, woj: true, added: true, xrefs: true, cmtLinks: true },
  eswordBookMap: {}, fontSize: 17, theme: 'light', lang: 'en',
  windowBounds: { width: 1280, height: 860, maximized: false, fullScreen: false },
  apocryphaPlacement: '1611', // '1611' = between Malachi and Matthew (1611 KJV order); 'end' = after Revelation; 'nets'; 'orthodox'
};

function loadSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')); } catch (e) { /* first run */ }
  s = Object.assign({}, DEFAULTS, s, { show: Object.assign({}, DEFAULTS.show, s.show || {}) });
  // [F1] Sync canon.js book order with saved apocryphaPlacement on startup
  canon.setOrder(s.apocryphaPlacement);
  if (!s.moduleFolders.length) {
    // common module locations, if present
    const env = process.env;
    const cands = [
      env.ProgramData && path.join(env.ProgramData, 'The Word'),
      env.APPDATA && path.join(env.APPDATA, 'The Word'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'The Word'),
      env.ProgramFiles && path.join(env.ProgramFiles, 'The Word'),
      env.APPDATA && path.join(env.APPDATA, 'e-Sword'),
      env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'e-Sword'),
      env.TIMOTHEOS_MODULES,
    ].filter(Boolean);
    s.moduleFolders = cands.filter(p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } });
  }
  return s;
}
let settings = null;
function saveSettings() {
  if (!settings) return;
  try {
    const f = SETTINGS_FILE();
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const data = JSON.stringify(settings, null, 2);
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, data, 'utf8');
    try { fs.renameSync(tmp, f); } catch (_) { fs.writeFileSync(f, data, 'utf8'); try { fs.unlinkSync(tmp); } catch (__) {} }
  } catch (e) { console.error(e); }
}

let lib = null;
let xrefs = null;
let userData = null;
let win = null;

async function rescanAll() {
  const l = await lib.scan();
  await xrefs.load(lib.xrefFiles);
  xrefs.list().forEach(x => { if ((settings.xrefsDisabled || []).includes(x.file)) xrefs.setEnabled(x.i, false); });
  return l;
}

function resolveWindowBounds(saved, defW, defH, minW, minH) {
  const s = Object.assign({ width: defW, height: defH, maximized: false, fullScreen: false }, saved || {});
  const width = Math.max(minW, Math.round(+s.width || defW));
  const height = Math.max(minH, Math.round(+s.height || defH));
  const out = { width, height, maximized: !!s.maximized, fullScreen: !!s.fullScreen };
  if (typeof s.x === 'number' && typeof s.y === 'number' && Number.isFinite(s.x) && Number.isFinite(s.y)) {
    const x = Math.round(s.x), y = Math.round(s.y);
    try {
      const displays = screen.getAllDisplays();
      const visible = !displays.length || displays.some(d => {
        const wa = d.workArea || d.bounds;
        const ix = Math.min(x + width, wa.x + wa.width) - Math.max(x, wa.x);
        const iy = Math.min(y + height, wa.y + wa.height) - Math.max(y, wa.y);
        return ix >= 100 && iy >= 60;
      });
      if (visible) { out.x = x; out.y = y; }
    } catch (_) {
      out.x = x; out.y = y;
    }
  }
  return out;
}

function attachWindowBoundsPersistence(targetWin, settingsKey, defW, defH, minW, minH) {
  let boundsTimer = null;
  function recordWindowBounds(saveNow) {
    if (!targetWin || targetWin.isDestroyed()) return;
    try {
      const isMax = targetWin.isMaximized();
      const isMin = targetWin.isMinimized();
      const isFull = targetWin.isFullScreen();
      const prev = Object.assign({ width: defW, height: defH, maximized: false, fullScreen: false }, settings[settingsKey] || {});
      if (!isMax && !isMin && !isFull) {
        const b = targetWin.getBounds();
        if (b && b.width >= minW && b.height >= minH) {
          prev.width = b.width; prev.height = b.height; prev.x = b.x; prev.y = b.y;
        }
      } else if (!isMin && typeof targetWin.getNormalBounds === 'function') {
        const nb = targetWin.getNormalBounds();
        if (nb && nb.width >= minW && nb.height >= minH) {
          prev.width = nb.width; prev.height = nb.height; prev.x = nb.x; prev.y = nb.y;
        }
      }
      prev.maximized = isMax;
      prev.fullScreen = isFull;
      settings[settingsKey] = prev;
      clearTimeout(boundsTimer);
      if (saveNow) saveSettings();
      else boundsTimer = setTimeout(saveSettings, 180);
    } catch (_) {}
  }
  targetWin.on('resize', () => recordWindowBounds(false));
  targetWin.on('move', () => recordWindowBounds(false));
  targetWin.on('maximize', () => recordWindowBounds(true));
  targetWin.on('unmaximize', () => recordWindowBounds(true));
  targetWin.on('enter-full-screen', () => recordWindowBounds(true));
  targetWin.on('leave-full-screen', () => recordWindowBounds(true));
  targetWin.on('close', () => recordWindowBounds(true));
}

function createWindow() {
  const wb = resolveWindowBounds(settings.windowBounds, 1280, 860, 720, 480);
  const winOpts = {
    width: wb.width, height: wb.height, minWidth: 720, minHeight: 480,
    title: 'Timotheos',
    // Timotheos draws its own title bar and menus in the skin's colours; Windows keeps its min/max/close
    // buttons, recoloured to match (setTitleBarOverlay below)
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarColours(),
    backgroundColor: ({ slate: '#1d1f23', midnight: '#0f1522', dusk: '#12161c', office: '#eef2f7', sampaguita: '#f4f6f1', narra: '#f1e8dc', sepia: '#efe4cf' })[(settings.appearance || {}).skin] || (settings.theme === 'dark' ? '#1d1f23' : '#f7f5f0'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  };
  if (typeof wb.x === 'number' && typeof wb.y === 'number') { winOpts.x = wb.x; winOpts.y = wb.y; }
  win = new BrowserWindow(winOpts);
  if (wb.maximized) win.maximize();
  if (wb.fullScreen) win.setFullScreen(true);
  attachWindowBoundsPersistence(win, 'windowBounds', 1280, 860, 720, 480);
  // let the Options window list the fonts installed on this computer (nothing else is allowed)
  session.defaultSession.setPermissionCheckHandler((wc, perm) => perm === 'local-fonts');
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'local-fonts'));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.TIMOTHEOS_SCREENSHOT) {
    // test hook: run a script in the page, capture the window, then quit
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try {
        if (process.env.TIMOTHEOS_SCRIPT) await win.webContents.executeJavaScript(fs.readFileSync(process.env.TIMOTHEOS_SCRIPT, 'utf8'));
        await new Promise(r => setTimeout(r, +(process.env.TIMOTHEOS_WAIT || 2500)));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(process.env.TIMOTHEOS_SCREENSHOT, img.toPNG());
        if (guideWin && !guideWin.isDestroyed()) fs.writeFileSync(process.env.TIMOTHEOS_SCREENSHOT.replace(/\.png$/, '') + '-guide.png', (await guideWin.webContents.capturePage()).toPNG());
      } catch (e) { console.error('screenshot failed', e); }
      app.quit();
    }, 3000));
  }
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  // the menus are drawn in the page (renderer/titlebar.js) so they follow the skin; no native menu bar
  Menu.setApplicationMenu(null);
}

const SKIN_BARS = { parchment: ['#ebe6db', '#2c2822', false], office: ['#dfe7f2', '#1d2633', false], sampaguita: ['#ffffff', '#1d2420', false],
  narra: ['#3b2a1e', '#f6ebdd', false], sepia: ['#e3d4b6', '#3a2e1f', false], slate: ['#16181b', '#e6e2d9', true], midnight: ['#0b101b', '#e4e9f5', true], dusk: ['#0f1318', '#e5e9ef', true] };
function titleBarColours() {
  const b = SKIN_BARS[(settings.appearance || {}).skin] || SKIN_BARS[settings.theme === 'dark' ? 'slate' : 'parchment'];
  nativeTheme.themeSource = b[2] ? 'dark' : 'light';
  return { color: b[0], symbolColor: b[1], height: 36 };
}

let guideWin = null;
function openGuide(skin) {
  if (guideWin && !guideWin.isDestroyed()) { guideWin.focus(); return; }
  const gwb = resolveWindowBounds(settings.guideWindowBounds, 980, 820, 560, 400);
  const gOpts = {
    width: gwb.width, height: gwb.height, minWidth: 560, minHeight: 400, title: 'Timotheos – User Guide',
    titleBarStyle: 'hidden', titleBarOverlay: titleBarColours(), backgroundColor: titleBarColours().color,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  };
  if (typeof gwb.x === 'number' && typeof gwb.y === 'number') { gOpts.x = gwb.x; gOpts.y = gwb.y; }
  guideWin = new BrowserWindow(gOpts);
  if (gwb.maximized) guideWin.maximize();
  attachWindowBoundsPersistence(guideWin, 'guideWindowBounds', 980, 820, 560, 400);
  guideWin.loadFile(path.join(__dirname, 'renderer', 'guide.html'), { query: { skin: skin || '' } });
  guideWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  guideWin.on('closed', () => { guideWin = null; });
}

async function doImport(paths) {
  lib.releaseUnder(MODULES_DIR());
  const results = await importFiles(paths, MODULES_DIR(), settings, userData);
  const list = await rescanAll();
  return { results, list };
}

function handle(name, fn) {
  ipcMain.handle(name, async (e, ...args) => {
    try { return { ok: true, data: await fn(...args) }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
}

app.whenReady().then(async () => {
  settings = loadSettings();
  if (process.env.TIMOTHEOS_MODULES && !settings.moduleFolders.includes(process.env.TIMOTHEOS_MODULES)) settings.moduleFolders.push(process.env.TIMOTHEOS_MODULES);
  fs.mkdirSync(MODULES_DIR(), { recursive: true });
  lib = new Library(settings, { extraFolders: [MODULES_DIR()], cacheFile: path.join(app.getPath('userData'), 'module-cache.json') });
  lib.setHidden(settings.hiddenModules || []);
  xrefs = new Xrefs(USER_XREFS());
  userData = new UserData(path.join(app.getPath('userData'), 'my-study-data.json'));
  await rescanAll();

  handle('settings:get', () => Object.assign({}, settings, { portable: process.env.TIMOTHEOS_IS_PORTABLE === '1', userDataDir: app.getPath('userData'), appDir: app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(), version: app.getVersion() }));
  ipcMain.handle('win:titlebar', (e, c) => {
    try {
      nativeTheme.themeSource = c.dark ? 'dark' : 'light';
      for (const w of BrowserWindow.getAllWindows()) if (w.setTitleBarOverlay) w.setTitleBarOverlay({ color: c.color, symbolColor: c.symbolColor, height: 36 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
  handle('app:cmd', (cmd, arg) => {
    const w = win;
    if (cmd === 'quit') app.quit();
    else if (cmd === 'devtools') w.webContents.toggleDevTools();
    else if (cmd === 'modulesFolder') { fs.mkdirSync(MODULES_DIR(), { recursive: true }); shell.openPath(MODULES_DIR()); }
    else if (cmd === 'guide') openGuide(arg);
    else if (cmd === 'front') { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
    else if (cmd === 'minimize') BrowserWindow.getFocusedWindow() && BrowserWindow.getFocusedWindow().minimize();
    return true;
  });
  handle('settings:set', patch => {
    if (patch && typeof patch === 'object') {
      if (patch.appearance && settings.appearance) {
        const mergedColors = Object.assign({}, settings.appearance.colors || {}, patch.appearance.colors || {});
        const mergedZoom = Object.assign({}, settings.appearance.zoom || {}, patch.appearance.zoom || {});
        patch = Object.assign({}, patch, { appearance: Object.assign({}, settings.appearance, patch.appearance, { colors: mergedColors, zoom: mergedZoom }) });
      }
      if (patch.show && settings.show) {
        patch = Object.assign({}, patch, { show: Object.assign({}, settings.show, patch.show) });
      }
      Object.assign(settings, patch);
    }
    // [F1] Keep canon.js order in sync whenever apocryphaPlacement changes
    if (patch && patch.apocryphaPlacement) canon.setOrder(patch.apocryphaPlacement);
    saveSettings();
    return settings;
  });
  // Firefox themes installed in this user's Firefox: copied into the data folder and offered as skins
  const FXDIR = () => path.join(app.getPath('userData'), 'firefox-themes');
  handle('fx:import', () => { const fx = require('./lib/fxthemes'); const r = fx.importInstalled(require('os').homedir(), process.platform, process.env, FXDIR()); return Object.assign(r, { list: fx.list(FXDIR()) }); });
  handle('fx:list', () => require('./lib/fxthemes').list(FXDIR()));
  handle('fx:remove', id => { fs.rmSync(path.join(FXDIR(), String(id).replace(/[^A-Za-z0-9._@-]+/g, '_')), { recursive: true, force: true }); return require('./lib/fxthemes').list(FXDIR()); });
  handle('modules:list', () => lib.list());
  handle('modules:rescan', () => rescanAll());
  handle('modules:addFolder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder with theWord or e-Sword modules', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (!settings.moduleFolders.includes(r.filePaths[0])) settings.moduleFolders.push(r.filePaths[0]);
    saveSettings();
    return rescanAll();
  });
  handle('modules:removeFolder', p => { settings.moduleFolders = settings.moduleFolders.filter(x => x !== p); saveSettings(); return rescanAll(); });
  handle('modules:importDialog', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import theWord or e-Sword modules', properties: ['openFile', 'multiSelections'],
      // one line per kind of module, so the drop-down of the dialog is a vertical list
      filters: [
        { name: 'All supported modules', extensions: ['ont', 'ot', 'nt', 'twm', 'twzip', 'zip', 'bblx', 'bbli', 'cmtx', 'cmti', 'dctx', 'dcti', 'topx', 'topi', 'refx', 'refi', 'devx', 'devi', 'lexx', 'lexi', 'mapx', 'mapi', 'harx', 'hari', 'notx', 'jnlx', 'usfm', 'sfm', 'ptx', 'usfx', 'xml'] },
        { name: 'theWord Bibles', extensions: ['ont', 'ot', 'nt'] },
        { name: 'theWord books, commentaries, dictionaries', extensions: ['twm'] },
        { name: 'theWord packages', extensions: ['twzip', 'zip'] },
        { name: 'e-Sword Bibles', extensions: ['bblx', 'bbli'] },
        { name: 'e-Sword commentaries', extensions: ['cmtx', 'cmti'] },
        { name: 'e-Sword dictionaries', extensions: ['dctx', 'dcti'] },
        { name: 'e-Sword topics', extensions: ['topx', 'topi'] },
        { name: 'e-Sword references', extensions: ['refx', 'refi'] },
        { name: 'e-Sword devotions', extensions: ['devx', 'devi'] },
        { name: 'e-Sword lexicons', extensions: ['lexx', 'lexi'] },
        { name: 'e-Sword maps and harmonies', extensions: ['mapx', 'mapi', 'harx', 'hari'] },
        { name: 'e-Sword notes and journals', extensions: ['notx', 'jnlx'] },
        { name: 'USFM, USFX and XML Bibles', extensions: ['usfm', 'sfm', 'ptx', 'usfx', 'xml'] },
        { name: 'All files', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return doImport(r.filePaths);
  });
  handle('modules:import', paths => doImport(paths || []));
  handle('modules:removeImported', async file => {
    const root = path.resolve(MODULES_DIR());
    const lf = lib.linkFileOf && lib.linkFileOf(file);
    if (lf && path.resolve(lf).startsWith(root + path.sep)) {
      lib.release(file);
      try { fs.unlinkSync(lf); } catch (e) { await shell.trashItem(lf); }
      return rescanAll();
    }
    if (!path.resolve(file).startsWith(root + path.sep)) throw new Error('Only modules imported into Timotheos can be removed here.');
    lib.release(file);
    await shell.trashItem(file);
    return rescanAll();
  });
  // Options → Modules: take a module out of the lists (the file stays), or move its file to the Recycle Bin
  handle('modules:setHidden', ids => { settings.hiddenModules = [...new Set(ids || [])]; saveSettings(); lib.setHidden(settings.hiddenModules); return rescanAll(); });
  handle('modules:deleteFile', async id => {
    const file = lib.fileOf(id);
    if (!file || !fs.existsSync(file)) throw new Error('The file of this module is not there any more.');
    lib.release(file);
    await shell.trashItem(file);
    settings.hiddenModules = (settings.hiddenModules || []).filter(x => x !== id); saveSettings(); lib.setHidden(settings.hiddenModules);
    return rescanAll();
  });
  handle('modules:importedFolder', () => MODULES_DIR());
  handle('modules:describe', () => lib.describeAll());
  handle('book:open', id => lib.bookOpen(id));
  handle('book:about', id => lib.bookAbout(id));
  // module properties, compacting/compressing (lib/modprops.js); the module is closed first
  handle('mod:props', id => modprops.read(lib.fileOf(id)));
  handle('mod:save', async (id, changes, aboutHtml) => { const f = lib.fileOf(id); lib.release(f); return modprops.write(f, changes, aboutHtml); });
  handle('mod:compress', async (id, opts) => { const f = lib.fileOf(id); lib.release(f); return modprops.compress(f, opts || {}); });
  handle('mod:restore', async id => { const f = lib.fileOf(id); lib.release(f); return modprops.restore(f); });
  // [A1-A4] User module creation and authoring
  handle('usermod:create', async opts => {
    const dir = path.join(MODULES_DIR(), 'theWord');
    fs.mkdirSync(dir, { recursive: true });
    const created = await usermod.createModule(opts, dir);
    const list = await rescanAll();
    return { created, id: 'bm:' + created.name, list };
  });
  handle('usermod:saveCmt', async (id, ref, html) => {
    const f = lib.fileOf(id); lib.release(f);
    const res = await usermod.saveCommentaryEntry(f, ref, html);
    await lib.openBook(id);
    return res;
  });
  handle('usermod:saveTopic', async (id, topic) => {
    const f = lib.fileOf(id); lib.release(f);
    const res = await usermod.saveTopic(f, topic);
    await lib.openBook(id);
    return res;
  });
  handle('usermod:renameTopic', async (id, tid, subject) => {
    const f = lib.fileOf(id); lib.release(f);
    const res = await usermod.renameTopic(f, tid, subject);
    await lib.openBook(id);
    return res;
  });
  handle('usermod:moveTopic', async (id, tid, d) => {
    const f = lib.fileOf(id); lib.release(f);
    const res = await usermod.moveTopic(f, tid, d);
    await lib.openBook(id);
    return res;
  });
  handle('usermod:deleteTopic', async (id, tid) => {
    const f = lib.fileOf(id); lib.release(f);
    const res = await usermod.deleteTopic(f, tid);
    await lib.openBook(id);
    return res;
  });
  handle('usermod:exportNotes', async (opts = {}) => {
    const dir = path.join(MODULES_DIR(), 'theWord');
    fs.mkdirSync(dir, { recursive: true });
    const safe = ((opts.title || 'My Timotheos Notes').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'My Timotheos Notes') + '.cmt.twm';
    const dest = opts.saveDialog ? (await dialog.showSaveDialog(win, { defaultPath: safe, filters: [{ name: 'theWord Commentary (.cmt.twm)', extensions: ['cmt.twm', 'twm'] }] })).filePath : path.join(dir, safe);
    if (!dest) return null;
    lib.release(dest);
    const res = await usermod.exportNotesToCommentary(userData.get().notes, dest, opts);
    const list = await rescanAll();
    return { ...res, id: 'bm:' + path.basename(dest), list };
  });
  // [D4] Export theWord Verse Lists (.vsls.twm) & Reading Plans (.rdp.twm)
  handle('twstudy:exportVsls', async (name, listsObj) => {
    const safe = (String(name || 'My Verses').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'My Verses') + '.vsls.twm';
    const r = await dialog.showSaveDialog(win, { defaultPath: safe, filters: [{ name: 'theWord Verse List (.vsls.twm)', extensions: ['vsls.twm', 'twm'] }] });
    if (r.canceled || !r.filePath) return null;
    const buf = await twstudy.exportVerseLists(listsObj, name);
    fs.writeFileSync(r.filePath, buf);
    return r.filePath;
  });
  handle('twstudy:exportRdp', async plan => {
    const safe = (String((plan && plan.name) || 'Reading Plan').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Reading Plan') + '.rdp.twm';
    const r = await dialog.showSaveDialog(win, { defaultPath: safe, filters: [{ name: 'theWord Reading Plan (.rdp.twm)', extensions: ['rdp.twm', 'twm'] }] });
    if (r.canceled || !r.filePath) return null;
    const buf = await twstudy.exportReadingPlan(plan);
    fs.writeFileSync(r.filePath, buf);
    return r.filePath;
  });
  handle('book:topics', id => lib.bookTopics(id));
  handle('book:search', (id, q) => lib.bookSearch(id, q));
  // clipboard monitor: the copied text, and the Bible references in it
  handle('clip:read', () => clipboard.readText());
  handle('refs:find', text => require('./lib/refs').findRefs(String(text || '').slice(0, 20000)));
  // export of topics: Word (.docx, a ZIP of XML files), .rtf, .html, .txt
  handle('export:save', async (name, fmt, data) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] });
    if (r.canceled || !r.filePath) return null;
    const buf = fmt === 'docx' ? require('./lib/zip').write(data) : Buffer.from(String(data), 'utf8');
    fs.writeFileSync(r.filePath, buf); return r.filePath;
  });
  // Book search (all commentaries, dictionaries, books…): one at a time; a new search stops the one before
  let bsToken = 0;
  ipcMain.handle('bsearch', async (e, q, o) => {
    const my = ++bsToken;
    try { return { ok: true, data: await require('./lib/booksearch').run(lib, q, o || {}, t => { if (my === bsToken && !e.sender.isDestroyed()) e.sender.send('bsearch:progress', t); }, () => my !== bsToken) }; }
    catch (err) { return { ok: false, error: err.message || String(err) }; }
  });
  handle('book:topic', (id, tid) => lib.bookTopic(id, tid));
  handle('book:lookup', (id, key) => lib.bookLookup(id, key));
  handle('cmt:verse', (b, c, v) => lib.commentaries(b, c, v));
  handle('cmt:marks', (b, c) => lib.commentaryMarks(b, c));
  handle('word:lookup', (w, fuzzy) => lib.wordLookup(w, fuzzy !== false));
  handle('dev:today', (m, d) => lib.devotionsToday(m, d));
  handle('xrefs:chapter', (b, c) => xrefs.chapter(b, c, settings.show.xrefsBack !== false));
  handle('xrefs:add', (from, to) => xrefs.add(from, to));
  handle('xrefs:remove', (from, to) => xrefs.remove(from, to));
  handle('xrefs:sets', () => xrefs.list());
  handle('xrefs:enable', (i, on) => { xrefs.setEnabled(i, on); settings.xrefsDisabled = xrefs.list().filter(s => s.disabled).map(s => s.file); saveSettings(); return xrefs.list(); });
  handle('bible:info', (id, o) => lib.info(id, o));
  handle('bible:nav', ids => lib.navigation(ids));
  handle('bible:chapter', (ids, b, c) => lib.chapter(ids, b, c));
  handle('search', (ids, q, opts) => lib.search(ids, q, opts));
  handle('search:describe', (q, opts) => searchLib.describe(q, opts));
  handle('search:ranges', () => searchLib.PREDEFINED.map(([id, label]) => ({ id, label })));
  handle('search:checkRange', text => { const r = searchLib.parseRange(text, settings.apocryphaPlacement); return { ok: !r.errors.length && r.ranges.length > 0, errors: r.errors }; });
  handle('ud:get', () => userData.get());
  handle('ud:set', (key, value) => userData.set(key, value));
  handle('plans:presets', () => Object.entries(plans.PRESETS).map(([id, p]) => ({ id, label: p.label, groups: p.groups })));
  handle('plans:create', async (o, ids) => {
    const counts = {};
    for (const spec of o.groups) for (const b of canon.BOOKS.map(x => x[0])) if (!(b in counts)) counts[b] = await lib.chapterCount(ids || [], b);
    return plans.create(o, b => counts[b] || 0);
  });
  handle('plans:catchUp', plan => plans.catchUp(plan));
  handle('plans:restart', plan => plans.restart(plan));
  handle('clipboard:write', (text, html) => { clipboard.write(html ? { text, html } : { text }); return true; });
  handle('print', () => new Promise(res => win.webContents.print({}, ok => res(ok))));
  handle('lookup', (kind, key, bibleId) => lib.lookup(kind, key, bibleId));
  handle('ref:parse', s => canon.parseRef(s));
  handle('canon:books', () => canon.BOOKS.map(b => canon.book(b[0])));
  handle('shell:open', url => { if (/^https?:/.test(url)) shell.openExternal(url); return true; });

  // [iBiblia Bidirectional Verse Sync Bridge]
  const SYNC_IN_FILE = () => path.join(app.getPath('userData'), 'ibiblia-sync-in.json');
  const SYNC_OUT_FILE = () => path.join(app.getPath('userData'), 'ibiblia-sync-out.json');
  let lastSyncInSeq = -1, lastSyncInTs = 0, lastSyncInMtime = 0;

  function writeSyncOut(refObj, bookName) {
    try {
      const r = refObj || (settings && settings.ref) || { b: 43, c: 1, v: 1 };
      const bk = bookName || (canon.book(r.b, settings ? settings.apocryphaPlacement : '1611') || {}).name || ('Book ' + r.b);
      if (win && !win.isDestroyed()) {
        try { win.setTitle(`${bk} ${r.c}:${r.v} - Timotheos`); } catch (_) {}
      }
      const outData = {
        b: r.b, c: r.c, v: r.v,
        bookName: bk,
        ts: Date.now()
      };
      const tmp = SYNC_OUT_FILE() + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(outData));
      try { fs.renameSync(tmp, SYNC_OUT_FILE()); } catch (_) { fs.writeFileSync(SYNC_OUT_FILE(), JSON.stringify(outData)); }
    } catch (_) {}
  }

  handle('sync:out', payload => {
    if (!payload || !payload.ref) return false;
    settings.ref = payload.ref;
    writeSyncOut(payload.ref, payload.bookName);
    return true;
  });

  function checkSyncInFile() {
    try {
      const f = SYNC_IN_FILE();
      if (!fs.existsSync(f)) return;
      const st = fs.statSync(f);
      if (st.mtimeMs <= lastSyncInMtime && lastSyncInMtime > 0) return;
      lastSyncInMtime = st.mtimeMs;
      const raw = fs.readFileSync(f, 'utf8');
      if (!raw || !raw.trim()) return;
      const data = JSON.parse(raw);
      if (!data) return;
      const seq = typeof data.seq === 'number' ? data.seq : 0;
      const ts = typeof data.ts === 'number' ? data.ts : 0;
      if (seq > 0 && seq === lastSyncInSeq && ts === lastSyncInTs) return;
      lastSyncInSeq = seq;
      lastSyncInTs = ts;
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send('external:sync', data);
      }
    } catch (_) {}
  }

  setInterval(checkSyncInFile, 120);
  try {
    fs.watch(app.getPath('userData'), (evt, fname) => {
      if (fname && fname.toLowerCase().includes('ibiblia-sync-in')) checkSyncInFile();
    });
  } catch (_) {}

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => { saveSettings(); });
app.on('window-all-closed', () => { saveSettings(); if (process.platform !== 'darwin') app.quit(); });
