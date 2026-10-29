// Clipboard monitor (theWord: Clipboard Monitor): while it is on, Tanglaw looks at text you copy in any
// program; when it finds Bible references, a small window lists them with their text.
import { readText } from '@tauri-apps/plugin-clipboard-manager';
import { getCurrentWindow, UserAttentionType } from '@tauri-apps/api/window';
import TWRender from './legacy/render.js';
import type { Bible } from './bibles';
import { findRefs } from './refs';
import { esc, flash, lastCopied } from './ui';
import { addToList } from './study';

export interface ClipHost { bibles(): Bible[]; openBibles(): Bible[]; go(b: number, c: number, v?: number): void; settings(): Record<string, unknown>; save(): void; show(): Record<string, boolean>; style(m: Bible): string }
interface ClipSettings { on?: boolean; bible?: string; front?: boolean }
let H: ClipHost; let timer = 0; let lastSeen: string | null = null; let refs: ReturnType<typeof findRefs> = [];
const cfg = (): ClipSettings => (H.settings().clipmon as ClipSettings) || ((H.settings().clipmon = {}) as ClipSettings);
let reader: () => Promise<string> = () => readText();

export function initClipmon(host: ClipHost): void { H = host; if (cfg().on) start(); }
export const clipOn = () => !!cfg().on;
export function setClipmon(on: boolean): void { cfg().on = on; H.save(); if (on) start(); else stop(); flash(on ? 'Clipboard monitor on: copy text with Bible references in any program' : 'Clipboard monitor off'); }
function start(): void { stop(); lastSeen = null; timer = window.setInterval(poll, 1200); poll(); }
function stop(): void { clearInterval(timer); timer = 0; }
/** for the tests: read from somewhere else than the real clipboard */
export function clipTestReader(f: () => Promise<string>): void { reader = f; }

async function poll(): Promise<void> {
  let t = ''; try { t = (await reader()) || ''; } catch { return; }
  if (lastSeen === null) { lastSeen = t; return; } // what was there when the monitor started is not new
  if (t === lastSeen) return; lastSeen = t;
  if (!t.trim() || t === lastCopied) return;
  const found = findRefs(t.slice(0, 20000)); if (!found.length) return;
  refs = found.slice(0, 60); await render();
  try { const w = getCurrentWindow(); if (cfg().front) { await w.unminimize(); await w.setFocus(); } else if (!document.hasFocus()) await w.requestUserAttention(UserAttentionType.Informational); } catch { /* not allowed here */ }
}
async function render(): Promise<void> {
  let box = document.getElementById('clipwin');
  if (!box) { box = document.createElement('div'); box.id = 'clipwin'; box.className = 'clipwin'; document.body.appendChild(box); wire(box); }
  const all = H.bibles(); const m = all.find(b => b.id === cfg().bible) || H.openBibles()[0] || all[0];
  const show = { ...H.show(), strongs: false, morph: false, footnotes: false };
  let body = '';
  for (const r of refs) {
    let txt = '';
    if (m) { const rows = (await m.chapter(r.b, r.c)).filter(x => x.v >= r.v && x.v <= (r.v2 || r.v)); txt = rows.map(x => `${rows.length > 1 ? `<sup>${x.v}</sup>` : ''}${TWRender.render(x.raw, m, show)}`).join(' '); }
    body += `<div class="cref" data-go="${r.b}.${r.c}.${r.v}"><a class="cgo">${esc(r.label)}</a> <span${m ? H.style(m) : ''}>${txt || '<span class="small">(not in this Bible)</span>'}</span></div>`;
  }
  box.innerHTML = `<div class="ccap"><b>Clipboard: ${refs.length} reference${refs.length === 1 ? '' : 's'}</b><select class="cbible" title="Bible">${all.map(b => `<option value="${esc(b.id)}"${m && b.id === m.id ? ' selected' : ''}>${esc(b.abbr)}</option>`).join('')}</select>
    <button class="ib clist" title="Add all to the current verse list">+ List</button><label class="small" title="Bring Tanglaw to the front when references are copied"><input type="checkbox" class="cfront" ${cfg().front ? 'checked' : ''}> to front</label><button class="ib cclose" title="Close (the monitor stays on)">×</button></div><div class="cbody">${body}</div>`;
  box.classList.remove('hidden');
}
function wire(box: HTMLElement): void {
  box.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('.cclose')) { box.classList.add('hidden'); return; }
    if (t.closest('.clist')) { addToList(refs.map(r => ({ b: r.b, c: r.c, v: r.v, v2: r.v2 }))); return; }
    const g = t.closest<HTMLElement>('.cgo')?.closest<HTMLElement>('[data-go]'); if (g) { const [b, c, v] = g.dataset.go!.split('.').map(Number); H.go(b, c, v); }
  });
  box.addEventListener('change', e => {
    const t = e.target as HTMLElement;
    if (t.matches('.cbible')) { cfg().bible = (t as HTMLSelectElement).value; H.save(); render(); }
    if (t.matches('.cfront')) { cfg().front = (t as HTMLInputElement).checked; H.save(); }
  });
  // move it by its caption
  box.addEventListener('pointerdown', e => {
    if (!(e.target as HTMLElement).closest('.ccap') || (e.target as HTMLElement).closest('select, button, input, label')) return;
    const r = box.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = (ev: PointerEvent) => { box.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px'; box.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
}
