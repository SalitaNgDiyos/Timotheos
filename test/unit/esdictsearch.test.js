/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/esdictsearch.test.js — typing in a topic list's Filter box searches an e-Sword dictionary (it threw an error in 0.6.5 to 0.6.49)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bookmod = require('../../app/lib/bookmod');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'esd-')), 'T.dcti');
  const d = new DatabaseSync(f);
  d.exec(`create table Details(Title text, Abbreviation text, Information text, Version int); create table Dictionary(Topic text, Definition text);
    insert into Details values('Test Dict','TD','x',1);
    insert into Dictionary values('Love','affection'),('Lovage','a herb'),('Glove','worn on the hand'),('Hate','the opposite'),('Loaf','bread');`);
  d.close();
  const m = await bookmod.open(f);
  ok(!m.locked && m.kind === 'dictionary', 'opens: ' + (m.reason || ''));
  let r = m.searchTopics('lov'); ok(r.length === 3, 'finds the matches: ' + r.map(x => x.subject));
  ok(r[0].subject.toLowerCase().startsWith('lov') && r[1].subject.toLowerCase().startsWith('lov'), 'words that start with it come first');
  ok(m.searchTopics('zzz').length === 0, 'no match, no error');
  console.log(`esdictsearch: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
