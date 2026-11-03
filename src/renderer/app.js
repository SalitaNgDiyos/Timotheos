'use strict';
/* global api, TWRender, TimotheosOptions, TimotheosDock, TimotheosModules, TimotheosStudy, TimotheosSearch, TimotheosBookSearch, TimotheosCompare, TimotheosTools, TimotheosSpeech, TimotheosTitlebar, TimotheosProps, TimotheosIcons, TimotheosI18n */
const $ = s => document.querySelector(s);
const state = { settings: null, modules: { bibles: [], books: [], dicts: [], errors: [] }, infos: new Map(), nav: [], ref: { b: 43, c: 1, v: 1 }, back: [], fwd: [] };
const lookupCache = new Map();
const EMPTY_MOD = { rules: [] };

// Lookup: clicking a word puts the dictionaries that know it into the Library panel, one card per dictionary,
// cascaded like the Commentary panel. Back / Forward step through your lookups.
const lkpState = { back: [], fwd: [], cur: null };
function showFeed(on) { const t = $('#tab-lib'); if (t) t.classList.toggle('lookfeed', !!on); }
window.hideLookupFeed = () => showFeed(false);
function setLookupHtml(html, pushHistory = true, title = '') {
  const box = $('#libFeed'); if (!box) return;
  if (pushHistory && lkpState.cur && lkpState.cur.html !== html) {
    lkpState.back.push(lkpState.cur);
    if (lkpState.back.length > 80) lkpState.back.shift();
    lkpState.fwd = [];
  }
  lkpState.cur = { html, title };
  box.innerHTML = html; box.scrollTop = 0;
  $('#lkpTitle').textContent = title || '';
  showFeed(true); syncLookupButtons();
  if (window.TimotheosTools) try { TimotheosTools.applyMarks(box); } catch (e) { /* no marks here */ }
}
function lookupStep(d) {
  const from = d < 0 ? lkpState.back : lkpState.fwd;
  const to = d < 0 ? lkpState.fwd : lkpState.back;
  if (!from.length) return;
  if (lkpState.cur) to.push(lkpState.cur);
  const next = from.pop();
  setLookupHtml(next.html, false, next.title);
}
function syncLookupButtons() {
  const b = $('#lkpBack'), f = $('#lkpFwd');
  if (b) b.disabled = !lkpState.back.length;
  if (f) f.disabled = !lkpState.fwd.length;
}
window.setLookupHtml = setLookupHtml;
window.lookupStep = lookupStep;
function lookupCard(abbr, title, subject, body, bookId, tid, extra = '') {
  return `<article class="cmtcard" data-cid="${esc(bookId || abbr)}"><header class="cmtcard-hdr" data-toggle-card><span class="cc-chev">▾</span><b class="cc-abbr">${esc(abbr)}</b><span class="cc-title">${esc(title || '')}</span><span class="grow"></span><span class="cm-scope verse">${esc(subject || '')}</span>${bookId ? `<a class="cc-btn" data-book="${esc(bookId)}" data-tid="${esc(String(tid))}" title="Open this topic in the Library">Open</a>` : ''}</header><div class="cmtcard-body entry">${body}${extra}</div></article>`;
}
/** what a click on a word shows: {word, lemma, strongs[], morphs[]} → dictionaries cascaded in the Library panel */
async function showLookup(o) {
  const strongs = (o.strongs || []).filter(Boolean), morphs = (o.morphs || []).filter(Boolean);
  const word = (o.word || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
  const activeBible = (views()[state.active] || {}).bible || '';
  const cards = []; const seen = new Set();
  const title = [word, ...strongs, ...morphs].filter(Boolean).join(' · ') || 'Lookup';
  setLookupHtml('<p class="hint">Looking up…</p>', true, title);
  const lookupOne = async (kind, key) => {
    const r = await api.lookup(kind, key, activeBible).catch(() => null);
    if (!r) return lookupCard(kind === 'strong' ? "Strong's" : 'Morph', '', key, `<div class="src">${kind === 'strong' ? "No Strong's dictionary entry found" : 'No morphology dictionary entry found'}</div>`);
    return lookupCard(r.dict, kind === 'strong' ? "Strong's number" : 'Morphology', r.subject || key, sanitize(r.html), null, null, `<p><a class="findlink" data-find="${esc(key)}" title="Search the open Bibles for ${esc(key)}">Find ${kind === 'morph' ? 'm/ ' : ''}${esc(key)}</a></p>`);
  };
  if (o.lemma) cards.push(`<div class="src lkplemma">Lemma: <b>${esc(o.lemma)}</b></div>`);
  for (const m of morphs) cards.push(await lookupOne('morph', m));
  for (const s of strongs) cards.push(await lookupOne('strong', s));
  const tryWords = [...new Set([word, (o.lemma || '').trim(), ...strongs].filter(w => w && (w.length >= 2) ))];
  const others = [];
  for (const w of tryWords) {
    const res = await api.wordLookup(w, true).catch(() => []);
    for (const r of res || []) {
      const hit = r.hits[0]; const key = r.id + '|' + hit.id; if (seen.has(key)) continue; seen.add(key);
      if (r.kind === 'dictionary' && cards.length < 24) {
        const t = await api.bookTopic(r.id, hit.id).catch(() => null);
        cards.push(lookupCard(r.abbr, r.title, (t && t.subject) || hit.subject + (hit.exact ? '' : ' ~'), t ? sanitize(t.html) : '<p class="hint">(empty)</p>', r.id, hit.id));
      } else others.push(r.hits.map(h => `<a class="link" data-book="${esc(r.id)}" data-tid="${esc(String(h.id))}">${esc(r.abbr)}: ${esc(h.subject)}${h.exact ? '' : ' ~'}</a>`).join(' · '));
    }
  }
  const nDict = cards.filter(c => c.startsWith('<article')).length;
  if (!nDict) cards.push(`<p class="hint">No dictionary has a topic called “${esc(word || strongs[0] || '')}”.</p>`);
  if (others.length) cards.push(`<div class="entry"><div class="src">“${esc(word || strongs[0] || '')}” in your books and maps (~ = similar word)</div>${others.join(' · ')}</div>`);
  setLookupHtml(`<div class="cmtfeed">${cards.join('')}</div>`, false, title);
  lkpState.cur = { html: $('#libFeed').innerHTML, title };
  openTab('lib');
}
window.showLookup = showLookup;

async function init() {
  state.settings = await api.getSettings();
  state.ref = state.settings.ref || state.ref;
  initViews();
  TimotheosOptions.init();
  initDock();
  wireBiblesDrawer();
  wireZoom();
  wirePopupResize();
  for (const cb of document.querySelectorAll('[data-show]')) cb.addEventListener('change', () => setShow(cb.dataset.show, cb.checked));
  for (const cb of document.querySelectorAll('[data-tbshow]')) cb.addEventListener('change', () => setToolbarItem(cb.dataset.tbshow, cb.checked));
  applyToolbarItems();
  syncViewMenu();
  wireUi();
  wireViews(); wireScrollSync(); TimotheosViewUI.init();
  TimotheosModules.wireModules();
  await TimotheosStudy.init();
  if (window.TimotheosNav) TimotheosNav.init();
  TimotheosSearch.init();
  TimotheosBookSearch.init();
  TimotheosCompare.init();
  TimotheosTools.init();
  window.BOOK_ABBR = {}; for (const bk of await api.books()) window.BOOK_ABBR[bk.id] = bk.abbr;
  await refreshModules();
  api.onMenu(cmd => runCommand(cmd));
  TimotheosTitlebar.init();
  TimotheosProps.init();
  if (window.TimotheosI18n) TimotheosI18n.apply(state.settings.lang || 'en');
  if (api.onExternalSync) api.onExternalSync(handleExternalSync);
}

async function handleExternalSync(data) {
  if (!data) return;
  try {
    if ((data.cmd === 'verse' || (!data.cmd && data.b)) && data.b && data.c && data.v) {
      extSyncSuppressUntil = Date.now() + 900;
      let targetB = +data.b, targetC = +data.c, targetV = +data.v;
      if (targetB >= 67 && data.bookName) {
        const parsed = await api.parseRef(`${data.bookName} ${targetC}:${targetV}`).catch(() => null);
        if (parsed && parsed.b) { targetB = parsed.b; targetC = parsed.c || targetC; targetV = parsed.v || targetV; }
      } else if (targetB === 27 && targetC === 13) {
        const dan = state.nav.find(x => x.id === 27);
        if ((!dan || !dan.chapterList.includes(13)) && state.nav.some(x => x.id === 75)) { targetB = 75; targetC = 1; }
      } else if (targetB === 27 && targetC === 14) {
        const dan = state.nav.find(x => x.id === 27);
        if ((!dan || !dan.chapterList.includes(14)) && state.nav.some(x => x.id === 76)) { targetB = 76; targetC = 1; }
      } else if (targetB === 19 && targetC === 151) {
        const psa = state.nav.find(x => x.id === 19);
        if ((!psa || !psa.chapterList.includes(151)) && state.nav.some(x => x.id === 81)) { targetB = 81; targetC = 1; }
      }
      if (state.ref.b === targetB && state.ref.c === targetC) {
        if (!selectVerse(targetV, true)) await go({ b: targetB, c: targetC, v: targetV, history: false }, false);
      } else {
        await go({ b: targetB, c: targetC, v: targetV, history: false }, false);
      }
      const bk = (state.nav || []).find(x => x.id === state.ref.b);
      if (bk) document.title = `${bk.name} ${state.ref.c}:${state.ref.v} - Timotheos`;
    }
  } catch (_) {}
}

/** every menu command (title-bar menus, keyboard shortcuts) */
function runCommand(cmd) {
  const local = {
    newUserMod: () => TimotheosModules.newUserModuleDialog(),
    import: () => TimotheosModules.importModules(), addFolder, rescan,
    search: () => openTab('search', true), bookSearch: () => openTab('bsearch', true),
    compare: () => TimotheosCompare.open(), exportTopics: () => TimotheosTools.exportTopics(),
    printTopic: () => TimotheosTools.printTopic(), clipmon: () => TimotheosTools.setClipmon(!TimotheosTools.clipOn()),
    voices: () => TimotheosSpeech.voicesDialog(), goto: () => { $('#refInput').focus(); $('#refInput').select(); }, about,
    options: () => TimotheosOptions.open(), resetLayout: () => TimotheosDock.applyPreset('classic'),
    copyVerses: () => TimotheosStudy.copyDialog(), daily: () => TimotheosStudy.openStudy('plans'), keys: () => TimotheosStudy.showKeys(), print: () => window.print(),
    guide: () => api.appCmd('guide', TimotheosOptions.appearance().skin)
  };
  if (local[cmd]) return local[cmd]();
  return api.appCmd(cmd);
}
window.runCommand = runCommand;

/* ---------------- docked panels ---------------- */
function initDock() {
  const P = [['tree', 'Books & chapters', 'tree', 'bible', '#pane-tree'],
    ['cmt', 'Commentary', 'commentary', 'cmt', '#tab-cmt'], ['lib', 'Library', 'book', 'lib', '#tab-lib'],
    ['search', 'Bible search', 'search', 'search', '#tab-search'], ['bsearch', 'Book search', 'search', 'search', '#tab-bsearch'], ['study', 'My Study', 'study', 'study', '#tab-study'], ['compare', 'Compare', 'copy', 'bible', '#tab-compare']];
  for (const [id, title, icon, cap, sel] of P) TimotheosDock.register({ id, title, icon, cap, el: $(sel) });
  TimotheosDock.init(state.settings.dock, {
    onSave: layout => save({ dock: layout }),
    zoomable: id => !!ZOOM_TARGETS[id],
    onZoom: (id, d) => zoomPanel(id, d),
    onSkin: (id, btn) => TimotheosPanelSkin.menu(id, btn),
    onActivate: id => { if (id === 'compare') TimotheosCompare.render(); if (id === 'bsearch') TimotheosBookSearch.onOpen(false); if (id === 'search') TimotheosSearch.onOpen(false); if (id === 'study') TimotheosStudy.onOpen(); }
  });
  TimotheosPanelSkin.applyAll();
}

/* ---------------- text size per panel (A− / A+ buttons, Ctrl + mouse wheel) ---------------- */
const ZOOM_TARGETS = {
  bibles: ['#bvBiblesDrawer', '#pane-bibles'], tree: ['#bibleTree'], study: ['#studyBody'],
  compare: ['#cmpBody'], cmt: ['#cmtBody'], lib: ['.libsplit', '#libFeed'],
  search: ['#searchResults', '#searchBooks', '#searchStats'], bsearch: ['#bsResults']
};
const ZOOM_NAMES = {
  bibles: 'Bibles list', tree: 'Bible tree', study: 'My Study',
  compare: 'Compare', cmt: 'Commentary', lib: 'Library',
  search: 'Bible search results', bsearch: 'Book search results'
};
function zoomPanel(id, d) {
  if (id === 'bible') return zoomView(state.active, d);
  if (typeof id === 'number') return zoomView(id, d);
  if (id === 'ui') { if (window.TimotheosOptions && TimotheosOptions.stepUiSize) TimotheosOptions.stepUiSize(d); return; }
  if (!ZOOM_TARGETS[id]) return;
  const a = TimotheosOptions.appearance(); a.zoom = Object.assign({}, a.zoom);
  const z = Math.round(Math.min(2.5, Math.max(0.6, (a.zoom[id] || 1) + d * 0.1)) * 10) / 10;
  a.zoom[id] = z; save({ appearance: a }); applyZoom();
  TimotheosStudy.flash(`${ZOOM_NAMES[id] || id} text ${Math.round(z * 100)}%`);
}
function applyZoom() {
  const z = TimotheosOptions.appearance().zoom || {};
  for (const [id, sels] of Object.entries(ZOOM_TARGETS)) for (const s of sels) { const el = $(s); if (el) el.style.zoom = z[id] || 1; }
}
window.applyZoom = applyZoom;
function wireZoom() {
  applyZoom();
  $('#bibleZoomOut').onclick = () => zoomPanel('bible', -1);
  $('#bibleZoomIn').onclick = () => zoomPanel('bible', 1);
  let acc = 0;
  document.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const pane = e.target.closest && e.target.closest('#view > .bv');
    const bvd = e.target.closest && e.target.closest('#bvBiblesDrawer');
    const uiChrome = e.target.closest && e.target.closest('#titlebar, #toolbar, #statusbar, .dcap, #optionsDlg');
    const p = bvd ? 'bibles' : pane ? +pane.dataset.i : uiChrome ? 'ui' : e.target.closest && (e.target.closest('#center') ? 'bible' : (e.target.closest('.dpanel') || {}).dataset?.panel);
    if (p == null || (p !== 'bible' && p !== 'ui' && typeof p !== 'number' && !ZOOM_TARGETS[p])) return;
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    if (Math.abs(dy) >= 50) { acc = 0; zoomPanel(p, dy < 0 ? 1 : -1); return; }
    acc += dy;
    if (Math.abs(acc) >= 100) { zoomPanel(p, acc < 0 ? 1 : -1); acc = 0; }
  }, { passive: false });
}


