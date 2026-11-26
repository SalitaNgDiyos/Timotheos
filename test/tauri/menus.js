// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Title-bar menus: items of one kind are grouped in submenus (File → Modules / My Study / Print, View → Layout & Panels).
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/menus.js /tmp/menus.png 1200
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const key = (k) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
try { window.__stage = window.__stage || (window.location.hash.includes('file') ? 'file' : '');
  await until(() => state.nav && state.nav.length);
  const top = i => $$(`.tmdrop[data-i="${i}"] > button, .tmdrop[data-i="${i}"] > .tmsubwrap > button`).map(b => b.textContent.replace(/\s+/g, ' ').trim());
  ok(JSON.stringify(top(0).map(t => t.replace(/(Ctrl|Alt)\S*$/, ''))) === JSON.stringify(['Modules▸', 'My Study▸', 'Print▸', 'Options…', 'Exit']), 'File: ' + top(0).join(' / '));
  const v = top(1);
  ok(v.some(t => /^Layout & Panels…/.test(t)) && !v.some(t => /Edit Layout|Reset|▸/.test(t)), 'View: one Layout & Panels… item, no Edit Layout / Reset items');
  $('.tmenu[data-i="1"]').click(); await sl(150); $('.tmdrop[data-i="1"] button[data-cmd="panels"]').click(); await sl(500);
  const dlg = $('#panelsMenu');
  ok(dlg && dlg.querySelector('[data-act="detach"]') && dlg.querySelector('[data-act="reset"]'), 'the Layout & Panels window has Edit Layout and Reset Layout');
  const before = TimotheosDock.getDetachMode(); dlg.querySelector('[data-act="detach"]').click(); await sl(300);
  ok(TimotheosDock.getDetachMode() === !before, 'Edit Layout in the window switches Edit Layout');
  TimotheosDock.setDetachMode(before);
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 4, y1: 3, panels: ['bv0'], active: 'bv0' }], floats: [], hidden: [] }); await sl(300);
  $('#panelsMenu [data-act="reset"]').click(); await sl(500);
  ok(TimotheosDock.state().areas.length > 2, 'Reset Layout in the window brings back the classic layout');
  $('.tmenu[data-i="0"]').click(); await sl(150);
  const sb = $('.tmdrop[data-i="0"] .tmsubbtn'); sb.focus(); key('ArrowRight'); await sl(150);
  ok(sb.parentElement.classList.contains('open') && document.activeElement.dataset.cmd === 'newUserMod', 'File: → opens Modules on its first item');
  key('ArrowDown'); await sl(50); ok(document.activeElement.dataset.cmd === 'import', '↓ moves inside the submenu');
  key('ArrowLeft'); await sl(50); ok(document.activeElement === sb && !sb.parentElement.classList.contains('open'), '← goes back');
  key('Escape'); await sl(50);
  if (window.__stage !== 'file') { console.log('RESULT ' + out.join(' | ')); return; }
  $('#panelsMenu .pm-dlg-close, #panelsMenu [data-act="close"]') && $('#panelsMenu .pm-dlg-close, #panelsMenu [data-act="close"]').click();
  // File → Modules hover for the picture
  $('.tmenu[data-i="0"]').click(); await sl(100); $('.tmdrop[data-i="0"] .tmsubbtn').parentElement.dispatchEvent(new MouseEvent('mouseenter'));
  await sl(200);
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
