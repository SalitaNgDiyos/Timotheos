// Panels around the Bible text, like theWord: each panel sits at the left, the right or the bottom (drag its
// tab, or right-click it), can be closed (× on the tab) and opened again from the Layouts menu, and new
// ones can be added (more Bible views, more book views). Layouts can be saved by name. On a phone every
// open panel shares the one full-screen panel.
import { $, esc, isPhone } from './ui';

export type ZoneId = 'left' | 'right' | 'bottom';
export interface Zone { panels: string[]; active: string; size: number }
export type Layout = Record<ZoneId, Zone>;
const FIXED: Record<string, string> = { cmt: 'Commentary', lib: 'Library', search: 'Search', study: 'My Study', dict: 'Dictionary', tree: 'Books & chapters' };
/** the panels there is one of (more Bible and book views can be added) */
export const PANELS = Object.keys(FIXED);
const ZONES: ZoneId[] = ['left', 'right', 'bottom'];
const MIN: Record<ZoneId, number> = { left: 200, right: 240, bottom: 120 };
export const DEFAULT_LAYOUT = (): Layout => ({ left: { panels: [], active: '', size: 300 }, right: { panels: ['cmt', 'lib', 'search', 'study'], active: 'cmt', size: 400 }, bottom: { panels: [], active: '', size: 260 } });

export interface DockHost {
  save(l: Layout): void;
  shown(id: string): void;                       // a panel came on screen
  create(id: string): HTMLElement | null;        // the section of an added panel (null: unknown id)
  title(id: string): string;                     // tab title of an added panel
  closed(id: string): void;                      // an added panel was closed for good
}
let L: Layout = DEFAULT_LAYOUT();
let H: DockHost;
let hidden = false;
const zoneEl = (z: ZoneId) => $('#zone-' + z);
export const titleOf = (id: string) => FIXED[id] || H.title(id);
const known = (id: string) => !!FIXED[id] || !!document.getElementById('p-' + id) || !!H.create(id);

/** a layout from settings, repaired: each panel at most once, unknown panels dropped */
function clean(l: Partial<Layout> | undefined): Layout {
  const out = DEFAULT_LAYOUT(); if (!l) return out;
  const seen = new Set<string>();
  for (const z of ZONES) {
    const src = l[z]; if (!src) { out[z].panels = []; out[z].active = ''; continue; }
    out[z].panels = (src.panels || []).filter(p => !seen.has(p) && known(p) && seen.add(p));
    out[z].active = out[z].panels.includes(src.active) ? src.active : out[z].panels[0] || '';
    if (src.size) out[z].size = src.size;
  }
  return out;
}
/** the layout in use now: on a phone all open panels are in one place */
function effective(): Layout {
  if (!isPhone()) return L;
  const all = ZONES.flatMap(z => L[z].panels); const act = all.includes(L.right.active) ? L.right.active : all[0] || '';
  return { left: { panels: [], active: '', size: 0 }, right: { panels: all, active: act, size: 0 }, bottom: { panels: [], active: '', size: 0 } };
}
export const zoneOf = (id: string): ZoneId | null => ZONES.find(z => effective()[z].panels.includes(id)) || null;
export const isOpen = (id: string) => ZONES.some(z => L[z].panels.includes(id));
export const openPanels = () => ZONES.flatMap(z => L[z].panels);
/** is the panel on screen (the shown tab of a shown place)? */
export function visible(id: string): boolean {
  const z = zoneOf(id); if (!z) return false;
  if (effective()[z].active !== id) return false;
  if (isPhone()) return document.body.classList.contains('side-open');
  return !hidden;
}

