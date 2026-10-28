// Cross-references in theWord's open .xrefs.twm format: xrefs(vi1, vi2), vi = book<<24 | chapter<<16 |
// verse<<8 | span. Sets found in module folders are read-only; the user's own set lives in Tanglaw's data
// folder in the same format. Only the rows of the chapter on screen are read.
import { ModFile, sql, text, userXrefChange, userXrefs } from './native';

export interface XRef { id: string; b: number; c: number; v: number; span: number; back: boolean; user: boolean }
interface XSet { name: string; file: string; table: string; user: boolean }

export const enc = (b: number, c: number, v: number, span = 0) => (b & 0x7f) * 16777216 + (c & 0xff) * 65536 + (v & 0xff) * 256 + (span & 0xff);
export const dec = (n: number) => ({ b: Math.floor(n / 16777216) & 0x7f, c: Math.floor(n / 65536) & 0xff, v: Math.floor(n / 256) & 0xff, span: n & 0xff });

let sets: XSet[] = [];

export async function loadXrefs(files: ModFile[]): Promise<number> {
  sets = [];
  for (const f of files.filter(x => /\.xrefs\.twm$/i.test(x.name))) {
    try {
      const cfg: Record<string, string> = {};
      try { for (const [k, v] of (await sql(f.path, 'select name, value from config')).rows) cfg[text(k).toLowerCase()] = text(v); } catch { /* none */ }
      sets.push({ name: cfg['tables.xrefs.description'] || f.name.replace(/\.xrefs\.twm$/i, ''), file: f.path, table: cfg['table.xrefs'] || 'xrefs', user: false });
    } catch { /* unreadable: skip */ }
  }
  try { sets.push({ name: 'My cross-references', file: await userXrefs(), table: 'xrefs', user: true }); } catch { /* no data folder */ }
  return sets.length;
}

/** cross-references of every verse of a chapter: {verse: [refs]} (forward and, in [brackets], back) */
export async function chapterXrefs(b: number, c: number): Promise<Record<number, XRef[]>> {
  const out: Record<number, XRef[]> = {};
  const lo = enc(b, c, 0, 0), hi = enc(b, c, 255, 255);
  const add = (v: number, t: ReturnType<typeof dec>, back: boolean, user: boolean) => {
    const arr = out[v] || (out[v] = []); const id = `${t.b}.${t.c}.${t.v}.${t.span}`;
    const had = arr.find(y => y.id === id && y.back === back);
    if (had) had.user = had.user || user; else arr.push({ id, ...t, back, user });
  };
  for (const s of sets) {
    try {
      for (const [a, z] of (await sql(s.file, `select vi1, vi2 from "${s.table}" where vi1 between ? and ?`, [lo, hi])).rows as number[][]) add(dec(a).v, dec(z), false, s.user);
      for (const [a, z] of (await sql(s.file, `select vi1, vi2 from "${s.table}" where vi2 between ? and ?`, [lo, hi])).rows as number[][]) add(dec(z).v, dec(a), true, s.user);
    } catch { /* a broken set is skipped */ }
  }
  return out;
}

export async function addXref(from: { b: number; c: number; v: number }, to: { b: number; c: number; v: number; v2?: number }): Promise<void> {
  await userXrefChange('add', enc(from.b, from.c, from.v, 0), enc(to.b, to.c, to.v, Math.max(0, (to.v2 || to.v) - to.v)));
}
export async function removeXref(from: { b: number; c: number; v: number }, to: { b: number; c: number; v: number }): Promise<void> {
  const n = await userXrefChange('remove', enc(from.b, from.c, from.v, 0), enc(to.b, to.c, to.v, 0));
  if (!n) await userXrefChange('remove', enc(to.b, to.c, to.v, 0), enc(from.b, from.c, from.v, 0)); // a back-reference
}
export const xrefSets = () => sets.map(s => ({ name: s.name, user: s.user }));
