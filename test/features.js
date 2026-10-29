// Copy Verses, cross-references, reading plans and Options (run with test/run.sh).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const closeDlg = async () => { key('Escape'); await sleep(300); };
  try {
    await sleep(500);
    const kjv = T.bibles().find(b => /^KJV$/i.test(b.abbr));
    T.setOpen([kjv.id]); await T.go(43, 3, 16); await sleep(400);
    // tidy cross-references: no verse twice, readable names
    await T.go(43, 3, 2); await sleep(600);
    const dup = [...document.querySelectorAll('#view .xrs')].filter(d => { const l = [...d.querySelectorAll('a.xr')].map(a => a.textContent.replace(/[\[\]]/g, '')); return new Set(l).size !== l.length; });
    ok(!dup.length, 'no cross-reference shown twice (John 3:2: ' + document.querySelector('#view [data-v="2"] .xrs')?.textContent + ')');
    await T.go(43, 3, 16); await sleep(600);
    ok(/1 John 4:9/.test(document.querySelector('#view [data-v="16"] .xrs')?.textContent || ''), 'book names read well: ' + document.querySelector('#view [data-v="16"] .xrs')?.textContent.slice(0, 60));
    // verse list in the navigation
    const vs = document.getElementById('verseSel');
    ok(vs && vs.options.length === 36 && vs.value === '16', 'verse list: ' + (vs ? vs.options.length + ' verses, at ' + vs.value : 'missing'));
    vs.value = '20'; vs.dispatchEvent(new Event('change')); await sleep(300);
    ok(T.S().ref.v === 20 && document.querySelector('#view [data-v="20"]').classList.contains('sel'), 'choosing verse 20 selects it');
    // Bible references inside a commentary
    await T.go(1, 2, 17); T.showPanel('cmt'); await sleep(700);
    let lk = null;
    for (const ch of document.querySelectorAll('#cmtChips .chip')) { ch.click(); await sleep(500); lk = document.querySelector('#cmtBody a[data-href*="bible"]'); if (lk) break; }
    ok(lk, 'Bible references in a commentary are links: ' + (lk ? lk.textContent + ' (' + document.querySelectorAll('#cmtBody a[data-href*="bible"]').length + ')' : 'none'));
    if (lk) {
      lk.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(900);
      const tip = document.getElementById('reftip');
      ok(tip && !tip.classList.contains('hidden') && tip.textContent.length > 20, 'resting on it shows the verse: ' + (tip ? tip.textContent.slice(0, 70) : ''));
      const want = lk.dataset.href; lk.click(); await sleep(700);
      ok(want.includes('id=' + T.S().ref.b + '.' + T.S().ref.c + '.' + T.S().ref.v), 'clicking it opens ' + document.getElementById('capRef').textContent + ':' + T.S().ref.v);
    }
    await T.go(43, 3, 16); await sleep(400);
    // Copy Verses (F5)
    key('F5'); await sleep(900);
    const prev = document.getElementById('cpPreview');
    ok(prev && /For God so loved/.test(prev.textContent), 'Copy Verses window, preview: ' + (prev ? prev.textContent.slice(0, 70) : 'none'));
    document.getElementById('cpToBtn')?.click(); await sleep(500);
    const pk = document.getElementById('vpick');
    ok(pk && !pk.classList.contains('hidden') && pk.querySelectorAll('button').length > 20, 'verse picker opens with ' + (pk ? pk.querySelectorAll('button').length : 0) + ' buttons');
    pk.querySelector('[data-v="18"]')?.click(); await sleep(600);
    ok(/3 verses/.test(document.getElementById('cpCount')?.textContent || '') || /18/.test(document.getElementById('cpToLbl')?.textContent || ''), 'range to 3:18: ' + document.getElementById('cpToLbl')?.textContent + ' / ' + document.getElementById('cpCount')?.textContent);
    document.querySelector('[data-r="close"]').click(); await sleep(300);
    ok(!document.getElementById('cpPreview'), 'Copy window closed');
    // cross-references
    const xs = document.querySelectorAll('#view [data-v="16"] a.xr');
    ok(xs.length > 0, 'cross-references under John 3:16: ' + [...xs].slice(0, 4).map(a => a.textContent).join('; '));
    await T.addXref({ b: 43, c: 3, v: 16 }, { b: 45, c: 5, v: 8 }); await T.go(43, 3, 16); await sleep(600);
    const mine = document.querySelector('#view [data-v="16"] a.xr.mine');
    ok(mine && /Rom/.test(mine.textContent), 'my own cross-reference added: ' + (mine ? mine.textContent : 'none'));
    await T.removeXref({ b: 43, c: 3, v: 16 }, { b: 45, c: 5, v: 8 }); await T.go(43, 3, 16); await sleep(600);
    ok(!document.querySelector('#view [data-v="16"] a.xr.mine'), 'my cross-reference removed');
    // reading plans
    T.showPanel('study'); await sleep(300);
    document.querySelector('[data-st="plans"]').click(); await sleep(500);
    document.getElementById('newPlan').click(); await sleep(500);
    document.querySelector('.dlgbox .primary').click(); await sleep(900);
    const plan = document.querySelector('#studyBody .plan');
    ok(plan && /\/\s*\d+/.test(plan.textContent), 'reading plan made: ' + (plan ? plan.querySelector('.srow').textContent.trim().replace(/\s+/g, ' ') : 'none'));
    ok(document.querySelector('#studyBody [data-read]'), "today's reading: " + (document.querySelector('#studyBody [data-read]')?.textContent || 'none'));
    // Options (Ctrl+,)
    key(',', { ctrlKey: true }); await sleep(700);
    const box = document.querySelector('.opts');
    ok(box && box.querySelectorAll('.skin').length >= 4, 'Options window with ' + (box ? box.querySelectorAll('.skin').length : 0) + ' skins');
    const vp = document.getElementById('oVp'); vp.value = 'inline'; vp.dispatchEvent(new Event('change')); await sleep(700);
    ok(document.querySelectorAll('sup.vnum').length >= 30 && document.getElementById('view').dataset.vnpos === 'inline', 'verse numbers in the text: ' + document.querySelectorAll('sup.vnum').length);
    const lh = document.getElementById('oLh'); lh.value = '2'; lh.dispatchEvent(new Event('input'));
    const w = document.getElementById('oW'); w.value = '680'; w.dispatchEvent(new Event('change')); await sleep(300);
    ok(getComputedStyle(document.querySelector('#view table.chap, #view .rows')).maxWidth === '680px', 'text width narrow: ' + getComputedStyle(document.querySelector('#view table.chap, #view .rows')).maxWidth);
    ok(T.S().look.lineH === 2 && T.S().look.vnPos === 'inline', 'options saved in settings');
    document.querySelector('.dlgbox .primary').click(); await sleep(400);
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
