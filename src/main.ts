// Tanglaw (Tauri) – proof of concept: open theWord / e-Sword Bibles, read a chapter side by side,
// Strong's popups from your dictionaries, the eight skins; desktop and phone layouts from one code base.
import canon from './legacy/canon.js';
import TWRender from './legacy/render.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { Bible, Locked, isBibleFile, isLocked, openBible } from './bibles';
import { Dict, openDicts } from './dict';
import { importBytes, loadSettings, modulesDir, saveSettings, scan } from './native';
import { SKINS, applySkin } from './skins';

interface Settings { folders: string[]; open: string[]; ref: { b: number; c: number }; skin: string; show: Record<string, boolean>; fontSize: number }
const DEFAULT: Settings = { folders: [], open: [], ref: { b: 43, c: 3 }, skin: 'parchment', show: { strongs: false, morph: false, footnotes: true, headings: true, woj: true, added: true }, fontSize: 18 };

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isPhone = () => window.matchMedia('(max-width: 720px)').matches;
const isAndroid = /Android/i.test(navigator.userAgent);

let S: Settings = DEFAULT;
let bibles: Bible[] = [];
let locked: Locked[] = [];
let dicts: Dict[] = [];
let nav: { id: number; name: string; abbr: string; grp: string; chapters: number[] }[] = [];
let ownDir = '';

const save = () => saveSettings(S).catch(() => {});

/* ---------------------------------------------------------------- modules */
async function loadModules(): Promise<void> {
  const t0 = performance.now();
  const files = await scan([ownDir, ...S.folders]);
  const seen = new Set<string>();
  const bfiles = files.filter(f => isBibleFile(f.name) && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase()));
  const opened = await Promise.all(bfiles.map(openBible));
  bibles = opened.filter((m): m is Bible => !isLocked(m)).sort((a, b) => a.abbr.localeCompare(b.abbr));
  locked = opened.filter(isLocked);
  dicts = await openDicts(files);
  S.open = S.open.filter(id => bibles.some(b => b.id === id));
  if (!S.open.length && bibles.length) S.open = [(bibles.find(b => /kjv/i.test(b.abbr)) || bibles[0]).id];
  buildNav();
  $('#status').textContent = `${bibles.length} Bible${bibles.length === 1 ? '' : 's'} · ${dicts.length} Strong's dictionar${dicts.length === 1 ? 'y' : 'ies'}${locked.length ? ` · ${locked.length} could not be opened` : ''} · ${Math.round(performance.now() - t0)} ms`;
  $('#empty').classList.toggle('hidden', bibles.length > 0);
}

function openBibles(): Bible[] { return S.open.map(id => bibles.find(b => b.id === id)).filter((b): b is Bible => !!b); }

function buildNav(): void {
  const all = new Map<number, Set<number>>();
  for (const bb of openBibles()) for (const [b, ch] of bb.books) { const s = all.get(b) || new Set(); ch.forEach((n, i) => { if (n > 0) s.add(i + 1); }); all.set(b, s); }
  nav = [...all.keys()].sort((a, b) => canon.orderKey(a, '1611') - canon.orderKey(b, '1611')).map(id => {
    const bk = canon.book(id, '1611');
    return { id, name: bk.name, abbr: bk.abbr, grp: bk.grp, chapters: [...all.get(id)!].sort((a, b) => a - b) };
  });
  const sel = $<HTMLSelectElement>('#bookSel'); sel.innerHTML = '';
  let og: HTMLOptGroupElement | null = null, last = '';
  const label: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha (1611 KJV)', APX: 'Other books', NT: 'New Testament' };
  for (const b of nav) {
    if (b.grp !== last) { og = document.createElement('optgroup'); og.label = label[b.grp] || b.grp; sel.appendChild(og); last = b.grp; }
    const o = document.createElement('option'); o.value = String(b.id); o.textContent = b.name; og!.appendChild(o);
  }
}

