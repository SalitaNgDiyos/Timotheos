// stands in for @tauri-apps/plugin-opener in the Electron edition
import { call } from './native';
export const openUrl = (url: string) => call<void>('open_url', { url });
