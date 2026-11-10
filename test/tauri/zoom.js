/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// text size per panel: A−/A+ buttons and Ctrl + mouse wheel
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const wheelAt = (el, dy, ctrl = true) => { const r = el.getBoundingClientRect(); const ev = new WheelEvent('wheel', { deltaY: dy, ctrlKey: ctrl, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }); el.dispatchEvent(ev); return ev.defaultPrevented; };
const zoomOf = sel => +getComputedStyle(document.querySelector(sel)).zoom;
(async () => {
  await sleep(2500);
  // each Bible view has its own text size; only the text changes, not the view's caption or side bar
  const fs0 = state.settings.fontSize; const z = i => state.settings.views[i].zoom || 1;
  const t0 = () => parseFloat(getComputedStyle(document.querySelector('.bv[data-i="0"] .paraview')).fontSize);
  const cap0 = getComputedStyle(document.querySelector('.bv[data-i="0"] .bvcap')).fontSize, before = t0();
  document.querySelector('.bv[data-i="0"] [data-a="zin"]').click(); await sleep(100);
  ok(z(0) === 1.1 && Math.abs(t0() - before * 1.1) < 0.6 && getComputedStyle(document.querySelector('.bv[data-i="0"] .bvcap')).fontSize === cap0 && state.settings.fontSize === fs0, `Bible A+ → active view's text ${t0()}px (caption unchanged)`);
  wheelAt(document.querySelector('.bv[data-i="1"] .pv[data-col="1"]'), -100); await sleep(100);
  ok(z(1) === 1.1 && z(0) === 1.1, 'Ctrl+wheel up over the second view → only that view: ' + z(0) + ' / ' + z(1));
  wheelAt(document.querySelector('.bv .pv[data-col="0"]'), 100); await sleep(100);
  ok(z(0) === 1 && z(1) === 1.1, 'Ctrl+wheel down over the first view → ' + z(0) + ' / ' + z(1));
  document.querySelector('.bv[data-i="1"] [data-a="zout"]').click(); await sleep(100);
  ok(z(1) === 1, "the view's own A− → " + z(1));
  // commentary panel
  const cg = document.querySelector('[data-panel="cmt"]').closest('.dgroup');
  ok(cg.classList.contains('zoomable') && getComputedStyle(cg.querySelector('.dzoom')).display !== 'none', 'Commentary caption shows A− A+');
  cg.querySelector('[data-act="zoom+"]').click(); cg.querySelector('[data-act="zoom+"]').click(); await sleep(100);
  ok(Math.abs(zoomOf('#cmtBody') - 1.2) < .001, 'Commentary A+ ×2 → ' + zoomOf('#cmtBody'));
  wheelAt(document.getElementById('cmtBody'), 100); await sleep(100);
  ok(Math.abs(zoomOf('#cmtBody') - 1.1) < .001 && Math.abs(zoomOf('.libsplit') - 1) < .001, 'Ctrl+wheel over Commentary changes only Commentary (' + zoomOf('#cmtBody') + ')');
  // lookup / library / search (tabs in one group)
  openTab('lib'); await sleep(100);
  const lg = document.querySelector('[data-panel="lib"]').closest('.dgroup');
  wheelAt(document.getElementById('tab-lib'), -100); await sleep(100);
  ok(Math.abs(zoomOf('.libsplit') - 1.1) < .001 && Math.abs(zoomOf('#libFeed') - 1.1) < .001, 'Ctrl+wheel over Library (and its lookup cards) → ' + zoomOf('.libsplit'));
  lg.querySelector('[data-act="zoom-"]').click(); await sleep(100);
  ok(Math.abs(zoomOf('.libsplit') - 1) < .001, 'buttons act on the active tab (Library ' + zoomOf('.libsplit') + ')');
  openTab('search'); await TimotheosSearch.run('faith'); await sleep(200);
  wheelAt(document.getElementById('searchResults'), -100); await sleep(100);
  ok(Math.abs(zoomOf('#searchResults') - 1.1) < .001, 'Search results → ' + zoomOf('#searchResults'));
  openTab('study'); await sleep(100);
  const sg = document.querySelector('[data-panel="study"]').closest('.dgroup');
  ok(sg.classList.contains('zoomable'), 'My Study has A−/A+');
  ok(wheelAt(document.querySelector('.toolbar'), -100) === true, 'Ctrl+wheel never zooms the whole window');
  ok(wheelAt(document.getElementById('cmtBody'), -100, false) === false, 'plain wheel still scrolls');
  await sleep(500);
  const st = await api.getSettings(); ok(st.appearance.zoom && st.appearance.zoom.cmt === 1.1 && st.appearance.zoom.lib === 1, 'sizes saved ' + JSON.stringify(st.appearance.zoom));
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
})();
