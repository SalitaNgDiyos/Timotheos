// Docking workbench, as in the Electron edition (and like theWord's layout): the Bible text stays in the
// middle; panels dock at the left, right or bottom, where each side holds one or more panes stacked
// (side by side at the bottom). A pane shows one panel or several as tabs. Drag a pane's title bar or a tab:
// a compass appears over the pane under the mouse (as a tab here / above / below / left / right) and arrows
// at the window edges (a new pane on that side); dropping anywhere else makes a floating window.
// Each pane has buttons for smaller/larger text, float, maximize and close. Added Bible and book views
// always get a pane of their own. On a phone, all open panels share one full-screen panel.
//
// layout = { v: 2, zones: { left|right|bottom: { size, groups: [{ panels, active, size }] } },
//            floats: [{ panels, active, x, y, w, h }], hidden: [ids], zoom: { id: steps } }
import { $, esc, isPhone } from './ui';
import { icon } from './icons';

export type ZoneId = 'left' | 'right' | 'bottom' | 'center';
export interface Group { panels: string[]; active: string; size: number }
export interface Float { panels: string[]; active: string; x: number; y: number; w: number; h: number }
export interface Layout { v: 2; zones: Record<ZoneId, { size: number; groups: Group[] }>; floats: Float[]; hidden: string[]; zoom?: Record<string, number> }

const FIXED: Record<string, [string, string, string]> = { // id → title, icon, caption colour
  cmt: ['Commentary', 'commentary', 'cmt'], lib: ['Library', 'library', 'lib'], search: ['Bible search', 'search', 'search'], bsearch: ['Book search', 'search', 'search'],
  study: ['My Study', 'study', 'study'], dict: ['Dictionary', 'lookup', 'dict'],
};
export const PANELS = Object.keys(FIXED);
const ZONES: ZoneId[] = ['left', 'right', 'bottom'];
/** the side zones and the middle (where the Bible views are) */
const ALLZ: ZoneId[] = ['center', 'left', 'right', 'bottom'];
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const g1 = (panels: string[], size = 1): Group => ({ panels, active: panels[0], size });
const lay = (left: Group[], right: Group[], bottom: Group[], hidden: string[], sizes = [300, 400, 250]): Layout =>
  ({ v: 2, zones: { left: { size: sizes[0], groups: left }, right: { size: sizes[1], groups: right }, bottom: { size: sizes[2], groups: bottom }, center: { size: 0, groups: [] } }, floats: [], hidden });
export const PRESETS: Record<string, [string, Layout]> = {
  standard: ['Standard – study tools on the right', lay([], [g1(['cmt'], 1), g1(['lib', 'search', 'bsearch', 'study'], 1.3)], [], ['dict'])],
  study: ['Study – Library left, Commentary right, Search below', lay([g1(['lib'])], [g1(['cmt']), g1(['dict', 'study'])], [g1(['search']), g1(['bsearch'])], [], [340, 380, 230])],
  words: ['Word study – Dictionary and Search', lay([], [g1(['dict'], 1.2), g1(['cmt', 'lib'])], [g1(['search']), g1(['bsearch', 'study'])], [], [300, 400, 260])],
  tabs: ['Compact – everything as tabs on the right', lay([], [g1(['cmt', 'lib', 'dict', 'search', 'bsearch', 'study'])], [], [])],
  reading: ['Reading – the Bible only', lay([], [], [], [...PANELS])],
};
export const DEFAULT_LAYOUT = (): Layout => clone(PRESETS.standard[1]);

export interface DockHost {
  save(l: Layout): void;
  shown(id: string): void;                       // a panel came on screen
  create(id: string): HTMLElement | null;        // the section of an added panel (null: unknown id)
  title(id: string): string;                     // title of an added panel
  closed(id: string): void;                      // an added panel was closed for good
}
let H: DockHost;
let L: Layout = DEFAULT_LAYOUT();
let focus = false;                 // all panels hidden: the Bible text only
let maxed: string | null = null;   // the panel whose pane is maximized
const meta = (id: string): [string, string, string] => FIXED[id] || (id.startsWith('bible-') ? [H.title(id), 'bible', 'bible'] : id.startsWith('bsearch') ? [H.title(id), 'search', 'search'] : id.startsWith('search-') ? [H.title(id), 'search', 'search'] : [H.title(id), 'book', 'lib']);
export const titleOf = (id: string) => meta(id)[0];
const section = (id: string): HTMLElement | null => document.getElementById('p-' + id) || H.create(id);
const known = (id: string) => !!FIXED[id] || !!section(id);

