/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Cross-reference sets in theWord's open .xrefs.twm format:
//   xrefs(id, vi1, vi2) where vi = book<<24 | chapter<<16 | verse<<8 | span (extra verses).
// Sets found in module folders are read-only; the user's own set is kept in Timotheos's data folder
// in the same format (so it can also be used by theWord).
const fs = require('fs');
const path = require('path');
const { sqljs } = require('./dict');
const { openDb } = require('./sqlite');

const enc = (b, c, v, span = 0) => ((b & 0x7f) << 24) + ((c & 0xff) << 16) + ((v & 0xff) << 8) + (span & 0xff);
const dec = n => ({ b: (n >>> 24) & 0x7f, c: (n >>> 16) & 0xff, v: (n >>> 8) & 0xff, span: n & 0xff });
const key = (b, c, v) => (b << 16) | (c << 8) | v;

class Xrefs {
  constructor(userFile) {
    this.userFile = userFile;
    this.sets = []; // {name, file, user, rows:[[vi1,vi2]]}
    this.fwd = new Map(); this.back = new Map();
    this.errors = [];
  }

  async load(files) {
    this.sets = []; this.errors = [];
    for (const f of files) {
      try {
        const db = openDb(f);
        const cfg = {};
        try { for (const [k, v] of db.exec('select name, value from config')[0].values) cfg[String(k).toLowerCase()] = String(v); } catch (e) { /* none */ }
        const table = cfg['table.xrefs'] || 'xrefs';
        const rows = (db.exec(`select vi1, vi2 from "${table}"`)[0] || { values: [] }).values;
        this.sets.push({ name: cfg['tables.xrefs.description'] || path.basename(f).replace(/\.xrefs\.twm$/i, ''), file: f, user: false, rows });
        db.close();
      } catch (e) { this.errors.push(`${path.basename(f)}: ${e.message}`); }
    }
    let userRows = [];
    if (fs.existsSync(this.userFile)) {
      try { const db = openDb(this.userFile); userRows = (db.exec('select vi1, vi2 from xrefs')[0] || { values: [] }).values; db.close(); }
      catch (e) { this.errors.push('My cross-references: ' + e.message); }
    }
    this.sets.push({ name: 'My cross-references (Timotheos)', file: this.userFile, user: true, rows: userRows });
    this.reindex();
  }

  reindex() {
    this.fwd.clear(); this.back.clear();
    this.sets.forEach((s, si) => {
      if (s.disabled) return;
      for (const [a, b] of s.rows) {
        const f = dec(a), t = dec(b);
        const k1 = key(f.b, f.c, f.v), k2 = key(t.b, t.c, t.v);
        (this.fwd.get(k1) || this.fwd.set(k1, []).get(k1)).push({ to: t, from: f, set: si });
        (this.back.get(k2) || this.back.set(k2, []).get(k2)).push({ to: f, from: t, set: si });
      }
    });
  }

  list() { return this.sets.map((s, i) => ({ i, name: s.name, user: s.user, count: s.rows.length, file: s.file, disabled: !!s.disabled })); }

  /** cross references for every verse of a chapter: {v: [{b,c,v,span,back,user}]} */
  chapter(b, c, withBack = true) {
    const out = {};
    const add = (v, x, back) => {
      const arr = out[v] || (out[v] = []);
      const t = x.to; const id = `${t.b}.${t.c}.${t.v}.${t.span}`;
      if (arr.some(y => y.id === id && y.back === back)) return; // same reference from two sets
      arr.push({ id, b: t.b, c: t.c, v: t.v, span: t.span, back, user: this.sets[x.set].user, set: x.set });
    };
    for (let v = 0; v <= 200; v++) {
      const k = key(b, c, v);
      for (const x of this.fwd.get(k) || []) add(v, x, false);
      if (withBack) for (const x of this.back.get(k) || []) add(v, x, true);
    }
    return out;
  }

  async save() {
    const SQL = await sqljs();
    const db = new SQL.Database();
    db.run('create table xrefs(id integer primary key, vi1 int, vi2 int)');
    db.run('create table config(name text, value text)');
    db.run('create index xrefs_idx_vi1 on xrefs(vi1)'); db.run('create index xrefs_idx_vi2 on xrefs(vi2)');
    db.run("insert into config values ('table.xrefs','xrefs'),('tables.xrefs.description','My cross-references (Timotheos)'),('type','10')");
    const st = db.prepare('insert into xrefs(vi1, vi2) values (?, ?)');
    for (const [a, b] of this.userSet().rows) { st.run([a, b]); }
    st.free();
    fs.mkdirSync(path.dirname(this.userFile), { recursive: true });
    fs.writeFileSync(this.userFile, Buffer.from(db.export()));
    db.close();
  }

  userSet() { return this.sets.find(s => s.user); }

  async add(from, to) {
    const a = enc(from.b, from.c, from.v, 0), b = enc(to.b, to.c, to.v, Math.max(0, (to.v2 || to.v) - to.v));
    const u = this.userSet();
    if (!u.rows.some(r => r[0] === a && r[1] === b)) u.rows.push([a, b]);
    this.reindex(); await this.save();
  }

  async remove(from, to) {
    const u = this.userSet();
    const a = enc(from.b, from.c, from.v, 0);
    const before = u.rows.length;
    u.rows = u.rows.filter(([x, y]) => { const t = dec(y); return !(x === a && t.b === to.b && t.c === to.c && t.v === to.v); });
    if (u.rows.length === before) { // maybe a back-reference: remove the reverse direction
      const a2 = enc(to.b, to.c, to.v, 0);
      u.rows = u.rows.filter(([x, y]) => { const t = dec(y); return !(x === a2 && t.b === from.b && t.c === from.c && t.v === from.v); });
    }
    this.reindex(); await this.save();
    return before !== u.rows.length;
  }

  setEnabled(i, on) { if (this.sets[i]) { this.sets[i].disabled = !on; this.reindex(); } }
}

module.exports = { Xrefs, enc, dec };
