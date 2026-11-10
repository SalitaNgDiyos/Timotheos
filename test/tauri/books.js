/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.4.6: RichView book modules, Book search (apart from the Bible search), module sets
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
(async () => {
  await sleep(3000);
  // RichView
  const rv = state.modules.books.find(b => /RVF Test/.test(b.name));
  ok(rv && rv.kind === 'book', 'the RichView module is listed as a book: ' + (rv ? rv.name + ' / ' + rv.kind : 'none'));
  await TimotheosModules.openBookModule(rv.id); await sleep(800);
  const tp = [...document.querySelectorAll('#libTopics li[data-tid]')].find(li => /Grace/.test(li.textContent)); if (tp) tp.click(); await sleep(700);
  const body = $('#libBody');
  ok(/Grace is the free favour of God/.test(body.textContent) && !/cannot display/.test(body.textContent), 'RichView text shown: ' + body.textContent.replace(/\s+/g, ' ').slice(0, 70));
  const red = [...body.querySelectorAll('span')].find(s => /Not of works/.test(s.textContent));
  ok(red && getComputedStyle(red).fontStyle === 'italic' && /255, 0, 0/.test(getComputedStyle(red).color), 'formatting kept (red italic)');
  ok(body.querySelector('p.rvp[style*="center"]'), 'a centred paragraph');
  const lk = body.querySelector('[data-href*="49.2.8"]');
  ok(lk, 'a Bible link inside the RichView text: ' + (lk ? lk.textContent : 'none'));
  if (lk) { lk.click(); await sleep(800); ok((state.ref.b === 49 && state.ref.c === 2) || !state.nav.some(b => b.id === 49), 'clicking it goes to Ephesians 2: ' + JSON.stringify(state.ref) + ' (Ephesians in the open Bibles: ' + state.nav.some(b => b.id === 49) + ')'); }
  // Book search, its own panel
  ok(document.querySelector('[data-panel="bsearch"]') && document.querySelector('[data-panel="search"]'), 'Bible search and Book search are two panels');
  openTab('bsearch', true); await sleep(300);
  ok(document.activeElement === $('#bsInput'), 'the Book search panel opens with the cursor in its box');
  await TimotheosBookSearch.run('favour'); await sleep(300);
  const hits = [...document.querySelectorAll('#bsResults .bshit')];
  ok(hits.some(h => h.dataset.mod === rv.id) && /favour/.test($('#bsResults mark').textContent), 'finds words inside RichView topics, marked: ' + $('#bsStatus').textContent);
  await TimotheosBookSearch.run('"God so loved"'); await sleep(200);
  const h2 = [...document.querySelectorAll('#bsResults .bshit')];
  ok(h2.length >= 1 && /Commentary|commentar/i.test($('#bsResults').textContent), 'a phrase in a commentary: ' + $('#bsStatus').textContent);
  h2[0].click(); await sleep(1200);
  ok($('#libBody mark.bsmark'), 'clicking a result opens it in the Library with the words marked');
  // one kind only
  $('#bsScope').value = 'dictionary'; await TimotheosBookSearch.run('love'); await sleep(200);
  const kinds = new Set([...document.querySelectorAll('#bsResults .bshit')].map(h => state.modules.books.find(b => b.id === h.dataset.mod).kind));
  ok(kinds.size === 1 && kinds.has('dictionary'), 'searching only the dictionaries: ' + $('#bsStatus').textContent);
  // a module set
  save({ moduleSets: { 'Just the RichView': [rv.id] } }); TimotheosBookSearch.fillScope();
  $('#bsScope').value = 'set:Just the RichView'; await TimotheosBookSearch.run('faith'); await sleep(200);
  const h3 = [...document.querySelectorAll('#bsResults .bshit')];
  ok(h3.length >= 1 && h3.every(h => h.dataset.mod === rv.id), 'a module set limits the search: ' + $('#bsStatus').textContent);
  // the Bible search is untouched
  ok($('#searchResults').children.length === 0, 'the Bible search keeps its own (empty) results');
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
