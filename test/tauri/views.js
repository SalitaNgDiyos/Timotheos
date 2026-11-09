/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.4.6: Bible views – one Bible each, side bar per view, own text size, moving together or reading on alone
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const mm = async (i, t) => { const sec = [...document.querySelectorAll('section.bv')][i]; const b = sec.querySelector('[data-a="menu"]'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); await new Promise(r => setTimeout(r, 250)); const c = document.querySelector('.bvmenu.mainmenu input[data-t="' + t + '"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise(r => setTimeout(r, 600)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const secs = () => [...document.querySelectorAll('section.bv')];
(async () => {
  await sleep(2500);
  ok(secs().length === 2 && /KJV/.test(secs()[0].querySelector('.bvbible').textContent) && /Wycliffe/i.test(secs()[1].querySelector('.bvbible').textContent), 'two ticked Bibles → two Bible views: ' + secs().map(s => s.querySelector('.bvbible').textContent).join(', '));
  ok(secs()[0].querySelectorAll('.pv[data-v]').length > 30 && secs()[1].querySelectorAll('.pv[data-v]').length > 30, 'each view shows John 3 by itself');
  // side bar: Strong's only in the view where it is switched on
  await mm(1, 'sm');
  ok(state.active === 1 && effShow('strongs', 1) && !effShow('strongs', 0), "☰ Strong's and Morph: on in the second view only");
  ok(document.querySelector('[data-show="strongs"]').checked, 'the View menu shows the active view\'s settings');
  // paragraph mode in one view
  ok(secs()[0].querySelector('.paraview') && secs()[1].querySelector('.paraview') && !document.querySelector('.bvmenu [data-t="paragraph"]'), 'both views read as paragraphs; there is no verse-by-verse switch');
  // verse numbers in the text, for one view
  secs()[0].querySelector('[data-a="menu"]').click(); await sleep(250); document.querySelector('.bvmenu.mainmenu button[data-t="opts"]').click(); await sleep(250);
  ok(!document.querySelector('.bvmenu input[name="vvn"][value="margin"]'), 'no number column choice: the verses flow as paragraphs');
  const vr = document.querySelector('.bvmenu input[name="vvn"][value="hidden"]'); vr.checked = true; vr.dispatchEvent(new Event('change')); await sleep(600);
  ok(secs()[0].querySelector('.bvtext').dataset.vnpos === 'hidden' && !secs()[0].querySelector('sup.vnum') && secs()[1].querySelector('sup.vnum'), 'Options: verse numbers hidden in this view only');
  const vr2 = document.querySelector('.bvmenu input[name="vvn"][value=""]'); vr2.checked = true; vr2.dispatchEvent(new Event('change')); await sleep(500);
  document.querySelector('.bvmenu')?.remove();
  // font of one view
  secs()[0].querySelector('[data-a="font"]').click(); await sleep(300);
  const fs = document.querySelector('.bvmenu select'); fs.value = 'Literata'; fs.dispatchEvent(new Event('change')); await sleep(400);
  ok(/Literata/.test(getComputedStyle(secs()[0].querySelector('.pv[data-col="0"]')).fontFamily) && !/Literata/.test(getComputedStyle(secs()[1].querySelector('.pv[data-col="1"]')).fontFamily), 'Aa: Literata in the first view only');
  document.querySelector('.bvmenu')?.remove();
  // moving together
  go({ b: 45, c: 5, v: 8 }); await sleep(800);
  ok(secs().every(s => s.dataset.ref === '45.5'), 'both views move to Romans 5 together');
  // read on alone
  secs()[1].querySelector('[data-a="link"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  secs()[1].querySelector('[data-a="link"]').click(); await sleep(400);
  ok(!state.settings.views[1].linked && state.active === 1, 'link off: the second view reads on by itself');
  step(1); await sleep(800);
  ok(secs()[1].dataset.ref === '45.6' && secs()[0].dataset.ref === '45.5' && /Romans 6/.test(secs()[1].querySelector('.bvref').textContent), 'next chapter moves only the second view: ' + secs()[0].dataset.ref + ' / ' + secs()[1].dataset.ref);
  secs()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await sleep(300);
  ok(state.active === 0 && / 5:/.test($('#refInput').value), 'clicking the first view makes it active; the toolbar shows its chapter');
  secs()[1].querySelector('[data-a="link"]').click(); await sleep(700);
  ok(state.settings.views[1].linked && secs()[1].dataset.ref === '45.5', 'link on again: the second view rejoins at Romans 5');
  // choose another Bible for a view
  secs()[1].querySelector('[data-a="bible"]').click(); await sleep(300);
  const kb = [...document.querySelectorAll('.bvmenu [data-b]')].find(b => /kjvplain/i.test(b.dataset.b));
  kb.click(); await sleep(900);
  ok(/KJVp|kjvplain/i.test(secs()[1].querySelector('.bvbible').textContent) && state.settings.openBibles[1] === kb.dataset.b, 'the caption chooses another Bible for the view: ' + secs()[1].querySelector('.bvbible').textContent);
  // a third view from Panels → Bible View; close it again with the panel's × button
  document.getElementById('panelsBtn').click(); await sleep(200);
  document.querySelector('#panelsMenu [data-act="newbv"]').click(); await sleep(1200);
  ok(secs().length === 3 && state.active === 2 && TimotheosDock.located('bv2') && !TimotheosDock.located('bv2').hidden, 'Panels → Bible View adds a view panel of its own: ' + secs().length + ' views');
  ok(!document.getElementById('bvBiblesDrawer') && !document.getElementById('bibleList'), 'no Bibles drawer');
  document.querySelector('.dtab[data-id="bv2"]').closest('.dgroup').querySelector('[data-act="close"]').click(); await sleep(900);
  ok(secs().length === 2 && !TimotheosDock.located('bv2'), 'the panel × closes the view');
  // the settings are kept
  const st = await api.getSettings();
  ok(st.views && st.views.length === 2 && st.views[0].font === 'Literata' && st.views[1].show && st.views[1].show.strongs === true, 'views saved: ' + JSON.stringify(st.views).slice(0, 120));
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
