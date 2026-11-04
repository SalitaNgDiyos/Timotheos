'use strict';
/* Phone layout (window narrower than 700 px, or the Android app): the panels are not shown side by side but one at a time,
 * each full width, and a bar at the bottom switches between them. The panel layout itself (Panels menu, saved layout) is
 * not touched: on a wide window everything is as before. */
(function () {
  const wb = () => document.getElementById('workbench');
  const mq = window.matchMedia('(max-width: 700px)');
  let current = null, bar = null, queued = false;

  function groups() { return [...document.querySelectorAll('#workbench > .dgroup, #workbench .dgroup')].filter(g => !g.closest('.dfloat')); }
  const idOf = g => { const t = g.querySelector('.dtab.on') || g.querySelector('.dtab'); return t ? t.dataset.id : null; };
  // a group is chosen by any panel it holds: changing the tab inside it (Bible search ↔ Book search) keeps it shown
  const holds = (g, id) => !!id && [...g.querySelectorAll('.dtab')].some(t => t.dataset.id === id);
  const isBv = g => /^bv/.test(idOf(g) || '');

  function apply() {
    queued = false;
    const phone = mq.matches || document.documentElement.classList.contains('mobile');
    document.documentElement.classList.toggle('phone', phone);
    if (!phone) { if (bar) bar.classList.add('hidden'); return; }
    const gs = groups(); if (!gs.length) return;
    if (!gs.some(g => holds(g, current))) { const first = gs.find(isBv) || gs[0]; current = idOf(first); }
    gs.forEach(g => g.classList.toggle('pactive', holds(g, current)));
    if (!bar) { bar = document.createElement('nav'); bar.id = 'phonebar'; document.body.appendChild(bar); bar.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { current = b.dataset.id; queue(); } }); }
    document.querySelectorAll('.optnav button').forEach(b => { if (!b.title) b.title = b.textContent.replace(/\s+/g, ' ').trim(); });   // the sidebar of Options shows only icons
    bar.classList.remove('hidden');
    const html = gs.map(g => { const t = g.querySelector('.dtab.on') || g.querySelector('.dtab'); if (!t) return '';
      const svg = t.querySelector('svg'); let label = (t.textContent || '').replace(/\s+/g, ' ').trim() || t.dataset.id;
      if ([...g.querySelectorAll('.dtab')].some(x => x.dataset.id === 'search' || x.dataset.id === 'bsearch')) label = 'Search';   // Bible search and Book search are one place
      return `<button type="button" data-id="${t.dataset.id}" class="${holds(g, current) ? 'on' : ''}">${svg ? svg.outerHTML : ''}<span>${label.replace(/[<>&]/g, '')}</span></button>`; }).join('');
    if (bar.innerHTML !== html) bar.innerHTML = html;
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
      if (document.documentElement.classList.contains('phone')) { const cur = groups().find(x => holds(x, current)); if (!cur || !isBv(cur)) { const b = groups().find(isBv); if (b) { current = idOf(b); queue(); } } }
      return g.apply(this, a);
    };
  });
  window.TimotheosPhone = { show: id => { current = id; queue(); } };
})();
