// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Parallel Bibles: a Bible drop-down and move arrows on each column title, Auto save and the Save icon.
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
try {
  await sl(1500);
  const all = state.modules.bibles.map(b => b.id); const ids = all.slice(0, 3);
  state.settings.parSets = [{ id: 'p1', name: 'T', bibles: ids, base: ids[0] }]; state.settings.parSetId = 'p1'; save({ parAutoSave: true });
  TimotheosDock.show('par', { quiet: true }); await sl(2200);
  const heads = () => $$('#tab-par .pth b').map(b => b.textContent.trim());
  const h0 = heads(); ok(h0.length === 3 && $$('#tab-par .pth [data-pcol="drop"]').length === 3, 'each column title has a drop-down: ' + h0.join(','));
  ok($('#tab-par .pth [data-pcol="left"]').disabled && $$('#tab-par .pth [data-pcol="right"]')[2].disabled, 'arrows dimmed at the ends');
  $$('#tab-par .pth [data-pcol="right"]')[0].click(); await sl(1500);
  const h1 = heads(); ok(h1[0] === h0[1] && h1[1] === h0[0], 'right arrow moves the first Bible one place: ' + h1.join(','));
  ok(state.settings.parSets[0].bibles[0] === ids[1], 'auto save on: the set itself changed');
  $('#tab-par .pth [data-pcol="drop"]').click(); await sl(300);
  const items = $$('.parbl button[data-id]'); ok(items.length === all.length, 'the list has every installed Bible: ' + items.length);
  const other = items.find(b => !state.settings.parSets[0].bibles.includes(b.dataset.id));
  if (other) { other.click(); await sl(1500); ok(state.settings.parSets[0].bibles[0] === other.dataset.id, 'choosing a Bible replaces the column'); }
  // auto save off: temporary, Save icon appears
  save({ parAutoSave: false }); const before = JSON.stringify(state.settings.parSets[0].bibles); await sl(200);
  $$('#tab-par .pth [data-pcol="right"]')[0].click(); await sl(1500);
  ok(JSON.stringify(state.settings.parSets[0].bibles) === before, 'auto save off: the set is not changed');
  ok(!!$('#tab-par .parsave'), 'the Save icon shows');
  $('#tab-par .parsave').click(); await sl(1500);
  ok(JSON.stringify(state.settings.parSets[0].bibles) !== before && !$('#tab-par .parsave'), 'Save keeps the change in the set and the icon goes');
  // drag a label onto another one
  save({ parAutoSave: true }); await sl(300);
  const dragLab = async (sel, vertical) => {
    if (vertical) { const pb = $('#tab-par .parbody'); pb.scrollTop = 0; await sl(300); }
    const labs = $$(sel); const A = labs[1].getBoundingClientRect(), B = labs[0].getBoundingClientRect();
    const fire = (t, type, x, y) => (t || document).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerType: 'mouse' }));
    const sx = A.left + 12, sy = A.top + A.height / 2, ex = B.left + 12, ey = vertical ? B.top + 2 : B.top + B.height / 2;
    fire(labs[1].querySelector('b') || labs[1], 'pointerdown', sx, sy); fire(document, 'pointermove', sx + 20, sy + 20); fire(document, 'pointermove', ex, ey); await sl(100); fire(document, 'pointerup', ex, ey); await sl(1500);
  };
  const b0 = [...state.settings.parSets[0].bibles];
  await dragLab('#tab-par .pth[data-chip]', false);
  const b1 = state.settings.parSets[0].bibles; ok(b1[0] === b0[1] && b1[1] === b0[0], 'dragging the second column title before the first moves it: ' + b0.join(',') + ' -> ' + b1.join(','));
  save({ parLayout: { pc: 'stack' } }); TimotheosParallel.render(true, true); await sl(2000);
  const first = $('#tab-par .plb[data-chip]');
  if (first) { const bb = [...state.settings.parSets[0].bibles]; await dragLab('#tab-par .psv .plb[data-chip]', true); const ba = state.settings.parSets[0].bibles; ok(JSON.stringify(ba) !== JSON.stringify(bb), 'Stacked: dragging a label moves the Bible: ' + bb.join(',') + ' -> ' + ba.join(',')); }
  else ok(false, 'no stacked labels');
  save({ parLayout: { pc: 'cols' } }); TimotheosParallel.render(true, true);
  $('#tab-par .parmore').click(); await sl(200); ok(!!$('#tab-par .parauto input[data-auto]'), 'Auto save switch is in the ⋯ menu');
  save({ parAutoSave: true });
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
