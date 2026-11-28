// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// 0.6.131: a click in the Bible text looks a word up only while a Library panel is open (otherwise it does nothing); right-click → Look up asks where the
// closed Library goes (the window map) and never covers another panel; no tabs anywhere.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/lookupplace.js /tmp/lp.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const A = (x, y, w, h, p) => ({ x0: x, y0: y, x1: x + w, y1: y + h, panels: p, active: p[0] });
const wordPoint = (tagged) => {   // the middle of a word in the Bible view (a Strong's-tagged word when asked and there is one)
  if (tagged) { const t = $('.bv [data-strong]'); if (t) { const b = t.getBoundingClientRect(); return { el: t, x: b.left + b.width / 2, y: b.top + b.height / 2, w: t.textContent.trim() }; } }
  const td = $$('.bv td, .bv .pv').find(t => /\p{L}{4,}/u.test(t.textContent)); const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) { const m = /\p{L}{4,}/u.exec(n.textContent); if (m && !n.parentElement.closest('sup, a, [data-strong]')) { const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const b = r.getBoundingClientRect(); return { el: n.parentElement, x: b.left + b.width / 2, y: b.top + b.height / 2, w: m[0] }; } }
};
const fire = (type, p, extra) => p.el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: type === 'contextmenu' ? 2 : 0, ...extra }));
try {
  await until(() => state.nav && state.nav.length && $('.bv td'));
  TimotheosDock.setDetachMode(false);
  TimotheosDock.setLayout({ v: 3, areas: [A(0, 0, 1, 3, ['tree']), A(1, 0, 3, 2, ['bv0']), A(1, 2, 3, 1, ['cmt', 'search', 'bsearch'])], floats: [], hidden: ['lib', 'study', 'par'] });
  await sl(700);
  let st = TimotheosDock.state();
  ok(st.areas.every(a => a.panels.length === 1) && ['cmt', 'search', 'bsearch'].every(id => st.areas.some(a => a.panels[0] === id)), 'an old tab group (Commentary + Search + Book Search) is split into three spaces');
  if (state.settings.clickLookup === false) { $('#clickLookup').checked = true; $('#clickLookup').dispatchEvent(new Event('change')); await sl(200); }   // an earlier run of this test left it off in the test profile
  ok(state.settings.clickLookup !== false && $('#clickLookup') && $('#clickLookup').checked, 'Options: Click a word is on: ' + state.settings.clickLookup + '/' + ($('#clickLookup') && $('#clickLookup').checked));
  const p = wordPoint(); fire('click', p); await sl(800);
  ok(!TimotheosDock.isVisible('lib') && !$('.placedlg'), `clicking “${p.w}” does nothing while there is no Library panel`);
  const pt = wordPoint(true); if (pt.el.matches('[data-strong]')) { fire('click', pt); await sl(800); ok(!TimotheosDock.isVisible('lib') && !$('.placedlg'), `clicking the Strong's word “${pt.w}” does nothing while there is no Library panel`); }
  const fn = $('.bv sup.fn, .bv sup.xref'); if (fn) { fn.click(); await sl(600); ok(!TimotheosDock.isVisible('lib') && !$('.placedlg'), 'clicking a footnote/cross-reference mark does not open the Library'); }
  const before = JSON.stringify(TimotheosDock.state().areas);
  fire('contextmenu', p); await sl(300);
  const look = [...$$('#ctxMenu button')].find(b => /Look up/.test(b.textContent));
  ok(!!look, 'right-click has Look up: ' + (look ? look.textContent : ''));
  look.click(); await sl(500);
  ok(!!$('.placedlg') && !TimotheosDock.isVisible('lib'), 'the Library is closed, so Timotheos asks first');
  ok(/right half of .*(Bible|AMB|Biblia|King|KJV|World)/i.test($('.pm-where').textContent) || /half of/.test($('.pm-where').textContent), 'it suggests: ' + $('.pm-where').textContent);
  ok(JSON.stringify(TimotheosDock.state().areas) === before, 'nothing changes before you confirm');
  $('.placedlg [data-a="cancel"]').click(); await sl(300);
  ok(!$('.placedlg') && !TimotheosDock.isVisible('lib'), 'Cancel: no Library, no change');
  fire('contextmenu', p); await sl(300); [...$$('#ctxMenu button')].find(b => /Look up/.test(b.textContent)).click(); await sl(500);
  // pick the lower half of Commentary instead of the suggestion
  const cm = $$('.placemap .pm-area').find(x => /Commentary/.test(x.textContent)); const r = cm.getBoundingClientRect();
  cm.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.bottom - 3 }));
  await sl(150); ok(/lower half of Commentary/.test($('.pm-where').textContent), 'choose another place: ' + $('.pm-where').textContent);
  $('.placedlg [data-a="ok"]').click(); await sl(1500);
  st = TimotheosDock.state();
  const lib = st.areas.find(a => a.panels[0] === 'lib'), cmt = st.areas.find(a => a.panels[0] === 'cmt');
  ok(TimotheosDock.isVisible('lib') && lib && lib.panels.length === 1 && cmt && Math.abs(lib.y0 - cmt.y1) < 0.01 && Math.abs(lib.x0 - cmt.x0) < 0.01, 'Add panel: the Library has its own space, under Commentary');
  ok(st.areas.every(a => a.panels.length === 1), 'no panel covers another');
  await until(() => !/Looking up/.test($('#libFeed').textContent), 30);
  ok(/Lookup|·|dictionary|topic/i.test($('#libFeed').textContent + $('#tab-lib').textContent), 'the lookup is shown in the Library');
  // with the Library open, right-click → Look up just fills it
  fire('contextmenu', p); await sl(300); [...$$('#ctxMenu button')].find(b => /Look up/.test(b.textContent)).click(); await sl(500);
  ok(!$('.placedlg'), 'Library open: no question');
  // with the Library open a left click looks the word up in it; closed, a click does nothing; the setting off: never
  fire('click', wordPoint(true)); await sl(1200);
  ok(!$('.placedlg') && /Lookup|·|dictionary|topic/i.test($('#libFeed').textContent), 'Library open: a left click looks the word up in it');
  TimotheosDock.hide('lib'); await sl(500);
  fire('click', wordPoint(true)); await sl(600);
  ok(!$('.placedlg') && !TimotheosDock.isVisible('lib'), 'Library closed: a left click does nothing (no question, no panel)');
  TimotheosDock.show('lib', { quiet: true }); await sl(500);
  $('#clickLookup').checked = false; $('#clickLookup').dispatchEvent(new Event('change')); await sl(200);
  ok(!window.TimotheosClickLookup.on(), 'setting off: a click never looks up');
  $('#clickLookup').checked = true; $('#clickLookup').dispatchEvent(new Event('change')); await sl(200);
  // Ctrl+F with Bible Search closed asks too
  TimotheosDock.hide('search'); await sl(400);
  window.runCommand('search'); await sl(500);
  ok(!!$('.placedlg') && /search/i.test($('#placeT').textContent), 'opening closed Bible Search asks too: ' + ($('#placeT') || {}).textContent);
} catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | '));
})();
