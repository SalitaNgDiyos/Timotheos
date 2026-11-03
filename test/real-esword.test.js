// Checks against real e-Sword modules supplied by the user (folder given in TIMOTHEOS_REAL); not shipped.
'use strict';
const assert = require('assert');
const { Library } = require('../src/lib/library');
const D = process.env.TIMOTHEOS_REAL || '/home/claude/esreal';
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ✓', m); };
(async () => {
  const lib = new Library({ moduleFolders: [D], apocryphaPlacement: '1611' });
  const l = await lib.scan();
  console.log('Bibles:', l.bibles.map(b => b.id)); console.log('Books:', l.books.map(b => b.id + ' [' + b.kind + ']')); console.log('Notices:', l.errors);
  for (const id of ['es:a_001_b_wycliffe_1394_-_purvey_revision.bbli', 'es:a_001_b_Wycliffe_1394_-_Purvey_Revision.bblx']) {
    const inf = await lib.info(id);
    console.log(id, '|', inf.title, '| warnings:', inf.warnings);
    ok(inf.books[67].length === 14 && inf.books[68].length === 16 && inf.books[70].length === 19 && inf.books[71].length === 51 && inf.books[72].length === 5 && inf.books[77].length === 16 && inf.books[78].length === 15, id + ': Apocrypha books have the right chapter counts');
    ok(inf.books[75] && inf.books[76] && inf.books[27].length === 12, id + ': Susanna/Bel split out of Daniel');
    const g = (await lib.chapter([id], 1, 1)).rows[0].cells[0]; console.log('   Gen 1:1 =', g.slice(0, 120));
    ok(/bigynnyng God/.test(g) && !/[\\{}]/.test(g), id + ': Gen 1:1 readable');
    const t = (await lib.chapter([id], 67, 1)).rows[0].cells[0]; ok(/Tobie/.test(t), id + ': Tobit 1:1 = ' + t.replace(/<[^>]*>/g, '').slice(0, 50));
    const sus = (await lib.chapter([id], 75, 1)).rows[0].cells[0]; console.log('   Susanna 1:1 =', sus.replace(/<[^>]*>/g, '').slice(0, 80));
    const nav = await lib.navigation([id]);
    const order = nav.map(b => b.abbr).join(' ');
    ok(/Mal Tob Jdt Wis Sir Bar Sus Bel 1Macc 2Macc Matt/.test(order), id + ': 1611 order ' + order.slice(order.indexOf('Mal'), order.indexOf('Matt') + 4));
  }
  const s = await lib.search(['es:a_001_b_wycliffe_1394_-_purvey_revision.bbli'], 'Tobie', { scope: 'OT' });
  ok(s.total > 10 && s.results.some(r => r.b === 67) && s.results.findIndex(r => r.b === 67) > s.results.findIndex(r => r.b === 16), 'search finds Tobit inside the Old Testament scope (' + s.total + ')');
  // commentary
  const cm = await lib.commentaries(1, 1, 1);
  const cb = cm.find(c => /CBNotes/.test(c.abbr)); console.log('Bullinger Gen 1:1 hit:', cb && cb.hit);
  ok(cb && cb.hit && cb.hit.level === 'verse', 'Bullinger: verse comment on Gen 1:1');
  const t = await lib.bookTopic(cb.id, cb.hit.id); console.log('   ', t.html.slice(0, 300));
  ok(/data-href="tw:\/\/bible\.\*\?id=61\.3\.5"/.test(t.html), 'Bullinger <ref>2Pe 3:5</ref> becomes a link');
  const ps = await lib.commentaries(19, 42, 1); ok(ps.find(c => /CBNotes/.test(c.abbr)).hit, 'Bullinger Psalm 42 (chapter/verse)');
  const bk = await lib.commentaries(2, 40, 38); ok(bk.find(c => /CBNotes/.test(c.abbr)).hit, 'Bullinger Exodus 40:38 → ' + bk.find(c => /CBNotes/.test(c.abbr)).hit.level);
  // dictionaries
  for (const id of ['bm:mcgednt.lexi', 'bm:mcgednt.dctx']) {
    const inf = await lib.bookOpen(id); console.log(id, inf.kind, inf.title, 'strong=', inf.isStrong, inf.greek);
    ok(inf.kind === 'dictionary' && inf.isStrong && inf.greek, id + ' is a Greek Strong\'s dictionary');
    const e = await lib.bookLookup(id, 'G55'); console.log('   G55 =', e && e.html.slice(0, 200));
    ok(e && /ἁγνῶς|&#x1F01;/.test(e.html) && /purely/.test(e.html), id + ': G55 ἁγνῶς readable');
  }
  const st = await lib.lookup('strong', 'G26'); ok(st && /MCGEDNT|Mounce/.test(st.dict), 'Strong\'s G26 lookup → ' + (st && st.dict));
  // reference books
  for (const id of l.books.filter(b => /\.(topx|refi)$/.test(b.id)).map(b => b.id)) {
    const inf = await lib.bookOpen(id); const tops = await lib.bookTopics(id);
    const tp = await lib.bookTopic(id, tops[1].id);
    ok(!inf.locked && tops.length > 2 && tp.html.length > 200, `${id}: "${inf.title}" ${tops.length} topics, "${tops[1].subject}"`);
  }
  console.log(`\n${pass} checks passed`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
