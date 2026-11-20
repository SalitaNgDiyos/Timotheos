/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Import modules…": checks each chosen file, copies usable modules into Timotheos's own module
// folder (<userData>/modules/theWord, /e-Sword, /USFM, or /USFX) and reports what happened to every file.
// Archives (.zip .twzip .7z .rar .tar .tar.gz .tgz .tar.bz2 .tar.xz .tar.zst and single .gz .bz2 .xz .zst) are unpacked; multi-file USFM archives (e.g. eBible.org *_usfm.zip) are
// bundled into a single consolidated .usfm Bible module. Verse lists (.vsls.twm) and reading plans
// (.rdp.twm) can also be imported into user study data. Encrypted modules and installer programs are refused.
const fs = require('fs');
const path = require('path');
const os = require('os');
const archive = require('./archive');
const zip = require('./zip');
const theword = require('./theword');
const mysword = require('./mysword');
const esword = require('./esword');
const twbook = require('./twbook');
const bookmod = require('./bookmod');
const twstudy = require('./twstudy');
const usfm = require('./usfm');
const docimport = require('./docimport');
const { DOC_RE } = require('./docread');
const sword = require('./sword');

const TW_BIBLE = /\.(ont|ot|nt)$/i;
const TW_LOCKED = /\.(ontx|otx|ntx)$/i;
const TW_BOOK = /\.twm$/i;
const ES_BIBLE = /\.(bblx|bbli)$/i;
const ES_BOOK = /\.(cmtx|cmti|dctx|dcti|topx|topi|refx|refi|devx|devi|lexx|lexi|mapx|mapi|harx|hari|notx|jnlx)$/i;
const MY_BIBLE = /\.bbl\.mybible$/i;
const MY_BOOK = /\.(cmt|dct|bok|book|jor)\.mybible$/i; // MySword; a plain .mybible is the app's own notes file and is not a module
const ES_OTHER = /\.(bbl|cmt|dct|top|dev|map|lex|har)$/i; // pre-version-9 e-Sword types
const USFM_BIBLE = /\.(usfm|sfm|ptx)$/i;
const USFX_BIBLE = /\.(usfx|usfx\.xml|xml)$/i;
const ARCHIVE = archive.NAME_RE;   // .zip .twzip .7z .rar .tar .tar.gz .tgz .tar.bz2 .tar.xz .tar.zst .gz .bz2 .xz .zst … (lib/archive.js)
/** the archive's name without its archive ending(s): Bible.usfm.tar.gz -> Bible.usfm */
const archBase = n => n.replace(/\.(tar\.(gz|bz2|xz|zst|lz)|tgz|tbz2?|txz|tzst|tlz|taz|zip|twzip|7z|rar|tar|gz|bz2|xz|zst|lzma|lz)$/i, '');
/** junk that rides along in archives made on a Mac */
const junk = n => /(^|\/)(__MACOSX|\.DS_Store)(\/|$)|(^|\/)\._[^/]*$/.test(n);

function filesAreSame(f1, f2) {
  try {
    const s1 = fs.statSync(f1), s2 = fs.statSync(f2);
    if (s1.size !== s2.size) return false;
    if (s1.ino && s2.ino && s1.ino === s2.ino && s1.dev === s2.dev) return true;
    if (s1.size === 0) return true;
    const chunk = Math.min(65536, s1.size);
    const b1 = Buffer.allocUnsafe(chunk), b2 = Buffer.allocUnsafe(chunk);
    const fd1 = fs.openSync(f1, 'r'), fd2 = fs.openSync(f2, 'r');
    try {
      fs.readSync(fd1, b1, 0, chunk, 0);
      fs.readSync(fd2, b2, 0, chunk, 0);
      if (!b1.equals(b2)) return false;
      if (s1.size > chunk) {
        const off = s1.size - chunk;
        fs.readSync(fd1, b1, 0, chunk, off);
        fs.readSync(fd2, b2, 0, chunk, off);
        if (!b1.equals(b2)) return false;
      }
      return true;
    } finally {
      fs.closeSync(fd1);
      fs.closeSync(fd2);
    }
  } catch (e) { return false; }
}

