/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// The arrangement of books, chapters and verses made in iBiblia, read from the
// small "<module>.order" file that iBiblia writes next to an exported module.
//
// File format (UTF-8 text):
//   ibiblia-order 1
//   B 40            a book, in the order wanted
//   C 40:1          a chapter (its own book : its own number), listed under the last B
//   V 40:1:1-25     verses (book:chapter:from-to), listed under the last C
//   # comment
// Only the order changes: every chapter and verse keeps its own number. A
// verse can sit under another chapter, a chapter under another book.
//
// In the Bible view a chapter is reached by a number inside its book. A chapter
// that belongs to that book keeps its own number; one dragged in from another
// book gets the next free number after the book's own chapters (so Susanna,
// dragged under Daniel, becomes Daniel 13).
const fs = require('fs');

/** the books of an order file's text, or null when it is not one */
function parse(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r\n|\n|\r/);
  if (!/^ibiblia-order\s+1\b/.test((lines[0] || '').trim())) return null;
  const books = []; let bk = null, ch = null;
  for (let i = 1; i < lines.length; i++) {
    const ln = lines[i].trim(); if (!ln || ln[0] === '#') continue;
    const t = ln[0], rest = ln.slice(1).trim();
    if (t === 'B') { const b = parseInt(rest, 10); if (b > 0) { bk = { b, chapters: [] }; books.push(bk); ch = null; } }
    else if (t === 'C' && bk) { const m = /^(\d+):(\d+)$/.exec(rest); if (m) { ch = { b: +m[1], c: +m[2], verses: [] }; bk.chapters.push(ch); } }
    else if (t === 'V' && ch) {
      const m = /^(\d+):(\d+):(\d+)(?:-(\d+))?$/.exec(rest);
      if (m) { const v1 = +m[3], v2 = m[4] ? +m[4] : v1; for (let v = v1; v <= v2 && v - v1 < 5000; v++) ch.verses.push([+m[1], +m[2], v]); }
    }
  }
  return books.length ? books : null;
}

class Arrangement {
  constructor(books) {
    this.books = books;      // [{ b, chapters: [{ b, c, cn, verses: [[b,c,v]…] }] }]
    this.byBook = new Map();
    for (const bk of books) {
      let max = 0;
      for (const ch of bk.chapters) if (ch.b === bk.b) max = Math.max(max, ch.c);
      const used = new Set();
      for (const ch of bk.chapters) if (ch.b === bk.b && !used.has(ch.c)) { ch.cn = ch.c; used.add(ch.c); }
      for (const ch of bk.chapters) if (ch.cn == null) ch.cn = ++max;
      this.byBook.set(bk.b, bk);
    }
  }
  /** the chapters of a book as arranged: [{ b, c, cn, verses }] */
  chaptersOf(b) { const bk = this.byBook.get(+b); return bk ? bk.chapters : []; }
  /** the chapter reached as number cn of book b, or null */
  chapter(b, cn) { return this.chaptersOf(b).find(ch => ch.cn === +cn) || null; }
}

/** the arrangement kept next to a module file, or null */
function load(file) {
  try {
    const f = file + '.order';
    if (!fs.existsSync(f)) return null;
    const books = parse(fs.readFileSync(f, 'utf8'));
    return books ? new Arrangement(books) : null;
  } catch (e) { return null; }
}

module.exports = { parse, load, Arrangement };
