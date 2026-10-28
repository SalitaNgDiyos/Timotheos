// Batch 3: your own modules (book, commentary), section links (topic links), Tagalog.
// Run: FOLDERS='["/home/claude/testmods"]' test/run.sh test/user.js shot.png 60
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const report = () => window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
  const $ = s => document.querySelector(s); const sql = (path, query, params = []) => window.__TAURI_INTERNALS__.invoke('sql', { path, query, params });
  const dlg = () => document.querySelector('.dlg');
  const fill = (sel, v) => { const i = dlg().querySelector(sel); i.value = v; i.dispatchEvent(new Event(i.tagName === 'SELECT' ? 'change' : 'input')); };
  const press = label => [...dlg().querySelectorAll('button')].find(b => b.textContent.trim() === label).click();
  const ub = f => $(`#ubar [data-u="${f}"], #ubar [data-f="${f}"]`);
  try {
    await sleep(1200);
    // a new book of your own
    $('#toolsBtn').click(); await sleep(200); $('#tNewMod').click(); await sleep(300);
    fill('#umK', 'book'); fill('#umT', 'My Sermon Notes'); fill('#umA', 'MSN'); press('Make it'); await sleep(2500);
    const mb = T.books().find(m => /My Sermon Notes/.test(m.title));
    ok(mb && mb.user && mb.file.startsWith(T.modulesDir()), 'a new book of your own is made in the modules folder: ' + (mb ? mb.file : 'none'));
    const cfg = Object.fromEntries((await sql(mb.file, 'select name, value from config')).rows);
    ok(cfg.type === '3' && cfg.user === '1' && cfg.abbrev === 'MSN' && cfg['content.type'] === 'rtf', 'it is a theWord book module marked as a user module: type ' + cfg.type + ', user ' + cfg.user);
    ok($('#ubar') && /no topics yet/.test($('#libBody').textContent), 'the Library shows it with the edit bar');
    // + Topic, write, save
    ub('new').click(); await sleep(300); fill('#utS', 'Grace'); press('Add'); await sleep(1500);
    let eb = $('#libBody .ebody');
    ok(eb && eb.isContentEditable && $('#ubar [data-f="save"]'), 'a new topic opens for writing');
    eb.innerHTML = '<p>Grace is <b>unmerited favour</b>, see John 3:16.</p><h3>Second part</h3><p>More about grace here.</p>';
    ub('save').click(); await sleep(1500);
    eb = $('#libBody .ebody');
    ok(!eb.isContentEditable && eb.querySelector('[style*="bold"], b') && /^Grace is unmerited favour, see John 3:16\./.test(eb.textContent.trim()), 'saved and shown: ' + eb.textContent.slice(0, 60));
    ok(eb.querySelector('a[data-href*="43.3.16"]'), 'a written reference became a link');
    const row = (await sql(mb.file, "select t.id, c.data from topics t join content c on c.topic_id = t.id where t.subject = 'Grace'")).rows[0];
    ok(row && /^\{\\rtf1/.test(row[1]) && /\\b /.test(row[1]), 'kept as RTF in the module (theWord can read it)');
    const gid = row[0];
    // a sub-topic and a section link
    ub('new').click(); await sleep(300); fill('#utS', 'Grace in the Old Testament'); fill('#utW', 'child'); press('Add'); await sleep(1500);
    ub('save').click(); await sleep(1200);
    const tp = (await sql(mb.file, 'select id, pid, subject, content_type from topics order by id')).rows;
    ok(tp.some(r => r[2] === 'Grace in the Old Testament' && r[1] === gid), 'a sub-topic inside “Grace”');
    // back to Grace, mark "Second part" as a section
    [...document.querySelectorAll('#libTopics li')].find(li => li.textContent === 'Grace').click(); await sleep(800);
    ub('edit').click(); await sleep(300); eb = $('#libBody .ebody');
    const h3 = [...eb.querySelectorAll('*')].find(e => e.textContent === 'Second part' && !e.children.length) || eb;
    const tn = [...h3.childNodes].find(n => n.nodeType === 3) || h3.firstChild; const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, tn.length); getSelection().removeAllRanges(); getSelection().addRange(rg);
    ub('section').click(); await sleep(1800);
    const meta = (await sql(mb.file, "select t.id, t.pid, t.subject, t.content_type, c.data from topics t join content c on c.topic_id = t.id where t.content_type = 'meta'")).rows[0];
    ok(meta && meta[1] === gid && /Second part/.test(meta[2]) && /^meta=_twmgc_\ntype=link\nid=\d+\nanchor=bkm/.test(meta[4]), 'section link stored as a theWord topic link: ' + (meta ? JSON.stringify(meta[4]) : 'none'));
    const li = [...document.querySelectorAll('#libTopics li')].find(l => /Second part/.test(l.textContent));
    ok(li, 'the section is in the topic list');
    li.click(); await sleep(900);
    const anc = $('#libBody a.bkm');
    ok(anc && /Second part/.test($('#libBody h4').textContent) && /unmerited/.test($('#libBody').textContent), 'clicking it shows the topic at the section: ' + (anc ? anc.id : 'no anchor'));
    // rename and delete
    [...document.querySelectorAll('#libTopics li')].find(l => l.textContent === 'Grace in the Old Testament').click(); await sleep(700);
    ub('rename').click(); await sleep(300); fill('#urn', 'Grace in the OT'); press('Rename'); await sleep(1300);
    ok([...document.querySelectorAll('#libTopics li')].some(l => l.textContent === 'Grace in the OT'), 'rename a topic');
    ub('del').click(); await sleep(300); press('Delete'); await sleep(1300);
    ok(![...document.querySelectorAll('#libTopics li')].some(l => /Grace in the OT/.test(l.textContent)), 'delete a topic');
    // a commentary of your own
    $('#toolsBtn').click(); await sleep(200); $('#tNewMod').click(); await sleep(300);
    fill('#umK', 'commentary'); fill('#umT', 'My Verse Notes'); press('Make it'); await sleep(2500);
    const mc = T.books().find(m => /My Verse Notes/.test(m.title));
    ok(mc && mc.kind === 'commentary' && mc.user, 'a commentary of your own');
    await T.go(43, 3, 16); await sleep(300);
    ub('new').click(); await sleep(300);
    ok(dlg().querySelector('#urRef').value === 'John 3:16', 'a new comment starts at the current verse');
    fill('#urRef', 'John 3:16-17'); press('OK'); await sleep(1500);
    eb = $('#libBody .ebody'); eb.innerHTML = '<p>God gave his Son.</p>'; ub('save').click(); await sleep(1500);
    const br = (await sql(mc.file, 'select bi, ci, fvi, tvi from bible_refs')).rows[0];
    ok(br && br.join('.') === '43.3.16.17', 'the comment is on John 3:16–17: ' + (br || []).join('.'));
    T.showPanel('cmt'); await T.go(43, 3, 17); await sleep(800);
    const chip = [...document.querySelectorAll('#cmtChips .chip')].find(c => /MVN|My Verse/.test(c.textContent + c.title));
    if (chip) { chip.click(); await sleep(600); }
    ok(/God gave his Son/.test($('#cmtBody').textContent), 'the Commentary panel shows your comment on John 3:17');
    // Tagalog
    T.lang('tl'); await sleep(500);
    ok($('#biblesBtn .lbl').textContent === 'Mga Biblia' && $('#optBtn .lbl').textContent === 'Mga Opsyon' && $('#toolsBtn .lbl').textContent === 'Kagamitan', 'title bar in Tagalog: ' + $('#biblesBtn .lbl').textContent + ', ' + $('#optBtn .lbl').textContent);
    $('#optBtn').click(); await sleep(300);
    ok(/Mga talababa/.test($('#optMenu').textContent) && /Laki ng titik/.test($('#optMenu').textContent), 'Options menu in Tagalog');
    $('#optMenu').classList.add('hidden');
    ok(/For God sent not his Son/.test($('#view').innerText), 'the Bible text is not touched: ' + $('#view [data-v="17"]')?.textContent.slice(0, 50));
    ok([...document.querySelectorAll('.dtab')].some(t => /Komentaryo|Aklatan/.test(t.textContent)), 'panel tabs in Tagalog: ' + [...document.querySelectorAll('.dtab')].map(t => t.textContent.trim()).join(', '));
    $('#toolsBtn').click(); await sleep(300); [...document.querySelectorAll('#toolsMenu button')].find(b => /Salin sa Tagalog/.test(b.textContent)).click(); await sleep(400);
    const rows = dlg().querySelectorAll('.tlrow');
    ok(rows.length > 200, 'translation table to correct the Tagalog: ' + rows.length + ' phrases');
    press('Kanselahin'); await sleep(200);
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await report();
})();
