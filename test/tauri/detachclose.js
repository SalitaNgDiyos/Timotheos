// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Detach edges mode: closing a panel (also a Bible view) leaves an empty space and nothing else moves; undo / redo arrows.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/detachclose.js /tmp/dc.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const rects = () => { const o = {}; for (const g of $$('#workbench .dgroup')) { const id = (g.querySelector('.dtab.on, .dtab') || {}).dataset?.id || g.dataset.panels; const r = g.getBoundingClientRect(); o[g.dataset.ids || [...g.querySelectorAll('.dtab')].map(t => t.dataset.id).join(',')] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); } return o; };
const areas = () => JSON.stringify(TimotheosDock.state().areas.map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1]));
try {
  await until(() => state.nav && state.nav.length && state.modules.bibles.length >= 3);
  const bs = state.modules.bibles.map(b => b.id);
  await setViews([{ bible: bs[0], linked: true }, { bible: bs[1], linked: true }, { bible: bs[2], linked: true }]); await sl(800);
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1, y0: 0, x1: 2, y1: 3, panels: ['bv0'], active: 'bv0' }, { x0: 2, y0: 0, x1: 3, y1: 2, panels: ['bv1'], active: 'bv1' }, { x0: 3, y0: 0, x1: 4, y1: 2, panels: ['bv2'], active: 'bv2' }, { x0: 2, y0: 2, x1: 4, y1: 3, panels: ['cmt'], active: 'cmt' }], floats: [], hidden: ['lib', 'search', 'bsearch', 'study', 'par'] });
  await sl(600);
  TimotheosDock.setDetachMode(true); await sl(300);
  ok(!$('#tbMenus [data-hist]'), 'no undo / redo arrows in the title bar');
  runCommand('panels'); await sl(400);
  ok($('#panelsMenu [data-hist="undo"]') && $('#panelsMenu [data-hist="redo"]'), 'undo and redo arrows in the Layout & Panels window');
  ok(/Edit Layout/.test($('#panelsMenu').textContent) && !/Detach adjacent edges/.test($('#panelsMenu').textContent), 'the mode is called Edit Layout');
  // close the Commentary panel
  const before = areas();
  const capClose = id => { const g = $$('#workbench .dgroup').find(x => x.querySelector(`.dtab[data-id="${id}"]`)); g.querySelector('.dbtn[data-act="close"]').click(); };
  capClose('cmt'); await sl(500);
  const a1 = TimotheosDock.state().areas;
  ok(!a1.some(a => a.panels.includes('cmt')) && JSON.stringify(a1.filter(a => !a.panels.includes('cmt')).map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1])) === JSON.stringify(JSON.parse(before).filter(a => a[0] !== 'cmt')), 'closing Commentary: the others stay where they are: ' + areas());
  ok(TimotheosDock.findAvailableSpaces().some(s => Math.abs(s.x0 - 2) < .01 && Math.abs(s.y0 - 2) < .01), 'an empty space where it was');
  // close the middle Bible view (bv1): bv0 and the third view stay where they are
  const third = views()[2].bible;
  capClose('bv1'); await sl(1200);
  const a2 = TimotheosDock.state().areas.map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1]);
  ok(views().length === 2 && views()[1].bible === third, 'the closed view is gone, the third view is now the second');
  ok(JSON.stringify(a2) === JSON.stringify([['tree', 0, 0, 1, 3], ['bv0', 1, 0, 2, 3], ['bv1', 3, 0, 4, 2]]), 'the views that stay keep their places: ' + JSON.stringify(a2));
  ok(TimotheosDock.findAvailableSpaces().some(s => Math.abs(s.x0 - 2) < .01 && Math.abs(s.y0) < .01), 'an empty space where the closed view was');
  ok(!$('#panelsMenu [data-hist="undo"]').disabled && $('#panelsMenu [data-hist="redo"]').disabled, 'undo is available, redo is not');
  // undo brings the Bible view back with its Bible, then the commentary
  $('#panelsMenu [data-hist="undo"]').click(); await sl(1500);
  ok(views().length === 3 && TimotheosDock.state().areas.some(a => a.panels.includes('bv2') && a.x0 === 3) && TimotheosDock.state().areas.some(a => a.panels.includes('bv1') && a.x0 === 2), 'undo: the Bible view is back in its place');
  $('#panelsMenu [data-hist="undo"]').click(); await sl(800);
  ok(TimotheosDock.state().areas.some(a => a.panels.includes('cmt') && a.x0 === 2 && a.y0 === 2), 'undo again: Commentary is back');
  ok(!$('#panelsMenu [data-hist="redo"]').disabled, 'redo is available');
  $('#panelsMenu [data-hist="redo"]').click(); await sl(800);
  ok(!TimotheosDock.state().areas.some(a => a.panels.includes('cmt')), 'redo: Commentary closed again');
  runCommand('redoLayout'); await sl(1500);
  ok(views().length === 2, 'redo (Ctrl+Alt+Y command): the Bible view closed again');
  ok($('#panelsMenu [data-hist="redo"]').disabled, 'nothing more to redo');
  // only while the Layout & Panels window is open
  runCommand('panels'); await sl(300);
  const n0 = views().length; runCommand('undoLayout'); await sl(1000);
  ok(views().length === n0, 'with the window closed, Ctrl+Alt+Z does nothing');
  runCommand('panels'); await sl(300);
  // at most 10 steps
  for (let k = 0; k < 14; k++) { TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1 + k * 0.1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1 + k * 0.1, y0: 0, x1: 4, y1: 3, panels: ['bv0'], active: 'bv0' }], floats: [], hidden: ['cmt', 'lib', 'search', 'bsearch', 'study', 'par'] }); await sl(450); }
  let steps = 0; while (TimotheosDock.canUndo() && steps < 30) { await TimotheosDock.undo(); steps++; }
  ok(steps === 10, 'undo goes back at most 10 steps: ' + steps);
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
