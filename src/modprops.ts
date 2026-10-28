// Module properties: read and edit a module's information, and make module files smaller.
//   theWord Bibles (.ont/.ot/.nt): the "key=value" lines after the verse lines
//   theWord book modules (.twm): the config(name, value) table
//   e-Sword modules (SQLite): the one-row Details table
// Encrypted modules are never changed. Before the first change the native side keeps a copy of the
// original file next to it ("<name>.tanglaw-backup"). (Ported from the Electron edition's lib/modprops.js.)
import { invoke } from '@tauri-apps/api/core';
import canon from './legacy/canon.js';
import rtf from './legacy/rtf.js';
import { sql, text } from './native';

export interface Field { key: string; label: string; value: string; multiline: boolean }
export interface Extra { key: string; value: string; readonly: boolean }
export interface Info {
  file: string; name: string; size: number; ext: string; backup: string | null; format: string; kind: string;
  fields: Field[]; extra: Extra[]; editable: boolean; reason: string; about: string; aboutStyle: string; aboutKey: string | null;
  compressed: boolean; encoding: string; rules: number; canCompact: boolean; canZlib: boolean;
}

const TW_FIELDS: [string, string][] = [['title', 'Title'], ['short.title', 'Short title'], ['abbrev', 'Abbreviation'], ['description', 'Description'], ['author', 'Author'],
  ['publisher', 'Publisher'], ['publish.date', 'Published'], ['version.major', 'Version (major)'], ['version.minor', 'Version (minor)'], ['version.date', 'Version date'],
  ['lang', 'Language'], ['categories', 'Categories'], ['keywords', 'Keywords'], ['creator', 'Made by'], ['source', 'Source'], ['isbn', 'ISBN'],
  ['contributors', 'Contributors'], ['editorial.comments', 'Editorial comments']];
const ES_FIELDS: [string, string][] = [['title', 'Title'], ['abbreviation', 'Abbreviation'], ['description', 'Description'], ['version', 'Version'], ['font', 'Font']];
const READONLY_KEYS = /^(secure|do\.encrypt|encrypted|schema\.version|search\..*|compressed.*|id|type|content\.type|user)$/i;
const MULTILINE = /^(description|editorial\.comments|contributors|about)$/i;
const ES_KIND: Record<string, string> = { bbl: 'Bible', cmt: 'Commentary', dct: 'Dictionary', lex: 'Lexicon', top: 'Topic notes', ref: 'Reference book', dev: 'Devotional', har: 'Harmony', map: 'Graphics' };

const nat = {
  file: (path: string) => invoke<{ size: number; writable: boolean; backup: string | null }>('mod_file', { path }),
  read: (path: string) => invoke<string>('mod_read', { path }),
  write: (path: string, b64: string) => invoke<boolean>('mod_write', { path, b64 }),
  sqlWrite: (path: string, statements: [string, unknown[]][], vacuum: boolean) => invoke<[number, number, boolean]>('mod_sql_write', { path, statements, vacuum }),
  restore: (path: string) => invoke<void>('mod_restore', { path }),
};
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const extOf = (f: string) => (/\.([^.\\/]+)$/.exec(f)?.[1] || '').toLowerCase();
const baseName = (f: string) => f.split(/[\\/]/).pop() || f;
function kindOf(file: string): { type: 'ont' | 'twm' | 'locked' | 'esword'; ext: string } {
  const ext = extOf(file);
  if (/^(ont|ot|nt)$/.test(ext)) return { type: 'ont', ext };
  if (ext === 'twm') return { type: 'twm', ext };
  if (/^(ontx|otx|ntx)$/.test(ext)) return { type: 'locked', ext };
  return { type: 'esword', ext };
}
const b64ToBytes = (b: string) => { const s = atob(b); const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; };
function bytesToB64(b: Uint8Array): string { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); }

