'use strict';
/* Screen C · Study Desk: the text in the middle, a slim reference rail and one dock. Left edge: the Navigator (books & chapters,
 * history, bookmarks). Right edge: the study drawer (commentary, dictionary, cross-references, note, library) that follows the verse.
 * Pull up: the split desk (parallel Bible, commentary, library, search). The command bar finds verses, books and every command.
 * Hold a verse: a quick row. The dock becomes a player while reading. Pull down from the top: quick settings. */
/* global PUI, state, views, go, step, setShow, zoomView, toggleLink, setVerseNumbers, runCommand, TimotheosSpeech, TimotheosStudy, TimotheosOptions, TimotheosTools, TimotheosPhone, api */
(function () {
  const P = () => window.PUI; let ac = null, els = [], q = null, drawerTool = 'commentary', lastWord = null, deskChip = 'par', followRef = '', navSeg = 'books', openBook = null;
  const root = document.documentElement;
  function el(cls, html, tag) { const d = document.createElement(tag || 'div'); d.className = cls + ' skel'; d.innerHTML = html; document.body.appendChild(d); els.push(d); return d; }
  const ib = (a, i, t, cls = '') => `<button type="button" class="pib ${cls}" data-a="${a}" aria-label="${t}" title="${t}">${P().ic(i, 23)}</button>`;
  const $ = s => document.querySelector(s);
  const scrim = on => { const s = $('.c-scrim'); if (s) s.classList.toggle('on', on); };

  /* ---------------- drawers ---------------- */
  let backOn = false;
  function opened() { if (!backOn) { backOn = true; P().pushBack(() => { backOn = false; closeAll(true); }, 'cover'); } }
  function closeAll(viaBack) { const was = ['.c-drawer.l', '.c-drawer.r', '.c-pal', '.c-cc'].some(s => { const e = $(s); return e && e.classList.contains('on'); });
    ['.c-drawer.l', '.c-drawer.r', '.c-pal', '.c-cc'].forEach(s => { const e = $(s); if (e) e.classList.remove('on'); }); const pp = $('.c-pop'); if (pp) pp.remove(); scrim(false); closeQ();
    if (was && backOn && viaBack !== true) { backOn = false; P().dropBack('cover'); } }
  function navDrawer(on = true) {
    closeAll(on ? true : undefined); if (!on) return; const d = $('.c-drawer.l'); fillNav(); d.classList.add('on'); scrim(true); opened();
    const h = d.querySelector('.bk.open'); if (h) setTimeout(() => { d.scrollTop = Math.max(0, h.offsetTop - 150); }, 30);
  }
  function fillNav() {
    const p = P(); const d = $('.c-drawer.l'); if (!d) return;
    const GRP = { OT: 'Old Testament', NT: 'New Testament', AP: 'Apocrypha', APX: 'Other books' };
    let body = '';
    if (navSeg === 'books') {
      openBook = openBook || state.ref.b; let g = null;
      body = '<div class="ptree">' + (state.nav || []).map(b => { const head = b.grp !== g ? `<div class="tg">${p.esc(GRP[b.grp] || b.grp)}</div>` : ''; g = b.grp;
        return head + `<button type="button" class="bk${b.id === openBook ? ' open' : ''}" data-b="${b.id}">${p.esc(b.name)} <small>${b.chapterList.length}</small></button>` + (b.id === openBook ? `<div class="cg">${b.chapterList.map(c => `<button type="button" data-c="${c}" class="${b.id === state.ref.b && c === state.ref.c ? 'hl' : ''}">${c}</button>`).join('')}</div>` : ''); }).join('') + '</div>';
    } else if (navSeg === 'history') {
      const seen = new Set(); const rows = [];
      for (const r of [...(state.back || [])].reverse()) { const k = `${r.b}.${r.c}.${r.v}`; if (seen.has(k)) continue; seen.add(k); rows.push(r); if (rows.length > 40) break; }
      body = rows.length ? `<div class="rows">${rows.map(r => `<button type="button" class="prr" data-go="${r.b}.${r.c}.${r.v || 1}">${p.ic('history', 18)}<span>${p.esc(p.rn(r))}</span></button>`).join('')}</div>` : '<p class="phint">The places you read show here.</p>';
    } else {
      const bm = (window.TimotheosStudy.study.ud || {}).bookmarks || {};
      body = `<div class="rows">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => { const r = bm[n === 0 ? 9 : n - 1]; return `<button type="button" class="prr" ${r ? `data-go="${r.b}.${r.c}.${r.v}"` : 'data-setbm="' + n + '"'}><b style="width:18px;color:var(--p-acc)">${n}</b><span>${r ? p.esc(p.rn(r)) : 'empty — tap to set to ' + p.esc(p.rn(state.ref))}</span></button>`; }).join('')}</div><div class="pills"><button type="button" class="pill" data-lists>${p.ic('study', 16)} Verse lists</button><button type="button" class="pill" data-hls>${p.ic('highlight', 16)} Highlights</button><button type="button" class="pill" data-notes>${p.ic('note', 16)} Notes</button></div>`;
    }
    d.innerHTML = `<div class="dtop"><div class="dh"><small>Navigator</small>${{ books: 'Books &amp; chapters', history: 'History', marks: 'Bookmarks' }[navSeg]}</div><div class="pseg">${[['books', 'Books'], ['history', 'History'], ['marks', 'Marks']].map(([k, l]) => `<button type="button" data-seg="${k}" class="${navSeg === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>${body}`;
  }
  function studyDrawer(tool, word) {
    if (tool) drawerTool = tool; if (word) lastWord = word;
    const d = $('.c-drawer.r'); const was = d.classList.contains('on');
    if (!was) { closeAll(true); d.classList.add('on'); scrim(true); opened(); }
    fillStudy();
  }
  async function fillStudy() {
    const p = P(); const d = $('.c-drawer.r'); if (!d) return; const ref = { ...state.ref }; followRef = `${ref.b}.${ref.c}.${ref.v}`;
    const T = [['commentary', 'commentary', 'Commentary'], ['dictionary', 'lexicon', 'Dictionary'], ['xref', 'xref', 'Cross-references'], ['note', 'note', 'My note'], ['library', 'library', 'Library']];
    const title = (T.find(t => t[0] === drawerTool) || T[0])[2];
    d.innerHTML = `<div class="dh"><small>Follows ${p.esc(p.rn(ref))}</small>${title}</div><div class="vt">${T.map(([k, i, l]) => `<button type="button" class="pib${k === drawerTool ? ' on' : ''}" data-tool="${k}" aria-label="${l}" title="${l}">${p.ic(i, 22)}</button>`).join('')}</div><div class="pp"></div>`;
    const box = d.querySelector('.pp');
    if (drawerTool === 'commentary') p.commentaryCards(box, ref);
    else if (drawerTool === 'xref') p.xrefList(box, ref);
    else if (drawerTool === 'library') { p.libraryInto(box); box.addEventListener('click', e => { if (e.target.closest('.mod')) closeAll(); }, true); }
    else if (drawerTool === 'note') {
      const k = `${ref.b}.${ref.c}.${ref.v}`; const n = ((window.TimotheosStudy.study.ud || {}).notes || {})[k];
      box.innerHTML = `${n ? `<article class="pcard"><div class="psrc"><span>${p.esc(p.rn(ref))}</span></div><div class="pbody entry">${n.html}</div></article>` : `<p class="phint">No note on ${p.esc(p.rn(ref))} yet.</p>`}<div class="pills"><button type="button" class="pill gold" data-editnote>${p.ic('edit', 16)} ${n ? 'Edit the note' : 'Write a note'}</button><button type="button" class="pill" data-allnotes>${p.ic('note', 16)} All my notes</button></div>`;
    } else {
      // the words of this verse that carry Strong's numbers (or the tapped word)
      const row = document.querySelector(`.bv.active tr[data-v="${ref.v}"], .bv tr[data-v="${ref.v}"]`);
      const ws = row ? [...row.querySelectorAll('[data-strong]')].filter(x => !x.matches('sup')).map(x => ({ word: x.textContent.trim().replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''), strongs: (x.dataset.strong || '').split(/\s+/).filter(Boolean), morphs: (x.dataset.morph || '').split(/\s+/).filter(Boolean), lemma: x.dataset.lemma })) : [];
      const uniq = []; const seen = new Set(); for (const w of ws) { const k = w.strongs.join(' '); if (!k || seen.has(k)) continue; seen.add(k); uniq.push(w); }
      const cur = lastWord && (lastWord.strongs.length || lastWord.word) ? lastWord : uniq[0] || null;
      box.innerHTML = `${uniq.length ? `<div class="pchips">${uniq.slice(0, 24).map((w, i) => `<button type="button" class="pchip${cur && w.strongs.join() === (cur.strongs || []).join() ? ' acc' : ''}" data-w="${i}">${p.esc(w.word || w.strongs[0])}</button>`).join('')}</div>` : ''}<div class="pcards"></div>${!uniq.length && !cur ? '<p class="phint">Tap a word in the text to look it up here.</p>' : ''}`;
      if (cur) p.dictCards(box.querySelector('.pcards'), cur, { limit: 4 });
      box.onclick = e => { const c = e.target.closest('[data-w]'); if (c) { lastWord = uniq[+c.dataset.w]; fillStudy(); } };
    }
  }

  /* ---------------- split desk ---------------- */
  function deskOpen() { return $('.c-desk') && $('.c-desk').classList.contains('on'); }
  function setSp(f) { root.style.setProperty('--sk-sp', Math.max(.25, Math.min(.8, f)).toFixed(3)); layoutDesk(); }
  function layoutDesk() {
    const d = $('.c-desk'); if (!d) return; const sp = parseFloat(getComputedStyle(root).getPropertyValue('--sk-sp')) || .5;
    const top = parseFloat(getComputedStyle(document.querySelector('.c-rail')).height) || 52; const H = innerHeight;
    d.style.top = Math.round(top + (H - top) * sp) + 'px';
    root.style.setProperty('--sp-head', (d.querySelector('.dgrab').offsetHeight + d.querySelector('.hd').offsetHeight) + 'px');
  }
  async function desk(chip) {
    closeAll(); const p = P(); const d = $('.c-desk'); deskChip = chip || deskChip;
    if (!d.classList.contains('on')) P().pushBack(() => deskClose(true), 'desk');
    d.classList.add('on'); root.classList.add('c-deskon'); layoutDesk();
    d.querySelectorAll('[data-dc]').forEach(b => b.classList.toggle('on', b.dataset.dc === deskChip));
    const body = d.querySelector('.db'); body.innerHTML = '';
    if (deskChip === 'par') {
      const id = await window.TimotheosSkins.secondBible(); if (!id) { root.classList.remove('c-deskbible'); TimotheosPhone.split(null); body.innerHTML = '<p class="phint">Only one Bible is open. Import or open a second Bible to read two side by side.</p>'; return; }
      root.classList.add('c-deskbible'); TimotheosPhone.split(id);
    } else {
      root.classList.remove('c-deskbible'); TimotheosPhone.split(null);
      if (deskChip === 'cmt') p.commentaryCards(body, { ...state.ref });
      else if (deskChip === 'lib') p.libraryInto(body);
      else if (deskChip === 'search') p.searchInto(body, {});
    }
    followRef = `${state.ref.b}.${state.ref.c}.${state.ref.v}`;
  }
  function deskClose(viaBack) { const d = $('.c-desk'); if (d && d.classList.contains('on') && viaBack !== true) P().dropBack('desk'); if (d) d.classList.remove('on'); root.classList.remove('c-deskon', 'c-deskbible'); TimotheosPhone.split(null); }

  /* ---------------- command bar ---------------- */
  const CMDS = () => [
    ['Read aloud: voices & tempo', 'speaker', 'Settings', () => P().readAloudPage()], ['Import modules…', 'import', 'File', () => runCommand('import')], ['Add module folder…', 'folder', 'File', () => runCommand('addFolder')],
    ['Rescan modules', 'refresh', 'File', () => runCommand('rescan')], ['Imported modules folder', 'folder', 'File', () => runCommand('modulesFolder')], ['New user module…', 'plus', 'File', () => runCommand('newUserMod')],
    ['Export topics…', 'import', 'File', () => runCommand('exportTopics')], ['Print the topic', 'print', 'File', () => runCommand('printTopic')], ['Print the chapter', 'print', 'File', () => runCommand('print')],
    ['Options', 'tune', 'File', () => runCommand('options')], ['Bible search (all options)', 'search', 'View', () => P().fullPanel('search')], ['Book search', 'book', 'View', () => P().search({ mode: 'books' })],
    ['Copy verses…', 'copy', 'View', () => TimotheosStudy.copyDialog()], ['Clipboard monitor', 'clipboard', 'View', () => runCommand('clipmon')], ['Daily readings', 'calendar', 'View', () => P().studySection('plans')],
    ['Devotionals today', 'book', 'View', () => P().devotionals()], ['My Study', 'study', 'View', () => P().studyPage()], ['My notes', 'note', 'View', () => P().studySection('notes')], ['Highlights', 'highlight', 'View', () => P().highlightsPage()],
    ['Bookmarks', 'bookmark', 'View', () => P().studySection('marks')], ['Verse lists', 'study', 'View', () => P().studySection('lists')], ['Library', 'library', 'View', () => P().library()], ['Commentary', 'commentary', 'View', () => studyDrawer('commentary')],
    ['Reading view: size, what to show', 'text', 'View', () => P().readingSheet()], ['Choose the Bible', 'bible', 'View', () => P().chooseBible()], ['Parallel Bible (split desk)', 'compare', 'View', () => desk('par')],
    ['Reset panel layout', 'layout', 'View', () => runCommand('resetLayout')], ['Quick settings', 'tune', 'View', () => quick()], ['User guide', 'guide', 'Help', () => runCommand('guide')], ['Keyboard shortcuts', 'keyboard', 'Help', () => runCommand('keys')],
    ['About Timotheos', 'info', 'Help', () => runCommand('about')], ['Change screen', 'grid', 'Help', () => window.TimotheosSkins.picker(true)]];
  let palT = 0, palSeq = 0;
  function palette() {
    closeAll(true); const p = P(); const pal = $('.c-pal'); pal.classList.add('on'); scrim(true); opened();
    pal.innerHTML = `<label class="pfield pin">${p.ic('search', 19)}<input id="cPalQ" type="text" placeholder="Verse, word, book or command" autocomplete="off" spellcheck="false" enterkeyhint="go"></label><div class="pbody2"></div>`;
    const qi = pal.querySelector('#cPalQ'), body = pal.querySelector('.pbody2'); let first = null;
    const cmds = CMDS();
    const localRef = t => { const m = /^(\d?\s*[\p{L}][\p{L}.]*(?:\s+[\p{L}]+)*)\s*(\d+)(?:\s*[:.]\s*(\d+))?$/u.exec(t.trim()); if (!m) return null; const n = m[1].replace(/[.\s]/g, '').toLowerCase();
      const bk = (state.nav || []).find(b => b.name.replace(/\s/g, '').toLowerCase() === n) || (state.nav || []).find(b => (b.abbrs || [b.abbr]).some(x => String(x).replace(/[.\s]/g, '').toLowerCase() === n)) || (state.nav || []).find(b => b.name.replace(/\s/g, '').toLowerCase().startsWith(n));
      return bk ? { b: bk.id, c: +m[2], v: m[3] ? +m[3] : 1 } : null; };
    const draw = () => {
      const t = qi.value.trim(); const my = ++palSeq; first = null;
      const cm = cmds.filter(c => !t || (c[0] + ' ' + c[2]).toLowerCase().includes(t.toLowerCase())).slice(0, t ? 10 : 99);
      let h = '';
      if (t) {
        const r = localRef(t);
        h += `<div class="pgo">${r ? `<div class="pg2">Go to</div><button type="button" class="pr hl" data-go="${r.b}.${r.c}.${r.v}">${p.ic('pin', 18)}<span>${p.esc(p.rn(r))}</span><small>Go</small></button>` : ''}</div>`;
        if (!r && /\d/.test(t)) api.parseRef(t).then(x => { if (my !== palSeq || !x || !x.b) return; const g = body.querySelector('.pgo'); if (g) g.innerHTML = `<div class="pg2">Go to</div><button type="button" class="pr hl" data-go="${x.b}.${x.c || 1}.${x.v || 1}">${p.ic('pin', 18)}<span>${p.esc(p.rn({ b: x.b, c: x.c || 1, v: x.v || 1 }))}</span><small>Go</small></button>`; }).catch(() => {});
        const bks = (state.nav || []).filter(b => b.name.toLowerCase().startsWith(t.toLowerCase())).slice(0, 3);
        if (bks.length && !r) h += `<div class="pg2">Books of the Bible</div>${bks.map(b => `<button type="button" class="pr" data-go="${b.id}.1.1">${p.ic('book', 18)}<span>${p.esc(b.name)}</span><small>${b.chapterList.length} ch</small></button>`).join('')}`;
        h += '<div class="pg2v"></div><div class="pg2b">' + (t.length >= 3 && !r ? '<div class="pg2">Books</div><p class="phint bsprog">Searching the books…</p>' : '') + '</div>';
      }
      h += `<div class="pg2">Commands</div>${cm.map(c => `<button type="button" class="pr" data-cmd="${cmds.indexOf(c)}">${p.ic(c[1], 18)}<span>${p.esc(c[0])}</span><small>${c[2]}</small></button>`).join('') || '<p class="phint">No command by that name.</p>'}`;
      body.innerHTML = h;
      if (t && t.length >= 3 && !localRef(t)) { clearTimeout(palT); palT = setTimeout(() => words(t, my, body), 450); }
    };
    const words = async (t, my, body) => {
      const ids = (state.settings.openBibles || []).slice(0, 1);
      const mk = (txt, ms) => { let out = '', i = 0; for (const [s, e] of ms || []) { if (s < i) continue; out += p.esc(txt.slice(i, s)) + '<mark>' + p.esc(txt.slice(s, e)) + '</mark>'; i = e; } return out + p.esc(txt.slice(i)); };
      api.search(ids, t, { ignoreCase: true, ignoreDiacritics: true, scope: 'all', limit: 3, current: { b: state.ref.b, c: state.ref.c } }).then(r => {
        const pv = body.querySelector('.pg2v'); if (my !== palSeq || !pv || !r || !r.total) return;
        pv.innerHTML = `<div class="pg2">Verses <em>${r.total.toLocaleString()} in ${p.esc(p.bibleAbbr(ids[0]))}</em></div>${r.results.slice(0, 2).map(x => `<button type="button" class="pr" data-go="${x.b}.${x.c}.${x.v}">${p.ic('book', 18)}<span>${p.esc(x.ref)} — ${mk(x.text, x.marks)}</span></button>`).join('')}<button type="button" class="pr" data-allv>${p.ic('search', 18)}<span>All ${r.total.toLocaleString()} verses</span></button>`;
      }).catch(() => {});
      api.bookSearchAll(t, { ids: [], whole: false, accents: false, regex: false }).then(rb => {
        const pb = body.querySelector('.pg2b'); if (my !== palSeq || !pb) return; if (!rb || !rb.total) { pb.innerHTML = rb ? '' : pb.innerHTML; return; }
        pb.innerHTML = `<div class="pg2">Books <em>${rb.total.toLocaleString()} topics</em></div>${rb.results.slice(0, 2).map(m => `<button type="button" class="pr" data-mod="${p.esc(m.id)}" data-tid="${p.esc(String(m.hits[0].tid))}">${p.ic(m.kind === 'commentary' ? 'commentary' : 'lexicon', 18)}<span>${p.esc(m.title)} · ${p.esc(m.hits[0].subject)}</span></button>`).join('')}`;
      }).catch(() => {});
    };
    qi.oninput = draw;
    qi.onkeydown = e => { if (e.key !== 'Enter') return; e.preventDefault(); const b = body.querySelector('.pr'); if (b) b.click(); };
    body.onclick = e => {
      const b = e.target.closest('.pr'); if (!b) return; closeAll();
      if (b.dataset.go) { const [bb, c, v] = b.dataset.go.split('.').map(Number); go({ b: bb, c, v }); }
      else if (b.dataset.mod) p.openModule(b.dataset.mod, isNaN(+b.dataset.tid) ? b.dataset.tid : +b.dataset.tid);
      else if (b.dataset.allv != null) p.search({ q: qi.value.trim() });
      else if (b.dataset.cmd) setTimeout(cmds[+b.dataset.cmd][3], 80);
    };
    draw(); setTimeout(() => qi.focus(), 120);
  }

  /* ---------------- hold a verse: the quick row ---------------- */
  function closeQ() { if (q) { q.remove(); q = null; } P().markVerse(null); }
  function quickRow(x, w) {
    closeQ(); const p = P(); p.markVerse(x.row, true);
    q = document.createElement('div'); q.className = 'qrow skel';
    const b = (a, i, t) => `<button type="button" class="pib" data-q="${a}" aria-label="${t}" title="${t}">${p.ic(i, 21)}</button>`;
    q.innerHTML = `${b('copy', 'copy', 'Copy')}${b('underline', 'underline', 'Underline')}${b('note', 'note', 'Note')}${b('read', 'speaker', 'Read aloud')}<span class="sep"></span>${[['orange', '#e0a07a'], ['teal', '#6fc1b5'], ['blue', '#9fb6e0']].map(([c, h]) => `<button type="button" class="pdot" data-c="${c}" style="background:${h}" aria-label="${c}"></button>`).join('')}<span class="sep"></span>${b('more', 'more', 'More')}`;
    document.body.appendChild(q);
    const r = x.row.getBoundingClientRect(); const y = r.bottom + 10 + 54 < innerHeight - 110 ? r.bottom + 10 : Math.max(70, r.top - 64);
    q.style.top = y + 'px'; q.style.left = '22px';
    q.addEventListener('click', e => { e.stopPropagation();
      const d = e.target.closest('[data-c]'); if (d) { p.act.highlight(x, d.dataset.c); closeQ(); return; }
      const a = e.target.closest('[data-q]'); if (!a) return; const k = a.dataset.q; closeQ();
      if (k === 'more') return p.verseSheet(x, w); p.act[k](x, w || {}); });
  }
  function onHold(x, w) { quickRow(x, w); }
  function onTap(x, w) {
    closeQ(); if (!x) return;
    if (w && w.word && (w.strongs.length || /\p{L}{2,}/u.test(w.word))) { document.querySelectorAll('.pwordon').forEach(z => z.classList.remove('pwordon')); if (w.el) w.el.classList.add('pwordon'); studyDrawer('dictionary', w); }
  }

  /* ---------------- player ---------------- */
  function modePop() {
    const p = P(); const old = $('.c-pop'); if (old) { old.remove(); return; } const c = TimotheosSpeech.cfg();
    const pop = el('c-pop', [['bible', 'Read on to the end'], ['chapter', 'Repeat chapter'], ['range', 'Repeat a verse range…']].map(([k, l]) => `<button type="button" class="pr${c.mode === k ? ' hl' : ''}" data-m="${k}"><span>${l}</span></button>`).join(''));
    pop.onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; pop.remove(); if (b.dataset.m === 'range' && !(c.from && c.to)) { p.readAloudPage(); } TimotheosSpeech.setCfg('mode', b.dataset.m); refresh(); };
  }
  const RATES = [0.75, 0.9, 1, 1.15, 1.3, 1.5];

  /* ---------------- quick settings ---------------- */
  function quick() {
    closeAll(true); const p = P(); const cc = $('.c-cc'); const v = views()[state.active] || {}; const sh = Object.assign({}, state.settings.show, v.show || {});
    const ap = TimotheosOptions.appearance(); const vn = (v.vnPos || ap.vnPos) !== 'hidden'; const sync = views().every(x => x.linked); const clip = window.TimotheosTools && TimotheosTools.clipOn && TimotheosTools.clipOn();
    const t = (k, i, l, on) => `<button type="button" class="cct${on ? ' on' : ''}" data-cc="${k}">${p.ic(i, 22)}${l}</button>`;
    cc.innerHTML = `<div class="dh" style="font-size:19px"><small>Quick settings</small>This desk</div><div class="ccg">${t('dark', 'palette', 'Dark', !root.classList.contains('sk-light'))}${t('sync', 'sync', 'Sync views', sync)}${t('strongs', 'lexicon', "Strong's", !!sh.strongs)}${t('columns', 'compare', 'Interlinear', !!sh.columns)}${t('vn', 'text', 'Verse no.', vn)}${t('clip', 'clipboard', 'Clipboard', !!clip)}${t('notes', 'note', 'Notes', !!sh.notes)}${t('highlights', 'highlight', 'Marks', !!sh.highlights)}</div>
      <div class="slider">${p.ic('text', 20)}<input type="range" min="0.6" max="2.5" step="0.1" value="${v.zoom || 1}" data-zoom aria-label="Text size">A</div>
      <div class="links"><button type="button" class="pchip" data-l="options">${p.ic('tune', 16)} Options</button><button type="button" class="pchip" data-l="mods">${p.ic('import', 16)} Modules</button><button type="button" class="pchip" data-l="layouts">${p.ic('layers', 16)} Layouts</button><button type="button" class="pchip" data-l="voices">${p.ic('speaker', 16)} Voices</button><button type="button" class="pchip" data-l="view">${p.ic('eye', 16)} All view options</button><button type="button" class="pchip" data-l="help">${p.ic('guide', 16)} Help</button></div>`;
    cc.classList.add('on'); scrim(true); opened();
    cc.onclick = e => {
      const k = e.target.closest('[data-cc]'); if (k) { const a = k.dataset.cc; const on = !k.classList.contains('on');
        if (a === 'dark') { root.classList.toggle('sk-light', !on); try { localStorage.setItem('tw.c.light', on ? '' : '1'); } catch (x) { /* */ } }
        else if (a === 'sync') { views().forEach((x, i) => { if (!!x.linked !== on) toggleLink(i); }); }
        else if (a === 'vn') setVerseNumbers(state.active, on);
        else if (a === 'clip') runCommand('clipmon');
        else setShow(a, on);
        k.classList.toggle('on', on); return; }
      const l = e.target.closest('[data-l]'); if (!l) return; closeAll();
      ({ options: () => runCommand('options'), mods: () => p.modulesSheet(), voices: () => p.readAloudPage(), view: () => p.readingSheet(), help: () => p.helpSheet(),
        layouts: () => { const s = p.sheet(`<div class="rows"><button type="button" class="prr" data-x="par">${p.ic('compare', 20)}<span>Parallel Bible below</span></button><button type="button" class="prr" data-x="reset">${p.ic('layout', 20)}<span>Reset panel layout</span></button><button type="button" class="prr" data-x="screen">${p.ic('grid', 20)}<span>Change screen</span></button></div>`, { title: 'Layouts' }); s.onclick = ev => { const x = ev.target.closest('[data-x]'); if (!x) return; p.closeSheet(); if (x.dataset.x === 'par') desk('par'); if (x.dataset.x === 'reset') runCommand('resetLayout'); if (x.dataset.x === 'screen') window.TimotheosSkins.picker(true); }; } }[l.dataset.l] || (() => {}))();
    };
    cc.oninput = e => { const z = e.target.closest('[data-zoom]'); if (!z) return; const cur = (views()[state.active] || {}).zoom || 1; const d = Math.round((+z.value - cur) * 10); if (d) zoomView(state.active, d); };
  }

  /* ---------------- the loop ---------------- */
  function refresh() {
    const p = P(); const r = $('.c-rail .ref span:last-child'); if (r) { const lb = p.par.label(state.active) || p.rn(state.ref); if (r.textContent !== lb) r.textContent = lb; }
    const bb = $('.c-rail .bib'); if (bb) bb.textContent = p.bibleAbbr() || 'Bible';
    const gb = document.getElementById('gBack'), gf = document.getElementById('gFwd');
    const b = $('.c-rail [data-a="back"]'), f = $('.c-rail [data-a="fwd"]'); if (b) b.disabled = !gb || gb.disabled; if (f) f.disabled = !gf || gf.disabled;
    const t = p.ttsInfo(); root.classList.toggle('c-busy', !!t.busy);
    const pl = $('.c-player'); if (pl) { pl.classList.toggle('paused', !!t.paused); pl.querySelector('.lbl').textContent = t.label || p.rn(state.ref); const c = TimotheosSpeech.cfg(); pl.querySelector('.sub').textContent = `· ${p.bibleAbbr()} · ${TimotheosSpeech.NAMES[c.lang] || TimotheosSpeech.NAMES[TimotheosSpeech.langOf(((state.infos.get(p.activeBible()) || {}).lang))] || ''}`;
      pl.querySelector('[data-a="pause"]').innerHTML = p.ic(t.paused ? 'play' : 'pause', 21); pl.querySelector('[data-a="mode"]').textContent = { bible: 'Read on', chapter: 'Repeat chapter', range: 'Repeat range' }[c.mode] || 'Read on'; pl.querySelector('[data-a="rate"]').textContent = `${(+c.rate || 1).toFixed(2).replace(/0$/, '')}×`; }
    // the study drawer and the desk follow the verse
    const k = `${state.ref.b}.${state.ref.c}.${state.ref.v}`;
    if (k !== followRef) { followRef = k; if ($('.c-drawer.r.on') && drawerTool !== 'library') fillStudy(); if (deskOpen() && deskChip === 'cmt') desk('cmt'); if ($('.c-drawer.l.on') && navSeg === 'books') { openBook = state.ref.b; fillNav(); } }
    p.fitLabels();
  }
  function mount() {
    ac = new AbortController(); const sig = { signal: ac.signal }; const p = P();
    try { root.classList.toggle('sk-light', localStorage.getItem('tw.c.light') === '1'); } catch (e) { /* */ }
    el('c-rail', `${ib('back', 'back', 'Back to the previous screen')}<button type="button" class="ref" data-a="nav"><span class="dotc"></span><span>John 3:16</span></button><button type="button" class="bib" data-a="bible">KJV</button><span class="sp"></span>${ib('fwd', 'fwd', 'Forward to the next screen')}`);
    el('c-edge', '').style.left = '2px'; el('c-edge', '').style.right = '2px';
    el('c-dock', `<span class="grabzone" data-a="desk"></span>${ib('nav', 'drawerL', 'Books & chapters')}${ib('cmd', 'cmd', 'Command bar')}${ib('speak', 'speaker', 'Read aloud')}<span class="sep"></span>${ib('tools', 'drawerR', 'Commentary, dictionary, cross-references')}`);
    el('c-scrim', '');
    el('c-drawer l', ''); el('c-drawer r', '');
    el('c-desk', `<div class="dgrab"><i></i></div><div class="hd">${[['par', 'compare', 'Parallel'], ['cmt', 'commentary', 'Commentary'], ['lib', 'library', 'Library'], ['search', 'search', 'Search']].map(([k, i, l]) => `<button type="button" class="pchip" data-dc="${k}">${p.ic(i, 15)} ${l}</button>`).join('')}<button type="button" class="pchip" data-dc="close">${p.ic('close', 15)}</button></div><div class="db"></div>`);
    el('c-pal', ''); el('c-cc', '');
    el('c-player', `<div class="row1">${p.ic('speaker', 18)}<span class="lbl"></span><small class="sub"></small><span class="wave">${[8, 14, 20, 12, 18, 9, 16, 22, 11, 15].map((h, i) => `<i style="height:${h}px;animation-delay:${i * 0.09}s"></i>`).join('')}</span></div><div class="row2">${ib('prevv', 'prevv', 'Previous verse')}${ib('pause', 'pause', 'Pause', 'pl')}${ib('nextv', 'nextv', 'Next verse')}${ib('stop', 'stop', 'Stop')}<button type="button" class="pchip on" data-a="mode">Read on</button><button type="button" class="pchip" data-a="rate">1×</button></div>`);
    // a small handle under the rail: pull down (or tap) for quick settings
    const hd = el('c-qhandle', ''); hd.style.cssText = 'position:fixed;left:50%;top:calc(var(--safe-t) + 50px);width:36px;height:4px;margin-left:-18px;border-radius:2px;background:var(--p-grab);z-index:61';

    document.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('.c-scrim')) { e.stopPropagation(); closeAll(); return; }
      const sg = t.closest('.c-drawer.l [data-seg]'); if (sg) { e.stopPropagation(); navSeg = sg.dataset.seg; return fillNav(); }
      const bk = t.closest('.c-drawer.l [data-b]'); if (bk) { e.stopPropagation(); openBook = openBook === +bk.dataset.b ? null : +bk.dataset.b; fillNav(); const o = $('.c-drawer.l .bk.open'); if (o) o.scrollIntoView({ block: 'nearest' }); return; }
      const ch = t.closest('.c-drawer.l [data-c]'); if (ch) { e.stopPropagation(); closeAll(); return go({ b: openBook, c: +ch.dataset.c, v: 1 }); }
      const g = t.closest('.c-drawer.l [data-go]'); if (g) { e.stopPropagation(); closeAll(); const [b, c, v] = g.dataset.go.split('.').map(Number); return go({ b, c, v }); }
      const sb = t.closest('.c-drawer.l [data-setbm]'); if (sb) { e.stopPropagation(); window.setBookmark(+sb.dataset.setbm); return fillNav(); }
      if (t.closest('.c-drawer.l [data-lists]')) { closeAll(); return p.studySection('lists'); }
      if (t.closest('.c-drawer.l [data-hls]')) { closeAll(); return p.highlightsPage(); }
      if (t.closest('.c-drawer.l [data-notes]') || t.closest('.c-drawer.r [data-allnotes]')) { closeAll(); return p.studySection('notes'); }
      const tl = t.closest('.c-drawer.r [data-tool]'); if (tl) { e.stopPropagation(); drawerTool = tl.dataset.tool; return fillStudy(); }
      if (t.closest('.c-drawer.r [data-editnote]')) { closeAll(); return TimotheosStudy.editNote(`${state.ref.b}.${state.ref.c}.${state.ref.v}`); }
      const dc = t.closest('.c-desk [data-dc]'); if (dc) { e.stopPropagation(); return dc.dataset.dc === 'close' ? deskClose() : desk(dc.dataset.dc); }
      const b = t.closest('.skel [data-a]'); if (!b) return; e.stopPropagation(); const a = b.dataset.a;
      if (a !== 'mode') { const pp = $('.c-pop'); if (pp) pp.remove(); }
      if (a === 'back') { const x = document.getElementById('gBack'); if (x && !x.disabled) x.click(); }
      else if (a === 'fwd') { const x = document.getElementById('gFwd'); if (x && !x.disabled) x.click(); }
      else if (a === 'nav') navDrawer(!$('.c-drawer.l.on'));
      else if (a === 'tools') { if ($('.c-drawer.r.on')) closeAll(); else studyDrawer(); }
      else if (a === 'cmd') palette();
      else if (a === 'bible') p.chooseBible();
      else if (a === 'desk') { if (deskOpen()) deskClose(); else desk(); }
      else if (a === 'speak') { if (TimotheosSpeech.isSpeaking()) TimotheosSpeech.stop(); else TimotheosSpeech.speakView(state.active, null); }
      else if (a === 'pause' || a === 'stop') TimotheosSpeech.control(a);
      else if (a === 'prevv') TimotheosSpeech.control('prev'); else if (a === 'nextv') TimotheosSpeech.control('next');
      else if (a === 'mode') modePop();
      else if (a === 'rate') { const c = +TimotheosSpeech.cfg().rate || 1; const i = RATES.findIndex(r => r > c + 0.001); TimotheosSpeech.setCfg('rate', RATES[i < 0 ? 0 : i]); }
      setTimeout(refresh, 40);
    }, Object.assign({ capture: true }, sig));
    $('.c-qhandle').addEventListener('click', quick, sig);
    // gestures: from the left / right edge, up from the dock, down from the rail; drag the desk's grab bar
    let sx = 0, sy = 0, zone = null, t0 = 0;
    document.addEventListener('touchstart', e => {
      if (e.touches.length !== 1 || document.getElementById('pSheet') || root.classList.contains('pg-open')) { zone = null; return; }
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; t0 = Date.now();
      const tg = e.target; const top = (parseFloat(getComputedStyle($('.c-rail')).height) || 52) + 20;
      zone = tg.closest && tg.closest('.c-desk .dgrab') ? 'grab' : tg.closest && tg.closest('.c-dock') ? 'dock' : sx < 24 ? 'l' : sx > innerWidth - 24 ? 'r' : sy < top ? 'top' : null;
    }, Object.assign({ passive: true }, sig));
    document.addEventListener('touchmove', e => { if (zone !== 'grab') return; const t = e.touches[0]; const top = parseFloat(getComputedStyle($('.c-rail')).height) || 52; setSp((t.clientY - top) / (innerHeight - top)); }, Object.assign({ passive: true }, sig));
    document.addEventListener('touchend', e => {
      if (!zone) return; const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = t.clientY - sy; const z = zone; zone = null;
      if (z === 'grab') { const sp = parseFloat(getComputedStyle(root).getPropertyValue('--sk-sp')) || .5; if (sp > .78 || dy > 140) deskClose(); return; }
      if (Date.now() - t0 > 900) return;
      if (z === 'l' && dx > 60 && Math.abs(dy) < 70) navDrawer(true);
      else if (z === 'r' && dx < -60 && Math.abs(dy) < 70) studyDrawer();
      else if (z === 'dock' && dy < -70 && Math.abs(dx) < 80) desk();
      else if (z === 'top' && dy > 70 && Math.abs(dx) < 80) quick();
    }, Object.assign({ passive: true }, sig));
    // swipe a drawer away
    for (const s of ['.c-drawer.l', '.c-drawer.r']) { const d = $(s); let x0 = null; d.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, Object.assign({ passive: true }, sig)); d.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if ((s.endsWith('l') && dx < -70) || (s.endsWith('r') && dx > 70)) closeAll(); }, Object.assign({ passive: true }, sig)); }
    // mouse drag of the desk grab (for a mouse or a test)
    $('.c-desk .dgrab').addEventListener('pointerdown', e => { const g = e.currentTarget; g.setPointerCapture(e.pointerId); const top = parseFloat(getComputedStyle($('.c-rail')).height) || 52; const mv = ev => setSp((ev.clientY - top) / (innerHeight - top)); const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); }; g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); }, sig);
    window.addEventListener('tw-tts', refresh, sig); window.addEventListener('resize', layoutDesk, sig);
    p.H.tap = onTap; p.H.hold = onHold;
    refresh();
  }
  function unmount() { if (ac) ac.abort(); ac = null; closeQ(); deskClose(); els.forEach(e => e.remove()); els = []; root.classList.remove('c-busy', 'sk-light', 'c-deskon', 'c-deskbible'); }
  window.SkinC = { mount, unmount, refresh, navDrawer, studyDrawer, desk, deskClose, palette, quick, closeAll };
})();
