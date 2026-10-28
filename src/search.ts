// Search panels: theWord-style Bible searches (engine: src/legacy/search.js, shared with the Electron edition)
// and searches of the book modules (commentaries, dictionaries, books…), in as many search panels as you like.
// Bible searches: ranges (predefined, current book/chapter, your own, saved by name), results / references /
// books / statistics views, search history, add the results to a verse list or copy them.
// Book searches: the modules of a module set; results by module, the topic shown when you point at it.
import search from './legacy/search.js';
import type { Bible } from './bibles';
import type { BookMod, TopicText } from './books';
import { $, copyText, dialog, esc, flash } from './ui';
import { addToList, saveUD, ud } from './study';

export interface SearchHost {
  openBibles(): Bible[]; allBibles(): Bible[]; books(): BookMod[]; ref(): { b: number; c: number; v: number }; go(b: number, c: number, v?: number): void;
  settings(): Record<string, unknown>; save(): void; openTopic(mod: string, id: TopicText['id']): void; exportTopics(items: { mod: BookMod; id: TopicText['id'] }[]): void;
}
interface Opts { defaultOr: boolean; whole: boolean; matchCase: boolean; matchDiac: boolean; regex: boolean; nearW: number; nearV: number; bibles: 'open' | 'first' | 'all' | string; scope: string; mods?: string }
interface Hit { id: string; abbr: string; b: number; c: number; v: number; v2?: number; ref: string; text: string; marks: [number, number][]; other?: string }
interface Result { total: number; results: Hit[]; books: { id: string; b: number; name: string; abbr: string; n: number }[]; explanation: string; stats: { what: string; code: string; text: string; n: number }[]; words: { text: string; n: number }[]; ms: number }
interface BookHit { mod: BookMod; id: TopicText['id']; subject: string; snip: string; marks: [number, number][]; n: number }

let H: SearchHost;
const cache = new Map<string, [number, number, number, string][]>();
const bookCache = new Map<string, TopicText[]>();
export function forgetSearchCache(): void { cache.clear(); bookCache.clear(); }

const DEF: Opts = { defaultOr: false, whole: false, matchCase: false, matchDiac: false, regex: false, nearW: 30, nearV: 3, bibles: 'open', scope: 'all', mods: 'all' };
const ranges = (): Record<string, string> => (ud.ranges as Record<string, string>) || ((ud as unknown as Record<string, unknown>).ranges = {}) as Record<string, string>;
/** saved sets of book modules (theWord "module sets") */
export const moduleSets = (): Record<string, string[]> => (H.settings().moduleSets as Record<string, string[]>) || {};
const KINDSETS: [string, string, (m: BookMod) => boolean][] = [
  ['all', 'All book modules', () => true], ['commentary', 'Commentaries', m => m.kind === 'commentary'], ['dictionary', 'Dictionaries', m => m.kind === 'dictionary'],
  ['book', 'Books', m => m.kind === 'book'], ['devotional', 'Devotionals', m => m.kind === 'devotional'], ['map', 'Maps and graphics', m => m.kind === 'map'],
];
export function modsOfSet(key: string): BookMod[] {
  const all = H.books().filter(m => !m.locked);
  if (key.startsWith('set:')) { const ids = moduleSets()[key.slice(4)] || []; return all.filter(m => ids.includes(m.id)); }
  if (key.startsWith('mod:')) return all.filter(m => m.id === key.slice(4));
  const k = KINDSETS.find(x => x[0] === key) || KINDSETS[0]; return all.filter(k[2]);
}

