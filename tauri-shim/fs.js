/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// The part of Node's fs that Timotheos uses, done by the Rust side.
const { Buffer } = require('buffer');
const N = require('./native');
const CHUNK = 40000; // bytes per request when writing (becomes ~54 KB of base64 in the address)

function norm(p) { return String(p); }
class Stats {
  constructor(r) { this.size = r.s; this.mtimeMs = r.m; this.mtime = new Date(r.m); this._d = r.d; }
  isDirectory() { return this._d; } isFile() { return !this._d; }
}
function stat(p) { const r = N.json('stat', { p: norm(p) }); if (!r.e) { const e = new Error(`ENOENT: no such file or directory, stat '${p}'`); e.code = 'ENOENT'; throw e; } return new Stats(r); }
function existsSync(p) { try { return N.json('stat', { p: norm(p) }).e; } catch (e) { return false; } }
function readFileSync(p, enc) {
  if (typeof p === 'number') { const f = fds.get(p); p = f.path; }
  const b = N.bytes('read', { p: norm(p) }, `open '${p}'`);
  const e = typeof enc === 'string' ? enc : enc && enc.encoding;
  return e ? b.toString(e) : b;
}
function writeFileSync(p, data, opts) {
  const e = typeof opts === 'string' ? opts : opts && opts.encoding;
  const b = typeof data === 'string' ? Buffer.from(data, e || 'utf8') : Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
  let first = true;
  for (let o = 0; o < b.length || first; o += CHUNK) {
    N.json('w', { p: norm(p), m: first ? 'c' : 'a', d: N.b64url(b.subarray(o, o + CHUNK)) }, `open '${p}'`);
    first = false;
  }
}
function mkdirSync(p, o) { const r = !!(o && o.recursive); try { N.json('mkdir', { p: norm(p), r: r ? 1 : 0 }, `mkdir '${p}'`); } catch (e) { if (r && e.code === 'EEXIST') return; throw e; } }
function unlinkSync(p) { N.json('rm', { p: norm(p) }, `unlink '${p}'`); }
function rmSync(p, o) { try { N.json('rm', { p: norm(p), r: o && o.recursive ? 1 : 0 }, `rm '${p}'`); } catch (e) { if (o && o.force && e.code === 'ENOENT') return; throw e; } }
function renameSync(a, b) { N.json('mv', { p: norm(a), to: norm(b) }, `rename '${a}'`); }
function copyFileSync(a, b) { N.json('cp', { p: norm(a), to: norm(b), f: 1 }, `copyfile '${a}'`); }
function cpSync(a, b, o) { N.json('cp', { p: norm(a), to: norm(b), f: o && o.force === false ? 0 : 1 }, `cp '${a}'`); }
function readdirSync(p, o) {
  const l = N.json('ls', { p: norm(p) }, `scandir '${p}'`);
  if (o && o.withFileTypes) return l.map(([name, dir]) => ({ name, isDirectory: () => dir, isFile: () => !dir, isSymbolicLink: () => false }));
  return l.map(x => x[0]);
}
function accessSync(p) { stat(p); }
function mkdtempSync(prefix) { const d = prefix + Math.random().toString(36).slice(2, 8); mkdirSync(d, { recursive: true }); return d; }
const fds = new Map(); let nextFd = 100;
function openSync(p) { stat(p); const fd = nextFd++; fds.set(fd, { path: norm(p) }); return fd; }
function readSync(fd, buf, off, len, pos) {
  const f = fds.get(fd); if (!f) throw new Error('EBADF: bad file descriptor');
  const b = N.bytes('read', { p: f.path, o: pos || 0, n: len }, `read '${f.path}'`);
  buf.set(b, off); return b.length;
}
function closeSync(fd) { fds.delete(fd); }
const promises = { copyFile: async (a, b) => copyFileSync(a, b) };
function watch() { return { close() {} }; }
module.exports = { existsSync, statSync: stat, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync, renameSync, copyFileSync, cpSync, readdirSync, accessSync, mkdtempSync, openSync, readSync, closeSync, promises, watch, constants: { W_OK: 2, R_OK: 4, F_OK: 0 } };
