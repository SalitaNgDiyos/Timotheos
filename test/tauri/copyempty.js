// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Copy verses: an empty "Each verse" template copies no verse text (preview and rich copy), and a template with %T still does.
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const ref = { b: 1, c: 1, v: 1 };
  const e = await buildCopy(ref, ref, { header: '', footer: '', verse: '', sep: '', chapter: '' });
  ok(e.text === '' && !/beginning|<sup|\bIn\b/i.test(e.html) && !/In the/.test(e.html), 'empty templates: nothing copied, html=' + e.html.replace(/<[^>]+>/g, '').slice(0, 40));
  const r = await buildCopy(ref, ref, { header: '', footer: '', verse: '%v %T', sep: '', chapter: '' });
  ok(/^1 /.test(r.text) && r.text.length > 20 && /<span>/.test(r.html) && r.html.replace(/<[^>]+>/g, '').length > 20, 'with %T the verse is copied: ' + r.text.slice(0, 40));
  const l = await buildCopy(ref, ref, { header: '', footer: '', verse: '%b %c:%v', sep: '', chapter: '' });
  ok(l.text === 'Genesis 1:1' && l.html.replace(/<[^>]+>/g, '') === 'Genesis 1:1', 'reference-only template: ' + l.text);
} catch (e) { out.push('✗ script error ' + e.message); }
console.log('RESULT ' + out.join(' | ')); })();
