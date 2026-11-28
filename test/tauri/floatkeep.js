// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// A floating window: its old place stays empty (nothing grows or shrinks), dragging only moves it (never docks), it can go
// partly past the edges, and Dock puts it back into its old place.
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m), $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const rects = () => $$('.dgroup:not(.dfloat)').filter(g => g.offsetParent).map(g => { const r = g.getBoundingClientRect(); return [(g.querySelector('.dcap .dtitle, .dcap') || g).textContent.trim().slice(0, 20), Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); });
const drag = async (el, dx, dy) => { const r = el.getBoundingClientRect(), x = r.left + 60, y = r.top + 8;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1, clientX: x, clientY: y }));
  for (let i = 1; i <= 8; i++) { document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: x + dx * i / 8, clientY: y + dy * i / 8 })); document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, clientX: x + dx * i / 8, clientY: y + dy * i / 8 })); await sl(20); }
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: x + dx, clientY: y + dy })); document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: x + dx, clientY: y + dy })); await sl(300); };
try {
  await sl(1500);
  await TimotheosDock.show('cmt'); await sl(400);
  const before = rects();
  TimotheosDock.toggleFloat('cmt'); await sl(500);
  const f = $('.dfloat'); ok(!!f, 'Commentary floats');
  const after = rects().filter(x => before.includes(x));
  ok(after.length === before.length - 1, 'no other panel grew or shrank (' + after.length + ' of ' + (before.length - 1) + ' unchanged)');
  ok(!!$('#workbench .dempty .dadd'), 'its old place is an empty space with Add Panel');
  const emp = $('#workbench .dempty').getBoundingClientRect();
  await drag(f.querySelector('.dcap'), emp.left + 40 - f.getBoundingClientRect().left, emp.top + 40 - f.getBoundingClientRect().top);
  ok(!!$('.dfloat') && !$('.dlayer'), 'dropped on the empty space it is still a floating window');
  ok(!$('body').classList.contains('detach-mode'), '(moved without Edit Layout)');
  const f2 = $('.dfloat'); await drag(f2.querySelector('.dcap'), innerWidth - f2.getBoundingClientRect().left - 100, 0);
  const r2 = $('.dfloat').getBoundingClientRect(); ok(r2.right > innerWidth + 50, 'it can go partly past the right edge: right ' + Math.round(r2.right) + ' > ' + innerWidth);
  TimotheosDock.toggleFloat('cmt'); await sl(500);
  ok(!$('.dfloat') && JSON.stringify(rects().sort()) === JSON.stringify(before.slice().sort()), 'Dock puts it back exactly where it was; all panels as before');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
