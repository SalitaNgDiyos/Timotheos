// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Translation Accuracy Rating against a stand-in AI service (node /home/claude/mockai/server.js on 127.0.0.1:8765):
// AI settings, the TAR dialog from the Parallel Bibles panel, a chapter rated and saved, the grades in the panel, the details.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/tar.js /tmp/tar.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 100) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const btn = re => $$('#modalBtns button').find(b => re.test(b.textContent));
try {
  await until(() => state.modules && state.modules.bibles.length >= 3 && state.nav && state.nav.length);
  const id = re => state.modules.bibles.find(b => re.test(b.id)).id;
  const amb = id(/amb\.nt/), ambv = id(/ambv/), wyc = id(/wycliffe/);
  save({ parSets: [{ id: 'p1', name: 'TAR test', bibles: [ambv, amb, wyc], base: ambv }], parSetId: 'p1' });
  TimotheosDock.setLayout({ v: 3, areas: [{ x0: 0, y0: 0, x1: 1, y1: 3, panels: ['tree'], active: 'tree' }, { x0: 1, y0: 0, x1: 2, y1: 3, panels: ['bv0'], active: 'bv0' }, { x0: 2, y0: 0, x1: 4, y1: 3, panels: ['par', 'cmt'], active: 'par' }], floats: [], hidden: ['lib', 'search', 'bsearch', 'study'] });
  await until(() => $('#tab-par .ptable')); await go({ b: 43, c: 3, v: 16 }); await sl(800);
  // AI settings
  const sd = TimotheosTAR.settingsDialog(); await sl(400);
  $('#aiProv').value = 'custom'; $('#aiProv').dispatchEvent(new Event('change'));
  $('#aiBase').value = 'http://127.0.0.1:8765/v1'; $('#aiKey').value = 'test-key';
  $('#aiList').click(); ok(await until(() => /2 models/.test($('#aiMsg').textContent)), 'List models: ' + $('#aiMsg').textContent);
  $('#aiModel').value = 'mock-model';
  $('#aiTest').click(); ok(await until(() => /It works/.test($('#aiMsg').textContent)), 'Test: ' + $('#aiMsg').textContent);
  if (window.__stage === 'ai') { console.log('RESULT ' + out.join(' | ')); return; }
  btn(/Save/).click(); const cfg = await sd;
  ok(cfg && cfg.provider === 'custom' && cfg.model === 'mock-model' && cfg.hasKey && !('key' in cfg), 'saved; the key does not come back to the page');
  ok(!JSON.stringify(state.settings).includes('test-key'), 'the key is not in the settings');
  // the TAR dialog from the panel
  $('#tab-par [data-a="tar"]').click();
  ok(await until(() => /Translation Accuracy Rating/.test($('#modalTitle').textContent) && $('#tarSrc')), 'TAR dialog opens from the panel');
  $('#tarSrc').value = ambv; $('#tarSrc').dispatchEvent(new Event('change'));
  $('#tarTr').value = amb; $('#tarTr').dispatchEvent(new Event('change'));
  document.querySelector('input[name="tarScope"][value="all"]').click(); await until(() => /verses in/.test($('#tarEst').textContent));
  ok(/hours/.test($('#tarEst').innerHTML), 'entire translation: a warning about time and cost: ' + $('#tarEst').textContent.slice(0, 90));
  document.querySelector('input[name="tarScope"][value="chapter"]').click(); await until(() => /in <b>1<\/b> chapter/.test($('#tarEst').innerHTML));
  ok(/Poor.*Not Bad.*Good.*Faithful/.test($('#modalBody').textContent), 'grades named Poor, Not Bad, Good, Faithful');
  if (window.__stage === 'dialog') { console.log('RESULT ' + out.join(' | ')); return; }
  btn(/Start rating/).click();
  ok(await until(() => $('#tarProg'), 30), 'progress strip shown');
  ok(await until(() => !$('#tarProg') && /Translation Accuracy Rating/.test($('#modalTitle').textContent) && !$('#modal').classList.contains('hidden'), 150), 'chapter rated');
  const big = $('#modalBody .tarbig'); ok(big && /%/.test(big.textContent), 'result: ' + (big ? big.textContent : $('#modalBody').textContent.slice(0, 120)));
  if (window.__stage === 'result') { console.log('RESULT ' + out.join(' | ')); return; }
  btn(/OK/).click(); await sl(800);
  const sum = await api.tarSummary(amb, ambv, 'formal');
  ok(sum.all.verses === 36 && sum.books[43].verses === 36, 'saved for this translation: ' + sum.all.verses + ' verses, ' + sum.all.score + '% ' + sum.all.grade.name);
  ok(await until(() => $$('#tab-par .tarb').length >= 30), 'grades shown in the panel: ' + $$('#tab-par .tarb').length);
  ok($$('#tab-par .tarb').every(b => b.dataset.tar === amb), 'only on the rated translation');
  $('#tab-par .pvrow.cur .tarb').click();
  ok(await until(() => /TAR · /.test($('#modalTitle').textContent) && /Word meaning/.test($('#modalBody').textContent) && /ἠγάπησεν/.test($('#modalBody').textContent)), 'verse details: measures and issues');
  if (window.__stage === 'detail') { console.log('RESULT ' + out.join(' | ')); return; }
  btn(/^OK$/).click(); await sl(300);
  // a second start skips what is rated
  $('#tab-par [data-a="tar"]').click(); await until(() => $('#tarSrc')); $('#tarSrc').value = ambv; $('#tarSrc').dispatchEvent(new Event('change')); $('#tarTr').value = amb; $('#tarTr').dispatchEvent(new Event('change'));
  await until(() => $('#tarSaved table'));
  ok(/Everything rated/.test($('#tarSaved').textContent), 'saved results listed in the dialog');
  if (window.__stage === 'saved') { console.log('RESULT ' + out.join(' | ')); return; }
  btn(/Close/).click();
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