export function initDock(layout: Partial<Layout> | undefined, isHidden: boolean, host: DockHost): void {
  H = host; hidden = isHidden; L = clean(layout);
  for (const z of ZONES) {
    const el = zoneEl(z);
    el.addEventListener('click', e => {
      const x = (e.target as HTMLElement).closest<HTMLElement>('.ptabs .tclose'); if (x) { e.stopPropagation(); close(x.dataset.close!); return; }
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
export const layout = (): Layout => JSON.parse(JSON.stringify(L));
export const isHiddenAll = () => hidden;
export function setHidden(h: boolean): void { hidden = h; apply(); if (!h) for (const z of ZONES) if (L[z].active) H.shown(L[z].active); }
/** use a whole layout (a preset or a saved one) */
export function setLayout(l: Partial<Layout>): void {
  // added views that this layout leaves out are kept (out of sight), so a saved layout can bring them back
  L = clean(l); hidden = false; H.save(L); apply();
  for (const z of ZONES) if (L[z].active) H.shown(L[z].active);
}
export function resetLayout(): void { setLayout(DEFAULT_LAYOUT()); }

/** put the panels where the layout says and draw the tab bars */
function apply(): void {
  const E = effective(); const park = $('#parked');
  for (const z of ZONES) {
    const el = zoneEl(z); const zo = E[z];
    let bar = el.querySelector<HTMLElement>(':scope > .ptabs');
    if (!bar) { bar = document.createElement('div'); bar.className = 'ptabs'; el.prepend(bar); }
    bar.innerHTML = zo.panels.map(p => `<span class="ptab-t${p === zo.active ? ' on' : ''}"><button data-ptab="${esc(p)}" draggable="${isPhone() ? 'false' : 'true'}" class="${p === zo.active ? 'on' : ''}" title="${esc(titleOf(p))} – drag to move, right-click for more">${esc(titleOf(p))}</button>${isPhone() ? '' : `<i class="tclose" data-close="${esc(p)}" title="Close this panel (Layouts menu opens it again)">×</i>`}</span>`).join('') + '<span class="grow"></span><button class="sideClose phoneonly" aria-label="Close">✕</button>';
    for (const p of zo.panels) {
      let sec = document.getElementById('p-' + p);
      if (!sec) { sec = H.create(p); if (!sec) continue; }
      if (sec.parentElement !== el) el.appendChild(sec);
      sec.classList.toggle('hidden', p !== zo.active);
    }
    const empty = !zo.panels.length;
    el.classList.toggle('zempty', empty);
    document.querySelector(`.dsplit[data-z="${z}"]`)?.classList.toggle('zempty', empty || isPhone());
    if (!isPhone()) el.style[z === 'bottom' ? 'height' : 'width'] = Math.max(MIN[z], zo.size) + 'px'; else el.style.width = el.style.height = '';
  }
  // closed panels keep their contents, out of sight
  document.querySelectorAll<HTMLElement>('section.ptab').forEach(sec => { const id = sec.id.slice(2); if (!isOpen(id) && sec.parentElement !== park) park.appendChild(sec); });
  document.body.classList.toggle('side-hidden', hidden && !isPhone());
}

/** show a panel (opening it if it was closed); on a phone, open the panel screen */
export function activate(id: string, open = true): void {
  if (!isOpen(id)) { if (!known(id)) return; L.right.panels.push(id); }
  const z = zoneOf(id)!;
  if (isPhone()) { L.right.active = id; if (open) document.body.classList.add('side-open'); }
  else { L[z].active = id; if (hidden && open) { hidden = false; document.dispatchEvent(new CustomEvent('dock-unhide')); } }
  H.save(L); apply(); H.shown(id);
}
/** add a panel at a place (an added Bible or book view, or a closed panel) */
export function openPanel(id: string, to: ZoneId = 'right'): void {
  if (isOpen(id)) return activate(id);
  if (!known(id)) return;
  L[to].panels.push(id); L[to].active = id; if (hidden) { hidden = false; document.dispatchEvent(new CustomEvent('dock-unhide')); }
  H.save(L); apply(); H.shown(id);
}
export function close(id: string): void {
  const z = ZONES.find(x => L[x].panels.includes(id)); if (!z) return;
  L[z].panels = L[z].panels.filter(p => p !== id);
  if (L[z].active === id) L[z].active = L[z].panels[0] || '';
  H.save(L); apply();
  if (L[z].active) H.shown(L[z].active);
  if (!FIXED[id]) { document.getElementById('p-' + id)?.remove(); H.closed(id); }
}
export function move(id: string, to: ZoneId, before?: string): void {
  const from = ZONES.find(x => L[x].panels.includes(id)); if (!from) return openPanel(id, to);
  L[from].panels = L[from].panels.filter(p => p !== id);
  if (L[from].active === id) L[from].active = L[from].panels[0] || '';
  const list = L[to].panels.filter(p => p !== id); const i = before ? list.indexOf(before) : -1;
  if (i >= 0) list.splice(i, 0, id); else list.push(id);
  L[to].panels = list; L[to].active = id;
  H.save(L); apply();
  H.shown(id); if (L[from].active) H.shown(L[from].active);
}
/** a panel's title changed (e.g. a Bible view now shows another Bible) */
export function retitle(): void { apply(); }

function tabMenu(id: string, x: number, y: number): void {
  const m = $('#vmenu'); const z = zoneOf(id);
  const label: Record<ZoneId, string> = { left: 'Move to the left', right: 'Move to the right', bottom: 'Move to the bottom' };
  m.innerHTML = `<div class="mh">${esc(titleOf(id))}</div>${ZONES.filter(t => t !== z).map(t => `<button data-mv="${t}">${label[t]}</button>`).join('')}<button data-cl="1">Close this panel</button><div class="msep"></div><button data-reset="1">Default layout</button>`;
  m.classList.remove('hidden'); m.style.right = 'auto'; m.style.bottom = 'auto';
  m.style.left = Math.min(x, innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(y, innerHeight - m.offsetHeight - 8) + 'px';
  m.querySelectorAll<HTMLElement>('[data-mv]').forEach(b => b.onclick = () => { m.classList.add('hidden'); move(id, b.dataset.mv as ZoneId); });
  m.querySelector<HTMLElement>('[data-cl]')!.onclick = () => { m.classList.add('hidden'); close(id); };
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
      const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); H.save(L); };
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
  document.addEventListener('dragover', e => { if (!dragging) return; const t = (e.target as HTMLElement).closest?.<HTMLElement>('.ptabs [data-ptab]'); if (t && t.dataset.ptab !== dragging) { e.preventDefault(); document.querySelectorAll('.ptabs .dropb').forEach(x => x !== t && x.classList.remove('dropb')); t.classList.add('dropb'); } });
  document.addEventListener('drop', e => {
    const t = (e.target as HTMLElement).closest?.<HTMLElement>('.ptabs [data-ptab]'); if (!dragging || !t) return;
    e.preventDefault(); const id = dragging, before = t.dataset.ptab!; end();
    if (before !== id) { const z = zoneOf(before); if (z) move(id, z, before); }
  });
}
