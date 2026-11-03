// UI checks for 0.4: docking panels, skins, Options window, verse-number display
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const D = TimotheosDock;
const where = id => { const a = D.located(id); return !a ? 'none' : a.hidden ? 'hidden' : a.float ? 'float' : a.zone + ':' + a.gi; };
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
  ok(where('lib').startsWith('right') && where('search').startsWith('bottom') && where('tree').startsWith('left'), 'classic layout: ' + ['tree', 'lib', 'search'].map(where).join(' '));
  ok(document.querySelectorAll('.dgroup').length >= 4 && document.querySelectorAll('.dcap svg.ic').length > 10, 'groups with icon captions: ' + document.querySelectorAll('.dgroup').length);

  // 1. drag Lookup onto the "dock at the bottom" target
  await drag('lib', () => ctr(document.querySelector('.dtarget.edge[title="Dock at the bottom"]')));
  ok(where('lib') === 'bottom:1', 'drag Lookup to the bottom edge → ' + where('lib'));
  // 2. drag Commentary onto the Search group, as a tab
  const sg = () => document.querySelector('[data-panel="search"]').closest('.dgroup');
  await drag('cmt', () => ctr(document.querySelector('.dcompass .dtarget.mid')), () => ctr(sg()));
  ok(D.located('cmt').g.panels.includes('search'), 'drop Commentary as a tab beside Search → ' + where('cmt'));
  // 3. drag My Study above Books (left zone, "before")
  const bg = () => document.querySelector('[data-panel="tree"]').closest('.dgroup');
  await drag('study', () => ctr(document.querySelector('.dcompass .dtarget[title="Put it above this panel"]')), () => ctr(bg()));
  ok(where('study') === 'left:0' && where('tree') === 'left:1', 'drop My Study above Books → study ' + where('study') + ', bibles ' + where('tree'));
  // 4. drop Library on empty space → floating window
  const view = document.getElementById('view').getBoundingClientRect();
  await drag('lib', () => [view.left + 200, view.top + 150]);
  ok(where('lib') === 'float' && document.querySelector('.dfloat [data-panel="lib"]'), 'drop Library on the Bible text → floating window');
  // 5. move the floating window by its caption
  const fl = document.querySelector('.dfloat'); const x0 = fl.offsetLeft;
  const [fx, fy] = ctr(fl.querySelector('.dgrip'));
  pe('pointerdown', fx, fy, fl.querySelector('.dgrip')); pe('pointermove', fx + 30, fy + 10); await sleep(30); pe('pointermove', fx + 120, fy + 40); await sleep(30); pe('pointerup', fx + 120, fy + 40); await sleep(300);
  ok(Math.abs(D.state().floats[0].x - (x0 + 120)) < 4, 'floating window moved: x ' + x0 + ' → ' + D.state().floats[0].x);
  // 6. dock it again with its button
  fl.querySelector('.dbtn[data-act="float"]').click(); await sleep(200);
  ok(where('lib').startsWith('right'), 'Dock-again button → ' + where('lib'));
  // 7. close and reopen
  document.querySelector('[data-panel="tree"]').closest('.dgroup').querySelector('.dtab[data-id="tree"]').click(); await sleep(50);
  document.querySelector('[data-panel="tree"]').closest('.dgroup').querySelector('.dbtn[data-act="close"]').click(); await sleep(200);
  ok(where('tree') === 'hidden', 'close Books & chapters → hidden');
  openTab('tree'); await sleep(200);
  ok(where('tree').startsWith('left') && D.isVisible('tree') && !document.getElementById('pane-tree').classList.contains('hidden'), 'reopened from the Panels menu → ' + where('tree'));
  // 8. maximize
  const tg = document.querySelector('[data-panel="tree"]').closest('.dgroup'); tg.querySelector('.dbtn[data-act="max"]').click(); await sleep(150);
  const mx = document.querySelector('.dgroup.max'); ok(mx && mx.getBoundingClientRect().width > 1000, 'maximize fills the window (' + (mx && Math.round(mx.getBoundingClientRect().width)) + 'px)');
  mx.querySelector('.dbtn[data-act="max"]').click(); await sleep(150);
  // 9. resize a zone with its splitter
  const s = document.getElementById('split-left'); const [lx, ly] = ctr(s); const w0 = D.state().zones.left.size;
  s.setPointerCapture = () => {};
  pe('pointerdown', lx, ly, s); pe('pointermove', lx + 60, ly, s); pe('pointerup', lx + 60, ly, s); await sleep(400);
  ok(D.state().zones.left.size === w0 + 60, 'left splitter: ' + w0 + ' → ' + D.state().zones.left.size + 'px');
  // 10. focus mode
  D.toggleFocus(true); await sleep(100);
  ok(document.getElementById('zone-left').classList.contains('empty') && document.getElementById('zone-right').classList.contains('empty'), 'F11 reading focus hides the docks');
  D.toggleFocus(false); await sleep(100);
  // 11. layout is saved
  await sleep(500);
  const st = await api.getSettings(); ok(st.dock && JSON.stringify(st.dock) === JSON.stringify(D.state()), 'layout saved in settings');
  // 12. presets
  D.applyPreset('reading'); await sleep(150); ok(D.panels().every(p => where(p.id) === 'hidden'), 'Reading preset hides all panels');
  D.applyPreset('tabs'); await sleep(150); ok(D.located('search').g.panels.length === 6, 'Compact preset: 6 tabs on the right (with Book search and Compare)');
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
  ok(document.querySelector('#view td[data-col="0"] > sup.vnum') && getComputedStyle(document.querySelector('#view td.vn .vno')).display === 'none', 'verse numbers in the text');
  document.getElementById('chapNum').value = 'drop'; document.getElementById('chapNum').dispatchEvent(new Event('change')); await sleep(600);
  ok(document.querySelector('#view tr[data-v="1"] .dropcap'), 'large chapter number at verse 1');
  document.getElementById('vnStyle').value = 'circle'; document.getElementById('vnStyle').dispatchEvent(new Event('change')); await sleep(100);
  document.getElementById('bgTexture').value = 'paper'; document.getElementById('bgTexture').dispatchEvent(new Event('change')); await sleep(100);
  ok(getComputedStyle(document.querySelector('#view .bvtext')).backgroundImage.startsWith('url'), 'paper texture behind the text');
  document.getElementById('colWoj').value = '#00aa00'; document.getElementById('colWoj').dispatchEvent(new Event('input')); await sleep(100);
  const woj = document.querySelector('#view .woj'); ok(woj && getComputedStyle(woj).color === 'rgb(0, 170, 0)', 'own colour for words of Jesus');
  document.querySelector('#optNav [data-o="mods"]').click(); await sleep(100);
  ok(document.getElementById('apPlacement').offsetParent && document.getElementById('folderList').children.length, 'Modules page holds Apocrypha, dictionaries, folders');
  const st2 = await api.getSettings(); ok(st2.appearance.skin === 'midnight' && st2.appearance.fontText === 'Literata' && st2.appearance.vnPos === 'inline', 'appearance saved');
  // highlight offsets must ignore the inline verse number
  document.getElementById('optDone').click(); await sleep(100);
  ok(document.getElementById('optionsDlg').classList.contains('hidden'), 'Done closes Options');
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
})();
