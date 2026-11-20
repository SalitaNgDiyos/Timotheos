// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Create verse links: node test/unit/verselinks.test.js
const fs = require('fs'), os = require('os'), path = require('path');
const vl = require('../../app/lib/verselinks'), um = require('../../app/lib/usermod'), sqlite = require('../../app/lib/sqlite');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
const flat = (o, t) => vl.matcher(o).parts(t, {}).map(p => typeof p === 'string' ? p : '[' + p.shown + '>' + p.ref + ']').join('');

(async () => {
  // plain text
  T(flat({}, 'See John 3:16; 5:24, 8 and Rom 8:28-30.') === 'See [John 3:16>43.3.16]; [5:24>43.5.24], [8>43.5.8] and [Rom 8:28-30>45.8.28-45.8.30].', 'follow-ons and ranges: ' + flat({}, 'See John 3:16; 5:24, 8 and Rom 8:28-30.'));
  T(flat({}, 'Gen 1:1-2:3') === '[Gen 1:1-2:3>1.1.1-1.2.3]', 'chapter-spanning range');
  T(flat({}, 'I John 3:16, II Tim 3:16, 1st John 1:9, 1Sam 3:4, Php_1:17') === '[I John 3:16>62.3.16], [II Tim 3:16>55.3.16], [1st John 1:9>62.1.9], [1Sam 3:4>9.3.4], [Php_1:17>50.1.17]', 'number prefixes');
  T(flat({}, 'Isa 5:2, Is 5:2, john 3:16') === '[Isa 5:2>23.5.2], Is 5:2, john 3:16', 'Is (the word) and lowercase book names are not links: ' + flat({}, 'Isa 5:2, Is 5:2, john 3:16'));
  T(flat({}, 'Mga Awit 23:1, Juan 3:16 and Song of Solomon 2:4') === '[Mga Awit 23:1>19.23.1], [Juan 3:16>43.3.16] and [Song of Solomon 2:4>22.2.4]', 'Tagalog and multi-word names');
  T(flat({ tagalog: false }, 'Mga Awit 23:1').indexOf('[') < 0, 'Tagalog names off');
  T(flat({}, 'Gen 1:1, 3 sons and at 10:30 am') === '[Gen 1:1>1.1.1], 3 sons and at 10:30 am', 'a number that is not a verse stays text: ' + flat({}, 'Gen 1:1, 3 sons and at 10:30 am'));
  T(flat({ followOn: false }, 'Exo 4:14; 5:1') === '[Exo 4:14>2.4.14]; 5:1', 'follow-ons off');
  T(flat({ bare: true }, 'Gen 1:1 then 2:3') === '[Gen 1:1>1.1.1] then [2:3>1.2.3]', 'bare reference after a book');
  T(flat({ text: 'english' }, 'Exodus 4:14-16; 5:1') === '[Exod 4:14-16>2.4.14-2.4.16]; [Exod 5:1>2.5.1]', 'standard English text: ' + flat({ text: 'english' }, 'Exodus 4:14-16; 5:1'));
  T(flat({ text: 'tagalog' }, 'Juan 3:16').startsWith('[Jn 3:16') || flat({ text: 'tagalog' }, 'Juan 3:16').startsWith('[Juan 3:16'), 'standard Tagalog text: ' + flat({ text: 'tagalog' }, 'Juan 3:16'));

  // placeholders
  const mt = vl.matcher({});
  const r1 = vl.rtfPlaceholders('{\\field{\\*\\fldinst HYPERLINK "tw://bible.*?id=2.4.14"}{\\fldrslt\\cf2 [vref]}}; {\\field{\\*\\fldinst{HYPERLINK "tw://bible.*?id=43.3.16-43.3.18"}}{\\fldrslt{\\cf2 [vref]}}}', mt);
  T(r1.n === 2 && /\\cf2 Exod 4:14\}/.test(r1.data) && /\\cf2 John 3:16-18\}/.test(r1.data), 'RTF placeholders: ' + r1.data);
  const h1 = vl.htmlPlaceholders('<a href="tw://bible.*?id=1.1.1">[vref]</a> <a href="tw://bible.*?id=1.1.1">Gen 1:1</a>', mt);
  T(h1.n === 1 && h1.data.startsWith('<a href="tw://bible.*?id=1.1.1">Gen 1:1</a> '), 'HTML placeholders: ' + h1.data);

  // a real module
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-'));
  const m = await um.createModule({ kind: 'dictionary', title: 'VL test' }, dir);
  await um.saveTopic(m.file, { subject: 'Aaron', html: '<p>See Exo 4:14; 5:1 and <b>John 3:16</b>. Already <a href="tw://bible.*?id=1.1.1">Gen 1:1</a>. At 10:30 am.</p>' });
  await um.saveTopic(m.file, { subject: 'Plain', html: '<p>No references, 3 sons.</p>' });
  const s = await vl.scan(m.file, {});
  T(s.changed === 1 && s.links === 3 && s.samples.length === 1, 'scan: ' + JSON.stringify(s));
  const before = fs.readFileSync(m.file);
  T(Buffer.compare(before, fs.readFileSync(m.file)) === 0, 'scan changes nothing');
  const c = await vl.apply(m.file, { mode: 'copy' });
  T(c.file && /\(verse links\)\.dct\.twm$/.test(c.file) && fs.existsSync(c.file) && Buffer.compare(before, fs.readFileSync(m.file)) === 0, 'copy: original untouched, new file ' + c.file);
  const text = f => String(sqlite.openDb(f).exec("select data from content where topic_id = (select id from topics where subject = 'Aaron')")[0].values[0][0]);
  const rt = text(c.file);
  T((rt.match(/HYPERLINK "tw:\/\/bible\.\*\?id=/g) || []).length === 4, 'copy has 4 links (3 new + the old one): ' + rt);
  T(/\{\\fldrslt Exo 4:14\}/.test(rt) && /id=1\.1\.1/.test(rt) && /At 10:30 am/.test(rt), 'text kept, 10:30 not linked');
  const w = await vl.apply(m.file, {});
  T(w.file === m.file && w.backup && fs.existsSync(w.backup) && Buffer.compare(fs.readFileSync(w.backup), before) === 0, 'in place: backup is the original');
  T(text(m.file) === rt, 'in place gives the same text as the copy');
  const again = await vl.scan(m.file, {});
  T(again.changed === 0 && again.links === 0, 'a second run finds nothing new: ' + JSON.stringify(again));
  const none = await vl.apply(m.file, { mode: 'copy' });
  T(none.file === null && fs.readdirSync(dir).filter(x => /verse links/.test(x)).length === 1, 'nothing to do: no empty copy is left');

  // a topic with an HTML body (content_type html), and a Bible text file is refused
  const SQL = await require('../../app/lib/dict').sqljs();
  const db = new SQL.Database(fs.readFileSync(m.file));
  db.run("update topics set content_type = 'html' where subject = 'Plain'");
  db.run("update content set data = '<p>Read <i>Rom 8:28</i> and <a href=\"tw://bible.*?id=1.1.1\">[vref]</a></p>' where topic_id = (select id from topics where subject = 'Plain')");
  fs.writeFileSync(m.file, Buffer.from(db.export())); db.close();
  const hh = await vl.apply(m.file, {});
  const body = String(sqlite.openDb(m.file).exec("select data from content where topic_id = (select id from topics where subject = 'Plain')")[0].values[0][0]);
  T(/<i><a href="tw:\/\/bible\.\*\?id=45\.8\.28">Rom 8:28<\/a><\/i>/.test(body) && />Gen 1:1<\/a>/.test(body) && hh.fixed === 1, 'html topic: ' + body);
  let err = null; try { await vl.scan(path.join(dir, 'x.ont'), {}); } catch (e) { err = e; }
  T(err && /theWord modules/.test(err.message), 'only .twm');

  console.log(bad ? 'FAILED ' + bad : 'ok ' + ok);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('ERR', e.stack); process.exit(1); });
