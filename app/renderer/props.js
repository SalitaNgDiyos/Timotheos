'use strict';
/* Module properties window: shows a module's information as a readable page and lets you edit it;
 * "File & size" compacts or compresses the module file. Works for Bibles and library modules. */
/* global api, state, esc, sanitize, refreshModules, TimotheosModules, TimotheosIcons */
(function () {
  const $ = s => document.querySelector(s);
  let cur = null;      // { id, info }
  let dirty = {};      // key → new value
  let aboutDirty = false;

  const kb = n => n < 1024 ? n + ' bytes' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const findMod = id => (state.modules.books || []).find(b => b.id === id) || (state.modules.bibles || []).find(b => b.id === id) || {};

  async function open(id, page) {
    let info;
    try { info = await api.modProps(id); } catch (e) { return TimotheosModules.messageBox('Properties', esc(e.message)); }
    cur = { id, info }; dirty = {}; aboutDirty = false;
    render(page || 'about');
    $('#propsDlg').classList.remove('hidden');
  }

  function render(page) {
    const i = cur.info; const m = findMod(cur.id);
    const title = (i.fields.find(f => f.key === 'title') || {}).value || m.title || i.name;
    $('#ppTitle').textContent = 'Properties – ' + title;
    $('#ppCard').innerHTML = `<div class="ppt">${esc(title)}</div>
      <div class="ppchips"><span class="chip st">${esc(i.format)}</span><span class="chip st">${esc(i.kind || m.kind || '')}</span>${i.compressed ? '<span class="chip st">compressed</span>' : ''}${i.editable ? '' : '<span class="chip st ro">read-only</span>'}</div>
      <div class="small ppfile" title="${esc(i.file)}">${esc(i.name)} · ${kb(i.size)}</div>`;
    const pages = $('#ppPages');
    const ro = !i.editable;
    const note = ro ? `<p class="note">${TimotheosIcons.icon('info', 14)} This module cannot be changed: ${esc(i.reason)}.</p>` : '';
    pages.innerHTML = `
      <section class="optpage" data-p="about">${note}
        <div class="pptools ${ro ? 'hidden' : ''}"><button id="ppEdit" data-icon="edit" data-icon-size="15">Edit</button>
          <span class="ppfmt hidden" id="ppFmt"><button data-cmd="bold" title="Bold"><b>B</b></button><button data-cmd="italic" title="Italic"><i>I</i></button><button data-cmd="underline" title="Underline"><u>U</u></button><button data-cmd="insertUnorderedList" title="List">• List</button><button data-cmd="removeFormat" title="Plain text">Clear</button></span></div>
        <div id="ppAbout" class="lookup ppabout">${i.about ? sanitize(i.about) : '<p class="hint">This module has no About text.</p>'}</div>
        ${i.aboutKey ? `<p class="small">Saved as ${i.format === 'e-Sword' ? (/i$/.test(i.ext) ? 'HTML (e-Sword 11)' : 'RTF (e-Sword 9/10)') : i.aboutStyle === 'html' ? 'HTML' : i.aboutStyle === 'plain' && i.ext !== 'twm' ? 'text with \\par' : 'RTF'}, the form ${esc(i.format)} reads.</p>` : ''}
      </section>
      <section class="optpage hidden" data-p="details">${note}
        <div class="ppgrid">${i.fields.map(f => `<label class="${f.multiline ? 'wide' : ''}">${esc(f.label)}${f.multiline ? `<textarea data-key="${esc(f.key)}" rows="3" ${ro ? 'disabled' : ''}>${esc(f.value)}</textarea>` : `<input data-key="${esc(f.key)}" value="${esc(f.value)}" ${ro ? 'disabled' : ''}>`}</label>`).join('') || '<p class="hint">No details.</p>'}</div>
      </section>
      <section class="optpage hidden" data-p="all">${note}
        <p class="small">Every setting stored in the module. Greyed-out ones belong to the program that made the module and are not changed here.${i.rules ? ` This Bible also has ${i.rules} verse rule(s), kept as they are.` : ''}</p>
        <table class="pptab"><tbody>${i.extra.map(e => `<tr><th>${esc(e.key)}</th><td><input data-key="${esc(e.key)}" value="${esc(e.value)}" ${ro || e.readonly ? 'disabled' : ''}></td></tr>`).join('') || '<tr><td class="hint">Nothing else.</td></tr>'}</tbody></table>
      </section>
      <section class="optpage hidden" data-p="file">
        <table class="pptab"><tbody><tr><th>File</th><td class="sel">${esc(i.file)}</td></tr><tr><th>Size</th><td id="ppSize">${kb(i.size)}</td></tr>
          ${i.encoding !== 'utf8' ? `<tr><th>Encoding</th><td>${esc(i.encoding)}</td></tr>` : ''}
          <tr><th>Backup</th><td id="ppBackup">${i.backup ? 'A copy of the original is kept: ' + esc(i.backup.split(/[\\/]/).pop()) : 'None yet (made before the first change)'}</td></tr></tbody></table>
        <h4>Make the file smaller</h4>
        ${!i.canCompact ? '<p class="small">theWord Bibles (.ont/.ot/.nt) are plain text files; there is nothing to compact.</p>' : ro ? note : `
        <label class="ppopt"><input type="checkbox" checked disabled> <span><b>Compact</b> – removes unused space inside the file. Nothing in the module changes; theWord and e-Sword read it as before.</span></label>
        ${i.ext === 'twm' ? `<label class="ppopt"><input type="checkbox" id="ppZlib" ${i.canZlib ? '' : 'disabled'}> <span><b>Compress the text</b> (zlib, theWord's “compressed” setting)${i.compressed ? ' – already compressed' : ''}. Timotheos reads such modules; whether theWord reads a module compressed by Timotheos has not been checked yet, so test it in theWord and keep the backup until you have.</span></label>` : '<p class="small">e-Sword has no compressed form for this kind of module, so only compacting is offered.</p>'}
        <div class="row"><button id="ppCompress" class="primary" data-icon="compress" data-icon-size="15">Make smaller</button><span id="ppResult" class="small"></span></div>`}
        ${i.backup && !ro ? `<h4>Undo all changes</h4><div class="row"><button id="ppRestore" data-icon="undo" data-icon-size="15">Put the original file back</button></div>` : ''}
      </section>`;
    TimotheosIcons.fillIcons(pages);
    // navigation
    $('#ppNav').querySelectorAll('button[data-p]').forEach(b => b.onclick = () => show(b.dataset.p));
    show(page);
    // edits
    pages.querySelectorAll('[data-key]').forEach(el => el.addEventListener('input', () => { dirty[el.dataset.key] = el.value; updateSave(); }));
    const ed = $('#ppEdit');
    if (ed) ed.onclick = () => {
      const a = $('#ppAbout'); const on = a.isContentEditable;
      if (!on) { if (!cur.info.about) a.innerHTML = '<p><br></p>'; a.contentEditable = 'true'; a.focus(); }
      else a.contentEditable = 'false';
      ed.classList.toggle('on', !on); $('#ppFmt').classList.toggle('hidden', on);
    };
    $('#ppAbout').addEventListener('input', () => { aboutDirty = true; updateSave(); });
    pages.querySelectorAll('#ppFmt [data-cmd]').forEach(b => b.onmousedown = e => { e.preventDefault(); document.execCommand(b.dataset.cmd); aboutDirty = true; updateSave(); });
    const cb = $('#ppCompress'); if (cb) cb.onclick = compress;
    const rb = $('#ppRestore'); if (rb) rb.onclick = restore;
    $('#ppNote').textContent = i.editable ? 'Before the first change Timotheos keeps a copy of the original file.' : '';
    updateSave();
  }
  function show(p) {
    $('#ppNav').querySelectorAll('button[data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === p));
    $('#ppPages').querySelectorAll('.optpage').forEach(x => x.classList.toggle('hidden', x.dataset.p !== p));
  }
  function updateSave() { $('#ppSave').disabled = !(Object.keys(dirty).length || aboutDirty) || !cur.info.editable; }

  async function afterChange(id) {
    state.infos.clear();
    await refreshModules();
    const L = TimotheosModules.lib;
    if (L.cur === id) { L.cur = null; await TimotheosModules.openBookModule(id); }
  }
  async function save() {
    const id = cur.id;
    let html;
    if (aboutDirty) {
      const a = $('#ppAbout').cloneNode(true);
      a.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));
      html = a.innerHTML;
    }
    try {
      const r = await api.modSave(id, dirty, html);
      cur.info = r.info; dirty = {}; aboutDirty = false;
      await afterChange(id);
      render(activePage());
      flashNote('Saved.' + (r.backup ? ' The original is kept as ' + r.backup.split(/[\\/]/).pop() + '.' : ''));
    } catch (e) { TimotheosModules.messageBox('Could not save', esc(e.message)); }
  }
  function activePage() { const b = $('#ppNav button.on'); return b ? b.dataset.p : 'about'; }
  function flashNote(t) { $('#ppNote').textContent = t; }

  async function compress() {
    const z = $('#ppZlib'); const zl = !!(z && z.checked);
    $('#ppCompress').disabled = true; $('#ppResult').textContent = 'Working…';
    try {
      const r = await api.modCompress(cur.id, { zlib: zl });
      const pct = r.before ? Math.round(100 - r.after * 100 / r.before) : 0;
      cur.info = await api.modProps(cur.id);
      await afterChange(cur.id);
      render('file');
      $('#ppResult').textContent = `${kb(r.before)} → ${kb(r.after)} (${pct > 0 ? pct + '% smaller' : 'no change: there was no unused space'})${r.zipped ? `; text of ${r.zipped} topics compressed` : ''}.`;
    } catch (e) {
      $('#ppCompress').disabled = false; $('#ppResult').textContent = '';
      TimotheosModules.messageBox('Not made smaller', esc(e.message));
    }
  }
  async function restore() {
    if (!await TimotheosModules.confirmBox('Put the original back', 'Replace this module with the copy kept before your first change? All changes made in Timotheos are undone.')) return;
    try { await api.modRestore(cur.id); cur.info = await api.modProps(cur.id); await afterChange(cur.id); render('file'); flashNote('The original file is back.'); }
    catch (e) { TimotheosModules.messageBox('Could not restore', esc(e.message)); }
  }
  async function close() {
    if ((Object.keys(dirty).length || aboutDirty) && !await TimotheosModules.confirmBox('Unsaved changes', 'Close without saving your changes?')) return;
    $('#propsDlg').classList.add('hidden'); cur = null;
  }

  function init() {
    $('#ppSave').onclick = save;
    $('#ppCancel').onclick = close; $('#ppClose').onclick = close;
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#propsDlg').classList.contains('hidden') && $('#modal').classList.contains('hidden')) { e.stopPropagation(); close(); } }, true);
  }
  window.TimotheosProps = { init, open, close };
})();
