// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// A module's "about" text in RTF without its "{\rtf1" header (some theWord commentaries) is shown as text, not as RTF code.
const assert = require('assert');
const { aboutToHtml } = require('../../app/lib/modprops');
let n = 0; const t = (name, f) => { f(); n++; };
const bare = String.raw`{\info{\title THE}{\*\hlinkbase F:\'5cdl\'5coldgreen\'5c}}
\paperw11909\paperh16834\margl1440 THE BIBLE STUDY TEXTBOOK SERIES\plain\rtlch\af16\f0\fs22\par\plain\b THE\par BIBLE STUDY\par`;
t('bare RTF becomes text', () => { const h = aboutToHtml(bare); assert(!/\\paperw|\\plain|\\info/.test(h), h); assert(/BIBLE STUDY TEXTBOOK SERIES/.test(h) && /font-weight:bold">THE</.test(h), h); });
t('full RTF still works', () => assert(/<b>|font-weight:bold/.test(aboutToHtml(String.raw`{\rtf1 \b Bold\b0 \par}`))));
t('a theWord one-line \\par value stays as it was', () => assert.strictEqual(aboutToHtml(String.raw`First\parSecond`).includes('\\par'), true));
t('plain text stays plain', () => assert.strictEqual(aboutToHtml('Just text'), '<p>Just text</p>'));
t('HTML stays HTML', () => assert.strictEqual(aboutToHtml('<p>Hi</p>'), '<p>Hi</p>'));
console.log('aboutrtf: ' + n + ' ok');
