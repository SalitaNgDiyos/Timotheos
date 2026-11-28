// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// The scripture popup takes the size of its text, stays inside the window, scrolls only when it must, and can still be resized.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/popfit.js /tmp/pf.png 1500
(async () => {
const sl = ms => new Promise(r => setTimeout(r, ms)), out = [], ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
try {
  await sl(1500);
  const p = document.querySelector('#popup'), W = innerWidth, H = innerHeight;
  const anchor = document.createElement('span'); anchor.textContent = 'ref'; anchor.style.cssText = 'position:fixed;left:200px;top:300px'; document.body.appendChild(anchor);
  const show = h => { window.showPopupHtml(anchor, h, { fit: true }); return p.getBoundingClientRect(); };
  const small = show('<div class="entry"><h4>Exodus 25:11</h4><p>And thou shalt gild it with pure gold.</p></div>');
  const longT = 'word '.repeat(120);
  const big = show(`<div class="entry"><h4>Long</h4><p>${longT}</p></div>`);
  ok(small.height < big.height || small.width < big.width, `a short verse is smaller than a long one: ${Math.round(small.width)}x${Math.round(small.height)} < ${Math.round(big.width)}x${Math.round(big.height)}`);
  ok(small.height < 200, 'a short verse does not keep a fixed tall box: ' + Math.round(small.height));
  ok(big.left >= 0 && big.top >= 0 && big.right <= W && big.bottom <= H, 'the long popup is inside the window');
  ok(p.scrollHeight <= p.clientHeight + 2, 'no scroll bar while it fits');
  const huge = show(`<div class="entry"><p>${'line of text '.repeat(3000)}</p></div>`);
  ok(huge.top >= 0 && huge.bottom <= H && p.scrollHeight > p.clientHeight, 'bigger than the window: it fills the window and scrolls');
  show('<div class="entry"><p>small again</p></div>');
  ok(!p.classList.contains('sized') && getComputedStyle(p).resize === 'both', 'still resizable by hand; fits again for the next one');
  // a word popup (Strong's, morphology): the old way, with the size kept
  const a0 = TimotheosOptions.appearance(); a0.popupSize = { w: 500, h: 300 }; save({ appearance: a0 });
  window.showPopupHtml(anchor, '<div class="entry"><p>G2316 θεός</p></div>'); const wr = p.getBoundingClientRect();
  ok(Math.round(wr.width) === 500 && Math.round(wr.height) === 300 && !p.classList.contains('fitted'), 'a word popup keeps its saved size: ' + Math.round(wr.width) + 'x' + Math.round(wr.height));
  delete a0.popupSize; save({ appearance: a0 });
  // leaving a verse link: the popup goes soon
  const link = document.createElement('a'); link.dataset.href = 'tw://bible.*?id=43.3.16'; link.textContent = 'Jn 3:16'; link.style.cssText = 'position:fixed;left:200px;top:500px'; document.body.appendChild(link);
  window.showPopupHtml(link, '<div class="entry"><p>For God so loved</p></div>', { fit: true });
  const plain = document.querySelector('#workbench') || document.body;
  plain.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  await sl(400); ok(p.classList.contains('hidden'), 'off the link, the popup is gone within 0.4 s');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
