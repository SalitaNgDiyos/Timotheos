// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Closing the Layout & Panels window turns Edit Layout off; panels have no drag grip; no chapter counts in the book lists.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/editoff.js /tmp/eo.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s);
try {
  await until(() => state.nav && state.nav.length);
  TimotheosOptions.openPanelsDialog(); await sl(400);
  ok(!$('#panelsMenu').classList.contains('hidden'), 'Layout & Panels window is open');
  TimotheosDock.setDetachMode(true); await sl(200);
  ok(TimotheosDock.getDetachMode(), 'Edit Layout is on');
  $('#panelsMenu .pm-dlg-close').click(); await sl(300);
  ok(!TimotheosDock.getDetachMode(), 'closing the window turned Edit Layout off');
  ok(!$('.dgrip') && ![...document.querySelectorAll('[title]')].some(e => /Drag to move this panel/.test(e.title)), 'no drag grip or its tooltip on panels');
  ok(!$('.tb-chc') && !/\d+ ch\b/.test(($('#pane-tree') || document.body).textContent), 'no chapter counts in the books list');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
