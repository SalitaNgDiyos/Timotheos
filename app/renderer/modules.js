/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* global api, state, $, esc, go, openTab, sanitize, versePreview, refreshModules, setLookupHtml, TimotheosIcons, TimotheosOptions, TimotheosProps, TimotheosTools, TimotheosSpeech, TimotheosStudy */
// Book modules (commentaries, dictionaries, books, devotionals), importing, cross-references,
// [A1-A3] user module creation & topic authoring, and [B1-B3] tw:// bookmark popups & anchor scrolling.

const KIND_LABEL = { commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps & images', readingplan: 'Reading plans' };
const KIND_ORDER = ['commentary', 'dictionary', 'book', 'devotional', 'map', 'readingplan'];
const lib = { cur: null, history: [], topics: [], cmtSel: null, xr: {}, marks: {} };

/* ---------------- sidebar: library list ---------------- */
function renderLibraryList() {
  const ul = $('#libList'); ul.innerHTML = '';
  const books = state.modules.books || [];
  if (!books.length) { ul.innerHTML = '<li class="hint">None yet – use <b>Import modules…</b> or add a folder.</li>'; return; }
  for (const kind of KIND_ORDER) {
    const list = books.filter(b => b.kind === kind).sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));
    if (!list.length) continue;
    const li = document.createElement('li');
    li.innerHTML = `<details${kind === 'commentary' || kind === 'dictionary' ? ' open' : ''}><summary>${KIND_LABEL[kind] || kind} <span class="count">${list.length}</span></summary><ul class="modlist sub"></ul></details>`;
    const sub = li.querySelector('ul');
    for (const b of list) {
      const it = document.createElement('li');
      it.className = b.locked ? 'locked' : '';
      it.title = `${b.title || b.name}\n${b.file}${b.locked ? '\n\nCannot be opened: ' + b.reason : ''}`;
      it.innerHTML = `<span class="ttl2">${esc(b.title && b.opened ? b.title : b.name.replace(/\.[^.]+(\.twm)?$/i, ''))}</span>${b.user ? '<span class="fmt" title="Editable user module">user</span>' : ''}<span class="fmt">${b.format === 'e-Sword' ? 'e-Sword' : 'theWord'}</span><button class="pp" title="Properties">${TimotheosIcons.icon('info', 13)}</button>${b.imported ? '<button class="rm" title="Remove this imported copy (moves it to the Recycle Bin)">×</button>' : ''}`;
      it.querySelector('.ttl2').onclick = () => openBookModule(b.id);
      it.querySelector('.pp').onclick = e => { e.stopPropagation(); TimotheosProps.open(b.id); };
      const rm = it.querySelector('.rm');
      if (rm) rm.onclick = async e => { e.stopPropagation(); if (await confirmBox('Remove module', `Move the imported copy of <b>${esc(b.name)}</b> to the Recycle Bin?`)) { const l = await api.removeImported(b.file); await refreshModules(l); } };
      sub.appendChild(it);
    }
    ul.appendChild(li);
  }
}

/* ---------------- import ---------------- */
async function importModules(paths) {
  let r;
  try { r = paths ? await api.importFiles(paths) : await api.importDialog(); }
  catch (e) { return messageBox('Import failed', esc(e.message)); }
  if (!r) return;
  state.infos.clear();
  if (r.results && r.results.some(x => x.studyData) && window.TimotheosStudy) {
    TimotheosStudy.study.ud = await api.userData();
  }
  await refreshModules(r.list);
  const label = { imported: 'Imported', updated: 'Updated', already: 'Already in library', skipped: 'Not imported' };
  const rows = r.results.map(x => `<tr class="st-${x.status}"><td>${esc(label[x.status] || x.status)}</td><td><b>${esc(x.title || x.name)}</b><div class="small">${esc(x.name)}${x.from && x.from.includes('›') ? ' · from ' + esc(x.from.split(' › ')[0]) : ''}</div></td><td>${esc(x.format || '')} ${esc(x.kind || '')}</td><td class="small">${esc(x.reason || x.note || '')}</td></tr>`).join('');
  const n = r.results.filter(x => x.status === 'imported' || x.status === 'updated').length;
  messageBox(`Import: ${n} module${n === 1 ? '' : 's'} added`, `<table class="imp"><thead><tr><th>Result</th><th>Module</th><th>Type</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`, true);
}
function wireDrop() {
  let depth = 0;
  const dz = $('#dropzone');
  window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; dz.classList.remove('hidden'); e.preventDefault(); } });
  window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) dz.classList.add('hidden'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => {
    e.preventDefault(); depth = 0; dz.classList.add('hidden');
    const paths = [...(e.dataTransfer.files || [])].map(f => api.pathForFile(f)).filter(Boolean);
    if (paths.length) importModules(paths);
  });
}

