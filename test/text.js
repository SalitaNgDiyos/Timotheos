// Bible text options: footnotes, paragraph mode, lemmas.
// Run: FOLDERS='["/home/claude/testmods","/home/claude/testmods4"]' test/run.sh test/text.js shot.png 30
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const V = () => document.getElementById('view');
  const VN = i => document.querySelector(`#p-${T.bvIds().filter(id => document.getElementById('p-' + id))[i]} .bview`);
  const S = T.S();
  try {
    await sleep(1200);
    const kjv = T.bibles().find(b => /^kjv\.ont$/i.test(b.file.split(/[\\/]/).pop()));
    const plain = T.bibles().find(b => /kjvplain/i.test(b.file));
    const lt = T.bibles().find(b => /lemmatest/.test(b.file));
    // footnotes are numbered through the chapter, not from 1 in every verse
    T.setOpen([kjv.id]); S.show.footnotes = true; await T.go(1, 1, 1); await sleep(400);
    let fns = [...V().querySelectorAll('sup.fn')].map(f => f.textContent);
    ok(fns.length > 2 && fns.slice(0, 4).join(',') === '1,2,3,4', 'footnotes numbered through the chapter: ' + fns.slice(0, 6).join(','));
    S.look.fnStyle = 'letter'; await T.go(1, 1, 1); await sleep(300);
    fns = [...V().querySelectorAll('sup.fn')].map(f => f.textContent);
    ok(fns.slice(0, 3).join(',') === 'a,b,c', 'footnote marks as letters: ' + fns.slice(0, 5).join(','));
    S.look.fnStyle = 'star'; await T.go(1, 1, 1); await sleep(300);
    ok([...V().querySelectorAll('sup.fn')].every(f => f.textContent === '*'), 'footnote marks as stars');
    S.look.fnStyle = 'num'; S.look.fnPlace = 'chapter'; await T.go(1, 1, 1); await sleep(300);
    const fl = V().querySelector('.fnlist');
    ok(fl && fl.querySelectorAll('li').length === V().querySelectorAll('sup.fn').length, 'footnotes listed under the chapter: ' + (fl ? fl.querySelectorAll('li').length : 0));
    ok(fl && /Heb|light|moving|creature|open/i.test(fl.textContent), 'footnote list shows the notes: ' + (fl ? fl.textContent.slice(0, 80) : ''));
    fl.querySelectorAll('li')[1].click(); await sleep(200);
    ok(S.ref.v === +fl.querySelectorAll('li')[1].dataset.gov, 'clicking a listed footnote selects its verse (' + S.ref.v + ')');
    S.look.fnPlace = 'text';
    // two Bibles: each numbered on its own
    T.setOpen([kjv.id, lt.id]); await T.go(43, 3, 16); await sleep(400);
    const c1 = [...VN(1).querySelectorAll('sup.fn')].map(f => f.textContent);
    ok(c1[0] === '1', 'the second Bible view numbers its own footnotes from 1: ' + c1.join(','));
    // paragraph mode
    T.setOpen([kjv.id]); S.show.paragraph = true; await T.go(40, 5, 1); await sleep(400);
    const paras = [...V().querySelectorAll('.paraview p.ppara')].filter(p => p.textContent.trim());
    ok(V().querySelector('.paraview') && paras.length > 1 && V().querySelectorAll('.pv').length > 20, 'paragraph mode: ' + paras.length + ' paragraphs, ' + V().querySelectorAll('.pv').length + ' verses');
    ok(!V().querySelector('.vrow, table.chap'), 'no verse rows in paragraph mode');
    T.setOpen([plain.id, kjv.id]); await T.go(40, 5, 1); await sleep(400);
    const p0 = [...VN(0).querySelectorAll('p.ppara')].filter(p => p.textContent.trim()).length;
    ok(p0 > 1 && VN(0).closest('section').querySelector('.bvbible').textContent === plain.abbr, 'a Bible without paragraph marks borrows them from the other view\'s Bible: ' + p0 + ' paragraphs');
    T.setActive(T.bvIds()[0]); const pv = V().querySelector('.pv[data-v="3"] .pvn'); pv.click(); await sleep(200);
    ok(S.ref.v === 3 && V().querySelector('.pv[data-v="3"]').classList.contains('sel'), 'clicking a verse number in paragraph mode selects the verse');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true })); await sleep(400);
    ok(!V().querySelector('.paraview') && V().querySelector('.vrow'), 'P switches the active view back to verse by verse');
    // lemmas
    T.setOpen([lt.id]); S.show.lemma = true; await T.go(43, 3, 16); await sleep(400);
    const lem = [...V().querySelectorAll('[data-v="16"] sup.lemma')].map(x => x.textContent);
    ok(lem.includes('ἀγαπάω') && lem.includes('θεός'), 'lemmas shown after the words: ' + lem.join(' '));
    S.show.lemma = false; await T.go(43, 3, 16); await sleep(300);
    ok(!V().querySelector('sup.lemma'), 'lemmas hidden when switched off');
    // the view's side bar has the switches
    const sec0 = V().closest('section');
    ok(sec0.querySelector('[data-bvt="paragraph"]') && sec0.querySelector('[data-bvt="lemma"]'), 'side bar of the Bible view: paragraphs and lemmas');
    sec0.querySelector('[data-bv="opts"]').click(); await sleep(200);
    ok(document.querySelector('.bvpop [data-o="lemma"]') && document.querySelector('.bvpop [data-o="paragraph"]'), 'and in its ⚙ options');
    document.querySelector('.bvpop')?.remove();

    // the Bibles menu: order, hide, sets, a font for one Bible
    const $ = s => document.querySelector(s);
    S.show.paragraph = false; T.setOpen([kjv.id, lt.id]); await T.go(43, 3, 16); await sleep(300);
    T.setActive(T.bvIds()[0]); $('#biblesBtn').click(); await sleep(200);
    $(`#bibleMenu [data-use="${plain.id}"]`).click(); await sleep(500);
    ok(VN(0).closest('section').querySelector('.bvbible').textContent === plain.abbr, 'Bibles menu: a click shows that Bible in the active view');
    $('#biblesBtn').click(); await sleep(200); const nv = T.bvIds().length;
    $(`#bibleMenu [data-newv="${kjv.id}"]`).click(); await sleep(600);
    ok(T.bvIds().length === nv + 1 && document.querySelectorAll('#zone-center section.bvsec').length === 3, 'Bibles menu: ＋ opens it in a new Bible view: ' + document.querySelectorAll('#zone-center section.bvsec').length + ' views');
    $('#biblesBtn').click(); await sleep(200);
    $(`#bibleMenu [data-hide="${plain.id}"]`).click(); await sleep(200);
    T.setActive(T.bvIds().filter(id => document.getElementById('p-' + id))[1]); $('#biblesBtn').click(); await sleep(100); $('#biblesBtn').click(); await sleep(200);
    ok(S.hiddenBibles.includes(plain.id) && !$(`#bibleMenu [data-use="${plain.id}"]`), 'a Bible can be hidden from the list');
    $('#mShowHid').click(); await sleep(200);
    ok($(`#bibleMenu [data-use="${plain.id}"]`), 'and shown again with “Show the hidden Bibles”');
    S.bibleSets = { 'Just KJV': [kjv.id] }; $('#biblesBtn').click(); await sleep(100); $('#biblesBtn').click(); await sleep(200);
    $('#bibleMenu [data-set="Just KJV"]').click(); await sleep(400);
    ok(document.querySelectorAll('#zone-center section.bvsec').length === 1 && VN(0).closest('section').querySelector('.bvbible').textContent === 'KJV', 'choosing a Bible set opens its Bibles, one view each');
    $('#bibleMenu').classList.add('hidden');
    S.bibleFonts = { [kjv.id]: { font: 'Cardo', size: 120 } }; await T.go(43, 3, 16); await sleep(300);
    const st = V().getAttribute('style') || '';
    ok(/Cardo/.test(st) && /font-size:120%/.test(st), 'a font and size for one Bible: ' + st);
    S.bibleFonts = {};
    // word popups: the original word and transliteration, from the Strong's dictionary chosen
    const gs = T.books().find(m => /Greek Strongs/.test(m.file));
    S.dictPref = { greek: gs.id }; await T.go(43, 3, 16); await sleep(300);
    let w = [...V().querySelectorAll('[data-v="16"] [data-strong]')].find(x => /G25\b/.test(x.dataset.strong));
    await T.showWord(w, true); await sleep(500);
    const pop = $('#popup');
    ok(/ἀγαπάω/.test(pop.querySelector('.orig')?.textContent || '') && /agapaō/.test(pop.querySelector('.orig .tl')?.textContent || ''), 'popup shows the original word and transliteration: ' + (pop.querySelector('.orig')?.textContent || 'none'));
    ok(/Greek Strongs test/.test(pop.textContent), 'from the Strong\'s dictionary chosen for Greek');
    ok(pop.querySelector('.ptools [data-pt="pin"]') && pop.querySelector('.ptools [data-pt="copy"]'), 'popup has a bar: keep open, copy');
    pop.querySelector('[data-pt="pin"]').click(); await sleep(100);
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); pop.dispatchEvent(new MouseEvent('mouseleave')); await sleep(500);
    ok(!pop.classList.contains('hidden') && pop.classList.contains('pinned'), 'a kept popup stays open');
    pop.querySelector('[data-pt="close"]').click(); await sleep(100);
    ok(pop.classList.contains('hidden'), 'and closes with ×');
    // word order: morphology or Strong's first
    T.setOpen([lt.id]); await T.go(43, 3, 16); await sleep(300);
    w = [...V().querySelectorAll('[data-v="16"] [data-morph]')].find(x => /V-AAI/.test(x.dataset.morph));
    await T.showWord(w, true); await sleep(400);
    ok(pop.querySelector('.entry').classList.contains('morphe'), 'morphology first by default');
    S.wordOrder = 'strong'; await T.showWord(w, true); await sleep(400);
    ok(!pop.querySelector('.entry').classList.contains('morphe'), "Strong's entry first when chosen");
    S.wordOrder = 'morph'; pop.querySelector('[data-pt="close"]').click();
    // verse popups show every open Bible
    T.setOpen([kjv.id, lt.id]); S.show.xrefs = true; await T.go(43, 3, 16); await sleep(800);
    const xr = V().querySelector('a.xr');
    if (xr) { await T.showWord(xr, true); await sleep(400); ok(pop.querySelectorAll('.pvb').length === 2, 'verse popup shows both open Bibles: ' + pop.querySelectorAll('.pvb').length); pop.querySelector('[data-pt="close"]').click(); }
    else ok(false, 'no cross-reference to test the verse popup');
    // a book view that follows: a commentary moves with the verse, a dictionary with the word
    $('#sideBtn').click(); await sleep(200); $('#mAddBook').click(); await sleep(500);
    const kv = document.querySelector('section[id^="p-book-"]'); const ms = kv.querySelector('.vmod'); ms.value = gs.id; ms.dispatchEvent(new Event('change')); await sleep(800);
    kv.querySelector('.vfol').click(); await sleep(100);
    T.setOpen([kjv.id]); await T.go(43, 3, 16); await sleep(300);
    w = [...V().querySelectorAll('[data-v="16"] [data-strong]')].find(x => /G25\b/.test(x.dataset.strong));
    await T.showWord(w); await sleep(600);
    ok(/G25/.test(kv.querySelector('.vbody h4')?.textContent || ''), 'dictionary view follows the word: ' + (kv.querySelector('.vbody h4')?.textContent || ''));
    T.showPanel && T.showPanel('search');
    // search: references by book; pointing at one shows the verse
    const si = $('#searchInput'); si.value = 'love'; $('#searchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(2500);
    $('#searchTabs [data-sp="refs"]').click(); await sleep(300);
    const rr = document.querySelectorAll('#searchResults a.rref'); const rg = document.querySelectorAll('#searchResults .rgroup');
    ok(rr.length > 10 && rg.length > 3, 'search references grouped by book: ' + rg.length + ' books, ' + rr.length + ' references; ' + (rg[0]?.querySelector('.rgh')?.textContent || ''));
    rr[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(900);
    ok(!pop.classList.contains('hidden') && /love/i.test(pop.textContent), 'pointing at a reference shows the verse: ' + pop.textContent.replace(/\s+/g, ' ').slice(0, 70));
    rr[0].dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); await sleep(400);
    ok((S.search || {}).searchView === 'refs', 'the references view is remembered');
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
