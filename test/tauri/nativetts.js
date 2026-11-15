/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The page side of the Android reading service, with a stand-in for the service (window.TwSpeech) that plays the playlist on a timer.
(async () => {
  const sl = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  try {
    for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
    const calls = []; let pl = [], idx = 0, timer = null, paused = false;
    const ev = o => window.__twTts && window.__twTts(o);
    const tick = () => { if (paused || idx >= pl.length) return; ev({ t: 'piece', i: idx }); idx++; };
    window.TwSpeech = {
      start(j) { const o = JSON.parse(j); calls.push('start'); pl = o.pieces; idx = 0; paused = false; window.__start = o; clearInterval(timer); timer = setInterval(tick, 25); },
      append(j) { const a = JSON.parse(j); calls.push('append'); pl = pl.concat(a); },
      pause() { calls.push('pause'); paused = true; ev({ t: 'state', playing: true, paused: true }); },
      resume() { calls.push('resume'); paused = false; ev({ t: 'state', playing: true, paused: false }); },
      next() { calls.push('next'); }, prev() { calls.push('prev'); },
      stop() { calls.push('stop'); clearInterval(timer); },
      state() { return JSON.stringify({ playing: true, paused, idx, total: pl.length }); },
      snapshot() { return '{}' }, batteryOk() { return true; }, allowBackground() { calls.push('bg'); },
    };
    await go({ b: 43, c: 3, v: 14 }); await sl(1500);
    state.settings.tts = Object.assign({}, state.settings.tts || {}, { mode: 'bible', lang: 'en' });
    // a voice must exist for the language: the page asks speechSynthesis; offer one
    window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    window.speechSynthesis = { getVoices: () => [{ name: 'T', lang: 'en-US', voiceURI: 'v1', localService: true }], cancel() {}, speak() {}, addEventListener() {} };
    const p = TimotheosSpeech.speakView(state.active, null);
    await sl(1500);
    ok(calls.includes('start'), 'start sent to the service');
    const o = window.__start || {};
    ok(o.pieces && o.pieces.length > 5 && o.pieces[0].r === '43.3.14', 'playlist begins at the selected verse: ' + (o.pieces && o.pieces[0].r));
    ok(o.voice === 'v1' && o.loop === false, 'voice and no loop');
    ok(calls.includes('append'), 'next chapters appended (' + calls.filter(x => x === 'append').length + ')');
    const chs = new Set(pl.map(x => x.r.split('.').slice(0, 2).join('.')));
    ok(chs.size >= 4, 'chapters in the playlist: ' + [...chs].join(','));
    ok(document.documentElement.classList.contains('tts-on'), 'tts-on while reading');
    ok(!!document.getElementById('ttsbar') && !document.getElementById('ttsbar').classList.contains('hidden'), 'player shown');
    // jump the reading into the next chapter and see the view follow
    const k = pl.findIndex(x => x.r.startsWith('43.4.'));
    paused = true; ev({ t: 'piece', i: k }); await sl(1800);
    const rv = refOfView(state.active);
    ok(rv.b === 43 && rv.c === 4, 'view turned to John 4: ' + rv.b + '.' + rv.c);
    ok(!!document.querySelector('.speaking'), 'a verse is marked');
    // pause / continue / next / stop from the player
    TimotheosSpeech.control('pause'); await sl(100); ok(calls.includes('pause') && TimotheosSpeech.isPaused(), 'pause reaches the service');
    TimotheosSpeech.control('pause'); await sl(100); ok(calls.includes('resume') && !TimotheosSpeech.isPaused(), 'continue reaches the service');
    TimotheosSpeech.control('next'); ok(calls.includes('next'), 'next verse reaches the service');
    TimotheosSpeech.control('stop'); await sl(200);
    ok(calls.includes('stop') && !TimotheosSpeech.isSpeaking() && !document.documentElement.classList.contains('tts-on'), 'stop ends it');
    // the service ends by itself
    TimotheosSpeech.speakView(state.active, null); await sl(1200);
    ev({ t: 'end' }); await sl(200);
    ok(!TimotheosSpeech.isSpeaking(), 'end event ends the reading');
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  console.log('RESULT ' + out.join(' | '));
})();
