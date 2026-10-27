// Runs inside the Tauri window (TANGLAW_SCRIPT); reports through the test_report command.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  try {
    await sleep(500);
    const bs = T.bibles();
    ok(bs.length >= 3, 'Bibles found: ' + bs.map(b => b.abbr + ' (' + b.format + ')').join(', '));
    ok(T.dicts().length >= 1, "Strong's dictionaries: " + T.dicts().map(d => d.title).join(', '));
    const kjv = bs.find(b => /^KJV$/i.test(b.abbr)); const wy = bs.find(b => /wycliffe/i.test(b.abbr + b.title) && b.file.endsWith('.bbli'));
    T.setOpen([kjv.id, wy.id]); await T.go(43, 3); await sleep(300);
    const row = document.querySelector('tr[data-v="16"]');
    ok(row && /For God so loved/.test(row.innerText) && /louede/.test(row.innerText), 'John 3:16 KJV + Wycliffe side by side');
    ok(document.querySelectorAll('tr[data-v]').length === 36, 'John 3 has 36 verses: ' + document.querySelectorAll('tr[data-v]').length);
    // Apocrypha in the 1611 place (Wycliffe has Tobit)
    T.step(1); await sleep(200);
    await T.go(39, 4); T.step(1); await sleep(400);
    ok(/Tobit|Tob/i.test(document.getElementById('capRef').textContent), 'after Malachi 4 comes ' + document.getElementById('capRef').textContent);
    // Strong's popup
    await T.go(43, 3); T.S().show.strongs = true; await T.go(43, 3); await sleep(300);
    const w = document.querySelector('tr[data-v="16"] [data-strong]');
    if (w) { await T.showWord(w); await sleep(400); }
    const pop = document.getElementById('popup');
    ok(w && !pop.classList.contains('hidden') && pop.querySelector('.entry h4'), "Strong's popup: " + (pop.querySelector('.entry h4') || {}).textContent + ' – ' + (pop.textContent || '').slice(0, 60));
    // phone layout and the book picker
    T.S().show.strongs = false; await T.go(43, 3);
    window.__shot = true;
  } catch (e) { ok(false, 'error: ' + (e.stack || e)); }
  report();
})();
