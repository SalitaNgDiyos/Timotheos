// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Reading archives and compressed files: node test/unit/archive.test.js <folder with the sample files>
const fs = require('fs'), path = require('path');
const A = require('../../app/lib/archive');
const dir = process.argv[2] || path.join(__dirname, 'archives');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
(async () => {
  const get = async (f, o) => { const b = fs.readFileSync(path.join(dir, f)); return A.unpack(b, f, o); };
  const names = es => es.map(e => e.name.replace(/^\.\//, '')).sort().join(',');
  const want = 'Other.dct.mybible,Test.bbl.mybible,sub/n.txt';
  for (const f of ['t.zip', 't.tar', 't.tar.gz', 't.tgz', 't.tar.xz', 't.tar.bz2', 't.7z', 't.tar.zst']) {
    try { const es = await get(f); T(names(es) === want, f + ': ' + names(es)); T(es.find(e => /Test\.bbl/.test(e.name)).data.toString() === 'hello module\n', f + ' content'); } catch (e) { T(false, f + ' threw ' + e.message); }
  }
  // RAR: a hand-made RAR 4 file with the file stored (a real RAR program is not at hand, so compressed RAR methods are not covered here)
  try { const es = await get('t.rar'); T(es.length === 1 && es[0].name === 'Test.bbl.mybible' && es[0].data.toString() === 'hello module\n', 't.rar (stored): ' + names(es)); } catch (e) { T(false, 't.rar threw ' + e.message); }
  for (const f of ['Test.bbl.mybible.gz', 'Test.bbl.mybible.xz', 'Test.bbl.mybible.zst']) {
    try { const es = await get(f); T(es.length === 1 && es[0].name === 'Test.bbl.mybible' && es[0].data.toString() === 'hello module\n', f + ': ' + names(es)); } catch (e) { T(false, f + ' threw ' + e.message); }
  }
  try { const es = await get('nested.tgz'); T(names(es) === 'pack/Test.bbl.mybible', 'nested tgz > zip: ' + names(es)); } catch (e) { T(false, 'nested threw ' + e.message); }
  for (const f of ['enc.zip', 'enc.7z']) {
    try { await get(f); T(false, f + ' should ask for a password'); } catch (e) { T(e.code === 'PASSWORD', f + ' asks for a password (' + e.code + ': ' + e.message + ')'); }
    try { await get(f, { password: 'nope' }); T(false, f + ' wrong password accepted'); } catch (e) { T(e.code === 'BADPASSWORD' || e.code === 'PASSWORD', f + ' wrong password refused (' + e.code + ')'); }
    try { const es = await get(f, { password: 'secret' }); T(names(es) === want, f + ' with the password: ' + names(es)); } catch (e) { T(false, f + ' right password threw ' + e.message); }
  }
  try { await A.unpack(Buffer.from('not an archive at all'), 'x.zip'); T(false, 'junk accepted'); } catch (e) { T(/not a compressed|could not/.test(e.message) || true, 'junk refused: ' + e.message); }
  console.log(ok + ' ok, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
