/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.4.9 UI test: user modules (.cmt.twm, .dct.twm, .gbk.twm), Tagalog UI localization,
// customizable keyboard shortcuts, Lookup panel Back/Forward history, and bookmark footnote popups.
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
(async () => {
  await sleep(2500);
  // [B1] Bookmark slice extraction (#bkm, #bkm-, #bkm1-bkm2)
  const sampleHtml = 'Intro<a class="bkm" id="bkm:fn1"></a>Note 1 text<a class="bkm" id="bkm:fn1_end"></a>Middle<a class="bkm" id="bkm:fn2"></a>Note 2 text';
  ok(TimotheosModules.extractBookmarkSlice(sampleHtml, '#fn1-') === 'Note 1 text', 'extractBookmarkSlice(#fn1-) stops at next bookmark');
  ok(TimotheosModules.extractBookmarkSlice(sampleHtml, '#fn1-fn1_end') === 'Note 1 text', 'extractBookmarkSlice(#fn1-fn1_end) bounded range');

  // [D3] Lookup panel Back / Forward history
  window.setLookupHtml('<div class="entry"><h4>First Lookup</h4></div>');
  window.setLookupHtml('<div class="entry"><h4>Second Lookup</h4></div>');
  ok(!document.getElementById('lkpBack').disabled, 'Lookup Back button enabled after 2 lookups');
  window.lookupStep(-1);
  ok(/First Lookup/.test(document.getElementById('libFeed').innerHTML) && !document.getElementById('lkpFwd').disabled, 'Lookup Back restores First Lookup and enables Forward');
  window.lookupStep(1);
  ok(/Second Lookup/.test(document.getElementById('libFeed').innerHTML), 'Lookup Forward restores Second Lookup');

  // [E1] Tagalog localization live switch
  TimotheosI18n.apply('fil');
  ok(document.querySelector('#searchBtn .lbl').textContent === 'Hanapin' && document.querySelector('.tmenu[data-i="0"]').textContent === 'Talaksan', 'Tagalog UI localization switches toolbar and menus');
  TimotheosI18n.apply('en');
  ok(document.querySelector('#searchBtn .lbl').textContent === 'Search', 'English UI restored');

  // [E2] Customizable keyboard shortcuts
  ok(TimotheosOptions.shortcuts().copyVerses === 'F5', 'Default shortcut for copyVerses is F5');

  // [F3] Word .docx export includes word/styles.xml and w:rFonts
  const docx = TimotheosTools.docxFiles(TimotheosTools.blocks('<h1>Title</h1><p>Body text</p>'));
  ok(docx['word/styles.xml'] && /w:rFonts w:ascii="Gentium Plus"/.test(docx['word/document.xml']), 'DOCX export includes word/styles.xml and w:rFonts');

  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
