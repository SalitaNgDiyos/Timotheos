// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// The real LXX Brenton+ e-Sword interlinear (.bblx): glosses raised, and in Intralinear View a line of each word's column.
// cp LXXBrenton_Esword-interlinear.bblx /tmp/lxx/x.bblx; FOLDERS='["/tmp/lxx"]' EXTRA=',"views":[{"bible":"es:x.bblx","linked":true}]' bash test/tauri/run.sh test/tauri/gloss-esword.js /tmp/lxxe.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const L = await api.listModules(); out.push('ids ' + L.bibles.map(b => b.id).join(','));
  await go({ b: 1, c: 1, v: 1 }); await sl(2500);
  const g = [...document.querySelectorAll('#workbench [data-v="1"] sup.gloss')].map(x => x.textContent);
  ok(g.slice(0, 5).join('|') === 'In|the beginning|made|God|the', 'verse 1 glosses: ' + g.join('|'));
  const w = [...document.querySelectorAll('#workbench [data-v="1"] span.word')].map(x => x.textContent.trim());
  ok(w.every(t => !/[A-Za-z]/.test(t)), 'word spans hold only Greek: ' + w.join('|'));
  state.settings.show.columns = true; renderChapter(false); await sl(2000);
  const cw = [...document.querySelectorAll('#workbench [data-v="1"] .cw')];
  const gl = cw.map(c => (c.querySelector('.cl-gloss') || {}).textContent);
  ok(gl.slice(0, 6).join('|') === 'In|the beginning|made||God|the', 'gloss lines in the columns: ' + gl.join('|'));
  const tops = cw.slice(0, 5).map(c => c.querySelector('.cl-gloss').getBoundingClientRect().top - c.getBoundingClientRect().top);
  ok(tops.every(t => Math.abs(t - tops[0]) < 1), 'level: ' + tops.map(x => x | 0));
  ok(!document.querySelector('#workbench [data-v="1"] .bvtext > sup.gloss, #workbench [data-v="1"] > sup.gloss'), 'none left between columns');
} catch (e) { out.push('✗ script error ' + e.message); }
console.log('RESULT ' + out.join(' | ')); })();
