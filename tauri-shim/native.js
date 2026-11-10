/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Synchronous calls to the Rust side (custom protocol "tfs") from the worker. GET requests only.
const { Buffer } = require('buffer');
let base = 'tfs://localhost';
function configure(info) { base = (info.platform === 'win32' || info.platform === 'android') ? 'http://tfs.localhost' : 'tfs://localhost'; }
function url(route, params) {
  let q = '';
  for (const k in params) if (params[k] !== undefined && params[k] !== null) q += (q ? '&' : '') + k + '=' + encodeURIComponent(params[k]);
  return base + '/' + route + (q ? '?' + q : '');
}
function raw(route, params) {
  const x = new XMLHttpRequest();
  x.open('GET', url(route, params), false);
  x.responseType = 'arraybuffer';
  x.send();
  return x;
}
function fsError(x, what) {
  let info = {};
  try { info = JSON.parse(new TextDecoder().decode(x.response)); } catch (e) { /* not json */ }
  const code = info.code || 'EIO';
  const e = new Error(`${code}: ${info.error || 'file error'}, ${what}`);
  e.code = code; e.errno = -1; return e;
}
/** JSON answer */
function json(route, params, what) {
  const x = raw(route, params);
  if (x.status !== 200) throw fsError(x, what || route);
  return JSON.parse(new TextDecoder().decode(x.response));
}
/** bytes */
function bytes(route, params, what) {
  const x = raw(route, params);
  if (x.status !== 200) throw fsError(x, what || route);
  return Buffer.from(new Uint8Array(x.response));
}
const b64url = u8 => {
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
module.exports = { configure, json, bytes, b64url };
