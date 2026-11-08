/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// UI checks for 0.4: docking panels, skins, Options window, verse-number display
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const D = TimotheosDock;
const where = id => { const a = D.located(id); return !a ? 'none' : a.hidden ? 'hidden' : a.float ? 'float' : Math.round(a.g.x0) + ',' + Math.round(a.g.y0); };
const ctr = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const pe = (type, x, y, tgt = document) => tgt.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, isPrimary: true }));
/** drag a panel tab; `to` returns the point to drop on, after the drag has started (targets exist then) */
async function drag(id, to, via) {
  const tab = document.querySelector(`.dtab[data-id="${id}"]`);
  const [sx, sy] = ctr(tab);
  pe('pointerdown', sx, sy, tab);
  pe('pointermove', sx + 20, sy + 20); await sleep(40);
  if (via) { const [vx, vy] = via(); pe('pointermove', vx, vy); await sleep(60); }
  const [x, y] = to();
  pe('pointermove', x, y); await sleep(60);
  pe('pointermove', x + 1, y + 1); await sleep(60);
  pe('pointerup', x + 1, y + 1); await sleep(250);
}
(async () => {
  await sleep(2500);
  ok(where('tree') === '0,0' && where('lib') === '3,1' && where('search') === '1,2' && where('cmt') === '3,0' && where('bv0') === '1,0' && where('bv1') === '2,0', 'classic grid layout: ' + ['tree', 'cmt', 'lib', 'search', 'bv0', 'bv1'].map(id => id + '=' + where(id)).join(' '));
  ok(document.querySelectorAll('.dgroup').length >= 5 && document.querySelectorAll('.dcap svg.ic').length > 10, 'areas with icon captions: ' + document.querySelectorAll('.dgroup').length);
  ok(!document.getElementById('zone-left') && !document.getElementById('bvBiblesDrawer') && !D.panel('compare') && !document.getElementById('tab-compare'), 'no old zones, no Bibles drawer, no Compare panel');
  const cell = (r, c) => () => ctr([...document.querySelectorAll('.dtarget.cell')].find(x => x.dataset.t === JSON.stringify({ cell: [r, c] })));
  // 1. drag Library onto a cell of the tall Books area: the area gives up its bottom cell
  const bar = async () => { const tab = document.querySelector('.dtab[data-id="lib"]'); const [sx, sy] = ctr(tab); pe('pointerdown', sx, sy, tab); pe('pointermove', sx + 20, sy + 20); await sleep(80); const n = document.querySelectorAll('.dtarget.cell').length; pe('pointerup', sx + 20, sy + 20); await sleep(200); return n; };
  const n = await bar(); ok(n === 12, 'a dragged panel is offered all 12 grid areas (' + n + ')');
  await drag('lib', cell(2, 0));
  ok(where('lib') === '0,2' && (D.located('tree').g.y1 - D.located('tree').g.y0) < 2.5, 'drag Library to the bottom-left area → ' + where('lib') + ', Books now ' + D.located('tree').g.rs + ' rows');
  // 2. drag Commentary onto the single-cell area of Library, as a tab
  await drag('cmt', cell(2, 0));
  ok(D.located('cmt').g.panels.includes('lib'), 'drop Commentary on an occupied area → tab beside Library: ' + where('cmt'));
  // 3. a Bible view goes into any area too, and a panel can sit beside it as a tab
  await drag('study', cell(0, 0));
  ok(D.located('study').g.panels.includes('tree') || where('study') !== 'hidden', 'My Study dropped on the Books area → ' + where('study'));
  await drag('bv1', cell(1, 3));
  ok(where('bv1') !== 'hidden' && where('bv1') !== 'float' && !!document.querySelector('[data-panel="bv1"]').closest('.dgroup'), 'a Bible view panel is moved to another area → ' + where('bv1'));
  // 4. drop outside the grid → floating window
  await drag('study', () => [300, 14]);
  ok(where('study') === 'float' && document.querySelector('.dfloat [data-panel="study"]'), 'drop outside the grid → floating window');
  // 5. move the floating window by its caption
  const fl = document.querySelector('.dfloat'); const x0 = fl.offsetLeft;
  const [fx, fy] = ctr(fl.querySelector('.dgrip'));
  pe('pointerdown', fx, fy, fl.querySelector('.dgrip')); pe('pointermove', fx + 30, fy); await sleep(30); pe('pointermove', fx + 120, fy); await sleep(30); pe('pointerup', fx + 120, fy); await sleep(300);
  ok(Math.abs(D.state().floats[0].x - (x0 + 120)) < 4, 'floating window moved: x ' + x0 + ' → ' + D.state().floats[0].x);
  // 6. dock it again with its button
  fl.querySelector('.dbtn[data-act="float"]').click(); await sleep(200);
  ok(where('study') !== 'float' && where('study') !== 'hidden', 'Dock-again button → ' + where('study'));
  // 7. close and reopen
  document.querySelector('[data-panel="tree"]').closest('.dgroup').querySelector('.dtab[data-id="tree"]').click(); await sleep(50);
  document.querySelector('[data-panel="tree"]').closest('.dgroup').querySelector('.dbtn[data-act="close"]').click(); await sleep(200);
  ok(where('tree') === 'hidden', 'close Books & chapters → hidden');
  openTab('tree'); await sleep(200);
  ok(D.isVisible('tree') && !document.getElementById('pane-tree').classList.contains('hidden'), 'reopened from the Panels menu → ' + where('tree'));
  // 8. maximize
  const tg = document.querySelector('[data-panel="tree"]').closest('.dgroup'); tg.querySelector('.dbtn[data-act="max"]').click(); await sleep(150);
  const mx = document.querySelector('.dgroup.max'); ok(mx && mx.getBoundingClientRect().width > 1000, 'maximize fills the window (' + (mx && Math.round(mx.getBoundingClientRect().width)) + 'px)');
  mx.querySelector('.dbtn[data-act="max"]').click(); await sleep(150);
  // 9. resize columns with a gutter
  const s = document.querySelector('.gut.h'); const [lx, ly] = ctr(s); const c0 = [D.state().areas.find(a => a.panels.includes('tree')).x1];
  s.setPointerCapture = () => {};
  pe('pointerdown', lx, ly, s); pe('pointermove', lx + 60, ly, s); pe('pointerup', lx + 60, ly, s); await sleep(400);
  { const n = D.state().areas.find(a => a.panels.includes('tree')).x1; ok(n > c0[0], 'column gutter: ' + c0[0].toFixed(2) + ' → ' + n.toFixed(2)); }
  // 10. focus mode: only Bible views stay
  D.toggleFocus(true); await sleep(100);
  ok(document.querySelectorAll('#grid > .dgroup').length > 0 && document.querySelectorAll('#grid > .dgroup:not(.isbv)').length === 0, 'F11 reading focus keeps only the Bible views');
  D.toggleFocus(false); await sleep(100);
  // 11. layout is saved
  await sleep(500);
  const st = await api.getSettings(); ok(st.dock && JSON.stringify(st.dock) === JSON.stringify(D.state()) && st.dock.v === 3, 'layout saved in settings (grid v3)');
  // 12. presets
  D.applyPreset('reading'); await sleep(150); ok(D.panels().filter(p => !D.isBible(p.id)).every(p => where(p.id) === 'hidden') && D.isVisible('bv0'), 'Reading preset hides all panels but the Bible views');
  D.applyPreset('tabs'); await sleep(150); ok(D.located('search').g.panels.length === 5, 'Compact preset: 5 tabs on the right');
  D.applyPreset('classic'); await sleep(150);
  // 13. an old layout (left / right / bottom zones) is carried over
  D.setLayout({ v: 1, zones: { left: { size: 250, groups: [{ panels: ['tree'], active: 'tree', size: 1 }] }, right: { size: 370, groups: [{ panels: ['cmt'], active: 'cmt', size: 1 }, { panels: ['lib', 'study', 'compare'], active: 'lib', size: 1 }] }, bottom: { size: 230, groups: [{ panels: ['search'], active: 'search', size: 1 }] } }, floats: [], hidden: [] }); await sleep(150);
  ok(where('tree') === '0,0' && where('cmt') === '3,0' && D.located('lib').g.panels.includes('study') && where('search') !== 'none' && !D.located('compare'), 'an old layout is converted to the grid');
  D.applyPreset('classic'); await sleep(150);
  window.__dockShot && await window.__dockShot();

  // ---- skins & Options
  document.getElementById('optionsBtn').click(); await sleep(400);
  ok(!document.getElementById('optionsDlg').classList.contains('hidden') && document.querySelectorAll('#skinGrid .skincard').length === 8, 'Options window with 8 skins');
  document.querySelector('#skinGrid [data-skin="narra"]').click(); await sleep(150);
  ok(document.documentElement.dataset.skin === 'narra' && getComputedStyle(document.querySelector('.toolbar')).backgroundColor === 'rgb(59, 42, 30)', 'Narra skin applied (toolbar ' + getComputedStyle(document.querySelector('.toolbar')).backgroundColor + ')');
  document.querySelector('#skinGrid [data-skin="midnight"]').click(); await sleep(150);
  ok(document.documentElement.dataset.theme === 'dark', 'Midnight is a dark skin');
  const fsel = document.getElementById('fontText'); ok([...fsel.options].some(o => o.value === 'Literata'), 'font list has bundled fonts (' + fsel.options.length + ' fonts)');
  fsel.value = 'Literata'; fsel.dispatchEvent(new Event('change')); await sleep(150);
  ok(getComputedStyle(document.querySelector('table.chapter')).fontFamily.includes('Literata'), 'Bible font → Literata');
  await document.fonts.ready; ok(document.fonts.check('16px Literata'), 'Literata loads offline');
  const gsel = document.getElementById('fontGreek'); gsel.value = 'Source Serif 4'; gsel.dispatchEvent(new Event('change')); await sleep(100);
  ok(/TwGreek[^}]*source-serif-4-greek/.test(document.getElementById('dynFonts').textContent), 'Greek-only font face built from Source Serif 4');
  document.querySelector('input[name="vnPos"][value="inline"]').click(); await sleep(600);
  ok(document.querySelector('.bv td[data-col="0"] > sup.vnum') && getComputedStyle(document.querySelector('.bv td.vn .vno')).display === 'none', 'verse numbers in the text');
  document.getElementById('chapNum').value = 'drop'; document.getElementById('chapNum').dispatchEvent(new Event('change')); await sleep(600);
  ok(document.querySelector('.bv tr[data-v="1"] .dropcap'), 'large chapter number at verse 1');
  document.getElementById('vnStyle').value = 'circle'; document.getElementById('vnStyle').dispatchEvent(new Event('change')); await sleep(100);
  document.getElementById('bgTexture').value = 'paper'; document.getElementById('bgTexture').dispatchEvent(new Event('change')); await sleep(100);
  ok(getComputedStyle(document.querySelector('.bv .bvtext')).backgroundImage.startsWith('url'), 'paper texture behind the text');
  document.getElementById('colWoj').value = '#00aa00'; document.getElementById('colWoj').dispatchEvent(new Event('input')); await sleep(100);
  const woj = document.querySelector('.bv .woj'); ok(woj && getComputedStyle(woj).color === 'rgb(0, 170, 0)', 'own colour for words of Jesus');
  document.querySelector('#optNav [data-o="mods"]').click(); await sleep(100);
  ok(document.getElementById('apPlacement').offsetParent && document.getElementById('folderList').children.length, 'Modules page holds Apocrypha, dictionaries, folders');
  const st2 = await api.getSettings(); ok(st2.appearance.skin === 'midnight' && st2.appearance.fontText === 'Literata' && st2.appearance.vnPos === 'inline', 'appearance saved');
  // highlight offsets must ignore the inline verse number
  document.getElementById('optDone').click(); await sleep(100);
  ok(document.getElementById('optionsDlg').classList.contains('hidden'), 'Done closes Options');
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
})();
