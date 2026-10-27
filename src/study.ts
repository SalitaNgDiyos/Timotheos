// The user's own study: highlights, notes, bookmarks, verse lists (same data file layout as the Electron
// version, so data brought over from it shows in the same places).
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import { Bible } from './bibles';
import { loadStudy, saveStudy } from './native';
import { $, copyText, dialog, esc, flash, isPhone } from './ui';

export interface Ref { b: number; c: number; v: number; v2?: number }
export interface StudyHost {
  ref(): Ref; go(b: number, c: number, v?: number): Promise<void>; rerender(): void;
  openBibles(): Bible[]; showPanel(t: string): void; show(): Record<string, boolean>;
}
interface Mark { s: number; e: number; style: string }
export interface StudyData {
  bookmarks: (Ref | null)[]; lists: Record<string, Ref[]>; currentList: string;
  highlights: Record<string, Record<string, Mark[]>>; notes: Record<string, { html: string; t: number }>;
  [k: string]: unknown;
}
const EMPTY = (): StudyData => ({ version: 1, bookmarks: Array(10).fill(null), lists: { 'My verses': [] }, currentList: 'My verses', highlights: {}, notes: {}, plans: [], searchHistory: [], ranges: {}, copy: null });

let H: StudyHost;
export let ud: StudyData = EMPTY();
let saveT = 0;
const save = (now = false) => { clearTimeout(saveT); if (now) saveStudy(ud).catch(() => {}); else saveT = window.setTimeout(() => saveStudy(ud).catch(() => {}), 300); };
const vkey = (b: number, c: number, v: number) => `${b}.${c}.${v}`;
const parseKey = (k: string): Ref => { const [b, c, v] = k.split('.').map(Number); return { b, c, v }; };
export const refName = (r: Ref) => `${canon.book(r.b, '1611').abbr} ${r.c}:${r.v}${r.v2 && r.v2 > r.v ? '–' + r.v2 : ''}`;

export async function initStudy(host: StudyHost, legacy: Record<string, unknown> | null): Promise<string | null> {
  H = host;
  const mine = await loadStudy().catch(() => ({} as Record<string, unknown>));
  let note: string | null = null;
  if (!Object.keys(mine).length && legacy && Object.keys(legacy).length) { ud = Object.assign(EMPTY(), legacy) as StudyData; save(true); note = 'brought over your highlights, notes, bookmarks and verse lists from Tanglaw 0.4'; }
  else ud = Object.assign(EMPTY(), mine) as StudyData;
  if (!Array.isArray(ud.bookmarks) || ud.bookmarks.length !== 10) ud.bookmarks = Array(10).fill(null);
  wire();
  return note;
}

/* ---------------------------------------------------------------- after each chapter is drawn */
const SKIP_SEL = 'sup, .xrs, .heading, .unote, .rabbr, .noteicon, .vnum, .cm, .diffpct, .dropcap, .ab';
function coreNodes(el: Element): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => { const p = n.parentElement?.closest(SKIP_SEL); return p && el.contains(p) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
  let n; while ((n = w.nextNode())) out.push(n as Text);
  return out;
}
const cellFor = (v: number, col: number) => $('#view').querySelector(`[data-v="${v}"] [data-col="${col}"]`);

