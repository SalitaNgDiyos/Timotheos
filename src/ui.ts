// Small shared UI helpers: messages, dialogs, escaping.
export const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
export const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

/** a short message at the bottom of the window */
export function flash(msg: string): void {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout((t as unknown as { _h: number })._h);
  (t as unknown as { _h: number })._h = window.setTimeout(() => t!.classList.remove('on'), 1600);
}

export interface Btn { label: string; value: string | null; primary?: boolean; danger?: boolean }
/** a dialog; resolves with the value of the button pressed (null for Esc / outside) */
export function dialog(title: string, html: string, buttons: Btn[], onOpen?: (box: HTMLElement) => void): Promise<string | null> {
  return new Promise(resolve => {
    const wrap = document.createElement('div'); wrap.className = 'dlg';
    wrap.innerHTML = `<div class="dlgbox" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3><div class="dlgbody">${html}</div><div class="dlgbtns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}${b.danger ? ' danger' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    const done = (v: string | null) => { wrap.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    document.addEventListener('keydown', key, true);
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) done(null); });
    wrap.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.onclick = () => done(buttons[+b.dataset.i!].value));
    if (onOpen) onOpen(wrap.querySelector('.dlgbody')!);
  });
}

/** copy text (and HTML where the system allows) */
export async function copyText(text: string, html?: string): Promise<void> {
  try {
    if (html && 'ClipboardItem' in window) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }), 'text/html': new Blob([html], { type: 'text/html' }) })]);
      return;
    }
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } finally { ta.remove(); }
  }
}
