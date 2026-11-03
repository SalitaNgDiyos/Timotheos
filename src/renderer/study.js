'use strict';
/* global api, state, $, esc, go, openTab, save, setShow, renderChapter, selectVerse, step, stepBook, historyGo, font,
   TWRender, EMPTY_MOD, refName, TimotheosModules, TimotheosOptions, effShow, activeText, ownSwitchKeys, toggleOwnSwitch, refreshModules */
// Study tools modelled on theWord's manual: View options & quick keys, history keys, bookmarks 0–9,
// verse lists (with .vsls.twm export), user highlighting, personal verse notes (with .cmt.twm export),
// Copy Verses dialog, compare differences, paragraph mode, Bible tree, reading plans (with .rdp.twm export).

const study = { ud: null, timers: {}, textCache: new Map(), treeSig: '', seg: 'lists', typed: '', typedTimer: null, typedChapter: false };
const HL_STYLES = [['yellow', 'Yellow'], ['green', 'Green'], ['blue', 'Blue'], ['pink', 'Pink'], ['orange', 'Orange'], ['ul', 'Underline'], ['bold', 'Bold']];
const vkey = (b, c, v) => `${b}.${c}.${v}`;
const parseKey = k => { const [b, c, v] = k.split('.').map(Number); return { b, c, v }; };
const orderOf = b => { const i = state.nav.findIndex(x => x.id === b); return i < 0 ? 1000 + b : i; };

async function init() {
  study.ud = await api.userData();
  const show = state.settings.show;
  for (const [k, d] of [['highlights', true], ['notes', true], ['paragraph', false]]) if (show[k] === undefined) show[k] = d;
  document.querySelectorAll('[data-show]').forEach(cb => { cb.checked = !!show[cb.dataset.show]; });
  wireViewMenu(); wireKeys(); wireContextMenu(); wireStudyTab();
}
function saveUD(key, now) {
  clearTimeout(study.timers[key]);
  const f = () => api.setUserData(key, study.ud[key]).catch(e => console.error(e));
  if (now) f(); else study.timers[key] = setTimeout(f, 250);
}

/* ======================================================================= View menu */
function wireViewMenu() {
  const menu = $('#viewMenu');
  $('#viewBtn').onclick = e => { e.stopPropagation(); menu.classList.toggle('hidden'); };
  document.addEventListener('click', e => { if (!e.target.closest('#viewMenu, #viewBtn')) menu.classList.add('hidden'); if (!e.target.closest('#ctxMenu')) hideCtx(); });
  for (const r of document.querySelectorAll('input[name="layout"]')) {
    r.checked = (state.settings.layout || 'cols') === r.value;
    r.onchange = () => setLayout(r.value);
  }
  $('#diffToggle').checked = !!state.settings.diff;
  $('#diffToggle').onchange = () => { save({ diff: $('#diffToggle').checked }); renderChapter(); };
  $('#fontUp').onclick = () => font(1); $('#fontDown').onclick = () => font(-1);
  $('#printBtn').onclick = () => { menu.classList.add('hidden'); window.print(); };
  $('#copyBtn').onclick = () => copyDialog();
}
function setLayout(l) {
  save({ layout: l }); document.querySelectorAll('input[name="layout"]').forEach(r => { r.checked = r.value === l; });
  if (state.settings.show.paragraph) setShow('paragraph', false); else renderChapter();
}

/* ======================================================================= [E2] keyboard shortcuts */
const TOGGLE_MAP = [
  ['toggleStrongs', 'strongs'], ['toggleMorph', 'morph'], ['toggleLemma', 'lemma'],
  ['toggleFootnotes', 'footnotes'], ['toggleHeadings', 'headings'], ['toggleWoj', 'woj'],
  ['toggleAdded', 'added'], ['toggleXrefs', 'xrefs'], ['toggleCmtLinks', 'cmtLinks'],
  ['toggleHighlights', 'highlights'], ['toggleNotes', 'notes'], ['toggleParagraph', 'paragraph'],
];
function typing(e) { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t.classList && t.classList.contains('rec'))); }
function comboOf(e) {
  const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
  return (e.ctrlKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && !(e.key.length === 1 && !e.ctrlKey && !e.altKey) ? 'shift+' : '') + k;
}
function wireKeys() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { hideCtx(); $('#viewMenu').classList.add('hidden'); $('#popup').classList.add('hidden'); return; }
    if (!$('#modal').classList.contains('hidden')) return;
    if (!$('#optionsDlg').classList.contains('hidden') || !$('#propsDlg').classList.contains('hidden')) return;
    if (e.ctrlKey && !e.altKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); return font(1); }
    if (e.ctrlKey && !e.altKey && e.key === '-') { e.preventDefault(); return font(-1); }
    if (typing(e)) return;
    const k = e.key; const digit = /^Digit(\d)$/.exec(e.code); const d = digit ? +digit[1] : null;
    if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); return historyGo(-1); }
    if (e.altKey && k === 'ArrowRight') { e.preventDefault(); return historyGo(1); }
    if (!e.altKey && !e.ctrlKey && k === 'Backspace') { e.preventDefault(); return historyGo(-1); }
    if (e.ctrlKey && k === 'ArrowLeft') { e.preventDefault(); return stepBook(-1); }
    if (e.ctrlKey && k === 'ArrowRight') { e.preventDefault(); return stepBook(1); }
    if (!e.ctrlKey && !e.altKey && k === 'ArrowLeft') { e.preventDefault(); return step(-1); }
    if (!e.ctrlKey && !e.altKey && k === 'ArrowRight') { e.preventDefault(); return step(1); }
    if (!e.ctrlKey && !e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); return moveVerse(k === 'ArrowUp' ? -1 : 1); }
    if (e.ctrlKey && e.shiftKey && d != null) { e.preventDefault(); return setBookmark(d); }
    if (e.ctrlKey && !e.shiftKey && d != null) { e.preventDefault(); return gotoBookmark(d); }
    if (e.ctrlKey && k.toLowerCase() === 'p') { e.preventDefault(); return window.print(); }
    if (e.ctrlKey && k.toLowerCase() === 'c' && !String(window.getSelection())) { e.preventDefault(); return quickCopy(); }
    if (!e.ctrlKey && !e.altKey && !e.metaKey && d != null) { e.preventDefault(); return typeNumber(d, e.shiftKey); }

    // [E2] Check customizable shortcuts
    const sc = window.TimotheosOptions && TimotheosOptions.shortcuts ? TimotheosOptions.shortcuts() : {};
    const cb = comboOf(e);
    if (sc.addVerseList && sc.addVerseList.toLowerCase() === cb) { e.preventDefault(); return addToList([{ ...state.ref }]); }
    if (sc.layoutCols && sc.layoutCols.toLowerCase() === cb) { e.preventDefault(); return setLayout('cols'); }
    if (sc.layoutRows && sc.layoutRows.toLowerCase() === cb) { e.preventDefault(); return setLayout('rows'); }
    if (sc.columnsMode && sc.columnsMode.toLowerCase() === cb) { e.preventDefault(); return setShow('columns', !effShow('columns')); }
    for (const [scId, showKey] of TOGGLE_MAP) {
      if (sc[scId] && sc[scId].toLowerCase() === cb && !e.shiftKey) {
        e.preventDefault();
        return setShow(showKey, !effShow(showKey));
      }
    }
    // a Bible's own one-letter switch (e.g. V for variants)
    if (!e.ctrlKey && !e.altKey && !e.metaKey && /^[a-z]$/i.test(k) && window.ownSwitchKeys) {
      const n = ownSwitchKeys().find(x => x.toLowerCase() === k.toLowerCase());
      if (n) { e.preventDefault(); return toggleOwnSwitch(n); }
    }
  });
}
function moveVerse(d) {
  const vs = [...new Set([...activeText().querySelectorAll('[data-v]')].map(x => +x.dataset.v))].sort((a, b) => a - b);
  const i = vs.indexOf(state.ref.v);
  if (i + d < 0) return step(-1);
  if (i + d >= vs.length) return step(1);
  selectVerse(vs[i + d]);
}
function typeNumber(d, chapter) {
  if (study.typedChapter !== chapter) study.typed = '';
  study.typedChapter = chapter; study.typed += String(d);
  clearTimeout(study.typedTimer);
  flash(`${chapter ? 'Chapter' : 'Verse'} ${study.typed}`);
  study.typedTimer = setTimeout(() => {
    const n = +study.typed; study.typed = '';
    if (chapter) go({ b: state.ref.b, c: n, v: 1 }); else if (!selectVerse(n)) flash(`No verse ${n}`);
  }, 650);
}
function flash(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1400);
}

/* ======================================================================= after each render */
function afterRender(p) {
  if (state.settings.show.highlights) applyHighlights(p);
  if (p.notes) showNotes(p);
}

