// "Import modules…" with a report: each chosen file is checked (opened the way Tanglaw reads it) before it
// is put in Tanglaw's module folder, and the report says what happened to every file and why.
// .zip/.twzip archives are unpacked. Encrypted modules and installer programs are refused.
import { invoke } from '@tauri-apps/api/core';
import { openBible, isLocked } from './bibles';
import { openBook } from './books';
import { esc } from './ui';

export interface ImportResult { name: string; from: string; status: 'imported' | 'updated' | 'already' | 'skipped'; kind: string; format: string; title: string; reason: string }

const TW_LOCKED = /\.(ontx|otx|ntx)$/i;
const BIBLE = /\.(ont|ot|nt|bblx|bbli)$/i;
const BOOK = /\.(twm|cmt[xi]|dct[xi]|lex[xi]|top[xi]|ref[xi]|dev[xi])$/i;
const ES_OLD = /\.(bbl|cmt|dct|top|dev|map|lex|har)$/i;
const ES_OTHER = /\.(har[xi]|map[xi])$/i;
const ARCHIVE = /\.(zip|twzip)$/i;
const isModuleName = (n: string) => BIBLE.test(n) || TW_LOCKED.test(n) || BOOK.test(n) || ES_OLD.test(n) || ES_OTHER.test(n);
const KIND: Record<string, string> = { dictionary: 'Dictionary', commentary: 'Commentary', book: 'Book', devotional: 'Devotional', map: 'Map', readingplan: 'Reading plan' };

const b64 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const stage = (name: string, data: Uint8Array) => invoke<string>('import_stage', { name, b64: b64(data) });
const commit = (staged: string) => invoke<[string, string]>('import_commit', { staged });
const discard = (staged: string) => invoke<void>('import_discard', { staged });

/* minimal ZIP reader (stored and deflate entries; no encryption, no ZIP64) */
interface ZEnt { name: string; method: number; offset: number; compSize: number; encrypted: boolean }
function zipEntries(b: Uint8Array): ZEnt[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('not a ZIP archive');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out: ZEnt[] = [];
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('damaged ZIP directory');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), offset = dv.getUint32(p + 42, true);
    const raw = b.subarray(p + 46, p + 46 + nlen);
    const name = (flags & 0x800) ? new TextDecoder().decode(raw) : Array.from(raw, c => String.fromCharCode(c)).join('');
    out.push({ name, method, offset, compSize, encrypted: !!(flags & 1) }); p += 46 + nlen + xlen + clen;
  }
  return out;
}
async function zipExtract(b: Uint8Array, e: ZEnt): Promise<Uint8Array> {
  if (e.encrypted) throw new Error('password-protected');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const p = e.offset;
  if (dv.getUint32(p, true) !== 0x04034b50) throw new Error('damaged ZIP entry');
  const start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true);
  const data = b.subarray(start, start + e.compSize);
  if (e.method === 0) return data.slice();
  if (e.method !== 8) throw new Error('unsupported compression method ' + e.method);
  const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** what the file is and whether Tanglaw can open it (the file is already in the waiting place) */
async function inspect(path: string, name: string, size: number): Promise<Omit<ImportResult, 'status' | 'from'> & { ok: boolean }> {
  const format = /\.twm$|\.(ont|ot|nt)x?$/i.test(name) ? 'theWord' : 'e-Sword';
  const r = { name, format, kind: '', title: '', reason: '', ok: false };
  if (TW_LOCKED.test(name)) return { ...r, kind: 'Bible', reason: 'an encrypted theWord Bible – it opens only in theWord' };
  if (ES_OLD.test(name)) return { ...r, kind: 'module', reason: 'old e-Sword format (before version 9) – open it once in a current e-Sword to convert it' };
  if (ES_OTHER.test(name)) return { ...r, kind: /\.har/i.test(name) ? 'harmony' : 'graphics', reason: 'e-Sword harmonies and graphics are not read by Tanglaw yet' };
  if (/\.xrefs\.twm$/i.test(name)) return { ...r, kind: 'Cross-references', title: name.replace(/\.xrefs\.twm$/i, ''), ok: true };
  if (/\.(hdgs|prgs|lyts|vsls|bhls|rdp)\.twm$/i.test(name)) return { ...r, kind: 'theWord program file', reason: 'headings, paragraphs, layouts and other theWord program files are not modules Tanglaw uses' };
  const f = { path, name, size };
  if (BIBLE.test(name)) {
    const m = await openBible(f);
    if (isLocked(m)) return { ...r, kind: 'Bible', reason: m.reason };
    return { ...r, kind: 'Bible', title: m.title, ok: true, reason: m.warnings.join('; ') };
  }
  if (BOOK.test(name)) {
    const m = await openBook(f);
    return { ...r, kind: KIND[m.kind] || m.kind, title: m.title || name, ok: !m.locked, reason: m.locked ? m.reason || 'cannot be opened' : '' };
  }
  return { ...r, format: '', reason: 'not a theWord or e-Sword module' };
}

