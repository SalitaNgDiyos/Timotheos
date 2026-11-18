/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// SWORD Project modules (CrossWire): Bibles in the zText, zText4, RawText and RawText4 drivers.
// A module is a folder with mods.d/<name>.conf and the data files its DataPath names.
// Verse text is turned from OSIS, ThML, GBF or plain text into Timotheos's own verse HTML
// (Strong's numbers, morphology, notes, words of Jesus). Locked (CipherKey) modules are refused.
// The verse counts of the SWORD numbering systems (sword_canons.json) come from PySword (MIT).
const fs = require('fs');
const path = require('path');
const canon = require('./canon');
const { renderTaggedWord, normStrong, escT, escA } = require('./usfm');
const CANONS = require('./sword_canons.json');

const BIBLE_DRIVERS = /^(ztext4?|rawtext4?)$/i;
const OTHER_DRIVERS = { zcom: 'commentary', zcom4: 'commentary', rawcom: 'commentary', rawcom4: 'commentary', zld: 'dictionary', rawld: 'dictionary', rawld4: 'dictionary', rawgenbook: 'book' };
const VERSE_DRIVERS = /^(ztext4?|rawtext4?|zcom4?|rawcom4?)$/i;

// ---- OSIS book ids -> Timotheos book numbers -----------------------------------------
const OSIS66 = ['Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam', '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov', 'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos', 'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal',
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev'];
const OSIS_ID = new Map(OSIS66.map((o, i) => [o.toLowerCase(), i + 1]));
Object.entries({ Tob: 67, Jdt: 68, AddEsth: 69, EsthGr: 69, Wis: 70, Sir: 71, Bar: 72, EpJer: 73, PrAzar: 74, Sus: 75, Bel: 76, '1Macc': 77, '2Macc': 78, '1Esd': 79, PrMan: 80, AddPs: 81, '3Macc': 82, '2Esd': 83, '4Macc': 84, Odes: 85, PssSol: 86, EpLao: 87 })
  .forEach(([k, v]) => OSIS_ID.set(k.toLowerCase(), v));
const CANON_KEYS = Object.keys(CANONS);
const KJV_LIKE = new Set(['kjv', 'kjva']);

// ---- conf files ----------------------------------------------------------------------
function parseConf(text) {
  const out = { name: '', kv: {}, all: {} };
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let ln = lines[i];
    if (!out.name) { const h = /^\s*\[([^\]]+)\]/.exec(ln); if (h) out.name = h[1].trim(); continue; }
    if (/^\s*(#|;|$)/.test(ln)) continue;
    while (/\\\s*$/.test(ln) && i + 1 < lines.length) ln = ln.replace(/\\\s*$/, '\n') + lines[++i];
    const m = /^\s*([A-Za-z0-9_.\-]+)\s*=\s*([\s\S]*)$/.exec(ln);
    if (!m) continue;
    const k = m[1], v = m[2].replace(/\s+$/, '');
    (out.all[k] = out.all[k] || []).push(v);
    if (!(k in out.kv)) out.kv[k] = v;
  }
  return out;
}
const rtfText = s => String(s || '').replace(/\\par\b ?/g, '\n').replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(n < 0 ? +n + 65536 : +n))
  .replace(/\\[a-zA-Z]+-?\d* ?/g, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim();

/** what does this conf describe, and can Timotheos open it? (reads only the .conf) */
function probe(confFile) {
  const r = { file: confFile, name: '', driver: '', kind: '', title: '', ok: false, locked: false, reason: '' };
  let c;
  try { c = parseConf(fs.readFileSync(confFile, 'utf8')); } catch (e) { r.reason = 'could not read ' + path.basename(confFile); return r; }
  r.name = c.name || path.basename(confFile).replace(/\.conf$/i, '');
  r.title = c.kv.Description || r.name;
  r.driver = (c.kv.ModDrv || '').trim();
  const d = r.driver.toLowerCase();
  r.kind = BIBLE_DRIVERS.test(d) ? 'Bible' : OTHER_DRIVERS[d] || '';
  r.conf = c;
  if ('CipherKey' in c.kv) { r.locked = true; r.reason = 'this module is locked (CipherKey) – the publisher sells or gives out an unlock key, and Timotheos does not open locked SWORD modules'; return r; }
  if (!r.driver) { r.reason = 'the .conf names no module type (ModDrv)'; return r; }
  if (!r.kind) { r.reason = 'the SWORD module type "' + r.driver + '" is not supported'; return r; }
  const ct = (c.kv.CompressType || 'ZIP').toUpperCase();
  if (/^z/.test(d) && ct === 'LZSS') { r.reason = 'this module uses the old LZSS compression, which Timotheos does not read'; return r; }
  r.ok = true; return r;
}

// ---- reading the data files ----------------------------------------------------------
function findFile(dir, name) {
  const p = path.join(dir, name);
  try { if (fs.existsSync(p)) return p; } catch (e) { /* below */ }
  try { const low = name.toLowerCase(); const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === low); return hit ? path.join(dir, hit) : null; } catch (e) { return null; }
}
class RandomFile {
  constructor(p) { this.p = p; this.size = fs.statSync(p).size; this.fd = fs.openSync(p, 'r'); }
  read(pos, len) {
    if (pos < 0 || len < 0 || pos + len > this.size) return null;
    const b = Buffer.alloc(len); let got = 0;
    while (got < len) { const n = fs.readSync(this.fd, b, got, len - got, pos + got); if (!n) break; got += n; }
    return got === len ? b : null;
  }
  close() { try { fs.closeSync(this.fd); } catch (e) { /* closed */ } }
}

