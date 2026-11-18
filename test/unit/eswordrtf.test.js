/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { eswordToHtml } = require('../../app/lib/eswordfmt');

test('e-Sword RTF Bible: Strong\'s and morphology after a word become hoverable', () => {
  const h = eswordToHtml('\\u960?{\\cf15\\super G3739}{\\cf11\\super N2-NSF} \\u961?{\\cf15\\super G1501G2033}{\\cf11\\super RA-GSM}', null, true);
  assert.match(h, /data-strong="G3739" data-morph="N2-NSF"/);
  assert.match(h, /<sup class="morph" data-morph="N2-NSF">/);
  assert.match(h, /data-strong="G1501 G2033" data-morph="RA-GSM"/);
});
