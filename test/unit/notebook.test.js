/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/notebook.test.js — notes with Topic / Statement / Explanation become "My Learnings" (a live dictionary) and export as a .dct.twm
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const notebook = require('../../app/lib/notebook'), usermod = require('../../app/lib/usermod'), bookmod = require('../../app/lib/bookmod');
const { Library } = require('../../app/lib/library');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  const notes = {
    '43.3.16': { topic: 'Love', stmt: 'God loved the world first.', html: '<p>He gave His Son.</p>', t: 3 },
    '62.4.8': { topic: 'love', stmt: 'God is love.', html: '', t: 5 },
    '58.11.1': { topic: 'Faith', stmt: 'Faith is the substance of things hoped for.', html: '<p>Assurance.</p>', t: 2 },
    '1.1.1': { html: '<p>An old note without a topic.</p>', t: 1 },
    '45.5.8': { topic: 'Holy Spirit', stmt: 'The love of God is poured out by the Spirit.', html: '<b>Romans</b>', t: 4 },
  };
  const g = notebook.group(notes);
  ok(g.map(x => x.topic).join('|') === 'Faith|Holy Spirit|love', 'topics A–Z, one per name whatever the case, the newest spelling: ' + g.map(x => x.topic));
  ok(g[2].items.length === 2 && g[2].items[0].k === '43.3.16' && g[2].items[1].k === '62.4.8', 'notes of a topic in Bible order');
  ok(!g.some(x => x.items.some(i => i.k === '1.1.1')), 'a note without a topic is left out');
  let cur = notes; const m = notebook.makeModule(() => cur);
  ok(m.kind === 'dictionary' && m.totalTopics === 3, 'a dictionary of 3 topics');
  const t = m.topic(m.topics()[2].id);
  ok(/2 notes/.test(t.html) && /God loved the world first\./.test(t.html) && /tw:\/\/bible\.\*\?id=43\.3\.16/.test(t.html) && /He gave His Son/.test(t.html), 'topic page: statement, verse link, explanation');
  ok(m.searchTopics('lo')[0].subject === 'love', 'filter: topic names');
  const s = m.searchTopics('substance'); ok(s.length === 1 && s[0].subject === 'Faith: Faith is the substance of things hoped for.', 'filter: a statement finds its topic: ' + JSON.stringify(s));
  ok(m.searchTopics('poured')[0].subject.startsWith('Holy Spirit:'), 'statement under another topic');
  ok(m.lookup('LOVE') && m.findWord('faith').length === 1, 'word lookup finds a topic');
  cur = Object.assign({}, notes, { '19.23.1': { topic: 'Shepherd', stmt: 'The Lord leads.', html: '', t: 9 } });
  ok(m.totalTopics === 4 && m.topics().some(x => x.subject === 'Shepherd'), 'live: a new note shows at once');
  ok([...m.texts()].find(x => x.subject === 'Faith').text.includes('Assurance.'), 'texts for Book search');
  // the library lists it with the dictionaries and never treats it as a file
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-'));
  const lib = new Library({ moduleFolders: [dir] }, {});
  lib.setNotebook(() => cur); await lib.scan();
  const L = lib.list(); const d = L.dicts.find(x => x.id === notebook.NOTEBOOK_ID);
  ok(d && d.title === 'My Learnings' && d.totalTopics === 4 && d.notebook && !d.imported, 'listed as a dictionary: ' + JSON.stringify(d));
  ok((await lib.bookTopics(notebook.NOTEBOOK_ID)).length === 4 && (await lib.bookSearch(notebook.NOTEBOOK_ID, 'shep')).length === 1, 'opened through the library');
  assert.throws(() => lib.fileOf(notebook.NOTEBOOK_ID)); n++;
  lib.release(''); lib.releaseUnder(dir); ok((await lib.bookTopics(notebook.NOTEBOOK_ID)).length === 4, 'releasing files leaves it alone');
  // export as a theWord dictionary, which Timotheos reads back
  const f = path.join(dir, 'Enc.dct.twm');
  const r = await usermod.exportNotebookToDictionary(cur, f, { title: 'My Enc', abbr: 'ME' });
  ok(r.count === 4 && r.notes === 5, 'exported 4 topics, 5 notes: ' + JSON.stringify(r));
  const back = await bookmod.open(f);
  ok(back.kind === 'dictionary' && back.title === 'My Enc', 'the file is a dictionary: ' + back.kind);
  const tl = back.topics(); ok(tl.map(x => x.subject).join('|') === 'Faith|Holy Spirit|love|Shepherd', 'its entries: ' + tl.map(x => x.subject));
  const fe = back.topic(tl[0].id); ok(/substance of things hoped for/.test(fe.html) && /Hebrews 11:1/.test(fe.html) && /Assurance/.test(fe.html), 'an entry holds statement, verse and explanation');
  back.close();
  // the commentary export now starts each note with its topic and statement
  const cf = path.join(dir, 'N.cmt.twm'); await usermod.exportNotesToCommentary(cur, cf, {});
  const cm = await bookmod.open(cf); const hit = cm.forVerse(43, 3, 16); ok(/Love|love/.test(cm.topic(hit.id).html) && /God loved the world first/.test(cm.topic(hit.id).html), 'commentary export keeps topic and statement'); cm.close();
  console.log(`notebook: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
