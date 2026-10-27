// The study panel: Commentary (follows the selected verse), Library (any commentary, dictionary, book or
// devotional) and Search. On a computer it sits beside the Bible text; on a phone it opens over it.
import canon from './legacy/canon.js';
import search from './legacy/search.js';
import { Bible } from './bibles';
import { BookMod, Topic } from './books';

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
let tab = 'cmt';
const lib = { cur: '' as string, topics: [] as Topic[], history: [] as { id: string; tid: Topic['id'] }[] };
let cmtSel = '';

export function initPanel(host: PanelHost): void {
  H = host;
  const st = H.settings() as { panelTab?: string; cmtSel?: string; libCur?: string };
  tab = st.panelTab || 'cmt'; cmtSel = st.cmtSel || ''; lib.cur = st.libCur || '';
  document.querySelectorAll<HTMLButtonElement>('[data-ptab]').forEach(b => b.onclick = () => show(b.dataset.ptab!));
  $('#libMod').onchange = () => openLib($<HTMLSelectElement>('#libMod').value);
  let ft = 0;
  $('#libFilter').oninput = () => { clearTimeout(ft); ft = window.setTimeout(filterTopics, 180); };
  $('#libPrev').onclick = () => stepTopic(-1); $('#libNext').onclick = () => stepTopic(1);
  $('#libBack').onclick = () => { if (lib.history.length < 2) return; lib.history.pop(); const p = lib.history[lib.history.length - 1]; if (p.id !== lib.cur) openLib(p.id, p.tid, false); else showTopic(p.tid, false); };
  $('#libTopics').addEventListener('keydown', e => { const d = { ArrowUp: -1, ArrowDown: 1 }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); stepTopic(d); } });
  $('#searchForm').onsubmit = e => { e.preventDefault(); runSearch(); };
  const sc = $<HTMLSelectElement>('#searchScope');
  sc.innerHTML = search.PREDEFINED.map(([id, label]: string[]) => `<option value="${id}">${esc(label)}</option>`).join('') + '<option value="book">Current book</option><option value="chapter">Current chapter</option>';
  // links inside entries: Bible references jump to the verse
  $('#side').addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-href]'); if (!a) return;
    e.preventDefault();
    const m = /[?&|]id=(\d+)\.(\d+)(?:\.(\d+))?/.exec(a.dataset.href || '');
    if (m) H.go(+m[1], +m[2], m[3] ? +m[3] : 1);
  });
  show(tab, false);
}

export function show(t: string, open = true): void {
  tab = t; (H.settings() as Record<string, unknown>).panelTab = t; H.save();
  document.querySelectorAll('[data-ptab]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.ptab === t));
  document.querySelectorAll('.ptab').forEach(p => p.classList.toggle('hidden', p.id !== 'p-' + t));
  if (open) document.body.classList.add('side-open');
  if (t === 'cmt') updateCommentary();
  if (t === 'lib') { fillLibSelect(); if (lib.cur && !lib.topics.length) openLib(lib.cur); }
  if (t === 'search') setTimeout(() => $<HTMLInputElement>('#searchInput').focus(), 50);
}

/* ---------------------------------------------------------------- Commentary */
let cseq = 0;
export async function updateCommentary(): Promise<void> {
  if (tab !== 'cmt') return;
  const { b, c, v } = H.ref(); const my = ++cseq;
  const list = H.books().filter(m => m.kind === 'commentary' && !m.locked).map(m => ({ m, hit: m.forVerse(b, c, v) }));
  const bk = canon.book(b, '1611').name;
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
  if (tab !== 'lib') show('lib');
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
function renderTopics(list: Topic[]): void {
  const ul = $('#libTopics');
  const kids = new Map<Topic['id'], Topic[]>(); for (const t of list) { const k = t.pid || 0; (kids.get(k) || kids.set(k, []).get(k)!).push(t); }
  const ids = new Set(list.map(t => t.id)); const out: string[] = [];
  const add = (pid: Topic['id'], depth: number) => { for (const t of kids.get(pid) || []) { out.push(`<li data-tid="${esc(t.id)}" style="padding-left:${8 + depth * 12}px"${kids.has(t.id) ? ' class="parent"' : ''}>${esc(t.subject || '(untitled)')}</li>`); if (depth < 6) add(t.id, depth + 1); } };
  add(0, 0);
  for (const t of list) if (t.pid && !ids.has(t.pid)) out.push(`<li data-tid="${esc(t.id)}">${esc(t.subject)}</li>`);
  ul.innerHTML = out.join('');
  $('#libCount').textContent = `${list.length} topic${list.length === 1 ? '' : 's'}`;
  ul.onclick = e => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-tid]'); if (li) showTopic(tidOf(li.dataset.tid!)); };
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
  document.querySelectorAll('#libTopics li.cur').forEach(x => x.classList.remove('cur'));
  const li = document.querySelector(`#libTopics li[data-tid="${CSS.escape(String(tid))}"]`); if (li) { li.classList.add('cur'); li.scrollIntoView({ block: 'nearest' }); }
  document.body.classList.add('lib-reading');
}
function stepTopic(d: number): void {
  const items = [...document.querySelectorAll<HTMLElement>('#libTopics li[data-tid]')]; if (!items.length) return;
  const cur = items.findIndex(li => li.classList.contains('cur'));
  const i = Math.max(0, Math.min(items.length - 1, cur < 0 ? 0 : cur + d));
  if (i !== cur) showTopic(tidOf(items[i].dataset.tid!));
}
/** a word or Strong's number: show the entry from the Strong's dictionaries */
export async function strongEntry(key: string): Promise<{ subject: string; html: string; src: string } | null> {
  const want = key[0].toUpperCase() === 'H' ? 'hebrew' : 'greek';
  const dicts = H.books().filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked).sort((a, b) => Number(b[want]) - Number(a[want]));
  for (const d of dicts) { const e = await d.lookup(key); if (e) return { ...e, src: d.title }; }
  return null;
}

