/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Minimal ZIP reader (stored and deflate entries) for module archives such as theWord .twzip
// downloads. No encryption, no ZIP64. Enough for the archives module sites publish.
const fs = require('fs');
const path = require('path');
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

function readExact(fd, buf, pos) {
  let off = 0;
  while (off < buf.length) {
    const n = fs.readSync(fd, buf, off, buf.length - off, pos + off);
    if (!n) throw new Error('Unexpected end of ZIP file');
    off += n;
  }
}

function safeRelParts(name) {
  const parts = [];
  for (const part of String(name || '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' || part.includes('\0') || part.includes(':')) return null;
    parts.push(part);
  }
  return parts.length ? parts : null;
}

/** Stream-extract a standard stored/deflated ZIP archive directly to outDir without loading entries into RAM. */
async function extractToDir(zipFile, outDir, maxTotal = 0) {
  const st = fs.statSync(zipFile);
  const fileLen = st.size;
  if (fileLen < 22) return { ok: false, code: 'FALLBACK' };

  const fd = fs.openSync(zipFile, 'r');
  const ents = [];
  try {
    const tailLen = Math.min(fileLen, 65557);
    const tail = Buffer.allocUnsafe(tailLen);
    readExact(fd, tail, fileLen - tailLen);

    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tailLen) { e = i; break; }
    }
    if (e < 0) return { ok: false, code: 'FALLBACK' };

    const disk = tail.readUInt16LE(e + 4);
    const cdDisk = tail.readUInt16LE(e + 6);
    const countDisk = tail.readUInt16LE(e + 8);
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOffset = tail.readUInt32LE(e + 16);
    if (disk !== 0 || cdDisk !== 0 || countDisk !== count || count === 0xFFFF || cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) {
      return { ok: false, code: 'FALLBACK' };
    }
    if (cdSize > 64 * 1024 * 1024 || cdOffset + cdSize > fileLen) return { ok: false, code: 'FALLBACK' };

    const cd = Buffer.allocUnsafe(cdSize);
    readExact(fd, cd, cdOffset);

    let p = 0;
    let totalUncomp = 0;
    const lh = Buffer.allocUnsafe(30);
    for (let k = 0; k < count; k++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) return { ok: false, code: 'FALLBACK' };
      const flags = cd.readUInt16LE(p + 8);
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const uncompSize = cd.readUInt32LE(p + 24);
      const nlen = cd.readUInt16LE(p + 28);
      const xlen = cd.readUInt16LE(p + 30);
      const clen = cd.readUInt16LE(p + 32);
      const localOff = cd.readUInt32LE(p + 42);
      const nextP = p + 46 + nlen + xlen + clen;
      if (nextP > cd.length) return { ok: false, code: 'FALLBACK' };
      if (flags & 1) return { ok: false, code: 'PASSWORD' };
      if (compSize === 0xFFFFFFFF || uncompSize === 0xFFFFFFFF || localOff === 0xFFFFFFFF || (method !== 0 && method !== 8)) {
        return { ok: false, code: 'FALLBACK' };
      }
      const rawName = cd.subarray(p + 46, p + 46 + nlen);
      const normName = ((flags & 0x800) ? rawName.toString('utf8') : rawName.toString('latin1')).replace(/\\/g, '/');
      p = nextP;
      if (normName.endsWith('/')) continue;
      const relParts = safeRelParts(normName);
      if (!relParts) return { ok: false, code: 'FALLBACK' };

      totalUncomp += uncompSize;
      if (maxTotal > 0 && totalUncomp > maxTotal) {
        return { ok: false, code: 'ERROR', error: `the archive unpacks to ${Math.floor(totalUncomp / 1048576)} MB; the limit is ${Math.floor(maxTotal / 1048576)} MB` };
      }
      if (localOff + 30 > fileLen) return { ok: false, code: 'FALLBACK' };
      readExact(fd, lh, localOff);
      if (lh.readUInt32LE(0) !== 0x04034b50) return { ok: false, code: 'FALLBACK' };
      const dataStart = localOff + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      if (dataStart + compSize > fileLen) return { ok: false, code: 'FALLBACK' };
      ents.push({ name: normName, relParts, method, compSize, dataStart });
    }
  } finally {
    try { fs.closeSync(fd); } catch (_) {}
  }

  fs.mkdirSync(outDir, { recursive: true });
  let writtenTotal = 0;
  const outEntries = [];
  try {
    for (const ent of ents) {
      const dest = path.join(outDir, ...ent.relParts);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (ent.compSize === 0) {
        fs.writeFileSync(dest, Buffer.alloc(0));
        outEntries.push({ name: ent.name, path: dest, size: 0 });
        continue;
      }
      const entrySize = await new Promise((resolve, reject) => {
        const src = fs.createReadStream(zipFile, { start: ent.dataStart, end: ent.dataStart + ent.compSize - 1 });
        const infl = ent.method === 8 ? zlib.createInflateRaw() : null;
        const outSrc = infl ? src.pipe(infl) : src;
        const dst = fs.createWriteStream(dest);
        let size = 0;
        let done = false;
        const fail = err => {
          if (done) return;
          done = true;
          try { src.destroy(); } catch (_) {}
          try { if (infl) infl.destroy(); } catch (_) {}
          try { dst.destroy(); } catch (_) {}
          reject(err);
        };
        src.on('error', fail);
        if (infl) infl.on('error', fail);
        dst.on('error', fail);
        outSrc.on('data', chunk => {
          writtenTotal += chunk.length;
          if (maxTotal > 0 && writtenTotal > maxTotal) {
            return fail(new Error(`the archive unpacks to more than ${Math.floor(maxTotal / 1048576)} MB`));
          }
          size += chunk.length;
          if (!dst.write(chunk)) outSrc.pause();
        });
        dst.on('drain', () => { if (!done) outSrc.resume(); });
        outSrc.on('end', () => { if (!done) dst.end(); });
        dst.on('finish', () => { if (!done) { done = true; resolve(size); } });
      });
      outEntries.push({ name: ent.name, path: dest, size: entrySize });
    }
  } catch (err) {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch (_) {}
    return { ok: false, code: 'ERROR', error: 'could not unpack: ' + err.message };
  }
  return { ok: true, entries: outEntries };
}

module.exports = { write, entries, extract, extractToDir };
