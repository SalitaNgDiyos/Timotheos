// 0.6.4: Bible view header bar, no Nav switch, corner resize, panel menus
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const D = TimotheosDock; const vis0 = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const A = id => D.state().areas.find(a => a.panels.includes(id));
const near = (a, b) => Math.abs(a - b) < 0.01;
const ctr = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const pe = (type, x, y, tgt) => tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }));
const R = (x0, y0, x1, y1, p) => ({ x0, y0, x1, y1, panels: [p], active: p });
async function drag(el, dx, dy) { el.setPointerCapture = () => {}; const [x, y] = ctr(el); pe('pointerdown', x, y, el); pe('pointermove', x + dx, y + dy, el); pe('pointerup', x + dx, y + dy, el); await sleep(300); }
const corner = (id, c) => { const g = document.querySelector(`[data-panel="${id}"]`).closest('.dgroup'); const i = g.dataset.ai; return [...document.querySelectorAll('.dcorner.' + c)].find(el => { const gr = g.getBoundingClientRect(), r = el.getBoundingClientRect(); const cx = r.left + 7, cy = r.top + 7; return Math.abs((c[1] === 'l' ? gr.left : gr.right) - cx) < 6 && Math.abs((c[0] === 't' ? gr.top : gr.bottom) - cy) < 6; }); };
(async () => {
  await sleep(3500);
  go({ b: 43, c: 3, v: 16 }); await sleep(1000);
  const heads = document.querySelectorAll('.dgroup.isbv .dcap .navhdr1');
  ok(heads.length >= 2, 'every Bible view area has the verse browser bar in its caption (' + heads.length + ')');
  const cap = document.querySelector('.dgroup.isbv .dcap');
  ok(cap.querySelector('.navhdr1') && cap.querySelector('.dnav').compareDocumentPosition(cap.querySelector('.dbtn[data-act="skin"]')) & 4, 'the bar sits in the caption just before the palette button');
  ok(!document.getElementById('navModeSw') && !document.querySelector('[data-navmode]'), 'Nav 1 / 2 / 3 / All is gone');
  ok(getComputedStyle(document.querySelector('.dtab[data-id="bv0"] span')).display === 'none', 'the tab name of a Bible view is not shown');
  const lbl0 = cap.querySelector('.np-lbl').textContent;
  cap.querySelector('[data-nav="nextChap"]').click(); await sleep(600);
  ok(cap.querySelector('.np-lbl').textContent !== lbl0, 'the arrows work from the header: ' + lbl0 + ' → ' + cap.querySelector('.np-lbl').textContent);
  document.getElementById('panelsBtn') && document.getElementById('panelsBtn').click();
  // corners
  D.setLayout({ v: 3, areas: [R(0, 0, 2, 1.5, 'bv0'), R(2, 0, 4, 1.5, 'bv1'), R(0, 1.5, 2, 3, 'tree'), R(2, 1.5, 4, 3, 'lib')], floats: [], hidden: ['library', 'cmt', 'search', 'bsearch', 'study'] }); await sleep(300);
  ok(document.querySelectorAll('.dcorner').length === 8, 'four corner handles on each Bible view: ' + document.querySelectorAll('.dcorner').length);
  const br = corner('bv0', 'br'); ok(!!br, 'bottom-right corner handle found');
  if (br) { await drag(br, 60, 40); }
  ok(A('bv0').x1 > 2.05 && A('bv0').y1 > 1.55, 'diagonal drag from the shared corner: bv0 now ends at ' + A('bv0').x1.toFixed(2) + ' × ' + A('bv0').y1.toFixed(2));
  ok(near(A('bv1').x0, A('bv0').x1) && near(A('tree').y0, A('bv0').y1) && near(A('lib').x0, A('bv0').x1) && near(A('lib').y0, A('bv0').y1) && near(A('bv1').y1, A('bv0').y1) && near(A('tree').x1, A('bv0').x1), 'the three panels around the crossing adjust with it, no gap');
  const overl = D.state().areas.some((p, i) => D.state().areas.some((q, j) => j > i && p.x0 < q.x1 - 1e-3 && q.x0 < p.x1 - 1e-3 && p.y0 < q.y1 - 1e-3 && q.y0 < p.y1 - 1e-3));
  ok(!overl, 'nothing overlaps');
  // top-left corner at the outer edge: shrinks the panel
  const tl = corner('bv0', 'tl'); if (tl) { await drag(tl, 40, 30); }
  ok(A('bv0').x0 > 0.05 && A('bv0').y0 > 0.05, 'top-left corner at the outer edge works (' + A('bv0').x0.toFixed(2) + ', ' + A('bv0').y0.toFixed(2) + ')');
  // a corner that cannot move both ways moves the one it can; never overlaps
  const tr = corner('bv1', 'tr'); if (tr) { await drag(tr, -50, 60); }
  const overl2 = D.state().areas.some((p, i) => D.state().areas.some((q, j) => j > i && p.x0 < q.x1 - 1e-3 && q.x0 < p.x1 - 1e-3 && p.y0 < q.y1 - 1e-3 && q.y0 < p.y1 - 1e-3));
  ok(!overl2, 'still no overlap after more corner drags');
  // panel menu rows
  D.setLayout({ v: 3, areas: [R(0, 0, 4, 3, 'bv0')], floats: [], hidden: ['bv1', 'tree', 'library', 'cmt', 'lib', 'search', 'bsearch', 'study'] }); await sleep(300);
  const sec = document.querySelector('section.bv'); const grp = sec.closest('.dgroup');
  grp.querySelector('[data-act="skin"]').click(); await sleep(300);
  const m = document.querySelector('.pskmenu'); m.querySelector('[data-k="bg"] .swc[data-c="#10141a"]').click(); await sleep(200);
  ok(getComputedStyle(sec.querySelector('.bvtext')).backgroundColor === 'rgb(16, 20, 26)', 'Page Background Color changes the text background: ' + getComputedStyle(sec.querySelector('.bvtext')).backgroundColor);
  ok(getComputedStyle(grp.querySelector('.dcap')).backgroundColor !== 'rgb(16, 20, 26)' && getComputedStyle(sec.querySelector('.bvcap')).backgroundColor !== 'rgb(16, 20, 26)', 'the panel caption and header keep the UI colours');
  m.querySelector('.pskdef').click(); await sleep(200);
  ok(!vis0(document.getElementById('refForm')) && !vis0(document.getElementById('navStripBar')) && !vis0(document.getElementById('prevBtn')), 'the Go-to box, its arrows and the chapter / verse strips are removed');
  // an edge facing empty space can be dragged (and snaps to the panel across the gap)
  D.setLayout({ v: 3, areas: [R(0, 0, 1, 3, 'tree'), R(1, 0, 4, 1.5, 'bv0'), R(1.6, 1.5, 4, 3, 'search')], floats: [], hidden: ['bv1', 'library', 'cmt', 'lib', 'bsearch', 'study'] }); await sleep(300);
  const sg = document.querySelector('[data-panel="search"]').closest('.dgroup'); const sr = sg.getBoundingClientRect();
  const free = [...document.querySelectorAll('.gut.h')].find(g => { const r = g.getBoundingClientRect(); return Math.abs(r.left + 3 - sr.left) < 8 && r.top >= sr.top - 8; });
  ok(!!free, 'the left edge of a panel with empty space beside it has a handle');
  if (free) { await drag(free, -(sr.left - document.querySelector('[data-panel="tree"]').closest('.dgroup').getBoundingClientRect().right) + 20, 0); }
  ok(near(A('search').x0, 1), 'dragging it out snaps against the neighbour: x0 = ' + A('search').x0.toFixed(3));
  // Panels menu has no Bible Views block
  const pb = [...document.querySelectorAll('button')].find(b => /Panels/.test(b.textContent) && b.closest('.titlebar,.toolbar,header,#toolbar,body'));
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
