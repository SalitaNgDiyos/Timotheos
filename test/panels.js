// Rearrangeable panels (run with test/run.sh).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s);
  const tabs = z => [...document.querySelectorAll(`#zone-${z} > .ptabs [data-ptab]`)].map(b => b.dataset.ptab).join(',');
  const shown = el => el && el.offsetParent !== null && el.offsetWidth > 0;
  try {
    await sleep(500);
    ok(tabs('right') === 'cmt,lib,search,study' && !shown($('#zone-left')) && !shown($('#zone-bottom')), 'at first all panels are on the right: ' + tabs('right'));
    // move the Library to the left
    $('#zone-right .ptabs [data-ptab="lib"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 900, clientY: 70 })); await sleep(200);
    $('#vmenu [data-mv="left"]').click(); await sleep(800);
    ok(tabs('left') === 'lib' && shown($('#zone-left')) && $('#zone-left').contains($('#p-lib')) && shown($('#p-lib')), 'Library moved to the left (right now: ' + tabs('right') + ')');
    // Commentary (right) and Library (left) both on screen and both working
    T.showPanel('cmt'); await T.go(43, 3, 16); await sleep(800);
    ok(shown($('#p-cmt')) && shown($('#p-lib')) && /John 3:16/.test($('#cmtHead').textContent), 'Commentary and Library side by side; commentary follows John 3:16');
    const dict = T.books().find(m => /mounce/i.test(m.title) && m.file.endsWith('.lexi'));
    const sel = $('#libMod'); sel.value = dict.id; sel.dispatchEvent(new Event('change')); await sleep(1200);
    ok($('#libBody h4') && shown($('#p-cmt')), 'Library shows "' + $('#libBody h4')?.textContent + '" while the Commentary stays open');
    // Search to the bottom
    $('#zone-right .ptabs [data-ptab="search"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 900, clientY: 70 })); await sleep(200);
    $('#vmenu [data-mv="bottom"]').click(); await sleep(600);
    ok(tabs('bottom') === 'search' && shown($('#zone-bottom')) && shown($('#p-search')), 'Search moved to the bottom');
    ok(JSON.stringify(T.S().dock.left.panels) === '["lib"]' && JSON.stringify(T.S().dock.bottom.panels) === '["search"]', 'layout kept in settings');
    // resize the left panel by dragging its edge
    const sp = $('.dsplit[data-z="left"]'); const r = sp.getBoundingClientRect(); const w0 = $('#zone-left').offsetWidth;
    sp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: r.left + 2, clientY: r.top + 50 }));
    sp.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: r.left + 62, clientY: r.top + 50 }));
    sp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: r.left + 62, clientY: r.top + 50 })); await sleep(200);
    ok($('#zone-left').offsetWidth - w0 >= 50, 'left panel resized: ' + w0 + ' → ' + $('#zone-left').offsetWidth + ' px');
    // hide and show all panels
    $('#sideBtn').click(); await sleep(200); $('#mHideAll').click(); await sleep(200);
    ok(!shown($('#zone-left')) && !shown($('#zone-right')) && !shown($('#zone-bottom')), 'Layouts → Hide all panels');
    $('#sideBtn').click(); await sleep(200); $('#mHideAll').click(); await sleep(200);
    ok(shown($('#zone-left')) && shown($('#zone-right')), 'and shows them again');
    // reset
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-pre="default"]').click(); await sleep(600);
    ok(tabs('right') === 'cmt,lib,search,study' && !shown($('#zone-left')) && !shown($('#zone-bottom')), 'Layouts → Standard: all panels back on the right');
    // close a panel with ×, open it again from the Layouts menu
    $('#zone-right .tclose[data-close="search"]').click(); await sleep(300);
    ok(tabs('right') === 'cmt,lib,study', 'Search closed with ×: ' + tabs('right'));
    $('#sideBtn').click(); await sleep(200); const cb = $('#layoutMenu [data-pan="search"]'); ok(cb && !cb.checked, 'Layouts menu shows Search closed');
    cb.checked = true; cb.dispatchEvent(new Event('change')); await sleep(300);
    ok(tabs('right').includes('search'), 'and opens it again: ' + tabs('right'));
    // new panels: Dictionary, Books & chapters, another Bible view, another book view
    const pan = $('#layoutMenu [data-pan="dict"]'); pan.checked = true; pan.dispatchEvent(new Event('change')); await sleep(300);
    const w = document.querySelector('#view [data-strong]'); if (w) { await T.showWord(w); await sleep(600); }
    ok($('#dictBody') && $('#dictBody .entry h4'), 'Dictionary panel follows the word: ' + ($('#dictBody .entry h4')?.textContent || 'nothing'));
    $('#sideBtn').click(); await sleep(200); const tr = $('#layoutMenu [data-pan="tree"]'); tr.checked = true; tr.dispatchEvent(new Event('change')); await sleep(400);
    const rom = [...document.querySelectorAll('#p-tree .tbook')].find(b => b.dataset.name === 'Romans'); rom.querySelector('.tname').click(); await sleep(200);
    document.querySelector('#p-tree [data-tc="45.8"]').click(); await sleep(700);
    ok(T.S().ref.b === 45 && T.S().ref.c === 8 && document.querySelector('#p-tree [data-tc="45.8"]').classList.contains('cur'), 'Books & chapters: Romans 8 opened');
    $('#sideBtn').click(); await sleep(200); $('#mAddBible').click(); await sleep(900);
    const bv = document.querySelector('section[id^="p-bible-"]');
    const bsel = bv.querySelector('.vbible'); bsel.value = T.bibles().find(b => /^KJV$/i.test(b.abbr)).id; bsel.dispatchEvent(new Event('change')); await sleep(700);
    ok(bv && shown(bv) && bv.querySelectorAll('.vrow').length > 30 && /Romans 8/.test(bv.querySelector('.vhead').textContent), 'new Bible view follows the text: ' + (bv ? bv.querySelector('.vhead')?.textContent + ' · ' + bv.querySelectorAll('.vrow').length + ' verses' : 'none'));
    await T.go(43, 3, 16); await sleep(800);
    ok(/John 3/.test(bv.querySelector('.vhead').textContent) && bv.querySelector('.vrow.sel')?.dataset.v === '16', 'and moves with it to John 3:16');
    bv.querySelector('.vfol').click(); await sleep(200); const vb = bv.querySelector('.vbook'); vb.value = '1'; vb.dispatchEvent(new Event('change')); await sleep(600);
    ok(/Genesis 1/.test(bv.querySelector('.vhead').textContent) && T.S().ref.b === 43, 'not following: it shows Genesis 1 while the main text stays in John');
    $('#sideBtn').click(); await sleep(200); $('#mAddBook').click(); await sleep(500);
    const kv = document.querySelector('section[id^="p-book-"]'); const ms = kv.querySelector('.vmod');
    ms.value = T.books().find(m => /mounce/i.test(m.title) && m.file.endsWith('.lexi')).id; ms.dispatchEvent(new Event('change')); await sleep(1200);
    ok(kv.querySelector('.vbody h4') && /Mounce/.test(document.querySelector(`[data-ptab="${kv.id.slice(2)}"]`).textContent + kv.querySelector('.vbody').textContent), 'new book view shows Mounce: ' + kv.querySelector('.vbody h4')?.textContent + ' (tab: ' + document.querySelector(`[data-ptab="${kv.id.slice(2)}"]`).textContent + ')');
    ok(T.S().views && Object.keys(T.S().views).length === 2, 'added views kept in settings: ' + Object.keys(T.S().views || {}).join(', '));
    // save a layout and use it again
    $('#sideBtn').click(); await sleep(200); $('#mSaveLay').click(); await sleep(300);
    $('#layName').value = 'Test layout'; $('#layName').dispatchEvent(new Event('input')); $('.dlgbox .primary').click(); await sleep(300);
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-pre="reading"]').click(); await sleep(400);
    ok(!shown($('#zone-right')) && !shown($('#zone-left')), 'Layouts → Reading: the Bible only');
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-lay="Test layout"]').click(); await sleep(600);
    ok(tabs('right').includes('dict') && tabs('right').includes('cmt') && tabs('right').includes('bible-1'), 'saved layout back: ' + tabs('right'));
    T.showPanel('bible-1'); await sleep(600);
    ok(document.querySelectorAll('#p-bible-1 .vrow').length > 10, 'its Bible view works again: ' + document.querySelector('#p-bible-1 .vhead')?.textContent);
    // Options menu
    $('#optBtn').click(); await sleep(200);
    ok($('#optMenu [data-show="strongs"]') && $('#optMenu [data-ord="nets"]') && $('#optMenu #mOpts'), 'Options menu: show, text size, book order, Options…');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // user guide
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true })); await sleep(400);
    ok($('#guide') && !$('#guide').classList.contains('hidden') && document.querySelectorAll('#gMain section').length >= 12, 'F1 opens the user guide: ' + document.querySelectorAll('#gToc a').length + ' sections');
    $('#gFind').value = 'NEARv2'; $('#gFind').dispatchEvent(new Event('input')); await sleep(400);
    const vis = [...document.querySelectorAll('#gMain section')].filter(s => !s.classList.contains('hidden')).map(s => s.querySelector('h2').textContent);
    ok(vis.length === 1 && vis[0] === 'Searching' && document.querySelector('#gMain mark'), 'find in the guide: ' + vis.join(', '));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200);
    ok($('#guide').classList.contains('hidden'), 'Esc closes the guide');
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
