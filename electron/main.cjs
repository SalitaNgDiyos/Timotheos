'use strict';
// Tanglaw Bible – Electron edition. The screens are the same as the Tauri edition's (src/, built with
// `vite build --mode electron` into electron/web); this file does what Tauri's native side
// (src-tauri/src/lib.rs) does: find module files, read theWord text Bibles, answer read-only SQLite
// queries straight from disk (Node's built-in SQLite – modules are never copied into memory whole),
// keep settings and study data, import modules, and change module files only where the user asks.
// Encrypted modules are never decoded: the screens recognise and skip them.
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const emit = process.emitWarning; // Node calls its SQLite "experimental"; it is stable enough for reading
process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String(w && w.message || w))) return; return emit.call(process, w, ...rest); };
const { DatabaseSync } = require('node:sqlite');
process.emitWarning = emit;

app.setName('Tanglaw Bible');
const USER = () => app.getPath('userData');                     // %APPDATA%\Tanglaw Bible (shared with Tanglaw 0.4)
const DATA = () => ensure(path.join(USER(), 'data'));            // this edition's settings and study data
const MODULES = () => ensure(path.join(USER(), 'modules'));      // imported modules (the same folder 0.4 used)
function ensure(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (e) { /* exists */ } return d; }

/* ------------------------------------------------------------ module files */
const MODULE_EXT = ['.ont', '.ot', '.nt', '.bblx', '.bbli', '.twm', '.dctx', '.dcti', '.lexx', '.lexi', '.cmtx', '.cmti', '.topx', '.topi', '.refx', '.refi', '.devx', '.devi', '.ontx', '.otx', '.ntx'];
function walk(dir, depth, out) {
  let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) { if (depth < 4 && !/^[-.]/.test(it.name)) walk(p, depth + 1, out); continue; }
    const low = it.name.toLowerCase();
    if (MODULE_EXT.some(x => low.endsWith(x))) { let size = 0; try { size = fs.statSync(p).size; } catch (e) { /* gone */ } out.push({ path: p, name: it.name, size }); }
  }
}

/** theWord text Bibles: UTF-8, or Windows-1252 when not UTF-8; lines kept for the last few Bibles */
const ontCache = new Map();
function ontLines(p) {
  if (ontCache.has(p)) { const l = ontCache.get(p); ontCache.delete(p); ontCache.set(p, l); return l; }
  let b = fs.readFileSync(p);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  const text = require('buffer').isUtf8(b) ? b.toString('utf8') : new TextDecoder('windows-1252').decode(b);
  const lines = text.split('\n').map(l => (l.endsWith('\r') ? l.slice(0, -1) : l));
  ontCache.set(p, lines);
  while (ontCache.size > 6) ontCache.delete(ontCache.keys().next().value);
  return lines;
}

/* ------------------------------------------------------------ read-only SQLite */
const dbs = new Map(); // path -> DatabaseSync (read only)
const shapes = new Map(); // path \0 query -> {wrapped}
function conn(p) {
  let c = dbs.get(p);
  if (c) return c;
  const head = Buffer.alloc(16); let fd;
  try { fd = fs.openSync(p, 'r'); fs.readSync(fd, head, 0, 16, 0); } finally { if (fd != null) fs.closeSync(fd); }
  if (head.toString('latin1', 0, 15) !== 'SQLite format 3') throw new Error('not a readable database (encrypted or unknown format)');
  c = new DatabaseSync(p, { readOnly: true });
  try { c.exec('pragma cache_size = -512'); } catch (e) { /* fine */ }
  try { c.utf8 = /^utf-?8$/i.test(String(c.prepare('pragma encoding').get().encoding)); } catch (e) { c.utf8 = true; }
  if (dbs.size > 24) forgetAll();
  dbs.set(p, c);
  return c;
}
function forget(p) {
  const c = dbs.get(p); if (c) { try { c.close(); } catch (e) { /* closed */ } dbs.delete(p); }
  ontCache.delete(p);
  for (const k of shapes.keys()) if (k.startsWith(p + '\0')) shapes.delete(k);
}
function forgetAll() { for (const p of [...dbs.keys()]) forget(p); }
function forgetUnder(dir) { const d = path.resolve(dir).toLowerCase() + path.sep; for (const p of [...dbs.keys(), ...ontCache.keys()]) if (path.resolve(p).toLowerCase().startsWith(d)) forget(p); }

