/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Reading aloud: a Bible view (verse by verse, the verse being read is marked, on into the next chapter) and
 * the open Library topic. The voices are the ones the system offers (Windows, Android) through the web engine.
 * Options → Read aloud: the language and voice, volume, pitch and tempo, and what happens at the end of a chapter:
 * read on to the end of the Bible, repeat the chapter, or repeat a verse range. */
/* global state, save, esc, api, go, refName, TimotheosModules, TimotheosStudy, TimotheosOptions, TimotheosIcons, refOfView, views, paneTexts, setActiveView */
(function () {
  const LANG = { eng: 'en', en: 'en', tgl: 'fil', tl: 'fil', fil: 'fil', ceb: 'ceb', ilo: 'ilo', spa: 'es', es: 'es', por: 'pt', fre: 'fr', fra: 'fr', fr: 'fr', ger: 'de', deu: 'de', de: 'de', ita: 'it', dut: 'nl', nld: 'nl', grc: 'el', gre: 'el', ell: 'el', el: 'el', heb: 'he', hbo: 'he', he: 'he', rus: 'ru', chi: 'zh', zho: 'zh', kor: 'ko', jpn: 'ja', ind: 'id', may: 'ms', msa: 'ms', vie: 'vi', tha: 'th', ara: 'ar', lat: 'la' };
  const NAMES = { en: 'English', fil: 'Filipino / Tagalog', ceb: 'Cebuano', ilo: 'Ilocano', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch', el: 'Greek', he: 'Hebrew', ru: 'Russian', zh: 'Chinese', ko: 'Korean', ja: 'Japanese', id: 'Indonesian', ms: 'Malay', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic', la: 'Latin' };
  const langOf = code => { const c = String(code || 'eng').toLowerCase().trim(); return LANG[c] || c.slice(0, 2) || 'en'; };
  const sameLang = (vl, l) => { const v = String(vl).toLowerCase().replace('_', '-'); return v === l || v.startsWith(l + '-') || (l === 'fil' && /^(tl|fil)\b/.test(v)); };
  const DEF = { voices: {}, lang: '', volume: 1, pitch: 1, rate: 1, mode: 'bible', from: null, to: null };
  const cfg = () => (state.settings.tts = Object.assign({}, DEF, state.settings.tts || {}, { voices: Object.assign({}, (state.settings.tts || {}).voices || {}) }));
  const store = c => save({ tts: c || cfg() });
  const flash = m => TimotheosStudy.flash(m);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const have = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

  async function voices() {
    if (!have()) return [];
    let v = speechSynthesis.getVoices(); if (v.length) return v;
    await new Promise(r => { const t = setTimeout(r, 3000); speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); r(); }, { once: true }); });
    return speechSynthesis.getVoices();
  }
  async function voiceFor(lang) {
    const all = await voices(); const want = cfg().voices[lang];
    if (want) { const v = all.find(x => x.voiceURI === want); if (v) return v; }
    const same = all.filter(v => sameLang(v.lang, lang));
    return same.find(v => /natural|neural|online/i.test(v.name)) || same.find(v => v.localService) || same[0] || (lang === 'en' ? all[0] || null : null);
  }

  /* ---- one reading at a time: run is a ticket, stop() cancels it ---- */
  let run = 0, busy = false, ctl = { paused: false, jump: 0 };
  const alive = my => my === run && busy;
  function marks(on) { if (!on) document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); }
  function stop() {
    run++; busy = false; ctl = { paused: false, jump: 0 };
    if (ns) { ns = null; nativeCall('stop'); }
    try { speechSynthesis.cancel(); } catch (e) { /* none */ }
    marks(false); document.querySelectorAll('.ttsbtn.on').forEach(e => e.classList.remove('on'));
    const b = document.getElementById('ttsbar'); if (b) b.classList.add('hidden');
    document.querySelectorAll('[data-ttsgo]').forEach(x => x.classList.remove('on'));
    emit('');
  }
  let lastLabel = '';
  function emit(label) { if (label != null) lastLabel = label; document.documentElement.classList.toggle('tts-on', busy); window.dispatchEvent(new CustomEvent('tw-tts', { detail: { busy, paused: ctl.paused, label: lastLabel } })); }
  function sayOne(text, v) {
    return new Promise(res => {
      const c = cfg(); const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang;
      u.rate = c.rate || 1; u.pitch = c.pitch || 1; u.volume = c.volume == null ? 1 : c.volume;
      u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u);
    });
  }
  function chunks(t) {
    if (t.length < 280) return [t];
    const out = []; let cur = '';
    for (const s of t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t]) { if ((cur + s).length > 280 && cur) { out.push(cur); cur = ''; } cur += s; }
    if (cur) out.push(cur); return out;
  }
  const ic = n => (window.TimotheosIcons ? TimotheosIcons.icon(n, 22) : '');
  const SVG = { play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>', pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>', stop: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>', next: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7L4 19z"/></svg>' };
  /** the little player that shows while something is read: previous verse, pause, next verse, stop */
  function bar(label) {
    let b = document.getElementById('ttsbar');
    if (!b) {
      b = document.createElement('div'); b.id = 'ttsbar';
      b.innerHTML = `<span class="ttslbl" id="ttsLbl"></span><button type="button" data-t="prev" title="Previous verse">${SVG.prev}</button><button type="button" data-t="pause" title="Pause / continue">${SVG.pause}</button><button type="button" data-t="next" title="Next verse">${SVG.next}</button><button type="button" data-t="stop" title="Stop reading">${SVG.stop}</button>`;
      b.addEventListener('click', e => {
        const t = e.target.closest('button'); if (!t) return;
        if (ns) {   // Android: the service does the reading; the buttons only tell it
          const k = t.dataset.t;
          if (k === 'stop') stop();
          else if (k === 'pause') { ctl.paused = !ctl.paused; t.innerHTML = ctl.paused ? SVG.play : SVG.pause; nativeCall(ctl.paused ? 'pause' : 'resume'); emit(); }
          else nativeCall(k === 'next' ? 'next' : 'prev');
          return;
        }
        if (t.dataset.t === 'stop') stop();
        else if (t.dataset.t === 'pause') { ctl.paused = !ctl.paused; t.innerHTML = ctl.paused ? SVG.play : SVG.pause; if (ctl.paused) { try { speechSynthesis.cancel(); } catch (x) { /* none */ } } emit(); }
        else { ctl.jump = t.dataset.t === 'next' ? 1 : -1; try { speechSynthesis.cancel(); } catch (x) { /* none */ } }
      });
      document.body.appendChild(b);
    }
    b.classList.remove('hidden'); b.querySelector('[data-t="pause"]').innerHTML = ctl.paused ? SVG.play : SVG.pause;
    document.getElementById('ttsLbl').textContent = label || '';
    emit(label || '');
  }
  /** read pieces one after another, marking each element while it is read; true when all were read */
  async function speakPieces(pieces, lang, my, label) {
    const v = await voiceFor(lang);
    if (!v) { flash(have() ? `No voice for ${NAMES[lang] || lang} on this device – choose one in Options → Read aloud` : 'Reading aloud is not available on this device'); return false; }
    let k = 0;
    while (k < pieces.length) {
      if (!alive(my)) return false;
      const p = pieces[k]; const t = String(p.text || '').replace(/\s+/g, ' ').trim();
      if (!t) { k++; continue; }
      marks(false);
      if (p.el) { p.el.classList.add('speaking'); p.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      bar(p.label || label);
      ctl.jump = 0; const cs = chunks(t);
      for (let ci = 0; ci < cs.length;) {
        if (!alive(my) || ctl.jump) break;
        await sayOne(cs[ci], v);
        while (ctl.paused && alive(my)) { await sleep(150); if (!ctl.paused) ci--; }   // after a pause the same piece is read again
        ci++;
      }
      if (!alive(my)) return false;
      if (ctl.jump) { k = Math.max(0, k + ctl.jump); ctl.jump = 0; continue; }
      k++;
    }
    return alive(my);
  }
  /** the readable text of an element: without verse numbers, Strong's numbers, footnote marks, cross-references */
  function readable(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('sup, .xrs, .unote, .noteicon, .vno, .cm, .cl, .fnlist, .rabbr, .src').forEach(x => x.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }
  const sameCh = (a, b) => a && b && a.b === b.b && a.c === b.c;
  async function goRef(i, r) { setActiveView(i, true); await go({ b: r.b, c: r.c, v: r.v || 1 }, false); }
  async function nextChapter(i) {
    const r = refOfView(i); const k = state.nav.findIndex(x => x.id === r.b); if (k < 0) return false;
    let bk = state.nav[k], j = bk.chapterList.indexOf(r.c) + 1, c;
    if (j < bk.chapterList.length) c = bk.chapterList[j];
    else { bk = state.nav[k + 1]; if (!bk) return false; c = bk.chapterList[0]; }          // the end of the Bible: nothing more to read
    await goRef(i, { b: bk.id, c, v: 1 }); return true;
  }
  /** a Bible view, as set in Options → Read aloud: on to the end of the Bible, the chapter again and again, or a verse range again and again */
  async function speakView(i, btn) {
    if (busy) { stop(); return; }
    if (!have()) return flash('Reading aloud is not available on this device');
    setActiveView(i, true);
    const c = cfg(); const mode = c.mode;
    let range = null;
    if (mode === 'range') {
      range = c.from && c.to ? { from: c.from, to: c.to } : null;
      const ord = r => r && state.nav.findIndex(x => x.id === r.b) * 1e7 + r.c * 1e3 + r.v;
      if (!range || ord(range.from) > ord(range.to)) { flash('Set the verse range (From and To) in Options → Read aloud'); if (window.TimotheosOptions) TimotheosOptions.open('speech'); return; }
    }
    const inf = state.infos.get((views()[i] || {}).bible) || {};
    const lang = c.lang || langOf(inf.lang);
    if (nat()) return speakNative(i, mode, range, lang, btn);
    const my = ++run; busy = true; ctl = { paused: false, jump: 0 };
    if (btn) btn.classList.add('on', 'ttsbtn');
    try {
      if (range) await goRef(i, range.from);
      for (let first = true; alive(my); first = false) {
        const root = paneTexts()[i]; if (!root) break;
        const cur = refOfView(i); let lo = 1, hi = Infinity;
        if (range) { if (sameCh(cur, range.from)) lo = range.from.v; if (sameCh(cur, range.to)) hi = range.to.v; }
        else if (mode === 'bible' && first) lo = cur.v || 1;                                   // from the selected verse on
        const rows = [...root.querySelectorAll('tr[data-v], .pv[data-v]')].filter(r => +r.dataset.v >= lo && +r.dataset.v <= hi);
        const ok = await speakPieces(rows.map(r => ({ text: readable(r.querySelector('td[data-col]') || r), el: r, label: refName({ b: cur.b, c: cur.c, v: +r.dataset.v }) })), lang, my);
        if (!ok) break;
        if (mode === 'chapter') continue;                                                      // the same chapter again
        if (range && sameCh(cur, range.to)) { await goRef(i, range.from); continue; }          // the range again
        if (!(await nextChapter(i))) break;                                                    // on into the next chapter, until the Bible ends
      }
    } finally { if (my === run) stop(); }
  }
  /* ---- Android: the reading is done by a native foreground service (android/SpeechService.kt.tpl) ----
   * The page hands over the verses of the chapter and of the chapters after it; the service speaks them one after another with
   * the screen on or off, holds the audio and the CPU, and shows a notification player with previous / pause / next / stop.
   * The page only marks the verse that is being read, turns to the next chapter with it, and keeps the playlist filled up. */
  const nat = () => !!(window.TwSpeech && typeof window.TwSpeech.start === 'function');
  const nativeCall = (fn, ...a) => { try { return window.TwSpeech[fn](...a); } catch (e) { return null; } };
  const NAHEAD = 4;                 // chapters kept in the playlist after the one being read
  let ns = null;                    // { kind, i, mode, loop, metas:[{b,c,v,lbl,el}], bibleId, last, starts, g, exhausted, want, cur, shown }
  function nextRef(r) {
    const k = state.nav.findIndex(x => x.id === r.b); if (k < 0) return null;
    const bk = state.nav[k], j = bk.chapterList.indexOf(r.c) + 1;
    if (j < bk.chapterList.length) return { b: bk.id, c: bk.chapterList[j] };
    const n = state.nav[k + 1]; return n ? { b: n.id, c: n.chapterList[0] } : null;
  }
  /** the readable verses of a chapter, from the Bible's own text (no pane has to show it) */
  async function chapPieces(bibleId, b, c, lo, hi) {
    const d = await api.chapter([bibleId], b, c);
    const inf = state.infos.get(bibleId) || { rules: [] };
    const show = Object.assign({}, state.settings.show, { strongs: false, morph: false, footnotes: false });
    const out = [];
    for (const r of d.rows) {
      if (r.cells[0] == null || r.v < 1 || r.v < lo || r.v > hi) continue;
      const el = document.createElement('div');
      el.innerHTML = TWRender.render(r.cells[0], inf, show, { fn: { n: 0 }, b });
      const text = readable(el); if (text) out.push({ v: r.v, text, lbl: refName({ b, c, v: r.v }) });
    }
    return out;
  }
  /** add verses to the playlist: one group per verse (previous / next move by group), a piece per sentence-sized chunk */
  function nAdd(s, list, ps, b, c) {
    for (const p of ps) { s.g++; for (const t of chunks(p.text)) { s.metas.push({ b, c, v: p.v, lbl: p.lbl }); list.push({ t, g: s.g, l: p.lbl, r: `${b}.${c}.${p.v}` }); } }
  }
  async function showPiece(m) {
    const s = ns; if (!s || !m) return;
    bar(m.lbl);
    if (m.el) { marks(false); if (m.el.isConnected) { m.el.classList.add('speaking'); m.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    // the view turns to the chapter being read when the reading goes on into the next one; a reader who went elsewhere is left alone
    if (!s.shown || s.shown.b !== m.b || s.shown.c !== m.c) {
      const cur = refOfView(s.i); s.shown = { b: m.b, c: m.c };
      if (cur.b !== m.b || cur.c !== m.c) await goRef(s.i, { b: m.b, c: m.c, v: m.v });
      if (ns !== s) return;
    }
    marks(false);
    const root = paneTexts()[s.i]; const el = root && root.querySelector(`tr[data-v="${m.v}"], .pv[data-v="${m.v}"]`);
    if (el) { el.classList.add('speaking'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  async function pump() {
    const s = ns; if (!s || s.pumping) return; s.pumping = true;
    try { let last = -1; while (ns === s && last !== s.want) { last = s.want; if (!document.hidden) await showPiece(s.metas[last]); } } finally { s.pumping = false; }
  }
  async function topUp() {
    const s = ns; if (!s || s.kind !== 'view' || s.mode !== 'bible' || s.topping || s.exhausted) return;
    s.topping = true;
    try {
      while (ns === s && !s.exhausted && s.starts.filter(x => x > s.cur).length < NAHEAD) {
        const nx = nextRef(s.last); if (!nx) { s.exhausted = true; break; }
        const ps = await chapPieces(s.bibleId, nx.b, nx.c, 1, Infinity);
        if (ns !== s) return;
        const list = []; s.starts.push(s.metas.length); nAdd(s, list, ps, nx.b, nx.c); s.last = nx;
        if (list.length) nativeCall('append', JSON.stringify(list));
      }
    } catch (e) { /* what is queued goes on */ } finally { s.topping = false; }
  }
  function onNative(e) {
    const s = ns; if (!s || !e) return;
    if (e.t === 'piece') { s.cur = s.want = e.i; pump(); topUp(); }
    else if (e.t === 'state') {
      if (!e.playing && !e.paused) { stop(); return; }
      ctl.paused = !!e.paused; const b = document.getElementById('ttsbar'); if (b) b.querySelector('[data-t="pause"]').innerHTML = ctl.paused ? SVG.play : SVG.pause; emit();
    } else if (e.t === 'end') stop();
    else if (e.t === 'err') { flash(e.msg || 'Reading aloud stopped'); stop(); }
  }
  /** Android keeps reading with the screen off; when the page is back it catches up with where the service is */
  function nativeSync() {
    if (!nat()) return;
    let st; try { st = JSON.parse(window.TwSpeech.state()); } catch (e) { return; }
    if (!ns) { if (st.playing || st.paused) reattach(); return; }
    if (!st.playing && !st.paused) { stop(); return; }
    ctl.paused = !!st.paused; ns.cur = ns.want = st.idx;
    const m = ns.metas[st.idx]; if (m) bar(m.lbl); else emit();
    pump(); topUp();
  }
  /** the page was rebuilt while the service kept reading: pick the reading up again */
  function reattach() {
    let snap, ctx = {};
    try { snap = JSON.parse(window.TwSpeech.snapshot()); ctx = JSON.parse(snap.ctx || '{}'); } catch (e) { return; }
    if (ctx.kind !== 'view' || !snap.pieces || !snap.pieces.length || !state.nav || !state.nav.length) { if (!ctx.kind || ctx.kind !== 'view') nativeCall('stop'); return; }
    const metas = snap.pieces.map(p => { const a = String(p.r || '').split('.').map(Number); return { b: a[0], c: a[1], v: a[2], lbl: p.l }; });
    const starts = []; metas.forEach((m, k) => { if (k === 0 || m.b !== metas[k - 1].b || m.c !== metas[k - 1].c) starts.push(k); });
    const last = metas[metas.length - 1];
    run++; busy = true; ctl = { paused: !!snap.paused, jump: 0 };
    ns = { kind: 'view', i: Math.min(ctx.i || 0, Math.max(0, views().length - 1)), mode: ctx.mode || 'bible', loop: !!snap.loop, metas, bibleId: ctx.bibleId, last: { b: last.b, c: last.c },
      starts, g: snap.pieces.reduce((a, p) => Math.max(a, p.g || 0), 0), exhausted: false, want: snap.idx, cur: snap.idx, shown: null };
    window.__twTts = onNative;
    const m = metas[snap.idx]; bar(m ? m.lbl : '');
    pump(); topUp();
  }
  /** Battery saver and battery optimisation stop background apps; reading aloud asks once to be left out of it (the user answers in Android's own dialog) */
  function batteryOk() { try { return !window.TwSpeech.batteryOk || window.TwSpeech.batteryOk(); } catch (e) { return true; } }
  function askBackground(force) {
    if (!nat() || batteryOk()) return;
    let asked = false; try { asked = localStorage.getItem('tw-bgask') === '1'; } catch (e) { /* no storage */ }
    if (asked && !force) return;
    try { localStorage.setItem('tw-bgask', '1'); } catch (e) { /* fine */ }
    setTimeout(() => nativeCall('allowBackground'), 700);
  }
  async function speakNative(i, mode, range, lang, btn) {
    const v = await voiceFor(lang);
    if (!v) return flash(`No voice for ${NAMES[lang] || lang} on this device – choose one in Options → Read aloud`);
    const c = cfg(); const bibleId = (views()[i] || {}).bible;
    if (range) await goRef(i, range.from);
    const cur = range ? range.from : refOfView(i);
    run++; busy = true; ctl = { paused: false, jump: 0 };
    if (btn) btn.classList.add('on', 'ttsbtn');
    const s = ns = { kind: 'view', i, mode, loop: mode !== 'bible', metas: [], bibleId, last: { b: cur.b, c: cur.c }, starts: [], g: 0, exhausted: false, want: 0, cur: 0, shown: { b: cur.b, c: cur.c } };
    const payload = [];
    try {
      const addChap = async (b, c2, lo, hi) => { const ps = await chapPieces(bibleId, b, c2, lo, hi); s.starts.push(s.metas.length); nAdd(s, payload, ps, b, c2); };
      if (range) {
        let r = { b: range.from.b, c: range.from.c };
        for (let n = 0; n < 200 && r; n++) { await addChap(r.b, r.c, sameCh(r, range.from) ? range.from.v : 1, sameCh(r, range.to) ? range.to.v : Infinity); if (sameCh(r, range.to)) break; r = nextRef(r); }
      } else if (mode === 'chapter') await addChap(cur.b, cur.c, 1, Infinity);
      else await addChap(cur.b, cur.c, cur.v || 1, Infinity);
      if (ns !== s) return;                                   // stopped while the text was being fetched
      if (!payload.length) { flash('Nothing to read here'); stop(); return; }
      window.__twTts = onNative;
      nativeCall('start', JSON.stringify({ pieces: payload, loop: s.loop, voice: v.voiceURI, lang: v.lang, rate: c.rate || 1, pitch: c.pitch || 1, volume: c.volume == null ? 1 : c.volume,
        label: s.metas[0].lbl, start: 0, ctx: JSON.stringify({ kind: 'view', mode, i, bibleId }) }));
      bar(s.metas[0].lbl); pump(); askBackground();
      topUp();
    } catch (e) { flash('Could not start reading aloud'); if (ns === s) stop(); }
  }
  async function speakTopicNative(pieces, lang, title, btn) {
    const v = await voiceFor(lang);
    if (!v) return flash(`No voice for ${NAMES[lang] || lang} on this device – choose one in Options → Read aloud`);
    const c = cfg(); run++; busy = true; ctl = { paused: false, jump: 0 }; if (btn) btn.classList.add('on', 'ttsbtn');
    const s = ns = { kind: 'topic', i: 0, mode: 'topic', loop: false, metas: [], g: 0, want: 0, cur: 0, starts: [], exhausted: true };
    const payload = [];
    for (const p of pieces) { const t = String(p.text || '').replace(/\s+/g, ' ').trim(); if (!t) continue; s.g++; for (const x of chunks(t)) { s.metas.push({ el: p.el, lbl: title }); payload.push({ t: x, g: s.g, l: title, r: '' }); } }
    if (!payload.length) { stop(); return; }
    window.__twTts = onNative;
    nativeCall('start', JSON.stringify({ pieces: payload, loop: false, voice: v.voiceURI, lang: v.lang, rate: c.rate || 1, pitch: c.pitch || 1, volume: c.volume == null ? 1 : c.volume, label: title, start: 0, ctx: JSON.stringify({ kind: 'topic' }) }));
    bar(title); pump(); askBackground();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) nativeSync(); });
  if (nat()) setTimeout(nativeSync, 3500);

  /** the open Library topic */
  async function speakTopic(btn) {
    const body = document.querySelector('#libBody'); if (!body || !body.textContent.trim()) return flash('Open a topic first');
    if (busy) { stop(); return; }
    const m = (state.modules.books || []).find(b => b.id === TimotheosModules.lib.cur) || {};
    const blocks = [...body.querySelectorAll('h4, p, li, td')].filter(e => !e.querySelector('p, li, td') && readable(e));
    const pieces = blocks.length ? blocks.map(el => ({ text: readable(el), el })) : readable(body).split(/(?<=[.!?])\s+/).map(text => ({ text }));
    if (nat()) return speakTopicNative(pieces, cfg().lang || langOf(m.lang), m.title || '', btn);
    const my = ++run; busy = true; ctl = { paused: false, jump: 0 }; if (btn) btn.classList.add('on', 'ttsbtn');
    try { await speakPieces(pieces, cfg().lang || langOf(m.lang), my, m.title || ''); } finally { if (my === run) stop(); }
  }
  async function sample(l) {
    if (busy) stop();
    const t = { en: 'For God so loved the world.', fil: 'Sapagka\'t gayon na lamang ang pagsinta ng Dios sa sanglibutan.' };
    const my = ++run; busy = true; ctl = { paused: false, jump: 0 };
    try { await speakPieces([{ text: t[l] || NAMES[l] || l }], l, my, ''); } finally { if (my === run) stop(); }
  }

  /* ---- Options → Read aloud ---- */
  function voiceRows(all, c, langs) {
    const sel = l => {
      const same = all.filter(v => sameLang(v.lang, l)), rest = all.filter(v => !sameLang(v.lang, l));
      const opt = v => `<option value="${esc(v.voiceURI)}"${c.voices[l] === v.voiceURI ? ' selected' : ''}>${/natural|neural|online/i.test(v.name) ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})</option>`;
      return `<select data-tl="${l}"><option value="">Automatic${same.length ? '' : ' – no voice for this language'}</option>${same.length ? `<optgroup label="${esc(NAMES[l] || l)}">${same.map(opt).join('')}</optgroup>` : ''}${rest.length ? `<optgroup label="Other languages">${rest.map(opt).join('')}</optgroup>` : ''}</select>`;
    };
    return langs.map(l => `<div class="ttsrow"><span>${esc(NAMES[l] || l)}</span>${sel(l)}<button type="button" class="tb" data-try="${l}" title="Try this voice">▶</button></div>`).join('');
  }
  async function fillOptions(root) {
    if (!root) return;
    const all = await voices(); const c = cfg();
    const inf = state.infos.get(((views()[state.active] || {}).bible)) || {};
    const langs = [...new Set(['en', 'fil', langOf(inf.lang), ...Object.keys(c.voices)])];
    const pct = v => Math.round(v * 100) + '%';
    const refTxt = r => r ? refName(r) : '';
    root.innerHTML = `${have() ? `<p class="small">${all.length} voice${all.length === 1 ? '' : 's'} found on this device. A Bible is read in the voice chosen for its language. More voices come with the device's own speech settings.</p>` : '<p class="note">Reading aloud is not available on this device.</p>'}
      <h4>Language and voice</h4>
      <div class="orow"><span class="olbl">Read in</span><select id="ttsLang"><option value="">Automatic (the language of the Bible)</option>${Object.entries(NAMES).map(([k, n]) => `<option value="${k}"${c.lang === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="ttslangs">${voiceRows(all, c, langs)}</div>
      <div class="ttsrow"><span>Another language</span><select id="ttsAdd"><option value="">Add…</option>${Object.entries(NAMES).filter(([k]) => !langs.includes(k)).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select><span></span></div>
      <h4>Sound</h4>
      <label class="ttsrow"><span>Volume</span><input type="range" id="ttsVol" min="0" max="1" step="0.05" value="${c.volume == null ? 1 : c.volume}"><b id="ttsVolV">${pct(c.volume == null ? 1 : c.volume)}</b></label>
      <label class="ttsrow"><span>Pitch</span><input type="range" id="ttsPitch" min="0.5" max="2" step="0.05" value="${c.pitch || 1}"><b id="ttsPitchV">${(c.pitch || 1).toFixed(2)}</b></label>
      <label class="ttsrow"><span>Tempo (speed)</span><input type="range" id="ttsRate" min="0.5" max="2" step="0.05" value="${c.rate || 1}"><b id="ttsRateV">${(c.rate || 1).toFixed(2)}</b></label>
      ${nat() ? `<h4>Background playback</h4><p class="small">Reading aloud goes on with the screen locked or the app in the background, with the player in the notification. Battery saver can still stop a background app unless Android is told to leave Timotheos out of it.</p><div class="row"><button type="button" id="ttsBg">Allow background playback…</button><span class="small" id="ttsBgState">${batteryOk() ? 'Battery: no restriction for Timotheos ✓' : 'Battery: restricted – tap the button and choose Allow'}</span></div>` : ''}
      <h4>What to read</h4>
      <label class="ttsmode"><input type="radio" name="ttsMode" value="bible"${c.mode === 'bible' ? ' checked' : ''}> Read on, chapter after chapter, to the end of the Bible</label>
      <label class="ttsmode"><input type="radio" name="ttsMode" value="chapter"${c.mode === 'chapter' ? ' checked' : ''}> Repeat the whole chapter</label>
      <label class="ttsmode"><input type="radio" name="ttsMode" value="range"${c.mode === 'range' ? ' checked' : ''}> Repeat a verse range</label>
      <div class="ttsrange${c.mode === 'range' ? '' : ' dim'}">
        <label>From <input id="ttsFrom" value="${esc(refTxt(c.from))}" placeholder="e.g. John 3:16" spellcheck="false"></label><button type="button" class="tb" data-cur="from" title="Use the verse that is active now">Use current verse</button>
        <label>To <input id="ttsTo" value="${esc(refTxt(c.to))}" placeholder="e.g. John 3:21" spellcheck="false"></label><button type="button" class="tb" data-cur="to" title="Use the verse that is active now">Use current verse</button>
      </div>
      <p class="small">Reading starts from the verse that is active in the Bible view (the whole chapter, or the start of the range, for the repeat settings). Stop it with the stop button of the small player that shows while it reads.</p>
      <div class="row"><button type="button" class="primary" id="ttsGo" data-ttsgo>▶ Read the active Bible view now</button><button type="button" id="ttsStop">■ Stop</button></div>`;
    const set = (k, v) => { const n = cfg(); n[k] = v; store(n); };
    root.onchange = async e => {
      const t = e.target;
      if (t.matches('[data-tl]')) { const n = cfg(); if (t.value) n.voices[t.dataset.tl] = t.value; else delete n.voices[t.dataset.tl]; store(n); }
      else if (t.id === 'ttsAdd' && t.value) { const l = t.value; const row = document.createElement('div'); row.innerHTML = voiceRows(await voices(), cfg(), [l]); root.querySelector('.ttslangs').appendChild(row.firstChild); t.value = ''; }
      else if (t.id === 'ttsLang') set('lang', t.value);
      else if (t.name === 'ttsMode') { set('mode', t.value); root.querySelector('.ttsrange').classList.toggle('dim', t.value !== 'range'); }
      else if (t.id === 'ttsFrom' || t.id === 'ttsTo') {
        const key = t.id === 'ttsFrom' ? 'from' : 'to';
        const r = t.value.trim() ? await api.parseRef(t.value) : null;
        if (t.value.trim() && !r) { flash('Not a reference: ' + t.value); t.value = refTxt(cfg()[key]); return; }
        set(key, r ? { b: r.b, c: r.c, v: r.v } : null); t.value = refTxt(cfg()[key]);
      }
    };
    root.oninput = e => {
      const t = e.target;
      if (t.id === 'ttsVol') { set('volume', +t.value); root.querySelector('#ttsVolV').textContent = pct(+t.value); }
      else if (t.id === 'ttsPitch') { set('pitch', +t.value); root.querySelector('#ttsPitchV').textContent = (+t.value).toFixed(2); }
      else if (t.id === 'ttsRate') { set('rate', +t.value); root.querySelector('#ttsRateV').textContent = (+t.value).toFixed(2); }
    };
    root.onclick = e => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.try) sample(t.dataset.try);
      else if (t.dataset.cur) { const r = { ...refOfView(state.active) }; set(t.dataset.cur, { b: r.b, c: r.c, v: r.v }); root.querySelector(t.dataset.cur === 'from' ? '#ttsFrom' : '#ttsTo').value = refTxt(r); }
      else if (t.id === 'ttsGo') { const o = document.getElementById('optionsDlg'); if (o) o.classList.add('hidden'); speakView(state.active, null); }
      else if (t.id === 'ttsStop') stop();
      else if (t.id === 'ttsBg') { askBackground(true); setTimeout(() => { const st = root.querySelector('#ttsBgState'); if (st) st.textContent = batteryOk() ? 'Battery: no restriction for Timotheos ✓' : 'Battery: restricted – tap the button and choose Allow'; }, 4000); }
    };
  }
  /** the old "Read Aloud: Voices…" menu entry: the settings page */
  function voicesDialog() { if (window.TimotheosOptions) TimotheosOptions.open('speech'); }
  /** the player's buttons, for the phone screens' own players: 'prev' | 'pause' | 'next' | 'stop' */
  function control(t) { const b = document.getElementById('ttsbar'); const x = b && b.querySelector(`[data-t="${t}"]`); if (x) x.click(); else if (t === 'stop') stop(); }
  function setCfg(k, v) { const n = cfg(); n[k] = v; store(n); emit(); }
  window.TimotheosSpeech = { askBackground, speakView, speakTopic, voicesDialog, fillOptions, stop, isSpeaking: () => busy, isPaused: () => ctl.paused, label: () => lastLabel, langOf, control, cfg, setCfg, voices, NAMES, sample, have };
})();