function decodeText(buf, enc) {
  if (enc === 'latin1') return new TextDecoder('windows-1252').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}

// ---- turning verse markup into Timotheos HTML ----------------------------------------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ''; } }
  return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
});
const attr = (tag, name) => { const m = new RegExp('(?:^|[\\s<])' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i').exec(tag); return m ? unent(m[1] != null ? m[1] : m[2]) : ''; };
const link = (ref, inner) => ref ? `<a class="link" data-href="tw://bible.*?id=${ref.b}.${ref.c}.${ref.v}">${inner}</a>` : inner;
function osisRef(s) {
  const m = /^(?:[^:]*:)?([1-4]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?/.exec(String(s || '').trim());
  if (!m) return null;
  const b = OSIS_ID.get(m[1].toLowerCase()); if (!b) return null;
  return { b, c: +m[2], v: m[3] ? +m[3] : 1 };
}
function strongsOf(s) {
  const out = []; const re = /(?:^|[\s:])(?:strong:|x-strongs?:|sn:)?([GHgh])0*(\d+)([a-z]?)(?=$|[\s,;])/g; let m;
  String(s || '').split(/\s+/).forEach(tok => { if (/^(?:lemma|lemma\.[^:]*):/i.test(tok)) return; re.lastIndex = 0; if ((m = re.exec(tok))) out.push(m[1].toUpperCase() + m[2] + m[3]); });
  return out;
}
const morphOf = s => String(s || '').split(/\s+/).filter(Boolean).map(t => t.replace(/^[A-Za-z\-]+:/, '')).filter(Boolean);
const lemmaOf = s => { const m = /(?:^|\s)lemma(?:\.[^:\s]*)?:(\S+)/.exec(String(s || '')); return m ? m[1] : ''; };

/** OSIS and ThML are read together: both are tag soup around the verse text; they differ in the tags they use */
function markupToHtml(raw, src, o = {}) {
  const out = []; const stack = []; let wojOpen = 0; const info = { strongs: false };
  const text = t => { t = unent(t); if (t) out.push(escT(t)); };
  const closeTo = (name) => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].tag === name) { const it = stack[i]; stack.length = i; return it; } return null; };
  const parts = String(raw).split(/(<[^>]*>)/);
  for (const part of parts) {
    if (!part) continue;
    if (part[0] !== '<') { text(part); continue; }
    const m = /^<\s*(\/?)\s*([A-Za-z][\w:.\-]*)([\s\S]*?)(\/?)\s*>$/.exec(part);
    if (!m) continue;
    const closing = !!m[1], tag = m[2].toLowerCase(), rest = m[3], selfc = !!m[4];
    if (closing) {
      const it = closeTo(tag); if (!it) continue;
      if (it.end) it.end(it);
      continue;
    }
    const open = (end) => { if (selfc) { if (end) end({ start: out.length }); } else stack.push({ tag, start: out.length, end }); };
    switch (tag) {
      case 'w': open(it => {
        const inner = out.splice(it.start).join('');
        const lem = (attr(rest, 'lemma') + ' ' + attr(rest, 'savlm')).trim(), mor = attr(rest, 'morph');
        const st = strongsOf(lem).concat(strongsOf(attr(rest, 'strong')));
        if (st.length) info.strongs = true;
        out.push(renderTaggedWord(inner, st.join(' '), morphOf(mor).join(' '), lemmaOf(lem)));
      }); break;
      case 'note': open(it => {
        const inner = out.splice(it.start).join('').trim(); if (!inner) return;
        const x = /cross/i.test(attr(rest, 'type'));
        out.push(`<sup class="fn${x ? ' xref' : ''}" data-note="${escA(inner)}">${x ? 'x' : 'f'}</sup>`);
      }); break;
      case 'reference': open(it => { const inner = out.splice(it.start).join(''); out.push(link(osisRef(attr(rest, 'osisRef')), inner)); }); break;
      case 'ref': open(it => {
        const inner = out.splice(it.start).join(''); const tg = attr(rest, 'target'), osis = attr(rest, 'osisRef');
        out.push(osis ? link(osisRef(osis), inner) : (tg && o.refTarget && o.refTarget(tg, inner)) || inner);
      }); break;
      case 'orth': out.push('<b>'); open(() => out.push('</b>')); break;
      case 'pron': case 'orig': out.push('<i>'); open(() => out.push('</i>')); break;
      case 'scripref': open(it => { const inner = out.splice(it.start).join(''); out.push(link(canon.parseRef(attr(rest, 'passage') || attr(rest, 'osisRef')), inner)); }); break;
      case 'q': {
        const jesus = /jesus|christ/i.test(attr(rest, 'who'));
        if (/\bsID\s*=/i.test(rest)) { if (jesus) { out.push('<span class="woj">'); wojOpen++; } }
        else if (/\beID\s*=/i.test(rest)) { if (wojOpen > 0) { out.push('</span>'); wojOpen--; } }
        else open(it => { if (jesus && wojOpen > 0) { out.push('</span>'); wojOpen--; } });
        if (!/\b[se]ID\s*=/i.test(rest) && jesus) { out.push('<span class="woj">'); wojOpen++; }
        break;
      }
      case 'transchange': case 'added': case 'insertion':
        if (tag !== 'transchange' || /added|supplied/i.test(attr(rest, 'type')) || !attr(rest, 'type')) { out.push('<span class="added">'); open(() => out.push('</span>')); } else open(null);
        break;
      case 'divinename': out.push('<span class="sc">'); open(() => out.push('</span>')); break;
      case 'hi': case 'emphasis': case 'i': case 'em': case 'foreign': {
        const t = (attr(rest, 'type') || attr(rest, 'rend')).toLowerCase();
        if (/bold/.test(t) || tag === 'b') { out.push('<b>'); open(() => out.push('</b>')); }
        else if (/small-?caps|sc/.test(t)) { out.push('<span class="sc">'); open(() => out.push('</span>')); }
        else if (tag === 'foreign' || /italic|emphasis|^$/.test(t) || tag === 'i' || tag === 'em') { out.push('<i>'); open(() => out.push('</i>')); }
        else open(null);
        break;
      }
      case 'b': case 'strong': out.push('<b>'); open(() => out.push('</b>')); break;
      case 'title': open(it => { const inner = out.splice(it.start).join('').trim(); if (inner) out.push(`<span class="heading h3">${attr(rest, 'canonical') === 'true' ? '<i>' + inner + '</i>' : inner}</span>`); }); break;
      case 'div': if (/sechead|title|head/i.test(attr(rest, 'class') + attr(rest, 'type'))) open(it => { const inner = out.splice(it.start).join('').trim(); if (inner) out.push(`<span class="heading h3">${inner}</span>`); }); else open(null); break;
      case 'lb': case 'br': out.push('<br>'); break;
      case 'l': if (/\beID\s*=/i.test(rest)) out.push('<br>'); else if (!/\bsID\s*=/i.test(rest)) open(() => out.push('<br>')); break;
      case 'p': case 'item': if (out.length && !/<br>$/.test(out[out.length - 1])) out.push('<br>'); if (!selfc) open(null); break;
      case 'milestone': if (/line|x-p/.test(attr(rest, 'type'))) out.push('<br>'); break;
      case 'sync': {
        const t = attr(rest, 'type'), v = attr(rest, 'value');
        if (/strong/i.test(t)) { const st = strongsOf(v.replace(/^strong:/i, '')); if (st.length) info.strongs = true; st.forEach(x => out.push(`<sup class="strong" data-strong="${escA(x)}">${escT(x)}</sup>`)); }
        else if (/morph/i.test(t)) morphOf(v).forEach(x => out.push(`<sup class="morph" data-morph="${escA(x)}">${escT(x)}</sup>`));
        break;
      }
      default: if (!selfc) open(null);
    }
  }
  while (stack.length) { const it = stack.pop(); if (it.end) it.end(it); }
  while (wojOpen-- > 0) out.push('</span>');
  return { html: out.join('').replace(/(<br>\s*)+$/, '').replace(/^(\s*<br>)+/, ''), strongs: info.strongs };
}

