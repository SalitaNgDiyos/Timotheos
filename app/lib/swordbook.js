/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// SWORD commentaries (zCom, zCom4, RawCom, RawCom4), dictionaries and lexicons (zLD, RawLD, RawLD4) and
// general books (RawGenBook), shown the way Timotheos shows its other book modules (see bookmod.js).
const fs = require('fs');
const path = require('path');
const sword = require('./sword');
const canon = require('./canon');

const cap = s => String(s || '');
function strip(html) { return require('./bookmod').plain(html); }

/** open a SWORD module that is not a Bible; the module object is what bookmod.open() returns for other formats */
async function open(confFile) {
  const pr = sword.probe(confFile);
  const base = path.basename(confFile);
  const stub = { id: 'bm:' + base, file: confFile, name: base, kind: pr.kind || 'book', format: 'SWORD', title: pr.title || base, abbr: pr.name || base.replace(/\.conf$/i, '') };
  if (pr.locked || !pr.ok || pr.kind === 'Bible') return locked(stub, pr.locked || !pr.ok ? pr.reason : 'this is a Bible, not a book module');
  try {
    if (pr.kind === 'commentary') return await openCommentary(confFile, pr, stub);
    if (pr.kind === 'dictionary') return await openDictionary(confFile, pr, stub);
    return await openGenBook(confFile, pr, stub);
  } catch (e) { return locked(stub, e.message || String(e)); }
}
function locked(stub, reason) {
  return Object.assign(stub, { locked: true, reason, topics: () => [], topic: () => null, forVerse: () => null, verseMarks: () => new Set(), lookup: () => null, findWord: () => [], today: () => [], searchTopics: () => [], texts: function* () {}, close() {} });
}
function describe(stub, pr) {
  const kv = pr.conf.kv;
  const lang = (kv.Lang || '').split('-')[0];
  return Object.assign(stub, {
    title: kv.Description || pr.name, abbr: pr.name,
    about: [sword.rtfText(kv.About), kv.Copyright, kv.DistributionLicense && ('Licence: ' + kv.DistributionLicense)].filter(Boolean).join('\n\n').replace(/\n/g, '<br>'),
    cfg: kv, rtl: /^(heb|ara|arc|fas|urd|syr|he|ar|fa|ur)$/i.test(lang),
    isStrong: false, greek: false, hebrew: false, isMorph: false, hasVerseSync: stub.kind === 'commentary', locked: false,
  });
}
/** the functions the viewer asks of every book module, for a list of topics {id, pid, subject} */
function listApi(mod, items, html, extra = {}) {
  const byId = new Map(items.map(i => [i.id, i]));
  const byKey = new Map(); for (const it of items) { const k = it.subject.toLowerCase(); if (!byKey.has(k)) byKey.set(k, it); }
  const topic = id => { const it = byId.get(id); if (!it) return null; let h = ''; try { h = html(it); } catch (e) { h = ''; } return { id, subject: it.subject, html: h }; };
  return Object.assign(mod, {
    topics: () => items.map(({ id, pid, subject }) => ({ id, pid: pid || 0, subject })), topic,
    forVerse: () => null, verseMarks: () => new Set(), today: () => [],
    lookup: key => { const it = byKey.get(String(key).toLowerCase()); return it ? topic(it.id) : null; },
    findWord(w, fuzzy) {
      if (!w) return []; const it = byKey.get(w.toLowerCase()); if (it) return [{ id: it.id, subject: it.subject, exact: true }];
      if (!fuzzy) return []; const bm = require('./bookmod'); const stem = bm.stemOf(w);
      return items.filter(i => bm.stemOf(i.subject.split(/[\s,(]/)[0]) === stem).slice(0, 8).map(i => ({ id: i.id, subject: i.subject, exact: false }));
    },
    searchTopics(q, limit = 300) { const l = q.toLowerCase(); return items.filter(i => i.subject.toLowerCase().includes(l)).sort((a, b) => b.subject.toLowerCase().startsWith(l) - a.subject.toLowerCase().startsWith(l)).slice(0, limit).map(({ id, pid, subject }) => ({ id, pid: pid || 0, subject })); },
    *texts() { for (const it of items) { let t = ''; try { t = strip(html(it)); } catch (e) { /* unreadable */ } yield { id: it.id, subject: it.subject, text: t }; } },
    close() { if (mod._close) mod._close(); },
  }, extra);
}

// ---------------------------------------------------------------- commentaries
async function openCommentary(confFile, pr, stub) {
  const core = await sword.loadCore(confFile);
  const mod = describe(stub, pr);
  const items = [];
  const refLabel = require('./bookmod').refLabel;
  const add = (ref, t, idx) => items.push({ id: 'c' + items.length, pid: 0, subject: refLabel(ref.b, ref.c, ref.f, ref.c2, ref.e), ref, t, idx });
  for (const b of Object.keys(core.books).map(Number).sort((x, y) => canon.orderKey(x) - canon.orderKey(y))) {
    const w = core.where.get(b), counts = w.counts;
    if (core.recKey(w.t, w.start)) add({ b, c: 0, f: 0, c2: 0, e: 0 }, w.t, w.start);          // the introduction to the book
    let before = 0;
    for (let c = 1; c <= counts.length; c++) {
      const head = w.start + c + before;
      if (core.recKey(w.t, head)) add({ b, c, f: 0, c2: c, e: 0 }, w.t, head);                 // the introduction to the chapter
      let run = null;
      for (let v = 1; v <= counts[c - 1] + 1; v++) {
        const k = v <= counts[c - 1] ? core.recKey(w.t, head + v) : null;
        if (run && k === run.k) { run.e = v; continue; }
        if (run) add({ b, c, f: run.f, c2: c, e: run.e }, w.t, head + run.f);
        run = k ? { k, f: v, e: v } : null;
      }
      before += counts[c - 1];
    }
  }
  const html = it => {
    const raw = core.getRaw(it.t, it.idx); if (!raw) return '';
    return sword.toHtml(raw.replace(/\r?\n/g, ' ').trim(), core.srcType, {}).html;
  };
  listApi(mod, items, html);
  mod.hasVerseSync = true;
  const filled = new Map();
  const hasText = it => { if (!filled.has(it.id)) { let t = ''; try { t = strip(html(it)).trim(); } catch (e) { /* unreadable */ } filled.set(it.id, t.length > 0); } return filled.get(it.id); };
  mod.forVerse = (b, c, v) => {
    const cand = [];
    for (const it of items) {
      const r = it.ref; if (r.b !== b) continue;
      let lv;
      if (r.c === 0) lv = 3;
      else if (r.f === 0) { if (r.c !== c) continue; lv = 2; }
      else { if (r.c !== c || v < r.f || v > r.e) continue; lv = r.f === v && r.e === v ? 0 : 1; }
      cand.push({ it, lv, sp: r.e - r.f });
    }
    cand.sort((x, y) => x.lv - y.lv || x.sp - y.sp);
    // an introduction that holds only markup (no words) is not shown
    const hit = cand.find(x => x.lv < 2 || hasText(x.it));
    return hit ? { id: hit.it.id, subject: hit.it.subject, level: ['verse', 'passage', 'chapter', 'book'][hit.lv] } : null;
  };
  mod.verseMarks = (b, c) => { const s = new Set(); for (const it of items) { const r = it.ref; if (r.b === b && r.c === c && r.f > 0) for (let v = r.f; v <= Math.min(r.e, 200); v++) s.add(v); } return s; };
  mod._close = () => core.files.forEach(f => f.close());
  if (core.warnings.length) mod.warnings = core.warnings;
  return mod;
}

// ---------------------------------------------------------------- dictionaries
function openDictionary(confFile, pr, stub) {
  const kv = pr.conf.kv, driver = pr.driver.toLowerCase();
  const root = path.dirname(path.dirname(confFile));
  const full = path.join(root, (kv.DataPath || '').replace(/\\/g, '/').replace(/^\.\//, ''));
  const dir = path.dirname(full), pre = path.basename(full);
  const get = ext => { const f = sword.findFile(dir, pre + '.' + ext); if (!f) return null; return fs.readFileSync(f); };
  const idx = get('idx'), dat = get('dat');
  if (!idx || !dat) throw new Error('the dictionary files are missing (looked for ' + pre + '.idx and .dat in ' + dir + ')');
  const zipped = driver === 'zld';
  const rs = zipped ? 8 : /4$/.test(driver) ? 8 : 6, n = Math.floor(idx.length / rs);
  const recs = []; // {key, p: raw text or block position}
  for (let i = 0; i < n; i++) {
    const o = idx.readUInt32LE(i * rs), sz = rs === 6 ? idx.readUInt16LE(i * rs + 4) : idx.readUInt32LE(i * rs + 4);
    if (o + sz > dat.length) continue;
    const e = dat.subarray(o, o + sz);
    const nl = e.indexOf(10); if (nl < 0) continue;
    const key = sword.decodeText(e.subarray(0, nl), 'utf8').replace(/\r$/, '').trim();
    recs.push(zipped ? { key, block: sz - nl - 1 >= 8 ? e.readUInt32LE(e.length - 8) : 0, entry: e.readUInt32LE(e.length - 4) } : { key, text: e.subarray(nl + 1) });
  }
  const compress = (kv.CompressType || 'ZIP').toUpperCase();
  const enc = /latin|8859-1|cp1252|windows-1252/i.test(kv.Encoding || '') ? 'latin1' : 'utf8';
  const feat = (pr.conf.all.Feature || []).join(' ');
  const strongsOf = /GreekDef/i.test(feat) ? 'G' : /HebrewDef/i.test(feat) ? 'H' : '';
  const zdx = zipped ? get('zdx') : null, zdt = zipped ? get('zdt') : null;
  if (zipped && (!zdx || !zdt)) throw new Error('the dictionary files are missing (.zdx / .zdt)');
  const blocks = new Map();
  const inflate = buf => { try { return require('zlib').inflateSync(buf); } catch (e) { return null; } };
  const block = n => {
    if (blocks.has(n)) return blocks.get(n);
    if (compress !== 'ZIP' || n * 8 + 8 > zdx.length) return null;
    const off = zdx.readUInt32LE(n * 8), sz = zdx.readUInt32LE(n * 8 + 4);
    const b = inflate(zdt.subarray(off, off + sz)); if (b) blocks.set(n, b); return b;
  };
  const textOf = r => {
    let buf;
    if (!zipped) buf = r.text;
    else {
      const b = block(r.block); if (!b || (r.entry * 8 + 12) > b.length) return '';
      const cnt = b.readUInt32LE(0); if (r.entry >= cnt) return '';
      const o = b.readUInt32LE(4 + r.entry * 8), sz = b.readUInt32LE(8 + r.entry * 8);
      buf = b.subarray(o, o + sz);
    }
    return sword.decodeText(buf, enc).replace(/[\0\r\n]+$/, '');
  };
  const items = recs.map((r, i) => ({ id: 'd' + i, pid: 0, subject: strongsOf && /^\d+$/.test(r.key) ? strongsOf + parseInt(r.key, 10) : r.key, rec: r, key: r.key }));
  const byKeyUp = new Map(); for (const it of items) byKeyUp.set(it.key.toUpperCase(), it);
  const mod = describe(stub, pr);
  if (strongsOf) { mod.isStrong = true; mod[strongsOf === 'G' ? 'greek' : 'hebrew'] = true; }
  const refTarget = (tg, inner) => {
    const m = /^([^:]+):(.*)$/.exec(tg); if (!m) return null;
    let modName = m[1], key = m[2].trim();
    const letter = /^([GH])0*\d+$/i.exec(inner.replace(/<[^>]*>/g, '').trim());
    if (/strongs/i.test(modName) || letter) {
      const L = letter ? letter[1].toUpperCase() : /hebrew/i.test(modName) ? 'H' : 'G';
      if (letter) modName = L === 'H' ? 'StrongsHebrew' : 'StrongsGreek';
      key = L + parseInt(inner.replace(/<[^>]*>/g, '').replace(/^[GH]/i, '') || key, 10);
    }
    return `<a class="link" data-href="tw://dct.${encodeURIComponent(modName)}?t=${encodeURIComponent(key)}">${inner}</a>`;
  };
  const html = it => {
    let t = textOf(it.rec), hops = 0, m;
    while ((m = /^@LINK\s+(.+)$/.exec(t.trim())) && hops++ < 5) { const to = byKeyUp.get(m[1].trim().toUpperCase()); if (!to) break; t = textOf(to.rec); }
    return sword.toHtml(t, kv.SourceType || 'Plain', { refTarget }).html;
  };
  listApi(mod, items, html);
  mod._raw = () => items.map(it => [it.key, textOf(it.rec)]);   // for the tests: the entries as they are stored
  const base = mod.lookup;
  mod.lookup = key => {
    let k = String(key).trim();
    if (strongsOf) { const m = /^([GH])?0*(\d+)[a-z]?$/i.exec(k); if (m && (!m[1] || m[1].toUpperCase() === strongsOf)) k = strongsOf + parseInt(m[2], 10); else if (m) return null; }
    return base(k);
  };
  mod.prepare = async () => {
    if (!zipped || compress === 'ZIP') return;
    for (let i = 0; i * 8 + 8 <= zdx.length; i++) {
      try { const d = await sword.unpackBlock(zdt.subarray(zdx.readUInt32LE(i * 8), zdx.readUInt32LE(i * 8) + zdx.readUInt32LE(i * 8 + 4)), compress); if (d) blocks.set(i, d); } catch (e) { /* block stays unreadable */ }
    }
  };
  return mod.prepare().then(() => mod);
}

// ---------------------------------------------------------------- general books
function openGenBook(confFile, pr, stub) {
  const kv = pr.conf.kv;
  const root = path.dirname(path.dirname(confFile));
  const full = path.join(root, (kv.DataPath || '').replace(/\\/g, '/').replace(/^\.\//, ''));
  const dir = path.dirname(full), pre = path.basename(full);
  const fidx = sword.findFile(dir, pre + '.idx'), fdat = sword.findFile(dir, pre + '.dat'), fbdt = sword.findFile(dir, pre + '.bdt');
  if (!fidx || !fdat || !fbdt) throw new Error('the book files are missing (looked for ' + pre + '.idx, .dat and .bdt in ' + dir + ')');
  const idx = fs.readFileSync(fidx), dat = fs.readFileSync(fdat), bdt = new sword.RandomFile(fbdt);
  const enc = /latin|8859-1|cp1252|windows-1252/i.test(kv.Encoding || '') ? 'latin1' : 'utf8';
  const node = i => { // i: node number (its place in the .idx)
    if (i < 0 || i * 4 + 4 > idx.length) return null;
    const o = idx.readUInt32LE(i * 4); if (o + 14 > dat.length) return null;
    const parent = dat.readInt32LE(o), next = dat.readInt32LE(o + 4), child = dat.readInt32LE(o + 8);
    let e = o + 12; while (e < dat.length && dat[e] !== 0) e++;
    const name = sword.decodeText(dat.subarray(o + 12, e), enc);
    const ds = dat.readUInt16LE(e + 1); let off = 0, len = 0;
    if (ds >= 8) { off = dat.readUInt32LE(e + 3); len = dat.readUInt32LE(e + 7); }
    return { parent: parent < 0 ? -1 : parent / 4, next: next < 0 ? -1 : next / 4, child: child < 0 ? -1 : child / 4, name, off, len };
  };
  const items = []; const seen = new Set();
  const walk = (first, pid) => {
    for (let i = first, guard = 0; i >= 0 && guard < 100000; guard++) {
      if (seen.has(i)) break; seen.add(i);
      const nd = node(i); if (!nd) break;
      const it = { id: 'g' + i, pid, subject: nd.name.trim() || ('Section ' + i), nd };
      items.push(it);
      if (nd.child >= 0) walk(nd.child, it.id);
      i = nd.next;
    }
  };
  const rootNode = node(0); if (rootNode && rootNode.child >= 0) walk(rootNode.child, 0);
  if (!items.length) throw new Error('the book has no sections');
  const mod = describe(stub, pr);
  const html = it => {
    if (!it.nd.len) return '';
    const b = bdt.read(it.nd.off, it.nd.len); if (!b) return '';
    return sword.toHtml(sword.decodeText(b, enc).replace(/[\0\r\n]+$/, ''), kv.SourceType || 'Plain', {}).html;
  };
  listApi(mod, items, html);
  mod._close = () => bdt.close();
  return mod;
}

module.exports = { open };
