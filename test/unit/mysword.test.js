/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/mysword.test.js — MySword .mybible modules (Bible, commentary, dictionary, book, journal), built here as small SQLite files
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const mysword = require('../../app/lib/mysword'), bookmod = require('../../app/lib/bookmod'), importer = require('../../app/lib/importer');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const mk = (f, sql) => { const d = new DatabaseSync(f); d.exec(sql); d.close(); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mysword-'));
  // Bible: full-canon shape is not needed; John 3 and Genesis 1 only
  const bbl = path.join(dir, 'TST.bbl.mybible');
  mk(bbl, `create table Details(Description text, Abbreviation text, Comments text, Version text, VersionDate text, PublishDate text, RightToLeft int, OT int, NT int, Strong int, CustomCSS text, Language text, VerseRules text);
    create table Bible(Book int, Chapter int, Verse int, Scripture text);
    insert into Details(Description,Abbreviation,Comments,Strong,Language,VerseRules) values('Test Bible','TST','About <i>this</i>',1,'tl','teh\tthe');
    insert into Bible values(1,1,1,'In the beginning<WH7225> God created.'),(1,1,2,'And the earth was void.'),(43,3,16,'For God so loved<WG25> the world.<RX43.3.17>'),(43,3,17,'Not to condemn.');`);
  const m = await mysword.load(bbl);
  ok(m.title === 'Test Bible' && m.abbr === 'TST' && m.format === 'MySword', 'details read');
  ok(m.hasStrongs, 'strongs flag');
  ok(m.getVerse(43, 3, 16) === 'For God so loved<WG25> the world.', 'verse text, <RX> removed: ' + m.getVerse(43, 3, 16));
  ok(m.books[1][0] === 2 && m.books[43][2] === 17, 'verse counts');
  ok(m.props._rules.length === 1 && m.props._rules[0] === '"teh" "the"', 'verse rule: ' + m.props._rules);
  ok(m.props.lang === 'tl', 'language');
  m.close();
  // plain .mybible (notes) is not a module
  const notes = path.join(dir, 'notes.mybible'); mk(notes, 'create table Notes(x text)');
  ok(!importer.isModuleName('notes.mybible') && importer.isModuleName('a.bbl.mybible') && importer.isModuleName('a.cmt.mybible'), 'import name filter');
  const ins = await importer.inspect(notes, {}); ok(!ins.ok, 'plain .mybible refused');
  const insb = await importer.inspect(bbl, {}); ok(insb.ok && insb.format === 'MySword' && insb.kind === 'Bible', 'Bible inspects');
  // commentary
  const cmt = path.join(dir, 'CM.cmt.mybible');
  mk(cmt, `create table Details(Description text, Abbreviation text, Comments text, Version text, VersionDate text, PublishDate text, RightToLeft int);
    create table Commentary(Book int, Chapter int, FromVerse int, ToVerse int, Data text);
    insert into Details(Description,Abbreviation) values('Test Commentary','CM');
    insert into Commentary values(43,3,16,16,'<p>God loved.</p>'),(43,3,17,19,'Range note'),(43,3,0,0,'Chapter intro');`);
  const c = await bookmod.open(cmt);
  ok(!c.locked && c.kind === 'commentary' && c.format === 'MySword' && c.title === 'Test Commentary', 'commentary opens: ' + (c.reason || ''));
  let fv = c.forVerse(43, 3, 16); ok(fv && fv.level === 'verse', 'verse entry');
  ok(c.topic(fv.id).html.includes('God loved'), 'verse text');
  fv = c.forVerse(43, 3, 18); ok(fv && fv.level === 'passage', 'range entry');
  fv = c.forVerse(43, 3, 1); ok(fv && fv.level === 'chapter', 'chapter entry');
  ok([...c.verseMarks(43, 3)].sort().join() === '16,17,18,19', 'marks');
  c.close();
  // dictionary
  const dct = path.join(dir, 'D.dct.mybible');
  mk(dct, `create table Details(Description text, Abbreviation text);
    create table Dictionary(word text, data text);
    insert into Details values('Test Strongs','TS');
    insert into Dictionary values('G25','<b>agapao</b> love'),('G26','agape'),('H7225','reshith');`);
  const d = await bookmod.open(dct);
  ok(!d.locked && d.kind === 'dictionary' && d.isStrong && d.greek && d.hebrew, 'strong dictionary detected');
  ok(d.lookup('G25').html.includes('agapao'), 'lookup');
  ok(d.findWord('g26').length === 1, 'findWord');
  d.close();
  // book + journal with other column names
  const bok = path.join(dir, 'B.bok.mybible');
  mk(bok, `create table Details(Description text); create table Book(Chapter text, Content text); insert into Details values('A Book');
    insert into Book values('One','First chapter text'),('Two','<p>Second</p>');`);
  const b = await bookmod.open(bok);
  ok(!b.locked && b.kind === 'book' && b.topics().length === 2 && b.topic(b.topics()[1].id).html.includes('Second'), 'book opens');
  b.close();
  const jor = path.join(dir, 'J.jor.mybible');
  mk(jor, `create table Journal(title text, id integer, notes text); insert into Journal values('Day 1',1,'wrote something long enough');`);
  const j = await bookmod.open(jor);
  ok(!j.locked && j.topics().length === 1 && j.topic(j.topics()[0].id).html.includes('wrote'), 'journal opens without Details table');
  j.close();
  // the layout real MySword books use: a journal table with relativeorder/hidden, an FTS index, a data table, CustomCSS
  const bok2 = path.join(dir, 'R.bok.mybible');
  mk(bok2, `create table details(title text, abbreviation text, description text, customcss text);
    create table journal(rowid integer primary key autoincrement, id text, title text, date datetime, tags text, content text, relativeorder int default 0, hidden int default 0);
    create table data(rowid integer primary key autoincrement, id text, description text, content blob);
    create virtual table journalFTS using fts3(title, content);
    insert into details values('Real Layout','RL','Real layout book','.v{vertical-align: super;}');
    insert into journal(id,title,content,relativeorder,hidden) values('b','Beta','<span class="v">1</span> second',2,0),('a','Alpha','first',1,0),('z','Zeta','secret',3,1);
    insert into journalFTS values('Beta','second');`);
  const r2 = await bookmod.open(bok2);
  ok(!r2.locked && r2.title === 'Real Layout' && r2.topics().map(t => t.subject).join() === 'Alpha,Beta', 'relativeorder kept, hidden skipped: ' + r2.topics().map(t => t.subject));
  ok(/class="v" style="vertical-align: super;"/.test(r2.topic(r2.topics()[1].id).html), 'CustomCSS applied');
  r2.close();
  // encrypted / not sqlite
  const bad = path.join(dir, 'X.bbl.mybible'); fs.writeFileSync(bad, 'not a database at all');
  let err = ''; try { await mysword.load(bad); } catch (e) { err = e.message; } ok(/not a MySword/.test(err), 'non-sqlite refused');
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('mysword: ' + n + ' ok');
})().catch(e => { console.log('mysword FAILED: ' + e.stack); process.exit(1); });
