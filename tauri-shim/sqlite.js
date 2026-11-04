'use strict';
// node:sqlite's DatabaseSync, with the databases opened by Rust (rusqlite).
const { Buffer } = require('buffer');
const N = require('./native');
const enc = v => v instanceof Uint8Array ? { $b: btoa(String.fromCharCode.apply(null, v)) } : v === undefined ? null : typeof v === 'boolean' ? +v : v;
const dec = v => v && typeof v === 'object' && v.$b != null ? Buffer.from(v.$b, 'base64') : v;
function call(op, id, body) {
  const json = JSON.stringify(body);
  const d = N.b64url(new TextEncoder().encode(json));
  if (d.length < 50000) return N.json('sql/' + op, { id, d }, 'sqlite');
  // too long for an address: leave it in a temporary file
  const tmp = (globalThis.__HOST.tmp || '/tmp') + '/timotheos-sql-' + Math.random().toString(36).slice(2) + '.json';
  require('./fs').writeFileSync(tmp, json);
  try { return N.json('sql/' + op, { id, f: tmp }, 'sqlite'); } finally { try { require('./fs').unlinkSync(tmp); } catch (e) { /* gone */ } }
}
class Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.arrays = false; this.cols = []; }
  setReturnArrays(v) { this.arrays = !!v; }
  columns() { return this.cols.map(name => ({ name })); }
  all(...params) {
    const r = call('all', this.db.id, { sql: this.sql, params: params.map(enc) });
    this.cols = r.c;
    return r.r.map(row => this.arrays ? row.map(dec) : Object.fromEntries(r.c.map((c, i) => [c, dec(row[i])])));
  }
  // the rows come in pages, so that a table of 300 MB is never carried over in one piece
  *iterate(...params) {
    const PAGE = 500; const base = String(this.sql).trim().replace(/;+\s*$/, '');
    for (let off = 0; ; off += PAGE) {
      const r = call('all', this.db.id, { sql: `select * from (${base}) limit ${PAGE} offset ${off}`, params: params.map(enc) });
      this.cols = r.c;
      for (const row of r.r) yield this.arrays ? row.map(dec) : Object.fromEntries(r.c.map((c, i) => [c, dec(row[i])]));
      if (r.r.length < PAGE) return;
    }
  }
  get(...params) { return this.all(...params)[0]; }
  run(...params) { const r = call('run', this.db.id, { sql: this.sql, params: params.map(enc) }); return { changes: r.changes, lastInsertRowid: r.last }; }
}
class DatabaseSync {
  constructor(file, opts) { this.id = N.json('sql/open', { p: String(file), w: opts && opts.readOnly === false ? 1 : 0 }, `open '${file}'`).id; }
  exec(sql) { call('batch', this.id, { sql }); }
  prepare(sql) { return new Statement(this, sql); }
  close() { if (this.id) { try { N.json('sql/close', { id: this.id }); } catch (e) { /* closed */ } this.id = 0; } }
}
module.exports = { DatabaseSync };
