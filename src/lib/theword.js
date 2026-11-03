'use strict';
// Reader for theWord Bible modules (.ont / .ot / .nt, unencrypted, UTF-8 or ANSI).
// Supports verse.rule (with toggle=, ot_only=1, nt_only=1, onsearch=1, regex_off=1, ignorecase)
// and tag.rule="prefix" "match_pattern" "replacement", plus per-Bible dictionary properties.
const fs = require('fs');
const path = require('path');
const canon = require('./canon');

/** Parse one quoted-argument list like  "a ""b""" "c" "toggle=x"  */
function parseQuotedArgs(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      let j = i + 1, buf = '';
      while (j < s.length) {
        if (s[j] === '"') { if (s[j + 1] === '"') { buf += '"'; j += 2; continue; } break; }
        buf += s[j++];
      }
      out.push(buf); i = j + 1;
    } else {
      let j = i; while (j < s.length && !/\s/.test(s[j])) j++;
      out.push(s.slice(i, j)); i = j;
    }
  }
  return out;
}

/** Convert a theWord/PCRE replacement string ($1, \1) to a JS one. */
function jsReplacement(r) {
  return r.replace(/\\(\d)/g, '$$$1');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileRules(props) {
  const rules = [];
  for (const raw of (props._rules || [])) {
    const args = parseQuotedArgs(raw);
    if (args.length < 2) continue;
    let [pat, rep, ...opts] = args;
    const optStr = opts.join(' ');
    let flags = 'g';
    if (/\bignorecase\b|\bi\b/.test(optStr)) flags += 'i';
    const toggle = (optStr.match(/toggle=(\^?[\w]+)/) || [])[1] || null;
    const onsearch = /\bonsearch=1\b/.test(optStr);
    const otOnly = /\bot_only=1\b/.test(optStr);
    const ntOnly = /\bnt_only=1\b/.test(optStr);
    const regexOff = /\bregex_off=1\b/.test(optStr);
    try {
      if (regexOff) {
        pat = escapeRegex(pat);
        rep = rep.replace(/\$/g, '$$$$');
      } else {
        // PCRE -> JS: possessive quantifiers and atomic groups are rare in modules; strip them.
        pat = pat.replace(/\(\?>/g, '(?:').replace(/([*+?}])\+/g, '$1');
        rep = jsReplacement(rep);
      }
      rules.push({ re: new RegExp(pat, flags + 'u'), rep, toggle, onsearch, otOnly, ntOnly, regexOff, src: raw });
    } catch (e) {
      try { rules.push({ re: new RegExp(pat, flags), rep, toggle, onsearch, otOnly, ntOnly, regexOff, src: raw }); }
      catch (e2) { rules.push({ error: e2.message, src: raw }); }
    }
  }
  return rules;
}

/** Compile tag.rule="prefix" "match_pattern" "replacement" entries */
function compileTagRules(props) {
  const out = [];
  for (const raw of (props._tagRules || [])) {
    const args = parseQuotedArgs(raw);
    if (args.length < 3) continue;
    let [prefix, pat, rep] = args;
    try {
      pat = pat.replace(/\(\?>/g, '(?:').replace(/([*+?}])\+/g, '$1');
      out.push({ prefix, re: new RegExp(pat, 'gu'), rep: jsReplacement(rep), src: raw });
    } catch (e) {
      try { out.push({ prefix, re: new RegExp(pat, 'g'), rep: jsReplacement(rep), src: raw }); }
      catch (e2) { out.push({ error: e2.message, src: raw }); }
    }
  }
  return out;
}

function decode(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.slice(3).toString('utf8');
  const s = buf.toString('utf8');
  // if invalid UTF-8 (replacement chars), fall back to Windows-1252
  if (s.includes('')) return new TextDecoder('windows-1252').decode(buf);
  return s;
}

function load(file) {
  const ext = path.extname(file).toLowerCase().slice(1); // ont | ot | nt
  const kind = { ont: 'ont', ot: 'ot', nt: 'nt' }[ext];
  if (!kind) throw new Error('Not a theWord Bible module: ' + file);
  const text = decode(fs.readFileSync(file));
  const lines = text.replace(/\r+\n/g, '\n').split(/\r\n|\n|\r/);
  const count = kind === 'ont' ? canon.ONT_TOTAL : kind === 'ot' ? canon.OT_LINES : canon.NT_LINES;
  if (lines.length < count) throw new Error(`Only ${lines.length} lines; a .${ext} module needs ${count} verse lines`);
  const verses = lines.slice(0, count);
  // properties: key=value, values continue onto the next line when they end with a backslash
  const props = { _rules: [], _tagRules: [] };
  let key = null, val = '';
  const flush = () => {
    if (key === null) return;
    if (key === 'verse.rule') props._rules.push(val);
    else if (key === 'tag.rule') props._tagRules.push(val);
    else props[key] = val;
    key = null; val = '';
  };
  for (const ln of lines.slice(count)) {
    if (key !== null) {
      if (val.endsWith('\\')) { val = val.slice(0, -1) + '\n' + ln; continue; }
      flush();
    }
    const m = ln.match(/^\s*([\w.\-]+)\s*=(.*)$/);
    if (m) { key = m[1].toLowerCase(); val = m[2]; }
  }
  if (key !== null) { if (val.endsWith('\\')) val = val.slice(0, -1); flush(); }

  const id = 'tw:' + path.basename(file);
  const books = {};
  const range = kind === 'ont' ? [1, 66] : kind === 'ot' ? [1, 39] : [40, 66];
  for (let b = range[0]; b <= range[1]; b++) books[b] = canon.kjvChapters(b);
  return {
    id, file, format: 'theWord', kind,
    abbr: (props['short.title'] || path.basename(file, '.' + ext)).trim(),
    title: (props['title'] || props['description'] || props['short.title'] || path.basename(file)).split('\n')[0].trim(),
    props, rules: compileRules(props), tagRules: compileTagRules(props), books,
    rtl: props['r2l'] === '1',
    hasStrongs: verses.some(v => /<W[GH]\d/.test(v)),
    strongsDct: props['strongs.dct'] || null,
    morphDct: props['morph.dct'] || null,
    lemmaDct: props['lemma.dct'] || null,
    getVerse(b, c, v) {
      const i = canon.ontLine(b, c, v, kind);
      return i < 0 ? null : (verses[i] || '');
    },
    *allVerses() {
      for (let b = range[0]; b <= range[1]; b++) {
        const ch = books[b];
        for (let c = 1; c <= ch.length; c++) for (let v = 1; v <= ch[c - 1]; v++) yield [b, c, v, this.getVerse(b, c, v)];
      }
    },
  };
}

module.exports = { load, parseQuotedArgs, compileRules, compileTagRules };
