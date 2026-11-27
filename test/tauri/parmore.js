// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Parallel Bibles layout A: one slim bar with a ⋯ menu (Differences, Follow, text tools), short column names, verse numbers only.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/parmore.js /tmp/pm.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
try {
  await until(() => state.nav && state.nav.length && state.modules.bibles.length >= 2);
  const ids = state.modules.bibles.slice(0, 3).map(b => b.id);
  const sets = [{ id: 'p1', name: 'T', bibles: ids, base: ids[0] }];
  state.settings.parSets = sets; state.settings.parSetId = 'p1';
  TimotheosDock.show('par', { quiet: true }); await sl(1500);
  ok(!$('.np-cat') && $('.parset').firstElementChild.tagName === 'B', 'no icon beside the verse reference or on the set button');
  ok(!$('#tab-par .parbar [data-a="diff"]') && !$('#tab-par .parbar [data-a="follow"]'), 'Differences and Follow are no longer on the bar');
  ok(!!$('#tab-par .parbar .parmore'), 'the bar has a ⋯ button');
  ok($('#tab-par .parxmenu').classList.contains('hidden'), 'the ⋯ menu starts closed');
  $('#tab-par .parmore').click(); await sl(300);
  ok(!$('#tab-par .parxmenu').classList.contains('hidden') && !!$('#tab-par .parxmenu [data-a="diff"]') && !!$('#tab-par .parxmenu [data-a="follow"]') && $$('#tab-par .parxmenu .parside [data-s]').length >= 10, 'the ⋯ menu holds Differences, Follow and the text tools');
  $('#tab-par .parmore').click(); await sl(200);
  ok($('#tab-par .parxmenu').classList.contains('hidden'), '⋯ again closes it');
  const vn = $$('#tab-par .pvn').map(x => x.textContent).filter(Boolean);
  ok(vn.length > 0 && vn.every(t => /^(\d+|¶)$/.test(t)), 'verse numbers only on the left: ' + vn.slice(0, 4).join(','));
  ok($$('#tab-par .pth small').every(e => getComputedStyle(e).display === 'none'), 'column names show the short name only');
  $('#tab-par [data-a="stack"]').click(); await sl(600);
  const sh = $$('#tab-par .psh').map(x => x.textContent);
  ok(sh.length > 0 && sh.every(t => /^(\d+|¶)$/.test(t)), 'stacked: verse numbers only: ' + sh.slice(0, 3).join(','));
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
