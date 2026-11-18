// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// grab-and-drag scrolling
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(1500); await go({ b: 43, c: 3, v: 1 }); await sleep(900);
  const sc = document.querySelector('.bv .bvtext'); const r = sc.getBoundingClientRect();
  const ev = (type, x, y, o = {}) => (document.elementFromPoint(x, y) || document.body).dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, buttons: type === 'mouseup' ? 0 : 1 }, o)));
  const x = r.left + 120, y = r.top + 200;
  async function drag(dy, o = {}, mx) {
    const s0 = sc.scrollTop; ev('mousedown', x, y, o);
    for (let i = 1; i <= 6; i++) ev('mousemove', x, y + dy * i / 6, o);
    ev('mouseup', x, y + dy, o); await sleep(60); return sc.scrollTop - s0;
  }
  const bv = sc.closest('.bv'); const hb = bv.querySelector('.bvgrab');
  ok(!!hb && !hb.classList.contains('on'), 'each Bible view has a hand button in its left bar, off at first');
  ok(!document.querySelector('#grabScroll'), 'the Options checkbox is gone');
  ok(['cmt', 'lib', 'search', 'bsearch', 'study'].every(k => document.querySelector('[data-grab="' + k + '"]')), 'hand buttons in commentary, library, Bible search, Book search and My Study');
  ok(sc.scrollHeight > sc.clientHeight + 50, 'the view can scroll (' + sc.scrollHeight + ' > ' + sc.clientHeight + ')');
  sc._prog = Date.now() + 100000;   // keep the verse-follow quiet while testing
  const dOff = await drag(-120); ok(dOff === 0, 'hand OFF: a left drag does not scroll (' + dOff + ')');
  const dmOff = await (async () => { const s0 = sc.scrollTop; ev('mousedown', x, y, { button: 1, buttons: 4 }); for (let i = 1; i <= 4; i++) ev('mousemove', x, y - 25 * i, { buttons: 4 }); ev('mouseup', x, y - 100, { buttons: 0, button: 1 }); await sleep(60); return sc.scrollTop - s0; })();
  ok(dmOff > 60, 'hand OFF: the middle button still drags (' + dmOff + ')');
  sc.scrollTop = 0; await sleep(50);
  hb.click(); await sleep(100);
  ok(hb.classList.contains('on') && sc.classList.contains('grabon') && state.settings.views[+bv.dataset.i].grab === true, 'clicking the hand lights it, sets the grab cursor and is stored in the view');
  const d1 = await drag(-120); ok(d1 > 100 && d1 < 140, 'dragging up 120px scrolls the text down by ' + d1);
  const d2 = await drag(60); ok(d2 < -40 && d2 > -80, 'dragging down 60px scrolls back by ' + d2);
  const d3 = await drag(-120, { shiftKey: true }); ok(d3 === 0, 'Shift + drag does not scroll (' + d3 + ')');
  const before = state.ref.v; await drag(-100); ok(state.ref.v === before, 'a drag does not select a verse (' + before + ' -> ' + state.ref.v + ')');
  const dm = await (async () => { const s0 = sc.scrollTop; ev('mousedown', x, y, { button: 1, buttons: 4 }); for (let i = 1; i <= 4; i++) ev('mousemove', x, y - 25 * i, { buttons: 4 }); ev('mouseup', x, y - 100, { buttons: 0, button: 1 }); await sleep(60); return sc.scrollTop - s0; })();
  ok(dm > 60, 'middle-button drag scrolls (' + dm + ')');
  hb.click(); await sleep(100); const d4 = await drag(-100); ok(d4 === 0 && !hb.classList.contains('on'), 'clicking the hand again turns it off (' + d4 + ')');
  for (const k of ['cmt', 'lib', 'search', 'bsearch', 'study']) { const b = document.querySelector('[data-grab="' + k + '"]'); b.click(); await sleep(50); const a = b.classList.contains('on') && state.settings.grab[k] === true; b.click(); await sleep(50); ok(a && !b.classList.contains('on') && state.settings.grab[k] === false, 'hand toggles on and off in ' + k); }
  // a plain click still selects a verse
  const pv = sc.querySelector('.pv[data-v="3"]'); const q = pv.getClientRects()[0];
  if (q && q.top > r.top && q.bottom < r.bottom) { ev('mousedown', q.left + 30, q.top + 8); ev('mouseup', q.left + 30, q.top + 8); ev('click', q.left + 30, q.top + 8, { buttons: 0 }); await sleep(200); ok(state.ref.v === 3, 'a plain click still selects its verse'); }
  console.log('RESULT ' + out.join(' | '));
})();
