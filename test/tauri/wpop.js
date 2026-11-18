// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// word pop-ups per Bible view: off at first, Shift + hover shows them
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(1500); await go({ b: 43, c: 3, v: 1 }); await sleep(900);
  const bv = document.querySelector('.bv'); const i = +bv.dataset.i; const btn = bv.querySelector('.bvwpop');
  ok(!!btn && !btn.classList.contains('on'), 'the view has a word pop-up button in its left bar, off at first');
  ok(/OFF/.test(btn.title) && /Shift/.test(btn.title), 'its tooltip tells how Shift works: ' + btn.title.slice(0, 60));
  // a tagged word: make one if the Bible has none
  let w = bv.querySelector('.bvtext [data-strong]');
  if (!w) { const pv = bv.querySelector('.bvtext .pv'); const sp = document.createElement('span'); sp.dataset.strong = 'G1'; sp.textContent = 'TESTWORD'; pv.appendChild(sp); w = sp; out.push('(no tagged word in this Bible: added a test one)'); }
  const pop = document.getElementById('popup'); pop.classList.add('hidden');
  const over = (shift) => w.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, shiftKey: !!shift }));
  over(false); await sleep(600); ok(pop.classList.contains('hidden'), 'off + hover alone: no pop-up');
  over(false); w.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(100);
  over(true); await sleep(900); ok(!pop.classList.contains('hidden'), 'off + Shift + hover: the pop-up opens');
  pop.classList.add('hidden'); document.body.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(400);
  btn.click(); await sleep(200);
  ok(views()[i].wpop === true && bv.querySelector('.bvwpop').classList.contains('on') && /ON/.test(bv.querySelector('.bvwpop').title), 'clicking the button turns it on, lights it and is stored in the view');
  pop.classList.add('hidden'); const w2 = document.querySelector('.bv .bvtext [data-strong]');
  w2.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(900); ok(!pop.classList.contains('hidden'), 'on + hover alone: the pop-up opens by itself');
  console.log('RESULT ' + out.join(' | '));
})();
