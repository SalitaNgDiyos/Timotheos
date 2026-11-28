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
  const show = h => { window.showPopupHtml(anchor, h); return p.getBoundingClientRect(); };
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
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
