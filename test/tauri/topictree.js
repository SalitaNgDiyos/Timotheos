/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The topic list of a book module: a page is 500 TOP entries, each with everything below it (a Greek word with its G-numbers)
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s);
  try {
    await sl(2500);
    // 700 top entries, then (as in a module ordered by parent) their sub-topics: 2 under each
    const list = []; for (let i = 1; i <= 700; i++) list.push({ id: i, pid: 0, subject: 'word' + i });
    for (let i = 1; i <= 700; i++) { list.push({ id: 1000 + i * 2, pid: i, subject: 'G' + (i * 2) }); list.push({ id: 1001 + i * 2, pid: i, subject: 'G' + (i * 2 + 1) }); }
    renderTopicList(list);
    const li = [...$('#libTopics').querySelectorAll('li')];
    ok(li.length === 500 + 1000 + 1, 'the first 500 top entries with their 1000 sub-topics, and the "show next" line: ' + li.length);
    ok(li[0].textContent === 'word1' && li[1].textContent === 'G2' && li[2].textContent === 'G3' && li[3].textContent === 'word2', 'a word is followed by its G-numbers: ' + li.slice(0, 4).map(x => x.textContent));
    ok(parseInt(li[1].style.paddingLeft) > parseInt(li[0].style.paddingLeft), 'the G-numbers are indented');
    ok(/200 more/.test(li[li.length - 1].textContent), 'the last line counts the rest: ' + li[li.length - 1].textContent);
    li[li.length - 1].click(); await sl(300);
    ok($('#libTopics').querySelectorAll('li').length === 700 + 1400, 'show next shows the remaining 200 top entries with their sub-topics');
    // a list whose parents are not in it (search results): every entry is a top entry
    renderTopicList([{ id: 5, pid: 99, subject: 'G5' }, { id: 6, pid: 99, subject: 'G6' }]);
    ok($('#libTopics').querySelectorAll('li').length === 2, 'entries whose parent is not in the list are listed as they are');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
