/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Create verse links" (0.6.75): finds Bible references in the text of a theWord book, dictionary or commentary
// module ("John 3:16", "Exo 4:14; 5:1", "1 Cor 13:4-7", Tagalog names too) and turns them into real theWord links
// (tw://bible.*?id=43.3.16), the way theWord's own link tools do, so the module stays usable in theWord.
// It also repairs links whose visible text is the placeholder "[vref]" (some exporters write that literally).
// Links that already exist are left alone. Nothing is written by scan(); apply() keeps a backup first.
const fs = require('fs');
const path = require('path');
const canon = require('./canon');
const { sqljs } = require('./dict');
const { BACKUP } = require('./modprops');

const MAX_BYTES = 450 * 1024 * 1024;
const ROMAN = { I: '1', II: '2', III: '3', IV: '4' };
const SHORT_WORDS = new Set(['is', 'am', 'he', 're', 'ho', 'ne', 'so', 'no', 'me', 'we', 'be', 'to', 'in', 'on', 'at', 'or', 'of', 'by', 'an', 'as']);
const DEFAULTS = { tagalog: true, followOn: true, bare: false, fixPlaceholders: true, text: 'written', mode: 'inplace' };

/* ------------------------------------------------------------------ names */
let NAMES = null;
function names(tagalog) {
  const key = tagalog ? 't' : 'e';
  NAMES = NAMES || {};
  if (NAMES[key]) return NAMES[key];
  const list = [];
  for (const b of canon.BOOKS) { list.push([b[1], b[0]]); for (const a of b[2]) list.push([a, b[0]]); }
  if (tagalog) for (const [id, arr] of Object.entries(canon.TAGALOG_NAMES)) for (const n of arr) list.push([n, +id]);
  // split off the leading book number: "1 Samuel" / "1Sam" -> digit 1, base "samuel"
  const map = new Map(), bases = new Set();
  for (const [name, id] of list) {
    const m = /^([1-4])\s?(.+)$/.exec(String(name).trim());
    const digit = m ? m[1] : '', base = (m ? m[2] : String(name)).trim();
    if (!/^[A-Za-zÀ-ÿ]/.test(base)) continue;
    const k = digit + '|' + base.toLowerCase().replace(/[\s._-]/g, '');
    if (!map.has(k)) map.set(k, id);
    bases.add(base);
  }
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const alt = [...bases].sort((a, b) => b.length - a.length).map(esc).join('|');
  return NAMES[key] = { map, alt };
}

