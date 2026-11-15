// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// the book button in a Bible view's header opens the book / chapter / verse picker
(async () => {
  let err = ''; window.addEventListener('error', e => err += e.message + ';');
  const p = document.querySelector('.navhdr1 .navpill'), r = p.getBoundingClientRect();
  p.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); p.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.x + 5, clientY: r.y + 5 }));
  await new Promise(x => setTimeout(x, 600));
  const pop = document.getElementById('navPop'), books = pop.querySelectorAll('[data-bk],.npbook,.npbk').length;
  console.log('RESULT ' + (!err && pop.offsetHeight > 100 ? '✓' : '✗') + ' picker open ' + pop.offsetWidth + 'x' + pop.offsetHeight + ' err=' + err + ' html=' + pop.innerHTML.length);
})();
