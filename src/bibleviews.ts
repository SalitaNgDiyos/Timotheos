// Bible views (theWord's Bible views): each pane shows one Bible. Its side bar holds its navigation (books and
// chapters, previous / next), the Bible, the font, and what to show (Strong's numbers, morphology, lemmas,
// paragraphs, column text, verse numbers, footnotes, cross-references…). Views that "follow" move together;
// a view whose link is off reads on by itself. The view last clicked is the active one: the keyboard, the
// Commentary panel, copying and printing go with it. Its text element carries the id "view".
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import type { Bible } from './bibles';
import { commentaryMarks, strongEntry, updateCommentary } from './panel';
import { afterRender } from './study';
import { chapterXrefs } from './xrefs';
import { booksOf, openPicker, PickBook } from './picker';
import { firstOriginal, translit } from './translit';
import { icon } from './icons';
import { $, esc, isPhone } from './ui';

export interface ViewLook { font?: string; size?: number; lineH?: number; vnPos?: 'margin' | 'inline' | 'hidden'; vnStyle?: 'normal' | 'bold' | 'circle'; fnStyle?: 'num' | 'letter' | 'star'; fnPlace?: 'text' | 'chapter' }
export interface BVCfg { bible: string; follow: boolean; b: number; c: number; v?: number; show?: Record<string, boolean>; look?: ViewLook; colLines?: Record<string, boolean>; tree?: boolean }
type Ref = { b: number; c: number; v: number };
export interface BVHost {
  settings(): { fontSize: number; ref: { b: number; c: number; v?: number }; show: Record<string, boolean>; look: ViewLook & Record<string, unknown>; views?: Record<string, unknown>; bvActive?: string; colLines?: Record<string, boolean>; dictPref?: Record<string, string> };
  save(): void; bibles(): Bible[]; hidden(): string[]; bibleStyle(m: Bible): string;
  retitle(): void; flash(msg: string): void;
  /** the place of the active view changed (the Commentary panel, Bible views that follow, compare…) */
  moved(): void;
  /** module switches defined by a Bible (for the options) */
  customToggles(m: Bible): { name: string; label: string }[]; customOn(n: string): boolean; setCustom(n: string, on: boolean): void;
  speak(id: string): void;
}
let H: BVHost;
const cfgs = (): Record<string, BVCfg> => (H.settings().views as Record<string, BVCfg>) || ((H.settings().views = {}) as Record<string, BVCfg>);
export const bvIds = () => Object.keys(cfgs()).filter(k => k.startsWith('bible-')).sort((a, b) => +a.slice(6) - +b.slice(6));
export const bvCfg = (id: string): BVCfg | undefined => cfgs()[id];
export const bibleOf = (id: string): Bible | undefined => { const c = bvCfg(id); return c ? H.bibles().find(b => b.id === c.bible) : undefined; };
let active = '';
export const activeId = () => (active && bvCfg(active) && document.getElementById('p-' + active) ? active : bvIds().find(id => document.getElementById('p-' + id)) || '');
export const activeBible = () => bibleOf(activeId());
/** the place the active view shows (a view that follows: the shared place) */
export function activeRef(): Ref { const id = activeId(); const c = id ? bvCfg(id) : undefined; const s = H.settings().ref; return c && !c.follow ? { b: c.b, c: c.c, v: c.v || 1 } : { b: s.b, c: s.c, v: s.v || 1 }; }
const refOf = (id: string): Ref => { const c = bvCfg(id)!; const s = H.settings().ref; return c.follow ? { b: s.b, c: s.c, v: s.v || 1 } : { b: c.b, c: c.c, v: c.v || 1 }; };
/** the Bibles of the open Bible views, the active one first */
export function viewBibles(): Bible[] {
  const ids = bvIds().filter(id => document.getElementById('p-' + id)); const a = activeId();
  const out: Bible[] = [];
  for (const id of [a, ...ids.filter(x => x !== a)]) { const m = bibleOf(id); if (m && !out.includes(m)) out.push(m); }
  return out;
}

/* ---------------------------------------------------------------- settings of one view */
export const effShow = (id: string): Record<string, boolean> => ({ ...H.settings().show, ...(bvCfg(id)?.show || {}) });
export const effLook = (id: string): ViewLook => ({ ...(H.settings().look as ViewLook), ...(bvCfg(id)?.look || {}) });
const colOn = (id: string, k: string) => ({ ...(H.settings().colLines || {}), ...(bvCfg(id)?.colLines || {}) })[k] !== false;
/** switch something on or off in one view (keys S, M, P… act on the active view) */
export function toggleShow(id: string, k: string, on?: boolean): boolean {
  const c = bvCfg(id); if (!c) return false;
  const v = on ?? !effShow(id)[k]; c.show = { ...(c.show || {}), [k]: v }; H.save(); render(id, true); return v;
}

