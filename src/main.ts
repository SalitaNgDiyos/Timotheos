// Tanglaw (Tauri) – proof of concept: open theWord / e-Sword Bibles, read a chapter side by side,
// Strong's popups from your dictionaries, the eight skins; desktop and phone layouts from one code base.
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Bible, Locked, isBibleFile, isLocked, openBible } from './bibles';
import { BookMod, guessKind, isBookFile, openBook } from './books';
import type { ModFile } from './native';
import { commentaryMarks, followBookLink, initPanel, morphEntry, libCurrent, reloadLib, show as showPanel, strongEntry, updateCommentary } from './panel';
import { find, forgetSearchCache, initSearch } from './search';
import { firstOriginal, translit } from './translit';
import { legacyData, loadSettings, modulesDir, saveSettings, scan } from './native';
import { addToList, afterRender, copyVerse, initStudy, saveUD } from './study';
import { copyDialog, initCopy } from './copy';
import { bibleTarget, linkRefs, wireRefPreview } from './refs';
import { addXref, chapterXrefs, loadXrefs, removeXref } from './xrefs';
import { copyText, dialog, flash } from './ui';
import { PRESETS as DOCK_PRESETS, Layout, PANELS, close as closePanel, isHiddenAll, isOpen, layout as currentLayout, openPanel, openPanels, retitle, setHidden, setLayout, titleOf } from './dock';
import { addBibleView, addBookView, initViews, viewsReload } from './views';
import { icon } from './icons';
import { openPicker } from './picker';
import { openGuide } from './guide';
import { importFiles, reportHtml } from './importer';
import { initProps, openProps } from './props';
import { SKINS } from './skins';
import { LOOK, Look, applyLook, optionsDialog } from './options';

interface Settings { folders: string[]; open: string[]; ref: { b: number; c: number; v?: number }; sideHidden?: boolean; dock?: unknown; look: Look; skin: string; show: Record<string, boolean>; fontSize: number }
const DEFAULT: Settings = { folders: [], open: [], ref: { b: 43, c: 3 }, skin: 'parchment', show: { strongs: false, morph: false, footnotes: true, headings: true, woj: true, added: true, highlights: true, notes: true, xrefs: true }, fontSize: 18, look: { ...LOOK } };

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
const isAndroid = /Android/i.test(navigator.userAgent);

let S: Settings = DEFAULT;
let bibles: Bible[] = [];
let locked: Locked[] = []; // modules that cannot be opened (encrypted etc.): kept quiet
let books: BookMod[] = [];
let restBooks: ModFile[] = [];
/** open the dictionaries, books and devotionals in the background */
async function openRest(): Promise<void> {
  const t0 = performance.now(); const more: BookMod[] = [];
  for (const f of restBooks) more.push(await openBook(f));
  books = [...books, ...more]; restBooks = [];
  statusLine(performance.now() - t0);
}
let nav: { id: number; name: string; abbr: string; grp: string; chapters: number[] }[] = [];
let ownDir = '';

const save = () => saveSettings(S).catch(() => {});
/** the Electron edition's appearance settings that the new one understands */
function pickLook(a: Record<string, unknown>): Partial<Look> {
  const o: Partial<Look> = {};
  for (const k of ['fontText', 'fontGreek', 'fontHebrew', 'lineH', 'textWidth', 'bgMode', 'bgColor', 'vnPos', 'vnStyle', 'capColor'] as const) if (a[k] != null) (o as Record<string, unknown>)[k] = a[k];
  if (o.vnStyle && !['normal', 'bold', 'circle'].includes(o.vnStyle)) o.vnStyle = 'normal';
  if (a.texture === 'paper') o.texture = 'paper';
  return o;
}
function openOptions(): void { optionsDialog(S, rr => { applyLook(S.skin, S.fontSize, S.look); save(); if (rr) { if (canon.getOrder() !== S.look.bookOrder) { canon.setOrder(S.look.bookOrder); buildNav(); go(S.ref.b, S.ref.c, S.ref.v); } else rerender(); } }); }

/* ---------------------------------------------------------------- modules */
async function loadModules(): Promise<void> {
  const t0 = performance.now();
  const files = await scan([ownDir, ...S.folders]);
  const seen = new Set<string>();
  const bfiles = files.filter(f => isBibleFile(f.name) && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()));
  const opened = await Promise.all(bfiles.map(openBible));
  bibles = opened.filter((m): m is Bible => !isLocked(m)).sort((a, b) => a.abbr.localeCompare(b.abbr));
  locked = opened.filter(isLocked);
  // commentaries first (the panel and the "c" marks need them); the rest are opened after the first chapter shows
  const bookFiles = files.filter(f => isBookFile(f.name) && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()));
  const cmts = bookFiles.filter(f => guessKind(f.name) === 'commentary');
  books = await Promise.all(cmts.map(openBook));
  restBooks = bookFiles.filter(f => !cmts.includes(f));
  await loadXrefs(files);
  forgetSearchCache();
  S.open = S.open.filter(id => bibles.some(b => b.id === id));
  if (!S.open.length && bibles.length) S.open = [(bibles.find(b => /kjv/i.test(b.abbr)) || bibles[0]).id];
  buildNav();
  statusLine(performance.now() - t0);
  $('#empty').classList.toggle('hidden', bibles.length > 0);
}

function statusLine(ms: number): void {
  const nd = books.filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked).length, nl = books.filter(m => !m.locked).length;
  $('#status').textContent = `${bibles.length} Bible${bibles.length === 1 ? '' : 's'} · ${nl} library modules${restBooks.length ? ` (opening ${restBooks.length} more…)` : ` (${nd} Strong's dictionaries)`} · ${Math.round(ms)} ms`;
}
function openBibles(): Bible[] { return S.open.map(id => bibles.find(b => b.id === id)).filter((b): b is Bible => !!b); }

function buildNav(): void {
  const all = new Map<number, Set<number>>();
  for (const bb of openBibles()) for (const [b, ch] of bb.books) { const s = all.get(b) || new Set(); ch.forEach((n, i) => { if (n > 0) s.add(i + 1); }); all.set(b, s); }
  nav = [...all.keys()].sort((a, b) => canon.orderKey(a) - canon.orderKey(b)).map(id => {
    const bk = canon.book(id);
    return { id, name: bk.name, abbr: bk.abbr, grp: bk.grp, chapters: [...all.get(id)!].sort((a, b) => a - b) };
  });
  const sel = $<HTMLSelectElement>('#bookSel'); sel.innerHTML = '';
  let og: HTMLOptGroupElement | null = null, last = '';
  const label: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha (1611 KJV)', APX: 'Other books', NT: 'New Testament' };
  for (const b of nav) {
    if (b.grp !== last) { og = document.createElement('optgroup'); og.label = label[b.grp] || b.grp; sel.appendChild(og); last = b.grp; }
    const o = document.createElement('option'); o.value = String(b.id); o.textContent = b.name; og!.appendChild(o);
  }
}

