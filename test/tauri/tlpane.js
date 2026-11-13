/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Phone: the book names follow the Bible being read, even when an English Bible is in another (first) view.
// Run: FOLDERS='["/home/claude/testmods","/tmp/claude-0/tlmods"]' EXTRA=',"windowBounds":{"width":418,"height":900},"views":[{"bible":"tw:kjv.ont","linked":true},{"bible":"tw:tagalog-test.ont","linked":true}],"activeView":1' bash test/tauri/run.sh test/tauri/tlpane.js x.png
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    document.documentElement.classList.add('mobile'); await sl(300); TimotheosSkins.picker(false); await sl(400);
    const pk = document.querySelector('#skPick .skp-card[data-k="a"]'); if (pk) { pk.click(); await sl(800); }
    ok(document.documentElement.classList.contains('sk-a'), 'phone screen A is on');
    ok(views().length === 2 && views()[state.active].bible === 'tw:tagalog-test.ont', 'the Tagalog Bible is the active (second) view: ' + views().map(v => v.bible) + ' active ' + state.active);
    await go({ b: 40, c: 10, v: 1 }); await sl(1500);
    const nm = id => (state.nav.find(x => x.id === id) || {}).name;
    ok(nm(40) === 'Mateo', 'book names follow the active Tagalog Bible: ' + nm(40));
    const t = document.querySelector('#workbench .bv.active .bvtext .sk-ttl span') || document.querySelector('#workbench .bv[data-i="1"] .bvtext .sk-ttl span');
    ok(t && /Mateo\s*10/.test(t.textContent), 'the phone title says Mateo 10: ' + (t && t.textContent));
    const kk = document.querySelector('#workbench .bv[data-i="1"] .bvtext .sk-ttl small');
    ok(kk && /Bagong Testamento/.test(kk.textContent), 'the heading above says Bagong Testamento: ' + (kk && kk.textContent));
    const t0 = document.querySelector('#workbench .bv[data-i="0"] .bvtext .sk-ttl span');
    ok(!t0 || /Matthew/.test(t0.textContent), 'the English view keeps English: ' + (t0 && t0.textContent));
    setActive(0); await sl(800);
    ok(nm(40) === 'Matthew', 'switching to the English view: English names: ' + nm(40));
    setActive(1); await sl(800);
    ok(nm(40) === 'Mateo', 'and back: ' + nm(40));
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
