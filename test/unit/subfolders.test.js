/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Full subfolder support for Module Folders: node test/unit/subfolders.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Library } = require('../../app/lib/library');

function T(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok -', msg);
}

const LNK_CLSID = Buffer.from([0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);

function buildLnk({ localPath = '', suffix = '', unicodeInfo = false, name = '', relPath = '', unicodeStrings = true, withIdList = true } = {}) {
  let flags = 0;
  if (withIdList) flags |= 0x01;
  if (localPath) flags |= 0x02;
  if (name) flags |= 0x04;
  if (relPath) flags |= 0x08;
  if (unicodeStrings && (name || relPath)) flags |= 0x80;

  const hdr = Buffer.alloc(76, 0);
  hdr.writeUInt32LE(0x4C, 0);
  LNK_CLSID.copy(hdr, 4);
  hdr.writeUInt32LE(flags, 20);
  const parts = [hdr];

  if (withIdList) {
    // Minimal LinkTargetIDList: IDListSize = 2 (just a 2-byte TerminalID = 0x0000)
    const idl = Buffer.alloc(4, 0);
    idl.writeUInt16LE(2, 0);
    parts.push(idl);
  }

  if (localPath) {
    const volId = Buffer.from([17, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 16, 0, 0, 0, 0]);
    if (unicodeInfo) {
      const hdrSize = 36;
      const baseAnsi = Buffer.from('X:\\fallback\0', 'latin1');
      const sufAnsi = Buffer.from('\0', 'latin1');
      const baseUni = Buffer.from(localPath + '\0', 'utf16le');
      const sufUni = Buffer.from(suffix + '\0', 'utf16le');
      const bodyStart = hdrSize;
      const baseOff = bodyStart + volId.length;
      const sufOff = baseOff + baseAnsi.length;
      const baseUniOff = sufOff + sufAnsi.length;
      const sufUniOff = baseUniOff + baseUni.length;
      const infoSize = sufUniOff + sufUni.length;
      const infoHdr = Buffer.alloc(hdrSize, 0);
      infoHdr.writeUInt32LE(infoSize, 0);
      infoHdr.writeUInt32LE(hdrSize, 4);
      infoHdr.writeUInt32LE(0x01, 8);
      infoHdr.writeUInt32LE(bodyStart, 12);
      infoHdr.writeUInt32LE(baseOff, 16);
      infoHdr.writeUInt32LE(sufOff, 24);
      infoHdr.writeUInt32LE(baseUniOff, 28);
      infoHdr.writeUInt32LE(sufUniOff, 32);
      parts.push(infoHdr, volId, baseAnsi, sufAnsi, baseUni, sufUni);
    } else {
      const hdrSize = 28;
      const baseAnsi = Buffer.from(localPath + '\0', 'latin1');
      const sufAnsi = Buffer.from(suffix + '\0', 'latin1');
      const baseOff = hdrSize + volId.length;
      const sufOff = baseOff + baseAnsi.length;
      const infoSize = sufOff + sufAnsi.length;
      const infoHdr = Buffer.alloc(hdrSize, 0);
      infoHdr.writeUInt32LE(infoSize, 0);
      infoHdr.writeUInt32LE(hdrSize, 4);
      infoHdr.writeUInt32LE(0x01, 8);
      infoHdr.writeUInt32LE(hdrSize, 12);
      infoHdr.writeUInt32LE(baseOff, 16);
      infoHdr.writeUInt32LE(sufOff, 24);
      parts.push(infoHdr, volId, baseAnsi, sufAnsi);
    }
  }

  const pushStr = s => {
    const sz = Buffer.alloc(2);
    sz.writeUInt16LE(s.length, 0);
    parts.push(sz, Buffer.from(s, unicodeStrings ? 'utf16le' : 'latin1'));
  };
  if (name) pushStr(name);
  if (relPath) pushStr(relPath);

  return Buffer.concat(parts);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-subfolders-'));
  const root = path.join(tmp, 'root');
  const extTarget = path.join(tmp, 'external-linked');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(extTarget, { recursive: true });

  // 1. Deeply nested subfolder (8 levels and 70 levels deep, past the old 4 and 64 limits)
  let deepDir = root;
  const ntLines = Array(7957).fill('Verse text');
  ntLines[0] = 'Deep Matthew 1:1';
  for (let i = 1; i <= 70; i++) {
    deepDir = path.join(deepDir, 'L' + i);
    fs.mkdirSync(deepDir, { recursive: true });
    if (i === 8) {
      fs.writeFileSync(path.join(deepDir, 'deep.nt'), ntLines.join('\n') + '\n', 'utf8');
      fs.writeFileSync(path.join(deepDir, 'deep-bundle.twzip'), 'PK\x03\x04dummy', 'utf8');
    }
  }
  const deepDir8 = path.join(root, 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8');
  fs.writeFileSync(path.join(deepDir, 'deep70.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(deepDir, 'deep70-bundle.zip'), 'PK\x03\x04dummy', 'utf8');

  // 2. Subfolder holding two standalone single-file USFM Bibles + a child subfolder
  const multiUsfmDir = path.join(root, 'Translations', 'USFM-Collection');
  const childUnderUsfm = path.join(multiUsfmDir, 'ChildSub');
  fs.mkdirSync(childUnderUsfm, { recursive: true });
  fs.writeFileSync(path.join(multiUsfmDir, 'FirstStandalone.usfm'),
    '# timotheos.title=First Standalone\n\\id GEN\n\\c 1\n\\v 1 In the beginning.\n\\id EXO\n\\c 1\n\\v 1 Now these are the names.\n', 'utf8');
  fs.writeFileSync(path.join(multiUsfmDir, 'SecondStandalone.usfm'),
    '\\id MAT\n\\c 1\n\\v 1 Book of generation.\n\\id MRK\n\\c 1\n\\v 1 Beginning of the gospel.\n', 'utf8');
  fs.writeFileSync(path.join(childUnderUsfm, 'child.nt'), ntLines.join('\n') + '\n', 'utf8');

  // 3. Subfolder holding per-book USFM files of a single Bible + a child subfolder under it
  const perBookDir = path.join(root, 'Translations', 'SplitPerBookBible');
  const childUnderPerBook = path.join(perBookDir, 'ExtraChild');
  fs.mkdirSync(childUnderPerBook, { recursive: true });
  fs.writeFileSync(path.join(perBookDir, '01-GEN.usfm'), '\\id GEN\n\\c 1\n\\v 1 Per-book Genesis 1:1.\n', 'utf8');
  fs.writeFileSync(path.join(perBookDir, '02-EXO.usfm'), '\\id EXO\n\\c 1\n\\v 1 Per-book Exodus 1:1.\n', 'utf8');
  fs.writeFileSync(path.join(childUnderPerBook, 'extrachild.nt'), ntLines.join('\n') + '\n', 'utf8');

  // 3b. Per-book USFM subfolder with UTF-8 BOM
  const bomUsfmDir = path.join(root, 'Translations', 'BomPerBookBible');
  fs.mkdirSync(bomUsfmDir, { recursive: true });
  fs.writeFileSync(path.join(bomUsfmDir, '01-GEN.usfm'), '\uFEFF\\id GEN\n\\c 1\n\\v 1 BOM Genesis 1:1.\n', 'utf8');
  fs.writeFileSync(path.join(bomUsfmDir, '02-EXO.usfm'), '\uFEFF\\id EXO\n\\c 1\n\\v 1 BOM Exodus 1:1.\n', 'utf8');

  // 4. Symlinked subfolder + circular symlink cycle + broken file symlink
  fs.writeFileSync(path.join(extTarget, 'linked.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(extTarget, 'linked-pack.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.symlinkSync(extTarget, path.join(root, 'SymlinkedSubfolder'), 'dir');
  fs.symlinkSync(root, path.join(deepDir8, 'CycleBackToRoot'), 'dir');
  fs.symlinkSync(path.join(tmp, 'does-not-exist.nt'), path.join(root, 'broken.nt'));

  // 5. Disabled ("-...") and hidden (".hidden") subfolders must be skipped (regular, symlinks, .timotheos-link, .lnk)
  const disabledDir = path.join(root, 'L1', '-DisabledSubfolder');
  const hiddenDir = path.join(root, 'L1', '.HiddenSubfolder');
  fs.mkdirSync(disabledDir, { recursive: true });
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.writeFileSync(path.join(disabledDir, 'skipped-dash.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(disabledDir, 'skipped-dash.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(hiddenDir, 'skipped-dot.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(hiddenDir, 'skipped-dot.zip'), 'PK\x03\x04dummy', 'utf8');

  // 6. Archives placed in nested subfolders
  fs.writeFileSync(path.join(multiUsfmDir, 'nested-archive.7z'), '7z\xbc\xaf\x27\x1c', 'utf8');

  // 7. .timotheos-link folder links (absolute, relative, disabled/hidden name or target, circular)
  const twLinkAbs = path.join(tmp, 'twlink-abs');
  const twLinkRel = path.join(tmp, 'twlink-rel');
  const twLinkDashTarget = path.join(tmp, '-twlink-dash-target');
  const twLinkDotNameTarget = path.join(tmp, 'twlink-dotname-target');
  for (const d of [twLinkAbs, twLinkRel, twLinkDashTarget, twLinkDotNameTarget]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(twLinkAbs, 'twlink-abs.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(twLinkAbs, 'twlink-abs.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(twLinkAbs, 'cycle.timotheos-link'), root, 'utf8');
  fs.writeFileSync(path.join(twLinkRel, 'twlink-rel.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(twLinkRel, 'twlink-rel.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(twLinkDashTarget, 'twlink-dashtarget.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(twLinkDashTarget, 'twlink-dashtarget.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(twLinkDotNameTarget, 'twlink-dotlink.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(twLinkDotNameTarget, 'twlink-dotlink.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(root, 'TwLinkAbs.timotheos-link'), twLinkAbs, 'utf8');
  fs.writeFileSync(path.join(root, 'TwLinkRel.timotheos-link'), '../twlink-rel', 'utf8');
  fs.writeFileSync(path.join(root, '-DisabledLink.timotheos-link'), twLinkDotNameTarget, 'utf8');
  fs.writeFileSync(path.join(root, '.HiddenLink.timotheos-link'), twLinkDotNameTarget, 'utf8');
  fs.writeFileSync(path.join(root, 'PointDash.timotheos-link'), twLinkDashTarget, 'utf8');

  // 8. Windows .lnk folder & file shortcuts (ANSI, Unicode, relative path, -/. skip, circular)
  const lnkAnsiDir = path.join(tmp, 'lnk-ansi-dir');
  const lnkUniDir = path.join(tmp, 'lnk-uni-\u0392\u03b9\u03b2\u03bb');
  const lnkRelDir = path.join(tmp, 'lnk-rel-dir');
  const lnkFileDir = path.join(tmp, 'lnk-file-target');
  const lnkSkipTarget = path.join(tmp, 'lnk-skip-target');
  for (const d of [lnkAnsiDir, lnkUniDir, lnkRelDir, lnkFileDir, lnkSkipTarget]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(lnkAnsiDir, 'lnk-ansi.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(lnkAnsiDir, 'lnk-ansi.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(lnkAnsiDir, 'CycleRoot.lnk'), buildLnk({ localPath: root }), undefined);
  fs.writeFileSync(path.join(lnkUniDir, 'lnk-uni.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(lnkUniDir, 'lnk-uni.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(lnkRelDir, 'lnk-rel.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(lnkRelDir, 'lnk-rel.zip'), 'PK\x03\x04dummy', 'utf8');
  const singleLnkNt = path.join(lnkFileDir, 'lnk-single.nt');
  fs.writeFileSync(singleLnkNt, ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(lnkSkipTarget, 'lnk-skipped.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(lnkSkipTarget, 'lnk-skipped.zip'), 'PK\x03\x04dummy', 'utf8');

  fs.writeFileSync(path.join(root, 'LnkAnsi.lnk'), buildLnk({ localPath: lnkAnsiDir }));
  fs.writeFileSync(path.join(root, 'LnkUni.lnk'), buildLnk({ localPath: lnkUniDir, unicodeInfo: true }));
  fs.writeFileSync(path.join(root, 'LnkRel.lnk'), buildLnk({ localPath: path.join(tmp, 'nonexistent-drive-path'), name: 'Moved folder', relPath: '..\\lnk-rel-dir' }));
  fs.writeFileSync(path.join(root, 'SingleFile.lnk'), buildLnk({ localPath: singleLnkNt }));
  fs.writeFileSync(path.join(root, '-Disabled.lnk'), buildLnk({ localPath: lnkSkipTarget }));
  fs.writeFileSync(path.join(root, '.Hidden.lnk'), buildLnk({ localPath: lnkSkipTarget }));

  const lib = new Library({ moduleFolders: [root] });
  const list = await lib.scan();
  const bibleIds = list.bibles.map(b => b.id).sort();

  T(bibleIds.includes('tw:deep.nt'), 'found module 8 levels deep: ' + JSON.stringify(bibleIds));
  T(bibleIds.includes('tw:deep70.nt'), 'found module 70 levels deep (no 64-level cutoff)');
  T(bibleIds.includes('usfm:FirstStandalone.usfm') && bibleIds.includes('usfm:SecondStandalone.usfm'),
    'two standalone USFM Bibles in a subfolder stay separate Bibles');
  T(!bibleIds.includes('usfm:USFM-Collection'), 'subfolder of standalone USFM Bibles is not merged into one folder Bible');
  T(bibleIds.includes('tw:child.nt'), 'child subfolder inside a subfolder with 2+ USFM files is still scanned');
  T(bibleIds.includes('usfm:SplitPerBookBible'), 'per-book USFM subfolder is grouped as one USFM Bible');
  T(bibleIds.includes('usfm:BomPerBookBible'), 'per-book USFM subfolder with UTF-8 BOM is grouped as one USFM Bible');
  T(!bibleIds.includes('usfm:01-GEN.usfm') && !bibleIds.includes('usfm:02-EXO.usfm'), 'per-book USFM files are not listed individually');
  T(bibleIds.includes('tw:extrachild.nt'), 'child subfolder inside a per-book USFM subfolder is still scanned');
  T(bibleIds.includes('tw:linked.nt'), 'module inside symlinked subfolder is found (and circular symlink did not loop)');
  T(!bibleIds.includes('tw:broken.nt'), 'broken file symlink is ignored instead of added');
  T(!bibleIds.includes('tw:skipped-dash.nt') && !bibleIds.includes('tw:skipped-dot.nt'), '"-" and "." subfolders are skipped');
  T(bibleIds.includes('tw:twlink-abs.nt') && bibleIds.includes('tw:twlink-rel.nt'), '.timotheos-link absolute and relative folder links work');
  T(!bibleIds.includes('tw:twlink-dotlink.nt') && !bibleIds.includes('tw:twlink-dashtarget.nt'), '.timotheos-link respects "-" and "." skip rules');
  T(bibleIds.includes('tw:lnk-ansi.nt') && bibleIds.includes('tw:lnk-uni.nt') && bibleIds.includes('tw:lnk-rel.nt') && bibleIds.includes('tw:lnk-single.nt'),
    'Windows .lnk folder (ANSI, Unicode, relative) and file shortcuts are followed');
  T(!bibleIds.includes('tw:lnk-skipped.nt'), 'Windows .lnk shortcuts starting with "-" or "." are skipped');

  const arcs = lib.findArchives().map(a => path.basename(a.f)).sort();
  assert.deepStrictEqual(arcs, [
    'deep-bundle.twzip',
    'deep70-bundle.zip',
    'linked-pack.zip',
    'lnk-ansi.zip',
    'lnk-rel.zip',
    'lnk-uni.zip',
    'nested-archive.7z',
    'twlink-abs.zip',
    'twlink-rel.zip',
  ]);
  T(true, 'findArchives finds archives at any subfolder depth and via symlinks/.timotheos-link/.lnk while skipping "-" and "." folders');

  fs.rmSync(tmp, { recursive: true, force: true });
})();
