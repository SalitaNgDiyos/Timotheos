// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
/* Pop out: a panel moves into a window of its own that can go anywhere on the screen (another monitor too).
 * The main window keeps the list (settings.popWindows: label, panel, Bible, place and size) and opens them again at the
 * next start. Closing a popped-out window just closes it. The popped-out window itself is index.html?pop=<panel>: it
 * shows only that panel, and its requests go to the main window's engine (tauri-shim/host.js). */
'use strict';
if (/[?&]pop=/.test(location.search)) document.documentElement.classList.add('popwin');
const TimotheosPop = (() => {
  const H = () => window.TimotheosHost || {};
  const isPop = () => !!H().pop;
  const list = () => (Array.isArray(state.settings.popWindows) ? state.settings.popWindows : []).filter(x => x && x.label && x.panel);
  const store = l => save({ popWindows: l });
  const urlOf = e => 'index.html?' + new URLSearchParams({ pop: e.panel, ...(e.bible ? { bible: e.bible } : {}), ...(e.ref ? { b: e.ref.b, c: e.ref.c, v: e.ref.v } : {}) }).toString();
  const can = () => !!(H().openPopWindow) && !document.documentElement.classList.contains('mobile') && !isPop();

  /** move a panel out of the main window into a window of its own */
  async function popOut(id) {
    if (!can()) return false;
    const e = { label: 'pop-' + Date.now().toString(36), panel: id };
    const m = /^bv(\d+)$/.exec(id);
    if (m) { const i = +m[1], v = (state.settings.views || [])[i]; if (!v) return false; e.bible = v.bible; e.ref = { ...(i === state.active ? state.ref : (v.linked || !v.ref ? state.linkRef || state.ref : v.ref)) }; }
    else e.ref = { b: state.ref.b, c: state.ref.c, v: state.ref.v };
    const r = window.TimotheosDock && TimotheosDock.rectOf ? TimotheosDock.rectOf(id) : null;
    e.w = r ? Math.max(420, Math.round(r.width)) : 520; e.h = r ? Math.max(420, Math.round(r.height)) : 640;
    store([...list(), e]);
    await H().openPopWindow(e.label, urlOf(e), e);
    // the panel leaves the main window: its place stays empty (nothing else grows)
    if (m) { if (window.TimotheosCloseView) window.TimotheosCloseView(+m[1]); }
    else if (window.TimotheosDock) TimotheosDock.hide(id);
    return true;
  }
  /** from the popped-out windows: where they are now, or that they were closed */
  function onMessage(msg) {
    if (isPop()) return;
    const l = list(); const k = l.findIndex(x => x.label === msg.label); if (k < 0) return;
    if (msg.t === 'closed') { l.splice(k, 1); store(l); return; }
    if (msg.t === 'bounds') { l[k] = { ...l[k], x: msg.x, y: msg.y, w: msg.w, h: msg.h }; store(l); }
  }
  /** at the start of the main window: the windows that were open last time come back where they were */
  function restore() {
    if (!can()) return;
    for (const e of list()) H().openPopWindow(e.label, urlOf(e), e);
  }

  /* ---- inside a popped-out window ---- */
  const OTHERS = ['tree', 'cmt', 'lib', 'study', 'search', 'bsearch', 'par'];
  /** the settings of a popped-out window: only its own panel, its own Bible and place (kept in this window only) */
  function adjustSettings(st) {
    const q = new URLSearchParams(location.search), panel = q.get('pop'), bible = q.get('bible');
    const ref = q.get('b') ? { b: +q.get('b'), c: +q.get('c') || 1, v: +q.get('v') || 1 } : null;
    if (ref) st.ref = ref;
    const vs = (st.views || []).filter(v => v && v.bible);
    if (bible) st.views = [{ bible, linked: true }];
    else st.views = vs.length ? [{ ...vs[0], linked: true }] : vs;
    st.openBibles = st.views.map(v => v.bible); st.activeView = 0;
    const show = bible ? 'bv0' : panel;
    st.dock = { v: 3, areas: [{ x0: 0, y0: 0, x1: 4, y1: 3, panels: [show], active: show }], floats: [], hidden: OTHERS.filter(x => x !== show).concat(bible ? [] : ['bv0']) };
    st.popWindows = [];
    return st;
  }
  function afterInit() {
    if (!isPop()) return;
    const q = new URLSearchParams(location.search), show = q.get('bible') ? 'bv0' : q.get('pop');
    for (const id of OTHERS) if (id !== show && window.TimotheosDock && TimotheosDock.isVisible(id)) TimotheosDock.hide(id);
    const name = { tree: 'Books & chapters', cmt: 'Commentary', lib: 'Library', study: 'My Study', search: 'Bible search', bsearch: 'Book search', par: 'Parallel Bibles' }[show];
    const setT = () => { const inf = state.infos && state.infos.get(q.get('bible')); document.title = (name || (inf ? inf.abbr || inf.title : 'Bible')) + ' – Timotheos'; };
    setT(); setTimeout(setT, 1500);
  }
  return { popOut, onMessage, restore, adjustSettings, afterInit, isPop, can };
})();
window.TimotheosPop = TimotheosPop;
