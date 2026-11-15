/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Copy verses: %v (and %b %c) in "Between verses" give the number of the verse that follows, not the letters %v
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    await sl(2500); await go({ b: 43, c: 3, v: 16 }); await sl(600);
    TimotheosStudy.copyDialog({ b: 43, c: 3, v: 16, v2: 18 }); await sl(900);
    const sep = document.querySelector('#cpSep'); sep.value = ' %v'; sep.dispatchEvent(new Event('input', { bubbles: true })); await sl(700);
    const t = document.querySelector('#cpPreview').textContent;
    ok(!/%v/.test(t), 'no literal %v in the preview');
    ok(document.querySelectorAll('#cpPreview sup').length >= 2 && document.querySelector('#cpPreview sup').textContent === '17', 'the numbers between the verses are superscript');
    ok(/ 17/.test(t) && / 18/.test(t), 'verse numbers 17 and 18 appear between the verses: ' + t.slice(0, 160));
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
