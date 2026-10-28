// Your own modules (theWord: user modules): commentaries, dictionaries and books you write yourself.
// They are ordinary theWord .twm files (marked user=1) in Tanglaw's modules folder, so theWord can open them too.
// Edit in the Library: ✎ Edit, + New topic / comment, Rename, Delete; while editing: bold, italic, underline,
// superscript, heading, list, a link to a Bible verse, a section link (theWord "topic links").
import { invoke } from '@tauri-apps/api/core';
import canon from './legacy/canon.js';
import type { BookMod, Topic } from './books';
import { htmlToRtf } from './export';
import { dialog, esc, flash } from './ui';

export interface UserHost {
  books(): BookMod[]; ref(): { b: number; c: number; v: number };
  /** read the module again after a change (returns the new one) and show a topic of it in the Library */
  reopen(file: string, tid?: Topic['id'] | null): Promise<void>;
  /** a new module file was made: read the modules again and open it */
  added(file: string): Promise<void>;
}
let H: UserHost;
type Stmt = [string, (string | number | null)[]];
const exec = (path: string, statements: Stmt[]) => invoke<void>('umod_exec', { path, statements });
const q = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;

/* ---------------------------------------------------------------- a new module */
const KINDS: Record<string, { type: string; ext: string; label: string }> = {
  commentary: { type: '2', ext: 'cmt', label: 'Commentary – notes on verses, chapters and books' },
  dictionary: { type: '1', ext: 'dct', label: 'Dictionary – one level of topics (words, names, subjects)' },
  book: { type: '3', ext: 'gbk', label: 'Book – topics within topics, like chapters and sections' },
};
export async function newUserModule(preset?: 'verse' | 'subject'): Promise<void> {
  let kind = preset === 'verse' ? 'commentary' : 'book', title = preset === 'verse' ? 'My Verse Notes' : preset === 'subject' ? 'My Subject Notes' : '', abbr = '', lang = 'eng';
  const r = await dialog('New module of your own', `<p class="small">Write your own commentary, dictionary or book. It is saved as a theWord module (.twm) in Tanglaw's modules folder, so theWord can open it as well.</p>
    <label class="fl">Kind <select id="umK">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <label class="fl">Title <input id="umT" class="txt" value="${esc(title)}" placeholder="e.g. My Sermon Notes"></label>
    <label class="fl">Abbreviation <input id="umA" class="txt" maxlength="12" placeholder="e.g. MSN"></label>
    <label class="fl">Language <select id="umL"><option value="eng">English</option><option value="tgl">Tagalog</option><option value="ceb">Cebuano</option><option value="ilo">Ilocano</option><option value="grc">Greek</option><option value="heb">Hebrew</option></select></label>`,
    [{ label: 'Cancel', value: null }, { label: 'Make it', value: 'ok', primary: true }], b => {
      q<HTMLSelectElement>('#umK', b).onchange = e => { kind = (e.target as HTMLSelectElement).value; };
      q<HTMLInputElement>('#umT', b).oninput = e => { title = (e.target as HTMLInputElement).value; };
      q<HTMLInputElement>('#umA', b).oninput = e => { abbr = (e.target as HTMLInputElement).value; };
      q<HTMLSelectElement>('#umL', b).onchange = e => { lang = (e.target as HTMLSelectElement).value; };
      q<HTMLInputElement>('#umT', b).focus();
    });
  if (r !== 'ok') return;
  title = title.trim(); if (!title) return flash('Give the module a title');
  abbr = (abbr.trim() || title.split(/\s+/).map(w => w[0]).join('').toUpperCase()).slice(0, 12);
  const k = KINDS[kind]; const today = new Date().toISOString().slice(0, 10);
  const id = 'u' + abbr.toLowerCase().replace(/[^a-z0-9]/g, '') + Date.now().toString(36).slice(-5);
  const cfg: [string, string][] = [['type', k.type], ['id', id], ['title', title], ['abbrev', abbr], ['description', `${title} (written in Tanglaw Bible)`], ['about', ''], ['content.type', 'rtf'], ['user', '1'], ['schema.version', '1'],
    ['version.major', '1'], ['version.minor', '0'], ['version.date', today], ['requires', '4.0.0.0'], ['lang', lang], ['r2l', '0'], ['creator', 'Tanglaw Bible']];
  const st: Stmt[] = [
    ['create table config(name text, value text)', []],
    ['create table topics(id integer primary key, pid integer, subject text, rel_order integer default 1, content_type text)', []],
    ['create table content(topic_id integer primary key, data text, data2 blob)', []],
    ...cfg.map(([n, v]): Stmt => ['insert into config(name, value) values(?, ?)', [n, v]]),
  ];
  if (kind === 'commentary') st.push(['create table bible_refs(topic_id integer, bi integer, ci integer, fvi integer, tvi integer, content_type text)', []], ['create index idx_bible_refs on bible_refs(bi, ci, fvi)', []]);
  try {
    const file = await invoke<string>('umod_create', { name: `${title}.${k.ext}.twm`, statements: st });
    flash(`“${title}” made`); await H.added(file);
  } catch (e) { flash('Could not make the module: ' + String((e as Error).message || e)); }
}

