// Runs inside the Tauri window (TANGLAW_SCRIPT); reports through the test_report command.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  try {
    await sleep(500);
    const bs = T.bibles();
    ok(bs.length >= 3, 'Bibles found: ' + bs.map(b => b.abbr + ' (' + b.format + ')').join(', '));
    ok(T.dicts().length >= 1, "Strong's dictionaries: " + T.dicts().map(d => d.title).join(', '));
    const kjv = bs.find(b => /^KJV$/i.test(b.abbr)); const wy = bs.find(b => /wycliffe/i.test(b.abbr + b.title) && b.file.endsWith('.bbli'));
    T.setOpen([kjv.id, wy.id]); await T.go(43, 3); await sleep(300);
    const row = document.querySelector('tr[data-v="16"]');
    ok(row && /For God so loved/.test(row.innerText) && /louede/.test(row.innerText), 'John 3:16 KJV + Wycliffe side by side');
    ok(document.querySelectorAll('tr[data-v]').length === 36, 'John 3 has 36 verses: ' + document.querySelectorAll('tr[data-v]').length);
    // Apocrypha in the 1611 place (Wycliffe has Tobit)
    T.step(1); await sleep(200);
    await T.go(39, 4); T.step(1); await sleep(400);
    ok(/Tobit|Tob/i.test(document.getElementById('capRef').textContent), 'after Malachi 4 comes ' + document.getElementById('capRef').textContent);
    // Strong's popup
    await T.go(43, 3); T.S().show.strongs = true; await T.go(43, 3); await sleep(300);
    const w = document.querySelector('tr[data-v="16"] [data-strong]');
    if (w) { await T.showWord(w); await sleep(400); }
    const pop = document.getElementById('popup');
    ok(w && !pop.classList.contains('hidden') && pop.querySelector('.entry h4'), "Strong's popup: " + (pop.querySelector('.entry h4') || {}).textContent + ' – ' + (pop.textContent || '').slice(0, 60));
    // study panel: commentary follows the verse
    await T.go(43, 3, 16); T.showPanel('cmt'); await sleep(600);
    ok(/John 3:16/.test(document.getElementById('cmtHead').textContent) && document.querySelectorAll('#cmtChips .chip').length >= 2 && /John 3:16/.test(document.getElementById('cmtBody').textContent), 'Commentary for John 3:16: ' + document.querySelectorAll('#cmtChips .chip').length + ' commentaries; ' + document.getElementById('cmtBody').textContent.slice(0, 70));
    ok(document.querySelector('tr[data-v="16"] .cm'), '"c" mark beside verses with a comment');
    // library: a dictionary topic, next/previous
    const dct = T.books().find(m => m.kind === 'dictionary' && /mounce/i.test(m.title) && m.file.endsWith('.lexi'));
    T.showPanel('lib'); const sel = document.getElementById('libMod'); sel.value = dct.id; sel.dispatchEvent(new Event('change')); await sleep(1200);
    const first = document.querySelector('#libBody h4')?.textContent;
    document.getElementById('libNext').click(); await sleep(500);
    ok(first && document.querySelector('#libBody h4')?.textContent !== first && document.querySelectorAll('#libTopics li').length > 1000, 'Library: Mounce (' + document.querySelectorAll('#libTopics li').length + ' topics), next topic: ' + first + ' → ' + document.querySelector('#libBody h4')?.textContent);
    document.getElementById('libFilter').value = 'G26'; document.getElementById('libFilter').dispatchEvent(new Event('input')); await sleep(700);
    ok([...document.querySelectorAll('#libTopics li')].some(li => li.textContent.trim() === 'G26'), 'topic filter finds G26');
    // search
    T.showPanel('search'); document.getElementById('searchInput').value = 'G26';
    document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true })); 
    for (let i = 0; i < 60 && !/verse/.test(document.getElementById('searchStatus').textContent); i++) await sleep(250);
    ok(/\b106\b/.test(document.getElementById('searchStatus').textContent), 'Search G26: ' + document.getElementById('searchStatus').textContent.slice(0, 80));
    document.getElementById('searchInput').value = 'faith NEARv2 hope';
    document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(2500);
    ok(/\b31\b/.test(document.getElementById('searchStatus').textContent), 'Search faith NEARv2 hope: ' + document.getElementById('searchStatus').textContent.slice(0, 60));
    document.querySelector('#searchResults li[data-b]').click(); await sleep(500);
    ok(document.querySelector('tr.sel'), 'clicking a result opens and selects the verse: ' + document.getElementById('capRef').textContent);
    // phone layout and the book picker
    T.S().show.strongs = false; await T.go(43, 3);
    window.__shot = true;
  } catch (e) { ok(false, 'error: ' + (e.stack || e)); }
  report();
})();
