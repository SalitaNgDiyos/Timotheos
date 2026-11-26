// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Start-up: the chapter last shown is kept and put on screen at once at the next start (0.6.127); Copy verses is F9.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/startup.js /tmp/st.png 800
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
try {
  for (let i = 0; i < 60 && !$('.bv .bvtext [data-v]'); i++) await sl(200);
  await go({ b: 43, c: 3, v: 16 }); await sl(2000);
  const sn = JSON.parse(localStorage.getItem('tw.paneSnap.0') || 'null');
  ok(sn && sn.b === 43 && sn.c === 3 && sn.id === views()[0].bible && /data-v="16"/.test(sn.html), 'the chapter on screen is kept');
  const t = $('.bv .bvtext'); const before = t.textContent.length; t.innerHTML = '';
  showPaneSnapshots();
  ok(t.querySelector('[data-v="16"]') && Math.abs(t.textContent.length - before) < 50, 'at start-up it is put back at once');
  localStorage.setItem('tw.paneSnap.0', JSON.stringify(Object.assign({}, sn, { c: 4 }))); t.innerHTML = ''; showPaneSnapshots();
  ok(!t.querySelector('[data-v]'), 'a kept chapter that is not the one to show is not used');
  await renderChapter(false);
  ok(TimotheosOptions.shortcuts().copyVerses === 'F9', 'Copy verses is F9');
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
