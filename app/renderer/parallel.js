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
  let root = null, body = null, bar = null;
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
    root.innerHTML = '<div class="parbar"></div><div class="parbody" tabindex="0"></div>';
    bar = root.querySelector('.parbar'); body = root.querySelector('.parbody');
    bar.addEventListener('click', onBar);
    body.addEventListener('click', onBody);
    body.addEventListener('mouseover', onHover);
    body.addEventListener('mouseleave', () => lightUp(null));
    body.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    wireChipDrag();
    // the panel was hidden and is now on screen: ask for / choose a set the first time, and draw it
    new ResizeObserver(() => { if (visible()) wake(); }).observe(root);
    drawBar();
  }
  async function wake() {
    if (busy) return;
    if (!state.modules || !installed().length || !(state.nav && state.nav.length)) { dirty = true; setTimeout(() => { if (visible()) wake(); }, 600); return; }   // still starting up
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
    const chips = ids.map(id => `<span class="pchipb${id === base ? ' base' : ''}" draggable="true" data-chip="${esc(id)}" title="${esc(titleOf(id))} · click: compare the others with this Bible (★) · drag: change the order">${id === base ? '★ ' : ''}${esc(abbrOf(id))}<button type="button" class="px" data-a="remove" data-id="${esc(id)}" title="Take this Bible out of the set">×</button></span>`).join('');
    const r = ref(); const bk = (state.nav || []).find(x => x.id === r.b);
    bar.innerHTML = `<button type="button" class="parset" data-a="sets" title="Choose another parallel set, make a new one, or change this one">${ic('star', 14)}<b>${esc(set ? setName(set) : 'No set yet')}</b>${ic('down', 13)}</button>
      <span class="parchips">${chips}</span>
      ${set ? `<button type="button" data-a="edit" title="Add or remove Bibles (up to ${MAX})">${ic('plus', 14)}Bible</button>` : `<button type="button" class="primary" data-a="new">${ic('plus', 14)}Set up parallel Bibles</button>`}
      <span class="pargrow"></span>
      <span class="parseg" role="group" aria-label="Layout"><button type="button" data-a="cols" class="${mode === 'cols' ? 'on' : ''}" title="Bibles side by side">Columns</button><button type="button" data-a="stack" class="${mode === 'stack' ? 'on' : ''}" title="Each verse with every Bible under it">Stacked</button></span>
      <button type="button" data-a="diff" class="tog${S().parDiff ? ' on' : ''}" title="Mark the words that differ from the ★ Bible">≠ Differences</button>
      <button type="button" data-a="tar" class="tog${window.TimotheosTAR && TimotheosTAR.running() ? ' on' : ''}" title="Translation Accuracy Rating (TAR): an AI grades how faithfully a translation renders its source text (Poor · Not Bad · Good · Faithful)">TAR</button>
      <button type="button" data-a="follow" class="tog${follow() ? ' on' : ''}" title="Follow the main Bible view (click to read on by itself)">${ic('link', 14)}Follow</button>
      <span class="parnav"><button type="button" data-a="prev" title="Chapter before">${ic('prev', 14)}</button><span class="parref">${esc(bk ? bk.name : '')} ${r.c || ''}</span><button type="button" data-a="next" title="Chapter after">${ic('next', 14)}</button></span>
      <button type="button" data-a="wpop" class="tog${S().parWpop ? ' on' : ''}" title="Word pop-ups when the mouse rests on a word (otherwise hold Shift)"><span class="wpglyph">Ωא</span></button>
      <button type="button" data-a="zout" title="Text smaller">${ic('textDown', 15)}</button><button type="button" data-a="zin" title="Text larger">${ic('textUp', 15)}</button>`;
  }
  async function onBar(e) {
    const b = e.target.closest('[data-a]');
    const chip = e.target.closest('[data-chip]');
    if (!b && chip) { const s = curSet(); if (s) { s.base = chip.dataset.chip; saveSets([...sets()]); drawBar(); if (S().parDiff) render(false); } return; }
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
    if (a === 'cols' || a === 'stack') { save({ parLayout: Object.assign({}, S().parLayout || {}, { [isPhone() ? 'phone' : 'pc']: a }) }); drawBar(); return render(true); }
    if (a === 'diff') { save({ parDiff: !S().parDiff }); drawBar(); return render(false); }
    if (a === 'tar') { const s = curSet(); return window.TimotheosTAR && TimotheosTAR.open({ ids: s ? s.bibles.filter(bibleOf) : [], ref: ref() }); }
    if (a === 'wpop') { save({ parWpop: !S().parWpop }); return drawBar(); }
    if (a === 'follow') { const on = !follow(); save(on ? { parFollow: true } : { parFollow: false, parRef: { ...state.ref } }); drawBar(); return render(true); }
    if (a === 'zin' || a === 'zout') return zoom(a === 'zin' ? 1 : -1);
    if (a === 'prev' || a === 'next') {
      const r = ref(); const n = typeof adjChapter === 'function' ? adjChapter(r.b, r.c, a === 'next' ? 1 : -1) : null; if (!n) return;
      if (follow()) return go({ b: n.b, c: n.c, v: 1 });
      save({ parRef: { b: n.b, c: n.c, v: 1 } }); drawBar(); return render(true);
    }
  }
  function zoom(d) {
    const z = Math.round(Math.min(2.5, Math.max(0.6, (+S().parZoom || 1) + d * 0.1)) * 10) / 10;
    save({ parZoom: z }); applyZoom();
  }
  function applyZoom() { if (body) body.style.setProperty('--size', Math.round((S().fontSize || 17) * (+S().parZoom || 1) * 10) / 10 + 'px'); }
  function flash(t) { if (typeof flashMsg === 'function') flashMsg(t); }

  /* chips: drag to change the order (mouse); the set dialog has ↑ ↓ for touch */
  function wireChipDrag() {
    let from = null;
    bar.addEventListener('dragstart', e => { const c = e.target.closest('[data-chip]'); if (!c) return; from = c.dataset.chip; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', from); } catch (x) { /* */ } c.classList.add('drag'); });
    bar.addEventListener('dragover', e => { if (from && e.target.closest('[data-chip]')) e.preventDefault(); });
    bar.addEventListener('dragend', () => { from = null; bar.querySelectorAll('.drag').forEach(x => x.classList.remove('drag')); });
    bar.addEventListener('drop', e => {
      const c = e.target.closest('[data-chip]'); const s = curSet(); if (!c || !from || !s) return; e.preventDefault();
      const to = c.dataset.chip; if (to === from) return;
      const l = s.bibles.filter(x => x !== from); l.splice(l.indexOf(to) + (e.offsetX > c.clientWidth / 2 ? 1 : 0), 0, from);
      s.bibles = l; from = null; saveSets([...sets()]); drawBar(); render(false);
    });
  }

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
    if (all.length < MIN) { await TimotheosModules.modal('Parallel Bibles', `<p>Parallel Bibles needs at least ${MIN} Bibles. Import or download another Bible first (File → Import, or Download modules).</p>`, [{ label: 'OK', value: 1, primary: true }]); return null; }
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
  async function render(scroll) {
    if (!body) return;
    if (scroll) wantScroll = true;   // a newer drawing that does not scroll must not cancel the scroll asked for before it
    if (!visible()) { dirty = true; return; }
    dirty = false;
    const my = ++seq; applyZoom();
    const set = curSet();
    if (!set) { body.innerHTML = `<div class="parnone"><p>No parallel set yet.</p><button type="button" class="primary" data-a2="new">${ic('plus', 15)}Set up parallel Bibles</button></div>`; return; }
    const ids = set.bibles.filter(bibleOf).slice(0, MAX);
    const gone = set.bibles.filter(id => !bibleOf(id));
    if (!ids.length) { body.innerHTML = '<div class="parnone"><p>The Bibles of this set are not installed any more.</p></div>'; return; }
    await Promise.all(ids.map(id => ensureInfo(id)));
    if (window.TimotheosTAR) await TimotheosTAR.preload(ids);
    const r = ref();
    let data;
    try { data = await api.chapter(ids, r.b, r.c); } catch (e) { if (my === seq) body.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
    if (my !== seq) return;
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
    const tarB = (k, v) => (window.TimotheosTAR && v ? TimotheosTAR.badge(ids[k], ids, r.b, r.c, v) : '');
    const cellHtml = (c, k, v) => c.h == null ? `<div class="pcell pmiss">${isPhone() ? '—' : 'not in this Bible'}</div>`
      : `<div class="pcell${infos[k].rtl ? ' rtl' : ''}"${infos[k].rtl ? ' dir="rtl"' : ''}>${c.h}${c.pct != null ? ` <span class="diffpct" title="share of words that differ from ${esc(abbrOf(ids[base]))}">${c.pct}%</span>` : ''}${tarB(k, v)}</div>`;
    const curV = (r.b === state.ref.b && r.c === state.ref.c) || !follow() ? r.v : 0;
    let html = '';
    if (gone.length) html += `<p class="hint parwarn">Not installed any more: ${esc(gone.map(x => x.replace(/^\w+:/, '')).join(', '))}</p>`;
    if (!rows.length) html += `<p class="hint">${esc(bkName)} ${r.c} is in none of these Bibles.</p>`;
    else if (layoutMode() === 'cols') {
      html += `<div class="ptable${diff ? ' diffon' : ''}" style="--n:${ids.length}"><div class="phd"><span class="pvn"></span>${ids.map((id, k) => `<div class="pth${k === base && diff ? ' base' : ''}" title="${esc(titleOf(id))}"><b>${k === base && diff ? '★ ' : ''}${esc(abbrOf(id))}</b><small>${esc(titleOf(id))}</small></div>`).join('')}</div>`;
      for (const row of rows) html += `<div class="pvrow${row.v === curV ? ' cur' : ''}" data-pv="${row.v}"><span class="pvn">${row.v === 0 ? '¶' : row.v}</span>${cellsOf(row).map((c, k) => cellHtml(c, k, row.v)).join('')}</div>`;
      html += '</div>';
    } else {
      html += `<div class="pstack${diff ? ' diffon' : ''}">`;
      for (const row of rows) {
        const cs = cellsOf(row);
        html += `<div class="psv pvrow${row.v === curV ? ' cur' : ''}" data-pv="${row.v}"><div class="psh">${esc(bkName)} ${r.c}:${row.v === 0 ? '¶' : row.v}</div>${cs.map((c, k) => `<div class="psl${k === base && diff ? ' base' : ''}"><span class="plb" title="${esc(titleOf(ids[k]))}">${k === base && diff ? '★' : ''}${esc(abbrOf(ids[k]))}</span>${cellHtml(c, k, row.v)}</div>`).join('')}</div>`;
      }
      html += '</div>';
    }
    const keep = body.scrollTop;
    body.innerHTML = html;
    if (typeof markGlosses === 'function') try { markGlosses(body); } catch (e) { /* */ }
    drawBar();
    if (wantScroll) { wantScroll = false; const el = boxOf(body.querySelector(`.pvrow[data-pv="${curV}"]`)); if (el && curV > 1) el.scrollIntoView({ block: 'center' }); else body.scrollTop = 0; }
    else body.scrollTop = keep;
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

  window.TimotheosParallel = { init, render, onRef, onModulesChanged, setupDialog, chooseSetDialog, wake, wordPopupAllowed: shift => !!(shift || S().parWpop), MAX };
})();
