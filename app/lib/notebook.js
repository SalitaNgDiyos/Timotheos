/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "My Learnings": the user's verse notes gathered by their topic, shown as a dictionary that is always up to date.
// A note is kept per verse in the study data:  notes{"b.c.v": {topic, stmt, html, t}}
//   topic  level 1, a short name ("Faith", "Holy Spirit")
//   subs   level 2, up to 4 subtopics ("Faith", "Grace"); `stmt` keeps the first one for older versions
//   html   level 3, the explanation (what was learned from the verse)
// Notes made before 0.6.51 have no topic; they are left out of My Learnings until they get one.
const canon = require('./canon');

const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = h => String(h || '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
/** the form a topic is compared in: case, accents and extra spaces do not matter */
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const idOf = t => 't:' + norm(t);
function refName(b, c, v) { let n; try { n = canon.book(b).name; } catch (e) { n = 'Book ' + b; } return `${n} ${c}:${v}`; }

/** the sub-topics of a note (up to 4). Notes saved as 0.6.51 / 0.6.52 had one "statement": it counts as the first sub-topic. */
function subsOf(n) {
  const raw = Array.isArray(n && n.subs) && n.subs.length ? n.subs : (n && n.stmt ? [n.stmt] : []);
  const out = [], seen = new Set();
  for (const x of raw) { const t = String(x || '').replace(/\s+/g, ' ').trim(); if (t && !seen.has(norm(t))) { seen.add(norm(t)); out.push(t); } }
  return out.slice(0, 4);
}
const subId = (topic, sub) => 't:' + norm(topic) + '|' + norm(sub);

/** notes with a topic, grouped by topic and then by sub-topic:
 *  [{ id, topic, items: [note], subs: [{ id, sub, items: [note] }] }] alphabetical; note = { k, b, c, v, ref, subs, html, t } */
function group(notes) {
  const by = new Map();
  for (const [k, n] of Object.entries(notes || {})) {
    if (!n || !String(n.topic || '').trim()) continue;
    const [b, c, v] = k.split('.').map(Number); if (!b || !c || !v) continue;
    const id = idOf(n.topic);
    let g = by.get(id);
    if (!g) by.set(id, g = { id, topic: String(n.topic).replace(/\s+/g, ' ').trim(), items: [], newest: 0, sm: new Map() });
    if ((n.t || 0) > g.newest) { g.newest = n.t || 0; g.topic = String(n.topic).replace(/\s+/g, ' ').trim(); }   // the spelling used last names the topic
    const it = { k, b, c, v, ref: refName(b, c, v), subs: subsOf(n), html: String(n.html || ''), t: n.t || 0 };
    g.items.push(it);
    for (const sub of it.subs) {
      const sid = norm(sub); let sg = g.sm.get(sid);
      if (!sg) g.sm.set(sid, sg = { sub, items: [], newest: 0 });
      if (it.t >= sg.newest) { sg.newest = it.t; sg.sub = sub; }
      sg.items.push(it);
    }
  }
  const order = (x, y) => canon.orderKey(x.b) - canon.orderKey(y.b) || x.b - y.b || x.c - y.c || x.v - y.v;
  const out = [...by.values()];
  for (const g of out) {
    g.items.sort(order);
    g.subs = [...g.sm.values()].map(sg => ({ id: subId(g.topic, sg.sub), sub: sg.sub, items: sg.items.sort(order) })).sort((a, z) => norm(a.sub).localeCompare(norm(z.sub)));
    delete g.sm;
  }
  return out.sort((a, z) => norm(a.topic).localeCompare(norm(z.topic)));
}

const verseLink = it => `<a class="link" data-href="tw://bible.*?id=${it.b}.${it.c}.${it.v}">${E(it.ref)}</a>`;
const noteHtml = it => `<p class="nbref">${verseLink(it)}</p>${it.html.trim() ? `<div class="nbbody">${it.html}</div>` : ''}`;
/** the page of a topic: its sub-topics, and under each one the notes with their verses and explanations */
function topicHtml(g) {
  const parts = g.subs.map(sg => `<h3>${E(sg.sub)}</h3>${sg.items.map(noteHtml).join('<hr>')}`);
  const bare = g.items.filter(it => !it.subs.length);
  if (bare.length) parts.push(`<h3>Notes</h3>${bare.map(noteHtml).join('<hr>')}`);
  return `<p class="small">${g.items.length} note${g.items.length === 1 ? '' : 's'}${g.subs.length ? ` · ${g.subs.length} subtopic${g.subs.length === 1 ? '' : 's'}: ${g.subs.map(x => E(x.sub)).join(', ')}` : ''}</p>${parts.join('')}`;
}
/** the page of one sub-topic of a topic */
function subHtml(g, sg) {
  const also = g.subs.filter(x => x !== sg).map(x => E(x.sub));
  return `<p class="small">${sg.items.length} note${sg.items.length === 1 ? '' : 's'} on ${E(sg.sub)} under ${E(g.topic)}${also.length ? ` · also under ${E(g.topic)}: ${also.join(', ')}` : ''}</p>${sg.items.map(noteHtml).join('<hr>')}`;
}

/** a dictionary module made from the notes, read fresh on every call (getNotes gives the current notes) */
function makeModule(getNotes) {
  const groups = () => group(getNotes() || {});
  const find = id => { for (const g of groups()) { if (g.id === id) return { g }; const sg = g.subs.find(x => x.id === id); if (sg) return { g, sg }; } return null; };
  const entries = () => { const o = []; for (const g of groups()) { o.push({ id: g.id, pid: 0, subject: g.topic }); for (const sg of g.subs) o.push({ id: sg.id, pid: g.id, subject: sg.sub }); } return o; };
  const mod = {
    locked: false, kind: 'dictionary', format: 'Timotheos', title: 'My Learnings', abbr: 'MyLearn', user: false, notebook: true,
    description: 'Your verse notes, gathered by topic and subtopic. It grows as you add notes.',
    author: '', about: '<p><b>My Learnings</b> is made from your own verse notes. Each topic lists its subtopics, and under each subtopic the verses you wrote about and your explanations.</p><p>Add to it by writing a note on a verse (Topic, Subtopics, Explanation). To share it, use <b>Export as a dictionary (.dct.twm)</b> in My notes.</p>',
    get totalTopics() { return groups().length; },
    topics: entries,
    topic(id) { const f = find(id); if (!f) return null; return f.sg ? { id, subject: `${f.g.topic} › ${f.sg.sub}`, html: subHtml(f.g, f.sg) } : { id, subject: f.g.topic, html: topicHtml(f.g) }; },
    /** topics and subtopics with the typed text; a subtopic hit is shown as "Topic › Subtopic" */
    searchTopics(q, limit = 300) {
      const l = norm(q); if (!l) return groups().map(g => ({ id: g.id, pid: 0, subject: g.topic })).slice(0, limit);
      const head = [], name = [], sub = [];
      for (const g of groups()) {
        const t = norm(g.topic);
        if (t.startsWith(l)) head.push({ id: g.id, pid: 0, subject: g.topic });
        else if (t.includes(l)) name.push({ id: g.id, pid: 0, subject: g.topic });
        for (const sg of g.subs) if (norm(sg.sub).includes(l)) sub.push({ id: sg.id, pid: 0, subject: `${g.topic} › ${sg.sub}` });
      }
      return head.concat(name, sub).slice(0, limit);
    },
    lookup(key) { return mod.topic(idOf(key)); },
    findWord(w) { const g = find(idOf(w)); return g && !g.sg ? [{ id: g.g.id, subject: g.g.topic, exact: true }] : []; },
    forVerse: () => null, verseMarks: () => new Set(), today: () => [],
    *texts() { for (const g of groups()) yield { id: g.id, subject: g.topic, text: g.subs.map(sg => sg.sub).join(', ') + '\n' + g.items.map(it => `${it.subs.join(', ')}\n${it.ref}\n${plain(it.html)}`).join('\n\n') }; },
    close() {},
  };
  return mod;
}

module.exports = { group, topicHtml, subHtml, subsOf, subId, makeModule, norm, plain, NOTEBOOK_ID: 'nb:My Learnings' };
