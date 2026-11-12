/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// The Timotheos icon comes in seven colourings. The one that shows in the app (title bar, About) follows the colours of the
// active skin: each built-in skin has its own, and any other skin (a Firefox theme, "Screen colours") gets the one whose
// colour is nearest to its accent colour.
const TimotheosLogo = (() => {
  const NAMES = {
    emerald: 'green scales, gold frame', crimson: 'red scales, gold frame', pearlgold: 'pearl scales, gold frame',
    pearlred: 'pearl scales, red frame', sapphire: 'blue scales, gold frame', pearlgreen: 'pearl scales, green frame',
    ember: 'dark scales, glowing gold frame and sword'
  };
  const BUILTIN = {
    parchment: 'crimson',   // warm paper: red and gold
    office: 'sapphire',     // blue
    sampaguita: 'emerald',  // green
    narra: 'pearlred',      // dark brown bars: pearl with a red frame
    sepia: 'pearlgold',     // tan paper: pearl and gold
    slate: 'ember',         // dark with gold: the glowing one
    midnight: 'sapphire',   // dark blue
    dusk: 'pearlgreen'      // dark teal
  };
  let cur = 'emerald';
  function hsl(c) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim()); if (!m) return null;
    let h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&');
    const r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return { h: 0, s: 0, l };
    const s = d / (1 - Math.abs(2 * l - 1));
    let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
    return { h: hue, s, l };
  }
  /** which of the six for a skin: its own when it is a built-in one, else by the hue of the accent colour */
  function pick(skin, dark, accent) {
    if (BUILTIN[skin]) return BUILTIN[skin];
    const c = hsl(accent); if (!c || c.s < 0.15) return dark ? 'ember' : 'pearlred';
    const h = c.h;
    if (h < 20 || h >= 265) return 'crimson';
    if (h < 70) return dark ? 'ember' : 'pearlgold';
    if (h < 150) return 'emerald';
    if (h < 200) return 'pearlgreen';
    return 'sapphire';
  }
  const src = px => `logo-${cur}-${px >= 128 ? 384 : 64}.png`;
  function paint() { document.querySelectorAll('img[data-logo]').forEach(i => { const s = src(+i.dataset.logo); if (i.getAttribute('src') !== s) i.setAttribute('src', s); }); }
  function sync(skin, dark, accent) {
    const w = pick(skin, !!dark, accent); cur = w;
    document.documentElement.dataset.logo = w; paint(); return w;
  }
  return { sync, paint, src, pick, current: () => cur, NAMES, BUILTIN };
})();
window.TimotheosLogo = TimotheosLogo;
