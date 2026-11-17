// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// a verse note asks for Topic, Statement and Explanation; My notes lists them by topic with a filter; My Learnings is a dictionary of them
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const S = TimotheosStudy.study, modal = () => !document.querySelector('#modal').classList.contains('hidden');
  const btn = label => [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === label);
  const fill = (topic, subs, body) => { $('#nTopic').value = topic; $('#nTopic').dispatchEvent(new Event('input')); const bx = [...document.querySelectorAll('#nSubs .nSub')]; subs.forEach((v, i) => { while (document.querySelectorAll('#nSubs .nSub').length <= i) $('#nAddSub').click(); const el = document.querySelectorAll('#nSubs .nSub')[i]; el.value = v; el.dispatchEvent(new Event('input')); }); $('#noteEd').innerHTML = body; };
  // 1. a new note: topic, subtopic, explanation
  TimotheosStudy.editNote('43.3.16'); await sleep(300);
  ok(modal() && $('#nTopic') && document.querySelectorAll('#nSubs .nSub').length === 1 && $('#nAddSub') && $('#noteEd'), 'the note form has Topic, one Subtopic, "Add a subtopic", Explanation');
  ok(!/Statement/.test($('#modalBody').textContent), 'the word Statement is gone');
  ok(document.activeElement && document.activeElement.id === 'nTopic', 'the cursor starts in Topic');
  fill('', ['Faith'], 'He gave'); btn('Save').click(); await sleep(300);
  ok(modal() && /Give the note a topic/.test($('#modalBody').textContent) && !S.ud.notes['43.3.16'], 'a topic is required');
  ok($('.nSub').value === 'Faith' && /He gave/.test($('#noteEd').innerHTML), 'what was typed is kept');
  fill('love', [''], 'He gave His only Son'); btn('Save').click(); await sleep(300);
  ok(modal() && /Add a subtopic/.test($('#modalBody').textContent), 'a subtopic is required');
  // up to 4 subtopics: the button goes away at 4
  fill('love', ['faith', 'Giving', 'Gift', 'Son'], 'He gave His only Son (Rom 5:8).');
  ok(document.querySelectorAll('#nSubs .nSub').length === 4 && $('#nAddSub').hidden, 'at most 4 subtopics; the add button hides at 4');
  document.querySelectorAll('#nSubs .nsubx')[2].click(); await sleep(50);
  ok(document.querySelectorAll('#nSubs .nSub').length === 3 && !$('#nAddSub').hidden, 'a subtopic can be removed');
  btn('Save').click(); await sleep(400);
  const n1 = S.ud.notes['43.3.16'];
  ok(!modal() && n1 && n1.topic === 'Love' && n1.subs.join('|') === 'Faith|Giving|Gift' && n1.stmt === 'Faith', 'saved; capitals on new names: ' + JSON.stringify(n1));
  // the next note on the same topic offers what was used before
  TimotheosStudy.editNote('62.4.8'); await sleep(300);
  fill('LOVE', [''], ''); await sleep(100);
  const chips = [...document.querySelectorAll('#nPrev .nchip')].map(c => c.dataset.sub).sort().join('|');
  ok(chips === 'Faith|Gift|Giving', 'typing the topic shows its earlier subtopics as buttons: ' + chips);
  document.querySelector('#nPrev .nchip[data-sub="Faith"]').click(); await sleep(50);
  ok($('.nSub').value === 'Faith' && ![...document.querySelectorAll('#nPrev .nchip')].some(c => c.dataset.sub === 'Faith'), 'a button puts it in a subtopic box');
  const dl = [...document.querySelectorAll('#nSubList option')].map(o => o.value).sort().join('|'); ok(dl === 'Faith|Gift|Giving', 'the subtopic boxes suggest them too');
  $('#nAddSub').click(); const two = document.querySelectorAll('#nSubs .nSub')[1]; two.value = 'god'; two.dispatchEvent(new Event('input'));
  btn('Save').click(); await sleep(400);
  ok(S.ud.notes['62.4.8'].topic === 'Love' && S.ud.notes['62.4.8'].subs.join('|') === 'Faith|God', 'the topic and the earlier subtopic keep their spelling; the new one gets a capital');
  TimotheosStudy.editNote('58.11.1'); await sleep(300); fill('Faith', ['Assurance'], 'Hoped for'); btn('Save').click(); await sleep(400);
  TimotheosStudy.editNote('45.5.5'); await sleep(300);
  const t = $('#nTopic'); t.value = 'one two three four five six'; t.dispatchEvent(new Event('input')); ok(t.value === 'one two three four', 'Topic takes up to 4 words');
  btn('Cancel').click(); await sleep(200);
  // a 0.6.51 note with a statement opens with it as the first subtopic
  S.ud.notes['45.5.8'] = { topic: 'Holy Spirit', stmt: 'Poured out', html: '', t: 1 };
  TimotheosStudy.editNote('45.5.8'); await sleep(300); ok($('.nSub').value === 'Poured out', 'an older statement shows as the subtopic'); btn('Cancel').click(); await sleep(200);
  S.ud.notes['1.1.1'] = { html: '<p>Old note</p>', t: 1 };
  TimotheosStudy.editNote('1.1.1'); await sleep(300); btn('Save').click(); await sleep(400);
  ok(!modal() && S.ud.notes['1.1.1'] && /Old note/.test(S.ud.notes['1.1.1'].html), 'an old note without a topic saves without one');
  // 2. My notes, by topic, with a filter
  const box = document.createElement('div'); document.body.appendChild(box);
  S.seg = 'notes'; S.notesView = 'topic'; S.notesQ = '';
  const rn = () => { const b = document.createElement('div'); box.replaceChildren(b); return b; };
  // renderNotesList is internal: go through renderStudy's body when present, else call through the seg
  TimotheosStudy.onOpen(); await sleep(400);
  const body = document.querySelector('#studyBody');
  const H = () => [...body.querySelectorAll('.ntopicgrp h4')].map(h => h.firstChild.textContent.trim());
  ok(body && H().join('|') === 'Faith|Holy Spirit|Love|Without a topic', 'by topic, A–Z, untitled last: ' + (body ? H().join('|') : 'no body'));
  const f = body.querySelector('#nFilter'); f.value = 'assur'; f.dispatchEvent(new Event('input')); await sleep(50);
  ok(H().join('|') === 'Faith', 'the filter finds a subtopic: ' + H().join('|'));
  f.value = 'lov'; f.dispatchEvent(new Event('input')); await sleep(50);
  ok(H().join('|') === 'Love' && body.querySelectorAll('.ntopicgrp .nsubh').length === 4 && body.querySelectorAll('.ntopicgrp li').length === 5, 'the filter finds a topic with all its subtopics: ' + body.querySelectorAll('.ntopicgrp li').length);
  f.value = ''; f.dispatchEvent(new Event('input'));
  body.querySelector('[data-view="verse"]').click(); await sleep(100);
  ok(body.querySelectorAll('.nlist li').length === 5 && body.querySelector('.ntag'), 'by verse, with the topic as a tag');
  body.querySelector('[data-view="topic"]').click(); await sleep(100);
  // 3. My Learnings in the Library
  await sleep(500);
  const d = (state.allModules.dicts || state.modules.dicts || []).find(x => x.id === 'nb:My Learnings');
  ok(!!d, 'My Learnings is listed with the dictionaries');
  const tops = await api.bookTopics('nb:My Learnings'), top = tops.filter(x => !x.pid);
  ok(top.map(x => x.subject).join('|') === 'Faith|Holy Spirit|Love', 'its topics: ' + top.map(x => x.subject).join('|'));
  const love = top[2], kids = tops.filter(x => x.pid === love.id).map(x => x.subject).sort().join('|');
  ok(kids === 'Faith|Gift|Giving|God', 'Love has its subtopics under it: ' + kids);
  const pg = await api.bookTopic('nb:My Learnings', love.id);
  ok(/Giving/.test(pg.html) && /He gave His only Son/.test(pg.html) && /John 3:16/.test(pg.html) && /1 John 4:8/.test(pg.html), 'a topic page shows its subtopics, verses and explanations');
  const sr = await api.bookSearch('nb:My Learnings', 'assur');
  ok(sr.length === 1 && sr[0].subject === 'Faith › Assurance', 'searching a subtopic finds it under its topic');
  body.querySelector('#openEncBtn').click(); await sleep(1200);
  console.log('RESULT ' + out.join(' | '));
})();