/** import files given as (name, bytes) – an archive gives several */
export async function importFiles(files: { name: string; data: () => Promise<Uint8Array> }[], progress?: (t: string) => void): Promise<ImportResult[]> {
  const out: ImportResult[] = []; const queue: { name: string; from: string; data: Uint8Array }[] = [];
  for (const f of files) {
    const skip = (reason: string) => out.push({ name: f.name, from: f.name, status: 'skipped', kind: '', format: '', title: '', reason });
    if (/\.(exe|msi)$/i.test(f.name)) { skip('an installer program – Tanglaw does not run installers. Install it in e-Sword or theWord (or unpack it), then import the module file itself.'); continue; }
    let data: Uint8Array;
    try { data = await f.data(); } catch (e) { skip('could not read the file: ' + (e as Error).message); continue; }
    if (ARCHIVE.test(f.name)) {
      try {
        const ents = zipEntries(data).filter(e => !e.name.endsWith('/') && isModuleName(e.name.split('/').pop()!));
        if (!ents.length) { skip('the archive holds no theWord or e-Sword module'); continue; }
        for (const e of ents) {
          const nm = e.name.split('/').pop()!;
          try { queue.push({ name: nm, from: `${f.name} › ${e.name}`, data: await zipExtract(data, e) }); }
          catch (err) { out.push({ name: nm, from: f.name, status: 'skipped', kind: '', format: '', title: '', reason: 'could not unpack: ' + (err as Error).message }); }
        }
      } catch (e) { skip('could not read the archive: ' + (e as Error).message); }
      continue;
    }
    queue.push({ name: f.name, from: f.name, data });
  }
  for (const q of queue) {
    progress?.(`Checking ${q.name}…`);
    let staged = '';
    try {
      staged = await stage(q.name, q.data);
      const info = await inspect(staged, q.name, q.data.length);
      const base = { name: q.name, from: q.from, kind: info.kind, format: info.format, title: info.title, reason: info.reason };
      if (!info.ok) { await discard(staged); out.push({ ...base, status: 'skipped' }); continue; }
      const [, status] = await commit(staged);
      out.push({ ...base, status: status as ImportResult['status'] });
    } catch (e) {
      if (staged) await discard(staged).catch(() => {});
      out.push({ name: q.name, from: q.from, status: 'skipped', kind: '', format: '', title: '', reason: String((e as Error).message || e) });
    }
  }
  return out;
}

const LABEL: Record<string, string> = { imported: 'Added', updated: 'Replaced', already: 'Already there', skipped: 'Not added' };
export function reportHtml(r: ImportResult[]): string {
  const n = r.filter(x => x.status === 'imported' || x.status === 'updated').length;
  return `<p>${n} of ${r.length} file${r.length === 1 ? '' : 's'} added to your modules.</p><table class="imprep"><tbody>${r.map(x => `<tr class="st-${x.status}"><td class="ist">${LABEL[x.status]}</td><td><b>${esc(x.title || x.name)}</b><div class="small">${esc(x.name)}${x.from.includes('›') ? ' · from ' + esc(x.from.split(' › ')[0]) : ''}</div></td><td class="small">${esc([x.format, x.kind].filter(Boolean).join(' '))}</td><td class="small">${esc(x.reason)}</td></tr>`).join('')}</tbody></table>`;
}
