// Reading plans (same plan logic and data as the Electron version: src/legacy/plans.js).
import canon from './legacy/canon.js';
import plans from './legacy/plans.js';
import { ud, saveUD } from './study';
import { dialog, esc, flash } from './ui';
import { Bible } from './bibles';

interface Reading { b: number; c1: number; c2: number }
interface Session { date?: string; done?: boolean; readings: Reading[] }
interface Plan { id: string; name: string; sessions: Session[] }
export interface PlanHost { openBibles(): Bible[]; go(b: number, c: number, v?: number): Promise<void>; rerender(): void }

const AP_CH: Record<number, number> = { 67: 14, 68: 16, 69: 16, 70: 19, 71: 51, 72: 5, 73: 1, 74: 1, 75: 1, 76: 1, 77: 16, 78: 15, 79: 9, 80: 1, 83: 16 };
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const passLabel = (p: Reading) => `${canon.book(p.b, '1611').name} ${p.c1}${p.c2 > p.c1 ? '–' + p.c2 : ''}`;

export async function renderPlans(body: HTMLElement, H: PlanHost, again: () => void): Promise<void> {
  const list = (ud.plans || (ud.plans = [])) as Plan[]; const today = todayIso(); const d = new Date();
  const due: { p: Plan; s: Session }[] = [];
  for (const p of list) {
    const next = p.sessions.find(s => !s.done);
    const todays = p.sessions.filter(s => s.date ? s.date <= today && !s.done : false);
    for (const s of p.sessions[0]?.date ? todays : (next ? [next] : [])) due.push({ p, s });
  }
  let html = `<div class="phead">Today, ${esc(d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>`;
  html += due.length ? `<ul class="vlist">${due.map(({ p, s }) => `<li><label><input type="checkbox" data-done="${p.id}|${p.sessions.indexOf(s)}"> <b>${esc(p.name)}</b>${s.date && s.date < today ? ` <span class="late">(${esc(s.date)})</span>` : ''}</label><div>${s.readings.map(r => `<a data-read="${r.b}.${r.c1}">${esc(passLabel(r))}</a>`).join(' · ')}</div></li>`).join('')}</ul>` : '<p class="hint">No readings due today.</p>';
  html += '<div class="phead">Your reading plans</div>';
  html += list.map(p => {
    const done = p.sessions.filter(s => s.done).length; const pct = Math.round(100 * done / Math.max(1, p.sessions.length)); const last = p.sessions[p.sessions.length - 1];
    return `<div class="plan" data-p="${esc(p.id)}"><div class="srow"><b>${esc(p.name)}</b><span class="grow"></span><span class="small">${done}/${p.sessions.length} · ${pct}%</span></div><div class="bar"><span style="width:${pct}%"></span></div>
      <div class="small">${last && last.date ? 'Ends ' + esc(last.date) : 'Not tied to dates'}</div>
      <div class="srow"><button data-act="list">Schedule</button>${p.sessions[0]?.date ? '<button data-act="catch" title="Move unread readings forward so the next one is today">Catch up</button>' : ''}<button data-act="restart">Restart</button><button data-act="del">Delete</button></div><div class="sched hidden"></div></div>`;
  }).join('') || '<p class="hint">No plans yet.</p>';
  html += '<div class="srow"><button id="newPlan" class="primary">New reading plan…</button></div>';
  body.innerHTML = html;
  body.onclick = async e => {
    const t = e.target as HTMLElement;
    const rd = t.closest<HTMLElement>('[data-read]'); if (rd) { const [b, c] = rd.dataset.read!.split('.').map(Number); return void H.go(b, c, 1); }
    if (t.id === 'newPlan') return void newPlan(H, again);
    const pl = t.closest<HTMLElement>('.plan'), act = t.closest<HTMLElement>('[data-act]'); if (!pl || !act) return;
    const i = list.findIndex(x => x.id === pl.dataset.p); const p = list[i];
    const a = act.dataset.act;
    if (a === 'del') { if (await dialog('Delete plan', `<p>Delete <b>${esc(p.name)}</b> and its progress?</p>`, [{ label: 'Cancel', value: null }, { label: 'Delete', value: 'ok', primary: true }]) === 'ok') { list.splice(i, 1); saveUD(); again(); } return; }
    if (a === 'catch') { list[i] = plans.catchUp(p); saveUD(); return again(); }
    if (a === 'restart') { if (await dialog('Restart plan', '<p>Mark every reading as unread and start again from today?</p>', [{ label: 'Cancel', value: null }, { label: 'Restart', value: 'ok', primary: true }]) === 'ok') { list[i] = plans.restart(p); saveUD(); again(); } return; }
    if (a === 'list') {
      const box = pl.querySelector<HTMLElement>('.sched')!; box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) box.innerHTML = `<ol class="schedlist">${p.sessions.map((s, k) => `<li class="${s.done ? 'done' : ''}${s.date === today ? ' today' : ''}"><label><input type="checkbox" data-done="${esc(p.id)}|${k}"${s.done ? ' checked' : ''}> ${s.date ? esc(s.date) : 'Session ' + (k + 1)}</label> ${s.readings.map(r => `<a data-read="${r.b}.${r.c1}">${esc(passLabel(r))}</a>`).join(' · ')}</li>`).join('')}</ol>`;
      (box.querySelector('li.today') || box.querySelector('li:not(.done)'))?.scrollIntoView({ block: 'nearest' });
    }
  };
  body.onchange = e => {
    const cb = (e.target as HTMLElement).closest<HTMLInputElement>('[data-done]'); if (!cb) return;
    const [pid, k] = cb.dataset.done!.split('|'); const p = list.find(x => x.id === pid); if (!p) return;
    p.sessions[+k].done = cb.checked; saveUD();
    if (!cb.closest('.sched')) setTimeout(again, 300);
  };
}

