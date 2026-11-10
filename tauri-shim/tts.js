/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Android: the web view has no speech engine (no window.speechSynthesis), so the page gets one that talks to
// Android's own text-to-speech through tauri-plugin-tts. It offers just what speech-ui.js uses:
// speechSynthesis.getVoices / speak / cancel / addEventListener('voiceschanged') and SpeechSynthesisUtterance.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function installAndroidSpeech() {
  let voices = [], cur = null, watchdog = null, ready = false;
  const listeners = [];
  class Utterance { constructor(t) { this.text = t || ''; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; this.onend = null; this.onerror = null; this.onstart = null; } }
  const finish = (u, err) => { if (!u || cur !== u) return; cur = null; clearTimeout(watchdog); const f = err ? u.onerror : u.onend; if (f) try { f.call(u, {}); } catch (e) { /* the page's own error */ } };
  const refresh = async () => {
    try {
      const r = await invoke('plugin:tts|get_voices', { payload: { language: null } });
      voices = (r.voices || []).map(v => ({ name: v.name, lang: String(v.language || '').replace('_', '-'), voiceURI: v.id, localService: true, default: false }));
      ready = true; listeners.forEach(f => { try { f(); } catch (e) { /* ignore */ } });
    } catch (e) { /* no engine */ }
  };
  // the engine starts by itself a moment after the app does: ask until it has voices
  (async () => {
    try { await invoke('plugin:tts|register_listener'); } catch (e) { /* the relay is also set up by the first speak */ }
    for (let i = 0; i < 40 && !ready; i++) {
      try { const s = await invoke('plugin:tts|is_initialized'); if (s && s.initialized && s.voiceCount > 0) { await refresh(); break; } } catch (e) { /* not yet */ }
      await new Promise(r => setTimeout(r, 500));
    }
  })();
  const ev = (name, fn) => listen('tts://' + name, e => fn(e.payload || {}));
  ev('speech:start', p => { if (cur && !cur.id) cur.id = p.id; clearTimeout(watchdog); });
  const end = err => p => { if (cur && cur.id && p.id === cur.id) finish(cur, err); };
  ev('speech:finish', end(false)); ev('speech:cancel', end(false)); ev('speech:interrupted', end(false)); ev('speech:error', end(true));
  const synth = {
    getVoices: () => voices,
    addEventListener: (t, f) => { if (t === 'voiceschanged') { listeners.push(f); if (ready) setTimeout(f, 0); } },
    removeEventListener: (t, f) => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); },
    speak(u) {
      if (cur) finish(cur, false);
      cur = u; u.id = null;
      // nothing heard back in time (engine stuck, event lost): give up on this piece so reading goes on
      const limit = 20000 + (u.text.length * 120) / Math.max(0.3, u.rate || 1);
      clearTimeout(watchdog); watchdog = setTimeout(() => { if (cur === u) { invoke('plugin:tts|stop').catch(() => {}); finish(u, true); } }, limit);
      invoke('plugin:tts|speak', { payload: { text: u.text, language: u.voice ? null : (u.lang || null), voiceId: u.voice ? u.voice.voiceURI : null, rate: u.rate || 1, pitch: u.pitch || 1, volume: u.volume == null ? 1 : u.volume, queueMode: 'flush' } })
        .then(r => { if (cur === u && !u.id && r && r.utteranceId) u.id = r.utteranceId; })
        .catch(() => finish(u, true));
    },
    cancel() { const u = cur; invoke('plugin:tts|stop').catch(() => {}); if (u) setTimeout(() => finish(u, false), 0); },
    pause() {}, resume() {}, speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utterance;
}
