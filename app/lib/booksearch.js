/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Book search: words in commentaries, dictionaries, books, devotionals and maps (theWord and e-Sword).
// Supports [D2]: AND (&), OR (|), NOT (~), XOR (^), NEARw[n] (@n), parentheses ( ), "exact phrases",
// wildcards (word*, ?use), and regular expressions (o.regex).
// Case and accents are ignored unless asked. Modules are read one topic at a time from disk.

const NONASCII = /[^\x00-\x7f]/;
const fold = (s, accents) => { let t = String(s).toLowerCase(); if (!accents && NONASCII.test(t)) t = t.normalize('NFD').replace(/\p{M}/gu, ''); return t; };
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termRegex(raw, o) {
  const f = fold(raw, o.accents);
  let src = reEsc(f).replace(/\\\*/g, '[\\p{L}\\p{N}]*').replace(/\\\?/g, '[\\p{L}\\p{N}]').replace(/\s+/g, '\\s+');
  const edge = o.whole || /\*$/.test(raw) ? '(?<![\\p{L}\\p{N}])' : '';
  const tail = o.whole && !/\*$/.test(raw) ? '(?![\\p{L}\\p{N}])' : '';
  return new RegExp(edge + src + tail, 'gu');
}

/** Tokenize a Book Search query into terms, phrases, parentheses, and Boolean/proximity operators */
function lexQuery(q) {
  const toks = [];
  let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')') { toks.push({ k: ch }); i++; continue; }
    if (ch === '"') {
      const j = q.indexOf('"', i + 1);
      const end = j < 0 ? q.length : j;
      const v = q.slice(i + 1, end).trim();
      if (v) toks.push({ k: 'term', v });
      i = end + 1;
      continue;
    }
    if (ch === '~') { toks.push({ k: 'NOT' }); i++; continue; }
    if (ch === '&' || ch === '|' || ch === '^') {
      toks.push({ k: 'op', v: ch === '&' ? 'AND' : ch === '|' ? 'OR' : 'XOR' });
      i++; continue;
    }
    if (ch === '@') {
      const m = /^@(\d*)/.exec(q.slice(i));
      toks.push({ k: 'op', v: 'NEARW', n: m[1] ? +m[1] : 15 });
      i += m[0].length;
      continue;
    }
    const m = /^[^\s()"]+/.exec(q.slice(i));
    const w = m[0]; i += w.length;
    const up = w.toUpperCase();
    let nm;
    if (up === 'NOT') toks.push({ k: 'NOT' });
    else if (up === 'AND' || up === 'OR' || up === 'XOR') toks.push({ k: 'op', v: up });
    else if ((nm = /^NEARW?(\d*)$/.exec(up))) toks.push({ k: 'op', v: 'NEARW', n: nm[1] ? +nm[1] : 15 });
    else toks.push({ k: 'term', v: w });
  }
  return toks;
}

/** Parse query into { terms: [{text, re}], matcher: (foldedText) => boolean } */
function compileQuery(q, o = {}) {
  if (o.regex) {
    let re;
    try { re = new RegExp(q, 'gu' + (o.accents ? '' : 'i')); }
    catch (e) { throw new Error('Regular expression error: ' + e.message); }
    const term = { text: q, re };
    return {
      terms: [term],
      matcher: f => { re.lastIndex = 0; return re.test(f); },
    };
  }
  const toks = lexQuery(q);
  const terms = [];
  let p = 0;
  const peek = () => toks[p];

  function primary() {
    const t = toks[p++];
    if (!t) throw new Error('the query ends too early');
    if (t.k === '(') {
      const e = expr();
      if (peek() && peek().k === ')') p++;
      return e;
    }
    if (t.k === 'term') {
      const re = termRegex(t.v, o);
      const termObj = { text: t.v, re };
      terms.push(termObj);
      return f => { re.lastIndex = 0; return re.test(f); };
    }
    throw new Error(`unexpected "${t.v || t.k}" in query`);
  }

  function unary() {
    if (peek() && peek().k === 'NOT') {
      p++;
      const a = unary();
      return f => !a(f);
    }
    return primary();
  }

  function nearWords(reA, reB, maxWords, f) {
    reA.lastIndex = 0; reB.lastIndex = 0;
    const posA = [], posB = [];
    let m;
    while ((m = reA.exec(f))) { if (!m[0].length) { reA.lastIndex++; continue; } posA.push([m.index, m.index + m[0].length]); if (posA.length > 200) break; }
    if (!posA.length) return false;
    while ((m = reB.exec(f))) { if (!m[0].length) { reB.lastIndex++; continue; } posB.push([m.index, m.index + m[0].length]); if (posB.length > 200) break; }
    if (!posB.length) return false;
    for (const [a0, a1] of posA) {
      for (const [b0, b1] of posB) {
        const slice = b0 >= a1 ? f.slice(a1, b0) : a0 >= b1 ? f.slice(b1, a0) : '';
        const between = (slice.match(/[\p{L}\p{N}]+/gu) || []).length;
        if (between <= maxWords) return true;
      }
    }
    return false;
  }

  function expr() {
    let left = unary();
    let leftTerm = terms[terms.length - 1];
    while (peek() && peek().k !== ')') {
      let op = 'AND', n = 15;
      if (peek().k === 'op') { const tok = toks[p++]; op = tok.v; n = tok.n || 15; }
      const right = unary();
      const rightTerm = terms[terms.length - 1];
      const prevLeft = left;
      const lRe = leftTerm && leftTerm.re, rRe = rightTerm && rightTerm.re;
      if (op === 'OR') left = f => prevLeft(f) || right(f);
      else if (op === 'XOR') left = f => prevLeft(f) !== right(f);
      else if (op === 'NEARW' && lRe && rRe) left = f => nearWords(lRe, rRe, n, f);
      else left = f => prevLeft(f) && right(f);
      leftTerm = rightTerm;
    }
    return left;
  }

  if (!toks.length) return { terms: [], matcher: () => false };
  const matcher = expr();
  return { terms, matcher };
}

