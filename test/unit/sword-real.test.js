// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// SWORD modules written by SWORD's own programs (test/unit/sword/make-real.py): node test/unit/sword-real.test.js
const fs = require('fs'), path = require('path'), os = require('os');
const A = require('../../app/lib/archive'), S = require('../../app/lib/sword'), BM = require('../../app/lib/bookmod');
const dir = path.join(__dirname, 'sword', 'real'); const X = JSON.parse(fs.readFileSync(path.join(dir, 'expect.json'), 'utf8'));
let ok = 0, bad = 0; const T = (c, m) => { if (c) ok++; else { bad++; console.log('✗', m); } };
const OSIS = new Map(Object.entries({ Gen: 1, Ps: 19, Matt: 40, John: 43, Rev: 66, Sir: 71, Tob: 67, Dan: 27 }));
const txt = h => String(h || '').replace(/<[^>]*>/g, '');
(async () => {
  const unpack = async name => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swr-')); for (const e of await A.unpack(fs.readFileSync(path.join(dir, name + '.zip')), name + '.zip')) { const o = path.join(root, e.name); fs.mkdirSync(path.dirname(o), { recursive: true }); fs.writeFileSync(o, e.data); } return path.join(root, 'mods.d', name.toLowerCase() + '.conf'); };
  for (const [name, ex] of Object.entries(X.verse)) {
    try {
      const conf = await unpack(name);
      if (ex.kind === 'text') {
        const m = await S.load(conf); let wrong = 0, first = '';
        for (const [o, c, v] of ex.verses) { const h = m.getVerse(OSIS.get(o), c, v); if (!h || !txt(h).startsWith(`${o} ${c}:${v} text`) || !/data-strong="G\d+"/.test(h)) { wrong++; if (!first) first = `${o} ${c}:${v} -> ${h}`; } }
        T(wrong === 0, `${name} (${ex.vers}): ${wrong}/${ex.verses.length} verses wrong, e.g. ${first}`);
        T(m.sword.versification === ex.vers && !/could not be matched|fits/.test(m.warnings.join()), `${name} numbering ${m.sword.versification}: ${m.warnings}`);
        m.close();
      } else {
        const m = await BM.open(conf); T(!m.locked && m.kind === 'commentary', `${name} opens as a commentary: ${m.reason}`);
        let wrong = 0, first = '';
        for (const [o, c, v] of ex.verses) { const f = m.forVerse(OSIS.get(o), c, v); const t = f && m.topic(f.id); if (!t || !txt(t.html).includes(`${o} ${c}:${v} text`)) { wrong++; if (!first) first = `${o} ${c}:${v} -> ${JSON.stringify(f)}`; } }
        T(wrong === 0, `${name}: ${wrong}/${ex.verses.length} commentary entries wrong, e.g. ${first}`);
        T(m.verseMarks(43, 3).has(16) === ex.verses.some(([o, c, v]) => o === 'John' && c === 3 && v === 16), name + ' verseMarks');
        m.close();
      }
    } catch (e) { T(false, name + ': ' + e.stack); }
  }
  for (const n of ['LdRaw', 'LdRaw4', 'LdZ', 'LdBz', 'LdXz']) {
    try {
      const m = await BM.open(await unpack(n)); T(!m.locked && m.kind === 'dictionary', n + ' opens: ' + m.reason);
      T(m.topics().length === X.dict.length, n + ' topic count ' + m.topics().length);
      for (const [k, t] of X.dict) { const e = m.lookup(k); T(e && txt(e.html).trim() === txt(t).trim(), `${n} ${k}: ${e && e.html}`); }
      T(m.lookup('isaac') && /Abraham and Sarah/.test(m.lookup('isaac').html), n + ' lookup is not case sensitive');
      T(/data-href="tw:\/\/dct\.Test\?t=Isaac"/.test(m.lookup('abraham').html), n + ' entry link: ' + m.lookup('abraham').html);
      T(m.searchTopics('zeb').length === 1, n + ' search'); m.close();
    } catch (e) { T(false, n + ': ' + e.stack); }
  }
  try {
    const m = await BM.open(await unpack('GBook')); T(!m.locked && m.kind === 'book', 'GBook opens: ' + m.reason);
    const tp = m.topics(); const byName = Object.fromEntries(tp.map(t => [t.subject, t]));
    T(tp.length === 6 && ['Chapter One', 'Section A', 'Section B', 'Chapter Two', 'Deep', 'Leaf'].every(n => byName[n]), 'GBook topics: ' + tp.map(t => t.subject));
    T(byName['Section A'].pid === byName['Chapter One'].id && byName['Leaf'].pid === byName['Deep'].id && byName['Deep'].pid === byName['Chapter Two'].id && byName['Chapter One'].pid === 0, 'GBook tree');
    T(tp.map(t => t.subject).join() === 'Chapter One,Section A,Section B,Chapter Two,Deep,Leaf', 'GBook reading order: ' + tp.map(t => t.subject));
    T(/Section A text with <b>bold<\/b>/.test(m.topic(byName['Section A'].id).html) && m.topic(byName['Leaf'].id).html === 'Leaf text.', 'GBook text'); m.close();
  } catch (e) { T(false, 'GBook: ' + e.stack); }
  console.log(ok + ' ok, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
})();
