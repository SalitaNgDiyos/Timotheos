'use strict';
// "Import modules…": checks each chosen file, copies usable modules into Timotheos's own module
// folder (<userData>/modules/theWord, /e-Sword, /USFM, or /USFX) and reports what happened to every file.
// Archives (.zip, .twzip) are unpacked; multi-file USFM archives (e.g. eBible.org *_usfm.zip) are
// bundled into a single consolidated .usfm Bible module. Verse lists (.vsls.twm) and reading plans
// (.rdp.twm) can also be imported into user study data. Encrypted modules and installer programs are refused.
const fs = require('fs');
const path = require('path');
const os = require('os');
const zip = require('./zip');
const theword = require('./theword');
const esword = require('./esword');
const twbook = require('./twbook');
const bookmod = require('./bookmod');
const twstudy = require('./twstudy');
const usfm = require('./usfm');

const TW_BIBLE = /\.(ont|ot|nt)$/i;
const TW_LOCKED = /\.(ontx|otx|ntx)$/i;
const TW_BOOK = /\.twm$/i;
const ES_BIBLE = /\.(bblx|bbli)$/i;
const ES_BOOK = /\.(cmtx|cmti|dctx|dcti|topx|topi|refx|refi|devx|devi|lexx|lexi|mapx|mapi|harx|hari|notx|jnlx)$/i;
const ES_OTHER = /\.(bbl|cmt|dct|top|dev|map|lex|har)$/i; // pre-version-9 e-Sword types
const USFM_BIBLE = /\.(usfm|sfm|ptx)$/i;
const USFX_BIBLE = /\.(usfx|usfx\.xml|xml)$/i;
const ARCHIVE = /\.(zip|twzip)$/i;

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

function isModuleName(n) {
  return TW_BIBLE.test(n) || TW_LOCKED.test(n) || TW_BOOK.test(n) || ES_BIBLE.test(n) || ES_BOOK.test(n) || ES_OTHER.test(n) || USFM_BIBLE.test(n) || USFX_BIBLE.test(n);
}

/** what kind of module is this file, and can Timotheos open it? (does not copy) */
async function inspect(file, settings) {
  const name = path.basename(file);
  const fmt = /\.twm$|\.(ont|ot|nt)x?$/i.test(name) ? 'theWord'
    : USFM_BIBLE.test(name) || /\.usfm\.zip$/i.test(name) ? 'USFM'
    : USFX_BIBLE.test(name) || /\.usfx\.zip$/i.test(name) ? 'USFX'
    : 'e-Sword';
  const r = { file, name, format: fmt, kind: '', title: '', ok: false, reason: '' };
  try {
    if (TW_LOCKED.test(name)) { r.kind = 'Bible'; r.reason = 'encrypted theWord Bible – it opens only in theWord'; return r; }
    if (TW_BIBLE.test(name)) { const m = theword.load(file); Object.assign(r, { kind: 'Bible', title: m.title, ok: true }); return r; }
    if (ES_BIBLE.test(name)) { const m = await esword.load(file, (settings && settings.eswordBookMap) || {}); Object.assign(r, { kind: 'Bible', title: m.title, ok: true, note: (m.warnings || []).join('; ') }); if (m.close) m.close(); return r; }
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
    if (TW_BOOK.test(name) || ES_BOOK.test(name)) {
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
async function importFiles(paths, destRoot, settings = {}, userData = null) {
  const results = [];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-import-'));
  const queue = [];

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

  for (const p of paths) {
    if (handledLooseUsfm.has(p)) continue;
    const name = path.basename(p);
    if (/\.exe$/i.test(name)) { results.push({ name, from: p, status: 'skipped', reason: 'installer program – Timotheos does not run installers. Unpack the module file from it (or install it in e-Sword/theWord) and import the module file itself.' }); continue; }
    if (ARCHIVE.test(name)) {
      try {
        const buf = fs.readFileSync(p);
        const allEnts = zip.entries(buf).filter(e => !e.name.endsWith('/'));
        const usfmEnts = allEnts.filter(e => USFM_BIBLE.test(path.basename(e.name)));
        if (usfmEnts.length >= 1) {
          // Bundle all USFM book files inside the archive into a single <archiveBase>.usfm Bible
          const baseTitle = name.replace(/[_-]?usfm\.(zip|twzip)$/i, '').replace(/\.(zip|twzip)$/i, '');
          const outFile = path.join(tmp, baseTitle + '.usfm');
          const texts = usfmEnts.map(e => zip.extract(buf, e).toString('utf8'));
          usfm.bundleUsfmTexts(texts, outFile, baseTitle.replace(/[_-]+/g, ' '));
          queue.push({ file: outFile, from: `${name} (${usfmEnts.length} USFM file${usfmEnts.length > 1 ? 's' : ''})` });
        }
        const otherEnts = allEnts.filter(e => !USFM_BIBLE.test(path.basename(e.name)) && isModuleName(path.basename(e.name)));
        if (!usfmEnts.length && !otherEnts.length) {
          results.push({ name, from: p, status: 'skipped', reason: 'the archive contains no theWord, e-Sword, USFM, or USFX module' });
          continue;
        }
        for (const e of otherEnts) {
          let base = path.basename(e.name);
          if (/\.xml$/i.test(base) && !/\.usfx$/i.test(base)) {
            const zBase = name.replace(/[_-]?usfx\.(zip|twzip)$/i, '').replace(/\.(zip|twzip)$/i, '');
            base = zBase + '.usfx';
          }
          const out = path.join(tmp, base);
          try { fs.writeFileSync(out, zip.extract(buf, e)); queue.push({ file: out, from: `${name} › ${e.name}` }); }
          catch (err) { results.push({ name: path.basename(e.name), from: name, status: 'skipped', reason: 'could not unpack: ' + err.message }); }
        }
      } catch (err) { results.push({ name, from: p, status: 'skipped', reason: 'could not read archive: ' + err.message }); }
      continue;
    }
    queue.push({ file: p, from: p });
  }
  for (const q of queue) {
    const info = await inspect(q.file, settings);
    const r = { name: info.name, from: q.from, kind: info.kind, format: info.format, title: info.title, note: info.note };
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
      const isTempSource = path.resolve(q.file).startsWith(path.resolve(tmp));
      const srcSize = fs.statSync(q.file).size;
      let linked = false;
      if (!isTempSource && srcSize >= 32 * 1024 * 1024) {
        try {
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          fs.writeFileSync(linkDest, path.resolve(q.file), 'utf8');
          linked = true;
        } catch (_) { linked = false; }
      }
      if (!linked) {
        if (fs.existsSync(linkDest)) { try { fs.unlinkSync(linkDest); } catch (_) {} }
        await fs.promises.copyFile(q.file, dest);
      }
    }
    results.push(Object.assign(r, { status, dest, studyData: info.studyData }));
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp */ }
  return results;
}

module.exports = { importFiles, inspect, isModuleName };
