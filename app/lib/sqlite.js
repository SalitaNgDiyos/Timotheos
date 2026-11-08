/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Read-only (and optional writable for user modules) access to module databases straight from disk
// (Node's built-in SQLite, Electron 37+ / Node 22.5+).
// Before 0.4.5 every module was copied whole into memory (sql.js), and the copy stayed there:
// a 280 MB commentary cost 280 MB or more of RAM. Now only the pages a query needs are read.
// The object returned offers the small part of sql.js's interface that the readers use
// (exec, run, prepare → bind/step/get/reset/free, close), so the readers did not have to change.

const emit = process.emitWarning;
process.emitWarning = function (w, ...rest) { if (/SQLite is an experimental feature/.test(String(w && w.message || w))) return; return emit.call(process, w, ...rest); };
let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (e) {
  if (global.__TIMOTHEOS_SQLITE_SHIM) DatabaseSync = global.__TIMOTHEOS_SQLITE_SHIM;
}
process.emitWarning = emit;

const CACHE_KB = 4096; // 4 MB page cache per open module

class Stmt {
  constructor(st) { this.st = st; this.st.setReturnArrays(true); this.params = []; this.it = null; this.row = null; }
  bind(params) { this.params = Array.isArray(params) ? params : params == null ? [] : [params]; this.it = null; this.row = null; return true; }
  step() {
    if (!this.it) this.it = this.st.iterate(...this.params);
    const n = this.it.next();
    if (n.done) { this.row = null; this.it = null; return false; }
    this.row = n.value; return true;
  }
  get() { return this.row; }
  run(params) {
    const p = params !== undefined ? (Array.isArray(params) ? params : params == null ? [] : [params]) : this.params;
    return this.st.run(...p);
  }
  reset() { if (this.it && this.it.return) { try { this.it.return(); } catch (e) { /* finished */ } } this.it = null; this.row = null; return true; }
  free() { this.reset(); }
}

class Db {
  constructor(file, opts = {}) {
    const writable = !!opts.writable;
    this.db = new DatabaseSync(file, { readOnly: !writable });
    try {
      this.db.exec(`pragma cache_size = -${CACHE_KB}`);
      this.db.exec('pragma temp_store = memory');
      this.db.exec('pragma mmap_size = 134217728');
      if (!writable) this.db.exec('pragma query_only = 1');
    } catch (e) { /* fine */ }
  }
  /** fast array-of-arrays query without column metadata overhead */
  all(sql, params) {
    const st = this.db.prepare(sql); st.setReturnArrays(true);
    return st.all(...(Array.isArray(params) ? params : params == null ? [] : [params]));
  }
  /** like sql.js: [{columns, values}] – empty when there are no rows */
  exec(sql, params) {
    if (!params || !params.length) {
      const trimmed = String(sql).trim();
      if (!/^select\b|^pragma\b|^with\b/i.test(trimmed)) { this.db.exec(sql); return []; }
    }
    const st = this.db.prepare(sql); st.setReturnArrays(true);
    const values = st.all(...(params || []));
    if (!values.length) return [];
    return [{ columns: st.columns().map(c => c.name), values }];
  }
  run(sql, params) {
    if (!params || !params.length) { this.db.exec(sql); return; }
    const st = this.db.prepare(sql);
    return st.run(...(Array.isArray(params) ? params : [params]));
  }
  prepare(sql) { return new Stmt(this.db.prepare(sql)); }
  close() { try { this.db.close(); } catch (e) { /* closed */ } }
}

/** open a module database from disk (read-only by default; pass {writable: true} for user modules) */
function openDb(file, opts) { return new Db(file, opts); }

module.exports = { openDb };
