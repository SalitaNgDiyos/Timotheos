// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Detach edges: "Split…" in an empty space opens the grid picker (only what fits, up to 6 × 3) and divides that space.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/split.js /tmp/split.png 1500   (window.__stage='pick' stops with the picker open)
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
try {
  await until(() => state.nav && state.nav.length);
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1, y0: 0, x1: 2, y1: 3, panels: ['bv0'], active: 'bv0' }, { x0: 2, y0: 0, x1: 4, y1: 3, panels: ['cmt'], active: 'cmt' }], floats: [], hidden: ['lib', 'search', 'bsearch', 'study', 'par'] });
  TimotheosDock.setDetachMode(true); await sl(400);
  const g = $$('#workbench .dgroup').find(x => x.querySelector('.dtab[data-id="cmt"]')); g.querySelector('.dbtn[data-act="close"]').click(); await sl(500);
  const btn = $('.dempty .dsplit');
  ok(btn && /Split/.test(btn.textContent), 'the empty space offers Split Space');
  btn.click(); await sl(300);
  const pk = $('.ld-picker');
  const cells = $$('.ld-picker .ld-cell'); const maxC = Math.max(...cells.map(c => +c.dataset.c)), maxR = Math.max(...cells.map(c => +c.dataset.r));
  const sp = TimotheosDock.findEmptySpaces()[0]; const wb = $('#workbench').getBoundingClientRect();
  const wPx = (sp.x1 - sp.x0) / 4 * wb.width, hPx = (sp.y1 - sp.y0) / 3 * wb.height;
  ok(pk && /Split this empty space/.test(pk.textContent) && maxC === Math.min(6, Math.floor(wPx / 200)) && maxR === Math.min(3, Math.floor(hPx / 150)), `picker fits the space (${Math.round(wPx)}×${Math.round(hPx)} px): ${maxC} × ${maxR}`);
  if (window.__stage === 'pick') { cells.find(c => c.dataset.c === '2' && c.dataset.r === '2').dispatchEvent(new MouseEvent('mouseenter')); console.log('RESULT ' + out.join(' | ')); return; }
  cells.find(c => c.dataset.c === '3' && c.dataset.r === '2').click(); await sl(600);
  const slots = TimotheosDock.state().slots;
  ok(slots.length === 6 && slots.every(s => s.x0 >= 2 - 1e-6 && s.y1 <= 3 + 1e-6), 'the space is split into 3 × 2 empty places');
  const a = TimotheosDock.state().areas.map(x => [x.panels.join(), x.x0, x.x1]);
  ok(JSON.stringify(a) === JSON.stringify([['tree', 0, 1], ['bv0', 1, 2]]), 'the open panels did not move');
  ok($$('.dslot').length === 6, 'six "Drop panel here" places on screen');
  // put a panel into the first place
  TimotheosDock.placeInSpace('lib', TimotheosDock.findAvailableSpaces()[0]); await sl(500);
  const lib = TimotheosDock.state().areas.find(x => x.panels.includes('lib'));
  ok(lib && Math.abs((lib.x1 - lib.x0) - 2 / 3) < 0.01 && Math.abs((lib.y1 - lib.y0) - 1.5) < 0.01, 'a panel dropped in fills one place: ' + JSON.stringify(lib && [lib.x0, lib.y0, lib.x1, lib.y1]));
  ok($$('.dslot').length === 5, 'five places left');
  // undo the split
  await TimotheosDock.undo(); await sl(300); await TimotheosDock.undo(); await sl(500);
  ok(!(TimotheosDock.state().slots || []).length && $('.dempty .dsplit'), 'undo takes the split back');
  // change the grid of a split block from 5 to 2: at once, only inside that block (0.6.125)
  $('.dempty .dsplit').click(); await sl(300);
  $$('.ld-picker .ld-cell').find(c => c.dataset.c === '3' && c.dataset.r === '1').click(); await sl(600);
  ok(TimotheosDock.state().slots.length === 3, 'split into 3');
  $('.dslot-tools [data-ld="pick"]').click(); await sl(300);
  ok($$('.ld-picker .ld-cell.lit').length === 3, 'the picker starts at the present 3 × 1');
  const p2 = $$('.ld-picker .ld-cell').find(c => c.dataset.c === '2' && c.dataset.r === '1');
  p2.dispatchEvent(new MouseEvent('mouseenter')); await sl(200);
  ok($$('.dslot').length === 2, 'hovering 2 × 1 shows 2 places at once (preview)');
  p2.click(); await sl(500);
  const s2 = TimotheosDock.state().slots;
  ok(s2.length === 2 && s2.every(x => x.x0 >= 2 - 1e-6) && $$('.dslot').length === 2 && JSON.stringify(TimotheosDock.state().areas.map(x => x.panels.join())) === '["tree","bv0"]', 'changed to 2 places in one click, only inside that block');
  $('.dslot-tools [data-ld="pick"]').click(); await sl(300);
  $$('.ld-picker .ld-cell').find(c => c.dataset.c === '3' && c.dataset.r === '2').dispatchEvent(new MouseEvent('mouseenter')); await sl(200);
  ok($$('.dslot').length === 6, 'preview 3 × 2');
  $('.ld-picker .ld-cancel').click(); await sl(300);
  ok(TimotheosDock.state().slots.length === 2 && $$('.dslot').length === 2, 'Cancel puts the 2 places back');
  await TimotheosDock.undo(); await sl(400);
  ok(TimotheosDock.state().slots.length === 3, 'undo: back to 3');
  // whole-window designer: 6 × 3 in a wide window
  TimotheosDock.clearAll(); await sl(400);
  $('#designLayoutBtn').click(); await sl(300);
  const c2 = $$('.ld-picker .ld-cell');
  ok(Math.max(...c2.map(c => +c.dataset.c)) === Math.min(6, Math.floor($('#workbench').getBoundingClientRect().width / 200)) && Math.max(...c2.map(c => +c.dataset.r)) === 3, `whole window: ${Math.max(...c2.map(c => +c.dataset.c))} × ${Math.max(...c2.map(c => +c.dataset.r))} (window ${Math.round($('#workbench').getBoundingClientRect().width)} px wide)`);
  if (window.__stage === 'design') { c2.find(c => c.dataset.c === '6' && c.dataset.r === '3')?.dispatchEvent(new MouseEvent('mouseenter')); console.log('RESULT ' + out.join(' | ')); return; }
  $('.ld-picker .ld-cancel').click();
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