/* ---------------------------------------------------------------- About text ⇄ HTML */
function aboutStyle(s: string): string {
  if (!s) return 'none';
  if (rtf.isRtf(s)) return 'rtf';
  if (/<\/?(p|br|b|i|div|span|a|font|strong|em|u)\b/i.test(s)) return 'html';
  return 'plain';
}
export function aboutToHtml(s: string): string {
  const st = aboutStyle(s);
  if (st === 'rtf') return rtf.rtfToHtml(s);
  if (st === 'html') return s;
  if (!s) return '';
  return s.split(/\\par\b ?|\r?\n/).map(p => `<p>${esc(p.replace(/\\line\b ?/g, '\n')).replace(/\n/g, '<br>')}</p>`).join('');
}
const decodeEntities = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');
function rtfText(t: string): string {
  let o = '';
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch;
    else if (c < 128) o += ch;
    else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`;
    else o += `\\u${ch.charCodeAt(0) - 65536}?\\u${ch.charCodeAt(1) - 65536}?`;
  }
  return o;
}
/** simple HTML (paragraphs, line breaks, bold, italic, underline, lists) → RTF */
export function htmlToRtf(html: string): string {
  let o = ''; let started = false;
  for (const t of String(html).replace(/\r?\n/g, ' ').split(/(<[^>]+>)/)) {
    if (!t) continue;
    const m = /^<(\/?)(\w+)[^>]*>$/.exec(t);
    if (!m) { const txt = decodeEntities(t); if (txt.trim() || started) { o += rtfText(txt); started = true; } continue; }
    const close = !!m[1], tag = m[2].toLowerCase();
    if (tag === 'b' || tag === 'strong') o += close ? '\\b0 ' : '\\b ';
    else if (tag === 'i' || tag === 'em') o += close ? '\\i0 ' : '\\i ';
    else if (tag === 'u') o += close ? '\\ulnone ' : '\\ul ';
    else if (tag === 'br') o += '\\line ';
    else if (tag === 'li' && !close) o += '\\bullet  ';
    else if (/^(p|div|li|h\d|ul|ol)$/.test(tag) && close) o += '\\par ';
  }
  o = o.replace(/(\\par )+$/, '');
  return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs22 ${o}}`;
}
const htmlToParLine = (html: string) => decodeEntities(String(html).replace(/\r?\n/g, ' ').replace(/<br\s*\/?>/gi, '\\line ').replace(/<\/(p|div|li|h\d)>/gi, '\\par ').replace(/<[^>]+>/g, '')).replace(/(\\par )+$/, '').trim();
function aboutFromHtml(html: string, original: string, format: string, ext: string): string {
  const st = aboutStyle(original);
  if (format === 'e-Sword') return /i$/.test(ext) ? html : htmlToRtf(html); // e-Sword 11 (*.??i) HTML, 9/10 (*.??x) RTF
  if (st === 'html') return html;
  if (st === 'plain' && ext !== 'twm') return htmlToParLine(html);
  return htmlToRtf(html);
}

