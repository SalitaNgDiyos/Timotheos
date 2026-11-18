/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Grab-and-drag scrolling (desktop). Every text panel has its own hand button (off at first, remembered):
//  Bible views: the hand in the left icon bar of each view (views()[i].grab).
//  Commentary, Library, Bible search, Book search, My Study: the hand in the panel's top row (settings.grab[key]).
// While a panel's hand is on, hold the left mouse button on its text and drag to scroll it.
//  - Shift + drag selects text as usual; a plain click behaves as before.
//  - The middle mouse button drags in every panel, even with the hand off.
(function () {
  const THRESH = 4;
  let st = null, swallow = false;
  const ready = () => typeof state !== 'undefined' && state && state.settings;
  const SKIP = 'button, a, input, select, textarea, label, summary, .menu, .scrollbar, [contenteditable], [draggable="true"], .splitter, .vsplit, .hsplit, .cvsplit, .lsplitter, #libSplitter, .dhandle, .panelhead, .dcap, .nchip, .pdot';
  // the panels: where the text is, and which setting belongs to it
  const AREAS = [['cmt', '#cmtBody'], ['lib', '#libFeed, #libBody'], ['search', '#searchResults, #searchBooks, #searchStats'], ['bsearch', '#bsResults'], ['study', '#studyBody']];
  /** which panel the text under `t` belongs to: { key: 'cmt', ... } or { key: 'v', i: 2 } for the third Bible view */
  function panelOf(t) {
    const bv = t.closest('.bv'); if (bv && t.closest('.bvtext')) return { key: 'v', i: +bv.dataset.i };
    for (const [key, sel] of AREAS) if (t.closest(sel)) return { key };
    return null;
  }
  const isOn = p => { if (!ready() || !p) return false; if (p.key === 'v') { const v = (state.settings.views || [])[p.i]; return !!(v && v.grab); } return !!(state.settings.grab && state.settings.grab[p.key]); };
  function toggle(p) {
    if (!ready() || !p) return;
    const on = !isOn(p);
    if (p.key === 'v') { const v = (state.settings.views || [])[p.i]; if (!v) return; v.grab = on; if (typeof storeViews === 'function') storeViews(); }
    else { const g = Object.assign({}, state.settings.grab, { [p.key]: on }); state.settings.grab = g; if (typeof save === 'function') save({ grab: g }); }
    refresh();
  }
  /** light the hand buttons and put the grab cursor on the text of the panels that have it on */
  function refresh() {
    if (!ready()) return;
    document.querySelectorAll('.bv').forEach(bv => {
      const on = isOn({ key: 'v', i: +bv.dataset.i }); const b = bv.querySelector('.bvgrab'); const tx = bv.querySelector('.bvtext');
      if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      if (tx) tx.classList.toggle('grabon', on);
    });
    for (const [key, sel] of AREAS) {
      const on = isOn({ key });
      document.querySelectorAll(`[data-grab="${key}"]`).forEach(b => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      document.querySelectorAll(sel).forEach(el => el.classList.toggle('grabon', on));
    }
  }
  function scroller(el) {
    for (let n = el; n && n !== document.body && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return null;
  }
  // the hand buttons (captured, so the Bible view's own button handler never sees them)
  addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-grab]'); if (!b) return;
    e.stopPropagation(); e.preventDefault();
    const k = b.dataset.grab;
    if (k === 'v') { const bv = b.closest('.bv'); if (bv) toggle({ key: 'v', i: +bv.dataset.i }); } else toggle({ key: k });
  }, true);
  addEventListener('mousedown', e => {
    st = null;
    if (!ready() || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const mid = e.button === 1;
    if (e.button !== 0 && !mid) return;
    if (!mid && e.shiftKey) return;
    const t = e.target; if (!t || !t.closest || !t.closest('#workbench')) return;
    const p = panelOf(t); if (!p) return;
    if (!mid && !isOn(p)) return;
    if (t.closest(SKIP) && !(mid && !t.closest('input, textarea, select'))) return;
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
  // panes are built and rebuilt by the app: keep the buttons and the cursor in step
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; refresh(); }); };
  addEventListener('DOMContentLoaded', () => {
    const w = document.getElementById('workbench') || document.body;
    new MutationObserver(later).observe(w, { childList: true, subtree: true });
    let n = 0; const iv = setInterval(() => { refresh(); if (++n > 50) clearInterval(iv); }, 200);
  });
  window.TimotheosGrab = { refresh, toggle, isOn };
})();
