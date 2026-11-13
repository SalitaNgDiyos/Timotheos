/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Phone layout (window narrower than 700 px, or the Android app): the panels are not shown side by side but one at a time,
 * each full width, and a bar at the bottom switches between them. The panel layout itself (Panels menu, saved layout) is
 * not touched: on a wide window everything is as before. */
(function () {
  const wb = () => document.getElementById('workbench');
  const mq = window.matchMedia('(max-width: 700px)');
  let current = null, bar = null, queued = false, over = null, split = null;   // over: a panel shown as a drawer ({id, side}); split: a panel shown in the lower half

  function groups() { return [...document.querySelectorAll('#workbench > .dgroup, #workbench .dgroup')].filter(g => !g.closest('.dfloat')); }
  const idOf = g => { const t = g.querySelector('.dtab.on') || g.querySelector('.dtab'); return t ? t.dataset.id : null; };
  // a group is chosen by any panel it holds: changing the tab inside it (Bible search ↔ Book search) keeps it shown
  const holds = (g, id) => !!id && [...g.querySelectorAll('.dtab')].some(t => t.dataset.id === id);
  const isBv = g => /^bv/.test(idOf(g) || '');

  function apply() {
    queued = false;
    const phone = mq.matches || document.documentElement.classList.contains('mobile');
    document.documentElement.classList.toggle('phone', phone);
    // the menu (File View Help) sits at the left of the toolbar row on a phone, and goes back to the title bar otherwise
    const menus = document.getElementById('tbMenus'), tool = document.getElementById('toolbar'), tb = document.getElementById('titlebar');
    if (menus && tool && tb) {
      if (phone && menus.parentNode !== tool) tool.insertBefore(menus, tool.firstChild);
      else if (!phone && menus.parentNode === tool) tb.insertBefore(menus, tb.querySelector('.tbdrag'));
    }
    if (tool) { const h = tool.offsetHeight; document.documentElement.style.setProperty('--phone-bar-h', phone && h > 20 ? h + 'px' : ''); }   // the coloured panel strips are as tall as the toolbar
    if (!phone) { if (bar) bar.classList.add('hidden'); return; }
    const gs = groups(); if (!gs.length) return;
    if (!gs.some(g => holds(g, current))) { const first = gs.find(isBv) || gs[0]; current = idOf(first); }
    const isOver = g => !!over && holds(g, over.id) && !holds(g, current), isSplit = g => !!split && holds(g, split) && !holds(g, current) && !isOver(g);
    const splitOn = gs.some(isSplit);
    gs.forEach(g => {
      const b = holds(g, current), o = isOver(g), sp = isSplit(g);
      g.classList.toggle('pactive', b || o || sp); g.classList.toggle('pover', o); g.classList.toggle('psplit', sp); g.classList.toggle('pbase', b && splitOn);
      if (o) g.dataset.side = over.side; else delete g.dataset.side;
    });
    document.documentElement.classList.toggle('psplitting', splitOn); document.documentElement.classList.toggle('pdrawer', gs.some(isOver));
    if (!bar) { bar = document.createElement('nav'); bar.id = 'phonebar'; document.body.appendChild(bar); bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { current = b.dataset.id; queue(); } }); }
    document.querySelectorAll('.optnav button').forEach(b => { if (!b.title) b.title = b.textContent.replace(/\s+/g, ' ').trim(); });   // the sidebar of Options shows only icons
    bar.classList.remove('hidden');
    const html = gs.map(g => { const t = g.querySelector('.dtab.on') || g.querySelector('.dtab'); if (!t) return '';
      const svg = t.querySelector('svg'); let label = (t.textContent || '').replace(/\s+/g, ' ').trim() || t.dataset.id;
      if ([...g.querySelectorAll('.dtab')].some(x => x.dataset.id === 'search' || x.dataset.id === 'bsearch')) label = 'Search';   // Bible search and Book search are one place
      return `<button type="button" data-id="${t.dataset.id}" class="${holds(g, current) ? 'on' : ''}">${svg ? svg.outerHTML : ''}<span>${label.replace(/[<>&]/g, '')}</span></button>`; }).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
    window.dispatchEvent(new Event('tw-phone'));
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(apply); } }

  window.addEventListener('DOMContentLoaded', () => {
    const w = wb(); if (!w) return;
    new MutationObserver(queue).observe(w, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    mq.addEventListener ? mq.addEventListener('change', queue) : mq.addListener(queue);
    window.addEventListener('resize', queue);
    queue();
  });
  // choosing a chapter or a search hit shows the Bible again
  window.addEventListener('load', () => {
    const g = window.go; if (typeof g !== 'function') return;
    window.go = function (...a) {
      if (over) { over = null; queue(); }
      if (document.documentElement.classList.contains('phone')) { const cur = groups().find(x => holds(x, current)); if (!cur || !isBv(cur)) { const b = groups().find(isBv); if (b) { current = idOf(b); queue(); } } }
      return g.apply(this, a);
    };
  });
  // a link that opens another panel (a dictionary entry, a commentary) shows that panel's page
  window.addEventListener('load', () => {
    const ot = window.openTab; if (typeof ot !== 'function') return;
    window.openTab = function (name) {
      const r = ot.apply(this, arguments);
      if (document.documentElement.classList.contains('phone') && groups().some(x => holds(x, name))) { current = name; apply(); }
      return r;
    };
  });

  /* ---- global Back / Forward: the screens you have seen, whichever panel they were in ---- */
  const H = { list: [], at: -1, busy: false, pend: null, after: 0 };
  const curTid = () => { const li = document.querySelector('#libTopics li.cur'); return li ? li.dataset.tid : null; };
  function snap() {
    const g = groups().find(x => holds(x, current)); if (!g || typeof state === 'undefined' || !state.nav || !state.nav.length) return null;
    const tab = idOf(g); const s = { page: current, tab, ref: { b: state.ref.b, c: state.ref.c, v: state.ref.v }, bibles: (typeof views === 'function' ? views() : []).map(v => v.bible) };
    if (tab === 'lib' && window.TimotheosModules) {
      s.feed = window.TimotheosLookup ? TimotheosLookup.snapshot() : null;
      if (!s.feed) { s.lib = TimotheosModules.lib.cur; s.tid = curTid(); }
    }
    return s;
  }
  const keyOf = s => [s.page, s.tab, s.ref.b + ':' + s.ref.c, (s.bibles || []).join(','), s.lib, s.tid, s.feed ? s.feed.title + '/' + s.feed.html.length : ''].join('|');
  function buttons() {
    const b = document.getElementById('gBack'), f = document.getElementById('gFwd'); if (!b) return;
    b.disabled = H.at <= 0 || H.busy; f.disabled = H.at >= H.list.length - 1 || H.busy;
  }
  function tick() {
    if (H.busy) return;
    const s = snap(); if (!s) return;
    if (H.after > 0) { H.after--; if (H.list[H.at]) H.list[H.at] = s; return; }   // just put back: what shows now is that entry
    const k = keyOf(s), e = H.list[H.at];
    if (e && keyOf(e) === k) { H.list[H.at] = s; H.pend = null; return; }
    if (H.pend !== k) { H.pend = k; return; }                                         // it must stay put for a moment to count
    H.list.length = H.at + 1; H.list.push(s); if (H.list.length > 100) H.list.shift(); H.at = H.list.length - 1; H.pend = null; buttons();
  }
  async function hgo(d) {
    const n = H.at + d; if (H.busy || n < 0 || n >= H.list.length) return;
    H.busy = true; H.at = n; buttons(); const e = H.list[n];
    try {
      // the translation belongs to the screen as much as the verse does: put each view's Bible back (kept: a Bible that is no longer installed)
      let changed = false;
      if (e.bibles && e.bibles.length && typeof views === 'function') {
        const have = new Set(((state.modules && state.modules.bibles) || []).map(x => x.id));
        const cur = views(); const vs = cur.map((v, i) => { const id = e.bibles[i]; if (!id || id === v.bible || !have.has(id)) return v; changed = true; const n = Object.assign({}, v, { bible: id }); delete n.label; return n; });
        if (changed) { for (const id of e.bibles) if (have.has(id)) await ensureInfo(id); await setViews(vs); }
      }
      if (changed || e.ref.b !== state.ref.b || e.ref.c !== state.ref.c) await window.go({ b: e.ref.b, c: e.ref.c, v: e.ref.v });
      if (e.tab === 'lib') {
        if (e.feed) TimotheosLookup.restore(e.feed);
        else if (e.lib != null && (TimotheosModules.lib.cur !== e.lib || String(curTid()) !== String(e.tid))) await TimotheosModules.openBookModule(e.lib, e.tid == null ? undefined : (isNaN(+e.tid) ? e.tid : +e.tid), false);
      }
      current = e.page; if (e.tab && window.TimotheosDock) TimotheosDock.show(e.tab); apply();
    } catch (x) { /* stay where we are */ }
    H.pend = null; H.after = 2; H.busy = false; buttons();
  }
  window.addEventListener('load', () => {
    const tool = document.getElementById('toolbar'); if (!tool || document.getElementById('gnav')) return;
    const nav = document.createElement('span'); nav.id = 'gnav';
    const mk = (id, icon, t) => `<button type="button" id="${id}" class="tb" title="${t}" aria-label="${t}" disabled>${window.TimotheosIcons ? TimotheosIcons.icon(icon, 24) : ''}</button>`;
    nav.innerHTML = mk('gBack', 'prev', 'Back to the previous screen') + mk('gFwd', 'next', 'Forward to the next screen');
    tool.insertBefore(nav, tool.querySelector('.grow'));
    document.getElementById('gBack').onclick = () => hgo(-1); document.getElementById('gFwd').onclick = () => hgo(1);
    setInterval(tick, 250);
  });
  window.TimotheosPhone = {
    show: id => { current = id; over = null; queue(); },
    overlay: (id, side) => { over = id ? { id, side: side || 'l' } : null; queue(); },
    split: id => { split = id || null; queue(); },
    // back to the Bible text (when the panel in front is not a Bible)
    reading: () => { const cur = groups().find(x => holds(x, current)); if (!cur || !isBv(cur)) { const b = groups().find(isBv); if (b) { current = idOf(b); over = null; queue(); } } },
    current: () => current, over: () => over, splitId: () => split,
    groups: () => groups().map(g => ({ id: idOf(g), bv: isBv(g) }))
  };
})();
