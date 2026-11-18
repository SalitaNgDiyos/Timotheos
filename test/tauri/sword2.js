// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Real SWORD modules (KJV, Luther, Matthew Henry, Treasury of David, Nave's, Strong's) imported in the app.
// The zips are made from /usr/share/sword (apt packages sword-text-*, sword-comm-*, sword-dict-*): see the commit message of 0.6.65.
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const T = (p, ms = 60000) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error('timeout')), ms))]);
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const D = '/tmp/swreal/';
  const r = (await T(api.importFiles(['KJV2006', 'Luther', 'MHCC', 'TDavid', 'Nave', 'StrongsGreek', 'StrongsHebrew'].map(n => D + n + '.zip')))).results;
  ok(r.length === 7 && r.every(x => /imported|updated/.test(x.status)), 'imported: ' + r.map(x => x.name + ':' + x.status + (x.reason ? '(' + x.reason + ')' : '')).join(' '));
  await api.rescan();
  const L = await api.describeModules();
  const b = L.bibles.filter(x => x.format === 'SWORD').map(x => x.id).sort().join();
  ok(b === 'sw:engKJV2006eb,sw:gerlut1545', 'SWORD Bibles listed: ' + b);
  const bk = L.books.filter(x => x.format === 'SWORD').map(x => x.kind + ':' + x.abbr).sort().join();
  ok(/commentary:MHCC/.test(bk) && /commentary:TDavid/.test(bk) && /dictionary:Nave/.test(bk) && /dictionary:StrongsGreek/.test(bk), 'SWORD books listed: ' + bk);
  const sg = L.books.find(x => x.abbr === 'StrongsGreek'); const sh = L.books.find(x => x.abbr === 'StrongsHebrew');
  ok(sg && sg.isStrong && sg.greek && sh && sh.hebrew, 'Strong\'s dictionaries recognised');
  const g = await T(api.bookLookup(sg.id, 'G25')); ok(g && /ἀγαπάω/.test(JSON.stringify(g)), 'Strong\'s G25 found: ' + JSON.stringify(g).slice(0, 80));
  const cm = await T(api.commentaries(45, 8, 28)); ok(JSON.stringify(cm).includes('MHCC') && JSON.stringify(cm).includes('Romans 8'), 'commentary for Romans 8:28: ' + JSON.stringify(cm).slice(0, 200));
  state.views[0].bible = 'sw:engKJV2006eb'; await go({ b: 43, c: 3, v: 16 }); await sl(2500);
  const t = document.querySelector('#workbench').innerText;
  ok(/For God so loved the world/.test(t) && !/<w |<note|<_HTML_/.test(t), 'KJV verse shown');
  ok(document.querySelectorAll('#workbench [data-strong]').length > 10, 'Strong\'s words on screen');
  ok(document.querySelectorAll('#workbench .woj').length > 0, 'words of Jesus');
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').slice(0, 300)); }
console.log('RESULT ' + out.join(' | ')); })();
