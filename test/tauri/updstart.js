/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The quiet look at start-up. MODE=show: a card appears (version, what is new, Download and install / Ignore) and Ignore is kept;
// MODE=none: no card (version ignored before, or switched off, or nothing newer).
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const MODE = '__MODE__'; const $ = s => document.querySelector(s);
  try {
    let n = null; for (let i = 0; i < 40 && !(n = $('#updNotice')); i++) await sl(400);
    if (MODE === 'show') {
      ok(!!n, 'a card appears at start-up');
      if (n) {
        ok(/9\.9\.9/.test(n.textContent), 'it names the new version: ' + n.querySelector('.updn-v').textContent);
        ok([...n.querySelectorAll('.updn-list li')].map(x => x.textContent).join('|') === 'Next chapter cards|Tagalog book names', 'it lists what is new, without the build line: ' + [...n.querySelectorAll('.updn-list li')].map(x => x.textContent).join('|'));
        ok(/Download and install/.test($('#updnGo').textContent) && /Ignore/.test($('#updnNo').textContent), 'it offers Download and install and Ignore');
        $('#updnNo').click(); await sl(800);
        ok(!$('#updNotice'), 'Ignore closes the card');
        ok(state.settings.updIgnore === '9.9.9', 'and keeps that version as ignored: ' + state.settings.updIgnore);
      }
    } else ok(!n, 'no card');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
