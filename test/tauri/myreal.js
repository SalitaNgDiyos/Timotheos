/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// A real MySword book (kjv.bok.mybible) in the Library panel.
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    const L = await api.describeModules();
    const b = L.books.find(x => /kjv\.bok\.mybible/i.test(x.id));
    ok(!!b, 'book listed: ' + (b && b.title + ' / ' + b.format + ' / ' + b.kind));
    const sel = document.querySelector('#libMod');
    if (sel && b) { sel.value = b.id; sel.dispatchEvent(new Event('change', { bubbles: true })); await sl(1500); }
    const items = [...document.querySelectorAll('#libTopics *')].map(e => e.textContent).filter(t => /^Tobit 1$/.test(t.trim()));
    ok(items.length > 0, 'topics shown');
    const first = [...document.querySelectorAll('#libTopics li, #libTopics [data-id]')].find(e => /Tobit 1\b/.test(e.textContent));
    if (first) { first.click(); await sl(1200); }
    const body = (document.querySelector('#libBody') || {}).innerText || '';
    ok(/book of the words of Tobit/.test(body), 'Tobit 1 text shown');
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
