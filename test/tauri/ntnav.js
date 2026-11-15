/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The books offered (tree, book list, step buttons) are those of the active Bible: an NT-only module shows no Old Testament
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    // run with EXTRA=',"openBibles":["tw:kjv.ont","tw:amb.nt"],"views":[{"bible":"tw:kjv.ont","linked":true},{"bible":"tw:amb.nt","linked":true}]'
    ok(views().length === 2, 'two views: ' + views().map(v => v.bible));
  } catch (e) { out.push('(setup) ' + e.message); }
  try {
    const have = () => navList().length, hasOT = () => navList().some(b => b.grp === 'OT');
    setActive(0); await sl(800); const a0 = have(), o0 = hasOT();
    setActive(1); await sl(800); const a1 = have(), o1 = hasOT();
    ok(o0 && a0 > 60, 'full Bible active: ' + a0 + ' books, OT shown');
    ok(!o1 && a1 === 27, 'NT module active: ' + a1 + ' books, no OT');
    const tree = document.querySelector('#bibleTree'); const t = tree ? tree.innerText : '';
    ok(!/Genesis/.test(t), 'Bible tree has no Genesis while the NT module is active');
    const ics = [...document.querySelectorAll('.navhdr1 [data-nav="nextChap"]')].length;
    ok(ics > 0 && document.querySelectorAll('.navhdr1 [data-nav="prevChap"]').length > 0, 'chapter buttons in the header: ' + ics);
    await go({ b: 43, c: 3, v: 1 }); await sl(600);
    document.querySelector('.navhdr1 [data-nav="nextChap"]').click(); await sl(900);
    ok(state.ref.b === 43 && state.ref.c === 4, 'next chapter button: ' + state.ref.b + '.' + state.ref.c);
    document.querySelector('.navhdr1 [data-nav="prevChap"]').click(); await sl(900);
    ok(state.ref.c === 3, 'previous chapter button: ' + state.ref.c);
  } catch (e) { out.push('error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
