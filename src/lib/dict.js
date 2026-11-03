'use strict';
// theWord dictionary modules (.dct.twm) – Strong's lexicons and morphology dictionaries.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { rtfToHtml, isRtf } = require('./rtf');
const { rvfToHtml, looksRvf } = require('./rvf');
const esw = require('./eswordfmt');

let SQL = null;
async function sqljs() {
  if (!SQL) {
    try {
      const init = require('sql.js');
      SQL = await init({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f) });
    } catch (e) {
      const { openDb } = require('./sqlite');
      SQL = {
        Database: class {
          constructor(buf) {
            this._tmp = path.join(os.tmpdir(), `timotheos-db-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
            if (buf && buf.length) fs.writeFileSync(this._tmp, Buffer.from(buf));
            this._db = openDb(this._tmp, { writable: true });
          }
          run(sql, params) { return this._db.run(sql, params); }
          exec(sql, params) { return this._db.exec(sql, params); }
          prepare(sql) { return this._db.prepare(sql); }
          export() {
            this._db.close();
            const out = fs.existsSync(this._tmp) ? fs.readFileSync(this._tmp) : Buffer.alloc(0);
            this._db = openDb(this._tmp, { writable: true });
            return new Uint8Array(out);
          }
          close() {
            try { this._db.close(); } catch (_) {}
            try { if (fs.existsSync(this._tmp)) fs.unlinkSync(this._tmp); } catch (_) {}
          }
        }
      };
    }
  }
  return SQL;
}

function inflate(buf) {
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) {
    try { return fn(Buffer.from(buf)); } catch (e) { /* try next */ }
  }
  return null;
}

function bytesToStr(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return Buffer.from(v).toString('utf8');
}

/** read only the config table cheaply (opens the db; fine for a one-off scan) */
async function open(file) {
  const db = require('./sqlite').openDb(file);
  const cfg = {};
  try {
    const r = db.exec('select name, value from config');
    if (r[0]) for (const [k, v] of r[0].values) cfg[String(k).toLowerCase()] = v == null ? '' : bytesToStr(v);
  } catch (e) { /* no config table */ }
  const title = cfg.title || cfg.abbrev || path.basename(file);
  const isStrong = cfg.strong === '1' || /strong/i.test(cfg.keywords || '');
  const isMorph = /morph/i.test(title + ' ' + (cfg.keywords || '') + ' ' + (cfg.categories || '') + ' ' + path.basename(file));
  const compressed = cfg.compressed === '1';
  const lookupStmt = db.prepare('select t.id, t.subject, c.data, c.data2, t.content_type from topics t left join content c on c.topic_id = t.id where t.subject = ? collate nocase limit 1');
  const mod = {
    id: 'dct:' + path.basename(file), file, format: 'theWord dictionary', title,
    abbr: cfg.abbrev || title, cfg, isStrong, isMorph,
    greek: isStrong && cfg['strong.g'] !== '0', hebrew: isStrong && cfg['strong.h'] === '1',
    contentType: (cfg['content.type'] || 'rtf').toLowerCase(),
    lookup(key) {
      const keys = [key];
      const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(key);
      if (m) keys.push(m[1].toUpperCase() + m[2] + m[3], m[1].toUpperCase() + m[2]);
      for (const k of keys) {
        lookupStmt.bind([k]);
        if (lookupStmt.step()) {
          const [id, subject, data, data2, ctype] = lookupStmt.get();
          lookupStmt.reset();
          const effType = (ctype || this.contentType || 'rtf').toLowerCase();
          let rawBuf = null;
          if (compressed && data2) rawBuf = inflate(data2);
          if (!rawBuf && data != null) rawBuf = typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data);
          if (!rawBuf && data2 != null) rawBuf = inflate(data2) || Buffer.from(data2);
          let html = '';
          if (rawBuf && (effType === 'rvf' || looksRvf(rawBuf))) {
            try { html = rvfToHtml(rawBuf); } catch (_) {}
          }
          if (!html) {
            let body = '';
            if (compressed && data2) { const b = inflate(data2); body = b ? b.toString('utf8') : ''; }
            if (!body) body = bytesToStr(data);
            if (!body && data2) { const b = inflate(data2); body = b ? b.toString('utf8') : bytesToStr(data2); }
            html = isRtf(body) || effType === 'rtf' ? rtfToHtml(body) : esw.htmlish(body);
          }
          return { subject: bytesToStr(subject), html };
        }
        lookupStmt.reset();
      }
      return null;
    },
    close() { try { lookupStmt.free(); db.close(); } catch (e) { /* ignore */ } },
  };
  return mod;
}

module.exports = { open, sqljs };