/** a parameter from the screens: whole numbers as integers, {$b64} as bytes */
function param(v) {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 1n : 0n;
  if (typeof v === 'number') return Number.isInteger(v) ? BigInt(v) : v;
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'object' && typeof v.$b64 === 'string') return Buffer.from(v.$b64, 'base64');
  return null;
}
/** values for the screens: text as text when it is UTF-8; other text (Windows-1252, zlib data stored as
 *  text) and blobs as bytes, unchanged – Node's SQLite would otherwise spoil non-UTF-8 text */
const isUtf8 = require('buffer').isUtf8;
function sqlQuery(p, query, params) {
  const c = conn(p); const ps = (params || []).map(param);
  const key = p + '\0' + query;
  let shape = shapes.get(key);
  if (!shape) {
    const st = c.prepare(query); const cols = st.columns().map(x => x.name);
    let wrapped = null;
    // (a database stored as UTF-16, like some e-Sword modules, can hold no stray bytes: read it as it is)
    if (c.utf8 && cols.length && /^\s*(select|with)\b/i.test(query)) {
      const n = cols.map((_, i) => 'c' + i);
      const sql = `WITH __q(${n.join(',')}) AS (${query}) SELECT ${n.map(x => `typeof(${x}), CASE WHEN typeof(${x}) = 'text' THEN CAST(${x} AS BLOB) ELSE ${x} END`).join(', ')} FROM __q`;
      try { c.prepare(sql); wrapped = sql; } catch (e) { wrapped = null; }
    }
    shape = { cols, wrapped }; shapes.set(key, shape);
  }
  if (!shape.wrapped) {
    const st = c.prepare(query); st.setReturnArrays(true);
    return { columns: shape.cols, rows: st.all(...ps) };
  }
  const st = c.prepare(shape.wrapped); st.setReturnArrays(true);
  const raw = st.all(...ps); const n = shape.cols.length; const rows = new Array(raw.length);
  for (let r = 0; r < raw.length; r++) {
    const x = raw[r]; const row = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = x[2 * i], v = x[2 * i + 1];
      if (t === 'text') { const b = Buffer.from(v.buffer, v.byteOffset, v.byteLength); row[i] = isUtf8(b) ? b.toString('utf8') : v; }
      else row[i] = v;
    }
    rows[r] = row;
  }
  return { columns: shape.cols, rows };
}

