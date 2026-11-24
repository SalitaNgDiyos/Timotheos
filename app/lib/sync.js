/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Multi-device PC configuration sync for Timotheos.
// Syncs layouts (dock, savedLayouts, views) and every portable app setting across PCs
// using Google Drive (Gmail), Dropbox, or Microsoft OneDrive — via either a local
// cloud-synced folder (zero setup) or direct OAuth 2.0 PKCE cloud account sign-in.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SYNC_FILENAME = 'timotheos-config-sync.json';
const SYNC_SUBDIR = 'Timotheos';

// Machine-local keys that must NOT be overwritten across different PCs
const LOCAL_ONLY_KEYS = new Set([
  'moduleFolders',
  'archiveSeen',
  'windowBounds',
  'portable',
  'userDataDir',
  'appDir',
  'version',
  'sync',
  'officialModVersions',
  'ignoredModUpdates',
]);

const PROVIDERS = {
  gdrive: {
    id: 'gdrive',
    name: 'Google Drive (Gmail)',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email',
    extraAuth: { access_type: 'offline', prompt: 'consent' },
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    authUrl: 'https://www.dropbox.com/oauth2/authorize',
    tokenUrl: 'https://api.dropboxapi.com/oauth2/token',
    scope: 'files.content.write files.content.read account_info.read',
    extraAuth: { token_access_type: 'offline' },
  },
  onedrive: {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    authUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scope: 'Files.ReadWrite.AppFolder User.Read offline_access',
    extraAuth: {},
  },
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

/** Extract all portable layouts and settings from settings.json (stripping machine-local paths/tokens) */
function extractSyncPayload(settings, deviceName) {
  const out = {};
  for (const [k, v] of Object.entries(settings || {})) {
    if (LOCAL_ONLY_KEYS.has(k) || v === undefined) continue;
    out[k] = clone(v);
  }
  return {
    timotheosSync: 1,
    updatedAt: new Date().toISOString(),
    device: String(deviceName || os.hostname() || 'pc'),
    settings: out,
  };
}

/** Merge a remote sync payload into local settings without touching machine-local keys */
function mergeSyncPayload(localSettings, payload) {
  if (!payload || payload.timotheosSync !== 1 || !payload.settings || typeof payload.settings !== 'object') {
    throw new Error('Invalid Timotheos sync file.');
  }
  const next = clone(localSettings || {});
  for (const [k, v] of Object.entries(payload.settings)) {
    if (LOCAL_ONLY_KEYS.has(k)) continue;
    next[k] = clone(v);
  }
  return next;
}

/** Auto-detect local Google Drive, Dropbox, and OneDrive folders on Linux, Windows, and macOS */
function detectCloudFolders(homeDir = os.homedir(), env = process.env) {
  const h = homeDir || '';
  const existsDir = p => {
    if (!p) return false;
    try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
  };
  const firstDir = list => list.find(existsDir) || null;
  const gdrive = firstDir([
    path.join(h, 'Google Drive', 'My Drive'),
    path.join(h, 'Google Drive'),
    path.join(h, 'GoogleDrive'),
    path.join(h, 'My Drive'),
    path.join(h, 'Drive'),
    'G:\\My Drive',
  ]);
  const dropbox = firstDir([
    path.join(h, 'Dropbox'),
    env.DROPBOX_HOME,
  ]);
  const onedrive = firstDir([
    env.OneDrive,
    env.OneDriveConsumer,
    path.join(h, 'OneDrive'),
    path.join(h, 'Microsoft OneDrive'),
  ]);
  return { gdrive, dropbox, onedrive };
}

function syncFilePathForFolder(folder) {
  if (!folder) throw new Error('No sync folder configured.');
  const base = path.basename(path.resolve(folder)).toLowerCase();
  return base === SYNC_SUBDIR.toLowerCase()
    ? path.join(folder, SYNC_FILENAME)
    : path.join(folder, SYNC_SUBDIR, SYNC_FILENAME);
}

function readFolderPayload(folder) {
  const f = syncFilePathForFolder(folder);
  if (!fs.existsSync(f)) return null;
  const raw = fs.readFileSync(f, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.timotheosSync !== 1 || !parsed.settings) {
    throw new Error('Sync file is corrupted or from an incompatible format.');
  }
  return parsed;
}

function writeFolderPayload(folder, payload) {
  const f = syncFilePathForFolder(folder);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, f);
  return f;
}