/* ---------------------------------------------------------------- Search */
let sseq = 0;
async function runSearch(): Promise<void> {
  const q = $<HTMLInputElement>('#searchInput').value.trim(); if (!q) return;
  const my = ++sseq; const status = $('#searchStatus'); status.textContent = 'Searching…'; $('#searchResults').innerHTML = '';
  try {
    const mods = [];
    for (const b of H.openBibles()) mods.push({ id: b.id, abbr: b.abbr, mod: { allVerses: () => cache.get(b.id) || [] } });
    for (const b of H.openBibles()) if (!cache.has(b.id)) { status.textContent = `Reading ${b.abbr} for searching…`; cache.set(b.id, await b.allVerses()); }
    if (my !== sseq) return;
    await new Promise(r => setTimeout(r, 0));
    const r = search.run(mods, q, {
      scope: $<HTMLSelectElement>('#searchScope').value, current: H.ref(), mode: '1611',
      wholeWords: $<HTMLInputElement>('#optWhole').checked, ignoreCase: !$<HTMLInputElement>('#optCase').checked, limit: 1000,
    });
    if (my !== sseq) return;
    status.innerHTML = `<b>${r.total}</b> verse${r.total === 1 ? '' : 's'} · ${esc(r.explanation)} · ${r.ms} ms`;
    $('#searchResults').innerHTML = r.results.map((x: { abbr: string; b: number; c: number; v: number; ref: string; text: string; marks: [number, number][] }) => {
      let h = '', at = 0; for (const [s, e] of x.marks) { h += esc(x.text.slice(at, s)) + '<mark>' + esc(x.text.slice(s, e)) + '</mark>'; at = e; } h += esc(x.text.slice(at));
      return `<li data-b="${x.b}" data-c="${x.c}" data-v="${x.v}"><span class="r">${esc(x.ref)}</span>${mods.length > 1 ? `<span class="small">${esc(x.abbr)}</span> ` : ''}${h}</li>`;
    }).join('') + (r.total > r.results.length ? `<li class="small">… ${r.total - r.results.length} more not shown</li>` : '');
    $('#searchResults').querySelectorAll<HTMLElement>('li[data-b]').forEach(li => li.onclick = () => { H.go(+li.dataset.b!, +li.dataset.c!, +li.dataset.v!); if (window.matchMedia('(max-width: 720px)').matches) document.body.classList.remove('side-open'); });
  } catch (e) { status.textContent = String((e as Error).message || e); }
}
const cache = new Map<string, [number, number, number, string][]>();
export function forgetSearchCache(): void { cache.clear(); }
export { runSearch };