/* ---------------------------------------------------------------- editing in the Library */
let editing: { mod: BookMod; tid: Topic['id'] } | null = null;
export function initUserMods(host: UserHost): void {
  H = host;
  document.addEventListener('tanglaw-topic', e => { const d = (e as CustomEvent).detail as { mod: string; tid: Topic['id'] | null }; editing = null; bar(d.mod, d.tid); });
}
const modOf = (id: string) => H.books().find(m => m.id === id);
function bar(modId: string, tid: Topic['id'] | null): void {
  const m = modOf(modId); const body = q('#libBody'); q('#ubar', body)?.remove();
  if (!m || !m.user || m.format !== 'theWord') return;
  const cmt = m.kind === 'commentary';
  body.insertAdjacentHTML('afterbegin', `<div id="ubar" class="ubar"><span class="small">Your module</span>
    ${tid != null ? '<button data-u="edit" title="Write in this topic">✎ Edit</button>' : ''}
    <button data-u="new">${cmt ? '+ Comment' : '+ Topic'}</button>
    ${tid != null ? `<button data-u="rename">${cmt ? 'Verses…' : 'Rename'}</button><button data-u="del" class="danger">Delete</button>` : ''}</div>`);
  q('#ubar', body).onclick = ev => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-u]'); if (b) act(b.dataset.u!, m, tid); };
}
async function act(what: string, m: BookMod, tid: Topic['id'] | null): Promise<void> {
  if (what === 'new') return m.kind === 'commentary' ? newComment(m) : newTopic(m, tid);
  if (tid == null) return;
  if (what === 'edit') return startEdit(m, tid);
  if (what === 'rename') return m.kind === 'commentary' ? changeRef(m, tid) : renameTopic(m, tid);
  if (what === 'del') return deleteTopic(m, tid);
}

