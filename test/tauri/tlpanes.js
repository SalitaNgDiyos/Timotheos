/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Desktop: every Bible view shows the book names of its own Bible's language; the shared parts (heading, book list) follow the active Bible.
// Run: FOLDERS='["/home/claude/testmods","/tmp/claude-0/tlmods"]' EXTRA=',"lang":"fil","views":[{"bible":"tw:kjv.ont","linked":true},{"bible":"tw:tagalog-test.ont","linked":true}],"activeView":0' bash test/tauri/run.sh test/tauri/tlpanes.js x.png
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    await go({ b: 40, c: 10, v: 1 }); await sl(1500);
    const pill = i => { const sec = document.querySelector(`#workbench .bv[data-i="${i}"]`); const g = sec && sec.closest('.dgroup'); const l = g && g.querySelector('.navhdr1 .np-lbl'); return l ? l.textContent : ''; };
    const nm = id => (state.nav.find(x => x.id === id) || {}).name;
    const head = () => (document.querySelector('#chapterHead') || {}).textContent || '';
    ok(state.settings.lang === 'fil', 'the program language is Filipino (it must not decide the book names)');
    ok(/^Matthew 10/.test(pill(0)), 'the KJV view says Matthew: ' + pill(0));
    ok(/^Mateo 10/.test(pill(1)), 'the Tagalog view says Mateo: ' + pill(1));
    ok(nm(40) === 'Matthew' && /Matthew/.test(head()), 'the KJV view is active: heading and book list in English: ' + head());
    setActive(1); await sl(1200);
    ok(nm(40) === 'Mateo' && /Mateo/.test(head()) && /Bagong Testamento/.test(head()), 'clicking into the Tagalog view: Tagalog heading: ' + head());
    const tree = (document.querySelector('#bibleTree') || {}).textContent || '';
    ok(/Mateo/.test(tree) && /Pentateuko/.test(tree), 'and a Tagalog book list');
    ok(/^Matthew 10/.test(pill(0)) && /^Mateo 10/.test(pill(1)), 'each view keeps its own names: ' + pill(0) + ' / ' + pill(1));
    setActive(0); await sl(1200);
    const tree2 = (document.querySelector('#bibleTree') || {}).textContent || '';
    ok(/Matthew/.test(head()) && /Matthew/.test(tree2) && /Pentateuch/.test(tree2), 'back to the KJV view: English again');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
