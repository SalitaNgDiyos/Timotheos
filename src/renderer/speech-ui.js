'use strict';
/* Reading aloud: a Bible view (verse by verse, the verse being read is marked, on into the next chapter) and
 * the open Library topic. The voices are the ones Windows offers (through the web engine); you choose one
 * per language in "Read aloud: voices…". */
/* global state, save, esc, TanglawModules, TanglawStudy, refOfView, views, paneTexts, step, setActiveView */
(function () {
  const LANG = { eng: 'en', en: 'en', tgl: 'fil', tl: 'fil', fil: 'fil', ceb: 'ceb', ilo: 'ilo', spa: 'es', es: 'es', por: 'pt', fre: 'fr', fra: 'fr', fr: 'fr', ger: 'de', deu: 'de', de: 'de', ita: 'it', dut: 'nl', nld: 'nl', grc: 'el', gre: 'el', ell: 'el', el: 'el', heb: 'he', hbo: 'he', he: 'he', rus: 'ru', chi: 'zh', zho: 'zh', kor: 'ko', jpn: 'ja', ind: 'id', may: 'ms', msa: 'ms', vie: 'vi', tha: 'th', ara: 'ar', lat: 'la' };
  const NAMES = { en: 'English', fil: 'Filipino / Tagalog', ceb: 'Cebuano', ilo: 'Ilocano', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch', el: 'Greek', he: 'Hebrew', ru: 'Russian', zh: 'Chinese', ko: 'Korean', ja: 'Japanese', id: 'Indonesian', ms: 'Malay', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic', la: 'Latin' };
  const langOf = code => { const c = String(code || 'eng').toLowerCase().trim(); return LANG[c] || c.slice(0, 2) || 'en'; };
  const sameLang = (vl, l) => { const v = String(vl).toLowerCase().replace('_', '-'); return v === l || v.startsWith(l + '-') || (l === 'fil' && /^(tl|fil)\b/.test(v)); };
  const cfg = () => (state.settings.tts = Object.assign({ voices: {} }, state.settings.tts || {}));
  const store = () => save({ tts: cfg() });
  const flash = m => TanglawStudy.flash(m);

  async function voices() {
    if (typeof speechSynthesis === 'undefined') return [];
    let v = speechSynthesis.getVoices(); if (v.length) return v;
    await new Promise(r => { const t = setTimeout(r, 1500); speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); r(); }, { once: true }); });
    return speechSynthesis.getVoices();
  }
  async function voiceFor(lang) {
    const all = await voices(); const want = cfg().voices[lang];
    if (want) { const v = all.find(x => x.voiceURI === want); if (v) return v; }
    const same = all.filter(v => sameLang(v.lang, lang));
    return same.find(v => /natural|neural|online/i.test(v.name)) || same.find(v => v.localService) || same[0] || (lang === 'en' ? all[0] || null : null);
  }

  let busy = false, stopped = false, curBtn = null;
  function stop() {
    stopped = true; busy = false;
    try { speechSynthesis.cancel(); } catch (e) { /* none */ }
    document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
    document.querySelectorAll('.ttsbtn.on').forEach(e => e.classList.remove('on'));
  }
  function sayOne(text, v) {
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text); u.voice = v; u.lang = v.lang; u.rate = cfg().rate || 1;
      u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u);
    });
  }
  function chunks(t) {
    if (t.length < 280) return [t];
    const out = []; let cur = '';
    for (const s of t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t]) { if ((cur + s).length > 280 && cur) { out.push(cur); cur = ''; } cur += s; }
    if (cur) out.push(cur); return out;
  }
  /** read pieces one after another, marking each element while it is read; true when all were read */
  async function speakPieces(pieces, lang, btn) {
    if (busy) { stop(); return false; }
    const v = await voiceFor(lang);
    if (!v) { flash(`No voice for ${NAMES[lang] || lang} on this computer – choose one in Read aloud: voices…`); voicesDialog(lang); return false; }
    busy = true; stopped = false; curBtn = btn || null; if (btn) btn.classList.add('on', 'ttsbtn');
    try {
      for (const p of pieces) {
        if (stopped) return false;
        const t = String(p.text || '').replace(/\s+/g, ' ').trim(); if (!t) continue;
        document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
        if (p.el) { p.el.classList.add('speaking'); p.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        for (const c of chunks(t)) { if (stopped) return false; await sayOne(c, v); }
      }
      return !stopped;
    } finally { document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); if (!stopped) { busy = false; if (btn) btn.classList.remove('on'); } }
  }
  /** the readable text of an element: without verse numbers, Strong's numbers, footnote marks, cross-references */
  function readable(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('sup, .xrs, .unote, .noteicon, .vno, .cm, .cl, .fnlist, .rabbr, .src').forEach(x => x.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }
  /** a Bible view, from the selected verse on, then on into the next chapter */
  async function speakView(i, btn) {
    if (busy) { stop(); return; }
    setActiveView(i, true);
    const v = views()[i]; const inf = state.infos.get(v.bible) || {};
    const lang = langOf(inf.lang);
    for (let first = true; ; first = false) {
      const root = paneTexts()[i]; if (!root) return;
      const from = first ? refOfView(i).v || 1 : 1;
      const rows = [...root.querySelectorAll('tr[data-v], .pv[data-v]')].filter(r => +r.dataset.v >= from);
      const ok = await speakPieces(rows.map(r => ({ text: readable(r.querySelector('td[data-col]') || r), el: r })), lang, btn);
      if (!ok || cfg().nextChapter === false) return;
      const before = refOfView(i).c + '.' + refOfView(i).b; step(1);
      for (let k = 0; k < 50 && refOfView(i).c + '.' + refOfView(i).b === before; k++) await new Promise(r => setTimeout(r, 100));
      await new Promise(r => setTimeout(r, 400));
      if (refOfView(i).c + '.' + refOfView(i).b === before) return;
    }
  }
  /** the open Library topic */
  function speakTopic(btn) {
    const body = document.querySelector('#libBody'); if (!body || !body.textContent.trim()) return flash('Open a topic first');
    if (busy) { stop(); return; }
    const m = (state.modules.books || []).find(b => b.id === TanglawModules.lib.cur) || {};
    const blocks = [...body.querySelectorAll('h4, p, li, td')].filter(e => !e.querySelector('p, li, td') && readable(e));
    const pieces = blocks.length ? blocks.map(el => ({ text: readable(el), el })) : readable(body).split(/(?<=[.!?])\s+/).map(text => ({ text }));
    speakPieces(pieces, langOf(m.lang), btn);
  }

  async function voicesDialog(focus) {
    const all = await voices(); const c = cfg();
    const langs = [...new Set(['en', 'fil', ...(focus ? [focus] : []), ...Object.keys(c.voices)])];
    const sel = l => {
      const same = all.filter(v => sameLang(v.lang, l)), rest = all.filter(v => !sameLang(v.lang, l));
      const opt = v => `<option value="${esc(v.voiceURI)}"${c.voices[l] === v.voiceURI ? ' selected' : ''}>${/natural|neural|online/i.test(v.name) ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})</option>`;
      return `<select data-tl="${l}"><option value="">Automatic${same.length ? '' : ' – no voice for this language'}</option>${same.length ? `<optgroup label="${esc(NAMES[l] || l)}">${same.map(opt).join('')}</optgroup>` : ''}${rest.length ? `<optgroup label="Other languages">${rest.map(opt).join('')}</optgroup>` : ''}</select>`;
    };
    const html = `<p class="small">${all.length} voice${all.length === 1 ? '' : 's'} found on this computer. Choose one for each language: a Bible or book is read in the voice of its language. More voices can be added in Windows: Settings → Time &amp; language → Speech.</p>
      <div class="ttslangs">${langs.map(l => `<div class="ttsrow"><span>${esc(NAMES[l] || l)}</span>${sel(l)}<button class="tb" data-try="${l}" title="Try it">▶</button></div>`).join('')}</div>
      <div class="ttsrow"><span>Another language</span><select id="ttsAdd"><option value="">Add…</option>${Object.entries(NAMES).filter(([k]) => !langs.includes(k)).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
      <label class="field">Speed <input type="range" id="ttsRate" min="0.5" max="2" step="0.05" value="${c.rate || 1}"> <b id="ttsRateV">${(c.rate || 1).toFixed(2)}</b></label>
      <label><input type="checkbox" id="ttsNext"${c.nextChapter !== false ? ' checked' : ''}> In a Bible, go on into the next chapter</label>`;
    const p = TanglawModules.modal('Read aloud: voices', html, [{ label: 'Done', value: 'ok', primary: true }]);
    setTimeout(() => {
      const b = document.getElementById('modalBody'); if (!b) return;
      b.addEventListener('change', e => {
        const t = e.target;
        if (t.matches('[data-tl]')) { if (t.value) c.voices[t.dataset.tl] = t.value; else delete c.voices[t.dataset.tl]; store(); }
        if (t.id === 'ttsAdd' && t.value) { const l = t.value; const row = document.createElement('div'); row.className = 'ttsrow'; row.innerHTML = `<span>${esc(NAMES[l] || l)}</span>${sel(l)}<button class="tb" data-try="${l}">▶</button>`; b.querySelector('.ttslangs').appendChild(row); t.value = ''; }
        if (t.id === 'ttsNext') { c.nextChapter = t.checked; store(); }
      });
      b.querySelector('#ttsRate').oninput = e => { c.rate = +e.target.value; b.querySelector('#ttsRateV').textContent = c.rate.toFixed(2); store(); };
      b.addEventListener('click', e => { const t = e.target.closest('[data-try]'); if (!t) return; const l = t.dataset.try; const sample = { en: 'For God so loved the world.', fil: 'Sapagka\'t gayon na lamang ang pagsinta ng Dios sa sanglibutan.' }; speakPieces([{ text: sample[l] || NAMES[l] || l }], l); });
    }, 0);
    await p; if (busy) stop();
  }
  window.TanglawSpeech = { speakView, speakTopic, voicesDialog, stop, isSpeaking: () => busy, langOf };
})();
