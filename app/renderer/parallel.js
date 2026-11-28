/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Parallel Bibles panel (0.6.120): up to 8 Bibles verse by verse, in columns or stacked, from saved sets.
 * The first time it opens it asks for a set (a name or kind, and the Bibles); with two or more saved sets it asks
 * which one to open. It follows the main Bible view, marks the differences against the ★ Bible, and lights up the
 * words with the same Strong's number in every Bible when the mouse rests on one. */
(function () {
  const MAX = 8, MIN = 2;
  const CATS = ['Modern English', 'Old English', 'Tagalog', 'Original languages', 'Mixed languages'];
  let root = null, body = null, bar = null, side = null;
  let askedThisSession = false, seq = 0, shown = null, dirty = true, busy = false;

  const S = () => state.settings;
  const isPhone = () => document.documentElement.classList.contains('mobile');
  const sets = () => (Array.isArray(S().parSets) ? S().parSets : []);
  const curSet = () => sets().find(s => s.id === S().parSetId) || null;
  const installed = () => (state.modules && state.modules.bibles) || [];
  const bibleOf = id => installed().find(b => b.id === id);
  const abbrOf = id => { const i = state.infos.get(id); const b = bibleOf(id); return (i && i.abbr) || (b && b.abbr) || String(id).replace(/^\w+:/, ''); };
  const titleOf = id => { const i = state.infos.get(id); const b = bibleOf(id); return (i && i.title) || (b && (b.title || b.name)) || ''; };
  const layoutMode = () => { const l = S().parLayout || {}; return l[isPhone() ? 'phone' : 'pc'] || (isPhone() ? 'stack' : 'cols'); };
  const follow = () => S().parFollow !== false;
  const visible = () => !!(root && root.isConnected && root.offsetParent !== null && root.clientWidth > 0);
  const ic = (n, s = 15) => (window.TimotheosIcons ? TimotheosIcons.icon(n, s) : '');
  const setName = s => (s && s.name) || (s ? s.bibles.map(abbrOf).join(' · ') : '');
  const newId = () => 'ps' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function saveSets(list, extra) { save(Object.assign({ parSets: list }, extra || {})); }
  function ref() { return follow() || !S().parRef ? { ...state.ref } : { ...S().parRef }; }

  /* ---------------------------------------------------------------- the panel */
  function init() {
    root = document.getElementById('tab-par'); if (!root) return;
    root.classList.add('parpanel');
    // the bar on top; beside the text, the icons of a Bible view (0.6.128)
    root.innerHTML = `<div class="parbar"></div><div class="parmain"><nav class="parside bvside" aria-label="Settings of the Parallel Bibles panel">${sideHtml()}</nav><div class="parbody" tabindex="0"></div></div>`;
    bar = root.querySelector('.parbar'); body = root.querySelector('.parbody'); side = root.querySelector('.parside');
    // the ⋯ menu (0.6.131): Differences, Follow and the text tools that used to sit in a column beside the text
    menu = document.createElement('div'); menu.className = 'parxmenu hidden'; menu.innerHTML = '<div class="parmtop"></div>';
    menu.appendChild(side); root.appendChild(menu);
    menu.addEventListener('click', onBar);
    body.addEventListener('mousedown', () => closeMenu());
    root.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.classList.contains('hidden')) { e.stopPropagation(); closeMenu(); } });
    bar.addEventListener('click', onBar);
    side.addEventListener('click', onSide);
    applyLook();
    showSnapshot();
    body.addEventListener('click', onBody);
    body.addEventListener('mouseover', onHover);
    body.addEventListener('mouseleave', () => lightUp(null));
    body.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    // the panel was hidden and is now on screen: ask for / choose a set the first time, and draw it
    new ResizeObserver(() => { if (visible()) wake(); }).observe(root);
    drawBar();
    // while the panel is closed, open its Bibles quietly in the background so the first opening does not wait for them (computer only)
    setTimeout(() => {
      try {
        if (isPhone() || visible()) return;
        const set = curSet(); if (!set) return;
        const ids = set.bibles.filter(bibleOf).slice(0, MAX), r = ref();
        Promise.all(ids.map(id => ensureInfo(id))).then(() => api.chapter(ids, r.b, r.c)).catch(() => { /* it is only a warm-up */ });
      } catch (e) { /* only a warm-up */ }
    }, 4000);
  }
  let menu = null;
  function closeMenu() { if (!menu) return; menu.classList.add('hidden'); const b = bar && bar.querySelector('.parmore'); if (b) { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); } }
  function toggleMenu() { if (!menu) return; const open = menu.classList.contains('hidden'); menu.classList.toggle('hidden', !open); const b = bar.querySelector('.parmore'); if (b) { b.classList.toggle('on', open); b.setAttribute('aria-expanded', String(open)); } }
  async function wake() {
    if (busy) return;
    if (!state.modules || !installed().length || !(state.nav && state.nav.length)) { dirty = true; setTimeout(() => { if (visible()) wake(); }, 150); return; }   // still starting up
    if (!askedThisSession) {
      askedThisSession = true;
      if (!sets().length) { busy = true; try { await setupDialog(null, true); } finally { busy = false; } }
      else if (sets().length >= 2) { busy = true; try { await chooseSetDialog(); } finally { busy = false; } }
      else if (!curSet()) save({ parSetId: sets()[0].id });
      drawBar(); dirty = true;
    }
    if (dirty) render(true);
  }

  /* ---------------------------------------------------------------- the bar */
  function drawBar() {
    if (!bar) return;
    const set = curSet(); const mode = layoutMode();
    const ids = set ? set.bibles.filter(bibleOf) : [];
    const base = set && ids.includes(set.base) ? set.base : ids[0];
    const r = ref(); const bk = (state.nav || []).find(x => x.id === r.b);
    // one row: the set, the verse picker (as in a Bible view), then the layout, Differences and Follow (0.6.128)
    bar.innerHTML = `<button type="button" class="parset" data-a="sets" title="Choose another parallel set, make a new one, or change this one (add, remove or order its Bibles)"><b>${esc(set ? setName(set) : 'No set yet')}</b>${ic('down', 13)}</button>
      ${set ? `<button type="button" class="navpill parpill" data-a="pick" title="Choose the book, chapter and verse${follow() ? ' (the Bible views go along: Follow is on)' : ''}"><span class="np-lbl">${esc(bk ? bk.name : '')} ${r.c || ''}:${r.v || 1}</span><span class="np-caret">▾</span></button>` : `<button type="button" class="primary" data-a="new">${ic('plus', 14)}Set up parallel Bibles</button>`}
      <span class="pargrow"></span>
      <span class="parseg" role="group" aria-label="Layout"><button type="button" data-a="cols" class="${mode === 'cols' ? 'on' : ''}" title="Bibles side by side">Columns</button><button type="button" data-a="stack" class="${mode === 'stack' ? 'on' : ''}" title="Each verse with every Bible under it">Stacked</button></span>
      <button type="button" data-a="more" class="parmore${menu && !menu.classList.contains('hidden') ? ' on' : ''}" aria-haspopup="true" aria-expanded="${menu && !menu.classList.contains('hidden') ? 'true' : 'false'}" title="More: Differences, Follow and the text tools" aria-label="More">⋯</button>`;
    if (menu) menu.querySelector('.parmtop').innerHTML = `<button type="button" data-a="diff" class="tog${S().parDiff ? ' on' : ''}" title="Mark the words that differ from the ★ Bible (click a column title to choose it)">≠<span class="lbl"> Differences</span></button>
      <button type="button" data-a="follow" class="tog${follow() ? ' on' : ''}" title="Follow the main Bible view (click to read on by itself)">${ic('link', 14)}<span class="lbl">Follow</span></button>`;
    syncSide();
  }
  /* ---------------------------------------------------------------- the icons beside the text (as in a Bible view) */
  const AL = ['left', 'center', 'justify', 'right'];
  const look = () => S().parLook || {};
  function setLook(k, v) { const o = Object.assign({}, look()); if (v == null || v === '') delete o[k]; else o[k] = v; save({ parLook: o }); applyLook(); }
  function sideHtml() {
    const al = window.TimotheosAlign ? TimotheosAlign.icon('left', 15) : ic('menu', 15);
    return `<button data-grab="par" class="pgrab bvgrab" title="Drag to scroll: when on, hold the left mouse button on the text and drag to scroll it (Shift+drag selects text)" aria-pressed="false">${ic('hand', 15)}</button>
      <button data-s="wpop" class="pwpop" title="Word pop-ups when the mouse rests on a word (otherwise hold Shift)"><span class="wpglyph">Ωא</span></button>
      <button data-s="zin" title="Font up (Ctrl + mouse wheel up)">${ic('textUp', 15)}</button>
      <button data-s="zout" title="Font down (Ctrl + mouse wheel down)">${ic('textDown', 15)}</button>
      <button data-s="fcolor" class="pfcolor" title="Font colour">${ic('fontColor', 15)}<i class="bar"></i></button>
      <button data-s="font" title="Font of this panel">${ic('type', 15)}</button>
      <button data-s="hfont" title="Headings: font, size, colour">${ic('outline', 15)}</button>
      <button data-s="selbg" class="pselbg" title="Background of the current verse">${ic('verseBg', 15)}<i class="bar"></i></button>
      <button data-s="pen" class="ppen" title="Highlighter: choose a colour, then select text">${ic('highlighter', 15)}<i class="bar"></i></button>
      <button data-s="ul" class="pul" title="Underline: choose a style and colour, then select text">${ic('underline', 15)}</button>
      <span class="bvsep"></span>
      <button data-s="align" class="palign" title="Text alignment: left, centre, justified, right">${al}</button>
      <button data-s="lh" title="Line spacing">${ic('lineSpacing', 15) || '↕'}</button>`;
  }
  function syncSide() {
    if (!side) return;
    const L = look();
    const w = side.querySelector('.pwpop'); if (w) w.classList.toggle('on', !!S().parWpop);
    const a = side.querySelector('.palign'); if (a && window.TimotheosAlign) a.innerHTML = TimotheosAlign.icon(L.align || 'left', 15);
    const bar2 = (q, c) => { const b = side.querySelector(q + ' .bar'); if (b) b.style.background = c || 'transparent'; };
    bar2('.pfcolor', L.color); bar2('.pselbg', L.selBg); bar2('.ppen', state.pen && state.pen.color);
    const pb = side.querySelector('.ppen'); if (pb) pb.classList.toggle('on', !!(state.pen && state.pen.kind === 'hl'));
    const ub = side.querySelector('.pul'); if (ub) ub.classList.toggle('on', !!(state.pen && state.pen.kind === 'ul'));
  }
  /** the panel's own look: font, colour, headings, current-verse background, alignment, line spacing */
  function applyLook() {
    if (!body) return; const L = look(); const t = body;
    const fam = L.font ? `'TwGreek', 'TwHebrew', '${String(L.font).replace(/['\\]/g, '')}', var(--font-text)` : '';
    t.style.fontFamily = fam;
    if (L.color) t.style.color = L.color; else t.style.removeProperty('color');
    if (L.selBg) t.style.setProperty('--sel', L.selBg); else t.style.removeProperty('--sel');
    if (L.align) t.dataset.align = L.align; else delete t.dataset.align;
    if (L.lh) t.style.setProperty('--lh', L.lh); else t.style.removeProperty('--lh');
    const h = L.head || {}; const hd = (k, val, prop, css) => { if (val != null && val !== '') { t.dataset[k] = typeof val === 'boolean' ? (val ? '1' : '0') : '1'; if (prop) t.style.setProperty(prop, css); } else { delete t.dataset[k]; if (prop) t.style.removeProperty(prop); } };
    hd('hfam', h.font, '--h-font', h.font ? `'${String(h.font).replace(/['\\]/g, '')}', var(--font-text)` : '');
    hd('hsz', h.size, '--h-scale', String(h.size || 1)); hd('hcol', h.color, '--h-color', h.color || ''); hd('hb', h.bold, null); hd('hi', h.italic, null);
    applyZoom(); syncSide();
  }
  function onSide(e) {
    const b = e.target.closest('[data-s]'); if (!b) return;
    const a = b.dataset.s, L = look();
    if (a === 'wpop') { save({ parWpop: !S().parWpop }); return syncSide(); }
    if (a === 'zin' || a === 'zout') return zoom(a === 'zin' ? 1 : -1);
    if (a === 'fcolor') return TimotheosViewUI.colorMenu(b, 'Font colour of this panel', L.color, c => setLook('color', c || null));
    if (a === 'selbg') return TimotheosViewUI.colorMenu(b, 'Background of the current verse', L.selBg, c => setLook('selBg', c || null));
    if (a === 'pen') return TimotheosViewUI.penMenu(b);
    if (a === 'ul') return TimotheosViewUI.underlineMenu(b);
    if (a === 'font') {
      const fonts = TimotheosOptions.fonts();
      return paneMenu(b, `<div class="mh">Font of this panel</div><select class="bvfont" size="12"><option value="">As in Options</option>${fonts.map(f => `<option value="${esc(f)}" style="font-family:'${esc(String(f).replace(/['\\]/g, ''))}'"${f === L.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`, m => {
        const sl = m.querySelector('select'); if (!L.font) sl.value = '';
        sl.onchange = () => setLook('font', sl.value || null);
      });
    }
    if (a === 'hfont') {
      const fonts = TimotheosOptions.fonts(); const hh = L.head || {};
      const SZ = [['', 'Automatic'], ['0.8', 'Small'], ['1', 'As the text'], ['1.2', 'Large'], ['1.45', 'Larger'], ['1.75', 'Largest']];
      return paneMenu(b, `<div class="mh">Headings of this panel</div><div class="hfopts">
        <label>Font <select data-h="font"><option value="">As the screen sets it</option>${fonts.map(f => `<option value="${esc(f)}"${f === hh.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
        <label>Size <select data-h="size">${SZ.map(([k, l]) => `<option value="${k}"${String(hh.size || '') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label><input type="checkbox" data-h="bold"${hh.bold ? ' checked' : ''}> Bold</label><label><input type="checkbox" data-h="italic"${hh.italic ? ' checked' : ''}> Italic</label>
        <label>Colour <input type="color" data-h="color" value="${esc(hh.color || '#888888')}"> <button type="button" data-h="nocolor">Default colour</button></label>
        <button type="button" data-h="reset">Headings as the screen sets them</button></div>`, m => {
        const put = (k, val) => { const o = Object.assign({}, look().head || {}); if (val == null || val === '' || val === false) delete o[k]; else o[k] = val; setLook('head', Object.keys(o).length ? o : null); };
        m.addEventListener('change', e2 => { const k = e2.target.dataset.h; if (!k) return; if (k === 'bold' || k === 'italic') put(k, e2.target.checked); else if (k === 'size') put(k, e2.target.value ? +e2.target.value : null); else if (k !== 'color') put(k, e2.target.value || null); });
        m.addEventListener('input', e2 => { if (e2.target.dataset.h === 'color') put('color', e2.target.value); });
        m.addEventListener('click', e2 => { const x = e2.target.closest('button[data-h]'); if (!x) return; if (x.dataset.h === 'nocolor') put('color', null); else { setLook('head', null); m.remove(); } });
      });
    }
    if (a === 'align') {
      const cur = L.align || 'left';
      return paneMenu(b, `<div class="mh">Text alignment</div>${TimotheosAlign.row(cur)}`, m => {
        m.addEventListener('click', e2 => { const x = e2.target.closest('button[data-al]'); if (!x) return; setLook('align', x.dataset.al === 'left' ? null : x.dataset.al); m.querySelectorAll('[data-al]').forEach(y => y.classList.toggle('on', y === x)); });
      });
    }
    if (a === 'lh') {
      const now = () => +(look().lh || TimotheosOptions.appearance().lineH || 1.65);
      return paneMenu(b, `<div class="mh">Line spacing</div><div class="alignrow lhrow"><button type="button" data-lh="-1" title="Less space between lines">−</button><b class="lhv">${now().toFixed(2)}</b><button type="button" data-lh="1" title="More space between lines">+</button><button type="button" data-lh="0" title="As set in Options">Default</button></div>`, m => {
        m.addEventListener('click', e2 => { const x = e2.target.closest('button[data-lh]'); if (!x) return; const d = +x.dataset.lh; setLook('lh', d ? Math.round(Math.min(3, Math.max(1, now() + d * 0.05)) * 100) / 100 : null); m.querySelector('.lhv').textContent = now().toFixed(2); });
      });
    }
  }
  async function onBar(e) {
    const b = e.target.closest('[data-a]');
    const chip = e.target.closest('[data-chip]');
    if (!b && chip) { const s = curSet(); if (s) { s.base = chip.dataset.chip; saveSets([...sets()]); drawBar(); if (S().parDiff) render(false, true); } return; }
    if (!b) return;
    const a = b.dataset.a, set = curSet();
    if (a === 'sets') return setMenu(b);
    if (a === 'new') return setupDialog(null);
    if (a === 'edit') return set && setupDialog(set);
    if (a === 'remove') {
      if (!set) return;
      if (set.bibles.length <= MIN) return flash(`A parallel set keeps at least ${MIN} Bibles.`);
      set.bibles = set.bibles.filter(x => x !== b.dataset.id); saveSets([...sets()]); drawBar(); return render(false);
    }
    if (a === 'more') return toggleMenu();
    if (a === 'cols' || a === 'stack') { save({ parLayout: Object.assign({}, S().parLayout || {}, { [isPhone() ? 'phone' : 'pc']: a }) }); drawBar(); return render(true, true); }
    if (a === 'diff') { save({ parDiff: !S().parDiff }); drawBar(); return render(false, true); }
    if (a === 'wpop') { save({ parWpop: !S().parWpop }); return drawBar(); }
    if (a === 'follow') { const on = !follow(); save(on ? { parFollow: true } : { parFollow: false, parRef: { ...state.ref } }); drawBar(); return render(true); }
    if (a === 'pick' && window.TimotheosNav) {
      // the Bible view's book / chapter / verse picker; with Follow off it moves only this panel
      return TimotheosNav.openNavPopover('book', b, null, follow() ? null : { ref: ref(), onPick: r => { save({ parRef: { b: r.b, c: r.c, v: r.v || 1 } }); drawBar(); render(true); } });
    }
  }
  function zoom(d) {
    const z = Math.round(Math.min(2.5, Math.max(0.6, (+S().parZoom || 1) + d * 0.1)) * 10) / 10;
    save({ parZoom: z }); applyZoom();
  }
  function applyZoom() { if (body) body.style.setProperty('--size', Math.round((S().fontSize || 17) * (+S().parZoom || 1) * 10) / 10 + 'px'); }
  function flash(t) { if (typeof flashMsg === 'function') flashMsg(t); }

  /* the ★ menu: other sets, new, change, delete */
  function setMenu(btn) {
    document.querySelectorAll('.parmenu').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'parmenu';
    const cur = curSet();
    m.innerHTML = (sets().length ? `<div class="mh">Parallel sets</div>` + sets().map(s => `<button type="button" data-set="${esc(s.id)}" class="${cur && s.id === cur.id ? 'on' : ''}">${ic(cur && s.id === cur.id ? 'check' : 'star', 14)}<span><b>${esc(setName(s))}</b><small>${esc(s.bibles.map(abbrOf).join(' · '))}</small></span></button>`).join('') + '<div class="msep"></div>' : '')
      + `<button type="button" data-m="new">${ic('plus', 14)}New parallel set…</button>`
      + (cur ? `<button type="button" data-m="edit">${ic('edit', 14)}Change this set…</button><button type="button" data-m="del">${ic('close', 14)}Delete this set</button>` : '');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(r.left, innerWidth - m.offsetWidth - 4)) + 'px'; m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 4) + 'px';
    const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); };
    const out = e => { if (!m.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('pointerdown', out, true), 0);
    m.onclick = async e => {
      const s = e.target.closest('[data-set]'), k = e.target.closest('[data-m]'); if (!s && !k) return; close();
      if (s) { save({ parSetId: s.dataset.set }); drawBar(); return render(true); }
      if (k.dataset.m === 'new') return setupDialog(null);
      if (k.dataset.m === 'edit') return setupDialog(curSet());
      if (k.dataset.m === 'del') {
        const ok = await TimotheosModules.confirmBox('Delete parallel set', `Delete the set “${esc(setName(cur))}”? The Bibles themselves are not touched.`);
        if (!ok) return;
        const rest = sets().filter(x => x.id !== cur.id); saveSets(rest, { parSetId: rest[0] ? rest[0].id : null }); drawBar(); render(true);
      }
    };
  }

  /* ---------------------------------------------------------------- dialogs */
  /** first-time setup, a new set, or changing a set. Returns the saved set or null. */
  async function setupDialog(set, first) {
    const all = installed();
    if (all.length < MIN) { await TimotheosModules.modal('Parallel Bibles', `<p>Parallel Bibles needs at least ${MIN} Bibles. Import or download another Bible first (File → Modules → Import… or Download…).</p>`, [{ label: 'OK', value: 1, primary: true }]); return null; }
    let picked = set ? set.bibles.filter(bibleOf) : [];
    const html = `<div class="parsetup">
      ${first ? '<p class="hint">Show several Bibles verse by verse. Make a set of them now; you can make more sets later and choose which one to open.</p>' : ''}
      <label class="field"><span>1. What kind of Bibles do you want to see, or what should this set be called? <i>(optional)</i></span>
        <input id="parName" type="text" maxlength="60" placeholder="e.g. Modern English, Old English, Tagalog, Mixed languages" value="${esc(set ? set.name || '' : '')}"></label>
      <div class="parcats">${CATS.map(c => `<button type="button" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <div class="field"><span>2. Pick the Bibles for this set <b>(required, ${MIN} to ${MAX})</b></span></div>
      <input id="parFind" type="text" placeholder="Find a Bible (name or abbreviation)…">
      <div id="parPick" class="parpick"></div>
      <div id="parCount" class="hint"></div></div>`;
    const p = TimotheosModules.modal(set ? 'Change parallel set' : first ? 'Set up Parallel Bibles' : 'New parallel set', html,
      [{ label: 'Cancel', value: null }, { label: set ? 'Save' : 'Save and open', value: 'ok', primary: true }], true);
    const $m = s => document.querySelector('#modalBody ' + s);
    const okBtn = [...document.querySelectorAll('#modalBtns button')].find(x => x.classList.contains('primary'));
    const draw = () => {
      const q = ($m('#parFind').value || '').trim().toLowerCase();
      const rows = [...picked.map(id => all.find(b => b.id === id)).filter(Boolean), ...all.filter(b => !picked.includes(b.id))]
        .filter(b => !q || picked.includes(b.id) || `${b.abbr} ${b.title} ${b.name}`.toLowerCase().includes(q));
      $m('#parPick').innerHTML = rows.map(b => {
        const k = picked.indexOf(b.id); const on = k >= 0; const full = !on && picked.length >= MAX;
        return `<div class="ppr${on ? ' on' : ''}${full ? ' full' : ''}" data-id="${esc(b.id)}">
          <label><input type="checkbox" ${on ? 'checked' : ''} ${full ? 'disabled' : ''}><b>${esc(abbrOf(b.id))}</b><span>${esc(b.title || b.name)}</span><small>${esc(b.format || '')}</small></label>
          ${on ? `<span class="ppord">${k + 1}<button type="button" data-mv="-1" title="Earlier (more to the left)" ${k === 0 ? 'disabled' : ''}>▲</button><button type="button" data-mv="1" title="Later (more to the right)" ${k === picked.length - 1 ? 'disabled' : ''}>▼</button></span>` : ''}</div>`;
      }).join('') || '<p class="hint">No Bible matches.</p>';
      const n = picked.length;
      $m('#parCount').innerHTML = `${n} of ${MAX} chosen${n < MIN ? ` · pick at least ${MIN}` : n >= MAX ? ' · that is the most' : ''}`;
      if (okBtn) okBtn.disabled = n < MIN;
    };
    draw();
    $m('#parFind').addEventListener('input', draw);
    for (const inp of [$m('#parFind'), $m('#parName')]) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); } });
    $m('.parcats').addEventListener('click', e => { const c = e.target.closest('[data-cat]'); if (c) { $m('#parName').value = c.dataset.cat; } });
    $m('#parPick').addEventListener('click', e => {
      const row = e.target.closest('[data-id]'); if (!row) return; const id = row.dataset.id;
      const mv = e.target.closest('[data-mv]');
      if (mv) { const k = picked.indexOf(id), j = k + +mv.dataset.mv; if (j < 0 || j >= picked.length) return; picked.splice(k, 1); picked.splice(j, 0, id); return draw(); }
      if (e.target.tagName !== 'INPUT') return;
      if (picked.includes(id)) picked = picked.filter(x => x !== id); else if (picked.length < MAX) picked.push(id);
      draw();
    });
    const v = await p;
    const nm = (document.getElementById('parName') || { value: '' }).value.trim();
    if (v !== 'ok' || picked.length < MIN) return null;
    let out;
    if (set) { set.name = nm; set.bibles = [...picked]; if (!picked.includes(set.base)) set.base = picked[0]; out = set; saveSets([...sets()]); }
    else { out = { id: newId(), name: nm, bibles: [...picked], base: picked[0] }; saveSets([...sets(), out], { parSetId: out.id }); }
    drawBar(); render(true);
    return out;
  }
  /** two or more saved sets: which one to open */
  async function chooseSetDialog() {
    const cur = curSet() || sets()[0];
    const html = `<p class="hint">Which parallel set do you want to open?</p><div class="parchoose">${sets().map(s => `<label class="ppr${s === cur ? ' on' : ''}"><input type="radio" name="parPickSet" value="${esc(s.id)}" ${s === cur ? 'checked' : ''}><span><b>${esc(setName(s))}</b><small>${esc(s.bibles.map(abbrOf).join(' · '))}</small></span></label>`).join('')}</div>`;
    const v = await TimotheosModules.modal('Parallel Bibles', html, [{ label: 'New set…', value: 'new' }, { label: 'Open', value: 'open', primary: true }]);
    const sel = document.querySelector('input[name="parPickSet"]:checked');
    if (v === 'new') return setupDialog(null);
    save({ parSetId: (sel && sel.value) || cur.id });
  }

  /* ---------------------------------------------------------------- drawing */
  let wantScroll = false;
  let chCache = null;   // the last chapter read: a change of layout or of Differences draws it again without reading the Bibles again
  async function render(scroll, reuse) {
    if (!body) return;
    if (scroll) wantScroll = true;   // a newer drawing that does not scroll must not cancel the scroll asked for before it
    if (!visible()) { dirty = true; return; }
    dirty = false;
    const my = ++seq; const T0 = performance.now(), P = (window.__P = {}); const mk = n => { P[n] = Math.round(performance.now() - T0); }; applyZoom(); mk('zoom');
    const set = curSet();
    if (!set) { body.innerHTML = `<div class="parnone"><p>No parallel set yet.</p><button type="button" class="primary" data-a2="new">${ic('plus', 15)}Set up parallel Bibles</button></div>`; return; }
    const ids = set.bibles.filter(bibleOf).slice(0, MAX);
    const gone = set.bibles.filter(id => !bibleOf(id));
    if (!ids.length) { body.innerHTML = '<div class="parnone"><p>The Bibles of this set are not installed any more.</p></div>'; return; }
    if (!body.querySelector('.pvrow, .parnone')) body.innerHTML = '<p class="hint parload">Loading…</p>';   // the first opening reads the Bibles
    await Promise.all(ids.map(id => ensureInfo(id)));
    mk('info');
    const r = ref();
    let data;
    const ck = ids.join('|') + '|' + r.b + '.' + r.c;
    try { if (reuse && chCache && chCache.key === ck) data = chCache.data; else { data = await api.chapter(ids, r.b, r.c); chCache = { key: ck, data }; } } catch (e) { if (my === seq) body.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
    if (my !== seq) return;
    mk('chapter');
    shown = { b: r.b, c: r.c };
    const show = Object.assign({}, S().show || {}, { strongs: false, morph: false, lemma: false, columns: false, tags: false, footnotes: false, xrefs: false, xrefsFull: false, cmtLinks: false });
    const infos = ids.map(id => state.infos.get(id) || EMPTY_MOD);
    const ctxs = ids.map(() => ({ fn: { n: 0 }, b: r.b }));
    const rows = data.rows.filter(row => row.cells.some(x => x != null));
    const base = ids.includes(set.base) ? ids.indexOf(set.base) : 0;
    const diff = !!S().parDiff && ids.length >= 2;
    const bkName = (data.book && data.book.name) || '';
    const cellsOf = row => {
      const html = row.cells.map((raw, k) => raw == null ? null : TWRender.render(raw, infos[k], show, ctxs[k]));
      if (!diff || html[base] == null) return html.map(h => ({ h, pct: null }));
      const plain = html.map(h => h == null ? null : plainOf(h));
      const bw = words(plain[base]); const baseMark = new Set();
      const out = html.map((h, k) => {
        if (h == null || k === base) return { h, pct: null };
        const ow = words(plain[k]); const { ia, ib, common } = lcs(bw, ow);
        if (ids.length === 2) bw.forEach((_, j) => { if (!ia.has(j)) baseMark.add(j); });
        return { h: ow.map((w, j) => ib.has(j) ? esc(w) : `<mark class="dif">${esc(w)}</mark>`).join(' '), pct: Math.round(100 * (1 - (2 * common) / Math.max(1, bw.length + ow.length))), plain: true };
      });
      out[base] = { h: bw.map((w, j) => baseMark.has(j) ? `<mark class="dif">${esc(w)}</mark>` : esc(w)).join(' '), pct: null, plain: true };
      return out;
    };
    const cellHtml = (c, k, v) => c.h == null ? `<div class="pcell pmiss" data-v="${v === 0 ? '¶' : v}">${isPhone() ? '—' : 'not in this Bible'}</div>`
      : `<div class="pcell${infos[k].rtl ? ' rtl' : ''}" data-v="${v === 0 ? '¶' : v}" data-bid="${esc(ids[k])}"${c.plain ? ' data-plain="1"' : ''}${infos[k].rtl ? ' dir="rtl"' : ''}>${c.h}${c.pct != null ? ` <span class="diffpct" title="share of words that differ from ${esc(abbrOf(ids[base]))}">${c.pct}%</span>` : ''}</div>`;
    const curV = (r.b === state.ref.b && r.c === state.ref.c) || !follow() ? r.v : 0;
    let html = '';
    if (gone.length) html += `<p class="hint parwarn">Not installed any more: ${esc(gone.map(x => x.replace(/^\w+:/, '')).join(', '))}</p>`;
    if (!rows.length) html += `<p class="hint">${esc(bkName)} ${r.c} is in none of these Bibles.</p>`;
    else if (layoutMode() === 'cols') {
      html += `<div class="ptable${diff ? ' diffon' : ''}" style="--n:${ids.length}"><div class="phd">${ids.map((id, k) => `<div class="pth${k === base && diff ? ' base' : ''}" data-chip="${esc(id)}" title="${esc(titleOf(id))} · click: compare the others with this Bible (★ for Differences)"><b>${k === base && diff ? '★ ' : ''}${esc(abbrOf(id))}</b><small>${esc(titleOf(id))}</small></div>`).join('')}</div>`;
      for (const row of rows) html += `<div class="pvrow${row.v === curV ? ' cur' : ''}" data-pv="${row.v}">${cellsOf(row).map((c, k) => cellHtml(c, k, row.v)).join('')}</div>`;
      html += '</div>';
    } else {
      html += `<div class="pstack${diff ? ' diffon' : ''}">`;
      for (const row of rows) {
        const cs = cellsOf(row);
        html += `<div class="psv pvrow${row.v === curV ? ' cur' : ''}" data-pv="${row.v}">${cs.map((c, k) => `<div class="psl${k === base && diff ? ' base' : ''}"><span class="plb" data-chip="${esc(ids[k])}" title="${esc(titleOf(ids[k]))} · click: compare the others with this Bible (★ for Differences)">${k === base && diff ? '★' : ''}${esc(abbrOf(ids[k]))}</span>${cellHtml(c, k, row.v)}</div>`).join('')}</div>`;
      }
      html += '</div>';
    }
    mk('build');
    const keep = body.scrollTop;
    body.innerHTML = html; mk('innerHTML'); body.classList.remove('parsnap');
    if (typeof markGlosses === 'function') try { markGlosses(body); } catch (e) { /* */ }
    // the user's highlights, as in the Bible views (not while differences are marked: the text is shown plain then)
    if (window.TimotheosStudy && TimotheosStudy.paintHighlights && (S().show || {}).highlights !== false) body.querySelectorAll('.pcell[data-bid]:not([data-plain])').forEach(cell => {
      const row = cell.closest('[data-pv]'); if (row && +row.dataset.pv) try { TimotheosStudy.paintHighlights(cell, cell.dataset.bid, r.b, r.c, +row.dataset.pv); } catch (e) { /* */ }
    });
    mk('glossHl');
    drawBar(); mk('drawBar');
    snapshotSoon(); mk('snap');
    if (wantScroll) { wantScroll = false; const el = boxOf(body.querySelector(`.pvrow[data-pv="${curV}"]`)); if (el && curV > 1) el.scrollIntoView({ block: 'center' }); else body.scrollTop = 0; }
    else body.scrollTop = keep;
    mk('scroll'); P.end = Math.round(performance.now() - T0);
    // a slow drawing is written to the Developer Tools console, so that it can be reported: where the time went, in ms since it began
    if (P.end > 300) console.info('[parallel] drawn in ' + P.end + ' ms: ' + JSON.stringify(P) + ' · ' + ids.length + ' Bibles, ' + rows.length + ' verses, ' + layoutMode() + (diff ? ', differences on' : ''));
  }
  /* ---- start-up (0.6.128): what the panel showed last time is put on screen at once, while the Bibles are read;
   * the freshly read text replaces it. Kept in this browser's storage, only for the same set, place and layout. */
  function snapKey() {
    const st = curSet(); if (!st) return '';
    const r = ref();
    return JSON.stringify([st.id, st.bibles, st.base, r.b, r.c, layoutMode(), !!S().parDiff, S().parZoom || 1]);
  }
  let snapT = 0;
  function snapshotSoon() {
    clearTimeout(snapT);
    snapT = setTimeout(() => { try { const html = body.innerHTML; if (html.length < 900000) localStorage.setItem('tw.parSnap', JSON.stringify({ k: snapKey(), html, st: body.scrollTop })); } catch (e) { /* storage full or off */ } }, 1200);
  }
  function showSnapshot() {
    try {
      const sn = JSON.parse(localStorage.getItem('tw.parSnap') || 'null'); const k = snapKey();
      if (!sn || !k || sn.k !== k || body.querySelector('.pvrow')) return false;
      body.innerHTML = sn.html; body.classList.add('parsnap');
      requestAnimationFrame(() => { body.scrollTop = sn.st || 0; });
      return true;
    } catch (e) { return false; }
  }
  function plainOf(h) { const d = document.createElement('div'); d.innerHTML = h; d.querySelectorAll('sup, .heading, .fnbody, .gloss').forEach(x => x.remove()); return d.textContent.replace(/\s+/g, ' ').trim(); }
  function words(t) { return String(t || '').split(' ').filter(Boolean); }
  const norm = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]/gu, '');
  function lcs(a, b) {
    const A = a.map(norm), B = b.map(norm), n = A.length, m = B.length;
    if (n * m > 400000) return { ia: new Set(a.keys()), ib: new Set(b.keys()), common: Math.min(n, m) };   // a very long verse: not compared
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ia = new Set(), ib = new Set(); let i = 0, j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { ia.add(i); ib.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    return { ia, ib, common: ia.size };
  }

  /* ---------------------------------------------------------------- verses, words */
  function onBody(e) {
    if (e.target.closest('[data-a2="new"]')) return setupDialog(null, !sets().length);
    // a column title (or the name in Stacked) makes that Bible the ★ one the others are compared with (the chips are gone, 0.6.127)
    const ch = e.target.closest('[data-chip]');
    if (ch) { const st = curSet(); if (st && st.base !== ch.dataset.chip) { st.base = ch.dataset.chip; saveSets([...sets()]); drawBar(); render(false, true); } return; }
    if (e.target.closest('a, [data-href], sup.fn, sup.xref, button')) return;
    const row = e.target.closest('.pvrow[data-pv]'); if (!row) return;
    const v = +row.dataset.pv; if (!v) return;
    if (follow()) { if (typeof selectVerse === 'function' && !selectVerse(v, true)) go({ ...state.ref, v }); }
    else { const r = ref(); save({ parRef: { b: r.b, c: r.c, v } }); }
    mark(v);
  }
  const boxOf = el => (el && getComputedStyle(el).display === 'contents' ? el.firstElementChild : el);   // a row of the column table has no box of its own
  function mark(v) {
    if (!body) return;
    body.querySelectorAll('.pvrow.cur').forEach(x => x.classList.remove('cur'));
    const el = body.querySelector(`.pvrow[data-pv="${v}"]`); if (el) el.classList.add('cur');
    return el;
  }
  const strongKey = s => String(s).toUpperCase().replace(/^([GH])0+(\d)/, '$1$2');
  function onHover(e) {
    const w = e.target.closest('[data-strong]');
    lightUp(w ? w.dataset.strong.split(/\s+/).filter(Boolean).map(strongKey) : null);
  }
  let lit = '';
  function lightUp(keys) {
    const k = keys ? keys.join(' ') : '';
    if (k === lit) return; lit = k;
    body.querySelectorAll('.phl').forEach(x => x.classList.remove('phl'));
    if (!keys || !keys.length) return;
    const want = new Set(keys);
    body.querySelectorAll('[data-strong]').forEach(x => { if (x.dataset.strong.split(/\s+/).some(s => want.has(strongKey(s)))) x.classList.add('phl'); });
  }

  /** the main Bible view moved */
  function onRef() {
    if (!root || !follow()) return;
    if (!visible()) { dirty = true; return; }
    if (!shown || shown.b !== state.ref.b || shown.c !== state.ref.c) return render(true);
    const el = boxOf(mark(state.ref.v)); if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function onModulesChanged() { if (curSet()) { drawBar(); render(false); } }

  window.TimotheosParallel = { showSnapshot, setBibles: () => { const st = curSet(); return st ? st.bibles.filter(bibleOf) : []; }, visible, syncSide, shownRef: () => (shown ? { ...shown } : { ...ref() }), following: follow, init, render, onRef, onModulesChanged, setupDialog, chooseSetDialog, wake, wordPopupAllowed: shift => !!(shift || S().parWpop), MAX };
})();