export function afterRender(b: number, c: number): void {
  const show = H.show();
  if (show.highlights !== false) H.openBibles().forEach((m, col) => {
    const hl = ud.highlights[m.id]; if (!hl) return;
    for (const k in hl) { const r = parseKey(k); if (r.b !== b || r.c !== c) continue; const el = cellFor(r.v, col); if (el) for (const mk of hl[k]) wrapRange(el, mk.s, mk.e, mk.style); }
  });
  for (const k in ud.notes) {
    const r = parseKey(k); if (r.b !== b || r.c !== c) continue;
    const row = $('#view').querySelector(`[data-v="${r.v}"]`); if (!row) continue;
    const plain = ud.notes[k].html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    row.querySelector('.vn')?.insertAdjacentHTML('beforeend', `<i class="noteicon" data-note="${k}" title="My note: ${esc(plain.slice(0, 200))}">✎</i>`);
    if (show.notes !== false) {
      const html = `<div class="unote" data-note="${k}" title="Click to edit">${ud.notes[k].html}</div>`;
      if (row.tagName === 'TR') row.insertAdjacentHTML('afterend', `<tr class="noterow"><td></td><td colspan="${H.openBibles().length}">${html}</td></tr>`);
      else row.querySelector('.vtexts')?.insertAdjacentHTML('beforeend', html);
    }
  }
}
function wrapRange(el: Element, s: number, e: number, style: string): void {
  let pos = 0;
  for (const n of coreNodes(el)) {
    const len = n.length, a = Math.max(s, pos), z = Math.min(e, pos + len);
    if (a < z) {
      const r = document.createRange(); r.setStart(n, a - pos); r.setEnd(n, z - pos);
      const mk = document.createElement('mark'); mk.className = 'hl hl-' + style;
      try { r.surroundContents(mk); } catch { /* crosses an element boundary: skip this piece */ }
    }
    pos += len; if (pos >= e) break;
  }
}

/* ---------------------------------------------------------------- highlighting */
interface Target { col: number; v: number; s: number; e: number; partial: boolean }
function selectionTarget(fallback: Element | null): Target | null {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && String(sel).trim()) {
    const range = sel.getRangeAt(0);
    const start = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer as Element)?.closest('[data-col]');
    if (start && $('#view').contains(start)) {
      let pos = 0, s: number | null = null, e = 0;
      for (const n of coreNodes(start)) {
        if (range.intersectsNode(n)) { const from = n === range.startContainer ? range.startOffset : 0, to = n === range.endContainer ? range.endOffset : n.length; if (s === null) s = pos + from; e = pos + to; }
        pos += n.length;
      }
      const v = +(start.closest('[data-v]') as HTMLElement).dataset.v!;
      if (s !== null && e > s) return { col: +(start as HTMLElement).dataset.col!, v, s, e, partial: true };
    }
  }
  if (fallback) { const len = coreNodes(fallback).reduce((a, n) => a + n.length, 0); return { col: +(fallback as HTMLElement).dataset.col!, v: +(fallback.closest('[data-v]') as HTMLElement).dataset.v!, s: 0, e: len, partial: false }; }
  return null;
}
function highlight(t: Target, style: string | null): void {
  const m = H.openBibles()[t.col]; if (!m) return;
  const hl = ud.highlights[m.id] || (ud.highlights[m.id] = {});
  const r = H.ref(); const k = vkey(r.b, r.c, t.v);
  const deco = (x: string | null) => ['ul', 'bold'].includes(x || '');
  const list = (hl[k] || []).filter(x => x.e <= t.s || x.s >= t.e || (style !== null && x.style !== style && deco(x.style) !== deco(style)));
  if (style) list.push({ s: t.s, e: t.e, style });
  list.sort((a, b) => a.s - b.s);
  if (list.length) hl[k] = list; else delete hl[k];
  save(); window.getSelection()?.removeAllRanges(); H.rerender();
}

