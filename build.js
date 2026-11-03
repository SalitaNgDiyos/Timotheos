const { packager } = require('@electron/packager');
const fs = require('fs');
const path = require('path');
// Size: Electron itself (TanglawBible.exe and its DLLs) cannot be made smaller here, but two big parts
// are not needed: Chromium's translations of its own built-in messages for 55 languages (Tanglaw's
// windows are its own; English and Filipino are kept) and the 18 spare builds of sql.js
// (only sql-wasm.js + sql-wasm.wasm are used).
const KEEP_LOCALES = new Set(['en-US.pak', 'fil.pak']);
const KEEP_SQLJS = new Set(['sql-wasm.js', 'sql-wasm.wasm']);
function trimElectron(buildPath, electronVersion, platform, arch, done) {
  const loc = path.join(buildPath, 'locales');
  if (fs.existsSync(loc)) {
    for (const f of fs.readdirSync(loc)) if (!KEEP_LOCALES.has(f)) fs.unlinkSync(path.join(loc, f));
  }
  done();
}
function trimApp(buildPath, electronVersion, platform, arch, done) {
  const sq = path.join(buildPath, 'node_modules', 'sql.js');
  if (fs.existsSync(sq)) {
    for (const f of fs.readdirSync(sq)) if (!['dist', 'package.json', 'LICENSE'].includes(f)) fs.rmSync(path.join(sq, f), { recursive: true });
    const dist = path.join(sq, 'dist');
    if (fs.existsSync(dist)) {
      for (const f of fs.readdirSync(dist)) if (!KEEP_SQLJS.has(f)) fs.rmSync(path.join(dist, f), { recursive: true });
    }
  }
  const nm = path.join(buildPath, 'node_modules');
  if (fs.existsSync(nm)) {
    for (const d of fs.readdirSync(nm)) {
      const p = path.join(nm, d);
      if (d !== 'sql.js' && fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true }); // empty leftovers of dev tools
    }
  }
  for (const f of ['README.md', 'package-lock.json']) { const p = path.join(buildPath, f); if (fs.existsSync(p)) fs.unlinkSync(p); }
  done();
}
(async () => {
  const outDir = process.env.TANGLAW_OUT || (fs.existsSync('/home/claude') ? '/home/claude/tanglaw-dist' : path.join(__dirname, 'dist'));
  const opts = {
    dir: __dirname, out: outDir, overwrite: true,
    platform: 'win32', arch: 'x64', electronVersion: '37.10.3',
    name: 'Tanglaw Bible', executableName: 'TanglawBible', appVersion: require('./package.json').version,
    asar: true, prune: true, afterExtract: [trimElectron], afterPrune: [trimApp],
    ignore: [/^\/build\.js$/, /^\/installer($|\/)/, /^\/test($|\/)/, /^\/node_modules\/electron($|\/)/, /^\/node_modules\/@electron($|\/)/, /^\/dist($|\/)/],
    win32metadata: { CompanyName: 'Tanglaw Bible', FileDescription: 'Tanglaw Bible', ProductName: 'Tanglaw Bible' },
  };
  if (process.env.ELECTRON_ZIP_DIR) opts.electronZipDir = process.env.ELECTRON_ZIP_DIR;
  else if (fs.existsSync('/tmp/ezip')) opts.electronZipDir = '/tmp/ezip';
  const out = await packager(opts);
  console.log(out);
})().catch(e => { console.error(e); process.exit(1); });
