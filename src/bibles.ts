// Bible modules: theWord text Bibles (.ont/.ot/.nt) and e-Sword Bibles (.bblx/.bbli).
// Same rules as the Electron version (lib/theword.js, lib/esword.js); the files are read by the
// native side. Encrypted modules (.ontx/.otx/.ntx, encrypted e-Sword) are listed as locked, never decoded.
import canon from './legacy/canon.js';
import esw from './legacy/eswordfmt.js';
import { ModFile, ontInfo, ontSlice, sql, text } from './native';

export interface Bible {
  id: string; file: string; format: 'theWord' | 'e-Sword'; abbr: string; title: string;
  books: Map<number, number[]>;          // book → verse count per chapter
  rules: string[]; rtl: boolean; font: string; warnings: string[];
  chapter(b: number, c: number): Promise<{ v: number; raw: string }[]>;
  /** every verse as [book, chapter, verse, raw] (for searching; read once, then kept) */
  allVerses(): Promise<[number, number, number, string][]>;
}
export interface Locked { id: string; file: string; title: string; reason: string }

const ONT_KIND: Record<string, 'ont' | 'ot' | 'nt'> = { ont: 'ont', ot: 'ot', nt: 'nt' };

/** properties of a theWord Bible: key=value lines after the verses; a trailing "\" continues a value */
function ontProps(lines: string[]): { props: Record<string, string>; rules: string[] } {
  const props: Record<string, string> = {}; const rules: string[] = [];
  let key: string | null = null; let val = '';
  const flush = () => { if (key === null) return; if (key === 'verse.rule') rules.push(val); else props[key] = val; key = null; val = ''; };
  for (const ln of lines) {
    if (key !== null) { if (val.endsWith('\\')) { val = val.slice(0, -1) + '\n' + ln; continue; } flush(); }
    const m = /^\s*([\w.\-]+)\s*=(.*)$/.exec(ln);
    if (m) { key = m[1].toLowerCase(); val = m[2]; }
  }
  if (key !== null) { if (val.endsWith('\\')) val = val.slice(0, -1); flush(); }
  return { props, rules };
}

async function openOnt(f: ModFile): Promise<Bible> {
  const ext = f.name.split('.').pop()!.toLowerCase(); const kind = ONT_KIND[ext];
  const count = kind === 'ont' ? canon.ONT_TOTAL : kind === 'ot' ? canon.OT_LINES : canon.NT_LINES;
  const [n, tail] = await ontInfo(f.path, count);
  if (n < count) throw new Error(`only ${n} lines; a .${ext} Bible needs ${count}`);
  const { props, rules } = ontProps(tail);
  const books = new Map<number, number[]>();
  const [b0, b1] = kind === 'ont' ? [1, 66] : kind === 'ot' ? [1, 39] : [40, 66];
  for (let b = b0; b <= b1; b++) books.set(b, canon.kjvChapters(b));
  let allCache: [number, number, number, string][] | null = null;
  return {
    id: 'tw:' + f.name, file: f.path, format: 'theWord', rules, warnings: [],
    abbr: (props['short.title'] || f.name.replace(/\.[^.]+$/, '')).trim(),
    title: (props.title || props.description || props['short.title'] || f.name).split('\n')[0].trim(),
    rtl: props.r2l === '1', font: props.font || '', books,
    async chapter(b, c) {
      const vc = books.get(b)?.[c - 1]; if (!vc) return [];
      const start = canon.ontLine(b, c, 1, kind);
      const lines = await ontSlice(f.path, start, vc);
      return lines.map((raw, i) => ({ v: i + 1, raw }));
    },
    async allVerses() {
      if (allCache) return allCache;
      const lines = await ontSlice(f.path, 0, count); const out: [number, number, number, string][] = [];
      let i = 0;
      for (let b = b0; b <= b1; b++) canon.kjvChapters(b).forEach((n: number, ci: number) => { for (let v = 1; v <= n; v++) out.push([b, ci + 1, v, lines[i++] ?? '']); });
      return (allCache = out);
    },
  };
}

