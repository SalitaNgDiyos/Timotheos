// The study panel: Commentary (follows the selected verse), Library (any commentary, dictionary, book or
// devotional) and Search. On a computer it sits beside the Bible text; on a phone it opens over it.
import { focusSearch } from './search';
import { DEFAULT_LAYOUT, Layout, PANELS, activate, initDock, layout, visible } from './dock';
import { createView, viewClosed, viewShown, viewTitle } from './views';
import canon from './legacy/canon.js';
import { Bible } from './bibles';
import { BookMod, Topic } from './books';
import { renderStudy } from './study';

export interface PanelHost {
  books(): BookMod[];
  openBibles(): Bible[];
  ref(): { b: number; c: number; v: number };
  go(b: number, c: number, v?: number): Promise<void>;
  clean(html: string): string;
  save(): void;
  settings(): Record<string, unknown>;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KIND: Record<string, string> = { commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps' };

let H: PanelHost;
const lib = { cur: '' as string, topics: [] as Topic[], history: [] as { id: string; tid: Topic['id'] }[] };
let cmtSel = '';

export function initPanel(host: PanelHost): void {
  H = host;
  const st = H.settings() as { panelTab?: string; cmtSel?: string; libCur?: string; dock?: Partial<Layout>; sideHidden?: boolean };
  cmtSel = st.cmtSel || ''; lib.cur = st.libCur || '';
  // older settings had one panel with tabs: keep the tab that was open
  if (!st.dock && st.panelTab && PANELS.includes(st.panelTab)) { const l = DEFAULT_LAYOUT(); l.right.active = st.panelTab; st.dock = l; }
  $('#libMod').onchange = () => openLib($<HTMLSelectElement>('#libMod').value);
  let ft = 0;
  $('#libFilter').oninput = () => { clearTimeout(ft); ft = window.setTimeout(filterTopics, 180); };
  $('#libPrev').onclick = () => stepTopic(-1); $('#libNext').onclick = () => stepTopic(1);
  $('#libBack').onclick = () => { if (lib.history.length < 2) return; lib.history.pop(); const p = lib.history[lib.history.length - 1]; if (p.id !== lib.cur) openLib(p.id, p.tid, false); else showTopic(p.tid, false); };
  $('#libTopics').addEventListener('keydown', e => { const d = { ArrowUp: -1, ArrowDown: 1 }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); stepTopic(d); } });
  initDock(st.dock, !!st.sideHidden, {
    save: l => { (H.settings() as Record<string, unknown>).dock = l; H.save(); },
    shown, create: createView, title: viewTitle, closed: viewClosed,
  });
  for (const z of ['left', 'right', 'bottom'] as const) { const a = layout()[z].active; if (a && visible(a)) shown(a, true); }
}

/** show a panel (and, on a phone, open the panel screen) */
export function show(t: string, open = true): void { activate(t, open); }
/** a panel came on screen: bring it up to date */
function shown(t: string, quiet = false): void {
  if (t === 'cmt') updateCommentary();
  if (t === 'lib') { fillLibSelect(); if (lib.cur && !lib.topics.length) openLib(lib.cur); }
  if (t === 'study') renderStudy();
  if (t === 'search' && !quiet) focusSearch();
  if (!['cmt', 'lib', 'study', 'search'].includes(t)) viewShown(t);
}

/* ---------------------------------------------------------------- Commentary */
let cseq = 0;
export async function updateCommentary(): Promise<void> {
  if (!visible('cmt')) return;
  const { b, c, v } = H.ref(); const my = ++cseq;
  const list = H.books().filter(m => m.kind === 'commentary' && !m.locked).map(m => ({ m, hit: m.forVerse(b, c, v) }));
  const bk = canon.book(b).name;
  $('#cmtHead').textContent = `${bk} ${c}:${v}`;
  const chips = $('#cmtChips'); const body = $('#cmtBody');
  if (!list.length) { chips.innerHTML = ''; body.innerHTML = '<p class="hint">No commentaries yet. Import theWord (.cmt.twm) or e-Sword (.cmtx / .cmti) commentaries.</p>'; return; }
  if (!list.some(x => x.m.id === cmtSel)) cmtSel = (list.find(x => x.hit) || list[0]).m.id;
  chips.innerHTML = list.map(x => `<button class="chip${x.m.id === cmtSel ? ' on' : ''}${x.hit ? '' : ' none'}" data-cid="${esc(x.m.id)}" title="${esc(x.m.title)}">${esc(x.m.abbr)}${x.hit ? `<span class="dot${x.hit.level === 'verse' ? '' : ' ring'}"></span>` : ''}</button>`).join('');
  chips.querySelectorAll<HTMLButtonElement>('[data-cid]').forEach(bt => bt.onclick = () => { cmtSel = bt.dataset.cid!; (H.settings() as Record<string, unknown>).cmtSel = cmtSel; H.save(); updateCommentary(); });
  const sel = list.find(x => x.m.id === cmtSel)!;
  if (!sel.hit) { body.innerHTML = `<p class="hint">${esc(sel.m.title)} has no comment on ${esc(bk)} ${c}:${v}.</p>`; return; }
  const t = await sel.m.topic(sel.hit.id);
  if (my !== cseq) return;
  const lvl = { verse: '', passage: 'Comment on the passage', chapter: 'Comment on the whole chapter', book: 'Introduction to the book' }[sel.hit.level];
  body.innerHTML = `<div class="entry"><h4>${esc(sel.hit.subject)}</h4><div class="src">${esc(sel.m.title)}${lvl ? ' · ' + lvl : ''}</div>${t ? H.clean(t.html) : ''}</div>`;
  body.scrollTop = 0;
}
/** verses of the chapter that have a comment (for the small "c" marks) */
export function commentaryMarks(b: number, c: number): Set<number> {
  const s = new Set<number>();
  for (const m of H.books()) if (m.kind === 'commentary' && !m.locked) for (const v of m.verseMarks(b, c)) s.add(v);
  return s;
}

