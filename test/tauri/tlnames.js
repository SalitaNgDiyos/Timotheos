/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// A Tagalog Bible shows Tagalog book names (header, book list, references); an English Bible keeps English ones.
// Run: FOLDERS='["/home/claude/testmods","/tmp/claude-0/tlmods"]' EXTRA=',"openBibles":["tw:tagalog-test.ont"]' bash test/tauri/run.sh test/tauri/tlnames.js x.png
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    const nm = id => (state.nav.find(x => x.id === id) || {}).name;
    ok(views()[0].bible === 'tw:tagalog-test.ont', 'the first Bible is the Tagalog one: ' + views()[0].bible);
    ok(nm(43) === 'Juan' && nm(40) === 'Mateo' && nm(19) === 'Mga Awit' && nm(66) === 'Pahayag', 'book names are Tagalog: ' + [nm(40), nm(43), nm(19), nm(66)]);
    ok((state.nav.find(x => x.id === 45) || {}).abbr === 'Roma', 'abbreviations too: ' + (state.nav.find(x => x.id === 45) || {}).abbr);
    await go({ b: 43, c: 3, v: 16 }); await sl(1200);
    ok(/Juan\s*3/.test(document.querySelector('#chapterHead, .bv .pane-head, .bv .chead') ? document.querySelector('#chapterHead, .bv .pane-head, .bv .chead').textContent : document.body.innerText), 'the chapter heading says Juan 3');
    await useBible('tw:kjv.ont'); await sl(1500);
    ok(nm(43) === 'John' && nm(40) === 'Matthew', 'an English Bible shows English names again: ' + [nm(40), nm(43)]);
    await useBible('tw:tagalog-test.ont'); await sl(1500);
    ok(nm(43) === 'Juan', 'and back to Tagalog: ' + nm(43));
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
