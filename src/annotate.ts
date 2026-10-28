// Your own marks in book modules (theWord: user formatting of non-user modules): highlight, bold or underline
// text in a commentary, dictionary or book without changing the module. The marks are kept in your study data
// (by module and topic, as positions in the text) and put back whenever the topic is shown.
import { esc, flash } from './ui';
import { saveUD, ud } from './study';

interface Mark { s: number; e: number; style: string }
type Marks = Record<string, Record<string, Mark[]>>;
const store = (): Marks => ((ud as unknown as { bookMarks?: Marks }).bookMarks || ((ud as unknown as { bookMarks: Marks }).bookMarks = {}));
const redrawFnOuter = (el: HTMLElement) => applyMarks(el);
const STYLES = ['yellow', 'green', 'blue', 'pink', 'orange', 'bold', 'ul'];

function nodes(el: Element): Text[] {
  const out: Text[] = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) out.push(n as Text); return out;
}
/** the body of a topic as shown, with its module and topic, ready for marks */
export function bodyHtml(mod: string, tid: string | number, html: string): string { return `<div class="ebody" data-amod="${esc(mod)}" data-atid="${esc(String(tid))}">${html}</div>`; }
/** put the saved marks into a shown topic */
const orig = new WeakMap<HTMLElement, string>();
export function applyMarks(root: ParentNode): void {
  const els = [...root.querySelectorAll<HTMLElement>('.ebody[data-amod]')]; if ((root as HTMLElement).matches?.('.ebody[data-amod]')) els.push(root as HTMLElement);
  els.forEach(el => {
    if (orig.has(el)) el.innerHTML = orig.get(el)!; else orig.set(el, el.innerHTML);
    el.classList.remove('marked');
    const list = store()[el.dataset.amod!]?.[el.dataset.atid!]; if (!list) return;
    for (const m of list) wrap(el, m.s, m.e, m.style);
    if (list.length) el.classList.add('marked');
  });
}
function wrap(el: Element, s: number, e: number, style: string): void {
  let pos = 0;
  for (const n of nodes(el)) {
    const len = n.length, a = Math.max(s, pos), z = Math.min(e, pos + len);
    if (a < z) { const r = document.createRange(); r.setStart(n, a - pos); r.setEnd(n, z - pos); const mk = document.createElement('mark'); mk.className = 'hl hl-' + style; try { r.surroundContents(mk); } catch { /* skip */ } }
    pos += len; if (pos >= e) break;
  }
}
/** the selection inside one topic body, as text positions */
function selected(): { el: HTMLElement; s: number; e: number } | null {
  const sel = window.getSelection(); if (!sel || !sel.rangeCount || !String(sel).trim()) return null;
  const range = sel.getRangeAt(0);
  const el = (range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer as Element)?.closest<HTMLElement>('.ebody[data-amod]');
  if (!el) return null;
  let pos = 0, s: number | null = null, e = 0;
  for (const n of nodes(el)) {
    if (range.intersectsNode(n)) { const from = n === range.startContainer ? range.startOffset : 0, to = n === range.endContainer ? range.endOffset : n.length; if (s === null) s = pos + from; e = pos + to; }
    pos += n.length;
  }
  return s !== null && e > s ? { el, s, e } : null;
}
/** mark (or, with style null, unmark) the selected text; re-show the topic afterwards */
export function markSelection(style: string | null, redraw: (el: HTMLElement) => void = redrawFnOuter): boolean {
  const t = selected(); if (!t) return false;
  const mod = t.el.dataset.amod!, tid = t.el.dataset.atid!; const all = store(); const byMod = all[mod] || (all[mod] = {});
  const deco = (x: string | null) => ['ul', 'bold'].includes(x || '');
  const list = (byMod[tid] || []).filter(x => x.e <= t.s || x.s >= t.e || (style !== null && x.style !== style && deco(x.style) !== deco(style)));
  if (style) list.push({ s: t.s, e: t.e, style });
  list.sort((a, b) => a.s - b.s);
  if (list.length) byMod[tid] = list; else { delete byMod[tid]; if (!Object.keys(byMod).length) delete all[mod]; }
  saveUD(); window.getSelection()?.removeAllRanges(); hideBar(); redraw(t.el); return true;
}
export function clearTopic(mod: string, tid: string): void { const all = store(); if (all[mod]) { delete all[mod][tid]; if (!Object.keys(all[mod]).length) delete all[mod]; saveUD(); } }
export const hasMarks = (mod: string, tid: string) => !!store()[mod]?.[tid]?.length;

/* the little bar that appears over selected text in a book topic */
const redrawFn = (el: HTMLElement) => applyMarks(el);
export function initAnnotate(): void {
  document.addEventListener('mouseup', e => {
    if ((e.target as HTMLElement).closest('#abar')) return;
    setTimeout(() => {
      const t = selected(); if (!t) { hideBar(); return; }
      const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      let bar = document.getElementById('abar');
      if (!bar) {
        bar = document.createElement('div'); bar.id = 'abar'; bar.className = 'abar';
        bar.innerHTML = STYLES.map(s => `<button data-as="${s}" class="hlb hl-${s}" title="${s === 'bold' ? 'Bold' : s === 'ul' ? 'Underline' : 'Highlight ' + s}">${s === 'bold' ? '<b>B</b>' : s === 'ul' ? '<u>U</u>' : ''}</button>`).join('') + '<button data-as="" title="Remove my marks from the selected text">⌫</button><button data-as="all" title="Remove all my marks from this topic">✕ all</button>';
        bar.addEventListener('mousedown', ev => ev.preventDefault());
        bar.addEventListener('click', ev => {
          const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-as]'); if (!b) return;
          if (b.dataset.as === 'all') { const s = selected(); const el = s?.el; if (el) { clearTopic(el.dataset.amod!, el.dataset.atid!); hideBar(); redrawFn(el); flash('Your marks were removed from this topic'); } return; }
          markSelection(b.dataset.as || null, redrawFn);
        });
        document.body.appendChild(bar);
      }
      bar.querySelector<HTMLElement>('[data-as="all"]')!.style.display = hasMarks(t.el.dataset.amod!, t.el.dataset.atid!) ? '' : 'none';
      bar.classList.remove('hidden');
      bar.style.left = Math.max(6, Math.min(innerWidth - bar.offsetWidth - 6, r.left + r.width / 2 - bar.offsetWidth / 2)) + 'px';
      bar.style.top = Math.max(6, r.top - bar.offsetHeight - 6) + 'px';
    }, 10);
  });
}
function hideBar(): void { document.getElementById('abar')?.classList.add('hidden'); }
