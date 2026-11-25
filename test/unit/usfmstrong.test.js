// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// USFM Strong's numbers: node test/unit/usfmstrong.test.js
const usfm = require('../../app/lib/usfm');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
const book = w => '\\id MAT x\n\\c 1\n\\p\n\\v 1 ' + w + '\n';
const fs = require('fs'), os = require('os'), path = require('path');
const strongsOf = t => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'us-')), 'b.usfm');
  fs.writeFileSync(f, t);
  const m = usfm.loadUsfm(f);
  return [...JSON.stringify(m.getVerse(40, 1, 1)).matchAll(/data-strong=\\"([^\\"]*)\\"/g)].map(x => x[1]).join(' ');
};

// a module with its own 5-digit numbers keeps them whole (G13970 was read as G1397)
let s = strongsOf(book('\\w x|lemma="a" strong="G13970" x-morph="N-GSM"\\w* \\w y|strong="G13971"\\w*'));
T(/G13970/.test(s) && /G13971/.test(s), 'own numbers kept: ' + s);
// a file written by iBiblia says so: even a lone G13970 is kept
s = strongsOf('\\id MAT x\n\\rem iBiblia: Strong\'s numbers are written exactly as tagged\n\\c 1\n\\p\n\\v 1 \\w x|strong="G13970"\\w*\n');
T(/G13970/.test(s), 'iBiblia marker keeps G13970: ' + s);
// unfoldingWord padding (every 5-digit number ends in 0) still comes off
s = strongsOf(book('\\w x|strong="G35880"\\w* \\w y|strong="G14110"\\w*'));
T(/G3588/.test(s) && !/G35880/.test(s) && /G1411\b/.test(s), 'unfoldingWord padding removed: ' + s);
// leading zeros are still dropped
s = strongsOf(book('\\w x|strong="H00430"\\w*'));
T(/H430/.test(s), 'leading zeros dropped: ' + s);
// the state of one file does not leak into the next
s = strongsOf(book('\\w x|strong="G35880"\\w*'));
T(/G3588/.test(s) && !/G35880/.test(s), 'next file read on its own: ' + s);
// ordinary 4-digit tags beside extended ones that all happen to end in 0: not unfoldingWord, so G13970 stays whole
s = strongsOf(book('\\w a|strong="G1722"\\w* \\w x|strong="G13970"\\w* \\w y|strong="G14030"\\w*'));
T(/G13970/.test(s) && /G14030/.test(s) && /G1722/.test(s), 'extended numbers beside normal ones kept: ' + s);
// unfoldingWord pads every Greek number to 5 digits, so a mix with only 5-digit tags is still unpadded
s = strongsOf(book('\\w a|strong="G17220"\\w* \\w x|strong="G13970"\\w*'));
T(/G1722\b/.test(s) && !/G17220/.test(s), 'all-5-digit file still unpadded: ' + s);

// eBible.org USFM 3.0 nested \+w tags inside \wj, \bk, \qs, cross-references, and \+wh in footnotes
const TWRender = require('../../app/renderer/render');
const mat510 = usfm.parseUsfmTexts([
  '\\id MAT World English Bible\n\\c 5\n\\q1\n\\v 10 \\wj \\+w Blessed|strong="G3107"\\+w* \\+w are|strong="G1510"\\+w* \\+w those|strong="G3588"\\+w* \\+w who|strong="G3588"\\+w* \\+w have|strong="G3748"\\+w* \\+w been|strong="G1510"\\+w* \\+w persecuted|strong="G1377"\\+w* \\+w for|strong="G3754"\\+w* \\+w righteousness|strong="G1343"\\+w*’ \\+w sake|strong="G1752"\\+w*, \\wj*\n\\q2 \\wj \\+w for|strong="G3754"\\+w* theirs \\+w is|strong="G1510"\\+w* \\+w the|strong="G3588"\\+w* Kingdom \\+w of|strong="G1343"\\+w* \\+w Heaven|strong="G3772"\\+w*.\\wj*\n'
]);
const mat510Html = mat510.verseMap.get('40.5.10');
const mat510Plain = mat510Html.replace(/<[^>]*>/g, '');
T(!/strong=|\|/.test(mat510Plain) && /BlessedG3107/.test(mat510Plain), 'nested \\+w inside \\wj parses Strongs cleanly: ' + mat510Plain);
T(/<span class="woj">/.test(mat510Html) && /data-strong="G3107"/.test(mat510Html), 'nested \\+w inside \\wj keeps .woj and data-strong');
const mat510Hidden = TWRender.render(mat510Html, {}, { strongs: false, morph: false, footnotes: true, headings: true, woj: true, added: true, xrefs: true });
T(/class="strong hide"/.test(mat510Hidden) && !/\|strong=/.test(mat510Hidden.replace(/<[^>]*>/g, '')), 'TWRender hides Strongs without raw attribute text');

const nestedOther = usfm.parseUsfmTexts([
  '\\id NUM Test\n\\c 21\n\\p\n\\v 14 \\bk \\+w The|strong="H5921"\\+w* \\+w Book|strong="H5612"\\+w*\\bk* \\qs \\+w Selah|strong="H5542"\\+w*.\\qs*\n'
  + '\\v 15 \\w Then|strong="H227"\\w* \\x + \\xo 21:15 \\xt Deuteronomy 6:13\\x*\\f + \\fr 21:15 \\ft Hebrew “\\+wh אֱלֹהִ֑ים\\+wh*” (Elohim).\\f*\n'
]);
const v14 = nestedOther.verseMap.get('4.21.14');
T(!/strong=|\|/.test(v14.replace(/<[^>]*>/g, '')) && /data-strong="H5921"/.test(v14) && /data-strong="H5542"/.test(v14), 'nested \\+w inside \\bk and \\qs parses cleanly');
const v15 = nestedOther.verseMap.get('4.21.15');
T(/tw:\/\/bible\.\*\?id=5\.6\.13/.test(v15) && !/tw:<br>/.test(v15), 'cross-reference tw:// URL is not broken by // line-break replacement');
T(/“אֱלֹהִ֑ים”/.test(v15) && !/\\+wh/.test(v15), 'nested \\+wh inside footnote unwraps cleanly without extra space');

// USFM 2.x \w...\w* \wg...\wg* \wm...\wm* and TWRender <_HTML_> toggles
const usfm2 = usfm.parseUsfmTexts(['\\id JHN Test\n\\c 1\n\\s1 \\d Note with <i>italic</i>\n\\p\n\\v 1 \\w Word\\w* \\wg G3056\\wg* \\wm N-NSM\\wm* \\add added\\add*.\n']);
const jhn11 = usfm2.verseMap.get('43.1.1');
T(/data-strong="G3056"/.test(jhn11) && /data-morph="N-NSM"/.test(jhn11), 'USFM 2.x \\wg and \\wm attach to preceding \\w');
const jhn11Tog = TWRender.render(jhn11, {}, { strongs: false, morph: false, footnotes: true, headings: false, woj: true, added: false, xrefs: false });
T(/class="added plain"/.test(jhn11Tog) && !/class="heading/.test(jhn11Tog), 'TWRender toggles added and nested headings cleanly');

console.log(bad ? 'FAILED ' + bad : 'ok ' + ok);
process.exit(bad ? 1 : 0);