/* ---------------------------------------------------------------- Library */
function fillLibSelect(): void {
  const sel = $<HTMLSelectElement>('#libMod'); const keep = lib.cur;
  const mods = H.books().filter(m => !m.locked);
  sel.innerHTML = '<option value="">Choose a module…</option>' + ['commentary', 'dictionary', 'book', 'devotional', 'map'].map(k => {
    const l = mods.filter(m => m.kind === k).sort((a, b) => a.title.localeCompare(b.title));
    return l.length ? `<optgroup label="${KIND[k]}">${l.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>` : '';
  }).join('');
  sel.value = keep;
}
export async function openLib(id: string, tid?: Topic['id'], addHistory = true): Promise<void> {
  const m = H.books().find(x => x.id === id); if (!m) return;
  if (!visible('lib')) activate('lib');
  if (lib.cur !== id || !lib.topics.length) {
    lib.cur = id; (H.settings() as Record<string, unknown>).libCur = id; H.save();
    lib.topics = await m.topics(); fillLibSelect(); $<HTMLInputElement>('#libFilter').value = '';
    renderTopics(lib.topics);
  }
  if (tid == null && m.kind === 'devotional') { const d = new Date(); const t = await m.today(d.getMonth() + 1, d.getDate()); if (t[0]) tid = t[0].id; }
  if (tid == null && m.kind === 'commentary') { const { b, c, v } = H.ref(); const h = m.forVerse(b, c, v); if (h) tid = h.id; }
  if (tid == null) { const first = lib.topics.find(t => !t.pid) || lib.topics[0]; tid = first?.id; }
  if (tid != null) await showTopic(tid, addHistory);
}
/* The topic list draws only the rows in view (a commentary can have 24,000 topics; drawing them all
   froze the window). Rows have a fixed height. */