const TB_ITEM_MAP = {
  tbBackFwd: ['#backBtn', '#fwdBtn'],
  tbGoto: ['#refForm'],
  tbPrevNext: ['#prevBtn', '#nextBtn'],
  tbSearch: ['#searchBtn'],
  tbCopy: ['#copyBtn'],
  tbPrint: ['#printBtn'],
};
function toolbarItemsState() {
  return Object.assign({
    tbBackFwd: true, tbGoto: true, tbPrevNext: true,
    tbSearch: true, tbCopy: true, tbPrint: true,
  }, (state.settings && state.settings.toolbarItems) || {});
}
function applyToolbarItems() {
  const ti = toolbarItemsState();
  for (const [key, sels] of Object.entries(TB_ITEM_MAP)) {
    const show = ti[key] !== false;
    for (const s of sels) {
      const el = $(s);
      if (el) el.classList.toggle('hidden', !show);
    }
  }
  const anyNav = ti.tbBackFwd !== false || ti.tbGoto !== false || ti.tbPrevNext !== false;
  const sep = $('#toolbar .tsep');
  if (sep) sep.classList.toggle('hidden', !anyNav);
  for (const cb of document.querySelectorAll('[data-tbshow]')) {
    cb.checked = ti[cb.dataset.tbshow] !== false;
  }
  if (window.TimotheosTitlebar && TimotheosTitlebar.rebuild) TimotheosTitlebar.rebuild();
}
function setToolbarItem(key, on) {
  const ti = toolbarItemsState();
  ti[key] = on === undefined ? !ti[key] : !!on;
  state.settings.toolbarItems = ti;
  save({ toolbarItems: ti });
  applyToolbarItems();
}
window.setToolbarItem = setToolbarItem;
window.toolbarItemsState = toolbarItemsState;

function setShow(key, on) {
  if (VIEW_KEYS.includes(key) && views().length) { toggleViewShow(state.active, key, on); return; }
  state.settings.show[key] = on;
  save({ show: state.settings.show }); syncViewMenu(); renderChapter();
}
function syncViewMenu() {
  for (const cb of document.querySelectorAll('[data-show]')) cb.checked = VIEW_KEYS.includes(cb.dataset.show) ? effShow(cb.dataset.show) : !!state.settings.show[cb.dataset.show];
  const sec = document.querySelectorAll('#view > .bv')[state.active];
  if (sec) { const sh = viewShow(state.active); sec.querySelectorAll('.bvside [data-k]').forEach(b => b.classList.toggle('on', !!sh[b.dataset.k])); }
}

function save(patch) { Object.assign(state.settings, patch); api.setSettings(patch).catch(() => {}); }

/* ---------------- modules ---------------- */
/** the lists the program shows: modules you took out of the lists stay in Options → Modules only */
function visibleModules(l) {
  const keep = a => (a || []).filter(m => !m.hidden);
  return Object.assign({}, l, { bibles: keep(l.bibles), books: keep(l.books), dicts: keep(l.dicts) });
}
async function refreshModules(list) {
  state.allModules = list || await api.listModules();
  state.modules = visibleModules(state.allModules);
  const ids = state.modules.bibles.map(b => b.id);
  const prevZoom = (views()[0] && views()[0].zoom) || state.settings.bibleZoom || 1;
  let vs = views().filter(v => ids.includes(v.bible));
  if (!vs.length && ids.length) vs = [{ bible: ids[0], linked: true, zoom: prevZoom !== 1 ? prevZoom : undefined }];
  state.settings.views = vs; if (state.active >= vs.length) state.active = Math.max(0, vs.length - 1);
  state.ref = refOfView(state.active);
  syncOpen();
  for (const v of vs) await ensureInfo(v.bible);
  renderModuleList(); renderDictSelects(); renderPopupSelects(); renderFolders(); renderModuleManager();
  TimotheosModules.renderLibraryList(); TimotheosModules.fillLibSelect(); TimotheosBookSearch.fillScope(); if (window.TimotheosSearch && TimotheosSearch.fillBibleList) TimotheosSearch.fillBibleList();
  if ((state.modules.books || []).some(b => !b.opened)) api.describeModules().then(l => { state.allModules = Object.assign(l, { errors: state.modules.errors }); state.modules = visibleModules(state.allModules); renderDictSelects(); TimotheosModules.renderLibraryList(); TimotheosModules.fillLibSelect(); TimotheosBookSearch.fillScope(); }).catch(() => {});
  $('#empty').classList.toggle('hidden', ids.length > 0);
  statusMods();
  $('#view').classList.toggle('hidden', ids.length === 0);
  await rebuildNav();
  await go(state.ref, false);
}
function statusMods() {
  const ids = state.modules.bibles;
  $('#stMods').textContent = `${ids.length} Bible${ids.length === 1 ? '' : 's'} · ${(state.modules.books || []).length} library modules · ${views().length} Bible view${views().length === 1 ? '' : 's'}${state.settings.portable ? ' · Portable' : ''}`;
}

async function ensureInfo(id) {
  if (state.infos.has(id)) return state.infos.get(id);
  try { const info = await api.bibleInfo(id); state.infos.set(id, info); return info; }
  catch (e) { state.modules.errors.push(`${id.slice(3)}: ${e.message}`); return null; }
}

/* ---------------- 0.5.8: Design 3 Collapsible Left Bibles Drawer Inside the Bible View ---------------- */
let dragBibleId = null;
function ordViewLabel(idx) {
  const n = idx + 1;
  const suf = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `(${n}${suf} view)`;
}
function setBiblesDrawerOpen(open, savePref = true) {
  const dr = $('#bvBiblesDrawer'), sp = $('#bvBiblesSplit'), btn = $('#bvBiblesBtn'), caret = $('#bvBiblesCaret');
  if (!dr) return;
  const on = open === undefined ? dr.classList.contains('hidden') : !!open;
  dr.classList.toggle('hidden', !on);
  if (sp) sp.classList.toggle('hidden', !on);
  if (btn) btn.classList.toggle('on', on);
  if (caret) caret.textContent = on ? '◂' : '▸';
  if (savePref && state.settings) {
    state.settings.bvdOpen = on;
    save({ bvdOpen: on });
  }
}
window.setBiblesDrawerOpen = setBiblesDrawerOpen;

