// Tanglaw (Tauri) – proof of concept: open theWord / e-Sword Bibles, read a chapter side by side,
// Strong's popups from your dictionaries, the eight skins; desktop and phone layouts from one code base.
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Bible, Locked, isBibleFile, isLocked, openBible } from './bibles';
import { BookMod, Topic, guessKind, isBookFile, openBook } from './books';
import type { ModFile } from './native';
import { followBookLink, initPanel, morphEntry, openLib, refreshLib, libCurrent, libTopicId, reloadLib, show as showPanel, strongEntry, updateCommentary } from './panel';
import { bookHitOf, find, forgetSearchCache, initSearch } from './search';
import { exportTopics } from './export';
import { initClipmon, clipOn, clipTestReader, setClipmon } from './clipmon';
import { exportForTest } from './export';
import { strFromU8, unzipSync } from 'fflate';
import { openImage, printHtml, viewerOpen } from './tools';
import { initAnnotate } from './annotate';
import { initUserMods, newUserModule } from './usermods';
import { currentLang, initLang, translationTable } from './i18n';
import { initKeys, keysDialog, runKey } from './keys';
import { autoUpdates, checkUpdate, initUpdate, newer, setAutoUpdates } from './update';
import { defineModuleSets } from './search';
import { firstOriginal, translit } from './translit';
import { legacyData, loadSettings, modulesDir, saveSettings, scan } from './native';
import { addToList, copyVerse, initStudy, saveUD } from './study';
import { copyDialog, initCopy } from './copy';
import { bibleTarget, linkRefs, wireRefPreview } from './refs';
import { addXref, loadXrefs, removeXref } from './xrefs';
import { copyText, dialog, flash } from './ui';
import { PRESETS as DOCK_PRESETS, Layout, PANELS, close as closePanel, isHiddenAll, isOpen, layout as currentLayout, openPanel, openPanels, retitle, setHidden, setLayout, titleOf } from './dock';
import { addBookView, addCompareView, addSearchView, compareViews, initViews, viewsReload } from './views';
import { activeBible, activeId, activeRef, addBibleView, bvIds, go, historyGo, initBibleViews, renderAll, selectVerse as bvSelectVerse, setActive, setBible, stepBook as bvStepBook, stepChapter, toggleShow as bvToggle, viewBibles, effShow } from './bibleviews';
import { booksOf } from './picker';
import { initTts, langOf, readNextChapter, readable, speakPieces, speakTopic, stopSpeaking, isSpeaking, voicesDialog } from './tts';
import { icon } from './icons';
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
function openOptions(): void { optionsDialog(S, rr => { applyLook(S.skin, S.fontSize, S.look); save(); if (canon.getOrder() !== S.look.bookOrder) { canon.setOrder(S.look.bookOrder); buildNav(); } if (rr) rerender(); else renderAll(); }); }

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
  buildNav();
  statusLine(performance.now() - t0);
}

function statusLine(ms: number): void {
  const nd = books.filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked).length, nl = books.filter(m => !m.locked).length;
  $('#status').textContent = `${bibles.length} Bible${bibles.length === 1 ? '' : 's'} · ${nl} library modules${restBooks.length ? ` (opening ${restBooks.length} more…)` : ` (${nd} Strong's dictionaries)`} · ${Math.round(ms)} ms`;
}
function openBibles(): Bible[] { const v = viewBibles(); return v.length ? v : bibles.slice(0, 1); }

/** the books of the active view's Bible (the copy window and the phone's book picker use them) */
function buildNav(): void {
  const m = activeBible() || bibles[0];
  nav = m ? booksOf(m).map(b => ({ id: b.id, name: b.name, abbr: canon.book(b.id).abbr, grp: b.grp, chapters: b.chapters })) : [];
}

