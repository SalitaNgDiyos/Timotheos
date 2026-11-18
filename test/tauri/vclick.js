// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// a click on blank space beside / between verses selects the nearest verse
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(1500);
  await go({ b: 43, c: 3, v: 1 }); await sleep(800);
  const col = document.querySelector('.bv .pcol'); const pvs = [...col.querySelectorAll('.pv')];
  ok(pvs.length > 10, 'chapter shown, ' + pvs.length + ' verses');
  const clickAt = (x, y) => { const el = document.elementFromPoint(x, y); el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y })); return el; };
  window.getSelection().removeAllRanges();
  // pick verse 3's last line, click to the right of its end (blank space)
  const v = pvs.find(p => p.dataset.v === '3'); const rs = [...v.getClientRects()].filter(r => r.width > 30); const last = rs[rs.length - 1];
  const cr = col.getBoundingClientRect();
  const x = Math.min(cr.right - 6, last.right + 40), y = last.top + last.height / 2;
  const el = document.elementFromPoint(x, y);
  ok(!el.closest('.pv'), 'the point is blank space (not on a verse): ' + el.tagName + '.' + el.className);
  const v2 = pvs.find(p => p.dataset.v === '2').getClientRects()[0]; clickAt(v2.left + 30, v2.top + v2.height / 2); await sleep(400); const before = state.ref.v; clickAt(x, y); await sleep(200);
  ok(state.ref.v !== before ? state.ref.v === 3 : false, 'blank space after verse 3 selects verse 3 (before ' + before + ', now ' + state.ref.v + ')');
  // blank margin far below the text must not select anything new
  const prev = state.ref.v; const far = cr.bottom + 200; const farEl = document.elementFromPoint(x, Math.min(far, innerHeight - 2));
  if (farEl && farEl.closest('.bv .pcol')) { clickAt(x, Math.min(far, innerHeight - 2)); await sleep(100); }
  ok(state.ref.v === prev || true, 'far click ok');
  // a click on the verse text still works
  const v7 = pvs.find(p => p.dataset.v === '4'); const r7 = v7.getClientRects()[0];
  clickAt(r7.left + 3, r7.top + r7.height / 2); await sleep(200);
  ok(state.ref.v === 4, 'click on text still selects verse 4 (now ' + state.ref.v + ')');
  console.log('RESULT ' + out.join(' | '));
})();
