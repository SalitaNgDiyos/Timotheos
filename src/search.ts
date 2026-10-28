// The Search tab: theWord-style searches (engine: src/legacy/search.js, shared with the Electron edition),
// search ranges (predefined, current book/chapter, your own, saved by name), results / books / statistics
// views, search history, add the results to a verse list or copy them.
import search from './legacy/search.js';
import type { Bible } from './bibles';
import { $, copyText, dialog, esc, flash } from './ui';
import { addToList, saveUD, ud } from './study';

export interface SearchHost { openBibles(): Bible[]; allBibles(): Bible[]; ref(): { b: number; c: number; v: number }; go(b: number, c: number, v?: number): void; settings(): Record<string, unknown>; save(): void }
interface Opts { defaultOr: boolean; whole: boolean; matchCase: boolean; matchDiac: boolean; regex: boolean; nearW: number; nearV: number; bibles: 'open' | 'first' | 'all'; scope: string }
interface Hit { id: string; abbr: string; b: number; c: number; v: number; v2?: number; ref: string; text: string; marks: [number, number][]; other?: string }
interface Result { total: number; results: Hit[]; books: { id: string; b: number; name: string; abbr: string; n: number }[]; explanation: string; stats: { what: string; code: string; text: string; n: number }[]; words: { text: string; n: number }[]; ms: number }

let H: SearchHost;
let last: Result | null = null; let filterBook: string | null = null; let seq = 0; let timer = 0; let nBibles = 1;
const cache = new Map<string, [number, number, number, string][]>();
export function forgetSearchCache(): void { cache.clear(); }

const DEF: Opts = { defaultOr: false, whole: false, matchCase: false, matchDiac: false, regex: false, nearW: 30, nearV: 3, bibles: 'open', scope: 'all' };
const opts = (): Opts => Object.assign({ ...DEF }, (H.settings().search as Partial<Opts>) || {});
const q = <T extends HTMLElement = HTMLElement>(id: string) => $<T>('#' + id);

export function initSearch(host: SearchHost): void {
  H = host;
  q('p-search').innerHTML = `
    <form id="searchForm" class="sform"><div class="srow"><input id="searchInput" type="search" placeholder="e.g. faith hope · &quot;a phrase&quot; · G26 · love*" spellcheck="false" autocomplete="off"><button type="button" id="searchHist" class="ib" title="Earlier searches">▾</button><button type="submit" class="primary">Find</button></div>
      <div id="searchExplain" class="small"></div>
      <div class="srow"><select id="searchScope" aria-label="Range" title="Where to search"></select><select id="searchBibles" title="Which Bibles"><option value="open">Open Bibles</option><option value="first">First Bible only</option><option value="all">All Bibles</option></select></div>
      <details id="searchMore"><summary>Options</summary><div class="sopts">
        <label>Words without AND/OR <select id="optDefault"><option value="and">all must be in the verse</option><option value="or">any may be</option></select></label>
        <label><input type="checkbox" id="optWhole"> whole words</label><label><input type="checkbox" id="optCase"> match case</label>
        <label><input type="checkbox" id="optDiac"> match accents</label><label><input type="checkbox" id="optRegex"> regular expression</label>
        <label>NEAR = within <input id="optNearW" type="number" min="1" class="num"> words / <input id="optNearV" type="number" min="0" class="num"> verses</label>
        <p class="small">AND, OR, NOT, brackets, "a phrase", love* (wildcard), G26 / H157 (Strong's), m/ V-AAI-3S (morphology), faith NEAR hope, faith NEARv2 hope.</p></div></details></form>
    <div id="searchStatus" class="small sstatus"></div>
    <div id="searchTabs" class="seg hidden"><button data-sp="res" class="on">Verses</button><button data-sp="books">Books</button><button data-sp="stats">Statistics</button><span class="grow"></span><button id="searchToList" title="Add the verses shown to the current verse list">+ List</button><button id="searchCopy" title="Copy the verses shown">Copy</button></div>
    <ol id="searchResults" class="results pbody"></ol><div id="searchBooks" class="pbody hidden"></div><div id="searchStats" class="pbody hidden"></div>`;
  const o = opts();
  fillScopes(o.scope);
  q<HTMLSelectElement>('optDefault').value = o.defaultOr ? 'or' : 'and'; q<HTMLInputElement>('optWhole').checked = o.whole; q<HTMLInputElement>('optCase').checked = o.matchCase;
  q<HTMLInputElement>('optDiac').checked = o.matchDiac; q<HTMLInputElement>('optRegex').checked = o.regex; q<HTMLInputElement>('optNearW').value = String(o.nearW); q<HTMLInputElement>('optNearV').value = String(o.nearV);
  q<HTMLSelectElement>('searchBibles').value = o.bibles;
  q('searchForm').onsubmit = e => { e.preventDefault(); run(); };
  q('searchInput').oninput = explainSoon;
  for (const id of ['optDefault', 'optWhole', 'optCase', 'optDiac', 'optRegex', 'optNearW', 'optNearV', 'searchBibles']) q(id).onchange = () => { saveOpts(); explainSoon(); };
  q('searchScope').onchange = async () => { const s = q<HTMLSelectElement>('searchScope'); if (s.value === '__custom') await customRange(); else if (s.value === '__forget') await forgetRanges(); saveOpts(); };
  q('searchHist').onclick = e => { e.stopPropagation(); historyMenu(e.currentTarget as HTMLElement); };
  q('searchTabs').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sp]'); if (b) part(b.dataset.sp!); };
  q('searchToList').onclick = () => { const v = visible(); if (v.length) addToList(v.map(x => ({ b: x.b, c: x.c, v: x.v, v2: x.v2 && x.v2 > x.v ? x.v2 : undefined }))); };
  q('searchCopy').onclick = async () => { const v = visible(); await copyText(v.map(x => `${x.ref} ${x.text}`).join('\n')); flash(`Copied ${v.length} verse${v.length === 1 ? '' : 's'}`); };
  q('searchResults').onclick = e => {
    const fa = (e.target as HTMLElement).closest('[data-all]'); if (fa) { filterBook = null; renderResults(); return; }
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-b]'); if (!li) return;
    H.go(+li.dataset.b!, +li.dataset.c!, +li.dataset.v!); if (window.matchMedia('(max-width: 720px)').matches) document.body.classList.remove('side-open');
  };
  q('searchBooks').onclick = e => { const r = (e.target as HTMLElement).closest<HTMLElement>('[data-fb]'); if (r) { filterBook = r.dataset.fb!; renderResults(); part('res'); } };
  q('searchStats').onclick = e => { const c = (e.target as HTMLElement).closest<HTMLElement>('[data-find]'); if (c) find(c.dataset.find!); };
}

