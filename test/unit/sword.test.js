// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// SWORD modules: node test/unit/sword.test.js   (the sample packages come from test/unit/sword/make.py)
const fs = require('fs'), path = require('path'), os = require('os');
const A = require('../../app/lib/archive'), S = require('../../app/lib/sword');
const dir = path.join(__dirname, 'sword');
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
(async () => {
  const unpack = async (name) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-'));
    for (const e of await A.unpack(fs.readFileSync(path.join(dir, name + '.zip')), name + '.zip')) { const o = path.join(root, e.name); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, e.data); }
    return path.join(root, 'mods.d', name.toLowerCase() + '.conf');
  };
  for (const n of ['TestZ', 'TestZ4', 'TestRaw', 'TestRaw4', 'TestBz', 'TestXz']) {
    try {
      const m = await S.load(await unpack(n));
      T(m.title === 'Test ' + n + ' Bible' && m.abbr === n, n + ' title');
      T(Object.keys(m.books).length === 27 && m.books[40][4] === 48, n + ' books ' + Object.keys(m.books).length);
      const a = m.getVerse(40, 5, 3);
      T(/<span class="word" data-strong="G3107" data-morph="N-NSM|A-NPM"/.test(a) || /data-strong="G3107"/.test(a), n + ' strong: ' + a);
      T(/data-note="a footnote &amp;amp; more"/.test(a) || /data-note="a footnote &amp; more"/.test(a), n + ' note: ' + a);
      const j = m.getVerse(43, 3, 16);
      T(/<span class="woj">that he gave his only <span class="added">begotten<\/span> Son<\/span>/.test(j), n + ' words of Jesus: ' + j);
      T(/xref" data-note="&lt;a class=&quot;link&quot; data-href=&quot;tw:\/\/bible\.\*\?id=45\.5\.8&quot;&gt;Rom 5:8&lt;\/a&gt;"/.test(j), n + ' cross-ref: ' + j);
      T(/<span class="sc">Lord<\/span>/.test(j), n + ' divine name');
      const g = m.getVerse(40, 1, 1);
      T(/<span class="heading h3">The genealogy<\/span>The book/.test(g) && /<br>the son/.test(g), n + ' heading/line: ' + g);
      T(m.getVerse(66, 22, 21) === '<_HTML_>Grace be with you all. Amen.', n + ' last verse');
      T(m.getVerse(40, 5, 4) === null && m.getVerse(40, 99, 1) === null && m.getVerse(1, 1, 1) === null, n + ' empty/out of range -> null');
      T(m.hasStrongs, n + ' hasStrongs'); T(!m.warnings.length, n + ' no warnings: ' + m.warnings);
      T(m.about.includes('Made for tests.\nSecond line.'), n + ' about: ' + JSON.stringify(m.about));
      let c = 0; for (const [, , , h] of m.allVerses()) if (h) c++; T(c === 4, n + ' allVerses count ' + c);
      m.close();
    } catch (e) { T(false, n + ': ' + e.stack); }
  }
  // locked, LZSS: refused with a clear message
  for (const [n, re] of [['TestLock', /locked/], ['TestLz', /LZSS/]]) { const p = S.probe(await unpack(n)); T(!p.ok && re.test(p.reason), n + ' refused: ' + p.reason); }
  // numbering the .conf does not name: the verse index tells
  { const m = await S.load(await unpack('TestGuess')); T(m.getVerse(40, 5, 3) && /fits "kjv"|fits/.test(m.warnings.join()), 'unknown numbering: ' + m.warnings); }
  { const m = await S.load(await unpack('TestVulg')); T(m.sword.versification === 'vulg' && Object.keys(m.books).length === 32 && !/could not be matched/.test(m.warnings.join()), 'Vulgate: ' + m.warnings + ' ' + Object.keys(m.books).length); }
  { const m = await S.load(await unpack('TestGbf')); const a = m.getVerse(40, 5, 3); T(/data-strong="G3107"/.test(a) && /data-note="a footnote"/.test(a) && /<span class="woj">in spirit<\/span>/.test(a) && /<i>for<\/i>/.test(a), 'GBF: ' + a); }
  { const m = await S.load(await unpack('TestThml')); const a = m.getVerse(40, 5, 3); T(/<sup class="strong" data-strong="G3107">G3107<\/sup>/.test(a) && /<i>the<\/i>/.test(a) && /data-note="a footnote"/.test(a), 'ThML: ' + a); }
  { const m = await S.load(await unpack('TestPlain')); T(m.getVerse(40, 5, 3) === '<_HTML_>Blessed are the poor &amp; humble', 'plain: ' + m.getVerse(40, 5, 3)); }
  console.log(ok + ' ok, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
