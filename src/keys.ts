// Keyboard shortcuts: one list of actions with their keys; any key can be changed (Tools → Keyboard shortcuts…,
// or Ctrl+/), and the list doubles as the reference card.
import { dialog, esc, flash } from './ui';

export interface Action { id: string; label: string; group: string; def: string; run: (e: KeyboardEvent) => void | boolean }
let actions: Action[] = []; let custom: Record<string, string> = {}; let saveFn: () => void = () => {};
const ARROWS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' };
/** the name of a key press: Ctrl+Shift+P, Alt+←, F5, P */
export function keyName(e: KeyboardEvent): string {
  let k = e.key; if (k === ' ') k = 'Space';
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return '';
  k = ARROWS[k] || (k.length === 1 ? k.toUpperCase() : k);
  const shiftMatters = !(k.length === 1 && !/[A-Z]/.test(k)); // "?" already includes Shift
  return [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && shiftMatters ? 'Shift' : '', k].filter(Boolean).join('+');
}
export function initKeys(list: Action[], saved: Record<string, string>, save: (k: Record<string, string>) => void): void { actions = list; custom = { ...saved }; saveFn = () => save(custom); }
export const keyOf = (id: string): string => custom[id] ?? actions.find(a => a.id === id)?.def ?? '';
/** run the action bound to this key press (true when one was found) */
export function runKey(e: KeyboardEvent): boolean {
  const n = keyName(e); if (!n) return false;
  const a = actions.find(x => keyOf(x.id) === n); if (!a) return false;
  const r = a.run(e); if (r === false) return false;
  e.preventDefault(); return true;
}
export async function keysDialog(): Promise<void> {
  const groups = [...new Set(actions.map(a => a.group))];
  const row = (a: Action) => `<tr data-k="${a.id}"><td>${esc(a.label)}</td><td><button class="kbtn" data-kb="${a.id}" title="Click, then press the new key">${esc(keyOf(a.id)) || '—'}</button>${custom[a.id] != null ? ` <button class="ib kreset" data-kr="${a.id}" title="Back to ${esc(a.def)}">↺</button>` : ''}</td></tr>`;
  const body = () => groups.map(g => `<h5>${esc(g)}</h5><table class="keys">${actions.filter(a => a.group === g).map(row).join('')}</table>`).join('');
  await dialog('Keyboard shortcuts', `<p class="small">Click a key to change it, then press the new key (Esc: no key). Typing a number goes to that verse (with Shift: that chapter); a Bible's own switches use their letters.</p><div class="klist">${body()}</div>`,
    [{ label: 'All back to normal', value: 'reset' }, { label: 'Close', value: 'ok', primary: true }], b => {
      const redraw = () => { b.querySelector('.klist')!.innerHTML = body(); };
      b.addEventListener('click', ev => {
        const r = (ev.target as HTMLElement).closest<HTMLElement>('[data-kr]'); if (r) { delete custom[r.dataset.kr!]; saveFn(); redraw(); return; }
        const kb = (ev.target as HTMLElement).closest<HTMLElement>('[data-kb]'); if (!kb) return;
        kb.textContent = 'press a key…'; kb.classList.add('wait');
        const grab = (ke: KeyboardEvent) => {
          ke.preventDefault(); ke.stopPropagation(); const n = ke.key === 'Escape' ? '' : keyName(ke); if (n === '' && ke.key !== 'Escape') return;
          document.removeEventListener('keydown', grab, true);
          const id = kb.dataset.kb!; const other = actions.find(a => a.id !== id && n && keyOf(a.id) === n);
          if (other) { custom[other.id] = ''; flash(`${n} was used for “${other.label}”; that now has no key`); }
          custom[id] = n; saveFn(); redraw();
        };
        document.addEventListener('keydown', grab, true);
      });
    }).then(r => { if (r === 'reset') { custom = {}; saveFn(); flash('All shortcuts are back to normal'); } });
}
