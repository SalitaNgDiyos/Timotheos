import { defineConfig } from 'vite';
// The format readers shared with the Electron version (src/legacy) are CommonJS; bundle them as such.
export default defineConfig({
  clearScreen: false,
  build: { target: ['es2021', 'chrome105', 'safari15'], outDir: 'dist', commonjsOptions: { include: [/legacy/, /node_modules/] }, chunkSizeWarningLimit: 900 },
});