function wireBiblesDrawer() {
  const dr = $('#bvBiblesDrawer'), sp = $('#bvBiblesSplit'), btn = $('#bvBiblesBtn'), closeBtn = $('#bvdCloseBtn');
  const fi = $('#bvdFilter'), autoCb = $('#bvdAutoHide'), impBtn = $('#bvdImportBtn');
  if (!dr) return;
  const w0 = Math.max(170, Math.min(440, (state.settings && state.settings.bvdWidth) || 235));
  dr.style.width = w0 + 'px';
  if (autoCb) {
    autoCb.checked = !!(state.settings && state.settings.bvdAutoHide);
    autoCb.onchange = () => { state.settings.bvdAutoHide = autoCb.checked; save({ bvdAutoHide: autoCb.checked }); };
  }
  setBiblesDrawerOpen(!!(state.settings && state.settings.bvdOpen), false);
  if (btn) btn.onclick = () => setBiblesDrawerOpen();
  if (closeBtn) closeBtn.onclick = () => setBiblesDrawerOpen(false);
  if (impBtn) impBtn.onclick = () => TimotheosModules.importModules();
  if (fi) {
    fi.oninput = () => filterBiblesDrawer(fi.value);
    fi.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#bibleList li:not(.hidden) .bvd-use');
        if (first) first.click();
      } else if (e.key === 'Escape') {
        fi.value = '';
        filterBiblesDrawer('');
      }
    };
  }
  if (sp) {
    sp.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { sp.setPointerCapture(e.pointerId); } catch (_) {}
      const x0 = e.clientX, startW = dr.offsetWidth;
      const move = ev => {
        const nw = Math.round(Math.max(170, Math.min(440, startW + ev.clientX - x0)));
        dr.style.width = nw + 'px';
        state.settings.bvdWidth = nw;
      };
      const up = () => {
        sp.removeEventListener('pointermove', move);
        sp.removeEventListener('pointerup', up);
        sp.removeEventListener('pointercancel', up);
        sp.removeEventListener('lostpointercapture', up);
        save({ bvdWidth: state.settings.bvdWidth });
      };
      sp.addEventListener('pointermove', move);
      sp.addEventListener('pointerup', up);
      sp.addEventListener('pointercancel', up);
      sp.addEventListener('lostpointercapture', up);
    });
    sp.addEventListener('dblclick', () => {
      dr.style.width = '235px';
      state.settings.bvdWidth = 235;
      save({ bvdWidth: 235 });
    });
  }
}

function filterBiblesDrawer(q) {
  const ql = String(q || '').trim().toLowerCase();
  document.querySelectorAll('#bibleList > li').forEach(li => {
    const hay = (li.dataset.search || '').toLowerCase();
    li.classList.toggle('hidden', !!ql && !hay.includes(ql));
  });
}

function renderModuleList() {
  const ul = $('#bibleList'); if (!ul) return;
  ul.innerHTML = '';
  const open = views().map(v => v.bible);
  const btnLbl = $('#bvBiblesBtnLbl'), cntLbl = $('#bvdCount');
  if (btnLbl) btnLbl.textContent = `Bibles (${open.length})`;
  if (cntLbl) cntLbl.textContent = `(${open.length} of ${state.modules.bibles.length})`;

  const sorted = [...state.modules.bibles].sort((a, b) => {
    const ia = open.indexOf(a.id), ib = open.indexOf(b.id);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return a.name.localeCompare(b.name);
  });
  for (const m of sorted) {
    const info = state.infos.get(m.id);
    const abbr = info ? info.abbr : m.abbr;
    const ttl = info ? info.title : m.name;
    const openIdx = open.indexOf(m.id);
    const on = openIdx >= 0;
    const isAct = on && openIdx === state.active;
    const fmt = m.id.startsWith('es:') ? 'e-Sword' : m.id.startsWith('bk:') ? 'book' : m.id.startsWith('usfm:') ? 'USFM' : m.id.startsWith('usfx:') ? 'USFX' : m.name.split('.').pop();
    const li = document.createElement('li');
    li.className = (on ? 'bvd-on' : '') + (isAct ? ' bvd-active' : '');
    li.dataset.bid = m.id;
    li.dataset.search = `${abbr} ${ttl} ${m.name} ${fmt}`;
    li.draggable = true;
    li.innerHTML = `
      <span class="bvd-grip" title="Drag to reorder side-by-side Bible views">⋮⋮</span>
      <input type="checkbox" class="bvd-cb" ${on ? 'checked' : ''} title="${on ? 'Close this parallel Bible view' : 'Open in a parallel Bible view (side-by-side)'}">
      <button type="button" class="bvd-use" title="${esc(ttl)}\nClick to read in the active Bible view">
        <span class="bvd-top">
          <span class="abbr">${esc(abbr)}</span>
          ${on ? `<span class="bvd-ord">${esc(ordViewLabel(openIdx))}</span>` : ''}
        </span>
        <span class="ttl">${esc(ttl)}</span>
      </button>
      ${on && openIdx > 0 ? '<button type="button" class="mv" title="Move its view to the left">↑</button>' : ''}
      <button type="button" class="pp" title="Module properties (${esc(fmt)})">${TimotheosIcons.icon('info', 13)}</button>`;

    li.querySelector('.bvd-cb').addEventListener('change', async e => {
      if (e.target.checked) await addView(m.id);
      else {
        const vs = views().filter(v => v.bible !== m.id);
        if (!vs.length) { e.target.checked = true; return flashMsg('At least one Bible view stays open'); }
        setViews(vs);
      }
    });
    li.querySelector('.bvd-use').onclick = async e => {
      e.preventDefault(); e.stopPropagation();
      if (on) {
        setActive(openIdx);
        renderModuleList();
      } else {
        await useBible(m.id);
      }
      if (state.settings && state.settings.bvdAutoHide) setBiblesDrawerOpen(false);
    };
    li.querySelector('.pp').onclick = e => { e.preventDefault(); e.stopPropagation(); TimotheosProps.open(m.id); };
    const mv = li.querySelector('.mv');
    if (mv) mv.addEventListener('click', async e => {
      e.stopPropagation();
      const vs = [...views()]; const i = vs.findIndex(v => v.bible === m.id);
      if (i > 0) { const act = vs[state.active]; [vs[i - 1], vs[i]] = [vs[i], vs[i - 1]]; state.active = vs.indexOf(act); setViews(vs); }
    });

    // HTML5 drag-and-drop to reorder side-by-side Bible views
    li.addEventListener('dragstart', e => {
      dragBibleId = m.id;
      li.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', m.id); } catch (_) {}
    });
    li.addEventListener('dragend', () => {
      dragBibleId = null;
      li.classList.remove('dragging');
      ul.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    });
    li.addEventListener('dragover', e => {
      if (!dragBibleId || dragBibleId === m.id) return;
      e.preventDefault();
      li.classList.add('drag-over');
    });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', async e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      const fromId = dragBibleId;
      dragBibleId = null;
      if (!fromId || fromId === m.id) return;
      await ensureInfo(fromId);
      const vs = [...views()];
      const actObj = vs[state.active];
      let fromIdx = vs.findIndex(v => v.bible === fromId);
      let fromItem;
      if (fromIdx >= 0) {
        [fromItem] = vs.splice(fromIdx, 1);
      } else {
        fromItem = { bible: fromId, linked: true };
      }
      const toIdx = vs.findIndex(v => v.bible === m.id);
      if (toIdx >= 0) vs.splice(toIdx, 0, fromItem);
      else vs.push(fromItem);
      state.active = Math.max(0, vs.indexOf(actObj >= 0 ? actObj : fromItem));
      await setViews(vs);
    });

    ul.appendChild(li);
  }
  const fi = $('#bvdFilter');
  if (fi && fi.value.trim()) filterBiblesDrawer(fi.value);

  const errs = $('#modErrors'); errs.innerHTML = '';
  for (const e of (state.modules.errors || []).filter(x => !/encrypted/i.test(x))) { const li = document.createElement('li'); li.textContent = e; errs.appendChild(li); }
  for (const id of new Set(open)) {
    const info = state.infos.get(id);
    for (const w of (info && info.warnings) || []) { const li = document.createElement('li'); li.className = /are shown as/.test(w) ? 'info' : ''; li.textContent = `${info.abbr}: ${w}`; errs.appendChild(li); }
  }
}
function flashMsg(m) { if (window.TimotheosStudy) TimotheosStudy.flash(m); }

/* ---------------- Options → Modules: every installed module, take it out of the lists or delete its file ---------------- */
const MOD_KINDS = { bible: 'Bibles', commentary: 'Commentaries', dictionary: 'Dictionaries', book: 'Books', devotional: 'Devotionals', map: 'Maps', other: 'Other' };
function renderModuleManager() {
  const box = $('#modMgr'); if (!box) return;
  const all = state.allModules || state.modules;
  const rows = [
    ...(all.bibles || []).map(m => ({ id: m.id, kind: 'bible', name: m.title || m.abbr || m.name, file: m.name, fmt: m.format || '', hidden: !!m.hidden })),
    ...(all.books || []).map(m => ({ id: m.id, kind: MOD_KINDS[m.kind] ? m.kind : 'other', name: m.title && m.opened !== false ? m.title : m.name, file: m.name, fmt: m.format || '', hidden: !!m.hidden, locked: !!m.locked }))
  ];
  const q = (($('#modFilter') || {}).value || '').trim().toLowerCase();
  const shown = rows.filter(r => !q || `${r.name} ${r.file} ${r.fmt}`.toLowerCase().includes(q));
  let html = '';
  for (const k of Object.keys(MOD_KINDS)) {
    const list = shown.filter(r => r.kind === k).sort((a, b) => a.name.localeCompare(b.name)); if (!list.length) continue;
    html += `<div class="mmk"><b>${MOD_KINDS[k]}</b> <span class="small">${list.length}</span></div>` + list.map(r => `<div class="mmrow${r.hidden ? ' off' : ''}" data-id="${esc(r.id)}"><label title="Untick to take this module out of every list; the file stays"><input type="checkbox" class="mmshow"${r.hidden ? '' : ' checked'}> <span class="mmname">${esc(r.name)}</span></label><span class="small mmfile" title="${esc(r.file)}">${esc(r.file)}</span><button type="button" class="mminfo" title="Properties">${TimotheosIcons.icon('info', 13)}</button><button type="button" class="mmdel" title="Move the file of this module to the Recycle Bin">Delete file…</button></div>`).join('');
  }
  box.innerHTML = html || '<p class="hint">No modules.</p>';
  const nh = rows.filter(r => r.hidden).length;
  const c = $('#modMgrCount'); if (c) c.textContent = `${rows.length} modules${nh ? ` · ${nh} out of the lists` : ''}`;
}
function wireModuleManager() {
  const box = $('#modMgr'); if (!box) return;
  $('#modFilter').oninput = renderModuleManager;
  box.addEventListener('change', async e => {
    const cb = e.target.closest('.mmshow'); if (!cb) return;
    const id = cb.closest('.mmrow').dataset.id; const hid = new Set(state.settings.hiddenModules || []);
    if (cb.checked) hid.delete(id); else hid.add(id);
    state.settings.hiddenModules = [...hid];
    await refreshModules(await api.setHiddenModules([...hid]));
  });
  box.addEventListener('click', async e => {
    const row = e.target.closest('.mmrow'); if (!row) return; const id = row.dataset.id;
    if (e.target.closest('.mminfo')) return TimotheosProps.open(id);
    if (e.target.closest('.mmdel')) {
      const r = (state.allModules.bibles || []).concat(state.allModules.books || []).find(m => m.id === id) || {};
      const ok = await TimotheosModules.confirmBox('Delete the module file', `Move the file <b>${esc(r.name || id)}</b> to the Recycle Bin?<br><span class="small">It disappears from Timotheos and from every other program that reads the same folder. You can get it back from the Recycle Bin.</span>`);
      if (!ok) return;
      try { await refreshModules(await api.deleteModuleFile(id)); flashMsg('Moved to the Recycle Bin: ' + (r.name || id)); }
      catch (err) { TimotheosModules.messageBox('Could not delete', esc(err.message)); }
    }
  });
}