/* ---------------------------------------------------------------- reading */
let seq = 0;
let rerendering = false;
const rerender = () => { rerendering = true; pushHistory = false; go(S.ref.b, S.ref.c, S.ref.v || 1); };
const back: { b: number; c: number; v: number }[] = [], fwd: { b: number; c: number; v: number }[] = [];
let pushHistory = true;
function historyGo(d: number): void {
  const from = d < 0 ? back : fwd, to = d < 0 ? fwd : back; const r = from.pop(); if (!r) return;
  to.push({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 }); pushHistory = false; go(r.b, r.c, r.v);
}
async function go(b: number, c: number, v = 1): Promise<void> {
  const bk = nav.find(x => x.id === b) || nav[0];
  if (!bk) { $('#view').innerHTML = ''; return; }
  if (!bk.chapters.includes(c)) c = bk.chapters[0];
  if (pushHistory && (S.ref.b !== bk.id || S.ref.c !== c)) { back.push({ ...S.ref, v: S.ref.v || 1 }); if (back.length > 200) back.shift(); fwd.length = 0; }
  pushHistory = true;
  S.ref = { b: bk.id, c, v }; save();
  $<HTMLSelectElement>('#bookSel').value = String(bk.id);
  const cs = $<HTMLSelectElement>('#chapSel'); cs.innerHTML = bk.chapters.map(n => `<option>${n}</option>`).join(''); cs.value = String(c);
  $('#refBtn').textContent = `${bk.name} ${c}`; $('#capRef').textContent = `${bk.name} ${c}`;
  const my = ++seq; const t0 = performance.now();
  const list = openBibles();
  const chapters = await Promise.all(list.map(m => m.chapter(bk.id, c)));
  if (my !== seq) return;
  const vmax = Math.max(0, ...chapters.map(ch => ch.length ? ch[ch.length - 1].v : 0));
  const vs = $<HTMLSelectElement>('#verseSel'); vs.innerHTML = Array.from({ length: vmax }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join(''); vs.value = String(Math.min(v, vmax) || 1);
  const show = S.show;
  const marks = commentaryMarks(bk.id, c);
  const ctxs = new Map<Bible, { fn: { n: number } }>(list.map(m => [m, { fn: { n: 0 } }])); // footnotes numbered through the chapter
  const cell = (m: Bible, raw: string | undefined) => raw == null ? '' : TWRender.render(raw, m, show, ctxs.get(m));
  const vin = (v: number) => S.look.vnPos === 'inline' ? `<sup class="vnum">${v}</sup>` : '';
  const font = bibleStyle;
  let html = '';
  if (show.paragraph) {
    // paragraph mode: the verses run on as text; a paragraph ends where the Bible marks one (theWord's <CM>);
    // a Bible without paragraph marks borrows them from another open Bible that has them
    const ends = list.map(m => new Set(chapters[list.indexOf(m)].filter(r => /<CM>\s*$/.test(r.raw)).map(r => r.v)));
    const borrowed = ends.find(e => e.size) || new Set<number>();
    html = `<div class="paraview" style="grid-template-columns:repeat(${list.length}, minmax(0, 1fr))">`;
    list.forEach((m, i) => {
      const pe = ends[i].size ? ends[i] : borrowed;
      html += `<div class="pcol${m.rtl ? ' rtl' : ''}"${font(m)}>${list.length > 1 ? `<div class="pabbr">${esc(m.abbr)}</div>` : ''}<p class="ppara">`;
      for (const r of chapters[i]) {
        html += `<span class="pv${r.v === S.ref.v ? ' sel' : ''}" data-v="${r.v}" data-col="${i}">${S.look.vnPos === 'hidden' ? '' : `<sup class="vnum pvn">${r.v}</sup>`}${cell(m, r.raw)}</span> `;
        if (pe.has(r.v)) html += '</p><p class="ppara">';
      }
      html += '</p></div>';
    });
    html += '</div>';
  } else if (isPhone() || list.length === 1) {
    html = '<div class="rows">';
    for (let v = 1; v <= vmax; v++) {
      html += `<div class="vrow${v === S.ref.v ? ' sel' : ''}" data-v="${v}"><span class="vn"><span class="vno">${v}</span>${marks.has(v) ? '<i class="cm">c</i>' : ''}</span><div class="vtexts">`;
      list.forEach((m, i) => { const r = chapters[i].find(x => x.v === v); if (r) html += `<div class="vt${m.rtl ? ' rtl' : ''}" data-col="${i}"${font(m)}>${list.length > 1 ? `<span class="ab">${esc(m.abbr)}</span>` : ''}${vin(v)}${cell(m, r.raw)}</div>`; });
      html += '</div></div>';
    }
    html += '</div>';
  } else {
    html = `<table class="chap"><thead><tr><th class="vn"></th>${list.map(m => `<th title="${esc(m.title)}">${esc(m.abbr)}</th>`).join('')}</tr></thead><tbody>`;
    for (let v = 1; v <= vmax; v++) {
      html += `<tr data-v="${v}"${v === S.ref.v ? ' class="sel"' : ''}><td class="vn"><span class="vno">${v}</span>${marks.has(v) ? '<i class="cm" title="Commentary">c</i>' : ''}</td>`;
      list.forEach((m, i) => { const r = chapters[i].find(x => x.v === v); html += `<td class="${m.rtl ? 'rtl' : ''}" data-col="${i}"${font(m)}>${r ? vin(v) : ''}${cell(m, r?.raw)}</td>`; });
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  const view = $('#view'); const keepTop = view.scrollTop; view.innerHTML = html; view.scrollTop = rerendering ? keepTop : 0;
  afterRender(bk.id, c);
  decorateFootnotes(list); if (show.lemma) showLemmas();
  if (show.xrefs && !show.paragraph) await decorateXrefs(bk.id, c, my);
  if (!rerendering && (S.ref.v || 1) > 1) { const el = view.querySelector(`[data-v="${S.ref.v}"]`); if (el) el.scrollIntoView({ block: 'center' }); }
  updateCommentary(); rerendering = false;
  document.dispatchEvent(new CustomEvent('tanglaw-ref'));
  $('#timing').textContent = `${Math.round(performance.now() - t0)} ms`;
}
/** footnote markers: numbers, letters or a star; and, if chosen, every footnote listed under the chapter */
function decorateFootnotes(list: Bible[]): void {
  const view = $('#view'); const style = S.look.fnStyle || 'num';
  const lab = (n: number) => style === 'letter' ? (n > 26 ? String.fromCharCode(96 + Math.ceil(n / 26) - 1) : '') + String.fromCharCode(97 + (n - 1) % 26) : style === 'star' ? '*' : String(n);
  const lists: string[] = [];
  list.forEach((m, i) => {
    const fns = [...view.querySelectorAll<HTMLElement>(`[data-col="${i}"] sup.fn`)]; let n = 0; const items: string[] = [];
    for (const f of fns) { n++; if (!f.dataset.q) f.textContent = lab(n); const v = f.closest<HTMLElement>('[data-v]')?.dataset.v; items.push(`<li data-gov="${v}"><b>${esc(f.textContent || '')}</b> <span class="small">${v}</span> ${TWRender.render(f.dataset.note || '', { rules: [] }, { ...S.show, footnotes: false })}</li>`); }
    if (items.length) lists.push(`<div class="fnl">${list.length > 1 ? `<h5>${esc(m.abbr)}</h5>` : ''}<ol>${items.join('')}</ol></div>`);
  });
  if (S.look.fnPlace === 'chapter' && lists.length) view.insertAdjacentHTML('beforeend', `<section class="fnlist"><h4>Footnotes</h4>${lists.join('')}</section>`);
}
/** lemmas shown after the words that carry one */
function showLemmas(): void {
  $('#view').querySelectorAll<HTMLElement>('[data-lemma]:not(sup)').forEach(w => w.insertAdjacentHTML('afterend', `<sup class="lemma" data-lemma="${esc(w.dataset.lemma!)}">${esc(w.dataset.lemma!)}</sup>`));
}
/** cross-references under each verse; [brackets] = verses that point here; yours can be removed */
async function decorateXrefs(b: number, c: number, my: number): Promise<void> {
  const xr = await chapterXrefs(b, c); if (my !== seq) return;
  for (const [v, refs] of Object.entries(xr)) {
    const cell = $('#view').querySelector(`[data-v="${v}"] [data-col="0"]`); if (!cell || !refs.length) continue;
    const label = (r: { b: number; c: number; v: number; span: number }) => `${refAbbr(r.b)} ${r.c}:${r.v}${r.span ? '–' + (r.v + r.span) : ''}`;
    const shown = refs.slice(0, 8);
    cell.insertAdjacentHTML('beforeend', `<div class="xrs">${shown.map(r => `<a class="xr${r.back ? ' back' : ''}${r.user ? ' mine' : ''}" data-ref="${r.b}.${r.c}.${r.v}.${r.span}">${r.back ? '[' + label(r) + ']' : label(r)}</a>${r.user ? `<i class="rmx" data-from="${b}.${c}.${v}" data-to="${r.b}.${r.c}.${r.v}" title="Remove my cross-reference">×</i>` : ''}`).join('; ')}${refs.length > 8 ? ` <a class="xrmore" data-v="${v}">+${refs.length - 8} more</a>` : ''}</div>`);
    if (refs.length > 8) cell.querySelector<HTMLElement>('.xrmore')!.onclick = e => { e.stopPropagation(); const d = cell.querySelector('.xrs')!; d.innerHTML = refs.map(r => `<a class="xr${r.back ? ' back' : ''}" data-ref="${r.b}.${r.c}.${r.v}.${r.span}">${r.back ? '[' + label(r) + ']' : label(r)}</a>`).join('; '); };
  }
}
/** a short book name that reads well: "1 John", "2 Kgs", "Rom" */
export function refAbbr(b: number): string { return String(canon.book(b).abbr).replace(/^(\d)(?=\D)/, '$1 '); }
async function versePreview(ref: string): Promise<string> {
  const [b, c, v, span] = ref.split('.').map(Number);
  const show = { ...S.show, strongs: false, morph: false, footnotes: false };
  const out: string[] = [];
  for (const m of openBibles()) {
    const rows = (await m.chapter(b, c)).filter(r => r.v >= v && r.v <= v + (span || 0)); if (!rows.length) continue;
    out.push(`<div class="pvb"${bibleStyle(m)}><span class="src">${esc(m.abbr)}</span> ${rows.map(r => `<sup>${r.v}</sup> ${TWRender.render(r.raw, m, show)}`).join(' ')}</div>`);
    if (WS().popAll === false) break; // only the first Bible
  }
  return out.length ? `<div class="entry"><h4>${esc(canon.book(b).name)} ${c}:${v}${span ? '–' + (v + span) : ''}</h4>${out.join('')}</div>` : '';
}
function stepBook(d: number): void { const i = nav.findIndex(x => x.id === S.ref.b); const n = nav[i + d]; if (n) go(n.id, n.chapters[0]); }
function selectVerse(v: number): void {
  const el = $('#view').querySelector<HTMLElement>(`[data-v="${v}"]`);
  if (!el) { if (v < 1) step(-1); else step(1); return; }
  $('#view').querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel');
  el.scrollIntoView({ block: 'nearest' }); S.ref.v = v; save(); updateCommentary(); $<HTMLSelectElement>('#verseSel').value = String(v); document.dispatchEvent(new CustomEvent('tanglaw-ref'));
}
function step(d: number): void {
  const i = nav.findIndex(x => x.id === S.ref.b); if (i < 0) return;
  const bk = nav[i]; const j = bk.chapters.indexOf(S.ref.c) + d;
  if (j >= 0 && j < bk.chapters.length) return void go(bk.id, bk.chapters[j]);
  const nb = nav[i + d]; if (nb) go(nb.id, d > 0 ? nb.chapters[0] : nb.chapters[nb.chapters.length - 1]);
}

/* ---------------------------------------------------------------- Strong's popup / sheet */
type WordSettings = { wordOrder?: 'morph' | 'strong'; dictPref?: { greek?: string; hebrew?: string; morph?: string }; popAll?: boolean };
const WS = () => S as unknown as WordSettings;
async function lookup(keys: string[], morphs: string[] = [], lemma = ''): Promise<string> {
  const head: string[] = [], mparts: string[] = [], sparts: string[] = [];
  let orig = lemma;
  const nm = books.some(m => m.kind === 'dictionary' && m.isMorph && !m.locked);
  for (const k of morphs) {
    const hit = await morphEntry(k);
    mparts.push(hit ? `<div class="entry morphe"><h4>${esc(hit.subject)} <a class="findw" data-find="m/ ${esc(k)}" title="Find every verse with ${esc(k)}">Find in Bible</a></h4><div class="src">${esc(hit.src)}</div>${clean(hit.html)}</div>` : `<div class="entry morphe"><h4>${esc(k)}</h4><div class="src">${nm ? 'Not in your morphology dictionaries' : 'No morphology dictionary yet – import one (e.g. Robinson or Packard codes)'}</div></div>`);
  }
  const nd = books.some(m => m.kind === 'dictionary' && m.isStrong && !m.locked);
  for (const k of keys) {
    const hit = await strongEntry(k);
    if (hit && !orig) { const t = document.createElement('div'); t.innerHTML = hit.html; orig = firstOriginal(hit.subject + ' ' + (t.textContent || '').slice(0, 400), /^H/i.test(k) ? 'hebrew' : 'greek'); }
    sparts.push(hit ? `<div class="entry"><h4>${esc(hit.subject)} <a class="findw" data-find="${esc(k)}" title="Find every verse with ${esc(k)}">Find in Bible</a></h4><div class="src">${esc(hit.src)}</div>${clean(hit.html)}</div>` : `<div class="entry"><h4>${esc(k)}</h4><div class="src">${nd ? 'Not in your Strong\'s dictionaries' : 'No Strong\'s dictionary yet – import one'}</div></div>`);
  }
  // the original word and how it sounds in Latin letters (theWord: "show original word" / transliteration)
  if (orig && S.show.origWord !== false) { const tr = translit(orig); head.push(`<div class="orig"><span class="ow">${esc(orig)}</span>${tr ? ` <i class="tl">${esc(tr)}</i>` : ''}${lemma ? ' <span class="small">lemma</span>' : ''}</div>`); }
  else if (lemma) head.push(`<div class="src">Lemma: <b>${esc(lemma)}</b></div>`);
  return [...head, ...(WS().wordOrder === 'strong' ? [...sparts, ...mparts] : [...mparts, ...sparts])].join('');
}
function clean(html: string): string {
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('script,style,iframe,object,embed').forEach(n => n.remove());
  t.content.querySelectorAll('a[href]').forEach(a => { (a as HTMLElement).dataset.href = a.getAttribute('href') || ''; a.classList.add('link'); });
  t.content.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || a.name === 'href') n.removeAttribute(a.name); });
  linkRefs(t.content);
  return t.innerHTML;
}
/** the little bar at the top of a popup: keep it open, copy its text, open it in a panel */
function popTools(el: HTMLElement): string {
  const word = !el.matches('a.xr, sup.fn');
  return `<div class="ptools"><button class="ib" data-pt="pin" title="Keep this popup open (it stays until you close it)">${icon('pin', 14)}</button><button class="ib" data-pt="copy" title="Copy the text">${icon('copy', 14)}</button>` +
    (word ? `<button class="ib" data-pt="dict" title="Show in the Dictionary panel">${icon('lookup', 14)}</button>` : '') +
    (el.matches('a.xr') ? `<button class="ib" data-pt="go" data-ref="${esc(el.dataset.ref!)}" title="Go to this verse">${icon('next', 14)}</button>` : '') +
    `<span class="sp"></span><button class="ib" data-pt="close" title="Close">${icon('close', 14)}</button></div>`;
}
function popToolClick(e: MouseEvent): void {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pt]'); if (!b) return;
  e.stopPropagation(); const p = $('#popup'); const body = () => [...p.children].filter(c => !c.classList.contains('ptools'));
  switch (b.dataset.pt) {
    case 'pin': popKeep = !popKeep; p.classList.toggle('pinned', popKeep); clearTimeout(popHideT); break;
    case 'copy': { const t = body().map(c => (c as HTMLElement).innerText).join('\n\n').replace(/\s*Find in Bible/g, '').trim(); copyText(t, body().map(c => c.outerHTML).join('')).then(() => flash('Copied')); break; }
    case 'dict': document.dispatchEvent(new CustomEvent('tanglaw-word', { detail: body().map(c => c.outerHTML).join('') })); showPanel('dict'); hidePopup(); break;
    case 'go': { const [bb, c, v] = b.dataset.ref!.split('.').map(Number); hidePopup(); go(bb, c, v); break; }
    case 'close': popPinned = false; popKeep = false; hidePopup(); break;
  }
}
let popKeep = false;
let popPinned = false, popHideT = 0, popResizing = false, popWord: HTMLElement | null = null;
function hidePopup(): void { clearTimeout(popHideT); $('#popup').classList.add('hidden'); popWord = null; }
/** a hover popup goes away soon after the mouse leaves the word, unless the mouse goes into the popup */
function popupLeaveSoon(): void { if (popPinned || popKeep || popResizing) return; clearTimeout(popHideT); popHideT = window.setTimeout(hidePopup, 250); }
async function showWord(el: HTMLElement, pinned = false): Promise<void> {
  popPinned = pinned; popWord = el; clearTimeout(popHideT);
  const keys = (el.dataset.strong || '').split(/\s+/).filter(Boolean);
  let html = '';
  if (el.matches('a.xr')) html = await versePreview(el.dataset.ref!);
  else if (el.matches('sup.fn')) html = `<div class="entry"><div class="src">Footnote</div>${TWRender.render(el.dataset.note || '', { rules: [] }, { ...S.show, footnotes: false })}</div>`;
  else if (keys.length || el.dataset.morph) html = await lookup(keys, (el.dataset.morph || '').split(/\s+/).filter(Boolean), el.dataset.lemma || '');
  if (!html) return;
  if (!el.matches('a.xr, sup.fn')) document.dispatchEvent(new CustomEvent('tanglaw-word', { detail: html }));
  if (!el.matches('a.xr, sup.fn')) document.dispatchEvent(new CustomEvent('tanglaw-key', { detail: { strong: keys, lemma: el.dataset.lemma || '', word: (el.textContent || '').trim() } }));
  if (isPhone()) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); return; }
  if (popWord !== el) return; // the mouse moved on meanwhile
  const p = $('#popup'); p.innerHTML = popTools(el) + html; p.scrollTop = 0; p.classList.toggle('pinned', popKeep);
  // the size you last gave it (drag the corner): width and height both
  const ps = (S as unknown as { popup?: { w: number; h: number } }).popup;
  p.style.width = ps ? Math.min(ps.w, innerWidth - 16) + 'px' : ''; p.style.height = '';
  p.classList.remove('hidden');
  const maxH = Math.min(ps ? ps.h : 360, innerHeight - 16); if (p.offsetHeight > maxH) p.style.height = maxH + 'px';
  const r = el.getBoundingClientRect(); const W = innerWidth, H = innerHeight;
  const x = Math.min(Math.max(8, r.left), W - p.offsetWidth - 8); let y = r.bottom + 6;
  if (y + p.offsetHeight > H - 8) y = Math.max(8, r.top - p.offsetHeight - 6);
  p.style.left = x + 'px'; p.style.top = y + 'px';
}

