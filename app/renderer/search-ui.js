/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* global api, state, $, esc, go, openTab, save, TimotheosModules, TimotheosStudy */
// Search panel: theWord-style Boolean / regex search across Bibles (engine: src/lib/search.js).

const srch = { last: null, filterBook: null, timer: null, ranges: [] };

function opts() { return Object.assign({ defaultOr: false, whole: false, matchCase: false, matchDiac: false, regex: false, nearW: 30, nearV: 3, nearAcross: false, bibles: 'open', scope: 'all' }, state.settings.search || {}); }
function saveOpts() {
  const acrossEl = $('#optNearAcross');
  const o = { defaultOr: $('#optDefault').value === 'or', whole: $('#optWhole').checked, matchCase: $('#optCase').checked, matchDiac: $('#optDiac').checked, regex: $('#optRegex').checked,
    nearW: +$('#optNearW').value || 30, nearV: +$('#optNearV').value || 3, nearAcross: !!(acrossEl && acrossEl.checked), bibles: $('#searchBibles').value, scope: $('#searchScope').value };
  save({ search: o }); return o;
}
function engineOpts(o) {
  return { defaultOr: o.defaultOr, wholeWords: o.whole, ignoreCase: !o.matchCase, ignoreDiacritics: !o.matchDiac, regex: o.regex, nearW: o.nearW, nearV: o.nearV, nearAcross: !!o.nearAcross, scope: o.scope, current: { b: state.ref.b, c: state.ref.c } };
}