function renderPopupSelects() {
  for (const [sel, key] of [['#popupOT', 'popupOT'], ['#popupNT', 'popupNT']]) {
    const el = $(sel); if (!el) continue;
    el.innerHTML = '<option value="">The first open Bible</option>' + state.modules.bibles.map(b => { const inf = state.infos.get(b.id); return `<option value="${esc(b.id)}">${esc(inf ? inf.abbr : b.abbr)} – ${esc(inf ? inf.title : b.name)}</option>`; }).join('');
    el.value = state.settings[key] && state.modules.bibles.some(b => b.id === state.settings[key]) ? state.settings[key] : '';
    el.onchange = () => { save({ [key]: el.value }); };
  }
}
function renderDictSelects() {
  for (const [sel, key] of [['#greekDict', 'greekDict'], ['#hebrewDict', 'hebrewDict'], ['#morphDict', 'morphDict']]) {
    const s = $(sel); s.innerHTML = '<option value="">Automatic</option>';
    for (const d of state.modules.dicts.filter(d => !d.locked)) { const o = document.createElement('option'); o.value = d.id; o.textContent = d.opened ? d.title : d.name.replace(/\.[^.]+(\.twm)?$/i, ''); s.appendChild(o); }
    s.value = String(state.settings[key] || '').replace(/^dct:/, 'bm:');
    if (s.selectedIndex < 0) s.value = '';
    s.onchange = () => { save({ [key]: s.value || null }); lookupCache.clear(); };
  }
}

