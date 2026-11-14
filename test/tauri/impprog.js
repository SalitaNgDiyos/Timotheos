/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Import window: while modules are imported it shows a progress bar that moves, then the report in the same window.
// Run: IMPSRC=/tmp/claude-0/impsrc bash test/tauri/run.sh test/tauri/impprog.js x.png   (the script gets the folder in window.__IMPSRC)
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    const files = (await api.listDir ? null : null);
    const src = '/tmp/claude-0/impsrc';
    const names = ['Test Book.gbk.twm', 'Test Commentary.cmt.twm', 'Test Dictionary.dct.twm', 'Test Devotional.dev.twm', 'thayer-copy.dct.twm'];
    const ev = []; api.onImportProgress(d => ev.push(d.step + ':' + d.done + '/' + d.total));
    const seen = { prog: false, widths: new Set(), title: '' };
    const mo = new MutationObserver(() => { const b = document.querySelector('#modalBody .impprog'); if (b && !document.querySelector('#modal').classList.contains('hidden')) { seen.prog = true; seen.title = document.querySelector('#modalTitle').textContent; seen.widths.add(b.querySelector('.ipbar i').style.width); } });
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    const p = TimotheosModules.importModules(names.map(n => src + '/' + n));
    await p; await sl(500); mo.disconnect();
    ok(seen.prog && /Importing/.test(seen.title), 'the import window showed progress while importing (' + seen.title + ')');
    ok(seen.widths.size >= 3, 'the bar moved: ' + [...seen.widths].join(' '));
    ok(ev[0] && ev[0].startsWith('start') && ev.some(x => x.startsWith('check')) && ev.some(x => x.startsWith('copy')) && ev[ev.length - 1].startsWith('scan'), 'progress steps: ' + ev.join(' '));
    const t = document.querySelector('#modalTitle').textContent, body = document.querySelector('#modalBody').textContent;
    ok(!document.querySelector('#modal').classList.contains('hidden') && /^Import: \d+ module/.test(t) && /Test Book|Thayer|thayer/.test(body) && !document.querySelector('#modalBody .impprog'), 'then the report in the window: ' + t);
  } catch (e) { ok(false, 'error ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
