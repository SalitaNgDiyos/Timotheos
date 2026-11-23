/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Multi-Bible verse-link popup selection, Deuterocanon filtering, and legacy Deuterocanon book-link parsing:
//   node test/unit/popupbibles.test.js
const assert = require('assert');
const pb = require('../../app/renderer/popupbibles');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('ok -', msg);
  passed++;
}

// 1. popupGroupKey maps OT (1-39), NT (40-66), and Deuterocanon (67+)
ok(pb.popupGroupKey(1) === 'popupOT' && pb.popupGroupKey(39) === 'popupOT', 'OT books map to popupOT');
ok(pb.popupGroupKey(40) === 'popupNT' && pb.popupGroupKey(66) === 'popupNT', 'NT books map to popupNT');
ok(pb.popupGroupKey(67) === 'popupAP' && pb.popupGroupKey(71) === 'popupAP' && pb.popupGroupKey(87) === 'popupAP', 'Deuterocanon books map to popupAP');
ok(pb.popupGroupKey(0) === '', 'invalid book id returns empty key');

// 2. normalizePopupIds migrates legacy strings, deduplicates arrays, and drops uninstalled IDs
const installed = ['bib:kjv', 'bib:lxx', 'bib:amb', 'bk:deuterokjv'];
assert.deepStrictEqual(pb.normalizePopupIds('bib:kjv', installed), ['bib:kjv']);
assert.deepStrictEqual(pb.normalizePopupIds(['bib:lxx', 'bib:lxx', 'bib:missing', 'bk:deuterokjv'], installed), ['bib:lxx', 'bk:deuterokjv']);
assert.deepStrictEqual(pb.normalizePopupIds('', installed), []);
ok(true, 'normalizePopupIds migrates strings, deduplicates, and filters uninstalled Bibles');

// 3. filterBiblesForGroup shows ONLY Bibles with Deuterocanon books for popupAP
const bibles = [
  { id: 'bib:kjv', abbr: 'KJV', name: 'KJV' },
  { id: 'bib:lxx', abbr: 'LXX', name: 'Septuagint' },
  { id: 'bib:amb', abbr: 'AMB', name: 'Ang Malayang Biblia' },
  { id: 'bk:deuterokjv', abbr: 'DeuteroKJV', name: 'KJV Apocrypha' },
  { id: 'bib:pending', abbr: 'PND', name: 'Pending Info' },
];
const infos = new Map([
  ['bib:kjv', { books: { 1: [31], 40: [25] } }],
  ['bib:lxx', { books: { 1: [31], 70: [19], 71: [51] } }],
  ['bib:amb', { books: { 40: [25], 66: [21] } }],
  ['bk:deuterokjv', { books: { 67: [14], 71: [51], 77: [16] } }],
]);

const apRes = pb.filterBiblesForGroup(bibles, infos, 'popupAP');
assert.deepStrictEqual(apRes.list.map(b => b.id), ['bib:lxx', 'bk:deuterokjv']);
ok(apRes.loading === true, 'popupAP shows only Bibles containing Deuterocanon books and flags loading when an info is pending');

const otRes = pb.filterBiblesForGroup(bibles, infos, 'popupOT');
assert.deepStrictEqual(otRes.list.map(b => b.id), ['bib:kjv', 'bib:lxx', 'bib:pending']);
ok(true, 'popupOT excludes NT-only and Apocrypha-only Bibles while keeping OT and pending Bibles');

const ntRes = pb.filterBiblesForGroup(bibles, infos, 'popupNT');
assert.deepStrictEqual(ntRes.list.map(b => b.id), ['bib:kjv', 'bib:amb', 'bib:pending']);
ok(true, 'popupNT excludes OT/Apocrypha-only Bibles while keeping NT and pending Bibles');

// 4. resolvePopupTargets honors explicit modSpec, multi-Bible selections, and smart fallbacks
const explicit = pb.resolvePopupTargets({
  b: 71, settings: { popupAP: ['bib:lxx', 'bk:deuterokjv'] }, bibles, infosMap: infos, openBibles: ['bib:kjv'],
  modSpec: 'KJV', resolveBibleSpecFn: s => s === 'KJV' ? 'bib:kjv' : null,
});
assert.deepStrictEqual(explicit, ['bib:kjv']);
ok(true, 'explicit named Bible link still targets that specific Bible');

const multiAP = pb.resolvePopupTargets({
  b: 71, settings: { popupAP: ['bib:lxx', 'bk:deuterokjv'] }, bibles, infosMap: infos, openBibles: ['bib:kjv'],
  modSpec: '*', resolveBibleSpecFn: () => null,
});
assert.deepStrictEqual(multiAP, ['bib:lxx', 'bk:deuterokjv']);
ok(true, 'generic Deuterocanon link returns all selected popupAP Bibles for parallel display');

const multiOT = pb.resolvePopupTargets({
  b: 1, settings: { popupOT: ['bib:kjv', 'bib:lxx'] }, bibles, infosMap: infos, openBibles: ['bib:amb'],
  modSpec: '*', resolveBibleSpecFn: () => null,
});
assert.deepStrictEqual(multiOT, ['bib:kjv', 'bib:lxx']);
ok(true, 'generic canonical OT link returns all selected popupOT Bibles for parallel display');

const fallbackAP = pb.resolvePopupTargets({
  b: 71, settings: {}, bibles, infosMap: infos, openBibles: ['bib:kjv'],
  modSpec: '*', resolveBibleSpecFn: () => null,
});
assert.deepStrictEqual(fallbackAP, ['bib:lxx']);
ok(true, 'empty popupAP falls back to the first installed Bible that contains the Deuterocanon book when open Bibles lack it');

// 5. parseLegacyDeuteroLink resolves English and Tagalog DeuteroKJV links
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=135#v1-v2', 'Sirach 46:1 (LXX)'), { b: 71, c: 46, v1: 1, v2: 1 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=113#v31-v33', 'Sirach 24:31-32 (LXX)'), { b: 71, c: 24, v1: 31, v2: 32 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=70#v12-v22', 'Karunungan 2:12-21 (LXX)'), { b: 70, c: 2, v1: 12, v2: 21 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=154#v40-v42', '1 Macabeo 2:40-41 (LXX)'), { b: 77, c: 2, v1: 40, v2: 41 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=181#v38-v45', '2 Maccabeo 12:38-45 (LXX), '), { b: 78, c: 12, v1: 38, v2: 45 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=40#v15-', 'Tob. 12:15 (LXX)'), { b: 67, c: 12, v1: 15, v2: 15 });
assert.deepStrictEqual(pb.parseLegacyDeuteroLink('tw://bk.DeuteroKJV?tid=12#v30-', '2 Esdras 1:30 (LXX)'), { b: 83, c: 1, v1: 30, v2: 30 });
assert.strictEqual(pb.parseLegacyDeuteroLink('tw://bk.SomeHistory?tid=5', 'Chapter 3: Early Church'), null);
assert.strictEqual(pb.parseLegacyDeuteroLink('tw://bible.*?id=71.24.1', 'Sirach 24:1'), null);
ok(true, 'parseLegacyDeuteroLink parses English and Tagalog Deuterocanon links and ignores non-Deuterocanon links');

console.log(`popupbibles tests: ${passed} ok`);
