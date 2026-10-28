// Rearrangeable panels: Commentary, Library, Search and My Study can sit at the left, the right or the
// bottom of the Bible text. Drag a tab onto another place (or right-click it → Move to…); drag the edges to
// resize. On a phone every panel shares the one full-screen panel.
import { $, esc, isPhone } from './ui';

export type ZoneId = 'left' | 'right' | 'bottom';
export interface Zone { panels: string[]; active: string; size: number }
export type Layout = Record<ZoneId, Zone>;
const TITLES: Record<string, string> = { cmt: 'Commentary', lib: 'Library', search: 'Search', study: 'My Study' };
export const PANELS = Object.keys(TITLES);
const ZONES: ZoneId[] = ['left', 'right', 'bottom'];
const MIN: Record<ZoneId, number> = { left: 220, right: 260, bottom: 140 };
export const DEFAULT_LAYOUT = (): Layout => ({ left: { panels: [], active: '', size: 340 }, right: { panels: [...PANELS], active: 'cmt', size: 400 }, bottom: { panels: [], active: '', size: 260 } });

let L: Layout = DEFAULT_LAYOUT();
let onSave: (l: Layout) => void = () => {};
let onShow: (id: string) => void = () => {};
let hidden = false;
const zoneEl = (z: ZoneId) => $('#zone-' + z);

/** a layout from settings, repaired: every panel exactly once */
function clean(l: Partial<Layout> | undefined): Layout {
  const out = DEFAULT_LAYOUT(); if (!l) return out;
  const seen = new Set<string>();
  for (const z of ZONES) {
    const src = l[z]; if (!src) continue;
    out[z].panels = (src.panels || []).filter(p => TITLES[p] && !seen.has(p) && seen.add(p));
    out[z].active = out[z].panels.includes(src.active) ? src.active : out[z].panels[0] || '';
    if (src.size) out[z].size = src.size;
  }
  for (const p of PANELS) if (!seen.has(p)) { out.right.panels.push(p); if (!out.right.active) out.right.active = p; }
  return out;
}
/** the layout in use now: on a phone everything is in one panel */
function effective(): Layout {
  if (!isPhone()) return L;
  const all = ZONES.flatMap(z => L[z].panels); const act = L.right.active || all[0];
  return { left: { panels: [], active: '', size: 0 }, right: { panels: PANELS.filter(p => all.includes(p)), active: act, size: 0 }, bottom: { panels: [], active: '', size: 0 } };
}
export const zoneOf = (id: string): ZoneId => ZONES.find(z => effective()[z].panels.includes(id)) || 'right';
/** is the panel on screen (the shown tab of a shown place)? */
export function visible(id: string): boolean {
  const z = zoneOf(id); const e = effective()[z];
  if (e.active !== id) return false;
  if (isPhone()) return document.body.classList.contains('side-open');
  return !hidden;
}

export function initDock(layout: Partial<Layout> | undefined, isHidden: boolean, save: (l: Layout) => void, show: (id: string) => void): void {
  L = clean(layout); hidden = isHidden; onSave = save; onShow = show;
  for (const z of ZONES) {
    const el = zoneEl(z);
    el.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.ptabs [data-ptab]'); if (b) activate(b.dataset.ptab!);
      if ((e.target as HTMLElement).closest('.sideClose')) document.body.classList.remove('side-open');
    });
    el.addEventListener('contextmenu', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('.ptabs [data-ptab]'); if (b && !isPhone()) { e.preventDefault(); tabMenu(b.dataset.ptab!, e.clientX, e.clientY); } });
  }
  wireSplitters(); wireDrag();
  let wasPhone = isPhone();
  addEventListener('resize', () => { if (isPhone() !== wasPhone) { wasPhone = isPhone(); apply(); } });
  apply();
}
export const layout = (): Layout => L;
export function setHidden(h: boolean): void { hidden = h; apply(); }
export function resetLayout(): void { L = DEFAULT_LAYOUT(); onSave(L); apply(); for (const z of ZONES) if (L[z].active) onShow(L[z].active); }

/** put the panels where the layout says and draw the tab bars */
function apply(): void {
  const E = effective();
  for (const z of ZONES) {
    const el = zoneEl(z); const zo = E[z];
    let bar = el.querySelector<HTMLElement>(':scope > .ptabs');
    if (!bar) { bar = document.createElement('div'); bar.className = 'ptabs'; el.prepend(bar); }
    bar.innerHTML = zo.panels.map(p => `<button data-ptab="${p}" draggable="${isPhone() ? 'false' : 'true'}" class="${p === zo.active ? 'on' : ''}" title="${esc(TITLES[p])} – drag to move, right-click for more">${esc(TITLES[p])}</button>`).join('') + '<span class="grow"></span><button class="sideClose phoneonly" aria-label="Close">✕</button>';
    for (const p of zo.panels) { const sec = $('#p-' + p); if (sec.parentElement !== el) el.appendChild(sec); sec.classList.toggle('hidden', p !== zo.active); }
    const empty = !zo.panels.length;
    el.classList.toggle('zempty', empty);
    document.querySelector(`.dsplit[data-z="${z}"]`)?.classList.toggle('zempty', empty || isPhone());
    if (!isPhone()) el.style[z === 'bottom' ? 'height' : 'width'] = Math.max(MIN[z], zo.size) + 'px'; else el.style.width = el.style.height = '';
  }
  document.body.classList.toggle('side-hidden', hidden && !isPhone());
}