/* ---------------------------------------------------------------- notes */
export async function editNote(k: string): Promise<void> {
  const r = parseKey(k); const cur = ud.notes[k]?.html || '';
  const html = `<div class="notetools"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList">• List</button></div><div id="noteEd" class="noteed" contenteditable="true">${cur}</div><p class="small">Bible references you type (e.g. Rom 5:8) become links.</p>`;
  const res = await dialog(`My note on ${refName(r)}`, html, [...(cur ? [{ label: 'Delete note', value: 'del', danger: true }] : []), { label: 'Cancel', value: null }, { label: 'Save', value: 'save', primary: true }], box => {
    box.querySelectorAll<HTMLButtonElement>('[data-cmd]').forEach(b => b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.cmd!); });
    const ed = box.querySelector<HTMLElement>('#noteEd')!; ed.focus(); const s = window.getSelection()!; s.selectAllChildren(ed); s.collapseToEnd();
    // keep the editor's text when the dialog closes
    (box as unknown as { _ed: HTMLElement })._ed = ed;
    const keep = () => { lastNoteHtml = ed.innerHTML; }; ed.addEventListener('input', keep); keep();
  });
  if (res === 'del') delete ud.notes[k];
  else if (res === 'save') { const clean = sanitizeNote(lastNoteHtml); if (clean.replace(/<[^>]*>|&nbsp;|\s/g, '')) ud.notes[k] = { html: clean, t: Date.now() }; else delete ud.notes[k]; }
  else return;
  save(true); H.rerender(); renderStudy();
}
let lastNoteHtml = '';
function sanitizeNote(h: string): string {
  const t = document.createElement('template'); t.innerHTML = h;
  t.content.querySelectorAll('*').forEach(n => { if (!/^(B|I|U|EM|STRONG|BR|DIV|P|UL|OL|LI|SPAN|A)$/.test(n.tagName)) n.replaceWith(...n.childNodes); else for (const a of [...n.attributes]) if (!(n.tagName === 'A' && a.name === 'data-href') && a.name !== 'class') n.removeAttribute(a.name); });
  const w = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT); const texts: Text[] = []; let n; while ((n = w.nextNode())) if (!n.parentElement?.closest('a')) texts.push(n as Text);
  const RE = /\b((?:[1-4]\s?)?[A-Z][a-z]{1,12}\.?)\s(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?/g;
  for (const tn of texts) {
    if (!RE.test(tn.textContent || '')) continue; RE.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = esc(tn.textContent).replace(RE, (m, bk, c, v, v2) => { const f = canon.findBook ? canon.findBook(bk.replace(/\.$/, '')) : null; const id = f && (f.id || f); return id ? `<a class="link" data-href="tw://bible.*?id=${id}.${c}.${v}${v2 ? '-' + id + '.' + c + '.' + v2 : ''}">${m}</a>` : m; });
    tn.replaceWith(...span.childNodes);
  }
  return t.innerHTML;
}

/* ---------------------------------------------------------------- bookmarks, lists, copying */
const slot = (d: number) => (d === 0 ? 9 : d - 1);
export function setBookmark(d: number, r: Ref = H.ref()): void { ud.bookmarks[slot(d)] = { b: r.b, c: r.c, v: r.v }; save(true); flash(`Bookmark ${d}: ${refName(r)}`); renderStudy(); }
export function gotoBookmark(d: number): void { const r = ud.bookmarks[slot(d)]; if (r) H.go(r.b, r.c, r.v); else flash(`Bookmark ${d} is empty – set it with Ctrl+Shift+${d}`); }
function curList(): Ref[] { if (!ud.lists[ud.currentList]) { ud.currentList = Object.keys(ud.lists)[0] || 'My verses'; ud.lists[ud.currentList] = ud.lists[ud.currentList] || []; } return ud.lists[ud.currentList]; }
export function addToList(refs: Ref[]): void {
  const list = curList(); let n = 0;
  for (const r of refs) if (!list.some(x => x.b === r.b && x.c === r.c && x.v === r.v && (x.v2 || x.v) === (r.v2 || r.v))) { list.push({ b: r.b, c: r.c, v: r.v, ...(r.v2 && r.v2 > r.v ? { v2: r.v2 } : {}) }); n++; }
  save(true); flash(`${n} verse${n === 1 ? '' : 's'} added to “${ud.currentList}”`); renderStudy();
}
/** plain text of one verse in the first open Bible that has it */
async function verseText(r: Ref): Promise<{ abbr: string; text: string } | null> {
  for (const m of H.openBibles()) {
    const rows = await m.chapter(r.b, r.c); const out = rows.filter(x => x.v >= r.v && x.v <= (r.v2 || r.v));
    if (out.length) {
      const show = { strongs: false, morph: false, footnotes: false, headings: false, woj: false, added: true };
      const t = document.createElement('div');
      return { abbr: m.abbr, text: out.map(x => { t.innerHTML = TWRender.render(x.raw, m, show); t.querySelectorAll('sup').forEach(s => s.remove()); return t.textContent!.replace(/\s+/g, ' ').trim(); }).join(' ') };
    }
  }
  return null;
}
export async function copyVerse(r: Ref): Promise<void> {
  const t = await verseText(r); if (!t) return;
  await copyText(`${t.text} (${refName(r)} ${t.abbr})`);
  flash('Copied ' + refName(r));
}

