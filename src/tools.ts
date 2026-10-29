// Graphics viewer (theWord: an image of a module, zoomed and moved freely) and printing.
import { icon } from './icons';
import { esc } from './ui';

/* ---------------------------------------------------------------- graphics viewer */
let imgs: HTMLImageElement[] = []; let at = 0; let zoom = 1; let fit = true; let px = 0, py = 0; let caption = '';
/** open the viewer on an image; its neighbours are the other images of the same entry */
export function openImage(img: HTMLImageElement): void {
  const scope = img.closest('.entry, .entrybody, .pbody, #popup') || document.body;
  imgs = [...scope.querySelectorAll<HTMLImageElement>('img')].filter(i => i.src); at = Math.max(0, imgs.indexOf(img));
  const h4 = scope.querySelector('h4'); const src = scope.querySelector('.src');
  caption = [src?.textContent, h4?.textContent?.replace('Find in Bible', '')].filter(Boolean).join(' – ');
  let v = document.getElementById('gview');
  if (!v) {
    v = document.createElement('div'); v.id = 'gview'; v.className = 'gview';
    v.innerHTML = `<div class="gbar"><button class="ib" data-g="prev" title="Previous image">${icon('prev', 16)}</button><button class="ib" data-g="next" title="Next image">${icon('next', 16)}</button>
      <button class="ib" data-g="out" title="Smaller (wheel)">−</button><select class="gzoom" title="Zoom"><option value="fit">Fit</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select><button class="ib" data-g="in" title="Larger (wheel)">+</button>
      <span class="gcap small"></span><button class="ib" data-g="close" title="Close (Esc)">${icon('close', 16)}</button></div><div class="gstage"><img class="gimg" alt=""></div>`;
    document.body.appendChild(v); wire(v);
  }
  v.classList.remove('hidden'); fit = true; show();
}
function show(): void {
  const v = document.getElementById('gview')!; const im = v.querySelector<HTMLImageElement>('.gimg')!; const src = imgs[at];
  if (!src) return; im.src = src.src; px = py = 0;
  v.querySelector('.gcap')!.textContent = `${caption}${imgs.length > 1 ? ` (${at + 1} of ${imgs.length})` : ''}`;
  const apply = () => { if (fit) { const st = v.querySelector<HTMLElement>('.gstage')!; zoom = Math.min(1, st.clientWidth / (im.naturalWidth || 1), st.clientHeight / (im.naturalHeight || 1)) || 1; } place(); };
  if (im.complete) apply(); else im.onload = apply;
}
function place(): void {
  const v = document.getElementById('gview')!; const im = v.querySelector<HTMLImageElement>('.gimg')!;
  im.style.width = Math.round((im.naturalWidth || 100) * zoom) + 'px'; im.style.transform = `translate(${px}px, ${py}px)`;
  const z = v.querySelector<HTMLSelectElement>('.gzoom')!; z.value = fit ? 'fit' : String(zoom); if (z.selectedIndex < 0) { z.options[z.options.length - 1].text = Math.round(zoom * 100) + '%'; }
}
function wire(v: HTMLElement): void {
  v.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-g]'); if (!b) { if (e.target === v) close(); return; }
    const g = b.dataset.g;
    if (g === 'close') close();
    if (g === 'prev' && imgs.length > 1) { at = (at - 1 + imgs.length) % imgs.length; fit = true; show(); }
    if (g === 'next' && imgs.length > 1) { at = (at + 1) % imgs.length; fit = true; show(); }
    if (g === 'in' || g === 'out') { fit = false; zoom = Math.max(0.05, Math.min(16, zoom * (g === 'in' ? 1.25 : 0.8))); place(); }
  });
  v.querySelector<HTMLSelectElement>('.gzoom')!.onchange = e => { const val = (e.target as HTMLSelectElement).value; if (val === 'fit') { fit = true; show(); } else { fit = false; zoom = +val; place(); } };
  const st = v.querySelector<HTMLElement>('.gstage')!;
  st.addEventListener('wheel', e => { e.preventDefault(); fit = false; zoom = Math.max(0.05, Math.min(16, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); place(); }, { passive: false });
  st.addEventListener('pointerdown', e => {
    const x0 = e.clientX - px, y0 = e.clientY - py; st.setPointerCapture(e.pointerId); st.classList.add('drag');
    const mv = (ev: PointerEvent) => { px = ev.clientX - x0; py = ev.clientY - y0; place(); };
    const up = () => { st.removeEventListener('pointermove', mv); st.removeEventListener('pointerup', up); st.classList.remove('drag'); };
    st.addEventListener('pointermove', mv); st.addEventListener('pointerup', up);
  });
  document.addEventListener('keydown', e => {
    if (v.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); e.preventDefault(); if (imgs.length > 1) { at = (at + 1) % imgs.length; fit = true; show(); } }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); e.preventDefault(); if (imgs.length > 1) { at = (at - 1 + imgs.length) % imgs.length; fit = true; show(); } }
  }, true);
}
function close(): void { document.getElementById('gview')?.classList.add('hidden'); }
export const viewerOpen = () => !!document.getElementById('gview') && !document.getElementById('gview')!.classList.contains('hidden');

/* ---------------------------------------------------------------- printing */
/** print a piece of the page: everything else is hidden while printing */
export function printHtml(title: string, html: string): void {
  let p = document.getElementById('printArea');
  if (!p) { p = document.createElement('div'); p.id = 'printArea'; document.body.appendChild(p); }
  p.innerHTML = `<h1 class="ptitle">${esc(title)}</h1>${html}`;
  // links and hidden helpers are not printed as such
  p.querySelectorAll('.rmx, .xadd, button, input, select, .vfollow').forEach(x => x.remove());
  // (the print style sheet shows only #printArea; it stays until the next print)
  setTimeout(() => window.print(), 50);
}