/* ---------------------------------------------------------------- menus & pickers */
/** a font and size for one Bible (theWord: each Bible can have its own font) */
async function bibleFontDialog(b: Bible): Promise<void> {
  const bs = BS(); const cur = (bs.bibleFonts || {})[b.id] || {};
  let font = cur.font || '', size = cur.size || 100;
  const opts = ['', 'Gentium Plus', 'Literata', 'Source Serif 4', 'Inter', 'Noto Serif Hebrew', 'SBL Greek', 'SBL Hebrew', 'Ezra SIL', 'Cardo', 'Georgia', 'Times New Roman', 'Segoe UI', 'Calibri'];
  if (font && !opts.includes(font)) opts.push(font);
  const r = await dialog(`Font for ${esc(b.abbr)}`, `<label class="fl">Font <select id="bfF">${opts.map(f => `<option value="${esc(f)}"${f === font ? ' selected' : ''}>${f ? esc(f) : 'Same as the other Bibles' + (b.font ? ` (module asks for ${esc(b.font)})` : '')}</option>`).join('')}</select></label>
    <label class="fl">Or type a font name <input id="bfT" class="txt" value="${esc(font)}"></label>
    <label class="fl">Size <span class="srow"><input type="range" id="bfS" min="70" max="160" step="5" value="${size}"><b id="bfSV">${size}%</b></span></label>
    <p class="small">Only this Bible changes. The size is a share of the text size for all Bibles.</p>`,
    [{ label: 'Reset', value: 'reset' }, { label: 'Cancel', value: null }, { label: 'Done', value: 'ok', primary: true }], bx => {
      const f = bx.querySelector<HTMLSelectElement>('#bfF')!, t = bx.querySelector<HTMLInputElement>('#bfT')!, z = bx.querySelector<HTMLInputElement>('#bfS')!;
      f.onchange = () => { font = f.value; t.value = font; }; t.oninput = () => { font = t.value.trim(); };
      z.oninput = () => { size = +z.value; bx.querySelector('#bfSV')!.textContent = size + '%'; };
    });
  if (!r) return;
  const all = { ...(bs.bibleFonts || {}) };
  if (r === 'reset' || (!font && size === 100)) delete all[b.id]; else all[b.id] = { font: font || undefined, size };
  bs.bibleFonts = all; save(); go(S.ref.b, S.ref.c, S.ref.v);
}
/** the style attribute for one Bible's text: its own font and size if chosen, else the font the module asks for */
function bibleStyle(m: Bible): string { const o = (BS().bibleFonts || {})[m.id] || {}; const f = o.font || m.font; const st = (f ? `font-family:'TwGreek','TwHebrew','${esc(f).replace(/'/g, '')}',var(--font-text);` : '') + (o.size && o.size !== 100 ? `font-size:${o.size}%;` : ''); return st ? ` style="${st}"` : ''; }
type BibleSettings = { hiddenBibles?: string[]; bibleSets?: Record<string, string[]>; bibleFonts?: Record<string, { font?: string; size?: number }>; showHiddenBibles?: boolean };
const BS = () => S as unknown as BibleSettings;
function bibleMenu(): void {
  const m = $('#bibleMenu'); const bs = BS(); const hid = new Set(bs.hiddenBibles || []); const sets = bs.bibleSets || {};
  // the open Bibles first, in the order they are read side by side, then the others
  const rows = [...openBibles(), ...bibles.filter(b => !S.open.includes(b.id) && (bs.showHiddenBibles || !hid.has(b.id)))];
  const row = (b: Bible) => { const on = S.open.includes(b.id); const i = S.open.indexOf(b.id); return `<div class="brow${hid.has(b.id) ? ' bhid' : ''}"><label><input type="checkbox" data-id="${esc(b.id)}" ${on ? 'checked' : ''}><b>${esc(b.abbr)}</b><span class="small">${esc(b.title)}</span><span class="fmt">${b.format}</span></label>` +
    (on ? `<button class="ib" data-up="${esc(b.id)}" title="Move left" ${i === 0 ? 'disabled' : ''}>↑</button><button class="ib" data-down="${esc(b.id)}" title="Move right" ${i === S.open.length - 1 ? 'disabled' : ''}>↓</button>` : `<button class="ib" data-hide="${esc(b.id)}" title="${hid.has(b.id) ? 'Show in this list again' : 'Hide from this list'}">${hid.has(b.id) ? '◌' : '⊘'}</button>`) +
    `<button class="ib" data-font="${esc(b.id)}" title="Font for ${esc(b.abbr)}">Aa</button><button class="ib" data-props="${esc(b.id)}" title="Properties of ${esc(b.abbr)}">ⓘ</button></div>`; };
  m.innerHTML = `<div class="mh">Bibles <span class="small">(tick to read side by side)</span></div>` + rows.map(row).join('') +
    (hid.size ? `<label class="small bshow"><input type="checkbox" id="mShowHid" ${bs.showHiddenBibles ? 'checked' : ''}> Show the ${hid.size} hidden Bible${hid.size > 1 ? 's' : ''}</label>` : '') +
    `<div class="msep"></div><div class="mh">Bible sets</div>` +
    Object.entries(sets).map(([n, ids]) => `<div class="brow"><button class="mset" data-set="${esc(n)}" title="${esc(ids.map(id => bibles.find(x => x.id === id)?.abbr || '?').join(', '))}">${esc(n)}</button><button class="ib" data-delset="${esc(n)}" title="Delete this set">×</button></div>`).join('') +
    `<button id="mSaveSet">Save the ticked Bibles as a set…</button>` +
    `<div class="msep"></div><button id="mImport">Import modules…</button>${isAndroid ? '' : '<button id="mFolder">Read modules from a folder…</button>'}` +
    (S.folders.length ? `<div class="small fl">${S.folders.map(esc).join('<br>')}</div>` : '');
  const after = () => { save(); buildNav(); go(S.ref.b, S.ref.c, S.ref.v); bibleMenu(); };
  m.querySelectorAll<HTMLInputElement>('input[data-id]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.id!; S.open = cb.checked ? [...S.open, id] : S.open.filter(x => x !== id); after();
  });
  const move = (id: string, d: number) => { const i = S.open.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= S.open.length) return; [S.open[i], S.open[j]] = [S.open[j], S.open[i]]; after(); };
  m.querySelectorAll<HTMLButtonElement>('[data-up]').forEach(x => x.onclick = e => { e.stopPropagation(); move(x.dataset.up!, -1); });
  m.querySelectorAll<HTMLButtonElement>('[data-down]').forEach(x => x.onclick = e => { e.stopPropagation(); move(x.dataset.down!, 1); });
  m.querySelectorAll<HTMLButtonElement>('[data-hide]').forEach(x => x.onclick = e => { e.stopPropagation(); const id = x.dataset.hide!; bs.hiddenBibles = hid.has(id) ? [...hid].filter(h => h !== id) : [...hid, id]; save(); bibleMenu(); });
  const sh = m.querySelector<HTMLInputElement>('#mShowHid'); if (sh) sh.onchange = () => { bs.showHiddenBibles = sh.checked; save(); bibleMenu(); };
  m.querySelectorAll<HTMLButtonElement>('[data-set]').forEach(x => x.onclick = () => { const ids = (sets[x.dataset.set!] || []).filter(id => bibles.some(b => b.id === id)); if (!ids.length) return flash('None of the Bibles in this set are here'); S.open = ids; after(); });
  m.querySelectorAll<HTMLButtonElement>('[data-delset]').forEach(x => x.onclick = e => { e.stopPropagation(); const n = { ...sets }; delete n[x.dataset.delset!]; bs.bibleSets = n; save(); bibleMenu(); });
  m.querySelector<HTMLButtonElement>('#mSaveSet')!.onclick = async () => {
    if (!S.open.length) return flash('Tick some Bibles first');
    m.classList.add('hidden'); let name = '';
    const r = await dialog('Save a Bible set', `<label class="fl">Name <input id="setName" class="txt" placeholder="e.g. Greek and English"></label><p class="small">${S.open.map(id => esc(bibles.find(b => b.id === id)?.abbr)).join(', ')} – in this order. Choose the set later in the Bibles menu.</p>`, [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], bx => { const i = bx.querySelector<HTMLInputElement>('#setName')!; i.focus(); i.oninput = () => { name = i.value.trim(); }; });
    if (r === 'ok' && name) { bs.bibleSets = { ...sets, [name]: [...S.open] }; save(); flash(`Bible set “${name}” saved`); }
  };
  m.querySelectorAll<HTMLButtonElement>('[data-font]').forEach(x => x.onclick = e => { e.stopPropagation(); const b = bibles.find(y => y.id === x.dataset.font); if (b) { m.classList.add('hidden'); bibleFontDialog(b); } });
  m.querySelectorAll<HTMLButtonElement>('[data-props]').forEach(pb => pb.onclick = e => { e.stopPropagation(); const b = bibles.find(x => x.id === pb.dataset.props); if (b) { m.classList.add('hidden'); openProps(b.file, b.title); } });
  ($('#mImport') as HTMLButtonElement).onclick = importModules;
  const mf = document.querySelector<HTMLButtonElement>('#mFolder'); if (mf) mf.onclick = addFolder;
}
function skinMenu(): void {
  $('#skinMenu').innerHTML = '<div class="mh">Skin</div>' + Object.entries(SKINS).map(([id, s]) =>
    `<button data-skin="${id}" class="${S.skin === id ? 'on' : ''}"><span class="sw" style="background:linear-gradient(135deg, ${s.v.textbg} 0 50%, ${s.v['cap-bible']} 50%)"></span>${s.name}</button>`).join('');
  $('#skinMenu').querySelectorAll<HTMLButtonElement>('[data-skin]').forEach(b => b.onclick = () => { S.skin = b.dataset.skin!; applyLook(S.skin, S.fontSize, S.look); save(); skinMenu(); });
}
/** a choice of dictionary for word popups (theWord: which Strong's dictionary for Greek and for Hebrew) */
function dictPick(k: 'greek' | 'hebrew' | 'morph', label: string, f: (d: BookMod) => boolean): string {
  const ds = books.filter(d => d.kind === 'dictionary' && !d.locked && f(d)); if (ds.length < 2) return '';
  const cur = (WS().dictPref || {})[k] || '';
  return `<div class="mrow msel">${esc(label)} <select data-dpref="${k}"><option value="">Automatic</option>${ds.map(d => `<option value="${esc(d.id)}"${d.id === cur ? ' selected' : ''}>${esc(d.abbr || d.title)}</option>`).join('')}</select></div>`;
}
/** the Options menu: what to show, text size, order of the books, the Options window */
function optMenu(): void {
  const m = $('#optMenu');
  m.innerHTML = '<div class="mh">Show</div>' + [['strongs', "Strong's numbers"], ['morph', 'Morphology'], ['footnotes', 'Footnotes'], ['headings', 'Headings'], ['woj', 'Words of Jesus in red'], ['added', 'Added words in italics'], ['xrefs', 'Cross-references'], ['highlights', 'My highlighting'], ['notes', 'My notes under the verses'], ['lemma', 'Lemmas'], ['paragraph', 'Paragraph mode (P)']]
      .map(([k, l]) => `<label><input type="checkbox" data-show="${k}" ${S.show[k] ? 'checked' : ''}> ${l}</label>`).join('') +
    '<div class="msep"></div><div class="mh">Word popups</div>' +
    `<label><input type="checkbox" id="mOrig" ${S.show.origWord !== false ? 'checked' : ''}> Original word and transliteration</label>` +
    `<label><input type="radio" name="mwo" data-wo="morph" ${WS().wordOrder !== 'strong' ? 'checked' : ''}> Morphology first</label><label><input type="radio" name="mwo" data-wo="strong" ${WS().wordOrder === 'strong' ? 'checked' : ''}> Strong's entry first</label>` +
    `<label><input type="checkbox" id="mPopAll" ${WS().popAll !== false ? 'checked' : ''}> Verse popups: all open Bibles</label>` +
    dictPick('greek', "Greek Strong's", d => d.isStrong) + dictPick('hebrew', "Hebrew Strong's", d => d.isStrong) + dictPick('morph', 'Morphology', d => d.isMorph) +
    `<div class="msep"></div><div class="mrow">Text size <button data-fs="-1">A−</button><b class="fsv">${S.fontSize}</b><button data-fs="1">A+</button></div>` +
    '<div class="msep"></div><div class="mh">Order of the books</div>' + [['1611', '1611 King James (Apocrypha between)'], ['nets', 'Septuagint – NETS'], ['orthodox', 'Greek Orthodox']].map(([k, l]) => `<label><input type="radio" name="mord" data-ord="${k}" ${S.look.bookOrder === k ? 'checked' : ''}> ${l}</label>`).join('') +
    `<div class="msep"></div><button id="mOpts">Options… <kbd>Ctrl+,</kbd></button>`;
  m.querySelector<HTMLInputElement>('#mOrig')!.onchange = e => { S.show.origWord = (e.target as HTMLInputElement).checked; save(); };
  m.querySelector<HTMLInputElement>('#mPopAll')!.onchange = e => { WS().popAll = (e.target as HTMLInputElement).checked; save(); };
  m.querySelectorAll<HTMLInputElement>('[data-wo]').forEach(r => r.onchange = () => { WS().wordOrder = r.dataset.wo as 'morph' | 'strong'; save(); });
  m.querySelectorAll<HTMLSelectElement>('[data-dpref]').forEach(sel => sel.onchange = () => { WS().dictPref = { ...(WS().dictPref || {}), [sel.dataset.dpref!]: sel.value || undefined }; save(); });
  m.querySelector<HTMLButtonElement>('#mOpts')!.onclick = () => { m.classList.add('hidden'); openOptions(); };
  m.querySelectorAll<HTMLInputElement>('[data-show]').forEach(cb => cb.onchange = () => { S.show[cb.dataset.show!] = cb.checked; save(); go(S.ref.b, S.ref.c, S.ref.v); });
  m.querySelectorAll<HTMLButtonElement>('[data-fs]').forEach(b => b.onclick = () => { S.fontSize = Math.max(12, Math.min(34, S.fontSize + +b.dataset.fs!)); document.documentElement.style.setProperty('--size', S.fontSize + 'px'); save(); m.querySelector('.fsv')!.textContent = String(S.fontSize); });
  m.querySelectorAll<HTMLInputElement>('[data-ord]').forEach(r => r.onchange = () => { S.look.bookOrder = r.dataset.ord as Look['bookOrder']; save(); canon.setOrder(S.look.bookOrder); buildNav(); go(S.ref.b, S.ref.c, S.ref.v); viewsReload(); });
}
/** the Layouts menu: open and close panels, add Bible and book views, layouts */
function layoutMenu(): void {
  const m = $('#layoutMenu'); const saved = (S as unknown as { layouts?: Record<string, Layout> }).layouts || {};
  const extra = openPanels().filter(p => !PANELS.includes(p));
  m.innerHTML = '<div class="mh">Panels</div>' + PANELS.map(p => `<label><input type="checkbox" data-pan="${p}" ${isOpen(p) ? 'checked' : ''}> ${esc(titleOf(p))}</label>`).join('') +
    extra.map(p => `<label><input type="checkbox" data-pan="${esc(p)}" checked> ${esc(p.startsWith('bible-') ? 'Bible view: ' : 'Book view: ')}${esc(titleOf(p))}</label>`).join('') +
    '<div class="msep"></div><button id="mAddBible">+ New Bible view</button><button id="mAddBook">+ New book view</button>' +
    `<button id="mHideAll">${isHiddenAll() ? 'Show the panels' : 'Hide all panels'}</button>` +
    '<div class="msep"></div><div class="mh">Layouts</div>' + Object.entries(DOCK_PRESETS).map(([k, [l]]) => `<button data-pre="${k}">${esc(l)}</button>`).join('') +
    Object.keys(saved).map(n => `<div class="mrow lrow"><button data-lay="${esc(n)}">${esc(n)}</button><i class="ldel" data-del="${esc(n)}" title="Delete this layout">×</i></div>`).join('') +
    '<button id="mSaveLay">Save this layout…</button>';
  m.querySelectorAll<HTMLInputElement>('[data-pan]').forEach(cb => cb.onchange = () => { if (cb.checked) openPanel(cb.dataset.pan!); else closePanel(cb.dataset.pan!); layoutMenu(); });
  const add = (id: string) => { m.classList.add('hidden'); openPanel(id); };
  m.querySelector<HTMLElement>('#mAddBible')!.onclick = () => add(addBibleView());
  m.querySelector<HTMLElement>('#mAddBook')!.onclick = () => add(addBookView());
  m.querySelector<HTMLElement>('#mHideAll')!.onclick = () => { S.sideHidden = !isHiddenAll(); save(); setHidden(!!S.sideHidden); m.classList.add('hidden'); };
  m.querySelectorAll<HTMLElement>('[data-pre]').forEach(b => b.onclick = () => { m.classList.add('hidden'); setLayout(DOCK_PRESETS[b.dataset.pre!][1]); S.sideHidden = false; save(); });
  m.querySelectorAll<HTMLElement>('[data-lay]').forEach(b => b.onclick = () => { m.classList.add('hidden'); setLayout(saved[b.dataset.lay!]); S.sideHidden = false; save(); });
  m.querySelectorAll<HTMLElement>('[data-del]').forEach(b => b.onclick = e => { e.stopPropagation(); delete saved[b.dataset.del!]; save(); layoutMenu(); });
  m.querySelector<HTMLElement>('#mSaveLay')!.onclick = async () => {
    m.classList.add('hidden'); let name = '';
    const r = await dialog('Save this layout', '<label class="fl">Name <input id="layName" class="txt" placeholder="e.g. Greek study"></label><p class="small">The places and sizes of the open panels are saved. Choose it later in the Layouts menu.</p>', [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], b => { const i = b.querySelector<HTMLInputElement>('#layName')!; i.focus(); i.oninput = () => { name = i.value.trim(); }; });
    if (r === 'ok' && name) { (S as unknown as { layouts: Record<string, Layout> }).layouts = { ...saved, [name]: currentLayout() }; save(); flash(`Layout “${name}” saved`); }
  };
}
function toggleMenu(id: string, fill: () => void): void {
  const m = $(id); const was = !m.classList.contains('hidden');
  document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden'));
  if (!was) {
    fill(); m.classList.remove('hidden');
    // a menu on the right side opens under its own button
    const btn = { '#skinMenu': '#skinBtn', '#optMenu': '#optBtn', '#layoutMenu': '#sideBtn' }[id];
    if (btn && !isPhone()) { const r = $(btn).getBoundingClientRect(); m.style.left = 'auto'; m.style.right = Math.max(6, innerWidth - r.right) + 'px'; }
  }
}
/** book → chapter picker (the way to move around on a phone) */
function picker(): void {
  const body = $('#sheetBody');
  const books = (grp: string) => nav.filter(b => b.grp === grp).map(b => `<button data-b="${b.id}" class="${b.id === S.ref.b ? 'on' : ''}">${esc(b.abbr)}</button>`).join('');
  const label: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' };
  body.innerHTML = `<div class="pk">${['OT', 'AP', 'APX', 'NT'].filter(g => nav.some(b => b.grp === g)).map(g => `<h5>${label[g]}</h5><div class="pgrid">${books(g)}</div>`).join('')}</div>`;
  body.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(btn => btn.onclick = () => {
    const bk = nav.find(x => x.id === +btn.dataset.b!)!;
    body.innerHTML = `<div class="pk"><h5>${esc(bk.name)}</h5><div class="pgrid ch">${bk.chapters.map(c => `<button data-c="${c}">${c}</button>`).join('')}</div></div>`;
    body.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(cb => cb.onclick = async () => {
      const c = +cb.dataset.c!; const m = openBibles()[0];
      const n = m ? (await m.chapter(bk.id, c)).reduce((x, r) => Math.max(x, r.v), 0) : 0;
      const count = n || canon.kjvChapters(bk.id)[c - 1] || 0;
      if (!count) { $('#sheet').classList.remove('open'); return void go(bk.id, c); }
      body.innerHTML = `<div class="pk"><h5>${esc(bk.name)} ${c}</h5><div class="pgrid ch">${Array.from({ length: count }, (_, i) => `<button data-v="${i + 1}">${i + 1}</button>`).join('')}</div></div>`;
      body.querySelectorAll<HTMLButtonElement>('[data-v]').forEach(vb => vb.onclick = async () => { $('#sheet').classList.remove('open'); const v = +vb.dataset.v!; await go(bk.id, c, v); $('#view').querySelector(`[data-v="${v}"]`)?.scrollIntoView({ block: 'center' }); });
    });
  });
  $('#sheet').classList.add('open');
}

