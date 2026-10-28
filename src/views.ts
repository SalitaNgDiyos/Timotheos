// Panels that can be added from the Layouts menu, like theWord's views:
//   bible-N  another Bible view: a Bible of its own, following the main text or moving on its own
//   book-N   another book view: any commentary, dictionary, book or devotional, with its topic list
//   dict     Dictionary: the entry of the word under the mouse (follows the mouse, like theWord)
import TWRender from './legacy/render.js';
import canon from './legacy/canon.js';
import type { Bible } from './bibles';
import type { BookMod, Topic } from './books';
import { dialog, esc } from './ui';
import { icon } from './icons';
import { bibleViewClosed, bibleViewShown, createBibleView, render as renderBV } from './bibleviews';
import { applyMarks, bodyHtml } from './annotate';
import { exportTopics } from './export';
import { printHtml } from './tools';
import { createSearchView, moduleSets, modsOfSet, searchViewClosed, searchViewShown } from './search';

export interface ViewsHost {
  bibles(): Bible[]; openBibles(): Bible[]; books(): BookMod[]; bibleStyle(m: Bible): string; hiddenBibles(): string[];
  nav(): { id: number; name: string; abbr: string; grp: string; chapters: number[] }[];
  ref(): { b: number; c: number; v: number };
  go(b: number, c: number, v?: number): Promise<void>;
  show(): Record<string, boolean>;
  clean(html: string): string;
  showWord(el: HTMLElement, pinned?: boolean): void;
  speakEl(el: HTMLElement | null, mod?: BookMod): void; props(file: string, title: string): void;
  settings(): Record<string, unknown>; save(): void;
  retitle(): void;
}
interface BibleCfg { bible: string; follow: boolean; b: number; c: number }
interface BookCfg { mod: string; tid: Topic['id'] | null; follow?: boolean }
let H: ViewsHost;
const cfgs = (): Record<string, BibleCfg | BookCfg> => (H.settings().views as Record<string, BibleCfg | BookCfg>) || ((H.settings().views = {}) as Record<string, BibleCfg | BookCfg>);
const park = () => document.getElementById('parked')!;
const KIND: Record<string, string> = { commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps' };

export function initViews(host: ViewsHost): void {
  H = host;
  // the main text moved: following Bible views and the tree follow
  // a word's entry was looked up: the Dictionary panel shows it
  // book views that follow: a commentary the verse, a dictionary the word
  document.addEventListener('tanglaw-ref', () => { for (const [id, c] of Object.entries(cfgs())) if (id.startsWith('book-') && (c as BookCfg).follow) followBook(id, null); });
  document.addEventListener('tanglaw-key', e => { for (const [id, c] of Object.entries(cfgs())) if (id.startsWith('book-') && (c as BookCfg).follow) followBook(id, (e as CustomEvent).detail); });
  document.addEventListener('tanglaw-ref', () => { for (const id of compareViews()) renderCompare(id); });
  document.addEventListener('tanglaw-word', e => { const d = document.getElementById('dictBody'); if (d) { d.innerHTML = (e as CustomEvent).detail; d.scrollTop = 0; } });
}
const newId = (kind: string) => { let n = 1; while (cfgs()[`${kind}-${n}`] || document.getElementById(`p-${kind}-${n}`)) n++; return `${kind}-${n}`; };

/** a compare view: the verse in many Bibles */
export function addCompareView(): string { const id = newId('compare'); cfgs()[id] = { compare: 'all', diff: true } as unknown as BookCfg; H.save(); return id; }
export const compareViews = () => Object.keys(cfgs()).filter(k => k.startsWith('compare-'));
/** another search panel */
export function addSearchView(kind: 'search' | 'bsearch' = 'search'): string {
  const id = newId(kind); cfgs()[id] = { search: true } as unknown as BookCfg; H.save(); return id;
}
export function addBookView(): string {
  const id = newId('book'); cfgs()[id] = { mod: '', tid: null }; H.save(); return id;
}

export function viewTitle(id: string): string {
  const c = cfgs()[id];
  if (id.startsWith('bible-')) { const b = H.bibles().find(x => x.id === (c as BibleCfg)?.bible); return b ? b.abbr : 'Bible'; }
  if (id.startsWith('book-')) { const m = H.books().find(x => x.id === (c as BookCfg)?.mod); return m ? (m.abbr || m.title).slice(0, 18) : 'Book'; }
  if (id.startsWith('search-')) return 'Bible search ' + (+id.slice(7) + 1);
  if (id.startsWith('bsearch-')) return 'Book search ' + (+id.slice(8) + 1);
  if (id.startsWith('compare-')) return 'Compare';
  return id;
}
export function viewClosed(id: string): void { if (id.startsWith('search-') || id.startsWith('bsearch-')) searchViewClosed(id); delete cfgs()[id]; H.save(); if (id.startsWith('bible-')) bibleViewClosed(id); }

/** the section of a panel this module makes (null: not one of ours) */
export function createView(id: string): HTMLElement | null {
  const sec = document.createElement('section'); sec.className = 'ptab hidden'; sec.id = 'p-' + id;
  if (id !== 'dict' && !(/^(bible|book|search|bsearch|compare)-\d+$/.test(id) && cfgs()[id])) return null;
  park().appendChild(sec); // in the page before it is wired
  if (id === 'dict') sec.innerHTML = '<div id="dictBody" class="pbody entrybody"><p class="hint">Rest the mouse on a word with a Strong\'s number or morphology code: its dictionary entry shows here.</p></div>';
  else if (/^bible-\d+$/.test(id) && cfgs()[id]) { createBibleView(id, sec);
  } else if (/^compare-\d+$/.test(id)) {
    sec.innerHTML = `<div class="vbar"><select class="vcmp" title="Which Bibles"></select><label class="vfollow" title="Mark the words that differ from the first Bible"><input type="checkbox" class="vdiff"> differences</label><label class="vfollow" title="Show the whole passage around the verse"><input type="checkbox" class="vctx"> ±2 verses</label></div><div class="vcompare pbody"></div>`;
    wireCompare(id, sec);
  } else if (/^b?search-\d+$/.test(id)) { sec.classList.add('searchview'); createSearchView(sec, id);
  } else if (/^book-\d+$/.test(id) && cfgs()[id]) {
    sec.innerHTML = `<div class="bvwrap"><nav class="bvside bkside">
      <button class="ib tog on vlist" title="Show or hide the topic list">${icon('menu', 16)}</button>
      <button class="ib vprev" title="Previous topic">${icon('prev', 16)}</button><button class="ib vnext" title="Next topic">${icon('next', 16)}</button>
      <button class="ib tog vfol" title="Follow: a commentary shows the verse you read, a dictionary the word you point at">${icon('link', 16)}</button>
      <span class="bvsep"></span>
      <button class="ib vsmall" title="Smaller text">A−</button><button class="ib vlarge" title="Larger text">A+</button>
      <button class="ib tog on vmarks" title="Show your own marks (highlighting) in the topics">${icon('edit', 16)}</button>
      <span class="bvsep"></span>
      <button class="ib vprint" title="Print this topic">${icon('print', 16)}</button><button class="ib vexport" title="Export this topic or the whole module">${icon('import', 16)}</button>
      <span class="grow"></span>
      <button class="ib vspeak" title="Read aloud">${icon('speaker', 16)}</button><button class="ib vprops" title="Properties of this module">${icon('info', 16)}</button></nav>
    <div class="bvmain bkmain"><div class="cap bkcap"><select class="vset" title="Module set: which modules to choose from"></select><select class="vmod" title="Module"></select></div>
    <div class="libsplit"><div class="libside"><input class="vfilter" type="search" placeholder="Find a topic…" spellcheck="false"><ul class="vtopics"></ul><div class="vcount small"></div></div><div class="lsplit" title="Drag to make the topic list wider or narrower"></div><div class="vbody pbody entrybody"><p class="hint">Choose a commentary, dictionary or book.</p></div></div></div></div>`;
    wireBook(id, sec);
  }
  return sec;
}
/** a panel came on screen */
export function viewShown(id: string): void {
  if (id.startsWith('bible-')) bibleViewShown(id);
  if (id.startsWith('book-')) fillMods(id);
  if (id.startsWith('search-') || id.startsWith('bsearch-')) searchViewShown(id);
  if (id.startsWith('compare-')) renderCompare(id);
}
/** modules were read again */
export function viewsReload(): void {
  bookState.clear();
  for (const id of Object.keys(cfgs())) { const sec = document.getElementById('p-' + id); if (!sec) continue; if (id.startsWith('bible-')) renderBV(id, true); else if (id.startsWith('book-')) fillMods(id); }
}

/* ---------------------------------------------------------------- book view */
const ROW = 24;
const bookState = new Map<string, { rows: { id: Topic['id']; subject: string }[]; all: Topic[] }>();
function fillMods(id: string): void {
  const sec = document.getElementById('p-' + id)!; const c = cfgs()[id] as BookCfg; const sel = sec.querySelector<HTMLSelectElement>('.vmod')!;
  const sets = moduleSets(); const ss = sec.querySelector<HTMLSelectElement>('.vset')!;
  ss.innerHTML = '<option value="all">All</option>' + (Object.keys(sets).length ? `<optgroup label="Module sets">${Object.keys(sets).map(n => `<option value="set:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
  ss.value = (c as BookCfg & { set?: string }).set || 'all'; if (ss.selectedIndex < 0) ss.value = 'all';
  ss.classList.toggle('hidden', !Object.keys(sets).length);
  const inSet = new Set(modsOfSet(ss.value).map(m => m.id));
  const mods = H.books().filter(m => !m.locked && (inSet.has(m.id) || m.id === c.mod));
  sel.innerHTML = '<option value="">Choose a module…</option>' + ['commentary', 'dictionary', 'book', 'devotional', 'map'].map(k => { const l = mods.filter(m => m.kind === k).sort((a, b) => a.title.localeCompare(b.title)); return l.length ? `<optgroup label="${KIND[k]}">${l.map(m => `<option value="${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>` : ''; }).join('');
  sel.value = c.mod;
  if (c.mod && !bookState.has(id)) openBookMod(id, c.mod, c.tid);
}
function wireBook(id: string, sec: HTMLElement): void {
  const c = cfgs()[id] as BookCfg;
  sec.querySelector<HTMLSelectElement>('.vset')!.onchange = e => { (c as BookCfg & { set?: string }).set = (e.target as HTMLSelectElement).value; H.save(); fillMods(id); };
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
  sec.querySelector<HTMLElement>('.vprint')!.onclick = () => { const e = sec.querySelector('.vbody .entry'); if (!e) return; const c2 = e.cloneNode(true) as HTMLElement; const h = c2.querySelector('h4')?.textContent || ''; c2.querySelector('h4')?.remove(); printHtml(h, c2.innerHTML); };
  sec.querySelector<HTMLElement>('.vexport')!.onclick = async () => {
    const m = H.books().find(x => x.id === c.mod); if (!m) return; const all = await m.topics();
    const r = all.length > 1 ? await dialog('Export topics', `<p>What should be exported from <b>${esc(m.title)}</b>?</p>`, [{ label: 'Cancel', value: null }, { label: `All ${all.length} topics`, value: 'all' }, ...(c.tid != null ? [{ label: 'This topic', value: 'one', primary: true }] : [])]) : 'one';
    if (r) exportTopics(r === 'all' ? all.map(t => ({ mod: m, id: t.id })) : [{ mod: m, id: c.tid! }], H.clean);
  };
  const cx = c as BookCfg & { list?: boolean; size?: number; nomarks?: boolean };
  const fb = sec.querySelector<HTMLElement>('.vfol')!; fb.classList.toggle('on', !!c.follow); fb.onclick = () => { c.follow = !c.follow; fb.classList.toggle('on', c.follow); H.save(); if (c.follow) followBook(id, null); };
  const looks = () => {
    sec.querySelector('.libsplit')!.classList.toggle('nolist', cx.list === false); sec.querySelector('.vlist')!.classList.toggle('on', cx.list !== false);
    sec.querySelector<HTMLElement>('.vbody')!.style.fontSize = cx.size && cx.size !== 100 ? cx.size + '%' : '';
    sec.querySelector('.vbody')!.classList.toggle('nomarks', !!cx.nomarks); sec.querySelector('.vmarks')!.classList.toggle('on', !cx.nomarks);
  };
  looks();
  sec.querySelector<HTMLElement>('.vlist')!.onclick = () => { cx.list = cx.list === false; H.save(); looks(); };
  sec.querySelector<HTMLElement>('.vsmall')!.onclick = () => { cx.size = Math.max(60, (cx.size || 100) - 10); H.save(); looks(); };
  sec.querySelector<HTMLElement>('.vlarge')!.onclick = () => { cx.size = Math.min(220, (cx.size || 100) + 10); H.save(); looks(); };
  sec.querySelector<HTMLElement>('.vmarks')!.onclick = () => { cx.nomarks = !cx.nomarks; H.save(); looks(); };
  sec.querySelector<HTMLElement>('.vspeak')!.onclick = () => H.speakEl(sec.querySelector<HTMLElement>('.vbody .ebody, .vbody .entry'), H.books().find(x => x.id === c.mod));
  sec.querySelector<HTMLElement>('.vprops')!.onclick = () => { const m = H.books().find(x => x.id === c.mod); if (m) H.props(m.file, m.title); };
  sec.querySelector<HTMLElement>('.vprev')!.onclick = () => step(-1); sec.querySelector<HTMLElement>('.vnext')!.onclick = () => step(1);
  fillMods(id);
}
/** a following book view: the commentary on the current verse, or the dictionary entry for a word (Strong's number, lemma or the word) */
async function followBook(id: string, key: { strong?: string[]; lemma?: string; word?: string } | null): Promise<void> {
  const c = cfgs()[id] as BookCfg; const m = H.books().find(x => x.id === c.mod); if (!m || !document.getElementById('p-' + id)) return;
  if (!bookState.has(id)) await openBookMod(id, c.mod, c.tid);
  if (m.kind === 'commentary' && !key) { const r = H.ref(); const t = m.forVerse(r.b, r.c, r.v); if (t && t.id !== c.tid) showBookTopic(id, t.id); return; }
  if (m.kind === 'dictionary' && key) {
    for (const k of [...(key.strong || []), key.lemma, key.word].filter((x): x is string => !!x)) { const e = await m.lookup(k); if (e) { if (e.id !== c.tid) showBookTopic(id, e.id); return; } }
  }
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
  body.innerHTML = `<div class="entry"><h4>${esc(t.subject)}</h4><div class="src">${esc(m.title)}</div>${bodyHtml(m.id, t.id, H.clean(t.html) || '<p class="hint">(empty)</p>')}</div>`; applyMarks(body); body.scrollTop = 0;
  const st = bookState.get(id); const ul = sec.querySelector<HTMLElement>('.vtopics')!;
  if (st) { const i = st.rows.findIndex(r => r.id === tid); if (i >= 0 && (i * ROW < ul.scrollTop || i * ROW > ul.scrollTop + ul.clientHeight - ROW)) ul.scrollTop = Math.max(0, i * ROW - ul.clientHeight / 2); }
  drawTopics(id);
}

/* ---------------------------------------------------------------- compare view */
interface CompareCfg { compare: string; diff: boolean; ctx?: boolean }
function wireCompare(id: string, sec: HTMLElement): void {
  const c = cfgs()[id] as unknown as CompareCfg; const sel = sec.querySelector<HTMLSelectElement>('.vcmp')!;
  const sets = (H.settings().bibleSets as Record<string, string[]>) || {};
  sel.innerHTML = '<option value="all">All Bibles</option><option value="open">Open Bibles</option>' + (Object.keys(sets).length ? `<optgroup label="Bible sets">${Object.keys(sets).map(n => `<option value="set:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
  sel.value = c.compare; if (sel.selectedIndex < 0) sel.value = 'all';
  sel.onchange = () => { c.compare = sel.value; H.save(); renderCompare(id); };
  const df = sec.querySelector<HTMLInputElement>('.vdiff')!; df.checked = c.diff !== false; df.onchange = () => { c.diff = df.checked; H.save(); renderCompare(id); };
  const cx = sec.querySelector<HTMLInputElement>('.vctx')!; cx.checked = !!c.ctx; cx.onchange = () => { c.ctx = cx.checked; H.save(); renderCompare(id); };
  sec.querySelector('.vcompare')!.addEventListener('click', e => { const v = (e.target as HTMLElement).closest<HTMLElement>('[data-gov]'); if (v) H.go(H.ref().b, H.ref().c, +v.dataset.gov!); });
}
const words = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}']+/gu) || [];
/** mark the words of a verse that are not in the first Bible's verse */
function markDiff(html: string, base: Set<string>): string {
  const t = document.createElement('template'); t.innerHTML = html;
  const w = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; let n; while ((n = w.nextNode())) if (!(n.parentElement?.closest('sup, .strong, .morph'))) nodes.push(n as Text);
  for (const tn of nodes) {
    const parts = tn.data.split(/([\p{L}\p{N}']+)/u); if (parts.length < 2) continue;
    const frag = document.createDocumentFragment();
    parts.forEach((p, i) => { if (i % 2 && !base.has(words(p)[0] || '')) { const m = document.createElement('mark'); m.className = 'cdiff'; m.textContent = p; frag.appendChild(m); } else frag.appendChild(document.createTextNode(p)); });
    tn.replaceWith(frag);
  }
  return t.innerHTML;
}
async function renderCompare(id: string): Promise<void> {
  const sec = document.getElementById('p-' + id); const c = cfgs()[id] as unknown as CompareCfg; if (!sec || !c || sec.closest('#parked')) return;
  const r = H.ref(); const body = sec.querySelector<HTMLElement>('.vcompare')!;
  let list = H.bibles().filter(b => !H.hiddenBibles().includes(b.id));
  if (c.compare === 'open') list = H.openBibles();
  else if (c.compare.startsWith('set:')) { const ids = ((H.settings().bibleSets as Record<string, string[]>) || {})[c.compare.slice(4)] || []; list = ids.map(i => H.bibles().find(b => b.id === i)).filter((b): b is Bible => !!b); }
  const show = { ...H.show(), strongs: false, morph: false, footnotes: false, xrefs: false };
  const from = c.ctx ? Math.max(1, r.v - 2) : r.v, to = c.ctx ? r.v + 2 : r.v;
  const out: string[] = []; let base: Set<string> | null = null;
  for (const m of list) {
    const rows = (await m.chapter(r.b, r.c)).filter(x => x.v >= from && x.v <= to); if (!rows.length) continue;
    const html = rows.map(x => `${c.ctx ? `<sup class="vno${x.v === r.v ? ' cur' : ''}" data-gov="${x.v}">${x.v}</sup>` : ''}${TWRender.render(x.raw, m, show)}`).join(' ');
    let shown = html;
    if (c.diff !== false) { const t = document.createElement('div'); t.innerHTML = html; t.querySelectorAll('sup, .strong, .morph').forEach(s2 => s2.remove()); const ws = words(t.textContent || ''); if (!base) base = new Set(ws); else shown = markDiff(html, base); }
    out.push(`<div class="cmprow${m.rtl ? ' rtl' : ''}"><div class="cab" title="${esc(m.title)}">${esc(m.abbr)}</div><div class="ctx"${H.bibleStyle(m)}>${shown}</div></div>`);
  }
  body.innerHTML = `<div class="vhead">${esc(canon.book(r.b).name)} ${r.c}:${from === to ? r.v : `${from}–${to}`} <span class="small">${out.length} Bible${out.length === 1 ? '' : 's'}${c.diff !== false && out.length > 1 ? ' · words not in the first Bible are marked' : ''}</span></div>` + (out.join('') || '<p class="hint">No Bible here has this verse.</p>');
}