const SKIP_SEL = 'sup, .xrs, .heading, .unote, .rabbr, .noteicon, .vnum, .cm, .diffpct, .dropcap';
function coreNodes(el) {
  const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && n.parentElement.closest(SKIP_SEL) && el.contains(n.parentElement.closest(SKIP_SEL))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n; while ((n = w.nextNode())) out.push(n);
  return out;
}
function cellFor(root, v, col) { return root.querySelector(`[data-v="${v}"][data-col="${col}"]`) || root.querySelector(`tr[data-v="${v}"] [data-col="${col}"]`); }

/* ======================================================================= highlighting */
function applyHighlights(p) {
  const hl = (study.ud.highlights || {})[p.id]; if (!hl) return;
  for (const k in hl) {
    const r = parseKey(k); if (r.b !== p.b || r.c !== p.c) continue;
    const el = cellFor(p.root, r.v, p.col); if (!el) continue;
    for (const m of hl[k]) wrapRange(el, m.s, m.e, m.style);
  }
}
function wrapRange(el, s, e, style) {
  let pos = 0;
  for (const n of coreNodes(el)) {
    const len = n.length, a = Math.max(s, pos), z = Math.min(e, pos + len);
    if (a < z) {
      const r = document.createRange(); r.setStart(n, a - pos); r.setEnd(n, z - pos);
      const mk = document.createElement('mark'); mk.className = 'hl hl-' + style;
      try { r.surroundContents(mk); } catch (err) { /* crosses an element boundary: skip this piece */ }
    }
    pos += len;
    if (pos >= e) break;
  }
}
function selectionTarget(fallbackEl) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount && String(sel).trim()) {
    const range = sel.getRangeAt(0);
    const startEl = (range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer).closest('[data-col]');
    if (startEl && $('#view').contains(startEl)) {
      const nodes = coreNodes(startEl); let pos = 0, s = null, e = null;
      for (const n of nodes) {
        if (range.intersectsNode(n)) {
          const from = n === range.startContainer ? range.startOffset : 0;
          const to = n === range.endContainer ? range.endOffset : n.length;
          if (s === null) s = pos + from; e = pos + to;
        }
        pos += n.length;
      }
      const v = +startEl.closest('[data-v]').dataset.v;
      if (s !== null && e > s) return { col: +startEl.dataset.col, v, s, e, partial: true };
    }
  }
  if (fallbackEl) { const len = coreNodes(fallbackEl).reduce((a, n) => a + n.length, 0); return { col: +fallbackEl.dataset.col, v: +fallbackEl.closest('[data-v]').dataset.v, s: 0, e: len, partial: false }; }
  return null;
}
function highlight(t, style) {
  const id = state.settings.openBibles[t.col]; if (!id) return;
  const hl = study.ud.highlights[id] || (study.ud.highlights[id] = {});
  const sec = document.querySelectorAll('#view > .bv')[t.col]; const [rb, rc] = sec && sec.dataset.ref ? sec.dataset.ref.split('.').map(Number) : [state.ref.b, state.ref.c];
  const k = vkey(rb, rc, t.v);
  let list = (hl[k] || []).filter(m => m.e <= t.s || m.s >= t.e || (style !== null && m.style !== style && ['ul', 'bold'].includes(m.style) !== ['ul', 'bold'].includes(style)));
  if (style) list.push({ s: t.s, e: t.e, style });
  list.sort((a, b) => a.s - b.s);
  if (list.length) hl[k] = list; else delete hl[k];
  saveUD('highlights');
  window.getSelection().removeAllRanges();
  if (!state.settings.show.highlights && style) setShow('highlights', true); else renderChapter();
}

/* ======================================================================= compare differences */
function words(t) { return (t.match(/\S+/g) || []).map(w => ({ w, k: w.toLowerCase().normalize('NFD').replace(/[^\p{L}\p{N}]/gu, '') })); }
function lcsMarks(a, b) {
  const n = a.length, m = b.length; const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i].k === b[j].k ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ia = new Set(), ib = new Set(); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i].k === b[j].k) { ia.add(i); ib.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  return { ia, ib, common: L[0][0] };
}
function markDifferences() {
  const secs = [...document.querySelectorAll('#view > .bv')].filter(s => s.dataset.linked === '1' && s.dataset.layout !== 'para');
  if (secs.length < 2) return;
  const layout = $('#view').dataset.arrange;
  for (const tr of secs[0].querySelectorAll('tr[data-v]')) {
    const cells = secs.map(s => s.querySelector(`tr[data-v="${tr.dataset.v}"] td[data-col]`)).filter(Boolean);
    if (cells.length < 2) continue;
    const texts = cells.map(el => coreNodes(el).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim());
    const base = words(texts[0]);
    const baseMarks = new Set();
    cells.forEach((el, i) => {
      if (i === 0) return;
      const other = words(texts[i]); const { ia, ib, common } = lcsMarks(base, other);
      if (cells.length === 2) base.forEach((x, k) => { if (!ia.has(k)) baseMarks.add(k); });
      const pct = Math.round(100 * (1 - (2 * common) / Math.max(1, base.length + other.length)));
      rebuild(el, other, ib, layout === 'rows' ? pct : null);
    });
    rebuild(cells[0], base, null, null, baseMarks);
  }
  function rebuild(el, ws, keep, pct, marks) {
    const abbr = el.querySelector('.rabbr');
    const html = ws.map((x, k) => ((keep && !keep.has(k)) || (marks && marks.has(k))) ? `<mark class="dif">${esc(x.w)}</mark>` : esc(x.w)).join(' ');
    el.innerHTML = (abbr ? abbr.outerHTML + ' ' : '') + html + (pct != null ? ` <span class="diffpct" title="share of words that differ from ${esc((state.infos.get(state.settings.openBibles[0]) || {}).abbr || 'the first Bible')}">${pct}%</span>` : '');
    el.title = 'Differences are shown on plain text (Strong\'s numbers and formatting are hidden while “Mark differences” is on)';
  }
}

/* ======================================================================= notes */
function showNotes(p) {
  const notes = study.ud.notes || {}; const { b, c, layout, root } = p;
  for (const k in notes) {
    const r = parseKey(k); if (r.b !== b || r.c !== c) continue;
    const plain = notes[k].html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (layout === 'para') {
      const pv = root.querySelector(`.pv[data-v="${r.v}"]`);
      if (pv) pv.insertAdjacentHTML('beforeend', `<span class="noteicon" data-note="${k}" title="${esc(plain)}">✎</span>`);
      continue;
    }
    const tr = root.querySelector(`tr[data-v="${r.v}"]`); if (!tr) continue;
    tr.querySelector('td.vn').insertAdjacentHTML('beforeend', `<span class="noteicon" data-note="${k}" title="My note: ${esc(plain.slice(0, 200))}">✎</span>`);
    if (state.settings.show.notes) tr.insertAdjacentHTML('afterend', `<tr class="noterow"><td class="vn"></td><td><div class="unote" data-note="${k}" title="Click to edit">${notes[k].html}</div></td></tr>`);
  }
}
async function editNote(k) {
  const r = parseKey(k); const cur = (study.ud.notes[k] || {}).html || '';
  const html = `<div class="row tight noted"><button type="button" data-cmd="bold"><b>B</b></button><button type="button" data-cmd="italic"><i>I</i></button><button type="button" data-cmd="underline"><u>U</u></button><button type="button" data-cmd="insertUnorderedList">• List</button></div><div id="noteEd" class="noteed" contenteditable="true">${cur}</div><p class="small">Saved in Timotheos's study data. Bible references you type (e.g. Rom 5:8) become links.</p>`;
  const p = TimotheosModules.modal(`My note on ${refName(r)}`, html, [cur ? { label: 'Delete note', value: 'del' } : null, { label: 'Cancel', value: null }, { label: 'Save', value: 'save', primary: true }].filter(Boolean));
  setTimeout(() => {
    document.querySelectorAll('.noted button').forEach(bt => { bt.onmousedown = e => { e.preventDefault(); document.execCommand(bt.dataset.cmd); }; });
    const ed = $('#noteEd'); if (ed) { ed.focus(); const s = window.getSelection(); s.selectAllChildren(ed); s.collapseToEnd(); }
  }, 40);
  const res = await p;
  if (res === 'del') delete study.ud.notes[k];
  else if (res === 'save') {
    const ed = $('#noteEd'); const clean = sanitizeNote(ed ? ed.innerHTML : '');
    if (clean.replace(/<[^>]*>|&nbsp;|\s/g, '')) study.ud.notes[k] = { html: clean, t: Date.now() }; else delete study.ud.notes[k];
  } else return;
  saveUD('notes', true); renderChapter(); if (study.seg === 'notes') renderStudy();
}
function sanitizeNote(h) {
  const t = document.createElement('template'); t.innerHTML = h;
  t.content.querySelectorAll('*').forEach(n => { if (!/^(B|I|U|EM|STRONG|BR|DIV|P|UL|OL|LI|SPAN|A)$/.test(n.tagName)) n.replaceWith(...n.childNodes); else for (const a of [...n.attributes]) if (!(n.tagName === 'A' && a.name === 'data-href') && a.name !== 'class') n.removeAttribute(a.name); });
  const w = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT); const texts = []; let n; while ((n = w.nextNode())) if (!n.parentElement || !n.parentElement.closest('a')) texts.push(n);
  const RE = /\b((?:[1-4]\s?)?[A-Z][a-z]{1,12}\.?)\s(\d{1,3}):(\d{1,3})(?:[-–](\d{1,3}))?/g;
  for (const tn of texts) {
    if (!RE.test(tn.textContent)) continue; RE.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = esc(tn.textContent).replace(RE, (m, bk, c, v, v2) => { const id = bookIdOf(bk); return id ? `<a class="link" data-href="tw://bible.*?id=${id}.${c}.${v}${v2 ? '-' + id + '.' + c + '.' + v2 : ''}">${m}</a>` : m; });
    tn.replaceWith(...span.childNodes);
  }
  return t.innerHTML;
}
function bookIdOf(name) {
  const n = name.replace(/\.$/, '').toLowerCase().replace(/\s/g, '');
  for (const bk of state.nav) if (bk.name.toLowerCase().replace(/\s/g, '') === n || (bk.abbrs || [bk.abbr]).some(a => a.toLowerCase().replace(/\s/g, '') === n)) return bk.id;
  for (const id in (window.BOOK_ABBR || {})) if (window.BOOK_ABBR[id].toLowerCase() === n) return +id;
  return null;
}