/* ---------------- dialogs ---------------- */
function modal(title, html, buttons, wide) {
  return new Promise(resolve => {
    $('#modalTitle').textContent = title; $('#modalBody').innerHTML = html;
    $('#modal').classList.toggle('wide', !!wide);
    const bar = $('#modalBtns'); bar.innerHTML = '';
    const close = v => { $('#modal').classList.add('hidden'); document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') close((buttons.find(b => b.primary) || {}).value); };
    for (const b of buttons) { const btn = document.createElement('button'); btn.textContent = b.label; if (b.primary) btn.className = 'primary'; btn.onclick = () => close(b.value); bar.appendChild(btn); }
    document.addEventListener('keydown', key);
    $('#modal').classList.remove('hidden');
    const inp = $('#modalBody input'); if (inp) setTimeout(() => inp.focus(), 30);
  });
}
const messageBox = (t, h, wide) => modal(t, h, [{ label: 'OK', value: true, primary: true }], wide);
const confirmBox = (t, h) => modal(t, h, [{ label: 'Cancel', value: false }, { label: 'OK', value: true, primary: true }]);

/* ---------------- [A1-A3] User Module Creation & Authoring ---------------- */
async function newUserModuleDialog(defaultKind = 'commentary') {
  const html = `<label class="field">Kind of module
      <select id="umKind">
        <option value="commentary"${defaultKind === 'commentary' ? ' selected' : ''}>Commentary (.cmt.twm – verse, passage, chapter & book comments)</option>
        <option value="dictionary"${defaultKind === 'dictionary' ? ' selected' : ''}>Dictionary / Lexicon (.dct.twm – word or Strong's entries)</option>
        <option value="book"${defaultKind === 'book' ? ' selected' : ''}>General Book (.gbk.twm – chapters & hierarchical outline)</option>
      </select></label>
    <div class="grid2">
      <label>Title <input id="umTitle" type="text" placeholder="e.g. My Study Commentary"></label>
      <label>Abbreviation <input id="umAbbr" type="text" placeholder="e.g. MyCmt"></label>
    </div>
    <label class="field">Description (optional) <input id="umDesc" type="text" placeholder="Short summary of this module"></label>
    <p class="small">Saved in your Timotheos modules folder in standard theWord (.twm) SQLite format with <code>user=1</code>.</p>`;
  const res = await modal('New user module', html, [{ label: 'Cancel', value: null }, { label: 'Create module', value: 'ok', primary: true }]);
  if (res !== 'ok') return null;
  const kind = $('#umKind').value;
  const title = ($('#umTitle').value || '').trim() || ('My ' + kind);
  const abbr = ($('#umAbbr').value || '').trim() || title.replace(/\s+/g, '').slice(0, 8);
  const description = ($('#umDesc').value || '').trim();
  try {
    const out = await api.userModCreate({ kind, title, abbr, description });
    await refreshModules(out.list);
    TimotheosStudy.flash(`Created ${out.created.name}`);
    if (kind === 'commentary') {
      lib.cmtSel = out.id;
      openTab('cmt');
      await updateCommentary();
    } else {
      await openBookModule(out.id);
    }
    return out;
  } catch (e) {
    await messageBox('Could not create module', esc(e.message));
    return null;
  }
}

async function editUserTopicDialog(modId, existingTopic, parentId = 0) {
  const info = (state.modules.books || []).find(b => b.id === modId) || {};
  const isNew = !existingTopic;
  const curSubj = existingTopic ? existingTopic.subject : '';
  const curHtml = existingTopic ? existingTopic.html : '<p></p>';
  const html = `<label class="field">${info.kind === 'dictionary' ? "Word / Headword (or Strong's code e.g. G26)" : 'Topic title'}
      <input id="utSubj" type="text" value="${esc(curSubj)}" placeholder="${info.kind === 'dictionary' ? 'e.g. Grace or G5485' : 'e.g. Chapter 1'}"></label>
    <div class="row tight noted">
      <button type="button" data-cmd="bold"><b>B</b></button>
      <button type="button" data-cmd="italic"><i>I</i></button>
      <button type="button" data-cmd="underline"><u>U</u></button>
      <button type="button" data-cmd="insertUnorderedList">• List</button>
    </div>
    <div id="utEd" class="noteed" contenteditable="true">${curHtml}</div>
    <p class="small">Bible references you write (e.g. John 3:16, Rom 5:8) automatically become links when shown.</p>`;
  const p = modal(isNew ? `New topic in ${info.title || info.name}` : `Edit topic: ${curSubj}`, html, [
    !isNew ? { label: 'Delete topic', value: 'del' } : null,
    { label: 'Cancel', value: null },
    { label: 'Save', value: 'save', primary: true },
  ].filter(Boolean), true);
  setTimeout(() => {
    document.querySelectorAll('.noted button').forEach(bt => { bt.onmousedown = e => { e.preventDefault(); document.execCommand(bt.dataset.cmd); }; });
    const inp = $('#utSubj'), ed = $('#utEd');
    if (isNew && inp) inp.focus(); else if (ed) ed.focus();
  }, 40);
  const res = await p;
  if (res === 'del' && existingTopic) {
    await api.userModDeleteTopic(modId, existingTopic.id);
    lib.cur = null;
    await openBookModule(modId);
    return;
  }
  if (res !== 'save') return;
  const subject = ($('#utSubj').value || '').trim() || 'Untitled';
  const bodyHtml = ($('#utEd') || {}).innerHTML || '';
  const saved = await api.userModSaveTopic(modId, {
    id: existingTopic ? existingTopic.id : null,
    pid: existingTopic ? existingTopic.pid : parentId,
    subject,
    html: bodyHtml,
  });
  lib.cur = null;
  await openBookModule(modId, saved.id, false);
  TimotheosStudy.flash('Topic saved');
}

async function editUserCommentaryDialog(modId) {
  const info = (state.modules.books || []).find(b => b.id === modId) || {};
  const { b, c, v } = state.ref;
  const bkName = (state.nav.find(x => x.id === b) || { name: 'Book ' + b }).name;
  const hitList = await api.commentaries(b, c, v).catch(() => []);
  const hitEntry = hitList.find(x => x.id === modId);
  const existingTopic = hitEntry && hitEntry.hit ? await api.bookTopic(modId, hitEntry.hit.id).catch(() => null) : null;
  const html = `<div class="grid2">
      <label>Scope
        <select id="ucScope">
          <option value="verse">Verse (${esc(bkName)} ${c}:${v} or verse range)</option>
          <option value="chapter">Whole chapter (${esc(bkName)} ${c})</option>
          <option value="book">Book introduction (${esc(bkName)})</option>
        </select>
      </label>
      <label id="ucEndBox">End verse (for a passage range) <input id="ucV2" type="number" min="${v}" max="200" value="${v}"></label>
    </div>
    <div class="row tight noted">
      <button type="button" data-cmd="bold"><b>B</b></button>
      <button type="button" data-cmd="italic"><i>I</i></button>
      <button type="button" data-cmd="underline"><u>U</u></button>
      <button type="button" data-cmd="insertUnorderedList">• List</button>
    </div>
    <div id="ucEd" class="noteed" contenteditable="true">${existingTopic ? existingTopic.html : ''}</div>
    <p class="small">Saved directly into <b>${esc(info.title || info.name)}</b> in theWord .cmt.twm format.</p>`;
  const p = modal(`Comment on ${bkName} ${c}:${v} – ${info.abbr || info.title}`, html, [
    existingTopic ? { label: 'Delete comment', value: 'del' } : null,
    { label: 'Cancel', value: null },
    { label: 'Save', value: 'save', primary: true },
  ].filter(Boolean), true);
  setTimeout(() => {
    document.querySelectorAll('.noted button').forEach(bt => { bt.onmousedown = e => { e.preventDefault(); document.execCommand(bt.dataset.cmd); }; });
    const sc = $('#ucScope');
    if (sc) sc.onchange = () => $('#ucEndBox').classList.toggle('hidden', sc.value !== 'verse');
    const ed = $('#ucEd'); if (ed) ed.focus();
  }, 40);
  const res = await p;
  if (!res) return;
  const scope = ($('#ucScope') || {}).value || 'verse';
  const v2 = +($('#ucV2') || {}).value || v;
  const ref = scope === 'book' ? { b, c: 0, fvi: 0, tvi: 0 } : scope === 'chapter' ? { b, c, fvi: 0, tvi: 0 } : { b, c, fvi: v, tvi: Math.max(v, v2) };
  const bodyHtml = res === 'del' ? '' : (($('#ucEd') || {}).innerHTML || '');
  await api.userModSaveCmt(modId, ref, bodyHtml);
  await updateCommentary();
  await window.renderChapter(false);
  TimotheosStudy.flash(res === 'del' ? 'Comment deleted' : 'Comment saved');
}

/* ---------------- Library tab ---------------- */
async function fillLibSelect() {
  const sel = $('#libMod'); const keep = sel.value; sel.innerHTML = '<option value="">— choose a module —</option>';
  for (const kind of KIND_ORDER) {
    const list = (state.modules.books || []).filter(b => b.kind === kind && !b.locked);
    if (!list.length) continue;
    const og = document.createElement('optgroup'); og.label = KIND_LABEL[kind];
    for (const b of list.sort((x, y) => (x.title || x.name).localeCompare(y.title || y.name))) { const o = document.createElement('option'); o.value = b.id; o.textContent = (b.opened ? b.title : b.name.replace(/\.[^.]+(\.twm)?$/i, '')) + (b.user ? ' [user]' : ''); og.appendChild(o); }
    sel.appendChild(og);
  }
  if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
}

async function openBookModule(id, topicId, addHistory = true, anchor = null) {
  if (window.hideLookupFeed) window.hideLookupFeed();
  openTab('lib');
  let info;
  try { info = await api.bookOpen(id); } catch (e) { $('#libBody').innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
  const m = (state.modules.books || []).find(b => b.id === id); if (m) Object.assign(m, info);
  if (info.locked) { $('#libTopics').innerHTML = ''; $('#libBody').innerHTML = `<div class="entry"><h4>${esc(info.title)}</h4><p class="note">This module cannot be opened in Timotheos: ${esc(info.reason)}.</p></div>`; return; }
  if (lib.cur !== id) {
    lib.cur = id; lib.topics = await api.bookTopics(id);
    await fillLibSelect(); $('#libMod').value = id; $('#libFilter').value = '';
    renderTopicList(lib.topics);
  }
  $('#libToday').classList.toggle('hidden', info.kind !== 'devotional');
  const ubar = $('#libUserBar');
  if (ubar) {
    ubar.classList.toggle('hidden', !info.user);
    const subBtn = $('#libAddSub');
    if (subBtn) subBtn.classList.toggle('hidden', info.kind !== 'book');
  }
  if (topicId == null && info.kind === 'devotional') { const d = new Date(); const t = await api.devotionsToday(d.getMonth() + 1, d.getDate()); const mine = t.find(x => x.id === id); if (mine) topicId = mine.topics[0].id; }
  if (topicId == null && (info.kind === 'commentary' || info.hasVerseSync)) { const { b, c, v } = state.ref; const hit = (await api.commentaries(b, c, v)).find(x => x.id === id); if (hit && hit.hit) { topicId = hit.hit.id; anchor = anchor || hit.hit.anchor; } }
  if (topicId == null) { const first = lib.topics.find(t => !t.pid) || lib.topics[0]; topicId = first ? first.id : null; }
  if (topicId != null) await showTopic(id, topicId, addHistory, anchor);
}

function renderTopicList(list, maxRender = 500) {
  const ul = $('#libTopics'); ul.innerHTML = '';
  const slice = list.length > maxRender ? list.slice(0, maxRender) : list;
  const kids = new Map(); for (const t of slice) { const k = t.pid || 0; (kids.get(k) || kids.set(k, []).get(k)).push(t); }
  const ids = new Set(slice.map(t => t.id));
  const add = (pid, depth) => {
    for (const t of kids.get(pid) || []) {
      const li = document.createElement('li'); li.dataset.tid = t.id; li.textContent = t.subject || '(untitled)';
      li.style.paddingLeft = (6 + depth * 12) + 'px';
      if (kids.has(t.id)) li.classList.add('parent');
      li.onclick = () => showTopic(lib.cur, t.id);
      ul.appendChild(li);
      if (depth < 6) add(t.id, depth + 1);
    }
  };
  add(0, 0);
  for (const t of slice) if (t.pid && !ids.has(t.pid)) { const li = document.createElement('li'); li.dataset.tid = t.id; li.textContent = t.subject; li.onclick = () => showTopic(lib.cur, t.id); ul.appendChild(li); }
  if (list.length > maxRender) {
    const more = document.createElement('li');
    more.className = 'hint';
    more.style.cursor = 'pointer';
    more.textContent = `Show next 500… (${(list.length - maxRender).toLocaleString()} more)`;
    more.onclick = () => renderTopicList(list, maxRender + 500);
    ul.appendChild(more);
  }
  const curInfo = (state.modules.books || []).find(b => b.id === lib.cur) || {};
  const q = ($('#libFilter') && $('#libFilter').value || '').trim();
  if (!q && curInfo.totalTopics && curInfo.totalTopics > list.length) {
    $('#libCount').textContent = `Showing ${slice.length.toLocaleString()} of ~${curInfo.totalTopics.toLocaleString()} topics (use Filter to search)`;
  } else {
    $('#libCount').textContent = list.length ? `${list.length.toLocaleString()} topic${list.length === 1 ? '' : 's'}` : 'No topics';
  }
}

function scrollToBookmark(container, anchor) {
  if (!anchor || !container) return;
  const startName = String(anchor).replace(/-.*$/, '');
  const target = container.querySelector(`[id="bkm:${CSS.escape(startName)}"]`) || container.querySelector(`[id="bkm:${CSS.escape(anchor)}"]`);
  if (target) {
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const p = target.closest('p, div, span') || target.parentElement;
    if (p) { p.classList.add('flash'); setTimeout(() => p.classList.remove('flash'), 1400); }
  }
}

async function showTopic(id, tid, addHistory = true, anchor = null) {
  const t = await api.bookTopic(id, tid);
  if (!t) return;
  const effectiveTid = t.targetId != null ? t.targetId : tid;
  const effectiveAnchor = anchor || t.anchor || null;
  if (addHistory) { lib.history.push({ id, tid: effectiveTid, anchor: effectiveAnchor }); if (lib.history.length > 100) lib.history.shift(); }
  const info = (state.modules.books || []).find(b => b.id === id) || {};
  $('#libBody').innerHTML = `<div class="entry"><h4>${esc(t.subject)}</h4><div class="src">${esc(info.title || '')}</div>${TimotheosTools.bodyHtml(id, effectiveTid, sanitize(t.html) || '<p class="hint">(empty)</p>')}</div>`;
  TimotheosTools.applyMarks($('#libBody'));
  $('#libBody').scrollTop = 0;
  document.querySelectorAll('#libTopics li.cur').forEach(x => x.classList.remove('cur'));
  const li = document.querySelector(`#libTopics li[data-tid="${CSS.escape(String(tid))}"]`) || document.querySelector(`#libTopics li[data-tid="${CSS.escape(String(effectiveTid))}"]`);
  if (li) { li.classList.add('cur'); li.scrollIntoView({ block: 'nearest' }); }
  if (effectiveAnchor) scrollToBookmark($('#libBody'), effectiveAnchor);
  updateStepButtons();
}

let filterTimer = null;
function wireLibrary() {
  $('#libMod').onchange = () => { if ($('#libMod').value) openBookModule($('#libMod').value); };
  $('#libFilter').oninput = () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(async () => {
      const q = $('#libFilter').value.trim();
      if (!lib.cur) return;
      renderTopicList(q ? await api.bookSearch(lib.cur, q) : lib.topics);
    }, 180);
  };
  $('#libBack').onclick = () => { if (lib.history.length < 2) return; lib.history.pop(); const p = lib.history[lib.history.length - 1]; if (p.id !== lib.cur) openBookModule(p.id, p.tid, false, p.anchor); else showTopic(p.id, p.tid, false, p.anchor); };
  $('#libToday').onclick = () => openBookModule(lib.cur);
  $('#libInfo').onclick = () => { if (lib.cur) TimotheosProps.open(lib.cur); };
  $('#libCompress').onclick = () => { if (lib.cur) TimotheosProps.open(lib.cur, 'file'); };
  $('#libPrev').onclick = () => stepTopic(-1);
  $('#libNext').onclick = () => stepTopic(1);
  // [A1-A3] User module authoring buttons in Library bar
  const curTid = () => { const li = $('#libTopics li.cur'); return li ? (isNaN(+li.dataset.tid) ? li.dataset.tid : +li.dataset.tid) : null; };
  if ($('#libAddTopic')) $('#libAddTopic').onclick = () => { if (lib.cur) editUserTopicDialog(lib.cur, null, 0); };
  if ($('#libAddSub')) $('#libAddSub').onclick = () => { const tid = curTid(); if (lib.cur) editUserTopicDialog(lib.cur, null, tid || 0); };
  if ($('#libEditTopic')) $('#libEditTopic').onclick = async () => {
    const tid = curTid(); if (!lib.cur || tid == null) return;
    const info = (state.modules.books || []).find(b => b.id === lib.cur) || {};
    if (info.kind === 'commentary') return editUserCommentaryDialog(lib.cur);
    const t = await api.bookTopic(lib.cur, tid);
    const meta = lib.topics.find(x => String(x.id) === String(tid)) || {};
    if (t) editUserTopicDialog(lib.cur, Object.assign({}, meta, t), meta.pid || 0);
  };
  if ($('#libRenameTopic')) $('#libRenameTopic').onclick = async () => {
    const tid = curTid(); if (!lib.cur || tid == null) return;
    const meta = lib.topics.find(x => String(x.id) === String(tid));
    const res = await modal('Rename topic', `<label class="field">New title <input id="rnInput" type="text" value="${esc(meta ? meta.subject : '')}"></label>`, [{ label: 'Cancel', value: null }, { label: 'Rename', value: 'ok', primary: true }]);
    if (res === 'ok' && $('#rnInput').value.trim()) {
      await api.userModRenameTopic(lib.cur, tid, $('#rnInput').value.trim());
      const keep = lib.cur; lib.cur = null; await openBookModule(keep, tid, false);
    }
  };
  if ($('#libMoveUp')) $('#libMoveUp').onclick = async () => { const tid = curTid(); if (lib.cur && tid != null) { await api.userModMoveTopic(lib.cur, tid, -1); const keep = lib.cur; lib.cur = null; await openBookModule(keep, tid, false); } };
  if ($('#libMoveDown')) $('#libMoveDown').onclick = async () => { const tid = curTid(); if (lib.cur && tid != null) { await api.userModMoveTopic(lib.cur, tid, 1); const keep = lib.cur; lib.cur = null; await openBookModule(keep, tid, false); } };
  if ($('#libDelTopic')) $('#libDelTopic').onclick = async () => {
    const tid = curTid(); if (!lib.cur || tid == null) return;
    const meta = lib.topics.find(x => String(x.id) === String(tid));
    if (await confirmBox('Delete topic', `Delete <b>${esc(meta ? meta.subject : String(tid))}</b>?`)) {
      await api.userModDeleteTopic(lib.cur, tid);
      const keep = lib.cur; lib.cur = null; await openBookModule(keep);
    }
  };
  if ($('#newUserModBtn')) $('#newUserModBtn').onclick = () => newUserModuleDialog();

  $('#libTopics').addEventListener('keydown', e => {
    const k = { ArrowUp: -1, ArrowDown: 1, PageUp: -15, PageDown: 15, Home: -1e6, End: 1e6 }[e.key];
    if (k == null && e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    if (k != null) stepTopic(k);
  });
  $('#tab-lib').addEventListener('keydown', e => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); e.stopPropagation(); stepTopic(e.key === 'ArrowLeft' ? -1 : 1); }
  });
  const ap = () => TimotheosOptions.appearance();
  const applySide = () => {
    const a = ap(); const w = Math.max(0, Math.min(4000, a.libSideW == null ? 230 : a.libSideW));
    $('#libSplit').style.gridTemplateColumns = a.libSideHidden ? 'minmax(0, 1fr)' : `${w}px 6px minmax(0, 1fr)`;
    $('#libSide').classList.toggle('collapsed', !a.libSideHidden && w === 0);
    $('#libSide').classList.toggle('hidden', !!a.libSideHidden); $('#libSplitter').classList.toggle('hidden', !!a.libSideHidden);
    $('#libSideBtn').classList.toggle('on', !a.libSideHidden);
  };
  window.applyLibSide = applySide;
  applySide();
  $('#libSideBtn').onclick = () => { const a = ap(); a.libSideHidden = !a.libSideHidden; a.libSideW = 230; window.save({ appearance: a }); applySide(); };
  const sp = $('#libSplitter');
  sp.addEventListener('pointerdown', e => {
    e.preventDefault(); try { sp.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ }
    const x0 = e.clientX, w0 = $('#libSide').offsetWidth;
    const max = () => Math.max(0, $('#libSplit').offsetWidth - 6); // all the way to either edge of the panel
    const move = ev => { const a = ap(); a.libSideW = Math.round(Math.max(0, Math.min(max(), w0 + ev.clientX - x0))); applySide(); };
    const up = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); document.removeEventListener('pointerup', up); window.save({ appearance: ap() }); };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up); document.addEventListener('pointerup', up);
  });
  sp.addEventListener('dblclick', () => { const a = ap(); a.libSideW = 230; window.save({ appearance: a }); applySide(); });
  $('#importBtn').onclick = () => importModules();
  wireDrop();
}

