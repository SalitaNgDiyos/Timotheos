// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Edit Layout OFF: closing a panel (also a Bible view) still leaves an empty space; no other panel grows.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/closeoff.js /tmp/co.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const areas = () => TimotheosDock.state().areas.map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1]);
try {
  await until(() => state.nav && state.nav.length && state.modules.bibles.length >= 2);
  TimotheosDock.setDetachMode(false);
  if (state.settings.views.length < 2) { await window.addView(state.modules.bibles[1].id); await sl(800); }
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1, y0: 0, x1: 2, y1: 3, panels: ['bv0'], active: 'bv0' }, { x0: 2, y0: 0, x1: 3, y1: 3, panels: ['bv1'], active: 'bv1' }, { x0: 3, y0: 0, x1: 4, y1: 3, panels: ['cmt'], active: 'cmt' }], floats: [], hidden: ['lib', 'search', 'bsearch', 'study', 'par'] });
  await sl(500);
  ok(!TimotheosDock.getDetachMode(), 'Edit Layout is off');
  const before = areas();
  $$('#workbench .dgroup').find(g => g.querySelector('.dtab[data-id="cmt"]')).querySelector('.dbtn[data-act="close"]').click(); await sl(500);
  const a1 = areas();
  ok(JSON.stringify(a1) === JSON.stringify(before.filter(a => a[0] !== 'cmt')), 'closing Commentary: no other panel moved or grew');
  ok($$('.dempty').length === 1 && !$('.dempty .dsplit'), 'its place shows as an empty space (no Split… outside Edit Layout)');
  $$('#workbench .dgroup').find(g => g.querySelector('.dtab[data-id="bv0"]')).querySelector('.dbtn[data-act="close"]').click(); await sl(900);
  const a2 = areas();
  ok(a2.length === 2 && a2[0][0] === 'tree' && a2[0][3] === 1 && a2[1][0] === 'bv0' && a2[1][1] === 2 && a2[1][3] === 3, 'closing a Bible view: the other view keeps its place (' + JSON.stringify(a2) + ')');
  ok($$('.dempty').length >= 1, 'empty spaces shown: ' + $$('.dempty').length);
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
