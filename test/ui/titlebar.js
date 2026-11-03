// 0.4.3: skinned title bar + menus, User Guide window, word popup (morph first, resizable)
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
(async () => {
  await sleep(2500);
  const tb = document.getElementById('titlebar');
  ok(tb && document.querySelectorAll('.tmenu').length === 3, 'title bar with File / View / Help');
  const bg = () => getComputedStyle(tb).backgroundColor;
  ok(bg() === 'rgb(235, 230, 219)', 'title bar uses the Parchment skin: ' + bg());
  TimotheosOptions.setSkin('narra'); await sleep(200);
  ok(bg() === 'rgb(59, 42, 30)' && getComputedStyle(tb).color === 'rgb(246, 235, 221)', 'Narra: title bar ' + bg());
  TimotheosOptions.setSkin('sampaguita'); await sleep(200);
  ok(bg() === 'rgb(255, 255, 255)', 'Sampaguita: title bar ' + bg());
  // menus
  document.querySelector('.tmenu[data-i="2"]').click(); await sleep(100);
  const help = document.querySelector('.tmdrop[data-i="2"]');
  ok(!help.classList.contains('hidden') && help.textContent.includes('User Guide') && getComputedStyle(help).backgroundColor === 'rgb(255, 255, 255)', 'Help menu opens in the skin colours, lists User Guide');
  key('Escape'); await sleep(50); ok(help.classList.contains('hidden'), 'Esc closes the menu');
  key('v', { altKey: true }); await sleep(50); ok(!document.querySelector('.tmdrop[data-i="1"]').classList.contains('hidden'), 'Alt+V opens View');
  key('ArrowRight'); await sleep(50); ok(!help.classList.contains('hidden'), '→ moves to Help');
  key('Escape');
  // menu command runs
  document.querySelector('.tmenu[data-i="1"]').click(); await sleep(50);
  document.querySelector('.tmdrop [data-cmd="search"]').click(); await sleep(200);
  ok(TimotheosDock.isVisible('search'), 'View → Search opens the Search panel');
  key('F5'); await sleep(400); ok(!document.getElementById('modal').classList.contains('hidden') && document.getElementById('cvm'), 'F5 opens Copy verses');
  key('F5'); await sleep(200); ok(document.querySelectorAll('#cvm').length === 1, 'F5 inside the dialog does not open a second one');
  key('Escape'); await sleep(200);
  // popup: morphology before the Strong's entry
  const fake = document.createElement('span'); fake.dataset.strong = 'G26'; fake.dataset.morph = 'N-NSF';
  const html = await lookupHtml(fake); const d = document.createElement('div'); d.innerHTML = html;
  const hs = [...d.querySelectorAll('.entry h4')].map(h => h.textContent.trim());
  ok(hs.length === 2 && /N-NSF/.test(hs[0]) && /G26|ἀγάπη|agap/i.test(hs[1]), 'popup order: morphology first, then dictionary → ' + JSON.stringify(hs));
  const w = document.querySelector('#view [data-strong]') || document.querySelector('#view td[data-col="0"]');
  hoverEl = fake; showPopupHtml(w, html); await sleep(200);
  const pop = document.getElementById('popup');
  ok(getComputedStyle(pop).resize === 'both', 'popup can be resized from its corner');
  // simulate a resize by the corner
  const r = pop.getBoundingClientRect();
  pop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.right - 5, clientY: r.bottom - 5 }));
  pop.style.width = '600px'; pop.style.height = '420px';
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(400);
  const st = await api.getSettings();
  ok(st.appearance.popupSize && st.appearance.popupSize.w === 600 && st.appearance.popupSize.h === 420, 'popup size saved ' + JSON.stringify(st.appearance.popupSize));
  // guide
  runCommand('guide'); await sleep(1500);
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  console.log('RESULT ' + out.join(' | '));
})();
