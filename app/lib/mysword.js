/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// MySword (mysword.info) Bibles: .bbl.mybible, an SQLite file with a Details table (one row) and a Bible table
// (Book, Chapter, Verse, Scripture). The verse text is GBF-style, the same tags as theWord (<WG123>, <TS>..<Ts>, <RF>..<Rf>,
// <FI>..<Fi>, <FR>..<Fr>, <CM>, <PI1>...), so it goes to the same renderer unchanged. Commentaries, dictionaries, books and
// journals (.cmt/.dct/.bok/.jor.mybible) are read by bookmod.js.
const fs = require('fs');
const path = require('path');
const { openDb } = require('./sqlite');
const canon = require('./canon');
const esw = require('./eswordfmt');

const MY_BIBLE = /\.bbl\.mybible$/i;
const MY_BOOK = /\.(cmt|dct|bok|book|jor)\.mybible$/i;

function str(v) { return v == null ? '' : typeof v === 'string' ? v : Buffer.from(v).toString('utf8'); }

/** true when the file starts like an SQLite database */
function isSqlite(file) {
  try { const h = Buffer.alloc(16); const fd = fs.openSync(file, 'r'); fs.readSync(fd, h, 0, 16, 0); fs.closeSync(fd); return h.toString('latin1', 0, 15) === 'SQLite format 3'; }
  catch (e) { return false; }
}

/**
 * Details.VerseRules: one rule per line, tab-separated: pattern, replacement, [alternate replacement], [toggle name].
 * Returned in theWord's verse.rule notation, which the renderer already understands:
 *   "pattern" "replacement" [toggle=name]        and, with an alternate, a second rule  "pattern" "alternate" toggle=^name
 */
function convertRules(text) {
  const out = [];
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const f = line.split('\t');
    if (f.length < 2 || !f[0]) continue;
    const toggle = (f[3] || '').trim().replace(/[^\w]/g, '');
    out.push(`${q(f[0])} ${q(f[1])}${toggle ? ' toggle=' + toggle : ''}`);
    if (toggle && f[2] != null && f[2] !== '') out.push(`${q(f[0])} ${q(f[2])} toggle=^${toggle}`);
  }
  return out;
}

/** the verse text with what the renderer does not know taken out (<RX43.3.16> cross-reference marks) */
function clean(s) { return s.replace(/<RX[^>]*>/g, ''); }