/** a SWORD package (CrossWire "Raw ZIP": mods.d/<name>.conf plus modules/...) goes into <destRoot>/SWORD/<name>/ as it is */
function importSword(allEnts, name, from, destRoot, tmp, results) {
  const confs = allEnts.filter(e => /(^|\/)mods\.d\/[^/]+\.conf$/i.test(e.name));
  for (const ce of confs) {
    const prefix = ce.name.replace(/mods\.d\/[^/]+$/i, '');
    const cname = path.basename(ce.name).replace(/\.conf$/i, '');
    const tf = path.join(tmp, cname + '.conf'); fs.writeFileSync(tf, ce.data);
    const pr = sword.probe(tf);
    const r = { name: cname, from: name === cname ? from : `${name} › ${ce.name}`, format: 'SWORD', kind: pr.kind || 'module', title: pr.title };
    if (!pr.ok) { results.push(Object.assign(r, { status: 'skipped', reason: pr.reason })); continue; }
    const dp = ((pr.conf.kv.DataPath || '').replace(/\\/g, '/').replace(/^\.\//, '')).toLowerCase();
    const mine = allEnts.filter(e => e !== ce && e.name.startsWith(prefix) && e.name.slice(prefix.length).toLowerCase().startsWith(dp) && !/\/$/.test(e.name));
    if (!mine.length) { results.push(Object.assign(r, { status: 'skipped', reason: 'the package has the .conf but not the module\'s data files' })); continue; }
    const dir = path.join(destRoot, 'SWORD', cname);
    const confDest = path.join(dir, 'mods.d', cname + '.conf');
    let status = 'imported';
    try { if (fs.existsSync(confDest)) status = fs.readFileSync(confDest).equals(ce.data) && mine.every(e => { try { return fs.statSync(path.join(dir, e.name.slice(prefix.length))).size === e.data.length; } catch (x) { return false; } }) ? 'already' : 'updated'; } catch (e) { status = 'updated'; }
    if (status !== 'already') {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(confDest), { recursive: true }); fs.writeFileSync(confDest, ce.data);
        for (const e of mine) { const out = path.join(dir, e.name.slice(prefix.length)); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, e.data); }
      } catch (err) { results.push(Object.assign(r, { status: 'skipped', reason: 'could not save: ' + err.message })); continue; }
    }
    const note = pr.conf.kv.Versification && !/^(kjva?)$/i.test(pr.conf.kv.Versification) ? 'uses the ' + pr.conf.kv.Versification + ' verse numbering' : '';
    results.push(Object.assign(r, { status, dest: confDest, note }));
  }
}

/** a SWORD package already unpacked on disk: copies data files without holding them in memory */
function importSwordFromDisk(allEnts, name, from, destRoot, results) {
  const confs = allEnts.filter(e => /(^|\/)mods\.d\/[^/]+\.conf$/i.test(e.name));
  for (const ce of confs) {
    const prefix = ce.name.replace(/mods\.d\/[^/]+$/i, '');
    const cname = path.basename(ce.name).replace(/\.conf$/i, '');
    const pr = sword.probe(ce.filePath);
    const r = { name: cname, from: name === cname ? from : `${name} › ${ce.name}`, format: 'SWORD', kind: pr.kind || 'module', title: pr.title };
    if (!pr.ok) { results.push(Object.assign(r, { status: 'skipped', reason: pr.reason })); continue; }
    const dp = ((pr.conf.kv.DataPath || '').replace(/\\/g, '/').replace(/^\.\//, '')).toLowerCase();
    const mine = allEnts.filter(e => e !== ce && e.name.startsWith(prefix) && e.name.slice(prefix.length).toLowerCase().startsWith(dp) && !/\/$/.test(e.name));
    if (!mine.length) { results.push(Object.assign(r, { status: 'skipped', reason: 'the package has the .conf but not the module\'s data files' })); continue; }
    const dir = path.join(destRoot, 'SWORD', cname);
    const confDest = path.join(dir, 'mods.d', cname + '.conf');
    let status = 'imported';
    try { if (fs.existsSync(confDest)) status = filesAreSame(confDest, ce.filePath) && mine.every(e => { try { return fs.statSync(path.join(dir, e.name.slice(prefix.length))).size === e.size; } catch (x) { return false; } }) ? 'already' : 'updated'; } catch (e) { status = 'updated'; }
    if (status !== 'already') {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(confDest), { recursive: true }); fs.copyFileSync(ce.filePath, confDest);
        for (const e of mine) { const out = path.join(dir, e.name.slice(prefix.length)); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.copyFileSync(e.filePath, out); }
      } catch (err) { results.push(Object.assign(r, { status: 'skipped', reason: 'could not save: ' + err.message })); continue; }
    }
    const note = pr.conf.kv.Versification && !/^(kjva?)$/i.test(pr.conf.kv.Versification) ? 'uses the ' + pr.conf.kv.Versification + ' verse numbering' : '';
    results.push(Object.assign(r, { status, dest: confDest, note }));
  }
}

