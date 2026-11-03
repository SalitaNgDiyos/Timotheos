'use strict';
/* Docking workbench: panels that can be tabbed together, stacked, moved to another side,
 * floated as their own small window, maximized or closed, like theWord's layout.
 * The Bible view always stays in the centre; panels dock to the left, right or bottom of it.
 *
 * layout = { v, zones: { left|right|bottom: { size, groups: [{ panels: [id], active, size }] } },
 *            floats: [{ panels: [id], active, x, y, w, h }], hidden: [id] }
 */
/* global TimotheosIcons */
(function () {
  const ZONES = ['left', 'right', 'bottom'];
  const PANELS = new Map();          // id → { id, title, icon, cap, el, home }
  let L = null;                      // current layout
  let opts = {};                     // { onSave(layout), onActivate(id) }
  let focusMode = false;
  let maxed = null;                  // id of the panel whose group is maximized
  const ic = (n, s) => TimotheosIcons.icon(n, s);
  const $ = s => document.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));

  const PRESETS = {
    classic: { label: 'Classic (Books & modules left, study tools right, search below)', layout: {
      v: 1, zones: {
        left: { size: 250, groups: [{ panels: ['tree'], active: 'tree', size: 1 }] },
        right: { size: 370, groups: [{ panels: ['cmt'], active: 'cmt', size: 1 }, { panels: ['lib', 'study', 'compare'], active: 'lib', size: 1 }] },
        bottom: { size: 230, groups: [{ panels: ['search', 'bsearch'], active: 'search', size: 1 }] } },
      floats: [], hidden: [] } },
    tabs: { label: 'Compact (everything as tabs on the right)', layout: {
      v: 1, zones: {
        left: { size: 245, groups: [{ panels: ['tree'], active: 'tree', size: 1 }] },
        right: { size: 380, groups: [{ panels: ['lib', 'cmt', 'search', 'bsearch', 'study', 'compare'], active: 'lib', size: 1 }] },
        bottom: { size: 220, groups: [] } },
      floats: [], hidden: [] } },
    study: { label: 'Word study (commentary and library side by side below)', layout: {
      v: 1, zones: {
        left: { size: 245, groups: [{ panels: ['tree'], active: 'tree', size: 1 }] },
        right: { size: 360, groups: [{ panels: ['search', 'bsearch'], active: 'search', size: 1.3 }, { panels: ['study'], active: 'study', size: 1 }] },
        bottom: { size: 280, groups: [{ panels: ['cmt'], active: 'cmt', size: 1 }, { panels: ['lib', 'compare'], active: 'lib', size: 1 }] } },
      floats: [], hidden: [] } },
    reading: { label: 'Reading (Bible only; panels hidden)', layout: {
      v: 1, zones: { left: { size: 250, groups: [] }, right: { size: 370, groups: [] }, bottom: { size: 220, groups: [] } },
      floats: [], hidden: ['tree', 'cmt', 'lib', 'study', 'search', 'bsearch', 'compare'] } }
  };

  /* ------------------------------------------------------------ registry & state */
  function register(p) { PANELS.set(p.id, p); p.el.classList.add('dpanel'); p.el.dataset.panel = p.id; }

  /** make any stored layout safe: unknown panels dropped, missing panels put back where they belong */
  function normalize(lay) {
    const out = lay && lay.v === 1 && lay.zones ? clone(lay) : clone(PRESETS.classic.layout);
    const seen = new Set();
    const keep = list => (list || []).filter(id => PANELS.has(id) && !seen.has(id) && seen.add(id));
    for (const z of ZONES) {
      const zone = out.zones[z] = out.zones[z] || { size: z === 'bottom' ? 220 : 300, groups: [] };
      zone.size = Math.max(140, Math.min(900, +zone.size || 300));
      zone.groups = (zone.groups || []).map(g => ({ panels: keep(g.panels), active: g.active, size: Math.max(0.1, +g.size || 1) })).filter(g => g.panels.length);
      for (const g of zone.groups) if (!g.panels.includes(g.active)) g.active = g.panels[0];
    }
    out.floats = (out.floats || []).map(f => ({ panels: keep(f.panels), active: f.active, x: +f.x || 80, y: +f.y || 80, w: +f.w || 360, h: +f.h || 320 })).filter(f => f.panels.length);
    for (const f of out.floats) if (!f.panels.includes(f.active)) f.active = f.panels[0];
    out.hidden = keep(out.hidden);
    for (const id of PANELS.keys()) if (!seen.has(id)) placeHome(out, id, true); // e.g. a panel new in this version
    return out;
  }

  /** where a panel goes when it is shown again: beside the panels it sits with in the classic layout */
  function placeHome(lay, id, quiet) {
    const home = PRESETS.classic.layout;
    for (const z of ZONES) for (const g of home.zones[z].groups) if (g.panels.includes(id)) {
      const zone = lay.zones[z];
      const mate = zone.groups.find(x => x.panels.some(p => g.panels.includes(p)));
      if (mate) { mate.panels.push(id); if (!quiet) mate.active = id; }
      else zone.groups.push({ panels: [id], active: id, size: 1 });
      return;
    }
    lay.zones.right.groups.push({ panels: [id], active: id, size: 1 });
  }

  function locate(id) {
    for (const z of ZONES) { const gs = L.zones[z].groups; for (let i = 0; i < gs.length; i++) if (gs[i].panels.includes(id)) return { zone: z, gi: i, g: gs[i] }; }
    for (let i = 0; i < L.floats.length; i++) if (L.floats[i].panels.includes(id)) return { float: true, fi: i, g: L.floats[i] };
    if (L.hidden.includes(id)) return { hidden: true };
    return null;
  }

  function detach(id) {
    const at = locate(id); if (!at) return;
    if (at.hidden) { L.hidden = L.hidden.filter(x => x !== id); return; }
    const g = at.g; g.panels = g.panels.filter(x => x !== id);
    if (g.active === id) g.active = g.panels[0];
    if (!g.panels.length) {
      if (at.float) L.floats.splice(at.fi, 1);
      else { const gs = L.zones[at.zone].groups; const sz = gs[at.gi].size; gs.splice(at.gi, 1); const nb = gs[at.gi] || gs[at.gi - 1]; if (nb) nb.size += sz; }
    }
  }

  function isVisible(id) {
    const at = locate(id); return !!at && !at.hidden && at.g.active === id && !(focusMode && !at.float);
  }

  /* ------------------------------------------------------------ rendering */
  let holder;
  function render() {
    const wb = $('#workbench');
    const scroll = new Map();
    for (const p of PANELS.values()) { scroll.set(p.id, p.el.scrollTop); holder.appendChild(p.el); }
    for (const z of ZONES) {
      const el = $('#zone-' + z); el.innerHTML = '';
      const zone = L.zones[z];
      const empty = !zone.groups.length || focusMode;
      el.classList.toggle('empty', empty);
      $('#split-' + z).classList.toggle('hidden', empty);
      el.style[z === 'bottom' ? 'height' : 'width'] = empty ? '0' : zone.size + 'px';
      if (empty) continue;
      zone.groups.forEach((g, gi) => {
        if (gi) el.appendChild(groupSplitter(z, gi));
        el.appendChild(groupEl(g, { zone: z, gi }));
      });
    }
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
    for (const [id, top] of scroll) PANELS.get(id).el.scrollTop = top;
    wb.classList.toggle('focus', focusMode);
    const fb = $('#focusBtn'); if (fb) fb.classList.toggle('on', focusMode);
  }

  function groupEl(g, where) {
    const div = document.createElement('section');
    div.className = 'dgroup';
    div.style.flex = `${g.size} 1 0`;
    if (where.zone) { div.dataset.zone = where.zone; div.dataset.gi = where.gi; } else div.dataset.fi = where.fi;
    const act = PANELS.get(g.active);
    div.style.setProperty('--cap', `var(--cap-${act.cap})`);
    div.classList.toggle('zoomable', !!(opts.zoomable && opts.zoomable(g.active)));
    if (maxed && g.panels.includes(maxed)) div.classList.add('max');
    const tabs = g.panels.map(id => {
      const p = PANELS.get(id);
      return `<button class="dtab${id === g.active ? ' on' : ''}" data-id="${id}" style="--tc: var(--cap-${p.cap})" title="${p.title} — drag to move">${ic(p.icon, 15)}<span>${p.title}</span></button>`;
    }).join('');
    div.innerHTML = `<header class="dcap">
        <span class="dgrip" title="Drag to move this panel">${ic('grip', 14)}</span>
        <div class="dtabs">${tabs}</div>
        <span class="dbtns">
          <button class="dbtn" data-act="skin" title="This panel's own fonts and colours">${ic('palette', 14)}</button>
          <button class="dbtn dzoom" data-act="zoom-" title="Smaller text (Ctrl + mouse wheel down)">${ic('textDown', 15)}</button>
          <button class="dbtn dzoom" data-act="zoom+" title="Larger text (Ctrl + mouse wheel up)">${ic('textUp', 15)}</button>
          <button class="dbtn" data-act="float" title="${where.float ? 'Dock again' : 'Float as a window'}">${ic(where.float ? 'dockIn' : 'float', 14)}</button>
          ${where.float ? '' : `<button class="dbtn" data-act="max" title="${div.classList.contains('max') ? 'Restore' : 'Maximize'}">${ic(div.classList.contains('max') ? 'restore' : 'max', 14)}</button>`}
          <button class="dbtn" data-act="close" title="Close (reopen from the Panels menu)">${ic('close', 14)}</button>
        </span></header><div class="dbody"></div>`;
    const body = div.querySelector('.dbody');
    for (const id of g.panels) { const p = PANELS.get(id); body.appendChild(p.el); p.el.classList.toggle('hidden', id !== g.active); }
    div.querySelector('.dcap').addEventListener('pointerdown', e => startDrag(e, div, g));
    div.querySelector('.dcap').addEventListener('dblclick', e => { if (!e.target.closest('.dbtn')) toggleFloat(g.active); });
    div.querySelectorAll('.dtab').forEach(b => b.addEventListener('click', () => activate(b.dataset.id)));
    div.querySelectorAll('.dbtn').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'close') hide(g.active);
      if (a === 'skin') { if (opts.onSkin) opts.onSkin(g.active, b); return; }
      if (a === 'float') toggleFloat(g.active);
      if (a === 'zoom-' || a === 'zoom+') { if (opts.onZoom) opts.onZoom(g.active, a === 'zoom+' ? 1 : -1); }
      if (a === 'max') { maxed = maxed && g.panels.includes(maxed) ? null : g.active; render(); }
    }));
    return div;
  }

  function groupSplitter(z, gi) {
    const s = document.createElement('div');
    s.className = 'gsplit ' + (z === 'bottom' ? 'v' : 'h');
    s.addEventListener('pointerdown', e => {
      e.preventDefault(); s.setPointerCapture(e.pointerId);
      const gs = L.zones[z].groups; const a = gs[gi - 1], b = gs[gi];
      const ea = s.previousElementSibling, eb = s.nextElementSibling;
      const horiz = z === 'bottom';
      const pa = horiz ? ea.offsetWidth : ea.offsetHeight, pb = horiz ? eb.offsetWidth : eb.offsetHeight;
      const tot = a.size + b.size, start = horiz ? e.clientX : e.clientY;
      const move = ev => {
        const d = (horiz ? ev.clientX : ev.clientY) - start;
        const na = Math.max(60, Math.min(pa + pb - 60, pa + d));
        a.size = tot * na / (pa + pb); b.size = tot - a.size;
        ea.style.flex = `${a.size} 1 0`; eb.style.flex = `${b.size} 1 0`;
      };
      const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up); s.removeEventListener('lostpointercapture', up); saveSoon(); };
      s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up); s.addEventListener('lostpointercapture', up);
    });
    return s;
  }

  function wireZoneSplitters() {
    for (const z of ZONES) {
      const s = $('#split-' + z);
      s.addEventListener('pointerdown', e => {
        e.preventDefault(); s.setPointerCapture(e.pointerId);
        const zone = L.zones[z]; const start = z === 'bottom' ? e.clientY : e.clientX; const s0 = zone.size;
        const el = $('#zone-' + z);
        const move = ev => {
          const d = (z === 'bottom' ? ev.clientY : ev.clientX) - start;
          const max = z === 'bottom' ? window.innerHeight - 220 : window.innerWidth / 2;
          zone.size = Math.round(Math.max(150, Math.min(max, s0 + (z === 'left' ? d : -d))));
          el.style[z === 'bottom' ? 'height' : 'width'] = zone.size + 'px';
        };
        const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up); s.removeEventListener('lostpointercapture', up); saveSoon(); };
        s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up); s.addEventListener('lostpointercapture', up);
      });
    }
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
        drag.ghost.innerHTML = `${ic(p.icon, 15)}<span>${p.title}</span>`;
        document.body.appendChild(drag.ghost);
      }
      showEdgeTargets();
    }
    if (drag.ghost) { drag.ghost.style.left = e.clientX + 12 + 'px'; drag.ghost.style.top = e.clientY + 10 + 'px'; }
    if (drag.isFloat) {
      drag.groupDiv.style.left = e.clientX - drag.ox + 'px'; drag.groupDiv.style.top = e.clientY - drag.oy + 'px';
      drag.groupDiv.style.pointerEvents = 'none';
    }
    // which group is under the pointer?
    const under = document.elementsFromPoint(e.clientX, e.clientY);
    const tgt = under.find(el => el.classList && el.classList.contains('dtarget'));
    const grp = under.find(el => el.classList && el.classList.contains('dgroup'));
    if (grp !== drag.overGroup && !(tgt && tgt.closest('.dcompass'))) { drag.overGroup = grp; showCompass(grp); }
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

  function showEdgeTargets() {
    const wb = $('#workbench').getBoundingClientRect();
    const layer = document.createElement('div'); layer.className = 'dlayer'; layer.id = 'dlayer';
    const put = (t, x, y, iconName, title) => {
      const b = document.createElement('div'); b.className = 'dtarget edge'; b.dataset.t = JSON.stringify(t); b.title = title;
      b.style.left = x - 18 + 'px'; b.style.top = y - 18 + 'px'; b.innerHTML = ic(iconName, 18);
      layer.appendChild(b);
    };
    put({ edge: 'left' }, wb.left + 26, wb.top + wb.height / 2, 'prev', 'Dock on the left');
    put({ edge: 'right' }, wb.right - 26, wb.top + wb.height / 2, 'next', 'Dock on the right');
    put({ edge: 'bottom' }, wb.left + wb.width / 2, wb.bottom - 26, 'import', 'Dock at the bottom');
    const pv = document.createElement('div'); pv.className = 'dpreview hidden'; pv.id = 'dpreview'; layer.appendChild(pv);
    document.body.appendChild(layer);
  }

  function showCompass(grp) {
    const old = document.querySelector('.dcompass'); if (old) old.remove();
    if (!grp) return;
    const layer = $('#dlayer'); if (!layer) return;
    const r = grp.getBoundingClientRect();
    const c = document.createElement('div'); c.className = 'dcompass';
    c.style.left = r.left + r.width / 2 - 58 + 'px'; c.style.top = r.top + Math.min(r.height / 2, 160) - 58 + 'px';
    const where = grp.dataset.zone ? { zone: grp.dataset.zone, gi: +grp.dataset.gi } : { fi: +grp.dataset.fi };
    const cells = [['tab', 'Add as a tab here', 'plus', 1, 1]];
    if (where.zone) {
      if (where.zone === 'bottom') cells.push(['before', 'Put it to the left of this panel', 'prev', 1, 0], ['after', 'Put it to the right of this panel', 'next', 1, 2]);
      else cells.push(['before', 'Put it above this panel', 'prev', 0, 1, 'rot'], ['after', 'Put it below this panel', 'next', 2, 1, 'rot']);
    }
    for (const [kind, title, iconName, row, col, rot] of cells) {
      const b = document.createElement('div'); b.className = 'dtarget' + (rot ? ' rot' : '') + (kind === 'tab' ? ' mid' : '');
      b.dataset.t = JSON.stringify(Object.assign({ kind }, where)); b.title = title; b.innerHTML = ic(iconName, 18);
      b.style.gridRow = row + 1; b.style.gridColumn = col + 1;
      c.appendChild(b);
    }
    layer.appendChild(c);
  }

  function showPreview(t, tgtEl) {
    const pv = $('#dpreview'); if (!pv) return;
    if (!t) { pv.classList.add('hidden'); return; }
    const wb = $('#workbench').getBoundingClientRect();
    let r;
    if (t.edge) {
      const z = $('#zone-' + t.edge).getBoundingClientRect(); const size = L.zones[t.edge].size;
      r = t.edge === 'left' ? { left: wb.left, top: wb.top, width: z.width > 10 ? z.width : size, height: wb.height }
        : t.edge === 'right' ? { left: wb.right - (z.width > 10 ? z.width : size), top: wb.top, width: z.width > 10 ? z.width : size, height: wb.height }
          : { left: $('#center').getBoundingClientRect().left, top: wb.bottom - (z.height > 10 ? z.height : size), width: $('#center').getBoundingClientRect().width, height: z.height > 10 ? z.height : size };
    } else {
      const grp = tgtEl.closest('.dcompass') && drag && drag.overGroup; if (!grp) { pv.classList.add('hidden'); return; }
      const g = grp.getBoundingClientRect();
      if (t.kind === 'tab') r = g;
      else if (t.zone === 'bottom') r = { left: t.kind === 'before' ? g.left : g.left + g.width / 2, top: g.top, width: g.width / 2, height: g.height };
      else r = { left: g.left, top: t.kind === 'before' ? g.top : g.top + g.height / 2, width: g.width, height: g.height / 2 };
    }
    Object.assign(pv.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    pv.classList.remove('hidden');
  }

  function clearTargets() { const l = $('#dlayer'); if (l) l.remove(); }

  /** move a panel to a drop target */
  function dropOn(id, t) {
    let target = null;
    if (t.zone) target = L.zones[t.zone].groups[t.gi];
    else if (t.fi != null) target = L.floats[t.fi];
    if (target && target.panels.length === 1 && target.panels[0] === id) return; // onto itself
    detach(id); maxed = null;
    if (t.edge) {
      const gs = L.zones[t.edge].groups;
      gs.push({ panels: [id], active: id, size: gs.length ? gs.reduce((a, g) => a + g.size, 0) / gs.length : 1 });
    } else if (t.kind === 'tab') {
      target.panels.push(id); target.active = id;
    } else {
      const gs = L.zones[t.zone].groups; const i = gs.indexOf(target);
      if (i < 0) gs.push({ panels: [id], active: id, size: 1 });
      else { const half = target.size / 2; target.size = half; gs.splice(t.kind === 'before' ? i : i + 1, 0, { panels: [id], active: id, size: half }); }
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
    } else render();
    saveSoon();
    if (opts.onActivate) opts.onActivate(id);
  }

  /** make a panel visible: reopen it if closed, leave focus mode, bring its tab to the front */
  function show(id) {
    if (!PANELS.has(id)) return;
    const at = locate(id);
    if (at && at.hidden) { L.hidden = L.hidden.filter(x => x !== id); placeHome(L, id); commit(); }
    else if (focusMode && at && !at.float) { focusMode = false; render(); }
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
    wireZoneSplitters();
    render();
    window.addEventListener('resize', () => document.querySelectorAll('.dfloat').forEach(clampFloat));
  }

  window.TimotheosDock = {
    init, register, render, show, hide, activate, toggleFloat, toggleFocus, applyPreset, setLayout, isVisible,
    panels: () => [...PANELS.values()], state: () => clone(L), located: id => locate(id), PRESETS,
    get focus() { return focusMode; }
  };
})();