/* ---------------------------------------------------------------- one search panel */
const IDS: Record<string, string> = { form: 'searchForm', input: 'searchInput', hist: 'searchHist', explain: 'searchExplain', scope: 'searchScope', bibles: 'searchBibles', mods: 'searchMods', more: 'searchMore', status: 'searchStatus', tabs: 'searchTabs', toList: 'searchToList', copy: 'searchCopy', exp: 'searchExport', results: 'searchResults', books: 'searchBooks', stats: 'searchStats', mode: 'searchMode', optDefault: 'optDefault', optWhole: 'optWhole', optCase: 'optCase', optDiac: 'optDiac', optRegex: 'optRegex', optNearW: 'optNearW', optNearV: 'optNearV' };
class SearchView {
  root: HTMLElement; key: string; main: boolean;
  mode: 'bible' | 'book' = 'bible';
  last: Result | null = null; filterBook: string | null = null; seq = 0; timer = 0; nBibles = 1;
  bookHits: BookHit[] = []; bookFilter: string | null = null; cancel = false;
  constructor(root: HTMLElement, key: string) {
    this.root = root; this.key = key; this.main = key === 'search';
    const a = (n: string) => `class="s-${n}"${this.main ? ` id="${IDS[n]}"` : ''}`;
    const sv = this.store(); this.mode = sv.mode === 'book' ? 'book' : 'bible';
    root.innerHTML = `
    <div ${a('mode')} class="s-mode seg smode"><button data-mode="bible">Bibles</button><button data-mode="book" title="Search the commentaries, dictionaries and books">Books</button></div>
    <form ${a('form')} class="s-form sform"><div class="srow"><input ${a('input')} type="search" placeholder="e.g. faith hope · &quot;a phrase&quot; · G26 · love*" spellcheck="false" autocomplete="off"><button type="button" ${a('hist')} class="s-hist ib" title="Earlier searches">▾</button><button type="submit" class="primary">Find</button></div>
      <div ${a('explain')} class="s-explain small"></div>
      <div class="srow sb-bible"><select ${a('scope')} aria-label="Range" title="Where to search"></select><select ${a('bibles')} title="Which Bibles"></select></div>
      <div class="srow sb-book"><select ${a('mods')} title="Which modules (module sets)"></select><button type="button" class="ib s-defsets" title="Module sets: make your own groups of modules">⋯</button></div>
      <details ${a('more')}><summary>Options</summary><div class="sopts">
        <label>Words without AND/OR <select ${a('optDefault')}><option value="and">all must be in the verse</option><option value="or">any may be</option></select></label>
        <label><input type="checkbox" ${a('optWhole')}> whole words</label><label><input type="checkbox" ${a('optCase')}> match case</label>
        <label><input type="checkbox" ${a('optDiac')}> match accents</label><label class="sb-bible"><input type="checkbox" ${a('optRegex')}> regular expression</label>
        <label class="sb-bible">NEAR = within <input ${a('optNearW')} type="number" min="1" class="num"> words / <input ${a('optNearV')} type="number" min="0" class="num"> verses</label>
        <p class="small sb-bible">AND, OR, NOT, brackets, "a phrase", love* (wildcard), G26 / H157 (Strong's), m/ V-AAI-3S (morphology), faith NEAR hope, faith NEARv2 hope.</p>
        <p class="small sb-book">Books: words (all of them, or any – above), "a phrase", love* (wildcard), -word or NOT word (leave out topics with it).</p></div></details></form>
    <div ${a('status')} class="s-status small sstatus"></div>
    <div ${a('tabs')} class="s-tabs seg hidden"><button data-sp="res" class="on sb-bible">Verses</button><button data-sp="refs" class="sb-bible" title="Only the references, by book: point at one to read the verse">References</button><button data-sp="books" class="sb-bible">Books</button><button data-sp="stats" class="sb-bible">Statistics</button><button data-sp="topics" class="sb-book on">Topics</button><button data-sp="bymod" class="sb-book">Modules</button><span class="grow"></span><button ${a('toList')} class="s-toList sb-bible" title="Add the verses shown to the current verse list">+ List</button><button ${a('copy')} class="s-copy" title="Copy what is shown">Copy</button><button ${a('exp')} class="s-exp sb-book" title="Save the topics found as a document">Export…</button></div>
    <ol ${a('results')} class="s-results results pbody"></ol><div ${a('books')} class="s-books pbody hidden"></div><div ${a('stats')} class="s-stats pbody hidden"></div>`;
    const o = this.opts();
    this.fillScopes(o.scope); this.fillBibles(o.bibles); this.fillMods(o.mods || 'all');
    this.q<HTMLSelectElement>('optDefault').value = o.defaultOr ? 'or' : 'and'; this.q<HTMLInputElement>('optWhole').checked = o.whole; this.q<HTMLInputElement>('optCase').checked = o.matchCase;
    this.q<HTMLInputElement>('optDiac').checked = o.matchDiac; this.q<HTMLInputElement>('optRegex').checked = o.regex; this.q<HTMLInputElement>('optNearW').value = String(o.nearW); this.q<HTMLInputElement>('optNearV').value = String(o.nearV);
    this.q('form').onsubmit = e => { e.preventDefault(); this.run(); };
    this.q('input').oninput = () => this.explainSoon();
    for (const id of ['optDefault', 'optWhole', 'optCase', 'optDiac', 'optRegex', 'optNearW', 'optNearV', 'bibles', 'mods']) this.q(id).onchange = () => { this.saveOpts(); this.explainSoon(); };
    this.q('scope').onchange = async () => { const s = this.q<HTMLSelectElement>('scope'); if (s.value === '__custom') await this.customRange(); else if (s.value === '__forget') await this.forgetRanges(); this.saveOpts(); };
    this.q('mode').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mode]'); if (b) this.setMode(b.dataset.mode as 'bible' | 'book'); };
    this.root.querySelector<HTMLElement>('.s-defsets')!.onclick = () => defineModuleSets().then(() => allViews.forEach(v => v.fillMods(v.opts().mods || 'all')));
    this.q('hist').onclick = e => { e.stopPropagation(); this.historyMenu(e.currentTarget as HTMLElement); };
    this.q('tabs').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-sp]'); if (b) this.part(b.dataset.sp!); };
    this.q('toList').onclick = () => { const v = this.visible(); if (v.length) addToList(v.map(x => ({ b: x.b, c: x.c, v: x.v, v2: x.v2 && x.v2 > x.v ? x.v2 : undefined }))); };
    this.q('copy').onclick = async () => {
      if (this.mode === 'book') { const v = this.bookVisible(); await copyText(v.map(x => `${x.mod.abbr || x.mod.title} – ${x.subject}\n${x.snip}`).join('\n\n')); flash(`Copied ${v.length} topic${v.length === 1 ? '' : 's'}`); return; }
      const v = this.visible(); await copyText(v.map(x => `${x.ref} ${x.text}`).join('\n')); flash(`Copied ${v.length} verse${v.length === 1 ? '' : 's'}`);
    };
    this.q('exp').onclick = () => { const v = this.bookVisible(); if (v.length) H.exportTopics(v.map(x => ({ mod: x.mod, id: x.id }))); };
    this.q('results').onclick = e => {
      const fa = (e.target as HTMLElement).closest('[data-all]'); if (fa) { this.filterBook = null; this.bookFilter = null; this.renderResults(); return; }
      const bt = (e.target as HTMLElement).closest<HTMLElement>('li[data-tmod]');
      if (bt) { H.openTopic(bt.dataset.tmod!, this.bookHits[+bt.dataset.hi!].id); return; }
      const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-b], a.rref'); if (!li) return; e.preventDefault(); e.stopPropagation();
      H.go(+li.dataset.b!, +li.dataset.c!, +li.dataset.v!); if (window.matchMedia('(max-width: 720px)').matches) document.body.classList.remove('side-open');
    };
    this.q('books').onclick = e => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-fb]'); if (r) { this.filterBook = r.dataset.fb!; this.part(this.listView()); return; }
      const m = (e.target as HTMLElement).closest<HTMLElement>('[data-fm]'); if (m) { this.bookFilter = m.dataset.fm!; this.part('topics'); }
    };
    this.q('stats').onclick = e => { const c = (e.target as HTMLElement).closest<HTMLElement>('[data-find]'); if (c) this.find(c.dataset.find!); };
    this.root.addEventListener('keydown', e => { if (e.key === 'Escape' && this.q('status').textContent?.startsWith('Reading')) { this.cancel = true; e.stopPropagation(); } });
    this.setMode(this.mode, true);
  }
  q<T extends HTMLElement = HTMLElement>(n: string): T { return this.root.querySelector(`.s-${n}`) as T; }
  /** each panel keeps its own options; the main panel uses the settings it always had */
  store(): Opts & { mode?: string } {
    const st = H.settings();
    if (this.main) return Object.assign({ ...DEF }, (st.search as Partial<Opts>) || {}) as Opts & { mode?: string };
    const all = (st.searchViews as Record<string, Partial<Opts>>) || {}; return Object.assign({ ...DEF }, (st.search as Partial<Opts>) || {}, all[this.key] || {}) as Opts & { mode?: string };
  }
  opts(): Opts { return this.store(); }
  put(o: Partial<Opts> & { mode?: string }): void {
    const st = H.settings();
    if (this.main) st.search = { ...((st.search as object) || {}), ...o };
    else { const all = ((st.searchViews as Record<string, unknown>) || {}); all[this.key] = { ...((all[this.key] as object) || {}), ...o }; st.searchViews = all; }
    H.save();
  }
  setMode(m: 'bible' | 'book', quiet = false): void {
    this.mode = m; this.root.classList.toggle('bookmode', m === 'book');
    this.q('mode').querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    this.q<HTMLInputElement>('input').placeholder = m === 'book' ? 'e.g. grace · "born again" · covenant*' : 'e.g. faith hope · "a phrase" · G26 · love*';
    if (!quiet) this.put({ mode: m });
    this.q('results').innerHTML = ''; this.q('books').innerHTML = ''; this.q('stats').innerHTML = ''; this.q('status').textContent = ''; this.q('tabs').classList.add('hidden');
    this.explainSoon();
  }
  find(text: string): void { this.setMode('bible'); this.q<HTMLInputElement>('input').value = text; this.run(); }
  focus(): void { this.fillScopes(this.q<HTMLSelectElement>('scope').value || this.opts().scope); this.fillBibles(this.opts().bibles); this.fillMods(this.opts().mods || 'all'); setTimeout(() => this.q<HTMLInputElement>('input').focus(), 50); }

  saveOpts(): Opts {
    const o: Opts = {
      defaultOr: this.q<HTMLSelectElement>('optDefault').value === 'or', whole: this.q<HTMLInputElement>('optWhole').checked, matchCase: this.q<HTMLInputElement>('optCase').checked,
      matchDiac: this.q<HTMLInputElement>('optDiac').checked, regex: this.q<HTMLInputElement>('optRegex').checked, nearW: +this.q<HTMLInputElement>('optNearW').value || 30,
      nearV: Math.max(0, +this.q<HTMLInputElement>('optNearV').value || 0), bibles: this.q<HTMLSelectElement>('bibles').value as Opts['bibles'], scope: this.q<HTMLSelectElement>('scope').value,
      mods: this.q<HTMLSelectElement>('mods').value || 'all',
    };
    if (o.scope.startsWith('__')) o.scope = 'all';
    this.put(o); return o;
  }
  engine(o: Opts) { return { defaultOr: o.defaultOr, wholeWords: o.whole, ignoreCase: !o.matchCase, ignoreDiacritics: !o.matchDiac, regex: o.regex, nearW: o.nearW, nearV: o.nearV, scope: o.scope, current: H.ref(), mode: '1611' }; }

  fillBibles(sel: string): void {
    const sets = (H.settings().bibleSets as Record<string, string[]>) || {};
    const s = this.q<HTMLSelectElement>('bibles');
    s.innerHTML = '<option value="open">Open Bibles</option><option value="first">First Bible only</option><option value="all">All Bibles</option>' +
      (Object.keys(sets).length ? `<optgroup label="Bible sets">${Object.keys(sets).map(n => `<option value="set:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    s.value = sel; if (s.selectedIndex < 0) s.value = 'open';
  }
  fillMods(sel: string): void {
    const sets = moduleSets(); const s = this.q<HTMLSelectElement>('mods'); const all = H.books().filter(m => !m.locked);
    s.innerHTML = KINDSETS.filter(([k, , f]) => k === 'all' || all.some(f)).map(([k, l, f]) => `<option value="${k}">${l} (${all.filter(f).length})</option>`).join('') +
      (Object.keys(sets).length ? `<optgroup label="My module sets">${Object.entries(sets).map(([n, ids]) => `<option value="set:${esc(n)}">${esc(n)} (${ids.length})</option>`).join('')}</optgroup>` : '') +
      `<optgroup label="One module">${all.slice().sort((a, b) => a.title.localeCompare(b.title)).map(m => `<option value="mod:${esc(m.id)}">${esc(m.title)}</option>`).join('')}</optgroup>`;
    s.value = sel; if (s.selectedIndex < 0) s.value = 'all';
  }
  fillScopes(sel: string): void {
    const s = this.q<HTMLSelectElement>('scope'); const mine = ranges();
    const known = [...search.PREDEFINED.map((p: string[]) => p[0]), 'book', 'chapter', ...Object.values(mine)];
    s.innerHTML = search.PREDEFINED.map(([id, label]: string[]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('')
      + '<option value="book">Current book</option><option value="chapter">Current chapter</option>'
      + (Object.keys(mine).length ? `<optgroup label="My ranges">${Object.entries(mine).map(([n, t]) => `<option value="${esc(t)}">${esc(n)}</option>`).join('')}</optgroup>` : '')
      + (sel && !known.includes(sel) && !sel.startsWith('__') ? `<option value="${esc(sel)}">${esc(sel)}</option>` : '')
      + '<option value="__custom">Custom range…</option>' + (Object.keys(mine).length ? '<option value="__forget">Remove a saved range…</option>' : '');
    s.value = sel || 'all'; if (s.selectedIndex < 0) s.value = 'all';
  }
  async customRange(): Promise<void> {
    const cur = this.opts().scope; const isText = !search.PREDEFINED.some((p: string[]) => p[0] === cur) && !['book', 'chapter'].includes(cur);
    let text = isText ? cur : '', name = '';
    const res = await dialog('Custom search range', `<label class="fl">Passages, separated by ; or new lines<textarea id="rgText" rows="4" class="txt" placeholder="Gen-Deut; Matt 5-7; Rom 3:21-26">${esc(text)}</textarea></label><div id="rgCheck" class="small"></div><label class="fl">Save as (optional) <input id="rgName" class="txt" placeholder="e.g. Sermon on the Mount"></label>`,
      [{ label: 'Cancel', value: null }, { label: 'Use range', value: 'ok', primary: true }], b => {
        const t = b.querySelector<HTMLTextAreaElement>('#rgText')!; const chk = b.querySelector('#rgCheck')!;
        const upd = () => { text = t.value; const r = checkRange(text); chk.textContent = r.ok ? '✓ understood' : r.errors.length ? 'Not understood: ' + r.errors.join('; ') : ''; chk.classList.toggle('bad', !r.ok && !!r.errors.length); };
        t.oninput = upd; b.querySelector<HTMLInputElement>('#rgName')!.oninput = e => { name = (e.target as HTMLInputElement).value.trim(); }; upd(); t.focus();
      });
    if (res !== 'ok') { this.fillScopes(this.opts().scope); return; }
    const chk = checkRange(text);
    if (!chk.ok) { flash('Range not understood: ' + (chk.errors.join('; ') || 'empty')); this.fillScopes(this.opts().scope); return; }
    text = text.trim().replace(/\s*\n\s*/g, '; ');
    if (name) { ranges()[name] = text; saveUD(); }
    this.fillScopes(text);
  }
  async forgetRanges(): Promise<void> {
    const mine = ranges(); let pick = '';
    const res = await dialog('Remove a saved range', `<label class="fl">Range <select id="rgDel">${Object.entries(mine).map(([n, t]) => `<option value="${esc(n)}">${esc(n)} – ${esc(t)}</option>`).join('')}</select></label>`,
      [{ label: 'Cancel', value: null }, { label: 'Remove', value: 'ok', primary: true }], b => { const s = b.querySelector<HTMLSelectElement>('#rgDel')!; pick = s.value; s.onchange = () => { pick = s.value; }; });
    const was = mine[pick];
    if (res === 'ok' && pick) { delete mine[pick]; saveUD(); }
    const cur = this.opts().scope; this.fillScopes(res === 'ok' && cur === was ? 'all' : cur);
  }
  explainSoon(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      const text = this.q<HTMLInputElement>('input').value.trim(); const box = this.q('explain');
      if (!text) { box.textContent = ''; return; }
      if (this.mode === 'book') { const p = bookQuery(text, this.opts()); box.textContent = p.ok ? 'Looking for ' + p.text : '⚠ ' + p.text; box.classList.toggle('bad', !p.ok); return; }
      try { const r = search.describe(text, this.engine(this.opts())); box.textContent = (r.ok ? 'Looking for ' : '⚠ ') + r.text; box.classList.toggle('bad', !r.ok); }
      catch (e) { box.textContent = '⚠ ' + (e as Error).message; box.classList.add('bad'); }
    }, 200);
  }
  bibles(o: Opts): Bible[] {
    if (o.bibles === 'all') return H.allBibles();
    if (o.bibles.startsWith('set:')) { const ids = ((H.settings().bibleSets as Record<string, string[]>) || {})[o.bibles.slice(4)] || []; return ids.map(id => H.allBibles().find(b => b.id === id)).filter((b): b is Bible => !!b); }
    const open = H.openBibles(); return o.bibles === 'first' ? open.slice(0, 1) : open;
  }
  addHistory(text: string): void { const h = ((ud.searchHistory as string[]) || []); ud.searchHistory = [text, ...h.filter(x => x !== text)].slice(0, 50); saveUD(); }

  async run(): Promise<void> {
    const text = this.q<HTMLInputElement>('input').value.trim(); if (!text) return;
    if (this.mode === 'book') return this.runBooks(text);
    const o = this.saveOpts(); const list = this.bibles(o); const my = ++this.seq;
    const status = this.q('status'); status.textContent = 'Searching…'; this.q('results').innerHTML = ''; this.q('tabs').classList.add('hidden');
    try {
      for (const b of list) if (!cache.has(b.id)) { status.textContent = `Reading ${b.abbr} for searching…`; cache.set(b.id, await b.allVerses()); if (my !== this.seq) return; }
      await new Promise(r => setTimeout(r, 0));
      const mods = list.map(b => ({ id: b.id, abbr: b.abbr, mod: { allVerses: () => cache.get(b.id) || [] } }));
      const r: Result = search.run(mods, text, { ...this.engine(o), limit: 3000 });
      if (my !== this.seq) return;
      this.last = r; this.filterBook = null; this.nBibles = list.length;
      this.addHistory(text);
      status.innerHTML = `<b>${r.total}</b> verse${r.total === 1 ? '' : 's'}${list.length > 1 ? ` in ${list.length} Bibles` : ''}${r.total > r.results.length ? ` (first ${r.results.length} listed)` : ''} · ${esc(r.explanation)} · ${r.ms} ms`;
      this.q('tabs').classList.toggle('hidden', !r.total);
      this.renderBooks(); this.renderStats(); this.part(this.listView());
    } catch (e) { status.innerHTML = `<span class="bad">${esc(String((e as Error).message || e))}</span>`; }
  }
  /** search the book modules of the chosen set */
  async runBooks(text: string): Promise<void> {
    const o = this.saveOpts(); const p = bookQuery(text, o); const my = ++this.seq; this.cancel = false;
    const status = this.q('status'); this.q('results').innerHTML = ''; this.q('tabs').classList.add('hidden');
    if (!p.ok) { status.innerHTML = `<span class="bad">${esc(p.text)}</span>`; return; }
    const mods = modsOfSet(o.mods || 'all'); const t0 = performance.now(); const hits: BookHit[] = [];
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i]; if (!m.texts) continue;
      if (!bookCache.has(m.id)) {
        status.textContent = `Reading ${m.title} for searching… (${i + 1} of ${mods.length}; Esc stops)`;
        try { bookCache.set(m.id, await m.texts(f => { status.textContent = `Reading ${m.title} for searching… ${Math.round(f * 100)}% (${i + 1} of ${mods.length}; Esc stops)`; })); } catch { bookCache.set(m.id, []); }
      }
      if (my !== this.seq) return;
      if (this.cancel) { status.textContent = 'Stopped.'; break; }
      for (const t of bookCache.get(m.id) || []) { const h = p.test(t); if (h) hits.push({ mod: m, id: t.id, subject: t.subject, ...h }); }
      await new Promise(r => setTimeout(r, 0));
    }
    if (my !== this.seq) return;
    this.bookHits = hits; this.bookFilter = null; this.addHistory(text);
    const nm = new Set(hits.map(h => h.mod.id)).size;
    status.innerHTML = `<b>${hits.length}</b> topic${hits.length === 1 ? '' : 's'} in ${nm} of ${mods.length} module${mods.length === 1 ? '' : 's'} · ${esc(p.text)} · ${Math.round(performance.now() - t0)} ms`;
    this.q('tabs').classList.toggle('hidden', !hits.length);
    this.renderBookMods(); this.part('topics');
  }
  bookVisible(): BookHit[] { return this.bookFilter ? this.bookHits.filter(h => h.mod.id === this.bookFilter) : this.bookHits; }
  renderBookResults(): void {
    const list = this.bookVisible().slice(0, 2000); const fm = this.bookFilter ? H.books().find(m => m.id === this.bookFilter) : null;
    let html = fm ? `<li class="filter">${this.bookVisible().length} in ${esc(fm.title)} · <a data-all="1">show all ${this.bookHits.length}</a></li>` : '';
    let cur = '';
    list.forEach(h => {
      if (h.mod.id !== cur) { cur = h.mod.id; html += `<li class="mgroup">${esc(h.mod.title)}</li>`; }
      html += `<li data-tmod="${esc(h.mod.id)}" data-tid="${esc(String(h.id))}" data-hi="${this.bookHits.indexOf(h)}" class="bhit"><span class="r">${esc(h.subject)}</span>${h.n > 1 ? ` <span class="small">×${h.n}</span>` : ''}<div class="snip">${marked(h.snip, h.marks)}</div></li>`;
    });
    if (this.bookVisible().length > list.length) html += `<li class="small">… ${this.bookVisible().length - list.length} more not listed</li>`;
    this.q('results').innerHTML = html;
  }
  renderBookMods(): void {
    const by = new Map<string, { m: BookMod; n: number }>(); for (const h of this.bookHits) { const e = by.get(h.mod.id) || { m: h.mod, n: 0 }; e.n++; by.set(h.mod.id, e); }
    const max = Math.max(1, ...[...by.values()].map(x => x.n));
    this.q('books').innerHTML = by.size ? `<table class="bookbars">${[...by.values()].map(x => `<tr data-fm="${esc(x.m.id)}" title="Show only ${esc(x.m.title)}"><td>${esc(x.m.title)}</td><td class="n">${x.n}</td><td class="barc"><span style="width:${Math.max(2, Math.round(100 * x.n / max))}%"></span></td></tr>`).join('')}</table><p class="small">Click a module to list only its topics.</p>` : '';
  }
  visible(): Hit[] { if (!this.last) return []; return this.filterBook ? this.last.results.filter(x => `${x.id}|${x.b}` === this.filterBook) : this.last.results; }
  renderResults(refs = this.q('results').classList.contains('refview')): void {
    if (this.mode === 'book') return this.renderBookResults();
    const last = this.last; const list = this.visible(); const fb = this.filterBook && last ? last.books.find(b => `${b.id}|${b.b}` === this.filterBook) : null;
    const head = fb ? `<li class="filter">${list.length} in ${esc(fb.name)} · <a data-all="1">show all ${last!.results.length}</a></li>` : '';
    const more = !fb && last && last.total > last.results.length ? `<li class="small">… ${last.total - last.results.length} more not listed</li>` : '';
    if (refs) {
      // references grouped by book with the number found; pointing at one shows the verse
      const groups: { key: string; name: string; abbr: string; hits: Hit[] }[] = [];
      for (const x of list) { const key = x.id + '|' + x.b; let g = groups[groups.length - 1]; if (!g || g.key !== key) { g = { key, name: last!.books.find(k => `${k.id}|${k.b}` === key)?.name || x.ref.replace(/\s*\d+:\d+.*$/, ''), abbr: x.abbr, hits: [] }; groups.push(g); } g.hits.push(x); }
      this.q('results').innerHTML = head + groups.map(g => `<li class="rgroup"><div class="rgh">${esc(g.name)}${this.nBibles > 1 ? ` <span class="small">${esc(g.abbr)}</span>` : ''} <span class="n">${g.hits.length}</span></div>${g.hits.map(x => `<a class="xr rref" data-ref="${x.b}.${x.c}.${x.v}.${x.v2 && x.v2 > x.v ? x.v2 - x.v : 0}" data-b="${x.b}" data-c="${x.c}" data-v="${x.v}">${x.c}:${x.v}${x.v2 && x.v2 > x.v ? '–' + x.v2 : ''}</a>`).join(' ')}</li>`).join('') + more;
      return;
    }
    this.q('results').innerHTML = head +
      list.map(x => `<li data-b="${x.b}" data-c="${x.c}" data-v="${x.v}"><span class="r">${esc(x.ref)}</span>${this.nBibles > 1 ? `<span class="small">${esc(x.abbr)}</span> ` : ''}${x.other ? `<span class="small"> near ${esc(x.other)}</span> ` : ''}${marked(x.text, x.marks)}</li>`).join('') + more;
  }
  renderBooks(): void {
    const r = this.last!; const max = Math.max(1, ...r.books.map(b => b.n));
    this.q('books').innerHTML = r.books.length ? `<table class="bookbars">${r.books.map(b => `<tr data-fb="${esc(b.id + '|' + b.b)}" title="Show only ${esc(b.name)}"><td>${esc(b.name)}${this.nBibles > 1 ? ` <span class="small">${esc(H.allBibles().find(x => x.id === b.id)?.abbr || '')}</span>` : ''}</td><td class="n">${b.n}</td><td class="pc">${Math.round(100 * b.n / Math.max(1, r.total))}%</td><td class="barc"><span style="width:${Math.max(2, Math.round(100 * b.n / max))}%"></span></td></tr>`).join('')}</table><p class="small">Click a book to list only its verses.</p>` : '';
  }
  renderStats(): void {
    const r = this.last!; let html = '';
    if (r.stats.length) {
      const groups: Record<string, typeof r.stats> = {};
      for (const s of r.stats) (groups[s.code || s.what] = groups[s.code || s.what] || []).push(s);
      html += '<div class="phead">How the tagged words are translated</div>' + Object.entries(groups).map(([code, list]) => `<div class="stg"><b>${/^[GH]\d/i.test(code) ? `<a data-find="${esc(code)}">${esc(code)}</a>` : esc(code)}</b> ${list.slice(0, 40).map(s => `<span class="chip st">${esc(s.text)} <span class="small">${s.n}</span></span>`).join(' ')}</div>`).join('');
    }
    if (r.words.length) html += '<div class="phead">Word forms found</div><div class="stg">' + r.words.slice(0, 120).map(s => `<span class="chip st">${esc(s.text)} <span class="small">${s.n}</span></span>`).join(' ') + '</div>';
    this.q('stats').innerHTML = html || '<p class="hint">No statistics for this search.</p>';
  }
  listView(): string { return this.opts().searchView === 'refs' ? 'refs' : 'res'; }
  part(p: string): void {
    this.q('tabs').querySelectorAll<HTMLElement>('[data-sp]').forEach(b => b.classList.toggle('on', b.dataset.sp === p));
    const list = p === 'res' || p === 'refs' || p === 'topics';
    this.q('results').classList.toggle('hidden', !list); this.q('results').classList.toggle('refview', p === 'refs');
    this.q('books').classList.toggle('hidden', p !== 'books' && p !== 'bymod'); this.q('stats').classList.toggle('hidden', p !== 'stats');
    if (p === 'topics') this.renderBookResults();
    else if (this.last && (p === 'res' || p === 'refs')) { this.renderResults(p === 'refs'); this.put({ searchView: p } as Partial<Opts>); }
  }
  historyMenu(btn: HTMLElement): void {
    const h = ((ud.searchHistory as string[]) || []).slice(0, 25); const m = $('#vmenu');
    m.innerHTML = '<div class="mh">Earlier searches</div>' + (h.map(x => `<button data-q="${esc(x)}">${esc(x)}</button>`).join('') || '<div class="small" style="padding:4px 12px 8px">none yet</div>');
    m.classList.remove('hidden'); m.style.right = 'auto'; m.style.bottom = 'auto';
    const r = btn.getBoundingClientRect(); m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 4) + 'px';
    m.querySelectorAll<HTMLElement>('[data-q]').forEach(b => b.onclick = () => { m.classList.add('hidden'); this.q<HTMLInputElement>('input').value = b.dataset.q!; this.run(); });
  }
}
interface Opts { searchView?: string }