/** GBF: <FI>italic<Fi>, <FR>Jesus<Fr>, <RF>note<Rf>, <WG123> after the word */
function gbfToHtml(raw) {
  const out = []; const stack = []; let strongs = false;
  for (const part of String(raw).split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part[0] !== '<') { const t = unent(part); if (t) out.push(escT(t)); continue; }
    const t = part.slice(1, -1);
    const pair = (o, c, tag, endFn) => { if (t === o) { stack.push({ tag: c, start: out.length, endFn }); if (tag) out.push(tag); return true; } return false; };
    if (pair('FI', 'Fi', '<i>') || pair('FB', 'Fb', '<b>') || pair('FR', 'Fr', '<span class="woj">') || pair('FO', 'Fo', '') || pair('FU', 'Fu', '') || pair('FS', 'Fs', '') || pair('CT', 'Ct', '')) continue;
    if (t === 'Fi') { const i = stack.map(s => s.tag).lastIndexOf('Fi'); if (i >= 0) { stack.length = i; out.push('</i>'); } continue; }
    if (t === 'Fb') { const i = stack.map(s => s.tag).lastIndexOf('Fb'); if (i >= 0) { stack.length = i; out.push('</b>'); } continue; }
    if (t === 'Fr') { const i = stack.map(s => s.tag).lastIndexOf('Fr'); if (i >= 0) { stack.length = i; out.push('</span>'); } continue; }
    if (t === 'Fo' || t === 'Fu' || t === 'Fs' || t === 'Ct') { const i = stack.map(s => s.tag).lastIndexOf(t); if (i >= 0) stack.length = i; continue; }
    if (t === 'RF' || t === 'RX') { stack.push({ tag: t === 'RF' ? 'Rf' : 'Rx', start: out.length, note: t === 'RF' ? 'f' : 'x' }); continue; }
    if (t === 'Rf' || t === 'Rx') {
      const i = stack.map(s => s.tag).lastIndexOf(t);
      if (i >= 0) { const it = stack[i]; stack.length = i; const inner = out.splice(it.start).join('').trim(); if (inner) out.push(`<sup class="fn${it.note === 'x' ? ' xref' : ''}" data-note="${escA(inner)}">${it.note}</sup>`); }
      continue;
    }
    if (t === 'TS' || /^TS[123]$/.test(t)) { stack.push({ tag: 'Ts', start: out.length }); continue; }
    if (t === 'Ts') { const i = stack.map(s => s.tag).lastIndexOf('Ts'); if (i >= 0) { const it = stack[i]; stack.length = i; const inner = out.splice(it.start).join('').trim(); if (inner) out.push(`<span class="heading h3">${inner}</span>`); } continue; }
    if (t === 'CM' || t === 'CL') { out.push('<br>'); continue; }
    let w;
    if ((w = /^W([GH])(\d+[a-z]?)$/.exec(t))) { const st = normStrong(w[1] + w[2]); if (st.length) { strongs = true; out.push(`<sup class="strong" data-strong="${escA(st[0])}">${escT(st[0])}</sup>`); } continue; }
    if ((w = /^WT(.+)$/.exec(t))) { out.push(`<sup class="morph" data-morph="${escA(w[1])}">${escT(w[1])}</sup>`); continue; }
  }
  while (stack.length) { const it = stack.pop(); if (it.tag === 'Fi') out.push('</i>'); else if (it.tag === 'Fb') out.push('</b>'); else if (it.tag === 'Fr') out.push('</span>'); }
  return { html: out.join('').replace(/(<br>\s*)+$/, '').replace(/^(\s*<br>)+/, ''), strongs };
}
const plainToHtml = raw => ({ html: escT(unent(String(raw))).replace(/\r?\n/g, '<br>'), strongs: false });
function toHtml(raw, srcType, o) {
  const t = (srcType || 'Plain').toUpperCase();
  if (t === 'GBF') return gbfToHtml(raw);
  if (t === 'PLAIN' && !/^\s*<[A-Za-z][^>]*>/.test(raw)) return plainToHtml(raw);   // a module that says Plain but holds tags (Strong's Hebrew) is read as markup
  return markupToHtml(raw, t, o); // OSIS, ThML, TEI
}

