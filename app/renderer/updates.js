/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Check for updates": asks GitHub which release of Timotheos is the newest published one and compares its version with this one.
// It runs only when the user asks (Help → Check for Updates, or the button in About). Nothing is installed and nothing is sent
// except the request itself; a newer version is shown with a button that opens its download page in the browser.
const TimotheosUpdates = (() => {
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DEFAULT = 'https://api.github.com/repos/SalitaNgDiyos/Timotheos/releases/latest';
  const PAGE = 'https://github.com/SalitaNgDiyos/Timotheos/releases';
  const net = () => (window.TimotheosHost && TimotheosHost.net) || null;
  const place = () => { try { const o = JSON.parse((TimotheosHost.info().env || {}).TIMOTHEOS_REPOS || '{}'); if (o.updates) return o.updates; } catch (e) { /* the default */ } return DEFAULT; };
  const parts = v => (String(v || '').match(/\d+/g) || []).slice(0, 3).map(Number);
  /** 1 when a is newer than b, -1 when older, 0 when the same */
  function compare(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
  const versionOf = r => { const m = String(r.tag_name || r.name || '').match(/\d+\.\d+(?:\.\d+)?/); return m ? m[0] : ''; };
  /** what the answer of GitHub says: { latest, url, notes } or throws a plain message */
  function read(text) {
    let r; try { r = JSON.parse(text); } catch (e) { throw new Error('The answer was not a release.'); }
    if (!r || typeof r !== 'object' || !(r.tag_name || r.name)) throw new Error('The answer was not a release.');
    const v = versionOf(r); if (!v) throw new Error('The newest release has no version number in its name (' + String(r.tag_name || r.name).slice(0, 40) + ').');
    const url = /^https:\/\//.test(r.html_url || '') ? r.html_url : PAGE;
    return { latest: v, url, notes: String(r.body || '').trim(), name: r.name || r.tag_name };
  }
  const here = () => String((state.settings && state.settings.version) || '');
  async function ask() {
    const n = net(); if (!n) throw new Error('This build of Timotheos cannot go on the internet.');
    try { return read(await n.text(place())); }
    catch (e) { if (/error 404/.test(e.message)) { const x = new Error('none'); x.none = true; throw x; } throw e; }
  }
  const notes = t => t ? `<h4>What is new</h4><pre class="upnotes">${E(t.length > 1800 ? t.slice(0, 1800) + '…' : t)}</pre>` : '';
  async function check() {
    if (!net()) return TimotheosModules.messageBox('Check for updates', '<p>This build of Timotheos cannot go on the internet. Look for a newer version at <a class="link" data-href="' + PAGE + '">' + PAGE + '</a>.</p>');
    const me = here(); let result, html, btns = [{ label: 'Close', value: null, primary: true }];
    const shell = h => `<div class="updates"><p>Installed: <b>Timotheos ${E(me)}</b></p>${h}<p class="small">Timotheos goes on the internet here only when you ask, to read the newest release on GitHub. Nothing is installed or sent.</p></div>`;
    const p = TimotheosModules.modal('Check for updates', shell('<p id="upState">Looking for the newest version…</p>'), btns);
    try {
      result = await ask();
      if (compare(result.latest, me) > 0) {
        html = `<p id="upState" class="upnew">A newer version is available: <b>${E(result.latest)}</b>.</p>${notes(result.notes)}<p><button type="button" class="pill gold" id="upGet" data-href="${E(result.url)}">Open the download page</button></p>`;
      } else html = `<p id="upState" class="upok">You have the newest version (the newest release is ${E(result.latest)}).</p>`;
    } catch (e) {
      html = e.none ? `<p id="upState">No release has been published yet, so there is nothing newer to offer. Releases are listed at <a class="link" data-href="${PAGE}">${PAGE}</a>.</p>`
        : `<p id="upState" class="uperr">Could not check: ${E(e.message)}</p>`;
    }
    const box = document.querySelector('#modalBody .updates');
    if (box && !document.querySelector('#modal').classList.contains('hidden')) {
      box.innerHTML = shell(html).replace(/^<div class="updates">|<\/div>$/g, '');
      const g = box.querySelector('#upGet'); if (g) g.onclick = () => api.openExternal(g.dataset.href);
    }
    await p;
  }
  return { check, compare, read };
})();
window.TimotheosUpdates = TimotheosUpdates;
