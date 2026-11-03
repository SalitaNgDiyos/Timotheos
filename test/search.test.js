'use strict';
const assert = require('assert');
const theword = require('../src/lib/theword');
const S = require('../src/lib/search');
const D = process.env.TIMOTHEOS_TESTMODS || '/home/claude/testmods';
const kjv = theword.load(D + '/kjv.ont');
const mods = [{ id: 'kjv', abbr: 'KJV', mod: kjv }];
let pass = 0;
const q = (query, o = {}) => S.run(mods, query, Object.assign({ mode: '1611', limit: 5 }, o));
const t = (query, check, o) => { const r = q(query, o); const ok = check(r); console.log(`${ok ? '✓' : '✗'} ${query.padEnd(36)} ${String(r.total).padStart(5)}  ${r.ms}ms  ${r.explanation}`); assert.ok(ok, query); pass++; return r; };
// model
const md = S.model(kjv.getVerse(1, 1, 1));
console.log(md.plain, JSON.stringify(md.segs.slice(0, 3).map(s => [md.plain.slice(s.s, s.e), s.strongs])));
assert.equal(md.plain.trim(), 'In the beginning God created the heaven and the earth.');
t('Jesus', r => r.total > 900 && r.total < 1000, { wholeWords: true });
t('jesus christ', r => r.total > 150 && r.total < 300);
t('jesus OR christ', r => r.total > 1000);
t('jesus XOR christ', r => r.total > 800);
t('jesus NOT christ', r => r.total > 600);
t('"Jesus Christ"', r => r.total > 150 && r.results[0].marks.length);
t('{Jesus Christ}', r => r.total > 150);
t('Jesus + Christ', r => r.total > 150);
t('love*', r => r.total >= 442 && r.total <= 444, { wholeWords: true });
t('?use', r => r.results.length > 0, { wholeWords: true });
t('G26', r => r.total === 106);
t('G26 OR G25', r => r.total > 200);
t('H430', r => r.total > 2000);
t('G2962 TR master', r => r.total > 5 && r.total < 40);
t('G2962 TR NOT lord', r => r.total > 5);
t('NOT G2962 TR lord*', r => r.total > 0);
t('faith NEARw3 hope', r => r.total > 0);
t('faith @3 hope', r => r.total > 0);
t('faith NEARv2 hope', r => r.total > 0 && r.results.some(x => x.v2 >= x.v));
t('(Jesus AND Christ) OR (Peter AND Paul)', r => r.total > 150);
t('beginning', r => r.total === 1, { scope: 'Gen 1' });
t('love', r => r.results.every(x => x.b === 62), { scope: '1John' });
t('grace', r => r.results.every(x => x.b >= 45 && x.b <= 57), { scope: 'paul' });
t('J[eo]sus', r => r.total > 900, { regex: true });
t('\\bLORD\\b', r => r.total > 5000, { regex: true, ignoreCase: false });
t('Lords', r => r.total > 0, { ignoreDiacritics: true }); // Lord's with apostrophe folded? (Lords also in text)
// e-Sword: Wycliffe (HTML) – Apocrypha in OT scope, plain words
const fs = require('fs');
if (fs.existsSync('/home/claude/esreal')) {
  const esw = require('../src/lib/esword');
  esw.load('/home/claude/esreal/a_001_b_wycliffe_1394_-_purvey_revision.bbli', {}).then(w => {
    const r = S.run([{ id: 'w', abbr: 'Wyc', mod: w }], 'Tobie', { mode: '1611', scope: 'OT' });
    console.log('Wycliffe "Tobie" OT:', r.total, r.books.map(b => b.abbr + ':' + b.n).join(' '));
    assert.ok(r.books.some(b => b.b === 67)); pass++;
    const e2 = require('../src/lib/esword');
    return e2.load('/home/claude/testmods/esword/KJVA11.bbli', {});
  }).then(k11 => {
    const r = S.run([{ id: 'k', abbr: 'K', mod: k11 }], 'G2316 TR God', { mode: '1611' });
    console.log('KJVA11 G2316 TR God:', r.total, JSON.stringify(r.stats));
    assert.equal(r.total, 1); pass++;
    const s = q('G26'); console.log('stats G26:', s.stats.slice(0, 5).map(x => `${x.text}(${x.n})`).join(', '));
    assert.ok(s.stats[0].text.toLowerCase().includes('charity') || s.stats[0].text.toLowerCase().includes('love')); pass++;
    for (const bad of ['(jesus', 'AND', 'm/']) { assert.ok(!S.describe(bad).ok, bad); pass++; }
    console.log(S.describe('jesus christ').text, '|', S.describe('jesus christ', { defaultOr: true }).text);
    console.log(`\n${pass} search checks passed`);
  }).catch(e => { console.error('FAILED', e); process.exit(1); });
}