/* ------------------------------------------------------------------ finding references in plain text */
const NUM = String.raw`(\d{1,3})`;
/** a matcher for one set of options: matcher.parts(text, ctx) -> [string | {ref, shown}] */
function matcher(o) {
  o = Object.assign({}, DEFAULTS, o);
  const { map, alt } = names(o.tagalog);
  const RE = new RegExp(String.raw`(^|[^\w>&;])(?:(?:([1-4]|[1-3](?:st|nd|rd))\s?)|(I{1,3}|IV)\s)?(${alt})\.?(?:\s|_|&nbsp;|\\~)?\s*${NUM}\s?:\s?${NUM}(?:\s?[-–—]\s?(?:${NUM}\s?:\s?)?${NUM})?(?![\w:])`, 'gi');
  const MORE = new RegExp(String.raw`^((?:[;,]|\s(?:and|&amp;|&))\s*)(?:${NUM}:)?${NUM}(?:\s?[-–—]\s?(?:${NUM}:)?${NUM})?(?![\w:])`, 'i');
  // a bare "3:16" or "vv. 4-6" that follows a book already named in the same paragraph
  const BARE = new RegExp(String.raw`(^|[^\w:.>&;/])${NUM}:${NUM}(?:\s?[-–—]\s?(?:${NUM}:)?${NUM})?(?![\w:])`, 'g');
  const nameOf = b => { const k = canon.book(b); return o.text === 'tagalog' ? canon.tagalogBook(k).abbr : k.abbr; };
  const mk = (b, c, v, c2, v2) => {
    if (!b || !c || !v || c > 150 || v > 176) return null;
    let t = `${b}.${c}.${v}`;
    const cc = c2 || c;
    if (v2 && (cc > c || (cc === c && v2 > v))) t += `-${b}.${cc}.${v2}`;
    return t;
  };
  const stdText = (b, c, v, c2, v2) => `${nameOf(b)} ${c}:${v}` + (v2 && ((c2 || c) > c || ((c2 || c) === c && v2 > v)) ? '-' + ((c2 && c2 !== c) ? c2 + ':' : '') + v2 : '');
  const bookOf = (pre, base) => {
    let d = pre || '';
    if (d && !/^[1-4]$/.test(d)) d = /^[1-3](st|nd|rd)$/i.test(d) ? d[0] : (ROMAN[d.toUpperCase()] && d === d.toUpperCase() ? ROMAN[d] : null);
    if (d === null) return null;
    if (!d && !/^[A-ZÀ-Þ]/.test(base)) return null;               // a book name starts with a capital letter
    if (!d && base.length <= 2 && SHORT_WORDS.has(base.toLowerCase())) return null;
    return map.get(d + '|' + base.toLowerCase().replace(/[\s._-]/g, '')) || null;
  };
  return {
    opts: o,
    /** ctx.book remembers the last book named (for bare "3:16" references) */
    parts(t, ctx) {
      ctx = ctx || {};
      const out = []; let i = 0, m;
      const pushText = s => { if (s) out.push(s); };
      const scanBare = (from, to) => {
        // links bare references in t.slice(from, to) when a book is remembered
        const seg = t.slice(from, to);
        if (!o.bare || !ctx.book || !/\d:\d/.test(seg)) { pushText(seg); return; }
        let k = 0, bm; BARE.lastIndex = 0;
        while ((bm = BARE.exec(seg))) {
          const [all, pre, c, v, c2a, v2] = bm;
          const tgt = mk(ctx.book, +c, +v, c2a ? +c2a : 0, v2 ? +v2 : 0);
          if (!tgt) continue;
          pushText(seg.slice(k, bm.index) + pre);
          const shown = o.text === 'written' ? all.slice(pre.length) : stdText(ctx.book, +c, +v, c2a ? +c2a : 0, v2 ? +v2 : 0);
          out.push({ ref: tgt, shown, book: ctx.book, bare: true });
          k = bm.index + all.length;
        }
        pushText(seg.slice(k));
      };
      RE.lastIndex = 0;
      while ((m = RE.exec(t))) {
        const [all, pre, num, rom, base, c, v, c2a, v2] = m;
        const b = bookOf(num || rom, base);
        if (!b) { RE.lastIndex = m.index + pre.length + 1; continue; }
        scanBare(i, m.index);
        pushText(pre);
        const c2 = c2a ? +c2a : 0, v2n = v2 ? +v2 : 0;
        const tgt = mk(b, +c, +v, c2, v2n);
        if (!tgt) { pushText(all.slice(pre.length)); i = m.index + all.length; continue; }
        const raw = all.slice(pre.length);
        out.push({ ref: tgt, shown: o.text === 'written' ? raw : stdText(b, +c, +v, c2, v2n), book: b });
        ctx.book = b;
        let j = m.index + all.length, cc = +c;
        if (o.followOn) {
          for (let f; (f = MORE.exec(t.slice(j))); ) {
            if (!f[2] && /^\s+(?!and\b|&)[A-Za-z]/i.test(t.slice(j + f[0].length))) break;   // "Gen 1:1, 3 sons": not a verse
            const fc = f[2] ? +f[2] : cc, fv = +f[3], fc2 = f[4] ? +f[4] : 0, fv2 = f[5] ? +f[5] : 0;
            const ft = mk(b, fc, fv, fc2, fv2);
            if (!ft) break;
            pushText(f[1]);
            const rawF = f[0].slice(f[1].length);
            out.push({ ref: ft, shown: o.text === 'written' ? rawF : stdText(b, fc, fv, fc2, fv2), book: b, follow: true });
            cc = fc; j += f[0].length;
          }
        }
        i = j; RE.lastIndex = j;
      }
      scanBare(i, t.length);
      return out;
    },
    stdText, nameOf,
  };
}

