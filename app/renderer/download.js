/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Download modules": the one place where Timotheos uses the internet, and only when the user asks.
// A repository is a list of modules somewhere on the web. Three kinds:
//   - the Timotheos repository (a catalog file kept with the source code of Timotheos),
//   - eBible.org (its own list of translations, translations.csv; each translation is fetched as <id>_usfm.zip),
//   - any catalog address the user adds (same format as the Timotheos catalog, see the User Guide).
// The program itself fetches the file (TimotheosHost.net) into its temporary folder; the ordinary import does the rest.
const TimotheosDownload = (() => {
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const q = (s, r) => (r || document).querySelector(s);
  const DEFAULTS = {
    catalog: 'https://raw.githubusercontent.com/SalitaNgDiyos/Timotheos/timotheos-tauri/catalog/catalog.json',
    ebible: 'https://ebible.org/Scriptures/'
  };
  const SHOW = 120;   // rows of a long list shown at once: the rest is found by typing
  let current = 'timotheos', busy = false, ebibleRows = null, filter = '';
  const cache = new Map();   // catalog address -> parsed catalog
  const added = new Set();   // what was downloaded while the window was open

  const net = () => (window.TimotheosHost && TimotheosHost.net) || null;
  function places() {
    let o = {};
    try { o = JSON.parse((TimotheosHost.info().env || {}).TIMOTHEOS_REPOS || '{}'); } catch (e) { /* the defaults */ }
    return { ...DEFAULTS, ...o };
  }
  const userRepos = () => (Array.isArray(state.settings.repos) ? state.settings.repos : []).filter(r => r && r.url);
  function repos() {
    return [{ id: 'timotheos', name: 'Timotheos', url: places().catalog }, { id: 'ebible', name: 'eBible.org', ebible: true }]
      .concat(userRepos().map((r, i) => ({ id: 'u' + i, name: r.name || r.url, url: r.url, user: true })));
  }
  const okUrl = u => { try { const p = new URL(u); return p.protocol === 'https:' || (p.protocol === 'http:' && p.hostname === '127.0.0.1' && !!(TimotheosHost.info().env || {}).TIMOTHEOS_REPOS); } catch (e) { return false; } };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' bytes';

  /* ---------- reading the lists ---------- */
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', inq = false;
    text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inq) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += c; }
      else if (c === '"') inq = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const head = rows.shift() || [];
    return rows.filter(r => r.length > 1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i] || ''; }); return o; });
  }
  /** eBible's list -> what the window shows; only what eBible marks as free to share and downloadable */
  function ebibleList(text) {
    const yes = v => /^true$/i.test(String(v).trim());
    return parseCsv(text).filter(r => r.translationId && yes(r.Redistributable) && (r.downloadable === '' || yes(r.downloadable))).map(r => {
      const books = (+r.OTbooks || 0) + (+r.NTbooks || 0) + (+r.DCbooks || 0);
      const what = (+r.OTbooks && +r.NTbooks) ? 'Bible' : +r.NTbooks ? 'New Testament' : +r.OTbooks ? 'Old Testament' : 'Portion';
      const lang = r.languageNameInEnglish || r.languageName || r.languageCode;
      const title = r.title || r.shortTitle || r.translationId;
      return { id: r.translationId, title, language: lang, own: r.languageName && r.languageName !== lang ? r.languageName : '',
        description: [what + (books ? ', ' + books + ' books' : ''), r.UpdateDate ? 'updated ' + r.UpdateDate : ''].filter(Boolean).join(' · '),
        licence: r.Copyright || '', file: (title + ' [' + r.translationId + ']').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 110) + '_usfm.zip',
        url: places().ebible + encodeURIComponent(r.translationId) + '_usfm.zip',
        find: (lang + ' ' + r.languageName + ' ' + title + ' ' + r.translationId + ' ' + r.languageCode + ' ' + r.description).toLowerCase() };
    }).sort((a, b) => a.language.localeCompare(b.language) || a.title.localeCompare(b.title));
  }
  /** a catalog file: { name, about, modules: [ { title, url, file, description, language, kind, size, licence } ] } */
  function readCatalog(text, base) {
    let j; try { j = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new Error('This address does not hold a Timotheos catalog (it is not a JSON list of modules).'); }
    const list = Array.isArray(j) ? j : j && Array.isArray(j.modules) ? j.modules : null;
    if (!list) throw new Error('This address does not hold a Timotheos catalog (no "modules" list in it).');
    const mods = [];
    for (const m of list) {
      if (!m || !m.title || !m.url) continue;
      let u; try { u = new URL(String(m.url), base).href; } catch (e) { continue; }
      if (!okUrl(u)) continue;
      const file = String(m.file || decodeURIComponent(u.split(/[?#]/)[0].split('/').pop()) || 'module').replace(/[\\/:*?"<>|]+/g, '_');
      mods.push({ id: u, title: String(m.title), language: String(m.language || ''), own: '', description: [m.kind, m.description].filter(Boolean).join(' · '),
        licence: String(m.licence || m.license || ''), size: +m.size || 0, file, url: u,
        find: (m.title + ' ' + (m.language || '') + ' ' + (m.description || '') + ' ' + (m.kind || '')).toLowerCase() });
    }
    return { name: Array.isArray(j) ? '' : String(j.name || ''), about: Array.isArray(j) ? '' : String(j.about || ''), modules: mods };
  }
  async function load(repo) {
    if (repo.ebible) { if (!ebibleRows) ebibleRows = ebibleList(await net().text(places().ebible + 'translations.csv')); return { about: 'Bibles in very many languages, which their publishers allow to be shared. Each comes as a USFM file, which Timotheos imports as one Bible.', modules: ebibleRows }; }
    if (!cache.has(repo.url)) cache.set(repo.url, readCatalog(await net().text(repo.url), repo.url));
    return cache.get(repo.url);
  }

  /* ---------- the window ---------- */
  function rowsHtml(mods) {
    const f = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = f.length ? mods.filter(m => f.every(w => m.find.includes(w))) : mods;
    if (!hit.length) return '<p class="hint">Nothing in this repository matches.</p>';
    const more = hit.length > SHOW ? `<p class="hint">${SHOW} of ${hit.length} shown. Type a language or a title above to find the rest.</p>` : '';
    return hit.slice(0, SHOW).map(m => `<div class="dlrow" data-id="${E(m.id)}"><div class="dlt"><b>${E(m.title)}</b>
      <span>${E([m.language + (m.own ? ' (' + m.own + ')' : ''), m.description, m.size ? mb(m.size) : ''].filter(Boolean).join(' · '))}</span>
      ${m.licence ? `<small>${E(m.licence.length > 220 ? m.licence.slice(0, 220) + '…' : m.licence)}</small>` : ''}</div>
      <button type="button" class="dlget"${added.has(m.id) ? ' disabled' : ''}>${added.has(m.id) ? 'Added' : 'Download'}</button></div>`).join('') + more;
  }
  function frame() {
    const rs = repos();
    if (!rs.some(r => r.id === current)) current = 'timotheos';
    const cur = rs.find(r => r.id === current);
    return `<div class="dlmods">
      <p class="small dlnote">Timotheos uses the internet only here, and only when you ask: to fetch the list of a repository and the module you choose. Nothing about you or your study is sent.</p>
      <div class="dlbar"><label>Repository <select id="dlRepo">${rs.map(r => `<option value="${r.id}"${r.id === current ? ' selected' : ''}>${E(r.name)}</option>`).join('')}</select></label>
        <button type="button" id="dlAddBtn">Add a repository…</button>${cur.user ? '<button type="button" id="dlRemove">Remove this one</button>' : ''}</div>
      <div id="dlAdd" class="dladd hidden"><label>Address of a catalog (https://…) <input id="dlAddUrl" type="url" placeholder="https://example.org/catalog.json" autocomplete="off" spellcheck="false"></label>
        <button type="button" id="dlAddGo">Add</button><button type="button" id="dlAddNo">Cancel</button>
        <p class="small">A catalog is a small list of modules that a site publishes for Timotheos. The User Guide shows how to make one. Add only addresses you trust: the modules come from that site, not from Timotheos.</p></div>
      <input id="dlFind" type="search" placeholder="Find by language or title" autocomplete="off" value="${E(filter)}">
      <div id="dlAbout" class="small"></div>
      <div id="dlList" class="dllist"><p class="hint">Fetching the list…</p></div>
      <div id="dlStatus" class="dlstatus" aria-live="polite"></div></div>`;
  }
  const status = (html, bad) => { const s = q('#dlStatus'); if (s) { s.innerHTML = html || ''; s.classList.toggle('bad', !!bad); } };
  async function show() {
    const repo = repos().find(r => r.id === current); const mine = current;
    const list = q('#dlList'); if (!list) return;
    list.innerHTML = '<p class="hint">Fetching the list…</p>'; q('#dlAbout').textContent = '';
    let cat;
    try { cat = await load(repo); }
    catch (e) { if (current === mine && q('#dlList')) q('#dlList').innerHTML = `<p class="hint bad">The list could not be fetched. ${E(e.message)}</p><p class="hint">Check that this device is connected to the internet, then choose the repository again.</p>`; return; }
    if (current !== mine || !q('#dlList')) return;
    q('#dlAbout').textContent = cat.about || '';
    q('#dlFind').classList.toggle('hidden', cat.modules.length < 8);
    q('#dlList').innerHTML = cat.modules.length ? rowsHtml(cat.modules) : '<p class="hint">This repository has no modules yet.</p>';
    q('#dlList').dataset.n = cat.modules.length;
  }
  async function fetchOne(id, btn) {
    if (busy) return; const repo = repos().find(r => r.id === current);
    const cat = await load(repo); const m = cat.modules.find(x => x.id === id); if (!m) return;
    busy = true; btn.disabled = true; btn.textContent = '…';
    status(`Downloading <b>${E(m.title)}</b>… <span id="dlPct"></span> <button type="button" id="dlStop">Stop</button>`);
    try {
      const path = await net().get(m.url, m.file, p => { const s = q('#dlPct'); if (s) s.textContent = p.total ? mb(p.done) + ' of ' + mb(p.total) : p.done ? mb(p.done) : ''; });
      status(`Bringing <b>${E(m.title)}</b> into Timotheos…`);
      const r = await TimotheosModules.importModules([path], true);
      const res = (r && r.results) || []; const good = res.filter(x => x.status === 'imported' || x.status === 'updated');
      if (good.length) { added.add(id); status(`Added: <b>${E(good.map(x => x.title || x.name).join(', '))}</b>. It is in your library now.`); }
      else if (res.some(x => x.status === 'already')) { added.add(id); status(`<b>${E(m.title)}</b> is already in your library.`); }
      else status(`<b>${E(m.title)}</b> was downloaded but could not be imported. ${E((res[0] && (res[0].reason || res[0].note)) || '')}`, true);
    } catch (e) { status(`<b>${E(m.title)}</b> was not downloaded. ${E(e.message)}`, true); }
    busy = false;
    if (q('#dlList')) { const b = q(`#dlList .dlrow[data-id="${CSS.escape(id)}"] .dlget`); if (b) { b.disabled = added.has(id); b.textContent = added.has(id) ? 'Added' : 'Download'; } }
  }
  async function addRepo() {
    const url = (q('#dlAddUrl').value || '').trim();
    if (!okUrl(url)) return status('Give an address that starts with https://', true);
    if (repos().some(r => r.url === url)) return status('That repository is already in the list.', true);
    status('Reading the catalog…');
    let cat; try { cat = readCatalog(await net().text(url), url); } catch (e) { return status(`Not added. ${E(e.message)}`, true); }
    cache.set(url, cat);
    let name = cat.name; if (!name) { try { name = new URL(url).hostname; } catch (e) { name = url; } }
    const list = userRepos().concat([{ name: name.slice(0, 60), url }]);
    await save({ repos: list }); current = 'u' + (list.length - 1); filter = '';
    redraw(); status(`Added the repository <b>${E(name)}</b> with ${cat.modules.length} module${cat.modules.length === 1 ? '' : 's'}.`);
  }
  function redraw() { const b = q('#modalBody'); if (!b || !q('.dlmods', b)) return; b.innerHTML = frame(); wire(); show(); }
  function wire() {
    const root = q('.dlmods'); if (!root) return;
    q('#dlRepo').onchange = e => { if (busy) { e.target.value = current; return; } current = e.target.value; filter = ''; redraw(); };
    q('#dlAddBtn').onclick = () => { q('#dlAdd').classList.toggle('hidden'); const i = q('#dlAddUrl'); if (!q('#dlAdd').classList.contains('hidden')) i.focus(); };
    q('#dlAddNo').onclick = () => q('#dlAdd').classList.add('hidden');
    q('#dlAddGo').onclick = addRepo;
    q('#dlAddUrl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addRepo(); } };
    const rm = q('#dlRemove'); if (rm) rm.onclick = async () => { const i = +current.slice(1); const list = userRepos(); list.splice(i, 1); await save({ repos: list }); current = 'timotheos'; redraw(); status('Removed. Modules you already downloaded stay in your library.'); };
    q('#dlFind').oninput = async e => { filter = e.target.value; try { const cat = await load(repos().find(r => r.id === current)); if (q('#dlList')) q('#dlList').innerHTML = rowsHtml(cat.modules); } catch (err) { /* the list is not there yet */ } };
    q('#dlFind').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } };
    root.onclick = e => {
      if (e.target.closest('#dlStop')) return net().stop();
      const b = e.target.closest('.dlget'); if (b && !b.disabled) fetchOne(b.closest('.dlrow').dataset.id, b);
    };
  }
  async function open() {
    if (!net()) return TimotheosModules.messageBox('Download modules', '<p>This build of Timotheos cannot download. Use <b>Import modules</b> with files you downloaded yourself.</p>');
    busy = false;
    const p = TimotheosModules.modal('Download modules', frame(), [{ label: 'Close', value: null }], true);
    wire(); show();
    await p;
    if (busy) net().stop();
  }
  return { open, parseCsv, ebibleList, readCatalog };
})();
window.TimotheosDownload = TimotheosDownload;
