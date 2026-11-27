// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// A closed panel leaves an empty space with the links "Add Panel" and "Split Space" (Edit Layout on or off).
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/addpanel.js /tmp/ap.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const areas = () => JSON.stringify(TimotheosDock.state().areas.map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1]));
try {
  await until(() => state.nav && state.nav.length);
  TimotheosDock.setDetachMode(false);
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1, y0: 0, x1: 2, y1: 3, panels: ['bv0'], active: 'bv0' }, { x0: 2, y0: 0, x1: 4, y1: 3, panels: ['cmt'], active: 'cmt' }], floats: [], hidden: ['lib', 'search', 'bsearch', 'study', 'par'] });
  await sl(500);
  $$('#workbench .dgroup').find(g => g.querySelector('.dtab[data-id="cmt"]')).querySelector('.dbtn[data-act="close"]').click(); await sl(500);
  ok($$('.dempty').length === 1 && !$('.dempty').textContent.includes('drag a panel'), 'one empty space, only links (no text)');
  ok(!!$('.dempty .dadd') && /Add Panel/.test($('.dempty .dadd').textContent), 'Add Panel link (Edit Layout off)');
  ok(!!$('.dempty .dsplit') && /Split Space/.test($('.dempty .dsplit').textContent), 'Split Space link (Edit Layout off)');
  const before = areas();
  $('.dempty .dadd').click(); await sl(300);
  const items = $$('.dadd-menu button').map(b => b.textContent);
  ok(items.includes('Bible View') && items.length >= 5, 'menu lists the panels: ' + items.join(', '));
  $$('.dadd-menu button').find(b => b.dataset.id === 'lib').click(); await sl(600);
  const st = TimotheosDock.state().areas;
  const lib = st.find(a => a.panels.includes('lib'));
  ok(!!lib && lib.x0 === 2 && lib.x1 === 4 && !$('.dempty'), 'Library fills the empty space, nothing else moved: ' + JSON.stringify(lib));
  ok(JSON.stringify(st.filter(a => !a.panels.includes('lib')).map(a => [a.panels.join('+'), a.x0, a.y0, a.x1, a.y1])) === JSON.stringify(JSON.parse(before).filter(a => a[0] !== 'lib')), 'other panels unchanged');
  // Split Space then Add Panel on a piece; a too-small space has no Split Space
  $$('#workbench .dgroup').find(g => g.querySelector('.dtab[data-id="lib"]')).querySelector('.dbtn[data-act="close"]').click(); await sl(500);
  $('.dempty .dsplit').click(); await sl(300);
  const c = $$('.ld-picker .ld-cell').find(x => x.dataset.c === '2' && x.dataset.r === '1'); if (c) { c.click(); await sl(500); }
  const n = $$('.dslot').length; ok(n >= 2 && $$('.dslot .dadd').length === n, `split into ${n} places, each shows Add Panel`);
  ok($$('.dslot').every(s => s.querySelector('.dsplit') || s.getBoundingClientRect().width < 400), 'Split Space only where it fits');
} catch (e) { ok(false, 'error ' + e.message); }
console.log('RESULT ' + out.join(' | '));
})();
