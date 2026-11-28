// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Library: group tiles instead of the module list, a drop-down of modules under each tile, Manage groups, the ⋯ menu, topics on the left.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/libgroups.js /tmp/lg.png 1500
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const vis = e => !!e && e.offsetParent !== null;
try {
  await sl(1500);
  save({ libGroups: null, libGroupOf: {} });
  await TimotheosDock.show('lib'); await sl(400);
  await TimotheosModules.fillLibSelect(); await sl(200);
  ok(!vis($('#libMod')), 'no module drop-down list on the bar');
  const tiles = $$('#libGroups .lgtile'); ok(tiles.length >= 1, 'group tiles: ' + tiles.map(t => t.firstChild.textContent).join(', '));
  tiles[0].click(); await sl(200);
  const items = $$('.lgmenu button[data-id]'); ok(items.length >= 1, 'a tile drops down its modules: ' + items.length);
  const id = items[0].dataset.id; items[0].click(); await sl(1200);
  ok(TimotheosModules.lib.cur === id && !$('.lgmenu'), 'choosing one opens it and closes the list: ' + id);
  ok($$('#libGroups .lgtile.on').length === 1, 'the tile of the open module is marked');
  ok(!vis($('#libSpeak')) && !vis($('#libPrint')) && !vis($('#libInfo')), 'the tools are not on the bar');
  $('#libMoreBtn').click(); await sl(200);
  ok(vis($('#libSpeak')) && vis($('#libPrint')) && vis($('#libExport')) && vis($('#libInfo')) && vis($('#libCompress')) && vis($('#libGroupsBtn')), 'the ⋯ menu holds them, with Manage groups');
  ok(getComputedStyle($('#libPrint'), '::after').content.includes('Print'), 'menu rows have names');
  document.body.click(); await sl(100); ok($('#libMoreMenu').classList.contains('hidden'), 'a click elsewhere closes it');
  // Manage groups: a new group with this module in it
  const p = TimotheosLibGroups.manage(); await sl(300);
  [...$$('#modalBody button')].find(b => b.dataset.a === 'new').click(); await sl(150);
  const ins = $$('#modalBody .lgrow input'); ins[ins.length - 1].value = 'My favourites';
  const row = $$('#modalBody .lgbook').find(l => l.dataset.id === id); const sel = row.querySelector('select'); sel.value = [...sel.options].find(o => o.textContent === 'New group 1' || o.textContent === 'My favourites').value;
  [...$$('#modalBtns button')].find(b => b.textContent === 'Save').click(); await p; await sl(300);
  const t2 = $$('#libGroups .lgtile').map(t => t.firstChild.textContent);
  ok(t2.includes('My favourites'), 'the new group is a tile: ' + t2.join(', '));
  ok(TimotheosLibGroups.groupOf({ id, kind: 'x' }) === state.settings.libGroups.find(g => g.name === 'My favourites').id, 'the module is in it');
  ok($('#libGroups .lgtile.on').firstChild.textContent === 'My favourites', 'and its tile is marked');
  // topic list stays on the left in a narrow panel
  $('#tab-lib').style.width = '330px'; await sl(300);
  const sd = $('#libSide').getBoundingClientRect(), bd = $('#libBody').getBoundingClientRect();
  ok(sd.right <= bd.left + 2 && Math.abs(sd.top - bd.top) < 20, 'narrow: the topic list is still on the left (' + Math.round(sd.width) + 'px)');
  $('#tab-lib').style.width = '';
  save({ libGroups: null, libGroupOf: {} });
} catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | '));
})();
