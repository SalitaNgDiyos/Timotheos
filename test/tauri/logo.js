/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The Timotheos icon follows the active skin: title bar and About.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s);
  try {
    for (let i = 0; i < 80 && !document.querySelector('.bv .pv[data-v]'); i++) await sleep(250);
    const want = { parchment: 'crimson', office: 'sapphire', sampaguita: 'emerald', narra: 'pearlred', sepia: 'pearlgold', slate: 'ember', midnight: 'sapphire', dusk: 'pearlgreen' };
    const loaded = async img => { for (let i = 0; i < 40 && !(img.complete && img.naturalWidth); i++) await sleep(100); return img.naturalWidth; };
    for (const [skin, icon] of Object.entries(want)) {
      TimotheosOptions.setSkin(skin); await sleep(250);
      const t = $('.titlebar .logo img'); const w = await loaded(t);
      ok(document.documentElement.dataset.logo === icon && /logo-(\w+)-64\.png$/.exec(t.getAttribute('src'))[1] === icon && w === 64, skin + ' → ' + icon + ' in the title bar (' + t.getAttribute('src') + ', ' + w + ' px)');
    }
    // About follows too, and is sharp (384 px shown at 96)
    TimotheosOptions.setSkin('midnight'); await sleep(200); runCommand('about'); await sleep(700);
    const a = $('.abouticon'); ok(/logo-sapphire-384\.png$/.test(a.getAttribute('src')) && (await loaded(a)) === 384, 'About shows the blue icon on Midnight');
    TimotheosOptions.setSkin('sampaguita'); await sleep(300);
    ok(/logo-emerald-384\.png$/.test($('.abouticon').getAttribute('src')), 'and changes with the skin while About is open');
    $('#modalBtns button').click(); await sleep(200);
    // skins that are not built in: by the hue of the accent colour
    const P = TimotheosLogo.pick;
    ok(P('fxu-x', false, '#c0392b') === 'crimson' && P('fxu-x', true, '#2a63b8') === 'sapphire' && P('x', false, '#2f7d4f') === 'emerald' && P('x', false, '#d4a017') === 'pearlgold' && P('x', true, '#1abc9c') === 'pearlgreen' && P('x', true, '#d4a017') === 'ember', 'another skin gets the icon nearest to its accent colour');
    ok(P('x', true, '#777777') === 'ember' && P('x', false, '#888') === 'pearlred' && P('x', false, 'nonsense') === 'pearlred', 'a grey or unknown accent: the glowing one on dark, pearl and red on light');
    ok(Object.values(TimotheosLogo.BUILTIN).length === 8 && new Set(Object.values(TimotheosLogo.BUILTIN)).size === 7 && Object.keys(TimotheosLogo.NAMES).length === 7, 'all seven icons are used by the built-in skins');
    TimotheosOptions.setSkin('slate'); await sleep(200);
  } catch (e) { ok(false, 'error: ' + (e && e.stack || e)); }
  console.log('RESULT ' + out.join(' | '));
})();
