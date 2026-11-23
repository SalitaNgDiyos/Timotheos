/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Auto-imports module archives found inside Module Folders (and their sub-folders),
// tracks what was unpacked in settings.archiveSeen, and lets Rescan recover missing files
// without re-unpacking non-module archives or ignoring failed unpacks.
const fs = require('fs');
const path = require('path');
const { Library } = require('./library');
const { importFiles } = require('./importer');

function normPath(p) {
  let s = path.resolve(String(p || '')).replace(/\\/g, '/');
  if (s.length > 1 && !/^[A-Za-z]:\/$/.test(s)) s = s.replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
}

function isPathUnder(filePath, dirPath) {
  if (!filePath || !dirPath) return false;
  const nf = normPath(filePath);
  const nd = normPath(dirPath);
  if (nf === nd) return true;
  const prefix = nd.endsWith('/') ? nd : nd + '/';
  return nf.startsWith(prefix);
}

function clearArchiveSeenUnder(archiveSeen, dirPath) {
  const seen = Object.assign({}, archiveSeen || {});
  let removed = 0;
  for (const k of Object.keys(seen)) {
    if (isPathUnder(k, dirPath)) {
      delete seen[k];
      removed++;
    }
  }
  return { seen, removed };
}

function destExists(destPath) {
  try {
    return fs.existsSync(destPath) || fs.existsSync(destPath + '.timotheos-link');
  } catch (e) {
    return false;
  }
}

function shouldScanArchive(entry, sig, { forceMissing = false } = {}) {
  if (!entry) return true;
  if (typeof entry === 'string') {
    if (entry !== sig) return true;
    return !!forceMissing;
  }
  if (entry.sig !== sig) return true;
  if (entry.empty || entry.protected || entry.deleted) return false;
  if (!forceMissing) return false;
  const dests = Array.isArray(entry.dests) ? entry.dests : [];
  if (!dests.length) return true;
  return !dests.every(destExists);
}

async function scanArchives({ folders, destRoot, settings, userData, forceMissing = false, saveSettings }) {
  const seen = Object.assign({}, (settings && settings.archiveSeen) || {});
  const found = Library.findArchives(folders || []);
  const todo = found.filter(t => shouldScanArchive(seen[t.f], t.sig, { forceMissing }));
  if (!todo.length) {
    return { archives: 0, added: 0, already: 0, protectedN: 0, emptyCount: 0, errorCount: 0, results: [] };
  }
  let added = 0;
  let already = 0;
  let protectedN = 0;
  let emptyCount = 0;
  let errorCount = 0;
  const results = [];

  for (const t of todo) {
    let res;
    try {
      res = await importFiles([t.f], destRoot, settings || {}, userData || null, null, {});
    } catch (e) {
      errorCount++;
      continue;
    }
    const dests = [...new Set(res.map(r => r.dest).filter(Boolean))];
    const hadError = res.some(r => r.status === 'skipped' && /^could not (read archive|unpack|save)/i.test(r.reason || ''));
    const hadProtected = res.some(r => r.status === 'password');
    const modAdded = res.filter(r => r.status === 'imported' || r.status === 'updated').length;
    const modAlready = res.filter(r => r.status === 'already').length;
    const hadMod = dests.length > 0 || modAdded > 0 || modAlready > 0;

    added += modAdded;
    already += modAlready;
    if (hadProtected) protectedN++;
    if (hadError) errorCount++;
    else if (!hadMod && !hadProtected) emptyCount++;
    results.push(...res);

    if (!hadError) {
      if (hadMod) seen[t.f] = { sig: t.sig, dests };
      else if (hadProtected) seen[t.f] = { sig: t.sig, protected: true };
      else seen[t.f] = { sig: t.sig, empty: true };
      if (settings) settings.archiveSeen = seen;
      if (typeof saveSettings === 'function') saveSettings();
    }
  }

  return { archives: todo.length, added, already, protectedN, emptyCount, errorCount, results };
}

function markArchiveDestDeleted(archiveSeen, deletedPath) {
  const seen = Object.assign({}, archiveSeen || {});
  if (!deletedPath) return { seen, updated: 0 };
  let updated = 0;
  for (const k of Object.keys(seen)) {
    const entry = seen[k];
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.dests)) continue;
    const rem = entry.dests.filter(d => !isPathUnder(d, deletedPath) && !isPathUnder(deletedPath, d));
    if (rem.length !== entry.dests.length) {
      seen[k] = rem.length
        ? Object.assign({}, entry, { dests: rem })
        : Object.assign({}, entry, { dests: [], deleted: true });
      updated++;
    }
  }
  return { seen, updated };
}

module.exports = { isPathUnder, clearArchiveSeenUnder, markArchiveDestDeleted, shouldScanArchive, scanArchives };
