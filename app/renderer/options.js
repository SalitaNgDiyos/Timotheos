/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Skins and the Options window (fonts, background, colours, verse numbers, layout, modules,
 * [E1] language switcher, and [E2] customizable keyboard shortcuts). */
/* global state, save, renderChapter, TimotheosIcons, TimotheosDock, TimotheosModules, TimotheosI18n */
(function () {
  const $ = s => document.querySelector(s);

  /* ------------------------------------------------------------ skins */
  const SKINS = {
    parchment: { name: 'Parchment', dark: false, v: {
      bg: '#f7f5f0', panel: '#efece5', card: '#fffdf8', line: '#ddd7cb', text: '#24221f', muted: '#6f6a60', accent: '#8a5a12', 'accent-soft': '#f1e3c8',
      woj: '#b3261e', added: '#5d5850', strong: '#2f6fb0', morph: '#7a4fa0', sel: '#fff1c9', heading: '#3b3428', fn: '#2f6fb0',
      textbg: '#fffdf8', tool: '#ebe6db', tooltext: '#2c2822', 'cap-bible': '#8a5a12', 'cap-lib': '#5e6b2f', 'cap-cmt': '#a2501f', 'cap-dict': '#6b4a91', 'cap-search': '#2f6a8a', 'cap-study': '#9a3d5c', captext: '#ffffff', tex: 'rgba(90,60,20,.05)', 'sb-track': '#ebe6dc', 'sb-thumb': '#b89660', 'sb-thumb-hover': '#9e7129', 'sb-thumb-active': '#8a5a12' } },
    office: { name: 'Office Blue', dark: false, v: {
      bg: '#eef2f7', panel: '#e4eaf2', card: '#ffffff', line: '#cdd6e2', text: '#1d2633', muted: '#5b6676', accent: '#2a63b8', 'accent-soft': '#dde8f8',
      woj: '#c0262d', added: '#566070', strong: '#2a63b8', morph: '#7a4fa0', sel: '#fff3c4', heading: '#1d2a40', fn: '#2a63b8',
      textbg: '#ffffff', tool: '#dfe7f2', tooltext: '#1d2633', 'cap-bible': '#2a63b8', 'cap-lib': '#3d7f5a', 'cap-cmt': '#c2662a', 'cap-dict': '#6f4fb0', 'cap-search': '#1f8496', 'cap-study': '#b0436d', captext: '#ffffff', tex: 'rgba(30,60,110,.045)', 'sb-track': '#dfe7f2', 'sb-thumb': '#7ca0d6', 'sb-thumb-hover': '#4b7ec9', 'sb-thumb-active': '#2a63b8' } },
    sampaguita: { name: 'Sampaguita', dark: false, v: {
      bg: '#f4f6f1', panel: '#ecf0e8', card: '#ffffff', line: '#dde3da', text: '#1d2420', muted: '#5a645c', accent: '#2f7d4f', 'accent-soft': '#e1f0e6',
      woj: '#b3261e', added: '#56605a', strong: '#2f64a3', morph: '#7448ae', sel: '#fff6d6', heading: '#1d2a22', fn: '#2f64a3',
      textbg: '#ffffff', tool: '#ffffff', tooltext: '#1d2420', 'cap-bible': '#2f7d4f', 'cap-lib': '#5b7a2a', 'cap-cmt': '#b0541a', 'cap-dict': '#7448ae', 'cap-search': '#2f64a3', 'cap-study': '#a83e64', captext: '#ffffff', tex: 'rgba(40,90,50,.045)', 'sb-track': '#e6ece1', 'sb-thumb': '#7ab08e', 'sb-thumb-hover': '#4b9468', 'sb-thumb-active': '#2f7d4f' } },
    narra: { name: 'Narra', dark: false, v: {
      bg: '#f1e8dc', panel: '#eadfcf', card: '#fffaf2', line: '#e0d2bf', text: '#2e2218', muted: '#6a5948', accent: '#9c5b22', 'accent-soft': '#f4e3cf',
      woj: '#a3271e', added: '#5e4f40', strong: '#355e8c', morph: '#74466f', sel: '#fbebc8', heading: '#3b2a1e', fn: '#355e8c',
      textbg: '#fffaf2', tool: '#3b2a1e', tooltext: '#f6ebdd', 'cap-bible': '#7a4518', 'cap-lib': '#5f6b2c', 'cap-cmt': '#9c5b22', 'cap-dict': '#74466f', 'cap-search': '#355e8c', 'cap-study': '#8e3b3b', captext: '#fff8ee', tex: 'rgba(110,60,20,.06)', 'sb-track': '#e5d7c3', 'sb-thumb': '#be8858', 'sb-thumb-hover': '#ab6e38', 'sb-thumb-active': '#9c5b22' } },
    sepia: { name: 'Sepia', dark: false, v: {
      bg: '#efe4cf', panel: '#e8dcc4', card: '#f8efdc', line: '#d8c8a8', text: '#3a2e1f', muted: '#6e5f49', accent: '#8b5e2b', 'accent-soft': '#ead7b3',
      woj: '#9e2a1c', added: '#5f513e', strong: '#3d5f80', morph: '#6c4a7a', sel: '#f6e2a6', heading: '#3a2e1f', fn: '#3d5f80',
      textbg: '#f8efdc', tool: '#e3d4b6', tooltext: '#3a2e1f', 'cap-bible': '#8b5e2b', 'cap-lib': '#6b6a2e', 'cap-cmt': '#9a5530', 'cap-dict': '#6c4a7a', 'cap-search': '#3d5f80', 'cap-study': '#8e4253', captext: '#fffaf0', tex: 'rgba(100,70,30,.07)', 'sb-track': '#e3d4b6', 'sb-thumb': '#b38c5c', 'sb-thumb-hover': '#9d723f', 'sb-thumb-active': '#8b5e2b' } },
    slate: { name: 'Slate', dark: true, v: {
      bg: '#1d1f23', panel: '#23262b', card: '#272a30', line: '#393d45', text: '#e6e2d9', muted: '#a29d93', accent: '#e2b36a', 'accent-soft': '#3d3426',
      woj: '#ff8a80', added: '#b9b2a6', strong: '#8ab8f0', morph: '#c9a6f0', sel: '#3b3523', heading: '#efe6d2', fn: '#8ab8f0',
      textbg: '#202227', tool: '#16181b', tooltext: '#e6e2d9', 'cap-bible': '#6b5326', 'cap-lib': '#4a5a2e', 'cap-cmt': '#7a4526', 'cap-dict': '#55407a', 'cap-search': '#2d5870', 'cap-study': '#743650', captext: '#f4efe6', tex: 'rgba(255,255,255,.025)', 'sb-track': '#1e2025', 'sb-thumb': '#7a6643', 'sb-thumb-hover': '#b08d52', 'sb-thumb-active': '#e2b36a' } },
    midnight: { name: 'Midnight', dark: true, v: {
      bg: '#0f1522', panel: '#141b2b', card: '#1a2234', line: '#2a3550', text: '#e4e9f5', muted: '#9aa6bf', accent: '#7aa7ff', 'accent-soft': '#1f2d4d',
      woj: '#ff9a8f', added: '#b5bfd4', strong: '#8fc0ff', morph: '#d0a8ff', sel: '#2b3350', heading: '#f0f3fa', fn: '#8fc0ff',
      textbg: '#131a29', tool: '#0b101b', tooltext: '#e4e9f5', 'cap-bible': '#2c4a86', 'cap-lib': '#2f5a4a', 'cap-cmt': '#7a4a2a', 'cap-dict': '#4f3c86', 'cap-search': '#235f75', 'cap-study': '#6e3256', captext: '#f2f5fc', tex: 'rgba(255,255,255,.025)', 'sb-track': '#101726', 'sb-thumb': '#3b5994', 'sb-thumb-hover': '#567cc7', 'sb-thumb-active': '#7aa7ff' } },
    dusk: { name: 'Dusk', dark: true, v: {
      bg: '#12161c', panel: '#171c24', card: '#1c222c', line: '#2c3441', text: '#e5e9ef', muted: '#9ea8b6', accent: '#5ed1b5', 'accent-soft': '#173a33',
      woj: '#ff9189', added: '#b3bcc8', strong: '#8bb6f5', morph: '#c7a2ff', sel: '#2a2f22', heading: '#f1f4f8', fn: '#8bb6f5',
      textbg: '#161b22', tool: '#0f1318', tooltext: '#e5e9ef', 'cap-bible': '#1f6b5c', 'cap-lib': '#4a6130', 'cap-cmt': '#7d4a24', 'cap-dict': '#56408a', 'cap-search': '#2b5d84', 'cap-study': '#7a3552', captext: '#f1f4f8', tex: 'rgba(255,255,255,.025)', 'sb-track': '#131820', 'sb-thumb': '#2d6e62', 'sb-thumb-hover': '#439e8c', 'sb-thumb-active': '#5ed1b5' } }
  };

  // [E2] Default customizable keyboard shortcuts
  const DEFAULT_SHORTCUTS = {
    import: 'Ctrl+I',
    addFolder: 'Ctrl+O',
    rescan: 'Ctrl+Shift+F5',
    search: 'Ctrl+F',
    bookSearch: 'Ctrl+Shift+F',
    goto: 'Ctrl+G',
    copyVerses: 'F5',
    guide: 'F1',
    options: 'Ctrl+,',
    devtools: 'Ctrl+Shift+I',
    addVerseList: 'Ctrl+L',
    layoutCols: 'Ctrl+H',
    layoutRows: 'Ctrl+J',
    columnsMode: 'Alt+I',
    toggleStrongs: 'S',
    toggleMorph: 'M',
    toggleLemma: 'L',
    toggleFootnotes: 'F',
    toggleHeadings: 'H',
    toggleWoj: 'J',
    toggleAdded: 'I',
    toggleXrefs: 'X',
    toggleCmtLinks: 'C',
    toggleHighlights: 'U',
    toggleNotes: 'N',
  };

  const SHORTCUT_LABELS = [
    ['search', 'Bible search'],
    ['bookSearch', 'Book search'],
    ['goto', 'Go to reference'],
    ['copyVerses', 'Copy verses window'],
    ['addVerseList', 'Add current verse to list'],
    ['import', 'Import modules'],
    ['addFolder', 'Add module folder'],
    ['rescan', 'Rescan modules'],
    ['options', 'Options window'],
    ['guide', 'User Guide'],
    ['layoutCols', 'Bible views side by side'],
    ['layoutRows', 'Bible views one under another'],
    ['columnsMode', 'Intralinear View'],
    ['toggleStrongs', "Toggle Strong's numbers"],
    ['toggleMorph', 'Toggle morphology codes'],
    ['toggleLemma', 'Toggle lemmas'],
    ['toggleFootnotes', 'Toggle footnotes'],
    ['toggleHeadings', 'Toggle headings'],
    ['toggleWoj', 'Toggle words of Jesus in red'],
    ['toggleAdded', 'Toggle added words in italics'],
    ['toggleXrefs', 'Toggle cross-references'],
    ['toggleCmtLinks', 'Toggle commentary marks'],
    ['toggleHighlights', 'Toggle my highlighting'],
    ['toggleNotes', 'Toggle my notes under verses'],
  ];

  const DEFAULTS = {
    skin: 'parchment', bgMode: 'skin', bgColor: '#fffdf8', texture: 'none', colors: {}, capColor: true,
    fontText: 'Gentium Plus', fontGreek: 'Gentium Plus', fontHebrew: 'Noto Serif Hebrew', fontUi: 'system', uiSize: 13, paneSize: 14,
    lineH: 1.65, textWidth: 0, useModFont: true, vnPos: 'inline', vnStyle: 'normal', vnSize: 0.75, chapNum: 'none',
    tbMode: 'both', density: 'comfy', showStatus: true
  };
  const BUNDLED = ['Gentium Plus', 'Literata', 'Source Serif 4', 'Inter', 'Noto Serif Hebrew'];
  const COMMON = ['Cambria', 'Constantia', 'Georgia', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', 'Segoe UI', 'Calibri', 'Verdana', 'Tahoma', 'Arial', 'SBL Greek', 'SBL Hebrew', 'Ezra SIL', 'Cardo'];
  let installed = null;

  const A = () => state.settings.appearance;
  function shortcuts() {
    return Object.assign({}, DEFAULT_SHORTCUTS, (state && state.settings && state.settings.shortcuts) || {});
  }
  /* ------------------------------------------------------------ Firefox themes (copied from the user's own Firefox)
     A Firefox theme gives the frame, toolbar, popup and field colours and a header picture. The frame and toolbar take them
     as they are, the picture over the title bar and the toolbar below it; the reading surfaces get calm colours worked out
     from the frame, light or dark as the theme is. */
  let fxDone = false, addFx = null;
  /* themes from the user's own Firefox (copied by "Import from my Firefox"; kept in the data folder) */
  async function loadMyFx() {
    if (!window.api || !api.fxList) return;
    try { const l = await api.fxList(); fxSkins(); for (const k of Object.keys(SKINS)) if (k.startsWith('fxu-')) delete SKINS[k]; for (const t of l) addFx(t); } catch (e) { /* none */ }
    if (A().skin && A().skin.startsWith('fxu-') && SKINS[A().skin]) apply();
  }
  async function importMyFx() {
    if (!window.api || !api.fxImport) return;
    const r = await api.fxImport(); fxSkins(); for (const k of Object.keys(SKINS)) if (k.startsWith('fxu-')) delete SKINS[k]; for (const t of r.list) addFx(t);
    const n = r.themes.length;
    TimotheosModules.modal('Firefox themes', n ? `<p>${n} theme${n === 1 ? '' : 's'} copied from your Firefox (${r.profiles} profile${r.profiles === 1 ? '' : 's'}): ${r.themes.map(t => esc(t.name)).join(', ')}.</p><p class="small">They are under <b>Skin › My Firefox themes</b>. They stay on this computer and keep their authors' terms. Firefox's own built-in themes (System, Light, Dark, Alpenglow) are inside Firefox itself and are not copied.</p>`
      : `<p>No installed Firefox themes were found${r.profiles ? ` in your ${r.profiles} Firefox profile${r.profiles === 1 ? '' : 's'}` : ' (no Firefox profile on this computer)'}.</p><p class="small">Firefox's own built-in themes (System, Light, Dark, Alpenglow) are inside Firefox itself and cannot be copied. Themes you added from addons.mozilla.org are found.</p>`,
      [{ label: 'OK', value: true, primary: true }]);
    fillSkinMenu(); if ($('#skinGrid')) fillSkinGrid();
    return r;
  }
  function fxSkins() {
    if (fxDone || !document.body) return; fxDone = true;
    const probe = document.createElement('i'); probe.style.display = 'none'; document.body.appendChild(probe);
    const rgb = c => { probe.style.color = ''; probe.style.color = c || ''; if (!probe.style.color) return null; const m = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m[3] == null ? 1 : m[3]]; };
    const hex = c => '#' + c.slice(0, 3).map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
    const mix = (a, b, t) => [0, 1, 2].map(i => a[i] * (1 - t) + b[i] * t).concat(1);
    const lum = c => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const con = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const reach = (c, base, want) => { let k = 0, out = c; while (con(out, base) < want && k < 20) { k++; out = mix(c, lum(base) > .4 ? [0, 0, 0] : [255, 255, 255], k * .05); } return out; };
    const build = (t, picture) => {
      const c = k => rgb(t.colors[k]);
      const frame = picture || c('frame') || [60, 60, 70, 1]; const ftext = c('tab_background_text') || (lum(frame) < .4 ? [240, 240, 240, 1] : [20, 20, 20, 1]);
      const dark = lum(frame) < .3;
      const ink = dark ? [233, 230, 226, 1] : [31, 29, 26, 1];
      const base = dark ? mix([24, 25, 29], frame, .18) : mix([252, 251, 248], frame, .07);
      const panel = mix(base, frame, dark ? .28 : .12);
      const tline = c('tab_line'); const fld = c('toolbar_field_border_focus');
      let acc = [tline, fld, c('tab_loading'), c('icons_attention'), frame].find(x => x && x[3] > .5 && con(x, base) > 1.6) || frame;
      acc = reach(acc, base, 3.2);
      const tb = c('toolbar'); const tool = tb ? mix(frame, tb, tb[3]) : frame;
      const ttext = c('toolbar_text') || ftext;
      const pop = c('popup'); const popt = c('popup_text');
      const v = { bg: hex(base), panel: hex(panel), card: hex(pop && pop[3] > .9 && con(pop, ink) > 4.5 && Math.abs(lum(pop) - lum(base)) < .5 ? pop : mix(base, dark ? [0, 0, 0] : [255, 255, 255], .5)),
        line: hex(mix(panel, ink, .14)), text: hex(ink), muted: hex(mix(ink, base, .42)), accent: hex(acc), 'accent-soft': hex(mix(base, acc, .18)),
        woj: dark ? '#ff8f86' : '#b3261e', added: hex(mix(ink, base, .35)), strong: hex(reach(mix(acc, [60, 120, 200], .5), base, 3.5)), morph: hex(reach(mix(acc, [130, 80, 170], .5), base, 3.5)),
        sel: hex(mix(base, acc, dark ? .26 : .16)), heading: hex(mix(ink, acc, .35)), fn: hex(reach(mix(acc, [60, 120, 200], .5), base, 3.5)),
        textbg: hex(dark ? mix(base, [0, 0, 0], .1) : mix(base, [255, 255, 255], .6)), tool: hex(tool), tooltext: hex(ttext),
        captext: hex(ftext), tex: 'transparent', 'sb-track': hex(panel), 'sb-thumb': hex(mix(panel, ink, .3)), 'sb-thumb-hover': hex(mix(panel, ink, .45)), 'sb-thumb-active': hex(acc) };
      for (const k of ['cap-bible', 'cap-lib', 'cap-cmt', 'cap-dict', 'cap-search', 'cap-study']) v[k] = hex(frame);
      const lay = t.layers || [];
      return { name: t.name, dark, fxt: t, v, fx: { frame: hex(frame), ftext: hex(ftext), toolbar: tb ? `rgba(${tb.slice(0, 3).map(Math.round).join(',')},${tb[3]})` : 'transparent', ttext: hex(ttext),
        img: lay.map(l => `url("${l.src}")`).join(', ') || 'none', pos: lay.map(l => l.pos).join(', ') || 'right top', rep: lay.map(l => l.rep).join(', ') || 'no-repeat', thumb: lay[0] ? lay[0].src : '' } };
    }
    addFx = t => {
      SKINS[t.key] = build(t);
      // an old-style theme (a picture with only a frame and text colour) is judged by its picture: its colours come from it
      if (!t.colors.toolbar && t.layers && t.layers[0]) {
        const im = new Image(); im.onload = () => {
          try {
            const cv = document.createElement('canvas'); const w = 48, h = 12; cv.width = w; cv.height = h; const g = cv.getContext('2d');
            g.drawImage(im, Math.max(0, im.naturalWidth - im.naturalHeight * 6), 0, Math.min(im.naturalWidth, im.naturalHeight * 6), im.naturalHeight, 0, 0, w, h);
            const d = g.getImageData(0, 0, w, h).data; let r = 0, gg = 0, b = 0, n = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; gg += d[k + 1]; b += d[k + 2]; n++; }
            SKINS[t.key] = build(t, [r / n, gg / n, b / n, 1]); SKINS[t.key].fx.frame = t.colors.frame ? hex(rgb(t.colors.frame) || [0, 0, 0]) : SKINS[t.key].fx.frame;
            if (A().skin === t.key) apply();
          } catch (e) { /* the picture could not be read: its own colours stay */ }
        };
        im.src = t.layers[0].src;
      }
    };

  }
  function ensure() {
    fxSkins();
    const a = state.settings.appearance = Object.assign({}, DEFAULTS, state.settings.appearance || {});
    a.colors = Object.assign({}, a.colors || {});
    a.zoom = Object.assign({}, a.zoom || {});
    a.uiSize = Math.max(11, Math.min(22, +a.uiSize || 13));
    a.paneSize = Math.max(11, Math.min(24, +a.paneSize || 14));
    if (!SKINS[a.skin]) {
      a.skin = state.settings.theme === 'dark' ? 'slate' : 'parchment';
    }
    return a;
  }
  function store() { save({ appearance: A() }); }

  /* ------------------------------------------------------------ applying */
  const q = f => `'${String(f).replace(/['\\]/g, '')}'`;
  function textStack(f) { return `'TwGreek', 'TwHebrew', ${q(f)}, 'Gentium Plus', Georgia, serif`; }

  function apply() {
    const a = ensure();
    const sk = SKINS[a.skin];
    const root = document.documentElement;
    root.dataset.theme = sk.dark ? 'dark' : 'light';
    root.dataset.skin = a.skin;
    for (const [k, v] of Object.entries(sk.v)) root.style.setProperty('--' + k, v);
    if (sk.fx) { root.dataset.fx = '1'; for (const [k, v] of Object.entries(sk.fx)) root.style.setProperty('--fx-' + k, v); }
    else delete root.dataset.fx;
    const c = a.colors;
    if (c.woj) root.style.setProperty('--woj', c.woj);
    if (c.strong) { root.style.setProperty('--strong', c.strong); root.style.setProperty('--fn', c.strong); }
    if (c.sel) root.style.setProperty('--sel', c.sel);
    root.style.setProperty('--vnum', c.vnum || sk.v.accent);
    root.style.setProperty('--textbg', a.bgMode === 'color' ? a.bgColor : sk.v.textbg);
    root.dataset.texture = a.texture;
    root.style.setProperty('--font-text', textStack(a.fontText));
    root.style.setProperty('--font-ui', a.fontUi === 'system' ? "'Segoe UI', system-ui, -apple-system, sans-serif" : `${q(a.fontUi)}, 'Segoe UI', system-ui, sans-serif`);
    root.style.setProperty('--ui-size', a.uiSize + 'px');
    root.style.setProperty('--pane-size', a.paneSize + 'px');
    root.style.setProperty('--lh', a.lineH);
    root.style.setProperty('--textw', a.textWidth ? a.textWidth + 'px' : 'none');
    root.style.setProperty('--vn-size', a.vnSize);
    root.style.setProperty('--size', (state.settings.fontSize || 17) + 'px');
    root.dataset.vnstyle = a.vnStyle;
    root.dataset.vnpos = a.vnPos;
    root.dataset.caps = a.capColor ? 'color' : 'plain';
    root.dataset.tb = a.tbMode;
    root.dataset.density = a.density;
    $('#statusbar').classList.toggle('hidden', !a.showStatus);
    greekHebrewFaces(a);
    if (window.refreshPaneLooks) window.refreshPaneLooks();
    if (window.applyZoom) window.applyZoom();
    if (window.applyLibSide) window.applyLibSide();
    if (window.TimotheosI18n) TimotheosI18n.apply(state.settings.lang || 'en');
    if (window.TimotheosSkins && TimotheosSkins.colors) TimotheosSkins.colors();   // the phone screens take the skin's colours (or keep their own)
  }

  /** faces "TwGreek"/"TwHebrew" cover only Greek/Hebrew letters, so a Greek font can differ from the Latin one */
  function greekHebrewFaces(a) {
    let css = '';
    const bundledRules = [];
    for (const ss of document.styleSheets) {
      if (!/fonts\.css$/.test(ss.href || '')) continue;
      try { for (const r of ss.cssRules) if (r instanceof CSSFontFaceRule) bundledRules.push(r); } catch (e) { /* not readable */ }
    }
    const alias = (alias, fam, subsetRx, range) => {
      if (BUNDLED.includes(fam)) {
        for (const r of bundledRules) {
          if (r.style.getPropertyValue('font-family').replace(/['"]/g, '') !== fam) continue;
          const src = r.style.getPropertyValue('src'); if (!subsetRx.test(src)) continue;
          css += `@font-face{font-family:'${alias}';font-style:${r.style.getPropertyValue('font-style')};font-weight:${r.style.getPropertyValue('font-weight')};src:${src};unicode-range:${r.style.getPropertyValue('unicode-range')};}\n`;
        }
      } else {
        for (const [w, s] of [[400, 'normal'], [700, 'normal'], [400, 'italic'], [700, 'italic']]) css += `@font-face{font-family:'${alias}';font-weight:${w};font-style:${s};src:local(${q(fam)});unicode-range:${range};}\n`;
      }
    };
    alias('TwGreek', a.fontGreek, /greek/, 'U+0370-03FF, U+1F00-1FFF');
    alias('TwHebrew', a.fontHebrew, /hebrew-hebrew/, 'U+0590-05FF, U+FB1D-FB4F');
    let st = document.getElementById('dynFonts');
    if (!st) { st = document.createElement('style'); st.id = 'dynFonts'; document.head.appendChild(st); }
    st.textContent = css;
  }

  /* ------------------------------------------------------------ skin quick menu */
  function skinSwatch(id) {
    const v = SKINS[id].v;
    if (SKINS[id].fx) return `<span class="swatch fxsw" style="background:${SKINS[id].fx.frame} url('${SKINS[id].fx.thumb}') right top / cover no-repeat"></span>`;
    return `<span class="swatch" style="background:linear-gradient(135deg, ${v.textbg} 0 50%, ${v['cap-bible']} 50% 75%, ${v.tool} 75%)"></span>`;
  }
  function fillSkinMenu() {
    const m = $('#skinMenu');
    const it = ([id, s]) => `<button data-skin="${id}" class="${A().skin === id ? 'on' : ''}">${skinSwatch(id)}${esc(s.name)}${s.dark ? ' <span class="small">dark</span>' : ''}</button>`;
    const all = Object.entries(SKINS);
    m.innerHTML = '<div class="mh">Skin</div>' + all.filter(([, s]) => !s.fx).map(it).join('') +
      (all.some(([id]) => id.startsWith('fxu-')) ? '<div class="mh">My Firefox themes</div>' + all.filter(([id]) => id.startsWith('fxu-')).map(it).join('') : '') +
      (window.api && api.fxImport ? '<button data-act="fximport">Import themes from my Firefox…</button>' : '') +
      '<div class="msep"></div><button data-act="opts">More appearance options…</button>';
    m.querySelectorAll('[data-skin]').forEach(b => b.onclick = () => { setSkin(b.dataset.skin); closeMenus(); });
    m.querySelector('[data-act="opts"]').onclick = () => { closeMenus(); open('look'); };
    const fi = m.querySelector('[data-act="fximport"]'); if (fi) fi.onclick = () => { closeMenus(); importMyFx(); };
  }
  function setSkin(id) { A().skin = id; save({ theme: SKINS[id].dark ? 'dark' : 'light' }); store(); apply(); syncForm(); }

  /* ------------------------------------------------------------ panels menu */
  function fillPanelsMenu() {
    const m = $('#panelsMenu');
    const row = p => {
      const at = TimotheosDock.located(p.id); const on = at && !at.hidden;
      return `<button data-p="${p.id}">${TimotheosIcons.icon(on ? 'check' : 'plus', 15)}<span class="pic" style="color:var(--cap-${p.cap})">${TimotheosIcons.icon(p.icon, 15)}</span>${esc(p.title)}</button>`;
    };
    const all = TimotheosDock.panels();
    const rows = all.filter(p => !TimotheosDock.isBible(p.id)).map(row).join('');
    const bibles = all.filter(p => TimotheosDock.isBible(p.id)).map(row).join('');
    const presets = Object.entries(TimotheosDock.PRESETS).map(([id, p]) => `<button data-preset="${id}">${TimotheosIcons.icon('layout', 15)}${p.label}</button>`).join('');
    const saved = Object.keys(state.settings.savedLayouts || {}).map(n => `<button data-saved="${esc(n)}">${TimotheosIcons.icon('study', 15)}${esc(n)}</button>`).join('');
    m.innerHTML = `<div class="mh">Panels <span class="small">(click to show or close · the grid has 4 columns × 3 rows)</span></div>
      <button data-act="newbv">${TimotheosIcons.icon('plus', 15)}<span class="pic" style="color:var(--cap-bible)">${TimotheosIcons.icon('bible', 15)}</span><b>Bible View</b> <span class="small">(add another)</span></button>${bibles}${rows}
      <div class="msep"></div><div class="mh">Layouts</div>${presets}${saved}
      <div class="msep"></div><button data-act="save">${TimotheosIcons.icon('plus', 15)}Save current layout as…</button>
`;
    m.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const at = TimotheosDock.located(b.dataset.p);
      if (at && !at.hidden) { if (TimotheosDock.isBible(b.dataset.p)) window.closeView(+b.dataset.p.slice(2)); else TimotheosDock.hide(b.dataset.p); }
      else window.openTab(b.dataset.p);
      fillPanelsMenu();
    });
    m.querySelector('[data-act="newbv"]').onclick = async () => { closeMenus(); await window.addView((state.settings.views[state.active] || {}).bible || state.modules.bibles[0].id); };
    m.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { TimotheosDock.applyPreset(b.dataset.preset); closeMenus(); });
    m.querySelectorAll('[data-saved]').forEach(b => b.onclick = () => { TimotheosDock.setLayout(state.settings.savedLayouts[b.dataset.saved]); closeMenus(); });
    m.querySelector('[data-act="save"]').onclick = () => { closeMenus(); saveLayoutAs(); };
  }
  async function saveLayoutAs() {
    const name = await TimotheosModules.modal('Save layout', '<label class="field">Name of this layout <input id="layName" type="text" placeholder="e.g. Sermon preparation"></label>',
      [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }]).then(v => v && document.getElementById('layName').value.trim());
    if (!name) return;
    const all = Object.assign({}, state.settings.savedLayouts || {}); all[name] = TimotheosDock.state();
    save({ savedLayouts: all }); renderSavedLayouts();
  }
  function renderSavedLayouts() {
    const ul = $('#savedLayouts'); const all = state.settings.savedLayouts || {};
    ul.innerHTML = Object.keys(all).map(n => `<li><span>${esc(n)}</span><button data-use="${esc(n)}">Use</button><button data-del="${esc(n)}" title="Delete this layout">×</button></li>`).join('');
    ul.querySelectorAll('[data-use]').forEach(b => b.onclick = () => TimotheosDock.setLayout(all[b.dataset.use]));
    ul.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const c = Object.assign({}, all); delete c[b.dataset.del]; save({ savedLayouts: c }); renderSavedLayouts(); });
  }

  function closeMenus() { document.querySelectorAll('#panelsMenu, #skinMenu, #viewMenu').forEach(m => m.classList.add('hidden')); }
  function toggleMenu(id, fill) {
    const m = $(id); const was = !m.classList.contains('hidden');
    closeMenus(); if (was) return;
    if (fill) fill(); m.classList.remove('hidden');
    // a long list (many skins) scrolls inside the menu instead of running off the bottom of the window
    m.style.maxHeight = Math.max(160, innerHeight - m.getBoundingClientRect().top - 12) + 'px';
    const on = m.querySelector('button.on'); if (on && on.offsetTop > m.clientHeight - 40) m.scrollTop = on.offsetTop - m.clientHeight / 3;
  }

  /* ------------------------------------------------------------ [E2] Keyboard Shortcuts Editor */
  function formatKeyCombo(e) {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey && (e.ctrlKey || e.altKey || e.key.length > 1)) parts.push('Shift');
    const k = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(k);
    return parts.join('+');
  }

  function renderShortcutsEditor() {
    const box = $('#optKeysList');
    if (!box) return;
    const cur = shortcuts();
    box.innerHTML = `<table class="imp"><thead><tr><th>Action</th><th>Shortcut (click to change)</th><th></th></tr></thead><tbody>` +
      SHORTCUT_LABELS.map(([id, label]) => `<tr><td>${esc(label)}</td><td><button type="button" class="scbtn" data-sc="${id}">${esc(cur[id] || 'None')}</button></td><td>${cur[id] !== DEFAULT_SHORTCUTS[id] ? `<button type="button" class="link0" data-screset="${id}">default (${esc(DEFAULT_SHORTCUTS[id])})</button>` : ''}</td></tr>`).join('') +
      `</tbody></table>`;
    box.querySelectorAll('.scbtn').forEach(btn => {
      btn.onclick = () => {
        box.querySelectorAll('.scbtn.rec').forEach(b => { b.classList.remove('rec'); b.textContent = shortcuts()[b.dataset.sc] || 'None'; });
        btn.classList.add('rec');
        btn.textContent = 'Press a key… (Esc: cancel, Backspace: clear)';
        const onKey = ev => {
          ev.preventDefault(); ev.stopPropagation();
          if (ev.key === 'Escape') { document.removeEventListener('keydown', onKey, true); renderShortcutsEditor(); return; }
          const next = Object.assign({}, state.settings.shortcuts || {});
          if (ev.key === 'Backspace' || ev.key === 'Delete') {
            next[btn.dataset.sc] = '';
          } else {
            const combo = formatKeyCombo(ev);
            if (!combo) return;
            // Clear any conflicting command that uses the same key combination
            const allCur = shortcuts();
            for (const [otherId, otherKey] of Object.entries(allCur)) {
              if (otherId !== btn.dataset.sc && otherKey && otherKey.toLowerCase() === combo.toLowerCase()) {
                next[otherId] = '';
              }
            }
            next[btn.dataset.sc] = combo;
          }
          document.removeEventListener('keydown', onKey, true);
          save({ shortcuts: next });
          if (window.TimotheosTitlebar && TimotheosTitlebar.rebuild) TimotheosTitlebar.rebuild();
          renderShortcutsEditor();
        };
        document.addEventListener('keydown', onKey, true);
      };
    });
    box.querySelectorAll('[data-screset]').forEach(btn => {
      btn.onclick = () => {
        const next = Object.assign({}, state.settings.shortcuts || {});
        delete next[btn.dataset.screset];
        save({ shortcuts: next });
        if (window.TimotheosTitlebar && TimotheosTitlebar.rebuild) TimotheosTitlebar.rebuild();
        renderShortcutsEditor();
      };
    });
    const resetAll = $('#resetShortcutsBtn');
    if (resetAll) {
      resetAll.onclick = () => {
        save({ shortcuts: {} });
        if (window.TimotheosTitlebar && TimotheosTitlebar.rebuild) TimotheosTitlebar.rebuild();
        renderShortcutsEditor();
      };
    }
  }

  /* ------------------------------------------------------------ the Options window */
  async function listFonts() {
    if (installed) return;
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        installed = [...new Set(fonts.map(f => f.family))].sort((x, y) => x.localeCompare(y));
      }
    } catch (e) { installed = null; }
  }
  function fontOptions(sel, cur, withSystem) {
    const grp = (label, list) => `<optgroup label="${label}">${list.map(f => `<option value="${esc(f)}" style="font-family:${esc(q(f))}">${esc(f)}</option>`).join('')}</optgroup>`;
    let h = withSystem ? '<option value="system">Windows default (Segoe UI)</option>' : '';
    h += grp('Included with Timotheos', BUNDLED);
    if (installed && installed.length) h += grp('Installed on this computer', installed.filter(f => !BUNDLED.includes(f)));
    else h += grp('Common Windows fonts (if installed)', COMMON);
    sel.innerHTML = h;
    if (![...sel.options].some(o => o.value === cur)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(cur)}" style="font-family:${esc(q(cur))}">${esc(cur)}</option>`);
    sel.value = cur;
  }

  function fillSkinGrid() {
    const a = A(); const phone = document.documentElement.classList.contains('sk');
    const onId = phone ? (a.phoneSkin || 'screen') : a.skin;
    let own = '';
    if (phone) { const [bg, ink, ac] = (window.TimotheosSkins && TimotheosSkins.screenColors()) || ['#0f1013', '#ece6d8', '#d8b46f'];
      own = `<button class="skincard${onId === 'screen' ? ' on' : ''}" data-skin="screen" title="Screen colours"><span class="sk sk-own" style="background:${bg}"><span class="skm" style="background:${bg};color:${ink}"><b style="color:${ac}">16</b> For God so <i style="color:${ac}">loved</i></span></span><span class="skn">Screen colours · this screen's own</span></button>`; }
    $('#skinGrid').innerHTML = own + Object.entries(SKINS).map(([id, s]) => {
      const v = s.v; const fx = s.fx;
      return `<button class="skincard${onId === id ? ' on' : ''}${fx ? ' fxcard' : ''}" data-skin="${id}" title="${esc(s.name)}${fx ? ` — from your Firefox${s.fxt.author ? ', by ' + esc(s.fxt.author) : ''}` : ''}">
        <span class="sk" style="background:${v.bg}">
          <span class="skt" style="background:${fx ? `${fx.frame} url('${fx.thumb}') right top / cover no-repeat` : v.tool}"></span>
          <span class="skl" style="background:${v.panel}"><i style="background:${v['cap-bible']}"></i><i style="background:${v['cap-lib']}"></i></span>
          <span class="skm" style="background:${v.textbg};color:${v.text}"><b style="color:${v.accent}">16</b> For God so <i style="color:${v.woj}">loved</i></span>
          <span class="skr" style="background:${v.panel}"><i style="background:${v['cap-cmt']}"></i><i style="background:${v['cap-dict']}"></i></span>
        </span><span class="skn">${esc(s.name)}${s.dark ? ' · dark' : ''}${fx ? ' · Firefox' : ''}</span></button>`;
    }).join('');
    $('#skinGrid').querySelectorAll('[data-skin]').forEach(b => b.onclick = () => {
      const id = b.dataset.skin;
      if (phone) { A().phoneSkin = id; if (id === 'screen') { store(); apply(); } else setSkin(id); } else setSkin(id);
      fillSkinGrid();
    });
  }

  function syncForm() {
    const a = A(); const sk = SKINS[a.skin].v;
    document.querySelectorAll('input[name="bgMode"]').forEach(r => { r.checked = r.value === a.bgMode; });
    $('#bgColor').value = a.bgMode === 'color' ? a.bgColor : sk.textbg;
    $('#bgTexture').value = a.texture;
    $('#colWoj').value = a.colors.woj || sk.woj; $('#colVnum').value = a.colors.vnum || sk.accent;
    $('#colStrong').value = a.colors.strong || sk.strong; $('#colSel').value = a.colors.sel || sk.sel;
    $('#optCapColor').checked = a.capColor;
    $('#fontSize').value = state.settings.fontSize || 17; $('#fontSizeV').textContent = (state.settings.fontSize || 17) + ' px';
    $('#lineH').value = a.lineH; $('#lineHV').textContent = (+a.lineH).toFixed(2);
    $('#textWidth').value = String(a.textWidth);
    $('#useModFont').checked = a.useModFont;
    $('#uiSize').value = a.uiSize; $('#uiSizeV').textContent = a.uiSize + ' px';
    $('#paneSize').value = a.paneSize; $('#paneSizeV').textContent = a.paneSize + ' px';
    document.querySelectorAll('input[name="vnPos"]').forEach(r => { r.checked = r.value === (a.vnPos === 'hidden' ? 'hidden' : 'inline'); });   // the verses flow as paragraphs: no number column
    $('#vnStyle').value = a.vnStyle; $('#vnSize').value = a.vnSize; $('#vnSizeV').textContent = Math.round(a.vnSize * 100) + '%';
    $('#chapNum').value = a.chapNum;
    document.querySelectorAll('input[name="tbMode"]').forEach(r => { r.checked = r.value === a.tbMode; });
    $('#density').value = a.density; $('#showStatus').checked = a.showStatus;
    if ($('#uiLang')) $('#uiLang').value = state.settings.lang || 'en';
    if ($('#skinGrid').children.length) fillSkinGrid();
    renderShortcutsEditor();
  }

  function set(patch, rerender) { Object.assign(A(), patch); store(); apply(); syncForm(); if (rerender) renderChapter(); }

  function wireForm() {
    document.querySelectorAll('input[name="bgMode"]').forEach(r => r.onchange = () => set({ bgMode: r.value }));
    $('#bgColor').oninput = () => set({ bgMode: 'color', bgColor: $('#bgColor').value });
    $('#bgTexture').onchange = () => set({ texture: $('#bgTexture').value });
    const col = (id, k) => { $(id).oninput = () => { A().colors[k] = $(id).value; set({}); }; };
    col('#colWoj', 'woj'); col('#colVnum', 'vnum'); col('#colStrong', 'strong'); col('#colSel', 'sel');
    document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { delete A().colors[b.dataset.reset]; set({}); });
    $('#optCapColor').onchange = () => set({ capColor: $('#optCapColor').checked });
    if ($('#uiLang')) {
      $('#uiLang').onchange = () => {
        save({ lang: $('#uiLang').value });
        if (window.TimotheosI18n) TimotheosI18n.apply($('#uiLang').value);
      };
    }
    $('#fontText').onchange = () => set({ fontText: $('#fontText').value });
    $('#fontGreek').onchange = () => set({ fontGreek: $('#fontGreek').value });
    $('#fontHebrew').onchange = () => set({ fontHebrew: $('#fontHebrew').value });
    $('#fontUi').onchange = () => set({ fontUi: $('#fontUi').value });
    $('#fontSize').oninput = () => { save({ fontSize: +$('#fontSize').value }); set({}); };
    $('#lineH').oninput = () => set({ lineH: +$('#lineH').value });
    $('#textWidth').onchange = () => set({ textWidth: +$('#textWidth').value });
    $('#useModFont').onchange = () => set({ useModFont: $('#useModFont').checked }, true);
    $('#uiSize').oninput = () => set({ uiSize: +$('#uiSize').value });
    $('#paneSize').oninput = () => set({ paneSize: +$('#paneSize').value });
    document.querySelectorAll('input[name="vnPos"]').forEach(r => r.onchange = () => set({ vnPos: r.value }, true));
    $('#vnStyle').onchange = () => set({ vnStyle: $('#vnStyle').value });
    $('#vnSize').oninput = () => set({ vnSize: +$('#vnSize').value });
    $('#chapNum').onchange = () => set({ chapNum: $('#chapNum').value }, true);
    document.querySelectorAll('input[name="tbMode"]').forEach(r => r.onchange = () => set({ tbMode: r.value }));
    $('#density').onchange = () => set({ density: $('#density').value });
    $('#showStatus').onchange = () => set({ showStatus: $('#showStatus').checked });
    $('#optReset').onclick = async () => {
      const ok = await TimotheosModules.confirmBox('Reset appearance', 'Put the skin, fonts, colours, verse numbers and toolbar back to how Timotheos starts? Your modules, notes and layouts are not touched.');
      if (!ok) return;
      state.settings.appearance = Object.assign({}, DEFAULTS, { colors: {} }); save({ fontSize: 17, theme: 'light' }); store(); apply(); syncForm(); fillFontSelects(); renderChapter();
    };
    $('#saveLayoutBtn').onclick = saveLayoutAs;
    $('#optNav').querySelectorAll('button').forEach(b => b.onclick = () => page(b.dataset.o));
    const close = () => $('#optionsDlg').classList.add('hidden');
    $('#optClose').onclick = close; $('#optDone').onclick = close;
    $('#optionsDlg').addEventListener('mousedown', e => { if (e.target.id === 'optionsDlg') close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#optionsDlg').classList.contains('hidden') && $('#modal').classList.contains('hidden')) close(); });
  }
  function fillFontSelects() {
    const a = A();
    fontOptions($('#fontText'), a.fontText); fontOptions($('#fontGreek'), a.fontGreek); fontOptions($('#fontHebrew'), a.fontHebrew); fontOptions($('#fontUi'), a.fontUi, true);
    $('#fontNote').textContent = installed && installed.length
      ? `The fonts installed on this computer are listed (${installed.length}). Fonts "Included with Timotheos" work on every computer.`
      : 'Timotheos could not list the fonts on this computer, so common Windows fonts are offered; one that is not installed shows as the fallback font. Fonts "Included with Timotheos" always work.';
  }
  function page(o) {
    $('#optNav').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.o === o));
    document.querySelectorAll('.optpage').forEach(p => p.classList.toggle('hidden', p.dataset.o !== o));
    if (o === 'speech' && window.TimotheosSpeech) TimotheosSpeech.fillOptions(document.getElementById('ttsOpt'));
  }
  async function open(pg) {
    const fontsP = listFonts();
    syncForm(); fillSkinGrid(); renderSavedLayouts();
    $('#layoutPresets').innerHTML = Object.entries(TimotheosDock.PRESETS).map(([id, p]) => `<button data-preset="${id}" class="presetbtn">${TimotheosIcons.icon('layout', 16)}${p.label}</button>`).join('');
    $('#layoutPresets').querySelectorAll('[data-preset]').forEach(b => b.onclick = () => TimotheosDock.applyPreset(b.dataset.preset));
    page(pg || 'look');
    $('#optionsDlg').classList.remove('hidden');
    fillFontSelects();
    await fontsP; fillFontSelects();
  }

  function init() {
    ensure(); apply(); loadMyFx();
    TimotheosIcons.fillIcons();
    wireForm();
    $('#optionsBtn').onclick = () => open();
    { const fb = $('#fxImportBtn'); if (fb) { if (window.api && api.fxImport && !document.documentElement.classList.contains('sk')) fb.onclick = () => importMyFx(); else fb.closest('.fxrow').classList.add('hidden'); } }
    $('#skinBtn').onclick = e => { e.stopPropagation(); toggleMenu('#skinMenu', fillSkinMenu); };
    $('#panelsBtn').onclick = e => { e.stopPropagation(); toggleMenu('#panelsMenu', fillPanelsMenu); };
    document.addEventListener('mousedown', e => { if (!e.target.closest('.menuwrap')) document.querySelectorAll('#panelsMenu, #skinMenu').forEach(m => m.classList.add('hidden')); });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function stepUiSize(d) {
    const a = ensure();
    const next = Math.round(Math.max(11, Math.min(22, (+a.uiSize || 13) + d * 0.5)) * 2) / 2;
    set({ uiSize: next });
    if (window.TimotheosStudy && TimotheosStudy.flash) TimotheosStudy.flash(`Menus & panels size ${next} px`);
  }

  window.TimotheosOptions = { init, apply, importMyFx, loadMyFx, open, stepUiSize, SKINS, DEFAULTS, DEFAULT_SHORTCUTS, shortcuts, setSkin, appearance: () => A(), fonts: () => [...new Set([...BUNDLED, ...COMMON, ...(installed || [])])] };
})();
