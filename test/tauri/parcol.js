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
  $('#tab-par .parmore').click(); await sl(200); ok(!!$('#tab-par .parauto input[data-auto]'), 'Auto save switch is in the ⋯ menu');
  save({ parAutoSave: true });
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
