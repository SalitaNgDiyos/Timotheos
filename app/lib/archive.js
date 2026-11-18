/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Reads compressed files and archives of every kind module sites and friends use, into memory:
//   .zip .twzip  (own reader first; the 7-Zip engine for encrypted or unusual ones)
//   .7z .rar .tar .tar.gz/.tgz .tar.bz2/.tbz2 .tar.xz/.txz .tar.zst/.tzst .lzma  and single .gz .bz2 .xz .zst .lz
// The kind is found from the first bytes, not only from the name. An archive inside an archive is opened too (3 levels).
// A password-protected archive stops with an error whose `code` is 'PASSWORD' (needs one) or 'BADPASSWORD' (wrong one).
// The 7-Zip engine is 7-Zip 24 built for WebAssembly (7z-wasm, GNU LGPL + unRAR restriction). It reads RAR, it cannot make RAR.
const zlib = require('zlib');
const zip = require('./zip');

const MAX_TOTAL = 800 * 1024 * 1024;   // all unpacked files together; a module pack is far smaller
const MAX_DEPTH = 3;
const NAME_RE = /\.(zip|twzip|7z|rar|tar|tgz|tbz2?|txz|tzst|tlz|taz|gz|bz2|xz|zst|lzma|lz)$/i;
const isArchiveName = n => NAME_RE.test(String(n || ''));

function fail(msg, code) { const e = new Error(msg); if (code) e.code = code; return e; }

/** what is this, judged by its first bytes (then by its name) */
function sniff(b, name = '') {
  const n = String(name).toLowerCase();
  const at = (o, ...v) => v.every((x, i) => b[o + i] === x);
  if (b.length > 4 && at(0, 0x50, 0x4b) && (at(2, 3, 4) || at(2, 5, 6) || at(2, 7, 8))) return 'zip';
  if (at(0, 0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return '7z';
  if (at(0, 0x52, 0x61, 0x72, 0x21, 0x1a, 7)) return 'rar';
  if (at(0, 0x1f, 0x8b)) return 'gz';
  if (at(0, 0x42, 0x5a, 0x68)) return 'bz2';
  if (at(0, 0xfd, 0x37, 0x7a, 0x58, 0x5a, 0)) return 'xz';
  if (at(0, 0x28, 0xb5, 0x2f, 0xfd)) return 'zst';
  if (at(0, 0x4c, 0x5a, 0x49, 0x50)) return 'lz';
  if (b.length > 262 && at(257, 0x75, 0x73, 0x74, 0x61, 0x72)) return 'tar';
  if (/\.(tar)$/.test(n) && b.length >= 512) return 'tar';
  if (/\.lzma$/.test(n)) return 'lzma';
  return '';
}

/* ---------- tar (ustar, GNU long names, pax paths) ---------- */
function tarEntries(buf) {
  const out = []; let off = 0, longName = null, paxPath = null;
  const str = (o, l) => { let e = o; const end = o + l; while (e < end && buf[e] !== 0) e++; return buf.toString('utf8', o, e); };
  const oct = (o, l) => parseInt(str(o, l).trim() || '0', 8) || 0;
  while (off + 512 <= buf.length) {
    let allZero = true; for (let i = 0; i < 512; i++) if (buf[off + i]) { allZero = false; break; }
    if (allZero) break;
    let name = str(off, 100); const size = oct(off + 124, 12); const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, 155); if (prefix && /ustar/.test(str(off + 257, 6))) name = prefix + '/' + name;
    const dataStart = off + 512; const next = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'L') { longName = str(dataStart, size); }
    else if (type === 'x') { const m = /\d+ path=([^\n]*)\n/.exec(buf.toString('utf8', dataStart, dataStart + size)); if (m) paxPath = m[1]; }
    else if (type === 'g') { /* global pax header: nothing we need */ }
    else {
      if (longName != null) { name = longName; longName = null; }
      if (paxPath != null) { name = paxPath; paxPath = null; }
      if (type === '0' || type === '\0' || type === '7') { if (dataStart + size > buf.length) throw fail('the tar file is cut short'); out.push({ name: name.replace(/\\/g, '/'), data: buf.subarray(dataStart, dataStart + size) }); }
    }
    off = next;
  }
  return out;
}

/* ---------- the 7-Zip engine (WebAssembly) ---------- */
let SevenZip = null;
async function engine(extra) {
  if (!SevenZip) SevenZip = require('7z-wasm');
  SevenZip = SevenZip.default || SevenZip;
  const opts = Object.assign({}, extra);
  if (globalThis.__HOST) {   // the app: the page's own copy of the engine, next to worker.js
    const base = (globalThis.location && globalThis.location.href) || '';
    const r = await fetch(new URL('7zz.wasm', base).href); if (!r.ok) throw fail('the 7-Zip engine file is missing (7zz.wasm)');
    opts.wasmBinary = await r.arrayBuffer();
  }
  return SevenZip(opts);
}
const wrongPw = t => /wrong password|incorrect password|can.t open as archive.*encrypted|encrypted archive|data error in encrypted|enter password/i.test(t);