/* ======================================================================= bookmarks */
const slot = d => (d === 0 ? 9 : d - 1);
function setBookmark(d) { study.ud.bookmarks[slot(d)] = { ...state.ref }; saveUD('bookmarks', true); flash(`Bookmark ${d}: ${refName(state.ref)}`); if (study.seg === 'marks') renderStudy(); if (window.TimotheosNav) TimotheosNav.syncAll(); }
function gotoBookmark(d) { const r = study.ud.bookmarks[slot(d)]; if (r) go(r); else flash(`Bookmark ${d} is empty – set it with Ctrl+Shift+${d}`); }

/* ======================================================================= verse lists */
function curList() { const ud = study.ud; if (!ud.lists[ud.currentList]) { ud.currentList = Object.keys(ud.lists)[0] || 'My verses'; ud.lists[ud.currentList] = ud.lists[ud.currentList] || []; } return ud.lists[ud.currentList]; }
function addToList(refs) {
  const list = curList(); let n = 0;
  for (const r of refs) if (!list.some(x => x.b === r.b && x.c === r.c && x.v === r.v && (x.v2 || x.v) === (r.v2 || r.v))) { list.push({ b: r.b, c: r.c, v: r.v, v2: r.v2 && r.v2 > r.v ? r.v2 : undefined }); n++; }
  saveUD('lists', true); flash(`${n} verse${n === 1 ? '' : 's'} added to “${study.ud.currentList}”`);
  if (study.seg === 'lists' && !$('#tab-study').classList.contains('hidden')) renderStudy();
}

async function verseText(id, b, c, v1, v2 = v1) {
  const key = `${id}|${b}.${c}`;
  if (!study.textCache.has(key)) {
    study.textCache.set(key, api.chapter([id], b, c).then(d => {
      const inf = state.infos.get(id) || EMPTY_MOD; const show = { strongs: false, morph: false, footnotes: false, headings: false, woj: true, added: true };
      const m = new Map();
      for (const r of d.rows) if (r.cells[0] != null) { const h = TWRender.render(r.cells[0], inf, show, { fn: { n: 0 }, b }); m.set(r.v, { html: h.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ''), text: h.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, '').replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() }); }
      return m;
    }));
    if (study.textCache.size > 300) study.textCache.delete(study.textCache.keys().next().value);
  }
  const m = await study.textCache.get(key); const out = [];
  for (let v = v1; v <= v2; v++) if (m.has(v)) out.push({ v, ...m.get(v) });
  return out;
}

async function textAny(r) {
  for (const id of state.settings.openBibles) { const vs = await verseText(id, r.b, r.c, r.v, r.v2 || r.v); if (vs.length) return { id, vs }; }
  return { id: null, vs: [] };
}

/* ======================================================================= Copy Verses dialog */
const COPY_PRESETS = [
  { id: 'para', label: 'Text, then reference', header: '', chapter: '', verse: '%T', sep: ' ', footer: ' (%r %t)' },
  { id: 'num', label: 'Reference heading, numbered verses', header: '%r (%t)%n', chapter: '', verse: '%v %T', sep: '%n', footer: '' },
  { id: 'inline', label: 'Reference before each verse', header: '', chapter: '', verse: '%b %c:%v %T', sep: '%n', footer: '' },
  { id: 'chapters', label: 'Chapter headings, numbered verses', header: '%r (%t)%n', chapter: '%n%b %c%n', verse: '%v %T', sep: ' ', footer: '' },
  { id: 'refs', label: 'Reference only', header: '%r', chapter: '', verse: '', sep: '', footer: '', refsOnly: true },
];
function copyFormat() { return Object.assign({ preset: 'para', shortNames: false, textOnly: false, bible: null, noRefSingle: false }, COPY_PRESETS[0], study.ud.copy || {}); }
function rangeLabel(from, to, short) {
  const nm = b => { const bk = state.nav.find(x => x.id === b) || { name: String(b), abbr: String(b) }; return short ? bk.abbr : bk.name; };
  if (from.b !== to.b) return `${nm(from.b)} ${from.c}:${from.v}–${nm(to.b)} ${to.c}:${to.v}`;
  if (from.c === to.c) return `${nm(from.b)} ${from.c}:${from.v}${to.v > from.v ? '–' + to.v : ''}`;
  return `${nm(from.b)} ${from.c}:${from.v}–${to.c}:${to.v}`;
}

function verseCount(b, c, id) {
  const one = i => { const inf = state.infos.get(i); return inf && inf.books && inf.books[b] ? inf.books[b][c - 1] || 0 : 0; };
  return (id && one(id)) || Math.max(0, ...state.settings.openBibles.map(one));
}
function navIndex(b) { return state.nav.findIndex(x => x.id === b); }
function cmpRef(a, z) { const ia = navIndex(a.b), iz = navIndex(z.b); return ia !== iz ? ia - iz : a.c !== z.c ? a.c - z.c : a.v - z.v; }
function stepRef(r, d, id) {
  let i = navIndex(r.b); if (i < 0) return null;
  let bk = state.nav[i]; let { c, v } = r;
  if (d > 0) {
    if (v < verseCount(bk.id, c, id)) return { b: bk.id, c, v: v + 1 };
    let k = bk.chapterList.indexOf(c) + 1;
    if (k >= bk.chapterList.length) { bk = state.nav[i + 1]; if (!bk) return null; k = 0; }
    return { b: bk.id, c: bk.chapterList[k], v: 1 };
  }
  if (v > 1) return { b: bk.id, c, v: v - 1 };
  let k = bk.chapterList.indexOf(c) - 1;
  if (k < 0) { bk = state.nav[i - 1]; if (!bk) return null; k = bk.chapterList.length - 1; }
  const pc = bk.chapterList[k];
  return { b: bk.id, c: pc, v: Math.max(1, verseCount(bk.id, pc, id)) };
}
function chaptersBetween(from, to) {
  const out = []; const i0 = navIndex(from.b), i1 = navIndex(to.b);
  for (let i = i0; i <= i1 && i >= 0; i++) {
    const bk = state.nav[i];
    for (const c of bk.chapterList) {
      if (i === i0 && c < from.c) continue;
      if (i === i1 && c > to.c) break;
      out.push({ b: bk.id, c, v1: i === i0 && c === from.c ? from.v : 1, v2: i === i1 && c === to.c ? to.v : 999 });
    }
  }
  return out;
}
function countVerses(from, to, id) {
  let n = 0;
  for (const ch of chaptersBetween(from, to)) n += Math.max(0, Math.min(ch.v2, verseCount(ch.b, ch.c, id) || ch.v2) - ch.v1 + 1);
  return n;
}