/* a reference typed by you: "John 3:16", "John 3:16-18", "John 3", "John" */
function parseRefText(t: string): { b: number; c: number; f: number; e: number } | null {
  const m = /^\s*(.+?)\s*(?:(\d+)(?:\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?)?)?\s*$/.exec(t); if (!m) return null;
  const b = canon.findBook(m[1].replace(/\.$/, '')); if (!b) return null;
  const c = m[2] ? +m[2] : 0; const f = m[3] ? +m[3] : 0; const e = m[4] ? +m[4] : f;
  if (c && c > canon.kjvChapters(b).length) return null;
  return { b, c, f, e: Math.max(e, f) };
}
const refLabel = (r: { b: number; c: number; f: number; e: number }) => `${canon.book(r.b).name}${r.c ? ' ' + r.c : ''}${r.f ? ':' + r.f : ''}${r.e > r.f ? '–' + r.e : ''}`;
async function askRef(title: string, start: string): Promise<{ b: number; c: number; f: number; e: number } | null> {
  let txt = start; let ok = parseRefText(start);
  const r = await dialog(title, `<label class="fl">Verse, verses, chapter or book <input id="urRef" class="txt" value="${esc(start)}"></label><div id="urChk" class="small">✓ ${esc(ok ? refLabel(ok) : '')}</div>
    <p class="small">For example <code>John 3:16</code>, <code>John 3:16-18</code>, <code>John 3</code> (the whole chapter) or <code>John</code> (an introduction to the book).</p>`,
    [{ label: 'Cancel', value: null }, { label: 'OK', value: 'ok', primary: true }], b => {
      const i = q<HTMLInputElement>('#urRef', b); i.focus(); i.select();
      i.oninput = () => { txt = i.value; ok = parseRefText(txt); q('#urChk', b).textContent = ok ? '✓ ' + refLabel(ok) : 'Not understood yet'; };
    });
  if (r !== 'ok') return null;
  if (!ok) { flash('Reference not understood: ' + txt); return null; }
  return ok;
}
async function nextId(m: BookMod): Promise<number> {
  const rows = (await invoke<{ rows: unknown[][] }>('sql', { path: m.file, query: 'select max(id) from topics', params: [] })).rows;
  const rows2 = (await invoke<{ rows: unknown[][] }>('sql', { path: m.file, query: 'select max(topic_id) from content', params: [] })).rows;
  return Math.max(Number(rows[0]?.[0] || 0), Number(rows2[0]?.[0] || 0)) + 1;
}
async function newComment(m: BookMod): Promise<void> {
  const { b, c, v } = H.ref();
  const r = await askRef('New comment', `${canon.book(b).name} ${c}:${v}`); if (!r) return;
  const have = m.forVerse(r.b, r.c || 1, r.f || 1);
  if (have && have.subject === refLabel(r)) { flash('There is already a comment on ' + refLabel(r) + ' – it is shown for editing'); await H.reopen(m.file, have.id); editNow(m.file, have.id); return; }
  const id = await nextId(m);
  try {
    await exec(m.file, [['insert into topics(id, pid, subject, rel_order) values(?, 0, ?, ?)', [id, refLabel(r), id]], ['insert into content(topic_id, data) values(?, ?)', [id, htmlToRtf('<p></p>')]],
      ['insert into bible_refs(topic_id, bi, ci, fvi, tvi) values(?, ?, ?, ?, ?)', [id, r.b, r.c, r.f, r.e]]]);
    await H.reopen(m.file, id); editNow(m.file, id);
  } catch (e) { flash('Could not add the comment: ' + String((e as Error).message || e)); }
}
async function changeRef(m: BookMod, tid: Topic['id']): Promise<void> {
  const t = (await m.topics()).find(x => x.id === tid);
  const r = await askRef('Verses of this comment', t?.subject || ''); if (!r) return;
  await exec(m.file, [['update bible_refs set bi = ?, ci = ?, fvi = ?, tvi = ? where topic_id = ?', [r.b, r.c, r.f, r.e, tid as number]], ['update topics set subject = ? where id = ?', [refLabel(r), tid as number]]]);
  await H.reopen(m.file, tid);
}
async function newTopic(m: BookMod, cur: Topic['id'] | null): Promise<void> {
  const book = m.kind !== 'dictionary'; let subject = '', where = 'after';
  const r = await dialog('New topic', `<label class="fl">Title <input id="utS" class="txt" placeholder="${m.kind === 'dictionary' ? 'e.g. Grace (the word looked up)' : 'e.g. Chapter 1'}"></label>
    ${book && cur != null ? '<label class="fl">Where <select id="utW"><option value="after">After the current topic</option><option value="child">Inside the current topic (a sub-topic)</option><option value="end">At the end</option></select></label>' : ''}`,
    [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', primary: true }], b => {
      const i = q<HTMLInputElement>('#utS', b); i.focus(); i.oninput = () => { subject = i.value; };
      const w = q<HTMLSelectElement>('#utW', b); if (w) w.onchange = () => { where = w.value; };
    });
  if (r !== 'ok') return; subject = subject.trim(); if (!subject) return flash('Give the topic a title');
  const list = await m.topics(); const curT = list.find(t => t.id === cur);
  const id = await nextId(m);
  let pid = 0, order = id;
  const relOf = async (tid: Topic['id']) => Number((await invoke<{ rows: unknown[][] }>('sql', { path: m.file, query: 'select rel_order from topics where id = ?', params: [tid as number] })).rows[0]?.[0] || 0);
  const st: Stmt[] = [];
  if (book && curT && where === 'child') { pid = Number(curT.id); order = 1 + Math.max(0, ...await Promise.all(list.filter(t => t.pid === curT.id).map(t => relOf(t.id)))); }
  else if (book && curT && where === 'after') { pid = Number(curT.pid) || 0; order = (await relOf(curT.id)) + 1; st.push(['update topics set rel_order = rel_order + 1 where pid = ? and rel_order >= ?', [pid, order]]); }
  st.push(['insert into topics(id, pid, subject, rel_order) values(?, ?, ?, ?)', [id, pid, subject, order]], ['insert into content(topic_id, data) values(?, ?)', [id, htmlToRtf('<p></p>')]]);
  try { await exec(m.file, st); await H.reopen(m.file, id); editNow(m.file, id); }
  catch (e) { flash('Could not add the topic: ' + String((e as Error).message || e)); }
}
async function renameTopic(m: BookMod, tid: Topic['id']): Promise<void> {
  const t = (await m.topics()).find(x => x.id === tid); let s = t?.subject || '';
  const r = await dialog('Rename topic', `<label class="fl">Title <input id="urn" class="txt" value="${esc(s)}"></label>`, [{ label: 'Cancel', value: null }, { label: 'Rename', value: 'ok', primary: true }], b => { const i = q<HTMLInputElement>('#urn', b); i.focus(); i.select(); i.oninput = () => { s = i.value; }; });
  if (r !== 'ok' || !s.trim()) return;
  await exec(m.file, [['update topics set subject = ? where id = ?', [s.trim(), tid as number]]]); await H.reopen(m.file, tid);
}
async function deleteTopic(m: BookMod, tid: Topic['id']): Promise<void> {
  const list = await m.topics(); const t = list.find(x => x.id === tid);
  const kids = list.filter(x => x.pid === tid).length;
  const r = await dialog('Delete topic', `<p>Delete <b>${esc(t?.subject || String(tid))}</b>${kids ? ` and its ${kids} sub-topic${kids > 1 ? 's' : ''}` : ''}? This cannot be undone.</p>`, [{ label: 'Cancel', value: null }, { label: 'Delete', value: 'ok', danger: true }]);
  if (r !== 'ok') return;
  // the topic, everything under it, and topic links that point to them
  const gone = new Set<Topic['id']>([tid]); let grew = true;
  while (grew) { grew = false; for (const x of list) if (!gone.has(x.id) && gone.has(x.pid)) { gone.add(x.id); grew = true; } }
  const st: Stmt[] = [];
  for (const g of gone) st.push(['delete from topics where id = ?', [g as number]], ['delete from content where topic_id = ?', [g as number]]);
  if (m.kind === 'commentary') for (const g of gone) st.push(['delete from bible_refs where topic_id = ?', [g as number]]);
  for (const g of gone) st.push(["delete from topics where id in (select topic_id from content where data like ?)", [`meta=_twmgc_%id=${g}\n%`]], ["delete from content where data like ?", [`meta=_twmgc_%id=${g}\n%`]]);
  await exec(m.file, st);
  const next = list.find(x => !gone.has(x.id) && x.pid === t?.pid) || list.find(x => !gone.has(x.id));
  await H.reopen(m.file, next ? next.id : null);
}