function stepTopic(d) {
  const items = [...document.querySelectorAll('#libTopics li[data-tid]')]; if (!items.length || !lib.cur) return;
  const cur = items.findIndex(li => li.classList.contains('cur'));
  const i = Math.max(0, Math.min(items.length - 1, cur < 0 ? (d > 0 ? 0 : items.length - 1) : cur + d));
  if (i === cur) return;
  const tid = items[i].dataset.tid; const t = lib.topics.find(x => String(x.id) === tid);
  showTopic(lib.cur, t ? t.id : isNaN(+tid) ? tid : +tid);
}
function updateStepButtons() {
  const items = [...document.querySelectorAll('#libTopics li[data-tid]')]; const cur = items.findIndex(li => li.classList.contains('cur'));
  $('#libPrev').disabled = cur <= 0; $('#libNext').disabled = cur < 0 ? !items.length : cur >= items.length - 1;
  $('#libBack').disabled = lib.history.length < 2;
}

/* ---------------- Commentary tab (0.5.6 Design 2: Accordance Header Dropdown + Stepper + Single | All Hits Feed) ---------------- */
let cmtSeq = 0;
let lastCmtList = [];
const collapsedCards = new Set();

function disambiguateCommentaries(list) {
  const counts = {};
  for (const x of list) {
    const k = String(x.abbr || "").trim().toLowerCase();
    counts[k] = (counts[k] || 0) + 1;
  }
  for (const x of list) {
    const k = String(x.abbr || "").trim().toLowerCase();
    if (counts[k] > 1) {
      const stem = String(x.id || "").replace(/^bm:/, "").replace(/\.[^.]+(\.twm)?$/i, "");
      const ext = /\.cmti$/i.test(x.id) ? "cmti" : /\.cmtx$/i.test(x.id) ? "cmtx" : /\.twm$/i.test(x.id) ? "twm" : "";
      x.displayAbbr = stem && stem.toLowerCase() !== k ? `${x.abbr} (${stem})` : `${x.abbr}${ext ? " · " + ext : ""}`;
    } else {
      x.displayAbbr = x.abbr;
    }
  }
  return list;
}