/* ------------------------------------------------------------------ placeholders "[vref]" */
const PH = String.raw`\[(?:v?ref|verse)\]`;
const ID = String.raw`id=(\d+)\.(\d+)\.(\d+)(?:-(\d+)\.(\d+)\.(\d+))?`;
function placeholderText(mt, m) {
  const b = +m[1], c = +m[2], v = +m[3];
  const [b2, c2, v2] = m[4] ? [+m[4], +m[5], +m[6]] : [0, 0, 0];
  let t = mt.stdText(b, c, v);
  if (m[4]) t = b2 !== b ? `${t}-${mt.nameOf(b2)} ${c2}:${v2}` : c2 !== c ? `${t}-${c2}:${v2}` : v2 !== v ? `${t}-${v2}` : t;
  return t;
}

/* ------------------------------------------------------------------ RTF */
const SKIP_GROUP = /^(\*|fonttbl|colortbl|stylesheet|info|fldinst|fldrslt|pict|object|bkmkstart|bkmkend|header|footer|footnote|listtable|listoverridetable|generator|private)$/;
const TOKEN = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}]+)/y;

/** the colour (index in this topic's colour table) used for links; adds a blue one when the table has none */
function linkColour(rtf) {
  const used = /\{\\fldrslt[^{}]*?\\cf(\d+)/.exec(rtf);
  if (used) return { rtf, idx: +used[1] };
  const ct = /\{\\colortbl\s*([^}]*)\}/.exec(rtf);
  if (!ct) return { rtf, idx: null };
  const entries = ct[1].split(';'); entries.pop();                  // the last piece is what follows the final ';'
  for (let i = 0; i < entries.length; i++) {
    const r = /\\red(\d+)/.exec(entries[i]), g = /\\green(\d+)/.exec(entries[i]), b = /\\blue(\d+)/.exec(entries[i]);
    if (r && g && b && +b[1] >= 150 && +r[1] < 100 && +g[1] < 160) return { rtf, idx: i };
  }
  const at = ct.index + ct[0].length - 1;
  return { rtf: rtf.slice(0, at) + '\\red0\\green0\\blue255;' + rtf.slice(at), idx: entries.length };
}
const rtfField = (ref, shown, idx) => `{\\field{\\*\\fldinst HYPERLINK "tw://bible.*?id=${ref}"}{\\fldrslt${idx != null ? '\\cf' + idx : ''} ${shown}}}`;

function rtfLink(rtf, mt, stats) {
  let { rtf: src, idx } = linkColour(rtf);
  let out = '', pos = 0, n = 0, expectGroupKind = false;
  const stack = []; let skip = 0; const ctx = {};
  TOKEN.lastIndex = 0;
  let m;
  while (pos < src.length && (m = (TOKEN.lastIndex = pos, TOKEN.exec(src)))) {
    pos = TOKEN.lastIndex;
    const raw = m[0];
    if (m[5] === '{') { stack.push(false); expectGroupKind = true; out += raw; continue; }
    if (m[5] === '}') { if (stack.pop()) skip--; expectGroupKind = false; out += raw; continue; }
    if (expectGroupKind) {
      expectGroupKind = false;
      if ((m[1] && SKIP_GROUP.test(m[1])) || m[4] === '*') { stack[stack.length - 1] = true; skip++; }
    }
    if (m[1] === 'par') ctx.book = 0;
    if (m[6] != null && !skip) {
      const parts = mt.parts(m[6], ctx);
      if (parts.length === 1 && typeof parts[0] === 'string') { out += raw; continue; }
      for (const p of parts) {
        if (typeof p === 'string') out += p;
        else { out += rtfField(p.ref, p.shown, idx); n++; stats.add(p); }
      }
      continue;
    }
    out += raw;
  }
  return { data: out + src.slice(pos), n };
}