function isZipHeader(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const b = Buffer.allocUnsafe(4);
    let n = 0;
    try { n = fs.readSync(fd, b, 0, 4, 0); } finally { fs.closeSync(fd); }
    return n === 4 && b[0] === 0x50 && b[1] === 0x4b && ((b[2] === 0x03 && b[3] === 0x04) || (b[2] === 0x05 && b[3] === 0x06));
  } catch (e) { return false; }
}

function isModuleName(n) {
  return TW_BIBLE.test(n) || TW_LOCKED.test(n) || TW_BOOK.test(n) || ES_BIBLE.test(n) || ES_BOOK.test(n) || MY_BIBLE.test(n) || MY_BOOK.test(n) || ES_OTHER.test(n) || USFM_BIBLE.test(n) || USFX_BIBLE.test(n);
}

/** what kind of module is this file, and can Timotheos open it? (does not copy) */
async function inspect(file, settings) {
  const name = path.basename(file);
  const fmt = /\.twm$|\.(ont|ot|nt)x?$/i.test(name) ? 'theWord'
    : USFM_BIBLE.test(name) || /\.usfm\.zip$/i.test(name) ? 'USFM'
    : USFX_BIBLE.test(name) || /\.usfx\.zip$/i.test(name) ? 'USFX'
    : /\.mybible$/i.test(name) ? 'MySword'
    : 'e-Sword';
  const r = { file, name, format: fmt, kind: '', title: '', ok: false, reason: '' };
  try {
    if (TW_LOCKED.test(name)) { r.kind = 'Bible'; r.reason = 'encrypted theWord Bible – it opens only in theWord'; return r; }
    if (TW_BIBLE.test(name)) { const m = theword.load(file); Object.assign(r, { kind: 'Bible', title: m.title, ok: true }); return r; }
    if (ES_BIBLE.test(name)) { const m = await esword.load(file, (settings && settings.eswordBookMap) || {}); Object.assign(r, { kind: 'Bible', title: m.title, ok: true, note: (m.warnings || []).join('; ') }); if (m.close) m.close(); return r; }
    if (MY_BIBLE.test(name)) { const m = await mysword.load(file, (settings && settings.eswordBookMap) || {}); Object.assign(r, { kind: 'Bible', title: m.title, ok: true, note: (m.warnings || []).join('; ') }); if (m.close) m.close(); return r; }
    if (/\.mybible$/i.test(name) && !MY_BOOK.test(name)) { r.kind = 'MySword notes'; r.reason = 'a plain .mybible file is MySword\'s personal notes, not a module'; return r; }
    if (USFM_BIBLE.test(name) || /\.usfm\.zip$/i.test(name)) {
      const m = usfm.loadUsfm(file);
      Object.assign(r, { format: 'USFM', kind: 'Bible', title: m.title, ok: true });
      return r;
    }
    if (/\.usfx(\.xml|\.zip)?$/i.test(name) || (/\.xml$/i.test(name) && usfm.probeXml(file))) {
      const m = usfm.loadUsfx(file);
      Object.assign(r, { format: 'USFX', kind: 'Bible', title: m.title, ok: true });
      return r;
    }
    if (/\.xrefs\.twm$/i.test(name)) { Object.assign(r, { kind: 'cross-references', title: name.replace(/\.xrefs\.twm$/i, ''), ok: true }); return r; }
    if (/\.hdgs\.twm$/i.test(name)) { Object.assign(r, { kind: 'headings overlay', title: name.replace(/\.hdgs\.twm$/i, ''), ok: true }); return r; }
    if (/\.prgs\.twm$/i.test(name)) { Object.assign(r, { kind: 'paragraphs overlay', title: name.replace(/\.prgs\.twm$/i, ''), ok: true }); return r; }
    if (/\.vsls\.twm$/i.test(name)) {
      const vl = twstudy.readVerseLists(file);
      Object.assign(r, { kind: 'verse list', title: vl.title, ok: true, studyData: { verseLists: vl.lists } });
      return r;
    }
    if (/\.rdp\.twm$/i.test(name)) {
      const rp = twstudy.readReadingPlan(file);
      Object.assign(r, { kind: 'reading plan', title: rp.name, ok: true, studyData: { readingPlan: rp } });
      return r;
    }
    if (/\.(lyts|bhls)\.twm$/i.test(name)) { r.kind = 'theWord settings/data file'; r.reason = 'layouts and highlight files from theWord are not modules Timotheos uses'; return r; }
    if (/\.gbk\.twm$/i.test(name) && await twbook.probe(file).catch(() => false)) { const m = await twbook.load(file); Object.assign(r, { kind: 'Bible text (book module)', title: m.title, ok: true }); if (m.close) m.close(); return r; }
    if (TW_BOOK.test(name) || ES_BOOK.test(name) || MY_BOOK.test(name)) {
      const m = await bookmod.open(file);
      Object.assign(r, { kind: m.kind, title: m.title || name });
      if (m.locked) r.reason = m.reason; else r.ok = true;
      m.close();
      return r;
    }
    if (ES_OTHER.test(name)) { r.kind = 'e-Sword ' + path.extname(name).slice(1); r.reason = 'old e-Sword (before version 9) format – open it once in a current e-Sword to convert it'; return r; }
    r.reason = 'not a recognized theWord, e-Sword, USFM, or USFX module';
  } catch (e) { r.reason = e.message || String(e); }
  return r;
}