/* ------------------------------------------------------------ writing (only where the user asks) */
const BACKUP = '.tanglaw-backup';
const EDITABLE = ['.ont', '.ot', '.nt', '.twm', '.bblx', '.bbli', '.dctx', '.dcti', '.lexx', '.lexi', '.cmtx', '.cmti', '.refx', '.refi', '.topx', '.topi', '.devx', '.devi'];
function editable(p) {
  const low = String(p).toLowerCase();
  if (!EDITABLE.some(e => low.endsWith(e)) || !fs.existsSync(p) || !fs.statSync(p).isFile()) throw new Error('not a module file Tanglaw can change');
  return p;
}
function backupOnce(p) { const b = p + BACKUP; if (fs.existsSync(b)) return false; try { fs.copyFileSync(p, b); } catch (e) { throw new Error('could not keep a copy of the original: ' + e.message); } return true; }
function runAll(db, statements) {
  db.exec('BEGIN');
  try { for (const [q, ps] of statements) { try { db.prepare(q).run(...(ps || []).map(param)); } catch (e) { throw new Error(`${e.message} (${q})`); } } db.exec('COMMIT'); }
  catch (e) { try { db.exec('ROLLBACK'); } catch (x) { /* none */ } throw e; }
}
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function writeSafe(f, text) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }
const safeName = n => String(n).replace(/[\/\\:*?"<>|]/g, '');

/* ------------------------------------------------------------ data from earlier Tanglaw editions */
// Tanglaw 0.4 (Electron) kept settings.json and my-study-data.json in %APPDATA%\Tanglaw Bible; the Tauri
// edition (0.5–0.7) in %APPDATA%\org.tanglaw.bible, in this edition's format. On the first start the more
// recently used of the two is taken over; the old files are left as they are.
function tauriDir() { return path.join(app.getPath('appData'), 'org.tanglaw.bible'); }
const mtime = f => { try { return fs.statSync(f).mtimeMs; } catch (e) { return 0; } };
function takeOverTauri() {
  const d = DATA(); if (fs.existsSync(path.join(d, 'settings.json'))) return;
  const t = tauriDir(); const ts = path.join(t, 'settings.json');
  if (!fs.existsSync(ts)) return;
  const tTime = Math.max(mtime(ts), mtime(path.join(t, 'my-study-data.json')));
  const oTime = Math.max(mtime(path.join(USER(), 'settings.json')), mtime(path.join(USER(), 'my-study-data.json')));
  if (tTime < oTime) return; // Tanglaw 0.4 was used more recently: its data is taken over by the screens (legacy_data)
  const s = readJson(ts) || {};
  const tm = path.join(t, 'modules');
  if (fs.existsSync(tm)) s.folders = [...new Set([...(s.folders || []), tm])];
  writeSafe(path.join(d, 'settings.json'), JSON.stringify(s, null, 2));
  for (const f of ['my-study-data.json', 'My cross-references.xrefs.twm']) if (fs.existsSync(path.join(t, f))) fs.copyFileSync(path.join(t, f), path.join(d, f));
}
function userXrefsFile() {
  const p = path.join(DATA(), 'My cross-references.xrefs.twm');
  if (!fs.existsSync(p)) {
    const old = path.join(USER(), 'My cross-references.xrefs.twm');
    if (fs.existsSync(old)) { fs.copyFileSync(old, p); return p; }
    const db = new DatabaseSync(p);
    db.exec(`create table xrefs(id integer primary key, vi1 int, vi2 int); create table config(name text, value text);
      create index xrefs_idx_vi1 on xrefs(vi1); create index xrefs_idx_vi2 on xrefs(vi2);
      insert into config values ('table.xrefs','xrefs'),('tables.xrefs.description','My cross-references (Tanglaw)'),('type','10');`);
    db.close();
  }
  return p;
}

/* ------------------------------------------------------------ the commands */
const picked = new Set(); // files chosen in a dialog: only these may be read or written whole
const C = {
  scan: ({ folders }) => { const out = []; for (const f of folders || []) walk(f, 0, out); return out; },
  ont_info: ({ path: p, skip }) => { const l = ontLines(p); return [l.length, l.slice(skip)]; },
  ont_slice: ({ path: p, start, count }) => ontLines(p).slice(start, start + count),
  sql: ({ path: p, query, params }) => sqlQuery(p, query, params),
  modules_dir: () => MODULES(),
  import_bytes: ({ name, b64 }) => { const p = path.join(MODULES(), safeName(name)); forget(p); fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p; },
  import_stage: ({ name, b64 }) => { const d = ensure(path.join(MODULES(), '.incoming')); const p = path.join(d, safeName(name)); fs.writeFileSync(p, Buffer.from(b64, 'base64')); return p; },
  import_commit: ({ staged }) => {
    const inc = path.join(MODULES(), '.incoming');
    if (path.dirname(path.resolve(staged)) !== path.resolve(inc)) throw new Error('not a waiting import');
    const dest = path.join(MODULES(), path.basename(staged));
    forget(staged);
    let status = 'imported';
    if (fs.existsSync(dest)) status = fs.readFileSync(dest).equals(fs.readFileSync(staged)) ? 'already' : 'updated';
    if (status === 'already') fs.unlinkSync(staged); else { forget(dest); fs.renameSync(staged, dest); }
    return [dest, status];
  },
  import_discard: ({ staged }) => {
    if (path.dirname(path.resolve(staged)) !== path.resolve(path.join(MODULES(), '.incoming'))) throw new Error('not a waiting import');
    forget(staged); try { fs.unlinkSync(staged); } catch (e) { /* gone */ } return null;
  },
  settings_load: () => readJson(path.join(DATA(), 'settings.json')) || {},
  settings_save: ({ settings }) => { writeSafe(path.join(DATA(), 'settings.json'), JSON.stringify(settings, null, 2)); return null; },
  ud_load: () => readJson(path.join(DATA(), 'my-study-data.json')) || {},
  ud_save: ({ data }) => {
    const p = path.join(DATA(), 'my-study-data.json');
    if (fs.existsSync(p)) { // a copy for each of the last 7 days
      const bdir = ensure(path.join(DATA(), 'backups')); const today = path.join(bdir, `my-study-data.day${Math.floor(Date.now() / 86400000)}.json`);
      if (!fs.existsSync(today)) {
        fs.copyFileSync(p, today);
        const olds = fs.readdirSync(bdir).filter(f => f.startsWith('my-study-data.day')).sort();
        while (olds.length > 7) fs.unlinkSync(path.join(bdir, olds.shift()));
      }
    }
    writeSafe(p, JSON.stringify(data)); return null;
  },
  legacy_data: () => {
    const d = USER(); const st = path.join(d, 'settings.json');
    if (!fs.existsSync(st)) return null;
    // 0.4's imported modules are in the same folder this edition uses, so they need no extra folder
    return { folder: d, settings: readJson(st), study: readJson(path.join(d, 'my-study-data.json')), modules: null };
  },
  user_xrefs: () => userXrefsFile(),
  user_xref_change: ({ op, vi1, vi2 }) => {
    const p = userXrefsFile(); forget(p);
    const db = new DatabaseSync(p);
    try {
      if (op === 'add') {
        const has = db.prepare('select count(*) n from xrefs where vi1 = ? and vi2 = ?').get(BigInt(vi1), BigInt(vi2)).n;
        return has ? 0 : Number(db.prepare('insert into xrefs(vi1, vi2) values (?, ?)').run(BigInt(vi1), BigInt(vi2)).changes);
      }
      return Number(db.prepare('delete from xrefs where vi1 = ? and (vi2 >> 8) = (? >> 8)').run(BigInt(vi1), BigInt(vi2)).changes);
    } finally { db.close(); }
  },
  mod_file: ({ path: p }) => {
    const st = fs.statSync(p); let writable = true;
    try { fs.accessSync(p, fs.constants.W_OK); const fd = fs.openSync(p, 'a'); fs.closeSync(fd); } catch (e) { writable = false; }
    return { size: st.size, writable, backup: fs.existsSync(p + BACKUP) ? p + BACKUP : null };
  },
  mod_read: ({ path: p }) => fs.readFileSync(editable(p)).toString('base64'),
  mod_write: ({ path: p, b64 }) => {
    editable(p); forget(p);
    const made = backupOnce(p); const tmp = p + '.tanglaw-tmp';
    fs.writeFileSync(tmp, Buffer.from(b64, 'base64')); fs.renameSync(tmp, p); forget(p);
    return made;
  },
  mod_sql_write: ({ path: p, statements, vacuum }) => {
    editable(p); forget(p);
    const before = fs.statSync(p).size; const tmp = p + '.tanglaw-tmp';
    fs.copyFileSync(p, tmp);
    try { const db = new DatabaseSync(tmp); try { runAll(db, statements); if (vacuum) db.exec('VACUUM'); } finally { db.close(); } }
    catch (e) { try { fs.unlinkSync(tmp); } catch (x) { /* gone */ } throw e; }
    const made = backupOnce(p); fs.renameSync(tmp, p); forget(p);
    return [before, fs.statSync(p).size, made];
  },
  mod_restore: ({ path: p }) => {
    editable(p); const b = p + BACKUP;
    if (!fs.existsSync(b)) throw new Error('there is no copy of the original of this module');
    forget(p); fs.copyFileSync(b, p); fs.unlinkSync(b); return null;
  },
  umod_create: ({ name, statements }) => {
    const safe = String(name).replace(/[\\/:*?"<>|]/g, ' ').trim();
    if (!safe.toLowerCase().endsWith('.twm')) throw new Error('a user module must be a .twm file');
    const p = path.join(MODULES(), safe);
    if (fs.existsSync(p)) throw new Error(`a module named ${safe} is already there`);
    try { const db = new DatabaseSync(p); try { runAll(db, statements); } finally { db.close(); } }
    catch (e) { try { fs.unlinkSync(p); } catch (x) { /* gone */ } throw e; }
    forget(p); return p;
  },
  umod_exec: ({ path: p, statements }) => {
    if (!String(p).toLowerCase().endsWith('.twm') || !fs.existsSync(p)) throw new Error('not a user module');
    forget(p);
    const db = new DatabaseSync(p);
    try {
      let user = ''; try { user = String((db.prepare("select value from config where name = 'user'").get() || {}).value || ''); } catch (e) { /* none */ }
      if (user.trim() !== '1') throw new Error('this module is not a user module (it can be changed only through Properties)');
      runAll(db, statements);
    } finally { db.close(); forget(p); }
    return null;
  },
  // what Tauri's plugins did
  dialog_open: async ({ options: o = {} }) => {
    const props = o.directory ? ['openDirectory'] : ['openFile']; if (o.multiple) props.push('multiSelections');
    const r = await dialog.showOpenDialog(win, { title: o.title, defaultPath: o.defaultPath, filters: o.filters, properties: props });
    if (r.canceled || !r.filePaths.length) return null;
    if (!o.directory) r.filePaths.forEach(f => picked.add(path.resolve(f)));
    return o.multiple ? r.filePaths : r.filePaths[0];
  },
  dialog_save: async ({ options: o = {} }) => {
    const r = await dialog.showSaveDialog(win, { title: o.title, defaultPath: o.defaultPath, filters: o.filters });
    if (r.canceled || !r.filePath) return null;
    picked.add(path.resolve(r.filePath)); return r.filePath;
  },
  fs_read: ({ path: p }) => { if (!picked.has(path.resolve(p)) && !(process.env.TANGLAW_SCRIPT && /[\\/]imports[\\/]/.test(p))) throw new Error('only files chosen in Tanglaw can be read'); return new Uint8Array(fs.readFileSync(p)); },
  fs_write: ({ path: p, data }) => { if (!picked.has(path.resolve(p))) throw new Error('only files chosen in Tanglaw can be written'); fs.writeFileSync(p, Buffer.from(data)); return null; },
  clip_read: () => clipboard.readText(),
  clip_write: ({ text }) => { clipboard.writeText(String(text)); return null; },
  open_url: ({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return null; },
  app_version: () => app.getVersion(),
  win: ({ op }) => {
    if (!win) return null;
    if (op === 'minimize') win.minimize();
    else if (op === 'toggleMaximize') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (op === 'close') win.close();
    else if (op === 'restore') { if (win.isMinimized()) win.restore(); }
    else if (op === 'focus') { win.show(); win.focus(); }
    else if (op === 'attention') win.flashFrame(true);
    return null;
  },
  /** Windows draws the minimise/maximise/close buttons; their colours follow the skin's title bar */
  titlebar: ({ color, symbol }) => { if (win && process.platform === 'win32' && win.setTitleBarOverlay) { try { win.setTitleBarOverlay({ color, symbolColor: symbol, height: 42 }); } catch (e) { /* older Windows */ } } return null; },
  forget_under: ({ dir }) => { forgetUnder(dir); return null; },
  /** a module in Tanglaw's own folder (imported), which may be removed again */
  is_imported: ({ path: p }) => path.resolve(p).toLowerCase().startsWith(path.resolve(MODULES()).toLowerCase() + path.sep) && fs.existsSync(p),
  remove_imported: async ({ path: p }) => {
    if (!C.is_imported({ path: p })) throw new Error('only modules imported into Tanglaw can be removed here');
    forget(p); await shell.trashItem(p);
    for (const b of [p + BACKUP]) if (fs.existsSync(b)) { try { await shell.trashItem(b); } catch (e) { /* keep it */ } }
    return null;
  },
  test_report: ({ text }) => { console.log('RESULT ' + text); return null; },
  test_mode: () => !!process.env.TANGLAW_SCRIPT,
};

/* ------------------------------------------------------------ the window */
let win = null;
function createWindow() {
  const overlay = process.platform === 'win32';
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 720, minHeight: 480, title: 'Tanglaw Bible', show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1d1a' : '#ebe6db',
    // Tanglaw draws its own title bar in the skin's colours; on Windows the window buttons stay Windows' own
    ...(overlay ? { titleBarStyle: 'hidden', titleBarOverlay: { color: '#ebe6db', symbolColor: '#3a3226', height: 42 } } : { frame: false }),
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.removeMenu();
  if (process.env.TANGLAW_SIZE) { const [w, h] = process.env.TANGLAW_SIZE.split('x').map(Number); if (w && h) { win.setMinimumSize(w, h); win.setSize(w, h); } }
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'web', 'index.html'));
  if (process.env.TANGLAW_SCRIPT) {
    const js = fs.readFileSync(process.env.TANGLAW_SCRIPT, 'utf8');
    win.webContents.once('did-finish-load', () => setTimeout(() => win.webContents.executeJavaScript(js).catch(e => console.log('RESULT ✗ script error ' + e.message)), 3000));
  }
  win.on('closed', () => { win = null; });
}

ipcMain.handle('tanglaw', async (e, cmd, args) => {
  const fn = C[cmd];
  if (!fn) return { ok: false, error: 'unknown command ' + cmd };
  try { return { ok: true, data: await fn(args || {}) }; }
  catch (err) { return { ok: false, error: err && err.message || String(err) }; }
});
ipcMain.on('tanglaw-sync', (e, what) => { e.returnValue = what === 'platform' ? { platform: process.platform, overlay: process.platform === 'win32' } : null; });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { try { takeOverTauri(); } catch (e) { console.error('take over:', e.message); } createWindow(); });
  app.on('window-all-closed', () => { forgetAll(); app.quit(); });
}