async function newPlan(H: PlanHost, again: () => void): Promise<void> {
  const presets = Object.entries(plans.PRESETS as Record<string, { label: string; groups: string[] }>).map(([id, p]) => ({ id, ...p })); const t = todayIso();
  let form: HTMLElement | null = null;
  const html = `<label class="fl">Name <input id="plName" class="txt" value="Bible reading"></label><label class="fl">Start <input id="plStart" class="txt" type="date" value="${t}"></label>
    <label class="fl">Read <select id="plPreset">${presets.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}<option value="custom">Choose books…</option></select></label>
    <label class="fl hidden" id="plCustomBox">Books (one line per part read side by side; e.g. Gen-Mal, Matt-Rev)<textarea id="plCustom" rows="3" class="txt">Gen-Mal\nMatt-Rev</textarea></label>
    <div class="fl">On these days<div class="srow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => `<label><input type="checkbox" data-day="${i}" checked> ${n}</label>`).join('')}</div></div>
    <div class="fl">How much
      <label><input type="radio" name="plMode" value="days" checked> Finish in <input id="plDays" type="number" value="365" min="1" class="num"> reading days</label>
      <label><input type="radio" name="plMode" value="until"> Finish by <input id="plUntil" type="date" value="${(+t.slice(0, 4) + 1) + t.slice(4)}"></label>
      <label><input type="radio" name="plMode" value="perSession"> Read <input id="plPer" type="number" value="3" min="1" class="num"> chapters each time</label>
      <label><input type="checkbox" id="plNoCal"> Don't tie the plan to dates</label>
      <label><input type="checkbox" id="plCycle"> Repeat shorter parts so every day has something from each</label></div>`;
  const r = await dialog('New reading plan', html, [{ label: 'Cancel', value: null }, { label: 'Create plan', value: 'ok', primary: true }], b => {
    form = b; b.querySelector<HTMLSelectElement>('#plPreset')!.onchange = () => b.querySelector('#plCustomBox')!.classList.toggle('hidden', b.querySelector<HTMLSelectElement>('#plPreset')!.value !== 'custom');
    // keep a copy of the values: the dialog is removed when it closes
    b.addEventListener('input', () => { (b as unknown as { _v: unknown })._v = read(b); }); (b as unknown as { _v: unknown })._v = read(b);
  });
  if (r !== 'ok' || !form) return;
  const o = (form as unknown as { _v: Record<string, unknown> })._v;
  const preset = presets.find(x => x.id === o.preset);
  const opts = { ...o, groups: preset ? preset.groups : String(o.custom).split('\n').map(x => x.trim()).filter(Boolean) };
  const counts = (b: number) => Math.max(0, ...H.openBibles().map(m => m.books.get(b)?.filter(n => n > 0).length || 0)) || canon.kjvChapters(b).length || AP_CH[b] || 0;
  try { const plan = plans.create(opts, counts); (ud.plans as Plan[]).push(plan); saveUD(); flash(`Plan created: ${plan.sessions.length} readings`); again(); }
  catch (e) { flash('Could not create the plan: ' + (e as Error).message); }
}
function read(b: HTMLElement): Record<string, unknown> {
  const v = (id: string) => b.querySelector<HTMLInputElement>('#' + id)!;
  return { name: v('plName').value || 'Bible reading', start: v('plStart').value || todayIso(), preset: b.querySelector<HTMLSelectElement>('#plPreset')!.value, custom: b.querySelector<HTMLTextAreaElement>('#plCustom')!.value,
    days: [...b.querySelectorAll<HTMLInputElement>('[data-day]')].filter(x => x.checked).map(x => +x.dataset.day!), mode: b.querySelector<HTMLInputElement>('input[name="plMode"]:checked')!.value,
    sessions: +v('plDays').value, until: v('plUntil').value, perSession: +v('plPer').value, noCalendar: v('plNoCal').checked, cycle: v('plCycle').checked };
}
