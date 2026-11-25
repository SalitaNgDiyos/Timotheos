/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
module.exports = {
  tmpdir: () => (globalThis.__HOST && globalThis.__HOST.tmp) || '/tmp',
  homedir: () => (globalThis.__HOST && globalThis.__HOST.home) || '/',
  platform: () => (globalThis.__HOST && globalThis.__HOST.platform) || 'linux',
  hostname: () => (globalThis.__HOST && globalThis.__HOST.hostname) || (globalThis.__HOST && globalThis.__HOST.platform) || 'pc',
  EOL: '\n'
};
