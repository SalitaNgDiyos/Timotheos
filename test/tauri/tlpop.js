/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Desktop: the book browser opened from a Bible view lists the book names of that view's own Bible.
// Run: FOLDERS='["/home/claude/testmods","/tmp/claude-0/tlmods"]' EXTRA=',"views":[{"bible":"tw:kjv.ont","linked":true},{"bible":"tw:tagalog-test.ont","linked":true}],"activeView":1' bash test/tauri/run.sh test/tauri/tlpop.js x.png
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    await go({ b: 40, c: 10, v: 1 }); await sl(1500);
    const pop = () => document.querySelector('#navPop');
    const open = async i => { const sec = document.querySelector(`#workbench .bv[data-i="${i}"]`); const p = sec.closest('.dgroup').querySelector('.navhdr1 .navpill');
      if (!pop().classList.contains('hidden')) { p.click(); await sl(300); }   // an open browser closes on the first click
      if (pop().classList.contains('hidden')) { p.click(); await sl(700); }
      return { label: p.querySelector('.np-lbl').textContent, names: [...pop().querySelectorAll('.npb-row .npb-name, .npb-tile')].map(x => x.title || x.textContent).join(' ') }; };
    let r = await open(0);
    ok(/^Matthew/.test(r.label) && /Matthew/.test(r.names) && !/Mateo/.test(r.names) && state.active === 0, 'the browser of the English view lists English names (label ' + r.label + ')');
    ok(/Pentateuch/.test(pop().textContent), 'with English group names');
    r = await open(1);
    ok(/^Mateo/.test(r.label) && /Mateo/.test(r.names) && state.active === 1, 'the browser of the Tagalog view lists Tagalog names (label ' + r.label + ')');
    ok(/Pentateuko/.test(pop().textContent), 'with Tagalog group names');
    r = await open(0);
    ok(/Matthew/.test(r.names) && !/Mateo/.test(r.names), 'and the English view again: English');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