/** SWORD pads some bzip2 blocks with zero bytes after the end of the stream, which the unpacker refuses: cut the block where the stream ends
 *  (the end-of-stream marker 0x177245385090 and a 32-bit CRC, not byte aligned, in the last bytes of the block) */
function bz2Trim(buf) {
  let e = buf.length; while (e > 0 && buf[e - 1] === 0) e--;   // SWORD fills the rest of the block with zero bytes
  const n = buf.length, from = Math.max(0, e - 24);
  for (let p = Math.min(n - 1, e); p >= from; p--) {
    for (let sh = 0; sh < 8; sh++) {
      // bits of the 48-bit marker starting sh bits into byte p
      let v = 0n; for (let k = 0; k < 7; k++) v = (v << 8n) | BigInt(buf[p + k] || 0);
      const marker = (v >> BigInt(56 - sh - 48)) & 0xFFFFFFFFFFFFn;
      if (marker === 0x177245385090n) { const bits = (p * 8 + sh) + 48 + 32; return buf.subarray(0, Math.ceil(bits / 8)); }
    }
  }
  return buf;
}
async function unpackBlock(raw, compress) {
  const archive = require('./archive');
  const es = await archive.unpack(compress === 'XZ' ? raw : bz2Trim(raw), compress === 'XZ' ? 'b.xz' : 'b.bz2');
  return es[0] ? es[0].data : null;
}

