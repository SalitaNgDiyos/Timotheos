// Panels that can be added from the Layouts menu, like theWord's views:
//   bible-N  another Bible view: a Bible of its own, following the main text or moving on its own
//   book-N   another book view: any commentary, dictionary, book or devotional, with its topic list
//   dict     Dictionary: the entry of the word under the mouse (follows the mouse, like theWord)
import TWRender from './legacy/render.js';
import canon from './legacy/canon.js';
import type { Bible } from './bibles';
import type { BookMod, Topic } from './books';
import { esc } from './ui';
import { icon } from './icons';
import { booksOf, openPicker } from './picker';

export interface ViewsHost {
  bibles(): Bible[]; openBibles(): Bible[]; books(): BookMod[];
  nav(): { id: number; name: string; abbr: string; grp: string; chapters: number[] }[];
  ref(): { b: number; c: number; v: number };
  go(b: number, c: number, v?: number): Promise<void>;
  show(): Record<string, boolean>;
  clean(html: string): string;
  showWord(el: HTMLElement, pinned?: boolean): void;
  settings(): Record<string, unknown>; save(): void;
  retitle(): void;
}
interface BibleCfg { bible: string; follow: boolean; b: number; c: number }
interface BookCfg { mod: string; tid: Topic['id'] | null }
let H: ViewsHost;
const cfgs = (): Record<string, BibleCfg | BookCfg> => (H.settings().views as Record<string, BibleCfg | BookCfg>) || ((H.settings().views = {}) as Record<string, BibleCfg | BookCfg>);
const park = () => document.getElementById('parked')!;
const KIND: Record<string, string> = { commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps' };

export function initViews(host: ViewsHost): void {
  H = host;
  // the main text moved: following Bible views and the tree follow
  document.addEventListener('tanglaw-ref', () => { for (const id of Object.keys(cfgs())) if (id.startsWith('bible-')) { const c = cfgs()[id] as BibleCfg; if (c.follow) renderBible(id); } });
  // a word's entry was looked up: the Dictionary panel shows it
  document.addEventListener('tanglaw-word', e => { const d = document.getElementById('dictBody'); if (d) { d.innerHTML = (e as CustomEvent).detail; d.scrollTop = 0; } });
}
const newId = (kind: string) => { let n = 1; while (cfgs()[`${kind}-${n}`] || document.getElementById(`p-${kind}-${n}`)) n++; return `${kind}-${n}`; };

/** a new Bible view (returns its panel id) */
export function addBibleView(): string {
  const id = newId('bible'); const r = H.ref(); const open = H.openBibles()[0];
  cfgs()[id] = { bible: (H.bibles().find(b => b !== open) || open)?.id || '', follow: true, b: r.b, c: r.c }; H.save(); return id;
}
export function addBookView(): string {
  const id = newId('book'); cfgs()[id] = { mod: '', tid: null }; H.save(); return id;
}

export function viewTitle(id: string): string {
  const c = cfgs()[id];
  if (id.startsWith('bible-')) { const b = H.bibles().find(x => x.id === (c as BibleCfg)?.bible); return b ? b.abbr : 'Bible'; }
  if (id.startsWith('book-')) { const m = H.books().find(x => x.id === (c as BookCfg)?.mod); return m ? (m.abbr || m.title).slice(0, 18) : 'Book'; }
  return id;
}
export function viewClosed(id: string): void { delete cfgs()[id]; H.save(); }

/** the section of a panel this module makes (null: not one of ours) */
export function createView(id: string): HTMLElement | null {
  const sec = document.createElement('section'); sec.className = 'ptab hidden'; sec.id = 'p-' + id;
  if (id !== 'dict' && !(/^(bible|book)-\d+$/.test(id) && cfgs()[id])) return null;
  park().appendChild(sec); // in the page before it is wired
  if (id === 'dict') sec.innerHTML = '<div id="dictBody" class="pbody entrybody"><p class="hint">Rest the mouse on a word with a Strong\'s number or morphology code: its dictionary entry shows here.</p></div>';
  else if (/^bible-\d+$/.test(id) && cfgs()[id]) {
    sec.innerHTML = `<div class="vbar"><select class="vbible" title="Bible"></select><button class="ib vpick" title="Books and chapters: choose where to read">${icon('tree', 16)}</button><button class="ib vprevc" title="Previous chapter">${icon('prev', 16)}</button><button class="ib vnextc" title="Next chapter">${icon('next', 16)}</button><label class="vfollow" title="Follow the main Bible text (untick to read elsewhere in this Bible)"><input type="checkbox" class="vfol"> follow</label></div><div class="vtext pbody"></div>`;
    wireBible(id, sec);
  } else if (/^book-\d+$/.test(id) && cfgs()[id]) {
    sec.innerHTML = `<div class="vbar"><select class="vmod" title="Module"></select><button class="ib vprev" title="Previous topic">‹</button><button class="ib vnext" title="Next topic">›</button></div><div class="libsplit"><div class="libside"><input class="vfilter" type="search" placeholder="Find a topic…" spellcheck="false"><ul class="vtopics"></ul><div class="vcount small"></div></div><div class="lsplit" title="Drag to make the topic list wider or narrower"></div><div class="vbody pbody entrybody"><p class="hint">Choose a commentary, dictionary or book.</p></div></div>`;
    wireBook(id, sec);
  }
  return sec;
}
/** a panel came on screen */
export function viewShown(id: string): void {
  if (id.startsWith('bible-')) renderBible(id);
  if (id.startsWith('book-')) fillMods(id);
}
/** modules were read again */
export function viewsReload(): void {
  bookState.clear();
  for (const id of Object.keys(cfgs())) { const sec = document.getElementById('p-' + id); if (!sec) continue; if (id.startsWith('bible-')) { fillBibles(id); renderBible(id); } else { fillMods(id); } }
}

/* ---------------------------------------------------------------- Bible view */
function fillBibles(id: string): void {
  const sec = document.getElementById('p-' + id)!; const c = cfgs()[id] as BibleCfg;
  const sel = sec.querySelector<HTMLSelectElement>('.vbible')!;
  sel.innerHTML = H.bibles().map(b => `<option value="${esc(b.id)}">${esc(b.abbr)} – ${esc(b.title)}</option>`).join('');
  if (!H.bibles().some(b => b.id === c.bible) && H.bibles()[0]) c.bible = H.bibles()[0].id;
  sel.value = c.bible;
}
function wireBible(id: string, sec: HTMLElement): void {
  const c = cfgs()[id] as BibleCfg;
  fillBibles(id);
  const fol = sec.querySelector<HTMLInputElement>('.vfol')!; fol.checked = c.follow;
  sec.querySelector<HTMLSelectElement>('.vbible')!.onchange = e => { c.bible = (e.target as HTMLSelectElement).value; H.save(); H.retitle(); renderBible(id); };
  fol.onchange = () => { c.follow = fol.checked; if (c.follow) { const r = H.ref(); c.b = r.b; c.c = r.c; } H.save(); renderBible(id); };
  // the books & chapters icon: choose a place; a following view moves the main text there too
  const place = (b: number, ch: number, v = 1) => { if (c.follow) H.go(b, ch, v); else { c.b = b; c.c = ch; H.save(); renderBible(id, v); } };
  sec.querySelector<HTMLElement>('.vpick')!.onclick = e => {
    const m = H.bibles().find(x => x.id === c.bible); if (!m) return;
    openPicker(e.currentTarget as HTMLElement, booksOf(m), { b: c.b, c: c.c, v: c.follow ? H.ref().v : 0 }, async (b, ch) => (m.books.get(b) || [])[ch - 1] || 0, place);
  };
  const stepC = (d: number) => {
    const m = H.bibles().find(x => x.id === c.bible); if (!m) return; const bk = booksOf(m); const i = bk.findIndex(x => x.id === c.b); if (i < 0) return;
    const j = bk[i].chapters.indexOf(c.c) + d;
    if (j >= 0 && j < bk[i].chapters.length) return place(c.b, bk[i].chapters[j]);
    const nb = bk[i + d]; if (nb) place(nb.id, d > 0 ? nb.chapters[0] : nb.chapters[nb.chapters.length - 1]);
  };
  sec.querySelector<HTMLElement>('.vprevc')!.onclick = () => stepC(-1); sec.querySelector<HTMLElement>('.vnextc')!.onclick = () => stepC(1);
  const body = sec.querySelector<HTMLElement>('.vtext')!;
  body.addEventListener('click', e => {
    const w = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn'); if (w) return void H.showWord(w, true);
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (row && c.follow) H.go(c.b, c.c, +row.dataset.v!);
  });
  let t = 0;
  body.addEventListener('mouseover', e => { const w = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn'); clearTimeout(t); if (w) t = window.setTimeout(() => H.showWord(w), 300); });
}
let bseq = 0;
async function renderBible(id: string, at = 0): Promise<void> {
  const sec = document.getElementById('p-' + id); if (!sec || sec.classList.contains('hidden')) return;
  const c = cfgs()[id] as BibleCfg; const m = H.bibles().find(b => b.id === c.bible);
  if (c.follow) { const r = H.ref(); c.b = r.b; c.c = r.c; }
  const body = sec.querySelector<HTMLElement>('.vtext')!;
  if (!m) { body.innerHTML = '<p class="hint">No Bible.</p>'; return; }
  const my = ++bseq; const rows = await m.chapter(c.b, c.c); if (my !== bseq) return;
  const r = H.ref(); const show = H.show();
  body.innerHTML = rows.length ? `<div class="vhead">${esc(canon.book(c.b).name)} ${c.c} <span class="small">${esc(m.abbr)}</span></div>` + rows.map(x => `<div class="vrow${c.follow && x.v === r.v ? ' sel' : ''}${m.rtl ? ' rtl' : ''}" data-v="${x.v}"${m.font ? ` style="font-family:'TwGreek','TwHebrew','${esc(m.font)}',var(--font-text)"` : ''}><span class="vn">${x.v}</span> ${TWRender.render(x.raw, m, show, { fn: { n: 0 } })}</div>`).join('')
    : `<p class="hint">${esc(m.abbr)} does not have ${esc(canon.book(c.b).name)} ${c.c}.</p>`;
  const sel = body.querySelector<HTMLElement>('.vrow.sel') || (at > 1 ? body.querySelector<HTMLElement>(`.vrow[data-v="${at}"]`) : null); if (sel) sel.scrollIntoView({ block: 'center' }); else body.scrollTop = 0;
}

/* ---------------------------------------------------------------- book view */
const ROW = 24;
const bookState = new Map<string, { rows: { id: Topic['id']; subject: string }[]; all: Topic[] }>();
function fillMods(id: string): void {
  const sec = document.getElementById('p-' + id)!; const c = cfgs()[id] as BookCfg; const sel = sec.querySelector<HTMLSelectElement>('.vmod')!;
  const mods = H.books().filter(m => !m.locked);
  sel.innerHTML = '<option value="">Choose a module…</option>' + ['commentary', 'dictionary', 'book', 'devotional', 'map'].map(k => { const l = mods.filter(m => m.kind === k).sort((a, b) => a.title.localeCompare(b.title)); return l.length ? `<optgroup label="${KIND[k]}">${l.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>` : ''; }).join('');
  sel.value = c.mod;
  if (c.mod && !bookState.has(id)) openBookMod(id, c.mod, c.tid);
}
function wireBook(id: string, sec: HTMLElement): void {
  const c = cfgs()[id] as BookCfg;
  sec.querySelector<HTMLSelectElement>('.vmod')!.onchange = e => { c.mod = (e.target as HTMLSelectElement).value; c.tid = null; H.save(); H.retitle(); openBookMod(id, c.mod, null); };
  const ul = sec.querySelector<HTMLElement>('.vtopics')!;
  ul.onscroll = () => drawTopics(id);
  ul.onclick = e => { const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-i]'); if (li) showBookTopic(id, bookState.get(id)!.rows[+li.dataset.i!].id); };
  let ft = 0;
  sec.querySelector<HTMLInputElement>('.vfilter')!.oninput = e => { clearTimeout(ft); ft = window.setTimeout(async () => {
    const q = (e.target as HTMLInputElement).value.trim(); const m = H.books().find(x => x.id === c.mod); const st = bookState.get(id); if (!m || !st) return;
    st.rows = (q ? await m.searchTopics(q) : st.all).map(t => ({ id: t.id, subject: t.subject || '(untitled)' })); ul.scrollTop = 0; drawTopics(id); count(id);
  }, 180); };
  const step = (d: number) => { const st = bookState.get(id); if (!st) return; const i = st.rows.findIndex(r => r.id === c.tid); const j = Math.max(0, Math.min(st.rows.length - 1, i < 0 ? 0 : i + d)); if (st.rows[j]) showBookTopic(id, st.rows[j].id); };
  sec.querySelector<HTMLElement>('.vprev')!.onclick = () => step(-1); sec.querySelector<HTMLElement>('.vnext')!.onclick = () => step(1);
  fillMods(id);
}
const count = (id: string) => { const sec = document.getElementById('p-' + id)!; sec.querySelector('.vcount')!.textContent = `${bookState.get(id)?.rows.length || 0} topics`; };
async function openBookMod(id: string, mod: string, tid: Topic['id'] | null): Promise<void> {
  const m = H.books().find(x => x.id === mod); const sec = document.getElementById('p-' + id); if (!m || !sec) return;
  const all = await m.topics(); bookState.set(id, { all, rows: all.map(t => ({ id: t.id, subject: t.subject || '(untitled)' })) });
  sec.querySelector<HTMLElement>('.vtopics')!.scrollTop = 0; drawTopics(id); count(id);
  let t = tid;
  if (t == null && m.kind === 'commentary') { const r = H.ref(); t = m.forVerse(r.b, r.c, r.v)?.id ?? null; }
  if (t == null && all[0]) t = all[0].id;
  if (t != null) showBookTopic(id, t);
}
function drawTopics(id: string): void {
  const sec = document.getElementById('p-' + id); const st = bookState.get(id); if (!sec || !st) return;
  const ul = sec.querySelector<HTMLElement>('.vtopics')!; const c = cfgs()[id] as BookCfg; const h = ul.clientHeight || 300;
  const first = Math.max(0, Math.floor(ul.scrollTop / ROW) - 10), last = Math.min(st.rows.length, Math.ceil((ul.scrollTop + h) / ROW) + 10);
  let html = `<li class="vsp" style="height:${first * ROW}px"></li>`;
  for (let i = first; i < last; i++) html += `<li data-i="${i}"${st.rows[i].id === c.tid ? ' class="cur"' : ''}>${esc(st.rows[i].subject)}</li>`;
  ul.innerHTML = html + `<li class="vsp" style="height:${(st.rows.length - last) * ROW}px"></li>`;
}
async function showBookTopic(id: string, tid: Topic['id']): Promise<void> {
  const c = cfgs()[id] as BookCfg; const m = H.books().find(x => x.id === c.mod); const sec = document.getElementById('p-' + id); if (!m || !sec) return;
  const t = await m.topic(tid); if (!t) return;
  c.tid = tid; H.save();
  const body = sec.querySelector<HTMLElement>('.vbody')!;
  body.innerHTML = `<div class="entry"><h4>${esc(t.subject)}</h4><div class="src">${esc(m.title)}</div>${H.clean(t.html) || '<p class="hint">(empty)</p>'}</div>`; body.scrollTop = 0;
  const st = bookState.get(id); const ul = sec.querySelector<HTMLElement>('.vtopics')!;
  if (st) { const i = st.rows.findIndex(r => r.id === tid); if (i >= 0 && (i * ROW < ul.scrollTop || i * ROW > ul.scrollTop + ul.clientHeight - ROW)) ul.scrollTop = Math.max(0, i * ROW - ul.clientHeight / 2); }
  drawTopics(id);
}