async function buildCopy(from, to, fmt, limit) {
  let id = fmt.bible && state.settings.openBibles.includes(fmt.bible) ? fmt.bible : state.settings.openBibles[0];
  if (!(await verseText(id, from.b, from.c, from.v)).length) { const alt = await textAny(from); if (alt.id) id = alt.id; }
  const inf = state.infos.get(id) || { abbr: '' };
  const bname = b => { const bk = state.nav.find(x => x.id === b) || { name: '', abbr: '' }; return fmt.shortNames ? bk.abbr : bk.name; };
  const r = rangeLabel(from, to, fmt.shortNames);
  const single = from.b === to.b && from.c === to.c && from.v === to.v;
  const fill = (tpl, o) => tpl.replace(/%([rtbcvnT])/g, (m, k) => ({ r, t: inf.abbr, b: o.b ? bname(o.b) : bname(from.b), c: o.c, v: o.v, n: '\n', T: o.T })[k] ?? m);
  if (fmt.refsOnly) return { text: r, html: esc(r), count: 1, shown: 1 };
  let text = '', html = '';
  const header = (single && fmt.noRefSingle) ? '' : fill(fmt.header || '', {});
  text += header; html += esc(header).replace(/\n/g, '<br>');
  const chs = chaptersBetween(from, to);
  let first = true, count = 0, shown = 0;
  for (const ch of chs) {
    const vs = await verseText(id, ch.b, ch.c, ch.v1, ch.v2);
    if (fmt.chapter && chs.length > 1) { const t = fill(fmt.chapter, { b: ch.b, c: ch.c }); text += t; if (!limit || shown < limit) html += `<b>${esc(t).replace(/\n/g, '<br>')}</b>`; }
    for (const x of vs) {
      const sep = first ? '' : fill(fmt.sep || '', { b: ch.b }); first = false;
      text += sep + fill(fmt.verse, { b: ch.b, c: ch.c, v: x.v, T: x.text });
      count++;
      if (limit && shown >= limit) continue;
      shown++;
      const hl = fill(fmt.verse.replace('%T', '\u0001'), { b: ch.b, c: ch.c, v: x.v, T: '' }).split('\u0001');
      html += esc(sep).replace(/\n/g, '<br>') + `<span>${hl[0] ? '<b>' + esc(hl[0]) + '</b>' : ''}${x.html}${esc(hl[1] || '')}</span>`;
    }
  }
  const footer = (single && fmt.noRefSingle) ? '' : fill(fmt.footer || '', {});
  text += footer; html += esc(footer).replace(/\n/g, '<br>');
  return { text, html: `<div style="font-family:Georgia,serif">${html}</div>`, count, shown };
}
async function quickCopy(target) {
  const from = target || { ...state.ref }; const to = target ? { ...target, v: target.v2 || target.v } : { ...state.ref };
  const fmt = copyFormat(); const out = await buildCopy(from, to, fmt);
  await api.copyText(out.text, fmt.textOnly ? null : out.html);
  flash('Copied ' + rangeLabel(from, to, true));
}
function selectedVerses() {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount || !String(sel).trim()) return null;
  const r = sel.getRangeAt(0); const vs = [...$('#view').querySelectorAll('[data-v]')].filter(el => r.intersectsNode(el)).map(el => +el.dataset.v);
  if (!vs.length) return null;
  return { v1: Math.min(...vs), v2: Math.max(...vs) };
}
async function copyDialog(range) {
  const sv = range && range.v ? { v1: range.v, v2: range.v2 || range.v } : (range || selectedVerses());
  let from = { b: state.ref.b, c: state.ref.c, v: sv ? sv.v1 : state.ref.v };
  let to = { b: state.ref.b, c: state.ref.c, v: sv ? sv.v2 : state.ref.v };
  if (range && range.b) { from.b = to.b = range.b; from.c = to.c = range.c; }
  const fmt = copyFormat();
  const bibles = state.settings.openBibles.map(id => { const inf = state.infos.get(id) || {}; return `<option value="${esc(id)}">${esc(inf.abbr || id)}${inf.title ? ' – ' + esc(inf.title) : ''}</option>`; }).join('');
  const ic = (n, sz = 15) => TimotheosIcons.icon(n, sz);
  const html = `<div class="cvm" id="cvm">
    <div class="cvmleft">
      <section class="cvstep"><h5>Step 1: select the range of verses you want to copy <span class="grow"></span><span id="cpCount" class="cpcount"></span><button id="cpOne" class="cpx" title="Back to one verse">${ic('close', 13)}</button></h5>
        <div class="cprange">
          <button id="cpFromBtn" class="rbtn" data-end="from" title="Choose the first verse. Mouse wheel or Page Up/Page Down: one verse earlier/later"><span class="rl">From:</span><b id="cpFromLbl"></b>${ic('next', 13)}</button>
          <button id="cpToBtn" class="rbtn" data-end="to" title="Choose the last verse. Mouse wheel or Page Up/Page Down: one verse fewer/more"><span class="rl">To:</span><b id="cpToLbl"></b>${ic('next', 13)}</button>
        </div>
        <p class="small cphint">(use the mouse wheel over the buttons or the Page Up / Page Down keys to add or take away verses quickly; Shift: a chapter at a time)</p>
      </section>
      <section class="cvstep"><h5>Step 2: choose the Bible and how the verses look</h5>
        <div class="grid2"><label>Bible <select id="cpBible">${bibles}</select></label>
        <label>Format <select id="cpPreset">${COPY_PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}<option value="custom">Custom…</option></select></label></div>
        <div class="col cpopts"><label><input type="checkbox" id="cpShort"> Short book names</label><label><input type="checkbox" id="cpText"> Plain text only (no formatting)</label><label><input type="checkbox" id="cpNoRef"> No header/footer for a single verse</label></div>
        <details id="cpCustom"><summary>Templates</summary><div class="grid2">
          <label>Header <input id="cpHeader"></label><label>Footer <input id="cpFooter"></label>
          <label>Each verse <input id="cpVerse"></label><label>Between verses <input id="cpSep"></label>
          <label>Before each chapter <input id="cpChapter"></label><span class="small">%r range · %t Bible · %b book · %c chapter · %v verse · %T verse text · %n new line</span></div></details>
      </section>
    </div>
    <div class="cvmright"><div class="cphead">Preview <span id="cpPrevNote" class="small"></span></div><div id="cpPreview" class="cpprev"></div></div>
    <div id="vpick" class="vpick hidden"></div>
  </div>`;
  const p = TimotheosModules.modal('Copy verses', html, [{ label: 'Close', value: null }, { label: 'Copy', value: 'copy' }, { label: 'Copy and close', value: 'copyclose', primary: true }], true);
  const box = document.querySelector('#modal .box'); box.classList.add('cvmbox');
  const sz = study.ud.copySize; if (sz && sz.w) { box.style.width = sz.w + 'px'; box.style.height = sz.h + 'px'; }
  const f = { ...fmt };
  const bibleId = () => $('#cpBible').value;
  const ui = () => {
    $('#cpBible').value = f.bible && state.settings.openBibles.includes(f.bible) ? f.bible : state.settings.openBibles[0];
    $('#cpPreset').value = COPY_PRESETS.some(x => x.id === f.preset) ? f.preset : 'custom';
    for (const [id, k] of [['cpHeader', 'header'], ['cpFooter', 'footer'], ['cpVerse', 'verse'], ['cpSep', 'sep'], ['cpChapter', 'chapter']]) $('#' + id).value = (f[k] || '').replace(/\n/g, '%n');
    $('#cpShort').checked = !!f.shortNames; $('#cpText').checked = !!f.textOnly; $('#cpNoRef').checked = !!f.noRefSingle;
  };
  const label = r => refName(r);
  let seq = 0;
  const refresh = async () => {
    for (const [id, k] of [['cpHeader', 'header'], ['cpFooter', 'footer'], ['cpVerse', 'verse'], ['cpSep', 'sep'], ['cpChapter', 'chapter']]) f[k] = $('#' + id).value;
    f.bible = bibleId(); f.shortNames = $('#cpShort').checked; f.textOnly = $('#cpText').checked; f.noRefSingle = $('#cpNoRef').checked;
    $('#cpFromLbl').textContent = label(from); $('#cpToLbl').textContent = label(to);
    const n = countVerses(from, to, bibleId());
    $('#cpCount').textContent = `(${n} verse${n === 1 ? '' : 's'})`;
    const my = ++seq;
    const out = await buildCopy(from, to, f, 300);
    if (my !== seq) return;
    $('#cpPreview').innerHTML = f.textOnly ? esc(out.text.length > 60000 ? out.text.slice(0, 60000) + '…' : out.text).replace(/\n/g, '<br>') : out.html;
    $('#cpPrevNote').textContent = out.count > out.shown && !f.textOnly ? `– first ${out.shown} of ${out.count} verses shown; all are copied` : '';
  };
  const chapStep = (r, d, end) => {
    const id = bibleId(); const n = verseCount(r.b, r.c, id) || r.v;
    if (end === 'to') {
      if (d > 0) { if (r.v < n) return { ...r, v: n }; const nx = stepRef(r, 1, id); return nx && { ...nx, v: verseCount(nx.b, nx.c, id) || 1 }; }
      return stepRef({ ...r, v: 1 }, -1, id);
    }
    if (d < 0) { if (r.v > 1) return { ...r, v: 1 }; const pv = stepRef(r, -1, id); return pv && { ...pv, v: 1 }; }
    return stepRef({ ...r, v: n }, 1, id);
  };
  const nudge = (end, d, chapter) => {
    const cur = end === 'from' ? from : to;
    const r = chapter ? chapStep(cur, d, end) : stepRef(cur, d, bibleId());
    if (!r) return;
    if (end === 'from') { from = r; if (cmpRef(from, to) > 0) to = { ...from }; }
    else { to = r; if (cmpRef(to, from) < 0) from = { ...to }; }
    refresh();
  };
  let lastEnd = 'to';
  setTimeout(() => {
    ui(); refresh();
    $('#cpPreset').onchange = () => { const pr = COPY_PRESETS.find(x => x.id === $('#cpPreset').value); if (pr) { Object.assign(f, pr, { preset: pr.id }); ui(); } else { f.preset = 'custom'; f.refsOnly = false; $('#cpCustom').open = true; } refresh(); };
    for (const id of ['cpHeader', 'cpFooter', 'cpVerse', 'cpSep', 'cpChapter']) $('#' + id).oninput = () => { f.preset = 'custom'; f.refsOnly = false; $('#cpPreset').value = 'custom'; refresh(); };
    for (const id of ['cpBible', 'cpShort', 'cpText', 'cpNoRef']) $('#' + id).onchange = refresh;
    $('#cpOne').onclick = () => { to = { ...from }; refresh(); };
    for (const btn of [$('#cpFromBtn'), $('#cpToBtn')]) {
      const end = btn.dataset.end;
      btn.onclick = () => { lastEnd = end; openPicker(end, btn); };
      btn.onfocus = () => { lastEnd = end; };
      btn.addEventListener('wheel', e => { e.preventDefault(); lastEnd = end; nudge(end, e.deltaY > 0 ? 1 : -1, e.shiftKey); }, { passive: false });
    }
    $('#cvm').addEventListener('keydown', e => {
      if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
      if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) || !$('#vpick').classList.contains('hidden')) return;
      e.preventDefault(); const rb = e.target.closest && e.target.closest('.rbtn'); if (rb) lastEnd = rb.dataset.end; nudge(lastEnd, e.key === 'PageDown' ? 1 : -1, e.shiftKey);
    });
    new ResizeObserver(() => { if (box.isConnected && box.classList.contains('cvmbox') && !$('#modal').classList.contains('hidden')) study.copySizeNow = { w: box.offsetWidth, h: box.offsetHeight }; }).observe(box);
    document.querySelectorAll('#modalBtns button').forEach(bt => { if (bt.textContent === 'Copy') bt.onclick = async () => { await refresh(); const out = await buildCopy(from, to, f); await api.copyText(out.text, f.textOnly ? null : out.html); flash(`Copied ${out.count} verse${out.count === 1 ? '' : 's'}`); }; });
    $('#cpToBtn').focus();
  }, 30);

  function openPicker(end, btn) {
    const pk = $('#vpick'); const cur = end === 'from' ? from : to;
    let selB = cur.b, selC = cur.c;
    const grpName = g => ({ OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' }[g] || g);
    const draw = () => {
      const bk = state.nav.find(x => x.id === selB) || state.nav[0];
      let books = '', g = null;
      for (const x of state.nav) { if (x.grp !== g) { g = x.grp; books += `<li class="pg">${esc(grpName(g))}</li>`; } books += `<li data-b="${x.id}" class="${x.id === selB ? 'on' : ''}">${esc(x.name)}</li>`; }
      const chs = bk.chapterList.map(c => `<button data-c="${c}" class="${c === selC ? 'on' : ''}">${c}</button>`).join('');
      const n = verseCount(bk.id, selC, bibleId());
      const vs = Array.from({ length: n }, (_, i) => i + 1).map(v => `<button data-v="${v}" class="${selB === cur.b && selC === cur.c && v === cur.v ? 'on' : ''}">${v}</button>`).join('') || '<span class="small">No verses in the open Bibles.</span>';
      const old = pk.querySelector('.vpbooks'); const st = old ? old.scrollTop : 0;
      pk.innerHTML = `<div class="vph"><b>${end === 'from' ? 'From' : 'To'}:</b> ${esc(bk.name)} ${selC}<span class="grow"></span><input id="vpFind" type="search" placeholder="Find a book…" spellcheck="false"><button class="cpx" id="vpClose" title="Close">${ic('close', 13)}</button></div>
        <div class="vpcols"><div class="vpc"><div class="vpt">Book</div><ul class="vpbooks">${books}</ul></div>
        <div class="vpc"><div class="vpt">Chapter</div><div class="vpgrid">${chs}</div></div>
        <div class="vpc"><div class="vpt">Verse</div><div class="vpgrid">${vs}</div></div></div>`;
      pk.querySelector('.vpbooks').scrollTop = st;
      pk.querySelectorAll('.vpbooks li[data-b]').forEach(li => li.onclick = () => { selB = +li.dataset.b; const b2 = state.nav.find(x => x.id === selB); selC = b2.chapterList[0]; draw(); });
      pk.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { selC = +b.dataset.c; draw(); });
      pk.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        const r = { b: selB, c: selC, v: +b.dataset.v };
        if (end === 'from') { from = r; if (cmpRef(from, to) > 0) to = { ...from }; } else { to = r; if (cmpRef(to, from) < 0) from = { ...to }; }
        close(); refresh();
      });
      $('#vpClose').onclick = close;
      const fi = $('#vpFind');
      fi.oninput = () => { const q = fi.value.trim().toLowerCase(); pk.querySelectorAll('.vpbooks li[data-b]').forEach(li => li.classList.toggle('hidden', !!q && !li.textContent.toLowerCase().includes(q) && !String((state.nav.find(x => x.id === +li.dataset.b) || {}).abbr || '').toLowerCase().startsWith(q))); };
      fi.onkeydown = e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); const li = pk.querySelector('.vpbooks li[data-b]:not(.hidden)'); if (li) li.click(); } };
    };
    const close = () => { pk.classList.add('hidden'); document.removeEventListener('mousedown', outside, true); btn.focus(); };
    const outside = e => { if (!pk.contains(e.target) && e.target !== btn && !btn.contains(e.target)) close(); };
    pk.onkeydown = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    draw();
    const bb = btn.getBoundingClientRect(), cb = $('#cvm').getBoundingClientRect();
    pk.style.left = Math.max(0, Math.min(bb.left - cb.left, cb.width - 560)) + 'px'; pk.style.top = (bb.bottom - cb.top + 4) + 'px';
    pk.classList.remove('hidden');
    { const on = pk.querySelector('.vpbooks li.on'); if (on) on.scrollIntoView({ block: 'center' }); }
    document.addEventListener('mousedown', outside, true);
    setTimeout(() => { const fi = $('#vpFind'); if (fi) fi.focus(); }, 20);
  }

  const res = await p;
  box.classList.remove('cvmbox'); box.style.width = ''; box.style.height = '';
  for (const k of ['header', 'footer', 'verse', 'sep', 'chapter']) f[k] = (f[k] || '').replace(/%n/g, '\n');
  study.ud.copy = { preset: f.preset, header: f.header, footer: f.footer, verse: f.verse, sep: f.sep, chapter: f.chapter, shortNames: f.shortNames, textOnly: f.textOnly, noRefSingle: f.noRefSingle, bible: f.bible, refsOnly: !!f.refsOnly };
  saveUD('copy', true);
  if (study.copySizeNow) { study.ud.copySize = study.copySizeNow; saveUD('copySize', true); }
  if (res === 'copyclose') { const out = await buildCopy(from, to, study.ud.copy); await api.copyText(out.text, f.textOnly ? null : out.html); flash(`Copied ${rangeLabel(from, to, true)}`); }
}

