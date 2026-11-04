'use strict';
const f = require('fflate');
const { Buffer } = require('buffer');
const B = u => Buffer.from(u.buffer, u.byteOffset, u.byteLength);
const U = b => (b instanceof Uint8Array ? b : new Uint8Array(b));
let table = null;
function crc32(data, start) {
  if (!table) { table = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c; } }
  const d = typeof data === 'string' ? Buffer.from(data) : data;
  let c = ~(start || 0);
  for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (~c) >>> 0;
}
module.exports = {
  gunzipSync: b => B(f.gunzipSync(U(b))), inflateSync: b => B(f.unzlibSync(U(b))), inflateRawSync: b => B(f.inflateSync(U(b))),
  deflateSync: (b, o) => B(f.zlibSync(U(b), { level: (o && o.level) != null ? o.level : 6 })),
  deflateRawSync: (b, o) => B(f.deflateSync(U(b), { level: (o && o.level) != null ? o.level : 6 })),
  gzipSync: b => B(f.gzipSync(U(b))), crc32,
};
