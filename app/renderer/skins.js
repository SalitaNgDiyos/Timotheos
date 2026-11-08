/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* The three phone screens, chosen at start-up on Android: A Quiet Reader (skin-a.js), B Clear Tabs (skin-b.js), C Study Desk (skin-c.js),
 * built from the pieces in pui.js. The picker shows at each start ("for this session"); More → Change screen opens it again. */
/* global PUI, TimotheosSkinIcons, TimotheosPhone, state, views, addView, ensureInfo */
(function () {
  const $ = s => document.querySelector(s);
  const root = document.documentElement;
  const SK = {
    a: { name: 'Quiet Reader', dark: true, line: 'Only the words. A tap, a hold or a swipe brings the tools.', mod: () => window.SkinA },
    b: { name: 'Clear Tabs', dark: false, line: 'Read · Library · Search · Study · More, always at your thumb.', mod: () => window.SkinB },
    c: { name: 'Study Desk', dark: true, line: 'Navigator on the left, study tools on the right, a desk that pulls up.', mod: () => window.SkinC }
  };
  let cur = null, timer = 0;
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* no storage */ } };

  /* ---- a second Bible below the first (Parallel / split desk) ---- */
  function otherBibleId() { const g = TimotheosPhone.groups().find(x => x.bv && x.id !== bibleGroupId()); return g ? g.id : null; }
  function bibleGroupId() { const g = TimotheosPhone.groups().find(x => x.bv && x.id === 'bv' + state.active) || TimotheosPhone.groups().find(x => x.bv); return g ? g.id : 'bv0'; }
  async function secondBible() {
    let id = otherBibleId(); if (id) return id;
    const have = new Set(views().map(v => v.bible)); const other = (state.modules.bibles || []).find(b => !have.has(b.id));
    if (!other || typeof addView !== 'function') return null;
    const keep = state.active; await addView(other.id); await new Promise(r => setTimeout(r, 350));
    if (typeof setActive === 'function') setActive(keep); TimotheosPhone.show(bibleGroupId());
    return otherBibleId();
  }
  async function parallel(on) {
    const now = !!TimotheosPhone.splitId(); const want = on == null ? !now : on;
    if (!want) { TimotheosPhone.split(null); return refresh(); }
    PUI.clearPages(); TimotheosPhone.show(bibleGroupId());
    const id = await secondBible(); if (!id) { PUI.flash('Only one Bible is installed. Import a second Bible to read two side by side.'); return; }
    TimotheosPhone.split(id); plain(); refresh();
  }
  // the lower Bible starts as plain text like the top one: a view kept from the desktop layout may have had the
  // word-over-word (interlinear) display or Strong's turned on; once reset, what is chosen for it later is kept
  function plain() {
    const t = PUI.par.top(), b = PUI.par.bot(); const v = views()[b]; if (t == null || b == null || !v || v.parPlain) return;
    v.parPlain = true;
    for (const k of ['columns', 'strongs', 'morph', 'lemma']) if (effShow(k, b) !== effShow(k, t) && typeof toggleViewShow === 'function') toggleViewShow(b, k, effShow(k, t));
    if (typeof storeViews === 'function') storeViews();
  }
  // (made again after the screen's icons are in, so the arrows show)
  function fillStrip() {
    const d = document.querySelector('.pdiv'); if (!d) return;
    d.innerHTML = `<i></i><button type="button" class="pd-ref" data-pd="ref"><span></span>${PUI.ic('chevD', 20)}</button><button type="button" class="pchip pd-bib" data-pd="bible"><span></span>${PUI.ic('chevD', 14)}</button><button type="button" class="pchip ghost pd-sync" data-pd="sync" aria-label="Sync with the top Bible" title="Sync with the top Bible">${PUI.ic('sync', 18)}</button><button type="button" class="pchip ghost pd-aa" data-pd="aa" aria-label="Text format for the lower Bible">${PUI.ic('text', 18)}</button>`;
  }
  // choose a place / a Bible for one pane (the lower Bible, when it is the one asked, starts reading by itself)
  function place(i) {
    if (i == null) i = PUI.par.top(); PUI.par.focus(i);
    if (PUI.par.on() && i === PUI.par.bot() && PUI.par.linked(i) && typeof toggleLink === 'function') toggleLink(i);
    if (cur === 'a') PUI.goSheetGrid(); else PUI.goSheetList();
  }
  function bible(i) { if (i == null) i = PUI.par.top(); PUI.par.focus(i); PUI.chooseBible(); }
  function wireDivider() {
    const d = document.createElement('div'); d.className = 'pdiv';
    document.body.appendChild(d); fillStrip();
    // the lower Bible has its own place and its own Bible: these two choose them
    d.addEventListener('click', e => {
      const b = e.target.closest('[data-pd]'); if (!b) return; e.stopPropagation();
      const i = PUI.par.bot(); if (i == null) return;
      if (b.dataset.pd === 'bible') return bible(i);
      if (b.dataset.pd === 'aa') return PUI.formatFor(i);
      if (b.dataset.pd === 'sync') { PUI.par.focus(i); if (typeof toggleLink === 'function' && !PUI.par.linked(i)) toggleLink(i); return refresh(); }
      place(i);
    });
    d.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      e.preventDefault(); d.setPointerCapture(e.pointerId);
      const mv = ev => { const top = parseFloat(getComputedStyle(root).getPropertyValue('--sk-top')) || 0, bot = parseFloat(getComputedStyle(root).getPropertyValue('--sk-bot')) || 0;
        const f = Math.max(.2, Math.min(.8, (ev.clientY - top) / (innerHeight - top - bot))); root.style.setProperty('--sk-sp', f.toFixed(3)); };
      const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); };
      d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
  }
  // the strip shows the lower Bible's place and Bible; the top label and the strip share one width so the two Bible names line up
  function strip() {
    const d = document.querySelector('.pdiv'); if (!d) return;
    if (!PUI.par.on() || (cur !== 'a' && cur !== 'b')) { root.style.removeProperty('--par-w'); root.style.removeProperty('--par-bw'); return; }
    const t = PUI.par.top(), b = PUI.par.bot(); if (b == null) return;
    const lab = PUI.par.label(b), ab = PUI.par.abbr(b);
    const rs = d.querySelector('.pd-ref span'); if (rs.textContent !== lab) rs.textContent = lab;
    const bs = d.querySelector('.pd-bib span'); if (bs.textContent !== ab) bs.textContent = ab;
    d.querySelector('.pd-sync').style.display = PUI.par.linked(b) ? 'none' : '';
    const tl = document.querySelector(cur === 'b' ? '.b-big h2 span' : `#workbench .bv[data-i="${t}"] .bvtext .sk-ttl span`);
    const w = el => { if (!el) return 0; const r = document.createRange(); r.selectNodeContents(el); return Math.ceil(r.getBoundingClientRect().width); };
    const need = Math.min(Math.max(w(tl), w(rs)) + 2, Math.round(innerWidth * .5));
    if (root.style.getPropertyValue('--par-w') !== need + 'px') root.style.setProperty('--par-w', need + 'px');
  }
  function refresh() { if (!cur) return; try { PUI.decorateAll(); } catch (e) { /* */ } try { strip(); } catch (e) { /* */ } const m = SK[cur].mod(); if (m && m.refresh) m.refresh(); }

  /* ---- choosing ---- */
  function apply(k) {
    if (!SK[k]) return;
    if (cur && SK[cur].mod()) SK[cur].mod().unmount();
    PUI.closeSheet(); PUI.clearPages(); PUI.H.tap = null; PUI.H.hold = null;
    TimotheosPhone.split(null); TimotheosPhone.overlay(null); TimotheosPhone.show(bibleGroupId());
    cur = k; ['a', 'b', 'c'].forEach(x => root.classList.toggle('sk-' + x, x === k)); root.classList.add('sk');
    root.classList.remove('sk-selecting', 'pg-open', 'sk-baroff'); root.style.removeProperty('--sk-sp');
    root.dataset.ui = k; colors();
    if (window.TimotheosSkinIcons) TimotheosSkinIcons.install(); fillStrip();
    SK[k].mod().mount(); PUI.decorateAll();
    lsSet('tw.ui', k); try { sessionStorage.setItem('tw.ui', k); } catch (e) { /* */ }
    clearInterval(timer); timer = setInterval(refresh, 400);
    window.dispatchEvent(new Event('resize'));
  }
  // the Options' own skins set data-theme back: the screen's own stays
  new MutationObserver(() => { if (!cur || !root.classList.contains('sk')) return; const w = effDark() ? 'dark' : 'light'; if (root.dataset.theme !== w) root.dataset.theme = w; }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  const MINI = {
    a: '<div class="mp a"><i class="t"></i><i class="t s"></i><i class="t"></i><i class="t s"></i><i class="t"></i><b class="cap"></b></div>',
    b: '<div class="mp b"><u class="bar"></u><i class="t"></i><i class="t s"></i><i class="t"></i><i class="t s"></i><span class="tabs"><em class="on"></em><em></em><em></em><em></em><em></em></span></div>',
    c: '<div class="mp c"><u class="bar"></u><i class="t"></i><i class="t s"></i><i class="t"></i><s class="dr"></s><b class="dock"></b></div>'
  };
  function picker(again) {
    const old = $('#skPick'); if (old) old.remove(); if (window.PUI) PUI.closeSheet();
    const last = lsGet('tw.ui');
    const d = document.createElement('div'); d.id = 'skPick';
    d.innerHTML = `<div class="skp-in"><h1>Timotheos</h1><p class="skp-sub">Choose how the app looks and works for this session.</p><div class="skp-cards">${['a', 'b', 'c'].map(k => `<button type="button" class="skp-card" data-k="${k}">${MINI[k]}<span class="skp-t">${SK[k].name}${last === k ? '<em>last time</em>' : ''}</span><span class="skp-d">${SK[k].line}</span></button>`).join('')}</div><p class="skp-foot">All three have every feature of Timotheos. You can change this later: More → Change screen.</p>${again ? '<button type="button" class="skp-x" data-k="">Keep the current screen</button>' : ''}</div>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; d.classList.add('out'); setTimeout(() => d.remove(), 220); if (k) apply(k); });
    return d;
  }
  // Android: tell the system which colour to paint behind the status and navigation bars, and whether their icons are light or dark
  function bars() {
    if (!window.TwBars) return;
    try {
      let c = root.classList.contains('sk') ? getComputedStyle(root).getPropertyValue('--p-bg').trim() : '';
      if (!/^#[0-9a-f]{6}$/i.test(c)) c = '#0d0f13';
      const n = parseInt(c.slice(1), 16), lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      window.TwBars.set(c, lum > 0.6);
    } catch (e) { /* no bars to colour */ }
  }
  /* the colour skins of Options (Narra, Sepia, Slate, ...) recolour every page of the three screens; the structure stays.
     "Screen colours" (the default) keeps each screen's own palette. */
  const hexRgb = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const rgba = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`;
  const lumOf = h => { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  function themeVars(s) {
    const v = s.v, dk = !!s.dark;
    return { '--p-bg': v.textbg, '--p-bg2': v.panel, '--p-ink': v.text, '--p-ink2': v.heading, '--p-muted': v.muted, '--p-acc': v.accent, '--p-acc2': v.accent,
      '--p-onacc': lumOf(v.accent) > 0.55 ? '#15120d' : '#ffffff', '--p-accsoft': rgba(v.accent, .14), '--p-accline': rgba(v.accent, .4),
      '--p-surf': v.panel, '--p-segon': v.card, '--p-segsh': dk ? 'none' : '0 1px 3px rgba(0,0,0,.08)', '--p-chip': v.panel, '--p-pill': v.panel, '--p-tile': v.panel, '--p-card': v.card, '--p-sheet': v.card,
      '--p-line': v.line, '--p-grab': rgba(v.text, .2), '--p-selv': rgba(v.text, .04), '--p-markv': rgba(v.text, .07), '--p-speak': rgba(v.accent, .14), '--p-markw': rgba(v.accent, .3),
      '--p-bar': rgba(v.accent, .25), '--p-on2': rgba(v.accent, .15), '--p-on2line': rgba(v.accent, .4), '--p-glass': rgba(v.card, .96), '--p-drawer': v.card,
      '--p-float': v.card, '--p-tabs': rgba(v.textbg, .97), '--p-pop': dk ? v.card : v.heading, '--p-popink': dk ? v.text : v.textbg };
  }
  const PV = Object.keys(themeVars({ v: new Proxy({}, { get: () => '#000000' }) }));
  function colorSkin() {
    const O = window.TimotheosOptions; const a = O && O.appearance ? O.appearance() : null; const id = a && a.phoneSkin;
    return root.classList.contains('sk') && id && id !== 'screen' && O.SKINS[id] ? O.SKINS[id] : null;
  }
  function effDark() { const s = colorSkin(); return s ? !!s.dark : (cur === 'a' || (cur === 'c' && !root.classList.contains('sk-light'))); }
  function colors() {
    if (!root.classList.contains('sk')) return;
    const s = colorSkin(), vars = s ? themeVars(s) : null;
    for (const k of PV) { if (vars) root.style.setProperty(k, vars[k]); else root.style.removeProperty(k); }
    root.classList.toggle('sk-themed', !!s);
    root.dataset.theme = effDark() ? 'dark' : 'light';
    bars();
  }
  // Android: on the Bible view (nothing laid over it) the navigation bar is see-through and the text runs under it
  let lastEdge = null;
  function edge() {
    const on = root.classList.contains('sk') && !/(^|\s)(sk-dlg|pg-open|c-deskon|sk-selecting)(\s|$)/.test(root.className) && !document.getElementById('skPick') && !(window.TimotheosPhone && TimotheosPhone.over());
    if (window.TwBars && window.TwBars.edge) { root.classList.toggle('tw-edge', on); if (on !== lastEdge) { lastEdge = on; try { window.TwBars.edge(on); } catch (e) { /* */ } } }
  }
  function init() { wireDivider(); if (root.classList.contains('mobile')) picker(false); bars(); new MutationObserver(() => { bars(); edge(); }).observe(root, { attributes: true, attributeFilter: ['class'] }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TimotheosSkins = { plain, colors, screenColors: () => ({ a: ['#0f1013', '#ece6d8', '#d8b46f'], b: ['#faf7f0', '#1f1b16', '#8a3a33'], c: ['#0f1b20', '#e8efee', '#e0a07a'] })[cur], place, bible, picker, apply, current: () => cur, parallel, secondBible, refresh };
})();
