// Batch 2: module switches, column text, word lookup, book search, module sets, several search panels,
// clipboard monitor, graphics viewer, printing, marks in books, export.
// Run: FOLDERS='["/home/claude/testmods","/home/claude/testmods4"]' test/run.sh test/tools.js shot.png 60
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s); const V = () => $('#view'); const S = T.S(); const pop = $('#popup');
  const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  try {
    await sleep(1200);
    const kjv = T.bibles().find(b => /^kjv\.ont$/i.test(b.file.split(/[\\/]/).pop()));
    const tg = T.bibles().find(b => /toggletest/.test(b.file)); const lt = T.bibles().find(b => /lemmatest/.test(b.file));
    // a Bible's own switches
    T.setOpen([tg.id]); await T.go(43, 3, 16); await sleep(400);
    let t16 = () => V().querySelector('[data-v="16"]').textContent;
    ok(/\[a variant reading\]/.test(t16()) && /GOD/.test(t16()), 'module switches on by default: ' + t16().slice(0, 70));
    V().closest('section').querySelector('[data-bv="opts"]').click(); await sleep(300);
    const bp = document.querySelector('.bvpop:not(.hidden)') || document.querySelector('.bvpop');
    const cbs = bp ? [...bp.querySelectorAll('[data-ct]')].map(c => c.dataset.ct) : [];
    ok(cbs.includes('V') && cbs.includes('K') && /Variants/.test(bp.textContent), "the Bible view's options list the Bible's own switches: " + cbs.join(','));
    key('Escape'); document.body.click(); await sleep(200);
    key('v'); await sleep(400);
    ok(!/variant reading/.test(t16()), 'key V switches the variant text off');
    key('k'); await sleep(400);
    ok(/God/.test(t16()) && !/GOD/.test(t16()), 'key K switches the rule off');
    key('v'); key('k'); await sleep(400);
    // column text
    T.setOpen([lt.id]); S.show.columns = true; await T.go(43, 3, 16); await sleep(500);
    const cw = [...V().querySelectorAll('[data-v="16"] .cw')];
    const loved = cw.find(c => /loved/.test(c.textContent));
    ok(cw.length >= 4 && loved && loved.querySelector('.cl-orig').textContent === 'ἀγαπάω' && loved.querySelector('.cl-tl').textContent === 'agapaō' && /G25/.test(loved.querySelector('.cl-strong').textContent) && /V-AAI-3S/.test(loved.querySelector('.cl-morph').textContent),
      'column text: word over original, transliteration, Strong\'s, morphology: ' + (loved ? [...loved.children].map(x => x.textContent).join(' / ') : 'none'));
    T.setOpen([kjv.id]); S.dictPref = { greek: T.books().find(m => /Greek Strongs/.test(m.file)).id }; await T.go(43, 3, 16); await sleep(1500);
    const lv2 = [...V().querySelectorAll('[data-v="16"] .cw')].find(c => /loved/.test(c.textContent));
    ok(lv2 && lv2.querySelector('.cl-orig').textContent === 'ἀγαπάω', 'without a lemma the original word comes from the Strong\'s dictionary: ' + (lv2 ? lv2.querySelector('.cl-orig').textContent : 'none'));
    S.colLines = { morph: false }; await T.go(43, 3, 16); await sleep(500);
    ok(!V().querySelector('.cl-morph') && V().querySelector('.cl-strong'), 'a line can be left out');
    S.colLines = {}; S.show.columns = false; await T.go(43, 3, 16); await sleep(300);
    ok(!V().querySelector('.cw') && !V().classList.contains('colmode'), 'column text off again');
    // word lookup dictionaries
    const tdct = T.books().find(m => /Test Dictionary/.test(m.file));
    S.wordLook = { on: true, dicts: [tdct.id] }; T.setOpen([T.bibles().find(b => /kjvplain/i.test(b.file)).id]); await T.go(1, 1, 1); await sleep(400);
    // find the word "beginning" on screen and rest the mouse on it
    const w = document.createTreeWalker(V().querySelector('[data-v="1"] [data-col]') || V(), NodeFilter.SHOW_TEXT); let node, at = -1;
    while ((node = w.nextNode())) { at = node.data.indexOf('beginning'); if (at >= 0) break; }
    const rg = document.createRange(); rg.setStart(node, at + 2); rg.setEnd(node, at + 3); const rc = rg.getBoundingClientRect();
    const tgt = document.elementFromPoint(rc.left + 1, rc.top + rc.height / 2);
    tgt.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: rc.left + 1, clientY: rc.top + rc.height / 2 })); await sleep(1200);
    ok(!pop.classList.contains('hidden') && /Beginning/.test(pop.textContent), 'word lookup: resting on “beginning” shows the dictionary entry: ' + pop.textContent.replace(/\s+/g, ' ').slice(0, 60));
    pop.classList.add('hidden'); S.wordLook.on = false;
    // book search, module sets, several search panels
    T.showPanel('bsearch'); await sleep(300);
    ok($('#p-bsearch') && $('#bSearchMods').offsetParent !== null, 'Book search is its own panel');
    $('#bSearchInput').value = 'grace'; $('#bSearchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(3000);
    const hits = [...document.querySelectorAll('#bSearchResults li.bhit')];
    const mods = new Set(hits.map(h => h.dataset.tmod));
    ok(hits.length >= 3 && mods.size >= 2, 'book search finds topics in several modules: ' + hits.length + ' topics in ' + mods.size + ' modules; ' + $('#bSearchStatus').textContent.slice(0, 80));
    ok(hits.some(h => /covenant of grace/i.test(h.textContent)) && hits[0].querySelector('mark'), 'results show the words in context, marked');
    hits[0].querySelector('.r').dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sleep(900);
    ok(!pop.classList.contains('hidden') && pop.querySelector('.entry h4'), 'pointing at a result shows the whole topic: ' + (pop.querySelector('.entry h4')?.textContent || ''));
    hits[0].querySelector('.r').dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); await sleep(400);
    const dictId = tdct.id; S.moduleSets = { 'Only dictionary': [dictId] };
    T.showPanel('lib'); T.showPanel('bsearch'); await sleep(300);
    const ms = $('#bSearchMods'); ms.value = 'set:Only dictionary'; ms.dispatchEvent(new Event('change'));
    $('#bSearchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(1500);
    const h2 = [...document.querySelectorAll('#bSearchResults li.bhit')];
    ok(h2.length >= 1 && h2.every(h => h.dataset.tmod === dictId), 'a module set limits the search: ' + h2.length + ' in ' + new Set(h2.map(h => h.dataset.tmod)).size + ' module');
    h2[0].click(); await sleep(800);
    ok(/Grace/.test($('#libBody h4')?.textContent || ''), 'clicking a result opens it in the Library');
    // a second search panel searches on its own
    $('#sideBtn').click(); await sleep(200); $('#mAddSearch').click(); await sleep(600);
    const sv = document.querySelector('section.searchview[id^="p-search-"]');
    ok(sv && sv.querySelector('.s-input') && !sv.querySelector('#searchInput'), 'a new search panel: ' + (sv ? sv.id : 'none'));
    T.setOpen([kjv.id]);
    $('#searchInput').value = 'faith'; $('#searchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(1500);
    sv.querySelector('.s-input').value = 'charity'; sv.querySelector('.s-form').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(1500);
    ok(/faith/i.test($('#searchResults').textContent) && !/charity/i.test($('#searchStatus').textContent + $('#searchExplain').textContent) && /charity/i.test(sv.querySelector('.s-results').textContent), 'each search panel keeps its own search and results: ' + $('#searchStatus').textContent.slice(0, 30) + ' / ' + sv.querySelector('.s-status').textContent.slice(0, 30));
    // clipboard monitor (the test reads from a variable, not the real clipboard)
    let clip = 'nothing'; T.clipTestReader(async () => clip); T.setClipmon(true); await sleep(1500);
    clip = 'Our verse today is John 3:16, and also Rom 5:8; 8:28.'; await sleep(2200);
    const cw2 = $('#clipwin');
    ok(cw2 && !cw2.classList.contains('hidden') && cw2.querySelectorAll('.cref').length === 3 && /God so loved/.test(cw2.innerText.replace(/[GH]\d+/g, '').replace(/\s+/g, ' ')), 'clipboard monitor lists the copied references with their text: ' + (cw2 ? [...cw2.querySelectorAll('.cgo')].map(a => a.textContent).join(', ') : 'none'));
    cw2.querySelector('.cref:nth-child(2) .cgo').click(); await sleep(500);
    ok(S.ref.b === 45 && S.ref.c === 5, 'clicking one goes there');
    T.setClipmon(false); cw2.querySelector('.cclose').click();
    // graphics viewer
    const img = T.books().find(m => /Test Images/.test(m.file));
    T.showPanel('lib'); await sleep(200); const lm = $('#libMod'); lm.value = img.id; lm.dispatchEvent(new Event('change')); await sleep(1000);
    const ims = document.querySelectorAll('#libBody img');
    ok(ims.length === 2 && ims[0].naturalWidth === 80, 'pictures in an RTF entry are shown: ' + ims.length + ', ' + (ims[0] ? ims[0].naturalWidth + '×' + ims[0].naturalHeight : ''));
    ims[0].click(); await sleep(500);
    const gv = $('#gview');
    ok(gv && !gv.classList.contains('hidden') && /1 of 2/.test(gv.textContent), 'clicking a picture opens the graphics viewer: ' + (gv ? gv.querySelector('.gcap').textContent : ''));
    const gi = gv.querySelector('.gimg'); const w0 = gi.offsetWidth;
    gv.querySelector('.gstage').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })); await sleep(100);
    ok(gi.offsetWidth > w0, 'the wheel zooms: ' + w0 + ' → ' + gi.offsetWidth);
    gv.querySelector('[data-g="next"]').click(); await sleep(300);
    ok(/2 of 2/.test(gv.textContent) && gi.naturalWidth === 50, 'next picture');
    key('Escape'); await sleep(200);
    ok(gv.classList.contains('hidden'), 'Esc closes the viewer');
    // marks in a book topic
    const eb = $('#libBody .ebody'); const tw = document.createTreeWalker(eb, NodeFilter.SHOW_TEXT); let tn2, ix = -1;
    while ((tn2 = tw.nextNode())) { ix = tn2.data.indexOf('covenant'); if (ix >= 0) break; }
    const sr = document.createRange(); sr.setStart(tn2, ix); sr.setEnd(tn2, ix + 8); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(sr);
    eb.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(200);
    const ab = $('#abar');
    ok(ab && !ab.classList.contains('hidden'), 'selecting text in a topic shows the marking bar');
    ab.querySelector('[data-as="yellow"]').click(); await sleep(300);
    ok($('#libBody mark.hl-yellow')?.textContent === 'covenant', 'the selected words are highlighted');
    lm.value = T.books().find(m => /Test Book/.test(m.file)).id; lm.dispatchEvent(new Event('change')); await sleep(600);
    lm.value = img.id; lm.dispatchEvent(new Event('change')); await sleep(800);
    ok($('#libBody mark.hl-yellow')?.textContent === 'covenant', 'and the mark is still there when the topic is opened again');
    // printing (the print dialog is replaced for the test)
    let printed = 0; window.print = () => { printed++; };
    key('p', { ctrlKey: true }); await sleep(300);
    ok(printed === 1 && /Romans 5/.test($('#printArea .ptitle').textContent) && $('#printArea').querySelector('[data-v]'), 'Ctrl+P prints the chapter: ' + $('#printArea .ptitle').textContent);
    $('#libPrint').click(); await sleep(300);
    ok(printed === 2 && /Introduction/.test($('#printArea .ptitle').textContent) && $('#printArea img'), 'the Library topic can be printed: ' + $('#printArea .ptitle').textContent);
    // export: the documents made
    const dx = T.docxText('<h2>Grace</h2><p>Unmerited <b>favour</b>, ἀγάπη.</p>');
    ok(/<w:t xml:space="preserve">Grace<\/w:t>/.test(dx) && /<w:b\/><\/w:rPr><w:t xml:space="preserve">favour/.test(dx) && /ἀγάπη/.test(dx), 'export to Word: headings, bold, Greek');
    const rt = T.rtfOf('<p>Love <i>never</i> faileth – ἀγάπη</p>');
    ok(/^\{\\rtf1/.test(rt) && /\\i never/.test(rt) && /\\u947\?/.test(rt), 'export to RTF: italics and Greek letters');
    ok(document.querySelector('#libExport') && document.querySelector('#toolsBtn'), 'Export button in the Library, Tools menu in the title bar');
    $('#toolsBtn').click(); await sleep(200);
    ok($('#toolsMenu #tClip') && $('#toolsMenu #tSets') && $('#toolsMenu #tPrint') && $('#toolsMenu #tExp'), 'Tools menu: clipboard monitor, module sets, print, export');
    $('#toolsMenu').classList.add('hidden');
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
