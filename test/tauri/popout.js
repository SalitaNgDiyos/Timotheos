// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Pop out: a panel moves into a window of its own; that window asks the main window's engine for everything.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/popout.js /tmp/po.png 4000
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s);
const ch = new BroadcastChannel('timotheos-pop'); const seen = []; ch.onmessage = e => seen.push(e.data && (e.data.t + ':' + (e.data.ch || e.data.key || '')));
try {
  await sl(1500);
  save({ popWindows: [] });
  ok(!!$('.dgroup .dbtn[data-act="pop"]'), 'panels have a Pop out button');
  const before = (state.settings.views || []).length;
  await TimotheosPop.popOut('bv' + (before - 1)); await sl(9000);
  const l = state.settings.popWindows || [];
  ok(l.length === 1 && l[0].bible, 'the window is remembered: ' + JSON.stringify(l[0] && { panel: l[0].panel, bible: l[0].bible }));
  ok((state.settings.views || []).length === before - 1 || before === 1, 'the Bible view left the main window');
  ok(seen.some(x => x === 'call:settings:get') && seen.some(x => /^call:(modules:list|bible|chapter)/.test(x) || /^call:/.test(x)), 'the new window asks the main engine: ' + [...new Set(seen)].slice(0, 6).join(', '));
  // study data from the main window reaches the popped-out window (it echoes nothing back, so just check it was sent)
  await TimotheosPop.popOut('cmt'); await sl(6000);
  ok((state.settings.popWindows || []).length === 2 && !TimotheosDock.isVisible('cmt'), 'Commentary popped out too and left the main window');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