// ---- versification -------------------------------------------------------------------
const CANON_ALIAS = { nrsv: 'nrsv', nrsva: 'nrsva', kjv: 'kjv', kjva: 'kjva', leningrad: 'leningrad', mt: 'mt', luther: 'luther', german: 'german', synodal: 'synodal', synodalprot: 'synodalprot', vulg: 'vulg', catholic: 'catholic', catholic2: 'catholic2', lxx: 'lxx', orthodox: 'orthodox', calvin: 'calvin', darbyfr: 'darbyfr', segond: 'segond' };
const canonTotal = (sys, t) => 2 + (CANONS[sys][t] || []).reduce((a, [, cs]) => a + cs.reduce((x, y) => x + y, 0) + cs.length + 1, 0);

function load(confFile, opts = {}) {
  const pr = probe(confFile);
  if (pr.locked) throw new Error(pr.reason);
  if (!pr.ok) throw new Error(pr.reason || 'not a SWORD module');
  if (!VERSE_DRIVERS.test(pr.driver) || (pr.kind !== 'Bible' && !opts.core)) throw new Error('not a SWORD Bible');
  const conf = pr.conf, kv = conf.kv;
  const root = path.dirname(path.dirname(confFile));
  const driver = pr.driver.toLowerCase();
  const dataDir = path.join(root, (kv.DataPath || '').replace(/^\.[\\/]/, '').replace(/\\/g, '/').replace(/[\\/][^\\/]*$/, m => (/\.[a-z0-9]+$/i.test(m) ? '' : m)));
  const compress = (kv.CompressType || 'ZIP').toUpperCase();
  const blockType = (kv.BlockType || 'BOOK').toUpperCase();
  const bl = blockType === 'CHAPTER' ? 'c' : blockType === 'VERSE' ? 'v' : 'b';
  const compressed = /^z/.test(driver);
  const wide = /4$/.test(driver);
  const srcType = kv.SourceType || 'Plain';
  const enc = /latin|8859-1|cp1252|windows-1252/i.test(kv.Encoding || '') ? 'latin1' : 'utf8';
  const warnings = [];
  const files = [];
  const T = {}; // per testament: files and index sizes
  for (const t of ['ot', 'nt']) {
    let o = null;
    if (compressed) {
      const v = findFile(dataDir, `${t}.${bl}zv`), s = findFile(dataDir, `${t}.${bl}zs`), z = findFile(dataDir, `${t}.${bl}zz`);
      if (v && s && z) { o = { v: new RandomFile(v), s: new RandomFile(s), z: new RandomFile(z) }; files.push(o.v, o.s, o.z); o.recSize = wide ? 12 : 10; o.records = Math.floor(o.v.size / o.recSize); }
    } else {
      const v = findFile(dataDir, `${t}.vss`), z = findFile(dataDir, t);
      if (v && z) { o = { v: new RandomFile(v), z: new RandomFile(z) }; files.push(o.v, o.z); o.recSize = wide ? 8 : 6; o.records = Math.floor(o.v.size / o.recSize); }
    }
    if (o) T[t] = o;
  }
  if (!T.ot && !T.nt) { files.forEach(f => f.close()); throw new Error('the module\'s data files are missing (looked in ' + dataDir + ')'); }

  // the driver name says how wide a verse record is, but some modules do not keep to it (the Matthew Henry zCom4 uses 10-byte records):
  // the size that makes the index fit a numbering system wins
  const sizes = compressed ? (wide ? [12, 10] : [10, 12]) : (wide ? [8, 6] : [6, 8]);
  const gapOf = sy => ['ot', 'nt'].reduce((a, t) => a == null || !T[t] ? a : (() => { const d = canonTotal(sy, t) - T[t].records; return d < 0 || d > 2 ? null : a + d; })(), 0);
  for (const rs of sizes) {
    for (const t of Object.keys(T)) { T[t].recSize = rs; T[t].records = Math.floor(T[t].v.size / rs); T[t].vbuf = null; }
    if (CANON_KEYS.some(sy => gapOf(sy) != null)) break;
    if (rs === sizes[sizes.length - 1]) for (const t of Object.keys(T)) { T[t].recSize = sizes[0]; T[t].records = Math.floor(T[t].v.size / sizes[0]); T[t].vbuf = null; }
  }
  // which numbering system? the .conf names it; the size of the verse index confirms it
  const declared = String(kv.Versification || 'KJV').toLowerCase();
  let sys = CANON_ALIAS[declared] || null;
  // the verse index may stop a record or two before the end of the numbering (some modules end that way)
  const gap = s => ['ot', 'nt'].reduce((a, t) => a == null || !T[t] ? a : (() => { const d = canonTotal(s, t) - T[t].records; return d < 0 || d > 2 ? null : a + d; })(), 0);
  const fits = s => gap(s) != null;
  let note = '';
  if (!sys || !fits(sys)) {
    const alt = CANON_KEYS.filter(fits).sort((a, b) => gap(a) - gap(b))[0];
    if (alt) { note = (sys ? `the .conf says "${kv.Versification}" but the verse index fits "${alt}"` : `numbering "${kv.Versification}" is not known; the verse index fits "${alt}"`); sys = alt; }
    else { note = `numbering "${kv.Versification || 'KJV'}" could not be matched exactly; the King James numbering is used, so some verses may be missing or out of place`; sys = sys || 'kjv'; }
  }
  if (note) warnings.push(note);

  // books of the module, in the order of its numbering system
  const books = {}; const where = new Map(); // Timotheos book id -> {t, start, counts}
  const skipped = [];
  for (const t of ['ot', 'nt']) {
    if (!T[t]) continue;
    let idx = 2;
    for (const [osis, counts] of CANONS[sys][t]) {
      const id = OSIS_ID.get(osis.toLowerCase());
      if (id && !where.has(id)) { where.set(id, { t, start: idx, counts }); books[id] = counts.slice(); }
      else skipped.push(osis);
      idx += counts.reduce((a, b) => a + b, 0) + counts.length + 1;
    }
  }
  if (skipped.length) warnings.push('books without a place in Timotheos are left out: ' + skipped.join(', '));
  if (!KJV_LIKE.has(sys)) {
    const diffs = [];
    for (let b = 1; b <= 66; b++) {
      const mine = books[b], kjv = canon.KJV ? canon.KJV[b - 1] : null;
      if (mine && kjv && (mine.length !== kjv.length || mine.some((n, i) => n !== kjv[i]))) diffs.push(canon.byId.get(b) ? canon.byId.get(b).name : b);
    }
    if (diffs.length) warnings.push(`numbering: this module uses the "${sys}" verse numbering, which differs from the King James numbering in ${diffs.length} book${diffs.length > 1 ? 's' : ''} (${diffs.slice(0, 4).join(', ')}${diffs.length > 4 ? ', …' : ''}). Verses are shown under the module's own numbers, so a verse can sit a number or two away from the same verse in a King James-numbered Bible when you compare them side by side.`);
  }

  // blocks (zText): decompressed on demand; bzip2 and xz are unpacked together when the module opens
  const blockCache = new Map(); const preDone = new Map();
  const inflate = buf => { try { return require('zlib').inflateSync(buf); } catch (e) { return null; } };
  const blockRec = (t, n) => { const r = T[t].s.read(n * 12, 12); return r ? { off: r.readUInt32LE(0), size: r.readUInt32LE(4) } : null; };
  const block = (t, n) => {
    const key = t + ':' + n;
    if (preDone.has(key)) return preDone.get(key);
    if (blockCache.has(key)) { const v = blockCache.get(key); blockCache.delete(key); blockCache.set(key, v); return v; }
    const rec = blockRec(t, n); if (!rec) return null;
    const raw = T[t].z.read(rec.off, rec.size); if (!raw) return null;
    const data = compress === 'ZIP' ? inflate(raw) : null;
    if (data) { blockCache.set(key, data); if (blockCache.size > 6) blockCache.delete(blockCache.keys().next().value); }
    return data;
  };
  // the verse index is read once (a few hundred KB): reading it a record at a time is slow where file reads are slow
  const rec = (o, idx) => { if (!o.vbuf) o.vbuf = o.v.read(0, o.v.size); return o.vbuf ? o.vbuf.subarray(idx * o.recSize, (idx + 1) * o.recSize) : null; };
  const getRaw = (t, idx) => {
    const o = T[t]; if (!o || idx < 0 || idx >= o.records) return null;
    const r = rec(o, idx); if (!r) return null;
    let buf;
    if (compressed) {
      const n = r.readUInt32LE(0), start = r.readUInt32LE(4), len = o.recSize > 10 ? r.readUInt32LE(8) : r.readUInt16LE(8);
      const blk = block(t, n); if (!blk || start + len > blk.length) return null;
      buf = blk.subarray(start, start + len);
    } else {
      const start = r.readUInt32LE(0), len = o.recSize > 6 ? r.readUInt32LE(4) : r.readUInt16LE(4);
      if (!len) return null; buf = o.z.read(start, len);
    }
    return buf && buf.length ? decodeText(buf, enc) : null;
  };
  /** which stored text a verse slot points at (slots that share one text show the same commentary); null when empty */
  const recKey = (t, idx) => {
    const o = T[t]; if (!o || idx < 0 || idx >= o.records) return null;
    const r = rec(o, idx); if (!r) return null;
    if (compressed) { const len = o.recSize > 10 ? r.readUInt32LE(8) : r.readUInt16LE(8); return len ? r.readUInt32LE(0) + ':' + r.readUInt32LE(4) + ':' + len : null; }
    const len = o.recSize > 6 ? r.readUInt32LE(4) : r.readUInt16LE(4); return len ? r.readUInt32LE(0) + ':' + len : null;
  };
  const verseIndex = (b, c, v) => {
    const w = where.get(b); if (!w || c < 1 || c > w.counts.length || v < 1 || v > w.counts[c - 1]) return null;
    let before = 0; for (let i = 0; i < c - 1; i++) before += w.counts[i];
    return { t: w.t, idx: w.start + 1 + c + before + (v - 1) };
  };

  // bzip2 / xz blocks cannot be unpacked one at a time without waiting, so they are all unpacked here
  const prepare = async () => {
    if (!compressed || compress === 'ZIP') return;
    for (const t of Object.keys(T)) {
      const n = Math.floor(T[t].s.size / 12);
      for (let i = 0; i < n; i++) {
        const rec = blockRec(t, i); if (!rec) continue;
        const raw = T[t].z.read(rec.off, rec.size); if (!raw) continue;
        try { const d = await unpackBlock(raw, compress); if (d) preDone.set(t + ':' + i, d); } catch (e) { /* block stays unreadable */ }
      }
    }
  };
  const core = { conf, kv, T, books, where, sys, warnings, getRaw, recKey, verseIndex, srcType, files, compressed, compress, enc, root, dataDir, driver, pr, prepare: null };
  if (opts.core) { core.prepare = prepare; return core; }

  const lang = (kv.Lang || '').split('-')[0];
  const mod = {
    id: 'sw:' + path.basename(confFile), file: confFile, format: 'SWORD', kind: 'Bible',
    abbr: conf.name || path.basename(confFile).replace(/\.conf$/i, ''), title: kv.Description || conf.name,
    props: { title: kv.Description || conf.name, abbrev: conf.name, lang: kv.Lang || '', about: rtfText(kv.About), description: kv.Description || '', information: [kv.Copyright, kv.DistributionLicense].filter(Boolean).join(' – ') },
    rules: [], books, warnings,
    about: [rtfText(kv.About), kv.Copyright, kv.DistributionLicense && ('Licence: ' + kv.DistributionLicense)].filter(Boolean).join('\n\n'),
    rtl: /^(heb|ara|arc|fas|urd|syr|he|ar|fa|ur)$/i.test(lang),
    hasStrongs: (conf.all.Feature || []).some(f => /StrongsNumbers/i.test(f)) || (conf.all.GlobalOptionFilter || []).some(f => /Strongs/i.test(f)),
    sword: { versification: sys, driver: pr.driver, source: srcType },
    getVerse(b, c, v) {
      const at = verseIndex(b, c, v); if (!at) return null;
      let raw; try { raw = getRaw(at.t, at.idx); } catch (e) { return null; }
      if (raw == null) return null;
      raw = raw.replace(/\r?\n/g, ' ').trim(); if (!raw) return null;
      const r = toHtml(raw, srcType);
      if (r.strongs) mod.hasStrongs = true;
      return r.html ? '<_HTML_>' + r.html : null;
    },
    close() { files.forEach(f => f.close()); blockCache.clear(); preDone.clear(); },
    *allVerses() {
      for (const b of Object.keys(books).map(Number).sort((x, y) => x - y)) {
        const chs = books[b];
        for (let c = 1; c <= chs.length; c++) for (let v = 1; v <= chs[c - 1]; v++) { const val = mod.getVerse(b, c, v); if (val != null) yield [b, c, v, val]; }
      }
    },
  };
  mod.prepare = prepare;
  return mod;
}
async function loadAsync(confFile, opts) { const m = load(confFile, opts); await m.prepare(); return m; }

module.exports = { parseConf, probe, load: loadAsync, loadCore: (f) => { const c = load(f, { core: true }); return c.prepare().then(() => c); }, rtfText, unpackBlock, findFile, RandomFile, decodeText, loadSync: load, toHtml, markupToHtml, gbfToHtml, osisRef, BIBLE_DRIVERS, OTHER_DRIVERS, CANONS };
