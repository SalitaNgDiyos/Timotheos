// UI checks for the Copy Verses window (theWord-style Verse Copy Management)
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);

const wheel = (el, dy, shift) => el.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true, shiftKey: !!shift }));
const keyOn = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
(async () => {
  await sleep(2500);
  await go({ b: 43, c: 3, v: 16 }); await sleep(400);
  TimotheosStudy.copyDialog(); await sleep(600);
  ok($('#cpFromLbl').textContent === 'John 3:16' && $('#cpToLbl').textContent === 'John 3:16' && $('#cpCount').textContent === '(1 verse)', 'opens on the current verse: ' + $('#cpFromLbl').textContent + ' – ' + $('#cpToLbl').textContent + ' ' + $('#cpCount').textContent);
  wheel($('#cpToBtn'), 100); await sleep(150); wheel($('#cpToBtn'), 100); await sleep(250);
  ok($('#cpToLbl').textContent === 'John 3:18' && $('#cpCount').textContent === '(3 verses)', 'wheel down on To adds verses → ' + $('#cpToLbl').textContent + ' ' + $('#cpCount').textContent);
  ok($('#cpPreview').textContent.includes('For God so loved') && $('#cpPreview').textContent.includes('condemned') && $('#cpPreview').textContent.includes('John 3:16–18'), 'preview shows John 3:16–18: …' + $('#cpPreview').textContent.slice(-40));
  wheel($('#cpFromBtn'), -100); await sleep(250);
  ok($('#cpFromLbl').textContent === 'John 3:15' && $('#cpCount').textContent === '(4 verses)', 'wheel up on From adds a verse before → ' + $('#cpFromLbl').textContent);
  $('#cpToBtn').focus(); keyOn($('#cpToBtn'), 'PageUp'); await sleep(250);
  ok($('#cpToLbl').textContent === 'John 3:17', 'Page Up takes a verse away → ' + $('#cpToLbl').textContent);
  keyOn($('#cpToBtn'), 'PageDown'); await sleep(250);
  ok($('#cpToLbl').textContent === 'John 3:18', 'Page Down adds one → ' + $('#cpToLbl').textContent);
  wheel($('#cpToBtn'), 100, true); await sleep(250);
  ok($('#cpToLbl').textContent === 'John 3:36', 'Shift+wheel: to the end of the chapter → ' + $('#cpToLbl').textContent);
  wheel($('#cpToBtn'), 100, true); await sleep(250);
  ok($('#cpToLbl').textContent === 'John 4:54', 'Shift+wheel again: end of the next chapter → ' + $('#cpToLbl').textContent);
  // the end of a chapter rolls over into the next one
  $('#cpOne').click(); await sleep(250);
  ok($('#cpCount').textContent === '(1 verse)' && $('#cpToLbl').textContent === 'John 3:15', '× goes back to one verse');
  // picker: From → Romans 2:1
  $('#cpFromBtn').click(); await sleep(250);
  ok(!$('#vpick').classList.contains('hidden') && $('#vpick .vpbooks li.on').textContent === 'John', 'picker opens on John');
  $('#vpFind').value = 'rom'; $('#vpFind').dispatchEvent(new Event('input')); await sleep(50);
  const vis = [...document.querySelectorAll('#vpick .vpbooks li[data-b]:not(.hidden)')].map(li => li.textContent);
  ok(vis.length === 1 && vis[0] === 'Romans', 'typing "rom" finds Romans');
  [...document.querySelectorAll('#vpick .vpbooks li[data-b]')].find(li => li.textContent === 'Romans').click(); await sleep(80);
  document.querySelector('#vpick [data-c="2"]').click(); await sleep(80);
  ok(document.querySelectorAll('#vpick [data-v]').length === 29, 'Romans 2 has 29 verse buttons');
  document.querySelector('#vpick [data-v="1"]').click(); await sleep(300);
  ok($('#vpick').classList.contains('hidden') && $('#cpFromLbl').textContent === 'Rom 2:1' && $('#cpToLbl').textContent === 'Rom 2:1', 'From → Rom 2:1 (To follows)');
  $('#cpToBtn').click(); await sleep(200);
  document.querySelector('#vpick [data-v="5"]').click(); await sleep(300);
  ok($('#cpToLbl').textContent === 'Rom 2:5' && $('#cpCount').textContent === '(5 verses)', 'To → Rom 2:5: ' + $('#cpCount').textContent);
  // across books (Malachi → 1611 Apocrypha)
  $('#cpToBtn').click(); await sleep(150);
  [...document.querySelectorAll('#vpick .vpbooks li[data-b]')].find(li => li.textContent === 'Malachi').click(); await sleep(60);
  document.querySelector('#vpick [data-c="4"]').click(); await sleep(60); document.querySelector('#vpick [data-v="6"]').click(); await sleep(250);
  ok($('#cpFromLbl').textContent === 'Mal 4:6' && $('#cpToLbl').textContent === 'Mal 4:6', 'To before From pulls From along');
  wheel($('#cpToBtn'), 100); await sleep(300);
  const next = $('#cpToLbl').textContent;
  ok(next !== 'Mal 4:6' && $('#cpCount').textContent === '(2 verses)', 'range crosses into the next book: Mal 4:6 – ' + next);
  // resizing is remembered
  const box = $('#modal .box'); ok(getComputedStyle(box).resize === 'both', 'window can be resized from its corner');
  box.style.width = '860px'; box.style.height = '520px'; await sleep(300);
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === 'Close').click(); await sleep(500);
  const ud = await api.userData(); ok(ud.copySize && ud.copySize.w === 860 && ud.copySize.h === 520, 'size saved ' + JSON.stringify(ud.copySize));
  TimotheosStudy.copyDialog(); await sleep(500);
  ok($('#modal .box').offsetWidth === 860, 'opens again at that size (' + $('#modal .box').offsetWidth + 'px)');
  // copy and close puts the passage on the clipboard
  wheel($('#cpToBtn'), 100); await sleep(250);
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === 'Copy and close').click(); await sleep(600);
  const clip = await api.readClipboard?.();
  ok($('#modal').classList.contains('hidden'), 'Copy and close closes the window' + (clip ? ' (clipboard: ' + clip.slice(0, 40) + ')' : ''));
  ok($('#modal .box').style.width === '', 'other dialogs keep their normal size');
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
  TimotheosStudy.copyDialog({ b: 45, c: 2, v: 1, v2: 5 }); await sleep(500);
})();
