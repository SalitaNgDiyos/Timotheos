/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
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
  let opts = {};                     // { onSave(layout), onActivate(id), onClose(id), onModeChange(), zoomable, onZoom, onSkin, snapGrid }
  let focusMode = false;
  let detachMode = false;            // when true: panel edges shrink independently & closing/moving leaves empty space open
  let snapGridMode = false;          // when true: dragging shows the 4x3 snap grid instead of smart empty-space/panel zones
  let maxed = null;                  // id of the panel whose group is maximized
  const ic = (n, s) => (typeof TimotheosIcons !== 'undefined' ? TimotheosIcons.icon(n, s) : '');
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const isBible = id => /^bv\d+$/.test(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = (c, r, cs, rs, panels, active) => ({ x0: c, y0: r, x1: c + cs, y1: r + rs, panels, active: active || panels[0] });
  const EPS = 1e-3, MINW = 0.2, MINH = 0.25, MIN_SPACE_PX = 96; // 1 CSS inch = 96px
  // the layout designer / "Split" (0.6.124): at most 6 columns × 3 rows, and only as many as fit the space on screen
  const PICK_MAXC = 6, PICK_MAXR = 3, PICK_MIN_W = 200, PICK_MIN_H = 150;
  let nextAddRect = null;

  // no tabs (0.6.131): every panel has its own space; a panel not in a layout is closed (reopen it from View → Layout & Panels…)
  const PRESETS = {
    classic: { label: 'Classic (Books left, Bible views in the middle, study tools right, search below)', layout: {
      v: 3,
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 1, ['cmt']), A(3, 1, 1, 1, ['lib']), A(3, 2, 1, 1, ['study']), A(1, 2, 1, 1, ['search']), A(2, 2, 1, 1, ['bsearch'])],
      floats: [], hidden: [] } },
    study: { label: 'Word study (commentary and library side by side below)', layout: {
      v: 3,
      areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 2, 2, ['bv0']), A(3, 0, 1, 1, ['search']), A(3, 1, 1, 1, ['study']), A(1, 2, 1, 1, ['cmt']), A(2, 2, 2, 1, ['lib'])],
      floats: [], hidden: ['bsearch'] } },
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
    for (const id of PANELS.keys()) if (!seen.has(id)) { if (PANELS.get(id).startHidden) out.hidden.push(id); else placeHome(out, id, true); } // e.g. a panel new in this version, or a new Bible view (a panel that starts hidden waits in Layout & Panels)
    untab(out);
    out.slots = Array.isArray(out.slots) ? out.slots.filter(s => s && s.x1 - s.x0 > EPS && s.y1 - s.y0 > EPS && !out.areas.some(a => hit(a, s))) : [];
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

  /** screen pixels of one column / one row (4 × 3 grid), to split an area along its longer side */
  function unitPx() {
    const wb = typeof document !== 'undefined' && document.getElementById('workbench'); const r = wb && wb.getBoundingClientRect ? wb.getBoundingClientRect() : null;
    return r && r.width > 50 && r.height > 50 ? { cw: r.width / NC, rh: r.height / NR } : { cw: 1, rh: 1 };
  }
  /** the new panel takes half of area a (the right or bottom half, along its longer side); false when the halves would be too small */
  function splitHalf(lay, a, id) {
    const u = unitPx(); const across = wOf(a) * u.cw >= hOf(a) * u.rh;
    const tryX = () => { if (wOf(a) < MINW * 2 - EPS) return false; const mid = (a.x0 + a.x1) / 2; lay.areas.push({ x0: mid, y0: a.y0, x1: a.x1, y1: a.y1, panels: [id], active: id }); a.x1 = mid; return true; };
    const tryY = () => { if (hOf(a) < MINH * 2 - EPS) return false; const mid = (a.y0 + a.y1) / 2; lay.areas.push({ x0: a.x0, y0: mid, x1: a.x1, y1: a.y1, panels: [id], active: id }); a.y1 = mid; return true; };
    return across ? (tryX() || tryY()) : (tryY() || tryX());
  }
  /** the biggest area that can be split in half gives half to the panel; else it floats (never a tab) */
  function splitLargest(lay, id) {
    const u = unitPx();
    for (const a of [...lay.areas].sort((p, q) => wOf(q) * u.cw * hOf(q) * u.rh - wOf(p) * u.cw * hOf(p) * u.rh)) if (splitHalf(lay, a, id)) return true;
    (lay.floats = lay.floats || []).push({ panels: [id], active: id, x: 120 + 30 * lay.floats.length, y: 100 + 30 * lay.floats.length, w: 380, h: 360 });
    return true;
  }
  /** no tabs: a group of several panels is split into one space per panel (along its longer side); a floating window keeps one panel and the others float beside it */
  function untab(lay) {
    const u = unitPx(); const out = [];
    for (const a of lay.areas) {
      const ps = a.panels; if (ps.length <= 1) { out.push(a); continue; }
      const n = ps.length, wpx = wOf(a) * u.cw, hpx = hOf(a) * u.rh;
      let cols = wpx >= hpx ? n : 1, rows = wpx >= hpx ? 1 : n;
      if (wOf(a) / cols < MINW - EPS || hOf(a) / rows < MINH - EPS) { cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols); }
      const order = [a.active, ...ps.filter(x => x !== a.active)].filter(x => ps.includes(x));
      order.forEach((id, k) => {
        const c = k % cols, r = Math.floor(k / cols); const last = k === n - 1;
        const x0 = a.x0 + wOf(a) * c / cols, x1 = last && rows > 1 ? a.x1 : a.x0 + wOf(a) * (c + 1) / cols;
        const y0 = a.y0 + hOf(a) * r / rows, y1 = a.y0 + hOf(a) * (r + 1) / rows;
        out.push({ x0, y0, x1, y1, panels: [id], active: id });
      });
    }
    lay.areas = out;
    const fl = [];
    for (const f of lay.floats || []) {
      if (f.panels.length <= 1) { fl.push(f); continue; }
      const order = [f.active, ...f.panels.filter(x => x !== f.active)];
      order.forEach((id, k) => fl.push({ ...f, panels: [id], active: id, x: f.x + 30 * k, y: f.y + 30 * k }));
    }
    lay.floats = fl;
    return lay;
  }

  /** where a new Bible view goes: it takes half of the area of the Bible view it follows, else a free cell, else a tab */
  function placeBible(lay, id, quiet) {
    const bvArea = [...lay.areas].reverse().find(a => a.panels.some(isBible));
    if (bvArea) {
      if (splitOff(lay, bvArea, id)) return;
      for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (tryCell(lay, id, r, c)) return;
      if (splitHalf(lay, bvArea, id)) return;
      splitLargest(lay, id); return;
    }
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (tryCell(lay, id, r, c)) return;
    if (lay.areas.length) splitLargest(lay, id); else lay.areas.push(A(0, 0, 4, 3, [id]));
  }

  /** where a panel goes when it is shown again: its own place in the classic layout, else beside what is there */
  function placeHome(lay, id, quiet) {
    if (isBible(id)) return placeBible(lay, id, quiet);
    const home = PRESETS.classic.layout.areas.find(a => a.panels.includes(id));
    if (home && !lay.areas.some(a => hit(a, home))) { lay.areas.push({ x0: home.x0, y0: home.y0, x1: home.x1, y1: home.y1, panels: [id], active: id }); return; }
    for (let r = 0; r < NR; r++) for (let c = NC - 1; c >= 0; c--) if (tryCell(lay, id, r, c)) return;
    if (!lay.areas.length) { lay.areas.push(A(0, 0, 4, 3, [id])); return; }
    const there = home && areaAt(lay, Math.floor((home.y0 + home.y1) / 2), Math.floor((home.x0 + home.x1) / 2));   // never a tab: it shares the area at its classic place
    if (there && splitHalf(lay, there, id)) return;
    splitLargest(lay, id);
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

  function locateIn(lay, id) {
    if (!lay) return null;
    for (let i = 0; i < (lay.areas || []).length; i++) if (lay.areas[i].panels.includes(id)) return { area: true, ai: i, g: lay.areas[i] };
    for (let i = 0; i < (lay.floats || []).length; i++) if (lay.floats[i].panels.includes(id)) return { float: true, fi: i, g: lay.floats[i] };
    if ((lay.hidden || []).includes(id)) return { hidden: true };
    return null;
  }
  function locate(id) { return locateIn(L, id); }

  /** takes a panel out of `lay`; an emptied area is closed and its neighbours grow into the hole (unless keepHole: then the hole is returned) */
  function detachPanelFromLayout(lay, id, keepHole) {
    const at = locateIn(lay, id); if (!at) return null;
    if (at.hidden) { lay.hidden = lay.hidden.filter(x => x !== id); return null; }
    const g = at.g; g.panels = g.panels.filter(x => x !== id);
    if (g.active === id) g.active = g.panels[0];
    if (!g.panels.length) {
      if (at.float) lay.floats.splice(at.fi, 1);
      else { lay.areas.splice(at.ai, 1); const h = { x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }; if (keepHole) return h; fillHole(lay, h); }
    }
    return null;
  }

  /** takes a panel out of where it is; leaves the hole open when detachMode is on (or keepHole is passed) */
  function detach(id, keepHole) {
    return detachPanelFromLayout(L, id, keepHole == null ? detachMode : keepHole);
  }

  /** find all maximal non-overlapping empty rectangles (>= minW x minH) on the 4x3 workbench */
  function findEmptySpaces(areas, minW = MINW, minH = MINH) {
    const list = areas || [];
    const uniq = vals => {
      const s = vals.slice().sort((a, b) => a - b);
      const out = [];
      for (const v of s) if (!out.length || v - out[out.length - 1] > EPS) out.push(v);
      return out;
    };
    const xs = uniq([0, NC, ...list.flatMap(a => [a.x0, a.x1])]);
    const ys = uniq([0, NR, ...list.flatMap(a => [a.y0, a.y1])]);
    const nx = xs.length - 1, ny = ys.length - 1;
    if (nx <= 0 || ny <= 0) return [];
    const occ = Array.from({ length: ny }, (_, iy) => {
      const ym = (ys[iy] + ys[iy + 1]) / 2;
      return Array.from({ length: nx }, (_, ix) => {
        const xm = (xs[ix] + xs[ix + 1]) / 2;
        return list.some(a => xm > a.x0 + EPS && xm < a.x1 - EPS && ym > a.y0 + EPS && ym < a.y1 - EPS);
      });
    });
    const spaces = [];
    for (;;) {
      let best = null;
      for (let iy0 = 0; iy0 < ny; iy0++) {
        for (let ix0 = 0; ix0 < nx; ix0++) {
          if (occ[iy0][ix0]) continue;
          let maxIx1 = nx;
          for (let iy1 = iy0 + 1; iy1 <= ny; iy1++) {
            let ix1 = ix0;
            while (ix1 < maxIx1 && !occ[iy1 - 1][ix1]) ix1++;
            if (ix1 === ix0) break;
            maxIx1 = ix1;
            const w = xs[ix1] - xs[ix0], h = ys[iy1] - ys[iy0];
            const area = w * h;
            if (!best || area > best.area + EPS) best = { ix0, iy0, ix1, iy1, x0: xs[ix0], y0: ys[iy0], x1: xs[ix1], y1: ys[iy1], area };
          }
        }
      }
      if (!best) break;
      for (let iy = best.iy0; iy < best.iy1; iy++) for (let ix = best.ix0; ix < best.ix1; ix++) occ[iy][ix] = true;
      if (best.x1 - best.x0 >= minW - EPS && best.y1 - best.y0 >= minH - EPS) {
        spaces.push({ x0: best.x0, y0: best.y0, x1: best.x1, y1: best.y1 });
      }
    }
    return spaces;
  }

  /** filter empty spaces to those at least minPxW x minPxH (default 96x96 = 1in x 1in) on the workbench */
  function filterSpacesByMinPx(spaces, wbW, wbH, v = { x: 0, y: 0, w: NC, h: NR }, minPxW = MIN_SPACE_PX, minPxH = MIN_SPACE_PX) {
    if (!wbW || !wbH) return [];
    return (spaces || []).filter(sp => {
      const pxW = (sp.x1 - sp.x0) / v.w * wbW;
      const pxH = (sp.y1 - sp.y0) / v.h * wbH;
      return pxW >= minPxW - 0.5 && pxH >= minPxH - 0.5;
    });
  }

  /** build an evenly divided cols x rows blueprint grid across the 4x3 workbench (1..4 cols, 1..3 rows) */
  /** cols × rows empty slots filling `box` (the whole workbench when not given); up to 6 × 3 */
  function createBlueprintSlots(cols, rows, box) {
    const b = box || { x0: 0, y0: 0, x1: NC, y1: NR };
    const c = Math.max(1, Math.min(PICK_MAXC, parseInt(cols, 10) || 1));
    const r = Math.max(1, Math.min(PICK_MAXR, parseInt(rows, 10) || 1));
    const cw = (b.x1 - b.x0) / c, rh = (b.y1 - b.y0) / r;
    const slots = [];
    for (let ry = 0; ry < r; ry++) {
      for (let cx = 0; cx < c; cx++) {
        slots.push({ x0: +(b.x0 + cx * cw).toFixed(4), y0: +(b.y0 + ry * rh).toFixed(4), x1: +(cx === c - 1 ? b.x1 : b.x0 + (cx + 1) * cw).toFixed(4), y1: +(ry === r - 1 ? b.y1 : b.y0 + (ry + 1) * rh).toFixed(4) });
      }
    }
    return slots;
  }
  /** how many columns and rows (at most 6 × 3) fit a space of w × h pixels, each panel at least 200 × 150 px */
  function fitGrid(wPx, hPx) {
    return { cols: Math.max(1, Math.min(PICK_MAXC, Math.floor(wPx / PICK_MIN_W))), rows: Math.max(1, Math.min(PICK_MAXR, Math.floor(hPx / PICK_MIN_H))) };
  }
  /** empty places that touch each other form a block; each block with its outline box and its columns × rows */
  function slotGroups(slots) {
    const left = [...slots], out = [];
    const touch = (a, b) => (ovl(a.x0, a.x1, b.x0, b.x1) > EPS && (same(a.y1, b.y0) || same(a.y0, b.y1))) || (ovl(a.y0, a.y1, b.y0, b.y1) > EPS && (same(a.x1, b.x0) || same(a.x0, b.x1)));
    while (left.length) {
      const grp = [left.shift()];
      for (let k = 0; k < grp.length; k++) for (let j = left.length - 1; j >= 0; j--) if (touch(grp[k], left[j])) grp.push(left.splice(j, 1)[0]);
      const box = { x0: Math.min(...grp.map(a => a.x0)), y0: Math.min(...grp.map(a => a.y0)), x1: Math.max(...grp.map(a => a.x1)), y1: Math.max(...grp.map(a => a.y1)) };
      const uniq = arr => [...new Set(arr.map(v => v.toFixed(3)))].length;
      out.push({ slots: grp, box, dims: { cols: uniq(grp.map(a => a.x0)), rows: uniq(grp.map(a => a.y0)) } });
    }
    return out;
  }
  /** the size on screen of a part of the workbench */
  function boxPx(box) {
    const wb = typeof document !== 'undefined' && $('#workbench'); const r = wb ? wb.getBoundingClientRect() : { width: 1200, height: 700 };
    const b = box || { x0: 0, y0: 0, x1: NC, y1: NR };
    return { w: (b.x1 - b.x0) / view.w * r.width, h: (b.y1 - b.y0) / view.h * r.height };
  }

  /** live empty spaces on the workbench that are at least 1in x 1in (96px x 96px); returns blueprint slots first when present */
  function findAvailableSpaces(minPxW = MIN_SPACE_PX, minPxH = MIN_SPACE_PX) {
    const wb = typeof document !== 'undefined' && $('#workbench');
    if (!L || !wb) return [];
    const r = wb.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const shownAreas = L.areas.filter(a => a.panels.some(id => PANELS.has(id)));
    const slots = (L.slots || []).filter(s => !shownAreas.some(a => hit(a, s)));
    const validSlots = filterSpacesByMinPx(slots, r.width, r.height, view, minPxW, minPxH);
    const gMinW = Math.min(MINW, (minPxW / r.width) * view.w);
    const gMinH = Math.min(MINH, (minPxH / r.height) * view.h);
    const occAreas = shownAreas.concat(slots);
    const freeRest = filterSpacesByMinPx(findEmptySpaces(occAreas, gMinW, gMinH), r.width, r.height, view, minPxW, minPxH);
    return validSlots.concat(freeRest);
  }

  /** simulate dropping `id` onto a smart drop target (empty space, panel left/right/top/bottom/center, or outer workbench edge) */
  function computeSmartDrop(lay, id, t, keepHole) {
    if (!lay || !t) return null;
    const next = clone(lay);
    if (t.space) {
      const sp = { x0: +t.space.x0, y0: +t.space.y0, x1: +t.space.x1, y1: +t.space.y1 };
      if (sp.x1 - sp.x0 <= EPS || sp.y1 - sp.y0 <= EPS) return null;
      const hole = detachPanelFromLayout(next, id, true);
      if (next.areas.some(a => hit(a, sp))) return null;
      next.areas.push({ x0: sp.x0, y0: sp.y0, x1: sp.x1, y1: sp.y1, panels: [id], active: id });
      if (Array.isArray(next.slots)) next.slots = next.slots.filter(s => !hit(s, sp));
      if (!keepHole && hole) fillHole(next, hole);
      return { layout: next, rect: sp, mode: 'space' };
    }
    if (t.areaIndex != null && t.zone) {
      const origA = (lay.areas || [])[t.areaIndex];
      if (!origA) return null;
      if (origA.panels.length === 1 && origA.panels[0] === id) return null;
      if (t.zone === 'center' && origA.panels.includes(id)) return null;
      const hole = detachPanelFromLayout(next, id, true);
      const a = next.areas.find(o => same(o.x0, origA.x0) && same(o.y0, origA.y0) && same(o.x1, origA.x1) && same(o.y1, origA.y1));
      if (!a) return null;
      let rect, mode = 'split';
      if (t.zone === 'center') {
        return null;   // no tabs: a panel is never dropped on top of another
      } else if (t.zone === 'left' || t.zone === 'right') {
        if (wOf(a) < MINW * 2 - EPS) {
          return null;
        } else {
          const mid = (a.x0 + a.x1) / 2;
          if (t.zone === 'left') { rect = { x0: a.x0, y0: a.y0, x1: mid, y1: a.y1 }; a.x0 = mid; }
          else { rect = { x0: mid, y0: a.y0, x1: a.x1, y1: a.y1 }; a.x1 = mid; }
          next.areas.push({ ...rect, panels: [id], active: id });
        }
      } else if (t.zone === 'top' || t.zone === 'bottom') {
        if (hOf(a) < MINH * 2 - EPS) {
          return null;
        } else {
          const mid = (a.y0 + a.y1) / 2;
          if (t.zone === 'top') { rect = { x0: a.x0, y0: a.y0, x1: a.x1, y1: mid }; a.y0 = mid; }
          else { rect = { x0: a.x0, y0: mid, x1: a.x1, y1: a.y1 }; a.y1 = mid; }
          next.areas.push({ ...rect, panels: [id], active: id });
        }
      } else return null;
      if (!keepHole && hole) fillHole(next, hole);
      return { layout: next, rect, mode };
    }
    if (t.outer) {
      const hole = detachPanelFromLayout(next, id, true);
      if (!keepHole && hole) fillHole(next, hole);
      let rect = null;
      if (t.outer === 'left') {
        let s = 0.85;
        for (const a of next.areas) if (a.x0 < s - EPS) s = Math.min(s, a.x1 - MINW);
        if (s < MINW - EPS) return null;
        for (const a of next.areas) if (a.x0 < s - EPS) a.x0 = s;
        rect = { x0: 0, y0: 0, x1: s, y1: NR };
      } else if (t.outer === 'right') {
        let s = 0.85;
        for (const a of next.areas) if (a.x1 > NC - s + EPS) s = Math.min(s, NC - (a.x0 + MINW));
        if (s < MINW - EPS) return null;
        for (const a of next.areas) if (a.x1 > NC - s + EPS) a.x1 = NC - s;
        rect = { x0: NC - s, y0: 0, x1: NC, y1: NR };
      } else if (t.outer === 'top') {
        let s = 0.75;
        for (const a of next.areas) if (a.y0 < s - EPS) s = Math.min(s, a.y1 - MINH);
        if (s < MINH - EPS) return null;
        for (const a of next.areas) if (a.y0 < s - EPS) a.y0 = s;
        rect = { x0: 0, y0: 0, x1: NC, y1: s };
      } else if (t.outer === 'bottom') {
        let s = 0.75;
        for (const a of next.areas) if (a.y1 > NR - s + EPS) s = Math.min(s, NR - (a.y0 + MINH));
        if (s < MINH - EPS) return null;
        for (const a of next.areas) if (a.y1 > NR - s + EPS) a.y1 = NR - s;
        rect = { x0: 0, y0: NR - s, x1: NC, y1: NR };
      }
      if (!rect) return null;
      next.areas.push({ ...rect, panels: [id], active: id });
      return { layout: next, rect, mode: 'edge' };
    }
    return null;
  }

  /** simulate dropping `id` onto 4x3 grid cell [r, c]: fills empty/partial-empty cell first, else carves an edge of a spanning panel, else tabs */
  function computeGridDrop(lay, id, r, c, keepHole) {
    if (!lay) return null;
    const cell = { x0: c, y0: r, x1: c + 1, y1: r + 1 };
    const own = areaAt(lay, r, c);
    if (own && own.panels.length === 1 && own.panels[0] === id && wOf(own) <= 1 + EPS && hOf(own) <= 1 + EPS) return null;
    const next = clone(lay);
    const hole = detachPanelFromLayout(next, id, true);

    // 1. If any free space intersects this 4x3 cell, place into the largest free sub-rectangle inside the cell
    let bestFree = null;
    for (const sp of findEmptySpaces(next.areas)) {
      const ix0 = Math.max(sp.x0, cell.x0), iy0 = Math.max(sp.y0, cell.y0);
      const ix1 = Math.min(sp.x1, cell.x1), iy1 = Math.min(sp.y1, cell.y1);
      const w = ix1 - ix0, h = iy1 - iy0;
      if (w >= MINW - EPS && h >= MINH - EPS) {
        const ar = w * h;
        if (!bestFree || ar > bestFree.ar + EPS) bestFree = { x0: ix0, y0: iy0, x1: ix1, y1: iy1, ar };
      }
    }
    if (bestFree) {
      const rect = { x0: bestFree.x0, y0: bestFree.y0, x1: bestFree.x1, y1: bestFree.y1 };
      next.areas.push({ ...rect, panels: [id], active: id });
      if (!keepHole && hole) fillHole(next, hole);
      return { layout: next, rect, mode: 'space' };
    }

    // 2. Cell is covered by existing panel(s): pick the area at cell center (or largest overlap)
    let a = areaAt(next, r, c);
    if (!a) {
      let bestOvl = 0;
      for (const o of next.areas) {
        const ow = Math.max(0, ovl(o.x0, o.x1, cell.x0, cell.x1));
        const oh = Math.max(0, ovl(o.y0, o.y1, cell.y0, cell.y1));
        if (ow * oh > bestOvl) { bestOvl = ow * oh; a = o; }
      }
    }
    if (!a) {
      next.areas.push({ ...cell, panels: [id], active: id });
      if (!keepHole && hole) fillHole(next, hole);
      return { layout: next, rect: cell, mode: 'space' };
    }
    const cx = c + 0.5, cy = r + 0.5, w = wOf(a), h = hOf(a);
    let rect, mode = 'split';
    if (w > 1 + EPS && cx >= a.x1 - 1 - EPS) {
      const cut = Math.max(a.x0 + MINW, Math.min(a.x1 - MINW, c));
      rect = { x0: cut, y0: a.y0, x1: a.x1, y1: a.y1 }; a.x1 = cut;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (w > 1 + EPS && cx <= a.x0 + 1 + EPS) {
      const cut = Math.max(a.x0 + MINW, Math.min(a.x1 - MINW, c + 1));
      rect = { x0: a.x0, y0: a.y0, x1: cut, y1: a.y1 }; a.x0 = cut;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (h > 1 + EPS && cy >= a.y1 - 1 - EPS) {
      const cut = Math.max(a.y0 + MINH, Math.min(a.y1 - MINH, r));
      rect = { x0: a.x0, y0: cut, x1: a.x1, y1: a.y1 }; a.y1 = cut;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (h > 1 + EPS && cy <= a.y0 + 1 + EPS) {
      const cut = Math.max(a.y0 + MINH, Math.min(a.y1 - MINH, r + 1));
      rect = { x0: a.x0, y0: a.y0, x1: a.x1, y1: cut }; a.y0 = cut;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (w > 1 + EPS) {
      const mid = (a.x0 + a.x1) / 2;
      rect = { x0: mid, y0: a.y0, x1: a.x1, y1: a.y1 }; a.x1 = mid;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (h > 1 + EPS) {
      const mid = (a.y0 + a.y1) / 2;
      rect = { x0: a.x0, y0: mid, x1: a.x1, y1: a.y1 }; a.y1 = mid;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (w >= MINW * 2 - EPS && w >= h) {   // a one-cell panel: it gives half (never a tab)
      const mid = (a.x0 + a.x1) / 2;
      rect = { x0: mid, y0: a.y0, x1: a.x1, y1: a.y1 }; a.x1 = mid;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else if (h >= MINH * 2 - EPS) {
      const mid = (a.y0 + a.y1) / 2;
      rect = { x0: a.x0, y0: mid, x1: a.x1, y1: a.y1 }; a.y1 = mid;
      next.areas.push({ ...rect, panels: [id], active: id });
    } else {
      return null;   // too small to split, and never a tab
    }
    if (!keepHole && hole) fillHole(next, hole);
    return { layout: next, rect, mode };
  }

  /** build a real miniature SVG thumbnail of a layout's actual panels and floating windows */
  function capColorFor(id) {
    if (PANELS.has(id)) return `var(--cap-${PANELS.get(id).cap}, #3b82f6)`;
    if (isBible(id) || id === 'tree') return 'var(--cap-bible, #3b82f6)';
    if (id === 'cmt') return 'var(--cap-cmt, #8b5cf6)';
    if (id === 'lib') return 'var(--cap-lib, #10b981)';
    if (id === 'study') return 'var(--cap-study, #f59e0b)';
    if (id === 'search' || id === 'bsearch') return 'var(--cap-search, #ec4899)';
    return 'var(--accent, #3b82f6)';
  }
  function thumbnailSvg(lay, { width = 56, height = 42 } = {}) {
    const src = lay && lay.v === 3 && Array.isArray(lay.areas) ? lay
      : lay && lay.v === 2 && Array.isArray(lay.areas) ? fromV2(lay)
      : lay && lay.v === 1 && lay.zones ? fromV1(lay)
      : PRESETS.classic.layout;
    const W = 64, H = 48, pad = 2, iw = W - pad * 2, ih = H - pad * 2, gap = 1.1;
    const rects = [];
    for (const a of (src.areas || [])) {
      const x = pad + (a.x0 / NC) * iw + gap / 2;
      const y = pad + (a.y0 / NR) * ih + gap / 2;
      const w = Math.max(2, ((a.x1 - a.x0) / NC) * iw - gap);
      const h = Math.max(2, ((a.y1 - a.y0) / NR) * ih - gap);
      const act = a.active || (a.panels && a.panels[0]) || 'bv0';
      const cap = capColorFor(act);
      const capH = Math.min(3.8, h * 0.35);
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="1.4" fill="var(--card, #2a3140)" stroke="var(--line, #475569)" stroke-width="0.7"/>`);
      rects.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${capH.toFixed(1)}" rx="1.1" fill="${cap}"/>`);
      if ((a.panels || []).length > 1 && w > 8) {
        const nTabs = Math.min(a.panels.length, 4);
        for (let i = 0; i < nTabs; i++) {
          const tx = x + 1.4 + i * 2.8;
          if (tx + 1.6 < x + w - 1) rects.push(`<rect x="${tx.toFixed(1)}" y="${(y + 1.1).toFixed(1)}" width="1.8" height="1.5" rx="0.5" fill="rgba(255,255,255,0.75)"/>`);
        }
      }
      if (isBible(act) && w > 10 && h > 11) {
        const lx = x + 2.2, lw = Math.max(3, w - 4.4);
        for (let li = 0; li < 3; li++) {
          const ly = y + capH + 2.8 + li * 2.8;
          if (ly < y + h - 1.5) rects.push(`<line x1="${lx.toFixed(1)}" y1="${ly.toFixed(1)}" x2="${(lx + lw * (li === 2 ? 0.65 : 1)).toFixed(1)}" y2="${ly.toFixed(1)}" stroke="var(--muted, #94a3b8)" stroke-opacity="0.55" stroke-width="1" stroke-linecap="round"/>`);
        }
      }
    }
    if ((src.floats || []).length) {
      rects.push(`<rect x="34" y="10" width="22" height="17" rx="1.8" fill="var(--card, #2a3140)" stroke="var(--accent, #3b82f6)" stroke-width="1.1"/><rect x="34" y="10" width="22" height="3.5" rx="1.2" fill="var(--accent, #3b82f6)"/>`);
    }
    return `<svg class="laythumb" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="3" fill="var(--bg, #181d27)" stroke="var(--line, #475569)" stroke-width="0.9"/>${rects.join('')}</svg>`;
  }

  let notifyRaf = 0;
  function notifyLayoutChange(immediate) {
    if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
    const fire = () => { notifyRaf = 0; window.dispatchEvent(new CustomEvent('timotheos:dock-change')); };
    if (immediate) { if (notifyRaf) { cancelAnimationFrame(notifyRaf); notifyRaf = 0; } fire(); return; }
    if (!notifyRaf) notifyRaf = requestAnimationFrame(fire);
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
      // Adjacent panels sit flush edge-to-edge with zero gap (the 6px divider stays centered on the shared seam)
      Object.assign(el.style, { left: `${pct(a.x0, V.x, V.w)}%`, top: `${pct(a.y0, V.y, V.h)}%`,
        width: `${(a.x1 - a.x0) / V.w * 100}%`, height: `${(a.y1 - a.y0) / V.h * 100}%` });
    }
    for (const { el, a, xs, ys } of cornerEls) { el.style.left = `calc(${pct(a[xs], V.x, V.w)}% - 7px)`; el.style.top = `calc(${pct(a[ys], V.y, V.h)}% - 7px)`; }
    for (const gt of gutEls) {
      const { el, a, b, col, free } = gt;
      if (free) { // an edge with nothing beside it (or an outer border in detachMode): drag inward or outward
        const f = free;
        const p = pct(a[f], V.x, V.w), py = pct(a[f], V.y, V.h);
        if (f === 'x0' || f === 'x1') {
          const left = (f === 'x0' && a.x0 < EPS) ? '0px' : (f === 'x1' && a.x1 > NC - EPS) ? 'calc(100% - 6px)' : `calc(${p}% - 3px)`;
          Object.assign(el.style, { left, width: '6px', top: `calc(${pct(a.y0, V.y, V.h)}% + 3px)`, height: `calc(${(a.y1 - a.y0) / V.h * 100}% - 6px)` });
        } else {
          const top = (f === 'y0' && a.y0 < EPS) ? '0px' : (f === 'y1' && a.y1 > NR - EPS) ? 'calc(100% - 6px)' : `calc(${py}% - 3px)`;
          Object.assign(el.style, { top, height: '6px', left: `calc(${pct(a.x0, V.x, V.w)}% + 3px)`, width: `calc(${(a.x1 - a.x0) / V.w * 100}% - 6px)` });
        }
        continue;
      }
      if (col) { const y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1); Object.assign(el.style, { left: `calc(${pct(a.x1, V.x, V.w)}% - 3px)`, width: '6px', top: `calc(${pct(y0, V.y, V.h)}% + 3px)`, height: `calc(${(y1 - y0) / V.h * 100}% - 6px)` }); }
      else { const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1); Object.assign(el.style, { top: `calc(${pct(a.y1, V.y, V.h)}% - 3px)`, height: '6px', left: `calc(${pct(x0, V.x, V.w)}% + 3px)`, width: `calc(${(x1 - x0) / V.w * 100}% - 6px)` }); }
    }
  }
  /** the two links an empty place shows: Add Panel (a list of every panel) and Split Space (only while it is big enough to split) */
  function emptyLinks(el, sp) {
    const px = boxPx(sp), fit = fitGrid(px.w, px.h), box = { x0: sp.x0, y0: sp.y0, x1: sp.x1, y1: sp.y1 };
    el.innerHTML = `<div class="dlinks"><button type="button" class="dlink dadd">${ic('plus', 15)}Add Panel</button>${fit.cols * fit.rows > 1 ? `<button type="button" class="dlink dsplit" title="Divide this empty space into several places (up to ${fit.cols} × ${fit.rows} here)">${ic('grid', 15)}Split Space</button>` : ''}</div>`;
    el.querySelector('.dadd').onclick = e => { e.stopPropagation(); openAddMenu(e.currentTarget, box); };
    const sb = el.querySelector('.dsplit'); if (sb) sb.onclick = e => { e.stopPropagation(); openLayoutDesigner(sb, box); };
  }
  /** the list of panels under Add Panel; the one chosen goes into exactly this space and no other panel moves or resizes */
  function openAddMenu(anchor, box) {
    document.querySelectorAll('.dadd-menu').forEach(x => x.remove());
    const kinds = [{ id: 'newbv', title: 'Bible View' }, ...[...PANELS.values()].filter(p => !isBible(p.id)).map(p => ({ id: p.id, title: p.title || p.id }))];
    const m = document.createElement('div'); m.className = 'menu dadd-menu';
    m.innerHTML = kinds.map(k => `<button type="button" data-id="${k.id}">${esc(k.title)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(r.left, window.innerWidth - m.offsetWidth - 4)) + 'px';
    m.style.top = Math.max(4, Math.min(r.bottom + 4, window.innerHeight - m.offsetHeight - 4)) + 'px';
    const off = () => { m.remove(); document.removeEventListener('mousedown', away, true); document.removeEventListener('keydown', key, true); };
    const away = e => { if (!m.contains(e.target)) off(); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); off(); } };
    setTimeout(() => { document.addEventListener('mousedown', away, true); document.addEventListener('keydown', key, true); }, 0);
    m.querySelectorAll('button').forEach(b => b.onclick = async () => {
      off();
      if (b.dataset.id === 'newbv') { if (window.TimotheosNewViewIn) await window.TimotheosNewViewIn(box); }
      else placeInSpace(b.dataset.id, box);
    });
    const f = m.querySelector('button'); if (f) f.focus();
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
    const activeSlots = (!maxed && !focusMode && Array.isArray(L.slots)) ? L.slots.filter(s => !shown.some(a => hit(a, s))) : [];
    if (activeSlots.length) {
      for (const sp of activeSlots) {
        const sl = document.createElement('div');
        sl.className = 'dslot';
        Object.assign(sl.style, {
          left: `${pct(sp.x0, view.x, view.w)}%`,
          top: `${pct(sp.y0, view.y, view.h)}%`,
          width: `${(sp.x1 - sp.x0) / view.w * 100}%`,
          height: `${(sp.y1 - sp.y0) / view.h * 100}%`
        });
        emptyLinks(sl, sp);
        grid.appendChild(sl);
      }
      // Draggable dotted edges between adjacent blueprint slots
      const seenV = new Set(), seenH = new Set();
      for (const a of activeSlots) for (const b of activeSlots) {
        if (a === b) continue;
        if (same(a.x1, b.x0) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS) {
          const k = a.x1.toFixed(3);
          if (!seenV.has(k)) { seenV.add(k); addSlotGut(grid, activeSlots, true, a.x1); }
        }
        if (same(a.y1, b.y0) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS) {
          const k = a.y1.toFixed(3);
          if (!seenH.has(k)) { seenH.add(k); addSlotGut(grid, activeSlots, false, a.y1); }
        }
      }
      // each block of empty places has its own "Change grid…": it changes only that block, at once (0.6.125)
      for (const grp of slotGroups(activeSlots)) {
        const t = document.createElement('div');
        t.className = 'dslot-tools';
        Object.assign(t.style, { left: `${pct((grp.box.x0 + grp.box.x1) / 2, view.x, view.w)}%`, top: `calc(${pct(grp.box.y0, view.y, view.h)}% + 8px)` });
        t.innerHTML = `<button type="button" data-ld="pick" title="Change how many places this block has">${ic('grid', 14)}Change grid…</button><button type="button" data-ld="clear" title="Remove these empty places">${ic('close', 13)}</button>`;
        t.querySelector('[data-ld="pick"]').onclick = e => openLayoutDesigner(e.currentTarget, grp.box, grp.dims);
        t.querySelector('[data-ld="clear"]').onclick = () => { L.slots = (L.slots || []).filter(x => !grp.slots.includes(x)); commit(); };
        grid.appendChild(t);
      }
      const bar = document.createElement('div');
      bar.className = 'ld-bar';
      bar.innerHTML = `<span>Drag dotted lines to resize · Drag panels from <b>Layout &amp; Panels</b></span><button type="button" data-ld="clear">Clear all empty places</button>`;
      bar.querySelector('[data-ld="clear"]').onclick = () => { L.slots = []; commit(); };
      grid.appendChild(bar);
    }
    if (shown.length === 0 && !activeSlots.length && !L.floats.length && !document.documentElement.classList.contains('mobile')) {
      const box = document.createElement('div');
      box.className = 'ld-empty-cta';
      box.innerHTML = `<button type="button" class="ld-cta-btn" id="designLayoutBtn">${ic('grid', 20)}<span>Design your layout</span></button><p class="ld-cta-sub">Pick a 1×1 up to 6×3 grid (as many as fit the window), adjust the dotted edges, then drag panels in from <b>Panels</b>.</p>`;
      box.querySelector('#designLayoutBtn').onclick = e => openLayoutDesigner(e.currentTarget);
      grid.appendChild(box);
    } else if (!maxed && !focusMode) {   // an empty space (a closed panel leaves one) shows the links Add Panel and Split Space, in both modes
      for (const sp of findEmptySpaces(shown.concat(activeSlots))) {
        const em = document.createElement('div');
        em.className = 'dempty';
        Object.assign(em.style, {
          left: `calc(${pct(sp.x0, view.x, view.w)}% + 3px)`,
          top: `calc(${pct(sp.y0, view.y, view.h)}% + 3px)`,
          width: `calc(${(sp.x1 - sp.x0) / view.w * 100}% - 6px)`,
          height: `calc(${(sp.y1 - sp.y0) / view.h * 100}% - 6px)`
        });
        emptyLinks(em, sp);
        grid.appendChild(em);
      }
    }
    for (const a of shown) {
      const el = groupEl(a, { area: true });
      grid.appendChild(el); groupEls.push({ el, a });
    }
    // a divider sits on every edge two areas share; in detachMode dragging inward shrinks only the side dragged into
    for (const a of shown) for (const b of shown) {
      if (a !== b && same(a.x1, b.x0) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS) addGut(grid, a, b, true);
      if (a !== b && same(a.y1, b.y0) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS) addGut(grid, a, b, false);
    }
    if (!maxed) for (const a of shown) { // edges that face empty space (and outer borders when detachMode is on) can be dragged too
      const touching = (e, f) => shown.some(b => b !== a && (f === 'x1' ? same(b.x0, a.x1) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS : f === 'x0' ? same(b.x1, a.x0) && ovl(a.y0, a.y1, b.y0, b.y1) > EPS : f === 'y1' ? same(b.y0, a.y1) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS : same(b.y1, a.y0) && ovl(a.x0, a.x1, b.x0, b.x1) > EPS));
      for (const f of ['x0', 'x1', 'y0', 'y1']) {
        const bound = f === 'x0' ? a.x0 < EPS : f === 'x1' ? a.x1 > NC - EPS : f === 'y0' ? a.y0 < EPS : a.y1 > NR - EPS;
        if ((!bound || detachMode) && !touching(a, f)) addFreeGut(grid, a, f);
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
    document.body.classList.toggle('detach-mode', detachMode);
    const fb = $('#focusBtn'); if (fb) fb.classList.toggle('on', focusMode);
    const db = $('#detachBtn'); if (db) db.classList.toggle('on', detachMode);
    if (opts.onRender) opts.onRender();
    notifyLayoutChange(true);
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
      return `<button class="dtab${id === act0 ? ' on' : ''}" data-id="${id}" style="--tc: var(--cap-${p.cap})" title="${esc(p.title)}">${ic(p.icon, 15)}<span>${esc(p.title)}</span></button>`;
    }).join('');
    div.innerHTML = `<header class="dcap">
        <div class="dtabs">${tabs}</div>
        ${ids.some(isBible) ? ((typeof document !== 'undefined' && document.documentElement.classList.contains('mobile')) ? (window.TimotheosNav ? `<span class="dnav">${TimotheosNav.barHtml()}</span>` : '') : `<button type="button" class="bvbible" data-a="bible" data-bv-idx="${isBible(act0) ? +act0.slice(2) : +ids.find(isBible).slice(2)}" title="Click to choose another Bible for this view · double-click to rename this view">${esc(PANELS.get(isBible(act0) ? act0 : ids.find(isBible)).title)}</button>`) : ''}
        <span class="dbtns">
          <button class="dbtn" data-act="skin" title="This panel's own fonts and colours">${ic('palette', 14)}</button>
          <button class="dbtn dzoom" data-act="zoom-" title="Smaller (Ctrl + mouse wheel down)">${ic('textDown', 15)}</button>
          <button class="dbtn dzoom" data-act="zoom+" title="Larger (Ctrl + mouse wheel up)">${ic('textUp', 15)}</button>
          <button class="dbtn" data-act="float" title="${where.float ? 'Dock again' : 'Float as a window'}">${ic(where.float ? 'dockIn' : 'float', 14)}</button>
          ${where.float ? '' : `<button class="dbtn" data-act="max" title="${div.classList.contains('max') ? 'Restore' : 'Maximize'}">${ic(div.classList.contains('max') ? 'restore' : 'max', 14)}</button>`}
          <button class="dbtn dmore" data-act="more" title="More: fonts and colours, size, float, maximize">${ic('dots', 14)}</button>
          <button class="dbtn" data-act="close" title="Close (reopen from the Panels menu)">${ic('close', 14)}</button>
        </span></header><div class="dbody"></div>`;
    const body = div.querySelector('.dbody');
    for (const id of ids) { const p = PANELS.get(id); body.appendChild(p.el); p.el.classList.toggle('hidden', id !== act0); }
    div.querySelector('.dcap').addEventListener('pointerdown', e => startDrag(e, div, g));
    div.querySelector('.dcap').addEventListener('dblclick', e => { if (!e.target.closest('.dbtn, .bvbible, .bvrename')) toggleFloat(g.active); });
    div.querySelectorAll('.dtab').forEach(b => b.addEventListener('click', () => activate(b.dataset.id)));
    div.querySelectorAll('.dbtn').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'close') { if (!(opts.onClose && opts.onClose(act0))) hide(act0); return; }
      if (a === 'more') return moreMenu(div, b);
      if (a === 'skin') { if (opts.onSkin) opts.onSkin(act0, b); return; }
      if (a === 'float') toggleFloat(act0);
      if (a === 'zoom-' || a === 'zoom+') { if (opts.onZoom) opts.onZoom(act0, a === 'zoom+' ? 1 : -1); }
      if (a === 'max') { maxed = maxed && ids.includes(maxed) ? null : act0; render(); }
    }));
    fitWatch(div);
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
  function clearSelection() {
    try { const s = window.getSelection && window.getSelection(); if (s && s.rangeCount) s.removeAllRanges(); } catch (_) {}
  }
  function dragEdges(e, plans, el, rerenderOnUp) {
    e.preventDefault(); e.stopPropagation();
    document.body.classList.add('resizing');
    clearSelection();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    const rect = $('#grid').getBoundingClientRect(); const start = [e.clientX, e.clientY];
    const per = plans.map(pl => pl.col ? view.w / rect.width : view.h / rect.height);
    let done = false;
    const move = ev => {
      if (done) return;
      if (ev.buttons === 0) { up(); return; }
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
      place(); notifyLayoutChange(false);
    };
    const up = () => {
      if (done) return;
      done = true;
      document.body.classList.remove('resizing');
      clearSelection();
      for (const t of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) el.removeEventListener(t, t === 'pointermove' ? move : up);
      for (const t of ['pointerup', 'pointercancel', 'mouseup', 'blur']) window.removeEventListener(t, up);
      if (rerenderOnUp || detachMode) render();
      else notifyLayoutChange(true);
      saveSoon();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    for (const t of ['pointerup', 'pointercancel', 'mouseup', 'blur']) window.addEventListener(t, up);
  }

  /** in Detach edges mode: dragging a shared seam left/up shrinks only `a` inward; dragging right/down shrinks only `b` inward, opening empty space between them */
  function dragSeamDetached(e, a, b, col, el) {
    e.preventDefault(); e.stopPropagation();
    document.body.classList.add('resizing');
    clearSelection();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    const rect = $('#grid').getBoundingClientRect();
    const start = col ? e.clientX : e.clientY;
    const per = col ? view.w / rect.width : view.h / rect.height;
    const at = col ? a.x1 : a.y1;
    const min = col ? MINW : MINH;
    const aMin = (col ? a.x0 : a.y0) + min;
    const bMax = (col ? b.x1 : b.y1) - min;
    let side = 0; // -1 = shrink a inward, +1 = shrink b inward
    let done = false;
    const move = ev => {
      if (done) return;
      if (ev.buttons === 0) { up(); return; }
      const deltaPx = (col ? ev.clientX : ev.clientY) - start;
      if (!side && Math.abs(deltaPx) < 2) return;
      if (!side) side = deltaPx < 0 ? -1 : 1;
      const sn = snap();
      const target = at + deltaPx * per;
      if (side < 0) {
        const nx = Math.max(aMin, Math.min(at, target));
        a[col ? 'x1' : 'y1'] = nx;
      } else {
        const nx = Math.min(bMax, Math.max(at, target));
        b[col ? 'x0' : 'y0'] = nx;
      }
      if (overlapping()) unsnap(sn);
      place(); notifyLayoutChange(false);
    };
    const up = () => {
      if (done) return;
      done = true;
      document.body.classList.remove('resizing');
      clearSelection();
      for (const t of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) el.removeEventListener(t, t === 'pointermove' ? move : up);
      for (const t of ['pointerup', 'pointercancel', 'mouseup', 'blur']) window.removeEventListener(t, up);
      render(); saveSoon();
    };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    for (const t of ['pointerup', 'pointercancel', 'mouseup', 'blur']) window.addEventListener(t, up);
  }

  /** the draggable line between two touching areas: moves both together normally, or detaches whichever side you drag inward in Detach edges mode */
  function addGut(grid, a, b, col) {
    const s = document.createElement('div');
    s.className = 'gut ' + (col ? 'h' : 'v') + (detachMode ? ' detach' : '');
    s.title = detachMode
      ? (col ? 'Detach mode: drag left to shrink the left panel, or right to shrink the right panel and create empty space' : 'Detach mode: drag up to shrink the top panel, or down to shrink the bottom panel and create empty space')
      : (col ? 'Drag to change the width of the panels beside this line' : 'Drag to change the height of the panels above and below this line');
    grid.appendChild(s); gutEls.push({ el: s, a, b, col });
    s.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    s.addEventListener('pointerdown', e => {
      if (detachMode) dragSeamDetached(e, a, b, col, s);
      else dragEdges(e, [edgePlan(col, col ? a.x1 : a.y1, new Set([a]), new Set([b]))], s, false);
    });
  }

  function addFreeGut(grid, a, f) {
    const col = f[0] === 'x'; const s = document.createElement('div');
    s.className = 'gut ' + (col ? 'h' : 'v') + ' free'; s.title = 'Drag to resize this edge freely into or out of empty space';
    grid.appendChild(s); gutEls.push({ el: s, a, b: null, col, free: f });
    const hiSide = f === 'x1' || f === 'y1';
    s.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    s.addEventListener('pointerdown', e => dragEdges(e, [edgePlan(col, a[f], new Set(hiSide ? [a] : []), new Set(hiSide ? [] : [a]))], s, true));
  }

  /** a corner handle of a Bible view's area: it moves the two edges of that corner; the panels next to them adjust */
  function addCorner(grid, a, xs, ys) {
    const s = document.createElement('div');
    s.className = 'dcorner ' + (ys === 'y0' ? 't' : 'b') + (xs === 'x0' ? 'l' : 'r');
    s.title = 'Drag to resize from this corner';
    grid.appendChild(s); cornerEls.push({ el: s, a, xs, ys });
    s.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    s.addEventListener('pointerdown', e => {
      const hiX = xs === 'x1', hiY = ys === 'y1', cx = a[xs], cy = a[ys];
      const loX = new Set(hiX ? [a] : []), hiXs = new Set(hiX ? [] : [a]), loY = new Set(hiY ? [a] : []), hiYs = new Set(hiY ? [] : [a]);
      // the neighbours along both edges come along, and so does the area diagonally across the corner (a crossing moves as a whole)
      for (const o of L.areas) {
        if (o === a) continue;
        const onX = hiX ? same(o.x0, cx) : same(o.x1, cx), onY = hiY ? same(o.y0, cy) : same(o.y1, cy);
        if (onX && onY) { (hiX ? hiXs : loX).add(o); (hiY ? hiYs : loY).add(o); }
      }
      dragEdges(e, [edgePlan(true, cx, loX, hiXs), edgePlan(false, cy, loY, hiYs)], s, false);
    });
  }

  function clampFloat(w) {
    const W = window.innerWidth, H = window.innerHeight;
    const x = Math.min(Math.max(0, parseInt(w.style.left)), W - 120), y = Math.min(Math.max(40, parseInt(w.style.top)), H - 60);
    w.style.left = x + 'px'; w.style.top = y + 'px';
  }

  /* ------------------------------------------------------------ dragging */
  let drag = null;
  function unbindDrag() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('pointercancel', cancelDrag);
    window.removeEventListener('blur', cancelDrag);
    window.removeEventListener('keydown', onDragKey, true);
  }
  function onDragKey(e) {
    if (e.key === 'Escape' && drag) { e.preventDefault(); e.stopPropagation(); cancelDrag(); }
  }
  function cancelDrag() {
    unbindDrag();
    const d = drag; drag = null;
    document.body.classList.remove('dragging');
    if (d && d.ghost) d.ghost.remove();
    if (d && d.isFloat && d.groupDiv) d.groupDiv.style.pointerEvents = '';
    clearTargets();
  }
  function bindDragListeners() {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('keydown', onDragKey, true);
  }

  function startDrag(e, groupDiv, g) {
    if (e.button !== 0 || e.target.closest('.dbtn') || e.target.closest('.dnav') || e.target.closest('.bvbible') || e.target.closest('.bvrename')) return;
    if (drag) cancelDrag();
    e.preventDefault();
    const tab = e.target.closest('.dtab');
    const id = tab ? tab.dataset.id : g.active;
    const isFloat = groupDiv.classList.contains('dfloat');
    drag = { id, g, groupDiv, isFloat, fromMenu: false, sx: e.clientX, sy: e.clientY, started: false, lastTgt: null, target: null,
      ox: isFloat ? e.clientX - groupDiv.offsetLeft : 0, oy: isFloat ? e.clientY - groupDiv.offsetTop : 0 };
    bindDragListeners();
  }

  /** start click+hold+drag of a panel kind from the Panels menu onto an available empty space (>= 1in x 1in) */
  function startMenuDrag(e, spec) {
    if (!e || e.button !== 0 || !spec) return false;
    if (!findAvailableSpaces().length) return false;
    if (drag) cancelDrag();
    e.preventDefault();
    drag = {
      id: spec.id, title: spec.title, icon: spec.icon, cap: spec.cap || 'bible',
      fromMenu: true, onDrop: spec.onDrop, onAfterDrop: spec.onAfterDrop,
      isFloat: false, sx: e.clientX, sy: e.clientY, started: false, lastTgt: null, target: null
    };
    bindDragListeners();
    return true;
  }

  function onMove(e) {
    if (!drag) return;
    if (e.buttons === 0) { onUp(e); return; }
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.started = true;
      document.body.classList.add('dragging');
      if (!drag.isFloat) {
        const p = drag.fromMenu ? { title: drag.title, icon: drag.icon, cap: drag.cap } : PANELS.get(drag.id);
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'dghost';
        drag.ghost.style.setProperty('--cap', `var(--cap-${p.cap})`);
        drag.ghost.innerHTML = `${ic(p.icon, 15)}<span>${esc(p.title)}</span>`;
        document.body.appendChild(drag.ghost);
      }
      showEmptySpaceTargets();
    }
    if (drag.ghost) { drag.ghost.style.left = e.clientX + 12 + 'px'; drag.ghost.style.top = e.clientY + 10 + 'px'; }
    if (drag.isFloat) {
      drag.groupDiv.style.left = e.clientX - drag.ox + 'px'; drag.groupDiv.style.top = e.clientY - drag.oy + 'px';
      drag.groupDiv.style.pointerEvents = 'none';
    }
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    const overMenu = els.some(el => el && el.id === 'panelsMenu');
    const tgt = overMenu ? null : (els.find(el => el.classList && el.classList.contains('dtarget')) || null);
    if (tgt === drag.lastTgt) return;
    drag.lastTgt = tgt;
    drag.target = tgt ? JSON.parse(tgt.dataset.t) : null;
    document.querySelectorAll('.dtarget.hot').forEach(x => x.classList.remove('hot'));
    if (tgt) tgt.classList.add('hot');
  }

  function onUp(e) {
    unbindDrag();
    const d = drag; drag = null;
    if (!d) return;
    document.body.classList.remove('dragging');
    if (d.ghost) d.ghost.remove();
    clearTargets();
    if (d.isFloat) d.groupDiv.style.pointerEvents = '';
    if (!d.started) return;
    try {
      if (d.fromMenu) {
        if (d.target && d.target.space && typeof d.onDrop === 'function') {
          Promise.resolve(d.onDrop(d.target.space)).then(() => { if (typeof d.onAfterDrop === 'function') d.onAfterDrop(); });
        }
        return;
      }
      if (d.target && d.target.space) { dropOn(d.id, d.target); return; }
      if (d.isFloat) {
        const f = d.g; f.x = d.groupDiv.offsetLeft; f.y = d.groupDiv.offsetTop; clampFloat(d.groupDiv);
        f.x = parseInt(d.groupDiv.style.left); f.y = parseInt(d.groupDiv.style.top); saveSoon(); return;
      }
      // Dropped outside any valid empty space (or over the Panels menu): cancel and keep panel safely in place
    } catch (err) {
      console.error('TimotheosDock drop error:', err);
      render();
    }
  }

  /** highlight only available empty spaces (>= 1in x 1in) with a clean green border; no 4x3 grid flash and no splitting of other panels */
  function showEmptySpaceTargets() {
    const r = $('#workbench').getBoundingClientRect();
    const layer = document.createElement('div'); layer.className = 'dlayer empty-only'; layer.id = 'dlayer';
    Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const V = view;
    for (const sp of findAvailableSpaces()) {
      const b = document.createElement('div');
      b.className = 'dtarget space';
      b.dataset.t = JSON.stringify({ space: sp });
      b.style.cssText = `left:calc(${pct(sp.x0, V.x, V.w)}% + 3px);top:calc(${pct(sp.y0, V.y, V.h)}% + 3px);width:calc(${(sp.x1 - sp.x0) / V.w * 100}% - 6px);height:calc(${(sp.y1 - sp.y0) / V.h * 100}% - 6px)`;
      b.innerHTML = `<span class="dcn">Drop here</span>`;
      layer.appendChild(b);
    }
    document.body.appendChild(layer);
  }

  /** smart drop zones: every empty space created by resizing/detaching + Left/Right/Top/Bottom/Tab zones on existing panels + outer workbench edges */
  function showSmartTargets(dragId) {
    const r = $('#workbench').getBoundingClientRect();
    const layer = document.createElement('div'); layer.className = 'dlayer smart'; layer.id = 'dlayer';
    Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const V = view;

    // 1. Empty spaces: dropping fills that exact empty space
    for (const sp of findEmptySpaces(L.areas)) {
      const b = document.createElement('div');
      b.className = 'dtarget space';
      b.dataset.t = JSON.stringify({ space: sp });
      b.style.cssText = `left:${pct(sp.x0, V.x, V.w)}%;top:${pct(sp.y0, V.y, V.h)}%;width:${(sp.x1 - sp.x0) / V.w * 100}%;height:${(sp.y1 - sp.y0) / V.h * 100}%`;
      b.innerHTML = `<span class="dcn">Empty space</span><span class="dcw">Drop to fill this space</span>`;
      layer.appendChild(b);
    }

    // 2. Existing panels: 5-zone Left / Right / Top / Bottom / Center (Tab) drop targets
    L.areas.forEach((a, ai) => {
      if (!a.panels.some(id => PANELS.has(id))) return;
      if (a.panels.length === 1 && a.panels[0] === dragId) return;
      const box = document.createElement('div');
      box.className = 'dpanelzones';
      box.style.cssText = `left:${pct(a.x0, V.x, V.w)}%;top:${pct(a.y0, V.y, V.h)}%;width:${(a.x1 - a.x0) / V.w * 100}%;height:${(a.y1 - a.y0) / V.h * 100}%`;
      const canH = wOf(a) >= MINW * 2 - EPS;
      const canV = hOf(a) >= MINH * 2 - EPS;
      const names = a.panels.filter(id => PANELS.has(id)).map(id => PANELS.get(id).title).join(', ');
      const addZ = (zone, cls, lbl) => {
        const z = document.createElement('div');
        z.className = 'dtarget zone ' + cls;
        z.dataset.t = JSON.stringify({ areaIndex: ai, zone });
        z.title = zone === 'center' ? `Add as a tab beside ${names}` : `Dock to the ${zone} of ${names}`;
        z.innerHTML = `<span>${lbl}</span>`;
        box.appendChild(z);
      };
      if (canH) { addZ('left', 'zl', 'Left'); addZ('right', 'zr', 'Right'); }
      if (canV) { addZ('top', 'zt', 'Top'); addZ('bottom', 'zb', 'Bottom'); }
      if (!a.panels.includes(dragId)) addZ('center', 'zc', 'Tab');
      layer.appendChild(box);
    });

    // 3. Outer workbench edges
    for (const [edge, cls, lbl] of [['left', 'oel', 'Left edge'], ['right', 'oer', 'Right edge'], ['top', 'oet', 'Top edge'], ['bottom', 'oeb', 'Bottom edge']]) {
      const e = document.createElement('div');
      e.className = 'dtarget oedge ' + cls;
      e.dataset.t = JSON.stringify({ outer: edge });
      e.title = `Dock along the ${lbl.toLowerCase()} of the window`;
      layer.appendChild(e);
    }

    const pv = document.createElement('div'); pv.className = 'dpreview hidden'; pv.id = 'dpreview'; layer.appendChild(pv);
    document.body.appendChild(layer);
  }

  /** the 12 areas of the 4x3 snap grid, laid over the workbench while a panel is dragged (when 4x3 snap grid toggle is on) */
  function showGridTargets() {
    const r = $('#workbench').getBoundingClientRect();
    const layer = document.createElement('div'); layer.className = 'dlayer'; layer.id = 'dlayer';
    Object.assign(layer.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    const spaces = findEmptySpaces(L.areas);
    for (let row = 0; row < NR; row++) for (let col = 0; col < NC; col++) {
      const b = document.createElement('div'); b.className = 'dtarget cell'; b.dataset.t = JSON.stringify({ cell: [row, col] });
      const hasFree = spaces.some(sp => Math.min(sp.x1, col + 1) - Math.max(sp.x0, col) >= MINW - EPS && Math.min(sp.y1, row + 1) - Math.max(sp.y0, row) >= MINH - EPS);
      const a = areaAt(L, row, col); const names = a ? a.panels.filter(id => PANELS.has(id)).map(id => PANELS.get(id).title).join(', ') : '';
      const sub = hasFree ? 'empty space' : a ? (wOf(a) > 1 + EPS || hOf(a) > 1 + EPS ? `split ${names}` : `${names} (too small to split)`) : 'empty';
      b.title = `Cell ${row + 1}·${col + 1}: ${sub}`;
      b.style.cssText = `left:${col * 25}%;top:${row * 100 / 3}%;width:25%;height:${100 / 3}%`;
      b.innerHTML = `<span class="dcn">${row + 1}·${col + 1}</span><span class="dcw">${esc(sub)}</span>`;
      layer.appendChild(b);
    }
    const pv = document.createElement('div'); pv.className = 'dpreview hidden'; pv.id = 'dpreview'; layer.appendChild(pv);
    document.body.appendChild(layer);
  }

  function simulateDrop(id, t) {
    if (!t) return null;
    if (t.space) return computeSmartDrop(L, id, t, true);
    if (t.cell) return computeGridDrop(L, id, t.cell[0], t.cell[1], true);
    return computeSmartDrop(L, id, t, true);
  }

  function showPreview(id, t) {
    const pv = $('#dpreview'); if (!pv) return;
    const sim = simulateDrop(id, t);
    if (!sim || !sim.rect) { pv.classList.add('hidden'); return; }
    const V = view, r = sim.rect;
    pv.style.left = pct(r.x0, V.x, V.w) + '%';
    pv.style.top = pct(r.y0, V.y, V.h) + '%';
    pv.style.width = ((r.x1 - r.x0) / V.w * 100) + '%';
    pv.style.height = ((r.y1 - r.y0) / V.h * 100) + '%';
    pv.classList.toggle('tabmode', sim.mode === 'tab');
    pv.classList.remove('hidden');
  }

  function clearTargets() { document.querySelectorAll('.dlayer, .dghost').forEach(x => x.remove()); }

  /** move a panel to a drop target */
  function dropOn(id, t) {
    const sim = simulateDrop(id, t);
    if (!sim || !sim.layout) return;
    L = sim.layout;
    maxed = null;
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
      const bvb = grpEl.querySelector('.dcap .bvbible');
      if (bvb && isBible(id)) { bvb.dataset.bvIdx = String(+id.slice(2)); bvb.textContent = PANELS.get(id).title; }
    } else render();
    saveSoon();
    if (opts.onActivate) opts.onActivate(id);
  }

  /** make a panel visible: reopen it if closed, leave focus mode, bring its tab to the front */
  /** shows a panel. A closed panel gets its own space: Timotheos asks first and suggests splitting the active panel (opts.near),
   *  the person may pick another panel and side, or an empty space. Resolves true when shown, false when cancelled. */
  function show(id, o) {
    o = o || {};
    if (!PANELS.has(id) || !L) return Promise.resolve(false);
    const at = locate(id);
    if (at && at.hidden) {
      const h = document.documentElement.classList;
      if (o.quiet || h.contains('sk') || h.contains('mobile') || h.contains('phone')) { L.hidden = L.hidden.filter(x => x !== id); placeHome(L, id); commit(); activate(id); return Promise.resolve(true); }
      return askPlace(id, o.near);
    }
    if (focusMode && at && !at.float && !isBible(id)) { focusMode = false; render(); }
    activate(id);
    return Promise.resolve(true);
  }

  /* ---------- the window map: where a closed panel goes (a panel never covers another) ---------- */
  let placeAsk = null;
  function askPlace(id, near) {
    if (placeAsk) { placeAsk.close(false); }
    const P = PANELS.get(id); const V = view;
    const wb = $('#workbench').getBoundingClientRect(); const ratio = wb.height > 0 ? wb.height / wb.width : 0.62;
    const mw = Math.min(460, innerWidth - 60), mh = Math.max(160, Math.min(300, Math.round(mw * ratio)));
    const nameOf = a => a.panels.filter(x => PANELS.has(x)).map(x => PANELS.get(x).title).join(', ');
    const spaces = findAvailableSpaces();
    // the suggestion: the right (or lower) half of the panel in use, else another side, else an empty space, else any panel
    const nearAt = near && locate(near); const order = [];
    const ai0 = nearAt && !nearAt.float && !nearAt.hidden ? nearAt.ai : L.areas.findIndex(a => a.panels.some(isBible));
    const sides = a => (wOf(a) * (wb.width / V.w) >= hOf(a) * (wb.height / V.h)) ? ['right', 'left', 'bottom', 'top'] : ['bottom', 'top', 'right', 'left'];
    if (ai0 >= 0) for (const z of sides(L.areas[ai0])) order.push({ areaIndex: ai0, zone: z });
    for (const sp of spaces) order.push({ space: sp });
    L.areas.forEach((a, i) => { if (i !== ai0) for (const z of sides(a)) order.push({ areaIndex: i, zone: z }); });
    let pick = null; for (const t of order) { const sim = computeSmartDrop(L, id, t, true); if (sim) { pick = { t, sim }; break; } }
    const box = r => `left:${pct(r.x0, V.x, V.w)}%;top:${pct(r.y0, V.y, V.h)}%;width:${(r.x1 - r.x0) / V.w * 100}%;height:${(r.y1 - r.y0) / V.h * 100}%`;
    const back = document.createElement('div'); back.className = 'placeback';
    back.innerHTML = `<div class="placedlg" role="dialog" aria-modal="true" aria-labelledby="placeT">
      <h3 id="placeT">${TimotheosIcons ? TimotheosIcons.icon(P.icon || 'layout', 17) : ''} Add the ${esc(P.title)} panel?</h3>
      <p class="small">${esc(P.title)} needs its own space, so that it does not cover another panel. Click a panel to split it (on the side you point at) or an empty space, then <b>Add panel</b>.</p>
      <div class="placemap" style="width:${mw}px;height:${mh}px">
        ${L.areas.map((a, i) => `<div class="pm-area" data-ai="${i}" style="${box(a)}"><span>${esc(nameOf(a))}</span></div>`).join('')}
        ${spaces.map((sp, i) => `<div class="pm-space" data-si="${i}" style="${box(sp)}"><span>Empty space</span></div>`).join('')}
        <div class="pm-new hidden"><span>${esc(P.title)}</span></div>
      </div>
      <p class="pm-where small" aria-live="polite"></p>
      <div class="pm-btns"><button type="button" class="pill" data-a="cancel">Cancel</button><button type="button" class="pill primary" data-a="ok">Add panel</button></div>
    </div>`;
    document.body.appendChild(back);
    const map = back.querySelector('.placemap'), nw = back.querySelector('.pm-new'), where = back.querySelector('.pm-where'), okB = back.querySelector('[data-a="ok"]');
    const sideWord = { left: 'left half', right: 'right half', top: 'upper half', bottom: 'lower half' };
    const describe = t => t.space ? 'an empty space' : `the ${sideWord[t.zone]} of ${nameOf(L.areas[t.areaIndex])}`;
    const paint = (pk, hover) => {
      if (!pk) { nw.classList.add('hidden'); where.textContent = 'There is no room to split: make an empty space first (Edit Layout).'; okB.disabled = true; return; }
      nw.setAttribute('style', box(pk.sim.rect)); nw.classList.remove('hidden'); nw.classList.toggle('hov', !!hover);
      where.innerHTML = `${esc(P.title)} goes in ${esc(describe(pk.t))}.`; okB.disabled = false;
    };
    const targetAt = e => {
      const sp = e.target.closest('.pm-space'); if (sp) return { space: spaces[+sp.dataset.si] };
      const ar = e.target.closest('.pm-area'); if (!ar) return null;
      const r = ar.getBoundingClientRect(); const dx = (e.clientX - r.left) / r.width - 0.5, dy = (e.clientY - r.top) / r.height - 0.5;
      return { areaIndex: +ar.dataset.ai, zone: Math.abs(dx) * r.width >= Math.abs(dy) * r.height ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'top' : 'bottom') };
    };
    const simOf = t => { const sim = t && computeSmartDrop(L, id, t, true); return sim ? { t, sim } : null; };
    map.addEventListener('pointermove', e => { const h = simOf(targetAt(e)); if (h) paint(h, true); else paint(pick); });
    map.addEventListener('pointerleave', () => paint(pick));
    map.addEventListener('click', e => { const h = simOf(targetAt(e)); if (h) { pick = h; paint(pick); } });
    paint(pick);
    return new Promise(res => {
      const close = ok => {
        if (!placeAsk) return; placeAsk = null; document.removeEventListener('keydown', key, true); back.remove();
        if (ok && pick) { L = pick.sim.layout; maxed = null; if (focusMode) focusMode = false; commit(); activate(id); }
        res(!!(ok && pick));
      };
      const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } else if (e.key === 'Enter' && !okB.disabled) { e.preventDefault(); e.stopPropagation(); close(true); } };
      document.addEventListener('keydown', key, true);
      back.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) close(b.dataset.a === 'ok'); else if (e.target === back) close(false); });
      placeAsk = { close };
      setTimeout(() => okB.focus(), 0);
    });
  }

  function hide(id) {
    detach(id, true); L.hidden.push(id);   // closing never makes another panel grow: its place stays an empty space (Edit Layout on or off)
    if (maxed === id) maxed = null;
    commit();
  }

  /* a narrow panel keeps its names whole: first the panel buttons fold into "⋯", then the other tabs show only their icons */
  const fitRO = typeof ResizeObserver === 'function' ? new ResizeObserver(es => es.forEach(e => fitCap(e.target))) : null;
  function fitWatch(div) { if (fitRO) fitRO.observe(div); requestAnimationFrame(() => fitCap(div)); }
  function fitCap(div) {
    const cap = div.querySelector(':scope > .dcap'); if (!cap) return;
    const cut = () => [...cap.querySelectorAll('.dtab:not([data-id^="bv"]) > span')].some(sp => sp.offsetParent && sp.scrollWidth > sp.clientWidth + 1) || cap.scrollWidth > cap.clientWidth + 1;
    cap.classList.remove('tight', 'tight2');
    if (cut()) { cap.classList.add('tight'); if (cut()) cap.classList.add('tight2'); }
  }
  function moreMenu(div, b) {
    document.querySelectorAll('.dmoremenu').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'menu dmoremenu';
    const items = [...div.querySelectorAll(':scope > .dcap .dbtns .dbtn')].filter(x => !['more', 'close'].includes(x.dataset.act));
    m.innerHTML = items.map(x => `<button data-act="${x.dataset.act}">${x.innerHTML}<span>${esc(x.title.replace(/\s*\(.*\)$/, ''))}</span></button>`).join('');
    document.body.appendChild(m);
    const r = b.getBoundingClientRect(); m.style.position = 'fixed'; m.style.top = Math.round(r.bottom + 2) + 'px'; m.style.left = Math.round(Math.max(4, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 4))) + 'px'; m.style.zIndex = 300;
    m.addEventListener('click', e => { const it = e.target.closest('[data-act]'); if (!it) return; m.remove(); const src = div.querySelector(`:scope > .dcap .dbtn[data-act="${it.dataset.act}"]`); if (src) src.click(); });
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off, true); } }, true), 0);
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

  /** reserve an exact empty space for the next newly added panel (e.g. a dragged Bible View) */
  function setNextRect(sp) {
    nextAddRect = sp ? { x0: +sp.x0, y0: +sp.y0, x1: +sp.x1, y1: +sp.y1 } : null;
  }

  /** place an existing panel kind into an exact empty space without moving or resizing any other panel */
  function placeInSpace(id, sp) {
    if (!L || !sp || !PANELS.has(id)) return false;
    const sim = computeSmartDrop(L, id, { space: sp }, true);
    if (!sim || !sim.layout) return false;
    L = sim.layout;
    maxed = null;
    if (focusMode) focusMode = false;
    commit(); activate(id);
    return true;
  }

  /** a new panel that was not there when the layout was made (a new Bible view) */
  function add(p) {
    register(p);
    if (!L) return;
    const at = locate(p.id);
    if (!at || at.hidden) {
      if (at && at.hidden) L.hidden = L.hidden.filter(x => x !== p.id);
      if (nextAddRect && !L.areas.some(a => hit(a, nextAddRect))) {
        L.areas.push({ ...nextAddRect, panels: [p.id], active: p.id });
        if (Array.isArray(L.slots)) L.slots = L.slots.filter(s => !hit(s, nextAddRect));
        nextAddRect = null;
      } else {
        nextAddRect = null;
        placeHome(L, p.id);
      }
    } else {
      nextAddRect = null;
    }
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
    if (isBible(id)) document.querySelectorAll(`.dcap .bvbible[data-bv-idx="${+id.slice(2)}"]`).forEach(b => { b.textContent = title; });
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
  function saveSoon() { record(); clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; if (opts.onSave && L) opts.onSave(clone(L)); }, 100); }

  /* ---- undo / redo of layout changes (0.6.122). Changes coming within 0.4 s of each other are one step. The app adds its
   * own part (the Bible views) through opts.snapshot / opts.restore, so a closed Bible view comes back with its Bible. ---- */
  const HISTORY_MAX = 10;   // undo / redo levels
  const UNDO = [], REDO = []; let lastSnap = null, lastJson = '', lastAt = 0, restoring = false;
  const snapNow = () => ({ L: clone(L), x: opts.snapshot ? opts.snapshot() : null });
  const keyOf = sn => JSON.stringify(sn.L) + '|' + JSON.stringify(sn.x);
  function baseline() { if (!L) return; lastSnap = snapNow(); lastJson = keyOf(lastSnap); lastAt = 0; }
  function record() {
    if (!L || restoring) return;
    const sn = snapNow(), j = keyOf(sn); if (j === lastJson) return;
    const now = Date.now();
    if (lastSnap && now - lastAt > 400) { UNDO.push(lastSnap); if (UNDO.length > HISTORY_MAX) UNDO.shift(); }
    REDO.length = 0; lastSnap = sn; lastJson = j; lastAt = now;
    if (opts.onHistory) opts.onHistory(canUndo(), canRedo());
  }
  const canUndo = () => UNDO.length > 0, canRedo = () => REDO.length > 0;
  async function applySnap(sn) {
    restoring = true;
    try {
      if (opts.restore && sn.x) await opts.restore(sn.x);
      L = normalize(sn.L); maxed = null; focusMode = false; render();
      clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; if (opts.onSave && L) opts.onSave(clone(L)); }, 100);
    } finally { restoring = false; }
    baseline();
    if (opts.onHistory) opts.onHistory(canUndo(), canRedo());
  }
  async function undo() { if (!UNDO.length || restoring) return false; REDO.push(snapNow()); await applySnap(UNDO.pop()); return true; }
  async function redo() { if (!REDO.length || restoring) return false; UNDO.push(snapNow()); if (UNDO.length > HISTORY_MAX) UNDO.shift(); await applySnap(REDO.pop()); return true; }

  /** a Bible view is closed and the views after it move down one number: their panels keep their places, so only the closed
   * view's place is left (an empty space in Detach edges mode; otherwise the neighbours grow into it) */
  function closeBibleView(i, n) {
    if (!L) return;
    detach('bv' + i, true);   // its place stays empty; no other panel grows
    if (maxed === 'bv' + i) maxed = null;
    const ren = id => { const m = /^bv(\d+)$/.exec(id); return m && +m[1] > i ? 'bv' + (+m[1] - 1) : id; };
    for (const g of [...L.areas, ...L.floats]) { g.panels = g.panels.map(ren); g.active = ren(g.active); }
    L.hidden = L.hidden.map(ren);
    if (maxed) maxed = ren(maxed);
    void n;   // the last panel element (bv<n-1>) is no longer in the layout; the app removes it next
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => { if (saveT) { clearTimeout(saveT); saveT = null; if (opts.onSave && L) opts.onSave(clone(L)); } });
  }


  /** draggable dotted divider between blueprint slots */
  function addSlotGut(grid, slots, col, at) {
    const s = document.createElement('div');
    s.className = 'gut slot-gut ' + (col ? 'h' : 'v');
    s.title = col ? 'Drag left or right to adjust dotted column widths' : 'Drag up or down to adjust dotted row heights';
    if (col) Object.assign(s.style, { left: `calc(${pct(at, view.x, view.w)}% - 4px)`, width: '8px', top: '0', height: '100%' });
    else Object.assign(s.style, { top: `calc(${pct(at, view.y, view.h)}% - 4px)`, height: '8px', left: '0', width: '100%' });
    grid.appendChild(s);
    s.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); });
    s.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      document.body.classList.add('resizing'); clearSelection();
      const rect = $('#grid').getBoundingClientRect();
      const start = col ? e.clientX : e.clientY;
      const per = col ? view.w / rect.width : view.h / rect.height;
      const lo = slots.filter(o => same(col ? o.x1 : o.y1, at));
      const hi = slots.filter(o => same(col ? o.x0 : o.y0, at));
      const min = col ? MINW : MINH;
      const from = lo.length ? Math.max(...lo.map(o => col ? o.x0 : o.y0)) + min : min;
      const to = hi.length ? Math.min(...hi.map(o => col ? o.x1 : o.y1)) - min : (col ? NC : NR) - min;
      let done = false;
      const move = ev => {
        if (done) return;
        if (ev.buttons === 0) { up(); return; }
        const nx = Math.max(from, Math.min(to, at + ((col ? ev.clientX : ev.clientY) - start) * per));
        for (const o of lo) o[col ? 'x1' : 'y1'] = nx;
        for (const o of hi) o[col ? 'x0' : 'y0'] = nx;
        render();
      };
      const up = () => {
        if (done) return; done = true;
        document.body.classList.remove('resizing'); clearSelection();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('mouseup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('blur', up);
        render(); saveSoon();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('mouseup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('blur', up);
    });
  }

  /** Word-style animated 4x3 (column x row) interactive grid picker popover */
  /** the grid picker: the whole workbench, or (box given) one empty space to split. Offers up to 6 × 3, only what fits. */
  function openLayoutDesigner(anchor, box, dims) {
    document.querySelectorAll('.ld-picker').forEach(x => x.remove());
    const pop = document.createElement('div');
    pop.className = 'ld-picker';
    const px = boxPx(box); const fit = fitGrid(px.w, px.h);
    let selC = Math.min(dims ? dims.cols : 2, fit.cols), selR = Math.min(dims ? dims.rows : 2, fit.rows);
    // live preview: the places on the workbench change as the mouse moves over the picker; Cancel puts them back
    const orig = clone(L.slots || []); let previewed = false;
    const preview = (c, row) => {
      L.slots = box ? orig.filter(s => !hit(s, box)).concat(createBlueprintSlots(c, row, box)) : createBlueprintSlots(c, row);
      previewed = true; maxed = null; render();
    };
    const restore = () => { if (previewed) { L.slots = clone(orig); previewed = false; render(); } };
    let cellsHtml = '';
    for (let r = 1; r <= fit.rows; r++) {
      for (let c = 1; c <= fit.cols; c++) {
        cellsHtml += `<button type="button" class="ld-cell" data-c="${c}" data-r="${r}" aria-label="${c} columns by ${r} rows"></button>`;
      }
    }
    const room = fit.cols < PICK_MAXC || fit.rows < PICK_MAXR ? `<div class="ld-room small">Up to ${PICK_MAXC} × ${PICK_MAXR}; ${box ? 'this space' : 'this window'} has room for ${fit.cols} × ${fit.rows}.</div>` : '';
    pop.innerHTML = `<div class="ld-head"><b>${dims ? 'Change this grid' : box ? 'Split this empty space' : 'Design your layout'}</b><span class="ld-dim" id="ldDim">2 × 2 grid (4 panels)</span></div>
      <div class="ld-grid" role="grid" style="grid-template-columns:repeat(${fit.cols}, 1fr)">${cellsHtml}</div>${room}
      <div class="ld-foot"><span class="small">Hover to preview · Click to confirm</span><button type="button" class="ld-cancel">Cancel</button></div>`;
    pop.style.width = Math.max(250, fit.cols * 54 + 40) + 'px';
    document.body.appendChild(pop);
    const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 120, bottom: innerHeight / 2 - 90 };
    const pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 220;
    pop.style.left = Math.max(12, Math.min(innerWidth - pw - 12, r.left + (r.width || 0) / 2 - pw / 2)) + 'px';
    pop.style.top = Math.max(12, Math.min(innerHeight - ph - 12, (r.bottom || innerHeight / 2) + 8)) + 'px';

    const paint = (c, row) => {
      selC = c; selR = row;
      const total = c * row;
      pop.querySelector('#ldDim').textContent = `${c} × ${row} grid (${total} ${box ? 'place' : 'panel'}${total === 1 ? '' : 's'})`;
      pop.querySelectorAll('.ld-cell').forEach(el => {
        const ec = +el.dataset.c, er = +el.dataset.r;
        el.classList.toggle('lit', ec <= c && er <= row);
      });
    };
    paint(selC, selR);
    const close = () => { document.removeEventListener('mousedown', outClick, true); document.removeEventListener('keydown', onKey, true); pop.remove(); };
    const cancel = () => { close(); restore(); };
    const outClick = e => { if (!pop.contains(e.target) && (!anchor || !anchor.isConnected || !anchor.contains(e.target))) cancel(); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); cancel(); } };
    document.addEventListener('mousedown', outClick, true);
    document.addEventListener('keydown', onKey, true);
    pop.querySelector('.ld-cancel').onclick = cancel;
    const hover = (c, row) => { paint(c, row); preview(c, row); };
    pop.querySelectorAll('.ld-cell').forEach(el => {
      el.addEventListener('mouseenter', () => hover(+el.dataset.c, +el.dataset.r));
      el.addEventListener('focus', () => hover(+el.dataset.c, +el.dataset.r));
      el.addEventListener('click', () => {
        const c = +el.dataset.c, row = +el.dataset.r;
        close();
        L.slots = clone(orig);   // the change is made once, as one undo step
        setBlueprintGrid(c, row, box);
        if (window.TimotheosOptions && TimotheosOptions.openPanelsDialog) TimotheosOptions.openPanelsDialog();
      });
    });
  }

  function setBlueprintGrid(cols, rows, box) {
    if (!L) return;
    // a split of one empty space keeps the empty places elsewhere; the whole-window designer starts over
    L.slots = box ? (L.slots || []).filter(s => !hit(s, box)).concat(createBlueprintSlots(cols, rows, box)) : createBlueprintSlots(cols, rows);
    maxed = null; focusMode = false;
    commit();
  }

  /** close every open panel and float, leaving an empty workbench ready for "Design your layout" */
  function clearAll() {
    if (!L) return;
    const hid = new Set(L.hidden || []);
    for (const a of L.areas || []) for (const id of a.panels || []) hid.add(id);
    for (const f of L.floats || []) for (const id of f.panels || []) hid.add(id);
    L.areas = [];
    L.floats = [];
    L.slots = [];
    L.hidden = [...hid];
    maxed = null; focusMode = false;
    commit();
  }

  function applyPreset(name) {
    const p = PRESETS[name]; if (!p) return;
    L = normalize(p.layout); maxed = null; focusMode = false; commit();
  }
  function setLayout(lay) { L = normalize(lay); maxed = null; focusMode = false; commit(); }

  function setDetachMode(on) {
    detachMode = !!on;
    if (L && typeof document !== 'undefined') render();
    if (opts.onModeChange) opts.onModeChange({ detachMode, snapGridMode });
  }
  function toggleDetachMode() { setDetachMode(!detachMode); return detachMode; }
  function getDetachMode() { return detachMode; }

  function setSnapGrid(on) {
    snapGridMode = !!on;
    if (opts.onModeChange) opts.onModeChange({ detachMode, snapGridMode });
  }
  function toggleSnapGrid() { setSnapGrid(!snapGridMode); return snapGridMode; }
  function getSnapGrid() { return snapGridMode; }

  function init(layout, o) {
    opts = o || {};
    snapGridMode = !!opts.snapGrid;
    detachMode = !!opts.detachMode;
    holder = document.createElement('div'); holder.id = 'dholder'; holder.hidden = true; document.body.appendChild(holder);
    L = normalize(layout);
    render(); baseline();
    window.addEventListener('resize', () => document.querySelectorAll('.dfloat').forEach(clampFloat));
  }

  const apiObj = {
    init, register, add, remove, retitle, render, show, askPlace, hide, activate, toggleFloat, toggleFocus, applyPreset, setLayout, isVisible, arrangeBible,
    setDetachMode, toggleDetachMode, getDetachMode, setSnapGrid, toggleSnapGrid, getSnapGrid,
    setNextRect, placeInSpace, startMenuDrag, clearAll, setBlueprintGrid, openLayoutDesigner, createBlueprintSlots,
    undo, redo, canUndo, canRedo, closeBibleView, resetHistory: baseline,
    thumbnailSvg, findEmptySpaces: () => findEmptySpaces(L ? L.areas : []),
    findAvailableSpaces,
    panels: () => [...PANELS.values()], panel: id => PANELS.get(id), state: () => clone(L), located: id => locate(id), PRESETS, isBible,
    get focus() { return focusMode; },
    get detachMode() { return detachMode; },
    get snapGrid() { return snapGridMode; }
  };
  if (typeof window !== 'undefined') window.TimotheosDock = apiObj;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      NC, NR, EPS, MINW, MINH, MIN_SPACE_PX, PRESETS,
      normalize, untab, findEmptySpaces, filterSpacesByMinPx, createBlueprintSlots, fitGrid, detachPanelFromLayout, fillHole,
      computeSmartDrop, computeGridDrop, thumbnailSvg
    };
  }
})();
