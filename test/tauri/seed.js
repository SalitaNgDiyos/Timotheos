/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// First start with no modules: the Bible that comes with Timotheos (AMB) is installed and shown.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  for (let i = 0; i < 80 && !document.querySelector('.bv .pv[data-v]'); i++) await sleep(250);
  ok(state.modules.bibles.length === 1 && /amb\.nt$/i.test(state.modules.bibles[0].id), 'one Bible is installed: ' + state.modules.bibles.map(b => b.id).join(','));
  ok(document.querySelector('#empty').classList.contains('hidden'), 'the "No Bible modules yet" message does not show');
  const t = (document.querySelector('.bv .bvtext') || {}).textContent || ''; ok(t.length > 200, 'its text is on screen (' + t.length + ' characters)');
  ok(state.settings.seeded === true, 'it is remembered that this was done, so uninstalling it does not bring it back');
  ok(state.ref.b >= 40, 'the view opens in the New Testament (book ' + state.ref.b + ')');
  console.log('RESULT ' + out.join(' | '));
})();
