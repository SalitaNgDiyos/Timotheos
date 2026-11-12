/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Check for updates": asks GitHub which release of Timotheos is the newest published one and compares its version with this one.
// It runs only when the user asks (Help → Check for Updates, or the button in About). Nothing is installed and nothing is sent
// except the request itself; a newer version is shown with a button that opens its download page in the browser.
const TimotheosUpdates = (() => {
  const E = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const DEFAULT = 'https://api.github.com/repos/SalitaNgDiyos/Timotheos/releases/latest';
  const TEST = 'https://api.github.com/repos/SalitaNgDiyos/Timotheos/releases/tags/test';   // the pre-release the builds of the test branch are put in
  const PAGE = 'https://github.com/SalitaNgDiyos/Timotheos/releases';
  const net = () => (window.TimotheosHost && TimotheosHost.net) || null;
  const env = () => { try { return JSON.parse((TimotheosHost.info().env || {}).TIMOTHEOS_REPOS || '{}'); } catch (e) { return {}; } };
  const place = () => env().updates || DEFAULT;
  const testPlace = () => env().test || TEST;
  const parts = v => (String(v || '').match(/\d+/g) || []).slice(0, 3).map(Number);
  /** 1 when a is newer than b, -1 when older, 0 when the same */
  function compare(a, b) { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
  const versionOf = r => { for (const t of [r.tag_name, r.name]) { const m = String(t || '').match(/\d+\.\d+(?:\.\d+)?/); if (m) return m[0]; } return ''; };
  /** what the answer of GitHub says: { latest, url, notes } or throws a plain message */
  function read(text) {
    let r; try { r = JSON.parse(text); } catch (e) { throw new Error('The answer was not a release.'); }
    if (!r || typeof r !== 'object' || !(r.tag_name || r.name)) throw new Error('The answer was not a release.');
    const v = versionOf(r); if (!v) throw new Error('The newest release has no version number in its name (' + String(r.tag_name || r.name).slice(0, 40) + ').');
    const url = /^https:\/\//.test(r.html_url || '') ? r.html_url : PAGE;
    return { latest: v, url, notes: String(r.body || '').trim(), name: r.name || r.tag_name };
  }
  const here = () => String((state.settings && state.settings.version) || '');
  async function ask(withTest) {
    const n = net(); if (!n) throw new Error('This build of Timotheos cannot go on the internet.');
    let stable = null, test = null, err = null;
    try { stable = read(await n.text(place())); }
    catch (e) { if (!/error 404/.test(e.message)) err = e; }
    if (withTest) { try { test = read(await n.text(testPlace())); test.test = true; } catch (e) { if (!/error 404/.test(e.message) && !err && !stable) err = e; } }
    const best = stable && test ? (compare(test.latest, stable.latest) > 0 ? test : stable) : (stable || test);
    if (best) return best;
    if (err) throw err;
    const x = new Error('none'); x.none = true; throw x;
  }
  const notes = t => t ? `<h4>What is new</h4><pre class="upnotes">${E(t.length > 1800 ? t.slice(0, 1800) + '…' : t)}</pre>` : '';
  async function check() {
    if (!net()) return TimotheosModules.messageBox('Check for updates', '<p>This build of Timotheos cannot go on the internet. Look for a newer version at <a class="link" data-href="' + PAGE + '">' + PAGE + '</a>.</p>');
    const me = here(); const withTest = !!(state.settings && state.settings.updTest); let result, html, btns = [{ label: 'Close', value: null, primary: true }];
    const shell = h => `<div class="updates"><p>Installed: <b>Timotheos ${E(me)}</b></p>${h}<p><label><input type="checkbox" id="upTest"${withTest ? ' checked' : ''}> Include test builds</label></p><p class="small">Timotheos goes on the internet here only when you ask, to read the newest release on GitHub. Nothing is installed or sent.</p></div>`;
    const p = TimotheosModules.modal('Check for updates', shell('<p id="upState">Looking for the newest version…</p>'), btns);
    try {
      result = await ask(withTest);
      if (compare(result.latest, me) > 0) {
        html = `<p id="upState" class="upnew">A newer version is available: <b>${E(result.latest)}</b>${result.test ? ' (a test build)' : ''}.</p>${notes(result.notes)}<p><button type="button" class="pill gold" id="upGet" data-href="${E(result.url)}">Open the download page</button></p>`;
      } else html = `<p id="upState" class="upok">You have the newest version (the newest release is ${E(result.latest)}).</p>`;
    } catch (e) {
      html = e.none ? `<p id="upState">No release has been published yet, so there is nothing newer to offer. Releases are listed at <a class="link" data-href="${PAGE}">${PAGE}</a>.</p>`
        : `<p id="upState" class="uperr">Could not check: ${E(e.message)}</p>`;
    }
    const box = document.querySelector('#modalBody .updates');
    if (box && !document.querySelector('#modal').classList.contains('hidden')) {
      box.innerHTML = shell(html).replace(/^<div class="updates">|<\/div>$/g, '');
      const tb = box.querySelector('#upTest'); if (tb) tb.onchange = async () => { await save({ updTest: tb.checked }); const c = document.querySelector('#modalBtns button'); if (c) c.click(); setTimeout(check, 150); };
      const g = box.querySelector('#upGet'); if (g) g.onclick = () => api.openExternal(g.dataset.href);
    }
    await p;
  }
  return { check, compare, read };
})();
window.TimotheosUpdates = TimotheosUpdates;
