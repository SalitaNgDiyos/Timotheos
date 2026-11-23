/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Download modules": fetches module catalogs and downloads modules when the user asks,
// plus checks the official SalitaNgDiyos GitHub repositories for updates to installed modules.
const TimotheosDownload = (() => {
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const q = (s, r) => (r || document).querySelector(s);
  const DEFAULTS = {
    officialUser: 'SalitaNgDiyos',
    officialApi: 'https://api.github.com/users/SalitaNgDiyos/repos?per_page=100',
    catalog: 'https://raw.githubusercontent.com/SalitaNgDiyos/Timotheos/timotheos-tauri/catalog/catalog.json',
    ebible: 'https://ebible.org/Scriptures/'
  };
  const APP_REPOS = new Set(['timotheos', 'dark-skinned-ibiblia']);
  const MOD_EXT_RE = /\.(ont|ot|nt|twm|twzip|zip|7z|bblx|bbli|cmtx|cmti|dctx|dcti|topx|topi|refx|refi|devx|devi|lexx|lexi|mapx|mapi|harx|hari|usfm|sfm|usfx|mybible)$/i;
  const SHOW = 120;
  let current = 'official', busy = false, ebibleRows = null, filter = '';
  const cache = new Map();
  const added = new Set();

  const net = () => (typeof window !== 'undefined' && window.TimotheosHost && TimotheosHost.net) || null;
  function places() {
    let o = {};
    try { o = JSON.parse(((typeof TimotheosHost !== 'undefined' && TimotheosHost.info().env) || {}).TIMOTHEOS_REPOS || '{}'); } catch (e) { /* defaults */ }
    return { ...DEFAULTS, ...o };
  }
  const userRepos = () => (typeof state !== 'undefined' && Array.isArray(state.settings.repos) ? state.settings.repos : []).filter(r => r && r.url);
  function repos() {
    return [
      { id: 'official', name: 'SalitaNgDiyos Official', official: true },
      { id: 'timotheos', name: 'Timotheos', url: places().catalog },
      { id: 'ebible', name: 'eBible.org', ebible: true }
    ].concat(userRepos().map((r, i) => ({ id: 'u' + i, name: r.name || r.url, url: r.url, user: true })));
  }
  const okUrl = u => { try { const p = new URL(u); return p.protocol === 'https:' || (p.protocol === 'http:' && p.hostname === '127.0.0.1' && !!(TimotheosHost.info().env || {}).TIMOTHEOS_REPOS); } catch (e) { return false; } };
  const mb = n => n >= 1048576 ? (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' bytes';

  /* ---------- module key & version comparison for official SalitaNgDiyos updates ---------- */
  function normalizeModuleKey(name) {
    let s = String(name || '').trim().toLowerCase();
    s = s.replace(/\.(zip|twzip|7z|tar\.gz|tgz)$/i, '');
    s = s.replace(/\.(dct|cmt|gbk|dev|map|top|ref|lex|har|bbl)\.(twm|mybible)$/i, '');
    s = s.replace(/\.(ont|ot|nt|twm|bblx|bbli|cmtx|cmti|dctx|dcti|mybible|usfm|sfm|usfx|xml|dct|cmt|gbk|dev|map|top|ref|lex|har|bbl)$/i, '');
    // Strip trailing date/version stamps like _2026-11-23_0805 or _dct_2026-11-21_2015
    s = s.replace(/[_\-\s]+(?:dct[_\-\s]+)?20\d{2}[-._]\d{2}(?:[-._]\d{2})?(?:[_\-\s]\d{4})?$/i, '');
    s = s.replace(/[_\-\s]+v?\d+(?:\.\d+)+$/i, '');
    s = s.replace(/[^a-z0-9+]+/g, '_').replace(/^_+|_+$/g, '');
    return s;
  }

  function extractStamp(str) {
    const s = String(str || '');
    const mDateTime = /(20\d{2})[-.](\d{2})[-.](\d{2})[_\sT-]?(\d{2}):?(\d{2})/.exec(s);
    if (mDateTime) return `${mDateTime[1]}-${mDateTime[2]}-${mDateTime[3]}_${mDateTime[4]}${mDateTime[5]}`;
    const mDate = /(20\d{2})[-.](\d{2})[-.](\d{2})/.exec(s);
    if (mDate) return `${mDate[1]}-${mDate[2]}-${mDate[3]}_0000`;
    const mVer = /(?:^|[^0-9])(20\d{2}\.\d+(?:\.\d+)?)(?:$|[^0-9])/.exec(s);
    if (mVer) return mVer[1];
    return '';
  }

  function compareStamps(a, b) {
    if (!a && !b) return 0;
    if (a && !b) return 1;
    if (!a && b) return -1;
    const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
    const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
    const n = Math.max(pa.length, pb.length);
    for (let i = 0; i < n; i++) {
      const d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return a === b ? 0 : (a > b ? 1 : -1);
  }

  function kindFromAsset(name) {
    const n = String(name || '').toLowerCase();
    if (/\.(dct|lex)\.(twm|zip)|dctx|dcti|lexx|lexi|lexicon|morph/i.test(n)) return 'Dictionary / Lexicon';
    if (/\.(cmt)\.(twm|zip)|cmtx|cmti/i.test(n)) return 'Commentary';
    if (/\.(ont|ot|nt|bblx|bbli|bbl\.mybible|usfm|usfx)/i.test(n)) return 'Bible';
    return 'Module';
  }

  function parseOfficialRelease(repo, rel) {
    if (!repo || !rel || !Array.isArray(rel.assets)) return [];
    const repoName = String(repo.name || '');
    const repoDesc = String(repo.description || '');
    const tag = String(rel.tag_name || rel.name || '');
    const pubDate = String(rel.published_at || rel.created_at || '');
    const out = [];
    for (const a of rel.assets) {
      if (!a || !a.name || !a.browser_download_url) continue;
      if (!MOD_EXT_RE.test(a.name)) continue;
      if (/source|timotheos|ibiblia/i.test(a.name) && /\.zip$/i.test(a.name)) continue;
      const modKey = normalizeModuleKey(a.name);
      const updatedAt = String(a.updated_at || pubDate || '');
      const niceTitle = a.name
        .replace(/\.(zip|twzip|7z)$/i, '')
        .replace(/_20\d{2}-\d{2}-\d{2}_\d{4}/g, '')
        .replace(/_/g, ' ')
        .trim();
      const shortDate = updatedAt ? updatedAt.slice(0, 10) : '';
      out.push({
        id: `official:${repoName}:${modKey}`,
        modKey,
        official: true,
        repo: repoName,
        tag,
        updatedAt,
        stamp: extractStamp(a.name) || extractStamp(tag) || extractStamp(updatedAt),
        title: niceTitle || a.name,
        language: '',
        own: '',
        description: [kindFromAsset(a.name), repoName.replace(/-/g, ' '), tag ? `v${tag}` : '', shortDate ? `updated ${shortDate}` : ''].filter(Boolean).join(' · '),
        licence: repoDesc,
        size: +a.size || 0,
        file: a.name,
        url: a.browser_download_url,
        find: `${niceTitle} ${a.name} ${repoName} ${repoDesc} ${tag}`.toLowerCase()
      });
    }
    return out;
  }

  function getInstalledModuleNames() {
    if (typeof state === 'undefined') return [];
    const all = state.allModules || state.modules || {};
    return []
      .concat(all.bibles || [])
      .concat(all.books || [])
      .map(m => String(m.name || m.title || ''))
      .filter(Boolean);
  }

  /** Compare remote SalitaNgDiyos modules against installed files & saved versions */
  function findModuleUpdates(remoteMods, installedNames, savedVersions = {}, ignoredUpdates = {}) {
    const instByKey = new Map();
    for (const nm of (installedNames || [])) {
      const k = normalizeModuleKey(nm);
      if (!k) continue;
      const st = extractStamp(nm);
      const prev = instByKey.get(k);
      if (!prev || compareStamps(st, prev.stamp) > 0) instByKey.set(k, { name: nm, stamp: st });
    }
    const updates = [];
    for (const m of (remoteMods || [])) {
      const key = m.modKey || normalizeModuleKey(m.file || m.title);
      const saved = savedVersions[key];
      const inst = instByKey.get(key);
      if (!saved && !inst) continue; // not installed
      const remoteVer = m.tag || m.stamp || m.updatedAt;
      if (ignoredUpdates[key] && ignoredUpdates[key] === remoteVer) continue;
      let hasUpdate = false;
      let currentLabel = '';
      if (saved) {
        currentLabel = saved.tag || saved.stamp || (saved.updatedAt ? saved.updatedAt.slice(0, 10) : 'installed');
        if (m.tag && saved.tag && m.tag !== saved.tag) {
          hasUpdate = compareStamps(m.stamp || m.tag, saved.stamp || saved.tag) > 0 || (m.updatedAt && saved.updatedAt && m.updatedAt > saved.updatedAt);
        } else if (m.updatedAt && saved.updatedAt && m.updatedAt > saved.updatedAt) {
          hasUpdate = true;
        }
      } else if (inst) {
        currentLabel = inst.stamp || inst.name;
        const rStamp = m.stamp || extractStamp(m.file) || extractStamp(m.tag);
        if (rStamp && inst.stamp) {
          hasUpdate = compareStamps(rStamp, inst.stamp) > 0;
        } else if (m.file && inst.name && m.file.toLowerCase() !== inst.name.toLowerCase() && rStamp && !inst.stamp) {
          hasUpdate = true;
        }
      }
      if (hasUpdate) {
        updates.push({ mod: m, key, currentLabel, remoteLabel: m.tag || (m.updatedAt ? m.updatedAt.slice(0, 10) : 'new'), remoteVer });
      }
    }
    return updates;
  }

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

  async function loadOfficial(forceRefresh = false) {
    const key = '__official__';
    if (!forceRefresh && cache.has(key)) return cache.get(key);
    const p = places();
    const rawRepos = JSON.parse(await net().text(p.officialApi));
    const modRepos = (Array.isArray(rawRepos) ? rawRepos : []).filter(r => r && r.name && !r.archived && !APP_REPOS.has(r.name.toLowerCase()));
    const mods = [];
    await Promise.all(modRepos.map(async r => {
      try {
        const rels = JSON.parse(await net().text(`https://api.github.com/repos/${encodeURIComponent(p.officialUser)}/${encodeURIComponent(r.name)}/releases?per_page=1`));
        if (Array.isArray(rels) && rels[0]) mods.push(...parseOfficialRelease(r, rels[0]));
      } catch (e) { /* repo has no releases or transient fetch error */ }
    }));
    mods.sort((a, b) => a.repo.localeCompare(b.repo) || a.title.localeCompare(b.title));
    const cat = {
      name: 'SalitaNgDiyos Official',
      about: 'Official Bible translations, Septuagint texts, interlinears, morphology codes, and lexicons published under the SalitaNgDiyos GitHub account.',
      modules: mods
    };
    cache.set(key, cat);
    return cat;
  }

  async function load(repo, forceRefresh = false) {
    if (repo.official) return loadOfficial(forceRefresh);
    if (repo.ebible) { if (!ebibleRows) ebibleRows = ebibleList(await net().text(places().ebible + 'translations.csv')); return { about: 'Bibles in very many languages, which their publishers allow to be shared. Each comes as a USFM file, which Timotheos imports as one Bible.', modules: ebibleRows }; }
    if (forceRefresh || !cache.has(repo.url)) cache.set(repo.url, readCatalog(await net().text(repo.url), repo.url));
    return cache.get(repo.url);
  }

  /* ---------- the window ---------- */
  function rowsHtml(mods) {
    const f = filter.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = f.length ? mods.filter(m => f.every(w => m.find.includes(w))) : mods;
    if (!hit.length) return '<p class="hint">Nothing in this repository matches.</p>';
    const instNames = getInstalledModuleNames();
    const instKeys = new Set(instNames.map(normalizeModuleKey));
    const savedVers = (typeof state !== 'undefined' && state.settings && state.settings.officialModVersions) || {};
    const updatesByKey = new Map(findModuleUpdates(mods.filter(m => m.official), instNames, savedVers, {}).map(u => [u.key, u]));
    const more = hit.length > SHOW ? `<p class="hint">${SHOW} of ${hit.length} shown. Type a language or a title above to find the rest.</p>` : '';
    return hit.slice(0, SHOW).map(m => {
      const u = m.official ? updatesByKey.get(m.modKey) : null;
      const isInstalled = m.official && (instKeys.has(m.modKey) || !!savedVers[m.modKey] || added.has(m.id));
      const badge = u ? `<span class="dlbadge">Update available</span>` : '';
      const btnCls = u ? 'dlget updbtn' : 'dlget';
      const btnLabel = u ? 'Update' : (added.has(m.id) ? 'Added' : (isInstalled ? 'Installed' : 'Download'));
      const btnDis = !u && (added.has(m.id) || isInstalled);
      return `<div class="dlrow" data-id="${E(m.id)}"><div class="dlt"><b>${E(m.title)}</b>${badge}
      <span>${E([m.language + (m.own ? ' (' + m.own + ')' : ''), m.description, m.size ? mb(m.size) : ''].filter(Boolean).join(' · '))}</span>
      ${m.licence ? `<small>${E(m.licence.length > 220 ? m.licence.slice(0, 220) + '…' : m.licence)}</small>` : ''}</div>
      <button type="button" class="${btnCls}"${btnDis ? ' disabled' : ''}>${btnLabel}</button></div>`;
    }).join('') + more;
  }

  function frame() {
    const rs = repos();
    if (!rs.some(r => r.id === current)) current = 'official';
    const cur = rs.find(r => r.id === current);
    return `<div class="dlmods">
      <p class="small dlnote">Here Timotheos uses the internet to fetch repository lists and download the modules you choose. Official SalitaNgDiyos modules are checked for updates automatically on PC startup (you always choose whether to download them).</p>
      <div class="dlbar"><label>Repository <select id="dlRepo">${rs.map(r => `<option value="${r.id}"${r.id === current ? ' selected' : ''}>${E(r.name)}</option>`).join('')}</select></label>
        ${cur.official ? '<button type="button" id="dlCheckUpd">Check for updates</button>' : ''}
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

  async function recordOfficialVersion(m) {
    if (!m || !m.official || typeof state === 'undefined' || typeof save !== 'function') return;
    const vers = Object.assign({}, state.settings.officialModVersions || {});
    vers[m.modKey] = { repo: m.repo, tag: m.tag, stamp: m.stamp, updatedAt: m.updatedAt, file: m.file, title: m.title };
    const ign = Object.assign({}, state.settings.ignoredModUpdates || {});
    delete ign[m.modKey];
    await save({ officialModVersions: vers, ignoredModUpdates: ign });
  }

  async function show(forceRefresh = false) {
    const repo = repos().find(r => r.id === current); const mine = current;
    const list = q('#dlList'); if (!list) return;
    list.innerHTML = '<p class="hint">Fetching the list…</p>'; q('#dlAbout').textContent = '';
    let cat;
    try { cat = await load(repo, forceRefresh); }
    catch (e) { if (current === mine && q('#dlList')) q('#dlList').innerHTML = `<p class="hint bad">The list could not be fetched. ${E(e.message)}</p><p class="hint">Check that this device is connected to the internet, then choose the repository again.</p>`; return; }
    if (current !== mine || !q('#dlList')) return;
    q('#dlAbout').textContent = cat.about || '';
    q('#dlFind').classList.toggle('hidden', cat.modules.length < 8);
    q('#dlList').innerHTML = cat.modules.length ? rowsHtml(cat.modules) : '<p class="hint">This repository has no modules yet.</p>';
    q('#dlList').dataset.n = cat.modules.length;
  }

  async function downloadAndImportOne(m, onPct) {
    const path = await net().get(m.url, m.file, onPct);
    const r = await TimotheosModules.importModules([path], true);
    const res = (r && r.results) || [];
    const good = res.filter(x => x.status === 'imported' || x.status === 'updated');
    if (good.length || res.some(x => x.status === 'already')) {
      added.add(m.id);
      await recordOfficialVersion(m);
    }
    return { res, good };
  }

  async function fetchOne(id, btn) {
    if (busy) return; const repo = repos().find(r => r.id === current);
    const cat = await load(repo); const m = cat.modules.find(x => x.id === id); if (!m) return;
    busy = true; btn.disabled = true; btn.textContent = '…';
    status(`Downloading <b>${E(m.title)}</b>… <span id="dlPct"></span> <button type="button" id="dlStop">Stop</button>`);
    try {
      const { res, good } = await downloadAndImportOne(m, p => { const s = q('#dlPct'); if (s) s.textContent = p.total ? mb(p.done) + ' of ' + mb(p.total) : p.done ? mb(p.done) : ''; });
      if (good.length) status(`Added: <b>${E(good.map(x => x.title || x.name).join(', '))}</b>. It is in your library now.`);
      else if (res.some(x => x.status === 'already')) status(`<b>${E(m.title)}</b> is already in your library.`);
      else status(`<b>${E(m.title)}</b> was downloaded but could not be imported. ${E((res[0] && (res[0].reason || res[0].note)) || '')}`, true);
    } catch (e) { status(`<b>${E(m.title)}</b> was not downloaded. ${E(e.message)}`, true); }
    busy = false;
    if (q('#dlList')) q('#dlList').innerHTML = rowsHtml(cat.modules);
  }

  /* ---------- Official SalitaNgDiyos Module Update Notification Dialog ---------- */
  function showModuleUpdateNotice(updates) {
    if (!updates || !updates.length || document.getElementById('modUpdNotice')) return;
    const d = document.createElement('div');
    d.id = 'modUpdNotice'; d.className = 'updn'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
    d.innerHTML = `<div class="updn-box updates">
      <h3>Official module updates available</h3>
      <div class="updn-v">${updates.length} SalitaNgDiyos module${updates.length === 1 ? '' : 's'} have newer releases</div>
      <ul class="modupd-list">${updates.map((u, i) => `<li><label><input type="checkbox" class="mu-cb" data-idx="${i}" checked><span class="mu-info"><b>${E(u.mod.title)}</b><span class="mu-meta">${E(u.mod.repo)} · ${E(u.currentLabel)} → <b>${E(u.remoteLabel)}</b>${u.mod.size ? ' · ' + mb(u.mod.size) : ''}</span></span></label></li>`).join('')}</ul>
      <p id="muState" class="small"></p>
      <button type="button" class="updn-go" id="muGo">Download selected updates</button>
      <button type="button" class="updn-no" id="muLater">Not now</button>
      <button type="button" class="updn-no" id="muIgnore">Ignore these updates</button>
    </div>`;
    document.body.appendChild(d);
    const go = d.querySelector('#muGo'), later = d.querySelector('#muLater'), ign = d.querySelector('#muIgnore'), st = d.querySelector('#muState');
    let running = false;
    const close = () => d.remove();
    later.onclick = () => { if (!running) close(); };
    ign.onclick = async () => {
      if (running) return;
      const nextIgn = Object.assign({}, (state.settings && state.settings.ignoredModUpdates) || {});
      for (const u of updates) nextIgn[u.key] = u.remoteVer;
      try { await save({ ignoredModUpdates: nextIgn }); } catch (e) {}
      close();
    };
    go.onclick = async () => {
      if (running) return;
      const chosen = [...d.querySelectorAll('.mu-cb:checked')].map(cb => updates[+cb.dataset.idx]).filter(Boolean);
      if (!chosen.length) { st.textContent = 'Select at least one module to update.'; return; }
      running = true; go.disabled = true; later.disabled = true; ign.disabled = true;
      let done = 0, failed = 0;
      for (const u of chosen) {
        st.innerHTML = `Downloading <b>${E(u.mod.title)}</b> (${done + 1} of ${chosen.length})… <span id="muPct"></span>`;
        try {
          await downloadAndImportOne(u.mod, p => { const sp = d.querySelector('#muPct'); if (sp) sp.textContent = p.total ? mb(p.done) + ' of ' + mb(p.total) : p.done ? mb(p.done) : ''; });
          done++;
        } catch (e) { failed++; }
      }
      running = false;
      st.innerHTML = failed ? `Updated ${done} module(s); ${failed} failed.` : `Updated ${done} module${done === 1 ? '' : 's'} successfully.`;
      later.textContent = 'Close'; later.disabled = false;
      if (q('#dlList') && current === 'official') show(false);
    };
  }

  async function checkModuleUpdates(interactive = false) {
    if (!net()) return [];
    const cat = await loadOfficial(true);
    const savedVers = (typeof state !== 'undefined' && state.settings && state.settings.officialModVersions) || {};
    const ignored = interactive ? {} : ((typeof state !== 'undefined' && state.settings && state.settings.ignoredModUpdates) || {});
    const updates = findModuleUpdates(cat.modules, getInstalledModuleNames(), savedVers, ignored);
    if (updates.length) showModuleUpdateNotice(updates);
    else if (interactive) status('All installed SalitaNgDiyos modules are up to date.');
    return updates;
  }

  async function checkModuleUpdatesStartup() {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('mobile')) return;
    if (typeof state !== 'undefined' && state.settings && state.settings.updAuto === false) return;
    if (!net()) return;
    try {
      const env = (TimotheosHost.info().env || {});
      if (env.TIMOTHEOS_SCRIPT) return;
      await checkModuleUpdates(false);
    } catch (e) { /* quiet startup check */ }
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
    const chk = q('#dlCheckUpd');
    if (chk) chk.onclick = async () => {
      if (busy) return;
      chk.disabled = true; status('Checking SalitaNgDiyos repositories for module updates…');
      try { await checkModuleUpdates(true); await show(false); }
      catch (e) { status(`Could not check for updates: ${E(e.message)}`, true); }
      chk.disabled = false;
    };
    q('#dlAddBtn').onclick = () => { q('#dlAdd').classList.toggle('hidden'); const i = q('#dlAddUrl'); if (!q('#dlAdd').classList.contains('hidden')) i.focus(); };
    q('#dlAddNo').onclick = () => q('#dlAdd').classList.add('hidden');
    q('#dlAddGo').onclick = addRepo;
    q('#dlAddUrl').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addRepo(); } };
    const rm = q('#dlRemove'); if (rm) rm.onclick = async () => { const i = +current.slice(1); const list = userRepos(); list.splice(i, 1); await save({ repos: list }); current = 'official'; redraw(); status('Removed. Modules you already downloaded stay in your library.'); };
    q('#dlFind').oninput = async e => { filter = e.target.value; try { const cat = await load(repos().find(r => r.id === current)); if (q('#dlList')) q('#dlList').innerHTML = rowsHtml(cat.modules); } catch (err) { /* not loaded yet */ } };
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
  return { open, parseCsv, ebibleList, readCatalog, normalizeModuleKey, extractStamp, compareStamps, parseOfficialRelease, findModuleUpdates, checkModuleUpdates, checkModuleUpdatesStartup };
})();
if (typeof window !== 'undefined') window.TimotheosDownload = TimotheosDownload;
if (typeof module !== 'undefined' && module.exports) module.exports = TimotheosDownload;
