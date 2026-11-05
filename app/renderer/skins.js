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
    TimotheosPhone.split(id); refresh();
  }
  function wireDivider() {
    const d = document.createElement('div'); d.className = 'pdiv'; d.innerHTML = '<i></i>'; document.body.appendChild(d);
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); d.setPointerCapture(e.pointerId);
      const mv = ev => { const top = parseFloat(getComputedStyle(root).getPropertyValue('--sk-top')) || 0, bot = parseFloat(getComputedStyle(root).getPropertyValue('--sk-bot')) || 0;
        const f = Math.max(.2, Math.min(.8, (ev.clientY - top) / (innerHeight - top - bot))); root.style.setProperty('--sk-sp', f.toFixed(3)); };
      const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); };
      d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
  }
  function refresh() { if (!cur) return; try { PUI.decorateAll(); } catch (e) { /* */ } const m = SK[cur].mod(); if (m && m.refresh) m.refresh(); }

  /* ---- choosing ---- */
  function apply(k) {
    if (!SK[k]) return;
    if (cur && SK[cur].mod()) SK[cur].mod().unmount();
    PUI.closeSheet(); PUI.clearPages(); PUI.H.tap = null; PUI.H.hold = null;
    TimotheosPhone.split(null); TimotheosPhone.overlay(null); TimotheosPhone.show(bibleGroupId());
    cur = k; ['a', 'b', 'c'].forEach(x => root.classList.toggle('sk-' + x, x === k)); root.classList.add('sk');
    root.classList.remove('sk-selecting', 'pg-open'); root.style.removeProperty('--sk-sp');
    root.dataset.theme = SK[k].dark ? 'dark' : 'light'; root.dataset.ui = k;
    if (window.TimotheosSkinIcons) TimotheosSkinIcons.install();
    SK[k].mod().mount(); PUI.decorateAll();
    lsSet('tw.ui', k); try { sessionStorage.setItem('tw.ui', k); } catch (e) { /* */ }
    clearInterval(timer); timer = setInterval(refresh, 400);
    window.dispatchEvent(new Event('resize'));
  }
  // the Options' own skins set data-theme back: the screen's own stays
  new MutationObserver(() => { if (cur && root.dataset.theme !== (SK[cur].dark ? 'dark' : 'light')) root.dataset.theme = SK[cur].dark ? 'dark' : 'light'; }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
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
  function init() { wireDivider(); if (root.classList.contains('mobile')) picker(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TimotheosSkins = { picker, apply, current: () => cur, parallel, secondBible, refresh };
})();