/**
 * Bidirectional sync against a local cloud-synced folder.
 * direction: 'auto' | 'push' | 'pull'
 */
function syncWithFolder(localSettings, folder, { direction = 'auto', localUpdatedAt = '', lastSyncAt = '', deviceName = '' } = {}) {
  const remote = readFolderPayload(folder);
  if (direction === 'push' || (!remote && direction === 'auto')) {
    const payload = extractSyncPayload(localSettings, deviceName);
    const file = writeFolderPayload(folder, payload);
    return { action: 'pushed', updatedAt: payload.updatedAt, device: payload.device, file, settings: localSettings };
  }
  if (direction === 'pull') {
    if (!remote) throw new Error('No synced config file found in that folder yet.');
    const merged = mergeSyncPayload(localSettings, remote);
    return { action: 'pulled', updatedAt: remote.updatedAt, device: remote.device, settings: merged };
  }
  // Auto: compare remote.updatedAt vs localUpdatedAt and lastSyncAt
  const rTime = Date.parse(remote.updatedAt || '') || 0;
  const lTime = Date.parse(localUpdatedAt || '') || 0;
  const sTime = Date.parse(lastSyncAt || '') || 0;
  if (rTime > sTime && rTime >= lTime) {
    const merged = mergeSyncPayload(localSettings, remote);
    return { action: 'pulled', updatedAt: remote.updatedAt, device: remote.device, settings: merged };
  }
  if (lTime > rTime) {
    const payload = extractSyncPayload(localSettings, deviceName);
    const file = writeFolderPayload(folder, payload);
    return { action: 'pushed', updatedAt: payload.updatedAt, device: payload.device, file, settings: localSettings };
  }
  return { action: 'noop', updatedAt: remote.updatedAt, device: remote.device, settings: localSettings };
}

/* ---------- OAuth 2.0 PKCE helpers for direct Gmail / Dropbox / OneDrive sign-in ---------- */
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createPkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

function buildAuthUrl(providerId, { clientId, redirectUri, challenge, state }) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error('Unknown sync provider: ' + providerId);
  if (!clientId) throw new Error(`Enter a ${p.name} OAuth Client ID first.`);
  const u = new URL(p.authUrl);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', p.scope);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', state);
  for (const [k, v] of Object.entries(p.extraAuth || {})) u.searchParams.set(k, v);
  return u.toString();
}

async function exchangeOAuthCode(providerId, { clientId, clientSecret, code, redirectUri, verifier }, httpReq) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error('Unknown sync provider: ' + providerId);
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (clientSecret) params.set('client_secret', clientSecret);
  const res = await httpReq('POST', p.tokenUrl, { 'Content-Type': 'application/x-www-form-urlencoded' }, params.toString());
  const data = JSON.parse(res.body);
  if (!data.access_token) throw new Error(data.error_description || data.error || 'Could not obtain access token.');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    expiresAt: Date.now() + ((+data.expires_in || 3600) - 60) * 1000,
  };
}

async function refreshOAuthToken(providerId, { clientId, clientSecret, refreshToken }, httpReq) {
  const p = PROVIDERS[providerId];
  if (!p || !refreshToken) throw new Error('Please sign in again.');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });
  if (clientSecret) params.set('client_secret', clientSecret);
  const res = await httpReq('POST', p.tokenUrl, { 'Content-Type': 'application/x-www-form-urlencoded' }, params.toString());
  const data = JSON.parse(res.body);
  if (!data.access_token) throw new Error(data.error_description || data.error || 'Session expired; please sign in again.');
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + ((+data.expires_in || 3600) - 60) * 1000,
  };
}

/* ---------- Direct Cloud File Read/Write (Google Drive appDataFolder, Dropbox, OneDrive approot) ---------- */
async function cloudRead(providerId, token, httpReq) {
  const auth = { Authorization: 'Bearer ' + token };
  if (providerId === 'gdrive') {
    const q = encodeURIComponent(`name='${SYNC_FILENAME}' and 'appDataFolder' in parents and trashed=false`);
    const listRes = await httpReq('GET', `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`, auth, '');
    const files = (JSON.parse(listRes.body).files) || [];
    if (!files.length) return { payload: null, fileId: null };
    const dlRes = await httpReq('GET', `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(files[0].id)}?alt=media`, auth, '');
    return { payload: JSON.parse(dlRes.body), fileId: files[0].id };
  }
  if (providerId === 'dropbox') {
    try {
      const res = await httpReq('POST', 'https://content.dropboxapi.com/2/files/download', {
        ...auth,
        'Dropbox-API-Arg': JSON.stringify({ path: '/' + SYNC_FILENAME }),
      }, '');
      return { payload: JSON.parse(res.body), fileId: '/' + SYNC_FILENAME };
    } catch (e) {
      if (/409|not_found/i.test(String(e.message || ''))) return { payload: null, fileId: null };
      throw e;
    }
  }
  if (providerId === 'onedrive') {
    try {
      const res = await httpReq('GET', `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILENAME}:/content`, auth, '');
      return { payload: JSON.parse(res.body), fileId: SYNC_FILENAME };
    } catch (e) {
      if (/404|itemNotFound/i.test(String(e.message || ''))) return { payload: null, fileId: null };
      throw e;
    }
  }
  throw new Error('Unknown cloud provider: ' + providerId);
}

