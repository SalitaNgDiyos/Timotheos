// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// archives left in a modules folder are unpacked at start (FOLDERS=[<sample>/fold]); then the password box for a protected archive
(async () => { try {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  let got = null; api.onAutoImport(d => { got = d; });
  for (let i = 0; i < 30 && !got; i++) await sleep(500);
  ok(!!got && got.archives === 1 && got.added === 1, 'the archive in the modules folder was unpacked at start: ' + JSON.stringify(got && { archives: got.archives, added: got.added, protectedN: got.protectedN }));
  const D = '/tmp/claude-0/-home-claude/6230d6ca-fca5-513a-83b8-1cfc86a984ac/scratchpad/arm';
  TimotheosModules.importModules([D + '/encz.zip']); await sleep(2500);
  const title = (document.querySelector('#modalTitle') || {}).textContent; const inp = document.querySelector('#modalBody #arcPw');
  ok(title === 'Password needed' && !!inp && inp.type === 'password', 'the import window asks for the password: ' + title);
  console.log('RESULT ' + out.join(' | '));
} catch (e) { console.log('RESULT script error: ' + e.message); } })();
