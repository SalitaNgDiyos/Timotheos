/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* User Guide window: takes the colours of the skin chosen in Timotheos, builds the contents list, finds text. */
/* global TimotheosOptions */
(function () {
  const skin = new URLSearchParams(location.search).get('skin') || 'parchment';
  const sk = TimotheosOptions.SKINS[skin] || TimotheosOptions.SKINS.parchment;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(sk.v)) root.style.setProperty('--' + k, v);
  root.dataset.theme = sk.dark ? 'dark' : 'light';

  // the phone and the computer each have their own guide: only the one for this device stays in the page
  const prm = new URLSearchParams(location.search);
  const phone = prm.get('phone') === '1' || (!prm.has('desktop') && /Android|iPhone|iPad/i.test(navigator.userAgent));
  root.classList.toggle('phone', phone);
  document.querySelectorAll('.guidetext').forEach(g => { if (g.dataset.for !== (phone ? 'phone' : 'desktop')) g.remove(); });
  const main = document.getElementById('main');
  const secs = [...document.querySelectorAll('.guidetext section')];
  const toc = document.getElementById('toc');
  toc.innerHTML = secs.map(s => `<a href="#${s.id}" data-id="${s.id}">${s.querySelector('h2').textContent}</a>`).join('');
  toc.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.dataset.id).scrollIntoView({ behavior: 'smooth', block: 'start' }); if (phone) showToc(false); });
  // ---- the contents list: the button shows or hides it; on a computer its edge is dragged, on a phone it is a drawer
  const body = document.body, mem = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* not kept */ } return null; };
  function showToc(on) { if (phone) body.classList.toggle('tocon', on); else { body.classList.toggle('notoc', !on); mem('tw.guide.toc', on ? '1' : '0'); } }
  const tocShown = () => (phone ? body.classList.contains('tocon') : !body.classList.contains('notoc'));
  if (!phone) { if (mem('tw.guide.toc') === '0') body.classList.add('notoc'); const w = +mem('tw.guide.tocw'); if (w >= 140 && w <= 520) document.querySelector('.wrap').style.setProperty('--tocw', w + 'px'); }
  document.getElementById('tocBtn').addEventListener('click', () => showToc(!tocShown()));
  document.getElementById('tocScrim').addEventListener('click', () => showToc(false));
  const grip = document.getElementById('tocGrip');
  grip.addEventListener('pointerdown', e => {
    e.preventDefault(); try { grip.setPointerCapture(e.pointerId); } catch (x) { /* a pointer the page made itself */ } grip.classList.add('on'); const wrap = document.querySelector('.wrap');
    const mv = ev => { const w = Math.round(Math.max(140, Math.min(520, ev.clientX - wrap.getBoundingClientRect().left))); wrap.style.setProperty('--tocw', w + 'px'); mem('tw.guide.tocw', w); };
    const up = () => { grip.classList.remove('on'); grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); };
    grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { document.querySelector('.wrap').style.removeProperty('--tocw'); mem('tw.guide.tocw', ''); });
  if (phone) {
    // the drawer follows the finger: drag it back to the left to hide it, pull it out from the left edge to show it
    const wrap = document.querySelector('.wrap'); let x0 = null, y0 = 0, live = false, start = 0;
    wrap.addEventListener('touchstart', e => { const t = e.touches[0]; live = false; x0 = null; const fromEdge = !tocShown() && t.clientX < 24; if (!(tocShown() || fromEdge)) return; x0 = t.clientX; y0 = t.clientY; start = tocShown() ? 0 : -toc.offsetWidth; }, { passive: true });
    wrap.addEventListener('touchmove', e => { if (x0 == null) return; const t = e.touches[0]; const dx = t.clientX - x0, dy = t.clientY - y0;
      if (!live) { if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; if (Math.abs(dy) > Math.abs(dx) || (tocShown() && dx > 0) || (!tocShown() && dx < 0)) { x0 = null; return; } live = true; toc.classList.add('drag'); }
      toc.style.transform = `translateX(${Math.min(0, start + dx)}px)`; if (e.cancelable) e.preventDefault(); }, { passive: false });
    wrap.addEventListener('touchend', e => { if (!live) { x0 = null; return; } const dx = e.changedTouches[0].clientX - x0; x0 = null; live = false; toc.classList.remove('drag'); toc.style.transform = '';
      const w = toc.offsetWidth; showToc(tocShown() ? dx > -w * 0.3 : dx > w * 0.3); }, { passive: true });
    // drag the title bar down to close the guide (the app lays it over its page)
    const bar = document.querySelector('.titlebar'), box = window.frameElement && window.frameElement.parentElement; let by = null, bl = false;
    bar.addEventListener('touchstart', e => { if (e.target.closest('input, button')) { by = null; return; } by = e.touches[0].clientY; bl = false; }, { passive: true });
    bar.addEventListener('touchmove', e => { if (by == null || !box) return; const d = e.touches[0].clientY - by; if (!bl && d < 8) return; bl = true; box.style.transition = 'none'; box.style.transform = `translateY(${Math.max(0, d)}px)`; if (e.cancelable) e.preventDefault(); }, { passive: false });
    bar.addEventListener('touchend', e => { if (by == null || !box) return; const d = e.changedTouches[0].clientY - by; by = null; if (!bl) return; box.style.transition = 'transform .2s ease';
      if (d > 110) { box.style.transform = 'translateY(100%)'; setTimeout(() => { try { parent.guideClose(); } catch (x) { box.remove(); } }, 200); } else { box.style.transform = ''; } }, { passive: true });
  }
  const spy = () => {
    let cur = secs[0];
    for (const s of secs) if (s.offsetTop - main.scrollTop < 120) cur = s;
    toc.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.id === cur.id));
  };
  main.addEventListener('scroll', spy); spy();

  // find: show only the sections that contain the words, and mark them
  const orig = new Map(secs.map(s => [s, s.innerHTML]));
  const find = document.getElementById('find');
  let t = null;
  find.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 150); });
  find.addEventListener('keydown', e => { if (e.key === 'Escape') { find.value = ''; run(); } });
  function run() {
    const q = find.value.trim().toLowerCase();
    let any = false;
    for (const s of secs) {
      s.innerHTML = orig.get(s);
      if (!q) { s.classList.remove('hidden'); continue; }
      const hit = s.textContent.toLowerCase().includes(q);
      s.classList.toggle('hidden', !hit);
      if (hit) { any = true; mark(s, q); }
    }
    document.getElementById('nores').classList.toggle('hidden', !q || any);
    toc.querySelectorAll('a').forEach(a => a.classList.toggle('hidden', !!q && document.getElementById(a.dataset.id).classList.contains('hidden')));
    document.querySelector('h1').classList.toggle('hidden', !!q); document.querySelector('.lead').classList.toggle('hidden', !!q);
    main.scrollTop = 0;
  }
  function mark(el, q) {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = w.nextNode())) if (n.textContent.toLowerCase().includes(q)) nodes.push(n);
    for (const node of nodes) {
      const txt = node.textContent; const low = txt.toLowerCase(); const frag = document.createDocumentFragment(); let i = 0, j;
      while ((j = low.indexOf(q, i)) >= 0) { frag.append(txt.slice(i, j)); const m = document.createElement('mark'); m.textContent = txt.slice(j, j + q.length); frag.append(m); i = j + q.length; }
      frag.append(txt.slice(i)); node.replaceWith(frag);
    }
  }
  document.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); find.focus(); find.select(); } });
  // a section to open at (guide.html#search)
  if (location.hash && document.getElementById(location.hash.slice(1))) document.getElementById(location.hash.slice(1)).scrollIntoView();
})();
