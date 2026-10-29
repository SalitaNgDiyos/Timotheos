// Search: options, ranges, books, statistics, history, list (run with test/run.sh).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s);
  const runQ = async q => { $('#searchInput').value = q; $('#searchForm').dispatchEvent(new Event('submit', { cancelable: true })); for (let i = 0; i < 80 && !/verse/.test($('#searchStatus').textContent); i++) await sleep(250); await sleep(200); return $('#searchStatus').textContent; };
  try {
    const kjv = T.bibles().find(b => /^KJV$/i.test(b.abbr)); T.setOpen([kjv.id]); await T.go(43, 3, 16);
    T.showPanel('search'); await sleep(400);
    $('#searchInput').value = 'faith AND hope'; $('#searchInput').dispatchEvent(new Event('input')); await sleep(500);
    ok(/Looking for/.test($('#searchExplain').textContent), 'live explanation: ' + $('#searchExplain').textContent);
    let st = await runQ('G26');
    ok(/\b106\b/.test(st), 'G26 in the whole Bible: ' + st.slice(0, 50));
    $('[data-sp="books"]').click(); await sleep(200);
    const rows = document.querySelectorAll('#searchBooks tr[data-fb]');
    ok(rows.length > 5, 'Books view: ' + rows.length + ' books, top ' + rows[0]?.textContent.replace(/\s+/g, ' '));
    const john = [...rows].find(r => r.cells[0].textContent.trim() === 'John'); john?.click(); await sleep(300);
    ok(document.querySelectorAll('#searchResults li[data-b]').length && [...document.querySelectorAll('#searchResults li[data-b]')].every(li => li.dataset.b === '43'), 'clicking John lists only John: ' + document.querySelectorAll('#searchResults li[data-b]').length);
    $('[data-sp="stats"]').click(); await sleep(200);
    ok(/love/i.test($('#searchStats').textContent), 'Statistics: ' + $('#searchStats').textContent.replace(/\s+/g, ' ').slice(0, 90));
    // ranges
    const sc = $('#searchScope'); sc.value = 'gospels'; sc.dispatchEvent(new Event('change'));
    st = await runQ('G26'); const n = +(/\b(\d+)\b/.exec(st) || [])[1];
    ok(n > 0 && n < 106, 'G26 in the Gospels: ' + st.slice(0, 40));
    sc.value = '__custom'; sc.dispatchEvent(new Event('change')); await sleep(400);
    $('#rgText').value = 'John 13-17'; $('#rgText').dispatchEvent(new Event('input')); $('#rgName').value = 'Upper Room'; $('#rgName').dispatchEvent(new Event('input')); await sleep(100);
    ok(/understood/.test($('#rgCheck').textContent), 'range check: ' + $('#rgCheck').textContent);
    $('.dlgbox .primary').click(); await sleep(400);
    ok([...sc.options].some(o => o.textContent === 'Upper Room') && sc.value === 'John 13-17', 'saved range "Upper Room" chosen');
    st = await runQ('love');
    const lis = [...document.querySelectorAll('#searchResults li[data-b]')];
    ok(lis.length && lis.every(li => li.dataset.b === '43' && +li.dataset.c >= 13 && +li.dataset.c <= 17), 'love in John 13–17: ' + st.slice(0, 30));
    // options: any word
    sc.value = 'all'; sc.dispatchEvent(new Event('change'));
    $('#optDefault').value = 'or'; $('#optDefault').dispatchEvent(new Event('change'));
    const a = +(/\b(\d+)\b/.exec(await runQ('Nicodemus Gamaliel')) || [])[1];
    ok(a >= 7, 'any word (OR): Nicodemus Gamaliel → ' + a);
    $('#optDefault').value = 'and'; $('#optDefault').dispatchEvent(new Event('change'));
    // history and list
    $('#searchHist').click(); await sleep(200);
    ok(document.querySelectorAll('#vmenu [data-q]').length >= 3, 'earlier searches: ' + [...document.querySelectorAll('#vmenu [data-q]')].map(b => b.textContent).join(', '));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    ok(T.S().search && T.S().search.scope === 'all', 'search options kept in settings');
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