function cmtMode() {
  return (state.settings && state.settings.cmtMode === "all") ? "all" : "single";
}

function setCmtMode(mode) {
  const m = mode === "all" ? "all" : "single";
  if (state.settings) {
    state.settings.cmtMode = m;
    if (window.save) window.save({ cmtMode: m });
  }
  updateCommentary();
}

function stepCommentary(d) {
  if (!lastCmtList.length) return;
  const hits = lastCmtList.filter(x => x.hit);
  const pool = hits.length ? hits : lastCmtList;
  const curIdx = pool.findIndex(x => x.id === lib.cmtSel);
  const nextIdx = curIdx < 0 ? 0 : (curIdx + d + pool.length) % pool.length;
  lib.cmtSel = pool[nextIdx].id;
  if (cmtMode() === "all") {
    const card = document.querySelector(`#cmtBody .cmtcard[data-cid="${CSS.escape(lib.cmtSel)}"]`);
    if (card) {
      card.classList.remove("collapsed");
      collapsedCards.delete(lib.cmtSel);
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      syncCmtHeaderBar(lastCmtList);
      return;
    }
  }
  updateCommentary();
}

function syncCmtHeaderBar(list) {
  const hits = list.filter(x => x.hit);
  const sel = list.find(x => x.id === lib.cmtSel) || list[0];
  const dropBtn = $("#cmtDropBtn"), dropLbl = $("#cmtDropLbl"), dropMeta = $("#cmtDropMeta");
  const prevBtn = $("#cmtPrevBtn"), nextBtn = $("#cmtNextBtn");
  const mSingle = $("#cmtModeSingle"), mAll = $("#cmtModeAll");
  const mode = cmtMode();

  if (mSingle) mSingle.classList.toggle("on", mode === "single");
  if (mAll) {
    mAll.classList.toggle("on", mode === "all");
    mAll.textContent = hits.length ? `All Hits (${hits.length})` : "All Hits";
  }
  if (prevBtn) prevBtn.disabled = hits.length < 2 && list.length < 2;
  if (nextBtn) nextBtn.disabled = hits.length < 2 && list.length < 2;

  if (!sel) {
    if (dropLbl) dropLbl.textContent = "—";
    if (dropMeta) dropMeta.textContent = "";
    if (dropBtn) dropBtn.disabled = true;
    return;
  }
  if (dropBtn) {
    dropBtn.disabled = false;
    dropBtn.title = `${sel.title} — Click to choose commentary (${hits.length} of ${list.length} have notes on this verse) · Scroll wheel to step`;
  }
  const dot = !sel.hit ? "" : sel.hit.level === "verse" ? '<span class="dot full" title="Exact verse comment"></span>' : `<span class="dot light" title="${esc(sel.hit.level)} comment"></span>`;
  if (dropLbl) dropLbl.innerHTML = `<b>${esc(sel.displayAbbr || sel.abbr)}</b>${dot}`;
  if (dropMeta) {
    const hitIdx = hits.findIndex(x => x.id === sel.id);
    dropMeta.textContent = hitIdx >= 0 ? `(${hitIdx + 1} of ${hits.length})` : `(0 of ${hits.length})`;
  }
}

