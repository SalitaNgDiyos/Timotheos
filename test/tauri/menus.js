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
  ok(v.includes('Layout & Panels▸') && !v.some(t => /Edit Layout|Reset/.test(t)), 'View: Edit Layout and Reset are no longer on the View menu itself');
  const lp = $$('.tmdrop[data-i="1"] .tmsub')[0];
  ok(lp && [...lp.querySelectorAll('button')].map(b => b.textContent.trim()).join('|') === 'Panels…|Edit Layout|Reset Layout', 'Layout & Panels ▸ Panels… / Edit Layout / Reset Layout');
  // keyboard: Alt+V, go to Layout & Panels, → opens, Enter on Edit Layout toggles it
  $('.tmenu[data-i="1"]').click(); await sl(150);
  const sb = $('.tmdrop[data-i="1"] .tmsubbtn'); sb.focus(); key('ArrowRight'); await sl(150);
  ok(sb.parentElement.classList.contains('open') && document.activeElement.dataset.cmd === 'panels', '→ opens the submenu on its first item');
  key('ArrowDown'); await sl(50);
  ok(document.activeElement.dataset.cmd === 'detachEdges', '↓ moves inside the submenu');
  key('ArrowLeft'); await sl(50);
  ok(document.activeElement === sb && !sb.parentElement.classList.contains('open'), '← goes back to Layout & Panels');
  const before = TimotheosDock.getDetachMode();
  sb.click(); await sl(100); $('.tmsub button[data-cmd="detachEdges"]').click(); await sl(300);
  ok(TimotheosDock.getDetachMode() === !before, 'Edit Layout in the submenu switches Edit Layout');
  $('.tmenu[data-i="1"]').click(); await sl(150);
  const sb2 = $('.tmdrop[data-i="1"] .tmsubbtn'); sb2.parentElement.dispatchEvent(new MouseEvent('mouseenter')); await sl(150);
  ok(/check/.test($('.tmsub button[data-cmd="detachEdges"] .tmic').innerHTML) || $('.tmsub button[data-cmd="detachEdges"]').classList.contains('on'), 'Edit Layout shows its tick while on');
  TimotheosDock.setDetachMode(before);
  // File → Modules hover for the picture
  key('Escape'); key('Escape'); await sl(100);
  if (window.__stage !== 'file') { $('.tmenu[data-i="1"]').click(); await sl(100); $('.tmdrop[data-i="1"] .tmsubbtn').parentElement.dispatchEvent(new MouseEvent('mouseenter')); }
  else { $('.tmenu[data-i="0"]').click(); await sl(100); $('.tmdrop[data-i="0"] .tmsubbtn').parentElement.dispatchEvent(new MouseEvent('mouseenter')); }
  await sl(200);
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
