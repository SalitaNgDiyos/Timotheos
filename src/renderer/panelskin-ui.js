'use strict';
/* Every panel has its own look: font, text colour, link colour (verse references, Strong's numbers) and background.
 * Set from the palette button in the panel's caption; kept in settings.panelSkins and applied only to that panel. */
/* global state, save, esc, paneMenu, TimotheosDock, TimotheosOptions, TimotheosStudy */
(function () {
  const $ = s => document.querySelector(s);
  const NAMES = { tree: 'Books & chapters', library: 'Modules', cmt: 'Commentary', lib: 'Library', search: 'Bible search', bsearch: 'Book search', study: 'My Study', compare: 'Compare' };
  const QUICK = ['#222222', '#5b3a12', '#7a1f1f', '#1f4f8a', '#1e6b3a', '#5a2d82', '#ffffff', '#f5ecd7', '#e8f0e4', '#e4ecf5', '#2b2d31', '#10141a'];
  const skins = () => state.settings.panelSkins || {};
  const elOf = id => { const p = (TimotheosDock.panel && TimotheosDock.panel(id)) || null; return p ? p.el : document.querySelector({ tree: '#pane-tree', library: '#pane-library', cmt: '#tab-cmt', lib: '#tab-lib', search: '#tab-search', bsearch: '#tab-bsearch', study: '#tab-study', compare: '#tab-compare' }[id]); };

  function apply(id) {
    const el = elOf(id); if (!el) return;
    const k = skins()[id] || {};
    for (const p of ['--font-ui', '--font-text', '--text', '--strong', '--fn', '--bg', '--card', '--panel']) el.style.removeProperty(p);
    el.style.fontFamily = ''; el.style.color = ''; el.style.background = '';
    if (k.font) { const f = `'${String(k.font).replace(/['\\]/g, '')}', 'TwGreek', 'TwHebrew', sans-serif`; el.style.fontFamily = f; el.style.setProperty('--font-ui', f); el.style.setProperty('--font-text', f); }
    if (k.color) { el.style.color = k.color; el.style.setProperty('--text', k.color); el.style.setProperty('--heading', k.color); }
    if (k.link) { el.style.setProperty('--strong', k.link); el.style.setProperty('--fn', k.link); }
    if (k.bg) { el.style.background = k.bg; el.style.setProperty('--bg', k.bg); el.style.setProperty('--panel', k.bg); el.style.setProperty('--card', `color-mix(in srgb, ${k.bg} 90%, ${k.color || 'gray'} 10%)`); }
    el.classList.toggle('pskin', !!(k.font || k.color || k.link || k.bg));
  }
  function applyAll() { for (const id of Object.keys(NAMES)) apply(id); }
  function set(id, key, val) {
    const all = Object.assign({}, skins()); const k = Object.assign({}, all[id]);
    if (val) k[key] = val; else delete k[key];
    if (Object.keys(k).length) all[id] = k; else delete all[id];
    save({ panelSkins: all }); apply(id);
  }
  function resetAll() { save({ panelSkins: {} }); applyAll(); TimotheosStudy.flash('All panels are back to the skin'); }

  function menu(id, btn) {
    const k = skins()[id] || {}; const fonts = TimotheosOptions.fonts();
    const row = (key, label) => `<div class="pskrow" data-k="${key}"><span class="pskl">${label}</span><span class="pskc">${QUICK.map(c => `<button type="button" class="swc" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}<input type="color" value="${/^#[0-9a-f]{6}$/i.test(k[key] || '') ? k[key] : '#808080'}" title="Any colour"><button type="button" class="pskx" title="As in the skin">✕</button></span></div>`;
    paneMenu(btn, `<div class="mh">${esc(NAMES[id] || id)} – own fonts and colours</div>
      <label class="pskfont">Font <select><option value="">As in Options</option>${fonts.map(f => `<option${f === k.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      ${row('color', 'Text')}${row('link', 'Verse links')}${row('bg', 'Background')}
      <div class="swrow"><button type="button" class="pskreset">Back to the skin</button><button type="button" class="pskall" title="Every panel back to the skin">All panels</button></div>`, m => {
      m.classList.add('pskmenu');
      m.querySelector('select').onchange = e => set(id, 'font', e.target.value || null);
      m.addEventListener('click', e => {
        const row = e.target.closest('.pskrow');
        if (row && e.target.closest('.swc')) set(id, row.dataset.k, e.target.closest('.swc').dataset.c);
        else if (row && e.target.closest('.pskx')) set(id, row.dataset.k, null);
        else if (e.target.closest('.pskreset')) { const all = Object.assign({}, skins()); delete all[id]; save({ panelSkins: all }); apply(id); m.remove(); }
        else if (e.target.closest('.pskall')) { resetAll(); m.remove(); }
      });
      m.addEventListener('input', e => { const row = e.target.closest('.pskrow'); if (row && e.target.type === 'color') set(id, row.dataset.k, e.target.value); });
    });
  }
  window.TimotheosPanelSkin = { menu, apply, applyAll, resetAll, set };
})();
