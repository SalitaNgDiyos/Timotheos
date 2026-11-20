/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Streaming ZIP extraction and large-ZIP import: node test/unit/bigzip.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const zip = require('../../app/lib/zip');
const importer = require('../../app/lib/importer');
const bookmod = require('../../app/lib/bookmod');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
}

function makeZipWithOptions(entries) {
  const locals = [];
  const central = [];
  let off = 0;
  for (const ent of entries) {
    const raw = Buffer.isBuffer(ent.data) ? ent.data : Buffer.from(String(ent.data), 'utf8');
    const method = ent.method != null ? ent.method : 8;
    const flags = (ent.flags != null ? ent.flags : 0) | 0x0800;
    const comp = method === 8 ? zlib.deflateRawSync(raw) : raw;
    const nm = Buffer.from(ent.name, 'utf8');
    const crc = typeof zlib.crc32 === 'function' ? (zlib.crc32(raw) >>> 0) : 0;

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(flags, 6);
    h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nm.length, 26);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(nm.length, 28);
    c.writeUInt32LE(off, 42);

    locals.push(h, nm, comp);
    central.push(c, nm);
    off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(entries.length, 8);
  e.writeUInt16LE(entries.length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-bigzip-'));
  try {
    // 1. zip.extractToDir: stored + deflated + subdir + empty + PASSWORD + maxTotal ERROR
    const storedDefZip = path.join(tmp, 'mixed.zip');
    const bigText = Buffer.from('ABC'.repeat(40000), 'utf8');
    fs.writeFileSync(storedDefZip, makeZipWithOptions([
      { name: 'stored.txt', data: 'hello stored', method: 0 },
      { name: 'sub/dir/deflated.txt', data: bigText, method: 8 },
      { name: 'empty.txt', data: '', method: 0 },
    ]));
    const extDir = path.join(tmp, 'ext1');
    const r1 = await zip.extractToDir(storedDefZip, extDir, 10 * 1024 * 1024);
    ok(r1.ok === true && r1.entries.length === 3, 'extractToDir succeeded on stored + deflated + empty entries');
    ok(fs.readFileSync(path.join(extDir, 'stored.txt'), 'utf8') === 'hello stored', 'stored entry matches');
    ok(fs.readFileSync(path.join(extDir, 'sub/dir/deflated.txt')).equals(bigText), 'deflated nested entry matches');
    ok(fs.statSync(path.join(extDir, 'empty.txt')).size === 0, 'empty entry extracted');

    const encZip = path.join(tmp, 'enc.zip');
    fs.writeFileSync(encZip, makeZipWithOptions([{ name: 'secret.txt', data: 'abc', method: 0, flags: 1 }]));
    const rEnc = await zip.extractToDir(encZip, path.join(tmp, 'ext-enc'), 10 * 1024 * 1024);
    ok(rEnc.ok === false && rEnc.code === 'PASSWORD', 'encrypted ZIP returns PASSWORD');

    const rLim = await zip.extractToDir(storedDefZip, path.join(tmp, 'ext-lim'), 1024);
    ok(rLim.ok === false && rLim.code === 'ERROR', 'oversized ZIP returns ERROR');

    // 2. importer.importFiles: .nt Bible + companion .order inside a ZIP
    const ntLines = Array(7957).fill('Line');
    ntLines[0] = 'Matt 1:1 test';
    const ntBuf = Buffer.from(ntLines.join('\n') + '\n', 'utf8');
    const ordTxt = 'ibiblia-order 1\nB 40\nC 40:1\nV 40:1:1\n';
    const ntZip = path.join(tmp, 'nt-ord.zip');
    fs.writeFileSync(ntZip, zip.write({ 'Test.nt': ntBuf, 'Test.nt.order': ordTxt }));
    const dest1 = path.join(tmp, 'dest1');
    const res1 = await importer.importFiles([ntZip], dest1);
    ok(res1.length === 1 && res1[0].status === 'imported', 'imported .nt from ZIP: ' + JSON.stringify(res1));
    ok(fs.existsSync(path.join(dest1, 'theWord', 'Test.nt')) && fs.existsSync(path.join(dest1, 'theWord', 'Test.nt.order')), 'both .nt and .order copied to dest');

    // 3. Nested ZIP inside ZIP (recursive disk extraction)
    const innerZipBuf = zip.write({ 'Inner.nt': ntBuf });
    const outerZip = path.join(tmp, 'outer.zip');
    fs.writeFileSync(outerZip, zip.write({ 'nested/inner.zip': innerZipBuf }));
    const dest2 = path.join(tmp, 'dest2');
    const res2 = await importer.importFiles([outerZip], dest2);
    ok(res2.length === 1 && res2[0].status === 'imported' && res2[0].name === 'Inner.nt', 'nested ZIP imported cleanly: ' + JSON.stringify(res2));

    // 4. Per-book USFM files inside a ZIP
    const usfmZip = path.join(tmp, 'TestUsfm_usfm.zip');
    fs.writeFileSync(usfmZip, zip.write({
      '40-MAT.usfm': '\\id MAT\n\\c 1\n\\p\n\\v 1 Matthew one.\n',
      '41-MRK.usfm': '\\id MRK\n\\c 1\n\\p\n\\v 1 Mark one.\n',
    }));
    const dest3 = path.join(tmp, 'dest3');
    const res3 = await importer.importFiles([usfmZip], dest3);
    ok(res3.length === 1 && res3[0].status === 'imported' && res3[0].format === 'USFM', 'per-book USFM ZIP imported: ' + JSON.stringify(res3));

    // 5. SWORD Raw ZIP via importSwordFromDisk
    const swordZip = path.join(__dirname, 'sword', 'TestRaw.zip');
    if (fs.existsSync(swordZip)) {
      const dest4 = path.join(tmp, 'dest4');
      const res4 = await importer.importFiles([swordZip], dest4);
      ok(res4.length === 1 && res4[0].status === 'imported' && res4[0].format === 'SWORD', 'SWORD ZIP imported via disk path: ' + JSON.stringify(res4));
      ok(fs.existsSync(path.join(dest4, 'SWORD', 'testraw', 'mods.d', 'testraw.conf')), 'SWORD .conf written to dest');
    }

    // 6. >32 MB file inside os.tmpdir() must NOT create a .timotheos-link
    const bigTmpMod = path.join(tmp, 'BigTemp.nt');
    const padLines = Array(7957).fill('X'.repeat(4300));
    padLines[0] = 'Matt 1:1 padded';
    fs.writeFileSync(bigTmpMod, padLines.join('\n') + '\n', 'utf8');
    ok(fs.statSync(bigTmpMod).size > 32 * 1024 * 1024, 'temp module is >32 MB');
    const dest5 = path.join(tmp, 'dest5');
    const res5 = await importer.importFiles([bigTmpMod], dest5);
    ok(res5.length === 1 && res5[0].status === 'imported', 'large temp module imported: ' + JSON.stringify(res5));
    ok(fs.existsSync(path.join(dest5, 'theWord', 'BigTemp.nt')) && !fs.existsSync(path.join(dest5, 'theWord', 'BigTemp.nt.timotheos-link')), 'no .timotheos-link created for os.tmpdir() source');

    // 7. Real large ZIP if present: GBL-EPV_2026-11-20_1845.dct.zip (~243 MB uncompressed)
    const realZip = '/media/eddie/Linux/Working Files/Dictionaries/Gemini/GBL-EPV_2026-11-20_1845.dct.zip';
    if (fs.existsSync(realZip)) {
      const dest6 = path.join(tmp, 'dest6');
      const res6 = await importer.importFiles([realZip], dest6);
      ok(res6.length === 1 && res6[0].status === 'imported', 'real GBL-EPV ZIP imported: ' + JSON.stringify(res6));
      const twmDest = res6[0].dest;
      ok(fs.existsSync(twmDest) && !fs.existsSync(twmDest + '.timotheos-link'), 'real GBL-EPV copied/moved without .timotheos-link');
      const m = await bookmod.open(twmDest);
      try {
        const hits = m.findWord('David', true);
        ok(hits.length > 0 && hits[0].subject === 'G1138', 'GBL-EPV David lookup resolves to G1138: ' + JSON.stringify(hits[0]));
      } finally {
        m.close();
      }
    }

    console.log('bigzip: ' + passed + ' ok');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(err => {
  console.error('bigzip FAILED:', err);
  process.exit(1);
});
