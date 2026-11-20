// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Full subfolders support in Module Folders: nested subfolders (>4 levels), symlinked folders, per-book vs standalone USFM subfolders, "-" and "." skipped, and archives in subfolders unpacked automatically.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    let autoGot = null;
    api.onAutoImport(d => { autoGot = d; });
    for (let i = 0; i < 60 && !(state.modules && state.modules.bibles && state.modules.bibles.length); i++) await sleep(250);
    const L = await api.listModules();
    const ids = (L.bibles || []).map(b => b.id);
    ok(ids.includes('tw:deep.nt'), 'deeply nested subfolder module found: ' + JSON.stringify(ids));
    ok(ids.includes('usfm:FirstStandalone.usfm') && ids.includes('usfm:SecondStandalone.usfm'), 'standalone USFM Bibles in a subfolder stay separate');
    ok(ids.includes('usfm:SplitPerBookBible') && ids.includes('tw:extrachild.nt'), 'per-book USFM subfolder grouped while child subfolder still scanned');
    ok(ids.includes('tw:linked.nt'), 'symlinked subfolder module found');
    ok(!ids.includes('tw:skipped-dash.nt') && !ids.includes('tw:skipped-dot.nt'), '"-" and "." subfolders skipped');
    for (let i = 0; i < 30 && !autoGot; i++) await sleep(500);
    if (autoGot) ok(autoGot.archives >= 1 && autoGot.added >= 1, 'archive inside subfolder unpacked automatically: ' + JSON.stringify({ archives: autoGot.archives, added: autoGot.added }));
  } catch (e) {
    out.push('✗ script error: ' + e.message);
  }
  console.log('RESULT ' + out.join(' | '));
})();
