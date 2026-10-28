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
    $('#sideBtn').click(); await sleep(200);
    ok(!shown($('#zone-left')) && !shown($('#zone-right')) && !shown($('#zone-bottom')), 'Study button hides all panels');
    $('#sideBtn').click(); await sleep(200);
    ok(shown($('#zone-left')) && shown($('#zone-right')), 'and shows them again');
    // reset
    $('#skinBtn').click(); await sleep(200); $('#mPanels').click(); await sleep(600);
    ok(tabs('right') === 'cmt,lib,search,study' && !shown($('#zone-left')) && !shown($('#zone-bottom')), 'all panels back on the right');
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
