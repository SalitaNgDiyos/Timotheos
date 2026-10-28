// The Copy Verses window (like theWord's Verse Copy Management): From / To pickers (book → chapter →
// verse), mouse wheel and Page Up / Page Down to add or take away verses, formats and templates, live
// preview, resizable. Port of the Electron version's copy dialog; the format is shared with Ctrl+C.
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import { Bible } from './bibles';
import { ud } from './study';
import { copyText, esc, flash } from './ui';

export interface NavBook { id: number; name: string; abbr: string; grp: string; chapters: number[] }
export interface CopyHost { nav(): NavBook[]; openBibles(): Bible[]; save(): void }
interface R { b: number; c: number; v: number }
interface Fmt { preset: string; header: string; footer: string; verse: string; sep: string; chapter: string; shortNames: boolean; textOnly: boolean; noRefSingle: boolean; bible: string | null; refsOnly?: boolean }

export const COPY_PRESETS = [
  { id: 'para', label: 'Text, then reference', header: '', chapter: '', verse: '%T', sep: ' ', footer: ' (%r %t)' },
  { id: 'num', label: 'Reference heading, numbered verses', header: '%r (%t)%n', chapter: '', verse: '%v %T', sep: '%n', footer: '' },
  { id: 'inline', label: 'Reference before each verse', header: '', chapter: '', verse: '%b %c:%v %T', sep: '%n', footer: '' },
  { id: 'chapters', label: 'Chapter headings, numbered verses', header: '%r (%t)%n', chapter: '%n%b %c%n', verse: '%v %T', sep: ' ', footer: '' },
  { id: 'refs', label: 'Reference only', header: '%r', chapter: '', verse: '', sep: '', footer: '', refsOnly: true },
];
let H: CopyHost;
export function initCopy(host: CopyHost): void { H = host; }
export function copyFormat(): Fmt { return Object.assign({ preset: 'para', shortNames: false, textOnly: false, bible: null, noRefSingle: false }, COPY_PRESETS[0], (ud.copy as Partial<Fmt>) || {}) as Fmt; }

/* ---- walking through verses in reading order */
function verseCount(b: number, c: number, id?: string | null): number {
  const one = (m: Bible) => m.books.get(b)?.[c - 1] || 0;
  const m = H.openBibles().find(x => x.id === id);
  return (m && one(m)) || Math.max(0, ...H.openBibles().map(one));
}
const navIndex = (b: number) => H.nav().findIndex(x => x.id === b);
const cmpRef = (a: R, z: R) => { const ia = navIndex(a.b), iz = navIndex(z.b); return ia !== iz ? ia - iz : a.c !== z.c ? a.c - z.c : a.v - z.v; };
function stepRef(r: R, d: number, id: string | null): R | null {
  const nav = H.nav(); const i = navIndex(r.b); if (i < 0) return null;
  let bk = nav[i]; const { c, v } = r;
  if (d > 0) {
    if (v < verseCount(bk.id, c, id)) return { b: bk.id, c, v: v + 1 };
    let k = bk.chapters.indexOf(c) + 1;
    if (k >= bk.chapters.length) { bk = nav[i + 1]; if (!bk) return null; k = 0; }
    return { b: bk.id, c: bk.chapters[k], v: 1 };
  }
  if (v > 1) return { b: bk.id, c, v: v - 1 };
  let k = bk.chapters.indexOf(c) - 1;
  if (k < 0) { bk = nav[i - 1]; if (!bk) return null; k = bk.chapters.length - 1; }
  const pc = bk.chapters[k];
  return { b: bk.id, c: pc, v: Math.max(1, verseCount(bk.id, pc, id)) };
}
function chaptersBetween(from: R, to: R): { b: number; c: number; v1: number; v2: number }[] {
  const out = []; const nav = H.nav(); const i0 = navIndex(from.b), i1 = navIndex(to.b);
  for (let i = i0; i <= i1 && i >= 0; i++) {
    const bk = nav[i];
    for (const c of bk.chapters) {
      if (i === i0 && c < from.c) continue;
      if (i === i1 && c > to.c) break;
      out.push({ b: bk.id, c, v1: i === i0 && c === from.c ? from.v : 1, v2: i === i1 && c === to.c ? to.v : 999 });
    }
  }
  return out;
}
const countVerses = (from: R, to: R, id: string | null) => chaptersBetween(from, to).reduce((n, ch) => n + Math.max(0, Math.min(ch.v2, verseCount(ch.b, ch.c, id) || ch.v2) - ch.v1 + 1), 0);
export function rangeLabel(from: R, to: R, short: boolean): string {
  const nm = (b: number) => { const bk = canon.book(b); return short ? bk.abbr : bk.name; };
  if (from.b !== to.b) return `${nm(from.b)} ${from.c}:${from.v}–${nm(to.b)} ${to.c}:${to.v}`;
  if (from.c === to.c) return `${nm(from.b)} ${from.c}:${from.v}${to.v > from.v ? '–' + to.v : ''}`;
  return `${nm(from.b)} ${from.c}:${from.v}–${to.c}:${to.v}`;
}

