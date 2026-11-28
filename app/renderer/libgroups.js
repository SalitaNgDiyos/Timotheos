// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
/* Library groups (like theWord's book groups): every commentary, dictionary, book… belongs to one group. The ready groups
 * (Commentaries, Dictionaries, Books, Devotionals, Maps, Reading plans) take the modules of their kind; you can rename,
 * reorder and delete groups, make your own and move any module into any group in "Manage groups…".
 * Kept in the settings: libGroups [{ id, name }] (the order of the tiles) and libGroupOf { moduleId: groupId }. */
'use strict';
const TimotheosLibGroups = (() => {
  const READY = [['commentary', 'Commentaries'], ['dictionary', 'Dictionaries'], ['book', 'Books'], ['devotional', 'Devotionals'], ['map', 'Maps & images'], ['readingplan', 'Reading plans']];
  const OTHER = { id: 'other', name: 'Other' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const set = () => (typeof state !== 'undefined' && state.settings) || {};
  const books = () => ((typeof state !== 'undefined' && state.modules && state.modules.books) || []).filter(b => !b.hidden);
  const title = b => b.title || String(b.name || '').replace(/\.[^.]+(\.twm)?$/i, '');
  /** the groups in their order: the saved list, or the ready ones the first time */
  function groups() {
    const g = set().libGroups;
    return Array.isArray(g) && g.length ? g.filter(x => x && x.id && x.name) : READY.map(([k, n]) => ({ id: 'k:' + k, name: n }));
  }
  /** the group of a module: the one you chose, else the ready group of its kind, else "Other" */
  function groupOf(b) {
    const gs = groups(), ids = new Set(gs.map(x => x.id));
    const mine = (set().libGroupOf || {})[b.id];
    if (mine === OTHER.id) return OTHER.id;
    if (mine && ids.has(mine)) return mine;
    if (ids.has('k:' + b.kind)) return 'k:' + b.kind;
    return OTHER.id;
  }
  /** the modules of a group, by name; locked ones (they open only in theWord) last */
  function members(gid, all = books()) {
    return all.filter(b => groupOf(b) === gid).sort((a, z) => (!!a.locked - !!z.locked) || title(a).localeCompare(title(z)));
  }
  /** the groups that have something in them, with "Other" at the end when needed */
  function shown(all = books()) {
    const out = groups().map(g => ({ ...g, list: members(g.id, all) }));
    const other = members(OTHER.id, all); if (other.length) out.push({ ...OTHER, list: other });
    return out.filter(g => g.list.length);
  }
  async function manage() {
    let gs = groups().map(g => ({ ...g }));
    const of = Object.assign({}, set().libGroupOf || {});
    const all = books().sort((a, z) => title(a).localeCompare(title(z)));
    const cur = b => { const ids = new Set(gs.map(x => x.id)); if (of[b.id] === OTHER.id) return ''; return of[b.id] && ids.has(of[b.id]) ? of[b.id] : ids.has('k:' + b.kind) ? 'k:' + b.kind : ''; };
    const html = () => `<div class="lgman">
      <p class="small">Each group is a tile above the Library. Click a tile to see its modules. Rename, reorder or delete groups here, make your own, and choose the group of any module.</p>
      <h4>Groups</h4>
      <div class="lgrows">${gs.map((g, i) => `<div class="lgrow" data-i="${i}"><input type="text" value="${esc(g.name)}" aria-label="Group name"><button type="button" data-a="up" title="Move up"${i ? '' : ' disabled'}>↑</button><button type="button" data-a="down" title="Move down"${i < gs.length - 1 ? '' : ' disabled'}>↓</button><button type="button" data-a="del" title="Delete this group (its modules go back to the group of their kind, or Other)">Delete</button><span class="small">${all.filter(b => cur(b) === g.id).length}</span></div>`).join('')}</div>
      <button type="button" data-a="new">+ New group</button>
      <h4>Modules</h4>
      <input type="search" class="lgfind" placeholder="Find a module…">
      <div class="lgbooks">${all.map(b => `<label class="lgbook" data-id="${esc(b.id)}" data-t="${esc(title(b).toLowerCase())}"><span>${esc(title(b))}</span><select>${gs.map(g => `<option value="${esc(g.id)}"${cur(b) === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}<option value=""${cur(b) ? '' : ' selected'}>Other</option></select></label>`).join('')}</div></div>`;
    const take = () => {   // what is typed and chosen in the window now
      const body = document.querySelector('#modalBody'); if (!body) return;
      body.querySelectorAll('.lgrow').forEach(r => { const g = gs[+r.dataset.i]; const v = r.querySelector('input').value.trim(); if (g && v) g.name = v; });
      body.querySelectorAll('.lgbook').forEach(l => { const v = l.querySelector('select').value; if (v) of[l.dataset.id] = v; else of[l.dataset.id] = OTHER.id; });
    };
    const draw = () => {
      const body = document.querySelector('#modalBody'); body.innerHTML = html();
      body.onclick = e => {
        const bt = e.target.closest('button[data-a]'); if (!bt) return; take();
        const i = +((bt.closest('.lgrow') || {}).dataset || {}).i;
        if (bt.dataset.a === 'new') { let n = 1; while (gs.some(g => g.name === 'New group ' + n)) n++; gs.push({ id: 'g' + Date.now().toString(36), name: 'New group ' + n }); draw(); const ins = body.querySelectorAll('.lgrow input'); const last = ins[ins.length - 1]; if (last) { last.focus(); last.select(); } return; }
        if (bt.dataset.a === 'up' && i > 0) [gs[i - 1], gs[i]] = [gs[i], gs[i - 1]];
        if (bt.dataset.a === 'down' && i < gs.length - 1) [gs[i + 1], gs[i]] = [gs[i], gs[i + 1]];
        if (bt.dataset.a === 'del') { const id = gs[i].id; gs.splice(i, 1); for (const k of Object.keys(of)) if (of[k] === id) delete of[k]; }
        draw();
      };
      const f = body.querySelector('.lgfind'); f.oninput = () => { const q = f.value.trim().toLowerCase(); body.querySelectorAll('.lgbook').forEach(l => l.classList.toggle('hidden', !!q && !l.dataset.t.includes(q))); };
    };
    const p = TimotheosModules.modal('Manage Library groups', '', [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], true);
    draw();
    // the choice is read before the window empties itself
    const btn = [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === 'Save'); if (btn) btn.addEventListener('mousedown', take, true);
    const kd = e => { if (e.key === 'Enter') take(); }; document.addEventListener('keydown', kd, true);
    const r = await p; document.removeEventListener('keydown', kd, true);
    if (r !== 'ok') return false;
    take();
    for (const k of Object.keys(of)) { const b = all.find(x => x.id === k); if (!b || of[k] === ('k:' + b.kind)) delete of[k]; }   // only what differs from the kind is kept
    window.save({ libGroups: gs, libGroupOf: of });
    window.dispatchEvent(new CustomEvent('libgroups'));
    return true;
  }
  return { groups, groupOf, members, shown, manage, title, READY };
})();
window.TimotheosLibGroups = TimotheosLibGroups;
