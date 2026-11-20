// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// "[vref]" links show the real reference, and Module properties > Verse links (preview, make a copy, in place).
// Needs /home/claude/vltest/{VL test.dct.twm,AnalyticalConcordance.dct.twm}; run: FOLDERS='["/home/claude/vltest"]' bash test/tauri/run.sh test/tauri/verselinks.js /tmp/vl.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 60) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* not yet */ } await sl(250); } return false; };
const $ = s => document.querySelector(s);
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  // 1. the placeholder text on display
  const ab = id => (state.nav.find(x => x.id === id) || {}).abbr || window.BOOK_ABBR[id];
  const t = document.createElement('div');
  t.innerHTML = sanitize('<a href="tw://bible.*?id=2.4.14">[vref]</a>; <a href="tw://bible.*?id=43.3.16-43.3.18">[vref]</a>; <a href="tw://bible.*?id=1.1.1">Gen 1:1</a>; <a href="tw://bible.*?id=2.4.14-2.5.2"></a>; <a href="tw://dct.X?t=G1">[vref]</a>');
  const a = [...t.querySelectorAll('a')].map(x => x.textContent);
  ok(a[0] === `${ab(2)} 4:14` && a[1] === `${ab(43)} 3:16\u201318`, '[vref] shows the reference: ' + JSON.stringify(a.slice(0, 2)) + ' want ' + `${ab(2)} 4:14`);
  ok(a[2] === 'Gen 1:1' && a[3] === `${ab(2)} 4:14\u20135:2` && a[4] === '[vref]', 'other links untouched, empty text filled, non-Bible link left: ' + JSON.stringify(a.slice(2)));
  // 2. the real module, from the library
  let L = await api.listModules();
  const ac = (L.books || []).find(b => /Analytical/.test(b.title || b.name || ''));
  ok(!!ac, 'AnalyticalConcordance is in the library');
  if (ac) {
    const tp = await api.bookTopics(ac.id); const tops = tp.topics || tp;
    const e = await api.bookTopic(ac.id, tops[0].id);
    const d = document.createElement('div'); d.innerHTML = sanitize(e.html);
    const links = [...d.querySelectorAll('a.link')].filter(x => /tw:\/\/bible/.test(x.dataset.href));
    ok(links.length > 10 && links.every(x => !/vref/.test(x.textContent)) && /\d+:\d+/.test(links[0].textContent), 'entry shows references: ' + links.slice(0, 3).map(x => x.textContent).join('; '));
  }
  // 3. Module properties > Verse links
  const vl = (L.books || []).find(b => /VL test/.test(b.title || b.name || ''));
  ok(!!vl, 'test dictionary is in the library');
  await TimotheosProps.open(vl.id, 'about'); await sl(400);
  ok(!$('#ppNavLinks').classList.contains('hidden'), 'Verse links page is offered for a theWord dictionary');
  $('#ppNavLinks').click(); await sl(300);
  ok(!!$('#vlGo') && $('#vlTl').checked && $('#vlFollow').checked && !$('#vlBare').checked && $('#vlFix').checked, 'options with their defaults');
  $('#vlPreview').click();
  ok(await until(() => /would change/.test($('#vlResult').textContent)), 'preview: ' + $('#vlResult').textContent);
  ok(/3 new links/.test($('#vlResult').textContent) && /Exo 4:14/.test($('#vlSamples').textContent), 'preview counts 3 links and shows examples: ' + $('#vlSamples').textContent.slice(0, 120));
  // a new copy
  document.querySelector('input[name=vlMode][value=copy]').click();
  $('#vlGo').click();
  ok(await until(() => /Create verse links/.test($('#modalTitle').textContent)), 'asks before it writes');
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent.trim() === 'OK').click();
  ok(await until(() => /Done/.test($('#vlResult').textContent), 80), 'copy made: ' + $('#vlResult').textContent);
  L = await api.listModules();
  ok((L.books || []).some(b => /verse links/.test(b.file || b.name || b.title || '')), 'the copy is in the library: ' + (L.books || []).map(b => b.title).join(','));
  // in place
  document.querySelector('input[name=vlMode][value=inplace]').click();
  await sl(700); $('#vlGo').click(); await sl(700);
  ok(await until(() => /Create verse links/.test($('#modalTitle').textContent)), 'asks again (in place)');
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent.trim() === 'OK').click();
  ok(await until(() => /Done/.test($('#vlResult').textContent), 80), 'in place done: ' + $('#vlResult').textContent);
  const again = await api.modVerseLinks(vl.id, {}, false);
  ok(again.changed === 0, 'nothing left to link');
  ok(!!(await api.modProps(vl.id)).backup, 'a backup of the original is kept');
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
