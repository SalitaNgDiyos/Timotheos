/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Audit steps 4 to 9 on the desktop: panels reach the window edges, drop-down lists follow the skin, cross-references
// are a small mark unless written out, search results use the whole width, the Library text keeps its room.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  await sleep(2500);
  // edges
  const w = $('#workbench').getBoundingClientRect(), g = $$('#grid > .dgroup').map(e => e.getBoundingClientRect());
  const L = Math.min(...g.map(r => r.left)) - w.left, T = Math.min(...g.map(r => r.top)) - w.top, Rr = w.right - Math.max(...g.map(r => r.right)), B = w.bottom - Math.max(...g.map(r => r.bottom));
  ok(Math.max(L, T, Rr, B) <= 1 && Math.min(L, T, Rr, B) >= 0, `panels reach the edges of the window (left ${L}, top ${T}, right ${Rr}, bottom ${B})`);
  ok(getComputedStyle($('#importBtn2 .lbl')).display !== 'none', 'the toolbar\'s Import button has its word');
  // cross-references: a mark by default
  for (let i = 0; i < 40 && !$('.bv .xrs'); i++) await sleep(250);
  const mk = $$('.bv .xrs.xrmk a.xrmore'); ok(mk.length > 0 && !$('.bv .xrs a.xr'), `cross-references are small marks (${mk.length}), not written out`);
  ok(/^†\d+$/.test(mk[0] ? mk[0].textContent : ''), 'a mark shows how many there are: ' + (mk[0] ? mk[0].textContent : ''));
  toggleViewShow(0, 'xrefsFull', true); for (let i = 0; i < 40 && !$('.bv .xrs a.xr'); i++) await sleep(250);
  // a click on a mark lists the references of that verse

  ok($$('.bv')[0].querySelectorAll('.xrs a.xr').length > 0, '"written out in the text" prints them as before');
  toggleViewShow(0, 'xrefsFull', false); for (let i = 0; i < 40 && !$('.bv .xrs.xrmk'); i++) await sleep(250);
  { const m = $('.bv .xrs.xrmk a.xrmore'); const n = +m.textContent.slice(1); m.click(); await sleep(900);
    const feed = $$('#tab-lib .entry'); const listed = /Cross-references for/.test(feed[0] ? feed[0].textContent : '') ? feed.length - 1 : 0;
    ok(listed >= n && n > 0, `a click on a mark lists its ${n} reference(s) (${listed} listed)`); const mo = $('#modal'); if (mo) mo.classList.add('hidden'); }
  // drop-down lists in a dark skin
  TimotheosOptions.setSkin('midnight'); await sleep(600);
  const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255; };
  for (const id of ['#searchBibles', '#searchScope', '#libMod']) { const cs = getComputedStyle($(id)); ok(lum(cs.backgroundColor) < 0.4 && lum(cs.color) > 0.6, `dark skin: ${id} is dark with light text (${cs.backgroundColor} / ${cs.color})`); }
  TimotheosOptions.setSkin('parchment'); await sleep(400);
  // search: the list of Bibles to tick shows only when it has an effect; results across the panel
  ok($('#searchPick').classList.contains('hidden'), 'search: "Choose the Bibles" is hidden while "Bibles open in the view" is chosen');
  $('#searchBibles').value = 'chosen'; $('#searchBibles').dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
  ok(!$('#searchPick').classList.contains('hidden'), 'search: it shows with "The Bibles I tick below"');
  $('#searchBibles').value = 'open'; $('#searchBibles').dispatchEvent(new Event('change', { bubbles: true }));
  $('#searchInput').value = 'faith hope'; $('#searchForm').requestSubmit(); for (let i = 0; i < 40 && !/verses? in/.test($('#searchStatus').textContent); i++) await sleep(250);
  const tab = $('#tab-search').getBoundingClientRect(), so = $('.searchout').getBoundingClientRect();
  ok(so.width > tab.width * 0.85, `search: the results use the width of the panel (${Math.round(so.width)} of ${Math.round(tab.width)})`);
  // Library: the text keeps most of the room
  const s = $('#libMod'); s.selectedIndex = 3; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(1500);
  const lb = $('#libBody').getBoundingClientRect(), lt = $('#tab-lib').getBoundingClientRect();
  ok(lb.width >= lt.width * 0.55, `Library: the text has most of the panel's width (${Math.round(lb.width)} of ${Math.round(lt.width)})`);
  // Options: Reset appearance only on the appearance pages
  runCommand('options'); await sleep(400); $('#optNav [data-o="mods"]').click(); await sleep(200);
  ok(getComputedStyle($('#optReset')).visibility === 'hidden', 'Options → Modules: no "Reset appearance"'); $('#optNav [data-o="look"]').click(); await sleep(200);
  ok(getComputedStyle($('#optReset')).visibility !== 'hidden', 'Options → Skin: "Reset appearance" is there');
  // back up and restore: the menu has both; the restore dialog shows both counts and offers the two ways
  $('#optionsDlg').classList.add('hidden');
  let applied = null; const C = { notes: 3, highlights: 2, bookmarks: 1, lists: 1, listVerses: 4, plans: 0, bookMarks: 0 };
  api.studyRestoreRead = async () => ({ path: '/x/b.json', made: '2026-11-01T00:00:00Z', counts: C, here: Object.assign({}, C, { notes: 1 }) });
  api.studyRestoreApply = async (f, m) => { applied = [f, m]; return { counts: C, kept: 'k.json' }; };
  runCommand('restoreStudy'); await sleep(600);
  ok(/3 notes/.test($('#rsIn').textContent) && /1 note,/.test($('#rsHere').textContent), 'restore: the dialog shows what is in the backup and what is here');
  const btns = $$('#modal button').map(b => b.textContent.trim()); ok(['Cancel', 'Replace what is here', 'Add to what is here'].every(t => btns.includes(t)), 'restore: Cancel, Replace, Add are offered');
  $$('#modal button').find(b => b.textContent.trim() === 'Add to what is here').click(); await sleep(900);
  ok(applied && applied[1] === 'merge' && applied[0] === '/x/b.json', 'restore: "Add to what is here" merges that file');
  api.studyRestoreRead = async () => { throw new Error('This file is not a Timotheos study backup.'); };
  runCommand('restoreStudy'); await sleep(500); ok(/not a Timotheos study backup/.test($('#modal').textContent), 'restore: a wrong file is refused in plain words'); $$('#modal button').pop().click();
  // the desktop guide names only what is in the app
  $('#modal').classList.add('hidden');
  const gh = await (await fetch('guide.html')).text(); const desk = gh.slice(gh.indexOf('id="guide"'), gh.indexOf('id="guideP"'));
  const stale = ['<i>Go to</i> box', '<b>Focus</b>', '<b>Bibles</b> panel', 'Timotheos.exe', '<i>Lookup</i>, <i>Library</i>'].filter(t => desk.includes(t));
  ok(stale.length === 0, 'guide: no button or panel that is gone (' + stale.join(', ') + ')');
  $('#panelsBtn').click(); await sleep(400); const pm = $('#panelsMenu') ? $('#panelsMenu').textContent : document.body.textContent;
  const li = (desk.match(/<li><b>Panels<\/b> around it: ([^<]*(?:<i>[^<]*<\/i>[^<]*)+)\.<\/li>/) || [])[1] || ''; const named = [...li.matchAll(/<i>([^<]+)<\/i>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  const missing = named.filter(n => !pm.includes(n)); ok(named.length >= 5 && missing.length === 0, `guide: every panel it names is in the Panels menu (${named.length} named; missing: ${missing.join(', ')})`);
  document.body.click();
  ok(/Back Up My Study/.test(desk) && /†3/.test(desk), 'guide: it explains the study backup and the cross-reference marks');
  // where to get modules
  let opened = null; api.openExternal = async u => { opened = u; };
  ok(/id="libGetHint"><a class="link" data-href="cmd:getModules"/.test(await (await fetch('index.html')).text()), 'the Library, before a module is chosen, offers "Where to get modules"');
  runCommand('getModules'); await sleep(500);
  const gm = $('#modal .getmods'); ok(!!gm, 'File → Where to Get Modules… opens the list');
  const links = $$('#modal .gmsite a').map(a => a.dataset.href); ok(['https://www.wordmodules.com/', 'https://www.biblesupport.com/', 'https://ebible.org/'].every(u => links.includes(u)), 'it has the three sites: ' + links.join(' '));
  ok(/Ctrl\+I/.test(gm.textContent) && /drag them onto/.test(gm.textContent) && /\.exe/.test(gm.textContent), 'it explains how to import on a computer, and what cannot be imported');
  $('#modal .gmsite a').click(); await sleep(300); ok(opened === 'https://www.wordmodules.com/', 'a site link opens in the browser: ' + opened);
  ok($$('#modal button').some(b => /Import modules/.test(b.textContent)), 'it offers Import modules…'); $$('#modal button').find(b => b.textContent.trim() === 'Close').click(); await sleep(200);
  ok(/Where to get modules/.test(desk) && /wordmodules\.com/.test(desk) && /biblesupport\.com/.test(desk) && /ebible\.org/.test(desk), 'guide: it lists the sites and the steps');
  console.log('RESULT ' + out.join(' | '));
})();
