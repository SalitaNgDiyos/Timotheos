/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// node test/unit/notebook.test.js — notes with Topic / Subtopics / Explanation become "My Learnings" (a live dictionary) and export as a .dct.twm
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const notebook = require('../../app/lib/notebook'), usermod = require('../../app/lib/usermod'), bookmod = require('../../app/lib/bookmod');
const { Library } = require('../../app/lib/library');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
(async () => {
  const notes = {
    '43.3.16': { topic: 'Love', subs: ['Faith', 'Giving'], html: '<p>He gave His Son.</p>', t: 3 },
    '62.4.8': { topic: 'love', subs: ['God'], html: '', t: 5 },
    '58.11.1': { topic: 'Faith', subs: ['Assurance'], html: '<p>Hoped for.</p>', t: 2 },
    '1.1.1': { html: '<p>An old note without a topic.</p>', t: 1 },
    '45.5.8': { topic: 'Holy Spirit', stmt: 'Poured out by the Spirit.', html: '<b>Romans</b>', t: 4 },   // a 0.6.51 note: the statement counts as the subtopic
    '46.13.13': { topic: 'Love', subs: ['faith', 'Hope', 'Faith', 'Greatest', 'A fifth'], html: '<p>Three remain.</p>', t: 6 },
  };
  ok(notebook.subsOf(notes['46.13.13']).join('|') === 'faith|Hope|Greatest|A fifth' && notebook.subsOf(notes['45.5.8']).join('|') === 'Poured out by the Spirit.', 'subtopics: at most 4, no repeats, the old statement counts');
  const g = notebook.group(notes);
  ok(g.map(x => x.topic).join('|') === 'Faith|Holy Spirit|Love', 'topics A–Z, one per name whatever the case, the newest spelling: ' + g.map(x => x.topic));
  const love = g[2];
  ok(love.items.map(i => i.k).join(' ') === '43.3.16 46.13.13 62.4.8', 'notes of a topic in Bible order');
  ok(love.subs.map(x => x.sub).join('|') === 'faith|Giving|God|Greatest|Hope|A fifth'.split('|').sort((a, z) => a.toLowerCase().localeCompare(z.toLowerCase())).join('|'), 'its subtopics A–Z: ' + love.subs.map(x => x.sub));
  const fs1 = love.subs.find(x => x.sub.toLowerCase() === 'faith'); ok(fs1.items.length === 2, 'the same subtopic from two verses (Faith in John 3:16 and 1 Cor 13:13) is one subtopic with both notes');
  ok(!g.some(x => x.items.some(i => i.k === '1.1.1')), 'a note without a topic is left out');
  let cur = notes; const m = notebook.makeModule(() => cur);
  ok(m.kind === 'dictionary' && m.totalTopics === 3, 'a dictionary of 3 topics');
  const all = m.topics(), tl0 = all.filter(x => !x.pid), kids = all.filter(x => x.pid);
  ok(tl0.length === 3 && kids.length === 6 + 1 + 1 && kids.every(x => tl0.some(t => t.id === x.pid)), 'the subtopics are children of their topic: ' + all.length);
  const t = m.topic(tl0[2].id);
  ok(/3 notes/.test(t.html) && /<h3>Giving<\/h3>/.test(t.html) && /tw:\/\/bible\.\*\?id=43\.3\.16/.test(t.html) && /He gave His Son/.test(t.html), 'topic page: subtopics, verse links, explanations');
  const sp = m.topic(fs1.id); ok(/Love › (f|F)aith/.test(sp.subject) && /Three remain/.test(sp.html) && /He gave His Son/.test(sp.html) && /also under Love/.test(sp.html), 'subtopic page: the notes of every verse, and the other subtopics of the topic: ' + sp.subject);
  ok(m.searchTopics('lo')[0].subject === 'Love', 'filter: topic names');
  const s = m.searchTopics('assur'); ok(s.length === 1 && s[0].subject === 'Faith › Assurance', 'filter: a subtopic finds it with its topic: ' + JSON.stringify(s));
  ok(m.searchTopics('poured')[0].subject === 'Holy Spirit › Poured out by the Spirit.', 'an old statement is a subtopic');
  ok(m.lookup('LOVE') && m.findWord('faith').length === 1, 'word lookup finds a topic');
  cur = Object.assign({}, notes, { '19.23.1': { topic: 'Shepherd', subs: ['Leading'], html: '', t: 9 } });
  ok(m.totalTopics === 4 && m.topics().some(x => x.subject === 'Shepherd') && m.topics().some(x => x.subject === 'Leading'), 'live: a new note shows at once');
  ok([...m.texts()].find(x => x.subject === 'Faith').text.includes('Hoped for.'), 'texts for Book search');
  // the library lists it with the dictionaries and never treats it as a file
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nb-'));
  const lib = new Library({ moduleFolders: [dir] }, {});
  lib.setNotebook(() => cur); await lib.scan();
  const L = lib.list(); const d = L.dicts.find(x => x.id === notebook.NOTEBOOK_ID);
  ok(d && d.title === 'My Learnings' && d.totalTopics === 4 && d.notebook && !d.imported, 'listed as a dictionary: ' + JSON.stringify(d));
  ok((await lib.bookTopics(notebook.NOTEBOOK_ID)).length === 13 && (await lib.bookSearch(notebook.NOTEBOOK_ID, 'lead')).length === 1, 'opened through the library');
  assert.throws(() => lib.fileOf(notebook.NOTEBOOK_ID)); n++;
  lib.release(''); lib.releaseUnder(dir); ok((await lib.bookTopics(notebook.NOTEBOOK_ID)).length === 13, 'releasing files leaves it alone');
  // export as a theWord dictionary, which Timotheos reads back
  const f = path.join(dir, 'Learn.dct.twm');
  const r = await usermod.exportNotebookToDictionary(cur, f, { title: 'My Learn', abbr: 'ML' });
  ok(r.count === 4 && r.notes === 6 && r.subs === 9, 'exported 4 topics, 9 subtopics, 6 notes: ' + JSON.stringify(r));
  const back = await bookmod.open(f);
  ok(back.kind === 'dictionary' && back.title === 'My Learn', 'the file is a dictionary: ' + back.kind);
  const tl = back.topics(); ok(tl.filter(x => !x.pid).map(x => x.subject).join('|') === 'Faith|Holy Spirit|Love|Shepherd' && tl.length === 13, 'its entries: topics with subtopics under them: ' + tl.length);
  const fe = back.topic(tl.find(x => x.subject === 'Faith').id); ok(/Assurance/.test(fe.html) && /Hebrews 11:1/.test(fe.html) && /Hoped for/.test(fe.html), 'an entry holds subtopics, verses and explanations');
  const sub = tl.find(x => x.pid && x.subject.toLowerCase() === 'faith' && tl.find(y => y.id === x.pid).subject === 'Love'); ok(sub && /Three remain/.test(back.topic(sub.id).html), 'a subtopic is its own entry');
  back.close();
  // the commentary export now starts each note with its topic and statement
  const cf = path.join(dir, 'N.cmt.twm'); await usermod.exportNotesToCommentary(cur, cf, {});
  const cm = await bookmod.open(cf); const hit = cm.forVerse(43, 3, 16); ok(/Love/.test(cm.topic(hit.id).html) && /Faith, Giving/.test(cm.topic(hit.id).html), 'commentary export keeps topic and subtopics'); cm.close();
  console.log(`notebook: ${n} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
