// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// importing archives in the app (the 7-Zip WebAssembly engine inside the worker): needs the sample folder in ARCDIR
(async () => { try {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(1500);
  const D = window.__ARCDIR || '/tmp/claude-0/-home-claude/6230d6ca-fca5-513a-83b8-1cfc86a984ac/scratchpad/arm';
  const imp = async (f, o) => { const r = await Promise.race([api.importFiles([D + '/' + f], o), new Promise((_, j) => setTimeout(() => j(new Error('no answer in 40 s')), 40000))]); return r.results; };
  for (const f of ['zipp.zip', 'sevenz.7z', 'tgzz.tar.gz', 'txzz.tar.xz', 'tbzz.tar.bz2', 'tzstt.tar.zst', 'Single.usfm.gz', 'Other.usfm.xz', 'Third.usfm.zst', 'nest.tgz']) {
    try { const r = await imp(f); ok(r.length === 1 && (r[0].status === 'imported' || r[0].status === 'updated'), f + ' -> ' + r.map(x => x.status + (x.reason ? ' (' + x.reason + ')' : '')).join(',')); } catch (e) { ok(false, f + ' threw ' + e.message); }
  }
  for (const f of ['encz.zip', 'enc7.7z']) {
    const r = await imp(f); ok(r.length === 1 && r[0].status === 'password' && !r[0].wrong, f + ' asks for a password: ' + r[0].status);
    const bad = await imp(f, { passwords: { [D + '/' + f]: 'nope' } }); ok(bad[0].status === 'password' && bad[0].wrong, f + ' wrong password refused: ' + bad[0].status + ' wrong=' + bad[0].wrong);
    const good = await imp(f, { passwords: { [D + '/' + f]: 'secret' } }); ok(good.length === 1 && /imported|updated/.test(good[0].status), f + ' right password: ' + good.map(x => x.status + (x.reason ? ' ' + x.reason : '')).join(','));
  }
  console.log('RESULT ' + out.join(' | '));
} catch (e) { console.log('RESULT script error: ' + e.message + ' ' + (e.stack || '').slice(0, 300)); } })();
