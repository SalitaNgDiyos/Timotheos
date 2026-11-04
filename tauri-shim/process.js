'use strict';
const H = () => globalThis.__HOST || {};
const env = new Proxy({}, { get: (t, k) => { if (k in t) return t[k]; const e = H().env || {}; return e[k] == null ? undefined : e[k]; }, set: (t, k, v) => { t[k] = String(v); return true; }, has: (t, k) => k in t || ((H().env || {})[k] != null) });
module.exports = {
  env, emitWarning() {}, pid: 1, versions: {}, nextTick: f => queueMicrotask(f), cwd: () => '/',
  get platform() { return H().platform || 'linux'; },
  get execPath() { return (H().exeDir || '/opt/timotheos') + '/timotheos'; },
  argv: [], on() {}, stdout: { write() {} }, stderr: { write() {} },
};
