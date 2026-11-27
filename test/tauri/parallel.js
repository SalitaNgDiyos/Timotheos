// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Parallel Bibles panel: hidden at first and listed in Layout & Panels; first-time setup; columns, stacked, differences,
// Strong's light-up, following the main view, choosing among saved sets.
// FOLDERS='["/home/claude/partest"]' bash test/tauri/run.sh test/tauri/parallel.js /tmp/par.png 1500   (STAGE=... picks the end state)
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 60) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* */ } await sl(200); } return false; };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const stage = (window.__TEST_STAGE || '');
try {
  await until(() => state.modules && state.modules.bibles.length >= 3 && state.nav && state.nav.length, 100);
  ok(state.modules.bibles.length >= 3, 'Bibles: ' + state.modules.bibles.map(b => b.abbr).join(', '));
  const loc = TimotheosDock.located('par');
  ok(loc && loc.hidden, 'the new panel starts hidden');
  runCommand('panels'); await sl(500);
  ok(/Layout & Panels/.test($('#panelsMenu .pm-dlg-title').textContent) && /Parallel Bibles/.test($('#panelsMenu').textContent), 'listed in the Layout & Panels dialog');
  runCommand('panels'); await sl(200);
  // first time: the set-up dialog
  TimotheosDock.show('par', { quiet: true });
  ok(await until(() => /Set up Parallel Bibles/.test($('#modalTitle').textContent) && !$('#modal').classList.contains('hidden')), 'first time: the set-up dialog opens');
  const okBtn = () => $$('#modalBtns button').find(b => b.classList.contains('primary'));
  ok(okBtn().disabled, 'Save is off while fewer than 2 Bibles are picked');
  $$('.parcats [data-cat]').find(b => b.dataset.cat === 'Tagalog').click();
  ok($('#parName').value === 'Tagalog', 'a kind fills the name');
  const tick = abbr => { const b = state.modules.bibles.find(x => x.abbr === abbr); const r = $$('#parPick .ppr').find(x => x.dataset.id === b.id); r.querySelector('input').click(); };
  const ab = state.modules.bibles.map(b => b.abbr);
  tick(ab.find(a => /^AMB$/i.test(a)) || ab[0]); await sl(100);
  ok(okBtn().disabled && /1 of 8/.test($('#parCount').textContent), 'one picked: ' + $('#parCount').textContent);
  tick(ab.find(a => /AMBV/i.test(a)) || ab[1]); await sl(100);
  tick(ab.find(a => /wyc|purvey/i.test(a)) || ab[2]); await sl(100);
  ok(!okBtn().disabled && /3 of 8/.test($('#parCount').textContent), 'three picked: ' + $('#parCount').textContent);
  // order: move the third up
  const rows = $$('#parPick .ppr.on'); rows[2].querySelector('[data-mv="-1"]').click(); await sl(100);
  const order = $$('#parPick .ppr.on b').map(b => b.textContent);
  ok(order.length === 3, 'order after ▲: ' + order.join(','));
  if (stage === 'setup') { console.log('RESULT ' + out.join(' | ')); return; }
  okBtn().click();
  ok(await until(() => $('#tab-par .ptable .pvrow')), 'the set is drawn in columns');
  const set = state.settings.parSets[0];
  ok(set && set.name === 'Tagalog' && set.bibles.length === 3 && state.settings.parSetId === set.id, 'set saved: ' + JSON.stringify(set));
  ok($$('#tab-par .pth').length === 3 && $('#tab-par .pvrow.cur'), 'three columns, the current verse marked: ' + ($('#tab-par .pvrow.cur') || {}).dataset?.pv);
  // follow the main view
  await go({ b: 43, c: 1, v: 14 }); await sl(800);
  ok(/1:14/.test($('#tab-par .parpill').textContent) && $('#tab-par .pvrow.cur').dataset.pv === '14', 'follows the main view: ' + $('#tab-par .parpill').textContent);
  // Strong's light-up
  const w = $('#tab-par [data-strong]');
  if (w) { w.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await sl(100); ok($$('#tab-par .phl').length >= 1, 'Strong\'s ' + w.dataset.strong + ' lights up ' + $$('#tab-par .phl').length + ' words'); }
  else ok(false, 'no tagged word found');
  // differences
  $('#tab-par [data-a="diff"]').click(); await until(() => $('#tab-par mark.dif'));
  ok($$('#tab-par mark.dif').length > 0 && $('#tab-par .pth.base'), 'differences marked against the ★ Bible');
  // a chip makes another Bible the ★ one
  ok(!$('#tab-par .pchipb'), 'no Bible chips on the bar any more');
  const chips = $$('#tab-par .pth[data-chip]'); chips[1].click(); await sl(600);
  ok(state.settings.parSets[0].base === chips[1].dataset.chip, 'clicking a column title makes it the ★ Bible');
  // stacked
  $('#tab-par [data-a="stack"]').click(); await until(() => $('#tab-par .pstack .psv'));
  ok($$('#tab-par .pstack .psv').length > 5 && state.settings.parLayout.pc === 'stack', 'stacked layout');
  if (stage === 'stack') { await go({ b: 43, c: 3, v: 16 }); await sl(900); console.log('RESULT ' + out.join(' | ')); return; }
  $('#tab-par [data-a="cols"]').click(); await sl(300);
  $('#tab-par [data-a="diff"]').click(); await sl(300);
  // a second set, then the choice between sets
  const p2 = TimotheosParallel.setupDialog(null); await sl(300);
  $('#parName').value = 'Old English'; $$('#parPick .ppr input')[0].click(); await sl(50); $$('#parPick .ppr input')[1].click(); await sl(50);
  okBtn().click(); await p2; await sl(500);
  ok(state.settings.parSets.length === 2 && state.settings.parSetId === state.settings.parSets[1].id, 'a second set is saved and opened');
  const p3 = TimotheosParallel.chooseSetDialog(); await sl(300);
  ok($$('input[name="parPickSet"]').length === 2, 'with two sets, it asks which to open');
  $$('input[name="parPickSet"]')[0].click(); $$('#modalBtns button').find(b => /Open/.test(b.textContent)).click(); await p3; await sl(300);
  ok(state.settings.parSetId === state.settings.parSets[0].id, 'the chosen set is opened');
  await TimotheosParallel.render(true); await sl(400);
  // the ★ menu
  $('#tab-par [data-a="sets"]').click(); await sl(300);
  ok($$('.parmenu [data-set]').length === 2 && $('.parmenu [data-m="new"]'), 'the set menu lists both sets');
  if (stage !== 'menu') document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await go({ b: 43, c: 3, v: 16 }); await sl(900);
  // the right-click menu of a Bible view, for the Bible and verse right-clicked (0.6.126)
  $('#tab-par [data-a="cols"]').click(); await sl(600);
  await until(() => $$('#tab-par .pvrow[data-pv="16"] .pcell[data-bid]').length >= 2);
  const cell = $$('#tab-par .pvrow[data-pv="16"] .pcell[data-bid]')[1];
  cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 600, clientY: 300 })); await sl(300);
  const menu = $('#ctxMenu');
  ok(!menu.classList.contains('hidden') && /3:16/.test(menu.textContent) && /Copy verse/.test(menu.textContent) && /Bookmark/.test(menu.textContent) && /note/.test(menu.textContent) && /Cross-references/.test(menu.textContent), 'right-click: the Bible view menu: ' + menu.querySelector('.mh').textContent);
  menu.querySelector('button[data-a="hl"]').click(); await sl(900);
  const hl = (TimotheosStudy.study.ud.highlights || {})[cell.dataset.bid] || {};
  ok(hl['43.3.16'] && hl['43.3.16'].length, 'highlight saved for that Bible');
  ok($$('#tab-par .pvrow[data-pv="16"] .pcell')[1].querySelector('mark.hl'), 'the highlight shows in the panel');
  // the bar: one row, the verse picker, no + Bible; the icons beside the text (0.6.128)
  ok(!$('#tab-par [data-a="edit"]') && !$('#tab-par [data-a="prev"]') && $('#tab-par .parpill'), 'no + Bible and no chapter arrows; a verse picker');
  const bar = $('#tab-par .parbar'); ok(bar.scrollHeight <= 44, 'the bar is one row: ' + bar.scrollHeight + ' px');
  const sideKeys = [...$$('#tab-par .parside [data-s]')].map(b => b.dataset.s).join(',');
  ok(sideKeys === 'wpop,zin,zout,fcolor,font,hfont,selbg,pen,ul,align,lh' && $('#tab-par .parside [data-grab="par"]') && !$('#tab-par .parside [data-s="menu"], #tab-par .parside [data-s="copyv"]'), 'side icons: ' + sideKeys);
  // follow off: the picker moves only the panel
  $('#tab-par [data-a="follow"]').click(); await sl(400);
  $('#tab-par .parpill').click(); await sl(400);
  ok(!$('#navPop').classList.contains('hidden'), 'the picker opens');
  const mainRef = JSON.stringify(state.ref);
  const bk = $$('#navPop [data-b]').find(x => +x.dataset.b === 45); bk.click(); await sl(300);
  const ch = $$('#navPop [data-c]').find(x => +x.dataset.c === 8); ch.click(); await sl(700);
  const vv = $$('#navPop button[data-v]').find(x => +x.dataset.v === 28); if (vv) { vv.click(); await sl(800); }
  ok(JSON.stringify(state.ref) === mainRef && /8:28/.test($('#tab-par .parpill').textContent), 'Follow off: the panel goes to ' + $('#tab-par .parpill').textContent + ', the Bible view stays');
  $('#tab-par [data-a="follow"]').click(); await sl(600);
  // alignment and line spacing
  $('#tab-par .parside [data-s="align"]').click(); await sl(300);
  $$('.bvmenu [data-al], .menu [data-al]').find(x => x.dataset.al === 'justify').click(); await sl(300);
  ok($('#tab-par .parbody').dataset.align === 'justify' && state.settings.parLook.align === 'justify', 'text alignment: justified');
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); await sl(200);
  $('#tab-par .parside [data-s="lh"]').click(); await sl(300);
  $$('[data-lh="1"]').pop().click(); await sl(300);
  ok(+state.settings.parLook.lh > 1.5 && $('#tab-par .parbody').style.getPropertyValue('--lh'), 'line spacing: ' + state.settings.parLook.lh);
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); await sl(200);
  // start-up: the panel's last text is kept and comes back at once (0.6.128)
  await sl(1600);
  const pb = $('#tab-par .parbody'); const n0 = pb.querySelectorAll('.pvrow').length; pb.innerHTML = '';
  ok(TimotheosParallel.showSnapshot() && pb.querySelectorAll('.pvrow').length === n0 && pb.classList.contains('parsnap'), 'the last text of the panel comes back at once (' + n0 + ' verses)');
  await TimotheosParallel.render(false); await sl(300);
  ok(!pb.classList.contains('parsnap'), 'then the freshly read text replaces it');
  // the phone starts stacked
  const keepL = state.settings.parLayout; save({ parLayout: {} }); document.documentElement.classList.add('mobile');
  await TimotheosParallel.render(false); await sl(400);
  ok($('#tab-par [data-a="stack"]').classList.contains('on'), 'phone: stacked by default');
  document.documentElement.classList.remove('mobile'); save({ parLayout: keepL }); await TimotheosParallel.render(false);
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
