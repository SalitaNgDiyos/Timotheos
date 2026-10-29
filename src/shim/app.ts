// stands in for @tauri-apps/api/app in the Electron edition
import { call } from './native';
export const getVersion = () => call<string>('app_version');
