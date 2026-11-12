/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// "Check for updates": asks GitHub which release of Timotheos is the newest published one and compares its version with this one.
// It runs only when the user asks (Help → Check for Updates, or the button in About). Nothing is installed and nothing is sent
// except the request itself; a newer version is shown with "Download and install" (Windows, Android, Linux: the file is fetched here, checked against its SHA-256 fingerprint, then given to the installer) and a button that opens its download page.
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
    const assets = (Array.isArray(r.assets) ? r.assets : []).map(a => ({ name: String(a.name || ''), url: String(a.browser_download_url || ''), size: +a.size || 0, sha256: /^sha256:([0-9a-f]{64})$/i.test(a.digest || '') ? RegExp.$1.toLowerCase() : '' })).filter(a => a.name && /^https?:\/\//.test(a.url));
    return { latest: v, url, notes: String(r.body || '').trim(), name: r.name || r.tag_name, assets };
  }
  /** the file of a release that suits this system: the Windows setup, the Android APK, the Linux .deb */
  function fileFor(r) {
    const os = (window.TimotheosHost && TimotheosHost.info() || {}).platform;
    const want = os === 'win32' ? /_x64-setup\.exe$/i : os === 'android' ? /\.apk$/i : os === 'linux' ? /\.deb$/i : null;
    return want ? (r.assets || []).find(a => want.test(a.name)) || null : null;
  }
  const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  /** download, check the fingerprint and hand the file to the installer; says what is happening in #upState */
  async function getAndInstall(r, f) {
    const n = net(), st = document.querySelector('#upState'), box = document.querySelector('#upProg'), say = (h, cls) => { if (st) { st.className = cls || ''; st.innerHTML = h; } };
    if (!f.sha256) { say('GitHub gives no fingerprint for this file, so Timotheos will not install it by itself. Use the download page instead.', 'uperr'); return; }
    box.innerHTML = '<progress id="upBar" max="100" value="0" style="width:100%"></progress><p><button type="button" class="pill" id="upStop">Stop</button></p>';
    const bar = box.querySelector('#upBar'); box.querySelector('#upStop').onclick = () => n.stop();
    say('Downloading ' + E(f.name) + '…');
    let path;
    try {
      path = await n.get(f.url, f.name, p => { const t = p.total || f.size; if (t && bar) { bar.value = Math.min(100, Math.round(p.done * 100 / t)); say('Downloading ' + E(f.name) + ' – ' + mb(p.done) + ' of ' + mb(t)); } });
    } catch (e) { box.innerHTML = ''; say(/Stopped/.test(e.message) ? 'The download was stopped. Nothing was changed.' : 'The download did not work: ' + E(e.message), 'uperr'); return; }
    say('Checking the file…');
    let sum = ''; try { sum = await n.sha256(path); } catch (e) { sum = ''; }
    if (sum !== f.sha256) { box.innerHTML = ''; say('The downloaded file does not match the fingerprint that GitHub lists for it, so it was <b>not</b> installed. Try again, or use the download page.', 'uperr'); return; }
    say('The file is complete and matches its fingerprint.');
    let how; try { how = await n.install(path); } catch (e) { how = 'failed'; box.innerHTML = ''; say('The installer could not be started: ' + E(e.message), 'uperr'); return; }
    box.innerHTML = '';
    say({
      started: (window.TimotheosHost && TimotheosHost.isAndroid) ? 'Android\'s installer is open. Tap <b>Install</b> there to finish updating Timotheos.' : 'The installer is starting. Timotheos will close so that it can be replaced.',
      folder: 'Downloaded and checked. The folder with the file is open: install it with your package tool (for the .deb: <code>sudo apt install ./' + E(f.name) + '</code>).',
      permission: 'Android first needs your permission to let Timotheos install apps. Turn <b>Allow from this source</b> on in the screen that opened, come back here, and press <b>Download and install</b> again.',
      failed: 'The installer could not be started.'
    }[how] || 'Done.', how === 'failed' ? 'uperr' : '');
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
        html = `<p id="upState" class="upnew">A newer version is available: <b>${E(result.latest)}</b>${result.test ? ' (a test build)' : ''}.</p>${notes(result.notes)}<div id="upProg"></div><div id="upAct">${fileFor(result) && net() ? `<p><button type="button" class="pill gold" id="upDo">Download and install</button> <span class="small">${E(fileFor(result).name)} · ${mb(fileFor(result).size)}</span></p>` : ''}<p><button type="button" class="pill${fileFor(result) ? '' : ' gold'}" id="upGet" data-href="${E(result.url)}">Open the download page</button></p></div>`;
      } else html = `<p id="upState" class="upok">You have the newest version (the newest release is ${E(result.latest)}).</p>`;
    } catch (e) {
      html = e.none ? `<p id="upState">No release has been published yet, so there is nothing newer to offer. Releases are listed at <a class="link" data-href="${PAGE}">${PAGE}</a>.</p>`
        : `<p id="upState" class="uperr">Could not check: ${E(e.message)}</p>`;
    }
    const box = document.querySelector('#modalBody .updates');
    if (box && !document.querySelector('#modal').classList.contains('hidden')) {
      box.innerHTML = shell(html).replace(/^<div class="updates">|<\/div>$/g, '');
      const tb = box.querySelector('#upTest'); if (tb) tb.onchange = async () => { await save({ updTest: tb.checked }); const c = document.querySelector('#modalBtns button'); if (c) c.click(); setTimeout(check, 150); };
      const dobtn = box.querySelector('#upDo'); if (dobtn) dobtn.onclick = () => { dobtn.disabled = true; getAndInstall(result, fileFor(result)).finally(() => { if (dobtn.isConnected) dobtn.disabled = false; }); };
      const g = box.querySelector('#upGet'); if (g) g.onclick = () => api.openExternal(g.dataset.href);
    }
    await p;
  }
  return { check, compare, read, fileFor };
})();
window.TimotheosUpdates = TimotheosUpdates;
