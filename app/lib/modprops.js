/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Module properties (read and edit) and compacting/compressing module files.
//   theWord Bibles (.ont/.ot/.nt): "key=value" lines after the verse lines
//   theWord book modules (.twm): the config(name, value) table
//   e-Sword modules (SQLite): the one-row Details table
// Encrypted/locked modules are never changed. Before the first change Timotheos keeps a copy of the
// original file next to it ("<name>.timotheos-backup").
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { sqljs } = require('./dict');
const { rtfToHtml, isRtf } = require('./rtf');
const canon = require('./canon');
const esw = require('./eswordfmt');

const MAX_BYTES = 450 * 1024 * 1024;
const BACKUP = '.timotheos-backup';

// the fields shown first, with friendly labels (others go under "All settings")
const TW_FIELDS = [['title', 'Title'], ['short.title', 'Short title'], ['abbrev', 'Abbreviation'], ['description', 'Description'], ['author', 'Author'],
  ['publisher', 'Publisher'], ['publish.date', 'Published'], ['version.major', 'Version (major)'], ['version.minor', 'Version (minor)'], ['version.date', 'Version date'],
  ['lang', 'Language'], ['categories', 'Categories'], ['keywords', 'Keywords'], ['creator', 'Made by'], ['source', 'Source'], ['isbn', 'ISBN'],
  ['contributors', 'Contributors'], ['editorial.comments', 'Editorial comments']];