/** text (plain and formatted) of the verses of a chapter in one Bible */
const textCache = new Map<string, Promise<Map<number, { html: string; text: string }>>>();
function chapterText(m: Bible, b: number, c: number) {
  const k = `${m.id}|${b}.${c}`;
  if (!textCache.has(k)) {
    textCache.set(k, m.chapter(b, c).then(rows => {
      const show = { strongs: false, morph: false, footnotes: false, headings: false, woj: true, added: true };
      const out = new Map<number, { html: string; text: string }>(); const t = document.createElement('div');
      for (const r of rows) { const h = TWRender.render(r.raw, m, show).replace(/<sup[^>]*>[\s\S]*?<\/sup>/g, ''); t.innerHTML = h; out.set(r.v, { html: h, text: (t.textContent || '').replace(/\s+/g, ' ').trim() }); }
      return out;
    }));
    if (textCache.size > 200) textCache.delete(textCache.keys().next().value!);
  }
  return textCache.get(k)!;
}

export async function buildCopy(from: R, to: R, fmt: Fmt, limit = 0): Promise<{ text: string; html: string; count: number; shown: number }> {
  const bibles = H.openBibles();
  let m = bibles.find(x => x.id === fmt.bible) || bibles[0];
  if (!m) return { text: '', html: '', count: 0, shown: 0 };
  if (!(await chapterText(m, from.b, from.c)).has(from.v)) { for (const x of bibles) if ((await chapterText(x, from.b, from.c)).has(from.v)) { m = x; break; } }
  const bname = (b: number) => { const bk = canon.book(b); return fmt.shortNames ? bk.abbr : bk.name; };
  const r = rangeLabel(from, to, fmt.shortNames);
  const single = from.b === to.b && from.c === to.c && from.v === to.v;
  const fill = (tpl: string, o: { b?: number; c?: number; v?: number; T?: string }) => tpl.replace(/%n/g, '\n').replace(/%([rtbcvT])/g, (mm, k) => ({ r, t: m.abbr, b: bname(o.b || from.b), c: String(o.c ?? ''), v: String(o.v ?? ''), T: o.T ?? '' } as Record<string, string>)[k] ?? mm);
  if (fmt.refsOnly) return { text: r, html: esc(r), count: 1, shown: 1 };
  let text = '', html = '';
  const header = single && fmt.noRefSingle ? '' : fill(fmt.header || '', {});
  text += header; html += esc(header).replace(/\n/g, '<br>');
  const chs = chaptersBetween(from, to); let first = true, count = 0, shown = 0;
  for (const ch of chs) {
    const vs = await chapterText(m, ch.b, ch.c);
    if (fmt.chapter && chs.length > 1) { const t = fill(fmt.chapter, { b: ch.b, c: ch.c }); text += t; if (!limit || shown < limit) html += `<b>${esc(t).replace(/\n/g, '<br>')}</b>`; }
    for (const [v, x] of vs) {
      if (v < ch.v1 || v > ch.v2) continue;
      const sep = first ? '' : fill(fmt.sep || '', { b: ch.b }); first = false;
      text += sep + fill(fmt.verse, { b: ch.b, c: ch.c, v, T: x.text }); count++;
      if (limit && shown >= limit) continue; shown++;
      const parts = fill(fmt.verse.replace('%T', '\u0001'), { b: ch.b, c: ch.c, v }).split('\u0001');
      html += esc(sep).replace(/\n/g, '<br>') + `<span>${parts[0] ? '<b>' + esc(parts[0]) + '</b>' : ''}${x.html}${esc(parts[1] || '')}</span>`;
    }
  }
  const footer = single && fmt.noRefSingle ? '' : fill(fmt.footer || '', {});
  text += footer; html += esc(footer).replace(/\n/g, '<br>');
  return { text, html: `<div style="font-family:Georgia,serif">${html}</div>`, count, shown };
}

