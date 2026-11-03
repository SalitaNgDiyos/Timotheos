'use strict';
// theWord *book* modules (.gbk.twm) that hold Bible text chapter by chapter – e.g. the
// "King James Version Apocrypha" module (id DeuteroKJV). Topics are named "<Book> <chapter>"
// (or a single-chapter book's own title) and verses are marked with RTF bookmarks v1, v2, …
const fs = require('fs');
const path = require('path');
const { openDb } = require('./sqlite');
const { rtfToHtml } = require('./rtf');
const canon = require('./canon');

const TITLE_HINTS = [
  [/azariah|three (holy )?children/i, 74], [/susanna/i, 75], [/\bbel\b/i, 76], [/manass/i, 80],
  [/first book of esdras/i, 79], [/second book of esdras/i, 83], [/tobit/i, 67], [/judith/i, 68],
  [/additions to esther|rest of esther/i, 69], [/wisdom of solomon|book of wisdom/i, 70], [/sirach|ecclesiasticus/i, 71],
  [/baruch/i, 72], [/jeremy|letter of jeremiah/i, 73], [/first book of the maccabees/i, 77], [/second book of the maccabees/i, 78],
  [/third book of the maccabees/i, 82], [/fourth book of the maccabees/i, 84], [/psalm 151/i, 81],
];

function bookFromName(name) {
  for (const [re, id] of TITLE_HINTS) if (re.test(name)) return id;
  return canon.findBook(name);
}

/** split one chapter's RTF into verses using the v1, v2 … bookmarks; convert each verse separately */
function splitVerses(rtf) {
  const body0 = rtf.indexOf('\\pard');
  const header = body0 > 0 ? rtf.slice(0, body0) : '{\\rtf1 ';
  const body = body0 > 0 ? rtf.slice(body0) : rtf;
  const re = /\{\\\*\\bkmkstart v(\d+)\}\{\\\*\\bkmkend v\d+\}(\{[^{}]*\\super[^{}]*\})?/g;
  const verses = [];
  const marks = [...body.matchAll(re)];
  const clean = h => h.replace(/^(\s|<br>)+/, '').replace(/(\s|<br>)+$/, '');
  if (!marks.length) {
    // no verse markers (e.g. Prayer of Manasseh): drop the title paragraph, keep the rest as verse 1
    const firstPar = body.search(/\\par\b/);
    const html = clean(rtfToHtml(header + (firstPar >= 0 ? body.slice(firstPar + 4) : body) + '}', { inline: true }));
    if (html) verses[1] = html;
    return verses;
  }
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : body.length;
    // carry the character formatting in force at the bookmark (plain \f1\fs20 …)
    verses[+marks[i][1]] = clean(rtfToHtml(header + '\\plain ' + body.slice(start, end) + '}', { inline: true }));
  }
  return verses;
}

function bytesToStr(v) { return v == null ? '' : typeof v === 'string' ? v : Buffer.from(v).toString('utf8'); }

/** quick check whether a .gbk.twm looks like chapter-by-chapter Bible text */
async function probe(file) {
  const st = fs.statSync(file);
  if (st.size > 80 * 1024 * 1024) return false;
  const db = openDb(file);
  try {
    const r = db.exec("select t.subject, c.data from topics t join content c on c.topic_id = t.id where t.subject like '% 1' limit 5")[0];
    if (!r) return false;
    return r.values.some(([s, d]) => /bkmkstart v\d+/.test(bytesToStr(d)) && bookFromName(bytesToStr(s).replace(/\s+\d+$/, '')));
  } finally { db.close(); }
}

async function load(file) {
  const db = openDb(file);
  const cfg = {};
  const cr = db.exec('select name, value from config')[0];
  if (cr) for (const [k, v] of cr.values) cfg[String(k).toLowerCase()] = bytesToStr(v);
  const topics = db.exec('select id, pid, subject from topics order by rel_order')[0];
  const children = new Map();
  for (const [id, pid] of topics.values) if (pid) children.set(pid, (children.get(pid) || 0) + 1);
  const chapterTopic = {}; // "b.c" -> topic id
  const books = {}; const warnings = [];
  for (const [id, pid, subj] of topics.values) {
    const s = bytesToStr(subj).trim();
    let b = null, c = null;
    const m = /^(.*\S)\s+(\d+)$/.exec(s);
    if (m && (b = bookFromName(m[1]))) c = +m[2];
    else if (!pid && !children.get(id) && (b = bookFromName(s))) c = 1;   // one-chapter book stored in its title topic
    if (!b && /^prologues?$/i.test(s) && pid) { const ps = topics.values.find(r => r[0] === pid); const pb = ps && bookFromName(bytesToStr(ps[2])); if (pb) { chapterTopic[`${pb}.1.prologue`] = id; } continue; }
    if (!b || !c) continue;
    chapterTopic[`${b}.${c}`] = id;
    (books[b] = books[b] || []);
  }
  const getContent = db.prepare('select data from content where topic_id = ?');
  const parsed = new Map();
  function chapter(b, c) {
    const k = `${b}.${c}`;
    if (parsed.has(k)) return parsed.get(k);
    const tid = chapterTopic[k]; let verses = null;
    if (tid !== undefined) {
      getContent.bind([tid]);
      if (getContent.step()) {
        const rtf = bytesToStr(getContent.get()[0]);
        verses = splitVerses(rtf, chapterTopic[k + '.noverses']);
      }
      getContent.reset();
    }
    // a prologue (e.g. Sirach) becomes verse 0 of chapter 1
    if (verses && c === 1 && chapterTopic[`${b}.1.prologue`] !== undefined) {
      getContent.bind([chapterTopic[`${b}.1.prologue`]]);
      if (getContent.step()) { const pv = splitVerses(bytesToStr(getContent.get()[0])); verses[0] = pv[1]; }
      getContent.reset();
    }
    parsed.set(k, verses);
    return verses;
  }
  // verse counts per chapter (parse lazily on first navigation would be nicer, but counts are needed for the menus)
  for (const k of Object.keys(chapterTopic).filter(x => !x.endsWith('.prologue'))) {
    const [b, c] = k.split('.').map(Number);
    const vs = chapter(b, c);
    books[b][c - 1] = vs ? vs.length - 1 : 0;
  }
  for (const b in books) for (let i = 0; i < books[b].length; i++) if (!books[b][i]) books[b][i] = 0;
  const abbr = cfg.abbrev || cfg.id || path.basename(file).replace(/\.gbk\.twm$/i, '');
  return {
    id: 'bk:' + path.basename(file), file, format: 'theWord book (Bible text)', kind: 'twbook',
    abbr, title: cfg.title || abbr, props: cfg, rules: [], books, warnings, rtl: cfg.r2l === '1', hasStrongs: false,
    close() { try { getContent.free(); db.close(); } catch (e) { /* closed */ } },
    getVerse(b, c, v) {
      const vs = chapter(b, c); if (!vs) return null;
      return vs[v] == null ? null : '<_HTML_>' + vs[v];
    },
    *allVerses() {
      for (const b of Object.keys(books).map(Number).sort((x, y) => x - y))
        for (let c = 1; c <= books[b].length; c++) { const vs = chapter(b, c) || []; for (let v = 1; v < vs.length; v++) if (vs[v] != null) yield [b, c, v, '<_HTML_>' + vs[v]]; }
    },
  };
}

module.exports = { load, probe };
