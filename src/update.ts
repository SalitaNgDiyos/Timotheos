// New versions: Tanglaw asks GitHub (the project's own releases page) whether a newer version is out, at most
// once a day when it starts (Options… can switch this off), or when you ask in Tools. It never downloads or
// installs anything by itself: it shows what is new and opens the download page in your browser.
import { getVersion } from '@tauri-apps/api/app';
import { openUrl } from '@tauri-apps/plugin-opener';
import { dialog, esc, flash } from './ui';

const REPO = 'SalitaNgDiyos/Timotheos';
const RELEASES = `https://github.com/${REPO}/releases`;
interface UpdSettings { updates?: { auto?: boolean; last?: number; skip?: string } }
let S: UpdSettings; let save: () => void = () => {};
export function initUpdate(settings: unknown, saveFn: () => void, autoCheck = true): void {
  S = settings as UpdSettings; save = saveFn; S.updates = S.updates || {};
  if (autoCheck && S.updates.auto !== false && Date.now() - (S.updates.last || 0) > 20 * 3600e3) setTimeout(() => checkUpdate(false), 8000);
}
export const autoUpdates = () => S.updates?.auto !== false;
export function setAutoUpdates(on: boolean): void { S.updates = { ...(S.updates || {}), auto: on }; save(); }
/** 1.2.10 > 1.2.9; "v" and "-beta" parts ignored for the numbers */
export function newer(a: string, b: string): boolean {
  const p = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0);
  const x = p(a), y = p(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false;
}
export async function checkUpdate(asked: boolean): Promise<void> {
  let mine = '0'; try { mine = await getVersion(); } catch { /* */ }
  let rel: { tag_name: string; name: string; body: string; html_url: string; published_at: string } | null = null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (r.status === 404) { if (asked) flash('No release has been published yet'); S.updates!.last = Date.now(); save(); return; }
    if (!r.ok) throw new Error('GitHub answered ' + r.status);
    rel = await r.json();
  } catch (e) { if (asked) flash('Could not reach GitHub (no internet?): ' + String((e as Error).message || e)); return; }
  S.updates!.last = Date.now(); save();
  if (!rel || !newer(rel.tag_name, mine)) { if (asked) flash(`Tanglaw ${mine} is the newest version`); return; }
  if (!asked && S.updates!.skip === rel.tag_name) return;
  const notes = (rel.body || '').replace(/\r/g, '').split('\n').slice(0, 30).map(l => esc(l)).join('<br>');
  const r = await dialog('A new version of Tanglaw', `<p><b>${esc(rel.name || rel.tag_name)}</b> is out (you have ${esc(mine)}).</p><div class="updnotes small">${notes}</div><p class="small">The download page opens in your browser; install the new version over this one – your settings, notes and modules stay.</p>`,
    [{ label: 'Not this version', value: 'skip' }, { label: 'Later', value: null }, { label: 'Open the download page', value: 'ok', primary: true }]);
  if (r === 'ok') { try { await openUrl(rel.html_url || RELEASES); } catch { flash('Open ' + RELEASES + ' in your browser'); } }
  if (r === 'skip') { S.updates!.skip = rel.tag_name; save(); }
}
