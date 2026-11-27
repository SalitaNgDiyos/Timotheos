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
    wordmodules: 'https://www.theword.net/app/downloadmodules/wordmodulescom.list.php',
    catalog: 'https://raw.githubusercontent.com/SalitaNgDiyos/Timotheos/timotheos-tauri/catalog/catalog.json',
    ebible: 'https://ebible.org/Scriptures/'
  };
  const APP_REPOS = new Set(['timotheos', 'dark-skinned-ibiblia']);
  const AMB_REPO = 'ang-malayang-biblia-translation';
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
    const p = places();
    return [
      { id: 'official', name: 'SalitaNgDiyos Official', official: true },
      { id: 'wordmodules', name: 'WordModules.com (theWord)', url: p.wordmodules },
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

  const ENCRYPTED_FILE_RE = /\.(?:ontx|otx|ntx|twx|enc|encrypted|locked)(?:\.(?:twzip|zip|7z|rar|tar|gz|bz2|xz|zst))?$/i;
  const ENCRYPTED_TEXT_RE = /\b(?:encrypted|locked|drm[- ]?protected|password[- ]?protected|requires\s+(?:a\s+)?(?:key|unlock|password))\b/i;
  const TRUTHY_FLAG = v => v === true || v === 1 || /^(?:1|true|yes)$/i.test(String(v || '').trim());
  function isEncryptedModule(info) {
    if (!info) return false;
    if (TRUTHY_FLAG(info.encrypted) || TRUTHY_FLAG(info.locked) || TRUTHY_FLAG(info.protected) || TRUTHY_FLAG(info.secure) || TRUTHY_FLAG(info.drm) || TRUTHY_FLAG(info.paid)) return true;
    if (info.price || info.produrl || info.sku) return true;
    const file = String(info.file || '');
    const url = String(info.url || '').split(/[?#]/)[0];
    if (ENCRYPTED_FILE_RE.test(file) || ENCRYPTED_FILE_RE.test(url)) return true;
    const text = `${info.title || ''} ${info.description || ''} ${file}`;
    if (ENCRYPTED_TEXT_RE.test(text)) return true;
    return false;
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
      if (isEncryptedModule({ file: a.name, url: a.browser_download_url, title: a.name })) continue;
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
        id: `official:${repoName}:${a.name.toLowerCase()}`,
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

  function isAmbModuleName(name) {
    return /^amb\+?\.(?:nt|ont|ot)$/i.test(String(name || '').trim());
  }

  /** Find whether the SalitaNgDiyos AMB release has a newer version than this device's saved live AMB signature */
  function findLiveAmbUpdate(remoteMods, installedNames, savedAmb = null) {
    const installedAmb = [];
    const seen = new Set();
    for (const nm of (installedNames || [])) {
      const s = String(nm || '').trim();
      const low = s.toLowerCase();
      if (isAmbModuleName(s) && !seen.has(low)) {
        seen.add(low);
        installedAmb.push(s);
      }
    }
    if (!installedAmb.length) return null;

    const candidates = (remoteMods || []).filter(m =>
      m && m.url && isAmbModuleName(m.file) &&
      (!m.repo || String(m.repo).toLowerCase() === AMB_REPO) &&
      /\.(?:nt|ont)$/i.test(String(m.file || ''))
    );
    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const ca = compareStamps(b.stamp || extractStamp(b.updatedAt), a.stamp || extractStamp(a.updatedAt));
      if (ca) return ca;
      if ((b.updatedAt || '') !== (a.updatedAt || '')) return (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1;
      const aPlus = /^amb\+/i.test(a.file || '') ? 1 : 0;
      const bPlus = /^amb\+/i.test(b.file || '') ? 1 : 0;
      return bPlus - aPlus;
    });

    const m = candidates[0];
    const remoteSig = [m.tag || '', m.updatedAt || '', m.size ? String(m.size) : ''].filter(Boolean).join('|');
    if (savedAmb && savedAmb.sig && remoteSig && savedAmb.sig === remoteSig) return null;
    if (savedAmb && savedAmb.updatedAt && m.updatedAt && m.updatedAt === savedAmb.updatedAt &&
        savedAmb.tag === (m.tag || '') && (!m.size || savedAmb.size === m.size)) return null;

    return { mod: m, targetFiles: installedAmb, remoteSig };
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

  function decodeXmlEnt(s) {
    return String(s || '')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  function xmlAttrs(tag) {
    const out = {};
    for (const m of String(tag || '').matchAll(/([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g)) {
      out[m[1].toLowerCase()] = decodeXmlEnt(m[2]);
    }
    return out;
  }
  const TW_LANGS = { eng: 'English', grc: 'Greek', heb: 'Hebrew', por: 'Portuguese', spa: 'Spanish', fra: 'French', deu: 'German', ita: 'Italian', rus: 'Russian', ara: 'Arabic', zho: 'Chinese', tgl: 'Tagalog', lat: 'Latin', nld: 'Dutch', pol: 'Polish', kor: 'Korean', jpn: 'Japanese' };
  const TW_IMPORTABLE_RE = /\.(twzip|zip|7z|rar|tar|gz|bz2|xz|zst|ont|ot|nt|twm|usfm|sfm|usfx|mybible)$/i;
  const TW_NONMOD_TYPE_RE = /^(?:language files|skins|spelling dictionaries|program|help)$/i;
  function readTheWordXml(text, base) {
    const clean = String(text || '').replace(/^\uFEFF/, '');
    const rootM = /<modules\b([^>]*)>/i.exec(clean);
    if (!rootM) throw new Error('Not a valid theWord XML repository.');
    const rootA = xmlAttrs(rootM[1]);
    const baseUrl = (rootA.baseurl || base || '').replace(/^http:\/\/www\.theword\.net\//i, 'https://www.theword.net/');
    const mods = [];
    for (const m of clean.matchAll(/<module\b([^>]*?)\/?>/gi)) {
      const a = xmlAttrs(m[1]);
      if (!a.title || !a.url) continue;
      if (TW_NONMOD_TYPE_RE.test((a.type || '').trim())) continue;
      let u; try { u = new URL(a.url, baseUrl || base).href; } catch (e) { continue; }
      u = u.replace(/^http:\/\/www\.theword\.net\//i, 'https://www.theword.net/');
      if (!okUrl(u)) continue;
      const file = decodeURIComponent(u.split(/[?#]/)[0].split('/').pop() || 'module').replace(/[\\/:*?"<>|]+/g, '_');
      if (isEncryptedModule({ ...a, file, url: u })) continue; // skip encrypted/locked/paid items
      if (!TW_IMPORTABLE_RE.test(file) || /\.(?:lng|skn|chm)\.twzip$/i.test(file) || /^(?:theword[.\-]|spelling\.)/i.test(file)) continue;
      const lang = TW_LANGS[(a.lang || '').toLowerCase()] || a.lang || '';
      const ver = (a.vermajor && a.verminor) ? `v${a.vermajor}.${a.verminor}` : '';
      const desc = [a.type, a.author, ver, a.verdate ? `updated ${a.verdate}` : ''].filter(Boolean).join(' · ');
      const kb = +a.dlsizekb || 0;
      mods.push({
        id: u, title: a.title, language: lang, own: '', description: desc,
        licence: a.author ? `Author: ${a.author}` : '', size: kb ? kb * 1024 : 0, file, url: u,
        find: `${a.title} ${a.abbr || ''} ${lang} ${a.type || ''} ${a.author || ''} ${file}`.toLowerCase()
      });
    }
    return {
      name: rootA.source || 'theWord Repository',
      about: `Free unencrypted modules from ${rootA.source || 'this theWord repository'} (${mods.length} modules; encrypted, paid, and .exe files are filtered out).`,
      modules: mods
    };
  }
  function readCatalog(text, base) {
    const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
    if (/^<\?xml|^<modules\b/i.test(trimmed)) return readTheWordXml(trimmed, base);
    let j; try { j = JSON.parse(trimmed); } catch (e) { throw new Error('This address does not hold a Timotheos JSON catalog or theWord XML repository.'); }
    const list = Array.isArray(j) ? j : j && Array.isArray(j.modules) ? j.modules : null;
    if (!list) throw new Error('This address does not hold a Timotheos catalog (no "modules" list in it).');
    const mods = [];
    for (const m of list) {
      if (!m || !m.title || !m.url) continue;
      let u; try { u = new URL(String(m.url), base).href; } catch (e) { continue; }
      if (!okUrl(u)) continue;
      const file = String(m.file || decodeURIComponent(u.split(/[?#]/)[0].split('/').pop()) || 'module').replace(/[\\/:*?"<>|]+/g, '_');
      if (isEncryptedModule({ ...m, file, url: u })) continue;
      mods.push({ id: u, title: String(m.title), language: String(m.language || ''), own: '', description: [m.kind, m.description].filter(Boolean).join(' · '),
        licence: String(m.licence || m.license || ''), size: +m.size || 0, file, url: u,
        find: (m.title + ' ' + (m.language || '') + ' ' + (m.description || '') + ' ' + (m.kind || '')).toLowerCase() });
    }
    return { name: Array.isArray(j) ? '' : String(j.name || ''), about: Array.isArray(j) ? '' : String(j.about || ''), modules: mods };
  }

  const GH_RESERVED = new Set(['settings', 'orgs', 'marketplace', 'topics', 'explore', 'search', 'notifications', 'login', 'signup', 'sponsors', 'features', 'pricing', 'about', 'collections', 'events', 'pulls', 'issues']);
  function rewriteGitHubBlobUrl(u) {
    try {
      const p = new URL(u);
      if (!/^(?:www\.)?github\.com$/i.test(p.hostname)) return u;
      const m = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(p.pathname);
      if (!m) return u;
      return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
    } catch (e) { return u; }
  }
  function parseGitHubRepoUrl(u) {
    try {
      const p = new URL(String(u || '').trim());
      if (p.protocol !== 'https:' || !/^(?:www\.)?github\.com$/i.test(p.hostname)) return null;
      const segs = p.pathname.split('/').filter(Boolean);
      if (segs.length < 2) return null;
      const owner = segs[0];
      const repo = segs[1].replace(/\.git$/i, '');
      if (!owner || !repo || GH_RESERVED.has(owner.toLowerCase())) return null;
      if (segs.length > 2 && !/^(releases|tree)$/i.test(segs[2])) return null;
      return { owner, repo, url: `https://github.com/${owner}/${repo}` };
    } catch (e) { return null; }
  }
  function parseHumanSize(s) {
    const m = /([0-9]+(?:\.[0-9]+)?)\s*(bytes?|kb|kib|mb|mib|gb|gib)/i.exec(String(s || ''));
    if (!m) return 0;
    const n = parseFloat(m[1]), unit = m[2].toLowerCase();
    if (unit.startsWith('g')) return Math.round(n * 1073741824);
    if (unit.startsWith('m')) return Math.round(n * 1048576);
    if (unit.startsWith('k')) return Math.round(n * 1024);
    return Math.round(n);
  }
  function parseGitHubReposHtml(html, owner) {
    const out = [], seen = new Set();
    const escOwner = String(owner || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`href="/${escOwner}/([^"/?#]+)"`, 'gi');
    let m;
    while ((m = re.exec(String(html || '')))) {
      const name = decodeURIComponent(m[1]);
      const low = name.toLowerCase();
      if (!name || APP_REPOS.has(low) || seen.has(low)) continue;
      seen.add(low);
      out.push({ name, description: '', archived: false });
    }
    return out;
  }
  function parseGitHubExpandedAssets(html, owner, repoName, tag, repoDesc = '') {
    const text = String(html || '');
    const items = text.split(/<li\b/i).slice(1);
    const blocks = items.length ? items : [text];
    const assets = [];
    const seenHref = new Set();
    let pubDate = '';
    for (const blk of blocks) {
      const lm = /href="(\/[^"]+\/releases\/download\/[^"]+)"/i.exec(blk);
      if (!lm) continue;
      const href = decodeXmlEnt(lm[1]);
      if (seenHref.has(href)) continue;
      seenHref.add(href);
      const rawName = href.split(/[?#]/)[0].split('/').pop() || '';
      let name = rawName;
      try { name = decodeURIComponent(rawName); } catch (e) { /* keep rawName */ }
      if (!name) continue;
      const dm = /datetime="([^"]+)"/i.exec(blk);
      const updatedAt = dm ? dm[1] : '';
      if (updatedAt && !pubDate) pubDate = updatedAt;
      const sm = />\s*([0-9]+(?:\.[0-9]+)?\s*(?:Bytes?|KB|KiB|MB|MiB|GB|GiB))\s*</i.exec(blk);
      const size = sm ? parseHumanSize(sm[1]) : 0;
      assets.push({ name, size, updated_at: updatedAt, browser_download_url: 'https://github.com' + href });
    }
    return parseOfficialRelease({ name: repoName, description: repoDesc }, { tag_name: tag, published_at: pubDate, assets });
  }
  function dedupeModules(mods) {
    const byKey = new Map();
    for (const m of (mods || [])) {
      if (!m) continue;
      const fileKey = String(m.file || '').trim().toLowerCase();
      const urlKey = String(m.url || '').split(/[?#]/)[0].toLowerCase();
      const k = fileKey || urlKey || String(m.id || '');
      if (!k) continue;
      const prev = byKey.get(k);
      if (!prev) { byKey.set(k, m); continue; }
      const cmp = compareStamps(m.stamp || extractStamp(m.updatedAt), prev.stamp || extractStamp(prev.updatedAt));
      if (cmp > 0 || (cmp === 0 && (m.updatedAt || '') > (prev.updatedAt || ''))) byKey.set(k, m);
    }
    return [...byKey.values()];
  }
  const isRateLimitErr = e => /(?:error\s*(?:403|429)|rate limit)/i.test(String(e && e.message || e || ''));

  async function fetchGitHubRepoViaWeb(owner, repoName, repoDesc = '') {
    const relHtml = await net().text(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases/latest`);
    const m = /releases\/expanded_assets\/([^"'<>\s?#]+)/i.exec(relHtml);
    if (!m) return [];
    const tagEnc = m[1];
    let tag = tagEnc;
    try { tag = decodeURIComponent(tagEnc); } catch (e) { /* keep tagEnc */ }
    const assetsHtml = await net().text(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases/expanded_assets/${tagEnc}`);
    return parseGitHubExpandedAssets(assetsHtml, owner, repoName, tag, repoDesc);
  }
  async function fetchGitHubRepoModules(owner, repoName, repoDesc = '', preferWeb = false) {
    if (!preferWeb) {
      try {
        const rels = JSON.parse(await net().text(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/releases?per_page=3`));
        const out = [];
        for (const rel of (Array.isArray(rels) ? rels : [])) out.push(...parseOfficialRelease({ name: repoName, description: repoDesc }, rel));
        return { mods: dedupeModules(out), rateLimited: false };
      } catch (e) {
        if (!isRateLimitErr(e)) return { mods: [], rateLimited: false };
      }
    }
    try {
      return { mods: dedupeModules(await fetchGitHubRepoViaWeb(owner, repoName, repoDesc)), rateLimited: preferWeb || true };
    } catch (e) {
      return { mods: [], rateLimited: preferWeb };
    }
  }

  async function loadOfficial(forceRefresh = false) {
    const key = '__official__';
    if (!forceRefresh && cache.has(key)) return cache.get(key);
    const p = places();
    let rawRepos = null, useWeb = false;
    try {
      rawRepos = JSON.parse(await net().text(p.officialApi));
    } catch (e) {
      if (!isRateLimitErr(e)) throw e;
      useWeb = true;
      const html = await net().text(`https://github.com/${encodeURIComponent(p.officialUser)}?tab=repositories`);
      rawRepos = parseGitHubReposHtml(html, p.officialUser);
    }
    const modRepos = (Array.isArray(rawRepos) ? rawRepos : []).filter(r => r && r.name && !r.archived && !APP_REPOS.has(r.name.toLowerCase()));
    const rawMods = [];
    for (let i = 0; i < modRepos.length; i += 3) {
      const batch = modRepos.slice(i, i + 3);
      const res = await Promise.all(batch.map(r => fetchGitHubRepoModules(p.officialUser, r.name, r.description || '', useWeb)));
      for (const item of res) {
        if (item.rateLimited) useWeb = true;
        rawMods.push(...item.mods);
      }
    }
    const mods = dedupeModules(rawMods).sort((a, b) => a.repo.localeCompare(b.repo) || a.title.localeCompare(b.title));
    const cat = {
      name: 'SalitaNgDiyos Official',
      about: 'Official Bible translations, Septuagint texts, interlinears, morphology codes, and lexicons published under the SalitaNgDiyos GitHub account.',
      modules: mods
    };
    cache.set(key, cat);
    return cat;
  }

  async function loadGitHubRepo(gh, forceRefresh = false) {
    const key = `gh:${gh.owner.toLowerCase()}/${gh.repo.toLowerCase()}`;
    if (!forceRefresh && cache.has(key)) return cache.get(key);
    let mods = (await fetchGitHubRepoModules(gh.owner, gh.repo, '', false)).mods;
    if (!mods.length) {
      try {
        const rawCat = readCatalog(await net().text(`https://raw.githubusercontent.com/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}/HEAD/catalog.json`), gh.url);
        if (rawCat && rawCat.modules && rawCat.modules.length) {
          const catOut = { name: rawCat.name || gh.repo, about: rawCat.about || `Modules from GitHub repository ${gh.owner}/${gh.repo}.`, modules: dedupeModules(rawCat.modules) };
          cache.set(key, catOut);
          return catOut;
        }
      } catch (e) { /* no catalog.json in repo */ }
    }
    if (!mods.length) throw new Error('This GitHub repository has no downloadable module releases yet.');
    const cat = {
      name: gh.repo,
      about: `Modules from GitHub repository ${gh.owner}/${gh.repo}.`,
      modules: mods.sort((a, b) => a.title.localeCompare(b.title))
    };
    cache.set(key, cat);
    return cat;
  }

  async function load(repo, forceRefresh = false) {
    if (repo.official) return loadOfficial(forceRefresh);
    if (repo.ebible) { if (!ebibleRows) ebibleRows = ebibleList(await net().text(places().ebible + 'translations.csv')); return { about: 'Bibles in very many languages, which their publishers allow to be shared. Each comes as a USFM file, which Timotheos imports as one Bible.', modules: ebibleRows }; }
    const gh = repo.url && parseGitHubRepoUrl(repo.url);
    if (gh) return loadGitHubRepo(gh, forceRefresh);
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
      <p class="small dlnote">Here Timotheos uses the internet to fetch repository lists and download the modules you choose. Official SalitaNgDiyos modules are checked for updates automatically on startup on both PC and Android (you always choose whether to download them).</p>
      <div class="dlbar"><label>Repository <select id="dlRepo">${rs.map(r => `<option value="${r.id}"${r.id === current ? ' selected' : ''}>${E(r.name)}</option>`).join('')}</select></label>
        ${cur.official ? '<button type="button" id="dlCheckUpd">Check for updates</button>' : ''}
        <button type="button" id="dlAddBtn">Add a repository…</button>${cur.user ? '<button type="button" id="dlRemove">Remove this one</button>' : ''}</div>
      <div id="dlAdd" class="dladd hidden"><label>Address of a catalog or GitHub repository (https://…) <input id="dlAddUrl" type="url" placeholder="https://example.org/catalog.json or https://github.com/owner/repo" autocomplete="off" spellcheck="false"></label>
        <div class="dladd-btns"><button type="button" id="dlAddGo">Add</button><button type="button" id="dlAddNo">Cancel</button></div>
        <p class="small">Enter a Timotheos catalog address or a GitHub repository URL whose releases contain modules. Add only addresses you trust: the modules come from that site, not from Timotheos.</p></div>
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

  async function autoUpdateBundledAmb(cat = null) {
    if (typeof state === 'undefined' || (state.settings && state.settings.ambAutoUpdate === false)) return null;
    if (!net()) return null;
    let mods = cat && Array.isArray(cat.modules) ? cat.modules : null;
    if (!mods) {
      const p = places();
      const res = await fetchGitHubRepoModules(p.officialUser, 'Ang-Malayang-Biblia-Translation', '', false);
      mods = res && Array.isArray(res.mods) ? res.mods : [];
    }
    const upd = findLiveAmbUpdate(mods, getInstalledModuleNames(), state.settings && state.settings.ambLiveVersion);
    if (!upd) return null;

    let updatedCount = 0;
    let touched = false;
    for (const targetFile of upd.targetFiles) {
      try {
        const tmpPath = await net().get(upd.mod.url, targetFile);
        const r = await TimotheosModules.importModules([tmpPath], true);
        const res = (r && r.results) || [];
        if (res.some(x => x.status === 'updated' || x.status === 'imported')) updatedCount++;
        if (res.some(x => x.status === 'updated' || x.status === 'imported' || x.status === 'already')) touched = true;
      } catch (e) { /* keep trying remaining filename if both amb.nt and amb+.nt exist */ }
    }
    if (!touched) return null;

    if (typeof save === 'function') {
      const vers = Object.assign({}, (state.settings && state.settings.officialModVersions) || {});
      const ambKey = upd.mod.modKey || normalizeModuleKey(upd.mod.file);
      vers[ambKey] = { repo: upd.mod.repo || 'Ang-Malayang-Biblia-Translation', tag: upd.mod.tag, stamp: upd.mod.stamp, updatedAt: upd.mod.updatedAt, file: upd.mod.file, title: upd.mod.title };
      for (const tf of upd.targetFiles) {
        const tk = normalizeModuleKey(tf);
        if (tk) vers[tk] = vers[ambKey];
      }
      await save({
        ambLiveVersion: { sig: upd.remoteSig, tag: upd.mod.tag, updatedAt: upd.mod.updatedAt, size: upd.mod.size, file: upd.mod.file },
        officialModVersions: vers
      });
    }
    if (updatedCount > 0 && typeof window !== 'undefined') {
      try { if (state && state.infos && typeof state.infos.clear === 'function') state.infos.clear(); } catch (e) {}
      try { if (typeof window.renderChapter === 'function') await window.renderChapter(false); } catch (e) {}
      if (window.TimotheosStudy && TimotheosStudy.flash) {
        TimotheosStudy.flash(`Ang Malayang Biblia (${upd.mod.tag || 'latest'}) updated automatically.`);
      }
    }
    return { updated: updatedCount > 0, mod: upd.mod };
  }

  async function checkModuleUpdates(interactive = false) {
    if (!net()) return [];
    const cat = await loadOfficial(true);
    let ambRes = null;
    try { ambRes = await autoUpdateBundledAmb(cat); } catch (e) { /* keep checking other modules */ }
    const savedVers = (typeof state !== 'undefined' && state.settings && state.settings.officialModVersions) || {};
    const ignored = interactive ? {} : ((typeof state !== 'undefined' && state.settings && state.settings.ignoredModUpdates) || {});
    const updates = findModuleUpdates(cat.modules, getInstalledModuleNames(), savedVers, ignored);
    if (updates.length) showModuleUpdateNotice(updates);
    else if (interactive) {
      status(ambRes && ambRes.updated
        ? `Ang Malayang Biblia (${E(ambRes.mod.tag || 'latest')}) was updated automatically. All other SalitaNgDiyos modules are up to date.`
        : 'All installed SalitaNgDiyos modules are up to date.');
    }
    return updates;
  }

  async function checkModuleUpdatesStartup() {
    if (typeof state !== 'undefined' && state.settings && state.settings.updAuto === false) return;
    if (!net()) return;
    try {
      const env = (TimotheosHost.info().env || {});
      if (env.TIMOTHEOS_SCRIPT) return;
      try { await autoUpdateBundledAmb(); } catch (e) { /* quiet live AMB check */ }
      await checkModuleUpdates(false);
    } catch (e) { /* quiet startup check */ }
  }

  async function addRepo() {
    const rawUrl = (q('#dlAddUrl').value || '').trim();
    const url = rewriteGitHubBlobUrl(rawUrl);
    if (!okUrl(url)) return status('Give an address that starts with https://', true);
    const gh = parseGitHubRepoUrl(url);
    const storeUrl = gh ? gh.url : url;
    if (repos().some(r => r.url && (r.url === storeUrl || (gh && r.url.toLowerCase() === storeUrl.toLowerCase())))) return status('That repository is already in the list.', true);
    status(gh ? 'Reading the GitHub repository releases…' : 'Reading the catalog…');
    let cat;
    try {
      cat = gh ? await loadGitHubRepo(gh, true) : readCatalog(await net().text(url), url);
    } catch (e) { return status(`Not added. ${E(e.message)}`, true); }
    if (!gh) cache.set(storeUrl, cat);
    let name = cat.name; if (!name) { try { name = new URL(storeUrl).hostname; } catch (e) { name = storeUrl; } }
    const list = userRepos().concat([{ name: name.slice(0, 60), url: storeUrl }]);
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
  return { open, repos, isEncryptedModule, parseCsv, ebibleList, readCatalog, readTheWordXml, normalizeModuleKey, extractStamp, compareStamps, parseOfficialRelease, findModuleUpdates, isAmbModuleName, findLiveAmbUpdate, autoUpdateBundledAmb, checkModuleUpdates, checkModuleUpdatesStartup, dedupeModules, parseGitHubRepoUrl, rewriteGitHubBlobUrl, parseHumanSize, parseGitHubExpandedAssets, parseGitHubReposHtml };
})();
if (typeof window !== 'undefined') window.TimotheosDownload = TimotheosDownload;
if (typeof module !== 'undefined' && module.exports) module.exports = TimotheosDownload;
