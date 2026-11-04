'use strict';
// Runs main.js (the former Electron main process) in a Web Worker.
let started = false, electron = null;
self.onmessage = ev => {
  const m = ev.data;
  if (m.t === 'init' && !started) {
    started = true;
    globalThis.__HOST = m.info;
    require('./native').configure(m.info);
    electron = require('./electron');
    require('../app/main.js');
    self.postMessage({ t: 'started' });
  } else if (m.t === 'ipc') { electron && electron.__dispatch(m); }
  else if (m.t === 'host-res') { electron && electron.__onHostReply(m); }
};
globalThis.setImmediate = f => setTimeout(f, 0);
globalThis.global = globalThis;