/** [vref] placeholders in RTF hyperlink fields */
function rtfPlaceholders(rtf, mt) {
  let n = 0;
  const re = new RegExp(String.raw`(HYPERLINK\s+"tw://bible[^"]*?${ID}"(?:(?!HYPERLINK)[\s\S]){0,80}?)${PH}`, 'gi');
  const data = rtf.replace(re, (all, head, ...g) => { n++; return head + placeholderText(mt, [null, ...g]); });
  return { data, n };
}

/* ------------------------------------------------------------------ HTML */
function htmlLink(html, mt, stats) {
  let out = '', inA = 0, inH = 0, n = 0; const ctx = {};
  for (const part of String(html).split(/(<[^>]*>)/)) {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) inA++; else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1);
      if (/^<(script|style)[\s>]/i.test(part)) inH++; else if (/^<\/(script|style)>/i.test(part)) inH = Math.max(0, inH - 1);
      if (/^<(p|br|div|li|tr|h\d)[\s>\/]/i.test(part)) ctx.book = 0;
      out += part;
    } else if (inA || inH || !/\d:\d/.test(part)) out += part;
    else {
      for (const p of mt.parts(part, ctx)) {
        if (typeof p === 'string') out += p;
        else { out += `<a href="tw://bible.*?id=${p.ref}">${p.shown}</a>`; n++; stats.add(p); }
      }
    }
  }
  return { data: out, n };
}
function htmlPlaceholders(html, mt) {
  let n = 0;
  const re = new RegExp(String.raw`(<a\s[^>]*href="tw://bible[^"]*?${ID}"[^>]*>\s*)${PH}`, 'gi');
  const data = html.replace(re, (all, head, ...g) => { n++; return head + placeholderText(mt, [null, ...g]); });
  return { data, n };
}