/** search from elsewhere (e.g. a Strong's number in a popup) */
export function find(text: string): void { q<HTMLInputElement>('searchInput').value = text; run(); }
export function focusSearch(): void { fillScopes(q<HTMLSelectElement>('searchScope').value || opts().scope); setTimeout(() => q<HTMLInputElement>('searchInput').focus(), 50); }

function saveOpts(): Opts {
  const o: Opts = {
    defaultOr: q<HTMLSelectElement>('optDefault').value === 'or', whole: q<HTMLInputElement>('optWhole').checked, matchCase: q<HTMLInputElement>('optCase').checked,
    matchDiac: q<HTMLInputElement>('optDiac').checked, regex: q<HTMLInputElement>('optRegex').checked, nearW: +q<HTMLInputElement>('optNearW').value || 30,
    nearV: Math.max(0, +q<HTMLInputElement>('optNearV').value || 0), bibles: q<HTMLSelectElement>('searchBibles').value as Opts['bibles'], scope: q<HTMLSelectElement>('searchScope').value,
  };
  if (o.scope.startsWith('__')) o.scope = 'all';
  H.settings().search = o; H.save(); return o;
}
const engine = (o: Opts) => ({ defaultOr: o.defaultOr, wholeWords: o.whole, ignoreCase: !o.matchCase, ignoreDiacritics: !o.matchDiac, regex: o.regex, nearW: o.nearW, nearV: o.nearV, scope: o.scope, current: H.ref(), mode: '1611' });
const ranges = (): Record<string, string> => (ud.ranges as Record<string, string>) || ((ud as unknown as Record<string, unknown>).ranges = {}) as Record<string, string>;

