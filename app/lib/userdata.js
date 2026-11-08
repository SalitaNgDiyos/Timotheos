/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// The user's own study data, kept in one JSON file in Timotheos's data folder:
//   bookmarks[10]  lists{name:[{b,c,v,v2,bible}]}  highlights{bibleId:{"b.c.v":[{s,e,style}]}}
//   notes{"b.c.v": {html, t}}  plans[]  searchHistory[]  ranges{name:text}  copy{…}
//   bookMarks{moduleId:{topicId:[{s,e,style}]}}  (your marks in commentaries, dictionaries and books)
// Written atomically (temp file + rename) and backed up once per day.
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ version: 1, bookmarks: Array(10).fill(null), lists: { 'My verses': [] }, currentList: 'My verses', highlights: {}, notes: {}, plans: [], searchHistory: [], ranges: {}, copy: null, copySize: null, bookMarks: {} });

class UserData {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    try { this.data = Object.assign(EMPTY(), JSON.parse(fs.readFileSync(file, 'utf8'))); }
    catch (e) { if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.unreadable-' + Date.now()); } catch (e2) { /* ignore */ } } }
  }
  get() { return this.data; }
  set(key, value) {
    if (!(key in EMPTY())) throw new Error('unknown user-data key ' + key);
    this.data[key] = value; this.save(); return true;
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const bak = this.file.replace(/\.json$/, '') + '.backup-' + day + '.json';
    if (fs.existsSync(this.file) && !fs.existsSync(bak)) {
      try {
        fs.copyFileSync(this.file, bak);
        const dir = path.dirname(this.file); const base = path.basename(this.file).replace(/\.json$/, '') + '.backup-';
        const olds = fs.readdirSync(dir).filter(f => f.startsWith(base)).sort();
        for (const f of olds.slice(0, Math.max(0, olds.length - 7))) fs.unlinkSync(path.join(dir, f)); // keep a week
      } catch (e) { /* backups are best effort */ }
    }
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { UserData };