/* ---------------------------------------------------------------- verse menu (right-click / long press) */
function verseMenu(x: number, y: number, rowEl: HTMLElement, cellEl: HTMLElement | null): void {
  const v = +rowEl.dataset.v!; const r = { ...H.ref(), v }; const k = vkey(r.b, r.c, v);
  const t = selectionTarget(cellEl || rowEl.querySelector('[data-col]'));
  const m = $('#vmenu');
  m.innerHTML = `<div class="mh">${esc(refName(r))}</div>
    <button data-a="copy">Copy verse <kbd>Ctrl+C</kbd></button>
    <button data-a="list">Add to “${esc(ud.currentList)}” <kbd>Ctrl+L</kbd></button>
    <div class="mrow"><span>${t?.partial ? 'Highlight selection' : 'Highlight verse'}</span>${['yellow', 'green', 'blue', 'pink', 'orange'].map(s => `<button data-a="hl" data-s="${s}" class="sw hl-${s}" title="${s}"></button>`).join('')}<button data-a="hl" data-s="ul" class="sw" title="Underline"><u>U</u></button><button data-a="hl" data-s="bold" class="sw" title="Bold"><b>B</b></button><button data-a="hl" data-s="" class="sw" title="Remove highlighting">✕</button></div>
    <div class="mrow"><span>Bookmark</span>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => `<button data-a="bm" data-d="${d}" class="sw" title="${ud.bookmarks[slot(d)] ? 'replaces ' + refName(ud.bookmarks[slot(d)]!) : 'empty'}">${d}</button>`).join('')}</div>
    <button data-a="note">${ud.notes[k] ? 'Edit my note…' : 'Add a note…'}</button>
    <button data-a="cmt">Commentaries</button>`;
  m.classList.remove('hidden');
  const W = innerWidth, Hh = innerHeight;
  if (isPhone()) { m.style.left = '8px'; m.style.right = '8px'; m.style.top = 'auto'; m.style.bottom = '70px'; }
  else { m.style.right = 'auto'; m.style.bottom = 'auto'; m.style.left = Math.min(x, W - m.offsetWidth - 8) + 'px'; m.style.top = Math.min(y, Hh - m.offsetHeight - 8) + 'px'; }
  m.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(b => b.onclick = () => {
    const a = b.dataset.a; m.classList.add('hidden');
    if (a === 'copy') copyVerse(r);
    if (a === 'list') addToList([r]);
    if (a === 'hl' && t) highlight(t, b.dataset.s || null);
    if (a === 'bm') setBookmark(+b.dataset.d!, r);
    if (a === 'note') editNote(k);
    if (a === 'cmt') H.showPanel('cmt');
  });
}
function wire(): void {
  const view = $('#view');
  view.addEventListener('contextmenu', e => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (!row) return;
    e.preventDefault(); verseMenu(e.clientX, e.clientY, row, (e.target as HTMLElement).closest<HTMLElement>('[data-col]'));
  });
  // long press on touch screens
  let lp = 0;
  view.addEventListener('touchstart', e => { const row = (e.target as HTMLElement).closest<HTMLElement>('[data-v]'); if (!row) return; const t0 = e.touches[0]; lp = window.setTimeout(() => verseMenu(t0.clientX, t0.clientY, row, (e.target as HTMLElement).closest<HTMLElement>('[data-col]')), 550); }, { passive: true });
  view.addEventListener('touchend', () => clearTimeout(lp)); view.addEventListener('touchmove', () => clearTimeout(lp), { passive: true });
  view.addEventListener('click', e => { const n = (e.target as HTMLElement).closest<HTMLElement>('.unote, .noteicon'); if (n) { e.stopPropagation(); editNote(n.dataset.note!); } }, true);
  document.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('#vmenu')) $('#vmenu').classList.add('hidden'); });
  $('#studyTabs').querySelectorAll<HTMLButtonElement>('[data-st]').forEach(b => b.onclick = () => { seg = b.dataset.st!; renderStudy(); });
}

