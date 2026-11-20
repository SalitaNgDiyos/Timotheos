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

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-subfolders-'));
  const root = path.join(tmp, 'root');
  const extTarget = path.join(tmp, 'external-linked');
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(extTarget, { recursive: true });

  // 1. Deeply nested subfolder (8 levels deep, past the old depth < 4 limit)
  const deepDir = path.join(root, 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8');
  fs.mkdirSync(deepDir, { recursive: true });
  const ntLines = Array(7957).fill('Verse text');
  ntLines[0] = 'Deep Matthew 1:1';
  fs.writeFileSync(path.join(deepDir, 'deep.nt'), ntLines.join('\n') + '\n', 'utf8');

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

  // 4. Symlinked subfolder + circular symlink cycle back to root
  fs.writeFileSync(path.join(extTarget, 'linked.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(extTarget, 'linked-pack.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.symlinkSync(extTarget, path.join(root, 'SymlinkedSubfolder'), 'dir');
  fs.symlinkSync(root, path.join(deepDir, 'CycleBackToRoot'), 'dir');

  // 5. Disabled ("-...") and hidden (".hidden") subfolders must be skipped
  const disabledDir = path.join(root, 'L1', '-DisabledSubfolder');
  const hiddenDir = path.join(root, 'L1', '.HiddenSubfolder');
  fs.mkdirSync(disabledDir, { recursive: true });
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.writeFileSync(path.join(disabledDir, 'skipped-dash.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(disabledDir, 'skipped-dash.zip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(hiddenDir, 'skipped-dot.nt'), ntLines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(hiddenDir, 'skipped-dot.zip'), 'PK\x03\x04dummy', 'utf8');

  // 6. Archives placed in nested subfolders
  fs.writeFileSync(path.join(deepDir, 'deep-bundle.twzip'), 'PK\x03\x04dummy', 'utf8');
  fs.writeFileSync(path.join(multiUsfmDir, 'nested-archive.7z'), '7z\xbc\xaf\x27\x1c', 'utf8');

  const lib = new Library({ moduleFolders: [root] });
  const list = await lib.scan();
  const bibleIds = list.bibles.map(b => b.id).sort();

  T(bibleIds.includes('tw:deep.nt'), 'found module 8 levels deep: ' + JSON.stringify(bibleIds));
  T(bibleIds.includes('usfm:FirstStandalone.usfm') && bibleIds.includes('usfm:SecondStandalone.usfm'),
    'two standalone USFM Bibles in a subfolder stay separate Bibles');
  T(!bibleIds.includes('usfm:USFM-Collection'), 'subfolder of standalone USFM Bibles is not merged into one folder Bible');
  T(bibleIds.includes('tw:child.nt'), 'child subfolder inside a subfolder with 2+ USFM files is still scanned');
  T(bibleIds.includes('usfm:SplitPerBookBible'), 'per-book USFM subfolder is grouped as one USFM Bible');
  T(!bibleIds.includes('usfm:01-GEN.usfm') && !bibleIds.includes('usfm:02-EXO.usfm'), 'per-book USFM files are not listed individually');
  T(bibleIds.includes('tw:extrachild.nt'), 'child subfolder inside a per-book USFM subfolder is still scanned');
  T(bibleIds.includes('tw:linked.nt'), 'module inside symlinked subfolder is found (and circular symlink did not loop)');
  T(!bibleIds.includes('tw:skipped-dash.nt') && !bibleIds.includes('tw:skipped-dot.nt'), '"-" and "." subfolders are skipped');

  const arcs = lib.findArchives().map(a => path.basename(a.f)).sort();
  assert.deepStrictEqual(arcs, ['deep-bundle.twzip', 'linked-pack.zip', 'nested-archive.7z']);
  T(true, 'findArchives finds archives at any subfolder depth and via symlinks while skipping "-" and "." folders');

  fs.rmSync(tmp, { recursive: true, force: true });
})();
