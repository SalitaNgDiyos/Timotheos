// Morphology popups and the quiet "cannot be opened". Run: FOLDERS='["/home/claude/testmods","/home/claude/testmods3"]' test/run.sh test/morph.js shot.png 35
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  try {
    await sleep(1500);
    const mt = T.bibles().find(b => /morphtest/.test(b.file));
    T.setOpen([mt.id]); await T.go(43, 3, 16); await sleep(500);
    const w = [...document.querySelectorAll('#view [data-v="16"] [data-morph]')].find(x => /V-AAI-3S/.test(x.dataset.morph));
    ok(w, 'word with a morphology code: ' + (w ? w.textContent + ' ' + w.dataset.morph : 'none'));
    await T.showWord(w); await sleep(600);
    const pop = document.getElementById('popup'); const ents = [...pop.querySelectorAll('.entry h4')].map(h => h.textContent.replace('Find in Bible', '').trim());
    ok(!pop.classList.contains('hidden') && /aorist active indicative/.test(pop.textContent), 'popup shows the morphology entry: ' + pop.textContent.slice(0, 90));
    ok(pop.querySelector('.entry.morphe') && pop.querySelector('.entry.morphe') === pop.querySelector('.entry'), 'morphology above the dictionary entry: ' + ents.join(' / '));
    ok(ents.some(e => /G25/.test(e)), "and the Strong's entry below it");
    // the popup goes when the mouse leaves the word (not into the popup); its size is remembered both ways
    w.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.getElementById('view') })); await sleep(500);
    ok(pop.classList.contains('hidden'), 'popup gone after the mouse left the word');
    T.S().popup = { w: 500, h: 520 }; await T.showWord(w); await sleep(400);
    ok(Math.abs(pop.offsetWidth - 500) < 3 && pop.offsetHeight <= 521 && getComputedStyle(pop).resize === 'both' && getComputedStyle(pop).maxHeight !== '360px', 'popup uses the size you gave it: ' + pop.offsetWidth + '×' + pop.offsetHeight + ', resize ' + getComputedStyle(pop).resize + ', max-height ' + getComputedStyle(pop).maxHeight);
    pop.dispatchEvent(new MouseEvent('mouseenter')); w.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: pop })); await sleep(500);
    ok(!pop.classList.contains('hidden'), 'moving into the popup keeps it open');
    pop.dispatchEvent(new MouseEvent('mouseleave')); await sleep(500);
    ok(pop.classList.contains('hidden'), 'and leaving the popup closes it');
    ok(!/could not be opened/.test(document.getElementById('status').textContent) && T.locked().length + T.books().filter(m => m.locked).length > 0, 'status line quiet about modules that cannot be opened (' + (T.locked().length + T.books().filter(m => m.locked).length) + ' skipped): ' + document.getElementById('status').textContent);
    document.getElementById('biblesBtn').click(); await sleep(200);
    ok(!/Cannot be opened/i.test(document.getElementById('bibleMenu').textContent), 'Bibles menu quiet too');
    document.getElementById('bibleMenu').classList.add('hidden');
    // a compressed dictionary whose entries are stored as text (like LSJ)
    const lsj = T.books().find(m => /Test LSJ/.test(m.file)); const tp = await lsj.topics(); const e = await lsj.topic(tp[0].id);
    ok(/unbroken, hard to break/.test(e.html), 'compressed entries stored as text are readable: ' + e.html.replace(/<[^>]+>/g, '').slice(0, 60));
    // RTF fonts: a special font is kept so its letters show where the font is installed
    const h = T.clean('<span style="font-family:\'AHRC Paleo\'">Yr%</span>');
    ok(/AHRC Paleo/.test(h), 'special RTF font kept: ' + h);
    // book order (a Bible with the Apocrypha)
    const kjva = T.bibles().find(b => /KJVA11/i.test(b.abbr + b.file)); T.setOpen([T.bibles().find(b => /^KJV$/i.test(b.abbr)).id, kjva.id]); await T.go(1, 1); await sleep(400);
    const names = () => [...document.querySelectorAll('#bookSel option')].map(o => o.textContent);
    const seq = (l, a) => l.slice(l.indexOf(a), l.indexOf(a) + 6).join(', ');
    ok(names().indexOf('Malachi') < names().indexOf('Tobit') && names().indexOf('Tobit') < names().indexOf('Matthew'), '1611 order: ' + seq(names(), 'Malachi'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })); await sleep(600);
    const o = document.getElementById('oOrder'); o.value = 'nets'; o.dispatchEvent(new Event('change')); await sleep(700);
    let n = names();
    ok(n.indexOf('Nehemiah') < n.indexOf('Esther') && n.indexOf('Esther') < n.indexOf('Judith') && n.indexOf('Judith') < n.indexOf('Tobit') && n.indexOf('Song of Solomon') < n.indexOf('Job') && n.indexOf('Malachi') < n.indexOf('Isaiah') && !document.querySelector('#bookSel optgroup[label^="Apocrypha"]'), 'NETS order: ' + seq(n, 'Esther') + ' … ' + seq(n, 'Song of Solomon'));
    o.value = 'orthodox'; o.dispatchEvent(new Event('change')); await sleep(700); n = names();
    ok(n.indexOf('Nehemiah') < n.indexOf('Tobit') && n.indexOf('Tobit') < n.indexOf('Judith') && n.indexOf('Judith') < n.indexOf('Esther') && n.indexOf('Psalms') < n.indexOf('Job') && n.indexOf('Job') < n.indexOf('Proverbs'), 'Greek Orthodox order: ' + seq(n, 'Tobit') + ' … ' + seq(n, 'Psalms'));
    await T.go(39, 4); T.step(1); await sleep(500);
    ok(document.getElementById('capRef').textContent.startsWith('Isaiah'), 'after Malachi 4 comes ' + document.getElementById('capRef').textContent);
    document.querySelector('.dlgbox .primary').click(); await sleep(200);
    ok(T.S().look.bookOrder === 'orthodox', 'book order kept in settings');
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
