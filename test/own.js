// Tanglaw's own way: compare view, keyboard shortcuts, new versions, words of Jesus / added words / headings.
// Run: FOLDERS='["/home/claude/testmods","/home/claude/testmods4"]' test/run.sh test/own.js shot.png 40
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s); const S = T.S();
  const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  try {
    await sleep(1200);
    const kjv = T.bibles().find(b => /^kjv\.ont$/i.test(b.file.split(/[\\/]/).pop())); const plain = T.bibles().find(b => /kjvplain/i.test(b.file));
    T.setOpen([kjv.id]); await T.go(43, 3, 16); await sleep(300);
    // compare view
    key('m', { ctrlKey: true }); await sleep(900);
    const cv = document.querySelector('section[id^="p-compare-"]');
    const rows = cv ? [...cv.querySelectorAll('.cmprow')] : [];
    ok(cv && rows.length >= 3, 'Ctrl+M opens the compare view: ' + rows.length + ' Bibles · ' + (cv ? cv.querySelector('.vhead').textContent : ''));
    ok(rows.some(r => /God so loved/.test(r.innerText.replace(/[GH]\d+/g, '').replace(/\s+/g, ' '))), 'it shows John 3:16 in each Bible');
    const marks = cv.querySelectorAll('mark.cdiff').length;
    ok(marks > 0, 'words that differ from the first Bible are marked: ' + marks);
    await T.go(43, 3, 17); await sleep(700);
    ok(/3:17/.test(cv.querySelector('.vhead').textContent), 'it follows the verse');
    cv.querySelector('.vctx').click(); await sleep(700);
    ok(cv.querySelectorAll('.vno').length >= 3 * rows.length && /15–19/.test(cv.querySelector('.vhead').textContent), 'with ±2 verses: ' + cv.querySelectorAll('.vno').length + ' numbers, ' + cv.querySelector('.vhead').textContent);
    // keyboard shortcuts: the card, changing a key
    key('/', { ctrlKey: true }); await sleep(400);
    const d = $('.dlg');
    ok(d && d.querySelectorAll('.kbtn').length >= 25 && /Previous chapter/.test(d.textContent), 'Ctrl+/ shows the keyboard shortcuts: ' + (d ? d.querySelectorAll('.kbtn').length : 0));
    d.querySelector('[data-kb="paragraph"]').click(); await sleep(100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Q', bubbles: true, cancelable: true })); await sleep(300);
    ok(d.querySelector('[data-kb="paragraph"]').textContent === 'Q' && S.keys.paragraph === 'Q', 'a key can be changed: paragraph mode → ' + S.keys.paragraph);
    [...d.querySelectorAll('button')].find(b => b.textContent === 'Close').click(); await sleep(300);
    const was = !!S.show.paragraph; key('q'); await sleep(400);
    ok(!!S.show.paragraph !== was, 'the new key works');
    key('p'); await sleep(300);
    ok(!!S.show.paragraph !== was, 'and the old one no longer does');
    key('q'); await sleep(300); delete S.keys.paragraph;
    key('s'); await sleep(400);
    ok(S.show.strongs === true && document.querySelector('#view sup.strong:not(.hide)'), "S shows the Strong's numbers (theWord's letter keys)");
    key('s'); await sleep(300);
    // new versions: comparing version numbers (no internet in the test)
    ok(T.newer('v0.6.1', '0.6.0') && T.newer('0.10.0', '0.9.9') && !T.newer('v0.6.0', '0.6.0') && !T.newer('0.5.9', '0.6.0'), 'version numbers compared correctly');
    $('#toolsBtn').click(); await sleep(200);
    ok($('#tUpd') && $('#tAuto') && $('#tKeys') && $('#tCmp'), 'Tools menu: new version, keyboard shortcuts, compare: ' + [...document.querySelectorAll('#toolsMenu button, #toolsMenu input')].map(b => b.id).join(','));
    $('#toolsMenu').classList.add('hidden');
    // words of Jesus, added words, headings
    S.look.addedStyle = 'brackets'; S.look.headStyle = 'caps'; S.look.wojColor = '#0055aa'; T.S(); await T.go(43, 3, 16);
    document.querySelector('#optBtn'); // apply as the Options window does
    window.__tanglaw.applyLookNow && window.__tanglaw.applyLookNow(); await sleep(300);
    const r = document.documentElement;
    ok(r.dataset.added === 'brackets' && r.dataset.head === 'caps', 'added words in [brackets], headings in small capitals');
    const w = document.querySelector('#view .woj');
    ok(w && getComputedStyle(w).color === 'rgb(0, 85, 170)', 'words of Jesus in my colour: ' + (w ? getComputedStyle(w).color : 'none'));
    const ad = document.querySelector('#view .added:not(.plain)');
    ok(!ad || getComputedStyle(ad, '::before').content === '"["', 'added word with a bracket before it');
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
