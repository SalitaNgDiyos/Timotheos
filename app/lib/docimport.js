/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Turns a read document (lib/docread.js) into one of three things the user chose:
//   book   – an editable Library book (.gbk.twm), one topic per heading, nested by heading level
//   bible  – a USFM Bible, from lines such as "Genesis", "Chapter 2" and "3 In the beginning…"
//   notes  – My Study verse notes, from paragraphs that start with a verse reference ("John 3:16 …")
const fs = require('fs');
const path = require('path');
const canon = require('./canon');
const usfm = require('./usfm');
const usermod = require('./usermod');
const docread = require('./docread');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** blocks → [{title, parent (index or -1), html}] by headings (Heading 1 > Heading 2 …) */
function sectionize(blocks, fallbackTitle) {
  const secs = []; const stack = [];     // stack of {level, idx}
  let cur = null;
  const open = (title, parent) => { cur = { title, parent, html: '' }; secs.push(cur); return secs.length - 1; };
  const hasHeading = blocks.some(b => b.h);
  for (const b of blocks) {
    if (b.h) {
      while (stack.length && stack[stack.length - 1].level >= b.h) stack.pop();
      const idx = open(b.text.slice(0, 200), stack.length ? stack[stack.length - 1].idx : -1);
      stack.push({ level: b.h, idx });
    } else {
      if (!cur) open(hasHeading ? 'Beginning' : fallbackTitle, -1);
      cur.html += b.html;
    }
  }
  if (!secs.length) open(fallbackTitle, -1);
  for (const s of secs) if (!s.html) s.html = '<p></p>';
  return secs;
}

const cleanName = f => path.basename(f).replace(/\.(txt|text|rtf|docx|odt)$/i, '').replace(/[_]+/g, ' ').trim() || 'Document';

async function buildBook(file, destDir, title) {
  const doc = docread.read(file);
  const secs = sectionize(doc.blocks, title);
  const abbr = title.replace(/[^A-Za-z0-9]+/g, '').slice(0, 8) || 'Doc';
  const out = await usermod.createBookFromSections({ title, abbr, description: `Imported from ${path.basename(file)}`, fileName: title }, destDir, secs);
  const withHeads = doc.headings > 0;
  return { file: out, sections: secs.length, words: doc.words, pics: doc.pics, skippedPics: doc.skippedPics, headings: doc.headings, withHeads };
}

/* ------------------------------------------------------------------ Bible */
const CODE_FOR = (() => { const m = new Map(); for (const [code, id] of Object.entries(canon.UBS_CODES)) if (!m.has(id)) m.set(id, code); return m; })();
const bookName = id => { const b = canon.BOOKS.find(x => x[0] === id); return b ? b[1] : String(id); };

