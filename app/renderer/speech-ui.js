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
    try { speechSynthesis.cancel(); } catch (e) { /* none */ }
    marks(false); document.querySelectorAll('.ttsbtn.on').forEach(e => e.classList.remove('on'));
    const b = document.getElementById('ttsbar'); if (b) b.classList.add('hidden');
    document.querySelectorAll('[data-ttsgo]').forEach(x => x.classList.remove('on'));
    emit('');
  }
  let lastLabel = '';
  function emit(label) { if (label != null) lastLabel = label; window.dispatchEvent(new CustomEvent('tw-tts', { detail: { busy, paused: ctl.paused, label: lastLabel } })); }
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
  /** the open Library topic */
  async function speakTopic(btn) {
    const body = document.querySelector('#libBody'); if (!body || !body.textContent.trim()) return flash('Open a topic first');
    if (busy) { stop(); return; }
    const m = (state.modules.books || []).find(b => b.id === TimotheosModules.lib.cur) || {};
    const blocks = [...body.querySelectorAll('h4, p, li, td')].filter(e => !e.querySelector('p, li, td') && readable(e));
    const pieces = blocks.length ? blocks.map(el => ({ text: readable(el), el })) : readable(body).split(/(?<=[.!?])\s+/).map(text => ({ text }));
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
    };
  }
  /** the old "Read Aloud: Voices…" menu entry: the settings page */
  function voicesDialog() { if (window.TimotheosOptions) TimotheosOptions.open('speech'); }
  /** the player's buttons, for the phone screens' own players: 'prev' | 'pause' | 'next' | 'stop' */
  function control(t) { const b = document.getElementById('ttsbar'); const x = b && b.querySelector(`[data-t="${t}"]`); if (x) x.click(); else if (t === 'stop') stop(); }
  function setCfg(k, v) { const n = cfg(); n[k] = v; store(n); emit(); }
  window.TimotheosSpeech = { speakView, speakTopic, voicesDialog, fillOptions, stop, isSpeaking: () => busy, isPaused: () => ctl.paused, label: () => lastLabel, langOf, control, cfg, setCfg, voices, NAMES, sample, have };
})();