function openCmtMenu(anchorBtn) {
  document.querySelectorAll(".bvmenu").forEach(m => m.remove());
  if (!lastCmtList.length) return;
  const m = document.createElement("div");
  m.className = "menu bvmenu cmtmenu";
  let hideEmpty = !!(state.settings && state.settings.cmtHideEmpty);
  let q = "";

  const { b, c, v } = state.ref;
  const bk = (state.nav.find(x => x.id === b) || { name: "" }).name;
  const hitsCount = lastCmtList.filter(x => x.hit).length;

  const draw = () => {
    const ql = q.trim().toLowerCase();
    const matchQ = x => !ql || (x.displayAbbr || x.abbr || "").toLowerCase().includes(ql) || (x.title || "").toLowerCase().includes(ql);
    const verseHits = lastCmtList.filter(x => x.hit && x.hit.level === "verse" && matchQ(x));
    const broaderHits = lastCmtList.filter(x => x.hit && x.hit.level !== "verse" && matchQ(x));
    const emptyMods = lastCmtList.filter(x => !x.hit && (!hideEmpty || x.user || !!ql) && matchQ(x));

    const itemBtn = x => {
      const isCur = x.id === lib.cmtSel;
      const dot = !x.hit ? '<span class="cm-dot none"></span>' : x.hit.level === "verse" ? '<span class="dot full"></span>' : '<span class="dot light"></span>';
      const badge = x.hit
        ? (x.hit.level === "verse" ? `<span class="cm-scope verse">${esc(bk)} ${c}:${v}</span>` : `<span class="cm-scope broad">${esc(x.hit.level)}: ${esc(x.hit.subject)}</span>`)
        : (x.user ? '<span class="cm-scope user">+ write note</span>' : '<span class="cm-scope empty">no note</span>');
      return `<button type="button" class="cm-item ${isCur ? "on" : ""} ${x.hit ? "has-hit" : "no-hit"}" data-cid="${esc(x.id)}">
        ${dot}
        <span class="cm-abbr">${esc(x.displayAbbr || x.abbr)}</span>
        <span class="cm-ttl">${esc(x.title)}</span>
        ${badge}
      </button>`;
    };

    let listHtml = "";
    if (verseHits.length) {
      listHtml += `<div class="mh">● Verse Comments (${verseHits.length})</div>` + verseHits.map(itemBtn).join("");
    }
    if (broaderHits.length) {
      listHtml += `<div class="mh">○ Passage &amp; Chapter Notes (${broaderHits.length})</div>` + broaderHits.map(itemBtn).join("");
    }
    if (emptyMods.length) {
      listHtml += `<div class="mh">No Comment on ${esc(bk)} ${c}:${v} (${emptyMods.length})</div>` + emptyMods.map(itemBtn).join("");
    }
    if (!listHtml) {
      listHtml = `<div class="small" style="padding:10px 12px">No matching commentaries found.</div>`;
    }

    const listBox = m.querySelector(".cm-list");
    if (listBox) listBox.innerHTML = listHtml;
    m.querySelectorAll(".cm-item[data-cid]").forEach(bt => {
      bt.onclick = () => {
        lib.cmtSel = bt.dataset.cid;
        m.remove();
        if (cmtMode() === "all") {
          const card = document.querySelector(`#cmtBody .cmtcard[data-cid="${CSS.escape(lib.cmtSel)}"]`);
          if (card) {
            card.classList.remove("collapsed");
            collapsedCards.delete(lib.cmtSel);
            card.scrollIntoView({ behavior: "smooth", block: "start" });
            syncCmtHeaderBar(lastCmtList);
            return;
          }
          setCmtMode("single");
          return;
        }
        updateCommentary();
      };
    });
  };

  m.innerHTML = `
    <div class="cm-top">
      <input id="cmtMenuFilter" type="search" placeholder="Find commentary (${lastCmtList.length} modules)…" spellcheck="false" autocomplete="off">
      <label class="cm-hide-lbl" title="Hide commentaries that have no entry on ${esc(bk)} ${c}:${v}">
        <input type="checkbox" id="cmtHideEmptyCb" ${hideEmpty ? "checked" : ""}>
        <span>Hits only (${hitsCount}/${lastCmtList.length})</span>
      </label>
    </div>
    <div class="cm-list"></div>
    <div class="cm-foot">
      <button type="button" id="cmNewUserBtn">+ New user commentary…</button>
      <button type="button" id="cmAllHitsBtn" class="primary">View All ${hitsCount} Hits Stacked</button>
    </div>`;

  document.body.appendChild(m);
  draw();

  const r = anchorBtn.getBoundingClientRect();
  const mw = Math.min(420, innerWidth - 16);
  m.style.width = mw + "px";
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - mw - 8)) + "px";
  const topPos = r.bottom + 4;
  if (topPos + 340 > innerHeight && r.top > 260) {
    m.style.top = Math.max(8, r.top - Math.min(380, r.top - 12)) + "px";
    m.style.maxHeight = (r.top - 16) + "px";
  } else {
    m.style.top = topPos + "px";
    m.style.maxHeight = Math.max(180, innerHeight - topPos - 12) + "px";
  }

  const fi = m.querySelector("#cmtMenuFilter");
  if (fi) {
    setTimeout(() => fi.focus(), 20);
    fi.oninput = () => { q = fi.value; draw(); };
    fi.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        const first = m.querySelector(".cm-item[data-cid]");
        if (first) first.click();
      } else if (e.key === "Escape") {
        m.remove();
      }
    };
  }
  const cb = m.querySelector("#cmtHideEmptyCb");
  if (cb) {
    cb.onchange = () => {
      hideEmpty = cb.checked;
      if (state.settings) {
        state.settings.cmtHideEmpty = hideEmpty;
        if (window.save) window.save({ cmtHideEmpty: hideEmpty });
      }
      draw();
    };
  }
  const newBtn = m.querySelector("#cmNewUserBtn");
  if (newBtn) newBtn.onclick = () => { m.remove(); newUserModuleDialog("commentary"); };
  const allBtn = m.querySelector("#cmAllHitsBtn");
  if (allBtn) allBtn.onclick = () => { m.remove(); setCmtMode("all"); };

  const curEl = m.querySelector(".cm-item.on");
  if (curEl) curEl.scrollIntoView({ block: "nearest" });

  setTimeout(() => {
    document.addEventListener("mousedown", function off(e) {
      if (!m.contains(e.target) && e.target !== anchorBtn && !anchorBtn.contains(e.target)) {
        m.remove();
        document.removeEventListener("mousedown", off, true);
      }
    }, true);
  }, 0);
}

