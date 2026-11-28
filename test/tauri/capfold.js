// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Panel captions show only ⋯ and ×; a short side toolbar shows a double arrow listing the icons that do not fit; an empty space never lies over a panel.
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const vis = e => !!e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
try {
  await sl(1500);
  const caps = $$('#grid .dgroup > .dcap');
  const shown = caps.map(c => [...c.querySelectorAll('.dbtns > .dbtn')].filter(vis).map(b => b.dataset.act).join('+'));
  ok(shown.length && shown.every(x => x === 'more+close'), 'every caption shows only ⋯ and ×: ' + [...new Set(shown)].join(' / '));
  const g = $('#grid .dgroup'); g.querySelector('.dmore').click(); await sl(200);
  const items = $$('.dmoremenu button').map(b => b.dataset.act);
  ok(items.includes('skin') && items.includes('float') && items.includes('pop'), 'the ⋯ menu holds them: ' + items.join(','));
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await sl(100);
  // a short Bible view: its side icons fold under a double arrow
  const side = $('.bvside'); const sec = side.closest('.dgroup'); sec.style.height = '220px'; await sl(500);
  const arrow = side.querySelector('.sovf');
  ok(vis(arrow) && side.querySelectorAll('.ovf').length > 0, 'short: a double arrow, ' + side.querySelectorAll(':scope > button.ovf').length + ' icons folded');
  ok(side.scrollHeight <= side.clientHeight + 1 || getComputedStyle(side).overflowY === 'hidden', 'no scroll bar');
  arrow.click(); await sl(200);
  const m = $$('.sovfmenu button'); ok(m.length === side.querySelectorAll(':scope > button.ovf').length, 'the arrow lists them: ' + m.map(b => b.textContent.trim()).slice(0, 4).join(', '));
  document.body.click(); await sl(100);
  sec.style.height = ''; await sl(500);
  ok(!vis(side.querySelector('.sovf')) && !side.querySelectorAll('.ovf').length, 'tall again: all icons back, no arrow');
  // empty spaces are never over a panel
  TimotheosDock.hide('cmt'); await sl(500);
  const overl = $$('#grid .dempty').some(e => { const a = e.getBoundingClientRect(); return $$('#grid > .dgroup').some(gg => { const b = gg.getBoundingClientRect(); return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 8 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 8; }); });
  ok($$('#grid .dempty').length > 0 && !overl, 'the empty space does not lie over any panel');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
