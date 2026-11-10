/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Minimal ZIP reader (stored and deflate entries) for module archives such as theWord .twzip
// downloads. No encryption, no ZIP64. Enough for the archives module sites publish.
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  if (typeof zlib.crc32 === "function") return zlib.crc32(buf) >>> 0;
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function findEOCD(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** list entries: [{name, size, method, offset, compSize, encrypted}] */
function entries(buf) {
  const e = findEOCD(buf);
  if (e < 0) throw new Error('Not a ZIP archive');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Damaged ZIP directory');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const raw = buf.slice(p + 46, p + 46 + nlen);
    const name = (flags & 0x800) ? raw.toString('utf8') : raw.toString('latin1');
    out.push({ name, size, method, offset, compSize, encrypted: !!(flags & 1) });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

function extract(buf, ent) {
  if (ent.encrypted) throw new Error('password-protected archive entry');
  const p = ent.offset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('Damaged ZIP entry');
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const data = buf.slice(start, start + ent.compSize);
  if (ent.method === 0) return Buffer.from(data);
  if (ent.method === 8) return zlib.inflateRawSync(data);
  throw new Error('unsupported compression method ' + ent.method);
}

/** a ZIP file from {name: Buffer|string} (deflated), e.g. a Word .docx */
function write(files) {
  const locals = [], central = []; let off = 0;
  const d = new Date(); const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [name, data] of Object.entries(files)) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'); const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw); const nm = Buffer.from(name, 'utf8');
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(dosDate, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(raw.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(dosDate, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(off, 42);
    locals.push(h, nm, comp); central.push(c, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(central); const e = Buffer.alloc(22); const n = Object.keys(files).length;
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(n, 8); e.writeUInt16LE(n, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

module.exports = { write, entries, extract };