async function updateCommentary() {
  const { b, c, v } = state.ref; const seq = ++cmtSeq;
  const rawList = await api.commentaries(b, c, v).catch(() => []);
  if (seq !== cmtSeq) return;
  const list = disambiguateCommentaries(rawList);
  lastCmtList = list;
  const bk = (state.nav.find(x => x.id === b) || { name: "" }).name;
  $("#cmtHead").textContent = list.length ? `${bk} ${c}:${v}` : "";

  // Populate hidden #cmtTabs for legacy compatibility
  const tabs = $("#cmtTabs");
  if (tabs) {
    tabs.innerHTML = "";
    for (const x of list) {
      const btn = document.createElement("button");
      btn.textContent = x.displayAbbr || x.abbr;
      btn.className = "chip" + (x.id === lib.cmtSel ? " active" : "") + (x.hit ? "" : " none");
      btn.onclick = () => { lib.cmtSel = x.id; updateCommentary(); };
      tabs.appendChild(btn);
    }
  }

  if (!list.length) {
    syncCmtHeaderBar([]);
    $("#cmtBody").innerHTML = `<p class="hint">No commentaries yet. Import theWord (.cmt.twm) or e-Sword (.cmtx / .cmti) commentaries with <b>Import modules…</b>, or create your own commentary below.</p><div class="row"><button id="cmtCreateUserBtn" class="primary">+ New user commentary…</button></div>`;
    const btn = $("#cmtCreateUserBtn"); if (btn) btn.onclick = () => newUserModuleDialog("commentary");
    return;
  }

  if (!list.some(x => x.id === lib.cmtSel)) {
    const firstVerseHit = list.find(x => x.hit && x.hit.level === "verse");
    lib.cmtSel = (firstVerseHit || list.find(x => x.hit) || list[0]).id;
  }

  syncCmtHeaderBar(list);

  // Mode 2 ("All Hits"): Accordance-style Stacked Feed of all matching commentaries
  if (cmtMode() === "all") {
    const verseOnly = !!(state.settings && state.settings.cmtFeedVerseOnly);
    const allHits = list.filter(x => x.hit);
    const verseHits = allHits.filter(x => x.hit.level === "verse");
    const activeHits = (verseOnly ? verseHits : allHits).slice().sort((a, z) => {
      const rank = lv => ({ verse: 0, passage: 1, chapter: 2, book: 3 }[lv] ?? 4);
      return rank(a.hit.level) - rank(z.hit.level) || (a.displayAbbr || a.abbr).localeCompare(z.displayAbbr || z.abbr);
    });

    if (!allHits.length) {
      $("#cmtBody").innerHTML = `<p class="hint">None of your ${list.length} commentaries have a note on <b>${esc(bk)} ${c}:${v}</b>.</p>`;
      return;
    }

    const topics = await Promise.all(activeHits.map(x => api.bookTopic(x.id, x.hit.id).catch(() => null)));
    if (seq !== cmtSeq) return;

    const filterBar = `
      <div class="cmtfeed-bar">
        <div class="cviewsw">
          <button type="button" id="cfAllScopes" class="${!verseOnly ? "on" : ""}" title="Show verse, passage, chapter, and book comments">●+○ All Notes (${allHits.length})</button>
          <button type="button" id="cfVerseOnly" class="${verseOnly ? "on" : ""}" title="Show only exact verse comments on ${esc(bk)} ${c}:${v}">● Verse Only (${verseHits.length})</button>
        </div>
        <span class="grow"></span>
        <button type="button" id="cfExpandAll" class="nplink" title="Expand all cards">Expand all</button>
        <button type="button" id="cfCollapseAll" class="nplink" title="Collapse all cards to titles">Collapse all</button>
      </div>`;

    const cardsHtml = activeHits.map((x, idx) => {
      const t = topics[idx];
      const isCol = collapsedCards.has(x.id);
      const isVerse = x.hit.level === "verse";
      const dot = isVerse ? '<span class="dot full" title="Exact verse comment"></span>' : '<span class="dot light" title="Passage / chapter comment"></span>';
      const lvlBadge = isVerse ? esc(x.hit.subject) : `${esc(x.hit.level)}: ${esc(x.hit.subject)}`;
      const bodyContent = t ? TimotheosTools.bodyHtml(x.id, x.hit.id, sanitize(t.html)) : '<p class="hint">(empty)</p>';
      return `
        <article class="cmtcard ${isCol ? "collapsed" : ""} ${x.id === lib.cmtSel ? "active" : ""}" data-cid="${esc(x.id)}">
          <header class="cmtcard-hdr" data-toggle-card="${esc(x.id)}">
            <span class="cc-chev">${isCol ? "▸" : "▾"}</span>
            ${dot}
            <b class="cc-abbr">${esc(x.displayAbbr || x.abbr)}</b>
            <span class="cc-title">${esc(x.title)}</span>
            <span class="grow"></span>
            <span class="cm-scope ${isVerse ? "verse" : "broad"}">${lvlBadge}</span>
            ${x.user ? `<button type="button" class="cc-btn" data-edit-cmt="${esc(x.id)}" title="Edit this comment">✎</button>` : ""}
            <button type="button" class="cc-btn" data-focus-cmt="${esc(x.id)}" title="Read only ${esc(x.displayAbbr || x.abbr)} in Single view">Single</button>
          </header>
          <div class="cmtcard-body entry">${bodyContent}</div>
        </article>`;
    }).join("");

    $("#cmtBody").innerHTML = filterBar + (`<div class="cmtfeed">${cardsHtml || '<p class="hint">No exact verse comments on this verse. Click <b>●+○ All Notes</b> above to see chapter/passage notes.</p>'}</div>`);
    TimotheosTools.applyMarks($("#cmtBody"));
    $("#cmtBody").scrollTop = 0;

    const bAll = $("#cfAllScopes"), bVerse = $("#cfVerseOnly"), bExp = $("#cfExpandAll"), bCol = $("#cfCollapseAll");
    if (bAll) bAll.onclick = () => { state.settings.cmtFeedVerseOnly = false; if (window.save) window.save({ cmtFeedVerseOnly: false }); updateCommentary(); };
    if (bVerse) bVerse.onclick = () => { state.settings.cmtFeedVerseOnly = true; if (window.save) window.save({ cmtFeedVerseOnly: true }); updateCommentary(); };
    if (bExp) bExp.onclick = () => { collapsedCards.clear(); document.querySelectorAll("#cmtBody .cmtcard").forEach(c => { c.classList.remove("collapsed"); const ch = c.querySelector(".cc-chev"); if (ch) ch.textContent = "▾"; }); };
    if (bCol) bCol.onclick = () => { activeHits.forEach(x => collapsedCards.add(x.id)); document.querySelectorAll("#cmtBody .cmtcard").forEach(c => { c.classList.add("collapsed"); const ch = c.querySelector(".cc-chev"); if (ch) ch.textContent = "▸"; }); };

    $("#cmtBody").onclick = e => {
      const edBtn = e.target.closest("[data-edit-cmt]");
      if (edBtn) { e.stopPropagation(); editUserCommentaryDialog(edBtn.dataset.editCmt); return; }
      const fBtn = e.target.closest("[data-focus-cmt]");
      if (fBtn) { e.stopPropagation(); lib.cmtSel = fBtn.dataset.focusCmt; setCmtMode("single"); return; }
      const hdr = e.target.closest("[data-toggle-card]");
      if (hdr) {
        const cid = hdr.dataset.toggleCard;
        const card = hdr.closest(".cmtcard");
        if (!card) return;
        const nowCol = card.classList.toggle("collapsed");
        if (nowCol) collapsedCards.add(cid); else collapsedCards.delete(cid);
        const chev = card.querySelector(".cc-chev");
        if (chev) chev.textContent = nowCol ? "▸" : "▾";
      }
    };
    return;
  }

  // Mode 1 ("Single"): Single selected commentary view
  const sel = list.find(x => x.id === lib.cmtSel) || list[0];
  const editBar = sel.user ? `<div class="row tight" style="margin-bottom:6px"><button id="cmtEditUserBtn" class="primary">${sel.hit ? "✎ Edit comment…" : "+ Write comment on " + esc(bk) + " " + c + ":" + v + "…"}</button></div>` : "";
  if (!sel.hit) {
    const avail = list.filter(x => x.hit);
    const quickPills = avail.length
      ? `<div class="cmt-avail"><div class="small" style="margin-bottom:6px"><b>${avail.length} commentar${avail.length === 1 ? "y has" : "ies have"} a note on ${esc(bk)} ${c}:${v}:</b></div><div class="chips">${avail.map(x => `<button type="button" class="chip" data-jump-cmt="${esc(x.id)}" title="${esc(x.title)}">${esc(x.displayAbbr || x.abbr)}${x.hit.level === "verse" ? '<span class="dot full"></span>' : '<span class="dot light"></span>'}</button>`).join("")}</div></div>`
      : "";
    $("#cmtBody").innerHTML = `${editBar}<p class="hint"><b>${esc(sel.title)}</b> has no comment on ${esc(bk)} ${c}:${v}.</p>${quickPills}`;
    const eb = $("#cmtEditUserBtn"); if (eb) eb.onclick = () => editUserCommentaryDialog(sel.id);
    $("#cmtBody").querySelectorAll("[data-jump-cmt]").forEach(bt => {
      bt.onclick = () => { lib.cmtSel = bt.dataset.jumpCmt; updateCommentary(); };
    });
    return;
  }
  const t = await api.bookTopic(sel.id, sel.hit.id);
  if (seq !== cmtSeq) return;
  const lvl = { verse: "", passage: "Comment on the passage", chapter: "Comment on the whole chapter", book: "Introduction to the book" }[sel.hit.level];
  $("#cmtBody").innerHTML = `${editBar}<div class="entry"><h4>${esc(sel.hit.subject)}</h4><div class="src">${esc(sel.title)}${lvl ? " · " + lvl : ""}</div>${t ? TimotheosTools.bodyHtml(sel.id, sel.hit.id, sanitize(t.html)) : ""}</div>`;
  const eb = $("#cmtEditUserBtn"); if (eb) eb.onclick = () => editUserCommentaryDialog(sel.id);
  TimotheosTools.applyMarks($("#cmtBody"));
  $("#cmtBody").scrollTop = 0;
  if (sel.hit.anchor) scrollToBookmark($("#cmtBody"), sel.hit.anchor);
}

