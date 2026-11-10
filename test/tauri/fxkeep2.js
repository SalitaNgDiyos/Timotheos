/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// part 2, after the restart: the same Firefox theme is the skin again, with its picture
(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(4000); const R = document.documentElement;
  ok(/^fxu-crimson/.test(TimotheosOptions.appearance().skin), 'after a restart the skin is still the Firefox theme (' + TimotheosOptions.appearance().skin + ')');
  ok(R.dataset.fx === '1' && /^url\("data:image/.test(getComputedStyle(document.getElementById('toolbar')).backgroundImage), 'its picture is shown again');
  ok(/^fxu-crimson/.test(R.dataset.skin || ''), 'its colours are used (' + R.dataset.skin + ')');
  TimotheosOptions.setSkin('parchment'); await sleep(500); ok(!R.dataset.fx, 'another skin can still be chosen');
  console.log('RESULT ' + out.join(' | ')); })();
