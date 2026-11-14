/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Desktop: with Filipino as the program language every Bible shows Tagalog book names; English brings English back.
// Run: EXTRA=',"lang":"fil"' bash test/tauri/run.sh test/tauri/tlui.js x.png
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    await go({ b: 40, c: 1, v: 1 }); await sl(1500);
    const nm = id => (state.nav.find(x => x.id === id) || {}).name;
    const bible = views()[state.active].bible;
    ok(nm(40) === 'Mateo' && nm(19) === 'Mga Awit', 'Filipino program language, English Bible (' + bible + '): Tagalog book names: ' + [nm(40), nm(19)]);
    const h = (document.querySelector('#chapterHead') || {}).textContent || '';
    ok(/Mateo 1/.test(h) && /Bagong Testamento/.test(h), 'chapter heading: ' + h);
    const tree = (document.querySelector('#bibleTree') || {}).textContent || '';
    ok(/Mateo/.test(tree) && /Pentateuko/.test(tree), 'the book tree is Tagalog with Tagalog group names');
    const sel = document.querySelector('#uiLang');
    if (sel) { sel.value = 'en'; sel.onchange(); await sl(1500); } else { save({ lang: 'en' }); state.settings.lang = 'en'; await langChanged(); await sl(800); }
    ok(nm(40) === 'Matthew', 'English program language: English names again: ' + nm(40));
    const tree2 = (document.querySelector('#bibleTree') || {}).textContent || '';
    ok(/Matthew/.test(tree2) && /Pentateuch/.test(tree2), 'and the tree is English again');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