/* ---------------------------------------------------------------- reading */
let seq = 0;
async function go(b: number, c: number): Promise<void> {
  const bk = nav.find(x => x.id === b) || nav[0];
  if (!bk) { $('#view').innerHTML = ''; return; }
  if (!bk.chapters.includes(c)) c = bk.chapters[0];
  S.ref = { b: bk.id, c }; save();
  $<HTMLSelectElement>('#bookSel').value = String(bk.id);
  const cs = $<HTMLSelectElement>('#chapSel'); cs.innerHTML = bk.chapters.map(n => `<option>${n}</option>`).join(''); cs.value = String(c);
  $('#refBtn').textContent = `${bk.name} ${c}`; $('#capRef').textContent = `${bk.name} ${c}`;
  const my = ++seq; const t0 = performance.now();
  const list = openBibles();
  const chapters = await Promise.all(list.map(m => m.chapter(bk.id, c)));
  if (my !== seq) return;
  const vmax = Math.max(0, ...chapters.map(ch => ch.length ? ch[ch.length - 1].v : 0));
  const show = S.show;
  const cell = (m: Bible, raw: string | undefined) => raw == null ? '' : TWRender.render(raw, m, show, { fn: { n: 0 } });
  const font = (m: Bible) => m.font ? ` style="font-family:'TwGreek','${esc(m.font)}',var(--font-text)"` : '';
  let html = '';
  if (isPhone() || list.length === 1) {
    html = '<div class="rows">';
    for (let v = 1; v <= vmax; v++) {
      html += `<div class="vrow" data-v="${v}"><span class="vn">${v}</span><div class="vtexts">`;
      list.forEach((m, i) => { const r = chapters[i].find(x => x.v === v); if (r) html += `<div class="vt${m.rtl ? ' rtl' : ''}"${font(m)}>${list.length > 1 ? `<span class="ab">${esc(m.abbr)}</span>` : ''}${cell(m, r.raw)}</div>`; });
      html += '</div></div>';
    }
    html += '</div>';
  } else {
    html = `<table class="chap"><thead><tr><th class="vn"></th>${list.map(m => `<th title="${esc(m.title)}">${esc(m.abbr)}</th>`).join('')}</tr></thead><tbody>`;
    for (let v = 1; v <= vmax; v++) {
      html += `<tr data-v="${v}"><td class="vn">${v}</td>`;
      list.forEach((m, i) => { const r = chapters[i].find(x => x.v === v); html += `<td class="${m.rtl ? 'rtl' : ''}"${font(m)}>${cell(m, r?.raw)}</td>`; });
      html += '</tr>';
    }
    html += '</tbody></table>';
  }
  const view = $('#view'); view.innerHTML = html; view.scrollTop = 0;
  $('#timing').textContent = `${Math.round(performance.now() - t0)} ms`;
}
function step(d: number): void {
  const i = nav.findIndex(x => x.id === S.ref.b); if (i < 0) return;
  const bk = nav[i]; const j = bk.chapters.indexOf(S.ref.c) + d;
  if (j >= 0 && j < bk.chapters.length) return void go(bk.id, bk.chapters[j]);
  const nb = nav[i + d]; if (nb) go(nb.id, d > 0 ? nb.chapters[0] : nb.chapters[nb.chapters.length - 1]);
}

/* ---------------------------------------------------------------- Strong's popup / sheet */
async function lookup(keys: string[]): Promise<string> {
  const parts: string[] = [];
  for (const k of keys) {
    const want = k[0].toUpperCase() === 'H' ? 'hebrew' : 'greek';
    const order = [...dicts].sort((a, b) => Number(b[want]) - Number(a[want]));
    let hit: { subject: string; html: string } | null = null; let src = '';
    for (const d of order) { hit = await d.lookup(k); if (hit) { src = d.title; break; } }
    parts.push(hit ? `<div class="entry"><h4>${esc(hit.subject)}</h4><div class="src">${esc(src)}</div>${clean(hit.html)}</div>` : `<div class="entry"><h4>${esc(k)}</h4><div class="src">${dicts.length ? 'Not in your Strong\'s dictionaries' : 'No Strong\'s dictionary yet – import one'}</div></div>`);
  }
  return parts.join('');
}
function clean(html: string): string {
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('script,style,iframe,object,embed').forEach(n => n.remove());
  t.content.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || a.name === 'href') n.removeAttribute(a.name); });
  return t.innerHTML;
}
async function showWord(el: HTMLElement): Promise<void> {
  const keys = (el.dataset.strong || '').split(/\s+/).filter(Boolean);
  let html = '';
  if (el.matches('sup.fn')) html = `<div class="entry"><div class="src">Footnote</div>${TWRender.render(el.dataset.note || '', { rules: [] }, { ...S.show, footnotes: false })}</div>`;
  else if (keys.length) html = await lookup(keys);
  if (!html) return;
  if (isPhone()) { $('#sheetBody').innerHTML = html; $('#sheet').classList.add('open'); return; }
  const p = $('#popup'); p.innerHTML = html; p.classList.remove('hidden');
  const r = el.getBoundingClientRect(); const W = innerWidth, H = innerHeight;
  const x = Math.min(Math.max(8, r.left), W - p.offsetWidth - 8); let y = r.bottom + 6;
  if (y + p.offsetHeight > H - 8) y = Math.max(8, r.top - p.offsetHeight - 6);
  p.style.left = x + 'px'; p.style.top = y + 'px';
}