/** show a panel (on a phone: open the panel screen) */
export function activate(id: string, open = true): void {
  if (!TITLES[id]) return;
  const z = zoneOf(id);
  if (isPhone()) { L.right.active = id; if (open) document.body.classList.add('side-open'); }
  else { L[z].active = id; if (hidden && open) { hidden = false; document.dispatchEvent(new CustomEvent('dock-unhide')); } }
  onSave(L); apply(); onShow(id);
}
export function move(id: string, to: ZoneId, before?: string): void {
  const from = zoneOf(id);
  L[from].panels = L[from].panels.filter(p => p !== id);
  if (L[from].active === id) L[from].active = L[from].panels[0] || '';
  const list = L[to].panels.filter(p => p !== id); const i = before ? list.indexOf(before) : -1;
  if (i >= 0) list.splice(i, 0, id); else list.push(id);
  L[to].panels = list; L[to].active = id;
  onSave(L); apply();
  onShow(id); if (L[from].active) onShow(L[from].active);
}

function tabMenu(id: string, x: number, y: number): void {
  const m = $('#vmenu'); const z = zoneOf(id);
  const label: Record<ZoneId, string> = { left: 'Move to the left', right: 'Move to the right', bottom: 'Move to the bottom' };
  m.innerHTML = `<div class="mh">${esc(TITLES[id])}</div>${ZONES.filter(t => t !== z).map(t => `<button data-mv="${t}">${label[t]}</button>`).join('')}<div class="msep"></div><button data-reset="1">Put all panels back on the right</button>`;
  m.classList.remove('hidden'); m.style.right = 'auto'; m.style.bottom = 'auto';
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + 'px';
  m.querySelectorAll<HTMLElement>('[data-mv]').forEach(b => b.onclick = () => { m.classList.add('hidden'); move(id, b.dataset.mv as ZoneId); });
  m.querySelector<HTMLElement>('[data-reset]')!.onclick = () => { m.classList.add('hidden'); resetLayout(); };
}

function wireSplitters(): void {
  document.querySelectorAll<HTMLElement>('.dsplit').forEach(sp => {
    const z = sp.dataset.z as ZoneId;
    sp.addEventListener('pointerdown', e => {
      e.preventDefault(); sp.setPointerCapture(e.pointerId);
      const el = zoneEl(z); const x0 = e.clientX, y0 = e.clientY, s0 = z === 'bottom' ? el.offsetHeight : el.offsetWidth;
      const max = z === 'bottom' ? innerHeight - 220 : innerWidth - 360;
      const mv = (ev: PointerEvent) => {
        const d = z === 'left' ? ev.clientX - x0 : z === 'right' ? x0 - ev.clientX : y0 - ev.clientY;
        L[z].size = Math.round(Math.max(MIN[z], Math.min(max, s0 + d))); el.style[z === 'bottom' ? 'height' : 'width'] = L[z].size + 'px';
      };
      const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); onSave(L); };
      sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
    });
  });
}

/** drag a tab onto a tab bar, or onto the left / right / bottom edge of the window */
function wireDrag(): void {
  const ov = document.createElement('div'); ov.id = 'dockDrop'; ov.className = 'hidden';
  ov.innerHTML = ZONES.map(z => `<div class="dz dz-${z}" data-z="${z}"><span>${z === 'left' ? 'Left' : z === 'right' ? 'Right' : 'Bottom'}</span></div>`).join('');
  document.body.appendChild(ov);
  let dragging = '';
  document.addEventListener('dragstart', e => {
    const b = (e.target as HTMLElement).closest?.<HTMLElement>('.ptabs [data-ptab]'); if (!b) return;
    dragging = b.dataset.ptab!; e.dataTransfer!.setData('text/plain', 'tanglaw-panel:' + dragging); e.dataTransfer!.effectAllowed = 'move';
    setTimeout(() => ov.classList.remove('hidden'), 0);
  });
  const end = () => { dragging = ''; ov.classList.add('hidden'); ov.querySelectorAll('.on').forEach(x => x.classList.remove('on')); document.querySelectorAll('.ptabs .dropb').forEach(x => x.classList.remove('dropb')); };
  document.addEventListener('dragend', end);
  ov.querySelectorAll<HTMLElement>('.dz').forEach(d => {
    d.addEventListener('dragover', e => { if (!dragging) return; e.preventDefault(); d.classList.add('on'); });
    d.addEventListener('dragleave', () => d.classList.remove('on'));
    d.addEventListener('drop', e => { e.preventDefault(); const id = dragging; end(); if (id) move(id, d.dataset.z as ZoneId); });
  });
  // dropping on another tab: put it there, before that tab
  document.addEventListener('dragover', e => { if (!dragging) return; const t = (e.target as HTMLElement).closest?.<HTMLElement>('.ptabs [data-ptab]'); if (t && t.dataset.ptab !== dragging) { e.preventDefault(); document.querySelectorAll('.ptabs .dropb').forEach(x => x !== t && x.classList.remove('dropb')); t.classList.add('dropb'); } });
  document.addEventListener('drop', e => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>('.ptabs [data-ptab]'); if (!dragging || !t) return;
    e.preventDefault(); const id = dragging, before = t.dataset.ptab!; end();
    if (before !== id) move(id, zoneOf(before), before);
  });
}