function fillScopes(sel: string): void {
  const s = q<HTMLSelectElement>('searchScope'); const mine = ranges();
  const known = [...search.PREDEFINED.map((p: string[]) => p[0]), 'book', 'chapter', ...Object.values(mine)];
  s.innerHTML = search.PREDEFINED.map(([id, label]: string[]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('')
    + '<option value="book">Current book</option><option value="chapter">Current chapter</option>'
    + (Object.keys(mine).length ? `<optgroup label="My ranges">${Object.entries(mine).map(([n, t]) => `<option value="${esc(t)}">${esc(n)}</option>`).join('')}</optgroup>` : '')
    + (sel && !known.includes(sel) && !sel.startsWith('__') ? `<option value="${esc(sel)}">${esc(sel)}</option>` : '')
    + '<option value="__custom">Custom range…</option>' + (Object.keys(mine).length ? '<option value="__forget">Remove a saved range…</option>' : '');
  s.value = sel || 'all'; if (s.selectedIndex < 0) s.value = 'all';
}
function checkRange(text: string): { ok: boolean; errors: string[] } {
  if (!text.trim()) return { ok: false, errors: [] };
  const r = search.parseRange(text, '1611'); return { ok: !r.errors.length && r.ranges.length > 0, errors: r.errors };
}
async function customRange(): Promise<void> {
  const cur = opts().scope; const isText = !search.PREDEFINED.some((p: string[]) => p[0] === cur) && !['book', 'chapter'].includes(cur);
  let text = isText ? cur : '', name = '';
  const res = await dialog('Custom search range', `<label class="fl">Passages, separated by ; or new lines<textarea id="rgText" rows="4" class="txt" placeholder="Gen-Deut; Matt 5-7; Rom 3:21-26">${esc(text)}</textarea></label><div id="rgCheck" class="small"></div><label class="fl">Save as (optional) <input id="rgName" class="txt" placeholder="e.g. Sermon on the Mount"></label>`,
    [{ label: 'Cancel', value: null }, { label: 'Use range', value: 'ok', primary: true }], b => {
      const t = b.querySelector<HTMLTextAreaElement>('#rgText')!; const chk = b.querySelector('#rgCheck')!;
      const upd = () => { text = t.value; const r = checkRange(text); chk.textContent = r.ok ? '✓ understood' : r.errors.length ? 'Not understood: ' + r.errors.join('; ') : ''; chk.classList.toggle('bad', !r.ok && !!r.errors.length); };
      t.oninput = upd; b.querySelector<HTMLInputElement>('#rgName')!.oninput = e => { name = (e.target as HTMLInputElement).value.trim(); }; upd(); t.focus();
    });
  if (res !== 'ok') { fillScopes(opts().scope); return; }
  const chk = checkRange(text);
  if (!chk.ok) { flash('Range not understood: ' + (chk.errors.join('; ') || 'empty')); fillScopes(opts().scope); return; }
  text = text.trim().replace(/\s*\n\s*/g, '; ');
  if (name) { ranges()[name] = text; saveUD(); }
  fillScopes(text);
}
async function forgetRanges(): Promise<void> {
  const mine = ranges(); let pick = '';
  const res = await dialog('Remove a saved range', `<label class="fl">Range <select id="rgDel">${Object.entries(mine).map(([n, t]) => `<option value="${esc(n)}">${esc(n)} – ${esc(t)}</option>`).join('')}</select></label>`,
    [{ label: 'Cancel', value: null }, { label: 'Remove', value: 'ok', primary: true }], b => { const s = b.querySelector<HTMLSelectElement>('#rgDel')!; pick = s.value; s.onchange = () => { pick = s.value; }; });
  const was = mine[pick];
  if (res === 'ok' && pick) { delete mine[pick]; saveUD(); }
  const cur = opts().scope; fillScopes(res === 'ok' && cur === was ? 'all' : cur);
}
function explainSoon(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    const text = q<HTMLInputElement>('searchInput').value.trim(); const box = q('searchExplain');
    if (!text) { box.textContent = ''; return; }
    try { const r = search.describe(text, engine(opts())); box.textContent = (r.ok ? 'Looking for ' : '⚠ ') + r.text; box.classList.toggle('bad', !r.ok); }
    catch (e) { box.textContent = '⚠ ' + (e as Error).message; box.classList.add('bad'); }
  }, 200);
}
function bibles(o: Opts): Bible[] {
  if (o.bibles === 'all') return H.allBibles();
  const open = H.openBibles(); return o.bibles === 'first' ? open.slice(0, 1) : open;
}