/** the query -> regular expressions on folded text (backwards-compatible export) */
function parse(q, o = {}) {
  return compileQuery(q, o).terms;
}

/** a short piece of the text around the first hit, with the words marked (HTML) */
function snippet(text, terms, accents) {
  // folding may change lengths (accents): map each folded position back to the original text
  let map = null, f;
  if (!NONASCII.test(text)) f = text.toLowerCase(); // plain English: positions stay the same
  else { map = []; f = ''; for (let i = 0; i < text.length; i++) { const ch = fold(text[i], accents); for (let k = 0; k < ch.length; k++) map.push(i); f += ch; } map.push(text.length); }
  const at = i => map ? map[i] : i;
  const spans = [];
  for (const t of terms) { t.re.lastIndex = 0; let m; while ((m = t.re.exec(f))) { if (!m[0].length) { t.re.lastIndex++; continue; } spans.push([at(m.index), at(m.index + m[0].length - 1) + 1]); if (spans.length > 60) break; } }
  if (!spans.length) return '';
  spans.sort((a, b) => a[0] - b[0]);
  const s0 = spans[0][0]; let from = Math.max(0, s0 - 90), to = Math.min(text.length, s0 + 230);
  while (from > 0 && /\S/.test(text[from - 1]) && s0 - from < 120) from--;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = from > 0 ? '… ' : ''; let pos = from;
  for (const [a, b] of spans) { if (a < pos || a >= to) continue; out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, Math.min(b, to))) + '</mark>'; pos = Math.min(b, to); }
  out += esc(text.slice(pos, to)) + (to < text.length ? ' …' : '');
  return out.replace(/\s*\n\s*/g, ' ¶ ');
}

/* the plain text of the modules, kept after a first search so the next ones are quick (e-Sword topics are RTF and slow to read).
 * Your own modules are read fresh each time (you may have edited them); at most CAP characters are kept, the least used go first. */
const CACHE = new Map(); let cacheChars = 0; const CAP = 24e6;
function* textsOf(id, m, info, file) {
  const c = CACHE.get(id);
  if (c && c.file === file) { CACHE.delete(id); CACHE.set(id, c); yield* c.items; return; }
  if (info.user || m.user) { yield* m.texts(); return; }
  const items = []; let chars = 0;
  for (const t of m.texts()) { items.push({ id: t.id, subject: t.subject, text: t.text }); chars += (t.text || '').length + (t.subject || '').length; yield t; }
  if (chars > CAP) return;                                        // read to the end: keep it
  if (c) { cacheChars -= c.chars; CACHE.delete(id); }
  CACHE.set(id, { file, items, chars }); cacheChars += chars;
  for (const [k, v] of CACHE) { if (cacheChars <= CAP) break; CACHE.delete(k); cacheChars -= v.chars; }
}

/**
 * @param lib       the Library
 * @param query     words / "phrases" / Boolean / regex
 * @param o         {ids: [module ids] (empty = all), whole, accents, regex, limit}
 * @param progress  (text) => void
 * @param stopped   () => true when a newer search has started
 */
async function run(lib, query, o = {}, progress = () => {}, stopped = () => false) {
  const t0 = Date.now();
  const { terms, matcher } = compileQuery(query, o);
  if (!terms.length) throw new Error('Type the words to look for');
  const KIND = ['commentary', 'dictionary', 'book', 'devotional', 'map'];
  let ids = (o.ids && o.ids.length ? o.ids : [...lib.books.keys()]).filter(id => lib.books.has(id));
  ids = ids.filter(id => KIND.includes(lib.books.get(id).kind)).sort((a, b) => KIND.indexOf(lib.books.get(a).kind) - KIND.indexOf(lib.books.get(b).kind));
  const limit = o.limit || 1000; const results = []; let total = 0, searched = 0, n = 0;
  for (const id of ids) {
    if (stopped()) return null;
    const m = await lib.openBook(id); if (!m || m.locked || !m.texts) continue;
    searched++; progress(`Searching ${m.title} (${searched} of ${ids.length})…`);
    const hits = [];
    const info = lib.books.get(id) || {};
    for (const t of textsOf(id, m, info, lib.cacheKey ? lib.cacheKey(info.file) : info.file)) {
      if ((++n & 255) === 0) { await new Promise(r => setImmediate(r)); if (stopped()) return null; }
      const f = fold(t.text + ' ' + t.subject, o.accents);
      if (!matcher(f)) continue;
      total++;
      if (results.length + hits.length < limit) hits.push({ tid: t.id, subject: t.subject, snippet: snippet(t.text, terms, o.accents) || '' });
    }
    if (hits.length) results.push({ id, title: m.title, abbr: m.abbr, kind: m.kind, hits });
  }
  return { results, total, modules: searched, shown: results.reduce((a, r) => a + r.hits.length, 0), words: terms.map(t => t.text), ms: Date.now() - t0 };
}

module.exports = { run, parse, compileQuery, snippet };
