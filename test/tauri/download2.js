// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Download modules: several downloads run at the same time, each with its own row.
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const until = async (f, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (f()) return true; } catch (e) {} await sl(100); } return false; };
try {
  await sl(1500);
  const before = state.modules.bibles.length;
  TimotheosDownload.open();
  await until(() => document.querySelector('#dlRepo')); const sel = document.querySelector('#dlRepo'); sel.value = 'wordmodules'; sel.dispatchEvent(new Event('change'));
  ok(await until(() => document.querySelectorAll('.dlrow').length === 3), 'three rows');
  const btns = [...document.querySelectorAll('.dlrow .dlget')];
  btns.forEach(b => b.click());                                   // all three at once
  await sl(50);
  const run = [...document.querySelectorAll('.dlrow .dlget')].filter(b => b.textContent === '…').length;
  ok(run >= 2, 'at least two rows are working at the same time: ' + run);
  ok(await until(() => [...document.querySelectorAll('.dlrow .dlget')].every(b => b.textContent === 'Added')), 'all three end as Added: ' + [...document.querySelectorAll('.dlrow .dlget')].map(b => b.textContent).join(','));
  ok(state.modules.bibles.length === before + 3, 'three Bibles in the library: +' + (state.modules.bibles.length - before));
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