/* ---------------- Bible view decorations: cross-references, commentary marks ---------------- */
async function decorateChapter(b, c, root, show) {
  const [xr, marks] = await Promise.all([
    show.xrefs ? api.xrefsChapter(b, c).catch(() => ({})) : {},
    show.cmtLinks ? api.commentaryMarks(b, c).catch(() => ({})) : {},
  ]);
  const sec = root.closest('.bv'); if (sec && sec.dataset.ref !== `${b}.${c}`) return;
  if (state.ref.b === b && state.ref.c === c) { lib.xr = xr; lib.marks = marks; }
  for (const tr of root.querySelectorAll('tr[data-v]')) {
    const v = +tr.dataset.v;
    const refs = xr[v] || [];
    const cells = tr.querySelectorAll('td:not(.vn)');
    const last = cells[cells.length - 1];
    if (refs.length && last) {
      const shown = refs.slice(0, 8).map(r => `<a class="xr${r.back ? ' back' : ''}${r.user ? ' mine' : ''}" data-xr="${r.b}.${r.c}.${r.v}.${r.span}">${r.back ? '[' : ''}${esc(abbrRef(r.b, r.c, r.v, r.span))}${r.back ? ']' : ''}</a>`).join('; ');
      last.insertAdjacentHTML('beforeend', `<div class="xrs" data-v="${v}">${shown}${refs.length > 8 ? ` <a class="xrmore" data-v="${v}">+${refs.length - 8} more</a>` : ''}</div>`);
    }
    const cm = Object.entries(marks).filter(([, m]) => m.verses.includes(v));
    if (cm.length) tr.querySelector('td.vn').insertAdjacentHTML('beforeend', `<span class="cm" title="Commentary: ${esc(cm.map(([, m]) => m.abbr).join(', '))}">c</span>`);
  }
  function abbrRef(bb, cc, vv, span) { const k = state.nav.find(x => x.id === bb); return `${k ? k.abbr : (window.BOOK_ABBR && window.BOOK_ABBR[bb]) || bb} ${cc}:${vv}${span ? '–' + (vv + span) : ''}`; }
}

async function showAllXrefs(v) {
  const { b, c } = state.ref;
  const refs = lib.xr[v] || [];
  const parts = [`<div class="entry"><h4>Cross-references for ${esc((state.nav.find(x => x.id === b) || {}).name || '')} ${c}:${v}</h4><div class="src">[brackets] = verses that point here · ★ = yours</div></div>`];
  for (const r of refs) {
    const prev = await versePreview(r.b, r.c, r.v, r.v + r.span);
    parts.push(prev.replace('<div class="entry">', `<div class="entry">${r.user ? `<button class="rmx" data-from="${b}.${c}.${v}" data-to="${r.b}.${r.c}.${r.v}" title="Delete this cross-reference">×</button>` : ''}${r.back ? '<span class="small">[points here]</span> ' : ''}${r.user ? '★ ' : ''}`));
  }
  parts.push(`<div class="row"><button class="addx" data-v="${v}">Add a cross-reference…</button></div>`);
  setLookupHtml(parts.join(''), true, 'Cross-references');
  openTab('lib');
}

async function addXref(v) {
  const { b, c } = state.ref;
  const name = (state.nav.find(x => x.id === b) || {}).name || '';
  const val = await modal(`Add a cross-reference on ${name} ${c}:${v}`, '<label class="field">Points to (e.g. Rom 5:8 or Isa 53:4-6)<input id="xrInput" type="text" spellcheck="false"></label><p class="small">Saved in your own cross-reference set (“My cross-references”), in theWord’s format.</p>', [{ label: 'Cancel', value: null }, { label: 'Add', value: 'ok', primary: true }]);
  if (val !== 'ok') return;
  const txt = ($('#xrInput') || {}).value || '';
  const r = await api.parseRef(txt);
  if (!r) return messageBox('Not a reference', `Timotheos could not read “${esc(txt)}” as a Bible reference.`);
  const m = /[-–]\s*(\d+)\s*$/.exec(txt);
  await api.xrefsAdd({ b, c, v }, { b: r.b, c: r.c, v: r.v, v2: m ? +m[1] : r.v });
  state.settings.show.xrefs = true;
  await window.renderChapter(false);
}

/* ---------------- word lookup (click a word) ---------------- */
async function lookupWord(word) {
  const w = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  if (!w || w.length < 2) return;
  return window.showLookup({ word: w });
}

