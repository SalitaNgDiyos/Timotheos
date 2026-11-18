// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// SWORD Bibles in the real app. Needs the packages unpacked as a module folder (see the guide in the commit message of 0.6.64):
// node -e (unpack test/unit/sword/TestZ.zip into /tmp/swmods/SWORD/testz) then
// FOLDERS='["/tmp/swmods"]' EXTRA=',"views":[{"bible":"sw:testz","linked":true}]' bash test/tauri/run.sh test/tauri/sword.js /tmp/sw.png 1200
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const L = await api.listModules();
  ok(L.bibles.some(b => b.id === 'sw:testz' && b.format === 'SWORD'), 'listed as SWORD');
  await go({ b: 40, c: 5, v: 3 }); await sl(2500);
  const t = document.querySelector('#workbench').innerText;
  ok(/Blessed/.test(t) && !/<w |<note|<_HTML_/.test(t), 'verse shown without raw tags');
  ok(document.querySelectorAll('#workbench [data-strong]').length > 0, 'Strong\'s words on screen');
  await go({ b: 43, c: 3, v: 16 }); await sl(1500);
  ok(document.querySelectorAll('#workbench .woj').length > 0, 'words of Jesus coloured');
} catch (e) { out.push('✗ script error ' + e.message); }
console.log('RESULT ' + out.join(' | ')); })();
