// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// The arrangement of books, chapters and verses made in iBiblia: node test/unit/arrange.test.js
const fs = require('fs'), path = require('path'), os = require('os');
const canon = require('../../app/lib/canon');
const arrange = require('../../app/lib/arrange');
const { Library } = require('../../app/lib/library');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arr-'));
  // a New Testament module whose every verse says where it is: "b.c.v"
  const lines = [];
  for (let b = 40; b <= 66; b++) { const ch = canon.kjvChapters(b); for (let c = 1; c <= ch.length; c++) for (let v = 1; v <= ch[c - 1]; v++) lines.push(`${b}.${c}.${v}`); }
  const file = path.join(dir, 'Test.nt');
  fs.writeFileSync(file, '﻿' + lines.join('\r\n') + '\r\nshort.title=Test\r\ntitle=Test\r\n');
  const mk = () => new Library({ moduleFolders: [dir], apocryphaPlacement: '1611' }, {});
  let lib = mk(); await lib.scan();
  const id = lib.list ? (await lib.scan(), lib.entries.length && lib._bibleId(lib.entries[0])) : null;
  T(!!id, 'module found');
  // no .order file: the usual order
  let nav = await lib.navigation([id]);
  T(nav[0].id === 40 && nav[1].id === 41, 'standard book order');
  let ch = await lib.chapter([id], 40, 1);
  T(ch.rows[0].cells[0] === '40.1.1' && ch.rows.length === 25 && !ch.arranged, 'standard chapter');

  // the arrangement: Mark before Matthew; Matthew 1 reads 3,2,1 then 25..; Luke 1:5 dropped in at the start of Matthew 2;
  // John 1 dragged under Mark (becomes Mark 17: Mark has 16 chapters); Mark 1:1 dropped into Mark 2 at the end
  const order = ['ibiblia-order 1', '# test', 'B 41', 'C 41:1', 'V 41:1:2-45', 'C 41:2', 'V 41:2:1-28', 'C 43:1', 'V 43:1:1-51', 'C 41:3', 'V 41:3:1-35', 'V 41:1:1',
    'B 40', 'C 40:1', 'V 40:1:3', 'V 40:1:2', 'V 40:1:1', 'V 40:1:4-25', 'C 40:2', 'V 42:1:5', 'V 40:2:1-23', 'B 66', 'C 66:1', 'V 66:1:1-20'].join('\n');
  fs.writeFileSync(file + '.order', order);
  lib = mk(); await lib.scan();
  const id2 = lib._bibleId(lib.entries[0]);
  nav = await lib.navigation([id2]);
  T(nav.map(k => k.id).slice(0, 3).join() === '41,40,66', 'book order: ' + nav.map(k => k.id).slice(0, 4));
  T(nav[0].chapterList.join() === '1,2,4,3', 'Mark chapters (John 1 dragged in after chapter 2 gets the next free number, 4): ' + nav[0].chapterList);
  T(nav.some(k => k.id === 42), 'books not in the arrangement are kept after');
  ch = await lib.chapter([id2], 40, 1);
  T(ch.arranged && ch.rows.slice(0, 4).map(r => r.cells[0]).join() === '40.1.3,40.1.2,40.1.1,40.1.4', 'verses reordered: ' + ch.rows.slice(0, 4).map(r => r.cells[0]));
  ch = await lib.chapter([id2], 40, 2);
  T(ch.rows[0].cells[0] === '42.1.5' && ch.rows[0].v === 5 && ch.rows[1].cells[0] === '40.2.1', 'a verse from another chapter, with its own number: ' + ch.rows.slice(0, 2).map(r => r.cells[0] + '/' + r.v));
  ch = await lib.chapter([id2], 41, 4);
  T(ch.rows.length === 51 && ch.rows[0].cells[0] === '43.1.1', 'a chapter from another book: ' + ch.rows.length);
  ch = await lib.chapter([id2], 41, 3);
  T(ch.rows[ch.rows.length - 1].cells[0] === '41.1.1', 'Mark 1:1 at the end of chapter 3');
  // the standard order of the module is not touched
  const m = await lib.bible(id2); T(m.getVerse(40, 1, 1) === '40.1.1', 'module itself unchanged');
  // a wrong file is ignored
  fs.writeFileSync(file + '.order', 'hello'); lib = mk(); await lib.scan();
  nav = await lib.navigation([lib._bibleId(lib.entries[0])]); T(nav[0].id === 40, 'a file that is not an order file is ignored');
  // the parser
  const b = arrange.parse('ibiblia-order 1\nB 1\nC 1:1\nV 1:1:1-3\nV 1:1:7\n');
  T(b && b[0].chapters[0].verses.length === 4 && b[0].chapters[0].verses[3][2] === 7, 'parse runs');
  T(arrange.parse('B 1') === null, 'needs the header');
  console.log(`arrange: ${ok} ok, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('✗', e.stack); process.exit(1); });
