// Reading aloud: Bible views (verse by verse, the verse being read is marked, on into the next chapter) and any
// book topic (paragraph by paragraph). Two kinds of voices are offered and you choose one per language:
//  · system voices – the speech engine of Windows, Android or Linux (through tauri-plugin-tts);
//  · web-engine voices – the voices the window's own speech engine offers (on Windows this can include
//    Microsoft's "Natural" voices, depending on the Windows version and what is installed).
import * as sys from 'tauri-plugin-tts-api';
import { dialog, esc, flash } from './ui';

export interface Voice { engine: 'system' | 'web'; id: string; name: string; lang: string; natural: boolean }
interface TtsSettings { voices?: Record<string, { engine: 'system' | 'web'; id: string }>; rate?: number; pitch?: number; on?: boolean; nextChapter?: boolean }
let S: { tts?: TtsSettings }; let save: () => void = () => {};
const cfg = (): TtsSettings => (S.tts ||= {});
export function initTts(settings: unknown, saveFn: () => void): void { S = settings as { tts?: TtsSettings }; save = saveFn; }

/** theWord / ISO 639-2 language codes of modules → BCP 47 */
const LANG: Record<string, string> = { eng: 'en', en: 'en', tgl: 'fil', tl: 'fil', fil: 'fil', ceb: 'ceb', ilo: 'ilo', spa: 'es', por: 'pt', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', dut: 'nl', nld: 'nl', grc: 'el', gre: 'el', ell: 'el', heb: 'he', hbo: 'he', rus: 'ru', chi: 'zh', zho: 'zh', kor: 'ko', jpn: 'ja', ind: 'id', may: 'ms', msa: 'ms', vie: 'vi', tha: 'th', ara: 'ar', lat: 'la' };
export const langOf = (code?: string): string => { const c = (code || 'eng').toLowerCase().trim(); return LANG[c] || c.slice(0, 2) || 'en'; };
const NAMES: Record<string, string> = { en: 'English', fil: 'Filipino / Tagalog', ceb: 'Cebuano', ilo: 'Ilocano', es: 'Spanish', pt: 'Portuguese', fr: 'French', de: 'German', it: 'Italian', nl: 'Dutch', el: 'Greek', he: 'Hebrew', ru: 'Russian', zh: 'Chinese', ko: 'Korean', ja: 'Japanese', id: 'Indonesian', ms: 'Malay', vi: 'Vietnamese', th: 'Thai', ar: 'Arabic', la: 'Latin' };
const sameLang = (voiceLang: string, l: string) => { const v = voiceLang.toLowerCase().replace('_', '-'); return v === l || v.startsWith(l + '-') || (l === 'fil' && /^(tl|fil)\b/.test(v)); };

/* ---------------------------------------------------------------- the voices */
const webOK = () => typeof window.speechSynthesis !== 'undefined';
async function webVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!webOK()) return [];
  let v = speechSynthesis.getVoices(); if (v.length) return v;
  await new Promise<void>(r => { const t = setTimeout(r, 1500); speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(t); r(); }, { once: true }); });
  return speechSynthesis.getVoices();
}
const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p, new Promise<T>(r => setTimeout(() => r(fallback), ms))]);
let cache: { at: number; list: Voice[] } | null = null;
/** every voice on this computer (looked up again after a minute, or when the browser engine reports new voices) */
export async function allVoices(): Promise<Voice[]> {
  if (cache && Date.now() - cache.at < 60000) return cache.list;
  if (webOK()) speechSynthesis.addEventListener('voiceschanged', () => { cache = null; }, { once: true });
  const out: Voice[] = [];
  // the system engine may be missing or not answer (e.g. Linux without speech-dispatcher): never wait long
  try { for (let i = 0; i < 10; i++) { const s = await within(sys.isInitialized(), 1200, null); if (!s || (s.initialized && s.voiceCount > 0)) break; await new Promise(r => setTimeout(r, 300)); } } catch { /* no system engine */ }
  try { for (const v of await within(sys.getVoices(), 2500, [])) out.push({ engine: 'system', id: v.id, name: v.name, lang: v.language, natural: /natural|neural|online/i.test(v.name) }); } catch { /* none */ }
  for (const v of await webVoices()) out.push({ engine: 'web', id: v.voiceURI, name: v.name, lang: v.lang, natural: /natural|neural|online/i.test(v.name) });
  cache = { at: Date.now(), list: out };
  return out;
}
/** the voice for a language: your choice, else a natural one, else the first that speaks it */
async function voiceFor(lang: string): Promise<Voice | null> {
  const all = await allVoices(); const want = cfg().voices?.[lang];
  if (want) { const v = all.find(x => x.engine === want.engine && x.id === want.id); if (v) return v; }
  const same = all.filter(v => sameLang(v.lang, lang));
  return same.find(v => v.natural) || same.find(v => v.engine === 'system') || same[0] || (lang !== 'en' ? null : all[0] || null);
}