/* ------------------------------------------------------------ state */
/** any stored layout made safe; older (v1) layouts become one pane per side */
function normalize(x: unknown): Layout {
  let out: Layout;
  const o = x as Record<string, unknown> | undefined;
  if (o && o.v === 2 && o.zones) out = clone(o as unknown as Layout);
  else if (o && (o.left || o.right || o.bottom)) { // v1: { left: { panels, active, size }, ... }
    const v1 = o as Record<ZoneId, { panels: string[]; active: string; size: number }>;
    out = lay(...ZONES.map(z => v1[z] && v1[z].panels.length ? [{ panels: v1[z].panels, active: v1[z].active, size: 1 }] : []) as [Group[], Group[], Group[]], [], ZONES.map(z => v1[z]?.size || 300));
  } else out = DEFAULT_LAYOUT();
  const seen = new Set<string>();
  const keep = (list: string[]) => (list || []).filter(id => !seen.has(id) && known(id) && seen.add(id));
  for (const z of ALLZ) {
    const zone = out.zones[z] = out.zones[z] || { size: z === 'bottom' ? 250 : z === 'center' ? 0 : 320, groups: [] };
    zone.size = Math.max(140, Math.min(1200, +zone.size || 300));
    zone.groups = (zone.groups || []).map(g => ({ panels: keep(g.panels), active: g.active, size: Math.max(0.1, +g.size || 1) })).filter(g => g.panels.length);
    for (const g of zone.groups) if (!g.panels.includes(g.active)) g.active = g.panels[0];
  }
  out.floats = (out.floats || []).map(f => ({ ...f, panels: keep(f.panels) })).filter(f => f.panels.length);
  for (const f of out.floats) if (!f.panels.includes(f.active)) f.active = f.panels[0];
  out.hidden = keep(out.hidden || []);
  for (const id of PANELS) if (!seen.has(id)) out.hidden.push(id); // a fixed panel nowhere: closed
  out.zoom = out.zoom || {};
  return out;
}
type At = { zone: ZoneId; gi: number; g: Group } | { float: true; fi: number; g: Float } | { hidden: true } | null;
function locate(id: string): At {
  for (const z of ALLZ) { const gs = L.zones[z].groups; for (let i = 0; i < gs.length; i++) if (gs[i].panels.includes(id)) return { zone: z, gi: i, g: gs[i] }; }
  for (let i = 0; i < L.floats.length; i++) if (L.floats[i].panels.includes(id)) return { float: true, fi: i, g: L.floats[i] };
  if (L.hidden.includes(id)) return { hidden: true };
  return null;
}
function detach(id: string): void {
  const at = locate(id); if (!at) return;
  if ('hidden' in at) { L.hidden = L.hidden.filter(x => x !== id); return; }
  const g = at.g; g.panels = g.panels.filter(x => x !== id);
  if (g.active === id) g.active = g.panels[0];
  if (!g.panels.length) {
    if ('float' in at) L.floats.splice(at.fi, 1);
    else { const gs = L.zones[at.zone].groups; const sz = gs[at.gi].size; gs.splice(at.gi, 1); const nb = gs[at.gi] || gs[at.gi - 1]; if (nb) nb.size += sz; }
  }
}
export const isOpen = (id: string) => { const at = locate(id); return !!at && !('hidden' in at); };
export const openPanelsAll = () => openPanels();
export const openPanels = () => [...ALLZ.flatMap(z => L.zones[z].groups.flatMap(g => g.panels)), ...L.floats.flatMap(f => f.panels)];
export const centerEmpty = () => !L.zones.center.groups.length;
/** is the panel on screen? */
export function visible(id: string): boolean {
  const at = locate(id); if (!at || 'hidden' in at) return false;
  if (isPhone()) return document.body.classList.contains('side-open') && phoneActive() === id;
  if ('zone' in at && at.zone === 'center') return phoneOrDesk(at.g, id);
  return at.g.active === id && !(focus && !('float' in at));
}
const phoneOrDesk = (g: Group, id: string) => isPhone() ? centerActive() === id : g.active === id;
export const layout = (): Layout => clone(L);
export const isHiddenAll = () => focus;

