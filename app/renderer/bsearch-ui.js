/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Book search panel: words in commentaries, dictionaries, books, devotionals and maps – apart from the
 * Bible search, as in theWord. Supports Boolean (AND, OR, NOT, XOR), NEARw (@n), wildcards, and regex. */
/* global api, state, save, esc, TimotheosModules, TimotheosStudy */
(function () {
  const $ = s => document.querySelector(s);
  const KINDS = [['all', 'All book modules'], ['commentary', 'Commentaries'], ['dictionary', 'Dictionaries'], ['book', 'Books'], ['devotional', 'Devotionals'], ['map', 'Maps & images']];
  const KIND_NAME = { commentary: 'Commentary', dictionary: 'Dictionary', book: 'Book', devotional: 'Devotional', map: 'Map' };
  let last = null;
  const books = () => (state.modules.books || []).filter(b => !b.locked && KIND_NAME[b.kind]);
  const sets = () => state.settings.moduleSets || {};

  function fillScope() {
    const s = $('#bsScope'); const keep = s.value || state.settings.bsScope || 'all';
    const mods = books().sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
    s.innerHTML = KINDS.filter(([k]) => k === 'all' || mods.some(m => m.kind === k)).map(([k, l]) => `<option value="${k}">${l} (${k === 'all' ? mods.length : mods.filter(m => m.kind === k).length})</option>`).join('')
      + (Object.keys(sets()).length ? `<optgroup label="My module sets">${Object.keys(sets()).map(n => `<option value="set:${esc(n)}">${esc(n)} (${sets()[n].length})</option>`).join('')}</optgroup>` : '')
      + `<optgroup label="One module">${mods.map(m => `<option value="mod:${esc(m.id)}">${esc(m.opened ? m.title : m.name)}</option>`).join('')}</optgroup>`;
    s.value = keep; if (s.selectedIndex < 0) s.value = 'all';
  }
  function chosenIds() {
    const v = $('#bsScope').value || 'all';
    if (v === 'all') return [];
    if (v.startsWith('mod:')) return [v.slice(4)];
    if (v.startsWith('set:')) return (sets()[v.slice(4)] || []).filter(id => books().some(b => b.id === id));
    return books().filter(b => b.kind === v).map(b => b.id);
  }

  async function run(q) {
    if (q != null) $('#bsInput').value = q;
    const text = $('#bsInput').value.trim(); if (!text) return;
    const ids = chosenIds();
    if ($('#bsScope').value.startsWith('set:') && !ids.length) { $('#bsStatus').textContent = 'None of the modules of this set are here.'; return; }
    const regexEl = $('#bsRegex');
    const o = { ids, whole: $('#bsWhole').checked, accents: $('#bsAccents').checked, regex: !!(regexEl && regexEl.checked) };
    save({ bsScope: $('#bsScope').value, bsOpts: { whole: o.whole, accents: o.accents, regex: o.regex } });
    $('#bsStatus').textContent = 'Searching…'; $('#bsResults').innerHTML = ''; $('#bsFind').disabled = true;
    try {
      const r = await api.bookSearchAll(text, o);
      if (!r) return; // a newer search took over
      last = r; show(r);
    } catch (e) { $('#bsStatus').textContent = e.message; }
    finally { $('#bsFind').disabled = false; }
  }
  function show(r) {
    $('#bsStatus').textContent = r.total ? `${r.total} topic${r.total === 1 ? '' : 's'} in ${r.results.length} of ${r.modules} modules${r.shown < r.total ? ` (the first ${r.shown} shown)` : ''} · ${(r.ms / 1000).toFixed(1)} s` : `Not found in ${r.modules} modules · ${(r.ms / 1000).toFixed(1)} s`;
    $('#bsResults').innerHTML = r.results.map(m => `<li class="bsmod"><details open><summary><b>${esc(m.title)}</b> <span class="small">${esc(KIND_NAME[m.kind] || '')} · ${m.hits.length}</span></summary><ol>${m.hits.map(h => `<li class="bshit" data-mod="${esc(m.id)}" data-tid="${esc(String(h.tid))}"><a class="bssub">${esc(h.subject)}</a><div class="bssnip">${h.snippet}</div></li>`).join('')}</ol></details></li>`).join('');
  }
  /** open a result in the Library, with the words marked */
  async function openHit(li) {
    const tid = isNaN(+li.dataset.tid) ? li.dataset.tid : +li.dataset.tid;
    await TimotheosModules.openBookModule(li.dataset.mod, tid);
    document.querySelectorAll('#bsResults .bshit.cur').forEach(x => x.classList.remove('cur')); li.classList.add('cur');
    if (last) markIn($('#libBody'), last.words);
  }
  // [F5] Safely escape regex/wildcard characters in markIn() so ?/* or punctuation never cause errors or false matches
  function markIn(root, words) {
    const fold = s => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = (words || []).map(w => {
      const clean = fold(String(w || '').trim());
      if (!clean || /^(and|or|not|xor|&|\||\^|~)$/i.test(clean)) return null;
      const src = reEsc(clean).replace(/\\\*/g, '[\\p{L}\\p{N}]*').replace(/\\\?/g, '[\\p{L}\\p{N}]');
      try { return new RegExp(src, 'gu'); } catch (e) { return null; }
    }).filter(Boolean);
    if (!patterns.length) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let first = null;
    for (const node of nodes) {
      const t = node.data; const f = fold(t); if (f.length !== t.length) continue;
      const hits = [];
      for (const rx of patterns) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(f))) {
          if (!m[0].length) { rx.lastIndex++; continue; }
          hits.push([m.index, m.index + m[0].length]);
        }
      }
      if (!hits.length) continue;
      hits.sort((a, b) => b[0] - a[0]);
      for (const [a, b] of hits) { const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b); const mk = document.createElement('mark'); mk.className = 'bsmark'; try { r.surroundContents(mk); first = mk; } catch (e) { /* overlap */ } }
    }
    if (first) first.scrollIntoView({ block: 'center' });
  }

  /** module sets: tick modules, save under a name */
  async function editSets() {
    const mods = books().sort((a, b) => a.kind.localeCompare(b.kind) || (a.title || a.name).localeCompare(b.title || b.name));
    const cur = $('#bsScope').value.startsWith('set:') ? $('#bsScope').value.slice(4) : '';
    const inSet = new Set(cur ? sets()[cur] || [] : []);
    const html = `<label class="field">Name of the set <input id="msName" type="text" value="${esc(cur)}" placeholder="e.g. My commentaries"></label>
      <div class="mslist">${mods.map(m => `<label><input type="checkbox" value="${esc(m.id)}"${inSet.has(m.id) ? ' checked' : ''}> ${esc(m.opened ? m.title : m.name)} <span class="small">${esc(KIND_NAME[m.kind])}</span></label>`).join('')}</div>
      ${Object.keys(sets()).length ? `<p class="small">Your sets: ${Object.keys(sets()).map(esc).join(', ')}. Saving under an existing name replaces that set.</p>` : ''}`;
    const r = await TimotheosModules.modal('Module sets', html, [cur ? { label: 'Delete this set', value: 'del' } : null, { label: 'Cancel', value: null }, { label: 'Save set', value: 'save', primary: true }].filter(Boolean));
    const all = Object.assign({}, sets());
    if (r === 'del' && cur) { delete all[cur]; save({ moduleSets: all }); fillScope(); $('#bsScope').value = 'all'; return; }
    if (r !== 'save') return;
    const name = (($('#msName') || {}).value || '').trim(); const ids = [...document.querySelectorAll('.mslist input:checked')].map(i => i.value);
    if (!name || !ids.length) return TimotheosStudy.flash('A set needs a name and at least one module');
    all[name] = ids; save({ moduleSets: all }); fillScope(); $('#bsScope').value = 'set:' + name;
  }

  function init() {
    const o = state.settings.bsOpts || {};
    $('#bsWhole').checked = !!o.whole; $('#bsAccents').checked = !!o.accents;
    if ($('#bsRegex')) $('#bsRegex').checked = !!o.regex;
    $('#bsForm').addEventListener('submit', e => { e.preventDefault(); run(); });
    $('#bsSets').onclick = editSets;
    $('#bsResults').addEventListener('click', e => { const li = e.target.closest('.bshit'); if (li) openHit(li); });
    api.onBookSearchProgress(t => { if ($('#bsFind').disabled) $('#bsStatus').textContent = t; });
    fillScope();
  }
  function onOpen(focus) { fillScope(); if (focus) $('#bsInput').focus(); }
  window.TimotheosBookSearch = { init, run, onOpen, fillScope, markIn };
})();
