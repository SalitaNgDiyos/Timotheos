/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.4.8: pictures in entries and the picture viewer, references in entries as links, clipboard monitor,
// your own marks in book topics, export of topics
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
(async () => {
  await sleep(3000);
  // pictures in an RTF entry
  const img = state.modules.books.find(b => /Test Images/.test(b.name));
  await TimotheosModules.openBookModule(img.id); await sleep(900);
  const ims = document.querySelectorAll('#libBody img');
  ok(ims.length === 2 && ims[0].naturalWidth === 80, 'pictures in an RTF entry: ' + ims.length + ', ' + (ims[0] ? ims[0].naturalWidth + '×' + ims[0].naturalHeight : ''));
  ims[0].click(); await sleep(500);
  const gv = $('#gview');
  ok(gv && !gv.classList.contains('hidden') && /1 of 2/.test(gv.textContent), 'clicking a picture opens the viewer: ' + (gv ? gv.querySelector('.gcap').textContent : ''));
  const gi = gv.querySelector('.gimg'); const w0 = gi.offsetWidth;
  gv.querySelector('.gstage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await sleep(100);
  ok(gi.offsetWidth > w0, 'the mouse wheel zooms: ' + w0 + ' → ' + gi.offsetWidth);
  gv.querySelector('[data-g="next"]').click(); await sleep(300);
  ok(/2 of 2/.test(gv.textContent) && gi.naturalWidth === 50, 'next picture');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200);
  ok(gv.classList.contains('hidden'), 'Esc closes the viewer');
  // references in book entries become links
  const tb = state.modules.books.find(b => /Test Images/.test(b.name));
  const tp = [...document.querySelectorAll('#libTopics li[data-tid]')].find(li => /Chapter A/.test(li.textContent)); if (tp) tp.click(); await sleep(700);
  const bref = $('#libBody a[data-href*="bible"]');
  ok(bref && /John 3:16/.test(bref.textContent), 'a plain-text reference in an entry is a link: ' + (bref ? bref.textContent : $('#libBody').textContent.slice(0, 80)));
  if (bref) {
    bref.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); Object.defineProperty(bref, 'matches', { value: s => s === ':hover' || Element.prototype.matches.call(bref, s) });
    await sleep(1200);
    ok(!$('#popup').classList.contains('hidden') && /loved/.test($('#popup').textContent), 'resting on it shows the verse: ' + $('#popup').textContent.slice(0, 60));
  }
  void tb;
  // your own marks in a topic
  await TimotheosModules.openBookModule(img.id); await sleep(800);
  const eb = $('#libBody .ebody'); const tw = document.createTreeWalker(eb, NodeFilter.SHOW_TEXT); let tn, ix = -1;
  while ((tn = tw.nextNode())) { ix = tn.data.search(/\w{5,}/); if (ix >= 0) break; }
  const word = tn.data.slice(ix).match(/\w{5,}/)[0];
  const sr = document.createRange(); sr.setStart(tn, ix); sr.setEnd(tn, ix + word.length); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(sr);
  eb.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(200);
  ok($('#abar') && !$('#abar').classList.contains('hidden'), 'selecting text in a topic shows the marking bar');
  $('#abar [data-as="yellow"]').click(); await sleep(300);
  ok(($('#libBody mark.hl-yellow') || {}).textContent === word, 'the words are highlighted: ' + word);
  const other = state.modules.books.find(b => /Test Book/.test(b.name)); await TimotheosModules.openBookModule(other.id); await sleep(500);
  await TimotheosModules.openBookModule(img.id); await sleep(800);
  ok(($('#libBody mark.hl-yellow') || {}).textContent === word, 'and still there when the topic is opened again');
  const ud = await api.userData(); ok(ud.bookMarks && ud.bookMarks[img.id], 'kept in your study data');
  // clipboard monitor (the test reads from a variable, not the real clipboard)
  let clip = 'nothing'; TimotheosTools.clipTestReader(async () => clip); TimotheosTools.setClipmon(true); await sleep(1600);
  clip = 'Our verse today is John 3:16, and also Rom 5:8; 8:28.'; await sleep(2600);
  const cw = $('#clipwin');
  ok(cw && !cw.classList.contains('hidden') && cw.querySelectorAll('.cref').length === 3 && /God so loved/.test(cw.innerText.replace(/\s+/g, ' ')), 'clipboard monitor lists the copied references with their text: ' + (cw ? [...cw.querySelectorAll('.cgo')].map(a => a.textContent).join(', ') : 'none'));
  cw.querySelector('.cref:nth-child(2) .cgo').click(); await sleep(700);
  ok(state.ref.b === 45 && state.ref.c === 5, 'clicking one goes there');
  TimotheosTools.setClipmon(false); cw.querySelector('.cclose').click();
  // export: the documents made
  const f = TimotheosTools.docxFiles(TimotheosTools.blocks('<h2>Grace</h2><p>Unmerited <b>favour</b>, ἀγάπη.</p>'));
  ok(/<w:t xml:space="preserve">Grace<\/w:t>/.test(f['word/document.xml']) && /<w:b\/>(?:<w:sz [^>]*\/>)?<\/w:rPr><w:t xml:space="preserve">favour/.test(f['word/document.xml']) && /ἀγάπη/.test(f['word/document.xml']), 'export to Word: headings, bold, Greek');
  const rt = TimotheosTools.rtf(TimotheosTools.blocks('<p>Love <i>never</i> faileth – ἀγάπη</p>'));
  ok(/^\{\\rtf1/.test(rt) && /\\i never/.test(rt) && /\\u947\?/.test(rt), 'export to RTF: italics and Greek letters');
  ok($('#libExport') && $('#libPrint'), 'Export and Print buttons on the Library bar');
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
