/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Every panel has its own look: font, text colour, link colour (verse references, Strong's numbers) and background.
 * Page Background Color is the background of the main text only. Colours: text, tab name (in the caption), headings & titles, notes / hints / field labels, verse numbers, verse links, page background.
 * Set from the palette button in the panel's caption; kept in settings.panelSkins and applied only to that panel. */
/* global state, save, esc, paneMenu, TimotheosDock, TimotheosOptions, TimotheosStudy */
(function () {
  const $ = s => document.querySelector(s);
  const NAMES = { tree: 'Books & chapters', library: 'Modules', cmt: 'Commentary', lib: 'Library', search: 'Bible search', bsearch: 'Book search', study: 'My Study' };
  const QUICK = ['#222222', '#5b3a12', '#7a1f1f', '#1f4f8a', '#1e6b3a', '#5a2d82', '#ffffff', '#f5ecd7', '#e8f0e4', '#e4ecf5', '#2b2d31', '#10141a'];
  const skins = () => state.settings.panelSkins || {};
  const nameOf = id => /^bv\d+$/.test(id) ? (window.viewName ? viewName(+id.slice(2)) : 'Bible view') + ' (Bible view)' : NAMES[id] || id;
  const allIds = () => TimotheosDock.panels().map(p => p.id);
  const elOf = id => { const p = (TimotheosDock.panel && TimotheosDock.panel(id)) || null; return p ? p.el : document.querySelector({ tree: '#pane-tree', library: '#pane-library', cmt: '#tab-cmt', lib: '#tab-lib', search: '#tab-search', bsearch: '#tab-bsearch', study: '#tab-study' }[id]); };

  function apply(id) {
    const el = elOf(id); if (!el) return;
    const k = skins()[id] || {};
    for (const p of ['--font-ui', '--font-text', '--text', '--strong', '--fn', '--textbg', '--pbg', '--muted', '--vnum']) el.style.removeProperty(p);
    el.style.fontFamily = ''; el.style.color = '';
    if (k.font) { const f = `'${String(k.font).replace(/['\\]/g, '')}', 'TwGreek', 'TwHebrew', sans-serif`; el.style.fontFamily = f; el.style.setProperty('--font-ui', f); el.style.setProperty('--font-text', f); }
    if (k.color) { el.style.color = k.color; el.style.setProperty('--text', k.color); if (!k.head) el.style.setProperty('--heading', k.color); }
    if (k.head) el.style.setProperty('--heading', k.head);
    if (k.note) el.style.setProperty('--muted', k.note);
    if (k.vnum) el.style.setProperty('--vnum', k.vnum);
    if (k.link) { el.style.setProperty('--strong', k.link); el.style.setProperty('--fn', k.link); }
    // the page colour is the background of the main text of the panel (the verses, the topic, the results), not of its buttons and boxes
    if (k.bg) { el.style.setProperty('--textbg', k.bg); el.style.setProperty('--pbg', k.bg); }
    el.classList.toggle('pbgc', !!k.bg);
    el.style.zoom = k.scale && k.scale !== 1 ? k.scale : '';
    el.classList.toggle('pskin', !!(k.font || k.color || k.link || k.bg || k.head || k.note || k.vnum || k.tab || k.scale));
    el.classList.toggle('pheadc', !!k.head); el.classList.toggle('pnotec', !!k.note);
    el.style.setProperty('--phead', k.head || ''); el.style.setProperty('--pnote', k.note || '');
    // the tab name sits in the caption of the area, which belongs to the panel in front
    const grp = el.closest('.dgroup'); const tab = grp && grp.querySelector(`.dtab[data-id="${id}"]`);
    if (tab) tab.style.color = k.tab || '';
    // a Bible view shows no tab name (only its icon): its name is the verse button next to it, so the colour goes there
    const nav = grp && /^bv\d+$/.test(id) && grp.querySelector('.dnav'); if (nav) nav.style.color = k.tab || '';
  }
  function applyAll() { for (const id of allIds()) apply(id); }
  function set(id, key, val) {
    const all = Object.assign({}, skins()); const k = Object.assign({}, all[id]);
    if (val) k[key] = val; else delete k[key];
    if (Object.keys(k).length) all[id] = k; else delete all[id];
    save({ panelSkins: all }); apply(id);
  }
  function resetAll() { save({ panelSkins: {} }); applyAll(); TimotheosStudy.flash('All panels are back to the default colours'); }
  /** Default Colors: this panel goes back to the colours (and font) of the skin */
  function defaults(id) { const all = Object.assign({}, skins()); delete all[id]; save({ panelSkins: all }); apply(id); TimotheosStudy.flash(nameOf(id) + ': default colours'); }

  function menu(id, btn) {
    const k = skins()[id] || {}; const fonts = TimotheosOptions.fonts();
    const row = (key, label) => `<div class="pskrow" data-k="${key}"><span class="pskl">${label}</span><span class="pskc">${QUICK.map(c => `<button type="button" class="swc" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" value="${/^#[0-9a-f]{6}$/i.test(k[key] || '') ? k[key] : '#808080'}" title="Any colour"><button type="button" class="pskx" title="As in the skin">✕</button></span></div>`;
    paneMenu(btn, `<div class="mh">${esc(nameOf(id))} – own fonts and colours</div>
      <label class="pskfont">Font <select><option value="">As in Options</option>${fonts.map(f => `<option value="${esc(f)}" style="font-family:'${esc(String(f).replace(/['\\]/g, ''))}'"${f === k.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <label class="pskfont" title="Makes the whole panel (its fonts, buttons and boxes) smaller or larger">Size of everything in this panel <input type="range" class="pskscale" min="60" max="220" step="5" value="${Math.round((k.scale || 1) * 100)}"> <b class="pskpct">${Math.round((k.scale || 1) * 100)}%</b></label>
      ${row('color', 'Text')}${row('tab', 'Tab name')}${row('head', 'Headings &amp; titles')}${row('note', 'Notes, hints &amp; field labels')}${row('vnum', 'Verse numbers')}${row('link', 'Verse links')}${row('bg', 'Page Background Color')}
      <div class="swrow"><button type="button" class="pskdef" title="This panel goes back to the colours of the skin">Default Colors</button></div>`, m => {
      m.classList.add('pskmenu');
      const sc = m.querySelector('.pskscale'); sc.oninput = () => { m.querySelector('.pskpct').textContent = sc.value + '%'; set(id, 'scale', +sc.value === 100 ? null : +sc.value / 100); };
      m.querySelector('select').onchange = e => set(id, 'font', e.target.value || null);
      m.addEventListener('click', e => {
        const row = e.target.closest('.pskrow');
        if (row && e.target.closest('.swc')) set(id, row.dataset.k, e.target.closest('.swc').dataset.c);
        else if (row && e.target.closest('.pskx')) set(id, row.dataset.k, null);
        else if (e.target.closest('.pskdef')) { defaults(id); m.remove(); }
      });
      m.addEventListener('input', e => { const row = e.target.closest('.pskrow'); if (row && e.target.type === 'color') set(id, row.dataset.k, e.target.value); });
    });
  }
  window.TimotheosPanelSkin = { menu, apply, applyAll, resetAll, defaults, set };
})();
