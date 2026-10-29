// Electron edition: the bridge to Electron's main process (electron/main.cjs), set up by electron/preload.cjs.
// These files stand in for the Tauri packages when the screens are built for Electron (vite --mode electron).
interface Bridge { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> }
export const bridge = (): Bridge => (window as unknown as { tanglawNative: Bridge }).tanglawNative;
export function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> { return bridge().invoke(cmd, args) as Promise<T>; }