/* ---------------------------------------------------------------- menus & pickers */
function bibleMenu(): void {
  const m = $('#bibleMenu');
  m.innerHTML = `<div class="mh">Bibles <span class="small">(tick to read side by side)</span></div>` +
    bibles.map(b => `<label><input type="checkbox" data-id="${esc(b.id)}" ${S.open.includes(b.id) ? 'checked' : ''}><b>${esc(b.abbr)}</b><span class="small">${esc(b.title)}</span><span class="fmt">${b.format}</span></label>`).join('') +
    (locked.length ? `<div class="mh">Cannot be opened</div>` + locked.map(l => `<div class="lk">${esc(l.title)} – ${esc(l.reason)}</div>`).join('') : '') +
    `<div class="msep"></div><button id="mImport">Import modules…</button>${isAndroid ? '' : '<button id="mFolder">Read modules from a folder…</button>'}` +
    (S.folders.length ? `<div class="small fl">${S.folders.map(esc).join('<br>')}</div>` : '');
  m.querySelectorAll<HTMLInputElement>('input[data-id]').forEach(cb => cb.onchange = () => {
    const id = cb.dataset.id!; S.open = cb.checked ? [...S.open, id] : S.open.filter(x => x !== id);
    save(); buildNav(); go(S.ref.b, S.ref.c);
  });
  ($('#mImport') as HTMLButtonElement).onclick = importModules;
  const mf = document.querySelector<HTMLButtonElement>('#mFolder'); if (mf) mf.onclick = addFolder;
}
function skinMenu(): void {
  $('#skinMenu').innerHTML = '<div class="mh">Skin</div>' + Object.entries(SKINS).map(([id, s]) =>
    `<button data-skin="${id}" class="${S.skin === id ? 'on' : ''}"><span class="sw" style="background:linear-gradient(135deg, ${s.v.textbg} 0 50%, ${s.v['cap-bible']} 50%)"></span>${s.name}</button>`).join('') +
    '<div class="msep"></div><div class="mh">Show</div>' + [['strongs', "Strong's numbers"], ['morph', 'Morphology'], ['footnotes', 'Footnotes'], ['headings', 'Headings'], ['woj', 'Words of Jesus in red'], ['added', 'Added words in italics']]
      .map(([k, l]) => `<label><input type="checkbox" data-show="${k}" ${S.show[k] ? 'checked' : ''}> ${l}</label>`).join('') +
    `<div class="msep"></div><div class="mrow">Text size <button data-fs="-1">A−</button><button data-fs="1">A+</button></div>`;
  $('#skinMenu').querySelectorAll<HTMLButtonElement>('[data-skin]').forEach(b => b.onclick = () => { S.skin = b.dataset.skin!; applySkin(S.skin); save(); skinMenu(); });
  $('#skinMenu').querySelectorAll<HTMLInputElement>('[data-show]').forEach(cb => cb.onchange = () => { S.show[cb.dataset.show!] = cb.checked; save(); go(S.ref.b, S.ref.c); });
  $('#skinMenu').querySelectorAll<HTMLButtonElement>('[data-fs]').forEach(b => b.onclick = () => { S.fontSize = Math.max(12, Math.min(34, S.fontSize + +b.dataset.fs!)); document.documentElement.style.setProperty('--size', S.fontSize + 'px'); save(); });
}
function toggleMenu(id: string, fill: () => void): void {
  const m = $(id); const was = !m.classList.contains('hidden');
  document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden'));
  if (!was) { fill(); m.classList.remove('hidden'); }
}
/** book → chapter picker (the way to move around on a phone) */
function picker(): void {
  const body = $('#sheetBody');
  const books = (grp: string) => nav.filter(b => b.grp === grp).map(b => `<button data-b="${b.id}" class="${b.id === S.ref.b ? 'on' : ''}">${esc(b.abbr)}</button>`).join('');
  const label: Record<string, string> = { OT: 'Old Testament', AP: 'Apocrypha', APX: 'Other books', NT: 'New Testament' };
  body.innerHTML = `<div class="pk">${['OT', 'AP', 'APX', 'NT'].filter(g => nav.some(b => b.grp === g)).map(g => `<h5>${label[g]}</h5><div class="pgrid">${books(g)}</div>`).join('')}</div>`;
  body.querySelectorAll<HTMLButtonElement>('[data-b]').forEach(btn => btn.onclick = () => {
    const bk = nav.find(x => x.id === +btn.dataset.b!)!;
    body.innerHTML = `<div class="pk"><h5>${esc(bk.name)}</h5><div class="pgrid ch">${bk.chapters.map(c => `<button data-c="${c}">${c}</button>`).join('')}</div></div>`;
    body.querySelectorAll<HTMLButtonElement>('[data-c]').forEach(cb => cb.onclick = () => { $('#sheet').classList.remove('open'); go(bk.id, +cb.dataset.c!); });
  });
  $('#sheet').classList.add('open');
}

