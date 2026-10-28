// Library modules: commentaries, dictionaries, books, devotionals of theWord (.twm) and e-Sword
// (.cmtx/.cmti, .dctx/.dcti, .lexx/.lexi, .topx/.topi, .refx/.refi, .devx/.devi).
// TypeScript port of the Electron version's lib/bookmod.js; the files are read through native SQLite.
// Encrypted modules (theWord secure=1, encrypted e-Sword) are reported and never decoded.
import canon from './legacy/canon.js';
import esw from './legacy/eswordfmt.js';
import rtf from './legacy/rtf.js';
import { ModFile, bytes, inflate, sql, text } from './native';

export type Kind = 'dictionary' | 'commentary' | 'book' | 'devotional' | 'map' | 'readingplan';
export interface Topic { id: number | string; pid: number | string; subject: string }
export interface Entry { id: number | string; subject: string; html: string }
export interface Hit { id: number | string; subject: string; level: 'verse' | 'passage' | 'chapter' | 'book' }
export interface BookMod {
  id: string; file: string; name: string; format: 'theWord' | 'e-Sword'; kind: Kind; title: string; abbr: string;
  locked: boolean; reason?: string; isStrong: boolean; greek: boolean; hebrew: boolean; isMorph: boolean;
  topics(): Promise<Topic[]>; topic(id: number | string): Promise<Entry | null>;
  forVerse(b: number, c: number, v: number): Hit | null; verseMarks(b: number, c: number): Set<number>;
  lookup(key: string): Promise<Entry | null>; today(m: number, d: number): Promise<Topic[]>; searchTopics(q: string): Promise<Topic[]>;
  /** every topic as plain text, for searching (read in one go; progress 0..1) */
  texts?(progress?: (f: number) => void): Promise<TopicText[]>;
}
export interface TopicText { id: number | string; subject: string; text: string }
/** html → plain text without a DOM (fast enough for whole modules) */
export function plain(html: string): string {
  return html.replace(/<(br|p|div|li|h\d|tr)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}
const tick = () => new Promise(r => setTimeout(r, 0));

const BOOK_EXT = /\.(twm|cmt[xi]|dct[xi]|lex[xi]|top[xi]|ref[xi]|dev[xi])$/i;
export function isBookFile(name: string): boolean { return BOOK_EXT.test(name) && !/\.(xrefs|rdp)\.twm$/i.test(name); }

export function guessKind(name: string): Kind {
  const n = name.toLowerCase();
  if (/\.dct\.twm$|\.dct[xi]$|\.lex[xi]$/.test(n)) return 'dictionary';
  if (/\.cmt\.twm$|\.cmt[xi]$/.test(n)) return 'commentary';
  if (/\.dev\.twm$|\.dev[xi]$/.test(n)) return 'devotional';
  if (/\.map\.twm$/.test(n)) return 'map';
  return 'book';
}

export function refLabel(b: number, c1: number, v1: number, c2?: number, v2?: number): string {
  const bk = canon.book(b);
  if (!c1) return bk.name;
  if (!v1) return `${bk.name} ${c1}${c2 && c2 !== c1 ? '–' + c2 : ''}`;
  let s = `${bk.name} ${c1}:${v1}`;
  if (c2 && c2 !== c1) s += `–${c2}:${v2 || ''}`; else if (v2 && v2 !== v1) s += `–${v2}`;
  return s;
}
function toHtml(body: string, hint?: string): string {
  if (!body) return '';
  if (rtf.isRtf(body) || (hint === 'rtf' && /\\[a-z]+/.test(body))) return rtf.rtfToHtml(body);
  return esw.htmlish(body);
}
/** small stemmer for "similar word" topic matching (same as the Electron version) */
export function stemOf(w: string): string {
  let s = String(w || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const suf of ['eth', 'est', 'ing', 'edst', 'ed', 'es', 's']) if (s.length > suf.length + 2 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}
function strongKeys(key: string, pad5 = false): string[] {
  const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(key); if (!m) return [key];
  const L = m[1].toUpperCase();
  return [...new Set([key, L + m[2] + m[3], L + m[2], L + m[2].padStart(4, '0') + m[3], L + m[2].padStart(4, '0'), ...(pad5 ? [L + m[2].padStart(5, '0')] : [])])];
}

async function tableMap(f: string): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  for (const [n] of (await sql(f, "select name from sqlite_master where type in ('table','view')")).rows) m[String(n).toLowerCase()] = String(n);
  return m;
}
async function columns(f: string, t: string): Promise<string[]> { return (await sql(f, `pragma table_info("${t}")`)).rows.map(r => String(r[1])); }
function pick(cols: string[], names: string[]): string | null { const low = cols.map(c => c.toLowerCase()); for (const n of names) { const i = low.indexOf(n); if (i >= 0) return cols[i]; } return null; }
const rows = async (f: string, q: string, p: (string | number | null)[] = []) => (await sql(f, q, p)).rows;

function lockedMod(stub: BookMod, reason: string): BookMod {
  return Object.assign(stub, { locked: true, reason, topics: async () => [], topic: async () => null, forVerse: () => null, verseMarks: () => new Set<number>(), lookup: async () => null, today: async () => [], searchTopics: async () => [] });
}

/* ------------------------------------------------------------------ theWord */
async function openTheWord(f: ModFile, tabs: Record<string, string>, stub: BookMod): Promise<BookMod> {
  const cfg: Record<string, string> = {};
  for (const [k, v] of await rows(f.path, 'select name, value from config')) cfg[text(k).toLowerCase()] = text(v);
  let kind: Kind = ({ 1: 'dictionary', 2: 'commentary', 3: 'book', 4: 'map' } as Record<string, Kind>)[cfg.type] || stub.kind;
  if (tabs.devotion) kind = 'devotional';
  const mod = Object.assign(stub, {
    kind, title: cfg.title || cfg.abbrev || stub.title, abbr: cfg.abbrev || cfg.id || stub.abbr,
    isStrong: cfg.strong === '1' || /strong/i.test(cfg.keywords || ''), greek: cfg['strong.g'] !== '0', hebrew: cfg['strong.h'] === '1',
    isMorph: /morph|rmac|robinson|packard|parsing/i.test([cfg.title, cfg.keywords, cfg.categories, stub.name].join(' ')) || cfg.morph === '1',
  });
  if (cfg.secure === '1' || cfg.encrypted === '1') return lockedMod(mod, 'encrypted (a locked/paid theWord module) – it opens only in theWord');
  const compressed = cfg.compressed === '1';
  const defType = (cfg['content.type'] || 'rtf').toLowerCase();
  const tcols = tabs.topics ? (await columns(f.path, tabs.topics)).map(c => c.toLowerCase()) : [];
  const hasCT = tcols.includes('content_type'), hasOrig = tcols.includes('strong_orig_word');

  let refs: { t: number; b: number; c: number; f: number; e: number }[] | null = null;
  if (tabs.bible_refs) {
    const rc = await columns(f.path, tabs.bible_refs); const col = (n: string[]) => pick(rc, n);
    const cT = col(['topic_id']), cB = col(['bi', 'book']), cC = col(['ci', 'chapter']), cF = col(['fvi', 'vi', 'verse']), cE = col(['tvi', 'evi']);
    if (cT && cB && cC && cF) refs = (await rows(f.path, `select ${cT}, ${cB}, ${cC}, ${cF}, ${cE || cF} from ${tabs.bible_refs}`)).map(r => { const [t, b, c, ff, e] = r as number[]; return { t, b, c, f: ff || 0, e: e || ff || 0 }; });
  }
  if (refs && kind !== 'commentary' && !tabs.topics) kind = mod.kind = 'commentary';

  let topicList: Topic[] | null = null;
  async function topics(): Promise<Topic[]> {
    if (topicList) return topicList;
    let list: (Topic & { ref?: unknown })[] = [];
    if (tabs.topics) {
      list = (await rows(f.path, `select id, pid, subject from ${tabs.topics} order by pid, rel_order, id`)).map(([id, pid, s]) => ({ id: id as number, pid: (pid as number) || 0, subject: text(s) }));
      if (tabs.topics_flags) { const hidden = new Set((await rows(f.path, `select id from ${tabs.topics_flags} where hidden = 1`)).map(r => r[0])); list = list.filter(t => !hidden.has(t.id)); }
    }
    if (refs) {
      const label = new Map<number, (typeof refs)[number]>(); for (const r of refs) if (!label.has(r.t)) label.set(r.t, r);
      const byId = new Map(list.map(t => [t.id, t]));
      for (const [t, r] of label) {
        const subject = refLabel(r.b, r.c, r.f, r.c, r.e); const tt = byId.get(t);
        if (tt) { tt.ref = r; if (!tt.subject) tt.subject = subject; } else list.push({ id: t, pid: 0, subject, ref: r });
      }
      const key = (x: { ref?: unknown }) => { const r = x.ref as { b: number; c: number; f: number } | undefined; return r ? canon.orderKey(r.b) * 1e6 + r.c * 1000 + r.f : 0; };
      list.sort((x, y) => (x.ref && y.ref) ? key(x) - key(y) : 0);
    }
    topicList = list.map(({ id, pid, subject }) => ({ id, pid, subject }));
    return topicList;
  }
  async function body(id: number | string): Promise<string | null> {
    const r = await rows(f.path, 'select data, data2 from content where topic_id = ?', [id as number]);
    if (!r.length) return null;
    const [data, data2] = r[0]; const b1 = bytes(data), b2 = bytes(data2);
    let t = '';
    if (compressed && b2) t = (await inflate(b2)) || '';
    // zlib data starts with 0x78 (0x01, 0x5E, 0x9C or 0xDA): inflate it even where the module does not say "compressed"
    const zl = (b: Uint8Array | null) => !!b && b.length > 2 && b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1]);
    if (!t && data != null) { t = text(data); if (!/^\s*[{<]/.test(t) && b1 && (compressed || zl(b1))) t = (await inflate(b1)) || t; }
    if (!t && b2) t = (await inflate(b2)) || text(data2);
    return t;
  }
  async function texts(progress?: (f: number) => void): Promise<TopicText[]> {
    const list = await topics(); const subj = new Map(list.map(t => [t.id, t.subject]));
    const all = await rows(f.path, 'select topic_id, data, data2 from content');
    const cts = new Map<unknown, string>();
    if (hasCT) for (const [id, ct] of await rows(f.path, `select id, content_type from ${tabs.topics}`)) if (ct) cts.set(id, String(ct).toLowerCase());
    const zl = (b: Uint8Array | null) => !!b && b.length > 2 && b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1]);
    const out: TopicText[] = [];
    for (let i = 0; i < all.length; i++) {
      const [id, data, data2] = all[i]; if (subj.size && !subj.has(id as number)) continue;
      const b1 = bytes(data), b2 = bytes(data2); let t = '';
      if (compressed && b2) t = (await inflate(b2)) || '';
      if (!t && data != null) { t = text(data); if (!/^\s*[{<]/.test(t) && b1 && (compressed || zl(b1))) t = (await inflate(b1)) || t; }
      if (!t && b2) t = (await inflate(b2)) || text(data2);
      const ct = cts.get(id) || defType;
      if (ct !== 'rvf' && ct !== 'meta' && !/^-8 ?RichView/.test(t)) out.push({ id: id as number, subject: subj.get(id as number) || String(id), text: plain(toHtml(t, ct)) });
      if (i % 300 === 299) { progress?.(i / all.length); await tick(); }
    }
    return out;
  }
  async function topic(id: number | string): Promise<Entry | null> {
    const list = await topics(); const t = list.find(x => x.id === id);
    const raw = await body(id); if (raw == null && !t) return null;
    let ct = defType;
    if (hasCT) { const r = await rows(f.path, `select content_type from ${tabs.topics} where id = ?`, [id as number]); if (r[0]?.[0]) ct = String(r[0][0]).toLowerCase(); }
    let html: string;
    if (ct === 'rvf' || /^-8 ?RichView/.test(raw || '')) html = '<p class="note">This entry is stored in RichView format, which Tanglaw cannot display yet.</p>';
    else html = ct === 'meta' ? '' : toHtml(raw || '', ct);
    return { id, subject: t ? t.subject : String(id), html };
  }
  function forVerse(b: number, c: number, v: number): Hit | null {
    if (!refs) return null;
    let best: (typeof refs)[number] | null = null, rank = 9, span = 1e9;
    for (const r of refs) {
      if (r.b !== b) continue;
      let lv: number;
      if (r.c === 0) lv = 3; else if (r.c !== c) continue; else if (r.f === 0) lv = 2;
      else if (r.f <= v && v <= Math.max(r.e, r.f)) lv = (r.f === v && r.e <= v) ? 0 : 1; else continue;
      const sp = Math.max(r.e, r.f) - r.f;
      if (lv < rank || (lv === rank && sp < span)) { best = r; rank = lv; span = sp; }
    }
    return best ? { id: best.t, subject: refLabel(best.b, best.c, best.f, best.c, best.e), level: (['verse', 'passage', 'chapter', 'book'] as const)[rank] } : null;
  }
  function verseMarks(b: number, c: number): Set<number> {
    const s = new Set<number>();
    if (refs) for (const r of refs) if (r.b === b && r.c === c && r.f > 0) for (let v = r.f; v <= Math.max(r.e, r.f); v++) s.add(v);
    return s;
  }
  async function lookup(key: string): Promise<Entry | null> {
    if (!tabs.topics) return null;
    for (const k of strongKeys(key)) { const r = await rows(f.path, `select id from ${tabs.topics} where subject = ? collate nocase limit 1`, [k]); if (r.length) return topic(r[0][0] as number); }
    if (hasOrig && !/^[GH]\d/i.test(key)) { const r = await rows(f.path, `select id from ${tabs.topics} where strong_orig_word = ? limit 1`, [key]); if (r.length) return topic(r[0][0] as number); }
    return null;
  }
  async function today(month: number, day: number): Promise<Topic[]> {
    if (!tabs.devotion) return [];
    const list = await topics();
    return (await rows(f.path, `select topic_id from ${tabs.devotion} where monthOfYear = ? and dayOfMonth = ? order by morningOrEvening`, [month, day]))
      .map(([id]) => list.find(x => x.id === id) || { id: id as number, pid: 0, subject: `${month}/${day}` });
  }
  async function searchTopics(q: string): Promise<Topic[]> {
    if (!tabs.topics) return (await topics()).filter(t => t.subject.toLowerCase().includes(q.toLowerCase())).slice(0, 300);
    return (await rows(f.path, `select id, pid, subject from ${tabs.topics} where subject like ? order by (subject like ?) desc, subject limit 300`, ['%' + q + '%', q + '%'])).map(([id, pid, s]) => ({ id: id as number, pid: (pid as number) || 0, subject: text(s) }));
  }
  return Object.assign(mod, { locked: false, topics, topic, forVerse, verseMarks, lookup, today, searchTopics, texts });
}

