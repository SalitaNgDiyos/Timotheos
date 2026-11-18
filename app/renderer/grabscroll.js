/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Grab-and-drag scrolling (desktop): hold the left mouse button on the text of a Bible view, commentary, library
// entry, search results, My Study or the Bible tree and drag up or down to scroll it, like a hand tool.
//  - Shift + drag selects text as usual; a click (no movement) behaves as before.
//  - The middle mouse button always drags, even with the option off.
//  - The option is "Drag the text to scroll it" in Options (settings.grabScroll, on by default).
(function () {
  const THRESH = 4;
  let st = null, swallow = false;
  const ready = () => typeof state !== 'undefined' && state && state.settings;
  const on = () => !(ready() && state.settings.grabScroll === false);
  const SKIP = 'button, a, input, select, textarea, label, summary, .menu, .scrollbar, [contenteditable], [draggable="true"], .splitter, .vsplit, .hsplit, .cvsplit, #libSplitter, .dhandle, .panelhead, .dcap, .nchip, .pdot';
  function scroller(el) {
    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  }
  addEventListener('mousedown', e => {
    st = null;
    if (!ready() || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const mid = e.button === 1;
    if (e.button !== 0 && !mid) return;
    if (!mid && (!on() || e.shiftKey)) return;
    const t = e.target; if (!t || !t.closest || !t.closest('#workbench')) return;
    if (t.closest(SKIP) && !(mid && !t.closest('input, textarea, select'))) return;
    // only over the text areas, not the title bar of a panel
    if (!t.closest('.bvtext, #cmtBody, #libFeed, #libBody, #searchResults, #bsResults, #studyBody, #bibleTree, .lookup, .results, .bsresults')) return;
    const sc = scroller(t); if (!sc) return;
    // a scrollbar press is on the scroller itself, outside its client area
    const r = sc.getBoundingClientRect(); if (e.clientX > r.left + sc.clientWidth || e.clientY > r.top + sc.clientHeight) return;
    st = { sc, x: e.clientX, y: e.clientY, top: sc.scrollTop, left: sc.scrollLeft, moved: false, mid };
    if (mid) e.preventDefault();   // no auto-scroll cursor of the system
  }, true);
  addEventListener('mousemove', e => {
    if (!st) return;
    if (!(e.buttons & (st.mid ? 4 : 1))) { st = null; document.body.classList.remove('grabbing'); return; }
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.moved) {
      if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
      st.moved = true; document.body.classList.add('grabbing');
      try { getSelection().removeAllRanges(); } catch (x) { /* none */ }
    }
    e.preventDefault();
    st.sc.scrollTop = st.top - dy; st.sc.scrollLeft = st.left - dx;
  }, true);
  const end = () => { if (st && st.moved) { swallow = true; setTimeout(() => { swallow = false; }, 0); } st = null; document.body.classList.remove('grabbing'); };
  addEventListener('mouseup', end, true);
  addEventListener('blur', end);
  // the click that ends a drag must not select a verse or follow a link
  addEventListener('click', e => { if (swallow) { e.stopPropagation(); e.preventDefault(); swallow = false; } }, true);
  addEventListener('selectstart', e => { if (st && st.moved) e.preventDefault(); }, true);
})();