/* ---------------------------------------------------------------- text Bibles */
interface Ont { bom: boolean; enc: string; nl: string; verses: string[]; entries: { key: string | null; val?: string; lines: string[] }[] }
async function readOnt(file: string): Promise<Ont> {
  const buf = b64ToBytes(await nat.read(file));
  const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
  let t: string, enc = 'utf8';
  try { t = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { t = new TextDecoder('windows-1252').decode(buf); enc = 'windows-1252'; }
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  const nl = t.includes('\r\n') ? '\r\n' : '\n';
  const lines = t.split(/\r\n|\n|\r/);
  const ext = extOf(file); const count = ext === 'ont' ? canon.ONT_TOTAL : ext === 'ot' ? canon.OT_LINES : canon.NT_LINES;
  if (lines.length < count) throw new Error(`only ${lines.length} lines; a .${ext} Bible needs ${count} verse lines`);
  const entries: Ont['entries'] = []; let cur: Ont['entries'][number] | null = null;
  for (const ln of lines.slice(count)) {
    if (cur && cur.val != null && cur.val.endsWith('\\')) { cur.val = cur.val.slice(0, -1) + '\n' + ln; cur.lines.push(ln); continue; }
    const m = ln.match(/^\s*([\w.-]+)\s*=(.*)$/);
    if (m) { cur = { key: m[1], val: m[2], lines: [ln] }; entries.push(cur); } else { cur = null; entries.push({ key: null, lines: [ln] }); }
  }
  return { bom, enc, nl, verses: lines.slice(0, count), entries };
}
const CP1252: Record<number, number> = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E,
  0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function encode1252(t: string): Uint8Array | null {
  const out = new Uint8Array(t.length); let i = 0;
  for (const ch of t) { const c = ch.codePointAt(0)!; if (c < 0x100) out[i++] = c; else if (CP1252[c] != null) out[i++] = CP1252[c]; else return null; }
  return out.slice(0, i);
}

/* ---------------------------------------------------------------- reading */
const q1 = async (file: string, query: string, params: (string | number)[] = []) => (await sql(file, query, params)).rows;
async function tables(file: string): Promise<Record<string, string>> {
  const m: Record<string, string> = {}; for (const [n] of await q1(file, "select name from sqlite_master where type='table'")) m[text(n).toLowerCase()] = text(n); return m;
}

/** properties of a module file, ready for the Properties window */
export async function readProps(file: string): Promise<Info> {
  const fs = await nat.file(file); const k = kindOf(file);
  const base = { file, name: baseName(file), size: fs.size, ext: k.ext, backup: fs.backup };
  const none = (format: string, reason: string): Info => ({ ...base, format, kind: '', fields: [], extra: [], editable: false, reason, about: '', aboutStyle: 'none', aboutKey: null, compressed: false, encoding: 'utf8', rules: 0, canCompact: false, canZlib: false });
  if (k.type === 'locked') return none('theWord', 'an encrypted theWord Bible – it opens only in theWord');
  if (fs.size > 450 * 1024 * 1024) return none('?', 'the file is too large for Tanglaw to edit');
  let format = 'theWord', kind = 'module', values: Record<string, string> = {}, labels: [string, string][] = [], encoding = 'utf8', rules = 0, compressed = false, editable = true, reason = '', aboutKey: string | null = 'about';
  if (k.type === 'ont') {
    const o = await readOnt(file);
    for (const e of o.entries) if (e.key && e.key.toLowerCase() !== 'verse.rule') values[e.key.toLowerCase()] = e.val || '';
    kind = 'Bible'; labels = TW_FIELDS; encoding = o.enc; rules = o.entries.filter(e => e.key && e.key.toLowerCase() === 'verse.rule').length;
  } else {
    let T: Record<string, string>;
    try { T = await tables(file); } catch { return none(k.type === 'twm' ? 'theWord' : 'e-Sword', 'the module is encrypted or in an unknown format'); }
    if (k.type === 'twm' && T.config) {
      for (const [n, v] of await q1(file, 'select name, value from config')) values[text(n).toLowerCase()] = text(v);
      compressed = values.compressed === '1';
      kind = ({ 1: 'Dictionary', 2: 'Commentary', 3: 'Book', 4: 'Map', 10: 'Cross-references' } as Record<string, string>)[values.type] || 'Book'; labels = TW_FIELDS;
      if (values.secure === '1' || values.encrypted === '1') { editable = false; reason = 'a locked (encrypted) theWord module – its properties cannot be changed'; }
    } else if (T.details) {
      format = 'e-Sword';
      const r = await sql(file, `select * from "${T.details}" limit 1`);
      if (r.rows[0]) r.columns.forEach((c, i) => { values[c.toLowerCase()] = text(r.rows[0][i]); });
      aboutKey = values.comments != null ? 'comments' : values.information != null ? 'information' : null;
      kind = ES_KIND[k.ext.slice(0, 3)] || 'module'; labels = ES_FIELDS;
      if (!r.rows[0]) { editable = false; reason = 'its Details table is empty'; }
    } else { format = k.type === 'twm' ? 'theWord' : 'e-Sword'; editable = false; reason = 'this module has no properties table'; aboutKey = null; }
  }
  const aboutRaw = aboutKey ? values[aboutKey] || '' : '';
  const shown = new Set(['about', 'comments', 'information', 'verse.rule']);
  const always = format === 'theWord' ? (k.type === 'ont' ? ['title', 'short.title', 'description'] : ['title', 'abbrev', 'description', 'author']) : [];
  const fields = labels.filter(([key]) => key in values || always.includes(key)).map(([key, label]) => { shown.add(key); return { key, label, value: values[key] || '', multiline: MULTILINE.test(key) }; });
  const extra = Object.keys(values).filter(x => !shown.has(x)).sort().map(key => ({ key, value: values[key], readonly: READONLY_KEYS.test(key) }));
  if (editable && !fs.writable) { editable = false; reason = 'the file is read-only'; }
  return { ...base, format, kind, fields, extra, editable, reason, about: aboutToHtml(aboutRaw), aboutStyle: aboutStyle(aboutRaw), aboutKey,
    compressed, encoding, rules, canCompact: k.type !== 'ont', canZlib: k.type === 'twm' && !compressed && editable };
}

/* ---------------------------------------------------------------- writing */
/** change properties; aboutHtml = new About text (HTML) or undefined. Returns whether a backup was made now. */
export async function writeProps(file: string, changesIn: Record<string, string>, aboutHtml?: string): Promise<{ backupMade: boolean; info: Info }> {
  const info = await readProps(file);
  if (!info.editable) throw new Error('This module cannot be changed: ' + info.reason);
  const k = kindOf(file); const changes = { ...changesIn };
  for (const e of info.extra) if (e.readonly) delete changes[e.key];
  let made = false;
  if (k.type === 'ont') {
    const o = await readOnt(file);
    if (aboutHtml != null) changes.about = aboutFromHtml(aboutHtml, (o.entries.find(e => e.key && e.key.toLowerCase() === 'about') || {}).val || '', info.format, k.ext);
    const left = new Map(Object.entries(changes).map(([a, b]) => [a.toLowerCase(), [a, b] as [string, string]]));
    const val = (key: string, v: string) => (`${key}=` + String(v).replace(/\r?\n/g, '\\\n')).split('\n');
    const out: string[] = [];
    for (const e of o.entries) { const lk = e.key && e.key.toLowerCase(); if (lk && left.has(lk)) { out.push(...val(e.key!, left.get(lk)![1])); left.delete(lk); } else out.push(...e.lines); }
    let tail = 0; while (out.length && out[out.length - 1] === '') { out.pop(); tail++; }
    for (const [, [key, v]] of left) out.push(...val(key, v));
    for (let i = 0; i < tail; i++) out.push('');
    const t = o.verses.concat(out).join(o.nl);
    const cp = o.enc === 'windows-1252' ? encode1252(t) : null;
    let bytes: Uint8Array;
    if (cp) bytes = cp;
    else { const u = new TextEncoder().encode(t); const bomNeeded = o.bom || o.enc !== 'utf8'; bytes = new Uint8Array((bomNeeded ? 3 : 0) + u.length); if (bomNeeded) bytes.set([0xEF, 0xBB, 0xBF]); bytes.set(u, bomNeeded ? 3 : 0); }
    made = await nat.write(file, bytesToB64(bytes));
  } else {
    if (aboutHtml != null && info.aboutKey) changes[info.aboutKey] = aboutFromHtml(aboutHtml, info.aboutStyle === 'html' ? '<p></p>' : info.aboutStyle === 'plain' ? 'x' : '{\\rtf1}', info.format, k.ext);
    const st: [string, unknown[]][] = [];
    if (k.type === 'twm') {
      const have = new Set((await q1(file, 'select lower(name) from config')).map(r => text(r[0])));
      for (const [key, v] of Object.entries(changes)) st.push(have.has(key.toLowerCase()) ? ['update config set value = ? where lower(name) = lower(?)', [String(v), key]] : ['insert into config(name, value) values(?, ?)', [key, String(v)]]);
    } else {
      const T = await tables(file); const r = await sql(file, `select * from "${T.details}" limit 1`);
      const real = new Map(r.columns.map(c => [c.toLowerCase(), c]));
      for (const [key, v] of Object.entries(changes)) { const col = real.get(key.toLowerCase()); if (col) st.push([`update "${T.details}" set "${col.replace(/"/g, '')}" = ?`, [v]]); }
    }
    if (st.length) made = (await nat.sqlWrite(file, st, false))[2];
  }
  return { backupMade: made, info: await readProps(file) };
}

async function deflate(t: string): Promise<string> {
  const s = new Blob([new TextEncoder().encode(t)]).stream().pipeThrough(new CompressionStream('deflate'));
  return bytesToB64(new Uint8Array(await new Response(s).arrayBuffer()));
}
/** make a database module smaller: compact it and, for theWord books, optionally zlib-compress every topic */
export async function compressModule(file: string, zlib: boolean): Promise<{ before: number; after: number; zipped: number }> {
  const info = await readProps(file); const k = kindOf(file);
  if (!info.canCompact) throw new Error('Only database modules (.twm and e-Sword files) can be compacted.');
  if (!info.editable) throw new Error('This module cannot be changed: ' + info.reason);
  const st: [string, unknown[]][] = []; let zipped = 0;
  if (zlib && k.type === 'twm' && !info.compressed) {
    const T = await tables(file); if (!T.content) throw new Error('this module has no content table');
    const r = await sql(file, 'select topic_id, data, data2 from content');
    let skipped = 0;
    for (const [id, data, data2] of r.rows) {
      if (data == null && data2 == null) continue;
      if (data2 != null || typeof data !== 'string') { skipped++; continue; }
      st.push(['update content set data = ?, data2 = null where topic_id = ?', [{ $b64: await deflate(data) }, id]]); zipped++;
    }
    if (skipped) throw new Error(`${skipped} topics are stored in a form Tanglaw does not compress (e.g. RichView); nothing was changed`);
    st.push([info.extra.some(e => e.key === 'compressed') ? "update config set value = '1' where name = 'compressed'" : "insert into config(name, value) values('compressed', '1')", []]);
  }
  const [before, after] = await nat.sqlWrite(file, st, true);
  return { before, after, zipped };
}
export const restoreModule = (file: string) => nat.restore(file);
