/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Archive scanning, archiveSeen tracking, Rescan missing-file recovery & folder removal: node test/unit/archivescan.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Library } = require('../../app/lib/library');
const { isPathUnder, clearArchiveSeenUnder, markArchiveDestDeleted, shouldScanArchive, scanArchives } = require('../../app/lib/archivescan');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('ok -', msg);
  passed++;
}

function makeZip(entries) {
  const locals = [];
  const central = [];
  let off = 0;
  for (const ent of entries) {
    const raw = Buffer.isBuffer(ent.data) ? ent.data : Buffer.from(String(ent.data), 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const nm = Buffer.from(ent.name, 'utf8');
    const crc = typeof zlib.crc32 === 'function' ? (zlib.crc32(raw) >>> 0) : 0;

    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x0800, 6);
    h.writeUInt16LE(8, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18);
    h.writeUInt32LE(raw.length, 22);
    h.writeUInt16LE(nm.length, 26);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-archivescan-'));
  try {
    const folderA = path.join(tmp, 'FolderA');
    const subA = path.join(folderA, 'Sub');
    const folderB = path.join(tmp, 'FolderB');
    const destRoot = path.join(tmp, 'modules');
    fs.mkdirSync(subA, { recursive: true });
    fs.mkdirSync(folderB, { recursive: true });
    fs.mkdirSync(destRoot, { recursive: true });

    const ntData = Array(7957).fill('Test verse text').join('\n') + '\n';
    const goodZip = path.join(subA, 'GoodBible.zip');
    const emptyZip = path.join(subA, 'MyBackup.zip');
    const goodZipB = path.join(folderB, 'OtherBible.zip');
    fs.writeFileSync(goodZip, makeZip([{ name: 'GoodBible.nt', data: ntData }]));
    fs.writeFileSync(emptyZip, makeZip([{ name: 'MyBackup.bib', data: 'iBiblia backup payload' }]));
    fs.writeFileSync(goodZipB, makeZip([{ name: 'OtherBible.nt', data: ntData }]));

    const settings = { moduleFolders: [folderA, folderB], archiveSeen: {} };
    let saveCount = 0;
    const saveSettings = () => { saveCount++; };

    // 1. First scan unpacks valid module archives and records { sig, dests } / { sig, empty: true }
    const s1 = await scanArchives({ folders: [folderA, folderB], destRoot, settings, forceMissing: false, saveSettings });
    ok(s1.archives === 3 && s1.added === 2 && s1.emptyCount === 1, 'initial scan unpacks valid module zips and marks non-module zip empty');
    ok(saveCount === 3, 'settings saved incrementally after each archive');
    const expectedDestA = path.join(destRoot, 'theWord', 'GoodBible.nt');
    const expectedDestB = path.join(destRoot, 'theWord', 'OtherBible.nt');
    ok(fs.existsSync(expectedDestA) && fs.existsSync(expectedDestB), 'unpacked .nt modules exist in destRoot');
    ok(Array.isArray(settings.archiveSeen[goodZip].dests) && settings.archiveSeen[goodZip].dests[0] === expectedDestA,
      'archiveSeen stores unpacked destination path');
    ok(settings.archiveSeen[emptyZip].empty === true, 'non-module archive recorded with empty: true');

    // 2. Delete unpacked GoodBible.nt; startup scan skips, explicit Rescan (forceMissing: true) recovers it without re-checking MyBackup.zip
    fs.unlinkSync(expectedDestA);
    const s2Startup = await scanArchives({ folders: [folderA, folderB], destRoot, settings, forceMissing: false, saveSettings });
    ok(s2Startup.archives === 0 && !fs.existsSync(expectedDestA), 'normal startup scan does not re-unpack deleted module');

    const s2Rescan = await scanArchives({ folders: [folderA, folderB], destRoot, settings, forceMissing: true, saveSettings });
    ok(s2Rescan.archives === 1 && s2Rescan.added === 1 && fs.existsSync(expectedDestA),
      'explicit Rescan (forceMissing: true) re-unpacks missing module zip while still skipping empty MyBackup.zip');

    // 3. Second explicit Rescan while all unpacked files exist skips everything
    const s3Rescan = await scanArchives({ folders: [folderA, folderB], destRoot, settings, forceMissing: true, saveSettings });
    ok(s3Rescan.archives === 0 && s3Rescan.added === 0, 'second Rescan skips everything when unpacked files are present');

    // 4. Legacy string entry (<= 0.6.80 format) recovers missing file on forceMissing: true and upgrades entry format
    fs.unlinkSync(expectedDestA);
    const sigA = Library.findArchives([folderA]).find(x => x.f === goodZip).sig;
    settings.archiveSeen[goodZip] = sigA; // legacy string format
    ok(shouldScanArchive(settings.archiveSeen[goodZip], sigA, { forceMissing: false }) === false, 'legacy string skipped on startup');
    ok(shouldScanArchive(settings.archiveSeen[goodZip], sigA, { forceMissing: true }) === true, 'legacy string checked on Rescan');
    const s4 = await scanArchives({ folders: [folderA], destRoot, settings, forceMissing: true, saveSettings });
    ok(s4.archives === 1 && s4.added === 1 && fs.existsSync(expectedDestA), 'legacy string recovered on Rescan');
    ok(typeof settings.archiveSeen[goodZip] === 'object' && settings.archiveSeen[goodZip].dests[0] === expectedDestA,
      'legacy string entry upgraded to object with dests');

    // 5. Corrupt .zip and .7z do not crash scan, pollute process.exitCode, or block sibling archives, and are NOT recorded in archiveSeen
    const folderC = path.join(tmp, 'FolderC');
    fs.mkdirSync(folderC, { recursive: true });
    const corruptZip = path.join(folderC, 'Broken.zip');
    const corrupt7z = path.join(folderC, 'Corrupt.7z');
    const siblingZip = path.join(folderC, 'SiblingBible.zip');
    fs.writeFileSync(corruptZip, Buffer.from('PK\x03\x04corrupt-not-a-valid-zip'));
    fs.writeFileSync(corrupt7z, Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 1, 2, 3, 4]));
    fs.writeFileSync(siblingZip, makeZip([{ name: 'SiblingBible.nt', data: ntData }]));
    const s5 = await scanArchives({ folders: [folderC], destRoot, settings, forceMissing: true, saveSettings });
    ok(s5.added === 1 && s5.errorCount === 2 && fs.existsSync(path.join(destRoot, 'theWord', 'SiblingBible.nt')),
      'corrupt zip and 7z fail gracefully without blocking sibling archives');
    ok(!(corruptZip in settings.archiveSeen) && !(corrupt7z in settings.archiveSeen),
      'corrupt archives are not recorded in archiveSeen so they can be retried');
    const skippedCorrupt = s5.results.filter(r => r.name === 'Broken.zip' || r.name === 'Corrupt.7z');
    ok(skippedCorrupt.length === 2 && skippedCorrupt.every(r => r.status === 'skipped' && /^could not read archive:/i.test(r.reason) && !/\bundefined\b/.test(r.reason)),
      'corrupt archives report clean error messages without undefined');
    ok(!process.exitCode, 'corrupt archives do not pollute process.exitCode');

    // 6. clearArchiveSeenUnder clears only keys under removed folder
    ok(isPathUnder(goodZip, folderA) && !isPathUnder(goodZipB, folderA) && !isPathUnder(goodZip, folderA + '2'),
      'isPathUnder accurately checks directory boundaries');
    const cleared = clearArchiveSeenUnder(settings.archiveSeen, folderA);
    settings.archiveSeen = cleared.seen;
    ok(cleared.removed === 2 && !(goodZip in settings.archiveSeen) && !(emptyZip in settings.archiveSeen) && (goodZipB in settings.archiveSeen),
      'clearArchiveSeenUnder removes only FolderA entries and preserves FolderB');

    // 7. Real 244 MB GBL-EPV archive recovery test when present locally
    const realZip = '/media/eddie/Linux/Working Files/Dictionaries/Gemini/GBL-EPV_2026-11-22_0815.dct.zip';
    if (fs.existsSync(realZip)) {
      const realFolder = path.join(tmp, 'real-folder');
      const realDest = path.join(tmp, 'real-dest');
      fs.mkdirSync(realFolder, { recursive: true });
      const linkedZip = path.join(realFolder, path.basename(realZip));
      fs.symlinkSync(realZip, linkedZip);
      const realSig = Library.findArchives([realFolder])[0].sig;
      const realSettings = { archiveSeen: { [linkedZip]: realSig } };
      const rStartup = await scanArchives({ folders: [realFolder], destRoot: realDest, settings: realSettings, forceMissing: false });
      ok(rStartup.archives === 0, 'real GBL-EPV legacy archiveSeen entry skipped on startup');
      const rRescan = await scanArchives({ folders: [realFolder], destRoot: realDest, settings: realSettings, forceMissing: true });
      const realTwm = path.join(realDest, 'theWord', 'GBL-EPV_2026-11-22_0815.dct.twm');
      ok(rRescan.added === 1 && fs.existsSync(realTwm) && fs.statSync(realTwm).size > 200 * 1024 * 1024,
        'real GBL-EPV_2026-11-22_0815.dct.zip recovered by Rescan even when legacy archiveSeen already existed');
    }

    // 8. markArchiveDestDeleted prevents resurrection on Rescan even when forceMissing is true
    const delFolder = path.join(tmp, 'FolderDel');
    const delDest = path.join(tmp, 'modules-del');
    fs.mkdirSync(delFolder, { recursive: true });
    fs.mkdirSync(delDest, { recursive: true });
    const delZip = path.join(delFolder, 'TempBible.zip');
    fs.writeFileSync(delZip, makeZip([{ name: 'TempBible.nt', data: ntData }]));
    const delSettings = { moduleFolders: [delFolder], archiveSeen: {} };
    const ds1 = await scanArchives({ folders: [delFolder], destRoot: delDest, settings: delSettings, forceMissing: false });
    const delNt = path.join(delDest, 'theWord', 'TempBible.nt');
    ok(ds1.added === 1 && fs.existsSync(delNt), 'initial scan unpacks TempBible.nt');
    fs.unlinkSync(delNt);
    delSettings.archiveSeen = markArchiveDestDeleted(delSettings.archiveSeen, delNt).seen;
    const ds2 = await scanArchives({ folders: [delFolder], destRoot: delDest, settings: delSettings, forceMissing: true });
    ok(ds2.archives === 0 && !fs.existsSync(delNt), 'deleted module is not restored by Rescan even with forceMissing: true');
    const ds3 = await scanArchives({ folders: [delFolder], destRoot: delDest, settings: delSettings, forceMissing: false });
    ok(ds3.archives === 0 && !fs.existsSync(delNt), 'deleted module stays deleted on normal Rescan');

    console.log(`archivescan: ${passed} ok`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