/* ------------------------------------------------------------------ the module */
const looksRtf = s => /^\s*(\{\\rtf|\\pard|\\par\b|\{?\\(?:f\d|fs\d+|b|i|ul|cf\d+)\b)/.test(s);
function bytesToStr(v) { return v == null ? '' : typeof v === 'string' ? v : Buffer.from(v).toString('utf8'); }
const refLabel = (mt, ref) => {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-\d+\.(\d+)\.(\d+))?$/.exec(ref);
  return m ? mt.stdText(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) : ref;
};

/**
 * Walks every topic of a theWord .twm book / dictionary / commentary.
 * @param {string} file
 * @param {object} opts  tagalog, followOn, bare, fixPlaceholders, text ('written'|'english'|'tagalog'), tids (only these topics)
 * @param {boolean} write  true: save the changes into `file`
 */
async function run(file, opts, write) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  if (!/\.twm$/i.test(file)) throw new Error('Verse links can be created in theWord modules (.twm) only.');
  const st = fs.statSync(file);
  if (st.size > MAX_BYTES) throw new Error('This module is too large to change here (over 450 MB).');
  const SQL = await sqljs();
  const db = new SQL.Database(fs.readFileSync(file));
  try {
    const T = new Set(((db.exec("select name from sqlite_master where type='table'")[0] || { values: [] }).values).map(r => String(r[0]).toLowerCase()));
    if (!T.has('content')) throw new Error('This module has no text to link.');
    const cfg = {};
    if (T.has('config')) for (const [k, v] of (db.exec('select name, value from config')[0] || { values: [] }).values) cfg[String(k).toLowerCase()] = bytesToStr(v);
    if (cfg.compressed === '1') throw new Error('This module stores its text compressed, so verse links cannot be created in it.');
    const modType = (cfg['content.type'] || 'rtf').toLowerCase();
    const mt = matcher(o);
    const only = o.tids && o.tids.length ? new Set(o.tids.map(Number)) : null;
    const rows = (T.has('topics')
      ? db.exec('select c.topic_id, t.subject, t.content_type, c.data, c.data2 from content c left join topics t on t.id = c.topic_id')
      : db.exec('select c.topic_id, null, null, c.data, c.data2 from content c'))[0];
    const res = { topics: 0, changed: 0, links: 0, fixed: 0, skipped: 0, samples: [], books: {}, unchanged: 0 };
    const upd = write ? db.prepare('update content set data = ? where topic_id = ?') : null;
    const sampleSeen = new Set();
    for (const [tid, subject, ctype, data, data2] of rows ? rows.values : []) {
      if (only && !only.has(+tid)) continue;
      res.topics++;
      if (data2 != null || typeof data !== 'string') { res.skipped++; continue; }   // pictures-and-text (RichView) or binary text
      const kind = String(ctype || modType).toLowerCase();
      if (kind !== 'rtf' && kind !== 'html' && kind !== 'text' && !looksRtf(data)) { res.skipped++; continue; }
      const isRtf = kind === 'rtf' ? !/^\s*</.test(data) : looksRtf(data);
      let cur = data, nLinks = 0, nFix = 0;
      const topicLinks = [];
      const stats = { add: p => { topicLinks.push(p); res.books[p.book] = (res.books[p.book] || 0) + 1; }, };
      if (o.fixPlaceholders && /\[(?:v?ref|verse)\]/i.test(cur)) { const r = isRtf ? rtfPlaceholders(cur, mt) : htmlPlaceholders(cur, mt); cur = r.data; nFix = r.n; }
      if (/\d\s?:\s?\d/.test(cur)) { const r = isRtf ? rtfLink(cur, mt, stats) : htmlLink(cur, mt, stats); cur = r.data; nLinks = r.n; }
      if (!nLinks && !nFix) { res.unchanged++; continue; }
      res.changed++; res.links += nLinks; res.fixed += nFix;
      if (res.samples.length < 12 && nLinks && !sampleSeen.has(subject)) {
        sampleSeen.add(subject);
        res.samples.push({ topic: bytesToStr(subject), links: topicLinks.slice(0, 5).map(p => `${p.shown} \u2192 ${refLabel(mt, p.ref)}`), more: Math.max(0, topicLinks.length - 5) });
      }
      if (write) upd.run([cur, tid]);
    }
    if (upd) upd.free();
    if (write && res.changed) {
      const tmp = file + '.timotheos-tmp';
      fs.writeFileSync(tmp, Buffer.from(db.export()));
      fs.renameSync(tmp, file);
    }
    return res;
  } finally { db.close(); }
}

/** what would change (nothing is written) */
const scan = (file, opts) => run(file, opts, false);

/**
 * create the links. opts.mode: 'inplace' (a backup "<file>.timotheos-backup" is kept once, "Restore" in Module properties brings it back)
 * or 'copy' (a new "<name> (verse links).<ext>" next to it; the original is not touched).
 * Returns the scan result plus { file, backup }.
 */
async function apply(file, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  let target = file, backup = null;
  if (o.mode === 'copy') {
    const m = /^(.*?)((?:\.[a-z0-9]+)?\.twm)$/i.exec(path.basename(file));
    const base = m ? m[1] : path.basename(file, path.extname(file)), ext = m ? m[2] : '.twm';
    let n = 0;
    do { target = path.join(path.dirname(file), `${base} (verse links${n ? ' ' + (n + 1) : ''})${ext}`); n++; } while (fs.existsSync(target));
    fs.copyFileSync(file, target);
  } else {
    backup = file + BACKUP;
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  }
  try {
    const r = await run(target, o, true);
    if (o.mode === 'copy' && !r.changed) { try { fs.unlinkSync(target); } catch (e) { /* ignore */ } return Object.assign(r, { file: null, backup: null }); }
    return Object.assign(r, { file: target, backup });
  } catch (e) {
    if (o.mode === 'copy') { try { fs.unlinkSync(target); } catch (_) { /* ignore */ } }
    throw e;
  }
}

module.exports = { scan, apply, matcher, rtfLink, htmlLink, rtfPlaceholders, htmlPlaceholders, DEFAULTS };
