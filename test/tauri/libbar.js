// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Library bar: one row; group tiles that do not fit fold into "+N"; the open module's tile stays.
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
try {
  await sl(1500);
  save({ libGroups: [{ id: 'k:dictionary', name: 'Dictionaries' }, { id: 'k:book', name: 'Books' }, { id: 'g1', name: 'Greek lexicons' }, { id: 'g2', name: 'Hebrew lexicons' }], libGroupOf: {} });
  await TimotheosDock.show('lib'); await sl(400); await TimotheosModules.fillLibSelect(); await sl(300);
  const bar = $('#tab-lib .libbar'), tab = $('#tab-lib');
  const oneRow = () => { const ys = [...bar.children].filter(c => c.offsetParent && !c.classList.contains('libmenu')).map(c => Math.round(c.getBoundingClientRect().top)); return Math.max(...ys) - Math.min(...ys) < 8; };
  const libs = state.modules.books.filter(b => !b.hidden);
  const of = {}; libs.slice(0, 2).forEach(b => { of[b.id] = 'g1'; }); libs.slice(2, 3).forEach(b => { of[b.id] = 'g2'; }); save({ libGroupOf: of }); await TimotheosModules.fillLibSelect(); await sl(300);
  const tiles = () => $$('#libGroups .lgtile[data-g]').filter(t => t.offsetParent);
  ok(oneRow(), 'wide: one row, ' + tiles().length + ' tiles, bar ' + Math.round(bar.offsetHeight) + 'px');
  tab.style.width = '300px'; await sl(400);
  const plus = $('#libGroups .lgplus');
  ok(oneRow() && plus && plus.offsetParent, 'narrow (300px): still one row, the rest under ' + (plus && plus.textContent));
  ok(['libBack', 'libPrev', 'libNext', 'libMoreBtn', 'libSideBtn'].every(id => $('#' + id).offsetParent && $('#' + id).getBoundingClientRect().right <= tab.getBoundingClientRect().right + 1), 'the buttons stay in the panel');
  plus.click(); await sl(200);
  ok($$('.lgmenu .lghead').length >= 1 && $$('.lgmenu button[data-id]').length >= 1, 'the +N list shows the folded groups with their modules: ' + $$('.lgmenu .lghead').map(h => h.textContent).join(', '));
  const pick = $('.lgmenu button[data-id]'); const id = pick.dataset.id; pick.click(); await sl(1200);
  ok(TimotheosModules.lib.cur === id && tiles().some(t => t.classList.contains('on')), 'choosing one opens it and its tile comes into view');
  tab.style.width = '200px'; await sl(400);
  ok(oneRow() && tiles().length >= 1 && tiles().every(t => t.classList.contains('on')), 'very narrow (200px): one row, only the open tile + ' + ($('#libGroups .lgplus') || {}).textContent);
  tab.style.width = '';
  save({ libGroups: null, libGroupOf: {} });
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