async function importModules(): Promise<void> {
  const picked = await openDialog({ multiple: true, title: 'Import theWord or e-Sword modules' });
  const list = !picked ? [] : Array.isArray(picked) ? picked : [picked];
  if (list.length) await importPaths(list.map(String));
}
async function importPaths(list: string[]): Promise<void> {
  const files = list.map(p => { const path = String(p); return { name: decodeURIComponent(path.split(/[\\/]/).pop() || 'module').replace(/^.*%2F/, '').replace(/^.*\//, ''), data: () => readFile(path) }; });
  $('#bibleMenu').classList.add('hidden');
  const r = await importFiles(files, t => { $('#status').textContent = t; });
  if (r.some(x => x.status === 'imported' || x.status === 'updated')) { await loadModules(); await go(S.ref.b, S.ref.c); openRest().then(viewsReload); }
  else statusLine(0);
  await dialog('Import report', reportHtml(r), [{ label: 'OK', value: 'ok', primary: true }], b => b.parentElement!.classList.add('wide'));
}
async function addFolder(): Promise<void> {
  const d = await openDialog({ directory: true, title: 'Choose a folder with theWord or e-Sword modules' });
  if (!d || S.folders.includes(String(d))) return;
  S.folders.push(String(d)); save(); await loadModules(); await go(S.ref.b, S.ref.c); openRest().then(viewsReload); bibleMenu();
}

/* ---------------------------------------------------------------- start */
async function init(): Promise<void> {
  const stored = await loadSettings().catch(() => ({})) as Partial<Settings>;
  const legacy = await legacyData().catch(() => null);
  let migrated: string | null = null;
  if (!Object.keys(stored).length && legacy && legacy.settings) {
    // first start: take over the settings of Tanglaw 0.4 (Electron) on this computer
    const L = legacy.settings as Record<string, any>;
    Object.assign(stored, {
      folders: [...(L.moduleFolders || []), ...(legacy.modules ? [legacy.modules] : [])], open: L.openBibles || [], ref: L.ref || DEFAULT.ref,
      skin: (L.appearance && L.appearance.skin) || (L.theme === 'dark' ? 'slate' : 'parchment'), show: Object.assign({}, DEFAULT.show, L.show || {}), fontSize: L.fontSize || DEFAULT.fontSize,
      look: Object.assign({ ...LOOK }, pickLook(L.appearance || {})),
    });
    migrated = 'took over your module folders, Bibles and skin from Tanglaw 0.4';
  }
  S = Object.assign({}, DEFAULT, stored);
  S.show = Object.assign({}, DEFAULT.show, S.show);
  S.look = Object.assign({ ...LOOK }, S.look || {});
  applyLook(S.skin, S.fontSize, S.look);
  canon.setOrder(S.look.bookOrder);
  document.body.classList.toggle('android', isAndroid);
  ownDir = await modulesDir();
  const win = getCurrentWindow();
  $('#wMin').onclick = () => win.minimize(); $('#wMax').onclick = () => win.toggleMaximize(); $('#wClose').onclick = () => win.close();
  $('#bookSel').onchange = () => go(+$<HTMLSelectElement>('#bookSel').value, 1);
  $('#chapSel').onchange = () => go(S.ref.b, +$<HTMLSelectElement>('#chapSel').value);
  $('#verseSel').onchange = () => { const v = +$<HTMLSelectElement>('#verseSel').value; selectVerse(v); $('#view').querySelector(`[data-v="${v}"]`)?.scrollIntoView({ block: 'center' }); };
  $('#prev').onclick = $('#pPrev').onclick = () => step(-1);
  $('#next').onclick = $('#pNext').onclick = () => step(1);
  $('#refBtn').onclick = picker;
  $('#biblesBtn').onclick = e => { e.stopPropagation(); toggleMenu('#bibleMenu', bibleMenu); };
  $('#skinBtn').onclick = e => { e.stopPropagation(); toggleMenu('#skinMenu', skinMenu); };
  $('#optBtn').onclick = e => { e.stopPropagation(); toggleMenu('#optMenu', optMenu); };
  $('#emptyImport').onclick = importModules;
  $('#helpBtn').onclick = () => openGuide();
  // the books & chapters icon on the Bible text's caption
  $('#capPick').innerHTML = icon('tree', 17);
  $('#capPick').onclick = e => openPicker(e.currentTarget as HTMLElement, nav, { b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 },
    async (b, c) => { const m = openBibles()[0]; return m ? ((m.books.get(b) || [])[c - 1] || 0) : (canon.kjvChapters(b)[c - 1] || 0); },
    (b, c, v) => go(b, c, v));
  // the topic lists of the Library and book views: drag the edge to make them wider or narrower
  const libw = (S as unknown as { libW?: number }).libW; if (libw) document.documentElement.style.setProperty('--libw', libw + 'px');
  document.addEventListener('pointerdown', e => {
    const sp = (e.target as HTMLElement).closest?.<HTMLElement>('.lsplit'); if (!sp) return;
    e.preventDefault(); sp.setPointerCapture(e.pointerId);
    const side = sp.previousElementSibling as HTMLElement; const x0 = e.clientX, w0 = side.offsetWidth; const max = (sp.parentElement as HTMLElement).offsetWidth - 120;
    const mv = (ev: PointerEvent) => { const w = Math.round(Math.max(100, Math.min(max, w0 + ev.clientX - x0))); (S as unknown as { libW: number }).libW = w; document.documentElement.style.setProperty('--libw', w + 'px'); };
    const up = () => { sp.removeEventListener('pointermove', mv); sp.removeEventListener('pointerup', up); save(); };
    sp.addEventListener('pointermove', mv); sp.addEventListener('pointerup', up);
  });
  $('#copyBtn').onclick = () => copyDialog({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 });
  document.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('.menu, .tbtn')) document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden')); if (!popKeep && !(e.target as HTMLElement).closest('#popup, [data-strong], [data-morph], sup.fn, a.xr')) hidePopup(); });
  $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet') || (e.target as HTMLElement).closest('.grab')) $('#sheet').classList.remove('open'); });
  // words: hover (mouse) or tap (touch)
  let timer = 0;
  document.addEventListener('mouseover', e => {
    if (isPhone() || !(e.target as HTMLElement).closest?.('#view, #searchResults')) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn, a.xr'); clearTimeout(timer);
    if (t) timer = window.setTimeout(() => showWord(t), 300);
  });
  document.addEventListener('mouseout', e => {
    if (!(e.target as HTMLElement).closest?.('#view, #searchResults')) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn, a.xr'); if (!t) return;
    const to = e.relatedTarget as Node | null; if (to && (t.contains(to) || $('#popup').contains(to))) return;
    clearTimeout(timer); popupLeaveSoon();
  });
  const pop = $('#popup');
  pop.addEventListener('click', popToolClick);
  pop.addEventListener('mouseenter', () => clearTimeout(popHideT));
  pop.addEventListener('mouseleave', () => popupLeaveSoon());
  // remember the size after you drag the popup's corner
  pop.addEventListener('mousedown', () => { popResizing = true; const w0 = pop.offsetWidth, h0 = pop.offsetHeight;
    const up = () => { document.removeEventListener('mouseup', up); popResizing = false;
      if (pop.offsetWidth !== w0 || pop.offsetHeight !== h0) { (S as unknown as Record<string, unknown>).popup = { w: pop.offsetWidth, h: pop.offsetHeight }; save(); } };
    document.addEventListener('mouseup', up); });
  $('#view').addEventListener('click', e => {
    const rm = (e.target as HTMLElement).closest<HTMLElement>('.rmx');
    if (rm) { const [b, c, v] = rm.dataset.from!.split('.').map(Number); const [tb, tc, tv] = rm.dataset.to!.split('.').map(Number); removeXref({ b, c, v }, { b: tb, c: tc, v: tv }).then(rerender); return; }
    const xr = (e.target as HTMLElement).closest<HTMLElement>('a.xr');
    if (xr) { if (isPhone()) return void showWord(xr); const [b, c, v] = xr.dataset.ref!.split('.').map(Number); $('#popup').classList.add('hidden'); return void go(b, c, v); }
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn'); if (t) return void showWord(t, true);
    const fl = (e.target as HTMLElement).closest<HTMLElement>('.fnlist li[data-gov]'); if (fl) return void selectVerse(+fl.dataset.gov!);
    const vn = (e.target as HTMLElement).closest<HTMLElement>('.vn, .pvn'); if (!vn) return;
    const v = +vn.closest<HTMLElement>('[data-v]')!.dataset.v!;
    $('#view').querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); vn.closest('[data-v]')!.classList.add('sel');
    S.ref.v = v; save(); updateCommentary(); $<HTMLSelectElement>('#verseSel').value = String(v); document.dispatchEvent(new CustomEvent('tanglaw-ref'));
    if ((e.target as HTMLElement).closest('.cm')) showPanel('cmt');
  });
  // links anywhere (commentary, library, popups, notes): a Bible reference opens the verse, a book link the topic
  document.addEventListener('click', e => {
    const fd = (e.target as HTMLElement).closest<HTMLElement>('[data-find]');
    if (fd && !fd.closest('#p-search')) { e.preventDefault(); $('#popup').classList.add('hidden'); $('#sheet').classList.remove('open'); showPanel('search'); find(fd.dataset.find!); return; }
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-href]'); if (!a) return;
    e.preventDefault(); const href = a.dataset.href || '';
    const r = /bible/i.test(href) ? bibleTarget(href) : null;
    $('#popup').classList.add('hidden');
    if (r) { go(r.b, r.c, r.v); if (isPhone()) { document.body.classList.remove('side-open'); $('#sheet').classList.remove('open'); } return; }
    followBookLink(href).then(ok => { if (!ok && /^https?:/i.test(href)) flash('Web links open in your browser: ' + href); });
  });
  wireRefPreview(versePreview);
  // the study panel (Commentary, Library, Search)
  initSearch({ openBibles, allBibles: () => bibles, ref: () => ({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 }), go, settings: () => S as unknown as Record<string, unknown>, save });
  initViews({ bibles: () => bibles, openBibles, books: () => books, nav: () => nav, ref: () => ({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 }), go, show: () => S.show, clean, showWord, settings: () => S as unknown as Record<string, unknown>, save, retitle, bibleStyle, hiddenBibles: () => BS().hiddenBibles || [] });
  initPanel({ books: () => books, openBibles, ref: () => ({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 }), go, clean, save, settings: () => S as unknown as Record<string, unknown> });
  initCopy({ nav: () => nav, openBibles, save: saveUD });
  initProps(async () => { await loadModules(); await go(S.ref.b, S.ref.c, S.ref.v); await openRest(); await reloadLib(); viewsReload(); });
  $('#libProps').onclick = () => { const m = libCurrent(); if (m) openProps(m.file, m.title); else flash('Choose a module first'); };
  const studyNote = await initStudy({ ref: () => ({ b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 }), go, rerender, openBibles, showPanel, show: () => S.show }, legacy ? legacy.study : null);
  const note = [migrated, studyNote].filter(Boolean).join('; ');
  if (note) setTimeout(() => flash('Welcome to the new Tanglaw – ' + note + '.'), 1200);
  if (S.sideHidden) setHidden(true);
  $('#sideBtn').onclick = e => { e.stopPropagation(); toggleMenu('#layoutMenu', layoutMenu); };
  document.addEventListener('dock-unhide', () => { S.sideHidden = false; save(); });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach(b => b.onclick = () => showPanel(b.dataset.open!));
  let typed = '', typedT = 0;
  document.addEventListener('keydown', e => {
    const tg = e.target as HTMLElement;
    if ((tg instanceof HTMLElement && (tg.matches('input, select, textarea') || tg.isContentEditable)) || document.querySelector('.dlg')) return;
    const k = e.key; const digit = /^Digit(\d)$/.exec(e.code); const d = digit ? +digit[1] : null;
    const cur = { b: S.ref.b, c: S.ref.c, v: S.ref.v || 1 };
    if (k === 'Escape') { $('#popup').classList.add('hidden'); $('#sheet').classList.remove('open'); $('#vmenu').classList.add('hidden'); document.body.classList.remove('side-open'); return; }
    if (e.altKey && (k === 'ArrowLeft' || k === 'ArrowRight')) { e.preventDefault(); return historyGo(k === 'ArrowLeft' ? -1 : 1); }
    if (!e.altKey && !e.ctrlKey && k === 'Backspace') { e.preventDefault(); return historyGo(-1); }
    if (e.ctrlKey && k.toLowerCase() === 'l') { e.preventDefault(); return addToList([cur]); }
    if (e.ctrlKey && k.toLowerCase() === 'c' && !String(window.getSelection())) { e.preventDefault(); copyVerse(cur); return; }
    if (e.ctrlKey && k === ',') { e.preventDefault(); return openOptions(); }
    if (k === 'F1') { e.preventDefault(); return openGuide(); }
    if (k === 'F5') { e.preventDefault(); copyDialog(cur); return; }
    if (e.ctrlKey && k === 'ArrowLeft') { e.preventDefault(); return stepBook(-1); }
    if (e.ctrlKey && k === 'ArrowRight') { e.preventDefault(); return stepBook(1); }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (k === 'ArrowLeft') return step(-1);
    if (k === 'ArrowRight') return step(1);
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); return selectVerse(cur.v + (k === 'ArrowUp' ? -1 : 1)); }
    if (k === 'p' || k === 'P') { S.show.paragraph = !S.show.paragraph; save(); optMenu(); flash(S.show.paragraph ? 'Paragraph mode' : 'Verse by verse'); return void go(S.ref.b, S.ref.c, S.ref.v); }
    if (d != null) { // typing a number goes to that verse (Shift: chapter)
      clearTimeout(typedT); typed += String(d);
      const shift = e.shiftKey;
      typedT = window.setTimeout(() => { const n = +typed; typed = ''; if (shift) go(S.ref.b, n); else selectVerse(n); }, 600);
    }
  });
  // swipe left/right on a phone
  let sx = 0, sy = 0;
  $('#view').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#view').addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1); });
  let last = isPhone(); window.addEventListener('resize', () => { if (isPhone() !== last) { last = isPhone(); go(S.ref.b, S.ref.c); } });
  await loadModules();
  await go(S.ref.b, S.ref.c, S.ref.v || 1);
  const w = window as unknown as Record<string, unknown>;
  w.__tanglawFirst = Math.round(performance.now());
  await openRest(); viewsReload();
  w.__tanglawReady = Math.round(performance.now());
  (window as unknown as Record<string, unknown>).__tanglaw = { setOpen: (ids: string[]) => { S.open = ids; buildNav(); }, go, step, S: () => S, bibles: () => bibles, books: () => books, dicts: () => books.filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked), showWord, picker, showPanel, addXref, removeXref, rerender, importPaths, openProps, clean, openGuide, locked: () => locked };
}
init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${esc((e as Error).stack || e)}</pre>`); });
