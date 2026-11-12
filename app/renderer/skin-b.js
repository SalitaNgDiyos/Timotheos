/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Screen B · Clear Tabs: Bible · Library · Search · Notes · More at the bottom. The title is the verse browser; a Parallel chip opens a
 * second Bible below with a divider to drag; a tap on a verse shows its toolbar; Library shelves; one Search for the Bible and the
 * books; Study with today's reading; More is plain grouped settings (Read aloud with voices, volume, pitch, tempo, repeat). */
/* global PUI, state, views, go, step, runCommand, TimotheosSpeech, TimotheosStudy, TimotheosOptions, TimotheosTools */
(function () {
  const P = () => window.PUI; let ac = null, els = [], tab = 'read', tb = null;
  const root = document.documentElement;
  function el(cls, html) { const d = document.createElement('div'); d.className = cls + ' skel'; d.innerHTML = html; document.body.appendChild(d); els.push(d); return d; }
  const ib = (a, i, t) => `<button type="button" class="pib" data-a="${a}" aria-label="${t}" title="${t}">${P().ic(i, 22)}</button>`;

  function setTab(t) {
    tab = t; closeTb(); const p = P(); p.clearPages();
    document.querySelectorAll('.b-tabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    if (t === 'read') return refresh();
    const page = p.pushPage({ title: { library: 'Library', search: 'Search', study: 'Notes', more: 'More' }[t], big: true, back: false, cls: 'root' + (t === 'library' ? '' : ' noacts'),
      actions: t === 'library' ? `<button type="button" class="pib" data-x="import" aria-label="Import modules">${p.ic('import', 22)}</button><button type="button" class="pib" data-x="bsearch" aria-label="Search the books">${p.ic('search', 22)}</button>` : '' });
    page.el.classList.add('in');
    const box = document.createElement('div'); page.body.appendChild(box);
    if (t === 'library') { p.libraryInto(box); page.bar.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'import') runCommand('import'); else { setTab('search'); setTimeout(() => { const b = document.querySelector('.ppage.root [data-m="books"]'); if (b) b.click(); }, 50); } }); }
    else if (t === 'search') { const s = p.searchInto(box, { onGo: () => setTab('read') }); setTimeout(s.focus, 200); }
    else if (t === 'study') p.studyInto(box);
    else if (t === 'more') moreInto(box);
  }
  function moreInto(box) {
    const p = P(); const S = TimotheosSpeech; const c = S.cfg(); const clip = window.TimotheosTools && TimotheosTools.clipOn && TimotheosTools.clipOn();
    const r = (k, i, l, sm) => `<button type="button" class="prr" data-k="${k}">${p.ic(i, 20)}<span>${l}</span><small>${sm || ''} ${p.ic('chevR', 16)}</small></button>`;
    box.innerHTML = `<div class="glist">${r('ra', 'speaker', 'Read aloud', esc(S.NAMES[c.lang] || 'Automatic'))}${r('look', 'palette', 'Appearance', 'Skin, fonts')}${r('layout', 'layers', 'Layout', 'Two Bibles, screen')}${r('vnum', 'text', 'Verse numbers', 'Margin')}${r('view', 'eye', 'Reading view', 'Show, size, colours')}</div>
      <div class="glist">${r('mods', 'import', 'Modules', 'Import, uninstall')}${r('copy', 'copy', 'Copy verses', '')}<button type="button" class="prr" data-k="clip">${p.ic('clipboard', 20)}<span>Clipboard monitor</span><small class="clipv">${clip ? 'On' : 'Off'}</small></button>${r('daily', 'calendar', 'Daily readings', '')}${r('print', 'print', 'Print the chapter', '').replace('class="prr"', 'class="prr nophone"')}</div>
      <div class="glist">${r('fonts', 'type', 'Fonts', 'Bible, Greek, Hebrew')}${r('all', 'gear', 'All options', '')}</div>
      <div class="glist">${r('guide', 'guide', 'User guide', '')}${r('about', 'info', 'About Timotheos', (state.settings && state.settings.version) || '')}${r('screen', 'grid', 'Change screen', 'Clear Tabs')}</div>`;
    box.onclick = e => {
      const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k;
      if (k === 'ra') p.readAloudPage();
      else if (k === 'look') TimotheosOptions.open('look'); else if (k === 'vnum') TimotheosOptions.open('vnum'); else if (k === 'fonts') TimotheosOptions.open('fonts'); else if (k === 'keys') TimotheosOptions.open('keys'); else if (k === 'all') TimotheosOptions.open();
      else if (k === 'layout') layoutSheet(); else if (k === 'view') p.readingSheet(); else if (k === 'mods') p.modulesSheet(); else if (k === 'copy') TimotheosStudy.copyDialog();
      else if (k === 'clip') { runCommand('clipmon'); setTimeout(() => { const v = box.querySelector('.clipv'); if (v) v.textContent = TimotheosTools.clipOn() ? 'On' : 'Off'; }, 100); }
      else if (k === 'daily') p.studySection('plans'); else if (k === 'print') runCommand('print');
      else if (k === 'guide') runCommand('guide'); else if (k === 'about') runCommand('about'); else if (k === 'screen') window.TimotheosSkins.picker(true);
    };
  }
  const esc = s => P().esc(s);
  function layoutSheet() {
    const p = P(); const s = p.sheet(`<div class="rows"><button type="button" class="prr" data-x="par">${p.ic('compare', 20)}<span>Parallel Bibles</span><small>${window.TimotheosPhone.splitId() ? 'On' : 'Off'}</small></button><button type="button" class="prr nophone" data-x="reset">${p.ic('layout', 20)}<span>Reset panel layout</span></button><button type="button" class="prr" data-x="screen">${p.ic('grid', 20)}<span>Change screen</span></button></div>`, { title: 'Layout' });
    s.onclick = e => { const x = e.target.closest('[data-x]'); if (!x) return; p.closeSheet(); if (x.dataset.x === 'par') { setTab('read'); window.TimotheosSkins.parallel(); } if (x.dataset.x === 'reset') runCommand('resetLayout'); if (x.dataset.x === 'screen') window.TimotheosSkins.picker(true); };
  }

  /* the toolbar of a tapped verse */
  function closeTb() { if (tb) { tb.remove(); tb = null; } P().markVerse(null); }
  function openTb(x, w) {
    closeTb(); const p = P(); p.markVerse(x.row, true);
    tb = document.createElement('div'); tb.className = 'seltb skel';
    const b = (a, i, t) => `<button type="button" class="pib" data-v="${a}" aria-label="${t}" title="${t}">${p.ic(i, 21)}</button>`;
    tb.innerHTML = `<span class="row1">${b('copy', 'copy', 'Copy')}${b('highlight', 'highlight', 'Highlight')}${b('underline', 'underline', 'Underline')}${b('note', 'note', 'Note')}<span class="sep"></span>${b('more', 'more', 'More')}</span>`
      + `<span class="row2">${b('read', 'speaker', 'Read aloud')}${b('compare', 'compare', 'Compare')}${b('xref', 'xref', 'Cross-references')}${b('commentary', 'commentary', 'Commentary')}${b('lookup', 'lexicon', 'Dictionary')}${b('bookmark', 'bookmark', 'Bookmark')}<span class="sep"></span>${b('less', 'chevL', 'Back')}</span>`
      + `<div class="hlpick">${p.HL.map(([c, h]) => `<button type="button" class="pdot${c === p.lastColor() ? ' on' : ''}" data-c="${c}" style="background:${h}" aria-label="${c}"></button>`).join('')}<button type="button" class="pib" data-v="unhighlight" aria-label="Remove">${p.ic('close', 18)}</button></div>`;
    document.body.appendChild(tb);
    const r = x.row.getBoundingClientRect(); const top = Math.max(parseFloat(getComputedStyle(root).getPropertyValue('--sk-top')) + 10 || 120, r.top - 56);
    tb.style.top = (top < r.top - 50 ? top : Math.min(r.bottom + 8, innerHeight - 160)) + 'px'; tb.style.left = '22px';
    tb.addEventListener('click', e => {
      e.stopPropagation();
      const d = e.target.closest('[data-c]'); if (d) { p.setLastColor(d.dataset.c); tb.querySelectorAll('.pdot').forEach(z => z.classList.toggle('on', z === d)); p.act.highlight(x, d.dataset.c); return; }
      const v = e.target.closest('[data-v]'); if (!v) return; const a = v.dataset.v;
      if (a === 'more') { tb.classList.add('two'); tb.classList.remove('picking'); return; }
      if (a === 'less') { tb.classList.remove('two'); return; }
      if (a === 'highlight') { p.act.highlight(x, p.lastColor()); tb.classList.add('picking'); return; }
      if (a === 'unhighlight') { p.act.unhighlight(x); closeTb(); return; }
      closeTb(); p.act[a](x, w || {});
    });
  }
  function onTap(x, w) { if (!x) { closeTb(); return; } if (tb && tb._v === x.v) { closeTb(); return; } openTb(x, w); if (tb) tb._v = x.v; }
  function onHold(x, w) { closeTb(); P().verseSheet(x, w); }

  function refresh() {
    const p = P(); const k = p.bookOf(state.ref.b); if (!k) return;
    // the label at the top belongs to the top Bible (with two Bibles on screen the lower one has its own, in the strip)
    const ti = p.par.top(); const h = document.querySelector('.b-big h2 span'); const lb = p.par.label(ti) || `${k.name} ${state.ref.c}`; if (h && h.textContent !== lb) h.textContent = lb;
    const bb = document.querySelector('.b-big [data-a="bible"] span'); const an = p.par.abbr(ti); if (bb && bb.textContent !== an) bb.textContent = an;
    const par = document.querySelector('.b-big [data-a="par"]'); if (par) par.classList.toggle('acc', !!window.TimotheosPhone.splitId());
    const gb = document.getElementById('gBack'), gf = document.getElementById('gFwd');
    const b = document.querySelector('.b-abar [data-a="back"]'), f = document.querySelector('.b-abar [data-a="fwd"]');
    if (b) b.disabled = !gb || gb.disabled; if (f) f.disabled = !gf || gf.disabled;
    const t = p.ttsInfo(); const pl = document.querySelector('.b-player'); if (pl) { pl.classList.toggle('on', !!t.busy); pl.querySelector('.lbl').textContent = t.label || ''; pl.querySelector('[data-a="pause"]').innerHTML = p.ic(t.paused ? 'play' : 'pause', 21); }
    const sp = document.querySelector('.b-abar [data-a="speak"]'); if (sp) sp.classList.toggle('on', !!t.busy);
    if (!p.pageCount() && tab !== 'read') { tab = 'read'; document.querySelectorAll('.b-tabs [data-t]').forEach(x => x.classList.toggle('on', x.dataset.t === 'read')); }
    p.fitLabels();
  }
  function mount() {
    ac = new AbortController(); const sig = { signal: ac.signal }; const p = P(); tab = 'read';
    el('b-top', `<div class="b-abar">${ib('back', 'back', 'Back to the previous screen')}${ib('fwd', 'fwd', 'Forward to the next screen')}<span class="grow"></span>${ib('view', 'text', 'Reading view: text size, what to show')}${ib('speak', 'speaker', 'Read aloud')}</div>
      <div class="b-big"><h2 data-a="go"><span>John 3</span>${p.ic('chevD', 20)}</h2><button type="button" class="pchip" data-a="bible"><span>KJV</span>${p.ic('chevD', 14)}</button><span class="grow"></span><button type="button" class="pchip ghost" data-a="par" aria-label="Parallel: two Bibles" title="Parallel: two Bibles">${p.ic('compare', 18)}</button></div>`);
    el('b-tabs', [['read', 'read', 'Bible'], ['library', 'library', 'Library'], ['search', 'search', 'Search'], ['study', 'study', 'Notes'], ['more', 'more', 'More']].map(([k, i, l]) => `<button type="button" data-t="${k}" class="${k === 'read' ? 'on' : ''}"><i>${p.ic(i, 22)}</i>${l}</button>`).join(''));
    el('b-player', `${ib('prevv', 'prevv', 'Previous verse')}${ib('pause', 'pause', 'Pause')}${ib('nextv', 'nextv', 'Next verse')}<span class="lbl"></span>${ib('stop', 'stop', 'Stop')}`);
    document.addEventListener('click', e => {
      const t = e.target.closest('.b-tabs [data-t]'); if (t) { e.stopPropagation(); return setTab(t.dataset.t); }
      const b = e.target.closest('.skel [data-a]'); if (!b) return; e.stopPropagation(); const a = b.dataset.a; closeTb();
      if (b.closest('.b-big')) p.par.focus(p.par.top());
      if (a === 'back') { const g = document.getElementById('gBack'); if (g && !g.disabled) g.click(); }
      else if (a === 'fwd') { const g = document.getElementById('gFwd'); if (g && !g.disabled) g.click(); }
      else if (a === 'go') p.goSheetList();
      else if (a === 'bible') p.chooseBible();
      else if (a === 'par') window.TimotheosSkins.parallel();
      else if (a === 'view') p.formatFor(p.par.on() ? p.par.top() : null);
      else if (a === 'speak') { if (TimotheosSpeech.isSpeaking()) TimotheosSpeech.stop(); else TimotheosSpeech.speakView(state.active, null); }
      else if (a === 'pause' || a === 'stop') TimotheosSpeech.control(a);
      else if (a === 'prevv') TimotheosSpeech.control('prev'); else if (a === 'nextv') TimotheosSpeech.control('next');
      setTimeout(refresh, 50);
    }, Object.assign({ capture: true }, sig));
    const lastTop = new WeakMap(); let gestureAt = -1e9;
    // the toolbar closes when the person really scrolls the text (a finger or the wheel moved), not when the text is resized or redrawn
    ['touchmove', 'wheel'].forEach(n => document.addEventListener(n, () => { gestureAt = performance.now(); }, Object.assign({ capture: true, passive: true }, sig)));
    document.addEventListener('scroll', e => { const t = e.target; if (!t.classList || !t.classList.contains('bvtext')) return; const y = t.scrollTop, y0 = lastTop.get(t); lastTop.set(t, y); if (tb && y0 !== undefined && Math.abs(y - y0) > 24 && performance.now() - gestureAt < 1500) closeTb(); }, Object.assign({ capture: true, passive: true }, sig));
    window.addEventListener('tw-tts', refresh, sig); window.addEventListener('pui-page', refresh, sig);
    p.H.tap = onTap; p.H.hold = onHold;
    refresh();
  }
  function unmount() { if (ac) ac.abort(); ac = null; closeTb(); els.forEach(e => e.remove()); els = []; P().clearPages(); }
  window.SkinB = { mount, unmount, refresh, setTab, closeTb, tab: () => tab };
})();
