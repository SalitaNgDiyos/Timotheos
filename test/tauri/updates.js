/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Check for updates: the version comparison, a newer release, the same release, no release (404), a bad answer.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s);
  const until = async (f, n = 60) => { for (let i = 0; i < n; i++) { if (f()) return true; await sleep(200); } return false; };
  const closeM = () => { const b = document.querySelector('#modalBtns button'); if (b) b.click(); };
  try {
    for (let i = 0; i < 80 && !document.querySelector('.bv .pv[data-v]'); i++) await sleep(250);
    const U = TimotheosUpdates, me = state.settings.version;
    ok(U.compare('0.6.10', '0.6.9') === 1 && U.compare('0.6.9', '0.6.10') === -1 && U.compare('v1.0', '1.0.0') === 0, 'versions compare as numbers (0.6.10 is newer than 0.6.9)');
    let bad = ''; try { U.read('<html>'); } catch (e) { bad = e.message; } ok(/not a release/.test(bad), 'an answer that is not a release is refused');
    ok(U.read(JSON.stringify({ tag_name: 'v2.3.4', html_url: 'https://github.com/x/y/releases/tag/v2.3.4', body: 'notes' })).latest === '2.3.4', 'the version is read from the tag');
    const port = JSON.parse(TimotheosHost.info().env.TIMOTHEOS_REPOS).port, base = 'http://127.0.0.1:' + port + '/';
    const run = async (name, f) => { const o = JSON.parse(TimotheosHost.info().env.TIMOTHEOS_REPOS); void o; await f(); };
    // newer
    runCommand('checkUpdates'); ok(await until(() => $('.updates')), 'the window opens from the command');
    ok(await until(() => /newer version is available|You have the newest|Could not|No release/.test($('#upState').textContent)), 'it answers: ' + ($('#upState') || {}).textContent);
    const t = $('#upState').textContent;
    ok(/newer version is available: 9\.9\.9/.test(t), 'a newer release is announced');
    ok(!!$('#upGet') && /^https:\/\//.test($('#upGet').dataset.href), 'with a button to its download page');
    ok(/Installed: Timotheos /.test($('.updates').textContent) && $('.updates').textContent.includes(me), 'the installed version is shown');
    ok(/only when you ask/.test($('.updates').textContent), 'it says when the internet is used');
    ok(!/test build/.test(t) && !!$('#upTest') && !$('#upTest').checked, 'test builds are off to begin with: the answer is the published release');
    $('#upTest').checked = true; $('#upTest').dispatchEvent(new Event('change'));
    await sleep(500); ok(await until(() => $('#upTest') && $('#upTest').checked && /9\.9\.10/.test(($('#upState') || {}).textContent || '')), 'ticking "Include test builds" checks again');
    ok(/9\.9\.10 \(a test build\)/.test($('#upState').textContent), 'the newer test build is offered and marked as a test build: ' + $('#upState').textContent);
    ok(state.settings.updTest === true, 'the choice is remembered');
    ok(U.read(JSON.stringify({ tag_name: 'test', name: 'Timotheos 0.7.1 (test build)' })).latest === '0.7.1', 'a tag without a number takes the version from the name');
    await save({ updTest: false });
    // download and install: the file for this system, its fingerprint, then the installer
    const N = TimotheosHost.net; let gave = null; N.install = async p => { gave = p; return 'folder'; };
    const envo = TimotheosHost.info().env, env0 = envo.TIMOTHEOS_REPOS, setUp = f => { envo.TIMOTHEOS_REPOS = env0.replace('latest.json', f); };
    const open1 = async () => { closeM(); await sleep(300); runCommand('checkUpdates'); await until(() => $('#upDo') || /Could not|No release/.test(($('#upState') || {}).textContent || '')); };
    await open1();
    ok(!!$('#upDo') && /Timotheos_9\.9\.9_amd64\.deb/.test($('#upAct').textContent), 'a newer release offers "Download and install" with the file for this system');
    ok(!!$('#upGet'), 'and still the download page');
    $('#upDo').click();
    ok(await until(() => /Downloaded and checked/.test($('#upState').textContent), 120), 'download, fingerprint check and hand-over: ' + $('#upState').textContent.slice(0, 80));
    ok(/download-\d+\/Timotheos_9\.9\.9_amd64\.deb$/.test(gave || ''), 'the installer got the downloaded file: ' + gave);
    ok(!!$('#upDo') && !$('#upDo').disabled, 'the button is usable again');
    setUp('badsum.json'); gave = null; await open1(); $('#upDo').click();
    ok(await until(() => /does not match/.test($('#upState').textContent), 120) && gave === null, 'a file whose fingerprint is wrong is refused and not installed');
    setUp('nosum.json'); await open1(); $('#upDo').click();
    ok(await until(() => /no fingerprint/.test($('#upState').textContent), 60) && gave === null, 'a file without a fingerprint is not installed by itself');
    setUp('latest.json');
    let refused = ''; try { await N.sha256('/etc/passwd'); } catch (e) { refused = String(e.message || e); } ok(/not one Timotheos downloaded/.test(refused), 'only files Timotheos downloaded can be checked');
    closeM(); await sleep(300);
    // About has the button
    runCommand('about'); ok(await until(() => $('#aboutUpdates')), 'About has a Check for updates button');
    await sleep(700); $('#aboutUpdates').click(); await sleep(600); ok(await until(() => $('.updates') && !$('#modal').classList.contains('hidden')), 'the button opens the check (' + $('#modalTitle').textContent + ')');
    closeM();
  } catch (e) { out.push('✗ ERROR ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
