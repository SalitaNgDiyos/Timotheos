// 0.4.7: lemmas, intralinear view, footnote marks, a Bible's own switches, compare panel, reading aloud
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const mm = async (i, t) => { const sec = [...document.querySelectorAll('section.bv')][i]; const b = sec.querySelector('[data-a="menu"]'); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); await new Promise(r => setTimeout(r, 250)); const c = document.querySelector('.bvmenu.mainmenu input[data-t="' + t + '"]'); c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await new Promise(r => setTimeout(r, 400)); };
const openOpts = async i => { const sec = [...document.querySelectorAll('section.bv')][i]; sec.querySelector('[data-a="menu"]').click(); await new Promise(r => setTimeout(r, 250)); document.querySelector('.bvmenu.mainmenu button[data-t="opts"]').click(); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const sec = i => document.querySelectorAll('section.bv')[i];
(async () => {
  await sleep(3000);
  const lt = state.modules.bibles.find(b => /lemmatest/.test(b.name)); const tg = state.modules.bibles.find(b => /toggletest/.test(b.name));
  await useBible(lt.id); await go({ b: 43, c: 3, v: 16 }); await sleep(800);
  // lemmas
  await mm(0, 'lemma'); await sleep(300);
  ok(sec(0).querySelector('sup.lemma') && /ἀγαπάω/.test(sec(0).querySelector('[data-v="16"]').textContent), 'L: lemmas after the words: ' + [...sec(0).querySelectorAll('[data-v="16"] sup.lemma')].slice(0, 3).map(x => x.textContent).join(' '));
  await mm(0, 'lemma');
  // intralinear view
  key('i', { altKey: true }); await sleep(900);
  const cw = [...sec(0).querySelectorAll('[data-v="16"] .cw')]; const loved = cw.find(c => /loved/.test(c.textContent));
  ok(cw.length >= 4 && loved && loved.querySelector('.cl-orig').textContent === 'ἀγαπάω' && loved.querySelector('.cl-tl').textContent === 'agapaō' && /G25/.test(loved.querySelector('.cl-strong').textContent),
    'Alt+I intralinear view: word over original, transliteration, Strong\'s: ' + (loved ? [...loved.children].map(x => x.textContent).join(' / ') : 'none'));
  await openOpts(0); await sleep(300);
  const ml = [...document.querySelectorAll('.bvmenu .vcl')].find(c => c.value === 'morph'); ml.click(); await sleep(600);
  ok(!sec(0).querySelector('.cl-morph') && sec(0).querySelector('.cl-strong'), 'a line of the intralinear view can be left out (⚙)');
  document.querySelector('.bvmenu')?.remove();
  key('i', { altKey: true }); await sleep(600);
  ok(!sec(0).querySelector('.cw'), 'intralinear view off again');
  // a Bible's own switches (theWord user toggles)
  await useBible(tg.id); await go({ b: 43, c: 3, v: 16 }); await sleep(800);
  const t16 = () => sec(0).querySelector('[data-v="16"]').textContent;
  ok(/\[a variant reading\]/.test(t16()), 'the Bible\'s own switch V is on: ' + t16().slice(0, 60));
  await openOpts(0); await sleep(300);
  const sw = [...document.querySelectorAll('.bvmenu .vsw')].map(c => c.value);
  ok(sw.includes('V') && sw.includes('K'), "⚙ lists the Bible's own switches: " + sw.join(', '));
  document.querySelector('.bvmenu')?.remove();
  key('v'); await sleep(600);
  ok(!/variant reading/.test(t16()), 'key V switches the variant text off');
  key('v'); await sleep(500);
  // footnote marks
  const kjv = state.modules.bibles.find(b => /^kjv\.ont$/i.test(b.name)); await useBible(kjv.id); await go({ b: 43, c: 3, v: 2 }); await sleep(800);
  const fn0 = sec(0).querySelector('sup.fn');
  if (fn0) {
    await openOpts(0); await sleep(300);
    document.querySelector('.bvmenu input[value="letter"]').click(); await sleep(600);
    ok(sec(0).querySelector('sup.fn').textContent === 'a', 'footnote marks as letters: ' + sec(0).querySelector('sup.fn').textContent);
    document.querySelector('.bvmenu .vfl').click(); await sleep(600);
    ok(sec(0).querySelector('.fnlist li'), 'footnotes listed under the chapter');
    document.querySelector('.bvmenu')?.remove();
  } else ok(true, '(no footnotes in this test chapter)');
  ok(!document.getElementById('cmpBody') && !TimotheosDock.panel('compare'), 'the Compare panel is gone');
  // reading aloud: starts, or (no voice on this machine) opens the voices window
  sec(0).querySelector('[data-a="menu"]').click(); await sleep(250); document.querySelector('.bvmenu.mainmenu button[data-t="speak"]').click(); await sleep(2500);
  const speaking = TimotheosSpeech.isSpeaking(); const dlg = !$('#modal').classList.contains('hidden') && /voices/i.test($('#modalTitle').textContent);
  ok(speaking || dlg, 'read aloud: ' + (speaking ? 'reading' : dlg ? 'no voice on this machine – the voices window opened' : 'nothing happened'));
  if (speaking) TimotheosSpeech.stop();
  if (dlg) { $('#modalBtns button').click(); await sleep(300); }
  runCommand('voices'); await sleep(2000);
  ok(!$('#modal').classList.contains('hidden') && $('#ttsRate'), 'Read aloud: voices… window: ' + ($('#modalBody p') || {}).textContent);
  $('#modalBtns button')?.click(); await sleep(300);
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
