// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// phone: the "Next chapter" card is the very last thing in the chapter, after the footnote list
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  document.documentElement.classList.add('sk');
  const root = document.createElement('div');
  root.innerHTML = '<p data-v="1">In the beginning<sup class="fn" data-note="a note">1</sup></p><div class="nextch"><button class="nc-card">Next</button></div>';
  decorateFootnotes(root, { fnList: true, fnStyle: 'letter' }, {});
  const kids = [...root.children];
  ok(kids.length === 3 && kids[1].classList.contains('fnlist'), 'footnote list is inserted before the card');
  ok(kids[2].classList.contains('nextch'), 'the next-chapter card stays last of all');
  const plain = document.createElement('div'); plain.innerHTML = '<p data-v="1">x<sup class="fn" data-note="n">1</sup></p>';
  decorateFootnotes(plain, { fnList: true }, {});
  ok(plain.lastElementChild.classList.contains('fnlist'), 'without a card the list is still added at the end (desktop)');
  console.log('RESULT ' + out.join(' | '));
})();
