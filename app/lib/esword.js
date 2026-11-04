'use strict';
// e-Sword Bible modules: .bblx (e-Sword 9/10, RTF text) and .bbli (e-Sword 11+, HTML text).
// Supports Protestant 66-book Bibles as well as e-Sword Bibles with Apocrypha / Deuterocanonical OT
// across all common book-numbering schemes (Standard e-Sword / BibleMultiConverter, 1611 KJV 15-book
// and 14-book Apocrypha, Catholic appended, 73-book inline Catholic DRB/Vulgate and NAB/RSV-CE,
// Septuagint / Brenton / Orthodox, and embedded Deuterocanonical chapters in Esther, Daniel, Baruch, and Psalms).
const fs = require('fs');
const path = require('path');
const { openDb } = require('./sqlite');
const canon = require('./canon');
const esw = require('./eswordfmt');

// Known chapter counts of apocryphal books (Timotheos ids), used to warn when the numbering looks wrong.
const AP_CHAPTERS = { 67: 14, 68: 16, 70: 19, 71: 51, 77: 16, 78: 15, 79: 9, 82: 7, 83: 16, 84: 18 };

function str(v) { return v == null ? '' : typeof v === 'string' ? v : Buffer.from(v).toString('utf8'); }

async function load(file, bookMapOverride = {}) {
  const head = Buffer.alloc(16); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  if (head.toString('latin1', 0, 15) !== 'SQLite format 3') throw new Error('encrypted or unknown format – only unencrypted e-Sword Bibles can be opened');
  const db = openDb(file);
  const tables = (db.exec("select name from sqlite_master where type='table'")[0] || { values: [] }).values.map(r => String(r[0]));
  const T = n => tables.find(t => t.toLowerCase() === n);
  const bibleTable = T('bible');
  if (!bibleTable) { db.close(); throw new Error('no Bible table – not an e-Sword Bible, or it is encrypted'); }
  const details = {};
  if (T('details')) {
    const r = db.exec(`select * from ${T('details')} limit 1`)[0];
    if (r) r.columns.forEach((c, i) => { details[c.toLowerCase()] = r.values[0][i]; });
  }
  esw.setOverride(bookMapOverride);

  const rows = db.exec(`select Book, Chapter, max(Verse) from ${bibleTable} group by Book, Chapter order by Book, Chapter`)[0];
  const chCounts = {};
  if (rows) {
    for (const [eb, ec] of rows.values) {
      if (!chCounts[eb] || ec > chCounts[eb]) chCounts[eb] = ec;
    }
  }

  // Sample Chapter 1, Verse 1 for Apocrypha/Deuterocanonical books (eb >= 67) to aid auto-detection
  const firstVerses = {};
  const v1Stmt = db.prepare(`select Scripture from ${bibleTable} where Book = ? and Chapter = 1 and Verse = 1 limit 1`);
  try {
    for (const eb of Object.keys(chCounts).map(Number).filter(x => x >= 67)) {
      v1Stmt.bind([eb]);
      if (v1Stmt.step()) firstVerses[eb] = str(v1Stmt.get()[0]);
      v1Stmt.reset();
    }
  } finally {
    v1Stmt.free();
  }

  const { map, scheme } = esw.detectBookMap(chCounts, firstVerses, bookMapOverride);
  const hasStandalone = new Set();
  for (const eb of Object.keys(chCounts).map(Number)) {
    const mapped = map[eb] || eb;
    if (mapped >= 67) hasStandalone.add(mapped);
  }

  const books = {}; const warnings = [];
  // e-Sword keeps Susanna and Bel and the Dragon as Daniel 13 and 14, Additions to Esther as Esther 11-16,
  // Letter of Jeremiah as Baruch 6, and Psalm 151 as Psalms 151 when not stored as separate books.
  const toT = (eb, ec) => esw.mapChapter(eb, ec, map, hasStandalone);

  const fromT = {}; // "b.c" -> [eb, ec, vOffset]
  let danielEb = null, daniel3MaxV = 0;
  if (rows) for (const [eb, ec, maxv] of rows.values) {
    const rawB = map[eb] || eb;
    const [b, c] = toT(eb, ec);
    fromT[`${b}.${c}`] = [eb, ec, 0];
    // Preserve direct lookup by unsplit canonical chapter (e.g. Dan 13, Dan 14, Esth 11-16, Bar 6, Ps 151)
    if (!fromT[`${rawB}.${ec}`]) fromT[`${rawB}.${ec}`] = [eb, ec, 0];
    // If Additions to Esther are numbered 11..16, also alias chapters 1..6 to 11..16
    if (b === 69 && c > 10 && !fromT[`69.${c - 10}`]) fromT[`69.${c - 10}`] = [eb, ec, 0];
    (books[b] = books[b] || [])[c - 1] = maxv;
    if (rawB === 27 && ec === 3 && maxv > 35) { danielEb = eb; daniel3MaxV = maxv; }
  }

  // If Daniel 3 contains the Deuterocanonical Prayer of Azariah & Song of the Three Children (verses 24..90)
  // and no standalone Book 74 exists, expose it as Book 74, Chapter 1 while keeping Daniel 3 intact.
  const azariahLen = (danielEb !== null && !books[74]) ? Math.min(68, daniel3MaxV - 23) : 0;
  if (azariahLen > 0) {
    books[74] = [azariahLen];
    fromT['74.1'] = [danielEb, 3, 23];
  }

  for (const b in books) {
    const arr = books[b]; for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = 0;
    if (AP_CHAPTERS[b] && AP_CHAPTERS[b] !== arr.length) warnings.push(`${canon.book(+b).name}: module has ${arr.length} chapters, expected ${AP_CHAPTERS[b]} – the e-Sword book numbering may differ (see README)`);
  }
  if ((books[75] || books[76]) && !hasStandalone.has(75)) warnings.push('Daniel 13 and 14 of this e-Sword Bible are shown as Susanna and Bel and the Dragon');
  if (books[69] && !hasStandalone.has(69)) warnings.push('Esther 11 and later of this e-Sword Bible are shown as The Rest of Esther');
  if (books[73] && !hasStandalone.has(73)) warnings.push('Baruch 6 of this e-Sword Bible is shown as Letter of Jeremiah (Epistle of Jeremy)');
  if (azariahLen > 0) warnings.push('Daniel 3:24–90 of this e-Sword Bible is also shown as Prayer of Azariah (Song of the Three Children)');

  const notesTable = T('notes');
  const stmt = db.prepare(`select Scripture from ${bibleTable} where Book = ? and Chapter = ? and Verse = ?`);
  const noteStmt = notesTable ? db.prepare(`select ID, Note from ${notesTable} where Book = ? and Chapter = ? and Verse = ?`) : null;
  function notesFor(eb, c, v, text) {
    if (!noteStmt || !/<not>/i.test(text)) return null;
    const out = {}; noteStmt.bind([eb, c, v]);
    while (noteStmt.step()) { const [id, n] = noteStmt.get(); out[str(id)] = esw.eswordToHtml(str(n)); }
    noteStmt.reset(); return out;
  }
  const abbr = details.abbreviation || path.basename(file).replace(/\.(bblx|bbli|bbl)$/i, '');
  const cache = new Map();
  const conv = (eb, c, v, s) => '<_HTML_>' + esw.eswordToHtml(s, notesFor(eb, c, v, s), true);
  return {
    id: 'es:' + path.basename(file), file, format: 'e-Sword', kind: 'esword', eswordScheme: scheme,
    abbr: String(abbr), title: String(details.title || details.description || abbr),
    props: details, rules: [], books, warnings,
    about: details.information || details.comments ? esw.eswordToHtml(str(details.information || details.comments)) : '',
    rtl: details.righttoleft == 1,
    hasStrongs: !!(details.strongs || details.strong),
    getVerse(b, c, v) {
      const k = `${b}.${c}.${v}`;
      if (cache.has(k)) return cache.get(k);
      const src = fromT[`${b}.${c}`]; if (!src) return null;
      const [eb, ec, vOff] = src;
      const ev = v + (vOff || 0);
      stmt.bind([eb, ec, ev]);
      let html = null;
      if (stmt.step()) html = conv(eb, ec, ev, str(stmt.get()[0]));
      stmt.reset();
      if (cache.size > 1500) cache.clear();
      cache.set(k, html);
      return html;
    },
    close() { try { stmt.free(); if (noteStmt) noteStmt.free(); db.close(); } catch (e) { /* closed */ } },
    *allVerses() {
      const r = db.exec(`select Book, Chapter, Verse, Scripture from ${bibleTable} order by Book, Chapter, Verse`)[0];
      if (!r) return;
      for (const [eb, ec, v, s] of r.values) {
        const [b, c] = toT(eb, ec);
        const h = conv(eb, ec, v, str(s));
        yield [b, c, v, h];
        if (azariahLen > 0 && eb === danielEb && ec === 3 && v >= 24 && v < 24 + azariahLen) {
          yield [74, 1, v - 23, h];
        }
      }
    },
  };
}

module.exports = { load };
