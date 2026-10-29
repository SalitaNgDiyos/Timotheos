// stands in for @tauri-apps/plugin-fs in the Electron edition (only files chosen in a dialog can be read or written)
import { call } from './native';
export async function readFile(path: string): Promise<Uint8Array> { return new Uint8Array(await call<Uint8Array>('fs_read', { path })); }
export async function writeFile(path: string, data: Uint8Array): Promise<void> { await call('fs_write', { path, data }); }
