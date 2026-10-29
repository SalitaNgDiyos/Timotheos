// stands in for @tauri-apps/plugin-dialog in the Electron edition
import { call } from './native';
export interface DialogFilter { name: string; extensions: string[] }
export function open(options: { multiple?: boolean; directory?: boolean; title?: string; filters?: DialogFilter[]; defaultPath?: string } = {}): Promise<string | string[] | null> { return call('dialog_open', { options }); }
export function save(options: { title?: string; defaultPath?: string; filters?: DialogFilter[] } = {}): Promise<string | null> { return call('dialog_save', { options }); }