function wordAt(e) {
  const r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
  if (!r || r.startContainer.nodeType !== 3) return '';
  const node = r.startContainer;
  const scope = node.parentElement.closest('[data-col], td, .lookup, .pv') || node.parentElement;
  const nodes = []; const w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('sup') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  let n; while ((n = w.nextNode())) nodes.push(n);
  let text = '', pos = -1;
  for (const t of nodes) { if (t === node) pos = text.length + r.startOffset; text += t.textContent; }
  if (pos < 0) { text = node.textContent; pos = r.startOffset; }
  const isL = ch => /[\p{L}\p{M}\p{N}'’-]/u.test(ch);
  let i = pos, j = pos;
  while (i > 0 && isL(text[i - 1])) i--; while (j < text.length && isL(text[j])) j++;
  return text.slice(i, j);
}

/* ---------------- [B1] link handling & bookmark range popups for book modules ---------------- */
/**
 * Extract HTML slice for a bookmark range:
 *   #bkm          -> from bkm to end of topic
 *   #bkm-         -> from bkm to next bookmark (standard footnote popup)
 *   #bkm1-bkm2    -> from bkm1 up to bkm2
 */
function extractBookmarkSlice(html, hash) {
  if (!html || !hash) return html;
  const cleanHash = String(hash).replace(/^#/, '').split('|')[0];
  let startBkm = cleanHash, endBkm = null, nextOnly = false;
  if (cleanHash.endsWith('-')) {
    startBkm = cleanHash.slice(0, -1);
    nextOnly = true;
  } else if (cleanHash.includes('-')) {
    const idx = cleanHash.indexOf('-');
    const a = cleanHash.slice(0, idx), b = cleanHash.slice(idx + 1);
    if (html.includes(`id="bkm:${a}"`) && html.includes(`id="bkm:${b}"`)) {
      startBkm = a; endBkm = b;
    }
  }
  const startTag = `<a class="bkm" id="bkm:${startBkm}"></a>`;
  const pos0 = html.indexOf(startTag);
  if (pos0 < 0) return html;
  const rest = html.slice(pos0 + startTag.length);
  if (endBkm) {
    const endTag = `<a class="bkm" id="bkm:${endBkm}"></a>`;
    const pos1 = rest.indexOf(endTag);
    return pos1 >= 0 ? rest.slice(0, pos1) : rest;
  }
  if (nextOnly) {
    const nextMatch = /<a class="bkm" id="bkm:[^"]*"><\/a>/.exec(rest);
    return nextMatch ? rest.slice(0, nextMatch.index) : rest;
  }
  return rest;
}

async function resolveBookLinkTarget(href, contextEl) {
  // tw://[type.]module[?parameters][#start_bkm[-end_bkm]][|annotation]
  const rawHref = String(href || '').split('|')[0];
  const hashMatch = /#([^|]+)$/.exec(rawHref);
  const hash = hashMatch ? decodeURIComponent(hashMatch[1]) : null;
  const popupMatch = /[?&]popup=(\d)/i.exec(rawHref);
  const popupMode = popupMatch ? +popupMatch[1] : null;
  const m = /^tw:\/\/(?:(dct|bk|cmt|map|dev)\.([^?#]+)|\[(self)\])(?:\?([^#]*))?/i.exec(rawHref);
  if (!m) return null;
  const books = state.modules.books || [];
  let id = null;
  if (m[3]) {
    const ebody = contextEl && contextEl.closest && contextEl.closest('.ebody[data-amod]');
    id = (ebody && ebody.dataset.amod) || lib.cur;
  } else {
    const want = decodeURIComponent(m[2]).toLowerCase();
    for (const b of books) {
      if ((b.abbr || '').toLowerCase() === want || (b.name || '').toLowerCase().startsWith(want) || b.id.toLowerCase() === 'bm:' + want) { id = b.id; break; }
    }
    if (!id) {
      for (const b of books) {
        const i = await api.bookOpen(b.id).catch(() => null);
        if (i && ((i.abbr || '').toLowerCase() === want)) { id = b.id; break; }
      }
    }
  }
  if (!id) return null;
  const q = m[4] || '';
  const tidM = /(?:^|&)tid=(\d+)/i.exec(q);
  const tM = /(?:^|&)t=([^&]*)/i.exec(q);
  let tid = tidM ? +tidM[1] : null;
  if (tid == null && tM) {
    const r = await api.bookLookup(id, decodeURIComponent(tM[1] || ''));
    if (r) tid = r.id;
  }
  if (tid == null && m[3]) {
    const ebody = contextEl && contextEl.closest && contextEl.closest('.ebody[data-atid]');
    if (ebody && ebody.dataset.atid) tid = isNaN(+ebody.dataset.atid) ? ebody.dataset.atid : +ebody.dataset.atid;
  }
  return { id, tid, hash, popupMode };
}

async function followBookLink(href) {
  const tgt = await resolveBookLinkTarget(href, null);
  if (!tgt || tgt.tid == null) return false;
  await openBookModule(tgt.id, tgt.tid, true, tgt.hash);
  return true;
}

/* ---------------- wiring ---------------- */
function wireModules() {
  wireLibrary();
  const cDrop = $("#cmtDropBtn"), cPrev = $("#cmtPrevBtn"), cNext = $("#cmtNextBtn"), cSw = $("#cmtViewSw");
  if (cDrop) {
    cDrop.onclick = e => { e.stopPropagation(); openCmtMenu(cDrop); };
    cDrop.addEventListener("wheel", e => { e.preventDefault(); stepCommentary(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  }
  if (cPrev) cPrev.onclick = () => stepCommentary(-1);
  if (cNext) cNext.onclick = () => stepCommentary(1);
  if (cSw) {
    cSw.onclick = e => {
      const bt = e.target.closest("button[data-cmode]");
      if (bt) setCmtMode(bt.dataset.cmode);
    };
  }
  document.addEventListener('click', async e => {
    const xr = e.target.closest('a.xr');
    if (xr) { e.preventDefault(); e.stopPropagation(); const [b, c, v] = xr.dataset.xr.split('.').map(Number); return go({ b, c, v }); }
    const more = e.target.closest('a.xrmore'); if (more) { e.stopPropagation(); return showAllXrefs(+more.dataset.v); }
    const rmx = e.target.closest('button.rmx');
    if (rmx) { e.stopPropagation(); const [b, c, v] = rmx.dataset.from.split('.').map(Number); const [tb, tc, tv] = rmx.dataset.to.split('.').map(Number); await api.xrefsRemove({ b, c, v }, { b: tb, c: tc, v: tv }); await window.renderChapter(false); return showAllXrefs(v); }
    const addx = e.target.closest('button.addx'); if (addx) { e.stopPropagation(); return addXref(+addx.dataset.v); }
    const bl = e.target.closest('a[data-book]'); if (bl) { e.stopPropagation(); return openBookModule(bl.dataset.book, isNaN(+bl.dataset.tid) ? bl.dataset.tid : +bl.dataset.tid); }
    const cm = e.target.closest('td.vn span.cm'); if (cm) setTimeout(() => openTab('cmt'), 0);
  }, true);
  $('#libSpeak').onclick = () => TimotheosSpeech.speakTopic($('#libSpeak'));
  $('#workbench').addEventListener('click', e => {
    if (e.target.closest('a, sup, td.vn, [data-strong], [data-morph], .xrs')) return;
    if (!e.target.closest('.bv td') || String(window.getSelection())) return;
    const w = wordAt(e); if (w) lookupWord(w);
  });
  // [B1 & B4] Hover preview for Bible links AND book/footnote bookmark links
  document.addEventListener('mouseover', async e => {
    const a = e.target.closest && e.target.closest('a[data-href]');
    if (!a || a.closest('#popup')) return;
    const href = a.dataset.href || '';
    const popupParam = /[?&]popup=(\d)/i.exec(href);
    const popupMode = popupParam ? +popupParam[1] : 1;
    if (popupMode === 0) return;
    if (popupMode === 2 && !e.ctrlKey) return;

    if (/^tw:\/\/bible/i.test(href) && !a.closest('.bv')) {
      const bm = /^tw:\/\/bible\.([^?#]*)/i.exec(href);
      const modSpec = bm ? bm[1] : '*';
      const m = /[?&|]id=(\d+)\.(\d+)(?:\.(\d+))?(?:-\d+\.\d+\.(\d+))?/.exec(href);
      if (!m) return;
      await new Promise(r => setTimeout(r, 320));
      if (!a.matches(':hover')) return;
      const v = m[3] ? +m[3] : 1;
      const html = await versePreview(+m[1], +m[2], v, m[4] ? +m[4] : v, modSpec);
      if (a.matches(':hover') && html) window.showPopupHtml(a, html);
      return;
    }

    if (/^tw:\/\/(dct|bk|cmt|map|dev)\.|^tw:\/\/\[self\]/i.test(href)) {
      await new Promise(r => setTimeout(r, 320));
      if (!a.matches(':hover')) return;
      const tgt = await resolveBookLinkTarget(href, a);
      if (!tgt || tgt.tid == null) return;
      const topic = await api.bookTopic(tgt.id, tgt.tid).catch(() => null);
      if (!topic || !a.matches(':hover')) return;
      const slice = tgt.hash ? extractBookmarkSlice(topic.html, tgt.hash) : topic.html;
      const info = (state.modules.books || []).find(b => b.id === tgt.id) || {};
      const html = `<div class="entry"><h4>${esc(topic.subject)}</h4><div class="src">${esc(info.title || '')}</div>${sanitize(slice)}</div>`;
      window.showPopupHtml(a, html);
    }
  });
  document.addEventListener('mouseover', async e => {
    const a = e.target.closest('a.xr'); if (!a) return;
    const [b, c, v, span] = a.dataset.xr.split('.').map(Number);
    a.title = '';
    const html = await versePreview(b, c, v, v + span);
    if (a.matches(':hover')) window.showPopupHtml(a, html);
  });
}

window.TimotheosModules = { lib, stepTopic, renderLibraryList, fillLibSelect, updateCommentary, decorateChapter, followBookLink, extractBookmarkSlice, importModules, newUserModuleDialog, editUserTopicDialog, editUserCommentaryDialog, wireModules, openBookModule, modal, messageBox, confirmBox, wordAt, lookupWord, showAllXrefs, addXref };
