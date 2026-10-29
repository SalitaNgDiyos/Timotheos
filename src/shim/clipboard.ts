// stands in for @tauri-apps/plugin-clipboard-manager in the Electron edition
import { call } from './native';
export const readText = () => call<string>('clip_read');
export const writeText = (text: string) => call<void>('clip_write', { text });
