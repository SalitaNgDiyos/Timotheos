// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
/* Side toolbars that are too short for all their icons (the icons at the left of every Bible view): instead of a scroll
 * bar, the icons that do not fit are folded away and a double arrow at the foot lists them. A folded icon still works
 * the same: the list clicks it (and what it opens shows beside the arrow). */
'use strict';
(() => {
  const SEL = '.bvside';
  const ARROW = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l5 5 5-5"/><path d="M7 13l5 5 5-5"/></svg>';
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => fit(e.target))) : null;
  const seen = new WeakSet();
  const items = bar => [...bar.children].filter(c => !c.classList.contains('sovf') && !c.classList.contains('hidden') && getComputedStyle(c).display !== 'none' || c.classList.contains('ovf'));
  function fit(bar) {
    if (!bar.isConnected) return;
    let arrow = bar.querySelector(':scope > .sovf');
    const kids = items(bar);
    kids.forEach(c => c.classList.remove('ovf'));
    if (arrow) arrow.classList.add('hidden');
    if (bar.scrollHeight <= bar.clientHeight + 1) return;   // everything fits: no arrow
    if (!arrow) {
      arrow = document.createElement('button'); arrow.type = 'button'; arrow.className = 'sovf'; arrow.title = 'More buttons'; arrow.setAttribute('aria-label', 'More buttons'); arrow.innerHTML = ARROW;
      arrow.addEventListener('click', e => { e.stopPropagation(); openList(bar, arrow); });
      bar.appendChild(arrow);
    }
    arrow.classList.remove('hidden');
    // fold from the foot up until the arrow fits under the last icon that stays
    const limit = () => bar.clientHeight - arrow.offsetHeight - 8;
    const visible = items(bar).filter(c => c !== arrow);
    for (let i = visible.length - 1; i >= 0; i--) {
      const c = visible[i]; if (c.offsetTop + c.offsetHeight <= limit()) break;
      c.classList.add('ovf');
    }
    // a separator left at the foot is folded too
    const left = items(bar).filter(c => c !== arrow && !c.classList.contains('ovf'));
    const last = left[left.length - 1]; if (last && last.classList.contains('bvsep')) last.classList.add('ovf');
  }
  function closeList() { document.querySelectorAll('.sovfmenu').forEach(m => m.remove()); }
  function openList(bar, arrow) {
    const open = document.querySelector('.sovfmenu'); closeList(); if (open && open.dataset.for === bar.dataset.sovfId) return;
    const hid = [...bar.querySelectorAll(':scope > .ovf')].filter(c => c.tagName === 'BUTTON');
    if (!hid.length) return;
    const m = document.createElement('div'); m.className = 'sovfmenu menu'; m.setAttribute('role', 'menu'); m.dataset.for = bar.dataset.sovfId || '';
    hid.forEach((b, k) => {
      const it = document.createElement('button'); it.type = 'button'; it.setAttribute('role', 'menuitem'); it.dataset.k = k;
      let label = (b.getAttribute('aria-label') || b.title || b.textContent || '').replace(/\s*\(.*\)$/, '').trim().split(/\.\s/)[0];
      if (label.length > 28 && label.includes(': ')) label = label.split(': ')[0];   // the name, not the whole explanation
      it.innerHTML = `<span class="sovfic">${b.innerHTML}</span><span></span>`; it.lastChild.textContent = label;
      if (b.classList.contains('on')) it.style.fontWeight = '700';
      m.appendChild(it);
    });
    document.body.appendChild(m);
    const r = arrow.getBoundingClientRect();
    m.style.left = Math.min(r.right + 4, innerWidth - m.offsetWidth - 6) + 'px';
    m.style.top = Math.max(6, Math.min(r.bottom - m.offsetHeight, innerHeight - m.offsetHeight - 6)) + 'px';
    m.addEventListener('click', e => { const it = e.target.closest('button[data-k]'); if (!it) return; e.stopPropagation(); closeList(); const b = hid[+it.dataset.k]; if (b) b.click(); setTimeout(() => fit(bar), 50); });
  }
  let n = 0;
  function scan() {
    document.querySelectorAll(SEL).forEach(bar => {
      if (seen.has(bar)) return; seen.add(bar); bar.dataset.sovfId = 's' + (++n);
      if (ro) ro.observe(bar);
      new MutationObserver(() => requestAnimationFrame(() => fit(bar))).observe(bar, { childList: true, attributes: true, subtree: false, attributeFilter: ['class', 'style'] });
      requestAnimationFrame(() => fit(bar));
    });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.sovfmenu, .sovf')) closeList(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeList(); });
  let queued = false;
  const soon = () => { if (queued) return; queued = true; setTimeout(() => { queued = false; scan(); }, 300); };   // new panels are looked for at most a few times a second
  const start = () => { scan(); new MutationObserver(soon).observe(document.getElementById('grid') || document.body, { childList: true, subtree: false }); setInterval(scan, 3000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.TimotheosSideOvf = { fit, scan };
})();
