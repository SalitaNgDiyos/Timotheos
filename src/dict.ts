// Strong's dictionaries for the word popups: theWord .dct.twm (config strong=1) and e-Sword lexicons and
// dictionaries (.lexi/.lexx/.dcti/.dctx). Locked theWord modules (secure=1) are skipped.
import rtf from './legacy/rtf.js';
import esw from './legacy/eswordfmt.js';
import { ModFile, bytes, inflate, sql, text } from './native';

export interface Dict { file: string; title: string; format: string; greek: boolean; hebrew: boolean; lookup(key: string): Promise<{ subject: string; html: string } | null> }

function keysFor(key: string): string[] {
  const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(key); if (!m) return [key];
  const L = m[1].toUpperCase();
  return [...new Set([key, L + m[2] + m[3], L + m[2], L + m[2].padStart(4, '0') + m[3], L + m[2].padStart(4, '0')])];
}

async function openTheWord(f: ModFile): Promise<Dict | null> {
  let cfg: Record<string, string> = {};
  try { for (const [k, v] of (await sql(f.path, 'select name, value from config')).rows) cfg[text(k).toLowerCase()] = text(v); } catch { return null; }
  if (cfg.secure === '1' || cfg.encrypted === '1') return null;
  if (cfg.strong !== '1' && !/strong/i.test(cfg.keywords || '')) return null;
  const compressed = cfg.compressed === '1'; const ctype = (cfg['content.type'] || 'rtf').toLowerCase();
  return {
    file: f.path, title: cfg.title || cfg.abbrev || f.name, format: 'theWord', greek: cfg['strong.g'] !== '0', hebrew: cfg['strong.h'] === '1',
    async lookup(key) {
      for (const k of keysFor(key)) {
        const r = await sql(f.path, 'select t.subject, c.data, c.data2 from topics t left join content c on c.topic_id = t.id where t.subject = ? collate nocase limit 1', [k]);
        if (!r.rows.length) continue;
        const [subject, data, data2] = r.rows[0];
        let body = '';
        const b2 = bytes(data2), b1 = bytes(data);
        if (compressed && b2) body = (await inflate(b2)) || '';
        if (!body && b1 && compressed) body = (await inflate(b1)) || '';
        if (!body) body = text(data);
        if (!body && b2) body = (await inflate(b2)) || text(data2);
        return { subject: text(subject), html: rtf.isRtf(body) || ctype === 'rtf' ? rtf.rtfToHtml(body) : body };
      }
      return null;
    },
  };
}

async function openESword(f: ModFile): Promise<Dict | null> {
  let tabs: string[];
  try { tabs = (await sql(f.path, "select name from sqlite_master where type='table'")).rows.map(r => String(r[0])); } catch { return null; }
  const t = tabs.find(x => /^(lexicon|dictionary)$/i.test(x)); if (!t) return null;
  const details: Record<string, string> = {};
  const d = tabs.find(x => x.toLowerCase() === 'details');
  if (d) { const r = await sql(f.path, `select * from ${d} limit 1`); r.columns.forEach((c, i) => { details[c.toLowerCase()] = text(r.rows[0]?.[i]); }); }
  // only lexicons keyed by Strong's numbers
  const sample = await sql(f.path, `select Topic from ${t} where Topic like 'G%' or Topic like 'H%' limit 3`);
  if (!sample.rows.some(r => /^[GH]\d+/i.test(text(r[0])))) return null;
  return {
    file: f.path, title: details.title || details.description || f.name, format: 'e-Sword', greek: true, hebrew: true,
    async lookup(key) {
      for (const k of keysFor(key)) {
        const r = await sql(f.path, `select Topic, Definition from ${t} where Topic = ? collate nocase limit 1`, [k]);
        if (r.rows.length) return { subject: text(r.rows[0][0]), html: esw.eswordToHtml(text(r.rows[0][1])) };
      }
      return null;
    },
  };
}

export async function openDicts(files: ModFile[]): Promise<Dict[]> {
  const out: Dict[] = [];
  for (const f of files) {
    const low = f.name.toLowerCase();
    const d = low.endsWith('.dct.twm') ? await openTheWord(f) : /\.(lexi|lexx|dcti|dctx)$/.test(low) ? await openESword(f) : null;
    if (d) out.push(d);
  }
  return out;
}
