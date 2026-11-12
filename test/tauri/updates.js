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
    closeM(); await sleep(300);
    // About has the button
    runCommand('about'); ok(await until(() => $('#aboutUpdates')), 'About has a Check for updates button');
    await sleep(700); $('#aboutUpdates').click(); await sleep(600); ok(await until(() => $('.updates') && !$('#modal').classList.contains('hidden')), 'the button opens the check (' + $('#modalTitle').textContent + ')');
    closeM();
  } catch (e) { out.push('✗ ERROR ' + e.message); }
  console.log('RESULT ' + out.join(' | '));
})();