function buildUsfm(blocks, title, fileTitle) {
  const books = new Map();                 // id → [{c, v, text}] in order
  let book = 0, chap = 0, verse = 0, lastText = null;
  const startBook = id => { book = id; chap = 0; verse = 0; lastText = null; if (!books.has(id)) books.set(id, { chapters: new Map() }); };
  const put = (c, v, t) => {
    const bk = books.get(book); if (!bk) return;
    if (!bk.chapters.has(c)) bk.chapters.set(c, []);
    const vs = bk.chapters.get(c); const o = { v, text: t.trim() }; vs.push(o); chap = c; verse = v; lastText = o;
  };
  // inline verse numbers: after verse n, "… n+1 Text" starts verse n+1 (only the expected number counts)
  const splitInline = (c, v, t) => {
    let cur = v, rest = t;
    for (;;) {
      const re = new RegExp(`\\s${cur + 1}[.:)]?\\s+(?=[^\\s\\d])`);
      const m = re.exec(rest);
      if (!m) break;
      put(c, cur, rest.slice(0, m.index)); rest = rest.slice(m.index + m[0].length); cur++;
    }
    put(c, cur, rest);
  };
  const bookOf = s => {
    const t = s.replace(/^(?:the\s+)?(?:book|aklat)\s+(?:of|ng)\s+/i, '').replace(/[.:]+$/, '').trim();
    if (!t || /\d{2,}/.test(t) || t.length > 40) return 0;
    return canon.findBook(t) || 0;
  };
  const defaultBook = bookOf(fileTitle) || 0;
  for (const b of blocks) {
    const lines = (b.text || '').split('\n');
    for (let raw of lines) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      // "Genesis 1:1 In the beginning"
      let m = /^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Za-zÀ-ÿ.'-]+){0,2})\s+(\d{1,3})\s*[:.]\s*(\d{1,3})\s*[-–.]?\s+(\S.*)$/.exec(line);
      if (m) { const id = bookOf(m[1]); if (id) { if (id !== book) startBook(id); splitInline(+m[2], +m[3], m[4]); continue; } }
      // a book heading
      const bid = (b.h || line.length <= 40) && !/\d{3,}/.test(line) ? bookOf(line) : 0;
      if (bid && !/^\d+\s/.test(line)) { startBook(bid); continue; }
      // "Genesis 2" / "Chapter 2" / "Psalm 23" / "2"
      m = /^(?:chapter|kabanata|kapitulo|awit|psalm|ch\.?)?\s*(\d{1,3})$/i.exec(line);
      if (m && (b.h || /^[A-Za-z]/.test(line) || /^\d+$/.test(line)) && book) { chap = +m[1]; verse = 0; lastText = null; if (!books.get(book).chapters.has(chap)) books.get(book).chapters.set(chap, []); continue; }
      m = /^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Za-zÀ-ÿ.'-]+){0,2})\s+(\d{1,3})$/.exec(line);
      if (m && b.h) { const id = bookOf(m[1]); if (id) { if (id !== book) startBook(id); chap = +m[2]; verse = 0; lastText = null; if (!books.get(book).chapters.has(chap)) books.get(book).chapters.set(chap, []); continue; } }
      // "3 In the beginning…"
      m = /^(\d{1,3})\s*[.):\-–]?\s+(\S.*)$/.exec(line);
      if (m) {
        if (!book && defaultBook) startBook(defaultBook);
        if (book) { if (!chap) chap = 1; if (!books.get(book).chapters.has(chap)) books.get(book).chapters.set(chap, []); splitInline(chap, +m[1], m[2]); continue; }
      }
      // [1] text
      m = /^\[(\d{1,3})\]\s*(\S.*)$/.exec(line);
      if (m && (book || defaultBook)) { if (!book) startBook(defaultBook); if (!chap) chap = 1; if (!books.get(book).chapters.has(chap)) books.get(book).chapters.set(chap, []); splitInline(chap, +m[1], m[2]); continue; }
      // a continuation of the verse before it
      if (lastText) lastText.text += ' ' + line;
    }
  }
  const texts = []; let nb = 0, nc = 0, nv = 0;
  for (const [id, bk] of [...books].sort((a, b) => a[0] - b[0])) {
    const chs = [...bk.chapters].filter(([, vs]) => vs.length).sort((a, b) => a[0] - b[0]);
    if (!chs.length) continue;
    const name = bookName(id);
    let o = `\\id ${CODE_FOR.get(id) || 'XXA'} ${title}\n\\h ${name}\n\\toc1 ${name}\n\\mt ${name}\n`;
    for (const [c, vs] of chs) {
      o += `\\c ${c}\n\\p\n`; nc++;
      for (const v of vs) { if (!v.text) continue; o += `\\v ${v.v} ${v.text.replace(/\\/g, '/')}\n`; nv++; }
    }
    texts.push(o); nb++;
  }
  return { texts, books: nb, chapters: nc, verses: nv };
}

async function buildBible(file, destDir, title) {
  const doc = docread.read(file);
  const r = buildUsfm(doc.blocks, title, cleanName(file));
  if (!r.verses) return { error: 'no verses were found. A Bible text needs book names (e.g. "Genesis" on its own line), chapters ("Chapter 2" or "Genesis 2") and verse numbers at the start of each verse ("3 In the beginning…"). Try importing it as a Library book instead.' };
  const out = path.join(destDir, title.replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.usfm');
  usfm.bundleUsfmTexts(r.texts, out, title);
  return Object.assign(r, { file: out, words: doc.words, pics: doc.pics });
}

/* ------------------------------------------------------------------ notes */
function buildNotes(blocks) {
  const refStart = /^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Za-zÀ-ÿ.'-]+){0,2})\s+(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?(?:\s*[-–]\s*\d{1,3})?(?=$|[\s:.\-–—)])/;
  const notes = new Map(); let key = null, skipped = 0;
  for (const b of blocks) {
    const t = (b.text || '').trim();
    const m = t ? refStart.exec(t) : null;
    let id = 0;
    if (m) { id = canon.findBook(m[1].replace(/\s+/g, ' ').trim()) || 0; }
    if (m && id) {
      const r = canon.normalizeRef({ b: id, c: +m[2], v: m[3] ? +m[3] : 1 });
      key = `${r.b}.${r.c}.${r.v}`;
      notes.set(key, (notes.get(key) || '') + (b.h ? `<p><b>${b.html}</b></p>` : b.html));
    } else if (key) {
      notes.set(key, notes.get(key) + (b.h ? `<p><b>${b.html}</b></p>` : b.html));
    } else skipped++;
  }
  return { notes, skipped };
}

async function addNotes(file, userData) {
  const doc = docread.read(file);
  const r = buildNotes(doc.blocks);
  if (!r.notes.size) return { error: 'no verse references were found. Notes need paragraphs that start with a reference such as "John 3:16" or "Rom 8:28-30". Try importing it as a Library book instead.' };
  const ud = userData.get(); const notes = Object.assign({}, ud.notes);
  let merged = 0;
  for (const [k, html] of r.notes) {
    const old = notes[k];
    if (old && old.html && old.html.includes(html)) continue;       // the same import twice adds nothing
    notes[k] = { html: old && old.html ? old.html + '<hr>' + html : html, t: Date.now() };
    if (old && old.html) merged++;
  }
  userData.set('notes', notes);
  return { count: r.notes.size, merged, skipped: r.skipped, words: doc.words, pics: doc.pics };
}

module.exports = { sectionize, buildBook, buildBible, buildUsfm, buildNotes, addNotes, cleanName };
