'use strict';
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const { importFiles } = require('../src/lib/importer');
const D = process.env.TIMOTHEOS_TESTMODS || '/home/claude/testmods';
const W = '/tmp/claude-0/imptest'; fs.rmSync(W, { recursive: true, force: true }); fs.mkdirSync(W + '/in', { recursive: true });
// a .twzip with a commentary + a Bible, and a zip with an e-Sword module plus a readme
execFileSync('python3', ['-I', '-c', `
import zipfile
z=zipfile.ZipFile('${W}/in/Pack.twzip','w',zipfile.ZIP_DEFLATED); z.write('${D}/Test Commentary.cmt.twm','Test Commentary.cmt.twm'); z.write('${D}/kjvplain.ont','sub/kjvplain.ont'); z.close()
z=zipfile.ZipFile('${W}/in/esword.zip','w',zipfile.ZIP_DEFLATED); z.write('${D}/esword/TestCmt.cmtx','TestCmt.cmtx'); z.writestr('readme.txt','hi'); z.close()
z=zipfile.ZipFile('${W}/in/empty.zip','w'); z.writestr('readme.txt','hi'); z.close()`]);
fs.writeFileSync(W + '/in/setup.exe', 'MZ');
fs.copyFileSync(D + '/esword/KJVA11.bbli', W + '/in/KJVA11.bbli');
(async () => {
  const files = ['Pack.twzip', 'esword.zip', 'empty.zip', 'setup.exe', 'KJVA11.bbli'].map(f => W + '/in/' + f)
    .concat([D + '/esword/Locked.cmtx', D + "/Mickelson's Strong.dct.twm", D + '/esword/Test.refx', D + '/default.xrefs.twm', D + '/esword/TestDev.devx', D + '/Test Apocrypha.gbk.twm']);
  const r = await importFiles(files, W + '/lib', {});
  for (const x of r) console.log(x.status.padEnd(8), (x.name || '').padEnd(30), (x.kind || '').padEnd(26), x.reason || x.title || '');
  const st = n => (r.find(x => x.name === n) || {}).status;
  assert.equal(st('Test Commentary.cmt.twm'), 'imported'); assert.equal(st('kjvplain.ont'), 'imported');
  assert.equal(st('TestCmt.cmtx'), 'imported'); assert.equal(st('KJVA11.bbli'), 'imported'); assert.equal(st('TestDev.devx'), 'imported');
  assert.equal(st('default.xrefs.twm'), 'imported'); assert.equal(st('Test Apocrypha.gbk.twm'), 'imported');
  for (const n of ['empty.zip', 'setup.exe', 'Locked.cmtx', "Mickelson's Strong.dct.twm", 'Test.refx']) assert.equal(st(n), 'skipped', n);
  assert.ok(fs.existsSync(W + '/lib/theWord/Test Commentary.cmt.twm') && fs.existsSync(W + '/lib/e-Sword/TestCmt.cmtx'));
  const again = await importFiles([W + '/in/KJVA11.bbli'], W + '/lib', {});
  assert.equal(again[0].status, 'already');
  console.log('import tests passed');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
