/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/studybackup.test.js — the backup file and the "add to what is here" rules
const assert = require('assert');
const sb = require('../../app/lib/studybackup');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const mine = { bookmarks: [{ b: 1, c: 1, v: 1 }, null, null, null, null, null, null, null, null, null], lists: { 'My verses': [{ b: 43, c: 3, v: 16 }] }, currentList: 'My verses',
  highlights: { 'tw:kjv.ont': { '43.3.16': [{ s: 0, e: 3, style: 'y' }] } }, notes: { '43.3.16': { html: 'mine old', t: 100 }, '1.1.1': { html: 'only here', t: 5 } }, plans: [{ name: 'A' }], ranges: { r: 'Jn' }, bookMarks: {}, searchHistory: ['x'], copy: { fmt: 1 } };
const theirs = { bookmarks: [{ b: 9, c: 9, v: 9 }, { b: 2, c: 2, v: 2 }], lists: { 'My verses': [{ b: 43, c: 3, v: 16 }, { b: 45, c: 8, v: 1 }], Other: [{ b: 1, c: 1, v: 1 }] },
  highlights: { 'tw:kjv.ont': { '43.3.16': [{ s: 9, e: 9, style: 'g' }], '43.3.17': [{ s: 0, e: 1, style: 'g' }] }, 'es:x.bbli': { '1.1.1': [{ s: 0, e: 1, style: 'y' }] } },
  notes: { '43.3.16': { html: 'theirs newer', t: 200 }, '1.1.1': { html: 'theirs older', t: 1 }, '2.2.2': { html: 'only there', t: 1 } }, plans: [{ name: 'A' }, { name: 'B' }], ranges: { r: 'Mt', s: 'Ps' }, bookMarks: { m: { 1: [{ s: 0, e: 1 }] } } };
const text = sb.pack(theirs, '0.6.5'); const back = sb.read(text);
ok(back.counts.notes === 3 && back.counts.highlights === 3 && back.counts.bookmarks === 2 && back.counts.lists === 2 && back.counts.plans === 2, 'a backup reads back with its counts');
ok(!('searchHistory' in JSON.parse(sb.pack(mine)).data) && !('copy' in JSON.parse(sb.pack(mine)).data), 'search history and copy settings are not part of a backup');
for (const bad of ['', 'not json', '{"kind":"other"}', '{"kind":"timotheos-study-backup"}']) { let threw = ''; try { sb.read(bad); } catch (e) { threw = e.message; } ok(/not a Timotheos study backup/.test(threw), 'refused in plain words: ' + JSON.stringify(bad)); }
{ let threw = ''; try { sb.read(JSON.stringify({ kind: 'timotheos-study-backup', format: 2, data: {} })); } catch (e) { threw = e.message; } ok(/newer Timotheos/.test(threw), 'a backup of a newer format is refused'); }
const before = JSON.stringify(mine); const m = sb.merge(mine, back.data);
ok(JSON.stringify(mine) === before, 'merging does not change what it was given');
ok(m.notes['43.3.16'].html === 'theirs newer' && m.notes['1.1.1'].html === 'only here' && m.notes['2.2.2'].html === 'only there', 'notes: the newer one wins, nothing here is lost, new ones are added');
ok(m.highlights['tw:kjv.ont']['43.3.16'][0].style === 'y' && !!m.highlights['tw:kjv.ont']['43.3.17'] && !!m.highlights['es:x.bbli'], 'highlights: a verse marked here keeps its marks; others are added');
ok(m.bookmarks.length === 10 && m.bookmarks[0].b === 1 && m.bookmarks[1].b === 2, 'bookmarks: a place used here stays; an empty one takes the backup\'s');
ok(m.lists['My verses'].length === 2 && m.lists.Other.length === 1, 'verse lists: missing verses and lists are added, none doubled');
ok(m.plans.length === 2 && m.ranges.r === 'Jn' && m.ranges.s === 'Ps' && !!m.bookMarks.m, 'plans, ranges and marks in books are added; those here stay');
ok(JSON.stringify(sb.merge(m, back.data)) === JSON.stringify(m), 'merging the same backup twice changes nothing more');
console.log(`studybackup: ${n} ok`);
