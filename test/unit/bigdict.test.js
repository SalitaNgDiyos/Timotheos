/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/bigdict.test.js — a big (over 40 MB) dictionary lists ALL its entries, in the module's own order, without the hidden ones
// (it used to list only the first 500 by number, which left out entries whose number is high but that come first: "Start here", "Appendix"...)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bookmod = require('../../app/lib/bookmod');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigdict-')); const f = path.join(dir, 'big.dct.twm');
  const db = new DatabaseSync(f);
  db.exec(`create table config(name text, value text); create table topics(id integer primary key, pid integer default 0, subject text, rel_order, content_type string);
    create table content(topic_id integer, data, data2); create table topics_flags(id integer primary key, hidden integer);`);
  db.exec("insert into config values('type','1'),('compressed','0'),('title','Big test')");
  const ins = db.prepare('insert into topics(id, pid, subject, rel_order) values(?,0,?,?)'), c = db.prepare('insert into content(topic_id, data) values(?,?)');
  db.exec('begin');
  for (let i = 1; i <= 1200; i++) { ins.run(i, 'G' + i, 10 + i); c.run(i, 'text ' + i); }
  ins.run(1201, 'Start here', 0); c.run(1201, 'start'); ins.run(1202, 'Appendix', 1); c.run(1202, 'appendix');
  db.exec('insert into topics_flags values(5,1),(6,1)');
  db.exec('insert into content(topic_id, data) values(2000, zeroblob(42000000))');   // makes the file a "big" one (over 40 MB)
  db.exec('commit'); db.close();
  ok(fs.statSync(f).size > 40 * 1024 * 1024, 'the test module is a big file');
  const m = await bookmod.open(f); const t = m.topics();
  ok(t.length === 1202 - 2, 'every entry is listed except the two hidden ones: ' + t.length);
  ok(t[0].subject === 'Start here' && t[1].subject === 'Appendix' && t[2].subject === 'G1', 'in the order of the module: ' + t.slice(0, 3).map(x => x.subject));
  ok(!m.totalTopics, 'no "showing 500 of ..." note for a module that is listed whole');
  m.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('bigdict: ' + n + ' ok');
})().catch(e => { console.log('bigdict FAILED: ' + e.message); process.exit(1); });