/* ---------------------------------------------------------------- making a view */
export function initBibleViews(host: BVHost): void {
  H = host;
  document.addEventListener('pointerdown', e => { const sec = (e.target as HTMLElement).closest?.<HTMLElement>('section.bvsec'); if (sec) setActive(sec.id.slice(2)); }, true);
}
/** a new Bible view (returns its id); with a Bible, else the active view's Bible or the first */
export function addBibleView(bible?: string): string {
  let n = 1; while (cfgs()[`bible-${n}`] || document.getElementById(`p-bible-${n}`)) n++;
  const id = `bible-${n}`; const r = activeRef();
  cfgs()[id] = { bible: bible || activeBible()?.id || H.bibles()[0]?.id || '', follow: true, b: r.b, c: r.c }; H.save(); return id;
}
const SIDE: [string, string, string][] = [ // key, label, title
  ['strongs', 'S', "Strong's numbers (S)"], ['morph', 'M', 'Morphology codes (M)'], ['lemma', 'L', 'Lemmas (L)'], ['paragraph', '¶', 'Paragraphs (P)'], ['columns', '⫼', 'Column text: words over their originals (Alt+I)'],
  ['footnotes', 'F', 'Footnotes (F)'], ['xrefs', 'X', 'Cross-references (X)'], ['headings', 'H', 'Headings (H)'], ['woj', 'J', 'Words of Jesus in red (J)'],
];
export function createBibleView(id: string, sec: HTMLElement): void {
  sec.classList.add('bvsec');
  sec.innerHTML = `<div class="bvwrap"><nav class="bvside">
      <button class="ib" data-bv="tree" title="Books and chapters">${icon('tree', 16)}</button>
      <button class="ib" data-bv="prev" title="Previous chapter (←)">${icon('prev', 16)}</button><button class="ib" data-bv="next" title="Next chapter (→)">${icon('next', 16)}</button>
      <button class="ib tog" data-bv="follow" title="Move together with the other Bible views (untick to read on by itself)">${icon('link', 16)}</button>
      <span class="bvsep"></span>
      <button class="ib" data-bv="font" title="Font and size of this view">A</button>
      ${SIDE.map(([k, l, t]) => `<button class="ib tog lt" data-bvt="${k}" title="${t}">${l}</button>`).join('')}
      <button class="ib" data-bv="vn" title="Verse numbers">#</button>
      <span class="grow"></span>
      <button class="ib" data-bv="speak" title="Read aloud">${icon('speaker', 16)}</button>
      <button class="ib" data-bv="opts" title="All options of this view">${icon('gear', 16)}</button></nav>
    <div class="bvtree hidden"></div>
    <div class="bvmain"><div class="cap bvcap"><button class="bvbible" title="Bible of this view"></button><select class="bvbook" aria-label="Book"></select><select class="bvchap" aria-label="Chapter"></select><select class="bvverse" aria-label="Verse" title="Verse"></select><span class="bvref"></span><span class="grow"></span><span class="small bvtime"></span></div>
    <div class="view bview" tabindex="0" data-bvid="${id}"></div></div></div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => sec.querySelector(s) as T;
  sec.querySelector('.bvside')!.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!b) return;
    setActive(id);
    if (b.dataset.bvt) { toggleShow(id, b.dataset.bvt); return; }
    switch (b.dataset.bv) {
      case 'tree': { const c = bvCfg(id)!; c.tree = !c.tree; H.save(); drawTree(id); break; }
      case 'prev': stepChapter(id, -1); break;
      case 'next': stepChapter(id, 1); break;
      case 'follow': { const c = bvCfg(id)!; c.follow = !c.follow; if (!c.follow) { const r = H.settings().ref; c.b = r.b; c.c = r.c; c.v = r.v; } H.save(); render(id, true); H.flash(c.follow ? 'This view moves with the others' : 'This view reads on by itself'); H.moved(); break; }
      case 'font': fontPop(id, b); break;
      case 'vn': vnPop(id, b); break;
      case 'opts': optsPop(id, b); break;
      case 'speak': H.speak(id); break;
    }
  });
  q('.bvbible').onclick = e => biblePop(id, e.currentTarget as HTMLElement);
  q<HTMLSelectElement>('.bvbook').onchange = e => navigate(id, +(e.target as HTMLSelectElement).value, 1);
  q<HTMLSelectElement>('.bvchap').onchange = e => { const r = refOf(id); navigate(id, r.b, +(e.target as HTMLSelectElement).value); };
  q<HTMLSelectElement>('.bvverse').onchange = e => { const v = +(e.target as HTMLSelectElement).value; selectVerse(id, v); q('.bview').querySelector(`[data-v="${v}"]`)?.scrollIntoView({ block: 'center' }); };
  q('.bvref').onclick = () => pickPlace(id, q('.bvref'));
}
export function bibleViewShown(id: string): void { render(id, false); if (!active || !document.getElementById('p-' + active)) setActive(id); }
export function bibleViewClosed(id: string): void { if (active === id) { active = ''; const n = activeId(); if (n) setActive(n); } }

/* ---------------------------------------------------------------- the active view */
const IDS: [string, string][] = [['.bview', 'view'], ['.bvref', 'capRef'], ['[data-bv="tree"]', 'capPick'], ['.bvbook', 'bookSel'], ['.bvchap', 'chapSel'], ['.bvverse', 'verseSel'], ['.bvtime', 'timing']];
export function setActive(id: string): void {
  const sec = document.getElementById('p-' + id); if (!sec || !bvCfg(id)) return;
  const before = active ? activeRef() : null; const was = active;
  if (was !== id) for (const [sel, nid] of IDS) { const old = document.getElementById(nid); if (old && old.closest('section.bvsec')) old.removeAttribute('id'); const el = sec.querySelector(sel); if (el) el.id = nid; }
  if (was === id && document.getElementById('view')?.closest('section') === sec) return;
  for (const [sel, nid] of IDS) { const el = sec.querySelector(sel); if (el && !el.id) el.id = nid; }
  active = id; H.settings().bvActive = id;
  document.querySelectorAll('section.bvsec').forEach(s => s.classList.toggle('bvactive', s === sec));
  const now = activeRef();
  if (!before || before.b !== now.b || before.c !== now.c || before.v !== now.v) H.moved();
}

/* ---------------------------------------------------------------- moving around */
let seq = 0; const vseq = new Map<string, number>();
const back: Ref[] = [], fwd: Ref[] = []; let pushHistory = true;
export function historyGo(d: number): void {
  const from = d < 0 ? back : fwd, to = d < 0 ? fwd : back; const r = from.pop(); if (!r) return;
  to.push(activeRef()); pushHistory = false; go(r.b, r.c, r.v);
}
/** go somewhere in the active view (and every view that follows with it) */
export async function go(b: number, c: number, v = 1): Promise<void> { const id = activeId(); if (!id) { H.settings().ref = { b, c, v }; H.save(); return; } await navigate(id, b, c, v); }
export async function navigate(id: string, b: number, c: number, v = 1): Promise<void> {
  const cfg = bvCfg(id); if (!cfg) return;
  const m = bibleOf(id); const books = m ? booksOf(m) : [];
  const bk = books.find(x => x.id === b) || books[0]; if (bk) { b = bk.id; if (!bk.chapters.includes(c)) c = bk.chapters[0]; }
  const cur = refOf(id);
  if (pushHistory && id === activeId() && (cur.b !== b || cur.c !== c)) { back.push(cur); if (back.length > 200) back.shift(); fwd.length = 0; }
  pushHistory = true;
  if (cfg.follow) {
    H.settings().ref = { b, c, v }; H.save();
    await Promise.all(bvIds().filter(x => bvCfg(x)!.follow && document.getElementById('p-' + x)).map(x => render(x, false)));
  } else { cfg.b = b; cfg.c = c; cfg.v = v; H.save(); await render(id, false); }
  if (id === activeId()) H.moved();
}
export function stepChapter(id: string, d: number): void {
  const m = bibleOf(id); if (!m) return; const books = booksOf(m); const r = refOf(id);
  const i = books.findIndex(x => x.id === r.b); if (i < 0) return;
  const bk = books[i]; const j = bk.chapters.indexOf(r.c) + d;
  if (j >= 0 && j < bk.chapters.length) return void navigate(id, bk.id, bk.chapters[j]);
  const nb = books[i + d]; if (nb) navigate(id, nb.id, d > 0 ? nb.chapters[0] : nb.chapters[nb.chapters.length - 1]);
}
export function stepBook(id: string, d: number): void { const m = bibleOf(id); if (!m) return; const books = booksOf(m); const i = books.findIndex(x => x.id === refOf(id).b); const n = books[i + d]; if (n) navigate(id, n.id, n.chapters[0]); }
export function selectVerse(id: string, v: number): void {
  const root = viewEl(id); if (!root) return;
  const el = root.querySelector<HTMLElement>(`[data-v="${v}"]`);
  if (!el) { if (v < 1) stepChapter(id, -1); else stepChapter(id, 1); return; }
  root.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
  el.scrollIntoView({ block: 'nearest' });
  const cfg = bvCfg(id)!;
  if (cfg.follow) { H.settings().ref.v = v; for (const x of bvIds()) if (x !== id && bvCfg(x)!.follow) markVerse(x, v); } else cfg.v = v;
  H.save(); const vs = document.getElementById('p-' + id)?.querySelector<HTMLSelectElement>('.bvverse'); if (vs) vs.value = String(v);
  if (id === activeId()) H.moved();
}
function markVerse(id: string, v: number): void { const root = viewEl(id); if (!root) return; root.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); root.querySelector(`[data-v="${v}"]`)?.classList.add('sel'); }
const viewEl = (id: string) => document.getElementById('p-' + id)?.querySelector<HTMLElement>('.bview') || null;
function pickPlace(id: string, btn: HTMLElement): void {
  const m = bibleOf(id); if (!m) return; const r = refOf(id);
  openPicker(btn, booksOf(m), r, async (b, ch) => (m.books.get(b) || [])[ch - 1] || 0, (b, ch, v) => navigate(id, b, ch, v));
}
/** re-draw every open view (e.g. after an option changed) */
export function renderAll(keep = true): Promise<void[]> { return Promise.all(bvIds().filter(id => document.getElementById('p-' + id)).map(id => render(id, keep))); }
/** the views that follow, after the shared place changed elsewhere */
export function renderFollowing(): Promise<void[]> { return Promise.all(bvIds().filter(id => bvCfg(id)!.follow && document.getElementById('p-' + id)).map(id => render(id, false))); }

/* ---------------------------------------------------------------- drawing a chapter */
export async function render(id: string, keepScroll: boolean): Promise<void> {
  const sec = document.getElementById('p-' + id); const cfg = bvCfg(id); if (!sec || !cfg) return;
  const root = sec.querySelector<HTMLElement>('.bview')!;
  if (!H.bibles().some(b => b.id === cfg.bible) && H.bibles()[0]) { cfg.bible = (H.bibles().find(b => !H.hidden().includes(b.id)) || H.bibles()[0]).id; H.save(); H.retitle(); }
  const m = bibleOf(id);
  const bb = sec.querySelector<HTMLElement>('.bvbible')!; bb.textContent = m ? m.abbr : '—'; bb.title = m ? `${m.title} – click to choose another Bible` : 'Choose a Bible';
  if (!m) { root.innerHTML = '<p class="hint">No Bibles yet. Import theWord (.ont, .ot, .nt) or e-Sword (.bblx, .bbli) Bibles from the Bibles menu.</p>'; return; }
  const books = booksOf(m); let { b, c, v } = refOf(id);
  const bk = books.find(x => x.id === b) || books[0]; if (!bk) { root.innerHTML = '<p class="hint">This Bible has no books.</p>'; return; }
  if (bk.id !== b) { b = bk.id; c = bk.chapters[0]; v = 1; } else if (!bk.chapters.includes(c)) { c = bk.chapters[0]; v = 1; }
  // caption: book, chapter, verse
  const bs = sec.querySelector<HTMLSelectElement>('.bvbook')!;
  bs.innerHTML = groupOptions(books); bs.value = String(bk.id);
  const cs = sec.querySelector<HTMLSelectElement>('.bvchap')!; cs.innerHTML = bk.chapters.map(n => `<option>${n}</option>`).join(''); cs.value = String(c);
  sec.querySelector('.bvref')!.textContent = `${bk.name} ${c}`;
  const my = ++seq; vseq.set(id, my); const t0 = performance.now();
  const chapter = await m.chapter(bk.id, c);
  if (vseq.get(id) !== my) return;
  const vmax = chapter.length ? chapter[chapter.length - 1].v : 0;
  const vs = sec.querySelector<HTMLSelectElement>('.bvverse')!; vs.innerHTML = Array.from({ length: vmax }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''); vs.value = String(Math.min(v, vmax) || 1);
  const show = effShow(id), look = effLook(id);
  const marks = commentaryMarks(bk.id, c);
  const ctx = { fn: { n: 0 } };
  const cell = (raw: string) => TWRender.render(raw, m, show, ctx);
  const vin = (n: number) => look.vnPos === 'inline' ? `<sup class="vnum">${n}</sup>` : '';
  let html = '';
  if (show.paragraph) {
    // the verses run on as text; a paragraph ends where the Bible marks one (theWord's <CM>);
    // a Bible without paragraph marks borrows them from another open view's Bible that has them
    let ends = new Set(chapter.filter(r => /<CM>\s*$/.test(r.raw)).map(r => r.v));
    if (!ends.size) for (const o of viewBibles()) { if (o === m) continue; const ch = await o.chapter(bk.id, c); const e = new Set(ch.filter(r => /<CM>\s*$/.test(r.raw)).map(r => r.v)); if (e.size) { ends = e; break; } }
    html = `<div class="paraview"><div class="pcol${m.rtl ? ' rtl' : ''}"><p class="ppara">`;
    for (const r of chapter) {
      html += `<span class="pv${r.v === v ? ' sel' : ''}" data-v="${r.v}" data-col="0">${look.vnPos === 'hidden' ? '' : `<sup class="vnum pvn">${r.v}</sup>`}${cell(r.raw)}</span> `;
      if (ends.has(r.v)) html += '</p><p class="ppara">';
    }
    html += '</p></div></div>';
  } else {
    html = '<div class="rows">';
    for (const r of chapter) {
      html += `<div class="vrow${r.v === v ? ' sel' : ''}${m.rtl ? ' rtl' : ''}" data-v="${r.v}"><span class="vn"><span class="vno">${r.v}</span>${marks.has(r.v) ? '<i class="cm" title="Commentary">c</i>' : ''}</span><div class="vtexts"><div class="vt${m.rtl ? ' rtl' : ''}" data-col="0">${vin(r.v)}${cell(r.raw)}</div></div></div>`;
    }
    html += '</div>';
  }
  const top = root.scrollTop; root.innerHTML = html;
  // this view's look: its font and size, verse numbers, Bible font
  const st = H.bibleStyle(m).replace(/^ style="|"$/g, '');
  root.setAttribute('style', `${st}${look.font ? `font-family:'TwGreek','TwHebrew','${look.font.replace(/'/g, '')}',var(--font-text);` : ''}${look.size && look.size !== 100 ? `--size:${Math.round(H.settings().fontSize * look.size / 100)}px;` : ''}${look.lineH ? `--lh:${look.lineH};` : ''}`);
  root.dataset.vnpos = look.vnPos || 'margin'; root.dataset.vnstyle = look.vnStyle || 'normal';
  root.classList.toggle('colmode', !!show.columns);
  afterRender(bk.id, c, root, [m], show);
  decorateFootnotes(root, look, show);
  if (show.columns) columnWords(id, root, my); else if (show.lemma) showLemmas(root);
  if (show.xrefs && !show.paragraph) await decorateXrefs(root, bk.id, c, () => vseq.get(id) === my);
  root.scrollTop = keepScroll ? top : 0;
  if (!keepScroll && v > 1) root.querySelector(`[data-v="${v}"]`)?.scrollIntoView({ block: 'center' });
  sec.querySelector('.bvtime')!.textContent = `${Math.round(performance.now() - t0)} ms`;
  // the side bar shows what is on
  sec.querySelectorAll<HTMLElement>('[data-bvt]').forEach(x => x.classList.toggle('on', !!show[x.dataset.bvt!]));
  sec.querySelector('[data-bv="follow"]')!.classList.toggle('on', cfg.follow);
  if (cfg.tree) drawTree(id); else sec.querySelector('.bvtree')!.classList.add('hidden');
  if (id === activeId()) updateCommentary();
}
const GRP: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha (1611 KJV)', APX: 'Other books', NT: 'New Testament' };
function groupOptions(books: PickBook[]): string {
  let out = '', g = '';
  for (const b of books) { if (b.grp !== g) { out += (g ? '</optgroup>' : '') + `<optgroup label="${GRP[b.grp] || b.grp}">`; g = b.grp; } out += `<option value="${b.id}">${esc(b.name)}</option>`; }
  return out + (g ? '</optgroup>' : '');
}
/** footnote marks numbered through the chapter (numbers, letters or a star); the list under the chapter if chosen */
function decorateFootnotes(root: HTMLElement, look: ViewLook, show: Record<string, boolean>): void {
  const style = look.fnStyle || 'num';
  const lab = (n: number) => style === 'letter' ? (n > 26 ? String.fromCharCode(96 + Math.ceil(n / 26) - 1) : '') + String.fromCharCode(97 + (n - 1) % 26) : style === 'star' ? '*' : String(n);
  let n = 0; const items: string[] = [];
  for (const f of root.querySelectorAll<HTMLElement>('sup.fn')) { n++; if (!f.dataset.q) f.textContent = lab(n); const v = f.closest<HTMLElement>('[data-v]')?.dataset.v; items.push(`<li data-gov="${v}"><b>${esc(f.textContent || '')}</b> <span class="small">${v}</span> ${TWRender.render(f.dataset.note || '', { rules: [] }, { ...show, footnotes: false })}</li>`); }
  if (look.fnPlace === 'chapter' && items.length) root.insertAdjacentHTML('beforeend', `<section class="fnlist"><h4>Footnotes</h4><div class="fnl"><ol>${items.join('')}</ol></div></section>`);
}
function showLemmas(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('[data-lemma]:not(sup)').forEach(w => w.insertAdjacentHTML('afterend', `<sup class="lemma" data-lemma="${esc(w.dataset.lemma!)}">${esc(w.dataset.lemma!)}</sup>`));
}
/* column text: each tagged word over its original word, transliteration, Strong's number, morphology and lemma */
export const COL_LINES: [string, string][] = [['orig', 'Original word'], ['tl', 'Transliteration'], ['strong', "Strong's number"], ['morph', 'Morphology'], ['lemma', 'Lemma']];
const origCache = new Map<string, string>();
async function originalFor(key: string): Promise<string> {
  const ck = key + '|' + JSON.stringify(H.settings().dictPref || {});
  if (origCache.has(ck)) return origCache.get(ck)!;
  const hit = await strongEntry(key); let o = '';
  if (hit) { const t = document.createElement('div'); t.innerHTML = hit.html; o = firstOriginal(hit.subject + ' ' + (t.textContent || '').slice(0, 400), /^H/i.test(key) ? 'hebrew' : 'greek'); }
  origCache.set(ck, o); return o;
}
function columnWords(id: string, root: HTMLElement, my: number): void {
  const need: [HTMLElement, string][] = [];
  for (const w of root.querySelectorAll<HTMLElement>('span.word[data-strong], span.word[data-morph], span.word[data-lemma]')) {
    const st = (w.dataset.strong || '').split(/\s+/).filter(Boolean); const lem = w.dataset.lemma || '';
    const box = document.createElement('span'); box.className = 'cw'; w.replaceWith(box); box.appendChild(w);
    const line = (cls: string, txt: string, attrs: Record<string, string> = {}) => { const e = document.createElement('span'); e.className = 'cl ' + cls; e.textContent = txt; for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); box.appendChild(e); return e; };
    if (colOn(id, 'orig')) { const o = line('cl-orig', lem); if (!lem && st[0]) need.push([o, st[0]]); }
    if (colOn(id, 'tl')) line('cl-tl', lem ? translit(lem) : '');
    if (colOn(id, 'strong') && st.length) line('cl-strong', st.join(' '), { 'data-strong': st.join(' ') });
    if (colOn(id, 'morph') && w.dataset.morph) line('cl-morph', w.dataset.morph, { 'data-morph': w.dataset.morph });
    if (colOn(id, 'lemma') && lem) line('cl-lemma', lem, { 'data-lemma': lem });
  }
  // original words from the Strong's dictionary where the Bible gives no lemma: the selected verse first
  const sv = String(refOf(id).v); need.sort((a, b) => Number(b[0].closest<HTMLElement>('[data-v]')?.dataset.v === sv) - Number(a[0].closest<HTMLElement>('[data-v]')?.dataset.v === sv));
  const keys = [...new Set(need.map(n => n[1]))];
  (async () => {
    for (let i = 0; i < keys.length; i += 24) {
      if (vseq.get(id) !== my) return;
      await Promise.all(keys.slice(i, i + 24).map(originalFor));
      const pk = '|' + JSON.stringify(H.settings().dictPref || {});
      for (const [el, k] of need) if (origCache.has(k + pk) && !el.textContent) { const o = origCache.get(k + pk)!; el.textContent = o; const tl = el.nextElementSibling; if (tl && tl.classList.contains('cl-tl') && !tl.textContent) tl.textContent = translit(o); }
    }
  })();
}
/** a short book name that reads well: "1 John", "2 Kgs", "Rom" */
export function refAbbr(b: number): string { return String(canon.book(b).abbr).replace(/^(\d)(?=\D)/, '$1 '); }
async function decorateXrefs(root: HTMLElement, b: number, c: number, still: () => boolean): Promise<void> {
  const xr = await chapterXrefs(b, c); if (!still()) return;
  for (const [v, refs] of Object.entries(xr)) {
    const cell = root.querySelector(`[data-v="${v}"] [data-col="0"]`); if (!cell || !refs.length) continue;
    const label = (r: { b: number; c: number; v: number; span: number }) => `${refAbbr(r.b)} ${r.c}:${r.v}${r.span ? '–' + (r.v + r.span) : ''}`;
    const shown = refs.slice(0, 8);
    cell.insertAdjacentHTML('beforeend', `<div class="xrs">${shown.map(r => `<a class="xr${r.back ? ' back' : ''}${r.user ? ' mine' : ''}" data-ref="${r.b}.${r.c}.${r.v}.${r.span}">${r.back ? '[' + label(r) + ']' : label(r)}</a>${r.user ? `<i class="rmx" data-from="${b}.${c}.${v}" data-to="${r.b}.${r.c}.${r.v}" title="Remove my cross-reference">×</i>` : ''}`).join('; ')}${refs.length > 8 ? ` <a class="xrmore" data-v="${v}">+${refs.length - 8} more</a>` : ''}</div>`);
    if (refs.length > 8) cell.querySelector<HTMLElement>('.xrmore')!.onclick = e => { e.stopPropagation(); const d = cell.querySelector('.xrs')!; d.innerHTML = refs.map(r => `<a class="xr${r.back ? ' back' : ''}" data-ref="${r.b}.${r.c}.${r.v}.${r.span}">${r.back ? '[' + label(r) + ']' : label(r)}</a>`).join('; '); };
  }
}

/* ---------------------------------------------------------------- the side tree (books and chapters) */
function drawTree(id: string): void {
  const sec = document.getElementById('p-' + id); const m = bibleOf(id); if (!sec || !m) return;
  const t = sec.querySelector<HTMLElement>('.bvtree')!; const r = refOf(id); const books = booksOf(m);
  t.classList.remove('hidden');
  let html = '<ul class="bvbooks">', g = '';
  for (const b of books) {
    if (b.grp !== g) { g = b.grp; html += `<li class="pg">${esc(GRP[g] || g)}</li>`; }
    html += `<li data-tb="${b.id}" class="${b.id === r.b ? 'on' : ''}">${esc(b.name)}</li>`;
    if (b.id === r.b) html += `<li class="tchaps">${b.chapters.map(c => `<button data-tc="${c}" class="${c === r.c ? 'on' : ''}">${c}</button>`).join('')}</li>`;
  }
  t.innerHTML = html + '</ul>';
  t.onclick = e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('[data-tb]'); if (li) { setActive(id); navigate(id, +li.dataset.tb!, 1); return; }
    const cb = (e.target as HTMLElement).closest<HTMLElement>('[data-tc]'); if (cb) { setActive(id); navigate(id, r.b, +cb.dataset.tc!); }
  };
  requestAnimationFrame(() => { const on = t.querySelector<HTMLElement>('li.on'); if (on) t.scrollTop = Math.max(0, on.offsetTop - t.clientHeight / 3); });
}

/* ---------------------------------------------------------------- the view's option pop-ups */
let popEl: HTMLElement | null = null;
function pop(btn: HTMLElement, html: string, wire: (p: HTMLElement) => void): void {
  popEl?.remove(); const p = document.createElement('div'); p.className = 'menu bvpop'; p.innerHTML = html; document.body.appendChild(p); popEl = p;
  const r = btn.getBoundingClientRect(); p.style.left = Math.min(r.right + 6, innerWidth - p.offsetWidth - 8) + 'px'; p.style.top = Math.max(8, Math.min(r.top, innerHeight - p.offsetHeight - 8)) + 'px';
  const close = (e: MouseEvent) => { if (!p.contains(e.target as Node) && e.target !== btn) { p.remove(); document.removeEventListener('mousedown', close, true); } };
  setTimeout(() => document.addEventListener('mousedown', close, true));
  wire(p);
}
const FONTS = ['', 'Gentium Plus', 'Literata', 'Source Serif 4', 'Inter', 'Noto Serif Hebrew', 'SBL Greek', 'SBL Hebrew', 'Ezra SIL', 'Cardo', 'Georgia', 'Times New Roman', 'Segoe UI', 'Calibri'];
function setLook(id: string, k: keyof ViewLook, v: unknown): void { const c = bvCfg(id)!; c.look = { ...(c.look || {}), [k]: v } as ViewLook; if (v === undefined || v === '') delete (c.look as Record<string, unknown>)[k]; H.save(); render(id, true); }
function fontPop(id: string, btn: HTMLElement): void {
  const l = bvCfg(id)!.look || {};
  pop(btn, `<div class="mh">Font of this view</div><div class="mrow msel">Font <select class="pf">${FONTS.map(f => `<option value="${esc(f)}"${f === (l.font || '') ? ' selected' : ''}>${f ? esc(f) : 'As in Options'}</option>`).join('')}</select></div>
    <div class="mrow">Size <input type="range" class="ps" min="70" max="180" step="5" value="${l.size || 100}"><b class="psv">${l.size || 100}%</b></div>
    <div class="mrow">Lines <input type="range" class="pl" min="1.2" max="2.4" step="0.05" value="${l.lineH || (H.settings().look as Record<string, number>).lineH || 1.65}"></div>
    <button class="preset">As in Options (reset)</button>`, p => {
    p.querySelector<HTMLSelectElement>('.pf')!.onchange = e => setLook(id, 'font', (e.target as HTMLSelectElement).value || undefined);
    p.querySelector<HTMLInputElement>('.ps')!.oninput = e => { const v = +(e.target as HTMLInputElement).value; p.querySelector('.psv')!.textContent = v + '%'; setLook(id, 'size', v === 100 ? undefined : v); };
    p.querySelector<HTMLInputElement>('.pl')!.oninput = e => setLook(id, 'lineH', +(e.target as HTMLInputElement).value);
    p.querySelector<HTMLElement>('.preset')!.onclick = () => { bvCfg(id)!.look = {}; H.save(); render(id, true); p.remove(); };
  });
}
function vnPop(id: string, btn: HTMLElement): void {
  const l = effLook(id);
  pop(btn, `<div class="mh">Verse numbers</div>${[['margin', 'In a column at the left'], ['inline', 'In the text'], ['hidden', 'Hidden']].map(([k, t]) => `<label><input type="radio" name="vp${id}" data-vp="${k}" ${(l.vnPos || 'margin') === k ? 'checked' : ''}> ${t}</label>`).join('')}
    <div class="msep"></div>${[['normal', 'Normal'], ['bold', 'Bold'], ['circle', 'In a circle']].map(([k, t]) => `<label><input type="radio" name="vs${id}" data-vs="${k}" ${(l.vnStyle || 'normal') === k ? 'checked' : ''}> ${t}</label>`).join('')}`, p => {
    p.querySelectorAll<HTMLInputElement>('[data-vp]').forEach(r => r.onchange = () => setLook(id, 'vnPos', r.dataset.vp));
    p.querySelectorAll<HTMLInputElement>('[data-vs]').forEach(r => r.onchange = () => setLook(id, 'vnStyle', r.dataset.vs));
  });
}
const ALL_SHOW: [string, string][] = [['strongs', "Strong's numbers"], ['morph', 'Morphology'], ['lemma', 'Lemmas'], ['footnotes', 'Footnotes'], ['xrefs', 'Cross-references'], ['headings', 'Headings'], ['woj', 'Words of Jesus in red'], ['added', 'Added words marked'], ['highlights', 'My highlighting'], ['notes', 'My notes under the verses'], ['paragraph', 'Paragraphs'], ['columns', 'Column text']];
function optsPop(id: string, btn: HTMLElement): void {
  const sh = effShow(id), l = effLook(id); const m = bibleOf(id); const tg = m ? H.customToggles(m) : [];
  pop(btn, `<div class="mh">This Bible view</div>${ALL_SHOW.map(([k, t]) => `<label><input type="checkbox" data-o="${k}" ${sh[k] ? 'checked' : ''}> ${t}</label>`).join('')}
    ${sh.columns ? '<div class="mh">Column text lines</div>' + COL_LINES.map(([k, t]) => `<label class="sub"><input type="checkbox" data-cl="${k}" ${colOn(id, k) ? 'checked' : ''}> ${t}</label>`).join('') : ''}
    ${tg.length ? '<div class="mh">This Bible\'s own switches</div>' + tg.map(t => `<label><input type="checkbox" data-ct="${esc(t.name)}" ${H.customOn(t.name) ? 'checked' : ''}> ${esc(t.label || t.name)}</label>`).join('') : ''}
    <div class="mh">Footnote marks</div>${[['num', '1 2 3'], ['letter', 'a b c'], ['star', '*']].map(([k, t]) => `<label><input type="radio" name="fs${id}" data-fs="${k}" ${(l.fnStyle || 'num') === k ? 'checked' : ''}> ${t}</label>`).join('')}
    <label><input type="checkbox" data-fp ${l.fnPlace === 'chapter' ? 'checked' : ''}> List the footnotes under the chapter</label>
    <div class="msep"></div><button data-act="default" title="New Bible views start with these settings">Use these for new Bible views</button><button data-act="all">Use these in all Bible views</button><button data-act="reset">Back to the general settings</button>`, p => {
    p.querySelectorAll<HTMLInputElement>('[data-o]').forEach(cb => cb.onchange = () => { toggleShow(id, cb.dataset.o!, cb.checked); if (cb.dataset.o === 'columns') { p.remove(); optsPop(id, btn); } });
    p.querySelectorAll<HTMLInputElement>('[data-cl]').forEach(cb => cb.onchange = () => { const c = bvCfg(id)!; c.colLines = { ...(c.colLines || {}), [cb.dataset.cl!]: cb.checked }; H.save(); render(id, true); });
    p.querySelectorAll<HTMLInputElement>('[data-ct]').forEach(cb => cb.onchange = () => H.setCustom(cb.dataset.ct!, cb.checked));
    p.querySelectorAll<HTMLInputElement>('[data-fs]').forEach(r => r.onchange = () => setLook(id, 'fnStyle', r.dataset.fs));
    p.querySelector<HTMLInputElement>('[data-fp]')!.onchange = e => setLook(id, 'fnPlace', (e.target as HTMLInputElement).checked ? 'chapter' : 'text');
    p.querySelectorAll<HTMLElement>('[data-act]').forEach(b => b.onclick = () => {
      const c = bvCfg(id)!; const s = H.settings();
      if (b.dataset.act === 'default') { Object.assign(s.show, c.show || {}); Object.assign(s.look, c.look || {}); s.colLines = { ...(s.colLines || {}), ...(c.colLines || {}) }; for (const x of bvIds()) if (x !== id) { /* others keep their own choices */ } H.flash('New Bible views will start like this one'); }
      if (b.dataset.act === 'all') { for (const x of bvIds()) { const o = bvCfg(x)!; o.show = { ...(c.show || {}) }; o.look = { ...(c.look || {}) }; o.colLines = { ...(c.colLines || {}) }; } renderAll(); H.flash('All Bible views now look like this one'); }
      if (b.dataset.act === 'reset') { c.show = {}; c.look = {}; c.colLines = {}; render(id, true); }
      H.save(); p.remove();
    });
  });
}
function biblePop(id: string, btn: HTMLElement): void {
  const cur = bvCfg(id)!.bible; const hid = H.hidden();
  const list = H.bibles().filter(b => b.id === cur || !hid.includes(b.id));
  pop(btn, `<div class="mh">Bible of this view</div><input class="txt bpf" placeholder="Find…"><div class="bplist">${list.map(b => `<button data-bb="${esc(b.id)}" class="${b.id === cur ? 'on' : ''}"><b>${esc(b.abbr)}</b> <span class="small">${esc(b.title)}</span></button>`).join('')}</div>`, p => {
    const f = p.querySelector<HTMLInputElement>('.bpf')!; f.focus();
    f.oninput = () => { const t = f.value.toLowerCase(); p.querySelectorAll<HTMLElement>('[data-bb]').forEach(b => b.classList.toggle('hidden', !!t && !b.textContent!.toLowerCase().includes(t))); };
    p.querySelectorAll<HTMLElement>('[data-bb]').forEach(b => b.onclick = () => { setBible(id, b.dataset.bb!); p.remove(); });
  });
}
export function setBible(id: string, bible: string): void { const c = bvCfg(id); if (!c) return; c.bible = bible; H.save(); H.retitle(); render(id, true); if (id === activeId()) H.moved(); }
export const isPhoneLayout = isPhone;
export const activeView = () => $('#view');
