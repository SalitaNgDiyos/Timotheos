// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Parallel Bibles: its own Show switches (Words of Jesus, Headings, Italics, Verse numbers, notes and cross-references, Strong's and Morph).
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
try {
  await sl(1500);
  save({ parShow: null });
  const ids = state.modules.bibles.slice(0, 3).map(b => b.id);
  state.settings.parSets = [{ id: 'p1', name: 'T', bibles: ids, base: ids[0] }]; state.settings.parSetId = 'p1';
  TimotheosDock.show('par', { quiet: true }); await sl(2000);
  $('#tab-par .parmore').click(); await sl(200);
  const boxes = $$('#tab-par .parshow input[data-ps]').map(i => i.dataset.ps);
  ok(boxes.join(',') === 'woj,headings,added,vnums,footnotes,strongs', 'the ⋯ menu has the Show switches: ' + boxes.join(','));
  const vbefore = JSON.stringify(state.settings.show || {});
  const cb = k => $(`#tab-par .parshow input[data-ps="${k}"]`);
  cb('vnums').click(); await sl(900);
  const c1 = $('#tab-par .pcell[data-v]'); ok($('#tab-par .parbody').classList.contains('novn') && getComputedStyle(c1, '::before').display === 'none', 'verse numbers off');
  cb('vnums').click(); await sl(900);
  ok(!$('#tab-par .parbody').classList.contains('novn'), 'verse numbers on again');
  cb('strongs').click(); await sl(1200);
  ok(state.settings.parShow.strongs && state.settings.parShow.morph, "Strong's and Morph switch on together");
  const vis = $$('#tab-par sup.strong').filter(x => getComputedStyle(x).display !== 'none').length;
  ok(vis > 0 || !$$('#tab-par sup.strong').length, "Strong's numbers show in tagged Bibles: " + vis);
  cb('footnotes').click(); await sl(1200);
  ok(state.settings.parShow.footnotes === true, "translator's notes on: " + $$('#tab-par sup.fn, #tab-par sup.xref').length + ' marks');
  cb('woj').click(); await sl(900);
  ok(state.settings.parShow.woj === false, 'Words of Jesus off');
  ok(JSON.stringify(state.settings.show || {}) === vbefore, "the Bible views' own switches did not change");
  save({ parShow: null });
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