async function cloudWrite(providerId, token, payload, existingFileId, httpReq) {
  const auth = { Authorization: 'Bearer ' + token };
  const jsonBody = JSON.stringify(payload, null, 2);
  if (providerId === 'gdrive') {
    if (existingFileId) {
      await httpReq('PATCH', `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=media`, { ...auth, 'Content-Type': 'application/json' }, jsonBody);
      return existingFileId;
    }
    const boundary = 'timotheos_sync_' + Date.now();
    const meta = JSON.stringify({ name: SYNC_FILENAME, parents: ['appDataFolder'] });
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${jsonBody}\r\n--${boundary}--`;
    const res = await httpReq('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { ...auth, 'Content-Type': `multipart/related; boundary=${boundary}` }, multipart);
    return (JSON.parse(res.body).id) || null;
  }
  if (providerId === 'dropbox') {
    await httpReq('POST', 'https://content.dropboxapi.com/2/files/upload', {
      ...auth,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({ path: '/' + SYNC_FILENAME, mode: 'overwrite', mute: true }),
    }, jsonBody);
    return '/' + SYNC_FILENAME;
  }
  if (providerId === 'onedrive') {
    await httpReq('PUT', `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${SYNC_FILENAME}:/content`, {
      ...auth,
      'Content-Type': 'application/json',
    }, jsonBody);
    return SYNC_FILENAME;
  }
  throw new Error('Unknown cloud provider: ' + providerId);
}

async function syncWithCloud(providerId, token, localSettings, httpReq, { direction = 'auto', localUpdatedAt = '', lastSyncAt = '', deviceName = '' } = {}) {
  const { payload: remote, fileId } = await cloudRead(providerId, token, httpReq);
  if (direction === 'push' || (!remote && direction === 'auto')) {
    const payload = extractSyncPayload(localSettings, deviceName);
    await cloudWrite(providerId, token, payload, fileId, httpReq);
    return { action: 'pushed', updatedAt: payload.updatedAt, device: payload.device, settings: localSettings };
  }
  if (direction === 'pull') {
    if (!remote) throw new Error('No synced config found in your cloud account yet.');
    const merged = mergeSyncPayload(localSettings, remote);
    return { action: 'pulled', updatedAt: remote.updatedAt, device: remote.device, settings: merged };
  }
  const rTime = Date.parse(remote.updatedAt || '') || 0;
  const lTime = Date.parse(localUpdatedAt || '') || 0;
  const sTime = Date.parse(lastSyncAt || '') || 0;
  if (rTime > sTime && rTime >= lTime) {
    const merged = mergeSyncPayload(localSettings, remote);
    return { action: 'pulled', updatedAt: remote.updatedAt, device: remote.device, settings: merged };
  }
  if (lTime > rTime) {
    const payload = extractSyncPayload(localSettings, deviceName);
    await cloudWrite(providerId, token, payload, fileId, httpReq);
    return { action: 'pushed', updatedAt: payload.updatedAt, device: payload.device, settings: localSettings };
  }
  return { action: 'noop', updatedAt: remote.updatedAt, device: remote.device, settings: localSettings };
}

module.exports = {
  SYNC_FILENAME,
  LOCAL_ONLY_KEYS,
  PROVIDERS,
  extractSyncPayload,
  mergeSyncPayload,
  detectCloudFolders,
  syncFilePathForFolder,
  readFolderPayload,
  writeFolderPayload,
  syncWithFolder,
  createPkcePair,
  buildAuthUrl,
  exchangeOAuthCode,
  refreshOAuthToken,
  cloudRead,
  cloudWrite,
  syncWithCloud,
};