/**
 * Import files into destRoot. Returns [{name, from, status: imported|updated|already|skipped, kind, format, title, reason, dest, studyData?}]
 */
async function importFiles(paths, destRoot, settings = {}, userData = null, onProgress = null, opts = {}) {
  const results = [];
  // progress for the import window: { step, done, total, name } (done of total files); a pause lets the window draw it
  const tell = async (step, done, total, name) => { if (!onProgress) return; try { onProgress({ step, done, total, name }); } catch (e) { /* no window */ } await new Promise(r => setTimeout(r, 0)); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-import-'));
  const queue = [];
  let arcSeq = 0;

  async function extractArchiveToDisk(arcPath, arcName, pw, depth = 0) {
    const arcDir = path.join(tmp, 'arc-' + (++arcSeq));
    if (!pw && isZipHeader(arcPath)) {
      let r = null;
      if (typeof fs.unzipToDirSync === 'function') r = fs.unzipToDirSync(arcPath, arcDir, archive.MAX_TOTAL);
      else if (typeof fs.createReadStream === 'function') r = await zip.extractToDir(arcPath, arcDir, archive.MAX_TOTAL);
      if (r) {
        if (r.code === 'PASSWORD') { const e = new Error('this archive needs a password'); e.code = 'PASSWORD'; throw e; }
        if (r.code === 'ERROR') throw new Error(r.error || 'could not unpack archive');
        if (r.ok) {
          const ents = [];
          let total = 0;
          for (const e of (r.entries || [])) {
            if (e.name.endsWith('/') || junk(e.name)) continue;
            total += e.size || 0;
            if (total > archive.MAX_TOTAL) throw new Error('the archive unpacks to more than ' + Math.round(archive.MAX_TOTAL / 1048576) + ' MB');
            if (depth < 2 && ARCHIVE.test(path.basename(e.name))) {
              try {
                const sub = await extractArchiveToDisk(e.path, path.basename(e.name), pw, depth + 1);
                const folder = e.name.includes('/') ? e.name.replace(/[^/]*$/, '') : '';
                for (const s of sub) ents.push({ name: folder + s.name, filePath: s.filePath, size: s.size });
                continue;
              } catch (err) { if (err.code === 'PASSWORD' || err.code === 'BADPASSWORD') throw err; }
            }
            ents.push({ name: e.name, filePath: e.path, size: e.size });
          }
          return ents;
        }
      }
    }
    const rawEnts = (await archive.unpack(fs.readFileSync(arcPath), arcName, { password: pw })).filter(e => !e.name.endsWith('/') && !junk(e.name));
    fs.mkdirSync(arcDir, { recursive: true });
    const ents = [];
    for (const e of rawEnts) {
      const parts = String(e.name || '').replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..' && !s.includes(':'));
      if (!parts.length) continue;
      const outPath = path.join(arcDir, ...parts);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, e.data);
      ents.push({ name: e.name, filePath: outPath, size: e.data.length });
    }
    return ents;
  }

  // Check if multiple loose per-book .usfm/.sfm files were chosen together; if so, bundle them into one .usfm Bible
  const looseUsfms = paths.filter(p => USFM_BIBLE.test(path.basename(p)) && fs.existsSync(p) && fs.statSync(p).isFile());
  const handledLooseUsfm = new Set();
  if (looseUsfms.length >= 2) {
    const parentName = path.basename(path.dirname(looseUsfms[0])) || 'Bundled-USFM-Bible';
    const cleanBase = (/^(usfm|sfm|modules|downloads|desktop|tmp)$/i.test(parentName) ? 'USFM-Bible' : parentName).replace(/\.usfm$/i, '');
    const outFile = path.join(tmp, cleanBase + '.usfm');
    const texts = looseUsfms.map(f => fs.readFileSync(f, 'utf8'));
    usfm.bundleUsfmTexts(texts, outFile, cleanBase.replace(/[_-]+/g, ' '));
    queue.push({ file: outFile, from: `${looseUsfms.length} USFM files` });
    for (const f of looseUsfms) handledLooseUsfm.add(f);
  }

  for (const [pi, p] of paths.entries()) {
    if (handledLooseUsfm.has(p)) continue;
    const name = path.basename(p);
    if (ARCHIVE.test(name)) await tell('unpack', pi, paths.length, name);
    if (/\.exe$/i.test(name)) { results.push({ name, from: p, status: 'skipped', reason: 'installer program – Timotheos does not run installers. Unpack the module file from it (or install it in e-Sword/theWord) and import the module file itself.' }); continue; }
    if (ARCHIVE.test(name)) {
      try {
        const pw = (opts.passwords || {})[p];
        const allEnts = await extractArchiveToDisk(p, name, pw, 0);
        if (allEnts.some(e => /(^|\/)mods\.d\/[^/]+\.conf$/i.test(e.name))) { importSwordFromDisk(allEnts, name, p, destRoot, results); continue; }
        const usfmEnts = allEnts.filter(e => USFM_BIBLE.test(path.basename(e.name)));
        if (usfmEnts.length >= 1) {
          // Bundle all USFM book files inside the archive into a single <archiveBase>.usfm Bible
          const baseTitle = archBase(name).replace(/[_-]?usfm$/i, '');
          const outFile = path.join(tmp, baseTitle + '.usfm');
          const texts = usfmEnts.map(e => fs.readFileSync(e.filePath, 'utf8'));
          usfm.bundleUsfmTexts(texts, outFile, baseTitle.replace(/[_-]+/g, ' '));
          queue.push({ file: outFile, from: `${name} (${usfmEnts.length} USFM file${usfmEnts.length > 1 ? 's' : ''})` });
        }
        const otherEnts = allEnts.filter(e => !USFM_BIBLE.test(path.basename(e.name)) && isModuleName(path.basename(e.name)));
        if (!usfmEnts.length && !otherEnts.length) {
          results.push({ name, from: p, status: 'skipped', reason: 'the archive contains no theWord, e-Sword, MySword, USFM, or USFX module' });
          continue;
        }
        for (const e of otherEnts) {
          let base = path.basename(e.name);
          if (/\.xml$/i.test(base) && !/\.usfx$/i.test(base)) base = archBase(name).replace(/[_-]?usfx$/i, '') + '.usfx';
          const modDir = path.join(tmp, 'mod-' + (++arcSeq));
          const out = path.join(modDir, base);
          try {
            fs.mkdirSync(modDir, { recursive: true });
            try { fs.renameSync(e.filePath, out); } catch (_) { fs.copyFileSync(e.filePath, out); }
            const oe = allEnts.find(x => path.basename(x.name) === base + '.order');   // the arrangement made in iBiblia
            if (oe) fs.copyFileSync(oe.filePath, out + '.order');
            queue.push({ file: out, from: `${name} › ${e.name}` });
          }
          catch (err) { results.push({ name: path.basename(e.name), from: name, status: 'skipped', reason: 'could not unpack: ' + err.message }); }
        }
      } catch (err) {
        // a protected archive waits for its password (the window asks for it and imports again)
        if (err.code === 'PASSWORD' || err.code === 'BADPASSWORD') results.push({ name, from: p, status: 'password', wrong: err.code === 'BADPASSWORD', reason: err.code === 'BADPASSWORD' ? 'the password is wrong' : 'the archive is protected by a password' });
        else results.push({ name, from: p, status: 'skipped', reason: 'could not read archive: ' + err.message });
      }
      continue;
    }
    if (DOC_RE.test(name) && !isModuleName(name)) {
      // a word-processor or text document: the window asks what it should become, then imports it again with opts.docs[path] = {as, title}
      const ch = (opts.docs || {})[p];
      if (!ch || !ch.as) { results.push({ name, from: p, status: 'choose', kind: 'document', title: docimport.cleanName(p) }); continue; }
      await tell('check', pi, paths.length, name);
      try {
        const title = String(ch.title || '').replace(/[\\/:*?"<>|]+/g, ' ').trim() || docimport.cleanName(p);
        const free = (sub, ext) => { let t = title, n = 2; while (fs.existsSync(path.join(destRoot, sub, t + ext))) t = `${title} (${n++})`; return t; };
        const pics = r => r.pics ? `${r.pics} picture${r.pics === 1 ? '' : 's'} kept` : '';
        const lost = r => r.skippedPics ? `${r.skippedPics} picture${r.skippedPics === 1 ? '' : 's'} left out (format a browser cannot show)` : '';
        if (ch.as === 'notes') {
          const r = await docimport.addNotes(p, userData || { get: () => ({ notes: {} }), set() {} });
          if (r.error) results.push({ name, from: p, status: 'skipped', kind: 'document', reason: r.error });
          else results.push({ name, from: p, status: 'imported', kind: 'My Study notes', format: 'notes', title: `${r.count} verse note${r.count === 1 ? '' : 's'}`, studyData: { notes: r.count },
            note: [r.merged ? `${r.merged} added to notes you already had` : '', r.skipped ? `${r.skipped} paragraph${r.skipped === 1 ? '' : 's'} before the first reference left out` : ''].filter(Boolean).join('; ') });
        } else if (ch.as === 'bible') {
          const t = free('USFM', '.usfm');
          const r = await docimport.buildBible(p, tmp, t);
          if (r.error) results.push({ name, from: p, status: 'skipped', kind: 'document', reason: r.error });
          else queue.push({ file: r.file, from: p, note: `${r.books} book${r.books === 1 ? '' : 's'}, ${r.chapters} chapters, ${r.verses} verses read from the document` });
        } else {
          const t = free('theWord', '.gbk.twm');
          const r = await docimport.buildBook(p, tmp, t);
          queue.push({ file: r.file, from: p, note: [`${r.sections} section${r.sections === 1 ? '' : 's'}${r.headings ? ' (by headings)' : ' (no headings found, so one section)'}`, pics(r), lost(r)].filter(Boolean).join('; ') });
        }
      } catch (err) { results.push({ name, from: p, status: 'skipped', kind: 'document', reason: 'could not read the document: ' + err.message }); }
      continue;
    }
    if (/\.order$/i.test(name)) {
      // an arrangement made in iBiblia: it belongs next to its module
      const modName = name.replace(/\.order$/i, '');
      if (paths.some(q => path.basename(q) === modName)) continue;   // chosen together with its module: it goes along with that
      const home = ['theWord', 'e-Sword', 'MySword', 'USFM', 'USFX'].map(f => path.join(destRoot, f, modName)).find(f => fs.existsSync(f) || fs.existsSync(f + '.timotheos-link'));
      if (!home) results.push({ name, from: p, status: 'skipped', kind: 'arrangement', reason: `import ${modName} first (or together with this file): the arrangement belongs to that module` });
      else { try { fs.copyFileSync(p, home + '.order'); results.push({ name, from: p, status: 'imported', kind: 'arrangement of books, chapters and verses', title: modName, dest: home + '.order' }); } catch (err) { results.push({ name, from: p, status: 'skipped', kind: 'arrangement', reason: err.message }); } }
      continue;
    }
    if (/\.mybible$/i.test(name) && !MY_BIBLE.test(name) && !MY_BOOK.test(name)) {
      // a MySword file whose name does not say what it is: look inside, and keep a copy under the name MySword itself would give it
      const k = mysword.probe(p);
      const suf = { bible: '.bbl', commentary: '.cmt', dictionary: '.dct', book: '.bok' }[k];
      if (suf) {
        const typed = path.join(tmp, name.replace(/\.mybible$/i, '') + suf + '.mybible');
        fs.copyFileSync(p, typed);
        queue.push({ file: typed, from: p, note: `the file name did not say what it is; read as a ${k === 'book' ? 'book' : k}` });
        continue;
      }
    }
    queue.push({ file: p, from: p });
  }
  for (const [qi, q] of queue.entries()) {
    await tell('check', qi, queue.length, path.basename(q.file));
    const info = await inspect(q.file, settings);
    const r = { name: info.name, from: q.from, kind: info.kind, format: info.format, title: info.title, note: [q.note, info.note].filter(Boolean).join('; ') || undefined };
    if (!info.ok) { results.push(Object.assign(r, { status: 'skipped', reason: info.reason })); continue; }
    if (info.studyData && userData) {
      const ud = userData.get();
      if (info.studyData.verseLists) {
        const lists = Object.assign({}, ud.lists);
        for (const [ln, vs] of Object.entries(info.studyData.verseLists)) lists[ln] = vs;
        userData.set('lists', lists);
      }
      if (info.studyData.readingPlan) {
        const plans = [...(ud.plans || []), info.studyData.readingPlan];
        userData.set('plans', plans);
      }
    }
    const dir = path.join(destRoot, info.format);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, info.name);
    const linkDest = dest + '.timotheos-link';
    let status = 'imported';
    if (fs.existsSync(dest)) {
      const same = filesAreSame(dest, q.file);
      status = same ? 'already' : 'updated';
    } else if (fs.existsSync(linkDest)) {
      try {
        const prevTarget = fs.readFileSync(linkDest, 'utf8').trim();
        const same = fs.existsSync(prevTarget) && filesAreSame(prevTarget, q.file);
        status = same ? 'already' : 'updated';
      } catch (_) { status = 'updated'; }
    }
    if (path.resolve(dest) !== path.resolve(q.file) && status !== 'already') {
      const absQ = path.resolve(q.file);
      const absTmp = path.resolve(tmp);
      const absOsTmp = path.resolve(os.tmpdir());
      const inOwnTmp = absQ.startsWith(absTmp + path.sep);
      const isTempSource = inOwnTmp || absQ.startsWith(absOsTmp + path.sep) || process.platform === 'android';
      const srcSize = fs.statSync(q.file).size;
      let linked = false;
      if (!isTempSource && srcSize >= 32 * 1024 * 1024) {
        try {
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          fs.writeFileSync(linkDest, absQ, 'utf8');
          linked = true;
        } catch (_) { linked = false; }
      }
      if (!linked) {
        if (fs.existsSync(linkDest)) { try { fs.unlinkSync(linkDest); } catch (_) {} }
        await tell('copy', qi, queue.length, info.name);
        let moved = false;
        if (inOwnTmp) {
          try {
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(q.file, dest);
            moved = true;
          } catch (_) { moved = false; }
        }
        if (!moved) await fs.promises.copyFile(q.file, dest);
      }
    }
    // the arrangement made in iBiblia travels with the module (and a stale one is removed when the module is replaced by one without)
    try {
      const src = q.file + '.order', dst = dest + '.order';
      if (fs.existsSync(src)) { if (path.resolve(src) !== path.resolve(dst) && !(fs.existsSync(dst) && fs.readFileSync(src).equals(fs.readFileSync(dst)))) { fs.copyFileSync(src, dst); r.note = [r.note, 'arrangement of books, chapters and verses kept'].filter(Boolean).join('; '); } }
      else if (status === 'updated' && fs.existsSync(dst)) fs.unlinkSync(dst);
    } catch (e) { /* the module itself is imported; the arrangement is an extra */ }
    results.push(Object.assign(r, { status, dest, studyData: info.studyData }));
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp */ }
  await tell('copied', queue.length, queue.length, '');
  return results;
}

module.exports = { importFiles, inspect, isModuleName };
