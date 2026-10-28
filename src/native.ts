// The native (Rust) side: files, read-only SQLite, settings.
import { invoke } from '@tauri-apps/api/core';
import { inflateSync } from 'fflate';

export interface ModFile { path: string; name: string; size: number }
export interface Rows { columns: string[]; rows: unknown[][] }

export const scan = (folders: string[]) => invoke<ModFile[]>('scan', { folders });
export const ontInfo = (path: string, skip: number) => invoke<[number, string[]]>('ont_info', { path, skip });
export const ontSlice = (path: string, start: number, count: number) => invoke<string[]>('ont_slice', { path, start, count });
export const sql = (path: string, query: string, params: (string | number | null)[] = []) => invoke<Rows>('sql', { path, query, params });
export const modulesDir = () => invoke<string>('modules_dir');
export const importBytes = (name: string, b64: string) => invoke<string>('import_bytes', { name, b64 });
export const loadSettings = () => invoke<Record<string, unknown>>('settings_load');
export const saveSettings = (settings: unknown) => invoke<void>('settings_save', { settings });

export const loadStudy = () => invoke<Record<string, unknown>>('ud_load');
export const saveStudy = (data: unknown) => invoke<void>('ud_save', { data });
export interface Legacy { folder: string; settings: Record<string, unknown> | null; study: Record<string, unknown> | null; modules: string | null }
export const userXrefs = () => invoke<string>('user_xrefs');
export const userXrefChange = (op: 'add' | 'remove', vi1: number, vi2: number) => invoke<number>('user_xref_change', { op, vi1, vi2 });
export const legacyData = () => invoke<Legacy | null>('legacy_data');

/** text of a SQLite value (blobs arrive as {$b64}) */
export function text(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  const b = bytes(v); if (!b) return '';
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}
export function bytes(v: unknown): Uint8Array | null {
  if (v && typeof v === 'object' && '$b64' in (v as Record<string, string>)) {
    const s = atob((v as Record<string, string>).$b64); const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  return null;
}
/** zlib inflate (theWord "compressed" modules). Some modules (e.g. LSJ) have extra bytes after the
 *  compressed data, which the browser's own decompressor refuses; fflate stops at the end of the data. */
export async function inflate(b: Uint8Array): Promise<string | null> {
  let out: Uint8Array | null = null;
  const zlibHeader = b.length > 2 && (b[0] & 0x0f) === 8 && ((b[0] << 8) | b[1]) % 31 === 0;
  try { out = inflateSync(zlibHeader ? b.subarray(2) : b); } catch { out = null; }
  if (!out || !out.length) {
    for (const fmt of ['deflate', 'gzip'] as const) {
      try { out = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream(fmt))).arrayBuffer()); break; } catch { out = null; }
    }
  }
  if (!out) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(out); } catch { return new TextDecoder('windows-1252').decode(out); }
}