/* ------------------------------------------------------------ rendering */
const park = () => $('#parked');
function render(): void {
  const scroll = new Map<string, number>();
  for (const id of [...openPanels(), ...L.hidden]) { const s = section(id); if (s) { scroll.set(id, s.scrollTop); park().appendChild(s); } }
  document.querySelectorAll('.dfloat').forEach(f => f.remove());
  renderCenter();
  if (isPhone()) renderPhone();
  else {
    for (const z of ZONES) {
      const el = $('#zone-' + z); el.innerHTML = '';
      const zone = L.zones[z]; const empty = !zone.groups.length || focus;
      el.classList.toggle('zempty', empty);
      document.querySelector(`.dsplit[data-z="${z}"]`)?.classList.toggle('zempty', empty);
      el.style.width = el.style.height = '';
      if (!empty) el.style[z === 'bottom' ? 'height' : 'width'] = zone.size + 'px';
      if (empty) continue;
      zone.groups.forEach((g, gi) => { if (gi) el.appendChild(groupSplitter(z, gi)); el.appendChild(groupEl(g, { zone: z, gi })); });
    }
    L.floats.forEach((f, fi) => {
      const w = groupEl(f, { fi }); w.classList.add('dfloat');
      Object.assign(w.style, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' });
      document.body.appendChild(w); clampFloat(w);
      new ResizeObserver(() => { if (w.isConnected && (Math.abs(w.offsetWidth - f.w) > 2 || Math.abs(w.offsetHeight - f.h) > 2)) { f.w = w.offsetWidth; f.h = w.offsetHeight; saveSoon(); } }).observe(w);
    });
  }
  for (const [id, top] of scroll) { const s = document.getElementById('p-' + id); if (s) s.scrollTop = top; }
  document.body.classList.toggle('side-hidden', focus && !isPhone());
  applyZoom();
}
function groupEl(g: Group | Float, where: { zone?: ZoneId; gi?: number; fi?: number }): HTMLElement {
  const div = document.createElement('div'); div.className = 'dgroup';
  if (where.zone) { div.style.flex = `${(g as Group).size} 1 0`; div.dataset.zone = where.zone; div.dataset.gi = String(where.gi); } else div.dataset.fi = String(where.fi);
  div.style.setProperty('--cap', `var(--cap-${meta(g.active)[2]})`);
  if (maxed && g.panels.includes(maxed)) div.classList.add('max');
  const tabs = g.panels.map(id => { const [t, ic, cap] = meta(id); return `<button class="dtab${id === g.active ? ' on' : ''}" data-ptab="${esc(id)}" style="--tc: var(--cap-${cap})" title="${esc(t)} – drag to move">${icon(ic, 15)}<span>${esc(t)}</span></button>`; }).join('');
  const isMax = div.classList.contains('max');
  div.innerHTML = `<header class="dcap"><span class="dgrip" title="Drag to move this panel">${icon('grip', 14)}</span><div class="dtabs">${tabs}</div>
    <span class="dbtns"><button class="dbtn" data-act="zoom-" title="Smaller text (Ctrl + mouse wheel down)">${icon('textDown', 15)}</button><button class="dbtn" data-act="zoom+" title="Larger text (Ctrl + mouse wheel up)">${icon('textUp', 15)}</button>
    <button class="dbtn" data-act="float" title="${where.fi != null ? 'Dock again' : 'Float as a window'}">${icon(where.fi != null ? 'dockIn' : 'float', 14)}</button>
    ${where.fi != null ? '' : `<button class="dbtn" data-act="max" title="${isMax ? 'Restore' : 'Maximize'}">${icon(isMax ? 'restore' : 'max', 14)}</button>`}
    <button class="dbtn" data-act="close" title="Close (open it again from the Layouts menu)">${icon('close', 14)}</button></span></header><div class="dbody"></div>`;
  const body = div.querySelector<HTMLElement>('.dbody')!;
  for (const id of g.panels) { const s = section(id); if (!s) continue; body.appendChild(s); s.classList.toggle('hidden', id !== g.active); }
  const cap = div.querySelector<HTMLElement>('.dcap')!;
  cap.addEventListener('pointerdown', e => startDrag(e, div, g));
  cap.addEventListener('dblclick', e => { if (!(e.target as HTMLElement).closest('.dbtn')) toggleFloat(g.active); });
  div.querySelectorAll<HTMLElement>('.dtab').forEach(b => b.addEventListener('click', () => activate(b.dataset.ptab!)));
  div.querySelectorAll<HTMLElement>('.dtab').forEach(b => b.addEventListener('auxclick', e => { if (e.button === 1) close(b.dataset.ptab!); }));
  div.querySelectorAll<HTMLElement>('.dbtn').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'close') close(g.active);
    if (a === 'float') toggleFloat(g.active);
    if (a === 'zoom-' || a === 'zoom+') zoom(g.active, a === 'zoom+' ? 1 : -1);
    if (a === 'max') { maxed = maxed && g.panels.includes(maxed) ? null : g.active; render(); }
  }));
  return div;
}
/** the middle: the Bible views side by side (on a phone one at a time, as tabs) */
let centerTab = '';
const centerActive = () => { const all = L.zones.center.groups.flatMap(g => g.panels); return all.includes(centerTab) ? centerTab : (L.zones.center.groups[0]?.active || ''); };
function renderCenter(): void {
  const el = $('#zone-center'); el.innerHTML = ''; const gs = L.zones.center.groups;
  el.classList.toggle('zempty', !gs.length); document.getElementById('empty')?.classList.toggle('hidden', !!gs.length);
  if (isPhone() && gs.length) { const all = gs.flatMap(g => g.panels); const pg: Group = { panels: all, active: centerActive(), size: 1 }; const div = groupEl(pg, { zone: 'center', gi: 0 }); div.querySelectorAll<HTMLElement>('.dtab').forEach(b => b.addEventListener('click', () => { centerTab = b.dataset.ptab!; })); el.appendChild(div); return; }
  gs.forEach((g, gi) => { if (gi) el.appendChild(groupSplitter('center', gi)); el.appendChild(groupEl(g, { zone: 'center', gi })); });
}
/** phone: every open panel as a tab of one full-screen panel */
let phoneTab = '';
const sidePanels = () => [...ZONES.flatMap(z => L.zones[z].groups.flatMap(g => g.panels)), ...L.floats.flatMap(f => f.panels)];
const phoneActive = () => { const all = sidePanels(); return all.includes(phoneTab) ? phoneTab : all[0] || ''; };
function renderPhone(): void {
  for (const z of ZONES) { const el = $('#zone-' + z); el.innerHTML = ''; el.classList.toggle('zempty', z !== 'right'); }
  const el = $('#zone-right'); const all = sidePanels(); const act = phoneActive();
  el.innerHTML = `<div class="ptabs">${all.map(id => `<button data-ptab="${esc(id)}" class="${id === act ? 'on' : ''}">${esc(titleOf(id))}</button>`).join('')}<span class="grow"></span><button class="sideClose" aria-label="Close">✕</button></div>`;
  for (const id of all) { const s = section(id); if (!s) continue; el.appendChild(s); s.classList.toggle('hidden', id !== act); }
  el.querySelectorAll<HTMLElement>('[data-ptab]').forEach(b => b.onclick = () => activate(b.dataset.ptab!));
  el.querySelector<HTMLElement>('.sideClose')!.onclick = () => document.body.classList.remove('side-open');
}

