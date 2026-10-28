// 0.7: RichView book modules, reading aloud, the Library side bar, Bible search and Book search apart, Bible view side bar.
// Run: python3 test/make-rvf.py /home/claude/testmods4; FOLDERS='["/home/claude/testmods","/home/claude/testmods4"]' test/run.sh test/newui.js shot.png 80
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s);
  const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  try {
    await sleep(1200);
    const kjv = T.bibles().find(b => /^kjv\.ont$/i.test(b.file.split(/[\\/]/).pop()));
    T.setOpen([kjv.id]); await T.go(43, 3, 16); await sleep(400);
    // RichView module in the Library
    const rv = T.books().find(m => /RVF Test/.test(m.file));
    ok(rv, 'the RichView module is listed: ' + (rv ? rv.title + ' (' + rv.kind + ')' : 'none'));
    T.showPanel('lib'); await sleep(200);
    const lm = $('#libMod'); lm.value = rv.id; lm.dispatchEvent(new Event('change'));
    for (let i = 0; i < 40 && !/free favour/.test($('#libBody')?.textContent || ''); i++) await sleep(250);
    const body = $('#libBody');
    ok(/Grace is the free favour of God/.test(body.textContent), 'RichView text is shown: ' + body.textContent.replace(/\s+/g, ' ').slice(0, 70));
    const bold = [...body.querySelectorAll('.rvp span')].find(s => /^Grace$/.test(s.textContent));
    ok(bold && /bold/.test(bold.style.fontWeight + getComputedStyle(bold).fontWeight + '') || (bold && +getComputedStyle(bold).fontWeight >= 600), 'bold text stays bold');
    const red = [...body.querySelectorAll('.rvp span')].find(s => /Not of works/.test(s.textContent));
    ok(red && getComputedStyle(red).fontStyle === 'italic' && /255, 0, 0|#f00/.test(red.style.color + getComputedStyle(red).color), 'red italic text: ' + (red ? getComputedStyle(red).color : 'none'));
    const p0 = body.querySelector('.rvp');
    ok(p0 && p0.style.textAlign === 'center', 'a centred paragraph');
    const lk = body.querySelector('a.link');
    ok(lk && /49\.2\.8/.test(lk.dataset.href || ''), 'a RichView link to a verse: ' + (lk ? lk.textContent + ' → ' + lk.dataset.href : 'none'));
    if (lk) { lk.click(); await sleep(700); ok(T.S().ref.b === 49 && T.S().ref.c === 2, 'clicking it goes to Ephesians 2: ' + $('#capRef').textContent); }
    // Library side bar
    const split = $('#p-lib .libsplit');
    $('#libList').click(); await sleep(150);
    ok(split.classList.contains('nolist'), 'side bar: hide the topic list');
    $('#libList').click(); await sleep(150);
    ok(!split.classList.contains('nolist'), 'and show it again');
    $('#libLarge').click(); await sleep(150);
    ok(/110%/.test($('#libBody').style.fontSize), 'side bar: larger text in the Library only: ' + $('#libBody').style.fontSize);
    ok(!$('#view').style.fontSize || !/110/.test($('#view').getAttribute('style') || ''), 'the Bible view keeps its size');
    $('#libSmall').click(); await sleep(150);
    ok(!$('#libBody').style.fontSize, 'and back');
    ok($('#libSpeak') && $('#libPrint') && $('#libExport') && $('#libProps'), 'side bar: read aloud, print, export, properties');
    // Book search and Bible search are two panels
    ok($('#p-search') && $('#p-bsearch') && !$('#searchMode'), 'Bible search and Book search are separate panels');
    T.S().moduleSets = { ...(T.S().moduleSets || {}), 'Only RVF': [rv.id] };
    T.showPanel('lib'); T.showPanel('bsearch'); await sleep(300);
    const ms = $('#bSearchMods'); ms.value = 'set:Only RVF'; ms.dispatchEvent(new Event('change'));
    $('#bSearchInput').value = 'favour'; $('#bSearchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(2000);
    const hits = [...document.querySelectorAll('#bSearchResults li.bhit')];
    ok(hits.length === 1 && hits[0].dataset.tmod === rv.id, 'Book search finds words inside RichView topics: ' + hits.length + ' · ' + $('#bSearchStatus').textContent.slice(0, 60));
    T.showPanel('search'); await sleep(200);
    $('#searchInput').value = 'favour'; $('#searchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(2000);
    ok(document.querySelectorAll('#searchResults li[data-b]').length > 0 && !document.querySelector('#searchResults li.bhit'), 'Bible search shows only verses: ' + $('#searchStatus').textContent.slice(0, 50));
    ok(document.querySelectorAll('#bSearchResults li.bhit').length === 1, 'and the Book search keeps its own results');
    // the Bible view side bar
    const sec = $('#view').closest('section');
    const sBtn = sec.querySelector('[data-bvt="strongs"]');
    const was = !!T.eff().strongs; sBtn.click(); await sleep(400);
    ok(!!T.eff().strongs !== was && sBtn.classList.contains('on') !== was, "side bar: Strong's numbers on and off in this view");
    sBtn.click(); await sleep(300);
    sec.querySelector('[data-bv="vn"]').click(); await sleep(250);
    const inl = document.querySelector('.bvpop [data-vp="inline"]'); inl.click(); inl.dispatchEvent(new Event('change')); await sleep(400);
    ok($('#view').dataset.vnpos === 'inline', 'side bar: verse numbers in the text, for this view');
    document.querySelector('.bvpop [data-vp="margin"]').click(); document.querySelector('.bvpop [data-vp="margin"]').dispatchEvent(new Event('change')); await sleep(300);
    document.querySelector('.bvpop')?.remove();
    // reading aloud: the button starts reading, or (no voice here) asks for one
    const sp = sec.querySelector('[data-bv="speak"]'); sp.click(); await sleep(6000);
    const dlg = [...document.querySelectorAll('.dlg')].find(d => /voices/i.test(d.textContent));
    ok(sp.classList.contains('on') || dlg, 'Read aloud: ' + (sp.classList.contains('on') ? 'reading' : dlg ? 'no voice on this machine, the voices window opened' : 'nothing happened'));
    if (sp.classList.contains('on')) { sp.click(); await sleep(400); ok(!sp.classList.contains('on'), 'clicking again stops'); }
    if (dlg) { [...dlg.querySelectorAll('button')].find(b => /Done|Close/.test(b.textContent))?.click(); await sleep(300); }
    $('#toolsBtn').click(); await sleep(200);
    ok($('#toolsMenu #tVoices'), 'Tools → Read aloud: voices…');
    $('#tVoices').click(); await sleep(6000);
    const vd = [...document.querySelectorAll('.dlg')].find(d => /voices found/.test(d.textContent));
    ok(vd && vd.querySelector('#ttsNext'), 'the voices window: ' + (vd ? vd.querySelector('p.small').textContent.slice(0, 80) : 'none'));
    key('Escape'); await sleep(300);
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