/* ---------------------------------------------------------------- book search queries */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
/** a book search: words (all or any), "phrases", word* wildcards, -word / NOT word to leave out */
function bookQuery(text: string, o: Opts): { ok: boolean; text: string; test: (t: TopicText) => { snip: string; marks: [number, number][]; n: number } | null } {
  const toks: { t: string; not: boolean; phrase: boolean }[] = []; let not = false;
  for (const m of text.matchAll(/(-?)"([^"]+)"|(\S+)/g)) {
    if (m[3] && /^(NOT)$/.test(m[3])) { not = true; continue; }
    if (m[3] && /^(AND|OR)$/.test(m[3])) continue;
    const neg = not || m[1] === '-' || (!!m[3] && m[3].startsWith('-') && m[3].length > 1); not = false;
    const t = m[2] ?? (m[3].startsWith('-') ? m[3].slice(1) : m[3]); if (t) toks.push({ t, not: neg, phrase: m[2] != null });
  }
  const any = o.defaultOr || /\bOR\b/.test(text);
  if (!toks.some(x => !x.not)) return { ok: false, text: 'type at least one word to find', test: () => null };
  const flags = 'gu' + (o.matchCase ? '' : 'i');
  const pat = (w: string) => {
    let s = (o.matchDiac ? w.normalize('NFD') : fold(w)).split('').map(ch => ch === '*' ? '[\\p{L}\\p{M}]*' : ch === '?' ? '[\\p{L}]' : /\s/.test(ch) ? '\\s+' : ch.replace(/[.+^${}()|[\]\\]/g, '\\$&') + (o.matchDiac ? '' : '\\p{M}*')).join('');
    if (o.whole || w.includes('*')) s = `(?<![\\p{L}\\p{M}])${s}(?![\\p{L}\\p{M}])`;
    return new RegExp(s, flags);
  };
  let res: { t: string; not: boolean; re: RegExp }[];
  try { res = toks.map(x => ({ ...x, re: pat(x.t) })); } catch (e) { return { ok: false, text: (e as Error).message, test: () => null }; }
  const pos = res.filter(x => !x.not), neg = res.filter(x => x.not);
  const desc = pos.map(x => `“${x.t}”`).join(any ? ' or ' : ' and ') + (neg.length ? ', without ' + neg.map(x => `“${x.t}”`).join(', ') : '') + (o.whole ? ' (whole words)' : '');
  return {
    ok: true, text: desc,
    test(t: TopicText) {
      const body = (t.subject + '\n' + t.text).normalize('NFD');
      for (const x of neg) { x.re.lastIndex = 0; if (x.re.test(body)) return null; }
      const found: [number, number][] = []; let okAll = true;
      for (const x of pos) { x.re.lastIndex = 0; let m: RegExpExecArray | null; let got = false; while ((m = x.re.exec(body)) && found.length < 400) { if (!m[0]) { x.re.lastIndex++; continue; } found.push([m.index, m.index + m[0].length]); got = true; } if (!got) okAll = false; }
      if (!found.length || (!any && !okAll)) return null;
      found.sort((a, b) => a[0] - b[0]);
      // the snippet comes from the text (the title is shown anyway)
      const t0 = t.subject.normalize('NFD').length + 1; const inText = found.find(f => f[0] >= t0);
      const first = inText ? inText[0] : t0; const from = Math.max(t0, body.lastIndexOf('\n', first) + 1, first - 90); const to = Math.min(body.length, first + 160);
      const snip = (from > t0 ? '…' : '') + body.slice(from, to).replace(/\n/g, ' ') + (to < body.length ? '…' : '');
      const off = (from > t0 ? 1 : 0) - from;
      return { snip, n: found.length, marks: found.filter(([s, e]) => s >= from && e <= to).map(([s, e]) => [s + off, e + off] as [number, number]) };
    },
  };
}
function checkRange(text: string): { ok: boolean; errors: string[] } {
  if (!text.trim()) return { ok: false, errors: [] };
  const r = search.parseRange(text, '1611'); return { ok: !r.errors.length && r.ranges.length > 0, errors: r.errors };
}
function marked(text: string, marks: [number, number][]): string {
  let out = '', p = 0; for (const [s, e] of marks || []) { if (s < p) continue; out += esc(text.slice(p, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>'; p = e; }
  return out + esc(text.slice(p));
}

/* ---------------------------------------------------------------- module sets */
export async function defineModuleSets(): Promise<void> {
  const all = H.books().filter(m => !m.locked); const sets = { ...moduleSets() };
  let cur = Object.keys(sets)[0] || ''; let ids = new Set<string>(sets[cur] || []); let nameEl: HTMLInputElement | null = null;
  const KN: Record<string, string> = { commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps', readingplan: 'Reading plans' };
  const body = (b: HTMLElement) => {
    b.querySelector('.mslist')!.innerHTML = Object.keys(KN).filter(k => all.some(m => m.kind === k)).map(k => `<h5>${KN[k]}</h5>` + all.filter(m => m.kind === k).sort((x, y) => x.title.localeCompare(y.title)).map(m => `<label><input type="checkbox" data-ms="${esc(m.id)}" ${ids.has(m.id) ? 'checked' : ''}> ${esc(m.title)}</label>`).join('')).join('');
    b.querySelectorAll<HTMLInputElement>('[data-ms]').forEach(cb => cb.onchange = () => { if (cb.checked) ids.add(cb.dataset.ms!); else ids.delete(cb.dataset.ms!); });
  };
  const res = await dialog('Module sets', `<p class="small">A module set is a group of book modules under a name of your choice (e.g. “Word study”). Search it in a search panel set to <b>Books</b>, or choose it in a book view.</p>
    <div class="srow"><select id="msPick"><option value="">New set…</option>${Object.keys(sets).map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><input id="msName" class="txt" placeholder="Name of the set" value="${esc(cur)}"><button id="msDel" class="danger" type="button">Delete</button></div>
    <div class="mslist"></div>`, [{ label: 'Close', value: null }, { label: 'Save set', value: 'ok', primary: true }], b => {
    const pick = b.querySelector<HTMLSelectElement>('#msPick')!, name = b.querySelector<HTMLInputElement>('#msName')!;
    pick.onchange = () => { cur = pick.value; name.value = cur; ids = new Set(sets[cur] || []); body(b); };
    b.querySelector<HTMLButtonElement>('#msDel')!.onclick = () => { if (!cur) return; delete sets[cur]; H.settings().moduleSets = { ...sets }; H.save(); flash(`Module set “${cur}” deleted`); cur = ''; name.value = ''; ids = new Set(); pick.innerHTML = '<option value="">New set…</option>' + Object.keys(sets).map(n => `<option>${esc(n)}</option>`).join(''); body(b); };
    nameEl = name; body(b);
  });
  const nm = ((nameEl as HTMLInputElement | null)?.value ?? cur).trim();
  if (res === 'ok' && nm && ids.size) {
    if (cur && cur !== nm) delete sets[cur];
    sets[nm] = [...ids]; H.settings().moduleSets = sets; H.save(); flash(`Module set “${nm}” saved (${ids.size} modules)`);
  } else if (res === 'ok' && !ids.size) flash('Tick some modules for the set');
  else if (res === 'ok') flash('Give the set a name');
}

/* ---------------------------------------------------------------- the panels */
const allViews: SearchView[] = [];
let active: SearchView | null = null;
export function initSearch(host: SearchHost): void {
  H = host;
  const v = new SearchView(document.getElementById('p-search')!, 'search'); allViews.push(v); active = v;
  document.addEventListener('focusin', e => { const r = (e.target as HTMLElement).closest?.('.searchview, #p-search'); const x = r && allViews.find(y => y.root === r); if (x) active = x; });
}
/** another search panel (theWord: several search views) */
export function createSearchView(root: HTMLElement, id: string): void {
  root.classList.add('searchview'); const v = new SearchView(root, id); allViews.push(v);
}
export function searchViewClosed(id: string): void {
  const i = allViews.findIndex(v => v.key === id); if (i > 0) { if (active === allViews[i]) active = allViews[0]; allViews.splice(i, 1); }
  const st = H.settings(); const sv = st.searchViews as Record<string, unknown> | undefined; if (sv) { delete sv[id]; H.save(); }
}
export function searchViewShown(id: string): void { allViews.find(v => v.key === id)?.focus(); }
/** search from elsewhere (e.g. a Strong's number in a popup): the main search panel */
export function find(text: string): void { allViews[0].find(text); }
export function focusSearch(): void { allViews[0].focus(); }
/** the topic of a book-search result, for its popup */
export function bookHitOf(el: HTMLElement): { mod: BookMod; id: TopicText['id'] } | null {
  const v = allViews.find(x => x.root.contains(el)); const hi = el.dataset.hi; if (!v || hi == null) return null;
  const h = v.bookHits[+hi]; return h ? { mod: h.mod, id: h.id } : null;
}
