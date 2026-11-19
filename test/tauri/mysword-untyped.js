// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// MySword files without .bbl/.cmt in the name, found in a module folder:
// FOLDERS='["/tmp/myun"]' bash test/tauri/run.sh test/tauri/mysword-untyped.js /tmp/myun.png 1200
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const L = await api.listModules();
  const b = L.bibles.find(x => /LXXBrenton/.test(x.name || x.file || ''));
  ok(!!b && b.format === 'MySword', 'untyped Bible listed: ' + L.bibles.map(x => x.id).join(','));
  const c = (L.books || []).find(x => /Odd Commentary/.test(x.name));
  ok(!!c && c.kind === 'commentary', 'untyped commentary listed as commentary: ' + (c && c.kind));
} catch (e) { out.push('✗ script error ' + e.message); }
console.log('RESULT ' + out.join(' | ')); })();
