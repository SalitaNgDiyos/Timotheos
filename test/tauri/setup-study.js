/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function setupStudy() {
  const ud = TimotheosStudy.study.ud;
  ud.highlights = { 'tw:kjv.ont': { '43.3.16': [{ s: 4, e: 26, style: 'yellow' }, { s: 66, e: 87, style: 'ul' }], '43.3.17': [{ s: 0, e: 200, style: 'green' }] } };
  ud.notes = { '43.3.16': { html: 'The gospel in a nutshell. Compare <a class="link" data-href="tw://bible.*?id=45.5.8">Rom 5:8</a> and <a class="link" data-href="tw://bible.*?id=62.4.9">1 John 4:9</a>.', t: 1 } };
  ud.lists = { 'Love of God': [{ b: 43, c: 3, v: 16 }, { b: 45, c: 5, v: 8 }, { b: 62, c: 4, v: 9, v2: 10 }, { b: 71, c: 1, v: 1 }], 'My verses': [] }; ud.currentList = 'Love of God';
  ud.bookmarks = [{ b: 43, c: 3, v: 16 }, { b: 19, c: 23, v: 1 }, { b: 67, c: 4, v: 15 }, null, null, null, null, null, null, null];
  for (const k of ['highlights', 'notes', 'lists', 'currentList', 'bookmarks']) await api.setUserData(k, ud[k]);
}
