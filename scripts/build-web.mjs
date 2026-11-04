// Builds dist/: the screens of Timotheos (app/renderer), the worker that runs the former Electron main process
// (app/main.js + app/lib) with the shims in tauri-shim/, and the page-side host.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const shim = f => path.join(root, 'tauri-shim', f);
await build({
  entryPoints: [shim('worker-entry.js')], outfile: path.join(dist, 'worker.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  alias: { fs: shim('fs.js'), os: shim('os.js'), zlib: shim('zlib.js'), electron: shim('electron.js'), 'node:sqlite': shim('sqlite.js'), path: 'pathe', 'node:path': 'pathe' },
  inject: [shim('inject.js')], define: { __dirname: '"/app"', global: 'globalThis' }, logLevel: 'warning', minify: false,
});
await build({
  entryPoints: [shim('host.js')], outfile: path.join(dist, 'tauri-host.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', logLevel: 'warning', minify: true,
});
fs.cpSync(path.join(root, 'app', 'renderer'), dist, { recursive: true });
fs.copyFileSync(shim('host.css'), path.join(dist, 'host.css'));

const inject = '<link rel="stylesheet" href="host.css"><script src="tauri-host.js"></script>\n';
let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!html.includes('tauri-host.js')) html = html.replace(/<script src="icons\.js"><\/script>/, inject + '<script src="icons.js"></script>');
if (!html.includes('tauri-host.js')) throw new Error('index.html: place for the host script not found');
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log('dist ready:', fs.readdirSync(dist).length, 'entries');
