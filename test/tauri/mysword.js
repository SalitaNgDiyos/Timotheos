/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// MySword modules in the real app. Run: FOLDERS='["/tmp/claude-0/mymods"]' EXTRA=',"views":[{"bible":"my:MYT.bbl.mybible","linked":true}]' bash test/tauri/run.sh test/tauri/mysword.js /tmp/my.png 3000
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    const L = await api.listModules();
    ok(L.bibles.some(b => b.id === 'my:MYT.bbl.mybible' && b.format === 'MySword'), 'Bible listed as MySword');
    await go({ b: 43, c: 3, v: 16 }); await sl(2000);
    const txt = document.querySelector('#workbench').innerText;
    ok(/For God so loved/.test(txt) && /only Son/.test(txt), 'verse text shown');
    ok(!/<WG|<FI|<RF/.test(txt), 'no raw tags on screen');
    ok(document.querySelectorAll('#workbench [data-strong]').length > 0, 'Strong\'s words present');
    const L2 = await api.describeModules();
    ok(L2.books.some(b => b.kind === 'commentary' && b.format === 'MySword'), 'commentary listed');
    ok(L2.dicts.some(b => /MySword Test Dict/.test(b.title)), 'dictionary listed');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