async function importModules(): Promise<void> {
  const picked = await openDialog({ multiple: true, title: 'Import theWord or e-Sword modules' });
  const list = !picked ? [] : Array.isArray(picked) ? picked : [picked];
  for (const p of list) {
    const path = String(p); const name = decodeURIComponent(path.split(/[\\/]/).pop() || 'module').replace(/^.*%2F/, '');
    const data = await readFile(path);
    let bin = ''; for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
    await importBytes(name, btoa(bin));
  }
  if (list.length) { await loadModules(); go(S.ref.b, S.ref.c); toggleMenu('#bibleMenu', bibleMenu); }
}
async function addFolder(): Promise<void> {
  const d = await openDialog({ directory: true, title: 'Choose a folder with theWord or e-Sword modules' });
  if (!d || S.folders.includes(String(d))) return;
  S.folders.push(String(d)); save(); await loadModules(); go(S.ref.b, S.ref.c); bibleMenu();
}

/* ---------------------------------------------------------------- start */
async function init(): Promise<void> {
  S = Object.assign({}, DEFAULT, await loadSettings().catch(() => ({})) as Partial<Settings>);
  S.show = Object.assign({}, DEFAULT.show, S.show);
  applySkin(S.skin);
  document.documentElement.style.setProperty('--size', S.fontSize + 'px');
  document.body.classList.toggle('android', isAndroid);
  ownDir = await modulesDir();
  const win = getCurrentWindow();
  $('#wMin').onclick = () => win.minimize(); $('#wMax').onclick = () => win.toggleMaximize(); $('#wClose').onclick = () => win.close();
  $('#bookSel').onchange = () => go(+$<HTMLSelectElement>('#bookSel').value, 1);
  $('#chapSel').onchange = () => go(S.ref.b, +$<HTMLSelectElement>('#chapSel').value);
  $('#prev').onclick = $('#pPrev').onclick = () => step(-1);
  $('#next').onclick = $('#pNext').onclick = () => step(1);
  $('#refBtn').onclick = picker;
  $('#biblesBtn').onclick = e => { e.stopPropagation(); toggleMenu('#bibleMenu', bibleMenu); };
  $('#skinBtn').onclick = e => { e.stopPropagation(); toggleMenu('#skinMenu', skinMenu); };
  $('#emptyImport').onclick = importModules;
  document.addEventListener('mousedown', e => { if (!(e.target as HTMLElement).closest('.menu, .tbtn')) document.querySelectorAll('.menu').forEach(x => x.classList.add('hidden')); if (!(e.target as HTMLElement).closest('#popup, [data-strong], sup.fn')) $('#popup').classList.add('hidden'); });
  $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet') || (e.target as HTMLElement).closest('.grab')) $('#sheet').classList.remove('open'); });
  // words: hover (mouse) or tap (touch)
  let timer = 0;
  $('#view').addEventListener('mouseover', e => {
    if (isPhone()) return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], sup.fn'); clearTimeout(timer);
    if (t) timer = window.setTimeout(() => showWord(t), 300);
  });
  $('#view').addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-strong], sup.fn'); if (t) showWord(t); });
  document.addEventListener('keydown', e => {
    if ((e.target as HTMLElement).matches('input, select, textarea')) return;
    if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1);
    if (e.key === 'Escape') { $('#popup').classList.add('hidden'); $('#sheet').classList.remove('open'); }
  });
  // swipe left/right on a phone
  let sx = 0, sy = 0;
  $('#view').addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  $('#view').addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; if (Math.abs(dx) > 80 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1); });
  let last = isPhone(); window.addEventListener('resize', () => { if (isPhone() !== last) { last = isPhone(); go(S.ref.b, S.ref.c); } });
  await loadModules();
  await go(S.ref.b, S.ref.c);
  (window as unknown as Record<string, unknown>).__tanglaw = { setOpen: (ids: string[]) => { S.open = ids; buildNav(); }, go, step, S: () => S, bibles: () => bibles, dicts: () => dicts, showWord, picker };
}
init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${esc((e as Error).stack || e)}</pre>`); });