/* ------------------------------------------------------------------ e-Sword */
interface Item extends Topic { table: string; rowid: number; col: string; ref?: { b: number; c: number; f: number; c2: number; e: number }; md?: [number, number] | null }

async function openESword(f: ModFile, tabs: Record<string, string>, stub: BookMod): Promise<BookMod> {
  const details: Record<string, string> = {};
  if (tabs.details) { const r = await sql(f.path, `select * from ${tabs.details} limit 1`); r.columns.forEach((c, i) => { details[c.toLowerCase()] = text(r.rows[0]?.[i]); }); }
  const bookMap = esw.bookMap();
  let kind = stub.kind;
  if (tabs.versecommentary || tabs.chaptercommentary || tabs.bookcommentary) kind = 'commentary';
  else if (tabs.devotions || tabs.devotion) kind = 'devotional';
  else if (tabs.dictionary || tabs.lexicon) kind = 'dictionary';
  else if (tabs.topics || tabs.topic || tabs.reference) kind = 'book';
  const mod = Object.assign(stub, { kind, title: details.title || details.description || stub.title, abbr: details.abbreviation || stub.abbr, isStrong: false, greek: false, hebrew: false, isMorph: false });
  let items: Item[] = [];
  let byKey: Map<string, Item> | null = null;
  if (kind === 'commentary') {
    const parts: Item[] = [];
    const add = async (t: string, level: 'book' | 'chapter' | 'verse') => {
      if (!tabs[t]) return;
      const cols = await columns(f.path, tabs[t]);
      const cB = pick(cols, ['book']), cText = pick(cols, ['comments', 'commentary', 'notes', 'text']);
      const cC1 = pick(cols, ['chapterbegin', 'chapter']), cV1 = pick(cols, ['versebegin', 'verse']);
      const cC2 = pick(cols, ['chapterend']), cV2 = pick(cols, ['verseend']);
      if (!cB || !cText) return;
      const sel = [cB, cC1 || '0', cV1 || '0', cC2 || cC1 || '0', cV2 || cV1 || '0'].join(', ');
      for (const r of await rows(f.path, `select rowid, ${sel} from ${tabs[t]}`)) {
        const [rowid, b, c1, v1, c2, v2] = r as number[];
        const bb = bookMap[b] || b;
        const lv = level === 'verse' ? 'v' : level === 'chapter' ? 'c' : 'b';
        const ref = { b: bb, c: level === 'book' ? 0 : c1, f: level === 'verse' ? v1 : 0, c2: level === 'verse' ? (c2 || c1) : c1, e: level === 'verse' ? (v2 || v1) : 0 };
        parts.push({ id: `${lv}${rowid}`, pid: 0, subject: refLabel(bb, ref.c, ref.f, ref.c2, ref.e), ref, table: tabs[t], rowid, col: cText });
      }
    };
    await add('bookcommentary', 'book'); await add('chaptercommentary', 'chapter'); await add('versecommentary', 'verse');
    parts.sort((x, y) => canon.orderKey(x.ref!.b) - canon.orderKey(y.ref!.b) || x.ref!.c - y.ref!.c || x.ref!.f - y.ref!.f);
    items = parts;
  } else {
    const t = tabs.dictionary || tabs.lexicon || tabs.topics || tabs.topic || tabs.reference || tabs.devotions || tabs.devotion;
    if (!t) return lockedMod(mod, 'no readable content table – encrypted or unknown e-Sword module');
    const cols = await columns(f.path, t);
    const cTitle = pick(cols, ['topic', 'title', 'chapter', 'subject', 'name', 'word']);
    const cText = pick(cols, ['definition', 'notes', 'comments', 'devotion', 'content', 'text', 'description']);
    const cMonth = pick(cols, ['month']), cDay = pick(cols, ['day']);
    if (!details.title && !details.description) mod.title = stub.name.replace(/\.[^.]+$/, '');
    if (!cText || !(cTitle || (cMonth && cDay))) return lockedMod(mod, `unexpected e-Sword table layout (${cols.join(', ')})`);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const sel = [cTitle || "''", cMonth || 'null', cDay || 'null'].join(', ');
    items = (await rows(f.path, `select rowid, ${sel} from ${t}${cMonth ? ` order by ${cMonth}, ${cDay}` : ''}`)).map(r => {
      const [rowid, title, mo, dy] = r as [number, unknown, number | null, number | null];
      return { id: 'r' + rowid, pid: 0, subject: cTitle ? text(title) : `${months[((mo as number) || 1) - 1]} ${dy}`, table: t, rowid, col: cText, md: cMonth && cDay ? [mo as number, dy as number] as [number, number] : null };
    });
    if (kind === 'dictionary') {
      const strongish = items.filter(i => /^[GH]\d+[a-z]?$/i.test(i.subject.trim())).length;
      if (strongish > items.length * 0.5) { mod.isStrong = true; mod.greek = items.some(i => /^G\d/i.test(i.subject)); mod.hebrew = items.some(i => /^H\d/i.test(i.subject)); }
      mod.isMorph = /morph|rmac|robinson|packard|parsing/i.test(mod.title + ' ' + stub.name);
    }
    byKey = new Map(); for (const it of items) { const k = it.subject.trim().toLowerCase(); if (!byKey.has(k)) byKey.set(k, it); }
  }
  const byId = new Map(items.map(i => [i.id, i]));
  async function topic(id: number | string): Promise<Entry | null> {
    const it = byId.get(id); if (!it) return null;
    const r = await rows(f.path, `select ${it.col} from ${it.table} where rowid = ?`, [it.rowid]);
    const v = r[0]?.[0]; let raw = '';
    const b = bytes(v);
    if (b) { const t = text(v); raw = (!/^[\s\S]{0,40}[{<\w]/.test(t) || t.includes('�')) ? ((await inflate(b)) || t) : t; } else raw = text(v);
    if (raw && (!/^[\s\S]{0,40}[{<\w&]/.test(raw) || (raw.match(/[\u0000-\u0008�]/g) || []).length > 3))
      return { id, subject: it.subject, html: '<p class="note">This entry is stored in a compressed or encrypted form that Tanglaw cannot read. If this is an e-Sword 10 reference book (.refx), the e-Sword 11 version (.refi) will work.</p>' };
    return { id, subject: it.subject, html: esw.eswordToHtml(raw) };
  }
  function forVerse(b: number, c: number, v: number): Hit | null {
    if (kind !== 'commentary') return null;
    let best: Item | null = null, rank = 9, span = 1e9;
    for (const it of items) {
      const r = it.ref!; if (r.b !== b) continue;
      let lv: number;
      if (r.c === 0) lv = 3;
      else if (r.f === 0) { if (r.c !== c) continue; lv = 2; }
      else {
        const startOk = r.c < c || (r.c === c && r.f <= v), endOk = r.c2 > c || (r.c2 === c && r.e >= v);
        if (!startOk || !endOk) continue;
        lv = (r.c === c && r.f === v && r.c2 === c && r.e === v) ? 0 : 1;
      }
      const sp = (r.c2 - r.c) * 200 + (r.e - r.f);
      if (lv < rank || (lv === rank && sp < span)) { best = it; rank = lv; span = sp; }
    }
    return best ? { id: best.id, subject: best.subject, level: (['verse', 'passage', 'chapter', 'book'] as const)[rank] } : null;
  }
  function verseMarks(b: number, c: number): Set<number> {
    const s = new Set<number>();
    if (kind === 'commentary') for (const it of items) { const r = it.ref!; if (r.b === b && r.f > 0 && r.c <= c && r.c2 >= c) { const from = r.c === c ? r.f : 1, to = r.c2 === c ? r.e : 200; for (let v = from; v <= Math.min(to, 200); v++) s.add(v); } }
    return s;
  }
  async function lookup(key: string): Promise<Entry | null> {
    if (!byKey) return null;
    for (const k of strongKeys(key, true)) { const it = byKey.get(k.toLowerCase()); if (it) return topic(it.id); }
    return null;
  }
  async function texts(progress?: (f: number) => void): Promise<TopicText[]> {
    const out: TopicText[] = []; const groups = new Map<string, Item[]>();
    for (const it of items) { const k = it.table + '|' + it.col; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(it); }
    let n = 0;
    for (const [k, list] of groups) {
      const [table, col] = k.split('|'); const byRow = new Map(list.map(i => [i.rowid, i]));
      for (const [rowid, v] of await rows(f.path, `select rowid, ${col} from ${table}`)) {
        const it = byRow.get(rowid as number); if (!it) continue;
        let raw = ''; const b = bytes(v);
        if (b) { const t = text(v); raw = (!/^[\s\S]{0,40}[{<\w]/.test(t) || t.includes('\ufffd')) ? ((await inflate(b)) || t) : t; } else raw = text(v);
        if (raw && (raw.match(/[\u0000-\u0008\ufffd]/g) || []).length <= 3) out.push({ id: it.id, subject: it.subject, text: plain(esw.eswordToHtml(raw)) });
        if (++n % 300 === 0) { progress?.(n / items.length); await tick(); }
      }
    }
    return out;
  }
  return Object.assign(mod, {
    locked: false, topic, forVerse, verseMarks, lookup, texts,
    topics: async () => items.map(({ id, pid, subject }) => ({ id, pid, subject })),
    today: async (m: number, d: number) => items.filter(i => i.md && +i.md[0] === m && +i.md[1] === d).map(({ id, pid, subject }) => ({ id, pid, subject })),
    searchTopics: async (q: string) => { const l = q.toLowerCase(); return items.filter(i => i.subject.toLowerCase().includes(l)).sort((a, b) => Number(b.subject.toLowerCase().startsWith(l)) - Number(a.subject.toLowerCase().startsWith(l))).slice(0, 300).map(({ id, pid, subject }) => ({ id, pid, subject })); },
  });
}

/** open a library module (or report why it cannot be opened) */
export async function openBook(f: ModFile): Promise<BookMod> {
  const stub = { id: 'bm:' + f.name, file: f.path, name: f.name, format: /\.twm$/i.test(f.name) ? 'theWord' : 'e-Sword', kind: guessKind(f.name), title: f.name.replace(/\.[^.]+(\.twm)?$/i, ''), abbr: f.name.replace(/\..*$/, ''), isStrong: false, greek: false, hebrew: false, isMorph: false } as BookMod;
  let tabs: Record<string, string>;
  try { tabs = await tableMap(f.path); } catch (e) { return lockedMod(stub, String((e as Error).message || e)); }
  try {
    if (tabs.config && (tabs.topics || tabs.content || tabs.bible_refs)) return await openTheWord(f, tabs, stub);
    if (tabs.details || tabs.versecommentary || tabs.dictionary || tabs.lexicon || tabs.topics || tabs.reference || tabs.devotions) return await openESword(f, tabs, stub);
  } catch (e) { return lockedMod(stub, String((e as Error).message || e)); }
  return lockedMod(stub, 'unknown module layout');
}