/* ------------------------------------------------------------ text size per panel */
function applyZoom(): void {
  for (const [id, n] of Object.entries(L.zoom || {})) { const s = document.getElementById('p-' + id); if (s) s.style.setProperty('zoom', n ? String(Math.round((1 + n * 0.1) * 100) / 100) : ''); }
}
export function zoom(id: string, d: number): void {
  L.zoom = L.zoom || {}; L.zoom[id] = Math.max(-4, Math.min(8, (L.zoom[id] || 0) + d)); applyZoom(); saveSoon();
}

/* ------------------------------------------------------------ splitters */
function groupSplitter(z: ZoneId, gi: number): HTMLElement {
  const s = document.createElement('div'); s.className = 'gsplit ' + (z === 'bottom' || z === 'center' ? 'v' : 'h');
  s.addEventListener('pointerdown', e => {
    e.preventDefault(); s.setPointerCapture(e.pointerId);
    const gs = L.zones[z].groups; const a = gs[gi - 1], b = gs[gi];
    const ea = s.previousElementSibling as HTMLElement, eb = s.nextElementSibling as HTMLElement; const horiz = z === 'bottom' || z === 'center';
    const pa = horiz ? ea.offsetWidth : ea.offsetHeight, pb = horiz ? eb.offsetWidth : eb.offsetHeight;
    const tot = a.size + b.size, start = horiz ? e.clientX : e.clientY;
    const move = (ev: PointerEvent) => {
      const na = Math.max(60, Math.min(pa + pb - 60, pa + (horiz ? ev.clientX : ev.clientY) - start));
      a.size = tot * na / (pa + pb); b.size = tot - a.size; ea.style.flex = `${a.size} 1 0`; eb.style.flex = `${b.size} 1 0`;
    };
    const up = () => { s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); saveSoon(); };
    s.addEventListener('pointermove', move); s.addEventListener('pointerup', up);
  });
  return s;
}
function wireZoneSplitters(): void {
  document.querySelectorAll<HTMLElement>('.dsplit').forEach(sp => {
    const z = sp.dataset.z as ZoneId;
    sp.addEventListener('pointerdown', e => {
      e.preventDefault(); sp.setPointerCapture(e.pointerId);
      const el = $('#zone-' + z); const zone = L.zones[z]; const start = z === 'bottom' ? e.clientY : e.clientX; const s0 = zone.size;
      const move = (ev: PointerEvent) => {
        const d = (z === 'bottom' ? ev.clientY : ev.clientX) - start;
        const max = z === 'bottom' ? innerHeight - 200 : innerWidth - 340;
        zone.size = Math.round(Math.max(150, Math.min(max, s0 + (z === 'left' ? d : -d)))); el.style[z === 'bottom' ? 'height' : 'width'] = zone.size + 'px';
      };
      const up = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); saveSoon(); };
      sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
    });
  });
}
function clampFloat(w: HTMLElement): void {
  const x = Math.min(Math.max(0, parseInt(w.style.left)), innerWidth - 120), y = Math.min(Math.max(40, parseInt(w.style.top)), innerHeight - 60);
  w.style.left = x + 'px'; w.style.top = y + 'px';
}

