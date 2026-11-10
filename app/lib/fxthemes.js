/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Firefox themes already installed in the user's own Firefox: found in the Firefox profiles on this computer, copied
// (manifest.json and the pictures it names) into Timotheos's data folder, and offered as skins. Nothing is downloaded and
// nothing leaves the computer; the copies are for this user only and keep their own authors' terms.
const fs = require('fs');
const path = require('path');
const zip = require('./zip');

/** the folders that hold Firefox profiles on this system (Windows, macOS, Linux incl. Snap and Flatpak) */
function profileRoots(home, platform, env = {}) {
  const j = (...p) => path.join(home, ...p);
  const out = [];
  if (platform === 'win32') {
    out.push(path.join(env.APPDATA || j('AppData', 'Roaming'), 'Mozilla', 'Firefox', 'Profiles'));
    const pk = path.join(env.LOCALAPPDATA || j('AppData', 'Local'), 'Packages');   // Firefox from the Microsoft Store
    try { for (const d of fs.readdirSync(pk)) if (/^Mozilla\.Firefox/i.test(d)) out.push(path.join(pk, d, 'LocalCache', 'Roaming', 'Mozilla', 'Firefox', 'Profiles')); } catch (e) { /* none */ }
  } else if (platform === 'darwin') {
    out.push(j('Library', 'Application Support', 'Firefox', 'Profiles'));
  } else {
    out.push(j('.mozilla', 'firefox'), j('snap', 'firefox', 'common', '.mozilla', 'firefox'), j('.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'));
  }
  return out;
}

function profiles(home, platform, env) {
  const out = [];
  for (const r of profileRoots(home, platform, env)) {
    let names = []; try { names = fs.readdirSync(r); } catch (e) { continue; }
    for (const n of names) { const p = path.join(r, n); if (fs.existsSync(path.join(p, 'extensions.json')) || fs.existsSync(path.join(p, 'extensions'))) out.push(p); }
  }
  return out;
}

/** the installed themes of one profile: from extensions.json, else every .xpi in its extensions folder that is a theme */
function themesOf(prof) {
  const found = [];
  try {
    const j = JSON.parse(fs.readFileSync(path.join(prof, 'extensions.json'), 'utf8'));
    for (const a of j.addons || []) {
      if (a.type !== 'theme' || !a.path || a.location === 'app-builtin' || a.location === 'app-system-defaults') continue;
      if (fs.existsSync(a.path)) found.push({ src: a.path, id: a.id, active: !!a.active, name: a.defaultLocale && a.defaultLocale.name, author: a.defaultLocale && a.defaultLocale.creator });
    }
  } catch (e) { /* no list: look at the files */ }
  if (!found.length) {
    let fl = []; try { fl = fs.readdirSync(path.join(prof, 'extensions')); } catch (e) { /* none */ }
    for (const f of fl) { const src = path.join(prof, 'extensions', f); found.push({ src, id: f.replace(/\.xpi$/i, ''), probe: true }); }
  }
  return found;
}