async function openESword(f: ModFile): Promise<Bible> {
  const tabs = (await sql(f.path, "select name from sqlite_master where type='table'")).rows.map(r => String(r[0]));
  const T = (n: string) => tabs.find(t => t.toLowerCase() === n);
  const bible = T('bible'); if (!bible) throw new Error('no Bible table – not an e-Sword Bible, or it is encrypted');
  const details: Record<string, string> = {};
  if (T('details')) { const r = await sql(f.path, `select * from ${T('details')} limit 1`); r.columns.forEach((c, i) => { details[c.toLowerCase()] = text(r.rows[0]?.[i]); }); }
  const map = esw.bookMap();
  // e-Sword keeps Susanna / Bel as Daniel 13 / 14 and the additions to Esther as Esther 11–16
  const toT = (eb: number, ec: number): [number, number] => {
    const b = map[eb] || eb;
    if (b === 27 && ec === 13) return [75, 1];
    if (b === 27 && ec === 14) return [76, 1];
    if (b === 17 && ec > 10) return [69, ec];
    return [b, ec];
  };
  const fromT = new Map<string, [number, number]>();
  const books = new Map<number, number[]>();
  for (const [eb, ec, maxv] of (await sql(f.path, `select Book, Chapter, max(Verse) from ${bible} group by Book, Chapter order by Book, Chapter`)).rows as number[][]) {
    const [b, c] = toT(eb, ec); fromT.set(`${b}.${c}`, [eb, ec]);
    const arr = books.get(b) || []; arr[c - 1] = maxv; books.set(b, arr);
  }
  for (const arr of books.values()) for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = 0;
  const notes = T('notes');
  let allCache: [number, number, number, string][] | null = null;
  const abbr = details.abbreviation || f.name.replace(/\.(bblx|bbli)$/i, '');
  return {
    id: 'es:' + f.name, file: f.path, format: 'e-Sword', rules: [], books, font: details.font && details.font !== 'DEFAULT' ? details.font : '',
    abbr, title: details.title || details.description || abbr, rtl: details.righttoleft === '1',
    warnings: books.has(75) || books.has(76) ? ['Daniel 13 and 14 of this e-Sword Bible are shown as Susanna and Bel and the Dragon'] : [],
    async chapter(b, c) {
      const src = fromT.get(`${b}.${c}`); if (!src) return [];
      const [eb, ec] = src;
      const r = await sql(f.path, `select Verse, Scripture from ${bible} where Book = ? and Chapter = ? order by Verse`, [eb, ec]);
      const out: { v: number; raw: string }[] = [];
      for (const [v, s] of r.rows) {
        const t = text(s); let n: Record<string, string> | null = null;
        if (notes && /<not>/i.test(t)) {
          n = {};
          for (const [id, note] of (await sql(f.path, `select ID, Note from ${notes} where Book = ? and Chapter = ? and Verse = ?`, [eb, ec, v as number])).rows) n[text(id)] = esw.eswordToHtml(text(note));
        }
        out.push({ v: v as number, raw: '<_HTML_>' + esw.eswordToHtml(t, n, true) });
      }
      return out;
    },
    async allVerses() {
      if (allCache) return allCache;
      const out: [number, number, number, string][] = [];
      for (const [eb, ec, v, sc] of (await sql(f.path, `select Book, Chapter, Verse, Scripture from ${bible} order by Book, Chapter, Verse`)).rows) {
        const [b, c] = toT(eb as number, ec as number); out.push([b, c, v as number, '<_HTML_>' + esw.eswordToHtml(text(sc), null, true)]);
      }
      return (allCache = out);
    },
  };
}

export function isBibleFile(name: string): boolean { return /\.(ont|ot|nt|bblx|bbli|ontx|otx|ntx)$/i.test(name); }

/** open a Bible module, or say why it cannot be opened */
export async function openBible(f: ModFile): Promise<Bible | Locked> {
  const id = (/\.(bblx|bbli)$/i.test(f.name) ? 'es:' : 'tw:') + f.name;
  if (/\.(ontx|otx|ntx)$/i.test(f.name)) return { id, file: f.path, title: f.name, reason: 'encrypted theWord Bible – it opens only in theWord' };
  try { return /\.(bblx|bbli)$/i.test(f.name) ? await openESword(f) : await openOnt(f); }
  catch (e) { return { id, file: f.path, title: f.name, reason: String((e as Error).message || e) }; }
}
export const isLocked = (m: Bible | Locked): m is Locked => 'reason' in m;
