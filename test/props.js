// Module properties, making files smaller, putting the original back, and importing with a report.
// Run test/props-setup.sh first, then: FOLDERS='["/tmp/claude-0/propmods"]' test/run.sh test/props.js shot.png 60
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const inv = (c, a) => window.__TAURI_INTERNALS__.invoke(c, a);
  const $ = s => document.querySelector(s);
  const P = '/tmp/claude-0/propmods/';
  try {
    await sleep(800);
    // a theWord Bible
    const kjv = T.bibles().find(b => /kjv\.ont$/i.test(b.file));
    document.getElementById('biblesBtn').click(); await sleep(300);
    document.querySelector(`[data-props="${kjv.id}"]`).click(); await sleep(1500);
    ok($('.ppbox') && /Properties/.test($('#ppTitle').textContent), 'Properties of a Bible: ' + $('#ppTitle')?.textContent + ' · ' + $('#ppCard')?.textContent.replace(/\s+/g, ' '));
    $('#ppNav [data-p="details"]').click(); await sleep(100);
    const st = $('.ppbox [data-key="short.title"]'); st.value = 'KJV (test)'; st.dispatchEvent(new Event('input'));
    ok(!$('#ppSave').disabled, 'Save is enabled after a change');
    $('#ppSave').click(); for (let i = 0; i < 40 && !/Saved/.test($('#ppNote').textContent); i++) await sleep(250);
    ok(/Saved/.test($('#ppNote').textContent), 'saved: ' + $('#ppNote').textContent);
    let f = await inv('mod_file', { path: P + 'kjv.ont' });
    ok(f.backup && /tanglaw-backup$/.test(f.backup), 'original kept: ' + (f.backup || 'no').split('/').pop());
    const kjv2 = T.bibles().find(b => /kjv\.ont$/i.test(b.file));
    await T.go(43, 3, 16); await sleep(500);
    ok(kjv2 && /world/.test(document.querySelector('#view [data-v="16"]')?.textContent || ''), 'the Bible still reads after the change' + (kjv2 ? '' : ' (not found; Bibles: ' + T.bibles().map(b => b.file.split('/').pop()).join(', ') + ' / ' + document.getElementById('status').textContent + ')') + ' view: ' + document.getElementById('view').textContent.slice(0, 60));
    $('#ppNav [data-p="file"]').click(); await sleep(100);
    $('#ppRestore').click(); await sleep(400); $('.dlg:last-child .dlgbox .primary').click(); await sleep(2500);
    f = await inv('mod_file', { path: P + 'kjv.ont' });
    ok(!f.backup && /original file is back/.test($('#ppNote').textContent), 'original put back');
    $('#ppClose').click(); await sleep(300);
    // a theWord dictionary: compress
    T.showPanel('lib'); await sleep(300);
    const dict = T.books().find(m => /Test Dictionary/.test(m.file));
    const sel = document.getElementById('libMod'); sel.value = dict.id; sel.dispatchEvent(new Event('change')); await sleep(800);
    const before = document.querySelector('#libBody').textContent;
    document.getElementById('libProps').click(); await sleep(1200);
    $('#ppNav [data-p="file"]').click(); await sleep(100);
    $('#ppZlib').checked = true; $('#ppCompress').click(); for (let i = 0; i < 40 && !/→/.test($('#ppResult')?.textContent || ''); i++) await sleep(250);
    ok(/→/.test($('#ppResult')?.textContent || '') && /compressed/.test($('#ppCard').textContent), 'Make smaller (compress): ' + $('#ppResult')?.textContent);
    $('#ppClose').click(); await sleep(1500);
    ok(document.querySelector('#libBody').textContent === before && before.length > 20, 'the compressed dictionary still shows the same text');
    // an e-Sword module: edit the About text
    const cmt = T.books().find(m => /TestCmt11\.cmti$/.test(m.file));
    await T.openProps(cmt.file, cmt.title); await sleep(1200);
    $('#ppEdit').click(); const ab = $('#ppAbout'); ab.innerHTML = '<p>Edited <b>about</b> text.</p>'; ab.dispatchEvent(new Event('input'));
    $('#ppSave').click(); for (let i = 0; i < 40 && !/Saved/.test($('#ppNote').textContent); i++) await sleep(250);
    const r = await inv('sql', { path: P + 'TestCmt11.cmti', query: 'select * from Details', params: [] });
    const col = r.columns.findIndex(c => /comments|information/i.test(c));
    ok(col >= 0 && /Edited <b>about<\/b> text/.test(r.rows[0][col]), 'e-Sword 11 About saved as HTML: ' + String(r.rows[0][col]).slice(0, 50));
    $('#ppClose').click(); await sleep(300);
    // import with a report
    const I = '/tmp/claude-0/imports/';
    T.importPaths(['kjvplain.ont', 'TestTopics.topx', 'Test.harx', 'Secret.ontx', 'setup.exe', 'notes.txt', 'pack.twzip'].map(n => I + n)); for (let i = 0; i < 60 && !document.querySelector('.imprep'); i++) await sleep(250);
    const rows = [...document.querySelectorAll('.imprep tr')].map(tr => tr.cells[0].textContent + ': ' + tr.cells[1].querySelector('.small').textContent.split(' · ')[0]);
    ok(rows.length === 7, 'import report lists ' + rows.length + ' files: ' + rows.join('; '));
    const st2 = n => [...document.querySelectorAll('.imprep tr')].find(tr => tr.cells[1].textContent.includes(n))?.cells[0].textContent;
    ok(st2('kjvplain.ont') === 'Added' && st2('TestTopics.topx') === 'Added' && st2('Test Book.gbk.twm') === 'Added', 'usable modules added (incl. one from inside a .twzip)');
    ok(st2('Secret.ontx') === 'Not added' && st2('setup.exe') === 'Not added' && st2('notes.txt') === 'Not added' && st2('Test.harx') === 'Not added', 'encrypted, installer, other files refused with a reason');
    $('.dlgbox .primary').click(); await sleep(800);
    ok(T.bibles().some(b => /kjvplain/i.test(b.file)) && T.books().some(m => /TestTopics/.test(m.file)), 'imported modules are now available');
    T.importPaths([I + 'kjvplain.ont']); for (let i = 0; i < 40 && !document.querySelector('.imprep'); i++) await sleep(250);
    ok(st2('kjvplain.ont') === 'Already there', 'importing the same file again: ' + st2('kjvplain.ont'));
    $('.dlgbox .primary').click();
  } catch (e) { ok(false, 'error: ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
