/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.6.2: grid of areas, Bible views as panels, trimmed top bar, click-to-select verse, Copy Verse on the view's icon bar,
// popup zoom, panel menu/label colours + Default Colors, Greek lookup shows only the Library cards, topic list to the edge, font previews
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
const secs = () => [...document.querySelectorAll('section.bv')];
(async () => {
  await sleep(3500);
  go({ b: 43, c: 3, v: 16 }); await sleep(1200);
  // top bar
  const tb = document.getElementById('toolbar');
  ok(!tb.querySelector('#backBtn, #fwdBtn, #viewBtn, #searchBtn, #printBtn, #copyBtn'), 'top bar: Back, Forward, View, Search, Print (and Copy) are gone');
  ok(!vis(tb.querySelector('#refInput')) && !vis(document.getElementById('navStripBar')) && vis(tb.querySelector('#panelsBtn')) && vis(tb.querySelector('#optionsBtn')), 'top bar: Go-to box, arrows and the chapter/verse strips are gone; Panels and Options stay (0.6.4)');
  // Bible views are panels in the grid; no drawer; Compare gone
  ok(secs().length === 2 && TimotheosDock.located('bv0') && TimotheosDock.located('bv1') && secs().every(s => s.closest('.dgroup')), 'every Bible view is a panel in an area of the grid');
  ok(!document.getElementById('bvBiblesDrawer') && !document.getElementById('bvBiblesBtn') && !document.querySelector('.bvdrawer'), 'no Bibles drawer');
  ok(!document.getElementById('bibleZoomIn') && !document.querySelector('.ccap .czoom') && !document.querySelector('.dgroup.isbv .dzoom:not([style*="none"])') || [...document.querySelectorAll('.dgroup.isbv .dzoom')].every(b => !vis(b)), 'no zoom control in the top bar or the Bible panel caption');
  ok(secs().every(s => s.querySelector('[data-a="zin"]') && s.querySelector('[data-a="zout"]')), 'each Bible has its own zoom buttons on its icon bar');
  ok(secs().every(s => s.querySelector('[data-a="copyv"]')), 'Copy Verse is on the left icon bar of every Bible view');
  secs()[0].querySelector('[data-a="copyv"]').click(); await sleep(500);
  ok(!document.getElementById('modal').classList.contains('hidden'), 'Copy Verse opens the copy dialog');
  document.getElementById('modal').classList.add('hidden');
  // Panels menu: Bible View
  document.getElementById('panelsBtn').click(); await sleep(200);
  ok(!!document.querySelector('#panelsMenu [data-act="newbv"]') && !/Compare/.test(document.getElementById('panelsMenu').textContent), 'Panels menu has "Bible View" and no Compare');
  document.querySelector('#panelsMenu [data-act="newbv"]').click(); await sleep(1500);
  ok(secs().length === 3 && secs()[2].closest('.dgroup') && state.active === 2, 'Panels → Bible View shows a Bible panel directly (' + viewName(2) + ')');
  ok(!document.querySelector('.bvdrawer') && secs()[2].querySelectorAll('tr[data-v]').length > 20, 'the new view is already loaded with text');
  document.querySelector('.dtab[data-id="bv2"]').closest('.dgroup').querySelector('[data-act="close"]').click(); await sleep(800);
  // preloading all the Bibles
  ok(state.infos.size >= state.modules.bibles.length, 'all Bibles are preloaded: ' + state.infos.size + ' of ' + state.modules.bibles.length);
  ok(document.querySelectorAll('.bvmenu').length === 0, '');
  secs()[1].querySelector('[data-a="bible"]').click(); await sleep(300);
  ok(document.querySelectorAll('.bvmenu [data-b]').length === state.modules.bibles.length, 'the name menu lists every Bible: ' + document.querySelectorAll('.bvmenu [data-b]').length);
  document.querySelectorAll('.bvmenu').forEach(m => m.remove());
  // click anywhere in a verse
  const t0 = secs()[0].querySelector('.bvtext');
  const row = t0.querySelector('tr[data-v="5"]'); const cell = row.querySelector('td:last-child');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); // the blank cell itself, not a word
  cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await sleep(500);
  ok(state.ref.v === 5 && row.classList.contains('sel'), 'a click on the blank part of a verse selects it (v' + state.ref.v + ')');
  const w = t0.querySelector('tr[data-v="9"] .word, tr[data-v="9"] [data-strong]') || t0.querySelector('tr[data-v="9"] td:last-child');
  w.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(900);
  ok(state.ref.v === 9, 'a click on a word selects its verse (v' + state.ref.v + ')');
  // Greek-word lookup: only the matching hits in the Library
  const gw = secs()[0].querySelector('[data-strong^="G"]'); gw.dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(2800);
  const lib = document.getElementById('tab-lib');
  ok(lib.classList.contains('lookfeed') && vis(document.getElementById('libFeed')) && document.querySelectorAll('#libFeed .cmtcard').length >= 1, 'the Greek word fills the Library with dictionary cards: ' + document.querySelectorAll('#libFeed .cmtcard').length);
  ok(!vis(lib.querySelector('.libsplit')) && !vis(document.getElementById('libBody')) && !vis(document.getElementById('libTopics')), 'no lower split pane (no G1 topic list or entry) under the cards');
  // popup zoom
  const el = secs()[0].querySelector('[data-strong]'); showPopupHtml(el, '<div class="entry"><h4>Test</h4><p>popup text</p></div>'); await sleep(100);
  const pz = () => parseFloat(document.querySelector('#popup .pzbody').style.zoom);
  const z0 = pz(); document.querySelector('#popup [data-pz="+"]').click(); await sleep(100);
  ok(Math.abs(pz() - (z0 + 0.1)) < 0.01 && /%/.test(document.querySelector('#popup .pzv').textContent), 'popup A+ makes the popup text larger: ' + z0 + ' → ' + pz());
  document.querySelector('#popup [data-pz="-"]').click(); document.querySelector('#popup [data-pz="-"]').click(); await sleep(100);
  ok(pz() < z0, 'popup A− makes it smaller: ' + pz());
  document.querySelector('#popup [data-pz="+"]').click(); await sleep(50); document.getElementById('popup').classList.add('hidden');
  // panel skin menu
  const grp = document.querySelector('[data-panel="cmt"]').closest('.dgroup');
  grp.querySelector('[data-act="skin"]').click(); await sleep(300);
  const m = document.querySelector('.pskmenu');
  ok(m && ['tab','head','note','vnum'].every(x => m.querySelector('[data-k="' + x + '"]')) && !m.querySelector('[data-k="menu"]') && !m.querySelector('[data-k="label"]') && /Page Background Color/.test(m.textContent), 'panel colours: Menu/Label rows gone; Tab name, Headings, Notes, Verse numbers and Page Background Color shown');
  ok(!/Back to the skin/.test(m.textContent) && !m.querySelector('.pskall') && [...m.querySelectorAll('button')].filter(b => /Default Colors/.test(b.textContent)).length === 1, 'one "Default Colors" button replaces "Back to the skin" and "All panels"');
  m.querySelector('[data-k="tab"] .swc').click(); m.querySelector('[data-k="head"] .swc').click(); await sleep(200);
  const k = state.settings.panelSkins.cmt || {};
  ok(k.tab && k.head && grp.querySelector('.dtab[data-id="cmt"]').style.color !== '', 'Tab name and Headings colours are kept and shown: ' + JSON.stringify(k));
  m.querySelector('[data-k="color"] .swc').click(); await sleep(100);
  m.querySelector('.pskdef').click(); await sleep(300);
  ok(!state.settings.panelSkins.cmt && grp.querySelector('.dtab[data-id="cmt"]').style.color === '' && !document.querySelector('[data-panel="cmt"]').classList.contains('pskin'), 'Default Colors puts the panel back to the skin colours');
  // panel size
  grp.querySelector('[data-act="skin"]').click(); await sleep(250);
  const sc = document.querySelector('.pskmenu .pskscale'); sc.value = 130; sc.dispatchEvent(new Event('input', { bubbles: true })); await sleep(200);
  ok(document.querySelector('[data-panel="cmt"]').style.zoom === '1.3', 'the panel size slider scales the whole panel (fonts and controls)');
  document.querySelector('.pskmenu .pskdef').click(); await sleep(200);
  // font pickers show each font in its own face
  grp.querySelector('[data-act="skin"]').click(); await sleep(250);
  const o1 = [...document.querySelectorAll('.pskmenu select option')].filter(o => o.value);
  ok(o1.length > 3 && o1.every(o => o.style.fontFamily.replace(/["']/g, '').startsWith(o.value) && o.textContent === o.value), 'panel font list: each option is its own name in its own font');
  document.querySelectorAll('.bvmenu').forEach(x => x.remove());
  secs()[0].querySelector('[data-a="font"]').click(); await sleep(250);
  const o2 = [...document.querySelectorAll('.bvfont option')].filter(o => o.value);
  ok(o2.length > 3 && o2.every(o => o.style.fontFamily.replace(/["']/g, '').startsWith(o.value) && o.textContent === o.value), 'view font list: each option in its own font');
  document.querySelectorAll('.bvmenu').forEach(x => x.remove());
  TimotheosOptions.open(); await sleep(400);
  const o3 = [...document.querySelectorAll('#fontText option')];
  ok(o3.length > 3 && o3.every(o => o.style.fontFamily.replace(/["']/g, '').startsWith(o.value) && o.textContent === o.value), 'Options font lists: each option in its own font (' + o3.length + ')');
  document.getElementById('optionsDlg').classList.add('hidden');
  // topic list resized to the panel edge
  TimotheosDock.show('lib'); await sleep(200); window.hideLookupFeed();
  const sp = document.getElementById('libSplitter'); sp.setPointerCapture = () => {};
  const ls = document.getElementById('libSplit').getBoundingClientRect(); const sr = sp.getBoundingClientRect();
  sp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: sr.left + 2, clientY: sr.top + 20, pointerId: 1, button: 0 }));
  sp.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: ls.left - 500, clientY: sr.top + 20, pointerId: 1 }));
  sp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: ls.left - 500, clientY: sr.top + 20, pointerId: 1 })); await sleep(200);
  ok(document.getElementById('libSide').offsetWidth === 0 && vis(sp), 'the topic list can be dragged all the way to the edge and is hidden (handle stays: ' + document.getElementById('libSide').offsetWidth + 'px)');
  const sr2 = sp.getBoundingClientRect();
  sp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: sr2.left + 2, clientY: sr2.top + 20, pointerId: 1, button: 0 }));
  sp.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: sr2.left + 160, clientY: sr2.top + 20, pointerId: 1 }));
  sp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: sr2.left + 160, clientY: sr2.top + 20, pointerId: 1 })); await sleep(200);
  ok(document.getElementById('libSide').offsetWidth > 100, 'and dragged back out: ' + document.getElementById('libSide').offsetWidth + 'px');
  // wrapping: no sideways scrolling, no broken words in a narrow view
  TimotheosDock.applyPreset('classic'); await sleep(300);
  const t1 = secs()[0].querySelector('.bvtext');
  ok(t1.scrollWidth <= t1.clientWidth + 1 && getComputedStyle(t1.querySelector('table.chapter td:last-child')).overflowWrap === 'break-word', 'text wraps at spaces inside the view (no sideways scroll)');
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