const ES_FIELDS = [['title', 'Title'], ['abbreviation', 'Abbreviation'], ['description', 'Description'], ['version', 'Version'], ['font', 'Font']];
// settings that only make sense to the program that made the module, shown read-only
const READONLY_KEYS = /^(secure|do\.encrypt|encrypted|schema\.version|search\..*|compressed.*|id|type|content\.type|user)$/i;
const MULTILINE = /^(description|editorial\.comments|contributors|about)$/i;

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const b = Buffer.from(v); const s = b.toString('utf8');
  return s.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(b) : s;
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ---------------------------------------------------------------- about text ⇄ HTML */
function aboutStyle(s) {
  if (!s) return 'none';
  if (isRtf(s)) return 'rtf';
  if (/<\/?(p|br|b|i|div|span|a|font|strong|em|u)\b/i.test(s)) return 'html';
  return 'plain';
}
function aboutToHtml(s) {
  const st = aboutStyle(s);
  if (st === 'rtf') return rtfToHtml(s);
  if (st === 'html') return s;
  if (!s) return '';
  // theWord Bibles often use "\par" inside a one-line value
  return s.split(/\\par\b ?|\r?\n/).map(p => `<p>${esc(p.replace(/\\line\b ?/g, '\n')).replace(/\n/g, '<br>')}</p>`).join('');
}
function decodeEntities(s) { return s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&'); }
function rtfText(t) {
  let o = '';
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch;
    else if (c < 128) o += ch;
    else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`;
    else {
      const h = Math.floor((c - 0x10000) / 0x400) + 0xd800;
      const l = ((c - 0x10000) % 0x400) + 0xdc00;
      o += `\\u${h - 65536}?\\u${l - 65536}?`;
    }
  }
  return o;
}
/** simple HTML (paragraphs, line breaks, bold, italic, underline, lists, links) → RTF */
function htmlToRtf(html) {
  let o = '';
  const toks = String(html).replace(/\r?\n/g, ' ').split(/(<[^>]+>)/);
  let started = false;
  let linkHref = null;
  for (const t of toks) {
    if (!t) continue;
    const m = /^<(\/?)(\w+)([^>]*)>$/.exec(t);
    if (!m) { const txt = decodeEntities(t); if (txt.trim() || started) { o += rtfText(txt); started = true; } continue; }
    const close = !!m[1], tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'b' || tag === 'strong') o += close ? '\\b0 ' : '\\b ';
    else if (tag === 'i' || tag === 'em') o += close ? '\\i0 ' : '\\i ';
    else if (tag === 'u') o += close ? '\\ulnone ' : '\\ul ';
    else if (tag === 'br') o += '\\line ';
    else if (tag === 'li' && !close) o += '\\bullet  ';
    else if (tag === 'a' && !close) {
      const hm = /\b(?:data-href|href)\s*=\s*"([^"]*)"/i.exec(attrs);
      if (hm && hm[1]) { linkHref = decodeEntities(hm[1]); o += `{\\field{\\*\\fldinst{HYPERLINK "${rtfText(linkHref)}"}}{\\fldrslt `; }
    } else if (tag === 'a' && close && linkHref) {
      o += '}}'; linkHref = null;
    } else if (/^(p|div|li|h\d|ul|ol)$/.test(tag) && close) { o += '\\par '; }
  }
  if (linkHref) o += '}}';
  o = o.replace(/(\\par )+$/, '');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\f0\\fs20 ${o}}`;
}
/** HTML → the "\par" one-line style used in many theWord Bible "about" values */
function htmlToParLine(html) {
  return decodeEntities(String(html).replace(/\r?\n/g, ' ').replace(/<br\s*\/?>/gi, '\\line ').replace(/<\/(p|div|li|h\d)>/gi, '\\par ').replace(/<[^>]+>/g, '')).replace(/(\\par )+$/, '').trim();
}
function aboutFromHtml(html, original, format, ext) {
  const st = aboutStyle(original);
  if (format === 'e-Sword') return /i$/.test(ext) ? html : htmlToRtf(html); // e-Sword 11 (*.??i) uses HTML, 9/10 (*.??x) RTF
  if (st === 'html') return html;
  if (st === 'plain' && ext !== 'twm') return htmlToParLine(html);
  return htmlToRtf(html);
}

/* ---------------------------------------------------------------- reading */
function kindOf(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (/^(ont|ot|nt)$/.test(ext)) return { type: 'ont', ext };
  if (ext === 'twm') return { type: 'twm', ext };
  if (/^(ontx|otx|ntx)$/.test(ext)) return { type: 'locked', ext };
  if (/^(usfm|sfm|ptx)$/.test(ext) || /\.usfm\.zip$/i.test(file)) return { type: 'usfm', ext };
  if (/^(usfx|xml)$/.test(ext) || /\.usfx\.zip$/i.test(file)) return { type: 'usfx', ext };
  return { type: 'esword', ext };
}

function readOnt(file) {
  const buf = fs.readFileSync(file);
  const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  let text, enc = 'utf8';
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); enc = 'windows-1252'; }
  if (bom && text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.replace(/\r+\n/g, '\n').split(/\r\n|\n|\r/);
  const ext = path.extname(file).slice(1).toLowerCase();
  const count = ext === 'ont' ? canon.ONT_TOTAL : ext === 'ot' ? canon.OT_LINES : canon.NT_LINES;
  if (lines.length < count) throw new Error(`only ${lines.length} lines; a .${ext} Bible needs ${count} verse lines`);
  // entries keep their original lines so unchanged ones are written back exactly
  const entries = []; let cur = null;
  for (const ln of lines.slice(count)) {
    if (cur && cur.val.endsWith('\\')) { cur.val = cur.val.slice(0, -1) + '\n' + ln; cur.lines.push(ln); continue; }
    const m = ln.match(/^\s*([\w.\-]+)\s*=(.*)$/);
    if (m) { cur = { key: m[1], val: m[2], lines: [ln] }; entries.push(cur); }
    else { cur = null; entries.push({ key: null, lines: [ln] }); }
  }
  return { bom, enc, nl, verses: lines.slice(0, count), entries };
}

async function openDb(file) {
  const SQL = await sqljs();
  return new SQL.Database(fs.readFileSync(file));
}
function tables(db) { const r = db.exec("select name from sqlite_master where type='table'")[0]; const m = {}; if (r) for (const [n] of r.values) m[String(n).toLowerCase()] = String(n); return m; }

/** properties of a module file, ready for the Properties window */
async function read(file) {
  const st = fs.statSync(file);
  const k = kindOf(file);
  const base = { file, name: path.basename(file), size: st.size, ext: k.ext, backup: fs.existsSync(file + BACKUP) ? file + BACKUP : null };
  let writable = true; try { fs.accessSync(file, fs.constants.W_OK); } catch (e) { writable = false; }
  if (k.type === 'locked') return Object.assign(base, { format: 'theWord', editable: false, reason: 'an encrypted theWord Bible – it opens only in theWord', fields: [], extra: [], about: '' });
  const tooLargeToEdit = st.size > MAX_BYTES;
  if (tooLargeToEdit && k.type !== 'twm' && k.type !== 'esword') return Object.assign(base, { format: '?', editable: false, reason: 'the file is too large for Timotheos to edit', fields: [], extra: [], about: '' });
  let out;
  if (k.type === 'usfm' || k.type === 'usfx') {
    const usfm = require('./usfm');
    const m = k.type === 'usfm' ? usfm.loadUsfm(file) : usfm.loadUsfx(file);
    return Object.assign(base, {
      format: m.format, kind: 'Bible', editable: false,
      reason: `${m.format} Bible module (${Object.keys(m.books).length} books)`,
      fields: [
        { key: 'title', label: 'Title', value: m.title },
        { key: 'abbrev', label: 'Abbreviation', value: m.abbr },
        { key: 'lang', label: 'Language', value: (m.props && m.props.lang) || '' },
      ],
      extra: [], about: m.about || '', aboutStyle: 'html', compressed: false, encoding: 'utf8', rules: 0, canCompact: false, canZlib: false,
    });
  } else if (k.type === 'ont') {
    const o = readOnt(file); const props = {};
    for (const e of o.entries) if (e.key && e.key.toLowerCase() !== 'verse.rule' && e.key.toLowerCase() !== 'tag.rule') props[e.key.toLowerCase()] = e.val;
    out = { format: 'theWord', kind: 'Bible', values: props, labels: TW_FIELDS, encoding: o.enc, rules: o.entries.filter(e => e.key && (e.key.toLowerCase() === 'verse.rule' || e.key.toLowerCase() === 'tag.rule')).length };
  } else {
    const head = Buffer.alloc(16); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
    if (head.toString('latin1', 0, 15) !== 'SQLite format 3') return Object.assign(base, { format: k.type === 'twm' ? 'theWord' : 'e-Sword', editable: false, reason: 'the module is encrypted or in an unknown format', fields: [], extra: [], about: '' });
    const db = require('./sqlite').openDb(file); // reading only: straight from disk
    try {
      const T = tables(db);
      if (k.type === 'twm' && T.config) {
        const props = {};
        for (const [n, v] of (db.exec('select name, value from config')[0] || { values: [] }).values) props[String(n).toLowerCase()] = str(v);
        const compressed = props.compressed === '1';
        out = { format: 'theWord', kind: { 1: 'Dictionary', 2: 'Commentary', 3: 'Book', 4: 'Map', 10: 'Cross-references' }[props.type] || 'Book', values: props, labels: TW_FIELDS, compressed };
        if (props.secure === '1' || props.encrypted === '1') { out.editable = false; out.reason = 'a locked (encrypted) theWord module – its properties cannot be changed'; }
      } else if (T.details) {
        const r = db.exec(`select * from ${T.details} limit 1`)[0];
        const props = {}; if (r) r.columns.forEach((c, i) => { props[c.toLowerCase()] = r.values[0][i] == null ? '' : typeof r.values[0][i] === 'number' ? String(r.values[0][i]) : str(r.values[0][i]); });
        props.__about = props.comments != null ? 'comments' : props.information != null ? 'information' : null;
        out = { format: 'e-Sword', kind: ({ bbl: 'Bible', cmt: 'Commentary', dct: 'Dictionary', lex: 'Lexicon', top: 'Topic notes', ref: 'Reference book', dev: 'Devotional', har: 'Harmony', map: 'Graphics' })[k.ext.slice(0, 3)] || 'module', values: props, labels: ES_FIELDS, columns: r ? r.columns : [] };
        if (!r) { out.editable = false; out.reason = 'its Details table is empty'; }
      } else {
        out = { format: k.type === 'twm' ? 'theWord' : 'e-Sword', kind: 'module', values: {}, labels: [], editable: false, reason: 'this module has no properties table' };
      }
    } finally { db.close(); }
  }
  const v = out.values;
  const aboutKey = out.format === 'e-Sword' ? v.__about : 'about';
  const aboutRaw = aboutKey ? v[aboutKey] || '' : '';
  const shown = new Set(['about', '__about', 'comments', 'information', 'verse.rule', 'tag.rule']);
  // theWord: the usual fields are always offered (a missing one is added on save); e-Sword: only existing columns
  const always = out.format === 'theWord' ? (k.type === 'ont' ? ['title', 'short.title', 'description'] : ['title', 'abbrev', 'description', 'author']) : [];
  const fields = out.labels.filter(([key]) => key in v || always.includes(key))
    .map(([key, label]) => { shown.add(key); return { key, label, value: v[key] || '', multiline: MULTILINE.test(key) }; });
  const extra = Object.keys(v).filter(x => !shown.has(x)).sort().map(key => ({ key, value: v[key], readonly: READONLY_KEYS.test(key) }));
  const editable = out.editable !== false && writable && !tooLargeToEdit;
  return Object.assign(base, {
    format: out.format, kind: out.kind, fields, extra, editable,
    reason: out.reason || (tooLargeToEdit ? 'large database module (> 450 MB) – opened read-only directly from disk' : !writable ? 'the file is read-only' : ''),
    about: aboutToHtml(aboutRaw), aboutStyle: aboutStyle(aboutRaw), aboutKey,
    compressed: !!out.compressed, encoding: out.encoding || 'utf8', rules: out.rules || 0,
    canCompact: k.type !== 'ont' && !tooLargeToEdit, canZlib: k.type === 'twm' && !out.compressed && out.editable !== false && !tooLargeToEdit,
  });
}

/* ---------------------------------------------------------------- writing */
function backupOnce(file) { const b = file + BACKUP; if (!fs.existsSync(b)) fs.copyFileSync(file, b); return b; }
function atomicWrite(file, data) { const tmp = file + '.timotheos-tmp'; fs.writeFileSync(tmp, data); fs.renameSync(tmp, file); }

/** change properties. changes: { key: value }, aboutHtml: new About text (HTML) or undefined */
async function write(file, changes, aboutHtml) {
  const info = await read(file);
  if (!info.editable) throw new Error('This module cannot be changed: ' + info.reason);
  const k = kindOf(file);
  changes = Object.assign({}, changes);
  for (const e of info.extra) if (e.readonly) delete changes[e.key];
  if (aboutHtml != null && info.aboutKey) {
    const o = k.type === 'ont' ? readOnt(file) : null;
    const original = o ? (o.entries.find(e => e.key && e.key.toLowerCase() === 'about') || {}).val || '' : null;
    changes[info.aboutKey] = aboutFromHtml(aboutHtml, original != null ? original : rawAboutStyleHint(info), info.format, k.ext);
  }
  const backup = backupOnce(file);
  if (k.type === 'ont') {
    const o = readOnt(file); const left = new Map(Object.entries(changes).map(([a, b]) => [a.toLowerCase(), [a, b]]));
    const out = [];
    for (const e of o.entries) {
      const lk = e.key && e.key.toLowerCase();
      if (lk && left.has(lk)) { const [, val] = left.get(lk); left.delete(lk); out.push(...(`${e.key}=` + String(val).replace(/\r?\n/g, '\\\n')).split('\n')); }
      else out.push(...e.lines);
    }
    // new keys go before trailing empty lines
    let tail = 0; while (out.length && out[out.length - 1] === '') { out.pop(); tail++; }
    for (const [, [key, val]] of left) out.push(...(`${key}=` + String(val).replace(/\r?\n/g, '\\\n')).split('\n'));
    for (let i = 0; i < tail; i++) out.push('');
    const text = o.verses.concat(out).join(o.nl);
    // write back in the file's own encoding; a Windows-1252 file that now needs other letters becomes UTF-8
    const cp = o.enc === 'windows-1252' ? encode1252(text) : null;
    if (cp) atomicWrite(file, cp);
    else atomicWrite(file, Buffer.concat([o.bom || o.enc !== 'utf8' ? Buffer.from([0xEF, 0xBB, 0xBF]) : Buffer.alloc(0), Buffer.from(text, 'utf8')]));
  } else {
    const db = await openDb(file);
    try {
      const T = tables(db);
      if (k.type === 'twm') {
        for (const [key, val] of Object.entries(changes)) {
          const has = db.exec('select count(*) from config where lower(name) = lower(?)', [key])[0].values[0][0];
          if (has) db.run('update config set value = ? where lower(name) = lower(?)', [String(val), key]);
          else db.run('insert into config(name, value) values(?, ?)', [key, String(val)]);
        }
      } else {
        const r = db.exec(`select * from ${T.details} limit 1`)[0];
        const real = new Map(r.columns.map(c => [c.toLowerCase(), c]));
        for (const [key, val] of Object.entries(changes)) {
          const col = real.get(key.toLowerCase()); if (!col) continue;
          db.run(`update ${T.details} set "${col.replace(/"/g, '')}" = ?`, [val]);
        }
      }
      atomicWrite(file, Buffer.from(db.export()));
    } finally { db.close(); }
  }
  return { backup, info: await read(file) };
}
const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
  0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
/** text → Windows-1252 bytes, or null if some letter has no Windows-1252 code */
function encode1252(text) {
  const out = Buffer.alloc(text.length); let i = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x100) out[i++] = c; // (Node's decoder leaves bytes 0x80–0x9F as U+0080–U+009F)
    else if (CP1252[c] != null) out[i++] = CP1252[c];
    else return null;
  }
  return out.slice(0, i);
}
function rawAboutStyleHint(info) { return info.aboutStyle === 'html' ? '<p></p>' : info.aboutStyle === 'plain' ? 'x' : '{\\rtf1}'; }

