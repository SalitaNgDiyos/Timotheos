'use strict';
// Bible search engine. The query language follows the behaviour described in theWord's user manual
// (Boolean searches, Regex searches, Detailed/Options tabs); the code is Tanglaw's own.
//
//   words, w*rd, ?use        word terms; * = any letters, ? = zero or one letter
//   "a phrase"   {a b c}     exact phrase / consecutive words
//   G25  H430                Strong's numbers
//   m/ N-NSF  m/ λόγος@*     morphology code and/or lemma (lemma@tag; % for Aramaic); * ? [ab] wildcards
//   AND &   OR |   NOT ~   XOR ^   NXT +   NEARv[n] #n   NEARw[n] @n   NEARwGrp[n]   TR >
//   ( )                      grouping. Operators are evaluated left to right, as in theWord.
//   \AND                     the literal word "and"
const canon = require('./canon');

/* ------------------------------------------------------------------ normalizing */
const QUOTES = /["'`´‘’‛“”΄ʹ′″‴‵‶‷]/g;
const SPACES = /[  -   　]/g;
function norm(s, o) {
  let t = String(s).replace(SPACES, ' ');
  if (o.ignoreCase) t = t.toLowerCase();
  if (o.ignoreDiacritics) t = t.normalize('NFD').replace(/\p{M}/gu, '').replace(QUOTES, "'").normalize('NFC');
  return t;
}
const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;

/* ------------------------------------------------------------------ verse model */
/**
 * Turns verse markup (theWord tags or Tanglaw HTML) into:
 *   plain: visible text; words: [{t, s, e, g}] (text, char start/end, segment index);
 *   segs:  [{strongs, morphs, lemmas, w0, w1}] – a run of text and the tags that follow it
 */
function model(raw) {
  const segs = []; let plain = ''; let cur = { strongs: [], morphs: [], lemmas: [], s: 0 };
  const closeSeg = () => { cur.e = plain.length; segs.push(cur); cur = { strongs: [], morphs: [], lemmas: [], s: plain.length }; };
  if (!raw) return { plain: '', words: [], segs: [] };
  if (raw.startsWith('<_HTML_>')) {
    const html = raw.slice(8);
    const toks = html.match(/<[^>]*>|[^<]+/g) || [];
    let skip = 0; const stack = [];
    for (const t of toks) {
      if (t[0] !== '<') { if (!skip) plain += decodeEnt(t); continue; }
      if (/^<sup\b/i.test(t)) { stack.push('sup'); skip++; continue; }
      if (/^<span class="heading/i.test(t)) { stack.push('skip'); skip++; continue; }
      const w = /^<(span|a)\b[^>]*class="(word|strong)"[^>]*>/i.exec(t);
      if (w) {
        const st = (/data-strong="([^"]*)"/.exec(t) || [])[1]; const mo = (/data-morph="([^"]*)"/.exec(t) || [])[1]; const le = (/data-lemma="([^"]*)"/.exec(t) || [])[1];
        if (w[2] === 'strong') { // old e-Sword: a Strong's number written after the word
          const last = segs[segs.length - 1];
          if (plain.length > cur.s && /\S/.test(plain.slice(cur.s))) { closeSeg(); }
          const tgt = segs[segs.length - 1] || last; if (tgt && st) tgt.strongs.push(...st.split(/\s+/));
          stack.push('skip'); skip++; continue;
        }
        if (plain.length > cur.s) closeSeg();
        if (st) cur.strongs.push(...st.split(/\s+/)); if (mo) cur.morphs.push(...mo.split(/\s+/)); if (le) cur.lemmas.push(le);
        stack.push('word'); continue;
      }
      if (/^<br|^<\/?p\b/i.test(t)) { plain += ' '; continue; }
      if (/^<\//.test(t)) {
        const top = stack.pop();
        if (top === 'sup' || top === 'skip') skip = Math.max(0, skip - 1);
        else if (top === 'word') closeSeg();
        continue;
      }
      if (/^<(span|a|b|i|u|em|strong|font|sub)\b/i.test(t) && !/\/>$/.test(t)) stack.push('x');
    }
  } else {
    const s = raw.replace(/<RF[^>]*>[\s\S]*?<Rf>/g, '').replace(/<TS\d?>[\s\S]*?<Ts>/g, '').replace(/<sup>[\s\S]*?<\/sup>/gi, '');
    const toks = s.match(/<[^>]*>|[^<]+/g) || [];
    let tagged = false;
    for (const t of toks) {
      if (t[0] !== '<') { if (tagged) { closeSeg(); tagged = false; } plain += decodeEnt(t); continue; }
      let m;
      if ((m = /^<W([GH])(\d+)([a-z]?)[sx]?>$/.exec(t))) { cur.strongs.push(m[1] + m[2] + (m[3] || '')); tagged = true; continue; }
      if ((m = /^<WT([^\s>]+)/.exec(t))) { cur.morphs.push(m[1]); const l = /\bl="([^"]*)"/.exec(t); if (l) cur.lemmas.push(l[1]); tagged = true; continue; }
      if (/^<(CM|CI|CL|br)\b/i.test(t)) { if (tagged) { closeSeg(); tagged = false; } plain += ' '; continue; }
      if (/^<a\s/i.test(t)) {
        if (tagged) { closeSeg(); tagged = false; }
        if (plain.length > cur.s) closeSeg();
        const href = (/href=("([^"]*)"|[^\s>]+)/i.exec(t) || [])[2] || (/href=([^\s>]+)/i.exec(t) || [])[1] || '';
        for (const part of href.split('|')) {
          let q;
          if ((q = /^_STRONG\d?_([GH]\d+[a-z]?)/.exec(part))) cur.strongs.push(q[1]);
          else if ((q = /^_MORPH\d?_(.+)/.exec(part))) cur.morphs.push(q[1]);
          else if ((q = /^_LEMMA_(.+)/.exec(part))) cur.lemmas.push(q[1]);
        }
        continue;
      }
      if (/^<\/a>/i.test(t)) { closeSeg(); continue; }
    }
  }
  if (plain.length > cur.s || cur.strongs.length) closeSeg();
  // words
  const words = [];
  plain = plain.replace(/\s+/g, ' ');
  let si = 0;
  for (const m of plain.matchAll(WORD_RE)) {
    const s = m.index, e = s + m[0].length;
    while (si < segs.length - 1 && segs[si].e <= s) si++;
    words.push({ t: m[0], s, e, g: si });
  }
  segs.forEach((g, i) => { g.w0 = words.findIndex(w => w.g === i); let last = -1; for (let k = words.length - 1; k >= 0; k--) if (words[k].g === i) { last = k; break; } g.w1 = last; });
  return { plain, words, segs };
}
function decodeEnt(t) { return t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&'); }

/* ------------------------------------------------------------------ query parsing */
const OPS = { AND: 'AND', '&': 'AND', OR: 'OR', '|': 'OR', XOR: 'XOR', '^': 'XOR', NXT: 'NXT', '+': 'NXT', TR: 'TR', '>': 'TR' };

function lex(q) {
  const out = []; let i = 0;
  while (i < q.length) {
    const ch = q[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '(' || ch === ')' || ch === '{' || ch === '}') { out.push({ k: ch }); i++; continue; }
    if (ch === '"') { const j = q.indexOf('"', i + 1); const end = j < 0 ? q.length : j; out.push({ k: 'phrase', v: q.slice(i + 1, end) }); i = end + 1; continue; }
    if (ch === '\\') { const m = /^\\(\S+)/.exec(q.slice(i)); out.push({ k: 'term', v: m[1] }); i += m[0].length; continue; }
    if (/^m\//i.test(q.slice(i, i + 2))) { i += 2; while (/\s/.test(q[i] || '')) i++; const m = /^\S+/.exec(q.slice(i)) || ['']; out.push({ k: 'morph', v: m[0] }); i += m[0].length; continue; }
    if ('&|^+>~'.includes(ch)) { out.push(ch === '~' ? { k: 'NOT' } : { k: 'op', v: OPS[ch] }); i++; continue; }
    if (ch === '#' || ch === '@') { const m = /^[#@](\d*)/.exec(q.slice(i)); out.push({ k: 'op', v: ch === '#' ? 'NEARV' : 'NEARW', n: m[1] ? +m[1] : null }); i += m[0].length; continue; }
    const m = /^[^\s(){}"]+/.exec(q.slice(i)); const w = m[0]; i += w.length;
    const up = w.toUpperCase();
    let nm;
    if (up === 'NOT') out.push({ k: 'NOT' });
    else if (OPS[up] && /^[A-Z]+$/.test(up)) out.push({ k: 'op', v: OPS[up] });
    else if ((nm = /^NEAR(V|W|WGRP|WSPLIT)?(\d*)$/.exec(up))) out.push({ k: 'op', v: nm[1] === 'V' ? 'NEARV' : nm[1] === 'WGRP' ? 'NEARG' : nm[1] ? 'NEARW' : 'NEAR', n: nm[2] ? +nm[2] : null });
    else if (/^[GH]\d+[a-z]?$/i.test(w)) out.push({ k: 'strong', v: w[0].toUpperCase() + w.slice(1).replace(/^0+/, '') });
    else out.push({ k: 'term', v: w });
  }
  return out;
}

function parse(q, opts) {
  const toks = lex(q); let p = 0;
  const peek = () => toks[p];
  function primary() {
    const t = toks[p++];
    if (!t) throw new Error('the query ends too early');
    if (t.k === '(') { const e = expr(); if (!peek() || peek().k !== ')') throw new Error('missing )'); p++; return e; }
    if (t.k === '{') { const items = []; while (peek() && peek().k !== '}') { const x = toks[p++]; if (x.k === 'term') items.push(...x.v.split(/\s+/).map(v => ({ t: 'term', v }))); else if (x.k === 'strong') items.push({ t: 'strong', v: x.v }); else if (x.k === 'phrase') items.push({ t: 'phrase', v: x.v }); else if (x.k === 'morph') items.push({ t: 'morph', v: x.v }); }
      p++; if (!items.length) throw new Error('empty { }'); return items.reduce((a, b) => ({ t: 'NXT', a, b })); }
    if (t.k === 'phrase') return { t: 'phrase', v: t.v };
    if (t.k === 'term') return { t: 'term', v: t.v };
    if (t.k === 'strong') return { t: 'strong', v: t.v };
    if (t.k === 'morph') { if (!t.v) throw new Error('m/ needs a pattern'); return { t: 'morph', v: t.v }; }
    throw new Error(t.k === ')' ? 'unexpected )' : `"${t.v || t.k}" cannot start a term`);
  }
  function unary() { if (peek() && peek().k === 'NOT') { p++; return { t: 'NOT', a: unary() }; } return primary(); }
  function expr() {
    let left = unary();
    while (peek() && peek().k !== ')' && peek().k !== '}') {
      let op = opts.defaultOr ? 'OR' : 'AND', n = null;
      if (peek().k === 'op') { const o = toks[p++]; op = o.v; n = o.n; }
      if (op === 'NEAR') op = opts.nearDefault === 'v' ? 'NEARV' : 'NEARW';
      const right = unary();
      left = { t: op, a: left, b: right, n: n != null ? n : (op === 'NEARV' ? (opts.nearV || 3) : (opts.nearW || 30)) };
    }
    return left;
  }
  const e = expr();
  if (p < toks.length) throw new Error('unexpected ' + (toks[p].v || toks[p].k));
  return e;
}

/* ------------------------------------------------------------------ explanation */
function explain(node) {
  const q = s => `“${s}”`;
  switch (node.t) {
    case 'term': return q(node.v);
    case 'phrase': return 'the phrase ' + q(node.v);
    case 'strong': return "Strong's " + node.v;
    case 'morph': return 'morphology ' + q(node.v);
    case 'NOT': return 'not (' + explain(node.a) + ')';
    case 'AND': return explain(node.a) + ' and ' + explain(node.b);
    case 'OR': return '(' + explain(node.a) + ' or ' + explain(node.b) + ')';
    case 'XOR': return 'either ' + explain(node.a) + ' or ' + explain(node.b) + ' but not both';
    case 'NXT': return explain(node.a) + ' immediately followed by ' + explain(node.b);
    case 'NEARW': return `${explain(node.a)} within ${node.n} words of ${explain(node.b)}`;
    case 'NEARG': return `${explain(node.a)} within ${node.n} tagged word groups of ${explain(node.b)}`;
    case 'NEARV': return `${explain(node.a)} within ${node.n} verses of ${explain(node.b)}`;
    case 'TR': return `${explain(node.a)} translated as ${explain(node.b)}`;
    default: return '?';
  }
}

/* ------------------------------------------------------------------ evaluation */
function wildRe(pat, o, whole) {
  let src = '';
  for (const ch of pat) src += ch === '*' ? "[\\p{L}\\p{M}\\p{N}'’]*" : ch === '?' ? "[\\p{L}\\p{M}\\p{N}'’]?" : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(whole ? '^' + src + '$' : src, 'gu' + (o.ignoreCase ? 'i' : ''));
}
function globRe(pat, ci) { // morphology / lemma patterns: * ? [..]
  let src = ''; let i = 0;
  while (i < pat.length) { const ch = pat[i]; if (ch === '*') src += '.*'; else if (ch === '?') src += '.'; else if (ch === '[') { const j = pat.indexOf(']', i); src += j > i ? pat.slice(i, j + 1) : '\\['; i = j > i ? j : i; } else src += ch.replace(/[.*+?^${}()|\\]/g, '\\$&'); i++; }
  return new RegExp('^' + src + '$', ci ? 'iu' : 'u');
}
const strongKey = s => { const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(s); return m ? m[1].toUpperCase() + m[2] : s; };

/** compile the tree into a matcher: (ctx) => {ok, spans:[[w0,w1]], hits:[{kind, seg|word}]} */
function compile(node, o) {
  switch (node.t) {
    case 'term': {
      const raw = norm(node.v, o);
      const whole = !!o.wholeWords;
      const re = wildRe(raw, o, whole);
      return ctx => {
        const spans = []; const hits = [];
        if (whole) ctx.words.forEach((w, i) => { if (i < ctx.w0 || i > ctx.w1) return; re.lastIndex = 0; if (re.test(ctx.nw[i])) { spans.push([i, i]); hits.push({ k: 'word', i }); } });
        else {
          re.lastIndex = 0; const text = ctx.np; let m;
          while ((m = re.exec(text))) {
            if (!m[0].length) { re.lastIndex++; continue; }
            const wi = ctx.wordAt(m.index); if (wi >= ctx.w0 && wi <= ctx.w1) { spans.push([wi, ctx.wordAt(m.index + m[0].length - 1)]); hits.push({ k: 'word', i: wi }); }
          }
        }
        return { ok: spans.length > 0, spans, hits };
      };
    }
    case 'phrase': {
      const parts = norm(node.v, o).match(WORD_RE) || [];
      const res = parts.map((p, k) => wildRe(p, o, o.wholeWords || (k > 0 && k < parts.length - 1)));
      return ctx => {
        const spans = []; const hits = [];
        if (!parts.length) return { ok: false, spans, hits };
        for (let i = ctx.w0; i + parts.length - 1 <= ctx.w1; i++) {
          let ok = true;
          for (let k = 0; k < parts.length && ok; k++) {
            const w = ctx.nw[i + k]; const re = res[k]; re.lastIndex = 0;
            if (o.wholeWords || (k > 0 && k < parts.length - 1)) ok = re.test(w);
            else if (parts.length === 1) ok = re.test(w);
            else if (k === 0) ok = new RegExp(re.source + '$', re.flags.replace('g', '')).test(w);
            else ok = new RegExp('^' + re.source, re.flags.replace('g', '')).test(w);
          }
          if (ok) { spans.push([i, i + parts.length - 1]); hits.push({ k: 'word', i }); }
        }
        return { ok: spans.length > 0, spans, hits };
      };
    }
    case 'strong': {
      const want = strongKey(node.v); const exact = /[a-z]$/i.test(node.v) ? node.v.toUpperCase().replace(/^([GH])0*/, '$1') : null;
      return ctx => {
        const spans = []; const hits = [];
        ctx.segs.forEach((g, i) => { if (i < ctx.g0 || i > ctx.g1) return; if (g.strongs.some(s => exact ? s.toUpperCase().replace(/^([GH])0*/, '$1') === exact : strongKey(s) === want)) { spans.push([g.w0, g.w1]); hits.push({ k: 'seg', i, what: 'strong' }); } });
        return { ok: spans.length > 0, spans, hits };
      };
    }
    case 'morph': {
      let v = node.v; let lemma = null, tag = v, lang = null;
      const at = v.search(/[@%]/);
      if (at >= 0) { lemma = v.slice(0, at) || null; lang = v[at]; tag = v.slice(at + 1) || '*'; }
      const tagRe = globRe(tag, false); const lemRe = lemma ? globRe(norm(lemma, o), o.ignoreCase) : null;
      return ctx => {
        const spans = []; const hits = [];
        ctx.segs.forEach((g, i) => {
          if (i < ctx.g0 || i > ctx.g1) return;
          const tagOk = tag === '*' ? true : g.morphs.some(m => tagRe.test(m) || (lang && tagRe.test(m.replace(/^[@%]/, ''))));
          const lemOk = !lemRe || g.lemmas.some(l => lemRe.test(norm(l, o)));
          if (tagOk && lemOk && (g.morphs.length || g.lemmas.length)) { spans.push([g.w0, g.w1]); hits.push({ k: 'seg', i, what: 'morph' }); }
        });
        return { ok: spans.length > 0, spans, hits };
      };
    }
    case 'NOT': { const a = compile(node.a, o); return ctx => ({ ok: !a(ctx).ok, spans: [], hits: [] }); }
    case 'AND': case 'OR': case 'XOR': case 'NEARV': {
      const a = compile(node.a, o), b = compile(node.b, o); const t = node.t;
      return ctx => {
        const x = a(ctx), y = b(ctx);
        const ok = t === 'OR' ? x.ok || y.ok : t === 'XOR' ? x.ok !== y.ok : x.ok && y.ok;
        const parts = [x, y].filter(r => r.ok);
        return { ok, spans: ok ? parts.flatMap(r => r.spans) : [], hits: ok ? parts.flatMap(r => r.hits) : [] };
      };
    }
    case 'NXT': case 'NEARW': case 'NEARG': {
      const a = compile(node.a, o), b = compile(node.b, o); const t = node.t; const n = node.n;
      return ctx => {
        const x = a(ctx), y = b(ctx); const spans = [];
        if (x.ok && y.ok) for (const p of x.spans) for (const q of y.spans) {
          if (t === 'NXT') { if (q[0] === p[1] + 1 || (q[0] > p[1] && ctx.adjacentSegs(p[1], q[0]))) spans.push([p[0], q[1]]); }
          else if (t === 'NEARW') { const gap = q[0] > p[1] ? q[0] - p[1] - 1 : p[0] > q[1] ? p[0] - q[1] - 1 : 0; if (gap < n) spans.push(p, q); }
          else { const gp = ctx.words[p[0]] ? ctx.words[p[0]].g : 0, gq = ctx.words[q[0]] ? ctx.words[q[0]].g : 0; if (Math.abs(gq - gp) <= n) spans.push(p, q); }
        }
        return { ok: spans.length > 0, spans, hits: spans.length ? x.hits.concat(y.hits) : [] };
      };
    }
    case 'TR': {
      // left side is tested against the tags of each word group, right side against that group's own words/tags
      const a = compile(node.a, o), b = compile(node.b, o);
      return ctx => {
        const spans = []; const hits = [];
        ctx.segs.forEach((g, i) => {
          if (g.w0 < 0 && !g.strongs.length) return;
          const sub = ctx.sub(i);
          if (a(sub).ok && b(sub).ok) { spans.push([g.w0, g.w1]); hits.push({ k: 'seg', i, what: 'tr' }); }
        });
        return { ok: spans.length > 0, spans, hits };
      };
    }
    default: throw new Error('unknown node ' + node.t);
  }
}

function makeCtx(md, o) {
  const np = norm(md.plain, o);
  const nw = md.words.map(w => norm(w.t, o));
  const starts = md.words.map(w => w.s);
  const wordAt = pos => { let lo = 0, hi = starts.length - 1, ans = 0; while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= pos) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; };
  const ctx = {
    words: md.words, segs: md.segs, nw, np, wordAt, w0: 0, w1: md.words.length - 1, g0: 0, g1: md.segs.length - 1,
    adjacentSegs: (wi, wj) => { const gi = md.words[wi] && md.words[wi].g, gj = md.words[wj] && md.words[wj].g; return gi != null && gj != null && gj === gi + 1; },
    sub(i) { const g = md.segs[i]; return Object.assign({}, ctx, { w0: g.w0 < 0 ? 1 : g.w0, w1: g.w0 < 0 ? 0 : g.w1, g0: i, g1: i, np: g.w0 < 0 ? '' : np }); },
  };
  return ctx;
}

/* ------------------------------------------------------------------ ranges */
const PREDEFINED = [
  ['all', 'Whole Bible', ''], ['OT', 'Old Testament (with Apocrypha)', ''], ['OTonly', 'Old Testament without Apocrypha', ''], ['NT', 'New Testament', ''], ['AP', 'Apocrypha only', ''],
  ['law', 'Law (Gen–Deut)', 'Gen-Deut'], ['history', 'History (Josh–Esth)', 'Josh-Esth'], ['wisdom', 'Poetry & Wisdom (Job–Song)', 'Job-Song'],
  ['major', 'Major Prophets (Isa–Dan)', 'Isa-Dan'], ['minor', 'Minor Prophets (Hos–Mal)', 'Hos-Mal'], ['gospels', 'Gospels', 'Matt-John'],
  ['gospelsacts', 'Gospels and Acts', 'Matt-Acts'], ['paul', "Paul's letters (Rom–Phlm)", 'Rom-Phlm'], ['general', 'General letters (Heb–Jude)', 'Heb-Jude'], ['rev', 'Revelation', 'Rev'],
];

/** "Gen-Deut; Matt 5-7; Rom 3:21-26; Ps 23" -> [[from, to]] with keys comparable via refKey */
function parseRange(text, mode) {
  const out = []; const errors = [];
  for (let part of String(text).split(/[;\n]+/)) {
    part = part.trim(); if (!part) continue;
    const m = /^(.+?)(?:\s*[-–]\s*(.+))?$/.exec(part);
    const a = refParts(m[1]); if (!a) { errors.push(part); continue; }
    let from = [a.b, a.c || 1, a.v || 1], to;
    if (!m[2]) to = [a.b, a.c || 999, a.c && a.v ? a.v : 999];
    else {
      const r = m[2].trim();
      const bb = /^[1-4]?\s*[A-Za-zÀ-ÿ]/.test(r) ? refParts(r) : null;
      if (bb) to = [bb.b, bb.c || 999, bb.v || 999];
      else if (/^\d+:\d+$/.test(r)) { const [c, v] = r.split(':').map(Number); to = [a.b, c, v]; }
      else if (/^\d+$/.test(r)) to = a.v ? [a.b, a.c, +r] : [a.b, +r, 999];
      else { errors.push(part); continue; }
    }
    out.push([refKey(from, mode), refKey(to, mode)]);
  }
  return { ranges: out, errors };
}
function refParts(s) {
  const m = /^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]*?)\s*(?:(\d+)(?:\s*[:.]\s*(\d+))?)?$/.exec(s.trim());
  if (!m) return null; const b = canon.findBook(m[1]); if (!b) return null;
  return { b, c: m[2] ? +m[2] : 0, v: m[3] ? +m[3] : 0 };
}
function refKey([b, c, v], mode) { return canon.orderKey(b, mode) * 1e6 + c * 1000 + v; }
function rangeFilter(scope, opts, mode) {
  if (!scope || ['all', 'OT', 'OTonly', 'NT', 'AP'].includes(scope)) return (b) => canon.inScope(b, scope || 'all', mode);
  const def = PREDEFINED.find(p => p[0] === scope);
  let text = def ? def[2] : scope;
  if (scope === 'book' && opts.current) text = canon.book(opts.current.b).abbr;
  if (scope === 'chapter' && opts.current) text = `${canon.book(opts.current.b).abbr} ${opts.current.c}`;
  const { ranges, errors } = parseRange(text, mode);
  if (errors.length) throw new Error('Could not read the range: ' + errors.join('; '));
  return (b, c, v) => { const k = refKey([b, c, v], mode); return ranges.some(([x, y]) => k >= x && k <= y); };
}

/* ------------------------------------------------------------------ the search */
const modelCache = new WeakMap(); // module -> Map("b.c.v" -> model)

/**
 * @param mods  [{id, abbr, mod}] loaded Bible modules
 * @param query string
 * @param opts  {regex, defaultOr, wholeWords, ignoreCase, ignoreDiacritics, ignorePunct, nearV, nearW, scope, current, limit, mode, stats}
 */
function run(mods, query, opts = {}) {
  const o = Object.assign({ ignoreCase: true, ignoreDiacritics: true, wholeWords: false, limit: 2000 }, opts);
  const t0 = Date.now();
  let tree = null, re = null, explanation;
  if (o.regex) {
    try { re = new RegExp(query, 'gu' + (o.ignoreCase ? 'i' : '')); } catch (e) { throw new Error('Regular expression error: ' + e.message); }
    explanation = 'verses matching the regular expression /' + query + '/' + (o.ignoreCase ? ' (ignoring case)' : '');
  } else {
    tree = parse(query, o);
    explanation = 'verses with ' + explain(tree);
  }
  const inRange = rangeFilter(o.scope, o, o.mode);
  const topNearV = tree && tree.t === 'NEARV';
  const matcher = tree ? compile(topNearV ? { t: 'OR', a: tree.a, b: tree.b } : tree, o) : null;
  const left = topNearV ? compile(tree.a, o) : null, right = topNearV ? compile(tree.b, o) : null;
  const results = []; const perBook = {}; let total = 0; const stats = new Map(); const statsByWord = new Map();
  for (const { id, abbr, mod } of mods) {
    let cache = modelCache.get(mod); if (!cache) { cache = new Map(); modelCache.set(mod, cache); }
    const verseHits = []; // for NEARv
    for (const [b, c, v, raw] of mod.allVerses()) {
      if (!raw || !inRange(b, c, v)) continue;
      const k = `${b}.${c}.${v}`;
      let md = cache.get(k); if (!md) { md = model(raw); cache.set(k, md); }
      let spans = [], ok = false, hits = [];
      if (re) {
        const text = o.ignoreDiacritics ? md.plain : md.plain; re.lastIndex = 0; let m;
        const starts = md.words.map(w => w.s);
        const wa = pos => { let a = 0; for (let i = 0; i < starts.length; i++) if (starts[i] <= pos) a = i; return a; };
        while ((m = re.exec(text))) { if (!m[0].length) { re.lastIndex++; continue; } ok = true; spans.push([wa(m.index), wa(m.index + m[0].length - 1)]); hits.push({ k: 'word', i: wa(m.index) }); }
      } else {
        const ctx = makeCtx(md, o);
        if (topNearV) { const x = left(ctx), y = right(ctx); if (x.ok || y.ok) verseHits.push({ b, c, v, md, l: x.ok, r: y.ok, spans: [...(x.ok ? x.spans : []), ...(y.ok ? y.spans : [])] }); continue; }
        const r = matcher(ctx); ok = r.ok; spans = r.spans; hits = r.hits;
      }
      if (!ok) continue;
      addResult(id, abbr, b, c, v, v, md, spans, hits);
    }
    if (topNearV) {
      // a verse with the left term and one with the right term within n verses (same chapter unless allowed)
      const n = tree.n; const span = o.nearAcross ? 'book' : 'chapter';
      for (let i = 0; i < verseHits.length; i++) {
        const h = verseHits[i]; if (!h.l) continue;
        let best = null;
        for (let j = Math.max(0, i - n * 2); j < Math.min(verseHits.length, i + n * 2 + 1); j++) {
          const g = verseHits[j]; if (!g.r) continue;
          if (g.b !== h.b || (span === 'chapter' && g.c !== h.c)) continue;
          if (g.c === h.c && Math.abs(g.v - h.v) <= n) { if (!best || Math.abs(g.v - h.v) < Math.abs(best.v - h.v)) best = g; }
        }
        if (best) { const lo = Math.min(h.v, best.v), hi = Math.max(h.v, best.v); addResult(id, abbr, h.b, h.c, lo, hi, h.md, h.spans, [], best === h ? null : best); }
      }
    }
  }
  function addResult(id, abbr, b, c, v, v2, md, spans, hits, other) {
    total++;
    const bk = `${id}|${b}`; perBook[bk] = (perBook[bk] || 0) + 1;
    if (o.stats !== false) for (const h of hits) {
      if (h.k === 'seg') { const g = md.segs[h.i]; const txt = md.plain.slice(g.s, g.e).trim().replace(/[\s,.;:!?·)\]]+$/, '').replace(/^[\s,.;:!?·(\[]+/, ''); if (txt) { const key = `${h.what}|${(g.strongs[0] || g.morphs[0] || '')}|${txt}`; stats.set(key, (stats.get(key) || 0) + 1); } }
      else { const w = md.words[h.i]; if (w) statsByWord.set(w.t, (statsByWord.get(w.t) || 0) + 1); }
    }
    if (results.length >= o.limit) return;
    const marks = [];
    const lead = md.plain.length - md.plain.trimStart().length;
    for (const [a, z] of spans) { const wa = md.words[a], wz = md.words[z]; if (wa && wz) marks.push([wa.s - lead, wz.e - lead]); }
    results.push({ id, abbr, b, c, v, v2, ref: `${canon.book(b, o.mode).abbr} ${c}:${v}${v2 > v ? '–' + v2 : ''}`, text: md.plain.trim(), marks: mergeMarks(marks), other: other ? `${other.c}:${other.v}` : null });
  }
  const order = mods.map(m => m.id);
  results.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id) || canon.orderKey(x.b, o.mode) - canon.orderKey(y.b, o.mode) || x.c - y.c || x.v - y.v);
  const books = Object.entries(perBook).map(([k, n]) => { const [id, b] = k.split('|'); return { id, b: +b, name: canon.book(+b, o.mode).name, abbr: canon.book(+b, o.mode).abbr, n }; })
    .sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id) || canon.orderKey(x.b, o.mode) - canon.orderKey(y.b, o.mode));
  const statList = [...stats.entries()].map(([k, n]) => { const [what, code, text] = k.split('|'); return { what, code, text, n }; }).sort((a, b) => b.n - a.n).slice(0, 300);
  const wordList = [...statsByWord.entries()].map(([text, n]) => ({ text, n })).sort((a, b) => b.n - a.n).slice(0, 300);
  return { total, results, books, explanation, stats: statList, words: wordList, ms: Date.now() - t0 };
}
function mergeMarks(m) {
  m.sort((a, b) => a[0] - b[0]); const out = [];
  for (const x of m) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}

/** only explain (for the live "understood as" line) */
function describe(query, opts = {}) {
  const o = Object.assign({ ignoreCase: true, ignoreDiacritics: true }, opts);
  if (o.regex) { try { new RegExp(query, 'u'); return { ok: true, text: 'verses matching the regular expression /' + query + '/' }; } catch (e) { return { ok: false, text: e.message }; } }
  try { return { ok: true, text: 'verses with ' + explain(parse(query, o)) }; } catch (e) { return { ok: false, text: e.message }; }
}

module.exports = { run, describe, parse, explain, model, parseRange, PREDEFINED, norm };