/* ------------------------------------------------------------ dragging */
interface Target { edge?: ZoneId; kind?: 'tab' | 'before' | 'after'; zone?: ZoneId; gi?: number; fi?: number }
let drag: { id: string; g: Group | Float; div: HTMLElement; isFloat: boolean; sx: number; sy: number; ox: number; oy: number; started: boolean; ghost?: HTMLElement; over?: Element | null; target: Target | null } | null = null;
function startDrag(e: PointerEvent, div: HTMLElement, g: Group | Float): void {
  if (e.button !== 0 || (e.target as HTMLElement).closest('.dbtn')) return;
  const tab = (e.target as HTMLElement).closest<HTMLElement>('.dtab'); const id = tab ? tab.dataset.ptab! : g.active;
  const isFloat = div.classList.contains('dfloat');
  drag = { id, g, div, isFloat, sx: e.clientX, sy: e.clientY, started: false, ox: isFloat ? e.clientX - div.offsetLeft : 0, oy: isFloat ? e.clientY - div.offsetTop : 0, target: null };
  document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp, { once: true });
}
function onMove(e: PointerEvent): void {
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
    drag.started = true; document.body.classList.add('dragging');
    if (!drag.isFloat) { const [t, ic, cap] = meta(drag.id); const gh = document.createElement('div'); gh.className = 'dghost'; gh.style.setProperty('--cap', `var(--cap-${cap})`); gh.innerHTML = `${icon(ic, 15)}<span>${esc(t)}</span>`; document.body.appendChild(gh); drag.ghost = gh; }
    showEdgeTargets();
  }
  if (drag.ghost) { drag.ghost.style.left = e.clientX + 12 + 'px'; drag.ghost.style.top = e.clientY + 10 + 'px'; }
  if (drag.isFloat) { drag.div.style.left = e.clientX - drag.ox + 'px'; drag.div.style.top = e.clientY - drag.oy + 'px'; drag.div.style.pointerEvents = 'none'; }
  const under = document.elementsFromPoint(e.clientX, e.clientY);
  const tgt = under.find(el => el.classList?.contains('dtarget')) as HTMLElement | undefined;
  const grp = under.find(el => el.classList?.contains('dgroup') && el !== drag!.div) || null;
  if (grp !== drag.over && !(tgt && tgt.closest('.dcompass'))) { drag.over = grp; showCompass(grp as HTMLElement | null); }
  drag.target = tgt ? JSON.parse(tgt.dataset.t!) : null;
  document.querySelectorAll('.dtarget.hot').forEach(x => x.classList.remove('hot')); if (tgt) tgt.classList.add('hot');
  showPreview(drag.target, tgt);
}
function onUp(e: PointerEvent): void {
  document.removeEventListener('pointermove', onMove);
  const d = drag; drag = null; if (!d) return;
  document.body.classList.remove('dragging'); d.ghost?.remove(); $('#dlayer')?.remove();
  if (d.isFloat) d.div.style.pointerEvents = '';
  if (!d.started) return;
  if (d.target) return dropOn(d.id, d.target);
  if (d.isFloat) { const f = d.g as Float; clampFloat(d.div); f.x = parseInt(d.div.style.left); f.y = parseInt(d.div.style.top); saveSoon(); return; }
  // dropped where there is no target: a floating window there
  detach(d.id); L.floats.push({ panels: [d.id], active: d.id, x: e.clientX - 40, y: e.clientY - 14, w: 420, h: 380 }); maxed = null; commit();
}
function showEdgeTargets(): void {
  const wb = $('#work').getBoundingClientRect();
  const layer = document.createElement('div'); layer.className = 'dlayer'; layer.id = 'dlayer';
  const put = (t: Target, x: number, y: number, ic: string, title: string) => { const b = document.createElement('div'); b.className = 'dtarget edge'; b.dataset.t = JSON.stringify(t); b.title = title; b.style.left = x - 18 + 'px'; b.style.top = y - 18 + 'px'; b.innerHTML = icon(ic, 18); layer.appendChild(b); };
  put({ edge: 'left' }, wb.left + 26, wb.top + wb.height / 2, 'prev', 'A new pane on the left');
  put({ edge: 'right' }, wb.right - 26, wb.top + wb.height / 2, 'next', 'A new pane on the right');
  put({ edge: 'bottom' }, wb.left + wb.width / 2, wb.bottom - 26, 'import', 'A new pane at the bottom');
  const cb = $('#center').getBoundingClientRect(); put({ edge: 'center' }, cb.left + cb.width / 2, cb.top + 34, 'bible', 'Into the middle, beside the Bible views');
  const pv = document.createElement('div'); pv.className = 'dpreview hidden'; pv.id = 'dpreview'; layer.appendChild(pv);
  document.body.appendChild(layer);
}
function showCompass(grp: HTMLElement | null): void {
  document.querySelector('.dcompass')?.remove(); const layer = $('#dlayer'); if (!grp || !layer) return;
  const r = grp.getBoundingClientRect(); const c = document.createElement('div'); c.className = 'dcompass';
  c.style.left = r.left + r.width / 2 - 58 + 'px'; c.style.top = r.top + Math.min(r.height / 2, 160) - 58 + 'px';
  const where: Target = grp.dataset.zone ? { zone: grp.dataset.zone as ZoneId, gi: +grp.dataset.gi! } : { fi: +grp.dataset.fi! };
  const cells: [Target['kind'], string, string, number, number, boolean?][] = [['tab', 'Add as a tab here', 'plus', 1, 1]];
  if (where.zone) {
    if (where.zone === 'bottom' || where.zone === 'center') cells.push(['before', 'Put it to the left of this pane', 'prev', 1, 0], ['after', 'Put it to the right of this pane', 'next', 1, 2]);
    else cells.push(['before', 'Put it above this pane', 'prev', 0, 1, true], ['after', 'Put it below this pane', 'next', 2, 1, true]);
  }
  for (const [kind, title, ic, row, col, rot] of cells) {
    const b = document.createElement('div'); b.className = 'dtarget' + (rot ? ' rot' : '') + (kind === 'tab' ? ' mid' : '');
    b.dataset.t = JSON.stringify({ kind, ...where }); b.title = title; b.innerHTML = icon(ic, 18); b.style.gridRow = String(row + 1); b.style.gridColumn = String(col + 1); c.appendChild(b);
  }
  layer.appendChild(c);
}
function showPreview(t: Target | null, tgtEl?: HTMLElement): void {
  const pv = $('#dpreview'); if (!pv) return;
  if (!t) { pv.classList.add('hidden'); return; }
  const wb = $('#work').getBoundingClientRect(); let r: { left: number; top: number; width: number; height: number };
  if (t.edge === 'center') { const c = $('#center').getBoundingClientRect(); r = L.zones.center.groups.length ? { left: c.right - c.width / 3, top: c.top, width: c.width / 3, height: c.height } : c; }
  else if (t.edge) {
    const z = $('#zone-' + t.edge).getBoundingClientRect(); const size = L.zones[t.edge].size; const c = $('#center').getBoundingClientRect();
    r = t.edge === 'left' ? { left: wb.left, top: wb.top, width: z.width > 10 ? z.width : size, height: wb.height }
      : t.edge === 'right' ? { left: wb.right - (z.width > 10 ? z.width : size), top: wb.top, width: z.width > 10 ? z.width : size, height: wb.height }
        : { left: c.left, top: wb.bottom - (z.height > 10 ? z.height : size), width: c.width, height: z.height > 10 ? z.height : size };
  } else {
    const grp = tgtEl?.closest('.dcompass') && drag?.over; if (!grp) { pv.classList.add('hidden'); return; }
    const g = grp.getBoundingClientRect();
    if (t.kind === 'tab') r = g;
    else if (t.zone === 'bottom' || t.zone === 'center') r = { left: t.kind === 'before' ? g.left : g.left + g.width / 2, top: g.top, width: g.width / 2, height: g.height };
    else r = { left: g.left, top: t.kind === 'before' ? g.top : g.top + g.height / 2, width: g.width, height: g.height / 2 };
  }
  Object.assign(pv.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); pv.classList.remove('hidden');
}
function dropOn(id: string, t: Target): void {
  const target = t.zone ? L.zones[t.zone].groups[t.gi!] : t.fi != null ? L.floats[t.fi] : null;
  if (target && target.panels.length === 1 && target.panels[0] === id) return;
  detach(id); maxed = null;
  if (t.edge) newPane(id, t.edge);
  else if (t.kind === 'tab' && target) { target.panels.push(id); target.active = id; }
  else if (t.zone) {
    const gs = L.zones[t.zone].groups; const i = gs.indexOf(target as Group);
    if (i < 0) gs.push(g1([id])); else { const half = (target as Group).size / 2; (target as Group).size = half; gs.splice(t.kind === 'before' ? i : i + 1, 0, g1([id], half)); }
  }
  focus = false; commit(); activate(id);
}
function newPane(id: string, z: ZoneId): void {
  if (z === 'center') { const gs = L.zones.center.groups; gs.push(g1([id], gs.length ? gs.reduce((a, g) => a + g.size, 0) / gs.length : 1)); return; }
  const gs = L.zones[z].groups; gs.push(g1([id], gs.length ? gs.reduce((a, g) => a + g.size, 0) / gs.length : 1));
}

