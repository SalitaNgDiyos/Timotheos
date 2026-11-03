'use strict';
/* Docking workbench on a grid of 4 columns x 3 rows (12 areas). Every kind of panel, Bible views included
 * ("bv0", "bv1", …), can sit in any area, be tabbed together with others, float as its own window,
 * be maximized or closed. Areas may span several cells; column and row sizes are dragged at the gutters.
 *
 * layout = { v: 2, cols: [fr×4], rows: [fr×3], areas: [{ c, r, cs, rs, panels: [id], active }],
 *            floats: [{ panels, active, x, y, w, h }], hidden: [id] }
 */
/* global TimotheosIcons */
(function () {
  const NC = 4, NR = 3;
  const PANELS = new Map();          // id → { id, title, icon, cap, el }
  let L = null;                      // current layout
  let opts = {};                     // { onSave(layout), onActivate(id), onClose(id), zoomable, onZoom, onSkin }
  let focusMode = false;
  let maxed = null;                  // id of the panel whose group is maximized
  const ic = (n, s) => TimotheosIcons.icon(n, s);
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const isBible = id => /^bv\d+$/.test(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = (c, r, cs, rs, panels, active) => ({ c, r, cs, rs, panels, active: active || panels[0] });

  const PRESETS = {
    classic: { label: 'Classic (Books left, Bible views in the middle, study tools right, search below)', layout: {
      v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1],
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 1, ['cmt']), A(3, 1, 1, 2, ['lib', 'study']), A(1, 2, 2, 1, ['search', 'bsearch'])],
      floats: [], hidden: [] } },
    tabs: { label: 'Compact (Bible views in the middle, everything else as tabs on the right)', layout: {
      v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1],
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 3, ['bv0']), A(3, 0, 1, 3, ['lib', 'cmt', 'search', 'bsearch', 'study'], 'lib')],
      floats: [], hidden: [] } },
    study: { label: 'Word study (commentary and library side by side below)', layout: {
      v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1],
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 2, ['search', 'bsearch', 'study'], 'search'), A(1, 2, 1, 1, ['cmt']), A(2, 2, 2, 1, ['lib'])],
      floats: [], hidden: [] } },
    reading: { label: 'Reading (Bible views only; panels hidden)', layout: {
      v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1],
      areas: [A(0, 0, 4, 3, ['bv0'])],
      floats: [], hidden: ['tree', 'cmt', 'lib', 'study', 'search', 'bsearch'] } }
  };

  /* ------------------------------------------------------------ registry & state */
  function register(p) { PANELS.set(p.id, p); p.el.classList.add('dpanel'); p.el.dataset.panel = p.id; }

  const covers = (a, r, c) => c >= a.c && c < a.c + a.cs && r >= a.r && r < a.r + a.rs;
  const areaAt = (lay, r, c) => lay.areas.find(a => covers(a, r, c));
  const free = (lay, r, c) => !areaAt(lay, r, c);

  /** a saved v1 layout (left / right / bottom zones around the Bible views) becomes a grid layout */
  function fromV1(old) {
    const out = { v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1], areas: [], floats: old.floats || [], hidden: old.hidden || [] };
    const put = (col, list, rows) => list.forEach((g, i) => out.areas.push(A(col, Math.min(i, 2), 1, i === list.length - 1 ? 3 - Math.min(i, 2) : 1, g.panels.filter(x => x !== 'compare'), g.active)));
    const z = old.zones || {};
    put(0, (z.left || {}).groups || []);
    put(3, (z.right || {}).groups || []);
    const bottom = ((z.bottom || {}).groups || []).slice(0, 2);
    bottom.forEach((g, i) => out.areas.push(A(1 + i, 2, bottom.length === 1 ? 2 : 1, 1, g.panels.filter(x => x !== 'compare'), g.active)));
    const bvRows = bottom.length ? 2 : 3;
    out.areas.push(A(1, 0, 2, bvRows, ['bv0']));
    out.areas = out.areas.filter(a => a.panels.length);
    out.hidden = out.hidden.filter(x => x !== 'compare');
    return out;
  }

  /** make any stored layout safe: unknown panels dropped, missing panels put back where they belong */
  function normalize(lay) {
    let out = lay && lay.v === 2 && Array.isArray(lay.areas) ? clone(lay) : lay && lay.v === 1 && lay.zones ? fromV1(lay) : clone(PRESETS.classic.layout);
    const seen = new Set();
    const known = id => PANELS.has(id) || (isBible(id) && !PANELS.size);
    const keep = list => (list || []).filter(id => known(id) && !seen.has(id) && seen.add(id));
    out.cols = Array.from({ length: NC }, (_, i) => Math.max(0.15, +(out.cols || [])[i] || 1));
    out.rows = Array.from({ length: NR }, (_, i) => Math.max(0.15, +(out.rows || [])[i] || 1));
    const taken = [];
    out.areas = (out.areas || []).map(a => {
      const c = Math.max(0, Math.min(NC - 1, a.c | 0)), r = Math.max(0, Math.min(NR - 1, a.r | 0));
      return { c, r, cs: Math.max(1, Math.min(NC - c, a.cs | 0 || 1)), rs: Math.max(1, Math.min(NR - r, a.rs | 0 || 1)), panels: keep(a.panels), active: a.active };
    }).filter(a => a.panels.length).filter(a => { // areas may not overlap
      for (let r = a.r; r < a.r + a.rs; r++) for (let c = a.c; c < a.c + a.cs; c++) if (taken.includes(r * 9 + c)) return false;
      for (let r = a.r; r < a.r + a.rs; r++) for (let c = a.c; c < a.c + a.cs; c++) taken.push(r * 9 + c);
      return true;
    });
    for (const a of out.areas) if (!a.panels.includes(a.active)) a.active = a.panels[0];
    out.floats = (out.floats || []).map(f => ({ panels: keep(f.panels), active: f.active, x: +f.x || 80, y: +f.y || 80, w: +f.w || 360, h: +f.h || 320 })).filter(f => f.panels.length);
    for (const f of out.floats) if (!f.panels.includes(f.active)) f.active = f.panels[0];
    out.hidden = keep(out.hidden);
    for (const id of PANELS.keys()) if (!seen.has(id)) placeHome(out, id, true); // e.g. a panel new in this version, or a new Bible view
    return out;
  }

  /** where a new Bible view goes: it takes half of the area of the Bible view it follows, else a free cell, else a tab */
  function placeBible(lay, id, quiet) {
    const bvArea = [...lay.areas].reverse().find(a => a.panels.some(isBible));
    if (bvArea) {
      if (bvArea.cs > 1) { bvArea.cs--; lay.areas.push(A(bvArea.c + bvArea.cs, bvArea.r, 1, bvArea.rs, [id])); return; }
      if (bvArea.rs > 1) { bvArea.rs--; lay.areas.push(A(bvArea.c, bvArea.r + bvArea.rs, bvArea.cs, 1, [id])); return; }
      for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (free(lay, r, c)) { lay.areas.push(A(c, r, 1, 1, [id])); return; }
      bvArea.panels.push(id); if (!quiet) bvArea.active = id; return;
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (free(lay, r, c)) { lay.areas.push(A(c, r, 1, 1, [id])); return; }
    lay.areas[0].panels.push(id);
  }

  /** where a panel goes when it is shown again: its own place in the classic layout, else beside what is there */
  function placeHome(lay, id, quiet) {
    if (isBible(id)) return placeBible(lay, id, quiet);
    const home = PRESETS.classic.layout.areas.find(a => a.panels.includes(id));
    if (home) {
      const mate = lay.areas.find(a => a.c === home.c && a.r === home.r);
      if (mate) { mate.panels.push(id); if (!quiet) mate.active = id; return; }
      let ok = true; for (let r = home.r; r < home.r + home.rs; r++) for (let c = home.c; c < home.c + home.cs; c++) if (!free(lay, r, c)) ok = false;
      if (ok) { lay.areas.push(A(home.c, home.r, home.cs, home.rs, [id])); return; }
    }
    for (let r = 0; r < NR; r++) for (let c = NC - 1; c >= 0; c--) if (free(lay, r, c)) { lay.areas.push(A(c, r, 1, 1, [id])); return; }
    const last = lay.areas[lay.areas.length - 1]; if (last) { last.panels.push(id); if (!quiet) last.active = id; } else lay.areas.push(A(0, 0, 4, 3, [id]));
  }

  function locate(id) {
    if (!L) return null;
    for (let i = 0; i < L.areas.length; i++) if (L.areas[i].panels.includes(id)) return { area: true, ai: i, g: L.areas[i] };
    for (let i = 0; i < L.floats.length; i++) if (L.floats[i].panels.includes(id)) return { float: true, fi: i, g: L.floats[i] };
    if (L.hidden.includes(id)) return { hidden: true };
    return null;
  }

  function detach(id) {
    const at = locate(id); if (!at) return;
    if (at.hidden) { L.hidden = L.hidden.filter(x => x !== id); return; }
    const g = at.g; g.panels = g.panels.filter(x => x !== id);
    if (g.active === id) g.active = g.panels[0];
    if (!g.panels.length) { if (at.float) L.floats.splice(at.fi, 1); else L.areas.splice(at.ai, 1); }
  }

  function isVisible(id) {
    const at = locate(id); return !!at && !at.hidden && at.g.active === id && !(focusMode && !at.float && !at.g.panels.some(isBible));
  }

  /* ------------------------------------------------------------ rendering */
  let holder;
  function usedTracks(areas) {
    const cols = [], rows = [];
    for (let c = 0; c < NC; c++) if (areas.some(a => c >= a.c && c < a.c + a.cs)) cols.push(c);
    for (let r = 0; r < NR; r++) if (areas.some(a => r >= a.r && r < a.r + a.rs)) rows.push(r);
    return { cols, rows };
  }
  function span(used, from, n) { // grid line range of cells from..from+n-1, with the gutter tracks between used cells
    const idx = used.map((u, k) => [u, k]).filter(([u]) => u >= from && u < from + n).map(([, k]) => k);
    return `${2 * idx[0] + 1} / ${2 * idx[idx.length - 1] + 2}`;
  }
  function render() {
    const wb = $('#workbench'); const grid = $('#grid');
    const scroll = new Map();
    for (const p of PANELS.values()) { scroll.set(p.id, p.el.scrollTop); holder.appendChild(p.el); }
    grid.innerHTML = '';
    const shown = L.areas.filter(a => a.panels.some(id => PANELS.has(id))).filter(a => !focusMode || a.panels.some(isBible));
    const { cols, rows } = usedTracks(shown);
    grid.style.gridTemplateColumns = cols.map(c => `minmax(0, ${L.cols[c]}fr)`).join(' 6px ');
    grid.style.gridTemplateRows = rows.map(r => `minmax(0, ${L.rows[r]}fr)`).join(' 6px ');
    for (const a of shown) {
      const g = { ...a, panels: a.panels.filter(id => PANELS.has(id)) };
      const el = groupEl(a, { area: true });
      el.style.gridColumn = span(cols, a.c, a.cs); el.style.gridRow = span(rows, a.r, a.rs);
      grid.appendChild(el);
    }
    // a gutter is drawn only where two different areas touch (not through an area that spans both sides)
    const spans = (a, i, j, isCol) => isCol ? a.c <= cols[i] && a.c + a.cs - 1 >= cols[i + 1] && a.r <= rows[j] && a.r + a.rs - 1 >= rows[j] : a.r <= rows[i] && a.r + a.rs - 1 >= rows[i + 1] && a.c <= cols[j] && a.c + a.cs - 1 >= cols[j];
    cols.slice(0, -1).forEach((c, k) => rows.forEach((r, j) => { if (!shown.some(a => spans(a, k, j, true))) grid.appendChild(gutter('col', k, cols, rows, j)); }));
    rows.slice(0, -1).forEach((r, k) => cols.forEach((c, j) => { if (!shown.some(a => spans(a, k, j, false))) grid.appendChild(gutter('row', k, cols, rows, j)); }));
    document.querySelectorAll('.dfloat').forEach(f => f.remove());
    L.floats.forEach((f, fi) => {
      const w = groupEl(f, { float: true, fi });
      w.classList.add('dfloat');
      Object.assign(w.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
      clampFloat(w);
      wb.appendChild(w);
      new ResizeObserver(() => { if (w.isConnected && (Math.abs(w.offsetWidth - f.w) > 2 || Math.abs(w.offsetHeight - f.h) > 2)) { f.w = w.offsetWidth; f.h = w.offsetHeight; saveSoon(); } }).observe(w);
    });
    for (const p of PANELS.values()) if (p.el.parentNode === holder) p.el.classList.add('hidden');
    for (const [id, top] of scroll) if (PANELS.has(id)) PANELS.get(id).el.scrollTop = top;
    wb.classList.toggle('focus', focusMode);
    const fb = $('#focusBtn'); if (fb) fb.classList.toggle('on', focusMode);
    if (opts.onRender) opts.onRender();
  }

  function groupEl(g, where) {
    let ids = g.panels.filter(id => PANELS.has(id));
    if (focusMode && where.area) ids = ids.filter(isBible); // reading focus: only the Bible views of an area
    const act0 = ids.includes(g.active) ? g.active : ids[0];
    if (!focusMode) g.active = act0;
    const div = document.createElement('section');
    div.className = 'dgroup';
    if (where.area) div.dataset.ai = L.areas.indexOf(g); else div.dataset.fi = where.fi;
    const act = PANELS.get(act0);
    div.style.setProperty('--cap', `var(--cap-${act.cap})`);
    div.classList.toggle('zoomable', !!(opts.zoomable && opts.zoomable(act0)));
    div.classList.toggle('isbv', isBible(act0));
    if (maxed && ids.includes(maxed)) div.classList.add('max');
    const tabs = ids.map(id => {
      const p = PANELS.get(id);
      return `<button class="dtab${id === act0 ? ' on' : ''}" data-id="${id}" style="--tc: var(--cap-${p.cap})" title="${esc(p.title)} — drag to move">${ic(p.icon, 15)}<span>${esc(p.title)}</span></button>`;
    }).join('');
    div.innerHTML = `<header class="dcap">
        <span class="dgrip" title="Drag to move this panel">${ic('grip', 14)}</span>
        <div class="dtabs">${tabs}</div>
        <span class="dbtns">
          <button class="dbtn" data-act="skin" title="This panel's own fonts and colours">${ic('palette', 14)}</button>
          <button class="dbtn dzoom" data-act="zoom-" title="Smaller (Ctrl + mouse wheel down)">${ic('textDown', 15)}</button>
          <button class="dbtn dzoom" data-act="zoom+" title="Larger (Ctrl + mouse wheel up)">${ic('textUp', 15)}</button>
          <button class="dbtn" data-act="float" title="${where.float ? 'Dock again' : 'Float as a window'}">${ic(where.float ? 'dockIn' : 'float', 14)}</button>
          ${where.float ? '' : `<button class="dbtn" data-act="max" title="${div.classList.contains('max') ? 'Restore' : 'Maximize'}">${ic(div.classList.contains('max') ? 'restore' : 'max', 14)}</button>`}
          <button class="dbtn" data-act="close" title="Close (reopen from the Panels menu)">${ic('close', 14)}</button>
        </span></header><div class="dbody"></div>`;
    const body = div.querySelector('.dbody');
    for (const id of ids) { const p = PANELS.get(id); body.appendChild(p.el); p.el.classList.toggle('hidden', id !== act0); }
    div.querySelector('.dcap').addEventListener('pointerdown', e => startDrag(e, div, g));
    div.querySelector('.dcap').addEventListener('dblclick', e => { if (!e.target.closest('.dbtn')) toggleFloat(g.active); });
    div.querySelectorAll('.dtab').forEach(b => b.addEventListener('click', () => activate(b.dataset.id)));
    div.querySelectorAll('.dbtn').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'close') { if (!(opts.onClose && opts.onClose(act0))) hide(act0); return; }
      if (a === 'skin') { if (opts.onSkin) opts.onSkin(act0, b); return; }
      if (a === 'float') toggleFloat(act0);
      if (a === 'zoom-' || a === 'zoom+') { if (opts.onZoom) opts.onZoom(act0, a === 'zoom+' ? 1 : -1); }
      if (a === 'max') { maxed = maxed && ids.includes(maxed) ? null : act0; render(); }
    }));
    return div;
  }

  /** the draggable line between two columns or two rows: it changes the sizes of the columns / rows beside it */
  function gutter(kind, k, cols, rows, seg) {
    const s = document.createElement('div'); const isCol = kind === 'col';
    s.className = 'gut ' + (isCol ? 'h' : 'v'); s.title = isCol ? 'Drag to change the column widths' : 'Drag to change the row heights';
    if (isCol) { s.style.gridColumn = String(2 * k + 2); s.style.gridRow = String(2 * seg + 1); } else { s.style.gridRow = String(2 * k + 2); s.style.gridColumn = String(2 * seg + 1); }
    s.addEventListener('pointerdown', e => {
      e.preventDefault(); s.setPointerCapture(e.pointerId);
      const grid = $('#grid'); const tracks = getComputedStyle(grid)[isCol ? 'gridTemplateColumns' : 'gridTemplateRows'].split(' ').map(parseFloat);
      const list = isCol ? cols : rows; const arr = isCol ? L.cols : L.rows;
      const ia = list[k], ib = list[k + 1]; const pa = tracks[2 * k], pb = tracks[2 * k + 2]; const tot = arr[ia] + arr[ib]; const start = isCol ? e.clientX : e.clientY;
      const move = ev => {
        const d = (isCol ? ev.clientX : ev.clientY) - start; const na = Math.max(70, Math.min(pa + pb - 70, pa + d));
        arr[ia] = tot * na / (pa + pb); arr[ib] = tot - arr[ia];
        grid.style[isCol ? 'gridTemplateColumns' : 'gridTemplateRows'] = list.map(i => `minmax(0, ${arr[i]}fr)`).join(' 6px ');
      };
      const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up); s.removeEventListener('lostpointercapture', up); saveSoon(); };
      s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up); s.addEventListener('lostpointercapture', up);
    });
    return s;
  }

  function clampFloat(w) {
    const W = window.innerWidth, H = window.innerHeight;
    const x = Math.min(Math.max(0, parseInt(w.style.left)), W - 120), y = Math.min(Math.max(40, parseInt(w.style.top)), H - 60);
    w.style.left = x + 'px'; w.style.top = y + 'px';
  }

  /* ------------------------------------------------------------ dragging */
  let drag = null;
  function startDrag(e, groupDiv, g) {
    if (e.button !== 0 || e.target.closest('.dbtn')) return;
    const tab = e.target.closest('.dtab');
    const id = tab ? tab.dataset.id : g.active;
    const isFloat = groupDiv.classList.contains('dfloat');
    drag = { id, g, groupDiv, isFloat, sx: e.clientX, sy: e.clientY, started: false,
      ox: isFloat ? e.clientX - groupDiv.offsetLeft : 0, oy: isFloat ? e.clientY - groupDiv.offsetTop : 0 };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
  }

  function onMove(e) {
    if (!drag) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
      drag.started = true;
      document.body.classList.add('dragging');
      if (!drag.isFloat) {
        const p = PANELS.get(drag.id);
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'dghost';
        drag.ghost.style.setProperty('--cap', `var(--cap-${p.cap})`);
        drag.ghost.innerHTML = `${ic(p.icon, 15)}<span>${esc(p.title)}</span>`;
        document.body.appendChild(drag.ghost);
      }
      showGridTargets();
    }
    if (drag.ghost) { drag.ghost.style.left = e.clientX + 12 + 'px'; drag.ghost.style.top = e.clientY + 10 + 'px'; }
    if (drag.isFloat) {
      drag.groupDiv.style.left = e.clientX - drag.ox + 'px'; drag.groupDiv.style.top = e.clientY - drag.oy + 'px';
      drag.groupDiv.style.pointerEvents = 'none';
    }
    const tgt = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList && el.classList.contains('dtarget'));
    drag.target = tgt ? JSON.parse(tgt.dataset.t) : null;
    document.querySelectorAll('.dtarget.hot').forEach(x => x.classList.remove('hot'));
    if (tgt) tgt.classList.add('hot');
    showPreview(drag.target, tgt);
  }

  function onUp(e) {
    document.removeEventListener('pointermove', onMove);
    const d = drag; drag = null;
    if (!d) return;
    document.body.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    clearTargets();
    if (d.isFloat) d.groupDiv.style.pointerEvents = '';
    if (!d.started) return;
    if (d.target) { dropOn(d.id, d.target); return; }
    if (d.isFloat) {
      const f = d.g; f.x = d.groupDiv.offsetLeft; f.y = d.groupDiv.offsetTop; clampFloat(d.groupDiv);
      f.x = parseInt(d.groupDiv.style.left); f.y = parseInt(d.groupDiv.style.top); saveSoon(); return;
    }
    // dropped somewhere without a target: make it a floating window there
    detach(d.id);
    L.floats.push({ panels: [d.id], active: d.id, x: e.clientX - 40, y: e.clientY - 14, w: 380, h: 340 });
    maxed = null; commit();
  }

  /** the 12 areas of the grid, laid over the workbench while a panel is dragged */
  function showGridTargets() {
    const r = $('#workbench').getBoundingClientRect();
    const layer = document.createElement('div'); layer.className = 'dlayer'; layer.id = 'dlayer';
    Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    for (let row = 0; row < NR; row++) for (let col = 0; col < NC; col++) {
      const b = document.createElement('div'); b.className = 'dtarget cell'; b.dataset.t = JSON.stringify({ cell: [row, col] });
      const a = areaAt(L, row, col); const names = a ? a.panels.filter(id => PANELS.has(id)).map(id => PANELS.get(id).title).join(', ') : '';
      b.title = a ? `Area ${row + 1}·${col + 1}: add as a tab beside ${names}` : `Area ${row + 1}·${col + 1}: empty`;
      b.style.cssText = `left:${col * 25}%;top:${row * 100 / 3}%;width:25%;height:${100 / 3}%`;
      b.innerHTML = `<span class="dcn">${row + 1}·${col + 1}</span><span class="dcw">${a ? esc(names) : 'empty'}</span>`;
      layer.appendChild(b);
    }
    const pv = document.createElement('div'); pv.className = 'dpreview hidden'; pv.id = 'dpreview'; layer.appendChild(pv);
    document.body.appendChild(layer);
  }

  function showPreview(t, tgtEl) {
    const pv = $('#dpreview'); if (!pv) return;
    if (!t || !tgtEl) { pv.classList.add('hidden'); return; }
    const lay = $('#dlayer').getBoundingClientRect(); const cell = tgtEl.getBoundingClientRect();
    pv.style.left = cell.left - lay.left + 'px'; pv.style.top = cell.top - lay.top + 'px'; pv.style.width = cell.width + 'px'; pv.style.height = cell.height + 'px';
    pv.classList.remove('hidden');
  }

  function clearTargets() { const l = $('#dlayer'); if (l) l.remove(); }

  /** which cut makes room at a covered cell of an area that spans several cells: [kind, …] or null (then: a tab) */
  function sliceFor(a, r, c) {
    if (a.cs > 1 && c === a.c + a.cs - 1) return 'right';
    if (a.cs > 1 && c === a.c) return 'left';
    if (a.rs > 1 && r === a.r + a.rs - 1) return 'bottom';
    if (a.rs > 1 && r === a.r) return 'top';
    return null;
  }
  /** put a panel into grid cell [r, c]: a free cell gets its own area, a single cell becomes a tab, a spanning area gives up its edge */
  function placeAt(lay, id, r, c) {
    const a = areaAt(lay, r, c);
    if (!a) { lay.areas.push(A(c, r, 1, 1, [id])); return; }
    const cut = a.cs * a.rs > 1 ? sliceFor(a, r, c) : null;
    if (cut === 'right') { a.cs--; lay.areas.push(A(a.c + a.cs, a.r, 1, a.rs, [id])); }
    else if (cut === 'left') { a.c++; a.cs--; lay.areas.push(A(a.c - 1, a.r, 1, a.rs, [id])); }
    else if (cut === 'bottom') { a.rs--; lay.areas.push(A(a.c, a.r + a.rs, a.cs, 1, [id])); }
    else if (cut === 'top') { a.r++; a.rs--; lay.areas.push(A(a.c, a.r - 1, a.cs, 1, [id])); }
    else { a.panels.push(id); a.active = id; }
  }

  /** move a panel to a drop target */
  function dropOn(id, t) {
    if (t.cell) {
      const own = areaAt(L, t.cell[0], t.cell[1]);
      if (own && own.panels.includes(id)) return; // onto its own area
      detach(id); maxed = null;
      placeAt(L, id, t.cell[0], t.cell[1]);
    }
    if (focusMode) focusMode = false;
    commit(); activate(id);
  }

  /* ------------------------------------------------------------ actions */
  function activate(id) {
    const at = locate(id); if (!at || at.hidden) return;
    at.g.active = id;
    // switch tabs without rebuilding (keeps scroll positions and focus)
    const grpEl = [...document.querySelectorAll('.dgroup')].find(x => x.querySelector(`[data-panel="${id}"]`));
    if (grpEl) {
      grpEl.querySelectorAll('.dtab').forEach(b => b.classList.toggle('on', b.dataset.id === id));
      grpEl.querySelectorAll('.dbody > .dpanel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== id));
      grpEl.style.setProperty('--cap', `var(--cap-${PANELS.get(id).cap})`);
      grpEl.classList.toggle('zoomable', !!(opts.zoomable && opts.zoomable(id)));
      grpEl.classList.toggle('isbv', isBible(id));
    } else render();
    saveSoon();
    if (opts.onActivate) opts.onActivate(id);
  }

  /** make a panel visible: reopen it if closed, leave focus mode, bring its tab to the front */
  function show(id) {
    if (!PANELS.has(id)) return;
    const at = locate(id);
    if (at && at.hidden) { L.hidden = L.hidden.filter(x => x !== id); placeHome(L, id); commit(); }
    else if (focusMode && at && !at.float && !isBible(id)) { focusMode = false; render(); }
    activate(id);
  }

  function hide(id) {
    detach(id); L.hidden.push(id);
    if (maxed === id) maxed = null;
    commit();
  }

  function toggleFloat(id) {
    const at = locate(id); if (!at) return;
    if (at.float) { detach(id); placeHome(L, id); }
    else {
      const el = PANELS.get(id).el.closest('.dgroup'); const r = el ? el.getBoundingClientRect() : { left: 200, top: 120 };
      detach(id);
      L.floats.push({ panels: [id], active: id, x: Math.round(r.left + 30), y: Math.round(r.top + 30), w: 380, h: 360 });
    }
    maxed = null; commit();
  }

  function toggleFocus(on) { focusMode = on == null ? !focusMode : on; maxed = null; render(); }

  /** a new panel that was not there when the layout was made (a new Bible view) */
  function add(p) {
    register(p);
    if (!L) return;
    if (!locate(p.id)) placeHome(L, p.id);
    commit();
  }
  /** a Bible view that is gone */
  function remove(id) {
    const el = PANELS.get(id); detach(id); PANELS.delete(id);
    if (maxed === id) maxed = null;
    if (el && el.el.parentNode) el.el.remove();
    if (L) commit();
  }
  function retitle(id, title) {
    const p = PANELS.get(id); if (!p || p.title === title) return; p.title = title;
    document.querySelectorAll(`.dtab[data-id="${id}"]`).forEach(b => { const sp = b.querySelector('span'); if (sp) sp.textContent = title; b.title = title + ' — drag to move'; });
  }

  /** Bible views side by side (cols) or one under another (rows), inside the space they now take */
  function arrangeBible(kind) {
    const ids = [...PANELS.keys()].filter(isBible).sort((a, b) => +a.slice(2) - +b.slice(2)).filter(id => { const at = locate(id); return at && at.area; });
    if (ids.length < 2) return;
    const areas = [...new Set(ids.map(id => locate(id).g))];
    let c0 = Math.min(...areas.map(a => a.c)), r0 = Math.min(...areas.map(a => a.r));
    let c1 = Math.max(...areas.map(a => a.c + a.cs - 1)), r1 = Math.max(...areas.map(a => a.r + a.rs - 1));
    for (const id of ids) detach(id);
    const empty = (c, r) => free(L, r, c);
    const n = ids.length; // widen / heighten the space while the cells next to it are free
    const grow = () => {
      if (kind === 'cols') while (c1 - c0 + 1 < n && c1 + 1 < NC && Array.from({ length: r1 - r0 + 1 }, (_, i) => empty(c1 + 1, r0 + i)).every(Boolean)) c1++;
      else while (r1 - r0 + 1 < n && r1 + 1 < NR && Array.from({ length: c1 - c0 + 1 }, (_, i) => empty(c0 + i, r1 + 1)).every(Boolean)) r1++;
    };
    grow();
    const cnt = kind === 'cols' ? c1 - c0 + 1 : r1 - r0 + 1;
    const per = Math.min(cnt, n);
    ids.forEach((id, i) => {
      const k = Math.min(i, per - 1);
      const mate = L.areas.find(a => a.panels.some(isBible) && (kind === 'cols' ? a.c === c0 + k : a.r === r0 + k) && a.r >= r0 && a.r <= r1 && a.c >= c0 && a.c <= c1);
      if (mate) { mate.panels.push(id); return; }
      L.areas.push(kind === 'cols' ? A(c0 + k, r0, 1, r1 - r0 + 1, [id]) : A(c0, r0 + k, c1 - c0 + 1, 1, [id]));
    });
    maxed = null; commit();
  }

  function commit() { render(); saveSoon(); }
  let saveT = null;
  function saveSoon() { clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; if (opts.onSave && L) opts.onSave(clone(L)); }, 100); }
  window.addEventListener('beforeunload', () => { if (saveT) { clearTimeout(saveT); saveT = null; if (opts.onSave && L) opts.onSave(clone(L)); } });

  function applyPreset(name) {
    const p = PRESETS[name]; if (!p) return;
    L = normalize(p.layout); maxed = null; focusMode = false; commit();
  }
  function setLayout(lay) { L = normalize(lay); maxed = null; focusMode = false; commit(); }

  function init(layout, o) {
    opts = o || {};
    holder = document.createElement('div'); holder.id = 'dholder'; holder.hidden = true; document.body.appendChild(holder);
    L = normalize(layout);
    render();
    window.addEventListener('resize', () => document.querySelectorAll('.dfloat').forEach(clampFloat));
  }

  window.TimotheosDock = {
    init, register, add, remove, retitle, render, show, hide, activate, toggleFloat, toggleFocus, applyPreset, setLayout, isVisible, arrangeBible,
    panels: () => [...PANELS.values()], panel: id => PANELS.get(id), state: () => clone(L), located: id => locate(id), PRESETS, isBible,
    get focus() { return focusMode; }
  };
})();
