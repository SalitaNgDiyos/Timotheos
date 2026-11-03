// 0.4.7: lemmas, intralinear view, footnote marks, a Bible's own switches, compare panel, reading aloud
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
const sec = i => document.querySelectorAll('#view > .bv')[i];
(async () => {
  await sleep(3000);
  const lt = state.modules.bibles.find(b => /lemmatest/.test(b.name)); const tg = state.modules.bibles.find(b => /toggletest/.test(b.name));
  await useBible(lt.id); await go({ b: 43, c: 3, v: 16 }); await sleep(800);
  // lemmas
  sec(0).querySelector('.bvside [data-k="lemma"]').click(); await sleep(700);
  ok(sec(0).querySelector('sup.lemma') && /ἀγαπάω/.test(sec(0).querySelector('[data-v="16"]').textContent), 'L: lemmas after the words: ' + [...sec(0).querySelectorAll('[data-v="16"] sup.lemma')].slice(0, 3).map(x => x.textContent).join(' '));
  sec(0).querySelector('.bvside [data-k="lemma"]').click(); await sleep(500);
  // intralinear view
  key('i', { altKey: true }); await sleep(900);
  const cw = [...sec(0).querySelectorAll('[data-v="16"] .cw')]; const loved = cw.find(c => /loved/.test(c.textContent));
  ok(cw.length >= 4 && loved && loved.querySelector('.cl-orig').textContent === 'ἀγαπάω' && loved.querySelector('.cl-tl').textContent === 'agapaō' && /G25/.test(loved.querySelector('.cl-strong').textContent),
    'Alt+I intralinear view: word over original, transliteration, Strong\'s: ' + (loved ? [...loved.children].map(x => x.textContent).join(' / ') : 'none'));
  sec(0).querySelector('[data-a="opts"]').click(); await sleep(300);
  const ml = [...document.querySelectorAll('.bvmenu .vcl')].find(c => c.value === 'morph'); ml.click(); await sleep(600);
  ok(!sec(0).querySelector('.cl-morph') && sec(0).querySelector('.cl-strong'), 'a line of the intralinear view can be left out (⚙)');
  document.querySelector('.bvmenu')?.remove();
  key('i', { altKey: true }); await sleep(600);
  ok(!sec(0).querySelector('.cw'), 'intralinear view off again');
  // a Bible's own switches (theWord user toggles)
  await useBible(tg.id); await go({ b: 43, c: 3, v: 16 }); await sleep(800);
  const t16 = () => sec(0).querySelector('[data-v="16"]').textContent;
  ok(/\[a variant reading\]/.test(t16()), 'the Bible\'s own switch V is on: ' + t16().slice(0, 60));
  sec(0).querySelector('[data-a="opts"]').click(); await sleep(300);
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
    sec(0).querySelector('[data-a="opts"]').click(); await sleep(300);
    document.querySelector('.bvmenu input[value="letter"]').click(); await sleep(600);
    ok(sec(0).querySelector('sup.fn').textContent === 'a', 'footnote marks as letters: ' + sec(0).querySelector('sup.fn').textContent);
    document.querySelector('.bvmenu .vfl').click(); await sleep(600);
    ok(sec(0).querySelector('.fnlist li'), 'footnotes listed under the chapter');
    document.querySelector('.bvmenu')?.remove();
  } else ok(true, '(no footnotes in this test chapter)');
  // compare panel
  key('m', { ctrlKey: true }); await sleep(1200);
  const rows = document.querySelectorAll('#cmpBody .cmprow');
  ok(rows.length >= 3 && /John 3/.test($('#cmpHead').textContent), 'Ctrl+M: the verse in ' + rows.length + ' Bibles · ' + $('#cmpHead').textContent.slice(0, 50));
  selectVerse(16); await sleep(900);
  ok(/3:16/.test($('#cmpHead').textContent), 'the Compare panel follows the verse');
  // reading aloud: starts, or (no voice on this machine) opens the voices window
  sec(0).querySelector('[data-a="speak"]').click(); await sleep(2500);
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
