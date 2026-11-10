// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Licence compliance checks (run: node scripts/check-licence.mjs): the licence files, the notices in the sources, the
// package metadata, the documents, the About screen and what the build puts in dist/legal. Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = f => fs.readFileSync(path.join(root, f), 'utf8');
let ok = 0, bad = 0;
const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };

// LICENSE: the complete official AGPL v3 text
const lic = rd('LICENSE');
T(/GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/.test(lic), 'LICENSE is the AGPL v3');
T(lic.length > 34000 && lic.length < 35500, 'LICENSE has the full length of the AGPL text (' + lic.length + ')');
for (const k of ['0. Definitions.', '13. Remote Network Interaction; Use with the GNU General Public License.', '15. Disclaimer of Warranty.', '16. Limitation of Liability.', 'END OF TERMS AND CONDITIONS', 'How to Apply These Terms to Your New Programs', 'https://www.gnu.org/licenses/'])
  T(lic.includes(k), 'LICENSE contains: ' + k);
T(!/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June/.test(lic), 'LICENSE is not the plain GPL any more');

// documents
for (const f of ['LICENSE', 'README.md', 'CONTRIBUTING.md', 'THIRD-PARTY-LICENSES.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'NOTICE']) T(fs.existsSync(path.join(root, f)) && rd(f).length > 200, f + ' exists');
const readme = rd('README.md');
T(/AGPL-3\.0-or-later/.test(readme) && /Edmund P\. Valdez/.test(readme) && !/Licence: MIT\.\s*$/m.test(readme), 'README: AGPL-3.0-or-later, copyright holder, no MIT claim');
T(/github\.com\/SalitaNgDiyos\/Timotheos/.test(readme) && /Getting the source code/.test(readme), 'README: how to get the source');
T(/Signed-off-by/.test(rd('CONTRIBUTING.md')) && /AGPL-3\.0-or-later/.test(rd('CONTRIBUTING.md')), 'CONTRIBUTING: DCO sign-off and the licence of contributions');
T(/malayangbiblia@gmail\.com/.test(rd('SECURITY.md')) && /malayangbiblia@gmail\.com/.test(rd('CODE_OF_CONDUCT.md')), 'SECURITY and CODE_OF_CONDUCT name the contact address');
T(!/\[INSERT CONTACT METHOD\]/.test(rd('CODE_OF_CONDUCT.md')) && /Contributor Covenant/.test(rd('CODE_OF_CONDUCT.md')), 'CODE_OF_CONDUCT is complete and credits the Contributor Covenant');
T(/trademark|name "Timotheos"/i.test(rd('NOTICE')) && /privacy/i.test(rd('NOTICE')) && /support/i.test(rd('NOTICE')), 'NOTICE: branding, privacy, hosting and support');
const tp = rd('THIRD-PARTY-LICENSES.md');
T(/\| Rust crate \|/.test(tp) && /\| npm package \|/.test(tp) && /SIL Open Font License/.test(tp) && /MPL-2\.0/.test(tp), 'THIRD-PARTY-LICENSES lists crates, npm packages, fonts and the MPL note');
T(!/\(none shipped\)/.test(tp), 'every third-party package has its licence text');
T(!fs.existsSync(path.join(root, 'app/renderer/fxthemes')), 'no third-party themes are bundled (Firefox themes come only from the user\'s own Firefox)');
T(fs.existsSync(path.join(root, 'app/renderer/fonts/LICENSES.txt')) && /SIL OPEN FONT LICENSE/.test(rd('app/renderer/fonts/LICENSES.txt')), 'font licences are shipped');

// every original source file carries the identifier and the copyright line
const files = execSync('git ls-files', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const need = files.filter(f => /\.(js|mjs|css|rs|tpl|sh|py|yml|html)$/.test(f) && !/^(app\/renderer\/fonts\/|src-tauri\/(icons|gen)\/|dist\/|node_modules\/)/.test(f));
const missing = need.filter(f => { const h = rd(f).slice(0, 700); return !/SPDX-License-Identifier: AGPL-3\.0-or-later/.test(h) || !/Copyright \(C\) 2026 Edmund P\. Valdez/.test(h); });
T(need.length > 90 && !missing.length, 'all ' + need.length + ' source files have the notice' + (missing.length ? ' – missing: ' + missing.slice(0, 6).join(', ') : ''));
T(!files.some(f => /(^|\/)(LICENSE-MIT|COPYING)$/i.test(f)), 'no second licence file in the tree');

// package metadata
const pj = JSON.parse(rd('package.json')), tc = JSON.parse(rd('src-tauri/tauri.conf.json'));
T(pj.license === 'AGPL-3.0-or-later', 'package.json: AGPL-3.0-or-later');
T(/^license = "AGPL-3\.0-or-later"$/m.test(rd('src-tauri/Cargo.toml')), 'Cargo.toml: AGPL-3.0-or-later');
T(tc.bundle.license === 'AGPL-3.0-or-later' && tc.bundle.licenseFile === '../LICENSE' && /Edmund P\. Valdez/.test(tc.bundle.copyright), 'installers: licence, licence file and copyright are set');
T(/git archive/.test(rd('.github/workflows/build.yml')), 'each build carries the source zip');

// About screen
const app = rd('app/renderer/app.js');
T(/AGPL-3\.0-or-later/.test(app) && !/MIT License –/.test(app) && /data-legal="LICENSE"/.test(app) && /data-legal="THIRD-PARTY-LICENSES"/.test(app) && /github\.com\/SalitaNgDiyos\/Timotheos/.test(app), 'About: licence, source link and the legal buttons');

// the build puts the texts next to the program
if (fs.existsSync(path.join(root, 'dist'))) for (const f of ['LICENSE', 'THIRD-PARTY-LICENSES', 'NOTICE']) T(fs.existsSync(path.join(root, 'dist/legal', f + '.txt')), 'dist/legal/' + f + '.txt');
console.log(`licence checks: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