/** read one theme (an .xpi file or an unpacked folder): its manifest, messages and the picture files it names */
function readTheme(src) {
  let get;
  if (fs.statSync(src).isDirectory()) get = n => { const p = path.join(src, n); return fs.existsSync(p) ? fs.readFileSync(p) : null; };
  else {
    const buf = fs.readFileSync(src); const ents = zip.entries(buf); const by = new Map(ents.map(e => [e.name.replace(/^\.?\//, ''), e]));
    get = n => { const e = by.get(String(n).replace(/^\.?\//, '')); return e ? zip.extract(buf, e) : null; };
  }
  const mb = get('manifest.json'); if (!mb) return null;
  const m = JSON.parse(mb.toString('utf8').replace(/^﻿/, ''));
  if (!m.theme) return null;
  const msg = k => { const mm = /^__MSG_(.+)__$/.exec(k || ''); if (!mm) return k; for (const loc of [m.default_locale, 'en', 'en_US', 'en-US']) { if (!loc) continue; const b = get(`_locales/${loc}/messages.json`); if (!b) continue; try { const o = JSON.parse(b.toString('utf8').replace(/^﻿/, '')); const hit = Object.entries(o).find(([n]) => n.toLowerCase() === mm[1].toLowerCase()); if (hit) return hit[1].message; } catch (e) { /* */ } } return mm[1]; };
  const imgs = m.theme.images || {}; const files = {};
  for (const p of [imgs.theme_frame, imgs.headerURL, ...(imgs.additional_backgrounds || [])].filter(Boolean)) { const b = get(p); if (b) files[String(p).replace(/^\.?\//, '')] = b; }
  return { manifest: m, name: msg(m.name), author: typeof m.author === 'string' ? msg(m.author) : (m.developer && m.developer.name) || '', version: m.version || '', files };
}

/** copy every installed Firefox theme into dest; returns what was found */
function importInstalled(home, platform, env, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const seen = new Set(); const done = []; const profs = profiles(home, platform, env);
  for (const prof of profs) for (const t of themesOf(prof)) {
    let th; try { th = readTheme(t.src); } catch (e) { continue; }
    if (!th) continue;
    const id = String(t.id || th.name).replace(/[^A-Za-z0-9._@-]+/g, '_').slice(0, 80);
    if (seen.has(id)) continue; seen.add(id);
    const d = path.join(dest, id); fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify(th.manifest));
    for (const [n, b] of Object.entries(th.files)) { const p = path.join(d, 'files', n); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
    fs.writeFileSync(path.join(d, 'meta.json'), JSON.stringify({ id, name: t.name || th.name, author: t.author || th.author, version: th.version, from: t.src, profile: path.basename(prof), imported: new Date().toISOString() }));
    done.push({ id, name: t.name || th.name });
  }
  return { profiles: profs.length, themes: done };
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', apng: 'image/apng' };
function cssColor(c) { if (Array.isArray(c)) return c.length > 3 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${c[3]})` : `rgb(${c[0]}, ${c[1]}, ${c[2]})`; return c == null ? c : String(c); }

/** the imported themes, in the same shape as the bundled ones (pictures as data: addresses) */
function list(dest) {
  let ids = []; try { ids = fs.readdirSync(dest); } catch (e) { return []; }
  const out = [];
  for (const id of ids.sort()) {
    try {
      const d = path.join(dest, id); const meta = JSON.parse(fs.readFileSync(path.join(d, 'meta.json'), 'utf8')); const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8'));
      const th = m.theme || {}; const im = th.images || {}; const pr = th.properties || {};
      const url = p => { const f = path.join(d, 'files', String(p).replace(/^\.?\//, '')); if (!fs.existsSync(f)) return null; const ext = (p.split('.').pop() || '').toLowerCase(); return `data:${MIME[ext] || 'image/png'};base64,${fs.readFileSync(f).toString('base64')}`; };
      const layers = [];
      const fr = im.theme_frame || im.headerURL; if (fr) { const u = url(fr); if (u) layers.push({ src: u, pos: 'right top', rep: 'no-repeat' }); }
      (im.additional_backgrounds || []).forEach((p, i) => { const u = url(p); if (!u) return; const al = pr.additional_backgrounds_alignment || ['right top'], ti = pr.additional_backgrounds_tiling || ['no-repeat']; layers.push({ src: u, pos: al[Math.min(i, al.length - 1)], rep: ti[Math.min(i, ti.length - 1)] }); });
      const colors = {}; for (const [k, v] of Object.entries(th.colors || {})) colors[k] = cssColor(v);
      if (colors.accentcolor && !colors.frame) colors.frame = colors.accentcolor;
      if (colors.textcolor && !colors.tab_background_text) colors.tab_background_text = colors.textcolor;
      out.push({ key: 'fxu-' + id, name: meta.name, author: meta.author || '', licence: 'mine', url: '', version: meta.version, colors, layers, mine: true });
    } catch (e) { /* a damaged copy is left out */ }
  }
  return out;
}

module.exports = { profileRoots, profiles, themesOf, readTheme, importInstalled, list };
