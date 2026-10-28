// The Properties window of a module: its About text as a readable page (editable), the usual details,
// every stored setting, and the file (make smaller, put the original back).
import { compressModule, Info, readProps, restoreModule, writeProps } from './modprops';
import { dialog, esc, flash } from './ui';

const kb = (n: number) => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
let afterChange: (file: string) => Promise<void> = async () => {};
export function initProps(onChange: (file: string) => Promise<void>): void { afterChange = onChange; }

/** clean HTML for showing the About text (no scripts, no event handlers, links made inert) */
function safe(html: string): string {
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(n => n.remove());
  t.content.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || ((a.name === 'href' || a.name === 'src') && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); });
  t.content.querySelectorAll('a[href]').forEach(a => { (a as HTMLElement).title = a.getAttribute('href') || ''; a.removeAttribute('href'); });
  return t.innerHTML;
}

export async function openProps(file: string, title: string, page = 'about'): Promise<void> {
  let info: Info;
  try { info = await readProps(file); } catch (e) { await dialog('Properties', `<p>${esc((e as Error).message || String(e))}</p>`, [{ label: 'OK', value: 'ok', primary: true }]); return; }
  let dirty: Record<string, string> = {}; let aboutDirty = false;
  const wrap = document.createElement('div'); wrap.className = 'dlg';
  wrap.innerHTML = `<div class="dlgbox ppbox" role="dialog" aria-label="Properties"><h3 id="ppTitle"></h3><div class="ppcard" id="ppCard"></div>
    <div class="seg" id="ppNav"><button data-p="about">About</button><button data-p="details">Details</button><button data-p="all">All settings</button><button data-p="file">File &amp; size</button></div>
    <div id="ppPages" class="pppages"></div>
    <div class="dlgbtns"><span id="ppNote" class="small grow"></span><button id="ppClose">Close</button><button id="ppSave" class="primary">Save</button></div></div>`;
  document.body.appendChild(wrap);
  const q = <T extends HTMLElement = HTMLElement>(s: string) => wrap.querySelector(s) as T;
  let cur = page;

  const render = () => {
    const i = info; const t = i.fields.find(f => f.key === 'title')?.value || title || i.name; const ro = !i.editable;
    q('#ppTitle').textContent = 'Properties – ' + t;
    q('#ppCard').innerHTML = `<span class="chip st">${esc(i.format)}</span> <span class="chip st">${esc(i.kind)}</span>${i.compressed ? ' <span class="chip st">compressed</span>' : ''}${ro ? ' <span class="chip st">read-only</span>' : ''} <span class="small">${esc(i.name)} · ${kb(i.size)}</span>`;
    const note = ro ? `<p class="note">This module cannot be changed: ${esc(i.reason)}.</p>` : '';
    const savedAs = i.aboutKey ? `<p class="small">Saved as ${i.format === 'e-Sword' ? (/i$/.test(i.ext) ? 'HTML (e-Sword 11)' : 'RTF (e-Sword 9/10)') : i.aboutStyle === 'html' ? 'HTML' : i.aboutStyle === 'plain' && i.ext !== 'twm' ? 'text with \\par' : 'RTF'}, the form ${esc(i.format)} reads.</p>` : '';
    q('#ppPages').innerHTML = `
      <section data-p="about">${note}
        ${ro || !i.aboutKey ? '' : `<div class="pptools"><button id="ppEdit">Edit</button><span id="ppFmt" class="hidden"><button data-cmd="bold"><b>B</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="underline"><u>U</u></button><button data-cmd="insertUnorderedList">• List</button><button data-cmd="removeFormat">Clear</button></span></div>`}
        <div id="ppAbout" class="ppabout entry">${i.about ? safe(i.about) : '<p class="hint">This module has no About text.</p>'}</div>${savedAs}</section>
      <section data-p="details">${note}<div class="ppgrid">${i.fields.map(f => `<label class="fl${f.multiline ? ' wide' : ''}">${esc(f.label)}${f.multiline ? `<textarea class="txt" data-key="${esc(f.key)}" rows="3"${ro ? ' disabled' : ''}>${esc(f.value)}</textarea>` : `<input class="txt" data-key="${esc(f.key)}" value="${esc(f.value)}"${ro ? ' disabled' : ''}>`}</label>`).join('') || '<p class="hint">No details.</p>'}</div></section>
      <section data-p="all">${note}<p class="small">Every setting stored in the module. Greyed-out ones belong to the program that made the module and are not changed here.${i.rules ? ` This Bible also has ${i.rules} verse rule(s), kept as they are.` : ''}</p>
        <table class="pptab"><tbody>${i.extra.map(e => `<tr><th>${esc(e.key)}</th><td><input class="txt" data-key="${esc(e.key)}" value="${esc(e.value)}"${ro || e.readonly ? ' disabled' : ''}></td></tr>`).join('') || '<tr><td class="hint">Nothing else.</td></tr>'}</tbody></table></section>
      <section data-p="file"><table class="pptab"><tbody><tr><th>File</th><td class="sel">${esc(i.file)}</td></tr><tr><th>Size</th><td>${kb(i.size)}</td></tr>
          ${i.encoding !== 'utf8' ? `<tr><th>Encoding</th><td>${esc(i.encoding)}</td></tr>` : ''}
          <tr><th>Original</th><td>${i.backup ? 'A copy of the original is kept: ' + esc(i.backup.split(/[\\/]/).pop()!) : 'Kept automatically before the first change'}</td></tr></tbody></table>
        <h4>Make the file smaller</h4>
        ${!i.canCompact ? '<p class="small">theWord Bibles (.ont/.ot/.nt) are plain text files; there is nothing to compact.</p>' : ro ? note : `
          <label class="ppopt"><input type="checkbox" checked disabled> <span><b>Compact</b> – removes unused space inside the file. Nothing in the module changes; theWord and e-Sword read it as before.</span></label>
          ${i.ext === 'twm' ? `<label class="ppopt"><input type="checkbox" id="ppZlib"${i.canZlib ? '' : ' disabled'}> <span><b>Compress the text</b> (zlib, theWord's “compressed” setting)${i.compressed ? ' – already compressed' : ''}. Tanglaw reads such modules; whether theWord reads a module compressed by Tanglaw has not been checked, so try it in theWord and keep the original until you have.</span></label>` : '<p class="small">e-Sword has no compressed form for this kind of module, so only compacting is offered.</p>'}
          <div class="srow"><button id="ppCompress" class="primary">Make smaller</button><span id="ppResult" class="small"></span></div>`}
        ${i.backup && !ro ? '<h4>Undo all changes</h4><div class="srow"><button id="ppRestore">Put the original file back</button></div>' : ''}</section>`;
    show(cur);
    q('#ppPages').querySelectorAll<HTMLInputElement>('[data-key]').forEach(el => el.oninput = () => { dirty[el.dataset.key!] = el.value; upd(); });
    const ed = wrap.querySelector<HTMLButtonElement>('#ppEdit');
    if (ed) ed.onclick = () => {
      const a = q('#ppAbout'); const on = a.isContentEditable;
      if (!on) { if (!info.about) a.innerHTML = '<p><br></p>'; a.contentEditable = 'true'; a.focus(); } else a.contentEditable = 'false';
      ed.classList.toggle('on', !on); q('#ppFmt').classList.toggle('hidden', on);
    };
    q('#ppAbout').oninput = () => { aboutDirty = true; upd(); };
    wrap.querySelectorAll<HTMLElement>('#ppFmt [data-cmd]').forEach(b => b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.cmd!); aboutDirty = true; upd(); });
    const cb = wrap.querySelector<HTMLButtonElement>('#ppCompress'); if (cb) cb.onclick = compress;
    const rb = wrap.querySelector<HTMLButtonElement>('#ppRestore'); if (rb) rb.onclick = restore;
    q('#ppNote').textContent = info.editable ? 'Before the first change Tanglaw keeps a copy of the original file.' : '';
    upd();
  };
  const show = (p: string) => { cur = p; q('#ppNav').querySelectorAll<HTMLElement>('[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p)); q('#ppPages').querySelectorAll<HTMLElement>('section').forEach(s => s.classList.toggle('hidden', s.dataset.p !== p)); };
  const upd = () => { q<HTMLButtonElement>('#ppSave').disabled = !(Object.keys(dirty).length || aboutDirty) || !info.editable; };
  q('#ppNav').onclick = e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]'); if (b) show(b.dataset.p!); };

  const save = async () => {
    let html: string | undefined;
    if (aboutDirty) { const a = q('#ppAbout').cloneNode(true) as HTMLElement; a.querySelectorAll('[style]').forEach(n => n.removeAttribute('style')); html = a.innerHTML; }
    q<HTMLButtonElement>('#ppSave').disabled = true;
    try {
      const r = await writeProps(file, dirty, html);
      info = r.info; dirty = {}; aboutDirty = false; await afterChange(file); render();
      q('#ppNote').textContent = 'Saved.' + (r.backupMade ? ' The original is kept next to the module.' : '');
    } catch (e) { upd(); await dialog('Could not save', `<p>${esc((e as Error).message || String(e))}</p>`, [{ label: 'OK', value: 'ok', primary: true }]); }
  };
  const compress = async () => {
    const zl = !!wrap.querySelector<HTMLInputElement>('#ppZlib')?.checked;
    q<HTMLButtonElement>('#ppCompress').disabled = true; q('#ppResult').textContent = 'Working…';
    try {
      const r = await compressModule(file, zl); info = await readProps(file); await afterChange(file); render();
      const pct = r.before ? Math.round(100 - r.after * 100 / r.before) : 0;
      q('#ppResult').textContent = `${kb(r.before)} → ${kb(r.after)} (${pct > 0 ? pct + '% smaller' : 'no change: there was no unused space'})${r.zipped ? `; text of ${r.zipped} topics compressed` : ''}.`;
    } catch (e) { q<HTMLButtonElement>('#ppCompress').disabled = false; q('#ppResult').textContent = ''; await dialog('Not made smaller', `<p>${esc((e as Error).message || String(e))}</p>`, [{ label: 'OK', value: 'ok', primary: true }]); }
  };
  const restore = async () => {
    if (await dialog('Put the original back', '<p>Replace this module with the copy kept before your first change? All changes made in Tanglaw are undone.</p>', [{ label: 'Cancel', value: null }, { label: 'Put it back', value: 'ok', primary: true }]) !== 'ok') return;
    try { await restoreModule(file); info = await readProps(file); await afterChange(file); render(); q('#ppNote').textContent = 'The original file is back.'; }
    catch (e) { flash('Could not put it back: ' + (e as Error).message); }
  };
  const close = async () => {
    if ((Object.keys(dirty).length || aboutDirty) && await dialog('Unsaved changes', '<p>Close without saving your changes?</p>', [{ label: 'Keep editing', value: null }, { label: 'Close', value: 'ok', primary: true }]) !== 'ok') return;
    document.removeEventListener('keydown', key, true); wrap.remove();
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelectorAll('.dlg').length === 1) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  q('#ppClose').onclick = close; q('#ppSave').onclick = save;
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  render();
}
