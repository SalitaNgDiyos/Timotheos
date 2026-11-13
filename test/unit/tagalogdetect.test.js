/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
const assert = require('assert'); const c = require('../../app/lib/canon');
const t = (m, want) => assert.strictEqual(c.isTagalogBible(m), want, JSON.stringify(m));
t({ title: 'Some Bible', abbr: 'XYZ', props: { lang: 'flo' } }, true);   // "flo" as written in a real module
t({ title: 'Some Bible', abbr: 'XYZ', props: { lang: 'tl' } }, true);
t({ title: 'Some Bible', abbr: 'XYZ', props: { lang: 'fil' } }, true);
t({ title: 'King James', abbr: 'KJV', props: { lang: 'en' } }, false);
t({ title: 'Ang Malayang Biblia', abbr: 'AMB', props: {} }, true);
console.log('tagalogdetect ok');
