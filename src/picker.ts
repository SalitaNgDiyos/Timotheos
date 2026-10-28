// The book → chapter → verse picker that opens from the icon on a Bible pane's caption.
import canon from './legacy/canon.js';
import { esc } from './ui';

export interface PickBook { id: number; name: string; grp: string; chapters: number[] }
const GRP: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' };

/**
 * Show the picker under a button.
 * @param books   the books on offer (in display order)
 * @param cur     where you are now
 * @param verses  how many verses a chapter has (0 or a rejected promise: choose a chapter only)
 * @param done    called with the place chosen
 */
export function openPicker(btn: HTMLElement, books: PickBook[], cur: { b: number; c: number; v?: number }, verses: (b: number, c: number) => Promise<number>, done: (b: number, c: number, v: number) => void): void {
  document.getElementById('bpick')?.remove();
  const pk = document.createElement('div'); pk.id = 'bpick'; pk.className = 'bpick';
  document.body.appendChild(pk);
  let selB = books.some(x => x.id === cur.b) ? cur.b : books[0]?.id, selC = cur.c;
  const close = () => { pk.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', key, true); };
  const outside = (e: MouseEvent) => { if (!pk.contains(e.target as Node) && e.target !== btn && !btn.contains(e.target as Node)) close(); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', key, true);
  const draw = async () => {
    const bk = books.find(x => x.id === selB) || books[0]; if (!bk) { pk.innerHTML = '<p class="hint">No books.</p>'; return; }
    if (!bk.chapters.includes(selC)) selC = bk.chapters[0];
    let list = '', g = '';
    for (const x of books) { if (x.grp !== g) { g = x.grp; list += `<li class="pg">${esc(GRP[g] || g)}</li>`; } list += `<li data-b="${x.id}" class="${x.id === selB ? 'on' : ''}">${esc(x.name)}</li>`; }
    let n = 0; try { n = await verses(bk.id, selC); } catch { n = 0; }
    pk.innerHTML = `<div class="vph"><b>${esc(bk.name)} ${selC}</b><span class="grow"></span><input class="txt bpfind" placeholder="Find a book…"></div>
      <div class="vpcols"><ul class="vpbooks">${list}</ul><div class="vpgrid">${bk.chapters.map(c => `<button data-c="${c}" class="${c === selC ? 'on' : ''}">${c}</button>`).join('')}</div>
      <div class="vpgrid">${n ? Array.from({ length: n }, (_, i) => `<button data-v="${i + 1}" class="${bk.id === cur.b && selC === cur.c && i + 1 === cur.v ? 'on' : ''}">${i + 1}</button>`).join('') : `<button data-v="1" class="wide">Go to ${esc(bk.name)} ${selC}</button>`}</div></div>`;
    pk.querySelectorAll<HTMLElement>('li[data-b]').forEach(li => li.onclick = () => { selB = +li.dataset.b!; selC = books.find(x => x.id === selB)!.chapters[0]; draw(); });
    pk.querySelectorAll<HTMLElement>('[data-c]').forEach(b => b.onclick = () => { selC = +b.dataset.c!; draw(); });
    pk.querySelectorAll<HTMLElement>('[data-v]').forEach(b => b.onclick = () => { close(); done(selB, selC, +b.dataset.v!); });
    const fi = pk.querySelector<HTMLInputElement>('.bpfind')!;
    fi.oninput = () => { const t = fi.value.trim().toLowerCase(); pk.querySelectorAll<HTMLElement>('li[data-b]').forEach(li => li.classList.toggle('hidden', !!t && !li.textContent!.toLowerCase().includes(t))); };
    fi.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); pk.querySelector<HTMLElement>('li[data-b]:not(.hidden)')?.click(); } };
    pk.querySelector('li.on')?.scrollIntoView({ block: 'center' });
  };
  const r = btn.getBoundingClientRect();
  pk.style.left = Math.max(8, Math.min(r.left, innerWidth - 560)) + 'px'; pk.style.top = Math.min(r.bottom + 4, innerHeight - 380) + 'px';
  draw();
}

/** the books of one Bible, for its own view */
export function booksOf(m: { books: Map<number, number[]> }): PickBook[] {
  return [...m.books.keys()].sort((a, b) => canon.orderKey(a) - canon.orderKey(b)).map(id => {
    const bk = canon.book(id); const ch = m.books.get(id) || [];
    return { id, name: bk.name, grp: bk.grp, chapters: ch.map((n, i) => n > 0 ? i + 1 : 0).filter(Boolean) };
  });
}