async function load(file, bookMapOverride = {}) {
  if (!isSqlite(file)) throw new Error('not a MySword module – the file is not an SQLite database (it may be encrypted)');
  const db = openDb(file);
  const tables = (db.exec("select name from sqlite_master where type in ('table','view')")[0] || { values: [] }).values.map(r => String(r[0]));
  const T = n => tables.find(t => t.toLowerCase() === n);
  const bibleTable = T('bible');
  if (!bibleTable) { db.close(); throw new Error('no Bible table – not a MySword Bible'); }
  const details = {};
  if (T('details')) {
    const r = db.exec(`select * from "${T('details')}" limit 1`)[0];
    if (r) r.columns.forEach((c, i) => { details[c.toLowerCase()] = r.values[0][i]; });
  }
  esw.setOverride(bookMapOverride);

  const rows = db.exec(`select Book, Chapter, max(Verse) from "${bibleTable}" group by Book, Chapter order by Book, Chapter`)[0];
  const chCounts = {};
  if (rows) for (const [eb, ec] of rows.values) if (!chCounts[eb] || ec > chCounts[eb]) chCounts[eb] = ec;

  const firstVerses = {};
  const v1 = db.prepare(`select Scripture from "${bibleTable}" where Book = ? and Chapter = 1 and Verse = 1 limit 1`);
  try {
    for (const eb of Object.keys(chCounts).map(Number).filter(x => x >= 67)) { v1.bind([eb]); if (v1.step()) firstVerses[eb] = str(v1.get()[0]); v1.reset(); }
  } finally { v1.free(); }
  const { map, scheme } = esw.detectBookMap(chCounts, firstVerses, bookMapOverride);
  const hasStandalone = new Set();
  for (const eb of Object.keys(chCounts).map(Number)) { const m = map[eb] || eb; if (m >= 67) hasStandalone.add(m); }

  const books = {}, fromT = {};   // fromT: "b.c" -> [mysword book, chapter]
  if (rows) for (const [eb, ec, maxv] of rows.values) {
    const [b, c] = esw.mapChapter(eb, ec, map, hasStandalone);
    fromT[`${b}.${c}`] = [eb, ec];
    (books[b] = books[b] || [])[c - 1] = maxv;
  }
  for (const b in books) { const a = books[b]; for (let i = 0; i < a.length; i++) if (!a[i]) a[i] = 0; }

  const stmt = db.prepare(`select Scripture from "${bibleTable}" where Book = ? and Chapter = ? and Verse = ?`);
  const abbr = str(details.abbreviation) || path.basename(file).replace(/\.bbl\.mybible$/i, '');
  const title = str(details.description) || str(details.title) || abbr;
  const lang = str(details.language).trim().toLowerCase();
  const props = { _rules: convertRules(str(details.verserules)), _tagRules: [], lang, language: lang, description: str(details.description), version: str(details.version),
    versiondate: str(details.versiondate), publishdate: str(details.publishdate), abbreviation: abbr };
  if (details.customcss) props.customcss = str(details.customcss);
  let hasStrongs = details.strong == 1;
  if (details.strong == null) { try { hasStrongs = !!(db.exec(`select 1 from "${bibleTable}" where Scripture like '%<WG%' or Scripture like '%<WH%' limit 1`)[0]); } catch (e) { /* no */ } }
  const cache = new Map();
  return {
    id: 'my:' + path.basename(file), file, format: 'MySword', kind: 'mysword', eswordScheme: scheme,
    abbr, title, props, rules: [], tagRules: [], books, warnings: [],
    about: details.comments ? esw.htmlish(str(details.comments)) : '',
    rtl: details.righttoleft == 1,
    hasStrongs,
    strongsDct: null, morphDct: null, lemmaDct: null,
    getVerse(b, c, v) {
      const k = `${b}.${c}.${v}`;
      if (cache.has(k)) return cache.get(k);
      const src = fromT[`${b}.${c}`]; if (!src) return null;
      stmt.bind([src[0], src[1], v]);
      let t = null;
      if (stmt.step()) t = clean(str(stmt.get()[0]));
      stmt.reset();
      if (cache.size > 1500) cache.clear();
      cache.set(k, t);
      return t;
    },
    close() { try { stmt.free(); db.close(); } catch (e) { /* closed */ } },
    *allVerses() {
      const r = db.exec(`select Book, Chapter, Verse, Scripture from "${bibleTable}" order by Book, Chapter, Verse`)[0];
      if (!r) return;
      for (const [eb, ec, v, s] of r.values) { const [b, c] = esw.mapChapter(eb, ec, map, hasStandalone); yield [b, c, v, clean(str(s))]; }
    },
  };
}

/** what a MySword file holds, judged by its tables (not by its file name): 'bible' | 'commentary' | 'dictionary' | 'book' | 'notes' | null */
function kindOfTables(tables) {
  const t = new Set(tables.map(x => String(x).toLowerCase()));
  if (t.has('bible')) return 'bible';
  if (t.has('commentary')) return 'commentary';
  if (t.has('dictionary')) return 'dictionary';
  if (['notes', 'highlights', 'bookmarks', 'verselists', 'favorites', 'history', 'prayers'].some(x => t.has(x)) && !t.has('details')) return 'notes';
  if (t.has('details') && [...t].some(x => !['details', 'android_metadata', 'sqlite_sequence'].includes(x) && !x.startsWith('sqlite_'))) return 'book';
  return null;
}
/** opens the file just far enough to say what it is: the same words as kindOfTables, or null when it is not a MySword database */
function probe(file) {
  if (!isSqlite(file)) return null;
  let db;
  try {
    db = openDb(file);
    return kindOfTables((db.exec("select name from sqlite_master where type in ('table','view')")[0] || { values: [] }).values.map(r => String(r[0])));
  } catch (e) { return null; } finally { try { db && db.close(); } catch (e) { /* closed */ } }
}

module.exports = { kindOfTables, probe, load, convertRules, isSqlite, MY_BIBLE, MY_BOOK };
