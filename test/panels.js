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
  const panes = z => [...document.querySelectorAll(`#zone-${z} > .dgroup`)].map(g => [...g.querySelectorAll('.dtab')].map(t => t.dataset.ptab).join('+')).join(' | ');
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const pe = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: y }));
  /** drag a tab with the mouse onto a drop target found by a function */
  async function dragTab(id, findTarget) {
    const tab = document.querySelector(`.dtab[data-ptab="${id}"]`); const [x, y] = center(tab);
    pe('pointerdown', tab, x, y); pe('pointermove', document, x + 20, y + 20); await sleep(100);
    let t = findTarget(); if (t && !t.isConnected) t = null;
    if (!t) { pe('pointerup', document, x + 20, y + 20); return false; }
    let [tx, ty] = center(t); pe('pointermove', document, tx, ty); await sleep(100);
    t = findTarget() || t; [tx, ty] = center(t); pe('pointermove', document, tx, ty); await sleep(100);
    pe('pointerup', document, tx, ty); await sleep(400); return true;
  }
  try {
    await sleep(800);
    ok(panes('right') === 'cmt | lib+search+study' && !shown($('#zone-left')) && !shown($('#zone-bottom')), 'at first: two panes on the right: ' + panes('right'));
    // drag the Library tab to the left edge arrow: a pane of its own on the left
    ok(await dragTab('lib', () => document.querySelector('.dtarget.edge[data-t*="left"]')), 'left edge arrow appears while dragging');
    ok(panes('left') === 'lib' && shown($('#p-lib')), 'Library dragged to the left: left ' + panes('left') + ' · right ' + panes('right'));
    // drag Search over the Commentary pane: the compass; drop "below this pane"
    const ok2 = await dragTab('search', () => { const c = document.querySelector('#zone-right .dgroup'); if (c && !document.querySelector('.dcompass')) { const [x, y] = center(c); pe('pointermove', document, x, y); } return document.querySelector('.dcompass .dtarget[data-t*="after"]'); });
    ok(ok2 && panes('right').startsWith('cmt | search'), 'compass: Search put below the Commentary: ' + panes('right'));
    ok(T.S().dock && T.S().dock.v === 2 && T.S().dock.zones.left.groups.length === 1, 'layout kept in settings');
    // both on screen and working
    T.showPanel('cmt'); await T.go(43, 3, 16); await sleep(800);
    ok(shown($('#p-cmt')) && shown($('#p-lib')) && /John 3:16/.test($('#cmtHead').textContent), 'Commentary and Library at once; commentary follows John 3:16');
    // pane buttons: text size, maximize, float, close
    const cg = $('#p-cmt').closest('.dgroup');
    cg.querySelector('[data-act="zoom+"]').click(); await sleep(200);
    ok(getComputedStyle($('#p-cmt')).zoom === '1.1' || $('#p-cmt').style.zoom === '1.1', 'A+ makes the Commentary text larger (zoom ' + $('#p-cmt').style.zoom + ')');
    cg.querySelector('[data-act="zoom-"]').click(); await sleep(100);
    $('#p-cmt').closest('.dgroup').querySelector('[data-act="max"]').click(); await sleep(300);
    ok($('#p-cmt').closest('.dgroup').classList.contains('max'), 'maximize');
    $('#p-cmt').closest('.dgroup').querySelector('[data-act="max"]').click(); await sleep(200);
    $('#p-cmt').closest('.dgroup').querySelector('[data-act="float"]').click(); await sleep(300);
    ok($('#p-cmt').closest('.dgroup').classList.contains('dfloat'), 'float as a window');
    $('#p-cmt').closest('.dgroup').querySelector('[data-act="float"]').click(); await sleep(300);
    ok(!$('#p-cmt').closest('.dgroup').classList.contains('dfloat') && shown($('#p-cmt')), 'and dock again');
    // left panel resized by dragging its edge
    const sp = $('.dsplit[data-z="left"]'); const r = sp.getBoundingClientRect(); const w0 = $('#zone-left').offsetWidth;
    pe('pointerdown', sp, r.left + 2, r.top + 50); pe('pointermove', sp, r.left + 62, r.top + 50); pe('pointerup', sp, r.left + 62, r.top + 50); await sleep(200);
    ok($('#zone-left').offsetWidth - w0 >= 50, 'left side resized: ' + w0 + ' → ' + $('#zone-left').offsetWidth + ' px');
    // the topic list is resizable
    const dict = T.books().find(m => /mounce/i.test(m.title) && m.file.endsWith('.lexi'));
    const sel = $('#libMod'); sel.value = dict.id; sel.dispatchEvent(new Event('change')); for (let i = 0; i < 40 && !$('#libBody h4'); i++) await sleep(200);
    const ls = $('#p-lib .lsplit'); const lr = ls.getBoundingClientRect(); const tw0 = $('#p-lib .libside').offsetWidth;
    pe('pointerdown', ls, lr.left + 2, lr.top + 40); pe('pointermove', ls, lr.left + 42, lr.top + 40); pe('pointerup', ls, lr.left + 42, lr.top + 40); await sleep(200);
    ok($('#p-lib .libside').offsetWidth - tw0 >= 30, 'topic list made wider: ' + tw0 + ' → ' + $('#p-lib .libside').offsetWidth + ' px');
    // close a pane, open it again from the Layouts menu
    $('#p-search').closest('.dgroup').querySelector('[data-act="close"]').click(); await sleep(300);
    ok(!panes('right').includes('search'), 'Search closed: ' + panes('right'));
    $('#sideBtn').click(); await sleep(200); const cb = $('#layoutMenu [data-pan="search"]'); ok(cb && !cb.checked, 'Layouts menu shows Search closed');
    cb.checked = true; cb.dispatchEvent(new Event('change')); await sleep(300);
    ok(document.querySelector('.dtab[data-ptab="search"]'), 'and opens it again: ' + panes('right'));
    document.querySelectorAll('.menu').forEach(m => m.classList.add('hidden'));
    // Dictionary follows the word
    T.showPanel('dict'); await sleep(300);
    const w = document.querySelector('#view [data-strong]'); if (w) { await T.showWord(w); await sleep(600); }
    ok($('#dictBody .entry h4'), 'Dictionary pane follows the word: ' + ($('#dictBody .entry h4')?.textContent || 'nothing'));
    // a new Bible view gets a pane of its own; its books & chapters icon
    const before = document.querySelectorAll('.dgroup').length;
    $('#sideBtn').click(); await sleep(200); $('#mAddBible').click(); await sleep(800);
    const bv = document.querySelector('section[id^="p-bible-"]');
    ok(bv && shown(bv) && document.querySelectorAll('.dgroup').length === before + 1 && bv.closest('.dgroup').querySelectorAll('.dtab').length === 1, 'new Bible view in a pane of its own (' + document.querySelectorAll('.dgroup').length + ' panes)');
    const bsel = bv.querySelector('.vbible'); bsel.value = T.bibles().find(b => /^KJV$/i.test(b.abbr)).id; bsel.dispatchEvent(new Event('change')); await sleep(700);
    ok(/John 3/.test(bv.querySelector('.vhead').textContent) && bv.querySelector('.vrow.sel')?.dataset.v === '16', 'it follows the text: ' + bv.querySelector('.vhead').textContent);
    bv.querySelector('.vpick').click(); await sleep(300);
    [...document.querySelectorAll('#bpick li[data-b]')].find(li => li.textContent === 'Romans').click(); await sleep(300);
    document.querySelector('#bpick [data-c="8"]').click(); await sleep(300); document.querySelector('#bpick [data-v="28"]').click(); await sleep(900);
    ok(T.S().ref.b === 45 && T.S().ref.c === 8 && T.S().ref.v === 28 && /Romans 8/.test(bv.querySelector('.vhead').textContent), 'books & chapters icon: Romans 8:28 (the main text went there too)');
    bv.querySelector('.vfol').click(); await sleep(200); bv.querySelector('.vnextc').click(); await sleep(600);
    ok(/Romans 9/.test(bv.querySelector('.vhead').textContent) && T.S().ref.c === 8, 'not following: next chapter only in the view (' + bv.querySelector('.vhead').textContent + ')');
    $('#capPick').click(); await sleep(300); [...document.querySelectorAll('#bpick li[data-b]')].find(li => li.textContent === 'Genesis').click(); await sleep(300);
    document.querySelector('#bpick [data-c="1"]').click(); await sleep(300); document.querySelector('#bpick [data-v="1"]').click(); await sleep(700);
    ok(T.S().ref.b === 1 && T.S().ref.c === 1, 'books & chapters icon on the main Bible caption: ' + document.getElementById('capRef').textContent);
    // a new book view: its own pane
    $('#sideBtn').click(); await sleep(200); $('#mAddBook').click(); await sleep(500);
    const kv = document.querySelector('section[id^="p-book-"]'); const ms = kv.querySelector('.vmod'); ms.value = dict.id; ms.dispatchEvent(new Event('change')); await sleep(1200);
    ok(kv.querySelector('.vbody h4') && kv.closest('.dgroup').querySelectorAll('.dtab').length === 1 && kv.querySelector('.lsplit'), 'new book view in a pane of its own: ' + kv.querySelector('.vbody h4')?.textContent);
    ok(T.S().views && Object.keys(T.S().views).length === 2 && !document.querySelector('[data-pan="tree"]'), 'added views kept; Books & chapters panel gone');
    // layouts
    $('#sideBtn').click(); await sleep(200); $('#mSaveLay').click(); await sleep(300);
    $('#layName').value = 'Test layout'; $('#layName').dispatchEvent(new Event('input')); $('.dlgbox .primary').click(); await sleep(300);
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-pre="reading"]').click(); await sleep(400);
    ok(!shown($('#zone-right')) && !shown($('#zone-left')), 'Layouts → Reading: the Bible only');
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-lay="Test layout"]').click(); await sleep(700);
    ok(document.querySelector('.dtab[data-ptab="bible-1"]') && document.querySelectorAll('#p-bible-1 .vrow').length > 10, 'saved layout back, with its Bible view working');
    $('#sideBtn').click(); await sleep(200); $('#mHideAll').click(); await sleep(200);
    ok(!shown($('#zone-left')) && !shown($('#zone-right')), 'Hide all panels');
    $('#sideBtn').click(); await sleep(200); $('#mHideAll').click(); await sleep(200);
    ok(shown($('#zone-right')), 'and show them again');
    $('#sideBtn').click(); await sleep(200); $('#layoutMenu [data-pre="standard"]').click(); await sleep(500);
    ok(panes('right') === 'cmt | lib+search+study' && !shown($('#zone-left')), 'Layouts → Standard');
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
