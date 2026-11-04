'use strict';
/* Docking workbench on a grid of 4 columns x 3 rows (12 areas). Every kind of panel, Bible views included
 * ("bv0", "bv1", …), can sit in any area, be tabbed together with others, float as its own window,
 * be maximized or closed. Areas may span several cells; column and row sizes are dragged at the gutters.
 *
 * layout = { v: 3, areas: [{ x0, y0, x1, y1, panels: [id], active }],   (x 0–4 across the columns, y 0–3 down the rows)
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
  const A = (c, r, cs, rs, panels, active) => ({ x0: c, y0: r, x1: c + cs, y1: r + rs, panels, active: active || panels[0] });
  const EPS = 1e-3, MINW = 0.2, MINH = 0.25;

  const PRESETS = {
    classic: { label: 'Classic (Books left, Bible views in the middle, study tools right, search below)', layout: {
      v: 3,
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 1, ['cmt']), A(3, 1, 1, 2, ['lib', 'study']), A(1, 2, 2, 1, ['search', 'bsearch'])],
      floats: [], hidden: [] } },
    tabs: { label: 'Compact (Bible views in the middle, everything else as tabs on the right)', layout: {
      v: 3,
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 3, ['bv0']), A(3, 0, 1, 3, ['lib', 'cmt', 'search', 'bsearch', 'study'], 'lib')],
      floats: [], hidden: [] } },
    study: { label: 'Word study (commentary and library side by side below)', layout: {
      v: 3,
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 2, ['search', 'bsearch', 'study'], 'search'), A(1, 2, 1, 1, ['cmt']), A(2, 2, 2, 1, ['lib'])],
      floats: [], hidden: [] } },
    reading: { label: 'Reading (Bible views only; panels hidden)', layout: {
      v: 3,
      areas: [A(0, 0, 4, 3, ['bv0'])],
      floats: [], hidden: ['tree', 'cmt', 'lib', 'study', 'search', 'bsearch'] } }
  };

  /* ------------------------------------------------------------ registry & state */
  function register(p) { PANELS.set(p.id, p); p.el.classList.add('dpanel'); p.el.dataset.panel = p.id; }

  const covers = (a, r, c) => c + 0.5 > a.x0 + EPS && c + 0.5 < a.x1 - EPS && r + 0.5 > a.y0 + EPS && r + 0.5 < a.y1 - EPS;
  const areaAt = (lay, r, c) => lay.areas.find(a => covers(a, r, c));
  const free = (lay, r, c) => !areaAt(lay, r, c);
  const same = (a, b) => Math.abs(a - b) < EPS;
  const ovl = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);                 // length two ranges share
  const hit = (a, b) => ovl(a.x0, a.x1, b.x0, b.x1) > EPS && ovl(a.y0, a.y1, b.y0, b.y1) > EPS;
  const wOf = a => a.x1 - a.x0, hOf = a => a.y1 - a.y0;

  /** a saved v1 layout (left / right / bottom zones around the Bible views) becomes a grid layout */
  function fromV1(old) {
    const out = { v: 3, areas: [], floats: old.floats || [], hidden: old.hidden || [] };
    const put = (col, list) => list.forEach((g, i) => out.areas.push(A(col, Math.min(i, 2), 1, i === list.length - 1 ? 3 - Math.min(i, 2) : 1, g.panels.filter(x => x !== 'compare'), g.active)));
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
  /** 0.6.2 layouts: cells with column / row weights → rectangles */
  function fromV2(old) {
    const edges = (w, n) => { const f = Array.from({ length: n }, (_, i) => Math.max(0.15, +(w || [])[i] || 1)); const t = f.reduce((x, y) => x + y, 0); let acc = 0; return [0, ...f.map(v => (acc += v * n / t))]; };
    const xs = edges(old.cols, NC), ys = edges(old.rows, NR);
    const ix = (v, n) => Math.max(0, Math.min(n, v | 0));
    return { v: 3, floats: old.floats, hidden: old.hidden, areas: (old.areas || []).map(a => ({ x0: xs[ix(a.c, NC)], y0: ys[ix(a.r, NR)], x1: xs[ix((a.c | 0) + (a.cs | 0 || 1), NC)], y1: ys[ix((a.r | 0) + (a.rs | 0 || 1), NR)], panels: a.panels, active: a.active })) };
  }

  /** make any stored layout safe: unknown panels dropped, missing panels put back where they belong */
  function normalize(lay) {
    let out = lay && lay.v === 3 && Array.isArray(lay.areas) ? clone(lay) : lay && lay.v === 2 && Array.isArray(lay.areas) ? fromV2(clone(lay)) : lay && lay.v === 1 && lay.zones ? fromV1(lay) : clone(PRESETS.classic.layout);
    const seen = new Set();
    const known = id => PANELS.has(id) || (isBible(id) && !PANELS.size);
    const keep = list => (list || []).filter(id => known(id) && !seen.has(id) && seen.add(id));
    const num = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || 0));
    const okAreas = [];
    for (const a of out.areas || []) {
      const r = { x0: num(a.x0, 0, NC), y0: num(a.y0, 0, NR), x1: num(a.x1, 0, NC), y1: num(a.y1, 0, NR), panels: a.panels, active: a.active };
      if (r.x1 - r.x0 < MINW - EPS || r.y1 - r.y0 < MINH - EPS || okAreas.some(o => hit(o, r))) continue; // too small, or on top of another area
      okAreas.push(r);
    }
    out.areas = okAreas.map(a => ({ ...a, panels: keep(a.panels) })).filter(a => a.panels.length);
    delete out.cols; delete out.rows; out.v = 3;
    for (const a of out.areas) if (!a.panels.includes(a.active)) a.active = a.panels[0];
    out.floats = (out.floats || []).map(f => ({ panels: keep(f.panels), active: f.active, x: +f.x || 80, y: +f.y || 80, w: +f.w || 360, h: +f.h || 320 })).filter(f => f.panels.length);
    for (const f of out.floats) if (!f.panels.includes(f.active)) f.active = f.panels[0];
    out.hidden = keep(out.hidden);
    for (const id of PANELS.keys()) if (!seen.has(id)) placeHome(out, id, true); // e.g. a panel new in this version, or a new Bible view
    return out;
  }

  /** a one-cell area at [r, c], trimmed so it never overlaps an area that was dragged to odd sizes; false when no room */
  function tryCell(lay, id, r, c) {
    if (!free(lay, r, c)) return false;
    const n = { x0: c, y0: r, x1: c + 1, y1: r + 1 }; const cx = c + 0.5, cy = r + 0.5;
    for (const a of lay.areas) {
      if (!hit(a, n)) continue;
      if (a.x1 <= cx) n.x0 = Math.max(n.x0, a.x1); else if (a.x0 >= cx) n.x1 = Math.min(n.x1, a.x0);
      else if (a.y1 <= cy) n.y0 = Math.max(n.y0, a.y1); else n.y1 = Math.min(n.y1, a.y0);
    }
    if (n.x1 - n.x0 < MINW || n.y1 - n.y0 < MINH || lay.areas.some(a => hit(a, n))) return false;
    lay.areas.push({ ...n, panels: [id], active: id }); return true;
  }
  /** the new area takes up to one cell from the right / bottom edge of an area that is big enough to share */
  function splitOff(lay, a, id) {
    if (wOf(a) > 1 + EPS) { const w = Math.min(1, wOf(a) / 2); a.x1 -= w; lay.areas.push({ x0: a.x1, y0: a.y0, x1: a.x1 + w, y1: a.y1, panels: [id], active: id }); return true; }
    if (hOf(a) > 1 + EPS) { const h = Math.min(1, hOf(a) / 2); a.y1 -= h; lay.areas.push({ x0: a.x0, y0: a.y1, x1: a.x1, y1: a.y1 + h, panels: [id], active: id }); return true; }
    return false;
  }

  /** where a new Bible view goes: it takes half of the area of the Bible view it follows, else a free cell, else a tab */
  function placeBible(lay, id, quiet) {
    const bvArea = [...lay.areas].reverse().find(a => a.panels.some(isBible));
    if (bvArea) {
      if (splitOff(lay, bvArea, id)) return;
      for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (tryCell(lay, id, r, c)) return;
      bvArea.panels.push(id); if (!quiet) bvArea.active = id; return;
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (tryCell(lay, id, r, c)) return;
    if (lay.areas.length) lay.areas[0].panels.push(id); else lay.areas.push(A(0, 0, 4, 3, [id]));
  }

  /** where a panel goes when it is shown again: its own place in the classic layout, else beside what is there */
  function placeHome(lay, id, quiet) {
    if (isBible(id)) return placeBible(lay, id, quiet);
    const home = PRESETS.classic.layout.areas.find(a => a.panels.includes(id));
    if (home) {
      const mate = lay.areas.find(a => Math.abs(a.x0 - home.x0) < 0.5 && Math.abs(a.y0 - home.y0) < 0.5);
      if (mate) { mate.panels.push(id); if (!quiet) mate.active = id; return; }
      if (!lay.areas.some(a => hit(a, home))) { lay.areas.push({ x0: home.x0, y0: home.y0, x1: home.x1, y1: home.y1, panels: [id], active: id }); return; }
    }
    for (let r = 0; r < NR; r++) for (let c = NC - 1; c >= 0; c--) if (tryCell(lay, id, r, c)) return;
    const last = lay.areas[lay.areas.length - 1]; if (last) { last.panels.push(id); if (!quiet) last.active = id; } else lay.areas.push(A(0, 0, 4, 3, [id]));
  }

  /** a closed area leaves a hole: the neighbours along one whole side grow into it (if they fit it exactly) */
  function fillHole(lay, h) {
    if (lay.areas.some(a => hit(a, h))) return;
    const sides = [
      [a => same(a.x1, h.x0) && ovl(a.y0, a.y1, h.y0, h.y1) > EPS, a => a.y0 >= h.y0 - EPS && a.y1 <= h.y1 + EPS, a => { a.x1 = h.x1; }, h.y1 - h.y0],
      [a => same(a.x0, h.x1) && ovl(a.y0, a.y1, h.y0, h.y1) > EPS, a => a.y0 >= h.y0 - EPS && a.y1 <= h.y1 + EPS, a => { a.x0 = h.x0; }, h.y1 - h.y0],
      [a => same(a.y1, h.y0) && ovl(a.x0, a.x1, h.x0, h.x1) > EPS, a => a.x0 >= h.x0 - EPS && a.x1 <= h.x1 + EPS, a => { a.y1 = h.y1; }, h.x1 - h.x0],
      [a => same(a.y0, h.y1) && ovl(a.x0, a.x1, h.x0, h.x1) > EPS, a => a.x0 >= h.x0 - EPS && a.x1 <= h.x1 + EPS, a => { a.y0 = h.y0; }, h.x1 - h.x0]
    ];
    for (const [touch, inside, grow, len] of sides) {
      const ns = lay.areas.filter(touch);
      if (!ns.length || !ns.every(inside)) continue;
      const cover = ns.reduce((t, a) => t + (touch === sides[0][0] || touch === sides[1][0] ? hOf(a) : wOf(a)), 0);
      if (Math.abs(cover - len) < 0.02) { ns.forEach(grow); return; }
    }
  }

  function locate(id) {
    if (!L) return null;
    for (let i = 0; i < L.areas.length; i++) if (L.areas[i].panels.includes(id)) return { area: true, ai: i, g: L.areas[i] };
    for (let i = 0; i < L.floats.length; i++) if (L.floats[i].panels.includes(id)) return { float: true, fi: i, g: L.floats[i] };
    if (L.hidden.includes(id)) return { hidden: true };
    return null;
  }

  /** takes a panel out of where it is; an emptied area is closed and its neighbours grow into the hole (unless keepHole: then the hole is returned) */
  function detach(id, keepHole) {
    const at = locate(id); if (!at) return null;
    if (at.hidden) { L.hidden = L.hidden.filter(x => x !== id); return null; }
    const g = at.g; g.panels = g.panels.filter(x => x !== id);
    if (g.active === id) g.active = g.panels[0];
    if (!g.panels.length) {
      if (at.float) L.floats.splice(at.fi, 1);
      else { L.areas.splice(at.ai, 1); const h = { x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }; if (keepHole) return h; fillHole(L, h); }
    }
    return null;
  }

  function isVisible(id) {
    const at = locate(id); return !!at && !at.hidden && at.g.active === id && !(focusMode && !at.float && !at.g.panels.some(isBible));
  }

  /* ------------------------------------------------------------ rendering */
  let holder;
  let view = { x: 0, y: 0, w: NC, h: NR };   // the part of the 4×3 area the shown areas are stretched over
  let groupEls = [], gutEls = [], cornerEls = [];
  const pct = (v, o, n) => ((v - o) / n * 100);
  /** put every area and divider where the layout says (also while a divider is dragged) */
  function place() {
    const V = view;
    for (const { el, a } of groupEls) {
      Object.assign(el.style, { left: `calc(${pct(a.x0, V.x, V.w)}% + 3px)`, top: `calc(${pct(a.y0, V.y, V.h)}% + 3px)`,
        width: `calc(${(a.x1 - a.x0) / V.w * 100}% - 6px)`, height: `calc(${(a.y1 - a.y0) / V.h * 100}% - 6px)` });
    }
    for (const { el, a, xs, ys } of cornerEls) { el.style.left = `calc(${pct(a[xs], V.x, V.w)}% - 7px)`; el.style.top = `calc(${pct(a[ys], V.y, V.h)}% - 7px)`; }
    for (const gt of gutEls) {
      const { el, a, b, col, free } = gt;
      if (free) { // an edge with nothing beside it: a handle to pull it out into the empty space (or push it in)
        const f = free;
        if (f === 'x0' || f === 'x1') Object.assign(el.style, { left: `calc(${pct(a[f], V.x, V.w)}% - 3px)`, width: '6px', top: `calc(${pct(a.y0, V.y, V.h)}% + 3px)`, height: `calc(${(a.y1 - a.y0) / V.h * 100}% - 6px)` });
        else Object.assign(el.style, { top: `calc(${pct(a[f], V.y, V.h)}% - 3px)`, height: '6px', left: `calc(${pct(a.x0, V.x, V.w)}% + 3px)`, width: `calc(${(a.x1 - a.x0) / V.w * 100}% - 6px)` });
        continue;
      }
      if (col) { const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1); Object.assign(el.style, { left: `calc(${pct(a.x1, V.x, V.w)}% - 3px)`, width: '6px', top: `calc(${pct(y0, V.y, V.h)}% + 3px)`, height: `calc(${(y1 - y0) / V.h * 100}% - 6px)` }); }
      else { const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1); Object.assign(el.style, { top: `calc(${pct(a.y1, V.y, V.h)}% - 3px)`, height: '6px', left: `calc(${pct(x0, V.x, V.w)}% + 3px)`, width: `calc(${(x1 - x0) / V.w * 100}% - 6px)` }); }
    }
  }
  function render() {
    const wb = $('#workbench'); const grid = $('#grid');
    const scroll = new Map();
    for (const p of PANELS.values()) { scroll.set(p.id, p.el.scrollTop); holder.appendChild(p.el); }
    grid.innerHTML = ''; groupEls = []; gutEls = []; cornerEls = [];
    const shown = L.areas.filter(a => a.panels.some(id => PANELS.has(id))).filter(a => !focusMode || a.panels.some(isBible));
    if (focusMode && shown.length) { // reading focus: the Bible views grow over the whole workbench
      const x = Math.min(...shown.map(a => a.x0)), y = Math.min(...shown.map(a => a.y0));
      view = { x, y, w: Math.max(...shown.map(a => a.x1)) - x, h: Math.max(...shown.map(a => a.y1)) - y };
    } else view = { x: 0, y: 0, w: NC, h: NR };
    for (const a of shown) {
      const el = groupEl(a, { area: true });
      grid.appendChild(el); groupEls.push({ el, a });
    }
    // a divider sits on every edge two areas share; it moves only those two areas (and any area that would otherwise be overrun)
    for (const a of shown) for (const b of shown) {
      if (a !== b && same(a.x1, b.x0) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS) addGut(grid, a, b, true);
      if (a !== b && same(a.y1, b.y0) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS) addGut(grid, a, b, false);
    }
    if (!maxed) for (const a of shown) { // edges that face empty space can be dragged too
      const touching = (e, f) => shown.some(b => b !== a && (f === 'x1' ? same(b.x0, a.x1) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS : f === 'x0' ? same(b.x1, a.x0) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS : f === 'y1' ? same(b.y0, a.y1) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS : same(b.y1, a.y0) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS));
      for (const f of ['x0', 'x1', 'y0', 'y1']) {
        const bound = f === 'x0' ? a.x0 < EPS : f === 'x1' ? a.x1 > NC - EPS : f === 'y0' ? a.y0 < EPS : a.y1 > NR - EPS;
        if (!bound && !touching(a, f)) addFreeGut(grid, a, f);
      }
    }
    if (!maxed) for (const a of shown) if (a.panels.some(isBible)) for (const ys of ['y0', 'y1']) for (const xs of ['x0', 'x1']) addCorner(grid, a, xs, ys);
    place();
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
    div.classList.toggle('solo', ids.length === 1);
    if (maxed && ids.includes(maxed)) div.classList.add('max');
    const tabs = ids.map(id => {
      const p = PANELS.get(id);
      return `<button class="dtab${id === act0 ? ' on' : ''}" data-id="${id}" style="--tc: var(--cap-${p.cap})" title="${esc(p.title)} — drag to move">${ic(p.icon, 15)}<span>${esc(p.title)}</span></button>`;
    }).join('');
    div.innerHTML = `<header class="dcap">
        <span class="dgrip" title="Drag to move this panel">${ic('grip', 14)}</span>
        <div class="dtabs">${tabs}</div>
        ${ids.some(isBible) && window.TimotheosNav ? `<span class="dnav">${TimotheosNav.barHtml()}</span>` : ''}
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

  /** what moves when the line at `at` (x when col, else y) is dragged: the areas on its low and high side, and how far it may go.
   *  Areas that merely touch a little are left alone (the line may not run into them); bigger neighbours move with it. */
  function edgePlan(col, at, lo, hi) {
    const meets = (p, q, t) => (col ? ovl(p.y0, p.y1, q.y0, q.y1) : ovl(p.x0, p.x1, q.x0, q.x1)) > t;
    const ends = o => col ? same(o.x1, at) : same(o.y1, at), starts = o => col ? same(o.x0, at) : same(o.y0, at);
    for (let grew = true; grew;) {
      grew = false;
      for (const o of L.areas) {
        if (ends(o) && !lo.has(o) && [...hi].some(q => meets(o, q, 0.3))) { lo.add(o); grew = true; }
        if (starts(o) && !hi.has(o) && [...lo].some(q => meets(o, q, 0.3))) { hi.add(o); grew = true; }
      }
    }
    let to = col ? NC : NR, from = 0;
    const min = col ? MINW : MINH, lo0 = o => (col ? o.x0 : o.y0), hi1 = o => (col ? o.x1 : o.y1);
    if (lo.size) from = Math.max(...[...lo].map(lo0)) + min;
    if (hi.size) to = Math.min(...[...hi].map(hi1)) - min;
    for (const o of L.areas) {
      if (lo.has(o) || hi.has(o)) continue;
      if (starts(o) && [...lo].some(q => meets(o, q, EPS))) to = Math.min(to, at);       // a sliver neighbour: do not run into it
      if (ends(o) && [...hi].some(q => meets(o, q, EPS))) from = Math.max(from, at);
      if (!hi.size && lo0(o) >= at - EPS && [...lo].some(q => meets(o, q, EPS))) to = Math.min(to, lo0(o)); // free space beyond: up to the next area
      if (!lo.size && hi1(o) <= at + EPS && [...hi].some(q => meets(o, q, EPS))) from = Math.max(from, hi1(o));
    }
    return { col, at, lo, hi, from, to };
  }
  const snap = () => L.areas.map(o => [o, o.x0, o.y0, o.x1, o.y1]);
  const unsnap = sn => { for (const [o, x0, y0, x1, y1] of sn) Object.assign(o, { x0, y0, x1, y1 }); };
  const overlapping = () => L.areas.some((p, i) => L.areas.some((q, j) => j > i && hit(p, q)));
  const setEdge = (pl, x) => { for (const o of pl.lo) o[pl.col ? 'x1' : 'y1'] = x; for (const o of pl.hi) o[pl.col ? 'x0' : 'y0'] = x; };
  /** drag one or two edges (a divider: one; a corner: two) with the mouse; nothing is ever allowed to overlap */
  function dragEdges(e, plans, el) {
    e.preventDefault(); el.setPointerCapture(e.pointerId);
    const rect = $('#grid').getBoundingClientRect(); const start = [e.clientX, e.clientY];
    const per = plans.map(pl => pl.col ? view.w / rect.width : view.h / rect.height);
    const move = ev => {
      const want = plans.map((pl, k) => {
        let x = pl.at + ((pl.col ? ev.clientX - start[0] : ev.clientY - start[1]) * per[k]);
        if (!pl.lo.size || !pl.hi.size) { // an edge in free space snaps to the edge of the area facing it
          for (const o of L.areas) { if (pl.lo.has(o) || pl.hi.has(o)) continue; for (const c of pl.col ? [o.x0, o.x1] : [o.y0, o.y1]) if (Math.abs(c - x) < 0.07) x = c; }
        }
        return Math.max(pl.from, Math.min(pl.to, x));
      });
      const sn = snap();
      const tryIt = idx => { unsnap(sn); idx.forEach(k => { if (want[k] >= plans[k].from - EPS && want[k] <= plans[k].to + EPS) setEdge(plans[k], want[k]); }); return !overlapping(); };
      const all = plans.map((_, k) => k);
      if (!tryIt(all) && !(plans.length > 1 && all.some(k => tryIt([k])))) unsnap(sn);
      place();
    };
    const up = () => { for (const t of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) el.removeEventListener(t, t === 'pointermove' ? move : up); saveSoon(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  }

  /** the draggable line between two touching areas: it moves the edge of those two only, not the rest of the row / column */
  function addGut(grid, a, b, col) {
    const s = document.createElement('div');
    s.className = 'gut ' + (col ? 'h' : 'v'); s.title = col ? 'Drag to change the width of the panels beside this line' : 'Drag to change the height of the panels above and below this line';
    grid.appendChild(s); gutEls.push({ el: s, a, b, col });
    s.addEventListener('pointerdown', e => dragEdges(e, [edgePlan(col, col ? a.x1 : a.y1, new Set([a]), new Set([b]))], s));
  }

  function addFreeGut(grid, a, f) {
    const col = f[0] === 'x'; const s = document.createElement('div');
    s.className = 'gut ' + (col ? 'h' : 'v'); s.title = 'Drag to move this edge into the empty space';
    grid.appendChild(s); gutEls.push({ el: s, a, b: null, col, free: f });
    const hiSide = f === 'x1' || f === 'y1';
    s.addEventListener('pointerdown', e => dragEdges(e, [edgePlan(col, a[f], new Set(hiSide ? [a] : []), new Set(hiSide ? [] : [a]))], s));
  }

  /** a corner handle of a Bible view's area: it moves the two edges of that corner; the panels next to them adjust */
  function addCorner(grid, a, xs, ys) {
    const s = document.createElement('div');
    s.className = 'dcorner ' + (ys === 'y0' ? 't' : 'b') + (xs === 'x0' ? 'l' : 'r');
    s.title = 'Drag to resize from this corner';
    grid.appendChild(s); cornerEls.push({ el: s, a, xs, ys });
    s.addEventListener('pointerdown', e => {
      const hiX = xs === 'x1', hiY = ys === 'y1', cx = a[xs], cy = a[ys];
      const loX = new Set(hiX ? [a] : []), hiXs = new Set(hiX ? [] : [a]), loY = new Set(hiY ? [a] : []), hiYs = new Set(hiY ? [] : [a]);
      // the neighbours along both edges come along, and so does the area diagonally across the corner (a crossing moves as a whole)
      for (const o of L.areas) {
        if (o === a) continue;
        const onX = hiX ? same(o.x0, cx) : same(o.x1, cx), onY = hiY ? same(o.y0, cy) : same(o.y1, cy);
        if (onX && onY) { (hiX ? hiXs : loX).add(o); (hiY ? hiYs : loY).add(o); }
      }
      dragEdges(e, [edgePlan(true, cx, loX, hiXs), edgePlan(false, cy, loY, hiYs)], s);
    });
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

  /** put a panel into grid cell [r, c]: a free cell gets its own area, a one-cell area gets a tab, a bigger area gives up its edge */
  function placeAt(lay, id, r, c) {
    const a = areaAt(lay, r, c);
    if (!a) { if (!tryCell(lay, id, r, c)) { const near = lay.areas.find(o => o.x0 < c + 1 && o.x1 > c && o.y0 < r + 1 && o.y1 > r); if (near) { near.panels.push(id); near.active = id; } else lay.areas.push(A(c, r, 1, 1, [id])); } return; }
    const cx = c + 0.5, cy = r + 0.5, w = wOf(a), h = hOf(a);
    if (w > 1 + EPS && cx > a.x1 - 1) { const k = Math.min(1, w / 2); a.x1 -= k; lay.areas.push({ x0: a.x1, y0: a.y0, x1: a.x1 + k, y1: a.y1, panels: [id], active: id }); }
    else if (w > 1 + EPS && cx < a.x0 + 1) { const k = Math.min(1, w / 2); a.x0 += k; lay.areas.push({ x0: a.x0 - k, y0: a.y0, x1: a.x0, y1: a.y1, panels: [id], active: id }); }
    else if (h > 1 + EPS && cy > a.y1 - 1) { const k = Math.min(1, h / 2); a.y1 -= k; lay.areas.push({ x0: a.x0, y0: a.y1, x1: a.x1, y1: a.y1 + k, panels: [id], active: id }); }
    else if (h > 1 + EPS && cy < a.y0 + 1) { const k = Math.min(1, h / 2); a.y0 += k; lay.areas.push({ x0: a.x0, y0: a.y0 - k, x1: a.x1, y1: a.y0, panels: [id], active: id }); }
    else { a.panels.push(id); a.active = id; }
  }

  /** move a panel to a drop target */
  function dropOn(id, t) {
    if (t.cell) {
      const own = areaAt(L, t.cell[0], t.cell[1]);
      if (own && own.panels.includes(id)) return; // onto its own area
      const hole = detach(id, true); maxed = null;
      placeAt(L, id, t.cell[0], t.cell[1]);
      if (hole) fillHole(L, hole);
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
    const ids = [...PANELS.keys()].filter(isBible).sort((a, b) => +a.slice(2) - +b.slice(2)).filter(id => { const at = locate(id); return at && at.area && at.g.panels.every(isBible); });
    if (ids.length < 2) return;
    const areas = [...new Set(ids.map(id => locate(id).g))];
    const box = { x0: Math.min(...areas.map(a => a.x0)), y0: Math.min(...areas.map(a => a.y0)), x1: Math.max(...areas.map(a => a.x1)), y1: Math.max(...areas.map(a => a.y1)) };
    for (const id of ids) { const at = locate(id); at.g.panels = at.g.panels.filter(x => x !== id); if (at.g.active === id) at.g.active = at.g.panels[0]; }
    L.areas = L.areas.filter(a => a.panels.length);
    const n = ids.length;
    // widen / heighten the box while the space next to it is free, up to one cell per view
    const room = b => !L.areas.some(a => hit(a, b));
    if (kind === 'cols') while (box.x1 - box.x0 < n - EPS && box.x1 + 1 <= NC + EPS && room({ x0: box.x1, x1: Math.min(NC, box.x1 + 1), y0: box.y0, y1: box.y1 })) box.x1 = Math.min(NC, box.x1 + 1);
    else while (box.y1 - box.y0 < n - EPS && box.y1 + 1 <= NR + EPS && room({ y0: box.y1, y1: Math.min(NR, box.y1 + 1), x0: box.x0, x1: box.x1 })) box.y1 = Math.min(NR, box.y1 + 1);
    ids.forEach((id, i) => {
      const f0 = i / n, f1 = (i + 1) / n;
      L.areas.push(kind === 'cols'
        ? { x0: box.x0 + (box.x1 - box.x0) * f0, x1: box.x0 + (box.x1 - box.x0) * f1, y0: box.y0, y1: box.y1, panels: [id], active: id }
        : { y0: box.y0 + (box.y1 - box.y0) * f0, y1: box.y0 + (box.y1 - box.y0) * f1, x0: box.x0, x1: box.x1, panels: [id], active: id });
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
