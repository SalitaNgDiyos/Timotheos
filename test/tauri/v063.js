/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.6.3: independent dividers, no blank space above verse 1, topic list width reset, About verse size, panel colour rows
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const D = TimotheosDock;
const ctr = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const pe = (type, x, y, tgt) => tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }));
const A = (id) => D.state().areas.find(a => a.panels.includes(id));
const near = (a, b) => Math.abs(a - b) < 0.01;
async function dragGut(g, dx, dy) { g.setPointerCapture = () => {}; const [x, y] = ctr(g); pe('pointerdown', x, y, g); pe('pointermove', x + dx, y + dy, g); pe('pointerup', x + dx, y + dy, g); await sleep(300); }
(async () => {
  await sleep(3500);
  // 2×2 style layout: tree | bv0 on top, cmt | lib below with different widths
  const R = (x0, y0, x1, y1, p) => ({ x0, y0, x1, y1, panels: [p], active: p });
  D.setLayout({ v: 3, areas: [R(0, 0, 2, 1.5, 'tree'), R(2, 0, 4, 1.5, 'bv0'), R(0, 1.5, 2, 3, 'cmt'), R(2, 1.5, 4, 3, 'lib')], floats: [], hidden: ['library', 'search', 'bsearch', 'study'].concat(D.panels().map(p => p.id).filter(i => /^bv[1-9]/.test(i))) });
  await sleep(300);
  ok(document.querySelectorAll('.gut').length >= 4, 'dividers drawn between touching areas: ' + document.querySelectorAll('.gut').length);
  const before = JSON.stringify(['cmt', 'lib', 'bv0'].map(i => [A(i).x0, A(i).x1]));
  const vg = [...document.querySelectorAll('.gut.h')].find(g => { const r = g.getBoundingClientRect(); return r.top < 300; });
  await dragGut(vg, 80, 0);
  ok(A('tree').x1 > 2.05 && near(A('tree').x1, A('bv0').x0), 'top vertical divider moved: Books now ends at ' + A('tree').x1.toFixed(2));
  ok(near(A('cmt').x1, 2) && near(A('lib').x0, 2), 'the row below keeps its own widths (cmt/lib edge at ' + A('cmt').x1 + ')');
  // horizontal divider between tree and cmt: moves only these two heights
  const hg = [...document.querySelectorAll('.gut.v')].find(g => { const r = g.getBoundingClientRect(); return r.left < 300; });
  await dragGut(hg, 0, -60);
  ok(A('tree').y1 < 1.45 && near(A('tree').y1, A('cmt').y0), 'left horizontal divider moved: Books ends at ' + A('tree').y1.toFixed(2));
  ok(near(A('bv0').y1, 1.5) && near(A('lib').y0, 1.5), 'the neighbours to the right keep their height (bv0 ' + A('bv0').y1 + ', lib ' + A('lib').y0 + ')');
  // closing a panel: the neighbours grow into its place
  D.setLayout({ v: 3, areas: [R(0, 0, 2, 1.5, 'tree'), R(2, 0, 4, 1.5, 'bv0'), R(0, 1.5, 2, 3, 'cmt'), R(2, 1.5, 4, 3, 'lib')], floats: [], hidden: [] }); await sleep(200);
  D.hide('cmt'); await sleep(200);
  ok(near(A('tree').y1, 3) || near(A('lib').x0, 0), 'closing a panel closes the hole (tree.y1 ' + A('tree').y1.toFixed(2) + ', lib.x0 ' + A('lib').x0.toFixed(2) + ')');
  // old 0.6.2 layouts are converted
  D.setLayout({ v: 2, cols: [1, 1, 1, 1], rows: [1, 1, 1], areas: [{ c: 0, r: 0, cs: 1, rs: 3, panels: ['tree'] }, { c: 1, r: 0, cs: 3, rs: 3, panels: ['bv0'] }] }); await sleep(200);
  ok(near(A('bv0').x0, 1) && A('bv0').x1 >= 2 && near(A('tree').y1, 3), 'a 0.6.2 layout is converted: ' + JSON.stringify([A('bv0').x0, A('bv0').x1, A('tree').y1]));
  // no blank space above verse 1
  go({ b: 43, c: 3, v: 1 }); await sleep(1200);
  const t = document.querySelector('section.bv .bvtext'); const tb = t.querySelector('.paraview');
  ok(tb && tb.getBoundingClientRect().top - t.getBoundingClientRect().top < 60, 'chapter starts at the top of the view (' + Math.round(tb.getBoundingClientRect().top - t.getBoundingClientRect().top) + 'px from the edge)');
  // topic list toggle resets the width
  const ap = () => state.settings.appearance || {};
  if (document.getElementById('libSideBtn')) {
    const a = Object.assign({}, ap(), { libSideW: 400, libSideHidden: false }); save({ appearance: a }); applyLibSide(); await sleep(100);
    document.getElementById('libSideBtn').click(); await sleep(100); document.getElementById('libSideBtn').click(); await sleep(150);
    ok(ap().libSideW === 230, 'topic list off and on → width back to the default (' + ap().libSideW + ')');
  }
  // About verse font is bigger than the body text
  about(); await sleep(300);
  const av = document.querySelector('.aboutverse');
  ok(av && parseFloat(getComputedStyle(av).fontSize) >= parseFloat(getComputedStyle(document.body).fontSize) * 1.25, 'About verse font enlarged: ' + (av && getComputedStyle(av).fontSize));
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