/* ---------------------------------------------------------------- the "My Study" panel tab */
let seg = 'lists';
export async function renderStudy(): Promise<void> {
  const body = $('#studyBody'); if (!body || $('#p-study').classList.contains('hidden')) return;
  document.querySelectorAll('#studyTabs [data-st]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.st === seg));
  if (seg === 'lists') {
    const names = Object.keys(ud.lists); const list = curList();
    let h = `<div class="srow"><select id="listSel">${names.map(n => `<option${n === ud.currentList ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><button id="listNew">New list…</button></div>`;
    h += list.length ? '<ul class="vlist">' : '<p class="hint">No verses yet. Right-click (or long-press) a verse → Add to the list, or press Ctrl+L.</p>';
    for (let i = 0; i < list.length; i++) { const r = list[i]; const t = await verseText(r); h += `<li><a data-i="${i}">${esc(refName(r))}</a><button class="rm" data-rm="${i}" title="Remove">✕</button><div class="vlt">${esc(t ? t.text : '')}</div></li>`; }
    if (list.length) h += `</ul><div class="srow"><button id="listCopy">Copy all</button></div>`;
    body.innerHTML = h;
    $<HTMLSelectElement>('#listSel').onchange = () => { ud.currentList = $<HTMLSelectElement>('#listSel').value; save(); renderStudy(); };
    $('#listNew').onclick = async () => {
      let name = '';
      const r = await dialog('New verse list', '<input id="lnName" class="txt" placeholder="Name of the list">', [{ label: 'Cancel', value: null }, { label: 'Create', value: 'ok', primary: true }], b => { const i = b.querySelector<HTMLInputElement>('#lnName')!; i.focus(); i.oninput = () => { name = i.value.trim(); }; });
      if (r && name && !ud.lists[name]) { ud.lists[name] = []; ud.currentList = name; save(true); renderStudy(); }
    };
    body.querySelectorAll<HTMLElement>('a[data-i]').forEach(a => a.onclick = () => { const r = list[+a.dataset.i!]; H.go(r.b, r.c, r.v); });
    body.querySelectorAll<HTMLElement>('[data-rm]').forEach(b => b.onclick = () => { list.splice(+b.dataset.rm!, 1); save(true); renderStudy(); });
    const cp = document.getElementById('listCopy'); if (cp) cp.onclick = async () => { const parts: string[] = []; for (const r of list) { const t = await verseText(r); if (t) parts.push(`${refName(r)} ${t.text}`); } await copyText(parts.join('\n')); flash(`Copied ${parts.length} verses`); };
  } else if (seg === 'notes') {
    const ks = Object.keys(ud.notes).sort((a, b) => { const x = parseKey(a), y = parseKey(b); return canon.orderKey(x.b, '1611') - canon.orderKey(y.b, '1611') || x.c - y.c || x.v - y.v; });
    body.innerHTML = ks.length ? `<ul class="vlist">${ks.map(k => `<li><a data-k="${k}">${esc(refName(parseKey(k)))}</a><div class="unote" data-note="${k}">${ud.notes[k].html}</div></li>`).join('')}</ul>` : '<p class="hint">No notes yet. Right-click (or long-press) a verse → Add a note.</p>';
    body.querySelectorAll<HTMLElement>('a[data-k]').forEach(a => a.onclick = () => { const r = parseKey(a.dataset.k!); H.go(r.b, r.c, r.v); });
    body.querySelectorAll<HTMLElement>('.unote').forEach(n => n.onclick = () => editNote(n.dataset.note!));
  } else {
    body.innerHTML = `<ul class="vlist">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => { const r = ud.bookmarks[slot(d)]; return `<li><b class="bmn">${d}</b> ${r ? `<a data-d="${d}">${esc(refName(r))}</a>` : '<span class="hint">empty</span>'}</li>`; }).join('')}</ul><p class="hint">Ctrl+Shift+number sets a bookmark at the selected verse, Ctrl+number goes there.</p>`;
    body.querySelectorAll<HTMLElement>('a[data-d]').forEach(a => a.onclick = () => gotoBookmark(+a.dataset.d!));
  }
}