function renderFolders() {
  const ul = $('#folderList'); ul.innerHTML = '';
  for (const f of state.settings.moduleFolders || []) {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(f)}</span><button title="Remove folder">×</button>`;
    li.querySelector('button').onclick = async () => { const l = await api.removeFolder(f); state.settings = await api.getSettings(); state.infos.clear(); initViews(); await refreshModules(l); };
    ul.appendChild(li);
  }
  if (!(state.settings.moduleFolders || []).length) ul.innerHTML = '<li><span>No folders yet.</span></li>';
}

async function addFolder() { const l = await api.addFolder(); if (l) { state.settings = await api.getSettings(); state.infos.clear(); initViews(); await refreshModules(l); } }
async function rescan() { const l = await api.rescan(); state.infos.clear(); await refreshModules(l); }

/* ---------------- Bible views ---------------- */
const VIEW_KEYS = ['strongs', 'morph', 'lemma', 'columns', 'footnotes', 'headings', 'woj', 'added', 'xrefs', 'paragraph'];
const SIDE = [['strongs', 'S', "Strong's numbers (S)"], ['morph', 'M', 'Morphology codes (M)'], ['lemma', 'L', 'Lemmas (L)'], ['columns', '⫼', 'Intralinear View: each word over its original word (Alt+I)'], ['footnotes', 'F', 'Footnotes (F)'], ['headings', 'H', 'Headings (H)'],
  ['woj', 'J', 'Words of Jesus in red (J)'], ['added', 'I', 'Added words in italics (I)'], ['xrefs', 'X', 'Cross-references (X)'], ['paragraph', '¶', 'Paragraph mode (P)']];
const views = () => state.settings.views || [];
function initViews() {
  const defZoom = state.settings.bibleZoom || 1;
  let vs = Array.isArray(state.settings.views) ? state.settings.views.filter(v => v && v.bible) : [];
  if (!vs.length) vs = (state.settings.openBibles || []).map(b => ({ bible: b, linked: true, zoom: defZoom !== 1 ? defZoom : undefined }));
  state.settings.views = vs;
  state.active = Math.min(Math.max(0, state.settings.activeView || 0), Math.max(0, vs.length - 1));
  state.linkRef = state.settings.ref || state.ref;
  state.ref = refOfView(state.active);
}
/** the name shown on a view: your own label, else the Bible's abbreviation */
function viewName(i) { const v = views()[i]; if (!v) return ''; const inf = state.infos.get(v.bible); return v.label || (inf ? inf.abbr : v.bible.replace(/^\w+:/, '')); }
window.viewName = viewName;
function refOfView(i) { const v = views()[i]; return v && !v.linked && v.ref ? v.ref : state.linkRef; }
function syncOpen() { state.settings.openBibles = views().map(v => v.bible); }
function storeViews() { syncOpen(); save({ views: views(), openBibles: state.settings.openBibles, activeView: state.active }); }
let extSyncSuppressUntil = 0;
function commitRef() {
  const v = views()[state.active];
  if (v && !v.linked) { v.ref = state.ref; storeViews(); } else { state.linkRef = state.ref; save({ ref: state.ref }); }
  const bk = (state.nav || []).find(x => x.id === state.ref.b);
  if (bk) document.title = `${bk.name} ${state.ref.c}:${state.ref.v} - Timotheos`;
  if (Date.now() >= extSyncSuppressUntil && api.syncOut) {
    api.syncOut({ ref: state.ref, bookName: bk ? bk.name : '' }).catch(() => {});
  }
}
function viewShow(i) { const s = Object.assign({}, state.settings.show); const v = views()[i]; if (v && v.show) Object.assign(s, v.show); return s; }
function effShow(key, i = state.active) { return !!viewShow(i)[key]; }
window.effShow = effShow;
function sameMove(i, j) { const vs = views(); return i === j || (vs[i] && vs[j] && vs[i].linked && vs[j].linked); }
const paneTexts = () => [...document.querySelectorAll('#view > .bv > .bvbody > .bvtext')];
function activeText() { return paneTexts()[state.active] || $('#view'); }
window.activeText = activeText;

async function setViews(vs) {
  state.settings.views = vs; if (state.active >= vs.length) state.active = vs.length - 1;
  state.ref = refOfView(state.active);
  storeViews(); renderModuleList(); statusMods(); await rebuildNav(); await go(state.ref, false);
}
async function addView(bible) {
  await ensureInfo(bible);
  const vs = [...views(), { bible, linked: true }]; state.active = vs.length - 1;
  await setViews(vs);
}
async function useBible(bible) {
  if (!views().length) return addView(bible);
  await ensureInfo(bible);
  views()[state.active].bible = bible; await setViews([...views()]);
}
function closeView(i) {
  if (views().length < 2) return flashMsg('At least one Bible view stays open');
  const vs = views().filter((_, k) => k !== i); if (state.active > i || state.active >= vs.length) state.active = Math.max(0, state.active - 1);
  setViews(vs);
}
function setActive(i, quiet) {
  if (i === state.active || !views()[i]) return;
  state.active = i; state.ref = refOfView(i);
  document.querySelectorAll('#view > .bv').forEach((sec, k) => sec.classList.toggle('active', k === i));
  storeViews();
  syncNavControls();
  if (!quiet) TimotheosModules.updateCommentary();
  syncViewMenu();
}
window.setActiveView = setActive;
window.refreshPaneLooks = () => document.querySelectorAll('#view > .bv').forEach((sec, i) => { if (views()[i]) applyPaneLook(sec, i); });
function toggleViewShow(i, key, on) {
  const v = views()[i]; if (!v) return;
  const val = on === undefined ? !effShow(key, i) : on;
  v.show = Object.assign({}, v.show, { [key]: val });
  if (val === !!state.settings.show[key]) delete v.show[key];
  storeViews(); syncViewMenu(); renderChapter(false);
  return val;
}
function zoomView(i, d) {
  const v = views()[i]; if (!v) return;
  const z = Math.round(Math.min(2.5, Math.max(0.6, (v.zoom || 1) + d * 0.1)) * 10) / 10;
  v.zoom = z; state.settings.bibleZoom = z; save({ bibleZoom: z }); storeViews();
  const sec = document.querySelectorAll('#view > .bv')[i]; if (sec) applyPaneLook(sec, i);
  flashMsg(`${viewName(i)}: text ${d > 0 ? 'larger' : 'smaller'}`);
}
const baseSize = () => state.settings.fontSize || 17;
function applyPaneLook(sec, i) {
  const v = views()[i]; const ap = TimotheosOptions.appearance(); const t = sec.querySelector('.bvtext');
  t.style.setProperty('--size', Math.round(baseSize() * (v.zoom || 1) * 10) / 10 + 'px');
  t.style.fontFamily = v.font ? `'TwGreek', 'TwHebrew', '${String(v.font).replace(/['\\]/g, '')}', var(--font-text)` : '';
  if (v.font) t.style.setProperty('--font-text', `'TwGreek', 'TwHebrew', '${String(v.font).replace(/['\\]/g, '')}', 'Gentium Plus', Georgia, serif`); else t.style.removeProperty('--font-text');
  t.dataset.vnpos = v.vnPos || ap.vnPos; t.dataset.vnstyle = ap.vnStyle;
  if (v.color) t.style.color = v.color; else t.style.removeProperty('color');
  if (v.selBg) t.style.setProperty('--sel', v.selBg); else t.style.removeProperty('--sel');
  const bar = (q, c) => { const b = sec.querySelector(q + ' .bar'); if (b) b.style.background = c || 'transparent'; };
  bar('.bvfcolor', v.color); bar('.bvselbg', v.selBg); bar('.bvpen', state.pen && state.pen.color);
  const pb = sec.querySelector('.bvpen'); if (pb) pb.classList.toggle('on', !!(state.pen && state.pen.kind === 'hl'));
  const ub = sec.querySelector('.bvul'); if (ub) ub.classList.toggle('on', !!(state.pen && state.pen.kind === 'ul'));
}
function ensurePanes() {
  const host = $('#view'); const vs = views();
  while (host.children.length > vs.length) host.lastElementChild.remove();
  while (host.children.length < vs.length) {
    const sec = document.createElement('section'); sec.className = 'bv';
    sec.innerHTML = `<header class="bvcap"><button class="bvbible" data-a="bible" title="Choose the Bible of this view (double-click to rename this view)"></button><span class="bvref"></span><span class="grow"></span>
      <button class="dbtn" data-a="close" title="Close this Bible view">${TimotheosIcons.icon('close', 14)}</button></header>
      <div class="bvbody"><nav class="bvside" aria-label="Settings of this view">
        <button data-a="menu" class="bvmenubtn" title="What this view shows, and its options" aria-haspopup="true">${TimotheosIcons.icon('menu', 16)}</button>
        <span class="bvsep"></span>
        <button data-a="info" title="Bible info: about this module">${TimotheosIcons.icon('info', 15)}</button>
        <button data-a="link" class="bvlink" title="Sync: move together with the other Bible views (click to let this view read on by itself)">${TimotheosIcons.icon('link', 15)}</button>
        <button data-a="zin" title="Font up (Ctrl + mouse wheel up)">${TimotheosIcons.icon('textUp', 15)}</button>
        <button data-a="zout" title="Font down (Ctrl + mouse wheel down)">${TimotheosIcons.icon('textDown', 15)}</button>
        <button data-a="fcolor" class="bvfcolor" title="Font colour">${TimotheosIcons.icon('fontColor', 15)}<i class="bar"></i></button>
        <button data-a="font" title="Font of this view">${TimotheosIcons.icon('type', 15)}</button>
        <button data-a="selbg" class="bvselbg" title="Background of the active verse">${TimotheosIcons.icon('verseBg', 15)}<i class="bar"></i></button>
        <button data-a="pen" class="bvpen" title="Highlighter: choose a colour, then select text">${TimotheosIcons.icon('highlighter', 15)}<i class="bar"></i></button>
        <button data-a="ul" class="bvul" title="Underline: choose a style and colour, then select text">${TimotheosIcons.icon('underline', 15)}</button>
      </nav>
        <div class="bvtext view" tabindex="0"></div></div>`;
    host.appendChild(sec);
    const tx = sec.querySelector('.bvtext');
    let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => tx.style.setProperty('--half', Math.floor(tx.clientHeight / 2) + 'px')); }).observe(tx);
  }
  host.classList.toggle('centered', centerOn());
  [...host.children].forEach((sec, i) => {
    const v = vs[i]; const inf = state.infos.get(v.bible);
    sec.dataset.i = i; sec.dataset.linked = v.linked ? '1' : '0';
    sec.classList.toggle('active', i === state.active);
    sec.querySelector('.bvbible').textContent = viewName(i);
    sec.querySelector('.bvbible').title = (inf ? inf.title + ' – ' : '') + 'click to choose another Bible for this view · double-click to rename this view';
    sec.querySelector('.bvlink').classList.toggle('on', !!v.linked);
    applyPaneLook(sec, i);
  });
}
function paneMenu(btn, html, wire) {
  document.querySelectorAll('.bvmenu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu bvmenu'; m.innerHTML = html; document.body.appendChild(m);
  const r = btn.getBoundingClientRect(); const side = !!btn.closest('.bvside');
  m.style.left = Math.max(4, Math.min(side ? r.right + 4 : r.left, innerWidth - m.offsetWidth - 8)) + 'px';
  m.style.top = Math.max(4, Math.min(side ? r.top : r.bottom + 2, innerHeight - m.offsetHeight - 8)) + 'px';
  wire(m);
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off, true); } }, true), 0);
}
function toggleLink(i) {
  const v = views()[i]; if (!v) return;
  v.linked = !v.linked;
  if (!v.linked) v.ref = { ...refOfView(i) }; else delete v.ref;
  if (i === state.active) state.ref = refOfView(i);
  storeViews(); ensurePanes(); flashMsg(v.linked ? 'Sync on: this view moves with the others' : 'Sync off: this view reads on by itself');
  renderChapter(false); syncNavControls();
}
/** switch several things of one view on or off with a single redraw */
function setViewShowMany(i, obj) {
  const v = views()[i]; if (!v) return;
  v.show = Object.assign({}, v.show, obj);
  for (const k of Object.keys(obj)) if (!!obj[k] === !!state.settings.show[k]) delete v.show[k];
  storeViews(); syncViewMenu(); renderChapter(false);
}
function setVerseNumbers(i, on) {
  const v = views()[i]; const ap = TimotheosOptions.appearance();
  if (!on) v.vnPos = 'hidden'; else if (ap.vnPos === 'hidden') v.vnPos = 'margin'; else delete v.vnPos;
  if (v.vnPos === ap.vnPos) delete v.vnPos;
  storeViews(); renderChapter(false);
}
function wireViews() {
  const host = $('#view');
  host.addEventListener('mousedown', e => { const sec = e.target.closest('#view > .bv'); if (sec) setActive(+sec.dataset.i); }, true);
  host.addEventListener('dblclick', e => { const b = e.target.closest('.bvbible'); if (b) { const sec = b.closest('#view > .bv'); TimotheosViewUI.rename(+sec.dataset.i, b); } });
  host.addEventListener('focusin', e => { const sec = e.target.closest('#view > .bv'); if (sec) setActive(+sec.dataset.i); });
  host.addEventListener('click', e => {
    const sec = e.target.closest('#view > .bv'); if (!sec) return; const i = +sec.dataset.i; const v = views()[i];
    const refSpan = e.target.closest('.bvref');
    if (refSpan && refSpan.textContent && window.TimotheosNav) { setActive(i); TimotheosNav.openNavPopover('book', refSpan, i); return; }
    const a = e.target.closest('[data-a]'); if (!a) return;
    const act = a.dataset.a;
    if (act === 'zin' || act === 'zout') return zoomView(i, act === 'zin' ? 1 : -1);
    if (act === 'close') return closeView(i);
    if (act === 'link') return toggleLink(i);
    if (act === 'vnum') {
      const order = ['margin', 'inline', 'hidden']; const ap = TimotheosOptions.appearance();
      v.vnPos = order[(order.indexOf(v.vnPos || ap.vnPos) + 1) % 3]; if (v.vnPos === ap.vnPos) delete v.vnPos;
      storeViews(); renderChapter(false);
      return flashMsg('Verse numbers: ' + { margin: 'in a column', inline: 'in the text', hidden: 'hidden' }[v.vnPos || ap.vnPos]);
    }
    if (act === 'font') {
      const fonts = TimotheosOptions.fonts();
      return paneMenu(a, `<div class="mh">Font of this view</div><select class="bvfont" size="12"><option value="">As in Options</option>${fonts.map(f => `<option${f === v.font ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>`, m => {
        const s = m.querySelector('select'); if (!v.font) s.value = '';
        s.onchange = () => { v.font = s.value || undefined; if (!v.font) delete v.font; storeViews(); ensurePanes(); };
      });
    }
    if (act === 'speak') return window.TimotheosSpeech && TimotheosSpeech.speakView(i, a);
    if (act === 'opts') return viewOptions(i, a);
    if (act === 'bible') return TimotheosViewUI.bibleMenu(a, i, false);
    if (act === 'menu') return TimotheosViewUI.mainMenu(a, i);
    if (act === 'info') return TimotheosProps.open(v.bible);
    if (act === 'fcolor') return TimotheosViewUI.colorMenu(a, 'Font colour of this view', v.color, c => { if (c) v.color = c; else delete v.color; storeViews(); ensurePanes(); });
    if (act === 'selbg') return TimotheosViewUI.colorMenu(a, 'Background of the active verse', v.selBg, c => { if (c) v.selBg = c; else delete v.selBg; storeViews(); ensurePanes(); });
    if (act === 'pen') return TimotheosViewUI.penMenu(a);
    if (act === 'ul') return TimotheosViewUI.underlineMenu(a);
  });
}

/* ---------------- what a view shows: footnote marks, lemmas, intralinear view, the Bible's own switches ---------------- */
function decorateFootnotes(root, v, show) {
  const style = v.fnStyle || 'num';
  const lab = n => style === 'letter' ? (n > 26 ? String.fromCharCode(96 + Math.ceil(n / 26) - 1) : '') + String.fromCharCode(97 + (n - 1) % 26) : style === 'star' ? '*' : String(n);
  let n = 0; const items = [];
  for (const f of root.querySelectorAll('sup.fn')) {
    n++; if (!f.dataset.q) f.textContent = lab(n);
    const vv = (f.closest('[data-v]') || {}).dataset?.v;
    items.push(`<li data-gov="${vv}"><b>${esc(f.textContent || '')}</b> <span class="small">${vv}</span> ${TWRender.render(f.dataset.note || '', { rules: [] }, Object.assign({}, show, { footnotes: false }))}</li>`);
  }
  if (v.fnList && items.length) root.insertAdjacentHTML('beforeend', `<section class="fnlist"><h4>Footnotes</h4><ol>${items.join('')}</ol></section>`);
}
function showLemmas(root) {
  root.querySelectorAll('[data-lemma]:not(sup)').forEach(w => w.insertAdjacentHTML('afterend', `<sup class="lemma" data-lemma="${esc(w.dataset.lemma)}">${esc(w.dataset.lemma)}</sup>`));
}
const COL_LINES = [['orig', 'Original word'], ['tl', 'Transliteration'], ['strong', "Strong's number"], ['morph', 'Morphology'], ['lemma', 'Lemma']];
const colOn = (i, k) => ((views()[i] || {}).colLines || {})[k] !== false;
const origCache = new Map();
async function originalFor(key) {
  const activeBible = (views()[state.active] || {}).bible || '';
  const ck = key + '|' + activeBible + '|' + (state.settings.greekDict || '') + '|' + (state.settings.hebrewDict || '');
  if (origCache.has(ck)) return origCache.get(ck);
  let o = '';
  try { const r = await api.lookup('strong', key, activeBible); if (r) { const t = document.createElement('div'); t.innerHTML = r.html; const txt = (r.subject || '') + ' ' + (t.textContent || '').slice(0, 400); const m = (/^H/i.test(key) ? /[\u0590-\u05FF\uFB1D-\uFB4F]+(?:[\u05BE\s][\u0590-\u05FF\uFB1D-\uFB4F]+)?/ : /[\u0370-\u03FF\u1F00-\u1FFF\u0300-\u036F]+/).exec(txt); o = m ? m[0].trim() : ''; } } catch (e) { /* none */ }
  origCache.set(ck, o); return o;
}
function columnWords(i, root) {
  const tl = w => (window.TimotheosTranslit ? TimotheosTranslit.translit(w) : '');
  const need = [];
  for (const w of root.querySelectorAll('span.word[data-strong], span.word[data-morph], span.word[data-lemma]')) {
    const st = (w.dataset.strong || '').split(/\s+/).filter(Boolean); const lem = w.dataset.lemma || '';
    const box = document.createElement('span'); box.className = 'cw'; w.replaceWith(box); box.appendChild(w);
    const line = (cls, txt, attrs = {}) => { const e = document.createElement('span'); e.className = 'cl ' + cls; e.textContent = txt; for (const [a, val] of Object.entries(attrs)) e.setAttribute(a, val); box.appendChild(e); return e; };
    if (colOn(i, 'orig')) { const o = line('cl-orig', lem); if (!lem && st[0]) need.push([o, st[0]]); }
    if (colOn(i, 'tl')) line('cl-tl', lem ? tl(lem) : '');
    if (colOn(i, 'strong') && st.length) line('cl-strong', st.join(' '), { 'data-strong': st.join(' ') });
    if (colOn(i, 'morph') && w.dataset.morph) line('cl-morph', w.dataset.morph, { 'data-morph': w.dataset.morph });
    if (colOn(i, 'lemma') && lem) line('cl-lemma', lem, { 'data-lemma': lem });
  }
  const sv = String(refOfView(i).v);
  need.sort((a, b) => Number((b[0].closest('[data-v]') || {}).dataset?.v === sv) - Number((a[0].closest('[data-v]') || {}).dataset?.v === sv));
  (async () => {
    const keys = [...new Set(need.map(n => n[1]))];
    const activeBible = (views()[state.active] || {}).bible || '';
    const pk = '|' + activeBible + '|' + (state.settings.greekDict || '') + '|' + (state.settings.hebrewDict || '');
    for (let k = 0; k < keys.length; k += 20) {
      if (!root.isConnected) return;
      await Promise.all(keys.slice(k, k + 20).map(originalFor));
      for (const [el, key] of need) if (origCache.has(key + pk) && !el.textContent) { const o = origCache.get(key + pk); el.textContent = o; const t2 = el.nextElementSibling; if (t2 && t2.classList.contains('cl-tl') && !t2.textContent) t2.textContent = tl(o); }
    }
  })();
}
function ownSwitches(id) { const inf = state.infos.get(id); try { return inf ? TWRender.customToggles(inf) : []; } catch (e) { return []; } }
const customOn = n => ((state.settings.show.custom || {})[n]) !== false;
function setCustom(n, on) { state.settings.show.custom = Object.assign({}, state.settings.show.custom, { [n]: on }); save({ show: state.settings.show }); renderChapter(false); }
window.ownSwitchKeys = () => [...new Set(views().flatMap(v => ownSwitches(v.bible)))].filter(n => n.length === 1);
window.toggleOwnSwitch = n => { setCustom(n, !customOn(n)); flashMsg(`${n}: ${customOn(n) ? 'on' : 'off'}`); };
function viewOptions(i, btn) {
  const v = views()[i]; const sh = viewShow(i); const sw = ownSwitches(v.bible);
  const html = `<div class="mh">Footnote marks</div>${[['num', '1 2 3'], ['letter', 'a b c'], ['star', '*']].map(([k, l]) => `<label><input type="radio" name="vfs" value="${k}"${(v.fnStyle || 'num') === k ? ' checked' : ''}> ${l}</label>`).join('')}
    <label><input type="checkbox" class="vfl"${v.fnList ? ' checked' : ''}> List the footnotes under the chapter</label>
    ${sh.columns ? `<div class="mh">Intralinear lines</div>${COL_LINES.map(([k, l]) => `<label><input type="checkbox" class="vcl" value="${k}"${colOn(i, k) ? ' checked' : ''}> ${l}</label>`).join('')}` : ''}
    ${sw.length ? `<div class="mh">This Bible's own switches</div>${sw.map(n => `<label><input type="checkbox" class="vsw" value="${esc(n)}"${customOn(n) ? ' checked' : ''}> ${esc(n)}${n.length === 1 ? ` <kbd>${esc(n.toUpperCase())}</kbd>` : ''}</label>`).join('')}` : ''}
    <div class="msep"></div><button class="vdef" title="New Bible views start with what this view shows">Use these for new Bible views</button><button class="vreset">Back to the general settings</button>`;
  paneMenu(btn, html, m => {
    m.querySelectorAll('input[name="vfs"]').forEach(r => r.onchange = () => { v.fnStyle = r.value; if (r.value === 'num') delete v.fnStyle; storeViews(); renderChapter(false); });
    m.querySelector('.vfl').onchange = e => { if (e.target.checked) v.fnList = true; else delete v.fnList; storeViews(); renderChapter(false); };
    m.querySelectorAll('.vcl').forEach(c => c.onchange = () => { v.colLines = Object.assign({}, v.colLines, { [c.value]: c.checked }); storeViews(); renderChapter(false); });
    m.querySelectorAll('.vsw').forEach(c => c.onchange = () => setCustom(c.value, c.checked));
    m.querySelector('.vdef').onclick = () => { views().forEach((o, k) => { const eff = viewShow(k); o.show = Object.assign({}, o.show); for (const key of VIEW_KEYS) if (!(key in o.show)) o.show[key] = !!eff[key]; }); for (const k of VIEW_KEYS) state.settings.show[k] = !!sh[k]; save({ show: state.settings.show }); for (const o of views()) if (o.show) for (const k of VIEW_KEYS) if (o.show[k] === state.settings.show[k]) delete o.show[k]; storeViews(); syncViewMenu(); m.remove(); flashMsg('New Bible views will show what this one shows'); };
    m.querySelector('.vreset').onclick = () => { v.show = {}; delete v.fnStyle; delete v.fnList; delete v.colLines; delete v.vnPos; delete v.font; storeViews(); ensurePanes(); renderChapter(false); syncViewMenu(); m.remove(); };
  });
}

/* ---------------- navigation ---------------- */
async function rebuildNav() {
  state.nav = views().length ? await api.nav([...new Set(views().map(v => v.bible))]) : [];
  const dl = $('#refBooks'); if (dl) dl.innerHTML = state.nav.map(b => `<option value="${esc(b.name)} "></option>`).join('');
  const ot = $('#searchScope option[value="OT"]');
  if (ot) ot.textContent = state.settings.apocryphaPlacement === 'end' ? 'Old Testament' : 'Old Testament (with Apocrypha)';
}

function groupLabel(g) {
  const s1611 = state.settings.apocryphaPlacement !== 'end';
  return { OT: 'Old Testament', NT: 'New Testament', AP: s1611 ? 'Apocrypha (as in the 1611 KJV)' : 'Apocrypha', APX: 'Other deuterocanonical books (not in the 1611 KJV)' }[g] || g;
}

function syncNavControls() {
  const r = state.ref; const bk = state.nav.find(x => x.id === r.b);
  if (!bk) return;
  const ri = $('#refInput'); if (ri && document.activeElement !== ri) ri.value = `${bk.name} ${r.c}:${r.v}`;
  $('#stRef').textContent = `${bk.name} ${r.c}:${r.v}`;
  $('#chapterHead').innerHTML = `${esc(bk.name)} ${r.c}<span class="sub">${esc(groupLabel(bk.grp))}</span>`;
  updateHistoryButtons();
  if (window.TimotheosNav) TimotheosNav.syncAll();
}

async function go(ref, pushSave = true) {
  if (!state.nav.length) { $('#view').innerHTML = ''; $('#chapterHead').textContent = ''; return; }
  let bk = state.nav.find(x => x.id === ref.b) || state.nav[0];
  let c = ref.c || 1;
  if (!bk.chapterList.includes(c)) c = bk.chapterList.find(x => x >= c) || bk.chapterList[bk.chapterList.length - 1];
  const prev = state.ref;
  state.ref = { b: bk.id, c, v: ref.v || 1 };
  if (pushSave && ref.history !== false && prev && (prev.b !== state.ref.b || prev.c !== state.ref.c || prev.v !== state.ref.v)) {
    const last = state.back[state.back.length - 1];
    if (!last || last.b !== prev.b || last.c !== prev.c || last.v !== prev.v) state.back.push({ ...prev });
    if (state.back.length > 200) state.back.shift();
    if (!ref.keepFwd) state.fwd = [];
  }
  commitRef();
  syncNavControls();
  await renderChapter(true, views().map((_, i) => i).filter(i => sameMove(i, state.active) || !(paneTexts()[i] && paneTexts()[i].childElementCount)));
  TimotheosModules.updateCommentary();
}

function historyGo(d) {
  const from = d < 0 ? state.back : state.fwd, to = d < 0 ? state.fwd : state.back;
  const r = from.pop(); if (!r) return;
  to.push({ ...state.ref });
  go({ ...r, history: false });
}
function updateHistoryButtons() {
  const b = $('#backBtn'), f = $('#fwdBtn');
  if (b) { b.disabled = !state.back.length; b.title = state.back.length ? 'Back to ' + refName(state.back[state.back.length - 1]) + ' (Alt+←)' : 'Back (Alt+←)'; }
  if (f) { f.disabled = !state.fwd.length; f.title = state.fwd.length ? 'Forward to ' + refName(state.fwd[state.fwd.length - 1]) + ' (Alt+→)' : 'Forward (Alt+→)'; }
}
function refName(r) { const bk = state.nav.find(x => x.id === r.b); return `${bk ? bk.abbr : (window.BOOK_ABBR || {})[r.b] || r.b} ${r.c}:${r.v}`; }
function stepBook(d) {
  const i = state.nav.findIndex(x => x.id === state.ref.b); const n = state.nav[i + d];
  if (n) go({ b: n.id, c: n.chapterList[0], v: 1 });
}
const centerOn = () => state.settings.centerActive !== false;
/** put verse v in the vertical middle of a Bible text pane (the pane has room above and below for the first and last verses) */
function centerVerse(t, v, smooth = true) {
  const el = t.querySelector(`[data-v="${v}"]`); if (!el) return false;
  const tr = t.getBoundingClientRect(), er = el.getBoundingClientRect();
  const top = Math.max(0, t.scrollTop + (er.top - tr.top) - (t.clientHeight - er.height) / 2);
  if (Math.abs(top - t.scrollTop) < 2) return true;
  t._prog = Date.now() + (smooth ? 800 : 200); // our own scrolling is not the reader's
  t.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  return true;
}
window.centerVerse = centerVerse;
/** select verse v in the active view and in every view that moves with it: lit in all of them and centred in all of them */
function selectVerse(v, scroll = true, skipPane = -1) {
  const texts = paneTexts();
  const el = (texts[state.active] || $('#view')).querySelector(`[data-v="${v}"]`);
  const group = texts.map((t, i) => i).filter(i => sameMove(i, state.active));
  if (!el && !group.some(i => texts[i].querySelector(`[data-v="${v}"]`))) return false;
  for (const i of group) {
    const t = texts[i];
    t.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
    t.querySelectorAll(`[data-v="${v}"]`).forEach(x => { if (x.matches('tr, .pv')) x.classList.add('sel'); });
  }
  state.ref.v = v; commitRef();
  syncNavControls();
  if (centerOn()) { for (const i of group) if (i !== skipPane) centerVerse(texts[i], v); }
  else if (scroll && el) el.scrollIntoView({ block: 'nearest' });
  TimotheosModules.updateCommentary();
  return true;
}
/** the reader scrolled a view: the verse in its middle becomes the active verse, and the views that move with it follow */
let scrollTimer = null;
function wireScrollSync() {
  $('#view').addEventListener('scroll', e => {
    const t = e.target; if (!t.classList || !t.classList.contains('bvtext') || !centerOn() || (t._prog || 0) > Date.now()) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      if ((t._prog || 0) > Date.now()) return;
      const i = +t.closest('#view > .bv').dataset.i; const r = t.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + Math.min(r.width * 0.6, r.width - 8), r.top + r.height / 2);
      const row = hit && hit.closest ? hit.closest('[data-v]') : null; if (!row || !t.contains(row)) return;
      const v = +row.dataset.v; if (i !== state.active) setActive(i, true);
      if (v !== state.ref.v) selectVerse(v, false, i);
    }, 150);
  }, true);
}

function step(d) {
  const i = state.nav.findIndex(x => x.id === state.ref.b); if (i < 0) return;
  let b = state.nav[i]; const list = b.chapterList; const j = list.indexOf(state.ref.c) + d;
  let c;
  if (j < 0) { const p = state.nav[i - 1]; if (!p) return; b = p; c = p.chapterList[p.chapterList.length - 1]; }
  else if (j >= list.length) { const n = state.nav[i + 1]; if (!n) return; b = n; c = n.chapterList[0]; }
  else c = list[j];
  go({ b: b.id, c, v: 1 });
}

/* ---------------- chapter view ---------------- */
let renderSeq = 0;
function currentLayout() { return state.settings.layout === 'rows' && views().length > 1 ? 'rows' : 'cols'; }
const paneSeq = [];
async function renderChapter(scroll, only) {
  const seq = ++renderSeq;
  const vs = views(); if (!vs.length) return;
  ensurePanes();
  const host = $('#view'); host.dataset.arrange = currentLayout();
  const which = only || vs.map((_, i) => i);
  await Promise.all(which.map(i => renderPane(i, scroll, (paneSeq[i] = (paneSeq[i] || 0) + 1))));
  if (seq !== renderSeq) return;
  if (state.settings.diff) TimotheosStudy.markDifferences();
  TimotheosStudy.renderTree();
}
window.renderChapter = renderChapter;
async function renderPane(i, scroll, seq) {
  const v = views()[i]; const sec = document.querySelectorAll('#view > .bv')[i]; if (!v || !sec) return;
  const id = v.bible; const { b, c } = refOfView(i); const vv = refOfView(i).v;
  const data = await api.chapter([id], b, c);
  if (seq !== paneSeq[i]) return;
  const show = viewShow(i);
  const inf = state.infos.get(id);
  const layout = show.paragraph ? 'para' : 'cols';
  const ctx = { fn: { n: 0 }, b };
  const ap = TimotheosOptions.appearance();
  const vnPos = v.vnPos || ap.vnPos;
  const fontOf = ap.useModFont && !v.font && inf && inf.font ? ` style="font-family:'TwGreek', 'TwHebrew', '${esc(inf.font.split(',')[0])}', var(--font-text)"` : '';
  const cell = raw => TWRender.render(raw, inf || EMPTY_MOD, show, ctx);
  const drop = n => ap.chapNum === 'drop' && n === 1 ? `<span class="dropcap">${c}</span>` : '';
  const lead = n => drop(n) || (vnPos === 'inline' ? `<sup class="vnum">${n === 0 ? '¶' : n}</sup>` : '');
  const rows = data.rows.filter(r => r.cells[0] != null);
  sec.querySelector('.bvref').textContent = v.linked ? '' : `${data.book.name} ${c}`;
  sec.dataset.ref = `${b}.${c}`; sec.dataset.layout = layout;
  let html = '';
  if (!rows.length) html = `<p class="hint bvnone">${esc(data.book.name)} ${c} is not in ${esc(inf ? inf.abbr : 'this Bible')}.</p>`;
  else if (layout === 'para') {
    html = `<div class="paraview"><div class="pcol${inf && inf.rtl ? ' rtl' : ''}" data-colwrap="${i}"${fontOf}>`;
    for (const row of rows) {
      const vnum = drop(row.v) || (vnPos === 'hidden' ? '' : `<sup class="vnum">${row.v === 0 ? '¶' : row.v}</sup>`);
      let cHtml = cell(row.cells[0]);
      if (vnum) {
        const mLead = /^((?:<span class="heading[^"]*">[\s\S]*?<\/span>)*)(<span class="para\b[^>]*>)?([\s\S]*)$/.exec(cHtml);
        cHtml = mLead ? `${mLead[1] || ''}${mLead[2] || ''}${vnum}${mLead[3] || ''}` : `${vnum}${cHtml}`;
      }
      html += `<span class="pv${row.v === vv ? ' sel' : ''}" data-v="${row.v}" data-col="${i}">${cHtml}</span> `;
    }
    html += '</div></div>';
  } else {
    html = '<table class="chapter"><colgroup><col class="vn"><col></colgroup><tbody>';
    for (const row of rows) html += `<tr data-v="${row.v}"${row.v === vv ? ' class="sel"' : ''}><td class="vn"${row.v === 0 ? ' title="Prologue / superscription"' : ''}><span class="vno">${row.v === 0 ? '¶' : row.v}</span></td><td class="${inf && inf.rtl ? 'rtl' : ''}"${fontOf} data-col="${i}">${lead(row.v)}${cell(row.cells[0])}</td></tr>`;
    html += '</tbody></table>';
  }
  const t = sec.querySelector('.bvtext'); const keep = t.scrollTop;
  t.innerHTML = html; t.dataset.layout = layout;
  applyPaneLook(sec, i);
  t.classList.toggle('colmode', !!show.columns);
  decorateFootnotes(t, v, show);
  if (show.columns) columnWords(i, t); else if (show.lemma) showLemmas(t);
  const first = views().findIndex((_, k) => sameMove(k, i)) === i;
  TimotheosStudy.afterRender({ root: t, col: i, id, b, c, layout, notes: first });
  if (layout !== 'para') TimotheosModules.decorateChapter(b, c, t, show);
  if (i === state.active && window.TimotheosNav) TimotheosNav.syncAll(rows);
  if (scroll) {
    const el = t.querySelector(`[data-v="${vv}"]`);
    if (el && centerOn()) { centerVerse(t, vv, false); if (vv > 1) el.classList.add('flash'); }
    else if (el && vv > 1) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); } else t.scrollTop = 0;
  } else t.scrollTop = keep;
}

/* ---------------- popups & lookup ---------------- */
async function lookupHtml(el) {
  const parts = [];
  const strongs = (el.dataset.strong || '').split(/\s+/).filter(Boolean);
  const morphs = (el.dataset.morph || '').split(/\s+/).filter(Boolean);
  if (el.dataset.lemma) parts.push(`<div class="src">Lemma: <b>${esc(el.dataset.lemma)}</b></div>`);
  for (const m of morphs) parts.push(await entry('morph', m));
  for (const s of strongs) parts.push(await entry('strong', s));
  return parts.join('');
}
async function entry(kind, key) {
  const activeBible = (views()[state.active] || {}).bible || '';
  const k = kind + ':' + key + ':' + activeBible;
  if (!lookupCache.has(k)) {
    lookupCache.set(k, api.lookup(kind, key, activeBible).then(r => r
      ? `<div class="entry"><h4>${esc(r.subject || key)} <a class="findlink" data-find="${esc(key)}" title="Search the open Bibles for ${esc(key)}">Find ${kind === 'morph' ? 'm/ ' : ''}${esc(key)}</a></h4><div class="src">${esc(r.dict)}</div>${sanitize(r.html)}</div>`
      : `<div class="entry"><h4>${esc(key)}</h4><div class="src">${kind === 'strong' ? "No Strong's dictionary entry found" : 'No morphology dictionary entry found'}</div></div>`)
      .catch(e => `<div class="entry"><h4>${esc(key)}</h4><div class="src">${esc(e.message)}</div></div>`));
  }
  return lookupCache.get(k);
}

function sanitize(html) {
  const t = document.createElement('template'); t.innerHTML = html;
  t.content.querySelectorAll('script,style,iframe,object,embed').forEach(n => n.remove());
  t.content.querySelectorAll('*').forEach(n => { for (const a of [...n.attributes]) if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
  t.content.querySelectorAll('a[href]').forEach(a => { a.dataset.href = a.getAttribute('href'); a.removeAttribute('href'); a.classList.add('link'); });
  return t.innerHTML;
}

async function noteHtml(el) {
  if (el.classList.contains('fn')) return `<div class="entry"><div class="src">Footnote</div>${sanitize(TWRender.render(el.dataset.note, { rules: [] }, Object.assign({}, state.settings.show, { footnotes: false })))}</div>`;
  if (el.classList.contains('xref')) {
    const out = [];
    for (const r of el.dataset.xref.split(/[;,]/)) {
      const m = /^(\d+)\.(\d+)\.(\d+)(?:-(\d+))?/.exec(r); if (!m) continue;
      out.push(await versePreview(+m[1], +m[2], +m[3], m[4] ? +m[4] : +m[3]));
    }
    return out.join('') || '<div class="src">Cross-reference</div>';
  }
  return '';
}

// [B4] Resolve target-specific Bible links (tw://bible.MODID?id=b.c.v)
function resolveBibleSpec(modSpec) {
  if (!modSpec || modSpec === '*') return null;
  const want = decodeURIComponent(modSpec).toLowerCase();
  for (const b of state.modules.bibles) {
    const inf = state.infos.get(b.id);
    if (b.id.toLowerCase() === want || (b.abbr || '').toLowerCase() === want || (inf && (inf.abbr || '').toLowerCase() === want) || b.name.replace(/\.[^.]+$/, '').toLowerCase() === want) {
      return b.id;
    }
  }
  return null;
}
window.resolveBibleSpec = resolveBibleSpec;

async function versePreview(b, c, v1, v2, modSpec) {
  let targetId = resolveBibleSpec(modSpec);
  if (!targetId) {
    // verse links without a named Bible: the default Old / New Testament Bible of Options → Modules, else the first open Bible
    const pref = b >= 1 && b <= 39 ? state.settings.popupOT : b >= 40 && b <= 66 ? state.settings.popupNT : '';
    if (pref && state.modules.bibles.some(x => x.id === pref)) targetId = pref;
    else {
      const ids = state.settings.openBibles;
      if (!ids.length) return '';
      targetId = ids[0];
    }
  }
  await ensureInfo(targetId);
  const data = await api.chapter([targetId], b, c);
  const inf = state.infos.get(targetId);
  const show = Object.assign({}, state.settings.show, { strongs: false, morph: false, footnotes: false });
  const rows = data.rows.filter(r => r.v >= v1 && r.v <= v2);
  const modAttr = modSpec && modSpec !== '*' ? modSpec : '*';
  return `<div class="entry"><h4><a class="link" data-href="tw://bible.${esc(modAttr)}?id=${b}.${c}.${v1}">${esc(data.book.name)} ${c}:${v1}${v2 > v1 ? '–' + v2 : ''}${modSpec && modSpec !== '*' && inf ? ` (${esc(inf.abbr)})` : ''}</a></h4>${rows.map(r => `<sup>${r.v}</sup> ${TWRender.render(r.cells[0], inf || EMPTY_MOD, show, { fn: { n: 0 }, b })}`).join(' ') || '<div class="src">Not in this Bible</div>'}</div>`;
}

let hoverTimer = null, hoverEl = null;
function popupTarget(el) { return el && el.closest('[data-strong],[data-morph],sup.fn,sup.xref'); }
function wireHover() {
  document.addEventListener('mouseover', e => {
    const t = popupTarget(e.target);
    if (t === hoverEl) return;
    hoverEl = t; clearTimeout(hoverTimer);
    if (!t) { if (!e.target.closest('#popup')) hidePopupSoon(); return; }
    hoverTimer = setTimeout(() => showPopup(t), 280);
  });
  $('#popup').addEventListener('mouseleave', hidePopupSoon);
  $('#popup').addEventListener('mouseenter', () => clearTimeout(hideTimer));
}
let hideTimer = null;
let popupHold = false;
function hidePopupSoon() { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!popupHold) $('#popup').classList.add('hidden'); }, 300); }
function wirePopupResize() {
  const p = $('#popup');
  const sz = (TimotheosOptions.appearance().popupSize) || null;
  if (sz) { p.style.width = sz.w + 'px'; p.style.height = sz.h + 'px'; p.classList.add('sized'); }
  p.addEventListener('mousedown', e => {
    const r = p.getBoundingClientRect();
    if (e.clientX < r.right - 18 || e.clientY < r.bottom - 18) return;
    popupHold = true; clearTimeout(hideTimer);
    p.style.width = p.offsetWidth + 'px'; p.style.height = p.offsetHeight + 'px'; p.classList.add('sized');
    const up = () => {
      document.removeEventListener('mouseup', up, true);
      setTimeout(() => { popupHold = false; }, 50);
      const a = TimotheosOptions.appearance(); a.popupSize = { w: p.offsetWidth, h: p.offsetHeight };
      p.style.width = a.popupSize.w + 'px'; p.style.height = a.popupSize.h + 'px'; p.classList.add('sized');
      save({ appearance: a });
      if (!p.matches(':hover')) hidePopupSoon();
    };
    document.addEventListener('mouseup', up, true);
  });
}
async function showPopup(el) {
  clearTimeout(hideTimer);
  const html = el.matches('sup.fn,sup.xref') ? await noteHtml(el) : await lookupHtml(el);
  if (hoverEl !== el || !html) return;
  showPopupHtml(el, html);
}
function showPopupHtml(el, html) {
  clearTimeout(hideTimer);
  const p = $('#popup'); p.innerHTML = html; p.classList.remove('hidden'); p.scrollTop = 0;
  const r = el.getBoundingClientRect(); const W = window.innerWidth, H = window.innerHeight;
  const pw = Math.min(p.offsetWidth || 440, W - 20);
  let x = Math.min(Math.max(10, r.left), W - pw - 10); let y = r.bottom + 6;
  p.style.left = x + 'px'; p.style.top = y + 'px';
  const ph = p.offsetHeight; if (y + ph > H - 10) p.style.top = Math.max(10, r.top - ph - 6) + 'px';
}

async function pin(el) {
  if (el.matches('sup.fn,sup.xref')) { setLookupHtml(await noteHtml(el) || '<p class="hint">Nothing to show.</p>', true, el.classList.contains('fn') ? 'Footnote' : 'Cross-reference'); return openTab('lib'); }
  const split = k => (el.dataset[k] || '').split(/\s+/).filter(Boolean);
  const word = (el.classList.contains('word') ? el.textContent : '');
  return showLookup({ word, lemma: el.dataset.lemma, strongs: split('strong'), morphs: split('morph') });
}

async function followLink(href) {
  if (!href) return;
  if (/^https?:/i.test(href)) return api.openExternal(href);
  if (/^tw:\/\/(dct|bk|cmt|map|dev)\.|^tw:\/\/\[self\]/i.test(href) && await TimotheosModules.followBookLink(href)) return;
  const bm = /^tw:\/\/bible\.([^?#]*)/i.exec(href);
  const id = /[?&|]id=(\d+)\.(\d+)(?:\.(\d+))?/.exec(href) || /^tw:\/\/bible[^?]*\?(\d+)\.(\d+)(?:\.(\d+))?/.exec(href);
  if (/^tw:\/\/bible/i.test(href) && id) {
    // [B4] Honor target-specific Bible if specified (e.g. tw://bible.KJV?id=1.1.1)
    if (bm && bm[1] && bm[1] !== '*') {
      const targetBible = resolveBibleSpec(bm[1]);
      if (targetBible) {
        const existingIdx = views().findIndex(v => v.bible === targetBible);
        if (existingIdx >= 0) setActive(existingIdx, true);
        else await useBible(targetBible);
      }
    }
    return go({ b: +id[1], c: +id[2], v: id[3] ? +id[3] : 1 });
  }
  const st = /[?&]t=([GH]\d+)/i.exec(href) || /\?([GH]\d+)\b/i.exec(href);
  if (st) { const fake = document.createElement('span'); fake.dataset.strong = st[1].toUpperCase(); return pin(fake); }
  const mo = /\[morph\][^?]*\?t=([^&|]+)/i.exec(href);
  if (mo) { const fake = document.createElement('span'); fake.dataset.morph = decodeURIComponent(mo[1]); return pin(fake); }
}

function openTab(name, focus) {
  TimotheosDock.show(name);
  if (name === 'search') TimotheosSearch.onOpen(focus);
  if (name === 'bsearch') TimotheosBookSearch.onOpen(focus);
  if (name === 'study') TimotheosStudy.onOpen();
}
window.openTab = openTab;

const ABOUT_VERSE = {
  fil: { ref: '2 Timothy 3:16 (AMB)', text: 'Lahat ng Kasulatan ay hiningahan ng Diyos, at kapaki-pakinabang para sa pagtuturo, para sa pagsusuri, para sa pagtutuwid, upang magamit para sa edukasyon sa katuwiran:' },
  en: { ref: '2 Timothy 3:16 (KJV)', text: 'All scripture is given by inspiration of God, and is profitable for doctrine, for reproof, for correction, for instruction in righteousness:' }
};
function about() {
  const s = state.settings; const lang0 = s.aboutVerse === 'en' ? 'en' : 'fil';
  const verse = l => `<b>${esc(ABOUT_VERSE[l].ref)}</b><br>“${esc(ABOUT_VERSE[l].text)}”`;
  const html = `<div class="about">
    <p><b>Timotheos ${esc(s.version || '0.6.1')}</b> – an offline Bible study program for Windows that reads and creates <b>theWord</b> and <b>e-Sword</b> modules (Bibles with the Apocrypha, commentaries, dictionaries, books, devotionals, maps, cross-references, verse lists and reading plans). Timotheos is an independent program: it is not made by, or affiliated with, theWord or e-Sword.</p>
    <table class="imp aboutt"><tr><th>License</th><td>MIT License – free to use, copy, change and share, with the copyright notice kept.</td></tr>
    <tr><th>GitHub</th><td><a class="link" data-href="https://github.com/SalitaNgDiyos/Timotheos">https://github.com/SalitaNgDiyos/Timotheos</a></td></tr>
    <tr><th>Program folder</th><td><code class="sel">${esc(s.appDir || '')}</code></td></tr>
    <tr><th>Your data folder</th><td><code class="sel">${esc(s.userDataDir || '')}</code>${s.portable ? ' (portable mode)' : ''}</td></tr>
    <tr><th>Module folders</th><td>${(s.moduleFolders || []).map(esc).join('<br>') || 'none'}</td></tr></table>
    <blockquote id="aboutVerse" class="aboutverse" tabindex="0" role="button" title="Click to switch between Filipino and English" data-l="${lang0}">${verse(lang0)}</blockquote>
    <p class="small">Click the verse to switch between Filipino (AMB) and English (KJV).</p></div>`;
  const p = TimotheosModules.modal('About Timotheos', html, [{ label: 'OK', value: true, primary: true }], true);
  setTimeout(() => {
    const q = $('#aboutVerse'); if (!q) return;
    const flip = () => { const l = q.dataset.l === 'fil' ? 'en' : 'fil'; q.dataset.l = l; q.innerHTML = verse(l); save({ aboutVerse: l }); };
    q.onclick = flip; q.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } };
  }, 0);
  return p;
}

/* ---------------- wiring ---------------- */
function wireUi() {
  $('#refForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await api.parseRef($('#refInput').value);
    if (r) { await go(r); $('#refInput').blur(); syncNavControls(); $('#view').focus(); }
    else { flashMsg(`“${$('#refInput').value.trim()}” is not a place in the open Bibles`); $('#refInput').select(); }
  });
  { // one box for the place: click it, type another reference, Enter
    const ri = $('#refInput');
    ri.addEventListener('focus', () => setTimeout(() => ri.select(), 0));
    ri.addEventListener('blur', () => syncNavControls());
    ri.addEventListener('keydown', e => { if (e.key === 'Escape') { ri.blur(); $('#view').focus(); } e.stopPropagation(); });
  }
  $('#prevBtn').onclick = () => step(-1);
  $('#nextBtn').onclick = () => step(1);
  $('#backBtn').onclick = () => historyGo(-1);
  $('#fwdBtn').onclick = () => historyGo(1);
  $('#lkpClose').onclick = () => showFeed(false);
  $('#tab-lib .libbar').addEventListener('mousedown', () => showFeed(false));
  $('#tab-lib #libFeed').addEventListener('click', e => { const h = e.target.closest('[data-toggle-card]'); if (h && !e.target.closest('a, button')) { const c = h.closest('.cmtcard'); c.classList.toggle('collapsed'); h.querySelector('.cc-chev').textContent = c.classList.contains('collapsed') ? '▸' : '▾'; } });
  if ($('#lkpBack')) $('#lkpBack').onclick = () => lookupStep(-1);
  if ($('#lkpFwd')) $('#lkpFwd').onclick = () => lookupStep(1);
  $('#searchBtn').onclick = () => openTab('search', true);
  wireModuleManager();
  $('#addFolderBtn').onclick = addFolder;
  $('#rescanBtn').onclick = rescan;
  $('#apPlacement').value = ['end', 'catholic', 'nets', 'orthodox'].includes(state.settings.apocryphaPlacement) ? state.settings.apocryphaPlacement : '1611';
  $('#apPlacement').onchange = async () => { await api.setSettings({ apocryphaPlacement: $('#apPlacement').value }); state.settings.apocryphaPlacement = $('#apPlacement').value; await rebuildNav(); await go(state.ref, false); };
  $('#importBtn2').onclick = () => TimotheosModules.importModules();
  $('#resetPanelSkins').onclick = () => TimotheosPanelSkin.resetAll();
  $('#centerActive').checked = centerOn();
  $('#centerActive').onchange = () => { save({ centerActive: $('#centerActive').checked }); ensurePanes(); renderChapter(true); };
  document.addEventListener('click', e => {
    const fl = e.target.closest('[data-find]');
    if (fl) { e.preventDefault(); $('#popup').classList.add('hidden'); TimotheosSearch.find((/^[GH]\d/i.test(fl.dataset.find) ? '' : 'm/ ') + fl.dataset.find); return; }
    const link = e.target.closest('[data-href]');
    if (link) { e.preventDefault(); followLink(link.dataset.href); return; }
    const t = popupTarget(e.target);
    if (t) { pin(t); return; }
    const vn = e.target.closest('#view td.vn, #view sup.vnum');
    if (vn) selectVerse(+vn.closest('[data-v]').dataset.v, false);
  });
  wireHover();
}
function font(d) { zoomView(state.active, d); }

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

init().catch(e => { document.body.insertAdjacentHTML('beforeend', `<pre style="color:red;padding:20px">${esc(e.stack || e)}</pre>`); });