const ROW = 24;
let rows: { id: Topic['id']; subject: string; depth: number; parent: boolean }[] = [];
let curTid: Topic['id'] | null = null;
function renderTopics(list: Topic[]): void {
  const kids = new Map<Topic['id'], Topic[]>(); for (const t of list) { const k = t.pid || 0; (kids.get(k) || kids.set(k, []).get(k)!).push(t); }
  rows = [];
  const seen = new Set<Topic['id']>();
  const add = (pid: Topic['id'], depth: number) => { for (const t of kids.get(pid) || []) { if (seen.has(t.id)) continue; seen.add(t.id); rows.push({ id: t.id, subject: t.subject || '(untitled)', depth, parent: kids.has(t.id) }); if (depth < 6) add(t.id, depth + 1); } };
  add(0, 0);
  for (const t of list) if (!seen.has(t.id)) { seen.add(t.id); rows.push({ id: t.id, subject: t.subject || '(untitled)', depth: 0, parent: false }); }
  $('#libCount').textContent = `${list.length} topic${list.length === 1 ? '' : 's'}`;
  const ul = $('#libTopics'); ul.scrollTop = 0;
  ul.onclick = e => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-tid]'); if (li) showTopic(tidOf(li.dataset.tid!)); };
  ul.onscroll = () => drawRows();
  drawRows();
}
function drawRows(): void {
  const ul = $('#libTopics'); const h = ul.clientHeight || 400;
  const first = Math.max(0, Math.floor(ul.scrollTop / ROW) - 10), last = Math.min(rows.length, Math.ceil((ul.scrollTop + h) / ROW) + 10);
  let html = `<li class="vsp" style="height:${first * ROW}px"></li>`;
  for (let i = first; i < last; i++) { const r = rows[i]; html += `<li data-tid="${esc(String(r.id))}" style="padding-left:${8 + r.depth * 12}px" class="${r.parent ? 'parent' : ''}${r.id === curTid ? ' cur' : ''}">${esc(r.subject)}</li>`; }
  html += `<li class="vsp" style="height:${(rows.length - last) * ROW}px"></li>`;
  ul.innerHTML = html;
}
function showRow(tid: Topic['id']): void {
  const i = rows.findIndex(r => r.id === tid); const ul = $('#libTopics');
  if (i >= 0) { const top = i * ROW; if (top < ul.scrollTop || top + ROW > ul.scrollTop + ul.clientHeight) ul.scrollTop = Math.max(0, top - ul.clientHeight / 2); }
  drawRows();
}
const tidOf = (s: string): Topic['id'] => { const t = lib.topics.find(x => String(x.id) === s); return t ? t.id : (isNaN(+s) ? s : +s); };
async function filterTopics(): Promise<void> {
  const q = $<HTMLInputElement>('#libFilter').value.trim(); const m = H.books().find(x => x.id === lib.cur); if (!m) return;
  renderTopics(q ? await m.searchTopics(q) : lib.topics);
}
async function showTopic(tid: Topic['id'], addHistory = true): Promise<void> {
  const m = H.books().find(x => x.id === lib.cur); if (!m) return;
  const t = await m.topic(tid); if (!t) return;
  if (addHistory) { lib.history.push({ id: m.id, tid }); if (lib.history.length > 100) lib.history.shift(); }
  $('#libBody').innerHTML = `<div class="entry"><h4>${esc(t.subject)}</h4><div class="src">${esc(m.title)}</div>${H.clean(t.html) || '<p class="hint">(empty)</p>'}</div>`;
  $('#libBody').scrollTop = 0;
  curTid = tid; showRow(tid);
  document.body.classList.add('lib-reading');
}
function stepTopic(d: number): void {
  if (!rows.length) return;
  const cur = rows.findIndex(r => r.id === curTid);
  const i = Math.max(0, Math.min(rows.length - 1, cur < 0 ? 0 : cur + d));
  if (i !== cur) showTopic(rows[i].id);
}
/** a morphology code (e.g. V-PAI-3S): the entry from the morphology dictionaries */
export async function morphEntry(code: string): Promise<{ subject: string; html: string; src: string } | null> {
  const keys = [...new Set([code, code.toUpperCase(), code.replace(/\s+/g, ' ').trim(), code.replace(/\s+/g, ''), code.replace(/^[A-Z]{2,3}:/, '')])];
  for (const d of H.books().filter(m => m.kind === 'dictionary' && m.isMorph && !m.locked)) for (const k of keys) { const e = await d.lookup(k); if (e) return { ...e, src: d.title }; }
  return null;
}
/** a word or Strong's number: show the entry from the Strong's dictionaries */
export async function strongEntry(key: string): Promise<{ subject: string; html: string; src: string } | null> {
  const want = key[0].toUpperCase() === 'H' ? 'hebrew' : 'greek';
  const dicts = H.books().filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked).sort((a, b) => Number(b[want]) - Number(a[want]));
  for (const d of dicts) { const e = await d.lookup(key); if (e) return { ...e, src: d.title }; }
  return null;
}


/** theWord links to book modules: tw://dct.ABBR?t=TOPIC | ?tid=N, tw://bk.…, tw://cmt.…, tw://[self]?t=… */
export async function followBookLink(href: string): Promise<boolean> {
  const m = /^tw:\/\/(?:(dct|bk|cmt|map|dev)\.([^?#|]+)|\[(self)\])\?(?:t=([^&#|]*)|tid=(\d+))/i.exec(href);
  if (!m) return false;
  let mod = m[3] ? H.books().find(x => x.id === lib.cur) : undefined;
  if (!mod) { const want = decodeURIComponent(m[2] || '').toLowerCase(); mod = H.books().find(x => !x.locked && (x.abbr.toLowerCase() === want || x.title.toLowerCase().startsWith(want))); }
  if (!mod) return false;
  if (m[5]) { await openLib(mod.id, +m[5]); return true; }
  const e = await mod.lookup(decodeURIComponent(m[4] || '')); if (!e) return false;
  await openLib(mod.id, e.id); return true;
}

/** a module file changed (Properties): forget what was read from it and show it again */
export async function reloadLib(): Promise<void> {
  const cur = lib.cur; lib.topics = []; lib.history = [];
  fillLibSelect();
  if (cur && visible('lib') && H.books().some(m => m.id === cur)) await openLib(cur);
  updateCommentary();
}
export const libCurrent = () => H.books().find(m => m.id === lib.cur);
