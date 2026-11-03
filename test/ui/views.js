// 0.4.6: Bible views – one Bible each, side bar per view, own text size, moving together or reading on alone
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const mm = async (i, t) => { const sec = [...document.querySelectorAll('#view > .bv')][i]; const b = sec.querySelector('[data-a="menu"]'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); await new Promise(r => setTimeout(r, 250)); const c = document.querySelector('.bvmenu.mainmenu input[data-t="' + t + '"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise(r => setTimeout(r, 600)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const secs = () => [...document.querySelectorAll('#view > .bv')];
(async () => {
  await sleep(2500);
  ok(secs().length === 2 && /KJV/.test(secs()[0].querySelector('.bvbible').textContent) && /Wycliffe/i.test(secs()[1].querySelector('.bvbible').textContent), 'two ticked Bibles → two Bible views: ' + secs().map(s => s.querySelector('.bvbible').textContent).join(', '));
  ok(secs()[0].querySelectorAll('tr[data-v]').length > 30 && secs()[1].querySelectorAll('tr[data-v]').length > 30, 'each view shows John 3 by itself');
  // side bar: Strong's only in the view where it is switched on
  await mm(1, 'sm');
  ok(state.active === 1 && effShow('strongs', 1) && !effShow('strongs', 0), "☰ Strong's and Morph: on in the second view only");
  ok(document.querySelector('[data-show="strongs"]').checked, 'the View menu shows the active view\'s settings');
  // paragraph mode in one view
  await mm(0, 'paragraph');
  ok(secs()[0].querySelector('.paraview') && secs()[1].querySelector('table.chapter'), '¶ in the first view: paragraphs there, verses in the second');
  await mm(0, 'paragraph');
  // verse numbers in the text, for one view
  secs()[0].querySelector('[data-a="menu"]').click(); await sleep(250); document.querySelector('.bvmenu.mainmenu button[data-t="opts"]').click(); await sleep(250);
  const vr = document.querySelector('.bvmenu input[name="vvn"][value="inline"]'); vr.checked = true; vr.dispatchEvent(new Event('change')); await sleep(600);
  ok(secs()[0].querySelector('.bvtext').dataset.vnpos === 'inline' && secs()[0].querySelector('sup.vnum') && secs()[1].querySelector('.bvtext').dataset.vnpos === 'margin', 'Options: verse numbers in the text in this view only');
  const vr2 = document.querySelector('.bvmenu input[name="vvn"][value=""]'); vr2.checked = true; vr2.dispatchEvent(new Event('change')); await sleep(500);
  document.querySelector('.bvmenu')?.remove();
  // font of one view
  secs()[0].querySelector('[data-a="font"]').click(); await sleep(300);
  const fs = document.querySelector('.bvmenu select'); fs.value = 'Literata'; fs.dispatchEvent(new Event('change')); await sleep(400);
  ok(/Literata/.test(getComputedStyle(secs()[0].querySelector('td[data-col="0"]')).fontFamily) && !/Literata/.test(getComputedStyle(secs()[1].querySelector('td[data-col="1"]')).fontFamily), 'Aa: Literata in the first view only');
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
  // a third view from the Bibles panel; close it again
  const li = [...document.querySelectorAll('#bibleList li')].find(l => /KJV10/.test(l.textContent));
  li.querySelector('input').click(); await sleep(1000);
  ok(secs().length === 3 && state.active === 2, 'ticking a Bible adds a view of its own: ' + secs().length + ' views');
  secs()[2].querySelector('[data-a="close"]').click(); await sleep(800);
  ok(secs().length === 2, '× closes the view');
  // the settings are kept
  const st = await api.getSettings();
  ok(st.views && st.views.length === 2 && st.views[0].font === 'Literata' && st.views[1].show && st.views[1].show.strongs === true, 'views saved: ' + JSON.stringify(st.views).slice(0, 120));
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
