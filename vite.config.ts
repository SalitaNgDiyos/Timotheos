import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// The format readers shared with the Electron version (src/legacy) are CommonJS; bundle them as such.
// `vite build --mode electron` builds the same screens for the Electron edition (electron/): the Tauri
// packages are replaced by small stand-ins (src/shim) that talk to Electron's main process.
const shim = (f: string) => fileURLToPath(new URL(`./src/shim/${f}.ts`, import.meta.url));
export default defineConfig(({ mode }) => {
  const electron = mode === 'electron';
  return {
    clearScreen: false,
    base: electron ? './' : '/',
    resolve: electron ? {
      alias: {
        '@tauri-apps/api/core': shim('core'), '@tauri-apps/api/window': shim('window'), '@tauri-apps/api/app': shim('app'),
        '@tauri-apps/plugin-dialog': shim('dialog'), '@tauri-apps/plugin-fs': shim('fs'), '@tauri-apps/plugin-clipboard-manager': shim('clipboard'),
        '@tauri-apps/plugin-opener': shim('opener'), 'tauri-plugin-tts-api': shim('tts'),
      },
    } : {},
    build: {
      target: electron ? ['chrome130'] : ['es2021', 'chrome105', 'safari15'], outDir: electron ? 'electron/web' : 'dist', emptyOutDir: true,
      commonjsOptions: { include: [/legacy/, /node_modules/] }, chunkSizeWarningLimit: 900,
    },
  };
});
