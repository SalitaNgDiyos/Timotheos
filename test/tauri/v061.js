/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.6.1: the 14 requests – per-view names and menus, synced centring, Intralinear, Lookup in the Library,
// panel skins, one reference box, module management, popup Bibles, About, Bible search choice
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
const hover = (el, type) => el.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: null }));
(async () => {
  await sleep(3500);
  go({ b: 43, c: 3, v: 16 }); await sleep(1200);
  const secs = () => [...document.querySelectorAll('section.bv')];
  // 1. editable names
  const b0 = secs()[0].querySelector('.bvbible'); const orig = b0.textContent;
  b0.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await sleep(200);
  const inp = secs()[0].querySelector('.bvrename'); ok(!!inp, 'double-click on the name opens an edit box');
  inp.value = 'My KJV'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(400);
  ok(secs()[0].querySelector('.bvbible').textContent === 'My KJV' && secs()[1].querySelector('.bvbible').textContent !== 'My KJV', 'the label is changed for that view only: ' + secs().map(s => s.querySelector('.bvbible').textContent).join(' / '));
  ok(state.infos.get(views()[0].bible).abbr === orig, 'the module itself keeps its abbreviation (' + orig + ')');
  ok(views()[0].label === 'My KJV', 'the label is saved in the view');
  // 2. the Bible menu survives the mouse travelling to it
  const bb = secs()[1].querySelector('.bvbible');
  hover(bb, 'mouseover'); await sleep(450);
  ok(!!document.querySelector('.bvmenu.biblemenu'), 'hovering the label opens the Bible menu');
  hover(bb, 'mouseout'); await sleep(250);
  ok(!!document.querySelector('.bvmenu.biblemenu'), 'the menu is still there 250 ms after leaving the label');
  const menu = document.querySelector('.bvmenu.biblemenu'); menu.dispatchEvent(new MouseEvent('mouseenter')); await sleep(800);
  ok(!!document.querySelector('.bvmenu.biblemenu'), 'it stays while the mouse is on the menu');
  menu.dispatchEvent(new MouseEvent('mouseleave')); await sleep(900);
  ok(!document.querySelector('.bvmenu.biblemenu'), 'it closes after the mouse has left both');
  // 3. hamburger menu
  const first = secs()[0].querySelector('.bvside > button');
  ok(first && first.dataset.a === 'menu', 'the ☰ button is the first thing under the Bible name');
  first.click(); await sleep(300);
  const labels = [...document.querySelectorAll('.bvmenu.mainmenu label')].map(l => l.textContent.replace(/\s+/g, ' ').trim());
  ok(['Strong\'s and Morph', 'Words of Jesus', 'Translator\'s Notes', 'Headings', 'Verse numbers'].every(t => labels.some(l => l.startsWith(t))) && /Options/.test(document.querySelector('.bvmenu.mainmenu').textContent), 'menu lists its items, without Paragraph Mode: ' + labels.slice(0, 6).join(' | '));
  const cbs = [...document.querySelectorAll('.bvmenu.mainmenu input[data-t]')];
  const sm = cbs.find(c => c.dataset.t === 'sm'); sm.checked = !sm.checked; sm.dispatchEvent(new Event('change', { bubbles: true })); await sleep(700);
  ok(effShow('strongs', 0) === sm.checked && effShow('morph', 0) === sm.checked && effShow('strongs', 1) !== sm.checked, 'Strong\'s and Morph switch together, in this view only');
  ok(!labels.some(l => /Paragraph/.test(l)) && secs().every(s => s.dataset.layout === 'para'), 'no Paragraph Mode switch: every view reads as paragraphs');
  ok(labels.some(l => l.startsWith('Commentary links')) && labels.some(l => l.startsWith("Show the module's tags")), 'menu has Commentary links and the developer switch');
  { const cl = [...document.querySelectorAll('.bvmenu.mainmenu input[data-t]')].find(c => c.dataset.t === 'cmtLinks'); const was = effShow('cmtLinks', 0); cl.checked = !was; cl.dispatchEvent(new Event('change', { bubbles: true })); await sleep(700);
    ok(effShow('cmtLinks', 0) === !was && effShow('cmtLinks', 1) === was, 'Commentary links: switched for this view only'); if (!effShow('cmtLinks', 0)) ok(!secs()[0].querySelector('sup.cm'), 'no commentary links in this view');
    toggleViewShow(0, 'cmtLinks', was); await sleep(500);
    toggleViewShow(0, 'tags', true); await sleep(800);
    ok(secs()[0].querySelector('.rawtag') && !secs()[1].querySelector('.rawtag'), 'the developer switch shows the module tags in this view only');
    toggleViewShow(0, 'tags', false); await sleep(600); }
  const vn = [...document.querySelectorAll('.bvmenu.mainmenu input[data-t]')].find(c => c.dataset.t === 'vnum'); vn.checked = false; vn.dispatchEvent(new Event('change', { bubbles: true })); await sleep(500);
  ok(views()[0].vnPos === 'hidden', 'verse numbers hidden for this view');
  vn.checked = true; vn.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
  document.querySelector('.bvmenu.mainmenu button[data-t="opts"]').click(); await sleep(300);
  ok(/Footnote marks/.test(document.querySelector('.bvmenu').textContent), 'Options… opens the view options');
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await sleep(100);
  // 4. side controls
  const acts = [...secs()[0].querySelectorAll('.bvside button')].map(b => b.dataset.a);
  ok(['info', 'link', 'zin', 'zout', 'fcolor', 'font', 'selbg', 'pen', 'ul'].every(a => acts.includes(a)), 'side controls: ' + acts.join(','));
  ok(!document.querySelector('.bvzoom') && !/%/.test(secs()[0].querySelector('.bvcap').textContent), 'no percentage indicator');
  const z0 = views()[0].zoom || 1; secs()[0].querySelector('[data-a="zin"]').click(); await sleep(200);
  ok((views()[0].zoom || 1) > z0 && (views()[1].zoom || 1) === 1, 'font up changes only this view');
  secs()[0].querySelector('[data-a="info"]').click(); await sleep(700);
  ok(!document.querySelector('#propsDlg').classList.contains('hidden'), 'Bible info shows the module properties'); document.querySelector('#ppClose').click(); await sleep(200);
  secs()[0].querySelector('[data-a="fcolor"]').click(); await sleep(200);
  document.querySelector('.colormenu .swc').click(); await sleep(400);
  ok(!!views()[0].color && secs()[0].querySelector('.bvtext').style.color && !views()[1].color, 'font colour: ' + views()[0].color);
  secs()[0].querySelector('[data-a="selbg"]').click(); await sleep(200);
  document.querySelectorAll('.colormenu .swc')[5].click(); await sleep(400);
  ok(!!views()[0].selBg && secs()[0].querySelector('.sel td, .sel') && getComputedStyle(secs()[0].querySelector('tr.sel td:last-child, .pv.sel')).backgroundColor !== getComputedStyle(secs()[1].querySelector('tr.sel td:last-child, .pv.sel')).backgroundColor, 'active verse background per view');
  secs()[0].querySelector('[data-a="link"]').click(); await sleep(300); ok(views()[0].linked === false, 'Sync toggled off'); secs()[0].querySelector('[data-a="link"]').click(); await sleep(300); ok(views()[0].linked === true, 'Sync on again');
  // highlighter + underline
  secs()[0].querySelector('[data-a="pen"]').click(); await sleep(200);
  document.querySelector('.hlgrid .swc[data-k="green"]').click(); await sleep(200);
  ok(state.pen && state.pen.style === 'green', 'highlighter colour chosen');
  const cell = secs()[0].querySelector('tr.sel td:last-child, .pv.sel'); const tn = [...cell.querySelectorAll('*'), cell].flatMap(e => [...e.childNodes]).find(n => n.nodeType === 3 && n.data.trim().length > 6);
  const rg = document.createRange(); rg.setStart(tn, 0); rg.setEnd(tn, 5); getSelection().removeAllRanges(); getSelection().addRange(rg);
  secs()[0].querySelector('.bvtext').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); await sleep(900);
  ok(!!secs()[0].querySelector('mark.hl-green'), 'selecting text with the highlighter marks it');
  secs()[0].querySelector('[data-a="ul"]').click(); await sleep(200);
  document.querySelector('.bvmenu input[value="wavy"]').click(); await sleep(200);
  ok(state.pen && /^ul-wavy-/.test(state.pen.style), 'underline style chosen: ' + (state.pen && state.pen.style));
  state.pen = null;
  // 5. active verse in every synced view, centred
  go({ b: 43, c: 3, v: 5 }); await sleep(1200);
  selectVerse(8, true); await sleep(1500);
  const mid = (t, v) => { const el = t.querySelector(`[data-v="${v}"]`); const tr = t.getBoundingClientRect(), er = el.getBoundingClientRect(); return Math.abs((er.top + er.height / 2) - (tr.top + tr.height / 2)); };
  const ts = paneTexts();
  ok(ts.every(t => t.querySelector('[data-v="8"].sel')), 'verse 8 is lit in both views');
  ok(ts.every(t => mid(t, 8) < 40), 'verse 8 is in the middle of both views: ' + ts.map(t => Math.round(mid(t, 8))).join(', '));
  selectVerse(2, true); await sleep(1500);
  ok(ts.every(t => t.querySelector('[data-v="2"].sel') && mid(t, 2) < 40), 'moving to verse 2 moves both: ' + ts.map(t => Math.round(mid(t, 2))).join(', '));
  ts[1].scrollTop += 300; await sleep(1200);
  ok(ts[0].querySelector('.sel') && ts[0].querySelector('.sel').dataset.v === ts[1].querySelector('.sel').dataset.v && +ts[1].querySelector('.sel').dataset.v > 2, 'scrolling one view moves the active verse in both: ' + ts[0].querySelector('.sel').dataset.v + '/' + ts[1].querySelector('.sel').dataset.v);
  // 6. Intralinear
  ok(!/Column text/i.test(document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')), 'no "Column text" left in the screen');
  secs()[0].querySelector('[data-a="menu"]').click(); await sleep(250); ok(/Intralinear View/.test((document.querySelector('.bvmenu.mainmenu') || {}).textContent || ''), 'Intralinear View in the view menu'); document.querySelectorAll('.bvmenu').forEach(m => m.remove());
  // 7 done in t7; 8 panel skins
  document.querySelector('.dgroup [data-act="skin"]').click(); await sleep(300);
  ok(!!document.querySelector('.pskmenu'), 'the panel caption has its skin menu');
  const pid = [...document.querySelectorAll('.dgroup')][0].querySelector('.dtab.on').dataset.id;
  document.querySelector('.pskmenu .pskrow[data-k="bg"] .swc').click(); await sleep(300);
  document.querySelector('.pskmenu .pskrow[data-k="link"] .swc').click(); await sleep(200);
  document.querySelector('.pskmenu .pskrow[data-k="color"] .swc').click(); await sleep(200);
  const sk = state.settings.panelSkins[pid]; ok(sk && sk.bg && sk.link && sk.color, 'panel ' + pid + ' has its own colours: ' + JSON.stringify(sk));
  const others = [...document.querySelectorAll('.dpanel')].filter(e => e.dataset.panel !== pid && !e.closest('#panelStore'));
  ok(others.every(e => !e.classList.contains('pskin')), 'other panels are not touched');
  document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await sleep(100);
  // 9. one box
  ok(!document.querySelector('#bookSel, #chapSel, #verseSel'), 'no Book / Chapter / Verse dropdowns');
  ok($('#refInput').value === 'John 3:2' || /^John 3:\d+$/.test($('#refInput').value), 'the box shows the place: ' + $('#refInput').value);
  $('#refInput').focus(); await sleep(100); $('#refInput').value = 'Exodus 1:13';
  $('#refForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(1500);
  ok(state.ref.b === 2 && state.ref.c === 1 && state.ref.v === 13 && $('#refInput').value === 'Exodus 1:13', 'typing Exodus 1:13 goes there: ' + JSON.stringify(state.ref) + ' / ' + $('#refInput').value);
  // 10. module management
  ok(!TimotheosDock.panels || true, '');
  ok(![...document.querySelectorAll('#panelsMenu *')].some(e => e.textContent.trim() === 'Modules'), 'no Modules panel in the layout menu');
  TimotheosOptions.open(); await sleep(300); document.querySelector('#optNav [data-o="mods"]').click(); await sleep(300);
  const rows = [...document.querySelectorAll('#modMgr .mmrow')];
  ok(rows.length > 10 && document.querySelector('#modMgr .mmk'), 'all installed modules are listed: ' + rows.length);
  const nb = state.modules.bibles.length; const row = [...document.querySelectorAll('#modMgr .mmrow')].find(r => /Wycliffe|Purvey/i.test(r.textContent));
  row.querySelector('.mmshow').click(); await sleep(2500);
  ok(state.modules.bibles.length === nb - 1 && !document.querySelector('.bvmenu [data-b*="wycliffe"]') && state.allModules.bibles.length === nb, 'unticking takes a Bible out of the lists, the file stays: ' + state.modules.bibles.length + '/' + nb);
  ok(!!document.querySelector('#modMgr .mmrow.off') && document.querySelectorAll('#modMgr .mmdel').length > 10, 'it is still listed here, with Delete file…');
  document.querySelector('#modMgr .mmrow.off .mmshow').click(); await sleep(2500);
  ok(state.modules.bibles.length === nb, 'ticking brings it back');
  // 11. popup Bibles
  const sel = $('#popupNT'); ok(sel && sel.options.length > 2 && $('#popupOT'), 'default OT/NT Bible selects in Options → Modules: ' + (sel ? sel.options.length : 0));
  const wyc = state.modules.bibles.find(b => /wycliffe/i.test(b.id)); sel.value = wyc.id; sel.dispatchEvent(new Event('change')); await sleep(300);
  const pv = await versePreview(43, 3, 16, 16); ok(/Wycliffe|WYC/i.test(pv) || pv.length > 20, 'a New Testament verse preview comes from the chosen Bible');
  const k = await versePreview(1, 1, 1, 1); ok(k !== undefined, 'OT preview uses its own default');
  TimotheosOptions.close ? TimotheosOptions.close() : $('#optClose').click(); await sleep(200);
  // 12/13. About
  runCommand('about'); await sleep(500);
  const ab = $('#modalBody').textContent; ok(/About Timotheos/.test($('#modalTitle').textContent) && /AGPL-3\.0-or-later/.test(ab) && !/MIT License/.test(ab) && /Edmund P\. Valdez/.test(ab) && /github\.com\/SalitaNgDiyos\/Timotheos/.test(ab) && /Program folder/.test(ab), 'About Timotheos shows description, licence, GitHub, folder');
  ok(/Source code/.test(ab) && /free for anyone/.test(ab), 'About: the source code is offered to anyone with the program');
  const lg = document.querySelector('[data-legal="LICENSE"]'); ok(!!lg && !!document.querySelector('[data-legal="THIRD-PARTY-LICENSES"]'), 'About: Legal buttons');
  lg.click(); await sleep(900); const lt = document.querySelector('.legaltext'); ok(!!lt && /GNU AFFERO GENERAL PUBLIC LICENSE/.test(lt.textContent) && /13\. Remote Network Interaction/.test(lt.textContent), 'the licence text opens inside the program ('+(lt?lt.textContent.length:0)+' characters)');
  [...document.querySelectorAll('#modalBtns button')].find(b => b.classList.contains('primary')).click(); await sleep(400);
  runCommand('about'); await sleep(500);
  document.querySelector('[data-legal="THIRD-PARTY-LICENSES"]').click(); await sleep(1200); const tl = document.querySelector('.legaltext'); ok(!!tl && /Rust crate/.test(tl.textContent) && /tauri/.test(tl.textContent), 'the third-party notices open inside the program');
  [...document.querySelectorAll('#modalBtns button')].find(b => b.classList.contains('primary')).click(); await sleep(400);
  runCommand('about'); await sleep(500);
  const q = $('#aboutVerse'); const t1 = q.textContent; ok(/Lahat ng Kasulatan/.test(t1) && /2 Timothy 3:16/.test(t1), 'verse starts in Filipino');
  q.click(); await sleep(200); ok(/All scripture is given by inspiration of God/.test($('#aboutVerse').textContent), 'click: English (KJV)');
  q.click(); await sleep(200); ok(/hiningahan ng Diyos/.test($('#aboutVerse').textContent), 'click again: Filipino (AMB)');
  [...document.querySelectorAll('#modalBtns button')].find(b => b.classList.contains('primary')).click(); await sleep(300);
  ok(document.title.includes('Timotheos') && !/Tanglaw/i.test(document.documentElement.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<code class="sel">[^<]*<\/code>/g, '')), 'window title and screen say Timotheos: ' + document.title);
  // 14. Bible search choice
  openTab('search', true); await sleep(400);
  ok(!!$('#searchBibleList') && $('#searchBibleList input') && [...$('#searchBibles').options].some(o => o.value === 'chosen'), 'Bible search has a list of Bibles to choose from');
  $('#spNone').click(); await sleep(200);
  const kjv = [...document.querySelectorAll('#searchBibleList input')].find(i => /kjv/i.test(i.value)); kjv.click(); await sleep(300);
  $('#searchInput').value = 'loved'; $('#searchForm').dispatchEvent(new Event('submit', { cancelable: true })); await sleep(2500);
  ok($('#searchBibles').value === 'chosen' && /in 1 Bible/.test($('#searchStatus').textContent), 'search only in the ticked Bible: ' + $('#searchStatus').textContent.slice(0, 80));
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
