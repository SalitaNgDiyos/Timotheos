// stands in for @tauri-apps/api/window in the Electron edition
import { call } from './native';
export enum UserAttentionType { Critical = 1, Informational = 2 }
const op = (o: string) => call<void>('win', { op: o });
export function getCurrentWindow() {
  return {
    minimize: () => op('minimize'), toggleMaximize: () => op('toggleMaximize'), close: () => op('close'),
    unminimize: () => op('restore'), setFocus: () => op('focus'), requestUserAttention: (_t?: UserAttentionType) => op('attention'),
  };
}
