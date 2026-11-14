/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Download modules: the repository list, a catalog, the eBible list, download and import, adding and removing a repository.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
  const until = async (f, n = 80) => { for (let i = 0; i < n; i++) { if (f()) return true; await sleep(200); } return false; };
  try {
    for (let i = 0; i < 80 && !document.querySelector('.bv .pv[data-v]'); i++) await sleep(250);
    const port = JSON.parse(TimotheosHost.info().env.TIMOTHEOS_REPOS).port; const base = 'http://127.0.0.1:' + port + '/';
    const before = state.modules.bibles.length;
    // units
    const csv = TimotheosDownload.parseCsv('"a","b"\r\n"x ""q"", y","2"\n"line\nbreak",3\n');
    ok(csv.length === 2 && csv[0].a === 'x "q", y' && csv[1].a === 'line\nbreak' && csv[1].b === '3', 'the list reader copes with quotes, commas and line breaks');
    let bad = ''; try { TimotheosDownload.readCatalog('<html>', base); } catch (e) { bad = e.message; }
    ok(/not hold a Timotheos catalog/.test(bad), 'a page that is not a catalog is refused with a plain message');
    runCommand('downloadModules');
    ok(await until(() => $('.dlmods')), 'the window opens');
    ok($('#modalTitle').textContent === 'Download modules', 'its title is "Download modules"');
    const opts = $$('#dlRepo option').map(o => o.textContent);
    ok(opts.join('|') === 'Timotheos|eBible.org', 'two repositories to begin with: ' + opts.join(', '));
    ok(/uses the internet only when you ask/.test($('.dlnote').textContent), 'it says when the internet is used');
    ok(await until(() => $('.dlrow')), 'the catalog of the Timotheos repository is listed');
    let rows = $$('.dlrow');
    ok(rows.length === 1 && /Catalog Bible/.test(rows[0].textContent), 'only entries with a title and an https address are listed (' + rows.length + ')');
    ok(/English · Bible · One verse\. · 50 bytes/.test(rows[0].textContent) && /Test/.test(rows[0].querySelector('small').textContent), 'language, kind, description, size and licence show');
    ok($('#dlFind').classList.contains('hidden'), 'no search box for a short list');
    rows[0].querySelector('.dlget').click();
    ok(await until(() => /Added:/.test($('#dlStatus').textContent)), 'download and import: ' + $('#dlStatus').textContent);
    ok(state.modules.bibles.length === before + 1 && state.modules.bibles.some(b => /Catalog Bible/i.test(b.id)), 'the Bible is in the library (' + state.modules.bibles.map(b => b.id).filter(i => /usf/.test(i)).join(',') + ')');
    ok($('.dlrow .dlget').disabled && $('.dlrow .dlget').textContent === 'Added', 'its button says Added');
    ok(!$('#modal').classList.contains('hidden') && $('.dlmods'), 'the window stays open for the next one');
    // eBible
    $('#dlRepo').value = 'ebible'; $('#dlRepo').dispatchEvent(new Event('change'));
    ok(await until(() => $('.dlrow')), 'the eBible list is fetched');
    rows = $$('.dlrow');
    ok(rows.length === 2 && !/Closed/.test($('#dlList').textContent), 'only translations that may be shared are listed (' + rows.length + ')');
    ok(/Alphabetic/.test(rows[0].textContent) && /Testish \(Testisch\)/.test(rows[1].textContent), 'sorted by language, with the language\'s own name');
    ok(/The "Test" Bible, one/.test(rows[1].textContent) && /New Testament, 2 books/.test(rows[1].textContent), 'title and contents are shown');
    rows[1].querySelector('.dlget').click();
    ok(await until(() => /Added:|not downloaded|could not/.test($('#dlStatus').textContent)), 'eBible download: ' + $('#dlStatus').textContent);
    const eb = state.modules.bibles.find(b => /tst-one/.test(b.id));
    ok(!!eb, 'the USFM zip became one Bible: ' + (eb && eb.id));
    if (eb) { const ch = await api.chapter([eb.id], 43, 3); ok(/God so loved/.test(JSON.stringify(ch)), 'John 3:16 can be read from it'); }
    // add a repository
    $('#dlAddBtn').click(); ok(!$('#dlAdd').classList.contains('hidden'), 'Add a repository shows the address box');
    $('#dlAddUrl').value = 'http://example.org/catalog.json'; $('#dlAddGo').click(); await sleep(300);
    ok(/starts with https/.test($('#dlStatus').textContent), 'an address that is not https is refused');
    $('#dlAddUrl').value = base + 'bad.json'; $('#dlAddGo').click();
    ok(await until(() => /Not added/.test($('#dlStatus').textContent)), 'an address without a catalog is not added: ' + $('#dlStatus').textContent);
    $('#dlAddUrl').value = base + 'catalog.json?mine'; $('#dlAddGo').click();
    ok(await until(() => /Added the repository/.test($('#dlStatus').textContent)), 'a catalog address is added: ' + $('#dlStatus').textContent);
    ok($$('#dlRepo option').length === 3 && $('#dlRepo').selectedOptions[0].textContent === 'Test repository', 'it is in the list under the catalog\'s own name and chosen');
    ok((state.settings.repos || []).length === 1 && (await api.getSettings()).repos.length === 1, 'and it is kept in the settings');
    ok(await until(() => $('.dlrow')) && $('#dlRemove'), 'its modules are listed, and it can be removed');
    $('#dlRemove').click(); await sleep(500);
    ok($$('#dlRepo option').length === 2 && !(state.settings.repos || []).length, 'Remove takes it out again');
    ok(state.modules.bibles.length === before + 2, 'the downloaded Bibles stay');
    // a failing download says so
    let err = ''; try { await TimotheosHost.net.get(base + 'nothing-here.zip', 'x.zip'); } catch (e) { err = e.message; }
    ok(/error 404/.test(err), 'a missing file gives a plain message: ' + err);
    err = ''; try { await TimotheosHost.net.get('file:///etc/passwd', 'x'); } catch (e) { err = e.message; }
    ok(/Only https/.test(err), 'nothing but https is fetched: ' + err);
    $('#modalBtns button').click(); await sleep(200);
    ok($('#modal').classList.contains('hidden'), 'Close closes the window');
  } catch (e) { ok(false, 'error: ' + (e && e.stack || e)); }
  console.log('RESULT ' + out.join(' | '));
})();
