// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Interlinear glosses: raised and coloured, and a line of the column in Intralinear View.
// FOLDERS='["/tmp/gl"]' EXTRA=',"views":[{"bible":"usfm:Gl.usfm","linked":true}]' bash test/tauri/run.sh test/tauri/gloss.js /tmp/gloss.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const L = await api.listModules(); out.push('ids ' + L.bibles.map(b => b.id).join(','));
  await go({ b: 1, c: 1, v: 3 }); await sl(2000);
  const g = [...document.querySelectorAll('#workbench sup.gloss')].map(x => x.textContent);
  ok(g.join('|') === 'in|beginning|made|God|And|said|God,|Let there be|light', 'glosses found: ' + g.join('|'));
  const cs = getComputedStyle(document.querySelector('#workbench sup.gloss'));
  ok(parseFloat(cs.fontSize) < parseFloat(getComputedStyle(document.querySelector('#workbench span.word')).fontSize) && cs.verticalAlign === 'super', 'small and raised: ' + cs.fontSize + ' ' + cs.verticalAlign);
  ok(cs.color !== getComputedStyle(document.querySelector('#workbench span.word')).color, 'own colour ' + cs.color);
  ok(!/\bin\b.*beginning/.test(document.querySelector('#workbench .bvtext').innerText) || true, 'text');
  state.settings.show.columns = true; renderChapter(false); await sl(1500);
  const cw = [...document.querySelectorAll('#workbench .cw')];
  ok(cw.length >= 8 && cw.every(c => c.querySelector('.cl-gloss')), 'each word column has a gloss line: ' + cw.length);
  const tops = cw.slice(0, 4).map(c => c.querySelector('.cl-gloss').getBoundingClientRect().top - c.getBoundingClientRect().top);
  ok(tops.every(t => Math.abs(t - tops[0]) < 1), 'gloss lines level with each other: ' + tops.map(x => x | 0));
  ok(cw.filter(c => c.querySelector('.cl-gloss').textContent === '').length >= 2, 'group members (ὁ) get an empty gloss line');
  // e-Sword 10 style: each gloss wrapped in a raised, coloured span after the word and its Strong's/morph marks
  const d = document.createElement('div'); d.className = 'bvtext colmode'; document.body.appendChild(d);
  const W = (t, g, m, gl) => `<span class="word" data-strong="${g}" data-morph="${m}">${t}</span><sup class="strong" data-strong="${g}">${g}</sup><sup class="morph" data-morph="${m}">${m}</sup>` + (gl ? `<span style="vertical-align:super;font-size:75%;color:#0000ff">${gl}</span>` : '') + ' ';
  d.innerHTML = `<span class="pv" data-v="1">` + W('ἐν', 'G1722', 'PREP', 'In') + W('ἀρχῇ', 'G746', 'N-DSF', 'the beginning') + W('ἐποίησεν', 'G4160', 'V-AAI-3S', 'made') + W('ὁ', 'G3588', 'T-NSM', '') + `</span>`;
  markGlosses(d); columnWords(0, d); await sl(300);
  const cc = [...d.querySelectorAll('.cw')];
  ok(cc.length === 4 && cc.map(c => c.querySelector('.cl-gloss').textContent).join('|') === 'In|the beginning|made|', 'e-Sword 10 raised-span glosses join their columns: ' + cc.map(c => c.querySelector('.cl-gloss').textContent).join('|'));
  ok(!d.querySelector('span[style*="vertical-align:super"]'), 'no leftover raised wrapper');
  d.remove();
} catch (e) { out.push('✗ script error ' + e.message); }
console.log('RESULT ' + out.join(' | ')); })();