/* ---------------------------------------------------------------- the editor */
/** after a new topic was made (and the module read again): edit it */
function editNow(file: string, tid: Topic['id']): void { const m = H.books().find(x => x.file === file); if (m && q('#libBody .ebody')) startEdit(m, tid); }
function startEdit(m: BookMod, tid: Topic['id']): void {
  const body = q('#libBody'); const eb = q<HTMLElement>('.ebody', body); if (!eb) return;
  editing = { mod: m, tid };
  if (eb.querySelector('p.hint') && /\(empty\)/.test(eb.textContent || '')) eb.innerHTML = '<p><br></p>';
  eb.querySelectorAll('mark.hl').forEach(mk => mk.replaceWith(...mk.childNodes)); // your marks are not part of the text
  eb.contentEditable = 'true'; eb.classList.add('editing'); eb.focus();
  const book = m.kind !== 'commentary';
  q('#ubar').innerHTML = `<button data-f="bold" title="Bold (Ctrl+B)"><b>B</b></button><button data-f="italic" title="Italic (Ctrl+I)"><i>I</i></button><button data-f="underline" title="Underline (Ctrl+U)"><u>U</u></button><button data-f="superscript" title="Superscript">x²</button>
    <button data-f="h3" title="Heading">H</button><button data-f="insertUnorderedList" title="List">•</button><button data-f="removeFormat" title="Plain text">⌧</button>
    <button data-f="bible" title="Link to a Bible verse (Ctrl+K)">🔗 Verse</button>${book ? '<button data-f="section" title="Make the selected words a section with its own entry in the topic list (a topic link)">⚓ Section</button>' : ''}
    <span class="grow"></span><button data-f="cancel">Cancel</button><button data-f="save" class="primary" title="Save (Ctrl+S)">Save</button>`;
  q('#ubar').onclick = ev => { const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-f]'); if (b) { ev.preventDefault(); fmt(b.dataset.f!); } };
  q('#ubar').onmousedown = ev => { if ((ev.target as HTMLElement).closest('[data-f]')) ev.preventDefault(); };
  eb.onkeydown = ev => {
    if (ev.ctrlKey && ev.key.toLowerCase() === 's') { ev.preventDefault(); fmt('save'); }
    if (ev.ctrlKey && ev.key.toLowerCase() === 'k') { ev.preventDefault(); fmt('bible'); }
    if (ev.key === 'Escape') { ev.preventDefault(); fmt('cancel'); }
    ev.stopPropagation();
  };
}
export const isEditing = () => !!editing;
async function fmt(f: string): Promise<void> {
  if (!editing) return;
  const eb = q<HTMLElement>('#libBody .ebody');
  switch (f) {
    case 'save': return save();
    case 'cancel': { const ed = editing; editing = null; await H.reopen(ed.mod.file, ed.tid); return; }
    case 'h3': document.execCommand('formatBlock', false, 'h3'); return;
    case 'bible': {
      const sel = window.getSelection(); const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null; const chosen = String(sel || '').trim();
      const r = await askRef('Link to a Bible verse', chosen || ''); if (!r || !r.c) return;
      const href = `tw://bible.*?id=${r.b}.${r.c}.${r.f || 1}${r.e > r.f ? `-${r.b}.${r.c}.${r.e}` : ''}`;
      eb.focus(); if (range) { sel!.removeAllRanges(); sel!.addRange(range); }
      const a = document.createElement('a'); a.className = 'link'; a.dataset.href = href; a.textContent = chosen || refLabel(r);
      if (range && eb.contains(range.commonAncestorContainer)) { range.deleteContents(); range.insertNode(a); } else eb.appendChild(a);
      return;
    }
    case 'section': return section(eb);
    default: document.execCommand(f, false);
  }
}
async function save(): Promise<void> {
  if (!editing) return; const { mod, tid } = editing; const eb = q<HTMLElement>('#libBody .ebody');
  const html = eb.innerHTML; const rtf = htmlToRtf(html);
  try {
    await exec(mod.file, [['update content set data = ?, data2 = null where topic_id = ?', [rtf, tid as number]]]);
    editing = null; flash('Saved'); await H.reopen(mod.file, tid);
  } catch (e) { flash('Could not save: ' + String((e as Error).message || e)); }
}
/** theWord topic links: a bookmark at the selected words and a sub-topic in the list that opens the topic there */
async function section(eb: HTMLElement): Promise<void> {
  if (!editing) return; const { mod, tid } = editing;
  const sel = window.getSelection(); const txt = String(sel || '').trim();
  if (!sel || !sel.rangeCount || !txt || !eb.contains(sel.getRangeAt(0).commonAncestorContainer)) return flash('Select the words that begin the section (e.g. its heading) first');
  const name = 'bkm' + Date.now().toString(36);
  const a = document.createElement('a'); a.className = 'bkm'; a.id = 'bkm:' + name;
  const r = sel.getRangeAt(0); r.collapse(true); r.insertNode(a);
  // save the text with its new bookmark, then add the link topic under this topic
  const id = await nextId(mod);
  try {
    await exec(mod.file, [['update content set data = ?, data2 = null where topic_id = ?', [htmlToRtf(eb.innerHTML), tid as number]],
      ['insert into topics(id, pid, subject, rel_order, content_type) values(?, ?, ?, ?, ?)', [id, tid as number, txt.slice(0, 80), id, 'meta']],
      ['insert into content(topic_id, data) values(?, ?)', [id, `meta=_twmgc_\ntype=link\nid=${tid}\nanchor=${name}`]]]);
    flash(`Section “${txt.slice(0, 40)}” added to the topic list`);
    editing = null; await H.reopen(mod.file, tid);
  } catch (e) { flash('Could not add the section: ' + String((e as Error).message || e)); }
}