async function init() {
  const o = opts();
  srch.ranges = await api.searchRanges();
  fillScopes(o.scope);
  $('#optDefault').value = o.defaultOr ? 'or' : 'and'; $('#optWhole').checked = o.whole; $('#optCase').checked = o.matchCase; $('#optDiac').checked = o.matchDiac; $('#optRegex').checked = o.regex;
  $('#optNearW').value = o.nearW; $('#optNearV').value = o.nearV; $('#searchBibles').value = o.bibles;
  if ($('#optNearAcross')) $('#optNearAcross').checked = !!o.nearAcross;
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); run(); });
  wireBibleList(); fillBibleList(); if (o.bibles === 'chosen') $('#searchPick').open = true;
  // the list of Bibles to tick shows only with "The Bibles I tick below": with the other choices it had no effect
  const syncPick = () => $('#searchPick').classList.toggle('hidden', $('#searchBibles').value !== 'chosen');
  syncPick(); $('#searchBibles').addEventListener('change', syncPick);
  $('#searchInput').addEventListener('input', explainSoon);
  for (const id of ['optDefault', 'optWhole', 'optCase', 'optDiac', 'optRegex', 'optNearW', 'optNearV', 'optNearAcross', 'searchBibles']) {
    const el = $('#' + id);
    if (el) el.addEventListener('change', () => { saveOpts(); explainSoon(); });
  }
  $('#searchScope').addEventListener('change', async () => { if ($('#searchScope').value === '__custom') { await customRange(); } saveOpts(); });
  $('#rangeBtn').onclick = async () => { await customRange(); saveOpts(); };
  $('#searchHistBtn').onclick = e => historyMenu(e);
  $('#searchTabs').onclick = e => { const b = e.target.closest('button[data-st]'); if (b) showPart(b.dataset.st); };
  $('#searchToList').onclick = () => { if (!srch.last) return; TimotheosStudy.addToList(visible().map(x => ({ b: x.b, c: x.c, v: x.v, v2: x.v2 > x.v ? x.v2 : undefined }))); };
  $('#searchCopy').onclick = async () => { if (!srch.last) return; await api.copyText(visible().map(x => `${x.ref} ${x.text}`).join('\n')); TimotheosStudy.flash(`${visible().length} verses copied`); };
  $('#searchResults').onclick = e => { const li = e.target.closest('li[data-i]'); if (li) { const x = visible()[+li.dataset.i]; go({ b: x.b, c: x.c, v: x.v }); } };
  $('#searchBooks').onclick = e => { const r = e.target.closest('[data-fb]'); if (r) { srch.filterBook = r.dataset.fb === srch.filterBook ? null : r.dataset.fb; renderResults(); showPart('res'); } };
}
function fillScopes(sel) {
  const s = $('#searchScope'); const ud = TimotheosStudy.study.ud || {};
  const ap = state.settings.apocryphaPlacement !== 'end';
  s.innerHTML = srch.ranges.map(r => `<option value="${esc(r.id)}">${esc(r.id === 'OT' && !ap ? 'Old Testament' : r.label)}</option>`).join('')
    + '<option value="book">Current book</option><option value="chapter">Current chapter</option>'
    + Object.entries(ud.ranges || {}).map(([n, t]) => `<option value="${esc(t)}" class="saved">${esc(n)}</option>`).join('')
    + (sel && ![...srch.ranges.map(r => r.id), 'book', 'chapter', ...Object.values(ud.ranges || {})].includes(sel) ? `<option value="${esc(sel)}">${esc(sel)}</option>` : '')
    + '<option value="__custom">Custom range…</option>';
  s.value = sel || 'all'; if (s.selectedIndex < 0) s.value = 'all';
}
async function customRange() {
  const cur = $('#searchScope').value; const isText = ![...srch.ranges.map(r => r.id), 'book', 'chapter', '__custom'].includes(cur);
  const p = TimotheosModules.modal('Custom search range', `<label class="field">Passages, separated by ; or new lines<textarea id="rgText" rows="4" placeholder="Gen-Deut; Matt 5-7; Rom 3:21-26">${isText ? esc(cur) : ''}</textarea></label><div id="rgCheck" class="small"></div><label class="field">Save as (optional) <input id="rgName" placeholder="e.g. Sermon on the Mount"></label>`,
    [{ label: 'Cancel', value: null }, { label: 'Use range', value: 'ok', primary: true }]);
  setTimeout(() => { $('#rgText').oninput = async () => { const r = await api.checkRange($('#rgText').value); $('#rgCheck').textContent = r.ok ? '✓ understood' : r.errors.length ? 'Not understood: ' + r.errors.join('; ') : ''; }; $('#rgText').focus(); }, 30);
  const res = await p;
  if (res !== 'ok') { fillScopes(opts().scope); return; }
  const text = $('#rgText').value.trim(); const name = $('#rgName').value.trim();
  const chk = await api.checkRange(text);
  if (!chk.ok) { TimotheosModules.messageBox('Range not understood', esc(chk.errors.join('; ') || 'empty range')); fillScopes(opts().scope); return; }
  if (name) { TimotheosStudy.study.ud.ranges[name] = text; api.setUserData('ranges', TimotheosStudy.study.ud.ranges); }
  fillScopes(text);
}
function explainSoon() {
  clearTimeout(srch.timer);
  srch.timer = setTimeout(async () => {
    const q = $('#searchInput').value.trim(); const box = $('#searchExplain');
    if (!q) { box.textContent = ''; return; }
    const r = await api.searchDescribe(q, engineOpts(opts()));
    box.textContent = (r.ok ? 'Looking for ' : '⚠ ') + r.text; box.classList.toggle('bad', !r.ok);
  }, 200);
}
const pickedIds = () => (state.settings.searchBibleIds || []).filter(id => state.modules.bibles.some(b => b.id === id));
function fillBibleList() {
  const box = $('#searchBibleList'); if (!box) return;
  const on = new Set(pickedIds()); const q = ($('#searchPickFind').value || '').trim().toLowerCase();
  box.innerHTML = state.modules.bibles.map(b => { const inf = state.infos.get(b.id); const abbr = inf ? inf.abbr : b.abbr, ttl = inf ? inf.title : b.name; return `<label data-s="${esc((abbr + ' ' + ttl).toLowerCase())}"${q && !(abbr + ' ' + ttl).toLowerCase().includes(q) ? ' class="hidden"' : ''}><input type="checkbox" value="${esc(b.id)}"${on.has(b.id) ? ' checked' : ''}> <b>${esc(abbr)}</b> <span class="small">${esc(ttl)}</span></label>`; }).join('');
  $('#searchPickCount').textContent = `(${on.size} of ${state.modules.bibles.length})`;
}
function wireBibleList() {
  const setPicked = ids => { save({ searchBibleIds: ids }); $('#searchBibles').value = 'chosen'; $('#searchPick').classList.remove('hidden'); saveOpts(); fillBibleList(); explainSoon(); };
  $('#searchBibleList').addEventListener('change', () => setPicked([...document.querySelectorAll('#searchBibleList input:checked')].map(i => i.value)));
  $('#spAll').onclick = () => setPicked(state.modules.bibles.map(b => b.id));
  $('#spNone').onclick = () => setPicked([]);
  $('#spOpen').onclick = () => setPicked(state.settings.openBibles.slice());
  $('#searchPickFind').oninput = fillBibleList;
  $('#searchBibles').addEventListener('change', () => { if ($('#searchBibles').value === 'chosen') { if (!pickedIds().length) save({ searchBibleIds: state.settings.openBibles.slice() }); $('#searchPick').open = true; } fillBibleList(); });
}
function bibleIds(o) {
  const open = state.settings.openBibles;
  if (o.bibles === 'chosen') return pickedIds();
  if (o.bibles === 'first') return open.slice(0, 1);
  if (o.bibles === 'all') return state.modules.bibles.map(b => b.id);
  return open;
}
async function run(q) {
  if (q != null) $('#searchInput').value = q;
  q = $('#searchInput').value.trim(); if (!q) return;
  const o = saveOpts(); const ids = bibleIds(o);
  if (!ids.length) { $('#searchStatus').textContent = 'Tick at least one Bible to search in.'; $('#searchPick').open = true; return; }
  $('#searchStatus').textContent = 'Searching…'; $('#searchResults').innerHTML = ''; $('#searchTabs').classList.add('hidden');
  try {
    const r = await api.search(ids, q, Object.assign(engineOpts(o), { limit: 3000 }));
    srch.last = r; srch.filterBook = null;
    const ud = TimotheosStudy.study.ud; ud.searchHistory = [q, ...(ud.searchHistory || []).filter(x => x !== q)].slice(0, 50); api.setUserData('searchHistory', ud.searchHistory);
    $('#searchStatus').innerHTML = `<b>${r.total}</b> ${r.total === 1 ? 'verse' : 'verses'} in ${ids.length} Bible${ids.length === 1 ? '' : 's'}${r.total > r.results.length ? ` (first ${r.results.length} listed)` : ''} · ${(r.ms / 1000).toFixed(2)} s<div class="small">${esc(r.explanation)}</div>`;
    $('#searchTabs').classList.toggle('hidden', !r.total);
    renderResults(); renderBooks(); renderStats(); showPart('res');
  } catch (err) { $('#searchStatus').innerHTML = `<span class="bad">${esc(err.message)}</span>`; }
}
function visible() { const r = srch.last; if (!r) return []; return srch.filterBook ? r.results.filter(x => `${x.id}|${x.b}` === srch.filterBook) : r.results; }
function marked(text, marks) {
  let out = '', p = 0;
  for (const [s, e] of marks || []) { if (s < p) continue; out += esc(text.slice(p, s)) + '<mark>' + esc(text.slice(s, e)) + '</mark>'; p = e; }
  return out + esc(text.slice(p));
}
function renderResults() {
  const multi = new Set(srch.last.results.map(x => x.id)).size > 1;
  const list = visible();
  $('#searchResults').innerHTML = (srch.filterBook ? `<li class="filter">Showing ${esc(list[0] ? list[0].ref.split(' ')[0] : '')} only · <a data-fb="${esc(srch.filterBook)}">show all</a></li>` : '') +
    list.map((x, i) => `<li data-i="${i}"><span class="r">${esc(x.ref)}</span>${multi ? `<span class="m">${esc(x.abbr)}</span>` : ''}${x.other ? `<span class="m"> near ${esc(x.other)}</span>` : ''}<br>${marked(x.text, x.marks)}</li>`).join('');
  const f = $('#searchResults .filter a'); if (f) f.onclick = e => { e.stopPropagation(); srch.filterBook = null; renderResults(); };
}
function renderBooks() {
  const r = srch.last; const max = Math.max(1, ...r.books.map(b => b.n)); const multi = new Set(r.books.map(b => b.id)).size > 1;
  $('#searchBooks').innerHTML = `<table class="bookbars">${r.books.map(b => `<tr data-fb="${esc(b.id + '|' + b.b)}" title="Show only ${esc(b.name)}"><td>${esc(b.name)}${multi ? ` <span class="m">${esc((state.infos.get(b.id) || {}).abbr || '')}</span>` : ''}</td><td class="n">${b.n}</td><td class="pc">${Math.round(100 * b.n / r.total)}%</td><td class="barc"><span style="width:${Math.max(2, Math.round(100 * b.n / max))}%"></span></td></tr>`).join('')}</table>`;
}
function renderStats() {
  const r = srch.last; let html = '';
  if (r.stats.length) {
    const groups = {};
    for (const s of r.stats) (groups[s.code || s.what] = groups[s.code || s.what] || []).push(s);
    html += '<div class="paneHead">How the tagged words are rendered</div>' + Object.entries(groups).map(([code, list]) => `<div class="stg"><b>${esc(code)}</b> ${list.slice(0, 40).map(s => `<span class="chip st">${esc(s.text)} <span class="m">${s.n}</span></span>`).join(' ')}</div>`).join('');
  }
  if (r.words.length) html += '<div class="paneHead">Word forms found</div><div class="stg">' + r.words.slice(0, 120).map(s => `<span class="chip st">${esc(s.text)} <span class="m">${s.n}</span></span>`).join(' ') + '</div>';
  $('#searchStats').innerHTML = html || '<p class="small">No statistics for this search.</p>';
}
function showPart(p) {
  document.querySelectorAll('#searchTabs button[data-st]').forEach(b => b.classList.toggle('active', b.dataset.st === p));
  $('#searchResults').classList.toggle('hidden', p !== 'res'); $('#searchBooks').classList.toggle('hidden', p !== 'books'); $('#searchStats').classList.toggle('hidden', p !== 'stats');
}
function historyMenu(e) {
  e.stopPropagation();
  const h = (TimotheosStudy.study.ud.searchHistory || []).slice(0, 25);
  const m = $('#ctxMenu');
  m.innerHTML = '<div class="mh">Earlier searches</div>' + (h.map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('') || '<div class="small" style="padding:4px 10px">none yet</div>');
  m.classList.remove('hidden');
  const r = e.target.getBoundingClientRect(); m.style.left = Math.max(8, r.right - m.offsetWidth) + 'px'; m.style.top = (r.bottom + 4) + 'px';
  m.onclick = ev => { const b = ev.target.closest('button[data-q]'); if (b) { m.classList.add('hidden'); run(b.dataset.q); } };
}
function onOpen(focus) { fillScopes($('#searchScope').value || opts().scope); if (focus) $('#searchInput').focus(); }
/** "Find …" from elsewhere (context menu, popups) */
function find(q) { openTab('search'); run(q); }

window.TimotheosSearch = { init, run, find, onOpen, fillBibleList };
