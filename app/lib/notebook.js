/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "My Learnings": the user's verse notes gathered by their topic, shown as a dictionary that is always up to date.
// A note is kept per verse in the study data:  notes{"b.c.v": {topic, stmt, html, t}}
//   topic  level 1, a short name ("Faith", "Holy Spirit")
//   stmt   level 2, one sentence that sums the note up
//   html   level 3, the explanation (what was learned from the verse)
// Notes made before 0.6.51 have no topic; they are left out of My Learnings until they get one.
const canon = require('./canon');

const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = h => String(h || '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
/** the form a topic is compared in: case, accents and extra spaces do not matter */
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const idOf = t => 't:' + norm(t);
function refName(b, c, v) { let n; try { n = canon.book(b).name; } catch (e) { n = 'Book ' + b; } return `${n} ${c}:${v}`; }

/** notes with a topic, grouped by topic: [{ id, topic, items: [{ k, b, c, v, ref, stmt, html, t }] }] in alphabetical order */
function group(notes) {
  const by = new Map();
  for (const [k, n] of Object.entries(notes || {})) {
    if (!n || !String(n.topic || '').trim()) continue;
    const [b, c, v] = k.split('.').map(Number); if (!b || !c || !v) continue;
    const id = idOf(n.topic);
    let g = by.get(id);
    if (!g) by.set(id, g = { id, topic: String(n.topic).replace(/\s+/g, ' ').trim(), items: [], newest: 0 });
    if ((n.t || 0) > g.newest) { g.newest = n.t || 0; g.topic = String(n.topic).replace(/\s+/g, ' ').trim(); }   // the spelling used last names the topic
    g.items.push({ k, b, c, v, ref: refName(b, c, v), stmt: String(n.stmt || '').trim(), html: String(n.html || ''), t: n.t || 0 });
  }
  const out = [...by.values()];
  for (const g of out) g.items.sort((x, y) => canon.orderKey(x.b) - canon.orderKey(y.b) || x.b - y.b || x.c - y.c || x.v - y.v);
  return out.sort((a, z) => norm(a.topic).localeCompare(norm(z.topic)));
}

/** the page of one topic: each note as its statement, its verse (a link) and its explanation */
function topicHtml(g) {
  const parts = g.items.map(it => `<h3>${E(it.stmt || it.ref)}</h3><p class="nbref"><a class="link" data-href="tw://bible.*?id=${it.b}.${it.c}.${it.v}">${E(it.ref)}</a></p>${it.html.trim() ? `<div class="nbbody">${it.html}</div>` : ''}`);
  return `<p class="small">${g.items.length} note${g.items.length === 1 ? '' : 's'}</p>${parts.join('<hr>')}`;
}

/** a dictionary module made from the notes, read fresh on every call (getNotes gives the current notes) */
function makeModule(getNotes) {
  const groups = () => group(getNotes() || {});
  const find = id => groups().find(g => g.id === id);
  const mod = {
    locked: false, kind: 'dictionary', format: 'Timotheos', title: 'My Learnings', abbr: 'MyLearn', user: false, notebook: true,
    description: 'Your verse notes, gathered by topic. It grows as you add notes with a topic.',
    author: '', about: '<p><b>My Learnings</b> is made from your own verse notes. Each topic lists the notes you gave it: the short statement, the verse, and your explanation.</p><p>Add to it by writing a note on a verse (Topic, Statement, Explanation). To share it, use <b>Export as a dictionary (.dct.twm)</b> in My notes.</p>',
    get totalTopics() { return groups().length; },
    topics: () => groups().map(g => ({ id: g.id, pid: 0, subject: g.topic })),
    topic(id) { const g = find(id); return g ? { id, subject: g.topic, html: topicHtml(g) } : null; },
    /** topics whose name, or one of whose statements, has the typed text; a statement hit is shown as "Topic: statement" */
    searchTopics(q, limit = 300) {
      const l = norm(q); if (!l) return mod.topics().slice(0, limit);
      const head = [], name = [], stmt = [];
      for (const g of groups()) {
        const t = norm(g.topic);
        if (t.startsWith(l)) head.push({ id: g.id, pid: 0, subject: g.topic });
        else if (t.includes(l)) name.push({ id: g.id, pid: 0, subject: g.topic });
        else { const it = g.items.find(x => norm(x.stmt).includes(l)); if (it) stmt.push({ id: g.id, pid: 0, subject: `${g.topic}: ${it.stmt}` }); }
      }
      return head.concat(name, stmt).slice(0, limit);
    },
    lookup(key) { return mod.topic(idOf(key)); },
    findWord(w) { const g = find(idOf(w)); return g ? [{ id: g.id, subject: g.topic, exact: true }] : []; },
    forVerse: () => null, verseMarks: () => new Set(), today: () => [],
    *texts() { for (const g of groups()) yield { id: g.id, subject: g.topic, text: g.items.map(it => `${it.stmt}\n${it.ref}\n${plain(it.html)}`).join('\n\n') }; },
    close() {},
  };
  return mod;
}

module.exports = { group, topicHtml, makeModule, norm, plain, NOTEBOOK_ID: 'nb:My Learnings' };
