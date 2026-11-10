/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// a Firefox theme chosen before a restart is still the skin after it: part 1 imports and chooses it (fxkeep.sh)
(async () => { const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(3500);
  await TimotheosOptions.importMyFx(); await sleep(2500); document.querySelectorAll('#modal .box button').forEach(x => { if (/OK/.test(x.textContent)) x.click(); });
  const k = Object.keys(TimotheosOptions.SKINS).find(x => /^fxu-crimson/.test(x)); ok(!!k, 'imported: ' + k);
  TimotheosOptions.setSkin(k); await sleep(1500); ok(document.documentElement.dataset.fx === '1', 'chosen');
  console.log('RESULT ' + out.join(' | ')); })();
