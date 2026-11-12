/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Back up and restore the user's own study data (notes, highlights, bookmarks, verse lists, reading plans, ranges,
// marks in books) as one file that can be kept elsewhere or carried to another device.
//   pack(data)            -> the text of a backup file
//   read(text)            -> { data, made, counts } or throws a plain-worded Error
//   merge(mine, theirs)   -> what is here, plus what the backup has and this device lacks (nothing here is lost)
const KIND = 'timotheos-study-backup';
const KEYS = ['bookmarks', 'lists', 'currentList', 'highlights', 'notes', 'plans', 'ranges', 'bookMarks'];

function counts(d) {
  const n = o => (o && typeof o === 'object' ? Object.keys(o).length : 0);
  return {
    notes: n(d.notes),
    highlights: Object.values(d.highlights || {}).reduce((s, b) => s + n(b), 0),
    bookmarks: (d.bookmarks || []).filter(Boolean).length,
    lists: n(d.lists), listVerses: Object.values(d.lists || {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0),
    plans: (d.plans || []).length,
    bookMarks: Object.values(d.bookMarks || {}).reduce((s, m) => s + n(m), 0),
  };
}
function pack(data, version) {
  const out = {}; for (const k of KEYS) if (data[k] !== undefined) out[k] = data[k];
  return JSON.stringify({ kind: KIND, format: 1, app: 'Timotheos', appVersion: version || '', made: new Date().toISOString(), data: out });
}
function read(text) {
  let j; try { j = JSON.parse(String(text).replace(/^﻿/, '')); } catch (e) { throw new Error('This file is not a Timotheos study backup (it could not be read).'); }
  if (!j || j.kind !== KIND || !j.data || typeof j.data !== 'object') throw new Error('This file is not a Timotheos study backup.');
  if (j.format > 1) throw new Error('This backup was made by a newer Timotheos. Update Timotheos, then restore it.');
  const d = {}; for (const k of KEYS) if (j.data[k] !== undefined) d[k] = j.data[k];
  if (d.notes && typeof d.notes !== 'object') throw new Error('This backup is damaged (its notes cannot be read).');
  return { data: d, made: j.made || '', counts: counts(d) };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge(mine, theirs) {
  const out = JSON.parse(JSON.stringify(mine));
  // notes: one per verse; where both have one, the one changed last stays
  out.notes = out.notes || {};
  for (const [k, n] of Object.entries(theirs.notes || {})) { const m = out.notes[k]; if (!m || ((n && n.t) || 0) > ((m && m.t) || 0)) out.notes[k] = n; }
  // highlights: per Bible and verse; a verse marked here keeps its marks
  out.highlights = out.highlights || {};
  for (const [bible, vs] of Object.entries(theirs.highlights || {})) { const o = out.highlights[bible] = out.highlights[bible] || {}; for (const [k, v] of Object.entries(vs || {})) if (!o[k]) o[k] = v; }
  // bookmarks: the ten places; an empty place here takes the backup's
  out.bookmarks = Array.from({ length: 10 }, (_, i) => (out.bookmarks || [])[i] || (theirs.bookmarks || [])[i] || null);
  // verse lists: by name; verses not yet in the list are added at its end
  out.lists = out.lists || {};
  for (const [name, l] of Object.entries(theirs.lists || {})) { const o = out.lists[name] = out.lists[name] || []; for (const it of (l || [])) if (!o.some(x => same(x, it))) o.push(it); }
  // reading plans: by name
  out.plans = out.plans || [];
  for (const p of (theirs.plans || [])) if (!out.plans.some(x => (x && x.name) === (p && p.name))) out.plans.push(p);
  out.ranges = Object.assign({}, theirs.ranges || {}, out.ranges || {});
  out.bookMarks = out.bookMarks || {};
  for (const [mod, ts] of Object.entries(theirs.bookMarks || {})) { const o = out.bookMarks[mod] = out.bookMarks[mod] || {}; for (const [k, v] of Object.entries(ts || {})) if (!o[k]) o[k] = v; }
  return out;
}
module.exports = { pack, read, merge, counts, KEYS };