/** make a module file smaller: compact it (SQLite VACUUM) and, for theWord books, optionally
 *  compress the text of every topic with zlib ("compressed=1", which Timotheos reads) */
async function compress(file, opts = {}) {
  const info = await read(file);
  const k = kindOf(file);
  if (!info.canCompact) throw new Error('Only database modules (.twm and e-Sword files) can be compacted.');
  if (!info.editable) throw new Error('This module cannot be changed: ' + info.reason);
  const before = info.size;
  const backup = backupOnce(file);
  const db = await openDb(file);
  let zipped = 0, skipped = 0;
  try {
    if (opts.zlib && k.type === 'twm' && !info.compressed) {
      const T = tables(db);
      if (!T.content) throw new Error('this module has no content table');
      const rows = db.exec('select topic_id, data, data2 from content')[0];
      const stmt = db.prepare('update content set data = ?, data2 = null where topic_id = ?');
      for (const [id, data, data2] of rows ? rows.values : []) {
        if (data == null && data2 == null) continue;
        if (data2 != null || typeof data !== 'string') { skipped++; continue; } // binary (e.g. RichView) content is not compressed
        stmt.run([zlib.deflateSync(Buffer.from(data, 'utf8'), { level: 9 }), id]); zipped++;
      }
      stmt.free();
      if (skipped) throw new Error(`${skipped} topics are stored in a form Timotheos does not compress (e.g. RichView); nothing was changed`);
      if (db.exec("select count(*) from config where name = 'compressed'")[0].values[0][0]) db.run("update config set value = '1' where name = 'compressed'");
      else db.run("insert into config(name, value) values('compressed', '1')");
    }
    db.run('VACUUM');
    atomicWrite(file, Buffer.from(db.export()));
  } catch (e) {
    db.close();
    // nothing was written; drop a backup made just now
    if (!info.backup && fs.existsSync(backup)) fs.unlinkSync(backup);
    throw e;
  }
  db.close();
  const after = fs.statSync(file).size;
  return { before, after, zipped, backup };
}

/** put the original file back */
function restore(file) {
  const b = file + BACKUP;
  if (!fs.existsSync(b)) throw new Error('There is no backup of this module.');
  atomicWrite(file, fs.readFileSync(b)); fs.unlinkSync(b);
  return true;
}

module.exports = { read, write, compress, restore, htmlToRtf, rtfText, aboutToHtml, BACKUP };