/** the files of an archive through 7-Zip: [{name, data}] */
async function sevenZipUnpack(buf, name, password) {
  const log = [];
  const z = await engine({ print: s => log.push(String(s)), printErr: s => log.push(String(s)) });
  const FS = z.FS; const arc = '/in.' + (/\.([a-z0-9]+)$/i.exec(name) ? /\.([a-z0-9]+)$/i.exec(name)[1].toLowerCase() : 'bin');
  const w = FS.open(arc, 'w+'); FS.write(w, buf, 0, buf.length); FS.close(w);
  const pw = password ? ['-p' + password] : [];
  // look first: how big, and is anything encrypted
  log.length = 0;
  let code = z.callMain(['l', '-slt', '-ba', ...pw, arc]);
  const text = log.join('\n');
  if (code && wrongPw(text)) throw fail(password ? 'the password is wrong' : 'this archive needs a password', password ? 'BADPASSWORD' : 'PASSWORD');
  let total = 0, encrypted = false; for (const m of text.matchAll(/^Size = (\d+)/gm)) total += +m[1];
  if (/^Encrypted = \+/m.test(text)) encrypted = true;
  if (encrypted && !password) throw fail('this archive needs a password', 'PASSWORD');
  if (total > MAX_TOTAL) throw fail('the archive unpacks to ' + Math.round(total / 1048576) + ' MB; the limit is ' + Math.round(MAX_TOTAL / 1048576) + ' MB');
  log.length = 0;
  code = z.callMain(['x', '-y', '-bd', '-o/out', ...pw, arc]);
  const outText = log.join('\n');
  if (code && wrongPw(outText)) throw fail(password ? 'the password is wrong' : 'this archive needs a password', password ? 'BADPASSWORD' : 'PASSWORD');
  if (code === 2 || code === 255) throw fail('could not unpack: ' + (outText.split('\n').filter(l => /error|can.t|cannot|unsupported/i.test(l)).slice(0, 2).join('; ') || 'exit code ' + code));
  const out = [];
  const walk = dir => {
    for (const e of FS.readdir(dir)) {
      if (e === '.' || e === '..') continue;
      const p = dir + '/' + e; const st = FS.stat(p);
      if (FS.isDir(st.mode)) walk(p); else out.push({ name: p.slice('/out/'.length), data: toBuf(FS.readFile(p)) });
    }
  };
  walk('/out');
  return out;
}
function toBuf(u8) { const { Buffer } = require('buffer'); return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength); }

/** one level: the entries of this file */
async function openOnce(buf, name, password) {
  const kind = sniff(buf, name);
  const base = String(name).replace(/\.[^.\\/]+$/, '');
  if (kind === 'zip') {
    try {
      const ents = zip.entries(buf);
      if (!ents.some(e => e.encrypted)) { return ents.filter(e => !e.name.endsWith('/')).map(e => ({ name: e.name, data: zip.extract(buf, e) })); }
    } catch (e) { /* the 7-Zip engine below */ }
    return sevenZipUnpack(buf, name, password);
  }
  if (kind === 'gz') { let d; try { d = toBuf(zlib.gunzipSync(buf)); } catch (e) { throw fail('could not unpack the .gz file: ' + e.message); } return [{ name: /\.tgz$/i.test(name) ? base + '.tar' : base, data: d }]; }
  if (kind === 'zst') { const { decompress } = require('fzstd'); let d; try { d = toBuf(decompress(buf)); } catch (e) { throw fail('could not unpack the .zst file: ' + e.message); } return [{ name: /\.tzst$/i.test(name) ? base + '.tar' : base, data: d }]; }
  if (kind === 'tar') return tarEntries(buf);
  if (kind === '7z' || kind === 'rar' || kind === 'bz2' || kind === 'xz' || kind === 'lz' || kind === 'lzma') {
    const ents = await sevenZipUnpack(buf, name, password);
    // a single compressed file comes out named after the archive; give it the plain name (and .tar for .tbz2 / .txz)
    if (['bz2', 'xz', 'lz', 'lzma'].includes(kind) && ents.length === 1 && /^in(\.|$)/.test(ents[0].name)) ents[0].name = /\.(tbz2?|txz|tlz)$/i.test(name) ? base + '.tar' : base;
    return ents;
  }
  throw fail('not a compressed file or archive Timotheos can read');
}

/** every file inside, archives inside archives opened too: [{name, data}] */
async function unpack(buf, name, opts = {}, depth = 0) {
  const password = opts.password;
  const ents = await openOnce(buf, name, password);
  const out = []; let total = 0;
  for (const e of ents) {
    total += e.data.length; if (total > MAX_TOTAL) throw fail('the archive unpacks to more than ' + Math.round(MAX_TOTAL / 1048576) + ' MB');
    const inner = depth < MAX_DEPTH - 1 && isArchiveName(e.name) ? sniff(e.data.subarray(0, 600), e.name) : '';
    if (inner) {
      try {
        const sub = await unpack(e.data, e.name.split('/').pop(), opts, depth + 1);
        const folder = e.name.includes('/') ? e.name.replace(/[^/]*$/, '') : '';
        for (const s of sub) out.push({ name: folder + s.name, data: s.data });
        continue;
      } catch (err) { if (err.code === 'PASSWORD' || err.code === 'BADPASSWORD') throw err; /* not really an archive: keep it as it is */ }
    }
    out.push(e);
  }
  return out;
}

module.exports = { unpack, isArchiveName, sniff, tarEntries, NAME_RE, MAX_TOTAL };