/* ---------------------------------------------------------------- reading: the Bible views (bibleviews.ts) */
const rerender = () => { renderAll(true); };
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
function stepBook(d: number): void { const id = activeId(); if (id) bvStepBook(id, d); }
function selectVerse(v: number): void { const id = activeId(); if (id) bvSelectVerse(id, v); }
function step(d: number): void { const id = activeId(); if (id) stepChapter(id, d); }
/** the place of the active Bible view moved: the panels that follow it */
function moved(): void {
  const r = activeRef(); const m = activeBible(); buildNav();
  const bk = canon.book(r.b); $('#refBtn').textContent = `${bk ? bk.name : ''} ${r.c}`;
  updateCommentary(); document.dispatchEvent(new CustomEvent('tanglaw-ref'));
  void m;
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
  else if (el.matches('li.bhit')) { const h = bookHitOf(el); const e = h && await h.mod.topic(h.id); if (e) html = `<div class="entry"><h4>${esc(e.subject)}</h4><div class="src">${esc(h!.mod.title)}</div>${clean(e.html)}</div>`; }
  else if (el.dataset.wl) html = await wordLookup(el.dataset.wl, el.dataset.wlLemma || '');
  else if (keys.length || el.dataset.morph) html = await lookup(keys, (el.dataset.morph || '').split(/\s+/).filter(Boolean), el.dataset.lemma || '');
  if (!html) return;
  if (!el.matches('a.xr, sup.fn, li.bhit')) document.dispatchEvent(new CustomEvent('tanglaw-word', { detail: html }));
  if (!el.matches('a.xr, sup.fn, li.bhit') && !el.dataset.wl) document.dispatchEvent(new CustomEvent('tanglaw-key', { detail: { strong: keys, lemma: el.dataset.lemma || '', word: (el.textContent || '').trim() } }));
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

/* ---------------------------------------------------------------- word lookup dictionaries */
// theWord: rest the mouse on any word of the Bible text to see its entry in the dictionaries you choose (key D)
type WLSettings = { wordLook?: { on?: boolean; dicts?: string[]; all?: boolean; lemma?: boolean } };
const WL = () => { const w = S as unknown as WLSettings; return (w.wordLook = w.wordLook || {}); };
/** forms of an English word to try: the word, then without common endings */
function wordForms(w: string): string[] {
  const l = w.toLowerCase(); const out = [w, l];
  const add = (x: string) => { if (x.length > 2 && !out.includes(x)) out.push(x); };
  if (/'s$/.test(l)) add(l.slice(0, -2));
  if (/ies$/.test(l)) add(l.slice(0, -3) + 'y');
  if (/(ches|shes|sses|xes|zes)$/.test(l)) add(l.slice(0, -2));
  if (/s$/.test(l) && !/ss$/.test(l)) add(l.slice(0, -1));
  for (const e of ['eth', 'est', 'ed', 'ing', 'edst', 'th']) if (l.endsWith(e)) { const st = l.slice(0, -e.length); add(st); add(st + 'e'); if (/(.)\1$/.test(st)) add(st.slice(0, -1)); if (/i$/.test(st)) add(st.slice(0, -1) + 'y'); }
  if (/ly$/.test(l)) add(l.slice(0, -2));
  return out;
}
async function wordLookup(word: string, lemma: string): Promise<string> {
  const wl = WL(); const ids = wl.dicts || [];
  const dicts = ids.map(id => books.find(b => b.id === id)).filter((d): d is BookMod => !!d && !d.locked);
  const parts: string[] = [];
  const keys = [...(wl.lemma && lemma ? [lemma] : []), ...wordForms(word)];
  for (const d of dicts) {
    for (const k of keys) { const e = await d.lookup(k); if (e) { parts.push(`<div class="entry"><h4>${esc(e.subject)}</h4><div class="src">${esc(d.title)}</div>${clean(e.html)}</div>`); break; } }
    if (parts.length && !wl.all) break;
  }
  return parts.join('');
}
/** the word under the mouse in the Bible text (letters and apostrophes), with its place on screen */
function wordAt(x: number, y: number): { word: string; rect: DOMRect; lemma: string } | null {
  const d = document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null; caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null, off = 0;
  if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
  else if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  if (!node || node.nodeType !== 3) return null;
  const t = node.textContent || ''; const isL = (c: string) => /[\p{L}\p{M}'’]/u.test(c);
  let a = off, b = off; while (a > 0 && isL(t[a - 1])) a--; while (b < t.length && isL(t[b])) b++;
  const word = t.slice(a, b).replace(/^['’]+|['’]+$/g, ''); if (word.length < 2) return null;
  const rg = document.createRange(); rg.setStart(node, a); rg.setEnd(node, b); const rect = rg.getBoundingClientRect();
  if (x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;
  const owner = (node.parentElement as HTMLElement | null)?.closest<HTMLElement>('[data-lemma]');
  return { word, rect, lemma: owner?.dataset.lemma || '' };
}
let wlAt = '', wlT = 0;
function wordLookMove(e: MouseEvent): void {
  const wl = WL(); if (!wl.on || !(wl.dicts || []).length || isPhone()) return;
  const t = e.target as HTMLElement;
  if (!t.closest('#view .vt, #view td[data-col], #view .pv, #view .vrow') || t.closest('[data-strong], [data-morph], sup, a, .vn, .cl')) { if (wlAt) { wlAt = ''; clearTimeout(wlT); popupLeaveSoon(); } return; }
  const w = wordAt(e.clientX, e.clientY);
  const key = w ? w.word + '@' + Math.round(w.rect.left) + ',' + Math.round(w.rect.top) : '';
  if (key === wlAt) return;
  wlAt = key; clearTimeout(wlT); if (!w) { popupLeaveSoon(); return; }
  wlT = window.setTimeout(() => {
    let a = document.getElementById('wlAnchor'); if (!a) { a = document.createElement('span'); a.id = 'wlAnchor'; document.body.appendChild(a); }
    Object.assign(a.style, { position: 'fixed', left: w.rect.left + 'px', top: w.rect.top + 'px', width: w.rect.width + 'px', height: w.rect.height + 'px', pointerEvents: 'none' });
    a.dataset.wl = w.word; a.dataset.wlLemma = w.lemma; showWord(a);
  }, 450);
}
async function wordLookDialog(): Promise<void> {
  const wl = WL(); const ds = books.filter(d => d.kind === 'dictionary' && !d.locked && !d.isMorph);
  let order = (wl.dicts || []).filter(id => ds.some(d => d.id === id));
  const html = `<p class="small">Rest the mouse on a word of the Bible text to see it in these dictionaries. Tick the ones to use; the first that has the word is shown${''}.</p><div class="wldicts">${ds.map(d => `<label><input type="checkbox" data-wld="${esc(d.id)}" ${order.includes(d.id) ? 'checked' : ''}> ${esc(d.title)}${d.isStrong ? ' <span class="small">(Strong\'s)</span>' : ''}</label>`).join('') || '<p class="hint">No dictionaries yet.</p>'}</div>
    <label class="ck"><input type="checkbox" id="wlAll" ${wl.all ? 'checked' : ''}> Show every dictionary that has the word, not only the first</label>
    <label class="ck"><input type="checkbox" id="wlLem" ${wl.lemma ? 'checked' : ''}> If the word has a lemma, look up the lemma</label>
    <label class="ck"><input type="checkbox" id="wlOn" ${wl.on ? 'checked' : ''}> Word lookup on (key D)</label>`;
  const r = await dialog('Word lookup dictionaries', html, [{ label: 'Cancel', value: null }, { label: 'Done', value: 'ok', primary: true }], b => {
    b.querySelectorAll<HTMLInputElement>('[data-wld]').forEach(cb => cb.onchange = () => { order = cb.checked ? [...order, cb.dataset.wld!] : order.filter(x => x !== cb.dataset.wld); });
    b.querySelector<HTMLInputElement>('#wlAll')!.onchange = e => { wl.all = (e.target as HTMLInputElement).checked; };
    b.querySelector<HTMLInputElement>('#wlLem')!.onchange = e => { wl.lemma = (e.target as HTMLInputElement).checked; };
    b.querySelector<HTMLInputElement>('#wlOn')!.onchange = e => { wl.on = (e.target as HTMLInputElement).checked; };
  });
  if (r === 'ok') { wl.dicts = order; if (order.length && wl.on == null) wl.on = true; save(); optMenu(); }
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
  const cur = activeBible()?.id; const inViews = new Set(viewBibles().map(b => b.id));
  const rows = bibles.filter(b => bs.showHiddenBibles || !hid.has(b.id) || b.id === cur);
  const row = (b: Bible) => `<div class="brow${hid.has(b.id) ? ' bhid' : ''}${b.id === cur ? ' on' : ''}"><button class="bpick" data-use="${esc(b.id)}" title="Show ${esc(b.abbr)} in the active Bible view"><b>${esc(b.abbr)}</b><span class="small">${esc(b.title)}</span>${inViews.has(b.id) ? '<span class="dot" title="Open in a Bible view"></span>' : ''}<span class="fmt">${b.format}</span></button>` +
    `<button class="ib" data-newv="${esc(b.id)}" title="Open ${esc(b.abbr)} in a new Bible view">＋</button>` +
    `<button class="ib" data-hide="${esc(b.id)}" title="${hid.has(b.id) ? 'Show in this list again' : 'Hide from this list'}">${hid.has(b.id) ? '◌' : '⊘'}</button>` +
    `<button class="ib" data-font="${esc(b.id)}" title="Font for ${esc(b.abbr)}">Aa</button><button class="ib" data-props="${esc(b.id)}" title="Properties of ${esc(b.abbr)}">ⓘ</button></div>`;
  m.innerHTML = `<div class="mh">Bibles <span class="small">(click: show in the active view · ＋ a new view)</span></div>` + rows.map(row).join('') +
    (hid.size ? `<label class="small bshow"><input type="checkbox" id="mShowHid" ${bs.showHiddenBibles ? 'checked' : ''}> Show the ${hid.size} hidden Bible${hid.size > 1 ? 's' : ''}</label>` : '') +
    `<div class="msep"></div><div class="mh">Bible sets <span class="small">(open each Bible of the set in a view of its own)</span></div>` +
    Object.entries(sets).map(([n, ids]) => `<div class="brow"><button class="mset" data-set="${esc(n)}" title="${esc(ids.map(id => bibles.find(x => x.id === id)?.abbr || '?').join(', '))}">${esc(n)}</button><button class="ib" data-delset="${esc(n)}" title="Delete this set">×</button></div>`).join('') +
    `<button id="mSaveSet">Save the Bibles of the open views as a set…</button>` +
    `<div class="msep"></div><button id="mImport">Import modules…</button>${isAndroid ? '' : '<button id="mFolder">Read modules from a folder…</button>'}` +
    (S.folders.length ? `<div class="small fl">${S.folders.map(esc).join('<br>')}</div>` : '');
  const hide = () => m.classList.add('hidden');
  m.querySelectorAll<HTMLButtonElement>('[data-use]').forEach(x => x.onclick = () => { hide(); const id = activeId(); if (id) setBible(id, x.dataset.use!); else openBibleView(x.dataset.use!); });
  m.querySelectorAll<HTMLButtonElement>('[data-newv]').forEach(x => x.onclick = e => { e.stopPropagation(); hide(); openBibleView(x.dataset.newv!); });
  m.querySelectorAll<HTMLButtonElement>('[data-hide]').forEach(x => x.onclick = e => { e.stopPropagation(); const id = x.dataset.hide!; bs.hiddenBibles = hid.has(id) ? [...hid].filter(h => h !== id) : [...hid, id]; save(); bibleMenu(); });
  const sh = m.querySelector<HTMLInputElement>('#mShowHid'); if (sh) sh.onchange = () => { bs.showHiddenBibles = sh.checked; save(); bibleMenu(); };
  m.querySelectorAll<HTMLButtonElement>('[data-set]').forEach(x => x.onclick = () => { const ids = (sets[x.dataset.set!] || []).filter(id => bibles.some(b => b.id === id)); if (!ids.length) return flash('None of the Bibles in this set are here'); hide(); showBibles(ids); });
  m.querySelectorAll<HTMLButtonElement>('[data-delset]').forEach(x => x.onclick = e => { e.stopPropagation(); const n = { ...sets }; delete n[x.dataset.delset!]; bs.bibleSets = n; save(); bibleMenu(); });
  m.querySelector<HTMLButtonElement>('#mSaveSet')!.onclick = async () => {
    const ids = viewBibles().map(b => b.id); if (!ids.length) return flash('Open some Bible views first');
    hide(); let name = '';
    const r = await dialog('Save a Bible set', `<label class="fl">Name <input id="setName" class="txt" placeholder="e.g. Greek and English"></label><p class="small">${ids.map(id => esc(bibles.find(b => b.id === id)?.abbr)).join(', ')}. Choose the set later in the Bibles menu: each Bible opens in a view of its own.</p>`, [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], bx => { const i = bx.querySelector<HTMLInputElement>('#setName')!; i.focus(); i.oninput = () => { name = i.value.trim(); }; });
    if (r === 'ok' && name) { bs.bibleSets = { ...sets, [name]: ids }; save(); flash(`Bible set “${name}” saved`); }
  };
  m.querySelectorAll<HTMLButtonElement>('[data-font]').forEach(x => x.onclick = e => { e.stopPropagation(); const b = bibles.find(y => y.id === x.dataset.font); if (b) { hide(); bibleFontDialog(b); } });
  m.querySelectorAll<HTMLButtonElement>('[data-props]').forEach(pb => pb.onclick = e => { e.stopPropagation(); const b = bibles.find(x => x.id === pb.dataset.props); if (b) { hide(); openProps(b.file, b.title); } });
  ($('#mImport') as HTMLButtonElement).onclick = importModules;
  const mf = document.querySelector<HTMLButtonElement>('#mFolder'); if (mf) mf.onclick = addFolder;
}
/** settings of an earlier version: Bibles read side by side become Bible views of their own, in the middle */
function migrateViews(): void {
  const views = ((S as unknown as { views?: Record<string, unknown> }).views ||= {});
  const d = (S.dock || {}) as { v?: number; zones?: Record<string, { size: number; groups: { panels: string[]; active: string; size: number }[] }> };
  if (d.zones?.center) return; // this version's layout already
  const ids = S.open.length ? S.open : [''];
  const r = S.ref; const made: string[] = [];
  for (const bible of ids) { let n = 1; while (views[`bible-${n}`]) n++; views[`bible-${n}`] = { bible, follow: true, b: r.b, c: r.c }; made.push(`bible-${n}`); }
  const center = { size: 0, groups: made.map(id => ({ panels: [id], active: id, size: 1 })) };
  if (d.zones) d.zones.center = center;
  else S.dock = { v: 2, zones: { left: { size: 300, groups: [] }, right: { size: 400, groups: [{ panels: ['cmt'], active: 'cmt', size: 1 }, { panels: ['lib', 'search', 'bsearch', 'study'], active: 'lib', size: 1.3 }] }, bottom: { size: 250, groups: [] }, center }, floats: [], hidden: ['dict'] };
  save();
}
/** read a Bible view aloud from the selected verse; on into the next chapters if chosen */
async function speakView(id: string): Promise<void> {
  if (isSpeaking()) { stopSpeaking(); return; }
  const sec = document.getElementById('p-' + id); const m = bibleOfView(id); if (!sec || !m) return;
  const btn = sec.querySelector<HTMLElement>('[data-bv="speak"]');
  for (let first = true; ; first = false) {
    const root = sec.querySelector<HTMLElement>('.bview')!;
    const sel = first ? +(root.querySelector<HTMLElement>('.sel')?.dataset.v || 1) : 1;
    const rows = [...root.querySelectorAll<HTMLElement>('[data-v]')].filter(r => +r.dataset.v! >= sel);
    const pieces = rows.map(r => ({ text: readable(r.querySelector('.vt') || r), el: r }));
    const done = await speakPieces(pieces, langOf(m.props?.lang), btn);
    if (!done || !readNextChapter()) return;
    const before = sec.querySelector('.bvref')?.textContent; stepChapter(id, 1);
    for (let i = 0; i < 40 && sec.querySelector('.bvref')?.textContent === before; i++) await new Promise(r => setTimeout(r, 100));
    if (sec.querySelector('.bvref')?.textContent === before) return;
  }
}
const bibleOfView = (id: string) => { const c = ((S as unknown as { views?: Record<string, { bible: string }> }).views || {})[id]; return c ? bibles.find(b => b.id === c.bible) : undefined; };
/** a new Bible view in the middle, showing this Bible */
function openBibleView(bible?: string): string { const id = addBibleView(bible); openPanel(id, 'center'); setActive(id); return id; }
/** show these Bibles, one view each (views already open are used first) */
function showBibles(ids: string[]): void {
  const open = bvIds().filter(id => isOpen(id));
  ids.forEach((bid, i) => { if (open[i]) setBible(open[i], bid); else openBibleView(bid); });
  for (const id of open.slice(ids.length)) closePanel(id);
  const first = bvIds().find(id => isOpen(id)); if (first) setActive(first);
}
function skinMenu(): void {
  $('#skinMenu').innerHTML = '<div class="mh">Skin</div>' + Object.entries(SKINS).map(([id, s]) =>
    `<button data-skin="${id}" class="${S.skin === id ? 'on' : ''}"><span class="sw" style="background:linear-gradient(135deg, ${s.v.textbg} 0 50%, ${s.v['cap-bible']} 50%)"></span>${s.name}</button>`).join('');
  $('#skinMenu').querySelectorAll<HTMLButtonElement>('[data-skin]').forEach(b => b.onclick = () => { S.skin = b.dataset.skin!; applyLook(S.skin, S.fontSize, S.look); save(); skinMenu(); });
}
/** switches defined by the open Bibles themselves (theWord "user toggles"), e.g. V for variants */
function customToggleList(): { name: string; label: string; abbr: string }[] {
  const out: { name: string; label: string; abbr: string }[] = [];
  for (const m of openBibles()) for (const n of TWRender.customToggles(m) as string[]) {
    if (out.some(x => x.name === n)) continue;
    const p = m.props || {}; const k = Object.keys(p).find(k => /toggle/i.test(k) && k.toLowerCase().endsWith('.' + n.toLowerCase()));
    out.push({ name: n, label: (k ? p[k] : '').trim(), abbr: m.abbr });
  }
  return out;
}
function customOn(n: string): boolean { const c = (S.show as unknown as { custom?: Record<string, boolean> }).custom || {}; return c[n] !== false; }
function setCustom(n: string, on: boolean): void { const sh = S.show as unknown as { custom?: Record<string, boolean> }; sh.custom = { ...(sh.custom || {}), [n]: on }; save(); renderAll(); }
/** a choice of dictionary for word popups (theWord: which Strong's dictionary for Greek and for Hebrew) */
function dictPick(k: 'greek' | 'hebrew' | 'morph', label: string, f: (d: BookMod) => boolean): string {
  const ds = books.filter(d => d.kind === 'dictionary' && !d.locked && f(d)); if (ds.length < 2) return '';
  const cur = (WS().dictPref || {})[k] || '';
  return `<div class="mrow msel">${esc(label)} <select data-dpref="${k}"><option value="">Automatic</option>${ds.map(d => `<option value="${esc(d.id)}"${d.id === cur ? ' selected' : ''}>${esc(d.abbr || d.title)}</option>`).join('')}</select></div>`;
}
/** the Options menu: what to show, text size, order of the books, the Options window */
function optMenu(): void {
  const m = $('#optMenu');
  m.innerHTML = `<div class="mrow msel">Language / Wika <select id="mLang"><option value="en">English</option><option value="tl"${currentLang() === 'tl' ? ' selected' : ''}>Tagalog</option></select></div><div class="msep"></div>` + '<div class="small" style="padding:2px 12px 6px">What a Bible view shows is set in its own side bar.</div>' +
    `<label><input type="checkbox" id="mWl" ${WL().on ? 'checked' : ''}> Word lookup (D)</label><button id="mWlD" class="sub">Word lookup dictionaries…</button>` +
    '<div class="msep"></div><div class="mh">Word popups</div>' +
    `<label><input type="checkbox" id="mOrig" ${S.show.origWord !== false ? 'checked' : ''}> Original word and transliteration</label>` +
    `<label><input type="radio" name="mwo" data-wo="morph" ${WS().wordOrder !== 'strong' ? 'checked' : ''}> Morphology first</label><label><input type="radio" name="mwo" data-wo="strong" ${WS().wordOrder === 'strong' ? 'checked' : ''}> Strong's entry first</label>` +
    `<label><input type="checkbox" id="mPopAll" ${WS().popAll !== false ? 'checked' : ''}> Verse popups: all open Bibles</label>` +
    dictPick('greek', "Greek Strong's", d => d.isStrong) + dictPick('hebrew', "Hebrew Strong's", d => d.isStrong) + dictPick('morph', 'Morphology', d => d.isMorph) +
    `<div class="msep"></div><div class="mrow">Text size <button data-fs="-1">A−</button><b class="fsv">${S.fontSize}</b><button data-fs="1">A+</button></div>` +
    '<div class="msep"></div><div class="mh">Order of the books</div>' + [['1611', '1611 King James (Apocrypha between)'], ['nets', 'Septuagint – NETS'], ['orthodox', 'Greek Orthodox']].map(([k, l]) => `<label><input type="radio" name="mord" data-ord="${k}" ${S.look.bookOrder === k ? 'checked' : ''}> ${l}</label>`).join('') +
    `<div class="msep"></div><button id="mOpts">Options… <kbd>Ctrl+,</kbd></button>`;
  m.querySelector<HTMLSelectElement>('#mLang')!.onchange = e => { LS().lang = (e.target as HTMLSelectElement).value; saveSettings(S).then(() => location.reload()); };
  m.querySelector<HTMLInputElement>('#mWl')!.onchange = e => { WL().on = (e.target as HTMLInputElement).checked; save(); if (WL().on && !(WL().dicts || []).length) { m.classList.add('hidden'); wordLookDialog(); } };
  m.querySelector<HTMLButtonElement>('#mWlD')!.onclick = () => { m.classList.add('hidden'); wordLookDialog(); };
  m.querySelector<HTMLInputElement>('#mOrig')!.onchange = e => { S.show.origWord = (e.target as HTMLInputElement).checked; save(); };
  m.querySelector<HTMLInputElement>('#mPopAll')!.onchange = e => { WS().popAll = (e.target as HTMLInputElement).checked; save(); };
  m.querySelectorAll<HTMLInputElement>('[data-wo]').forEach(r => r.onchange = () => { WS().wordOrder = r.dataset.wo as 'morph' | 'strong'; save(); });
  m.querySelectorAll<HTMLSelectElement>('[data-dpref]').forEach(sel => sel.onchange = () => { WS().dictPref = { ...(WS().dictPref || {}), [sel.dataset.dpref!]: sel.value || undefined }; save(); });
  m.querySelector<HTMLButtonElement>('#mOpts')!.onclick = () => { m.classList.add('hidden'); openOptions(); };
  m.querySelectorAll<HTMLButtonElement>('[data-fs]').forEach(b => b.onclick = () => { S.fontSize = Math.max(12, Math.min(34, S.fontSize + +b.dataset.fs!)); document.documentElement.style.setProperty('--size', S.fontSize + 'px'); save(); m.querySelector('.fsv')!.textContent = String(S.fontSize); renderAll(); });
  m.querySelectorAll<HTMLInputElement>('[data-ord]').forEach(r => r.onchange = () => { S.look.bookOrder = r.dataset.ord as Look['bookOrder']; save(); canon.setOrder(S.look.bookOrder); buildNav(); renderAll(); viewsReload(); });
}
type LangSettings = { lang?: string; tlFixes?: Record<string, string> };
const LS = () => S as unknown as LangSettings;
/** Tools → Tagalog translation…: every phrase with its Tagalog; change any, add the missing ones */
async function translationDialog(): Promise<void> {
  const rows = translationTable(); const edits: Record<string, string> = {};
  const r = await dialog('Tagalog translation', `<p class="small tlx">The Tagalog of Tanglaw's menus and windows (the Bible text and modules are not translated). Change any translation, or fill in a missing one; empty means English. Phrases seen on screen without a translation are listed first among the empty ones. Your changes are kept in your settings. The user guide (F1) is still in English.</p>
    <input id="tlF" class="txt" type="search" placeholder="Filter…"><div class="tltable tlx">${rows.map((x, i) => `<div class="tlrow" data-i="${i}"><span class="en">${esc(x.en)}</span><input class="txt" data-tl="${i}" value="${esc(x.tl)}"${x.mine ? ' style="font-weight:600"' : ''}></div>`).join('')}</div>`,
    [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], b => {
      b.querySelectorAll<HTMLInputElement>('[data-tl]').forEach(i => i.oninput = () => { edits[rows[+i.dataset.tl!].en] = i.value; });
      const f = b.querySelector<HTMLInputElement>('#tlF')!; f.oninput = () => { const q = f.value.toLowerCase(); b.querySelectorAll<HTMLElement>('.tlrow').forEach(rw => { const x = rows[+rw.dataset.i!]; rw.style.display = !q || x.en.toLowerCase().includes(q) || x.tl.toLowerCase().includes(q) ? '' : 'none'; }); };
    });
  if (r !== 'ok' || !Object.keys(edits).length) return;
  const fx = { ...(LS().tlFixes || {}) }; for (const [en, tl] of Object.entries(edits)) fx[en] = tl.trim();
  LS().tlFixes = fx; await saveSettings(S);
  if (currentLang() === 'tl') location.reload(); else flash('Saved – choose Tagalog in the Options menu to use it');
}
/** the compare view (opens one if none is open) */
function openCompare(): void { const id = compareViews()[0] || addCompareView(); openPanel(id); }
/** the Tools menu */
function toolsMenu(): void {
  const m = $('#toolsMenu'); const lm = libCurrent();
  m.innerHTML = '<div class="mh">Tools</div>' +
    `<label><input type="checkbox" id="tClip" ${clipOn() ? 'checked' : ''}> Clipboard monitor</label>` +
    '<button id="tWl">Word lookup dictionaries…</button><button id="tSets">Module sets…</button>' +
    '<div class="msep"></div><button id="tNewMod">New module of your own…</button><button id="tTl">Tagalog translation…</button>' +
    '<button id="tVoices">Read aloud: voices…</button><button id="tKeys">Keyboard shortcuts… <kbd>Ctrl+/</kbd></button><button id="tCmp">Compare the verse <kbd>Ctrl+M</kbd></button><button id="tUpd">Check for a new version…</button>' + `<label class="sub"><input type="checkbox" id="tAuto" ${autoUpdates() ? 'checked' : ''}> Look for new versions when Tanglaw starts</label>` +
    '<div class="msep"></div><button id="tPrint">Print the chapter <kbd>Ctrl+P</kbd></button>' +
    (lm ? `<button id="tPrintT">Print the Library topic</button><button id="tExp">Export from ${esc(lm.abbr || lm.title)}…</button>` : '');
  const hide = () => m.classList.add('hidden');
  m.querySelector<HTMLInputElement>('#tClip')!.onchange = e => setClipmon((e.target as HTMLInputElement).checked);
  m.querySelector<HTMLButtonElement>('#tWl')!.onclick = () => { hide(); wordLookDialog(); };
  m.querySelector<HTMLButtonElement>('#tSets')!.onclick = () => { hide(); defineModuleSets(); };
  m.querySelector<HTMLButtonElement>('#tNewMod')!.onclick = () => { hide(); newUserModule(); };
  m.querySelector<HTMLButtonElement>('#tVoices')!.onclick = () => { hide(); voicesDialog(); };
  m.querySelector<HTMLButtonElement>('#tKeys')!.onclick = () => { hide(); keysDialog(); };
  m.querySelector<HTMLButtonElement>('#tCmp')!.onclick = () => { hide(); openCompare(); };
  m.querySelector<HTMLButtonElement>('#tUpd')!.onclick = () => { hide(); checkUpdate(true); };
  m.querySelector<HTMLInputElement>('#tAuto')!.onchange = e => setAutoUpdates((e.target as HTMLInputElement).checked);
  m.querySelector<HTMLButtonElement>('#tTl')!.onclick = () => { hide(); translationDialog(); };
  m.querySelector<HTMLButtonElement>('#tPrint')!.onclick = () => { hide(); printChapter(); };
  const pt = m.querySelector<HTMLButtonElement>('#tPrintT'); if (pt) pt.onclick = () => { hide(); printTopic($('#libBody')); };
  const ex = m.querySelector<HTMLButtonElement>('#tExp'); if (ex) ex.onclick = () => { hide(); exportLib(); };
}
function printChapter(): void {
  const v = $('#view').cloneNode(true) as HTMLElement; v.querySelectorAll('.xrefs, .noterow, .unote, .noteicon, .fnlist').forEach(x => x.remove());
  printHtml(`${canon.book(S.ref.b).name} ${S.ref.c}${openBibles().length ? ' – ' + openBibles().map(b => b.abbr).join(', ') : ''}`, v.innerHTML);
}
function printTopic(body: HTMLElement): void {
  const e = body.querySelector('.entry'); if (!e) return flash('Open a topic first');
  const c = e.cloneNode(true) as HTMLElement; const h = c.querySelector('h4')?.textContent || ''; c.querySelector('h4')?.remove();
  printHtml(h, c.innerHTML);
}
async function exportLib(m = libCurrent(), tid: Topic['id'] | null = libTopicId()): Promise<void> {
  if (!m) return;
  const all = await m.topics();
  const r = all.length > 1 ? await dialog('Export topics', `<p>What should be exported from <b>${esc(m.title)}</b>?</p>`, [{ label: 'Cancel', value: null }, { label: `All ${all.length} topics`, value: 'all' }, ...(tid != null ? [{ label: 'This topic', value: 'one', primary: true }] : [])]) : (tid != null ? 'one' : 'all');
  if (!r) return;
  exportTopics(r === 'all' ? all.map(t => ({ mod: m, id: t.id })) : [{ mod: m, id: tid! }], clean);
}
/** the Layouts menu: open and close panels, add Bible and book views, layouts */
function layoutMenu(): void {
  const m = $('#layoutMenu'); const saved = (S as unknown as { layouts?: Record<string, Layout> }).layouts || {};
  const extra = openPanels().filter(p => !PANELS.includes(p));
  m.innerHTML = '<div class="mh">Panels</div>' + PANELS.map(p => `<label><input type="checkbox" data-pan="${p}" ${isOpen(p) ? 'checked' : ''}> ${esc(titleOf(p))}</label>`).join('') +
    extra.map(p => `<label><input type="checkbox" data-pan="${esc(p)}" checked> ${esc(p.startsWith('bible-') ? 'Bible view: ' : p.startsWith('search-') ? '' : 'Book view: ')}${esc(titleOf(p))}</label>`).join('') +
    '<div class="msep"></div><button id="mAddBible">+ New Bible view</button><button id="mAddBook">+ New book view</button><button id="mAddSearch">+ New Bible search</button><button id="mAddBSearch">+ New book search</button><button id="mAddCompare">+ Compare view</button>' +
    `<button id="mHideAll">${isHiddenAll() ? 'Show the panels' : 'Hide all panels'}</button>` +
    '<div class="msep"></div><div class="mh">Layouts</div>' + Object.entries(DOCK_PRESETS).map(([k, [l]]) => `<button data-pre="${k}">${esc(l)}</button>`).join('') +
    Object.keys(saved).map(n => `<div class="mrow lrow"><button data-lay="${esc(n)}">${esc(n)}</button><i class="ldel" data-del="${esc(n)}" title="Delete this layout">×</i></div>`).join('') +
    '<button id="mSaveLay">Save this layout…</button>';
  m.querySelectorAll<HTMLInputElement>('[data-pan]').forEach(cb => cb.onchange = () => { if (cb.checked) openPanel(cb.dataset.pan!); else closePanel(cb.dataset.pan!); layoutMenu(); });
  const add = (id: string) => { m.classList.add('hidden'); openPanel(id); };
  m.querySelector<HTMLElement>('#mAddBible')!.onclick = () => add(addBibleView());
  m.querySelector<HTMLElement>('#mAddBook')!.onclick = () => add(addBookView());
  m.querySelector<HTMLElement>('#mAddSearch')!.onclick = () => add(addSearchView('search'));
  m.querySelector<HTMLElement>('#mAddBSearch')!.onclick = () => add(addSearchView('bsearch'));
  m.querySelector<HTMLElement>('#mAddCompare')!.onclick = () => { m.classList.add('hidden'); openCompare(); };
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
    const btn = { '#skinMenu': '#skinBtn', '#optMenu': '#optBtn', '#layoutMenu': '#sideBtn', '#toolsMenu': '#toolsBtn' }[id];
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
  initLang(LS().lang || 'en', LS().tlFixes || {});
  initUpdate(S, save, false); invoke<boolean>('test_mode').then(t => { if (!t) initUpdate(S, save); }).catch(() => {});
  document.body.classList.toggle('android', isAndroid);
  ownDir = await modulesDir();
  const win = getCurrentWindow();
  $('#wMin').onclick = () => win.minimize(); $('#wMax').onclick = () => win.toggleMaximize(); $('#wClose').onclick = () => win.close();
  $('#pPrev').onclick = () => step(-1);
  $('#pNext').onclick = () => step(1);
  $('#refBtn').onclick = picker;
  $('#biblesBtn').onclick = e => { e.stopPropagation(); toggleMenu('#bibleMenu', bibleMenu); };
  $('#skinBtn').onclick = e => { e.stopPropagation(); toggleMenu('#skinMenu', skinMenu); };
  $('#optBtn').onclick = e => { e.stopPropagation(); toggleMenu('#optMenu', optMenu); };
  $('#toolsBtn').onclick = e => { e.stopPropagation(); toggleMenu('#toolsMenu', toolsMenu); };
  $('#libPrint').innerHTML = icon('print', 16); $('#libExport').innerHTML = icon('import', 16);
  // the Library's side bar: topic list, text size, your marks, read aloud
  $('#libList').innerHTML = icon('menu', 16); $('#libMarks').innerHTML = icon('edit', 16); $('#libSpeak').innerHTML = icon('speaker', 16);
  const LL = () => ((S as unknown as { libLook?: { list?: boolean; size?: number; nomarks?: boolean } }).libLook ||= {});
  const libLooks = () => { const l = LL(); $('#p-lib .libsplit').classList.toggle('nolist', l.list === false); $('#libList').classList.toggle('on', l.list !== false); $('#libBody').style.fontSize = l.size && l.size !== 100 ? l.size + '%' : ''; $('#libBody').classList.toggle('nomarks', !!l.nomarks); $('#libMarks').classList.toggle('on', !l.nomarks); };
  libLooks();
  $('#libList').onclick = () => { LL().list = LL().list === false; save(); libLooks(); };
  $('#libSmall').onclick = () => { LL().size = Math.max(60, (LL().size || 100) - 10); save(); libLooks(); };
  $('#libLarge').onclick = () => { LL().size = Math.min(220, (LL().size || 100) + 10); save(); libLooks(); };
  $('#libMarks').onclick = () => { LL().nomarks = !LL().nomarks; save(); libLooks(); };
  $('#libSpeak').onclick = () => speakTopic($('#libBody').querySelector<HTMLElement>('.entry'), langOf(libCurrent()?.lang), $('#libSpeak'));
  $('#libPrint').onclick = () => printTopic($('#libBody'));
  $('#libExport').onclick = () => exportLib();
  // an image in a module: the graphics viewer
  document.addEventListener('click', e => { const im = (e.target as HTMLElement).closest<HTMLImageElement>('.entrybody img, .entry img, #popup img, .clipwin img'); if (im) { e.preventDefault(); openImage(im); } }, true);
  initAnnotate();
  initUserMods({
    books: () => books, ref: activeRef,
    async reopen(file, tid) {
      const i = books.findIndex(m => m.file === file); if (i < 0) return;
      const m = await openBook({ path: file, name: books[i].name, size: 0 }); books[i] = m; forgetSearchCache(m.id);
      await refreshLib(m.id, tid); viewsReload(); if (m.kind === 'commentary') { updateCommentary(); go(S.ref.b, S.ref.c, S.ref.v); }
    },
    async added(file) {
      await loadModules(); await openRest(); viewsReload();
      const m = books.find(x => x.file === file); if (m) { showPanel('lib'); await refreshLib(m.id); }
    },
  });
  $('#emptyImport').onclick = importModules;
  $('#helpBtn').onclick = () => openGuide();
  $('#emptyNew').onclick = () => openBibleView();
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
  $('#copyBtn').onclick = () => copyDialog(activeRef());
  document.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('.menu, .tbtn')) document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden')); if (!popKeep && !(e.target as HTMLElement).closest('#popup, [data-strong], [data-morph], sup.fn, a.xr, li.bhit')) hidePopup(); });
  $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet') || (e.target as HTMLElement).closest('.grab')) $('#sheet').classList.remove('open'); });
  // words: hover (mouse) or tap (touch)
  let timer = 0;
  document.addEventListener('mouseover', e => {
    if (isPhone() || !(e.target as HTMLElement).closest?.('.bview, .s-results')) return;
    const bh = (e.target as HTMLElement).closest<HTMLElement>('li.bhit .r, li.bhit .snip')?.closest<HTMLElement>('li.bhit');
    const t = bh || (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn, a.xr'); clearTimeout(timer);
    if (t) timer = window.setTimeout(() => showWord(t), 300);
  });
  document.addEventListener('mousemove', e => { if ((e.target as HTMLElement).closest?.('.bview')) wordLookMove(e); else if (wlAt) { wlAt = ''; clearTimeout(wlT); popupLeaveSoon(); } });
  document.addEventListener('mouseout', e => {
    if (!(e.target as HTMLElement).closest?.('.bview, .s-results')) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn, a.xr, li.bhit'); if (!t) return;
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
  document.addEventListener('click', e => {
    const bv = (e.target as HTMLElement).closest?.<HTMLElement>('.bview'); if (!bv) return;
    const vid = bv.dataset.bvid!;
    const rm = (e.target as HTMLElement).closest<HTMLElement>('.rmx');
    if (rm) { const [b, c, v] = rm.dataset.from!.split('.').map(Number); const [tb, tc, tv] = rm.dataset.to!.split('.').map(Number); removeXref({ b, c, v }, { b: tb, c: tc, v: tv }).then(rerender); return; }
    const xr = (e.target as HTMLElement).closest<HTMLElement>('a.xr');
    if (xr) { if (isPhone()) return void showWord(xr); const [b, c, v] = xr.dataset.ref!.split('.').map(Number); $('#popup').classList.add('hidden'); return void go(b, c, v); }
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], [data-morph], sup.fn'); if (t) return void showWord(t, true);
    const fl = (e.target as HTMLElement).closest<HTMLElement>('.fnlist li[data-gov]'); if (fl) return void bvSelectVerse(vid, +fl.dataset.gov!);
    const vn = (e.target as HTMLElement).closest<HTMLElement>('.vn, .pvn'); if (!vn) return;
    bvSelectVerse(vid, +vn.closest<HTMLElement>('[data-v]')!.dataset.v!);
    if ((e.target as HTMLElement).closest('.cm')) showPanel('cmt');
  });
  // links anywhere (commentary, library, popups, notes): a Bible reference opens the verse, a book link the topic
  document.addEventListener('click', e => {
    const fd = (e.target as HTMLElement).closest<HTMLElement>('[data-find]');
    if (fd && !fd.closest('#p-search, #p-bsearch')) { e.preventDefault(); $('#popup').classList.add('hidden'); $('#sheet').classList.remove('open'); showPanel('search'); find(fd.dataset.find!); return; }
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-href]'); if (!a) return;
    e.preventDefault(); const href = a.dataset.href || '';
    const r = /bible/i.test(href) ? bibleTarget(href) : null;
    $('#popup').classList.add('hidden');
    if (r) { go(r.b, r.c, r.v); if (isPhone()) { document.body.classList.remove('side-open'); $('#sheet').classList.remove('open'); } return; }
    followBookLink(href).then(ok => { if (!ok && /^https?:/i.test(href)) flash('Web links open in your browser: ' + href); });
  });
  wireRefPreview(versePreview);
  // the study panel (Commentary, Library, Search)
  initSearch({ openBibles, allBibles: () => bibles, books: () => books, openTopic: (mod, id) => { showPanel('lib'); openLib(mod, id); }, exportTopics: items => exportTopics(items, clean), ref: activeRef, go, settings: () => S as unknown as Record<string, unknown>, save });
  initBibleViews({
    settings: () => S as never, save, bibles: () => bibles, hidden: () => BS().hiddenBibles || [], bibleStyle, retitle, flash, moved,
    customToggles: m => customToggleList().filter(t => (TWRender.customToggles(m) as string[]).includes(t.name)), customOn, setCustom, speak: id => speakView(id),
  });
  // a first start of this version: the Bibles that were read side by side become Bible views of their own
  migrateViews();
  initTts(S, save);
  initClipmon({ bibles: () => bibles, openBibles, go, settings: () => S as unknown as Record<string, unknown>, save, show: () => S.show, style: bibleStyle });
  initViews({ bibles: () => bibles, openBibles, books: () => books, nav: () => nav, ref: activeRef, go, show: () => S.show, clean, showWord, settings: () => S as unknown as Record<string, unknown>, save, retitle, bibleStyle, hiddenBibles: () => BS().hiddenBibles || [], speakEl: (el, mod) => speakTopic(el, langOf(mod?.lang), null), props: (f, t) => openProps(f, t) });
  initPanel({ books: () => books, openBibles, ref: activeRef, go, clean, save, settings: () => S as unknown as Record<string, unknown> });
  initCopy({ nav: () => nav, openBibles, save: saveUD });
  initProps(async () => { await loadModules(); await renderAll(); await openRest(); await reloadLib(); viewsReload(); });
  $('#libProps').onclick = () => { const m = libCurrent(); if (m) openProps(m.file, m.title); else flash('Choose a module first'); };
  const studyNote = await initStudy({ ref: activeRef, go, rerender, openBibles, showPanel, show: () => { const id = activeId(); return id ? effShow(id) : S.show; }, activeBible }, legacy ? legacy.study : null);
  const note = [migrated, studyNote].filter(Boolean).join('; ');
  if (note) setTimeout(() => flash('Welcome to the new Tanglaw – ' + note + '.'), 1200);
  if (S.sideHidden) setHidden(true);
  $('#sideBtn').onclick = e => { e.stopPropagation(); toggleMenu('#layoutMenu', layoutMenu); };
  document.addEventListener('dock-unhide', () => { S.sideHidden = false; save(); });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach(b => b.onclick = () => showPanel(b.dataset.open!));
  let typed = '', typedT = 0;
  // keyboard: the actions and their keys (Tools → Keyboard shortcuts… changes them)
  const cur = () => activeRef();
  const toggleShow = (k: string, label: string) => () => { const id = activeId(); if (!id) return; const on = bvToggle(id, k); flash(`${label}: ${on ? 'on' : 'off'}`); };
  initKeys([
    { id: 'prevChapter', label: 'Previous chapter', group: 'Moving around', def: '←', run: () => step(-1) },
    { id: 'nextChapter', label: 'Next chapter', group: 'Moving around', def: '→', run: () => step(1) },
    { id: 'prevVerse', label: 'Previous verse', group: 'Moving around', def: '↑', run: () => selectVerse(cur().v - 1) },
    { id: 'nextVerse', label: 'Next verse', group: 'Moving around', def: '↓', run: () => selectVerse(cur().v + 1) },
    { id: 'prevBook', label: 'Previous book', group: 'Moving around', def: 'Ctrl+←', run: () => stepBook(-1) },
    { id: 'nextBook', label: 'Next book', group: 'Moving around', def: 'Ctrl+→', run: () => stepBook(1) },
    { id: 'back', label: 'Back', group: 'Moving around', def: 'Alt+←', run: () => historyGo(-1) },
    { id: 'forward', label: 'Forward', group: 'Moving around', def: 'Alt+→', run: () => historyGo(1) },
    { id: 'back2', label: 'Back (second key)', group: 'Moving around', def: 'Backspace', run: () => historyGo(-1) },
    { id: 'copyVerse', label: 'Copy the selected verse', group: 'Verses', def: 'Ctrl+C', run: () => { if (String(window.getSelection())) return false; copyVerse(cur()); } },
    { id: 'copyDialog', label: 'Copy verses…', group: 'Verses', def: 'F5', run: () => { copyDialog(cur()); } },
    { id: 'addToList', label: 'Add the verse to the current list', group: 'Verses', def: 'Ctrl+L', run: () => addToList([cur()]) },
    { id: 'print', label: 'Print the chapter', group: 'Verses', def: 'Ctrl+P', run: () => printChapter() },
    { id: 'search', label: 'Bible search', group: 'Panels and windows', def: 'Ctrl+F', run: () => { showPanel('search'); } },
    { id: 'bsearch', label: 'Book search', group: 'Panels and windows', def: 'Ctrl+Shift+F', run: () => { showPanel('bsearch'); } },
    { id: 'compare', label: 'Compare the verse in all Bibles', group: 'Panels and windows', def: 'Ctrl+M', run: () => openCompare() },
    { id: 'options', label: 'Options…', group: 'Panels and windows', def: 'Ctrl+,', run: () => openOptions() },
    { id: 'guide', label: 'User guide', group: 'Panels and windows', def: 'F1', run: () => openGuide() },
    { id: 'keys', label: 'Keyboard shortcuts', group: 'Panels and windows', def: 'Ctrl+/', run: () => { keysDialog(); } },
    { id: 'paragraph', label: 'Paragraph mode', group: 'What to show', def: 'P', run: () => { const id = activeId(); if (id) flash(bvToggle(id, 'paragraph') ? 'Paragraph mode' : 'Verse by verse'); } },
    { id: 'columns', label: 'Column text', group: 'What to show', def: 'Alt+I', run: () => { const id = activeId(); if (id) bvToggle(id, 'columns'); } },
    { id: 'wordLook', label: 'Word lookup', group: 'What to show', def: 'D', run: () => { const wl = WL(); wl.on = !wl.on; save(); optMenu(); if (wl.on && !(wl.dicts || []).length) return void wordLookDialog(); flash(wl.on ? 'Word lookup on' : 'Word lookup off'); } },
    { id: 'strongs', label: "Strong's numbers", group: 'What to show', def: 'S', run: toggleShow('strongs', "Strong's numbers") },
    { id: 'morph', label: 'Morphology', group: 'What to show', def: 'M', run: toggleShow('morph', 'Morphology') },
    { id: 'lemma', label: 'Lemmas', group: 'What to show', def: 'L', run: toggleShow('lemma', 'Lemmas') },
    { id: 'footnotes', label: 'Footnotes', group: 'What to show', def: 'F', run: toggleShow('footnotes', 'Footnotes') },
    { id: 'headings', label: 'Headings', group: 'What to show', def: 'H', run: toggleShow('headings', 'Headings') },
    { id: 'woj', label: 'Words of Jesus in red', group: 'What to show', def: 'J', run: toggleShow('woj', 'Words of Jesus in red') },
    { id: 'xrefs', label: 'Cross-references', group: 'What to show', def: 'X', run: toggleShow('xrefs', 'Cross-references') },
    { id: 'highlights', label: 'My highlighting', group: 'What to show', def: 'U', run: toggleShow('highlights', 'My highlighting') },
  ], (S as unknown as { keys?: Record<string, string> }).keys || {}, k => { (S as unknown as { keys?: Record<string, string> }).keys = k; save(); });
  document.addEventListener('keydown', e => {
    const tg = e.target as HTMLElement;
    if ((tg instanceof HTMLElement && (tg.matches('input, select, textarea') || tg.isContentEditable)) || document.querySelector('.dlg')) return;
    const k = e.key; const digit = /^Digit(\d)$/.exec(e.code); const d = digit ? +digit[1] : null;
    if (k === 'Escape') { $('#popup').classList.add('hidden'); $('#sheet').classList.remove('open'); $('#vmenu').classList.add('hidden'); document.body.classList.remove('side-open'); return; }
    if (viewerOpen()) return;
    // a Bible's own switches (letters theWord leaves to the modules come first)
    if (!e.ctrlKey && !e.altKey && !e.metaKey && k.length === 1 && /[a-z]/i.test(k)) { const t = customToggleList().find(x => x.name.length === 1 && x.name.toLowerCase() === k.toLowerCase()); if (t && 'ABEGIKRVYZ'.includes(t.name.toUpperCase())) { setCustom(t.name, !customOn(t.name)); optMenu(); flash(`${t.label || t.name}: ${customOn(t.name) ? 'on' : 'off'}`); return; } }
    if (runKey(e)) return;
    if (!e.ctrlKey && !e.altKey && !e.metaKey && k.length === 1 && /[a-z]/i.test(k)) { const t = customToggleList().find(x => x.name.length === 1 && x.name.toLowerCase() === k.toLowerCase()); if (t) { setCustom(t.name, !customOn(t.name)); optMenu(); flash(`${t.label || t.name}: ${customOn(t.name) ? 'on' : 'off'}`); return; } }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (d != null) { // typing a number goes to that verse (Shift: chapter)
      clearTimeout(typedT); typed += String(d);
      const shift = e.shiftKey;
      typedT = window.setTimeout(() => { const n = +typed; typed = ''; if (shift) go(activeRef().b, n); else selectVerse(n); }, 600);
    }
  });
  // swipe left/right on a phone
  let sx = 0, sy = 0;
  document.addEventListener('touchstart', e => { if (!(e.target as HTMLElement).closest?.('.bview')) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', e => { if (!(e.target as HTMLElement).closest?.('.bview')) return; const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1); });
  let last = isPhone(); window.addEventListener('resize', () => { if (isPhone() !== last) { last = isPhone(); renderAll(); } });
  await loadModules();
  { const first = activeId(); if (first) setActive(first); }
  await renderAll(false); moved();
  const w = window as unknown as Record<string, unknown>;
  w.__tanglawFirst = Math.round(performance.now());
  await openRest(); viewsReload();
  w.__tanglawReady = Math.round(performance.now());
  (window as unknown as Record<string, unknown>).__tanglaw = { setOpen: (ids: string[]) => showBibles(ids), activeId, bvIds, setActive, eff: () => effShow(activeId()!), openBibleView, go, step, S: () => S, bibles: () => bibles, books: () => books, dicts: () => books.filter(m => m.kind === 'dictionary' && m.isStrong && !m.locked), showWord, picker, showPanel, addXref, removeXref, rerender, importPaths, openProps, clean, openGuide, locked: () => locked, clipTestReader, setClipmon, newer, applyLookNow: () => applyLook(S.skin, S.fontSize, S.look), lang: (l: string) => initLang(l, LS().tlFixes || {}), modulesDir: () => ownDir, docxText: (html: string) => strFromU8(unzipSync(exportForTest.docx(html))['word/document.xml']), rtfOf: exportForTest.rtf };
}
init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${esc((e as Error).stack || e)}</pre>`); });