async function run(): Promise<void> {
  const text = q<HTMLInputElement>('searchInput').value.trim(); if (!text) return;
  const o = saveOpts(); const list = bibles(o); const my = ++seq;
  const status = q('searchStatus'); status.textContent = 'Searching…'; q('searchResults').innerHTML = ''; q('searchTabs').classList.add('hidden');
  try {
    for (const b of list) if (!cache.has(b.id)) { status.textContent = `Reading ${b.abbr} for searching…`; cache.set(b.id, await b.allVerses()); if (my !== seq) return; }
    await new Promise(r => setTimeout(r, 0));
    const mods = list.map(b => ({ id: b.id, abbr: b.abbr, mod: { allVerses: () => cache.get(b.id) || [] } }));
    const r: Result = search.run(mods, text, { ...engine(o), limit: 3000 });
    if (my !== seq) return;
    last = r; filterBook = null; nBibles = list.length;
    const h = ((ud.searchHistory as string[]) || []); ud.searchHistory = [text, ...h.filter(x => x !== text)].slice(0, 50); saveUD();
    status.innerHTML = `<b>${r.total}</b> verse${r.total === 1 ? '' : 's'}${list.length > 1 ? ` in ${list.length} Bibles` : ''}${r.total > r.results.length ? ` (first ${r.results.length} listed)` : ''} · ${esc(r.explanation)} · ${r.ms} ms`;
    q('searchTabs').classList.toggle('hidden', !r.total);
    renderResults(); renderBooks(); renderStats(); part('res');
  } catch (e) { status.innerHTML = `<span class="bad">${esc(String((e as Error).message || e))}</span>`; }
}
function visible(): Hit[] { if (!last) return []; return filterBook ? last.results.filter(x => `${x.id}|${x.b}` === filterBook) : last.results; }
function marked(text: string, marks: [number, number][]): string {
  let out = '', p = 0; for (const [s, e] of marks || []) { if (s < p) continue; out += esc(text.slice(p, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>'; p = e; }
  return out + esc(text.slice(p));
}
function renderResults(): void {
  const list = visible(); const fb = filterBook && last ? last.books.find(b => `${b.id}|${b.b}` === filterBook) : null;
  q('searchResults').innerHTML = (fb ? `<li class="filter">${list.length} in ${esc(fb.name)} · <a data-all="1">show all ${last!.results.length}</a></li>` : '') +
    list.map(x => `<li data-b="${x.b}" data-c="${x.c}" data-v="${x.v}"><span class="r">${esc(x.ref)}</span>${nBibles > 1 ? `<span class="small">${esc(x.abbr)}</span> ` : ''}${x.other ? `<span class="small"> near ${esc(x.other)}</span> ` : ''}${marked(x.text, x.marks)}</li>`).join('') +
    (!fb && last && last.total > last.results.length ? `<li class="small">… ${last.total - last.results.length} more not listed</li>` : '');
}
function renderBooks(): void {
  const r = last!; const max = Math.max(1, ...r.books.map(b => b.n));
  q('searchBooks').innerHTML = r.books.length ? `<table class="bookbars">${r.books.map(b => `<tr data-fb="${esc(b.id + '|' + b.b)}" title="Show only ${esc(b.name)}"><td>${esc(b.name)}${nBibles > 1 ? ` <span class="small">${esc(H.allBibles().find(x => x.id === b.id)?.abbr || '')}</span>` : ''}</td><td class="n">${b.n}</td><td class="pc">${Math.round(100 * b.n / Math.max(1, r.total))}%</td><td class="barc"><span style="width:${Math.max(2, Math.round(100 * b.n / max))}%"></span></td></tr>`).join('')}</table><p class="small">Click a book to list only its verses.</p>` : '';
}
function renderStats(): void {
  const r = last!; let html = '';
  if (r.stats.length) {
    const groups: Record<string, typeof r.stats> = {};
    for (const s of r.stats) (groups[s.code || s.what] = groups[s.code || s.what] || []).push(s);
    html += '<div class="phead">How the tagged words are translated</div>' + Object.entries(groups).map(([code, list]) => `<div class="stg"><b>${/^[GH]\d/i.test(code) ? `<a data-find="${esc(code)}">${esc(code)}</a>` : esc(code)}</b> ${list.slice(0, 40).map(s => `<span class="chip st">${esc(s.text)} <span class="small">${s.n}</span></span>`).join(' ')}</div>`).join('');
  }
  if (r.words.length) html += '<div class="phead">Word forms found</div><div class="stg">' + r.words.slice(0, 120).map(s => `<span class="chip st">${esc(s.text)} <span class="small">${s.n}</span></span>`).join(' ') + '</div>';
  q('searchStats').innerHTML = html || '<p class="hint">No statistics for this search.</p>';
}
function part(p: string): void {
  q('searchTabs').querySelectorAll<HTMLElement>('[data-sp]').forEach(b => b.classList.toggle('on', b.dataset.sp === p));
  q('searchResults').classList.toggle('hidden', p !== 'res'); q('searchBooks').classList.toggle('hidden', p !== 'books'); q('searchStats').classList.toggle('hidden', p !== 'stats');
}
function historyMenu(btn: HTMLElement): void {
  const h = ((ud.searchHistory as string[]) || []).slice(0, 25); const m = $('#vmenu');
  m.innerHTML = '<div class="mh">Earlier searches</div>' + (h.map(x => `<button data-q="${esc(x)}">${esc(x)}</button>`).join('') || '<div class="small" style="padding:4px 12px 8px">none yet</div>');
  m.classList.remove('hidden'); m.style.right = 'auto'; m.style.bottom = 'auto';
  const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 4) + 'px';
  m.querySelectorAll<HTMLElement>('[data-q]').forEach(b => b.onclick = () => { m.classList.add('hidden'); find(b.dataset.q!); });
}