/** Ctrl+C: the current verse in the last format used */
export async function quickCopy(r: R): Promise<void> {
  const out = await buildCopy(r, r, copyFormat()); await copyText(out.text, copyFormat().textOnly ? undefined : out.html);
  flash('Copied ' + rangeLabel(r, r, true));
}

/* ---- the window */
export async function copyDialog(start: R, end?: R): Promise<void> {
  let from = { ...start }, to = { ...(end || start) };
  const f = copyFormat();
  const ic = (d: string) => `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="${d}"/></svg>`;
  const wrap = document.createElement('div'); wrap.className = 'dlg';
  wrap.innerHTML = `<div class="dlgbox cvmbox" role="dialog" aria-label="Copy verses"><h3>Copy verses</h3><div class="cvm">
    <div class="cvmleft">
      <section class="cvstep"><h5>Step 1: the verses <span class="grow"></span><span id="cpCount" class="small"></span><button id="cpOne" class="ib" title="Back to one verse">✕</button></h5>
        <div class="cprange"><button id="cpFromBtn" class="rbtn" data-end="from"><span class="small">From:</span><b id="cpFromLbl"></b>${ic('M6 9l6 6 6-6')}</button>
        <button id="cpToBtn" class="rbtn" data-end="to"><span class="small">To:</span><b id="cpToLbl"></b>${ic('M6 9l6 6 6-6')}</button></div>
        <p class="small">Mouse wheel over a button, or Page Up / Page Down: one verse more or less (Shift: a chapter).</p></section>
      <section class="cvstep"><h5>Step 2: Bible and format</h5>
        <label class="fl">Bible <select id="cpBible">${H.openBibles().map(m => `<option value="${esc(m.id)}">${esc(m.abbr)} – ${esc(m.title)}</option>`).join('')}</select></label>
        <label class="fl">Format <select id="cpPreset">${COPY_PRESETS.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}<option value="custom">Custom…</option></select></label>
        <label><input type="checkbox" id="cpShort"> Short book names</label><label><input type="checkbox" id="cpText"> Plain text only</label><label><input type="checkbox" id="cpNoRef"> No header/footer for a single verse</label>
        <details id="cpCustom"><summary>Templates</summary>
          ${[['cpHeader', 'Header'], ['cpVerse', 'Each verse'], ['cpSep', 'Between verses'], ['cpChapter', 'Before each chapter'], ['cpFooter', 'Footer']].map(([id, l]) => `<label class="fl">${l} <input id="${id}" class="txt"></label>`).join('')}
          <p class="small">%r range · %t Bible · %b book · %c chapter · %v verse · %T verse text · %n new line</p></details></section>
    </div>
    <div class="cvmright"><div class="small"><b>Preview</b> <span id="cpNote"></span></div><div id="cpPreview" class="cpprev"></div></div>
    <div id="vpick" class="vpick hidden"></div></div>
    <div class="dlgbtns"><button data-r="close">Close</button><button data-r="copy">Copy</button><button data-r="copyclose" class="primary">Copy and close</button></div></div>`;
  document.body.appendChild(wrap);
  const box = wrap.querySelector<HTMLElement>('.dlgbox')!;
  const sz = ud.copySize as { w: number; h: number } | undefined; if (sz && sz.w) { box.style.width = sz.w + 'px'; box.style.height = sz.h + 'px'; }
  const q = <T extends HTMLElement = HTMLElement>(s: string) => wrap.querySelector(s) as T;
  const fields: [string, keyof Fmt][] = [['cpHeader', 'header'], ['cpFooter', 'footer'], ['cpVerse', 'verse'], ['cpSep', 'sep'], ['cpChapter', 'chapter']];
  const bibleId = () => q<HTMLSelectElement>('#cpBible').value;
  const ui = () => {
    q<HTMLSelectElement>('#cpBible').value = f.bible && H.openBibles().some(m => m.id === f.bible) ? f.bible : (H.openBibles()[0]?.id || '');
    q<HTMLSelectElement>('#cpPreset').value = COPY_PRESETS.some(x => x.id === f.preset) ? f.preset : 'custom';
    for (const [id, k] of fields) q<HTMLInputElement>('#' + id).value = String(f[k] || '').replace(/\n/g, '%n');
    q<HTMLInputElement>('#cpShort').checked = !!f.shortNames; q<HTMLInputElement>('#cpText').checked = !!f.textOnly; q<HTMLInputElement>('#cpNoRef').checked = !!f.noRefSingle;
  };
  let seq = 0;
  const refresh = async () => {
    for (const [id, k] of fields) (f as unknown as Record<string, string>)[k] = q<HTMLInputElement>('#' + id).value;
    f.bible = bibleId(); f.shortNames = q<HTMLInputElement>('#cpShort').checked; f.textOnly = q<HTMLInputElement>('#cpText').checked; f.noRefSingle = q<HTMLInputElement>('#cpNoRef').checked;
    q('#cpFromLbl').textContent = rangeLabel(from, from, true); q('#cpToLbl').textContent = rangeLabel(to, to, true);
    const n = countVerses(from, to, bibleId()); q('#cpCount').textContent = `(${n} verse${n === 1 ? '' : 's'})`;
    const my = ++seq; const out = await buildCopy(from, to, f, 300); if (my !== seq) return;
    q('#cpPreview').innerHTML = f.textOnly ? esc(out.text).replace(/\n/g, '<br>') : out.html;
    q('#cpNote').textContent = out.count > out.shown ? `– first ${out.shown} of ${out.count} verses shown; all are copied` : '';
  };
  const chapStep = (r: R, d: number, which: string): R | null => {
    const id = bibleId(); const n = verseCount(r.b, r.c, id) || r.v;
    if (which === 'to') { if (d > 0) { if (r.v < n) return { ...r, v: n }; const nx = stepRef(r, 1, id); return nx && { ...nx, v: verseCount(nx.b, nx.c, id) || 1 }; } return stepRef({ ...r, v: 1 }, -1, id); }
    if (d < 0) { if (r.v > 1) return { ...r, v: 1 }; const pv = stepRef(r, -1, id); return pv && { ...pv, v: 1 }; }
    return stepRef({ ...r, v: n }, 1, id);
  };
  const nudge = (which: string, d: number, chapter: boolean) => {
    const cur = which === 'from' ? from : to; const r = chapter ? chapStep(cur, d, which) : stepRef(cur, d, bibleId()); if (!r) return;
    if (which === 'from') { from = r; if (cmpRef(from, to) > 0) to = { ...from }; } else { to = r; if (cmpRef(to, from) < 0) from = { ...to }; }
    refresh();
  };
  let lastEnd = 'to';
  ui(); refresh();
  q<HTMLSelectElement>('#cpPreset').onchange = () => { const pr = COPY_PRESETS.find(x => x.id === q<HTMLSelectElement>('#cpPreset').value); if (pr) { Object.assign(f, pr, { preset: pr.id }); if (!pr.refsOnly) delete f.refsOnly; ui(); } else { f.preset = 'custom'; f.refsOnly = false; q<HTMLDetailsElement>('#cpCustom').open = true; } refresh(); };
  for (const [id] of fields) q('#' + id).oninput = () => { f.preset = 'custom'; f.refsOnly = false; q<HTMLSelectElement>('#cpPreset').value = 'custom'; refresh(); };
  for (const id of ['#cpBible', '#cpShort', '#cpText', '#cpNoRef']) q(id).onchange = refresh;
  q('#cpOne').onclick = () => { to = { ...from }; refresh(); };
  for (const btn of [q('#cpFromBtn'), q('#cpToBtn')]) {
    const which = btn.dataset.end!;
    btn.onclick = () => { lastEnd = which; picker(which, btn); };
    btn.onfocus = () => { lastEnd = which; };
    btn.addEventListener('wheel', e => { e.preventDefault(); lastEnd = which; nudge(which, e.deltaY > 0 ? 1 : -1, e.shiftKey); }, { passive: false });
  }
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); if (!q('#vpick').classList.contains('hidden')) q('#vpick').classList.add('hidden'); else close(null); return; }
    if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
    if ((e.target as HTMLElement).matches('input') || !q('#vpick').classList.contains('hidden')) return;
    e.preventDefault(); const rb = (e.target as HTMLElement).closest<HTMLElement>('.rbtn'); if (rb) lastEnd = rb.dataset.end!;
    nudge(lastEnd, e.key === 'PageDown' ? 1 : -1, e.shiftKey);
  });
  const doCopy = async () => { const out = await buildCopy(from, to, f); await copyText(out.text, f.textOnly ? undefined : out.html); flash(`Copied ${out.count} verse${out.count === 1 ? '' : 's'}`); };
  const close = async (how: string | null) => {
    ud.copy = { preset: f.preset, header: f.header, footer: f.footer, verse: f.verse, sep: f.sep, chapter: f.chapter, shortNames: f.shortNames, textOnly: f.textOnly, noRefSingle: f.noRefSingle, bible: f.bible, refsOnly: !!f.refsOnly };
    ud.copySize = { w: box.offsetWidth, h: box.offsetHeight }; H.save();
    if (how === 'copyclose') await doCopy();
    wrap.remove();
  };
  wrap.querySelectorAll<HTMLButtonElement>('[data-r]').forEach(b => b.onclick = () => { const r = b.dataset.r!; if (r === 'copy') doCopy(); else close(r === 'close' ? null : r); });
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(null); });
  q('#cpToBtn').focus();

  function picker(which: string, btn: HTMLElement) {
    const pk = q('#vpick'); const cur = which === 'from' ? from : to; let selB = cur.b, selC = cur.c;
    const grp: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' };
    const draw = () => {
      const nav = H.nav(); const bk = nav.find(x => x.id === selB) || nav[0];
      let books = '', g = '';
      for (const x of nav) { if (x.grp !== g) { g = x.grp; books += `<li class="pg">${esc(grp[g] || g)}</li>`; } books += `<li data-b="${x.id}" class="${x.id === selB ? 'on' : ''}">${esc(x.name)}</li>`; }
      const n = verseCount(bk.id, selC, bibleId());
      pk.innerHTML = `<div class="vph"><b>${which === 'from' ? 'From' : 'To'}:</b> ${esc(bk.name)} ${selC}<span class="grow"></span><input id="vpFind" class="txt" placeholder="Find a book…"></div>
        <div class="vpcols"><ul class="vpbooks">${books}</ul><div class="vpgrid">${bk.chapters.map(c => `<button data-c="${c}" class="${c === selC ? 'on' : ''}">${c}</button>`).join('')}</div>
        <div class="vpgrid">${Array.from({ length: n }, (_, i) => `<button data-v="${i + 1}" class="${selB === cur.b && selC === cur.c && i + 1 === cur.v ? 'on' : ''}">${i + 1}</button>`).join('')}</div></div>`;
      pk.querySelectorAll<HTMLElement>('li[data-b]').forEach(li => li.onclick = () => { selB = +li.dataset.b!; selC = H.nav().find(x => x.id === selB)!.chapters[0]; draw(); });
      pk.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.onclick = () => { selC = +b.dataset.c!; draw(); });
      pk.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.onclick = () => {
        const r = { b: selB, c: selC, v: +b.dataset.v! };
        if (which === 'from') { from = r; if (cmpRef(from, to) > 0) to = { ...from }; } else { to = r; if (cmpRef(to, from) < 0) from = { ...to }; }
        pk.classList.add('hidden'); btn.focus(); refresh();
      });
      const fi = pk.querySelector<HTMLInputElement>('#vpFind')!;
      fi.oninput = () => { const t = fi.value.trim().toLowerCase(); pk.querySelectorAll<HTMLElement>('li[data-b]').forEach(li => li.classList.toggle('hidden', !!t && !li.textContent!.toLowerCase().includes(t))); };
      fi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); pk.querySelector<HTMLElement>('li[data-b]:not(.hidden)')?.click(); } };
      pk.querySelector('li.on')?.scrollIntoView({ block: 'center' });
    };
    draw(); pk.classList.remove('hidden'); pk.querySelector('li.on')?.scrollIntoView({ block: 'center' });
    setTimeout(() => pk.querySelector<HTMLInputElement>('#vpFind')?.focus(), 20);
  }
}
