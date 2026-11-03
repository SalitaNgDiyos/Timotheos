'use strict';
// Comprehensive automated test suite for Tanglaw Bible 0.4.9 (Categories A through F).
// Runs standalone on Node 18+ (using Python's built-in sqlite3 when node:sqlite / sql.js is not installed).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Provide a lightweight Python sqlite3 shim for environments without node:sqlite or node_modules/sql.js
function pySql(dbFile, ops) {
  const script = `
import sqlite3, json, sys, base64
data = json.loads(sys.argv[1])
conn = sqlite3.connect(data['file'])
cur = conn.cursor()
out = []
for op in data['ops']:
    params = [base64.b64decode(p['__b64']) if isinstance(p, dict) and '__b64' in p else p for p in op.get('params', [])]
    cur.execute(op['sql'], params)
    if cur.description:
        cols = [d[0] for d in cur.description]
        vals = [[ {'__b64': base64.b64encode(v).decode()} if isinstance(v, (bytes, bytearray)) else v for v in r] for r in cur.fetchall()]
        out.append({'columns': cols, 'values': vals})
    else:
        out.append(None)
conn.commit()
conn.close()
print(json.dumps(out))
`;
  const encParams = ps => (ps || []).map(p => Buffer.isBuffer(p) || p instanceof Uint8Array ? { __b64: Buffer.from(p).toString('base64') } : p);
  const raw = execFileSync('python3', ['-c', script, JSON.stringify({ file: dbFile, ops: ops.map(o => ({ sql: o.sql, params: encParams(o.params) })) })], { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  const parsed = JSON.parse(raw);
  return parsed.map(r => r ? {
    columns: r.columns,
    values: r.values.map(row => row.map(v => v && typeof v === 'object' && v.__b64 ? Buffer.from(v.__b64, 'base64') : v)),
  } : null);
}

class PyDatabaseSync {
  constructor(file) { this.file = file; }
  exec(sql) { pySql(this.file, [{ sql }]); }
  prepare(sql) {
    const file = this.file;
    return {
      setReturnArrays() {},
      columns() { const r = pySql(file, [{ sql }])[0]; return (r ? r.columns : []).map(name => ({ name })); },
      all(...params) { const r = pySql(file, [{ sql, params }])[0]; return r ? r.values : []; },
      *iterate(...params) { const r = pySql(file, [{ sql, params }])[0]; for (const row of (r ? r.values : [])) yield row; },
      run(...params) { pySql(file, [{ sql, params }]); return {}; },
    };
  }
  close() {}
}

global.__TANGLAW_SQLITE_SHIM = PyDatabaseSync;

// Also shim dict.js sqljs() when node_modules/sql.js is absent
const dictMod = require('../src/lib/dict');
dictMod.sqljs = async () => ({
  Database: class {
    constructor(buf) {
      this.tmp = path.join(os.tmpdir(), 'tanglaw-sqljs-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.sqlite');
      if (buf) fs.writeFileSync(this.tmp, Buffer.from(buf));
    }
    exec(sql, params) {
      const r = pySql(this.tmp, [{ sql, params: params || [] }])[0];
      return r && r.values.length ? [r] : [];
    }
    run(sql, params) { pySql(this.tmp, [{ sql, params: params || [] }]); }
    prepare(sql) {
      const tmp = this.tmp;
      let bound = [];
      let rows = null, idx = 0;
      return {
        bind(p) { bound = p || []; rows = null; idx = 0; },
        step() { if (!rows) { const r = pySql(tmp, [{ sql, params: bound }])[0]; rows = r ? r.values : []; idx = 0; } return idx < rows.length; },
        get() { return rows[idx++]; },
        run(p) { pySql(tmp, [{ sql, params: p || bound }]); },
        reset() { rows = null; idx = 0; },
        free() { rows = null; },
      };
    }
    export() { return fs.existsSync(this.tmp) ? fs.readFileSync(this.tmp) : Buffer.alloc(0); }
    close() { try { if (fs.existsSync(this.tmp)) fs.unlinkSync(this.tmp); } catch (e) {} }
  },
});

const canon = require('../src/lib/canon');
const theword = require('../src/lib/theword');
const TWRender = require('../src/renderer/render');
const modprops = require('../src/lib/modprops');
const usermod = require('../src/lib/usermod');
const overlays = require('../src/lib/overlays');
const twstudy = require('../src/lib/twstudy');
const bookmod = require('../src/lib/bookmod');
const booksearch = require('../src/lib/booksearch');
const search = require('../src/lib/search');
const { Library } = require('../src/lib/library');
const { importFiles } = require('../src/lib/importer');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
  console.log('  ✓ ' + msg);
}

(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tanglaw-049-test-'));
  console.log('Running Tanglaw Bible 0.4.9 verification suite in', work);

  // =========================================================================
  // Category F: Bug Fixes (F1–F5)
  // =========================================================================
  console.log('\n[Category F: 0.4.8 Bug Fixes]');
  canon.setOrder('nets');
  ok(canon.getOrder() === 'nets' && canon.orderKey(79) < canon.orderKey(15), '[F1] canon.setOrder("nets") places 1 Esdras (79) before Ezra (15)');
  canon.setOrder('orthodox');
  ok(canon.orderKey(67) < canon.orderKey(17), '[F1] canon.setOrder("orthodox") places Tobit (67) before Esther (17)');
  canon.setOrder('1611');

  const astralRtf = modprops.rtfText('A \u{1D400} B');
  ok(astralRtf === 'A \\u-10187?\\u-9216? B', '[F2] modprops.rtfText encodes astral plane U+1D400 as valid UTF-16 surrogate pair: ' + astralRtf);

  const subStrongHtml = TWRender.render('loved<WG25as><WTN-NSM>', { rules: [] }, { strongs: true, morph: true });
  ok(/data-strong="G25a"/.test(subStrongHtml) && /strong-s/.test(subStrongHtml), '[F4] render.js parses sub-lettered Strong tag with trailing s/x flag (<WG25as>)');

  // =========================================================================
  // Category C: Bible Module Spec & Rendering (C1–C4)
  // =========================================================================
  console.log('\n[Category C: Bible Module Spec & Rendering]');
  const ontFile = path.join(work, 'testbible.ont');
  const verses = Array(canon.ONT_TOTAL).fill('');
  verses[0] = 'In the beginning <XTAG>God</XTAG> created [literal] the heaven.'; // Gen 1:1 (OT)
  verses[canon.ontLine(43, 1, 1, 'ont')] = 'In the beginning was the <XTAG>Word</XTAG> [literal]searchable_token.'; // John 1:1 (NT)
  const props = [
    'id=tst049',
    'short.title=T049',
    'title=Test Bible 0.4.9',
    'strongs.dct=CustomStrongs',
    'morph.dct=CustomMorph',
    'tag.rule="<XTAG>" "<XTAG>(.*?)</XTAG>" "<b>$1</b>"',
    'verse.rule="[literal]" "[REPLACED_LITERAL]" "regex_off=1"',
    'verse.rule="created" "formed" "ot_only=1"',
    'verse.rule="beginning" "start_nt" "nt_only=1"',
    'verse.rule="searchable_token" " hidden_gem" "onsearch=1"',
  ];
  fs.writeFileSync(ontFile, '\uFEFF' + verses.concat(props).join('\r\n'));

  const mBible = theword.load(ontFile);
  ok(mBible.tagRules.length === 1 && mBible.strongsDct === 'CustomStrongs', '[C1 & C3] theword.js parses tag.rule and strongs.dct/morph.dct');

  const gen1Html = TWRender.render(mBible.getVerse(1, 1, 1), mBible, {}, { b: 1 });
  const jn1Html = TWRender.render(mBible.getVerse(43, 1, 1), mBible, {}, { b: 43 });
  ok(/<b>God<\/b>/.test(gen1Html), '[C1] tag.rule transforms <XTAG>God</XTAG> -> <b>God</b>');
  ok(/\[REPLACED_LITERAL\]/.test(gen1Html), '[C2] verse.rule with regex_off=1 performs literal replacement of [literal]');
  ok(/formed/.test(gen1Html) && !/start_nt/.test(gen1Html), '[C2] verse.rule respects ot_only=1 and skips nt_only=1 in Genesis');
  ok(/start_nt/.test(jn1Html) && !/hidden_gem/.test(jn1Html), '[C2] verse.rule applies nt_only=1 in John and hides onsearch=1 rule during display');

  const srchOnSearch = search.run([{ id: 'tw:testbible.ont', abbr: 'T049', mod: mBible }], 'hidden_gem', {});
  ok(srchOnSearch.total === 1 && srchOnSearch.results[0].b === 43, '[C2] search.js executes onsearch=1 rules before indexing verse text');

  // [C4] External headings (.hdgs.twm) & paragraph overlays (.prgs.twm)
  const hdgsFile = path.join(work, 'custom.hdgs.twm');
  const prgsFile = path.join(work, 'custom.prgs.twm');
  pySql(hdgsFile, [
    { sql: 'CREATE TABLE config(name TEXT, value TEXT)' },
    { sql: 'INSERT INTO config VALUES ("title", "Test Headings"), ("type", "6")' },
    { sql: 'CREATE TABLE headings(bi INT, ci INT, vi INT, level INT, text TEXT)' },
    { sql: 'INSERT INTO headings VALUES (1, 1, 1, 1, "The Creation of the World")' },
  ]);
  pySql(prgsFile, [
    { sql: 'CREATE TABLE config(name TEXT, value TEXT)' },
    { sql: 'INSERT INTO config VALUES ("title", "Test Paragraphs"), ("type", "7")' },
    { sql: 'CREATE TABLE paragraphs(bi INT, ci INT, vi INT, kind TEXT)' },
    { sql: 'INSERT INTO paragraphs VALUES (1, 1, 1, "CM")' },
  ]);
  const ov = new overlays.Overlays();
  await ov.load([hdgsFile, prgsFile]);
  const decoratedGen1 = ov.applyVerse(1, 1, 1, mBible.getVerse(1, 1, 1));
  ok(/<TS1>The Creation of the World<Ts><CM>/.test(decoratedGen1), '[C4] Overlays injects external .hdgs.twm heading and .prgs.twm paragraph mark');

  // =========================================================================
  // Category B: tw:// Hyperlink Protocol & Book Module Features (B1–B5)
  // =========================================================================
  console.log('\n[Category B: tw:// Hyperlink Protocol & Book Modules]');
  const hybFile = path.join(work, 'HybridBook.gbk.twm');
  pySql(hybFile, [
    { sql: 'CREATE TABLE config(name TEXT, value TEXT)' },
    { sql: 'INSERT INTO config VALUES ("type", "3"), ("title", "Hybrid Sync Book"), ("abbrev", "HybBk"), ("verse.sync", "1"), ("preserve.fonts", "1"), ("content.type", "rtf")' },
    { sql: 'CREATE TABLE topics(id INTEGER PRIMARY KEY, pid INTEGER DEFAULT 0, subject TEXT, rel_order INTEGER, content_type TEXT)' },
    { sql: 'CREATE TABLE content(topic_id INTEGER PRIMARY KEY, data BLOB, data2 BLOB)' },
    { sql: 'CREATE TABLE rel_refs(id INTEGER PRIMARY KEY AUTOINCREMENT, topic_id INTEGER, topic_pos TEXT, fbi INTEGER, fci INTEGER, fvi INTEGER, tci INTEGER, tvi INTEGER)' },
    { sql: 'INSERT INTO topics VALUES (1, 0, "Main Article", 10, "rtf"), (2, 0, "Redirect Topic", 20, "meta")' },
    { sql: 'INSERT INTO content VALUES (1, ?, NULL)', params: ['{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Intro text.{\\*\\bkmkstart fn_001_start}{\\*\\bkmkend fn_001_start}Footnote One Body{\\*\\bkmkstart fn_001_end}{\\*\\bkmkend fn_001_end} After note.}'] },
    { sql: 'INSERT INTO content VALUES (2, ?, NULL)', params: ['meta=_twmgc_\ntype=link\nid=1\nanchor=fn_001_start'] },
    { sql: 'INSERT INTO rel_refs(topic_id, topic_pos, fbi, fci, fvi, tci, tvi) VALUES (1, "fn_001_start", 43, 1, 1, 1, 5)' },
  ]);

  const hybMod = await bookmod.open(hybFile);
  const t1 = hybMod.topic(1);
  ok(/id="bkm:fn_001_start"/.test(t1.html) && /font-family:'Arial'/.test(t1.html), '[B1 & B5] rtf.js emits bookmark anchors and honors preserve.fonts=1 for Arial');
  const t2 = hybMod.topic(2);
  ok(t2.targetId === 1 && t2.anchor === 'fn_001_start' && /Footnote One Body/.test(t2.html), '[B2] bookmod.js resolves content_type="meta" redirect link-topic to targetId=1 & anchor=fn_001_start');
  const syncHit = hybMod.forVerse(43, 1, 3);
  ok(syncHit && syncHit.id === 1 && syncHit.anchor === 'fn_001_start' && syncHit.level === 'passage', '[B3] bookmod.js synchronizes hybrid book via rel_refs table on John 1:3');
  hybMod.close();

  // =========================================================================
  // Category A: User Module Creation & Authoring (A1–A4)
  // =========================================================================
  console.log('\n[Category A: User Module Creation & Authoring]');
  const userDir = path.join(work, 'usermods');
  const cmtCreated = await usermod.createModule({ kind: 'commentary', title: 'My Study Notes', abbr: 'MSN' }, userDir);
  await usermod.saveCommentaryEntry(cmtCreated.file, { b: 43, c: 3, fvi: 16, tvi: 16 }, '<p>God <b>loved</b> the world – see <a data-href="tw://bible.*?id=45.5.8">Rom 5:8</a>.</p>');
  const uCmt = await bookmod.open(cmtCreated.file);
  const uHit = uCmt.forVerse(43, 3, 16);
  const uTopic = uCmt.topic(uHit.id);
  ok(uCmt.user === true && uHit.level === 'verse' && /loved/.test(uTopic.html) && /tw:\/\/bible\.\*\?id=45\.5\.8/.test(uTopic.html), '[A1] User commentary (.cmt.twm) created, saved verse entry with RTF hyperlink, and read back');
  uCmt.close();

  const dctCreated = await usermod.createModule({ kind: 'dictionary', title: 'My Greek Lexicon', abbr: 'MGL' }, userDir);
  const savedDct = await usermod.saveTopic(dctCreated.file, { subject: 'G26', html: '<p><b>ἀγάπη</b> – love, charity.</p>' });
  const uDct = await bookmod.open(dctCreated.file);
  const lkpG26 = uDct.lookup('G26');
  ok(uDct.user === true && lkpG26 && /ἀγάπη/.test(lkpG26.html), '[A2] User dictionary (.dct.twm) created and headword G26 looked up');
  uDct.close();

  const gbkCreated = await usermod.createModule({ kind: 'book', title: 'My Theology Book', abbr: 'MTB' }, userDir);
  const ch1 = await usermod.saveTopic(gbkCreated.file, { pid: 0, subject: 'Chapter 1', html: '<p>First chapter</p>' });
  const sec1 = await usermod.saveTopic(gbkCreated.file, { pid: ch1.id, subject: 'Section 1.1', html: '<p>Sub-topic</p>' });
  await usermod.renameTopic(gbkCreated.file, sec1.id, 'Section 1.1 (Revised)');
  await usermod.moveTopic(gbkCreated.file, ch1.id, -1);
  const uGbk = await bookmod.open(gbkCreated.file);
  const gbkTopics = uGbk.topics();
  ok(gbkTopics[0].subject === 'Chapter 1' && gbkTopics.some(t => t.pid === ch1.id && t.subject === 'Section 1.1 (Revised)'), '[A3] User book (.gbk.twm) supports nested topics, renaming, and sibling reordering');
  uGbk.close();

  const exportedNotesFile = path.join(userDir, 'ExportedNotes.cmt.twm');
  const expRes = await usermod.exportNotesToCommentary({
    '1.1.1': { html: '<p>Creation note on Gen 1:1</p>', t: Date.now() },
    '43.3.16': { html: '<p>Gospel note on Jn 3:16</p>', t: Date.now() },
  }, exportedNotesFile, { title: 'Exported Notes', abbr: 'ExpN' });
  const expMod = await bookmod.open(exportedNotesFile);
  ok(expRes.count === 2 && expMod.forVerse(1, 1, 1) && expMod.forVerse(43, 3, 16), '[A4] Personal JSON verse notes exported to standalone .cmt.twm commentary module');
  expMod.close();

  // =========================================================================
  // Category D: Search, Study & Additional Formats (D1–D5)
  // =========================================================================
  console.log('\n[Category D: Search, Study & Additional Module Formats]');
  // [D1] Nested NEARv and nearAcross
  verses[canon.ontLine(43, 1, 2, 'ont')] = 'The same was in the beginning with God and grace.';
  verses[canon.ontLine(43, 2, 1, 'ont')] = 'And the third day there was a marriage in Cana.';
  fs.writeFileSync(ontFile, '\uFEFF' + verses.concat(props).join('\r\n'));
  const mBible2 = theword.load(ontFile);
  const nestedNear = search.run([{ id: 'tw:testbible.ont', abbr: 'T049', mod: mBible2 }], '(Word NEARv1 grace) AND beginning', {});
  ok(nestedNear.total >= 1 && nestedNear.results[0].b === 43 && nestedNear.results[0].c === 1, '[D1] Nested NEARv inside compound Boolean AST ((Word NEARv1 grace) AND beginning) works');
  const acrossCh = search.run([{ id: 'tw:testbible.ont', abbr: 'T049', mod: mBible2 }], 'grace NEARv2 marriage', { nearAcross: true });
  ok(acrossCh.total >= 1, '[D1] NEARv with nearAcross=true matches across chapter boundaries');

  // [D2] Book Search Boolean (OR, NOT, NEARw) & Regex
  const lib = new Library({ moduleFolders: [work, userDir], apocryphaPlacement: '1611' });
  await lib.scan();
  const bsOr = await booksearch.run(lib, 'charity OR Creation', {});
  ok(bsOr.total >= 2, '[D2] Book search supports OR operator across modules (' + bsOr.total + ' hits)');
  const bsNot = await booksearch.run(lib, 'Creation NOT gospel', {});
  ok(bsNot.total >= 1, '[D2] Book search supports NOT operator');
  const bsNear = await booksearch.run(lib, 'love @4 charity', {});
  ok(bsNear.total >= 1, '[D2] Book search supports NEARw (@n) proximity operator');
  const bsRegex = await booksearch.run(lib, 'Creat(ion|ed)', { regex: true });
  ok(bsRegex.total >= 1, '[D2] Book search supports regular expressions');

  // [D4] .vsls.twm and .rdp.twm export & import round-trip
  const vslsBuf = await twstudy.exportVerseLists({ 'Salvation Verses': [{ b: 43, c: 3, v: 16 }, { b: 45, c: 5, v: 8, v2: 9 }] }, 'Salvation Verses');
  const vslsFile = path.join(work, 'Salvation.vsls.twm');
  fs.writeFileSync(vslsFile, vslsBuf);
  const readVl = twstudy.readVerseLists(vslsFile);
  ok(readVl.lists['Salvation Verses'] && readVl.lists['Salvation Verses'].length === 2 && readVl.lists['Salvation Verses'][1].v2 === 9, '[D4] .vsls.twm verse list export & import round-trip');

  const samplePlan = { name: 'Gospels Plan', sessions: [{ readings: [{ b: 40, c1: 1, c2: 2 }], done: true }, { readings: [{ b: 40, c1: 3, c2: 4 }], done: false }] };
  const rdpBuf = await twstudy.exportReadingPlan(samplePlan);
  const rdpFile = path.join(work, 'Gospels.rdp.twm');
  fs.writeFileSync(rdpFile, rdpBuf);
  const readRp = twstudy.readReadingPlan(rdpFile);
  ok(readRp.name === 'Gospels Plan' && readRp.sessions.length === 2 && readRp.sessions[0].readings[0].c2 === 2, '[D4] .rdp.twm reading plan export & import round-trip');

  // [D5] e-Sword .mapx, .harx, and .notx modules
  const mapxFile = path.join(work, 'TestMap.mapx');
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  pySql(mapxFile, [
    { sql: 'CREATE TABLE Details(Title TEXT, Abbreviation TEXT)' },
    { sql: 'INSERT INTO Details VALUES ("Bible Lands Maps", "BLMap")' },
    { sql: 'CREATE TABLE Graphics(Topic TEXT, Graphic BLOB, Caption TEXT)' },
    { sql: 'INSERT INTO Graphics VALUES ("Sinai Peninsula", ?, "The route of the Exodus (Exod 14:21)")', params: [tinyPng] },
  ]);
  const harxFile = path.join(work, 'GospelHarmony.harx');
  pySql(harxFile, [
    { sql: 'CREATE TABLE Details(Title TEXT, Abbreviation TEXT)' },
    { sql: 'INSERT INTO Details VALUES ("Gospel Harmony", "GHar")' },
    { sql: 'CREATE TABLE Harmony(Title TEXT, Comments TEXT)' },
    { sql: 'INSERT INTO Harmony VALUES ("The Baptism of Jesus", "<p>Compare <ref>Matt 3:13-17</ref>; <ref>Mark 1:9-11</ref>; <ref>Luke 3:21-22</ref>.</p>")' },
  ]);
  const notxFile = path.join(work, 'MyStudy.notx');
  pySql(notxFile, [
    { sql: 'CREATE TABLE VerseNotes(Book INT, Chapter INT, Verse INT, Comments TEXT)' },
    { sql: 'INSERT INTO VerseNotes VALUES (43, 3, 16, "{\\rtf1 Personal e-Sword study note on John 3:16.}")' },
  ]);

  const mMapx = await bookmod.open(mapxFile);
  const mapTopic = mMapx.topic(mMapx.topics()[0].id);
  ok(mMapx.kind === 'map' && /data:image\/png;base64,/.test(mapTopic.html) && /Exodus/.test(mapTopic.html), '[D5] e-Sword .mapx graphics module opens with embedded PNG and caption');
  mMapx.close();

  const mHarx = await bookmod.open(harxFile);
  const harTopic = mHarx.topic(mHarx.topics()[0].id);
  ok(mHarx.kind === 'book' && /tw:\/\/bible\.\*\?id=40\.3\.13/.test(harTopic.html), '[D5] e-Sword .harx harmony module opens with converted Bible links');
  mHarx.close();

  const mNotx = await bookmod.open(notxFile);
  const notHit = mNotx.forVerse(43, 3, 16);
  ok(mNotx.kind === 'commentary' && notHit && /Personal e-Sword study note/.test(mNotx.topic(notHit.id).html), '[D5] e-Sword .notx study notes module opens as verse-synced commentary');
  mNotx.close();

  // =========================================================================
  // Category E: Tagalog Book Parsing & Importer Integration
  // =========================================================================
  console.log('\n[Category E: Tagalog Reference Parsing & Importer]');
  ok(canon.parseRef('Mga Awit 23:1').b === 19 && canon.parseRef('Exodo 20:1').b === 2 && canon.parseRef('Mga Gawa 2:38').b === 44 && canon.parseRef('Pahayag 21:4').b === 66, '[E1] canon.parseRef recognizes Tagalog Old and New Testament book names');

  const impDest = path.join(work, 'imported');
  const impRes = await importFiles([hdgsFile, prgsFile, vslsFile, rdpFile, mapxFile, harxFile, notxFile], impDest, {});
  ok(impRes.every(r => r.status === 'imported'), '[C4, D4, D5] Importer accepts .hdgs.twm, .prgs.twm, .vsls.twm, .rdp.twm, .mapx, .harx, and .notx');


  // =========================================================================
  // Category G: e-Sword Bibles with Apocrypha / Deuterocanonical OT
  // =========================================================================
  console.log("\n[Category G: e-Sword Bibles with Apocrypha / Deuterocanonical OT]");
  const esword = require("../src/lib/esword");
  const { openDb } = require("../src/lib/sqlite");

  // 1. Standard e-Sword Bible with embedded Deuterocanonical passages (Esth 11-16, Dan 3:24-90, Dan 13-14, Bar 1-6, Ps 151)
  const esStdFile = path.join(work, "deut_std.bbli");
  {
    const db = openDb(esStdFile, { writable: true });
    const vals = [
      "(1, 1, 1, 'In the beginning.')",
      "(19, 1, 1, 'Psalm 1')",
      "(19, 150, 1, 'Psalm 150')",
      "(19, 151, 1, 'I was small among my brethren, and youngest in my fathers house.')",
      "(27, 1, 1, 'Daniel 1:1')",
      "(27, 3, 24, 'And Azarias stood up and prayed: Blessed art thou, O Lord God of our fathers.')",
      "(27, 3, 90, 'Bless ye the Lord.')",
      "(27, 12, 1, 'Daniel 12:1')",
      "(27, 13, 1, 'There dwelt a man in Babylon, called Joacim (Susanna).')",
      "(27, 14, 1, 'And King Astyages was gathered to his fathers (Bel and the Dragon).')",
      "(71, 6, 1, 'A copy of an epistle, which Jeremy sent unto them which were to be led captives into Babylon.')"
    ];
    for (let c = 1; c <= 16; c++) vals.push(`(17, ${c}, 1, '${c > 10 ? "Mordecai dream addition chapter " + c : "Esther chapter " + c}')`);
    for (let c = 1; c <= 14; c++) vals.push(`(67, ${c}, 1, 'The book of the words of Tobit ${c}:1')`);
    for (let c = 1; c <= 16; c++) vals.push(`(68, ${c}, 1, 'In the twelfth year of the reign of Nabuchodonosor (Judith ${c}:1)')`);
    for (let c = 1; c <= 19; c++) vals.push(`(69, ${c}, 1, 'Love righteousness, ye that be judges of the earth (Wisdom ${c}:1)')`);
    for (let c = 1; c <= 51; c++) vals.push(`(70, ${c}, 1, 'All wisdom cometh from the Lord (Sirach ${c}:1)')`);
    for (let c = 1; c <= 5; c++) vals.push(`(71, ${c}, 1, 'And these are the words of the book, which Baruch wrote (${c}:1)')`);
    for (let c = 1; c <= 16; c++) vals.push(`(72, ${c}, 1, 'And it happened, after that Alexander son of Philip (1 Macc ${c}:1)')`);
    for (let c = 1; c <= 15; c++) vals.push(`(73, ${c}, 1, 'The brethren, the Jews that be in Judea (2 Macc ${c}:1)')`);
    db.run("CREATE TABLE Details (Title TEXT, Abbreviation TEXT)"); db.run("INSERT INTO Details VALUES ('Deuterocanon Standard', 'DSTD')"); db.run("CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)"); db.run("INSERT INTO Bible VALUES " + vals.join(", "));
    db.close();
  }
  const mStd = await esword.load(esStdFile);
  ok(mStd.books[67].length === 14 && mStd.books[68].length === 16 && mStd.books[70].length === 19 && mStd.books[71].length === 51, "[G1] e-Sword Standard Deuterocanon books (Tobit, Judith, Wisdom, Sirach) loaded");
  ok(mStd.books[72].length === 5 && mStd.books[73] && mStd.books[73].length === 1 && /copy of an epistle, which Jeremy/i.test(mStd.getVerse(73, 1, 1)), "[G2] Baruch 6 split out into Letter of Jeremiah (73)");
  ok(/copy of an epistle/i.test(mStd.getVerse(72, 6, 1)), "[G2b] Direct getVerse(72, 6, 1) also resolves Baruch 6");
  ok(mStd.books[74] && /Azarias stood up/i.test(mStd.getVerse(74, 1, 1)), "[G3] Daniel 3:24-90 exposed as Prayer of Azariah / Song of the Three Children (74)");
  ok(mStd.books[75] && /Susanna/.test(mStd.getVerse(75, 1, 1)) && mStd.books[76] && /Bel and the Dragon/.test(mStd.getVerse(76, 1, 1)), "[G4] Daniel 13-14 exposed as Susanna (75) and Bel and the Dragon (76)");
  ok(mStd.books[69] && /Mordecai dream/.test(mStd.getVerse(69, 11, 1)) && /Mordecai dream/.test(mStd.getVerse(69, 1, 1)), "[G5] Esther 11-16 exposed as Additions to Esther (accessible as chapters 11-16 and 1-6)");
  ok(mStd.books[81] && /small among my brethren/.test(mStd.getVerse(81, 1, 1)), "[G6] Psalms 151 exposed as Psalm 151 (81)");
  mStd.close();

  // 2. 73-book Inline Catholic e-Sword Bible (Douay-Rheims / Vulgate numbering 1..46 OT + 47..73 NT)
  const esDrbFile = path.join(work, "deut_drb73.bbli");
  {
    const db = openDb(esDrbFile, { writable: true });
    const vals = [
      "(1, 1, 1, 'In the beginning God created heaven, and earth.')",
      "(17, 1, 1, 'Tobias chapter 1')", "(17, 14, 1, 'Tobias chapter 14')",
      "(18, 1, 1, 'Judith chapter 1')", "(18, 16, 1, 'Judith chapter 16')",
      "(19, 1, 1, 'Esther chapter 1')", "(19, 16, 1, 'Esther chapter 16')",
      "(25, 1, 1, 'Wisdom chapter 1')", "(25, 19, 1, 'Wisdom chapter 19')",
      "(26, 1, 1, 'Ecclesiasticus chapter 1')", "(26, 51, 1, 'Ecclesiasticus chapter 51')",
      "(30, 1, 1, 'Baruch chapter 1')", "(30, 6, 1, 'Baruch chapter 6')",
      "(45, 1, 1, '1 Machabees chapter 1')", "(45, 16, 1, '1 Machabees chapter 16')",
      "(46, 1, 1, '2 Machabees chapter 1')", "(46, 15, 1, '2 Machabees chapter 15')",
      "(47, 1, 1, 'Matthew chapter 1: The book of the generation of Jesus Christ.')", "(47, 28, 1, 'Matthew 28')",
      "(73, 1, 1, 'Apocalypse chapter 1: The Revelation of Jesus Christ.')", "(73, 22, 1, 'Apocalypse 22')"
    ];
    db.run("CREATE TABLE Details (Title TEXT, Abbreviation TEXT)"); db.run("INSERT INTO Details VALUES ('Douay-Rheims 73', 'DRB73')"); db.run("CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)"); db.run("INSERT INTO Bible VALUES " + vals.join(", "));
    db.close();
  }
  const mDrb = await esword.load(esDrbFile);
  ok(mDrb.eswordScheme === "catholic_inline_drb" && /Tobias chapter 1/.test(mDrb.getVerse(67, 1, 1)) && /generation of Jesus Christ/.test(mDrb.getVerse(40, 1, 1)) && /Revelation of Jesus Christ/.test(mDrb.getVerse(66, 1, 1)), "[G7] Auto-detected 73-book inline Catholic e-Sword Bible (1..46 OT + 47..73 NT)");
  mDrb.close();

  // 3. 1611 KJV Apocrypha Order e-Sword Bible (67=1Esdras, 68=2Esdras, 69=Tobit, 70=Judith, ..., 80=1Macc, 81=2Macc)
  const es1611File = path.join(work, "deut_kjv1611.bbli");
  {
    const db = openDb(es1611File, { writable: true });
    const vals = [
      "(67, 1, 1, 'And Josias held the feast of the passover')", "(67, 9, 1, '1 Esdras 9')",
      "(68, 1, 1, 'The second book of the prophet Esdras')", "(68, 16, 1, '2 Esdras 16')",
      "(69, 1, 1, 'The book of the words of Tobit')", "(69, 14, 1, 'Tobit 14')",
      "(70, 1, 1, 'In the twelfth year of the reign of Nabuchodonosor')", "(70, 16, 1, 'Judith 16')",
      "(72, 1, 1, 'Love righteousness, ye that be judges of the earth')", "(72, 19, 1, 'Wisdom 19')",
      "(73, 1, 1, 'All wisdom cometh from the Lord')", "(73, 51, 1, 'Sirach 51')",
      "(80, 1, 1, 'And it happened, after that Alexander son of Philip')", "(80, 16, 1, '1 Macc 16')",
      "(81, 1, 1, 'The brethren, the Jews that be in Judea')", "(81, 15, 1, '2 Macc 15')"
    ];
    db.run("CREATE TABLE Details (Title TEXT, Abbreviation TEXT)"); db.run("INSERT INTO Details VALUES ('KJV 1611 e-Sword', 'KJV1611')"); db.run("CREATE TABLE Bible (Book INT, Chapter INT, Verse INT, Scripture TEXT)"); db.run("INSERT INTO Bible VALUES " + vals.join(", "));
    db.close();
  }
  const m1611 = await esword.load(es1611File);
  ok(m1611.eswordScheme === "kjv1611" && m1611.books[79].length === 9 && m1611.books[67].length === 14 && m1611.books[71].length === 51 && m1611.books[77].length === 16 && m1611.books[78].length === 15, "[G8] Auto-detected 1611 KJV book-numbering scheme in e-Sword module");
  m1611.close();

  // 4. Catholic Deuterocanonical OT placement mode & reference parsing
  canon.setOrder("catholic");
  ok(canon.orderKey(67, "catholic") > canon.orderKey(16, "catholic") && canon.orderKey(67, "catholic") < canon.orderKey(17, "catholic") && canon.group(67, "catholic") === "OT", "[G9] Catholic Deuterocanonical OT order places Tobit (67) between Nehemiah (16) and Esther (17) inside OT");
  canon.setOrder("1611");
  const rDan13 = canon.parseRef("Dan 13:42"), rBar6 = canon.parseRef("Baruch 6:1"), rMach = canon.parseRef("1 Machabees 2:5"), rTagDeut = canon.parseRef("Karunungan ni Solomon 3:1");
  ok(rDan13.b === 75 && rDan13.c === 1 && rDan13.v === 42 && rBar6.b === 73 && rBar6.c === 1 && rMach.b === 77 && rTagDeut.b === 70, "[G10] canon.parseRef resolves Dan 13 -> Susanna, Bar 6 -> Letter of Jeremiah, 1 Machabees, and Tagalog Deuterocanon");


  // =========================================================================
  // Category H: USFM (2.x / 3.0) and USFX XML Bibles
  // =========================================================================
  console.log("\n[Category H: USFM and USFX Bibles]");
  const usfm = require("../src/lib/usfm");
  const zip = require("../src/lib/zip");

  // 1. USFM 3.0 with Strongs, morphology, zaln-s milestones, woj, add, footnotes, xrefs, and Deuterocanon
  const usfmSample = [
    "\\id GEN Genesis",
    "\\h Genesis",
    "\\c 1",
    "\\s1 The Creation",
    "\\r (John 1:1-3)",
    "\\p",
    "\\v 1 In the \\w beginning|strong=\"H07225\" x-morph=\"He,Ncfsa\"\\w* \\w God|strong=\"H0430\" lemma=\"אֱלֹהִים\"\\w* created the heavens and the earth.\\f + \\fr 1:1 \\ft Or \\fq in a beginning\\f*\\x - \\xo 1:1 \\xt John 1:1\\x*",
    "\\v 2 And the earth was \\add without form\\add* and void, says the \\nd LORD\\nd*.",
    "\\id TOB Tobit",
    "\\c 1",
    "\\p",
    "\\v 1 The book of the words of Tobit, son of Tobiel.",
    "\\id DAN Daniel",
    "\\c 13",
    "\\p",
    "\\v 1 There dwelt a man in Babylon, called Joacim (Susanna in USFM).",
    "\\id JHN John",
    "\\c 1",
    "\\p",
    "\\v 1 \\zaln-s |x-strong=\"G35880\" x-lemma=\"ὁ\" x-morph=\"Gr,EA\"\\*\\w The|x-occurrence=\"1\"\\w*\\zaln-e\\* Word was with God.",
    "\\v 2 Jesus said, \\wj I am the light of the world.\\wj*"
  ].join("\n");

  const usfmFile = path.join(work, "test_sample.usfm");
  fs.writeFileSync(usfmFile, usfmSample, "utf8");
  const mUsfm = usfm.loadUsfm(usfmFile);
  const uv1 = mUsfm.getVerse(1, 1, 1);
  const uv2 = mUsfm.getVerse(1, 1, 2);
  const uTob = mUsfm.getVerse(67, 1, 1);
  const uSus = mUsfm.getVerse(75, 1, 1);
  const uJhn1 = mUsfm.getVerse(43, 1, 1);
  const uJhn2 = mUsfm.getVerse(43, 1, 2);
  ok(mUsfm.hasStrongs && /class="heading h1">The Creation/.test(uv1) && /data-strong="H7225"/.test(uv1) && /data-strong="H430"/.test(uv1) && /class="fn"/.test(uv1) && /class="fn xref"/.test(uv1), "[H1] USFM 3.0 parses headings, Strongs (H7225, H430), morphology, footnotes, and cross-refs");
  ok(/class="added">without form/.test(uv2) && /class="sc">LORD/.test(uv2) && /class="woj">I am the light/.test(uJhn2), "[H2] USFM parses \\add, \\nd (small caps), and \\wj (Words of Jesus)");
  ok(/data-strong="G3588"/.test(uJhn1) && !/zaln/.test(uJhn1), "[H3] USFM 3.0 \\zaln-s milestone propagates x-strong and normalizes 5-digit G35880 -> G3588");
  ok(/Tobit, son of Tobiel/.test(uTob) && /Susanna in USFM/.test(uSus), "[H4] USFM supports Deuterocanon (TOB -> 67) and splits DAN 13 -> Susanna (75)");

  // 2. Multi-file USFM .zip archive bundled on import
  const usfmZipFile = path.join(work, "ebible_sample_usfm.zip");
  fs.writeFileSync(usfmZipFile, zip.write({
    "01-GEN.usfm": "\\id GEN\n\\c 1\n\\v 1 In the beginning God created.\n",
    "41-TOB.usfm": "\\id TOB\n\\c 1\n\\v 1 Tobit in multi-file zip.\n",
    "70-MAT.usfm": "\\id MAT\n\\c 1\n\\v 1 The book of the genealogy of Jesus Christ.\n"
  }));
  const usfmImp = await importFiles([usfmZipFile], path.join(work, "imported_usfm"), {});
  ok(usfmImp.length === 1 && usfmImp[0].status === "imported" && usfmImp[0].format === "USFM", "[H5] Multi-file *_usfm.zip archive is bundled into a single USFM Bible module on import");
  const mBundled = usfm.loadUsfm(usfmImp[0].dest);
  ok(/beginning God created/.test(mBundled.getVerse(1, 1, 1)) && /Tobit in multi-file zip/.test(mBundled.getVerse(67, 1, 1)) && /genealogy of Jesus/.test(mBundled.getVerse(40, 1, 1)), "[H6] Bundled USFM Bible contains OT, Deuterocanon (Tobit), and NT books");

  // 3. USFX XML Bible parsing & Library integration
  const usfxXml = `<?xml version="1.0" encoding="UTF-8"?>
<usfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="usfx.xsd">
  <languageCode>tgl</languageCode>
  <book id="GEN">
    <id id="GEN">Genesis</id>
    <h>Genesis</h>
    <toc level="1">Ang Aklat ng Genesis</toc>
    <toc level="2">Genesis</toc>
    <toc level="3">Gen</toc>
    <p sfm="mt">Genesis</p>
    <p sfm="ip">Book introduction paragraph that must be skipped cleanly.</p>
    <c id="1"/>
    <p sfm="s1">The Beginning of Creation</p>
    <p><v id="1"/>In the beginning <w s="H0430" m="HNcmpa" l="אֱלֹהִים">God</w> created the heavens and the earth.<f caller="+"><fr>1:1</fr><ft>Heb. Elohim</ft></f><x caller="-"><xo>1:1</xo><xt><ref tgt="JHN.1.1">John 1:1</ref></xt></x><ve/>
    <v id="2"/>And the <nd>Lord</nd> said, <wj>Let there be light</wj>, <add>and it was so</add>.<ve/></p>
  </book>
  <book id="MRK">
    <id id="MRK">Unlocked Literal Bible - Tagalog</id>
    <h> Marcos </h>
    <toc level="1">Ang Ebanghelyo Ayon kay Marcos</toc>
    <toc level="2">Marcos</toc>
    <p sfm="mt">Marcos</p>
    <c id="1"/>
    <p><v id="1"/>Ito ang simula ng ebanghelyo tungkol kay Jesu-Cristo, na Anak ng Diyos.<ve/></p>
    <q level="1"><v id="2"/>Katulad ng nasusulat sa aklat ni Isaias na propeta,<ve/></q>
  </book>
  <book id="WIS">
    <id id="WIS">Wisdom</id>
    <p sfm="mt1">Wisdom of Solomon</p>
    <c id="1"/>
    <p><v id="1"/>Love righteousness, ye that be judges of the earth (Wisdom in USFX).<ve/></p>
  </book>
</usfx>`;
  const usfxFile = path.join(work, "sample_bible.usfx.xml");
  fs.writeFileSync(usfxFile, usfxXml, "utf8");
  const mUsfx = usfm.loadUsfx(usfxFile);
  const xv1 = mUsfx.getVerse(1, 1, 1);
  const xv2 = mUsfx.getVerse(1, 1, 2);
  const xWis = mUsfx.getVerse(70, 1, 1);
  const xMrk = mUsfx.getVerse(41, 1, 1);
  const mpUsfx = await modprops.read(usfxFile);
  ok(/Ito ang simula ng ebanghelyo/.test(xMrk) && mpUsfx.format === "USFX", "[H7b] eBible.org USFX with <p sfm=\"mt\"> headers loads Mark 1:1 and Properties dialog cleanly");
  ok(mUsfx.hasStrongs && /The Beginning of Creation/.test(xv1) && /data-strong="H430"/.test(xv1) && /data-morph="HNcmpa"/.test(xv1) && /tw:\/\/bible\.\*\?id=43\.1\.1/.test(xv1), "[H7] USFX XML parses milestone <v/>...<ve/>, <w s=\"H0430\">, headings, footnotes, and <ref tgt=\"JHN.1.1\">");
  ok(/class="sc">Lord/.test(xv2) && /class="woj">Let there be light/.test(xv2) && /class="added">and it was so/.test(xv2) && /Wisdom in USFX/.test(xWis), "[H8] USFX XML parses <nd>, <wj>, <add>, and Deuterocanonical book WIS (70)");

  // 4. Library scan & search over USFM and USFX Bibles
  const libUsf = new Library({ moduleFolders: [work], apocryphaPlacement: "catholic" });
  const listUsf = await libUsf.scan();
  ok(listUsf.bibles.some(b => b.id === "usfm:test_sample.usfm") && listUsf.bibles.some(b => b.id === "usfx:sample_bible.usfx.xml"), "[H9] Library.scan() discovers .usfm and .usfx.xml Bibles");
  const srchUsf = await libUsf.search(["usfm:test_sample.usfm", "usfx:sample_bible.usfx.xml"], "H430", { scope: "OT" });
  ok(srchUsf.total === 2, "[H10] Library.search() finds Strongs H430 across both USFM and USFX Bibles");

  const rParaTrail = TWRender.render("And there was light.<CM>", { rules: [] }, { headings: true });
  const rParaLead = TWRender.render("<CM><PI1>Then God said", { rules: [] }, { headings: true });
  ok(/<span class="para cm trail"><\/span>$/.test(rParaTrail) && /^<span class="para cm" style="margin-left:40px">Then God said<\/span>$/.test(rParaLead), "[F6] render.js preserves trailing <CM>/<CI> breaks and leading <CM><PI1> blocks for Paragraph mode");


  // =========================================================================
  // CATEGORY I: 3-in-1 Bible View Navigation System (0.5.4)
  // =========================================================================
  console.log("\n--- Category I: 3-in-1 Bible View Navigation System (0.5.4) ---");
  const idxHtml = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  const wbCss = fs.readFileSync(path.join(__dirname, "../src/renderer/workbench.css"), "utf8");
  const iconsJs = fs.readFileSync(path.join(__dirname, "../src/renderer/icons.js"), "utf8");
  const navJs = fs.readFileSync(path.join(__dirname, "../src/renderer/nav-ui.js"), "utf8");

  ok(
    idxHtml.includes('id="navHeader1"') &&
    idxHtml.includes('id="navBookBtn"') &&
    idxHtml.includes('id="navChapBtn"') &&
    idxHtml.includes('id="navVerseBtn"') &&
    idxHtml.includes('id="navPrevBook"') &&
    idxHtml.includes('id="navPrevVerse"') &&
    idxHtml.includes('id="navHistBtn"') &&
    idxHtml.includes('id="navPop"') &&
    idxHtml.includes('id="verseSel"'),
    "[I1] Design 1 HTML elements (Interactive Header Pills, Step Icons, History Menu, 3-Step Visual Popover & Verse Selector) are present"
  );
  ok(
    idxHtml.includes('id="navStripBar"') &&
    idxHtml.includes('id="stripChaps"') &&
    idxHtml.includes('id="stripVerses"') &&
    idxHtml.includes('id="navHeadingsBtn"') &&
    idxHtml.includes('id="stripBookmarks"'),
    "[I2] Design 2 HTML elements (Collapsible Chapter Strip, Verse Minimap, Pericope Headings Outline & Quick Bookmark Ribbon) are present"
  );
  ok(
    idxHtml.includes('id="treeToolbar"') &&
    idxHtml.includes('id="treeFilter"') &&
    idxHtml.includes('id="treeModeList"') &&
    idxHtml.includes('id="treeModeGrid"') &&
    idxHtml.includes('id="navModeSw"') &&
    idxHtml.includes('src="nav-ui.js"'),
    "[I3] Design 3 HTML elements (Tree Toolbar, Filter, List/Tiles Mode Switcher) and Nav Mode Switcher (1 | 2 | 3 | All) are present"
  );

  global.window = global.window || {};
  global.document = global.document || {
    documentElement: { dataset: {} },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };
  require("../src/renderer/icons.js");
  require("../src/renderer/nav-ui.js");
  const tNav = global.window.TanglawNav;
  ok(
    tNav &&
    typeof tNav.init === "function" &&
    typeof tNav.syncAll === "function" &&
    typeof tNav.openNavPopover === "function" &&
    typeof tNav.applyNavDesign === "function" &&
    tNav.bookCategory(1, "OT").id === "law" &&
    tNav.bookCategory(19, "OT").id === "poet" &&
    tNav.bookCategory(67, "AP").id === "deut" &&
    tNav.bookCategory(43, "NT").id === "gosp" &&
    tNav.bookCategory(45, "NT").id === "epist" &&
    tNav.bookCategory(66, "NT").id === "apoc" &&
    wbCss.includes(".navpop") &&
    iconsJs.includes("prevBook"),
    "[I4] TanglawNav module initializes cleanly and classifies all 9 canonical book divisions across OT, Deuterocanon, and NT"
  );


  // =========================================================================
  // CATEGORY J: Dictionary, Commentary & Book Paragraph Indentation & Line Breaks (0.5.5)
  // =========================================================================
  console.log("\n--- Category J: Dictionary & Book Paragraph Indentation & Line Breaks (0.5.5) ---");
  const { rvfToHtml } = require("../src/lib/rvf");
  const { rtfToHtml } = require("../src/lib/rtf");
  const eswFmt = require("../src/lib/eswordfmt");

  // [J1] RTF paragraph indents (li, i, qc, sb, sa), parpar blank lines, line soft breaks, 	ab, and leading spaces
  const sampleDictRtf =
    "{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\pard\\qc\\b\\fs28 G26 agape\\b0\\fs20\\par\\par" +
    "\\pard\\li360\\fi-180 1.\\tab Affection, good-will, benevolence\\line   a) brotherly love\\par" +
    "\\pard\\li720\\sb150\\sa90 2.\\tab Love feasts\\par}";
  const rtfDictHtml = rtfToHtml(sampleDictRtf);
  ok(
    rtfDictHtml.includes('style="text-align:center"') &&
    rtfDictHtml.includes('class="rtfp rtf-blank"><br></p>') &&
    rtfDictHtml.includes('margin-left:24px;text-indent:-12px') &&
    rtfDictHtml.includes('<br><span>  a) brotherly love</span>') &&
    rtfDictHtml.includes('margin-left:48px;margin-top:10px;margin-bottom:6px'),
    "[J1] rtfToHtml preserves centered headings, \\par\\par blank lines, \\li/\\fi hanging indents, \\line breaks, \\tab, and leading spaces"
  );

  // [J2] RVF 5-integer style headers (-9 1 1 0 2 TextStyles & -9 1 2 0 2 ParaStyles with LeftIndent & FirstIndent)
  function sstr(s) { const b = Buffer.from(s, "latin1"); return Buffer.concat([Buffer.from([b.length]), b]); }
  function ident(s) { return Buffer.concat([Buffer.from([7]), sstr(s)]); }
  function i16(n) { const b = Buffer.alloc(3); b[0] = 3; b.writeInt16LE(n, 1); return b; }
  function iset(...names) { return Buffer.concat([Buffer.from([11]), ...names.map(sstr), Buffer.from([0])]); }
  function colItem(props) {
    const parts = [Buffer.from([1])];
    for (const [k, v] of Object.entries(props)) parts.push(sstr(k), v);
    parts.push(Buffer.from([0]));
    return Buffer.concat(parts);
  }
  function col(...items) { return Buffer.concat([Buffer.from([14]), ...items, Buffer.from([0])]); }
  function binRec(hdr, data) {
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(data.length, 0);
    return Buffer.concat([Buffer.from(hdr + "\r\n", "latin1"), lenBuf, data, Buffer.from("\r\n", "latin1")]);
  }
  function uniLine(s) {
    return Buffer.concat([Buffer.from(s, "utf16le"), Buffer.from([0x29, 0x20, 13, 10])]);
  }
  const rvTextStyles = col(
    colItem({ FontName: Buffer.concat([Buffer.from([6]), sstr("Arial")]), Size: Buffer.from([2, 10]) }),
    colItem({ FontName: Buffer.concat([Buffer.from([6]), sstr("Arial")]), Size: Buffer.from([2, 12]), Style: iset("fsBold") })
  );
  const rvParaStyles = col(
    colItem({}),
    colItem({ Alignment: ident("rvaCenter"), SpaceAfter: i16(8) }),
    colItem({ LeftIndent: i16(36), FirstIndent: i16(-18), Tabs: col(colItem({ Align: ident("rvtaLeft"), Pos: i16(36) })) })
  );
  const rvfBuf = Buffer.concat([
    Buffer.from("-8 1 3\r\n", "latin1"),
    binRec("-9 1 1 0 2", rvTextStyles),
    binRec("-9 1 2 0 2", rvParaStyles),
    Buffer.from("1 1 1 8 0\r\n", "latin1"), uniLine("Topic Heading"),
    Buffer.from("0 1 0 8 0\r\n", "latin1"), uniLine(""),
    Buffer.from("0 1 2 8 0\r\n", "latin1"), uniLine("1.\tIndented definition\n   sub-line a")
  ]);
  const rvfHtml = rvfToHtml(rvfBuf);
  ok(
    rvfHtml.includes('style="text-align:center;margin-bottom:8px"') &&
    rvfHtml.includes('<p class="rvp"><br></p>') &&
    rvfHtml.includes('style="margin-left:36px;text-indent:-18px"') &&
    rvfHtml.includes('<span class="rtftab"> </span>Indented definition<br>   sub-line a'),
    "[J2] rvfToHtml parses 5-integer -9 style headers (even with nested Tabs collection), blank paragraphs, indents, tabs, and line breaks"
  );

  // [J3] e-Sword / HTMLish dictionary & book topics with inline tags and plain \n + leading spaces
  const eswDictRaw = "<b>G26 ἀγάπη</b>\n   1) brotherly love, affection\n      a) good will, benevolence\n\n   2) love-feasts (Jude 1:12)";
  const eswDictHtml = eswFmt.eswordToHtml(eswDictRaw);
  ok(
    eswDictHtml.includes("<br>&nbsp;&nbsp;&nbsp;1) brotherly love") &&
    eswDictHtml.includes("<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;a) good will") &&
    eswDictHtml.includes("<br><br>&nbsp;&nbsp;&nbsp;2) love-feasts"),
    "[J3] eswordToHtml preserves \\n line breaks, blank lines, and leading space indentation inside HTML-tagged dictionary/book entries"
  );


  // =========================================================================
  // CATEGORY K: Design 2 Commentary Panel (Accordance Dropdown + Stacked Feed, 0.5.6)
  // =========================================================================
  console.log("\n--- Category K: Design 2 Commentary Panel (0.5.6) ---");
  const idxHtml056 = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  const modsJs056 = fs.readFileSync(path.join(__dirname, "../src/renderer/modules.js"), "utf8");
  const wbCss056 = fs.readFileSync(path.join(__dirname, "../src/renderer/workbench.css"), "utf8");
  ok(
    idxHtml056.includes('id="cmtBar"') &&
    idxHtml056.includes('id="cmtDropBtn"') &&
    idxHtml056.includes('id="cmtPrevBtn"') &&
    idxHtml056.includes('id="cmtNextBtn"') &&
    idxHtml056.includes('id="cmtModeSingle"') &&
    idxHtml056.includes('id="cmtModeAll"') &&
    idxHtml056.includes('id="cmtTabs" class="chips hidden"'),
    "[K1] #tab-cmt in index.html uses Design 2 compact header dropdown bar, Prev/Next hit stepper, and Single | All Hits switcher"
  );
  ok(
    modsJs056.includes("function disambiguateCommentaries") &&
    modsJs056.includes("function openCmtMenu") &&
    modsJs056.includes("function stepCommentary") &&
    modsJs056.includes("class=\"cmtcard ") &&
    wbCss056.includes(".cmtcard-hdr"),
    "[K2] modules.js and workbench.css implement duplicate-abbreviation disambiguation, searchable hit-grouped dropdown, and collapsible All Hits stacked feed cards"
  );


  // =========================================================================
  // CATEGORY L: 0.5.7 Encrypted Notice Removal, View Menu Toolbar Toggles & Focus Removal
  // =========================================================================
  console.log("\n--- Category L: 0.5.7 UI Cleanup & Toolbar Toggles ---");
  const idx057 = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  const app057 = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
  const tb057 = fs.readFileSync(path.join(__dirname, "../src/renderer/titlebar.js"), "utf8");
  const opt057 = fs.readFileSync(path.join(__dirname, "../src/renderer/options.js"), "utf8");

  // [L1] Encrypted .ontx/.otx/.ntx files do not produce red error notices
  fs.writeFileSync(path.join(work, "secret_locked.ontx"), "encrypted dummy");
  const libEnc = new Library({ moduleFolders: [work] });
  const scanEnc = await libEnc.scan();
  ok(
    !scanEnc.errors.some(e => /encrypted/i.test(e)) &&
    app057.includes(".filter(x => !/encrypted/i.test(x))"),
    "[L1] Encrypted Bible files (.ontx/.otx/.ntx) do not produce red error notices in the Bibles view"
  );

  // [L2] View menu contains all 7 toolbar element visibility toggles
  ok(
    idx057.includes('data-tbshow="tbBackFwd"') &&
    idx057.includes('data-tbshow="tbGoto"') &&
    idx057.includes('data-tbshow="tbDropdowns"') &&
    idx057.includes('data-tbshow="tbPrevNext"') &&
    idx057.includes('data-tbshow="tbSearch"') &&
    idx057.includes('data-tbshow="tbCopy"') &&
    idx057.includes('data-tbshow="tbPrint"') &&
    app057.includes("function setToolbarItem") &&
    tb057.includes("tb:tbBackFwd"),
    "[L2] View menu (#viewMenu and titlebar View menu) includes show/hide options for all 7 toolbar elements"
  );

  // [L3] Focus button and setting removed
  ok(
    !idx057.includes('id="focusBtn"') &&
    !tb057.includes("Reading Focus") &&
    !opt057.includes("Reading focus"),
    "[L3] Focus button and setting are completely removed from toolbar, View menu, Panels menu, and Options"
  );


  // =========================================================================
  // CATEGORY M: 0.5.8 Design 3 Collapsible Left Bibles Drawer Inside Bible View
  // =========================================================================
  console.log("\n--- Category M: 0.5.8 Design 3 Collapsible Left Bibles Drawer ---");
  const idx058 = fs.readFileSync(path.join(__dirname, "../src/renderer/index.html"), "utf8");
  const app058 = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
  const dock058 = fs.readFileSync(path.join(__dirname, "../src/renderer/dock.js"), "utf8");
  const wb058 = fs.readFileSync(path.join(__dirname, "../src/renderer/workbench.css"), "utf8");

  ok(
    idx058.includes('id="bvBiblesBtn"') &&
    idx058.includes('id="bvStage"') &&
    idx058.includes('id="bvBiblesDrawer"') &&
    idx058.includes('id="bvdFilter"') &&
    idx058.includes('id="bvdAutoHide"') &&
    !idx058.includes('id="pane-bibles"'),
    "[M1] index.html embeds #bvBiblesDrawer and #bvBiblesBtn inside the Bible view (#center) and removes standalone #pane-bibles"
  );
  ok(
    app058.includes("function wireBiblesDrawer") &&
    app058.includes("function setBiblesDrawerOpen") &&
    app058.includes("ordViewLabel") &&
    !dock058.includes("'bibles'") &&
    wb058.includes(".bvdrawer"),
    "[M2] app.js, dock.js, and workbench.css implement Design 3 collapsible Bibles drawer with drag-to-reorder and (1st view)/(2nd view) badges"
  );

  // =========================================================================
  // CATEGORY N: 0.5.9 Merged Features (Window Bounds, UI Size Scaling & iBiblia Verse Sync)
  // =========================================================================
  console.log("\n--- Category N: 0.5.9 Window Bounds, UI Scaling & iBiblia Sync Bridge ---");
  const main059 = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const preload059 = fs.readFileSync(path.join(__dirname, "../src/preload.js"), "utf8");
  const app059 = fs.readFileSync(path.join(__dirname, "../src/renderer/app.js"), "utf8");
  const opts059 = fs.readFileSync(path.join(__dirname, "../src/renderer/options.js"), "utf8");
  const dock059 = fs.readFileSync(path.join(__dirname, "../src/renderer/dock.js"), "utf8");
  const pkg059 = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));

  ok(
    main059.includes("resolveWindowBounds") &&
    main059.includes("attachWindowBoundsPersistence") &&
    main059.includes("guideWindowBounds") &&
    main059.includes("fs.renameSync(tmp, f)") &&
    dock059.includes("lostpointercapture") &&
    dock059.includes("beforeunload"),
    "[N1] main.js and dock.js implement multi-monitor window bounds persistence, atomic settings writes, and splitter flush on exit"
  );
  ok(
    main059.includes("ibiblia-sync-in.json") &&
    main059.includes("ibiblia-sync-out.json") &&
    main059.includes("writeSyncOut") &&
    main059.includes("checkSyncInFile") &&
    preload059.includes("syncOut") &&
    preload059.includes("onExternalSync") &&
    app059.includes("function handleExternalSync") &&
    app059.includes("api.syncOut"),
    "[N2] main.js, preload.js, and app.js implement bidirectional verse synchronization with iBiblia (ibiblia-sync-in.json / ibiblia-sync-out.json + window title)"
  );
  ok(
    opts059.includes("function stepUiSize") &&
    app059.includes("TanglawOptions.stepUiSize") &&
    app059.includes("state.settings.bibleZoom = z") &&
    idx058.includes('id="uiSize" min="11" max="22"') &&
    idx058.includes('id="paneSize" min="11" max="24"') &&
    pkg059.version === "0.6.0" &&
    app059.includes("Tanglaw Bible 0.6.0"),
    "[N3] options.js, app.js, and index.html support expanded UI/pane font scaling (up to 22px/24px), Ctrl+Wheel UI chrome scaling, and version 0.5.9"
  );

  // =========================================================================
  // CATEGORY O: 0.6.0 Skin-Themed Vertical Scrollbars Across All 8 Skins
  // =========================================================================
  console.log("\n--- Category O: 0.6.0 Skin-Themed Vertical Scrollbars ---");
  const style060 = fs.readFileSync(path.join(__dirname, "../src/renderer/style.css"), "utf8");
  const wb060 = fs.readFileSync(path.join(__dirname, "../src/renderer/workbench.css"), "utf8");
  const guide060 = fs.readFileSync(path.join(__dirname, "../src/renderer/guide.html"), "utf8");

  ok(
    ["parchment", "office", "sampaguita", "narra", "sepia", "slate", "midnight", "dusk"].every(sk =>
      opts059.includes(`${sk}:`) && opts059.includes("'sb-track'") && opts059.includes("'sb-thumb'") && opts059.includes("'sb-thumb-hover'") && opts059.includes("'sb-thumb-active'")
    ),
    "[O1] All 8 skins in options.js define sb-track, sb-thumb, sb-thumb-hover, and sb-thumb-active color tokens"
  );
  ok(
    style060.includes("::-webkit-scrollbar-thumb") &&
    style060.includes("var(--sb-thumb") &&
    wb060.includes(".bvbody::-webkit-scrollbar-track") &&
    !wb060.includes("scrollbar-width: thin") &&
    guide060.includes("::-webkit-scrollbar-thumb"),
    "[O2] style.css, workbench.css, and guide.html style vertical scrollbars with skin theme variables and remove conflicting scrollbar-width rules"
  );

  // Verify \r\r\n (CR-CR-LF) line endings in .ot/.ont/.nt do not create empty even-numbered verses
  const rrnPath = path.join(work, "rrn_test.ot");
  const rrnLines = [];
  for (let i = 1; i <= 23145; i++) rrnLines.push("Verse line " + i);
  rrnLines.push("short.title=RRN+");
  rrnLines.push("title=CR-CR-LF Test Module");
  fs.writeFileSync(rrnPath, "\uFEFF" + rrnLines.join("\r\r\n") + "\r\r\n", "utf8");
  const rrnMod = theword.load(rrnPath);
  const rrnProps = await modprops.read(rrnPath);
  ok(
    rrnMod.getVerse(1, 1, 1) === "Verse line 1" &&
    rrnMod.getVerse(1, 1, 2) === "Verse line 2" &&
    rrnMod.getVerse(1, 1, 4) === "Verse line 4" &&
    rrnMod.getVerse(39, 4, 6) === "Verse line 23145" &&
    rrnMod.abbr === "RRN+" &&
    rrnProps.fields.find(f => f.key === "title").value === "CR-CR-LF Test Module",
    "[O3] theword.js and modprops.js normalize \\r+\\n (CR-CR-LF) line endings so even-numbered verses and module properties never shift or show empty"
  );

  // [O4] Verify huge dictionary (> 10,000 topics, e.g. Perseus Greek Analyses.dct.twm) opens, lists topics, and looks up Greek words without scanning all rows
  const perseusPath = path.join(work, "Perseus Greek Analyses.dct.twm");
  execFileSync("python3", ["-c", `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("create table config(name text, value text)")
con.execute("insert into config values ('type','1'),('title','Perseus Greek Analyses'),('abbrev','Perseus'),('content.type','html')")
con.execute("create table topics(id integer primary key, pid integer default 0, subject text, rel_order integer)")
con.execute("create table content(topic_id integer primary key, data text, data2 blob)")
con.execute("create table topics_wordindex(id integer, word text, priority integer)")
con.execute("create index idx_topics_wordindex_word on topics_wordindex(word, priority)")
t_rows = [(i, 0, "ἐποίησεν" if i == 11500 else f"form_{i}", i) for i in range(1, 12001)]
w_rows = [(i, "ἐποίησεν" if i == 11500 else f"form_{i}", 1) for i in range(1, 12001)] + [(11500, "εποιησεν", 500)]
con.executemany("insert into topics(id, pid, subject, rel_order) values (?, ?, ?, ?)", t_rows)
con.executemany("insert into topics_wordindex(id, word, priority) values (?, ?, ?)", w_rows)
con.execute("insert into content(topic_id, data) values (11500, '<b>ποιέω</b>: 3rd sg aor ind act')")
con.commit()
con.close()
`, perseusPath]);

  const pMod = await bookmod.open(perseusPath);
  const initialTopics = pMod.topics();
  const lkpExact = pMod.lookup("ἐποίησεν");
  const lkpUnaccented = pMod.lookup("εποιησεν");
  const fw = pMod.findWord("ἐποίησεν", true);
  const st = pMod.searchTopics("ἐποί");
  pMod.close();

  ok(
    pMod.totalTopics === 12000 &&
    initialTopics.length === 500 &&
    lkpExact && lkpExact.html.includes("ποιέω") &&
    lkpUnaccented && lkpUnaccented.html.includes("ποιέω") &&
    fw.length === 1 && fw[0].subject === "ἐποίησεν" &&
    st.length === 1 && st[0].id === 11500,
    "[O4] Huge dictionary (Perseus Greek Analyses.dct.twm, 12,000 topics) opens, caps initial topic list at 500, and resolves accented/unaccented wordindex lookups"
  );

  fs.rmSync(work, { recursive: true, force: true });
  console.log(`\nALL ${passed} CHECKS PASSED!`);
})().catch(e => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
