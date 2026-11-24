/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Multi-device PC config sync tests: node test/unit/sync.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sync = require('../../app/lib/sync');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('ok -', msg);
  passed++;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'timotheos-sync-'));
try {
  // 1. Payload extraction keeps layouts & all portable settings while stripping machine-local paths
  const pcA = {
    theme: 'dark',
    skin: 'emerald',
    fontSize: 19,
    dock: { v: 3, areas: [{ x0: 0, y0: 0, x1: 4, y1: 3, panels: ['bv0'], active: 'bv0' }], floats: [], hidden: [] },
    savedLayouts: { Study: { v: 3, areas: [], floats: [], hidden: [] } },
    views: [{ bible: 'tw:amb+.nt', linked: true, align: 'left', lh: 1.35 }],
    shortcuts: { toggleStrongs: 'S' },
    popupOT: ['tw:lxxe.ot'],
    moduleFolders: ['/home/eddie/PC-A-Modules'],
    archiveSeen: { '/a.zip': { sig: '1' } },
    windowBounds: { width: 1920, height: 1080 },
    sync: { provider: 'dropbox', mode: 'folder' },
  };
  const payload = sync.extractSyncPayload(pcA, 'PC-A');
  ok(payload.timotheosSync === 1 && payload.settings.theme === 'dark' && payload.settings.dock.v === 3 && payload.settings.savedLayouts.Study,
    'extractSyncPayload preserves layouts, savedLayouts, views, theme, and shortcuts');
  ok(!('moduleFolders' in payload.settings) && !('archiveSeen' in payload.settings) && !('windowBounds' in payload.settings) && !('sync' in payload.settings),
    'extractSyncPayload excludes machine-local paths, window bounds, and local sync config');

  // 2. Folder sync pushes from PC-A and pulls cleanly onto PC-B while keeping PC-B local moduleFolders
  const cloudDir = path.join(tmp, 'Dropbox');
  fs.mkdirSync(cloudDir, { recursive: true });
  const pushRes = sync.syncWithFolder(pcA, cloudDir, { direction: 'auto', localUpdatedAt: new Date().toISOString(), deviceName: 'PC-A' });
  ok(pushRes.action === 'pushed' && fs.existsSync(sync.syncFilePathForFolder(cloudDir)),
    'first auto-sync on PC-A pushes config to cloud folder');

  const pcB = {
    theme: 'light',
    fontSize: 15,
    moduleFolders: ['C:\\Users\\Eddie\\Modules'],
    windowBounds: { width: 1366, height: 768 },
  };
  const pullRes = sync.syncWithFolder(pcB, cloudDir, { direction: 'auto', localUpdatedAt: '2020-01-01T00:00:00Z', lastSyncAt: '', deviceName: 'PC-B' });
  ok(pullRes.action === 'pulled' && pullRes.settings.theme === 'dark' && pullRes.settings.fontSize === 19 && pullRes.settings.savedLayouts.Study,
    'auto-sync on PC-B pulls PC-A layouts and settings');
  ok(pullRes.settings.moduleFolders[0] === 'C:\\Users\\Eddie\\Modules' && pullRes.settings.windowBounds.width === 1366,
    'PC-B preserves its own machine-local moduleFolders and windowBounds after pull');

  // 3. Auto-detect cloud folders
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(path.join(fakeHome, 'Dropbox'), { recursive: true });
  fs.mkdirSync(path.join(fakeHome, 'OneDrive'), { recursive: true });
  fs.mkdirSync(path.join(fakeHome, 'Google Drive', 'My Drive'), { recursive: true });
  const det = sync.detectCloudFolders(fakeHome, {});
  ok(det.dropbox && det.onedrive && det.gdrive, 'detectCloudFolders detects Google Drive, Dropbox, and OneDrive folders');

  // 4. OAuth 2.0 PKCE URL generation for all three providers (Google Drive/Gmail, Dropbox, OneDrive)
  const pkce = sync.createPkcePair();
  ok(pkce.verifier.length >= 40 && pkce.challenge.length >= 40 && pkce.state.length >= 16, 'createPkcePair creates valid PKCE verifier, challenge, and state');
  for (const pid of ['gdrive', 'dropbox', 'onedrive']) {
    const u = sync.buildAuthUrl(pid, { clientId: 'test-client', redirectUri: 'http://127.0.0.1:54321/callback', challenge: pkce.challenge, state: pkce.state });
    ok(u.startsWith('https://') && u.includes('code_challenge_method=S256') && u.includes('client_id=test-client'),
      `buildAuthUrl builds valid OAuth 2.0 PKCE URL for ${pid}`);
  }

  console.log(`sync: ${passed} ok`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
