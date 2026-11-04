'use strict';
module.exports = { tmpdir: () => (globalThis.__HOST && globalThis.__HOST.tmp) || '/tmp', homedir: () => (globalThis.__HOST && globalThis.__HOST.home) || '/', platform: () => (globalThis.__HOST && globalThis.__HOST.platform) || 'linux', EOL: '\n' };
