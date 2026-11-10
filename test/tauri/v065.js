/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// 0.6.5: whole panel names in narrow panels, Firefox themes, text alignment
window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
(async () => {
  await sleep(3500);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  // ---- panel names: never cut; panel buttons fold under "⋯" first, then the other tabs show icons only
  const cut = () => $$('.dcap .dtab:not([data-id^="bv"]) > span').filter(sp => sp.offsetParent && sp.scrollWidth > sp.clientWidth + 1).map(sp => sp.textContent);
  ok(cut().length === 0, 'every panel name is whole at this window size (' + cut().join(', ') + ')');
  const g = $$('.dgroup').find(x => !x.classList.contains('isbv') && x.querySelectorAll('.dtab').length >= 2) || $$('.dgroup').find(x => !x.classList.contains('isbv'));
  const old = g.style.width; g.style.width = '190px'; g.style.flex = '0 0 190px'; await sleep(400);
  const cap = g.querySelector('.dcap');
  ok(cap.classList.contains('tight') && getComputedStyle(cap.querySelector('.dmore')).display !== 'none' && getComputedStyle(cap.querySelector('[data-act="zoom+"]')).display === 'none', 'a narrow panel folds its buttons under ⋯');
  const act = cap.querySelector('.dtab.on > span'); ok(act && act.scrollWidth <= act.clientWidth + 1, 'the open tab keeps its whole name (' + (act && act.textContent) + ')');
  cap.querySelector('.dmore').click(); await sleep(300);
  const mm = $('.dmoremenu'); ok(mm && mm.querySelectorAll('[data-act]').length >= 4 && /Larger|Smaller/.test(mm.textContent), '⋯ lists the folded buttons with their names');
  if (mm) mm.remove();
  g.style.width = old; g.style.flex = ''; await sleep(400);
  ok(!cap.classList.contains('tight') || cut().length === 0, 'with room again, the buttons come back');
  // ---- the module chooser in the library uses the room to its right
  const lm = $('#libMod'); if (lm && lm.offsetParent) { const bar = lm.closest('.libbar').getBoundingClientRect(); ok(lm.getBoundingClientRect().width >= Math.min(170, bar.width - 20), 'the library module name has room (' + Math.round(lm.getBoundingClientRect().width) + 'px)'); }
  // ---- Firefox themes: none are bundled; "Import themes from my Firefox" copies the ones installed in the user's Firefox
  // (a pretend profile made by fx-profile.sh: two themes, one tool, one Firefox built-in theme)
  const R = document.documentElement, tb = $('#toolbar'), ttl = $('#titlebar');
  ok(!window.TW_FX_THEMES && Object.keys(TimotheosOptions.SKINS).filter(k => k.startsWith('fx-')).length === 0, 'no Firefox themes come with the program');
  $('#skinBtn').click(); await sleep(300); ok(!/>Firefox themes</.test($('#skinMenu').innerHTML), 'the Skin menu has no bundled themes');
  const ib = $('#skinMenu [data-act="fximport"]'); ok(!!ib, 'Skin menu: Import themes from my Firefox…');
  if (ib) { ib.click(); await sleep(2500); }
  const mine = Object.keys(TimotheosOptions.SKINS).filter(k => k.startsWith('fxu-'));
  ok(mine.length === 2, 'the two installed themes are copied, not the tool or Firefox\'s built-in theme (' + mine.join(', ') + ')');
  const msg = $('#modal'); ok(msg && /2 themes copied/.test(msg.textContent) && /Crimson Test/.test(msg.textContent) && /Light Birds Test/.test(msg.textContent), 'a message says what was copied (names from the add-on list or the theme\'s own language file)');
  document.querySelectorAll('#modal .box button').forEach(x => { if (/OK/.test(x.textContent)) x.click(); }); await sleep(300);
  if (!$('#skinMenu').classList.contains('hidden')) { $('#skinBtn').click(); await sleep(200); }
  $('#skinBtn').click(); await sleep(300); { const sm = $('#skinMenu'); for (let k = 0; k < 40; k++) sm.insertAdjacentHTML('beforeend', '<button class="pad">x</button>'); const r = sm.getBoundingClientRect(); ok(r.bottom <= innerHeight + 1 && sm.scrollHeight > sm.clientHeight && getComputedStyle(sm).overflowY === 'auto', 'a long Skin list scrolls inside the menu and stays in the window'); sm.querySelectorAll('.pad').forEach(x => x.remove()); }
  ok(/My Firefox themes/.test($('#skinMenu').textContent) && $$('#skinMenu [data-skin^="fxu-"] .fxsw').length === 2, 'they are under Skin › My Firefox themes, with their pictures');
  const mb = $('#skinMenu [data-skin="fxu-crimson_test"]') || $('#skinMenu [data-skin^="fxu-crimson"]'); if (mb) { mb.click(); await sleep(1200); }
  ok(R.dataset.fx === '1' && /^url\("data:image\/png;base64,/.test(getComputedStyle(tb).backgroundImage) && /^url\("data:image\/png;base64,/.test(getComputedStyle(ttl).backgroundImage), 'an imported theme\'s picture runs across the title bar and the toolbar');
  const css = v => getComputedStyle(R).getPropertyValue(v).trim();
  ok(css('--fx-frame') && css('--text') && css('--bg') && css('--text') !== css('--bg'), 'the theme sets the frame, text and page colours');
  const L = h => { const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const CR = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const fx = Object.entries(TimotheosOptions.SKINS).filter(([, s]) => s.fx);
  const low = fx.filter(([, s]) => CR(s.v.text, s.v.textbg) < 7 || CR(s.v.text, s.v.card) < 4.5 || CR(s.v.accent, s.v.bg) < 3).map(([k]) => k);
  ok(low.length === 0, 'every imported theme keeps the text readable (' + low.join(', ') + ')');
  const bk = mine.find(k => /birds/.test(k)); TimotheosOptions.setSkin(bk); await sleep(1500);
  ok(!TimotheosOptions.SKINS[bk].dark && L(TimotheosOptions.SKINS[bk].v.bg) > .5, 'an old-style theme takes its colours from its light picture, not from its dark frame colour');
  const l2 = await api.fxList(); ok(l2.length === 2 && l2.every(t => t.layers.length > 0), 'they stay in the data folder for next time');
  TimotheosOptions.setSkin('parchment'); await sleep(600);
  ok(!R.dataset.fx && getComputedStyle(tb).backgroundImage === 'none', 'another skin: the picture goes away');
  about(); await sleep(600); ok(!$('[data-legal="themes"]'), 'About › Legal lists no bundled themes');
  document.querySelectorAll('#modal .box button').forEach(x => { if (/OK/.test(x.textContent)) x.click(); }); await sleep(300);
  // ---- text alignment from the ☰ menu
  const menu = document.querySelector('.bv[data-i="0"] .bvside [data-a="menu"], .bv[data-i="0"] [data-a="menu"]');
  if (menu) { menu.click(); await sleep(400); }
  const al = $('.bvmenu.mainmenu [data-al="justify"]'); ok(!!al && $$('.bvmenu.mainmenu [data-al]').length === 4, '☰ has Align text: left, centre, justify, right');
  if (al) { al.click(); await sleep(400); }
  const t0 = $('.bv[data-i="0"] .bvtext'), t1 = $('.bv[data-i="1"] .bvtext');
  ok(t0.dataset.align === 'justify' && getComputedStyle(t0.querySelector('.pcol')).textAlign === 'justify' && (!t1 || getComputedStyle(t1.querySelector('.pcol')).textAlign !== 'justify'), 'justified in this view only');
  for (const [k, want] of [['center', 'center'], ['right', 'right']]) { setTextAlign(0, k); await sleep(200); ok(getComputedStyle(t0.querySelector('.pcol')).textAlign === want, 'align ' + k); }
  setTextAlign(0, 'left'); await sleep(200); ok(!t0.dataset.align && !views()[0].align, 'left again: as before (nothing stored)');
  document.querySelectorAll('.bvmenu').forEach(m => m.remove());
  // ---- line spacing of one view, from the ☰ menu
  { const lhOf = t => { const pv = t.querySelector('.pv'); const cs = getComputedStyle(pv.closest('.paraview') || pv); return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize); };
    const before = lhOf(t0), other = t1 && lhOf(t1);
    if (menu) { menu.click(); await sleep(400); }
    const row = $('.bvmenu.mainmenu .lhrow'); ok(!!row && /Line spacing/.test(row.textContent) && !!row.querySelector('[data-lh="1"]') && !!row.querySelector('[data-lh="-1"]') && !!row.querySelector('[data-lh="0"]'), '☰ has Line spacing: −, +, Default');
    const shown0 = row && +row.querySelector('.lhv').textContent;
    for (let k = 0; k < 4; k++) { row.querySelector('[data-lh="1"]').click(); await sleep(120); }
    const after = lhOf(t0); ok(Math.abs(views()[0].lh - (shown0 + 0.2)) < 0.001 && +row.querySelector('.lhv').textContent === +(shown0 + 0.2).toFixed(2), '+ four times: 0.20 more (' + shown0 + ' → ' + views()[0].lh + ')');
    ok(after > before + 0.15, 'the lines of this view are further apart (' + before.toFixed(2) + ' → ' + after.toFixed(2) + ')');
    ok(!t1 || Math.abs(lhOf(t1) - other) < 0.01, 'the other view is not changed');
    row.querySelector('[data-lh="-1"]').click(); await sleep(150); ok(Math.abs(views()[0].lh - (shown0 + 0.15)) < 0.001, '− takes 0.05 off');
    ok(!row.querySelector('.lhdef').classList.contains('on'), 'Default is not marked while the view has its own spacing');
    row.querySelector('[data-lh="0"]').click(); await sleep(200); ok(!views()[0].lh && Math.abs(lhOf(t0) - before) < 0.01 && row.querySelector('.lhdef').classList.contains('on'), 'Default: back to the spacing of Options › Fonts');
    setLineSpacing(0, 9); ok(views()[0].lh === 3, 'it stays between 1 and 3'); setLineSpacing(0, null);
    document.querySelectorAll('.bvmenu').forEach(m => m.remove()); }
  // ---- the computer's guide: its own text (no phone screens), a contents list that can be hidden and made wider
  { const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;left:0;top:0;width:900px;height:600px;z-index:99999'; fr.src = 'guide.html?desktop=1'; document.body.appendChild(fr); await sleep(1500);
    const d = fr.contentDocument; ok(!!d.getElementById('guide') && !d.getElementById('guideP'), 'the computer gets the computer guide only');
    ok(!/Quiet Reader|Study Desk|Clear Tabs|Pinch/.test(d.body.textContent), 'nothing about the phone screens in it');
    ok(!/Paragraph mode|paragraph mode|margin column/.test(d.body.textContent) && /Line spacing/.test(d.body.textContent), 'it no longer mentions the removed paragraph switch or verse-number column, and explains line spacing');
    const nav = d.getElementById('toc'); const w0 = nav.getBoundingClientRect().width; ok(w0 > 150, 'contents shown (' + Math.round(w0) + 'px)');
    d.getElementById('tocBtn').click(); await sleep(250); ok(nav.getBoundingClientRect().width < 2 && d.body.classList.contains('notoc'), 'the Contents button hides it');
    d.getElementById('tocBtn').click(); await sleep(250); ok(nav.getBoundingClientRect().width > 150, 'and shows it again');
    const g = d.getElementById('tocGrip'), gr = g.getBoundingClientRect(); const pe = (t, x) => { let e; try { e = new fr.contentWindow.PointerEvent(t, { bubbles: true, clientX: x, clientY: 200, pointerId: 5 }); } catch (z) { e = new fr.contentWindow.MouseEvent(t, { bubbles: true, clientX: x, clientY: 200 }); } g.dispatchEvent(e); };
    pe('pointerdown', gr.left + 2); pe('pointermove', gr.left + 120); pe('pointerup', gr.left + 120); await sleep(250); ok(nav.getBoundingClientRect().width > w0 + 80, 'dragging its edge makes it wider (' + Math.round(nav.getBoundingClientRect().width) + 'px)');
    g.dispatchEvent(new fr.contentWindow.MouseEvent('dblclick', { bubbles: true })); await sleep(200); ok(Math.abs(nav.getBoundingClientRect().width - w0) < 2, 'double-click: back to its width');
    fr.remove(); }
  ok(!window.__errs.length, 'no errors ' + window.__errs.join('; '));
  console.log('RESULT ' + out.join(' | '));
})();