/* ---------------------------------------------------------------- speaking one piece */
let stopped = false; let unlisten: (() => void) | null = null; let finishWaiter: (() => void) | null = null;
async function sayOne(text: string, v: Voice): Promise<void> {
  const rate = cfg().rate || 1, pitch = cfg().pitch || 1;
  if (v.engine === 'web') {
    const u = new SpeechSynthesisUtterance(text); const wv = (await webVoices()).find(x => x.voiceURI === v.id);
    if (wv) { u.voice = wv; u.lang = wv.lang; } u.rate = rate; u.pitch = pitch;
    await new Promise<void>(res => { u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u); });
    return;
  }
  if (!unlisten) { const un: (() => void)[] = []; for (const ev of ['speech:finish', 'speech:cancel', 'speech:error', 'speech:interrupted'] as const) un.push(await sys.onSpeechEvent(ev, () => { const w = finishWaiter; finishWaiter = null; w?.(); })); unlisten = () => un.forEach(f => f()); }
  await new Promise<void>(res => { finishWaiter = res; sys.speak({ text, voiceId: v.id, rate, pitch, queueMode: 'flush' }).catch(() => { finishWaiter = null; res(); }); });
}
export function stopSpeaking(): void {
  stopped = true; if (webOK()) speechSynthesis.cancel(); sys.stop().catch(() => {});
  const w = finishWaiter; finishWaiter = null; w?.();
  document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
  document.querySelectorAll('.ttsbtn.on').forEach(e => e.classList.remove('on'));
  busy = false;
}
let busy = false;
export const isSpeaking = () => busy;
/** read pieces one after another; each piece may mark an element while it is read */
export async function speakPieces(pieces: { text: string; el?: HTMLElement | null }[], lang: string, btn?: HTMLElement | null): Promise<boolean> {
  if (busy) { stopSpeaking(); return false; }
  const v = await voiceFor(lang);
  if (!v) { flash(`No voice for ${NAMES[lang] || lang} on this computer – choose one in Tools → Read aloud: voices…`); voicesDialog(lang); return false; }
  busy = true; stopped = false; btn?.classList.add('on', 'ttsbtn');
  try {
    for (const p of pieces) {
      if (stopped) return false;
      const t = p.text.replace(/\s+/g, ' ').trim(); if (!t) continue;
      document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking'));
      if (p.el) { p.el.classList.add('speaking'); p.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
      // long paragraphs in sentence-sized pieces (some engines stop after a few hundred characters)
      for (const chunk of chunks(t)) { if (stopped) return false; await sayOne(chunk, v); }
    }
    return !stopped;
  } finally { document.querySelectorAll('.speaking').forEach(e => e.classList.remove('speaking')); if (!stopped) { busy = false; btn?.classList.remove('on'); } }
}
function chunks(t: string): string[] {
  if (t.length < 280) return [t];
  const out: string[] = []; let cur = '';
  for (const s of t.match(/[^.!?;:]+[.!?;:]*\s*/g) || [t]) { if ((cur + s).length > 280 && cur) { out.push(cur); cur = ''; } cur += s; }
  if (cur) out.push(cur);
  return out;
}
/** the readable text of an element: without verse numbers, Strong's numbers, footnote marks and cross-references */
export function readable(el: Element): string {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll('sup, .xrs, .unote, .noteicon, .vn, .cm, .cl, .fnlist, .ubar, h4 .findw, .src').forEach(x => x.remove());
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
}
/** a book topic: its heading and paragraphs */
export function speakTopic(body: HTMLElement | null, lang: string, btn?: HTMLElement | null): void {
  if (!body) return void flash('Open a topic first');
  if (busy) { stopSpeaking(); return; }
  const blocks = [...body.querySelectorAll<HTMLElement>('h4, p, li, td, .rvp, div.entry > div:not(.src):not(.ebody), .ebody > span, .ebody > div')].filter(e => !e.querySelector('p, li, td') && readable(e));
  const pieces = blocks.length ? blocks.map(el => ({ text: readable(el), el })) : readable(body).split(/(?<=[.!?])\s+/).map(text => ({ text }));
  speakPieces(pieces, lang, btn);
}
export const readNextChapter = () => cfg().nextChapter !== false;

/* ---------------------------------------------------------------- choosing voices */
export async function voicesDialog(focusLang?: string): Promise<void> {
  const all = await allVoices(); const c = cfg(); c.voices ||= {};
  const langs = [...new Set(['en', 'fil', ...(focusLang ? [focusLang] : []), ...Object.keys(c.voices)])];
  const sel = (l: string) => {
    const cur = c.voices![l]; const same = all.filter(v => sameLang(v.lang, l)); const rest = all.filter(v => !sameLang(v.lang, l));
    const opt = (v: Voice) => `<option value="${v.engine}|${esc(v.id)}"${cur && cur.engine === v.engine && cur.id === v.id ? ' selected' : ''}>${v.natural ? '★ ' : ''}${esc(v.name)} (${esc(v.lang)})</option>`;
    const grp = (list: Voice[], label: string) => list.length ? `<optgroup label="${label}">${list.map(opt).join('')}</optgroup>` : '';
    return `<select data-tl="${l}"><option value="">Automatic${same.length ? '' : ' – no voice for this language'}</option>${grp(same.filter(v => v.engine === 'system'), 'System voices')}${grp(same.filter(v => v.engine === 'web'), 'Web-engine voices')}${grp(rest, 'Other languages')}</select>`;
  };
  const nat = all.filter(v => v.natural).length;
  await dialog('Read aloud: voices', `<p class="small">${all.length} voices found (${all.filter(v => v.engine === 'system').length} system, ${all.filter(v => v.engine === 'web').length} web-engine${nat ? `, ${nat} marked ★ natural` : ''}). Choose one for each language; a Bible or book is read in the voice of its language. More voices can be added in the settings of Windows (Time & language → Speech) or Android (Text-to-speech output).</p>
    <div class="ttslangs">${langs.map(l => `<div class="ttsrow"><span>${esc(NAMES[l] || l)}</span>${sel(l)}<button class="ib" data-try="${l}" title="Try it">▶</button></div>`).join('')}</div>
    <div class="ttsrow"><span>Another language</span><select id="ttsAdd"><option value="">Add…</option>${Object.entries(NAMES).filter(([k]) => !langs.includes(k)).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
    <label class="fl">Speed <span class="srow"><input type="range" id="ttsRate" min="0.5" max="2" step="0.05" value="${c.rate || 1}"><b id="ttsRateV">${(c.rate || 1).toFixed(2)}</b></span></label>
    <label class="ck"><input type="checkbox" id="ttsNext" ${c.nextChapter !== false ? 'checked' : ''}> In a Bible, go on into the next chapter</label>`,
    [{ label: 'Done', value: 'ok', primary: true }], b => {
      b.addEventListener('change', e => {
        const t = e.target as HTMLElement;
        if (t.matches('[data-tl]')) { const v = (t as HTMLSelectElement).value; const l = t.dataset.tl!; if (v) { const [engine, ...id] = v.split('|'); c.voices![l] = { engine: engine as 'system' | 'web', id: id.join('|') }; } else delete c.voices![l]; save(); }
        if (t.id === 'ttsAdd' && (t as HTMLSelectElement).value) { const l = (t as HTMLSelectElement).value; const row = document.createElement('div'); row.className = 'ttsrow'; row.innerHTML = `<span>${esc(NAMES[l] || l)}</span>${sel(l)}<button class="ib" data-try="${l}">▶</button>`; b.querySelector('.ttslangs')!.appendChild(row); (t as HTMLSelectElement).value = ''; }
        if (t.id === 'ttsNext') { c.nextChapter = (t as HTMLInputElement).checked; save(); }
      });
      b.querySelector<HTMLInputElement>('#ttsRate')!.oninput = e => { c.rate = +(e.target as HTMLInputElement).value; b.querySelector('#ttsRateV')!.textContent = c.rate.toFixed(2); save(); };
      b.addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-try]'); if (!t) return; const l = t.dataset.try!; const sample: Record<string, string> = { en: 'For God so loved the world.', fil: 'Sapagka\'t gayon na lamang ang pagsinta ng Dios sa sanglibutan.' }; speakPieces([{ text: sample[l] || NAMES[l] || l }], l); });
    });
}
