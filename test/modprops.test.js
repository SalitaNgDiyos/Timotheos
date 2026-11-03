// Module properties and compressing (lib/modprops.js). Works on copies in /tmp/claude-0/mp (fresh copies of kjv.ont, Test Book.gbk.twm, the Bullinger .cmti, the Wycliffe .bblx and the KJV Apocrypha .gbk.twm).
const mp = require('../src/lib/modprops');
const tw = require('../src/lib/theword');
const bm = require('../src/lib/bookmod');
const fs = require('fs'); const D = '/tmp/claude-0/mp/';
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) bad++; console.log((c ? '✓ ' : '✗ ') + m); };
(async () => {
  // .ont
  const before = fs.readFileSync(D + 'kjv.ont', 'utf8').split(/\r\n|\n/).slice(0, 31102).join('\n');
  await mp.write(D + 'kjv.ont', { title: 'King James Version (edited)', 'publisher': 'Test Press' }, '<p>First <b>bold</b> paragraph.</p><p>Second</p>');
  const after = fs.readFileSync(D + 'kjv.ont', 'utf8').replace(/^﻿/, '').split(/\r\n|\n/).slice(0, 31102).join('\n');
  ok(after === before.replace(/^﻿/, ''), '.ont: all 31102 verse lines unchanged');
  const m = tw.load(D + 'kjv.ont');
  ok(m.title === 'King James Version (edited)' && m.props.publisher === 'Test Press', '.ont: new title and added publisher read back: ' + m.title);
  ok(m.rules.length > 0, '.ont: verse.rule lines kept (' + m.rules.length + ')');
  ok(fs.existsSync(D + 'kjv.ont.timotheos-backup'), '.ont: backup kept');
  const r1 = await mp.read(D + 'kjv.ont'); ok(/First/.test(r1.about) && /bold/.test(r1.about) && r1.about.includes('Second'), '.ont about round trip: ' + r1.about.slice(0, 80));
  // .twm
  await mp.write(D + 'Test Book.gbk.twm', { title: 'Test Book 2', author: 'Me' }, '<p>About <i>this</i> book – ἀγάπη</p>');
  const b = await bm.open(D + 'Test Book.gbk.twm');
  ok(b.title === 'Test Book 2' && b.author === 'Me' && /ἀγάπη/.test(b.about) && /<i>|font-style:\s*italic|<em>/.test(b.about), '.twm: title/author/about (RTF with Greek) read back: ' + b.about.slice(0, 90));
  const t0 = b.topics().map(t => b.topic(t.id).html); b.close();
  // compress with zlib
  const c = await mp.compress(D + 'Test Book.gbk.twm', { zlib: true });
  ok(c.zipped > 0, `.twm compress: ${c.zipped} topics, ${c.before} → ${c.after} bytes`);
  const b2 = await bm.open(D + 'Test Book.gbk.twm'); const t1 = b2.topics().map(t => b2.topic(t.id).html); b2.close();
  ok(JSON.stringify(t0) === JSON.stringify(t1), 'compressed book reads exactly the same in Timotheos');
  const r2 = await mp.read(D + 'Test Book.gbk.twm'); ok(r2.compressed && !r2.canZlib, 'marked compressed=1');
  // rvf book: zlib refused, nothing changed
  const sz = fs.statSync(D + 'kjva.gbk.twm').size;
  let err = ''; try { await mp.compress(D + 'kjva.gbk.twm', { zlib: true }); } catch (e) { err = e.message; }
  ok(/RichView/.test(err) && fs.statSync(D + 'kjva.gbk.twm').size === sz && !fs.existsSync(D + 'kjva.gbk.twm.timotheos-backup'), 'RichView book: zlib refused, file untouched: ' + err.slice(0, 70));
  const c2 = await mp.compress(D + 'kjva.gbk.twm', {}); ok(c2.after <= c2.before, `compact only: ${c2.before} → ${c2.after}`);
  const kb = await bm.open(D + 'kjva.gbk.twm'); ok(kb.topics().length > 10 && kb.topic(kb.topics()[1].id), 'compacted book still opens'); kb.close();
  // e-Sword
  await mp.write(D + 'ew_bullinger_companion_bible_notes.cmti', { title: 'Bullinger (edited)' }, '<p>New <b>about</b></p>');
  const e = await bm.open(D + 'ew_bullinger_companion_bible_notes.cmti');
  ok(e.title === 'Bullinger (edited)' && /<b>about<\/b>/.test(e.about), 'e-Sword .cmti: title and HTML comments: ' + e.about.slice(0, 60)); e.close();
  await mp.write(D + 'a_001_b_Wycliffe_1394_-_Purvey_Revision.bblx', { description: 'Wycliffe (edited)' }, '<p>RTF about</p>');
  const es = require('../src/lib/esword'); const w = await es.load(D + 'a_001_b_Wycliffe_1394_-_Purvey_Revision.bblx');
  ok(/Wycliffe \(edited\)/.test(w.title) || w.props.description === 'Wycliffe (edited)', 'e-Sword .bblx description: ' + w.props.description);
  ok(/RTF about/.test(w.about) && !/rtf1/.test(w.about), '.bblx about stored as RTF and shown as text: ' + w.about.slice(0, 60));
  // restore
  mp.restore(D + 'kjv.ont'); ok(fs.readFileSync(D + 'kjv.ont').equals(fs.readFileSync('/home/claude/testmods/kjv.ont')), 'restore puts the original back byte for byte');
  console.log(`${n - bad}/${n} passed`);
})().catch(e => { console.error(e); process.exit(1); });
