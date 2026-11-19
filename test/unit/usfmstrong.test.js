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
console.log(bad ? 'FAILED ' + bad : 'ok ' + ok);
process.exit(bad ? 1 : 0);
