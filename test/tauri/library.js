/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.4.4: Library panel (topics on the left, resizable, prev/next), module Properties window, compress
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const pe = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 }));
(async () => {
  await sleep(2500);
  const book = state.modules.books.find(b => /Edit Book/.test(b.name));
  await TimotheosModules.openBookModule(book.id); await sleep(500);
  const side = document.getElementById('libSide').getBoundingClientRect(), body = document.getElementById('libBody').getBoundingClientRect();
  ok(side.left < body.left && Math.abs(side.top - body.top) < 40, `topics on the left (${Math.round(side.left)}) of the text (${Math.round(body.left)})`);
  const items = () => [...document.querySelectorAll('#libTopics li[data-tid]')];
  const curIdx = () => items().findIndex(li => li.classList.contains('cur'));
  ok(curIdx() === 0 && document.getElementById('libPrev').disabled, 'first topic shown; ← disabled');
  document.getElementById('libNext').click(); await sleep(300);
  ok(curIdx() === 1 && /Second/i.test(document.getElementById('libBody').textContent), '→ goes to the next topic: ' + document.querySelector('#libBody h4').textContent);
  document.getElementById('libTopics').focus();
  document.getElementById('libTopics').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep(300);
  ok(curIdx() === 2, '↓ in the list → topic ' + (curIdx() + 1));
  document.getElementById('tab-lib').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })); await sleep(300);
  ok(curIdx() === 1, 'Alt+← → previous');
  ok(state.ref.v === 16, 'the Bible view did not move (verse ' + state.ref.v + ')');
  // splitter
  const sp = document.getElementById('libSplitter'); const r = sp.getBoundingClientRect(); const w0 = document.getElementById('libSide').offsetWidth;
  pe(sp, 'pointerdown', r.left + 2, r.top + 20); pe(sp, 'pointermove', r.left + 72, r.top + 20); pe(sp, 'pointerup', r.left + 72, r.top + 20); await sleep(400);
  const w1 = document.getElementById('libSide').offsetWidth;
  ok(Math.abs(w1 - w0 - 70) <= 2, `drag the edge: topic list ${w0} → ${w1}px`);
  const st = await api.getSettings(); ok(st.appearance.libSideW === TimotheosOptions.appearance().libSideW, 'width saved (' + st.appearance.libSideW + ')');
  document.getElementById('libSideBtn').click(); await sleep(100);
  ok(document.getElementById('libSide').classList.contains('hidden') && document.getElementById('libBody').offsetWidth > w1, 'topic list can be hidden');
  document.getElementById('libSideBtn').click(); await sleep(100);
  // properties
  document.getElementById('libInfo').click(); await sleep(500);
  const dlg = document.getElementById('propsDlg');
  ok(!dlg.classList.contains('hidden') && /Edit Book/.test(document.getElementById('ppTitle').textContent), 'Properties window opens: ' + document.getElementById('ppTitle').textContent);
  document.querySelector('#ppNav [data-p="details"]').click(); await sleep(50);
  const ti = document.querySelector('#ppPages input[data-key="title"]'); ti.value = 'My Edited Book'; ti.dispatchEvent(new Event('input'));
  const au = document.querySelector('#ppPages input[data-key="author"]'); au.value = 'Juan dela Cruz'; au.dispatchEvent(new Event('input'));
  document.querySelector('#ppNav [data-p="about"]').click(); document.getElementById('ppEdit').click(); await sleep(50);
  document.getElementById('ppAbout').innerHTML = '<p>About <b>this</b> book.</p>'; document.getElementById('ppAbout').dispatchEvent(new Event('input'));
  ok(!document.getElementById('ppSave').disabled, 'Save is enabled after edits');
  document.getElementById('ppSave').click(); for (let k = 0; k < 40 && !/Saved|rror|ould not/.test(document.getElementById('ppNote').textContent); k++) await sleep(250);
  ok(/Saved/.test(document.getElementById('ppNote').textContent) && /timotheos-backup/.test(document.getElementById('ppNote').textContent), 'saved, backup kept: ' + document.getElementById('ppNote').textContent);
  const b2 = state.modules.books.find(b => b.id === book.id);
  ok(b2 && b2.title === 'My Edited Book', 'library shows the new title: ' + (b2 && b2.title));
  ok(/About\s+this\s+book/.test(document.getElementById('ppAbout').textContent) && document.querySelector('#ppAbout b, #ppAbout [style*="bold"]'), 'About text read back from the module (RTF → HTML)');
  // compress
  document.querySelector('#ppNav [data-p="file"]').click(); await sleep(50);
  document.getElementById('ppZlib').checked = true; document.getElementById('ppCompress').click(); for (let k = 0; k < 40 && !/→/.test(document.getElementById('ppResult').textContent); k++) await sleep(250);
  ok(/→/.test(document.getElementById('ppResult').textContent) && /compressed/.test(document.getElementById('ppCard').textContent), 'compressed: ' + document.getElementById('ppResult').textContent);
  document.getElementById('ppCancel').click(); await sleep(300);
  await TimotheosModules.openBookModule(book.id); await sleep(400);
  ok(items().length >= 3 && document.getElementById('libBody').textContent.length > 20, 'compressed module still reads in the Library: ' + document.querySelector('#libBody h4').textContent);
  // restore
  await TimotheosProps.open(book.id, 'file'); await sleep(300);
  document.getElementById('ppRestore').click(); await sleep(300);
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === 'OK').click(); for (let k = 0; k < 40 && !/original file is back/.test(document.getElementById('ppNote').textContent); k++) await sleep(250); await sleep(500);
  ok(/original file is back/.test(document.getElementById('ppNote').textContent) && state.modules.books.find(b => b.id === book.id).title === 'Edit Book', 'restored the original');
  document.getElementById('ppCancel').click();
  // Bible properties (read-only check: theWord's KJV stays untouched — only opened)
  await TimotheosProps.open('tw:kjv.ont'); await sleep(300);
  ok(/King James/.test(document.getElementById('ppAbout').textContent) || document.querySelectorAll('#ppPages input').length > 3, 'Bible properties shown (' + document.getElementById('ppTitle').textContent + ')');
  window.__shot = true;
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
})();