/* ------------------------------------------------------------ actions */
let saveT = 0;
function saveSoon(): void { clearTimeout(saveT); saveT = window.setTimeout(() => H.save(clone(L)), 250); }
function commit(): void { render(); saveSoon(); }
function toggleFloat(id: string): void {
  const at = locate(id); if (!at || 'hidden' in at) return;
  if ('float' in at) { detach(id); placeHome(id); }
  else { const el = document.getElementById('p-' + id)?.closest('.dgroup'); const r = el ? el.getBoundingClientRect() : { left: 200, top: 120 }; detach(id); L.floats.push({ panels: [id], active: id, x: Math.round(r.left + 30), y: Math.round(r.top + 30), w: 420, h: 380 }); }
  maxed = null; commit();
}
/** where a closed panel goes when it is opened again: beside its usual companions, else a pane on the right */
function placeHome(id: string): void {
  const home = PRESETS.standard[1];
  for (const z of ZONES) for (const g of home.zones[z].groups) if (g.panels.includes(id)) {
    const mate = L.zones[z].groups.find(x => x.panels.some(p => g.panels.includes(p)));
    if (mate) { mate.panels.push(id); mate.active = id; } else L.zones[z].groups.push(g1([id]));
    return;
  }
  const mate = L.zones.right.groups.find(x => x.panels.some(p => PANELS.includes(p)));
  if (id === 'dict' && mate) { mate.panels.push(id); mate.active = id; } else newPane(id, 'right');
}

