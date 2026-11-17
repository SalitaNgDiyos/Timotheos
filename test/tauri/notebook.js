// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// a verse note asks for Topic, Statement and Explanation; My notes lists them by topic with a filter; My Learnings is a dictionary of them
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const S = TimotheosStudy.study, modal = () => !document.querySelector('#modal').classList.contains('hidden');
  const btn = label => [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === label);
  const fill = (topic, stmt, body) => { $('#nTopic').value = topic; $('#nStmt').value = stmt; $('#noteEd').innerHTML = body; };
  // 1. a new note: the three boxes
  TimotheosStudy.editNote('43.3.16'); await sleep(300);
  ok(modal() && $('#nTopic') && $('#nStmt') && $('#noteEd'), 'the note form has Topic, Statement, Explanation');
  ok(document.activeElement && document.activeElement.id === 'nTopic', 'the cursor starts in Topic');
  // no topic: asked again, nothing saved
  fill('', 'God loved the world.', 'He gave'); btn('Save').click(); await sleep(300);
  ok(modal() && /Give the note a topic/.test($('#modalBody').textContent) && !S.ud.notes['43.3.16'], 'a topic is required');
  ok($('#nStmt').value === 'God loved the world.' && /He gave/.test($('#noteEd').innerHTML), 'what was typed is kept');
  // topic but no statement
  fill('love', '', 'He gave His only Son'); btn('Save').click(); await sleep(300);
  ok(modal() && /Write a statement/.test($('#modalBody').textContent), 'a statement is required');
  fill('love', 'God loved the world first.', 'He gave His only Son (Rom 5:8).'); btn('Save').click(); await sleep(400);
  const n1 = S.ud.notes['43.3.16'];
  ok(!modal() && n1 && n1.topic === 'Love' && n1.stmt === 'God loved the world first.' && /He gave/.test(n1.html), 'saved; a new topic starts with a capital: ' + JSON.stringify(n1));
  // more notes, the same topic typed in another case keeps the first spelling
  TimotheosStudy.editNote('62.4.8'); await sleep(300);
  ok([...document.querySelectorAll('#nTopicList option')].some(o => o.value === 'Love'), 'Topic suggests the topics used so far');
  fill('LOVE', 'God is love.', ''); btn('Save').click(); await sleep(400);
  ok(S.ud.notes['62.4.8'] && S.ud.notes['62.4.8'].topic === 'Love', 'an existing topic keeps its spelling');
  TimotheosStudy.editNote('58.11.1'); await sleep(300); fill('Faith', 'Faith is the substance of things hoped for.', 'Assurance'); btn('Save').click(); await sleep(400);
  // too many words in Topic
  TimotheosStudy.editNote('45.5.5'); await sleep(300);
  const t = $('#nTopic'); t.value = 'one two three four five six'; t.dispatchEvent(new Event('input')); ok(t.value === 'one two three four', 'Topic takes up to 4 words');
  btn('Cancel').click(); await sleep(200);
  // an old note without a topic can still be saved without one
  S.ud.notes['1.1.1'] = { html: '<p>Old note</p>', t: 1 };
  TimotheosStudy.editNote('1.1.1'); await sleep(300); btn('Save').click(); await sleep(400);
  ok(!modal() && S.ud.notes['1.1.1'] && /Old note/.test(S.ud.notes['1.1.1'].html), 'an old note saves without a topic');
  // 2. My notes, by topic, with a filter
  const box = document.createElement('div'); document.body.appendChild(box);
  S.seg = 'notes'; S.notesView = 'topic'; S.notesQ = '';
  const rn = () => { const b = document.createElement('div'); box.replaceChildren(b); return b; };
  // renderNotesList is internal: go through renderStudy's body when present, else call through the seg
  TimotheosStudy.onOpen(); await sleep(400);
  const body = document.querySelector('#studyBody');
  const H = () => [...body.querySelectorAll('.ntopicgrp h4')].map(h => h.firstChild.textContent.trim());
  ok(body && H().join('|') === 'Faith|Love|Without a topic', 'by topic, A–Z, untitled last: ' + (body ? H().join('|') : 'no body'));
  const f = body.querySelector('#nFilter'); f.value = 'substance'; f.dispatchEvent(new Event('input')); await sleep(50);
  ok(H().join('|') === 'Faith', 'the filter finds a statement: ' + H().join('|'));
  f.value = 'lov'; f.dispatchEvent(new Event('input')); await sleep(50);
  ok(H().join('|') === 'Love' && body.querySelectorAll('.ntopicgrp li').length === 2, 'the filter finds a topic with all its notes');
  f.value = ''; f.dispatchEvent(new Event('input'));
  body.querySelector('[data-view="verse"]').click(); await sleep(100);
  ok(body.querySelectorAll('.nlist li').length === 4 && body.querySelector('.ntag'), 'by verse, with the topic as a tag');
  body.querySelector('[data-view="topic"]').click(); await sleep(100);
  // 3. My Learnings in the Library
  await sleep(500);
  const d = (state.allModules.dicts || state.modules.dicts || []).find(x => x.id === 'nb:My Learnings');
  ok(!!d, 'My Learnings is listed with the dictionaries');
  const tops = await api.bookTopics('nb:My Learnings');
  ok(tops.map(x => x.subject).join('|') === 'Faith|Love', 'its topics: ' + tops.map(x => x.subject).join('|'));
  const pg = await api.bookTopic('nb:My Learnings', tops[1].id);
  ok(/God loved the world first/.test(pg.html) && /God is love/.test(pg.html) && /John 3:16/.test(pg.html), 'a topic page shows its statements and verses');
  const sr = await api.bookSearch('nb:My Learnings', 'substance');
  ok(sr.length === 1 && /^Faith: /.test(sr[0].subject), 'searching a statement finds its topic');
  body.querySelector('#openEncBtn').click(); await sleep(1200);
  console.log('RESULT ' + out.join(' | '));
})();
