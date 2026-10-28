// Study tools and taking over data from Tanglaw 0.4 (run with LEGACY=1 test/run.sh test/study.js shot.png 30)
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o)));
  try {
    const S = T.S();
    ok(S.folders.includes('/home/claude/testmods') && S.open.length === 2 && S.skin === 'sampaguita', 'settings taken over from Tanglaw 0.4: ' + S.open.join(', ') + ' · skin ' + S.skin);
    const mk = document.querySelector('tr[data-v="16"] mark.hl-yellow');
    ok(mk && mk.textContent === 'loved', 'highlight brought over lands on "' + (mk && mk.textContent) + '"');
    const un = document.querySelector('.unote'); ok(un && /Rom 5:8/.test(un.textContent), 'note brought over shows under John 3:16');
    // keyboard: verse, history
    document.getElementById('view').focus();
    key('ArrowDown'); await sleep(200); ok(S.ref.v === 17, '↓ → verse ' + S.ref.v);
    await T.go(19, 23); await sleep(500); ok(!document.querySelector('[data-st="marks"]') && !/Bookmark/.test(document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')), 'no bookmarks anywhere');
    key('ArrowLeft', { altKey: true }); await sleep(700); ok(S.ref.b === 43 && S.ref.c === 3, 'Alt+← → back to John 3');
    key('2', { code: 'Digit2' }); key('1', { code: 'Digit1' }); await sleep(900); ok(S.ref.v === 21, 'typing 21 → verse ' + S.ref.v);
    key('L', { key: 'l', ctrlKey: true }); await sleep(300);
    // highlight a word by selection + verse menu
    const td = document.querySelector('tr[data-v="21"] td[data-col="0"]');
    const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT); let n, node, off; while ((n = w.nextNode())) { const i = n.textContent.indexOf('truth'); if (i >= 0) { node = n; off = i; break; } }
    const r = document.createRange(); r.setStart(node, off); r.setEnd(node, off + 5); getSelection().removeAllRanges(); getSelection().addRange(r);
    const rc = r.getBoundingClientRect(); node.parentElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rc.left + 2, clientY: rc.top + 3 })); await sleep(200);
    ok(!document.getElementById('vmenu').classList.contains('hidden') && /Highlight selection/.test(document.getElementById('vmenu').textContent), 'verse menu opens on right-click');
    document.querySelector('#vmenu [data-s="green"]').click(); await sleep(800);
    const g = document.querySelector('tr[data-v="21"] mark.hl-green'); ok(g && g.textContent === 'truth', 'new highlight: "' + (g && g.textContent) + '"');
    // My Study panel
    T.showPanel('study'); await sleep(800);
    ok(document.querySelectorAll('#studyBody .vlist li').length === 2 && /Rom 5:8/.test(document.getElementById('studyBody').textContent) && /John 3:21|Jn 3:21|John 3:21/.test(document.getElementById('studyBody').textContent) || /3:21/.test(document.getElementById('studyBody').textContent), 'verse list: ' + [...document.querySelectorAll('#studyBody .vlist a')].map(a => a.textContent).join(', '));
    await sleep(500);
    const saved = await window.__TAURI_INTERNALS__.invoke('ud_load');
    ok(saved.highlights['tw:kjv.ont']['43.3.21'] && saved.lists['My verses'].length === 2 && saved.notes['43.3.16'], 'study data saved in the new Tanglaw\'s own file');
    window.__shot = true;
  } catch (e) { ok(false, 'error: ' + (e.stack || e)); }
  window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
})();
