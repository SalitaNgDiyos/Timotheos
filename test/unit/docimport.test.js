// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Document import (.txt .rtf .docx .odt): node test/unit/docimport.test.js
// The sample files in test/unit/docs were written by LibreOffice, pandoc and python-docx, not by Timotheos.
const fs = require('fs'), path = require('path'), os = require('os');
const { importFiles } = require('../../app/lib/importer');
const docread = require('../../app/lib/docread');
const bookmod = require('../../app/lib/bookmod');
const usfm = require('../../app/lib/usfm');
const dir = path.join(__dirname, 'docs');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'di-'));
(async () => {
  // 1. the reader: the same document through four writers
  for (const f of ['src.docx', 'src.odt', 'pandoc.odt', 'src.rtf', 'pandoc.rtf']) {
    const r = docread.read(path.join(dir, f));
    const html = r.blocks.map(b => b.html).join('');
    T(r.headings >= (f === 'pandoc.odt' ? 3 : 4), f + ' headings ' + r.headings);
    T(/<b>bold<\/b>/.test(html), f + ' bold');
    T(/<i>italic<\/i>/.test(html) && /<u>under<\/u>/.test(html), f + ' italic/underline');
    T(/<ul><li>bullet a<\/li><li>bullet b<\/li><\/ul>/.test(html), f + ' bullets');
    T(/<ol><li>num 1<\/li><li>num 2<\/li><\/ol>/.test(html), f + ' numbers');
    T(r.pics === 1 && /<img[^>]* src="data:image\/png;base64,/.test(html), f + ' picture');
    T(/Ünïcode — “quotes” ok\./.test(html), f + ' unicode');
    if (/docx|odt/.test(f)) T(/<table>.*<td>A<\/td>.*<td>D<\/td>.*<\/table>/.test(html) || /<b>A<\/b>/.test(html), f + ' table');
    const heads = r.blocks.filter(b => b.h).map(b => b.text);
    T(heads.includes('Chapter One') && heads.includes('Section 1.1') && heads.includes('Chapter Two'), f + ' heading texts ' + heads);
  }
  // 2. as a Library book: a theWord .gbk.twm with one topic per heading, nested
  const dest = tmp(); const ud = { d: { notes: {} }, get() { return this.d; }, set(k, v) { this.d[k] = v; } };
  let res = await importFiles([path.join(dir, 'src.docx')], dest, {}, ud, null, {});
  T(res.length === 1 && res[0].status === 'choose', 'asks what to make: ' + JSON.stringify(res[0]));
  res = await importFiles([path.join(dir, 'src.docx')], dest, {}, ud, null, { docs: { [path.join(dir, 'src.docx')]: { as: 'book', title: 'My Study Book' } } });
  T(res[0].status === 'imported' && res[0].kind === 'book', 'book imported: ' + JSON.stringify(res[0]));
  const bf = path.join(dest, 'theWord', 'My Study Book.gbk.twm');
  T(fs.existsSync(bf), 'file placed');
  const m = await bookmod.open(bf);
  const tops = m.topics();
  const byName = n => tops.find(t => t.subject === n);
  T(tops.length === 4, 'topics ' + tops.length + ' ' + JSON.stringify(tops.map(t => t.subject)));
  const ch1 = byName('Chapter One');
  T(byName('My Study Book').pid === 0 && ch1.pid === byName('My Study Book').id && byName('Section 1.1').pid === ch1.id && byName('Chapter Two').pid === byName('My Study Book').id, 'nested by heading level: ' + JSON.stringify(tops));
  const t1 = m.topic(ch1.id);
  T(/<ul><li>bullet a/.test(t1.html) && /<ol>/.test(t1.html), 'chapter one body kept lists: ' + t1.html.slice(0, 120));
  const t11 = m.topic(tops.find(t => t.subject === 'Section 1.1').id);
  T(/<table>/.test(t11.html) && /<img src="data:image\/png/.test(t11.html), 'table and picture kept in module');
  T(m.title === 'My Study Book', 'module title');
  const hits = []; for (const x of m.texts()) hits.push(x); T(hits.length >= 4, 'searchable text');
  m.close();
  // same import again: a second copy, never overwriting
  res = await importFiles([path.join(dir, 'src.docx')], dest, {}, ud, null, { docs: { [path.join(dir, 'src.docx')]: { as: 'book', title: 'My Study Book' } } });
  T(res[0].status === 'imported' && fs.existsSync(path.join(dest, 'theWord', 'My Study Book (2).gbk.twm')), 'second import keeps the first');
  // 3. txt: no headings → one section; with title-like lines → sections
  res = await importFiles([path.join(dir, 'flat.txt'), path.join(dir, 'plain.txt')], dest, {}, ud, null, { docs: { [path.join(dir, 'flat.txt')]: { as: 'book', title: 'Flat' }, [path.join(dir, 'plain.txt')]: { as: 'book', title: 'Plain' } } });
  T(res.length === 2 && res.every(x => x.status === 'imported'), 'txt imported');
  const fm = await bookmod.open(path.join(dest, 'theWord', 'Flat.gbk.twm')); T(fm.topics().length === 1 && /just some lines/.test(fm.topic(fm.topics()[0].id).html), 'flat txt = one section'); fm.close();
  const pm = await bookmod.open(path.join(dest, 'theWord', 'Plain.gbk.twm')); const pt = pm.topics().map(t => t.subject);
  T(pt.join('|') === 'GENESIS|Chapter 1|Chapter 2', 'txt titles: ' + pt); pm.close();
  // 4. as a Bible
  const bible = path.join(dir, 'bible.docx');
  res = await importFiles([bible], dest, {}, ud, null, { docs: { [bible]: { as: 'bible', title: 'Doc Bible' } } });
  T(res[0].status === 'imported' && /USFM/.test(res[0].format), 'bible imported: ' + JSON.stringify(res[0]));
  const um = usfm.loadUsfm(path.join(dest, 'USFM', 'Doc Bible.usfm'));
  const g11 = um.getVerse(1, 1, 1), g12 = um.getVerse(1, 1, 2), g13 = um.getVerse(1, 1, 3), g21 = um.getVerse(1, 2, 1), j316 = um.getVerse(43, 3, 16);
  T(/In the beginning God created/.test(g11) && !/And the earth/.test(g11), 'Gen 1:1 split inline: ' + g11);
  T(/And the earth was without form/.test(g12), 'Gen 1:2');
  T(/there was light\. and it was good\./.test(g13) || /and it was good/.test(g13), 'Gen 1:3 continuation line joined: ' + g13);
  T(/Thus the heavens/.test(g21), 'Gen 2:1');
  T(/God so loved the world/.test(j316), 'John 3:16 via "Chapter 3" paragraph');
  // not a Bible → says so
  res = await importFiles([path.join(dir, 'flat.txt')], dest, {}, ud, null, { docs: { [path.join(dir, 'flat.txt')]: { as: 'bible', title: 'X' } } });
  T(res[0].status === 'skipped' && /no verses/.test(res[0].reason), 'non-Bible refused: ' + res[0].reason);
  // 5. as My Study notes
  const nf = path.join(dir, 'notes.docx');
  res = await importFiles([nf], dest, {}, ud, null, { docs: { [nf]: { as: 'notes', title: 'n' } } });
  T(res[0].status === 'imported' && res[0].studyData.notes === 2, 'notes: ' + JSON.stringify(res[0]));
  const n = ud.d.notes;
  T(n['43.3.16'] && /heart of the gospel/.test(n['43.3.16'].html) && /<b>bold<\/b> second paragraph/.test(n['43.3.16'].html), 'John 3:16 note has both paragraphs');
  T(n['45.8.28'] && /together/.test(n['45.8.28'].html), 'Rom 8:28 note from a heading reference');
  res = await importFiles([nf], dest, {}, ud, null, { docs: { [nf]: { as: 'notes', title: 'n' } } });
  T(!/<hr>/.test(ud.d.notes['43.3.16'].html), 'importing the same notes twice adds nothing');
  res = await importFiles([path.join(dir, 'flat.txt')], dest, {}, ud, null, { docs: { [path.join(dir, 'flat.txt')]: { as: 'notes', title: 'x' } } });
  T(res[0].status === 'skipped', 'no references → refused');
  // 6. a broken file is reported, not thrown
  const bad1 = path.join(tmp(), 'broken.docx'); fs.writeFileSync(bad1, 'not a zip');
  res = await importFiles([bad1], dest, {}, ud, null, { docs: { [bad1]: { as: 'book', title: 'B' } } });
  T(res[0].status === 'skipped' && /could not read/.test(res[0].reason), 'broken docx: ' + res[0].reason);
  console.log(`docimport: ${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
})().catch(e => { console.log('crash', e); process.exit(1); });