export function initDock(layout: unknown, isHidden: boolean, host: DockHost): void {
  H = host; focus = isHidden; L = normalize(layout);
  wireZoneSplitters();
  let wasPhone = isPhone();
  addEventListener('resize', () => { if (isPhone() !== wasPhone) { wasPhone = isPhone(); render(); } document.querySelectorAll<HTMLElement>('.dfloat').forEach(clampFloat); });
  // Ctrl + mouse wheel over a panel: that panel's text size
  document.addEventListener('wheel', e => {
    if (!e.ctrlKey) return; const sec = (e.target as HTMLElement).closest?.<HTMLElement>('section.ptab'); if (!sec) return;
    e.preventDefault(); zoom(sec.id.slice(2), e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  render();
}
/** show a panel: open it if closed, leave “Bible only”, bring its tab to the front; on a phone open the panel screen */
export function activate(id: string, open = true): void {
  if (!known(id)) return;
  const at = locate(id);
  if (!at || 'hidden' in at) { if (at) L.hidden = L.hidden.filter(x => x !== id); placeHome(id); }
  else if (focus && open && !('float' in at)) { focus = false; document.dispatchEvent(new CustomEvent('dock-unhide')); }
  const at2 = locate(id);
  if (at2 && !('hidden' in at2)) at2.g.active = id;
  if (isPhone()) { if (at2 && 'zone' in at2 && at2.zone === 'center') { centerTab = id; document.body.classList.remove('side-open'); } else { phoneTab = id; if (open) document.body.classList.add('side-open'); } }
  commit(); H.shown(id);
}
/** open a panel in a pane of its own (added Bible and book views), or bring a closed panel back */
export function openPanel(id: string, to?: ZoneId): void {
  if (!known(id)) return;
  to = to || (id.startsWith('bible-') ? 'center' : 'right');
  if (isOpen(id)) return activate(id);
  L.hidden = L.hidden.filter(x => x !== id);
  if (FIXED[id]) placeHome(id); else newPane(id, to);
  if (focus) { focus = false; document.dispatchEvent(new CustomEvent('dock-unhide')); }
  if (isPhone()) { if (to === 'center') centerTab = id; else phoneTab = id; }
  commit(); H.shown(id);
}
export function close(id: string): void {
  detach(id); if (maxed === id) maxed = null;
  if (FIXED[id]) L.hidden.push(id);
  commit();
  for (const z of ALLZ) for (const g of L.zones[z].groups) H.shown(g.active);
  if (!FIXED[id]) { document.getElementById('p-' + id)?.remove(); delete L.zoom?.[id]; H.closed(id); }
}
export function setHidden(h: boolean): void { focus = h; maxed = null; render(); if (!h) for (const z of ZONES) for (const g of L.zones[z].groups) H.shown(g.active); }
/** use a whole layout (a preset or a saved one); added views it leaves out stay out of sight */
export function setLayout(l: unknown): void {
  const keepZoom = L.zoom;
  const keepCenter = L.zones.center.groups;
  L = normalize(l); if (!L.zoom || !Object.keys(L.zoom).length) L.zoom = keepZoom;
  if (!L.zones.center.groups.length) { const inUse = new Set(openPanels()); L.zones.center.groups = keepCenter.map(g => ({ ...g, panels: g.panels.filter(p => !inUse.has(p)) })).filter(g => g.panels.length); for (const g of L.zones.center.groups) if (!g.panels.includes(g.active)) g.active = g.panels[0]; }
  focus = false; maxed = null; commit();
  for (const z of ALLZ) for (const g of L.zones[z].groups) H.shown(g.active);
  for (const f of L.floats) H.shown(f.active);
}
export function resetLayout(): void { setLayout(DEFAULT_LAYOUT()); }
/** a panel's title changed (e.g. a Bible view now shows another Bible) */
export function retitle(): void { render(); }
