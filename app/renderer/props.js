/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
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
    const chips = `<div class="ppchips"><span class="chip st">${esc(i.format)}</span><span class="chip st">${esc(i.kind || m.kind || '')}</span>${i.compressed ? '<span class="chip st">compressed</span>' : ''}${i.editable ? '' : '<span class="chip st ro">read-only</span>'}</div>
      <div class="small ppfile" title="${esc(i.file)}">${esc(i.name)} · ${kb(i.size)}</div>`;
    $('#ppCard').innerHTML = `<div class="ppt">${esc(title)}</div>` + chips;
    const strip = document.documentElement.classList.contains('phone') ? `<div class="ppstrip">${chips}</div>` : '';
    const pages = $('#ppPages');
    const ro = !i.editable;
    const isTwm = i.format === 'theWord' && i.ext === 'twm' && ['Dictionary', 'Commentary', 'Book'].includes(i.kind);
    const canLinks = isTwm && i.editable && !i.compressed;
    const linkWhy = !isTwm ? 'Verse links can be created in theWord books, dictionaries and commentaries (.twm).' : i.compressed ? 'This module stores its text compressed, so links cannot be created in it.' : i.reason || 'This module cannot be changed.';
    const note = ro ? `<p class="note">${TimotheosIcons.icon('info', 14)} This module cannot be changed: ${esc(i.reason)}.</p>` : '';
    pages.innerHTML = strip + `
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
      </section>
      <section class="optpage hidden" data-p="links">${canLinks ? `
        <p class="small">Finds references such as <b>John 3:16</b>, <b>Exo 4:14; 5:1</b> or <b>1 Cor 13:4-7</b> in the text of this module and turns them into links that open the verse. They are theWord links, so the module keeps working in theWord. Links that are already there are left as they are.</p>
        <h4>What to link</h4>
        <label class="ppopt"><input type="checkbox" id="vlTl" checked> <span>Also know the Tagalog book names (Juan, Mga Awit, Roma …)</span></label>
        <label class="ppopt"><input type="checkbox" id="vlFollow" checked> <span>Link the references that follow a book name: <i>Exo 4:14; 5:1, 8 and 9</i></span></label>
        <label class="ppopt"><input type="checkbox" id="vlBare"> <span>Link a bare <i>3:16</i> that comes after a book name in the same paragraph (can also catch times such as 10:30, so look at the preview first)</span></label>
        <label class="ppopt"><input type="checkbox" id="vlFix" checked> <span>Links whose text is “[vref]” show the real reference instead</span></label>
        <h4>Link text</h4>
        <label class="ppopt"><input type="radio" name="vlText" value="written" checked> <span>Keep the text as it is written</span></label>
        <label class="ppopt"><input type="radio" name="vlText" value="english"> <span>Write it the standard way, English names (Exod 4:14)</span></label>
        <label class="ppopt"><input type="radio" name="vlText" value="tagalog"> <span>Write it the standard way, Tagalog names</span></label>
        <h4>Where to put the links</h4>
        <label class="ppopt"><input type="radio" name="vlMode" value="inplace" checked> <span>In this module (the original file is kept; “File &amp; size” can put it back)</span></label>
        <label class="ppopt"><input type="radio" name="vlMode" value="copy"> <span>In a new copy next to it, “… (verse links)”; this module stays as it is</span></label>
        <div class="row"><button id="vlPreview" data-icon="search" data-icon-size="15">Preview</button><button id="vlGo" class="primary" data-icon="link" data-icon-size="15">Create the links</button><span id="vlResult" class="small"></span></div>
        <div id="vlSamples" class="small"></div>` : `<p class="note">${TimotheosIcons.icon('info', 14)} ${esc(linkWhy)}</p>`}
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
    const nl = $('#ppNavLinks'); if (nl) nl.classList.toggle('hidden', !isTwm);
    if (canLinks) { $('#vlPreview').onclick = () => verseLinks(false); $('#vlGo').onclick = () => verseLinks(true); }
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
      try { await afterChange(id); } catch (e) { console.warn('refresh after save', e); } // the file is saved; a failed refresh must not look like a failed save
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
  function vlOpts() {
    const radio = n => (document.querySelector(`input[name="${n}"]:checked`) || {}).value;
    return { tagalog: $('#vlTl').checked, followOn: $('#vlFollow').checked, bare: $('#vlBare').checked, fixPlaceholders: $('#vlFix').checked, text: radio('vlText') || 'written', mode: radio('vlMode') || 'inplace' };
  }
  /** Create verse links (preview = count only, nothing is changed) */
  async function verseLinks(write) {
    const res = $('#vlResult'), box = $('#vlSamples'), btns = [$('#vlPreview'), $('#vlGo')];
    const says = r => `${r.links} new link${r.links === 1 ? '' : 's'}${r.fixed ? `, ${r.fixed} “[vref]” replaced` : ''} in ${r.changed} of ${r.topics} entries`;
    btns.forEach(b => b.disabled = true); res.textContent = 'Working…'; box.innerHTML = '';
    try {
      if (write) {
        const pre = await api.modVerseLinks(cur.id, vlOpts(), false);
        if (!pre.changed) { res.textContent = 'Nothing to link: no new references were found.'; return; }
        if (!await TimotheosModules.confirmBox('Create verse links', `${says(pre)}. ${vlOpts().mode === 'copy' ? 'They go into a new copy of this module.' : 'They are written into this module; the original file is kept first.'} Go on?`)) { res.textContent = ''; return; }
      }
      const r = await api.modVerseLinks(cur.id, vlOpts(), write);
      if (write) {
        if (r.list) await refreshModules(r.list);
        if (r.file === null) { res.textContent = 'Nothing to link: no new references were found.'; return; }
        cur.info = await api.modProps(cur.id); await afterChange(cur.id);
        const where = r.file && r.file !== cur.info.file ? ` Saved as ${r.file.split(/[\\/]/).pop()}.` : '';
        render('links'); $('#vlResult').textContent = `Done: ${says(r)}.${where}`;
      } else {
        res.textContent = r.changed ? `${says(r)} would change.` : 'Nothing to link: no new references were found.';
        box.innerHTML = r.samples.map(x => `<div><b>${esc(x.topic)}</b>: ${x.links.map(esc).join('; ')}${x.more ? ` … +${x.more} more` : ''}</div>`).join('') + (r.skipped ? `<div class="hint">${r.skipped} entries hold pictures or are stored in a form that is not changed.</div>` : '');
      }
    } catch (e) { res.textContent = ''; TimotheosModules.messageBox('Verse links', esc(e.message)); }
    finally { btns.forEach(b => { if (b) b.disabled = false; }); }
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