/* ======================================================================= context menu */
function hideCtx() { $('#ctxMenu').classList.add('hidden'); }
function wireContextMenu() {
  $('#view').addEventListener('contextmenu', e => {
    const vEl = e.target.closest('[data-v]'); if (!vEl) return;
    e.preventDefault();
    const v = +vEl.dataset.v;
    const cellEl = e.target.closest('[data-col]') || vEl.querySelector('[data-col]') || (vEl.matches('[data-col]') ? vEl : null);
    const col = cellEl ? +cellEl.dataset.col : 0;
    const sv = selectedVerses();
    const tgt = selectionTarget(cellEl);
    const word = (TimotheosModules.wordAt(e) || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const strongEl = e.target.closest('[data-strong]');
    const strongs = strongEl ? strongEl.dataset.strong.split(/\s+/).filter(Boolean) : [];
    const ref = { b: state.ref.b, c: state.ref.c, v };
    const rangeRef = sv && sv.v2 > sv.v1 ? { ...ref, v: sv.v1, v2: sv.v2 } : ref;
    const label = rangeRef.v2 ? `${refName(ref).replace(/:\d+$/, '')}:${rangeRef.v}–${rangeRef.v2}` : refName(ref);
    const id = state.settings.openBibles[col]; const abbr = (state.infos.get(id) || {}).abbr || '';
    const nk = vkey(ref.b, ref.c, v);
    const sc = window.TimotheosOptions && TimotheosOptions.shortcuts ? TimotheosOptions.shortcuts() : {};
    const items = [
      `<div class="mh">${esc(label)} <span class="small">${esc(abbr)}</span></div>`,
      `<button data-a="copy">Copy ${rangeRef.v2 ? 'verses' : 'verse'} <kbd>Ctrl+C</kbd></button>`,
      `<button data-a="copydlg">Copy verses… <kbd>${esc(sc.copyVerses || 'F5')}</kbd></button>`,
      `<button data-a="list">Add to verse list “${esc(study.ud.currentList)}” <kbd>${esc(sc.addVerseList || 'Ctrl+L')}</kbd></button>`,
      `<div class="mrow"><span>Bookmark</span>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => `<button data-a="bm" data-d="${d}" title="${study.ud.bookmarks[slot(d)] ? 'replaces ' + esc(refName(study.ud.bookmarks[slot(d)])) : 'empty'}">${d}</button>`).join('')}</div>`,
      `<div class="mrow"><span>${tgt && tgt.partial ? 'Highlight selection' : 'Highlight verse'}</span>${HL_STYLES.map(([s, n]) => `<button data-a="hl" data-s="${s}" class="sw hl-${s}" title="${n}">${s === 'ul' ? 'U' : s === 'bold' ? 'B' : ''}</button>`).join('')}<button data-a="hl" data-s="" title="Remove highlighting">✕</button></div>`,
      `<button data-a="note">${study.ud.notes[nk] ? 'Edit my note…' : 'Add a note…'}</button>`,
      `<button data-a="xr">Cross-references</button>`,
      `<button data-a="addxr">Add a cross-reference…</button>`,
      `<button data-a="cmt">Commentaries on this verse</button>`,
      word ? `<button data-a="find" data-q="${esc(word)}">Find “${esc(word)}”</button>` : '',
      ...strongs.map(s => `<button data-a="find" data-q="${esc(s)}">Find ${esc(s)}</button>`),
      word ? `<button data-a="look" data-q="${esc(word)}">Look up “${esc(word)}”</button>` : '',
    ];
    const m = $('#ctxMenu'); m.innerHTML = items.join(''); m.classList.remove('hidden');
    const W = window.innerWidth, H = window.innerHeight; const mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(e.clientX, W - mw - 8) + 'px'; m.style.top = Math.min(e.clientY, H - mh - 8) + 'px';
    m.onclick = async ev => {
      const bt = ev.target.closest('button'); if (!bt) return;
      hideCtx();
      const a = bt.dataset.a;
      if (a !== 'hl') selectVerse(v, false);
      if (a === 'copy') quickCopy(rangeRef);
      else if (a === 'copydlg') copyDialog(sv);
      else if (a === 'list') addToList([rangeRef]);
      else if (a === 'bm') { study.ud.bookmarks[slot(+bt.dataset.d)] = { ...ref }; saveUD('bookmarks', true); flash(`Bookmark ${bt.dataset.d}: ${refName(ref)}`); }
      else if (a === 'hl') { if (tgt) highlight(tgt, bt.dataset.s || null); }
      else if (a === 'note') editNote(nk);
      else if (a === 'xr') TimotheosModules.showAllXrefs(v);
      else if (a === 'addxr') TimotheosModules.addXref(v);
      else if (a === 'cmt') openTab('cmt');
      else if (a === 'find') window.TimotheosSearch.find(bt.dataset.q);
      else if (a === 'look') TimotheosModules.lookupWord(bt.dataset.q);
    };
  });
  $('#view').addEventListener('click', e => { const n = e.target.closest('.unote, .noteicon'); if (n) { e.stopPropagation(); editNote(n.dataset.note); } }, true);
}

/* ======================================================================= Bible tree (sidebar) */
function renderTree() {
  if (window.TimotheosNav) return TimotheosNav.renderEnhancedTree(false);
  const sig = state.nav.map(b => b.id + ':' + b.chapterList.length).join(',');
  const box = $('#bibleTree');
  if (sig !== study.treeSig) {
    study.treeSig = sig;
    let html = ''; let grp = null;
    for (const bk of state.nav) {
      if (bk.grp !== grp) { grp = bk.grp; html += `<div class="tgrp">${esc({ OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' }[grp] || grp)}</div>`; }
      html += `<details data-b="${bk.id}"><summary>${esc(bk.name)}</summary><div class="chgrid">${bk.chapterList.map(c => `<button data-b="${bk.id}" data-c="${c}">${c}</button>`).join('')}</div></details>`;
    }
    box.innerHTML = html;
    box.onclick = e => { const bt = e.target.closest('button[data-c]'); if (bt) go({ b: +bt.dataset.b, c: +bt.dataset.c, v: 1 }); };
  }
  box.querySelectorAll('button.cur').forEach(x => x.classList.remove('cur'));
  const cur = box.querySelector(`button[data-b="${state.ref.b}"][data-c="${state.ref.c}"]`); if (cur) cur.classList.add('cur');
  const d = box.querySelector(`details[data-b="${state.ref.b}"]`); if (d && !d.open && !$('#pane-tree').classList.contains('hidden')) { box.querySelectorAll('details[open]').forEach(x => { x.open = false; }); d.open = true; }
}

/* ======================================================================= My Study tab */
function wireStudyTab() {
  $('#studySeg').onclick = e => { const b = e.target.closest('button[data-s]'); if (b) { study.seg = b.dataset.s; renderStudy(); } };
}
function onOpen() { renderStudy(); }
function openStudy(seg) { study.seg = seg; openTab('study'); }
async function renderStudy() {
  document.querySelectorAll('#studySeg button').forEach(b => b.classList.toggle('active', b.dataset.s === study.seg));
  const body = $('#studyBody');
  if (study.seg === 'lists') return renderLists(body);
  if (study.seg === 'notes') return renderNotesList(body);
  if (study.seg === 'marks') return renderMarks(body);
  if (study.seg === 'plans') return renderPlans(body);
}

async function renderLists(body) {
  const ud = study.ud; const list = curList(); const first = state.settings.openBibles[0];
  body.innerHTML = `<div class="row tight"><select id="vlSel">${Object.keys(ud.lists).map(n => `<option${n === ud.currentList ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><button id="vlNew" title="New list">New</button><button id="vlRen" title="Rename">Rename</button><button id="vlDel" title="Delete this list">Delete</button></div>
    <div class="row tight"><button id="vlAdd" class="primary">+ Current verse</button><button id="vlSort" title="Sort in Bible order">Sort</button><button id="vlCopyRefs">Copy references</button><button id="vlCopy">Copy with text</button><button id="vlExportTwm" title="Export as a theWord verse list (.vsls.twm)">Export .vsls.twm</button></div>
    <ol class="vlist">${list.map((r, i) => `<li data-i="${i}"><div class="vlh"><a class="vlref">${esc(refName(r))}${r.v2 ? '–' + r.v2 : ''}</a><span class="grow"></span><button data-m="-1" title="Move up">↑</button><button data-m="1" title="Move down">↓</button><button data-x title="Remove">×</button></div><div class="vlt small" data-t="${i}"></div></li>`).join('') || '<li class="hint">This list is empty. Add verses with <b>Ctrl+L</b>, the right-click menu, or from search results.</li>'}</ol>`;
  $('#vlSel').onchange = () => { ud.currentList = $('#vlSel').value; saveUD('currentList', true); renderStudy(); };
  $('#vlNew').onclick = async () => { const n = await ask('New verse list', 'Name'); if (n && !ud.lists[n]) { ud.lists[n] = []; ud.currentList = n; saveUD('lists', true); saveUD('currentList', true); renderStudy(); } };
  $('#vlRen').onclick = async () => { const n = await ask('Rename list', 'New name', ud.currentList); if (n && !ud.lists[n]) { ud.lists[n] = ud.lists[ud.currentList]; delete ud.lists[ud.currentList]; ud.currentList = n; saveUD('lists', true); saveUD('currentList', true); renderStudy(); } };
  $('#vlDel').onclick = async () => { if (await TimotheosModules.confirmBox('Delete list', `Delete the verse list <b>${esc(ud.currentList)}</b>?`)) { delete ud.lists[ud.currentList]; if (!Object.keys(ud.lists).length) ud.lists['My verses'] = []; ud.currentList = Object.keys(ud.lists)[0]; saveUD('lists', true); saveUD('currentList', true); renderStudy(); } };
  $('#vlAdd').onclick = () => addToList([{ ...state.ref }]);
  $('#vlSort').onclick = () => { list.sort((a, b) => orderOf(a.b) - orderOf(b.b) || a.c - b.c || a.v - b.v); saveUD('lists', true); renderStudy(); };
  $('#vlCopyRefs').onclick = async () => { await api.copyText(list.map(r => refName(r) + (r.v2 ? '–' + r.v2 : '')).join('; ')); flash('References copied'); };
  $('#vlCopy').onclick = async () => { const parts = []; for (const r of list) { const { vs } = await textAny(r); parts.push(`${refName(r)}${r.v2 ? '–' + r.v2 : ''} ${vs.map(x => x.text).join(' ')}`); } await api.copyText(parts.join('\n')); flash('List copied'); };
  $('#vlExportTwm').onclick = async () => {
    const p = await api.exportVsls(ud.currentList, { [ud.currentList]: list });
    if (p) flash(`Exported to ${p.split(/[\\/]/).pop()}`);
  };
  body.querySelector('.vlist').onclick = e => {
    const li = e.target.closest('li[data-i]'); if (!li) return; const i = +li.dataset.i;
    if (e.target.closest('[data-x]')) { list.splice(i, 1); saveUD('lists', true); return renderStudy(); }
    const mv = e.target.closest('[data-m]'); if (mv) { const j = i + +mv.dataset.m; if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; saveUD('lists', true); renderStudy(); } return; }
    if (e.target.closest('.vlref, .vlt')) go(list[i]);
  };
  if (first) for (const [i, r] of list.entries()) textAny(r).then(({ id, vs }) => { const el = body.querySelector(`[data-t="${i}"]`); if (el) el.textContent = vs.length ? vs.map(x => x.text).join(' ').slice(0, 260) + (id !== first ? ` (${(state.infos.get(id) || {}).abbr || ''})` : '') : '(not in the open Bibles)'; });
}
function ask(title, label, value = '') {
  const p = TimotheosModules.modal(title, `<label class="field">${esc(label)}<input id="askInput" value="${esc(value)}"></label>`, [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }]);
  return p.then(r => (r === 'ok' ? ($('#askInput').value || '').trim() : null));
}

function renderNotesList(body) {
  const notes = Object.entries(study.ud.notes || {}).map(([k, n]) => ({ k, r: parseKey(k), n })).sort((a, b) => orderOf(a.r.b) - orderOf(b.r.b) || a.r.c - b.r.c || a.r.v - b.r.v);
  body.innerHTML = `<p class="small">Your notes on verses. Add one from the right-click menu on a verse. With <b>View → My notes under verses</b> (key N) they show in the Bible text.</p>
    ${notes.length ? `<div class="row tight" style="margin-bottom:6px"><button id="exportNotesCmtBtn" class="primary" title="Save all your personal verse notes as a standard theWord commentary module (.cmt.twm)">Export notes as .cmt.twm…</button></div>` : ''}
    <ul class="nlist">${notes.map(x => `<li><div class="vlh"><a data-go="${x.k}">${esc(refName(x.r))}</a><span class="grow"></span><button data-ed="${x.k}">Edit</button></div><div class="lookup">${x.n.html}</div></li>`).join('') || '<li class="hint">No notes yet.</li>'}</ul>`;
  const exBtn = $('#exportNotesCmtBtn');
  if (exBtn) {
    exBtn.onclick = async () => {
      const res = await TimotheosModules.modal('Export notes as theWord commentary (.cmt.twm)', `<div class="grid2"><label>Title <input id="enTitle" value="My Timotheos Verse Notes"></label><label>Abbreviation <input id="enAbbr" value="MyNotes"></label></div><p class="small">Creates a standard <code>.cmt.twm</code> commentary module in your Timotheos library so it appears in the Commentary panel and can also be opened in theWord.</p>`, [{ label: 'Cancel', value: null }, { label: 'Save to file…', value: 'file' }, { label: 'Add to library', value: 'lib', primary: true }]);
      if (!res) return;
      const out = await api.userModExportNotes({ title: $('#enTitle').value.trim(), abbr: $('#enAbbr').value.trim(), saveDialog: res === 'file' });
      if (out) {
        await refreshModules(out.list);
        flash(`Exported ${out.count} note${out.count === 1 ? '' : 's'} to ${out.title}`);
      }
    };
  }
  body.onclick = e => { const g = e.target.closest('[data-go]'); if (g) go(parseKey(g.dataset.go)); const ed = e.target.closest('[data-ed]'); if (ed) editNote(ed.dataset.ed); };
}

async function renderMarks(body) {
  const first = state.settings.openBibles[0];
  const rows = [];
  for (let d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    const r = study.ud.bookmarks[slot(d)];
    rows.push(`<li><span class="bmn">${d}</span>${r ? `<a data-go="${d}">${esc(refName(r))}</a> <span class="small" data-bt="${d}"></span>` : '<span class="small">empty</span>'}<span class="grow"></span><button data-set="${d}" title="Set to the current verse">Set</button>${r ? `<button data-clr="${d}" title="Clear">×</button>` : ''}</li>`);
  }
  body.innerHTML = `<p class="small"><kbd>Ctrl+Shift+1…0</kbd> sets a bookmark on the current verse; <kbd>Ctrl+1…0</kbd> jumps to it.</p><ul class="bmlist">${rows.join('')}</ul>`;
  body.onclick = e => {
    const g = e.target.closest('[data-go]'); if (g) return gotoBookmark(+g.dataset.go);
    const s = e.target.closest('[data-set]'); if (s) { setBookmark(+s.dataset.set); return renderStudy(); }
    const c = e.target.closest('[data-clr]'); if (c) { study.ud.bookmarks[slot(+c.dataset.clr)] = null; saveUD('bookmarks', true); renderStudy(); }
  };
  if (first) for (let d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) { const r = study.ud.bookmarks[slot(d)]; if (r) textAny(r).then(({ vs }) => { const el = body.querySelector(`[data-bt="${d}"]`); if (el && vs[0]) el.textContent = vs[0].text.slice(0, 90); }); }
}

/* ======================================================================= reading plans */
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function passLabel(p) { const bk = state.nav.find(x => x.id === p.b); const name = bk ? bk.name : (window.BOOK_ABBR || {})[p.b] || p.b; return `${name} ${p.c1}${p.c2 > p.c1 ? '–' + p.c2 : ''}`; }
async function renderPlans(body) {
  const plans = study.ud.plans || []; const today = todayIso(); const d = new Date();
  const dev = await api.devotionsToday(d.getMonth() + 1, d.getDate()).catch(() => []);
  let html = `<div class="paneHead">Today, ${esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
  const due = [];
  for (const p of plans) {
    const sessions = p.sessions;
    const next = sessions.find(s => !s.done);
    const todays = sessions.filter(s => s.date ? s.date <= today && !s.done : false);
    const show = sessions[0] && sessions[0].date ? todays : (next ? [next] : []);
    for (const s of show) due.push({ p, s });
  }
  html += due.length ? `<ul class="today">${due.map(({ p, s }) => `<li><label><input type="checkbox" data-done="${p.id}|${p.sessions.indexOf(s)}"> <b>${esc(p.name)}</b>${s.date && s.date < today ? ` <span class="late">(${esc(s.date)})</span>` : ''}</label><div>${s.readings.map(r => `<a data-read="${r.b}.${r.c1}">${esc(passLabel(r))}</a>`).join(' · ')}</div></li>`).join('')}</ul>` : '<p class="small">No readings due today.</p>';
  if (dev.length) html += `<div class="paneHead">Devotionals</div><ul class="today">${dev.map(x => `<li><a data-book="${esc(x.id)}" data-tid="${esc(String(x.topics[0].id))}">${esc(x.title)}: ${esc(x.topics[0].subject)}</a></li>`).join('')}</ul>`;
  html += '<div class="paneHead">Your reading plans</div>';
  html += plans.map(p => {
    const done = p.sessions.filter(s => s.done).length; const pct = Math.round(100 * done / Math.max(1, p.sessions.length));
    const last = p.sessions[p.sessions.length - 1];
    return `<div class="plan" data-p="${p.id}"><div class="vlh"><b>${esc(p.name)}</b><span class="grow"></span><span class="small">${done}/${p.sessions.length} · ${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div>
      <div class="small">${last && last.date ? 'Ends ' + esc(last.date) : 'Not tied to dates'}</div>
      <div class="row tight"><button data-act="list">Schedule</button>${p.sessions[0] && p.sessions[0].date ? '<button data-act="catch" title="Move unread readings forward so the next one is today">Catch up</button>' : ''}<button data-act="restart">Restart</button><button data-act="export" title="Export as a theWord reading plan (.rdp.twm)">Export .rdp.twm</button><button data-act="del">Delete</button></div><div class="sched hidden"></div></div>`;
  }).join('') || '<p class="small">No plans yet.</p>';
  html += '<div class="row"><button id="newPlan" class="primary">New reading plan…</button></div>';
  body.innerHTML = html;
  body.onclick = async e => {
    const rd = e.target.closest('[data-read]'); if (rd) { const [b, c] = rd.dataset.read.split('.').map(Number); return go({ b, c, v: 1 }); }
    const bk = e.target.closest('a[data-book]'); if (bk) return;
    if (e.target.id === 'newPlan') return newPlanDialog();
    const pl = e.target.closest('.plan'); const act = e.target.closest('[data-act]');
    if (pl && act) {
      const i = plans.findIndex(x => x.id === pl.dataset.p); const p = plans[i];
      if (act.dataset.act === 'del') { if (await TimotheosModules.confirmBox('Delete plan', `Delete <b>${esc(p.name)}</b> and its progress?`)) { plans.splice(i, 1); saveUD('plans', true); renderStudy(); } return; }
      if (act.dataset.act === 'catch') { plans[i] = await api.planCatchUp(p); saveUD('plans', true); return renderStudy(); }
      if (act.dataset.act === 'restart') { if (await TimotheosModules.confirmBox('Restart plan', 'Mark every reading as unread and start again from today?')) { plans[i] = await api.planRestart(p); saveUD('plans', true); renderStudy(); } return; }
      if (act.dataset.act === 'export') { const fp = await api.exportRdp(p); if (fp) flash(`Exported to ${fp.split(/[\\/]/).pop()}`); return; }
      if (act.dataset.act === 'list') {
        const box = pl.querySelector('.sched'); box.classList.toggle('hidden');
        if (!box.classList.contains('hidden')) box.innerHTML = `<ol class="schedlist">${p.sessions.map((s, k) => `<li class="${s.done ? 'done' : ''}${s.date === today ? ' today' : ''}"><label><input type="checkbox" data-done="${p.id}|${k}"${s.done ? ' checked' : ''}> ${s.date ? esc(s.date) : 'Session ' + (k + 1)}</label> ${s.readings.map(r => `<a data-read="${r.b}.${r.c1}">${esc(passLabel(r))}</a>`).join(' · ')}</li>`).join('')}</ol>`;
        const t = box.querySelector('li.today') || box.querySelector('li:not(.done)'); if (t) t.scrollIntoView({ block: 'nearest' });
      }
    }
  };
  body.onchange = e => {
    const cb = e.target.closest('[data-done]'); if (!cb) return;
    const [pid, k] = cb.dataset.done.split('|'); const p = plans.find(x => x.id === pid); if (!p) return;
    p.sessions[+k].done = cb.checked; saveUD('plans', true);
    if (cb.closest('.today')) setTimeout(renderStudy, 300);
  };
}
async function newPlanDialog() {
  const presets = await api.planPresets(); const t = todayIso();
  const html = `<div class="grid2"><label>Name <input id="plName" value="Bible reading"></label><label>Start <input id="plStart" type="date" value="${t}"></label></div>
    <label class="field">Read <select id="plPreset">${presets.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}<option value="custom">Choose books…</option></select></label>
    <label class="field hidden" id="plCustomBox">Books (one line per part read in parallel each day; e.g. <i>Gen-Mal</i>, <i>Matt-Rev</i>, <i>Ps; Prov</i>)<textarea id="plCustom" rows="3">Gen-Mal\nMatt-Rev</textarea></label>
    <div class="field">On these days<div class="row tight days">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => `<label><input type="checkbox" data-day="${i}" checked> ${n}</label>`).join('')}</div></div>
    <div class="field">How much<div class="col">
      <label><input type="radio" name="plMode" value="days" checked> Finish in <input id="plDays" type="number" value="365" min="1" class="num"> reading days</label>
      <label><input type="radio" name="plMode" value="until"> Finish by <input id="plUntil" type="date" value="${(+t.slice(0, 4) + 1) + t.slice(4)}"></label>
      <label><input type="radio" name="plMode" value="perSession"> Read <input id="plPer" type="number" value="3" min="1" class="num"> chapters each time</label>
      <label><input type="checkbox" id="plNoCal"> Don't tie the plan to dates (read sessions whenever you like)</label>
      <label><input type="checkbox" id="plCycle"> Repeat shorter parts so every day has something from each</label></div></div>`;
  const p = TimotheosModules.modal('New reading plan', html, [{ label: 'Cancel', value: null }, { label: 'Create plan', value: 'ok', primary: true }]);
  setTimeout(() => { $('#plPreset').onchange = () => $('#plCustomBox').classList.toggle('hidden', $('#plPreset').value !== 'custom'); }, 30);
  if (await p !== 'ok') return;
  const preset = presets.find(x => x.id === $('#plPreset').value);
  const o = {
    name: $('#plName').value || 'Bible reading', start: $('#plStart').value || t,
    groups: preset ? preset.groups : $('#plCustom').value.split('\n').map(x => x.trim()).filter(Boolean),
    days: [...document.querySelectorAll('[data-day]')].filter(x => x.checked).map(x => +x.dataset.day),
    mode: document.querySelector('input[name="plMode"]:checked').value,
    sessions: +$('#plDays').value, until: $('#plUntil').value, perSession: +$('#plPer').value,
    noCalendar: $('#plNoCal').checked, cycle: $('#plCycle').checked,
  };
  try {
    const plan = await api.createPlan(o, state.settings.openBibles);
    study.ud.plans.push(plan); saveUD('plans', true); flash(`Plan created: ${plan.sessions.length} readings`); renderStudy();
  } catch (e) { TimotheosModules.messageBox('Could not create the plan', esc(e.message)); }
}

/* ======================================================================= keyboard help */
function showKeys() {
  const sc = window.TimotheosOptions && TimotheosOptions.shortcuts ? TimotheosOptions.shortcuts() : {};
  const rows = [['←  →', 'Previous / next chapter'], ['Ctrl+← →', 'Previous / next book'], ['↑  ↓', 'Previous / next verse'], ['Alt+← →, Backspace', 'Back / forward in history'],
    ['type a number', 'Go to that verse (Shift+number: chapter)'], [sc.goto || 'Ctrl+G', 'Go to a reference'], [sc.search || 'Ctrl+F', 'Bible search'], [sc.bookSearch || 'Ctrl+Shift+F', 'Book search'], [sc.guide || 'F1', 'User Guide'], ['Alt+F / Alt+V / Alt+H', 'Open the File, View or Help menu'], [sc.import || 'Ctrl+I', 'Import modules'], [sc.addFolder || 'Ctrl+O', 'Add a module folder'], ['Ctrl+Shift+1…0 / Ctrl+1…0', 'Set / go to bookmark'],
    ['Ctrl+C', 'Copy the current verse (or the selection)'], [sc.copyVerses || 'F5', 'Copy Verses dialog'], [sc.addVerseList || 'Ctrl+L', 'Add the current verse to the verse list'], [`${sc.layoutCols || 'Ctrl+H'} / ${sc.layoutRows || 'Ctrl+J'}`, 'Bibles side by side / one under another'],
    [`${sc.toggleStrongs || 'S'} ${sc.toggleMorph || 'M'} ${sc.toggleFootnotes || 'F'} ${sc.toggleHeadings || 'H'} ${sc.toggleWoj || 'J'} ${sc.toggleAdded || 'I'} ${sc.toggleXrefs || 'X'} ${sc.toggleCmtLinks || 'C'}`, "Strong's, morphology, footnotes, headings, red letters, italics, cross-references, commentary marks"], [`${sc.toggleHighlights || 'U'} ${sc.toggleNotes || 'N'} ${sc.toggleParagraph || 'P'}`, 'My highlighting, my notes, paragraph mode'],
    ['Ctrl + / Ctrl −', 'Bible text size'], ['Ctrl + mouse wheel', 'Text size of the Bible, Commentary, Lookup, Library or Search panel under the mouse'], ['Ctrl+P', 'Print'], [sc.options || 'Ctrl+,', 'Options (fonts, skins, verse numbers, shortcuts…)'], ['drag a panel caption', 'Move, tab, stack or float a panel'], ['Esc', 'Close menus and popups'], ['right-click a verse', 'Copy, bookmark, highlight, note, cross-references, find']];
  TimotheosModules.messageBox('Keyboard shortcuts', `<table class="imp">${rows.map(([k, d]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table><div class="row"><button id="editKeysFromHelp" class="primary">Customize shortcuts in Options…</button></div>`);
  setTimeout(() => { const b = $('#editKeysFromHelp'); if (b) b.onclick = () => { $('#modal').classList.add('hidden'); TimotheosOptions.open('keys'); }; }, 30);
}

window.TimotheosStudy = { init, afterRender, markDifferences, renderTree, copyDialog, quickCopy, addToList, openStudy, onOpen, showKeys, editNote, flash, verseText, study };
