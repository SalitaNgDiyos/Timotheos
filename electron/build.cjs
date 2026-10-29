// Packs the Electron edition for Windows (or the platform given: node electron/build.cjs linux).
// Run `npm run electron:web` first (builds the screens into electron/web).
// Electron's own zip can be put in a folder named by ELECTRON_ZIP_DIR to avoid downloading it.
const { packager } = require('@electron/packager');
const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');
const KEEP_LOCALES = new Set(['en-US.pak', 'fil.pak']); // Chromium's own messages: English and Filipino are enough
function trimElectron(buildPath, electronVersion, platform, arch, done) {
  const loc = path.join(buildPath, 'locales');
  if (fs.existsSync(loc)) for (const f of fs.readdirSync(loc)) if (!KEEP_LOCALES.has(f)) fs.unlinkSync(path.join(loc, f));
  done();
}
(async () => {
  const platform = process.argv[2] || 'win32';
  if (!fs.existsSync(path.join(__dirname, 'web', 'index.html'))) throw new Error('electron/web is missing: run npm run electron:web first');
  const out = await packager({
    dir: __dirname, out: path.join(__dirname, '..', 'dist-electron'), overwrite: true,
    platform, arch: 'x64', electronVersion: require('electron/package.json').version,
    ...(process.env.ELECTRON_ZIP_DIR ? { electronZipDir: process.env.ELECTRON_ZIP_DIR } : {}),
    name: 'Tanglaw Bible', executableName: 'TanglawBible', appVersion: pkg.version,
    asar: true, prune: false, afterExtract: [trimElectron],
    ignore: [/^\/build\.cjs$/],
    win32metadata: { CompanyName: 'Tanglaw Bible', FileDescription: 'Tanglaw Bible', ProductName: 'Tanglaw Bible' },
  });
  console.log(out.join('\n'));
})().catch(e => { console.error(e); process.exit(1); });
