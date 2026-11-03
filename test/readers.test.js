// Reader tests against synthetic modules (TIMOTHEOS_TESTMODS) – run: node test/readers.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const { Library } = require('../src/lib/library');
const { Xrefs } = require('../src/lib/xrefs');
const D = process.env.TIMOTHEOS_TESTMODS || '/home/claude/testmods';
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; };
(async () => {
  const lib = new Library({ moduleFolders: [D], apocryphaPlacement: '1611' });
  const l = await lib.scan();
  console.log('Bibles:', l.bibles.map(b => b.id).join(', '));
  console.log('Books:', l.books.map(b => `${b.id} [${b.kind}]`).join(', '));
  console.log('Notices:', l.errors);
  ok(l.bibles.some(b => b.id === 'es:KJVA11.bbli') && l.bibles.some(b => b.id === 'es:KJV10.bblx'), 'e-Sword Bibles found');
  ok(l.books.some(b => /harx/.test(b.id)), '.harx harmonies are read as books');

  // e-Sword 11 Bible
  const info = await lib.info('es:KJVA11.bbli');
  console.log('KJVA11 books:', Object.keys(info.books).join(' '), '| warnings:', info.warnings);
  for (const b of [67, 68, 70, 71, 72, 77, 78]) ok(info.books[b], 'apocrypha book ' + b);
  const v = (await lib.chapter(['es:KJVA11.bbli'], 43, 3)).rows.find(r => r.v === 16).cells[0];
  console.log('Jn 3:16 html:', v);
  ok(/class="woj"/.test(v) && /data-strong="G2316"/.test(v) && /data-morph="N-NSM"/.test(v) && /data-href="tw:\/\/bible\.\*\?id=45\.5\.8"/.test(v), 'v11 markup converted');
  ok(!/<num>|<tvm>|<red>|<ref>/.test(v), 'no raw e-Sword tags left');
  const g = (await lib.chapter(['es:KJVA11.bbli'], 1, 1)).rows[0].cells[0];
  console.log('Gen 1:1 html:', g);
  ok(/class="fn" data-note="Hebrew: &lt;i&gt;bereshit&lt;\/i&gt;"|class="fn" data-note="Hebrew: <i>bereshit<\/i>"|data-note=/.test(g) && /heading/.test(g), 'note + heading');
  const nav = await lib.navigation(['es:KJVA11.bbli']);
  console.log('order:', nav.map(b => b.abbr).join(' '));
  ok(nav.findIndex(b => b.id === 67) === nav.findIndex(b => b.id === 39) + 1 && nav.findIndex(b => b.id === 40) > nav.findIndex(b => b.id === 78), '1611 order with e-Sword module');
  // e-Sword 10 Bible (RTF)
  const r10 = (await lib.chapter(['es:KJV10.bblx'], 43, 3)).rows;
  console.log('bblx 3:16:', r10.find(r => r.v === 16).cells[0]);
  ok(/data-strong="G2316"/.test(r10.find(r => r.v === 16).cells[0]) && /italic/.test(r10.find(r => r.v === 17).cells[0]), 'bblx RTF');

  // commentaries (theWord + e-Sword)
  const cm = await lib.commentaries(43, 3, 16);
  console.log('commentaries Jn 3:16:', JSON.stringify(cm.map(c => [c.abbr, c.hit && c.hit.level, c.hit && c.hit.subject])));
  for (const c of cm.filter(c => c.abbr !== 'ECmt11')) ok(c.hit && c.hit.level === 'verse', c.abbr + ' verse level');
  ok(!cm.find(c => c.abbr === 'ECmt11').hit, 'no false hit');
  const cm15 = await lib.commentaries(43, 3, 15);
  console.log('Jn 3:15:', JSON.stringify(cm15.map(c => [c.abbr, c.hit && c.hit.level, c.hit && c.hit.subject])));
  ok(cm15.find(c => c.abbr === 'TCmt').hit.subject === 'John 3:14–18' && cm15.find(c => c.abbr === 'ECmt').hit.level === 'passage', 'passage level');
  const cm2 = await lib.commentaries(43, 3, 30);
  ok(cm2.find(c => c.abbr === 'TCmt').hit.level === 'chapter' && cm2.find(c => c.abbr === 'ECmt').hit.level === 'chapter', 'chapter level');
  const cm4 = await lib.commentaries(43, 4, 1);
  ok(cm4.find(c => c.abbr === 'TCmt').hit.level === 'book' && cm4.find(c => c.abbr === 'ECmt').hit.level === 'book', 'book level');
  const sir = await lib.commentaries(71, 1, 1);
  ok(sir.find(c => c.abbr === 'ECmt').hit, 'e-Sword commentary book 70 -> Sirach');
  const t = await lib.bookTopic('bm:TestCmt.cmtx', cm.find(c => c.abbr === 'ECmt').hit.id);
  console.log('ECmt topic:', t);
  ok(/John 3:16/.test(t.html) && /bold/.test(t.html), 'e-Sword commentary content');
  const t11 = await lib.bookTopic('bm:TestCmt11.cmti', (await lib.commentaries(1, 1, 2)).find(c => c.abbr === 'ECmt11').hit.id);
  ok(/data-href="tw:\/\/bible\.\*\?id=43\.1\.1"/.test(t11.html), 'cmti html + ref link');
  const tw = await lib.bookTopic('bm:Test Commentary.cmt.twm', cm.find(c => c.abbr === 'TCmt').hit.id);
  console.log('TCmt topic:', tw);
  ok(/God so loved/.test(tw.html) && /href="tw:\/\/bible/.test(tw.html), 'theWord commentary content');
  const marks = await lib.commentaryMarks(43, 3);
  console.log('marks Jn 3:', JSON.stringify(marks));

  // dictionaries
  for (const [k, re] of [['G2316', /theos/], ['H430', /elohim/], ['G26', /agape/]]) {
    const r = await lib.lookup('strong', k); console.log('lookup', k, '->', r && r.dict); ok(r && re.test(r.html), 'strong ' + k);
  }
  const w = await lib.wordLookup('graces');
  console.log('word lookup "graces":', JSON.stringify(w.map(x => [x.abbr, x.hits.map(h => h.subject + (h.exact ? '' : '~'))])));
  ok(w.some(x => x.abbr === 'TDct') && w.some(x => x.abbr === 'EDct11'), 'word lookup across formats');
  const locked = await lib.bookOpen("bm:Mickelson's Strong.dct.twm"); console.log('Mickelson:', locked.locked, locked.reason);
  ok(locked.locked && /encrypted/.test(locked.reason), 'secure theWord module refused');
  const lk2 = await lib.bookOpen('bm:Locked.cmtx'); console.log('Locked.cmtx:', lk2.reason); ok(lk2.locked, 'encrypted e-Sword refused');
  // books & devotionals
  const tops = await lib.bookTopics('bm:TestTopics.topx'); ok(tops.length === 2, 'topx topics');
  const btops = await lib.bookTopics('bm:Test Book.gbk.twm'); ok(btops.some(x => x.pid === 2), 'gbk tree');
  const dev = await lib.devotionsToday(10, 27); console.log('devotions 10/27:', JSON.stringify(dev));
  ok(dev.some(d => d.abbr === 'EDev') && dev.some(d => d.abbr === 'TDev'), 'devotionals both formats');

  // cross references
  const x = new Xrefs('/tmp/claude-0/test-user.xrefs.twm');
  require('fs').rmSync('/tmp/claude-0/test-user.xrefs.twm', { force: true });
  await x.load(l.xrefFiles);
  const ch = x.chapter(1, 1); console.log('xrefs Gen 1:1:', ch[1].length, ch[1].slice(0, 3));
  ok(ch[1].length > 5, 'default xrefs read');
  await x.add({ b: 43, c: 3, v: 16 }, { b: 45, c: 5, v: 8 });
  const x2 = new Xrefs('/tmp/claude-0/test-user.xrefs.twm'); await x2.load([]);
  ok(x2.chapter(43, 3)[16].some(r => r.b === 45 && r.user) && x2.chapter(45, 5)[8].some(r => r.back && r.b === 43), 'user xref saved + back reference');
  console.log(`\n${pass} checks passed`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
