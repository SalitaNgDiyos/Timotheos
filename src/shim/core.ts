// stands in for @tauri-apps/api/core in the Electron edition
import { call } from './native';
export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> { return call<T>(cmd, args); }
