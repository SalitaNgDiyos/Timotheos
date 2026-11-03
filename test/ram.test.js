// RAM: Bibles that are not shown are let go when idle; Bibles of the views stay loaded
'use strict';
const assert = require('assert');
const { Library } = require('../src/lib/library');
const D = process.env.TIMOTHEOS_TESTMODS || '/home/claude/testmods';
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
(async () => {
  const lib = new Library({ moduleFolders: [D], views: [{ bible: 'es:KJV10.bblx' }], openBibles: ['es:KJV10.bblx'] });
  await lib.scan();
  await lib.info('es:KJV10.bblx');
  await lib.info('es:KJVA11.bbli', { transient: true }); await new Promise(r => setTimeout(r, 20));
  ok(!lib.bibles.has('es:KJVA11.bbli'), 'a Bible loaded only to read its name is released again');
  ok(lib.bibles.has('es:KJV10.bblx'), 'the Bible of a view stays loaded');
  await lib.info('es:KJVA11.bbli');
  ok(lib.bibles.has('es:KJVA11.bbli'), 'a Bible that is read stays loaded');
  lib.sweepBibles(1e9); ok(lib.bibles.has('es:KJVA11.bbli'), 'a recently used Bible is kept');
  lib.sweepBibles(0);
  ok(!lib.bibles.has('es:KJVA11.bbli') && lib.bibles.has('es:KJV10.bblx'), 'an idle Bible that no view shows is released; the shown one is kept');
  const c = await lib.chapter(['es:KJVA11.bbli'], 43, 3); ok(c.rows.length > 0, 'a released Bible loads again when asked for');
  console.log(pass + ' RAM checks passed'); process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
