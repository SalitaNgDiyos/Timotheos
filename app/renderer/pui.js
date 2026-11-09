/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Phone screens: the pieces the three screens (Quiet Reader, Clear Tabs, Study Desk) are built from.
 * Everything here works on the app's own data and functions (api.*, state, TimotheosStudy, TimotheosModules …):
 * sheets, full-screen pages, the Go-to browser, verse actions, commentary / dictionary / cross-reference / compare
 * cards, Library, Search, Study, Read aloud settings, the reading-view settings and the help list. */
/* global api, state, views, refName, go, step, selectVerse, setShow, zoomView, sanitize, versePreview, noteHtml, followLink, setActive,
   toggleLink, setVerseNumbers, passLabel, newPlanDialog, TimotheosIcons, TimotheosStudy, TimotheosModules, TimotheosTools, TimotheosSpeech,
   TimotheosOptions, TimotheosBookSearch, TimotheosPhone, runCommand */
(function () {
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const root = document.documentElement;
  const ic = (n, s = 22) => (window.TimotheosIcons ? TimotheosIcons.icon(n, s) : '');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const flash = m => { try { TimotheosStudy.flash(m); } catch (e) { /* none */ } };
  const ud = () => (TimotheosStudy.study && TimotheosStudy.study.ud) || {};
  const bookOf = b => (state.nav || []).find(x => x.id === b) || null;
  const vkey = (b, c, v) => `${b}.${c}.${v}`;
  const parseKey = k => { const [b, c, v] = String(k).split('.').map(Number); return { b, c, v }; };
  const rn = r => { try { return refName(r); } catch (e) { return ''; } };
  const activeBible = () => ((views()[state.active] || {}).bible) || (state.settings.openBibles || [])[0] || '';
  const bibleInfo = id => state.infos.get(id || activeBible()) || {};
  const bibleAbbr = id => bibleInfo(id).abbr || '';
  const chapterTitle = (b, c) => { const k = bookOf(b); return k ? `${k.name} ${c}` : ''; };
  const GRP = { OT: 'Old Testament', NT: 'New Testament', AP: 'Apocrypha', APX: 'Other books' };
  const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
  const text = html => { const d = document.createElement('div'); d.innerHTML = html; return (d.textContent || '').replace(/\s+/g, ' ').trim(); };

  /* ================================================================ the phone's Back button / gesture
   * Each sheet, page, drawer or dialog that opens adds a step to the web view's history, so Back closes it (instead of leaving the app).
   * When the screen closes it itself, that step is taken out again. */
  // one history step stands for all of them: Back closes the top one, and the step is put back while more are open
  const backs = []; let armed = false, pending = false;
  const arm = () => { if (armed || pending || !backs.length) return; try { history.pushState({ pui: 1 }, ''); armed = true; } catch (e) { /* */ } };
  function pushBack(close, tag) { if (!root.classList.contains('sk')) return; backs.push({ close, tag }); arm(); }
  function dropBack(tag) { const i = backs.map(b => b.tag).lastIndexOf(tag); if (i < 0) return; backs.splice(i, 1);
    if (!backs.length && armed && !pending) { pending = true; try { history.back(); } catch (e) { pending = false; } } }
  window.addEventListener('popstate', () => {
    if (pending) { pending = false; armed = false; arm(); return; }
    armed = false; const b = backs.pop(); if (b) { try { b.close(true); } catch (e) { /* */ } } arm();
  });
  const fromBack = tag => { const b = backs.find(x => x.tag === tag); return !b; };

  /* ================================================================ sheets */
  let sheetClose = null;
  function closeSheet(viaBack) {
    const w = $('#pSheet'); if (!w) return; const f = sheetClose; sheetClose = null; if (viaBack !== true) dropBack('sheet');
    w.classList.remove('in'); w.id = ''; setTimeout(() => w.remove(), 180); if (f) f();
  }
  /** a sheet from the bottom of the screen; returns its inner element */
  function sheet(html, o = {}) {
    const old = $('#pSheet'); if (old) { old.id = ''; old.remove(); if (sheetClose) { const f = sheetClose; sheetClose = null; f(); } } else pushBack(closeSheet, 'sheet');
    const w = document.createElement('div'); w.id = 'pSheet'; w.className = 'psheetwrap ' + (o.cls || '');
    w.innerHTML = `<div class="pscrim"></div><div class="psheet"${o.height ? ` style="max-height:${o.height}"` : ''}><div class="pgrab"></div>${o.title ? `<h4 class="ph4">${o.title}<button type="button" class="pclose" aria-label="Close">${ic('close', 18)}</button></h4>` : ''}<div class="psbody">${html}</div></div>`;
    document.body.appendChild(w); sheetClose = o.onClose || null;
    w.querySelector('.pscrim').onclick = closeSheet; const x = w.querySelector('.pclose'); if (x) x.onclick = closeSheet;
    // drag the grab bar down to close
    const sh = w.querySelector('.psheet'); let y0 = null;
    sh.addEventListener('touchstart', e => { if (sh.scrollTop <= 0 && e.target.closest('.pgrab, .ph4')) y0 = e.touches[0].clientY; }, { passive: true });
    sh.addEventListener('touchmove', e => { if (y0 == null) return; const d = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${d}px)`; }, { passive: true });
    sh.addEventListener('touchend', e => { if (y0 == null) return; const d = e.changedTouches[0].clientY - y0; y0 = null; sh.style.transform = ''; if (d > 90) closeSheet(); }, { passive: true });
    requestAnimationFrame(() => w.classList.add('in'));
    return w.querySelector('.psbody');
  }

  /* ================================================================ pages (full screen, stacked) */
  const stack = [];
  function host() { let h = $('#pHost'); if (!h) { h = document.createElement('div'); h.id = 'pHost'; document.body.appendChild(h); } return h; }
  /** a full-screen page: { title, back (default true), big (a large title in the body), actions (header buttons html), cls, onClose } */
  function pushPage(o = {}) {
    const el = document.createElement('section'); el.className = 'ppage ' + (o.cls || '');
    el.innerHTML = `<header class="pgbar">${o.back === false ? '' : `<button type="button" class="pib pgback" aria-label="Back">${ic('chevL', 24)}</button>`}<span class="pgtitle">${o.big ? '' : esc(o.title || '')}</span><span class="grow"></span>${o.actions || ''}</header><div class="pgbody">${o.big ? `<h2 class="pgbig">${esc(o.title || '')}</h2>` : ''}</div>`;
    host().appendChild(el); stack.push({ el, o }); root.classList.add('pg-open'); pushBack(() => popPage(true), 'page');
    const b = el.querySelector('.pgback'); if (b) b.onclick = () => popPage();
    requestAnimationFrame(() => el.classList.add('in'));
    return { el, body: el.querySelector('.pgbody'), bar: el.querySelector('.pgbar') };
  }
  function popPage(viaBack) {
    const p = stack.pop(); if (!p) return; if (viaBack !== true) dropBack('page'); p.el.classList.remove('in'); p.el.classList.add('out'); setTimeout(() => p.el.remove(), 200);
    if (p.o.onClose) try { p.o.onClose(); } catch (e) { /* */ }
    // the last page closed: the Bible text is shown again, not the old panel a page may have opened behind it
    if (!stack.length) { root.classList.remove('pg-open'); if (root.classList.contains('sk') && window.TimotheosPhone && TimotheosPhone.reading) TimotheosPhone.reading(); }
    window.dispatchEvent(new Event('pui-page'));
  }
  function clearPages() { while (stack.length) popPage(); }
  const pageCount = () => stack.length;

  /* borrow an element of the old panels (with all its handlers) into a page, and put it back afterwards */
  function borrow(el, into) {
    if (!el) return () => {};
    const mark = document.createComment('borrowed'); el.parentNode.insertBefore(mark, el); into.appendChild(el);
    return () => { if (mark.parentNode) { mark.parentNode.insertBefore(el, mark); mark.remove(); } };
  }

  /* ================================================================ reading surface */
  function decorate(sec) {
    const tx = sec.querySelector('.bvtext'); if (!tx || !root.classList.contains('sk')) return;
    const [b, c] = String(sec.dataset.ref || `${state.ref.b}.${state.ref.c}`).split('.').map(Number);
    const i = +sec.dataset.i || 0; const id = (views()[i] || {}).bible;
    const k = bookOf(b); if (!k) return;
    const kick = `${GRP[k.grp] || ''}${bibleAbbr(id) ? ' · ' + bibleAbbr(id) : ''}`;
    let t = tx.querySelector(':scope > .sk-ttl');
    const html = `<small data-ab="${esc(bibleAbbr(id) || '')}">${esc(kick)}</small><span>${esc(k.name)} ${c}</span><button type="button" class="sk-aa" aria-label="Text format for this Bible">${ic('text', 18)}</button>`;
    if (!t) { t = document.createElement('div'); t.className = 'sk-ttl'; tx.insertBefore(t, tx.firstChild); }
    if (t.dataset.skk !== html) { t.dataset.skk = html; t.innerHTML = html; }   // compared by key: the icon's markup reads back differently
  }
  function decorateAll() { $$('#workbench .bv').forEach(decorate); }
  const obs = new MutationObserver(ms => { if (!root.classList.contains('sk')) return; const secs = new Set(); for (const m of ms) { const s = m.target.closest && m.target.closest('.bv'); if (s) secs.add(s); } secs.forEach(decorate); });
  window.addEventListener('load', () => { const w = $('#workbench'); if (w) obs.observe(w, { childList: true, subtree: true }); });

  /** the verse under an element: { v, row, cell, ref, col, sec } */
  function verseOf(el) {
    const row = el && el.closest && el.closest('.bv tr[data-v], .bv .pv[data-v]'); if (!row) return null;
    const sec = row.closest('.bv'); const [b, c] = String(sec.dataset.ref || `${state.ref.b}.${state.ref.c}`).split('.').map(Number);
    const cell = row.querySelector('[data-col]') || (row.matches('[data-col]') ? row : null);
    const v = +row.dataset.v; return { v, row, cell, col: cell ? +cell.dataset.col : 0, ref: { b, c, v }, sec, i: +sec.dataset.i || 0 };
  }
  /** a tap between the lines of a paragraph (on the paragraph itself, not a verse): the verse nearest to that point */
  function verseAt(x, y, el) {
    if (!el || !el.closest || !el.closest('.bv .bvtext .pcol, .bv .bvtext .paraview')) return null;
    const cr = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    const n = cr && cr.startContainer; const hit = n && (n.nodeType === 1 ? n : n.parentElement); const r = hit && verseOf(hit); if (r) return r;
    let best = null, bd = Infinity;
    for (const pv of el.closest('.bvtext').querySelectorAll('.pv[data-v]')) for (const q of pv.getClientRects()) {
      const dx = x < q.left ? q.left - x : x > q.right ? x - q.right : 0, dy = y < q.top ? q.top - y : y > q.bottom ? y - q.bottom : 0, d = dx * dx + dy * dy * 4;
      if (d < bd) { bd = d; best = pv; }
    }
    return best ? verseOf(best) : null;
  }
  function markVerse(row, on) { $$('.pvmark').forEach(x => x.classList.remove('pvmark')); if (row && on) row.classList.add('pvmark'); }

  /* ================================================================ verse actions (the same functions for every screen) */
  const HL = [['yellow', '#d8b46f'], ['green', '#7fa38a'], ['blue', '#7b9cc9'], ['pink', '#c9877b'], ['purple', '#a68ac9'], ['orange', '#e0a07a'], ['teal', '#6fc1b5'], ['red', '#c46a6a'], ['gray', '#9a9a9a']];
  const act = {
    copy: x => TimotheosStudy.quickCopy({ ...x.ref }),
    highlight: (x, color) => { const t = TimotheosStudy.selectionTarget(x.cell); if (t) TimotheosStudy.highlight(t, color || lastColor()); },
    unhighlight: x => { const t = TimotheosStudy.selectionTarget(x.cell); if (t) TimotheosStudy.highlight(t, null); },
    underline: x => { const t = TimotheosStudy.selectionTarget(x.cell); if (t) TimotheosStudy.highlight(t, 'ul'); },
    read: async x => { if (TimotheosSpeech.isSpeaking()) TimotheosSpeech.stop(); setActive(x.i); selectVerse(x.v, false); await new Promise(r => setTimeout(r, 30)); TimotheosSpeech.speakView(x.i, null); },
    compare: x => compareSheet(x.ref),
    xref: x => xrefSheet(x.ref),
    commentary: x => commentarySheet(x.ref),
    note: x => TimotheosStudy.editNote(vkey(x.ref.b, x.ref.c, x.v)),
    bookmark: x => bookmarkSheet(x.ref),
    list: x => TimotheosStudy.addToList([{ ...x.ref }]),
    copydlg: x => TimotheosStudy.copyDialog({ v1: x.v, v2: x.v }),
    addxref: x => { selectVerse(x.v, false); TimotheosModules.addXref(x.v); },
    select: x => { root.classList.add('sk-selecting'); flash('Select the words, then hold the verse again'); },
    lookup: (x, w) => wordSheet(w || {})
  };
  const lastColor = () => { try { return localStorage.getItem('tw.hl') || 'yellow'; } catch (e) { return 'yellow'; } };
  const setLastColor = c => { try { localStorage.setItem('tw.hl', c); } catch (e) { /* */ } };
  const ACTS = [['copy', 'copy', 'Copy'], ['highlight', 'highlight', 'Highlight'], ['underline', 'underline', 'Underline'], ['read', 'speaker', 'Read aloud'], ['compare', 'compare', 'Compare'], ['xref', 'xref', 'Cross-refs'], ['commentary', 'commentary', 'Commentary'], ['note', 'note', 'Note']];
  const MORE_ACTS = [['bookmark', 'bookmark', 'Bookmark'], ['list', 'study', 'Add to list'], ['copydlg', 'copy', 'Copy verses…'], ['addxref', 'plus', 'Add cross-ref'], ['select', 'select', 'Select words'], ['unhighlight', 'close', 'Remove marks']];
  /** the verse sheet of Quiet Reader (hold a verse) */
  function verseSheet(x, word) {
    markVerse(x.row, true);
    const hasNote = !!(ud().notes || {})[vkey(x.ref.b, x.ref.c, x.v)];
    const s = sheet(`<div class="acts">${ACTS.map(([a, i, l]) => `<button type="button" class="act" data-a="${a}"><i>${ic(i, 24)}</i>${a === 'note' && hasNote ? 'Edit note' : l}</button>`).join('')}</div>
      <div class="pdots"><span>Highlight colour</span>${HL.slice(0, 5).map(([c, h]) => `<button type="button" class="pdot${c === lastColor() ? ' on' : ''}" data-c="${c}" style="background:${h}" aria-label="${c}"></button>`).join('')}</div>
      <div class="pills">${MORE_ACTS.map(([a, i, l]) => `<button type="button" class="pill" data-a="${a}">${ic(i, 16)} ${l}</button>`).join('')}${word && (word.word || (word.strongs || []).length) ? `<button type="button" class="pill" data-a="lookup">${ic('lexicon', 16)} Look up “${esc(word.word || word.strongs[0])}”</button><button type="button" class="pill" data-a="find">${ic('search', 16)} Find “${esc(word.word || word.strongs[0])}”</button>` : ''}</div>`,
    { title: `${esc(rn(x.ref))} <em>${esc(bibleAbbr((views()[x.i] || {}).bible))}</em>`, cls: 'verse', onClose: () => markVerse(null) });
    s.addEventListener('click', e => {
      const d = e.target.closest('[data-c]'); if (d) { setLastColor(d.dataset.c); $$('.pdot', s).forEach(z => z.classList.toggle('on', z === d)); act.highlight(x, d.dataset.c); return; }
      const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
      closeSheet(); if (state.ref.v !== x.v) selectVerse(x.v, false);
      if (a === 'find') return search({ q: word.word || word.strongs[0] });
      setTimeout(() => act[a](x, word), 60);
    });
  }

  /* ================================================================ commentary, dictionary, cross-references, compare */
  async function commentaryCards(box, ref, o = {}) {
    box.innerHTML = '<p class="phint">Looking for commentaries…</p>';
    const list = await api.commentaries(ref.b, ref.c, ref.v).catch(() => []);
    const rank = lv => ({ verse: 0, passage: 1, chapter: 2, book: 3 }[lv] ?? 4);
    const hits = list.filter(x => x.hit).sort((a, z) => rank(a.hit.level) - rank(z.hit.level) || (a.title || '').localeCompare(z.title || ''));
    if (o.count) o.count(hits.length);
    if (!list.length) { box.innerHTML = `<p class="phint">No commentaries yet. Import theWord (.cmt.twm) or e-Sword commentaries from More → Modules.</p><div class="pills"><button type="button" class="pill" data-new>${ic('plus', 16)} New user commentary</button></div>`; box.querySelector('[data-new]').onclick = () => TimotheosModules.newUserModuleDialog('commentary'); return; }
    if (!hits.length) { box.innerHTML = `<p class="phint">None of your ${list.length} commentaries has a note on ${esc(rn(ref))}.</p>`; return; }
    const topics = await Promise.all(hits.slice(0, 12).map(x => api.bookTopic(x.id, x.hit.id).catch(() => null)));
    box.innerHTML = hits.slice(0, 12).map((x, k) => { const t = topics[k]; const lv = x.hit.level === 'verse' ? rn(ref) : `${x.hit.level} · ${x.hit.subject}`;
      return `<article class="pcard clamp" data-id="${esc(x.id)}" data-tid="${esc(String(x.hit.id))}"><div class="psrc"><span>${esc(x.title)}</span><span class="lv">${esc(lv)}</span></div><div class="pbody entry">${t ? TimotheosTools.bodyHtml(x.id, x.hit.id, sanitize(t.html)) : '<p class="phint">(empty)</p>'}</div><div class="cardft"><button type="button" class="plink" data-more>Read all</button>${x.user ? '<button type="button" class="plink" data-edit>Edit</button>' : ''}<button type="button" class="plink" data-open>Open in Library</button></div></article>`; }).join('');
    try { TimotheosTools.applyMarks(box); } catch (e) { /* */ }
    box.onclick = e => {
      const card = e.target.closest('.pcard'); if (!card) return;
      if (e.target.closest('[data-more]')) { card.classList.toggle('clamp'); e.target.textContent = card.classList.contains('clamp') ? 'Read all' : 'Show less'; return; }
      if (e.target.closest('[data-edit]')) return TimotheosModules.editUserCommentaryDialog(card.dataset.id);
      if (e.target.closest('[data-open]')) { closeSheet(); return openModule(card.dataset.id, isNaN(+card.dataset.tid) ? card.dataset.tid : +card.dataset.tid); }
    };
  }
  function commentarySheet(ref) {
    let n = 0; const s = sheet('<div class="pcards"></div>', { title: `Commentary · ${esc(rn(ref))} <em class="cnt"></em>`, cls: 'tall' });
    commentaryCards(s.querySelector('.pcards'), ref, { count: k => { n = k; const c = $('#pSheet .cnt'); if (c) c.textContent = k ? `${k} found` : ''; } });
  }

  /** dictionary cards for a word: { word, strongs[], morphs[] } */
  async function dictCards(box, w, o = {}) {
    box.innerHTML = '<p class="phint">Looking up…</p>';
    const strongs = (w.strongs || []).filter(Boolean), morphs = (w.morphs || []).filter(Boolean);
    const word = String(w.word || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const cards = []; const bid = activeBible(); const seen = new Set();
    for (const s of strongs) {
      const r = await api.lookup('strong', s, bid).catch(() => null);
      if (r) cards.push({ k: `Strong's · ${s}`, head: lemmaOf(s, r), sub: r.subject || s, html: sanitize(r.html), dict: r.dict, id: r.dictId, tid: r.id, find: s });
      else cards.push({ k: `Strong's · ${s}`, sub: s, html: '<p class="phint">No Strong\'s dictionary has this number. Import one (e.g. Strong\'s Greek / Hebrew) from More → Modules.</p>', find: s });
    }
    for (const m of morphs) { const r = await api.lookup('morph', m, bid).catch(() => null); if (r) cards.push({ k: 'Morphology', sub: m, html: sanitize(r.html), dict: r.dict, id: r.dictId, tid: r.id }); }
    const lim = o.limit || 6;
    for (const q of [...new Set([word, w.lemma].filter(x => x && x.length >= 2))]) {
      const res = await api.wordLookup(q, true).catch(() => []);
      for (const r of res || []) {
        if (r.kind !== 'dictionary' || cards.length >= lim) continue; const h = r.hits[0]; const key = r.id + '|' + h.id; if (seen.has(key)) continue; seen.add(key);
        const t = await api.bookTopic(r.id, h.id).catch(() => null);
        cards.push({ k: r.title || r.abbr, sub: (t && t.subject) || h.subject, html: t ? sanitize(t.html) : '', id: r.id, tid: h.id, find: q, approx: !h.exact });
      }
    }
    if (o.count) o.count(cards.length);
    if (!cards.length) { box.innerHTML = `<p class="phint">No dictionary has an entry for “${esc(word)}”.</p>`; return cards; }
    box.innerHTML = cards.map((c, k) => `<article class="pcard${k ? ' clamp' : ' clamp lead'}" data-k="${k}"><div class="psrc"><span>${esc(c.k)}</span>${c.dict ? `<span class="lv">${esc(c.dict)}</span>` : ''}</div>${c.head ? `<div class="lhead"><span class="lem">${esc(c.head)}</span><span class="ptr">${esc(c.sub)}</span></div>` : `<h5>${esc(c.sub)}${c.approx ? ' ~' : ''}</h5>`}<div class="pbody entry">${c.html}</div><div class="cardft"><button type="button" class="plink" data-more>Read all</button>${c.id ? '<button type="button" class="plink" data-open>Open in Library</button>' : ''}${c.find ? `<button type="button" class="plink" data-find>Find ${esc(c.find)}</button>` : ''}</div></article>`).join('');
    try { TimotheosTools.applyMarks(box); } catch (e) { /* */ }
    box.onclick = e => {
      const card = e.target.closest('.pcard'); if (!card) return; const c = cards[+card.dataset.k];
      if (e.target.closest('[data-more]')) { card.classList.toggle('clamp'); e.target.textContent = card.classList.contains('clamp') ? 'Read all' : 'Show less'; return; }
      if (e.target.closest('[data-open]')) { closeSheet(); return openModule(c.id, c.tid); }
      if (e.target.closest('[data-find]')) { closeSheet(); return search({ q: c.find }); }
    };
    return cards;
  }
  function lemmaOf(key, r) {
    const d = document.createElement('div'); d.innerHTML = r.html; const t = (r.subject || '') + ' ' + (d.textContent || '').slice(0, 400);
    const m = (/^H/i.test(key) ? /[֐-׿יִ-ﭏ]+(?:[־\s][֐-׿יִ-ﭏ]+)?/ : /[Ͱ-Ͽἀ-῿̀-ͯ]+/).exec(t);
    return m ? m[0].trim() : '';
  }
  function wordSheet(w) {
    const lbl = (w.strongs && w.strongs[0]) ? `Strong's ${/^H/i.test(w.strongs[0]) ? 'Hebrew' : 'Greek'} · ${w.strongs[0]}` : `Dictionary · ${w.word || ''}`;
    const s = sheet(`<div class="pcards"></div><div class="pills"><button type="button" class="pill gold" data-lib>${ic('library', 17)} Open in Library</button><button type="button" class="pill" data-all>${ic('lexicon', 17)} All dictionaries</button><button type="button" class="pill" data-find>${ic('search', 17)} Find ${esc((w.strongs && w.strongs[0]) || w.word || '')}</button></div>`, { title: esc(lbl), cls: 'lex', onClose: () => $$('.pwordon').forEach(x => x.classList.remove('pwordon')) });
    let cards = [];
    dictCards(s.querySelector('.pcards'), w, { limit: 3 }).then(c => { cards = c || []; });
    s.querySelector('[data-lib]').onclick = () => { const c = cards.find(x => x.id); closeSheet(); if (c) openModule(c.id, c.tid); else library(); };
    s.querySelector('[data-all]').onclick = () => { closeSheet(); const p = pushPage({ title: w.word || (w.strongs || [])[0] || 'Dictionaries' }); p.body.innerHTML = '<div class="pcards"></div>'; dictCards(p.body.querySelector('.pcards'), w, { limit: 24 }); };
    s.querySelector('[data-find]').onclick = () => { closeSheet(); search({ q: (w.strongs && w.strongs[0]) || w.word }); };
  }

  /* the small word pop-up: a floating card with the word's dictionary entries. Drag it anywhere by its top bar; it stays
     where it was put for the next word. Tap the text elsewhere, × or Back to close it; "Dictionary" opens the big view. */
  let wpPos = null;
  function wordPopClose(fromBk) { const el = $('#pWordPop'); if (!el) return; el.remove(); $$('.pwordon').forEach(x => x.classList.remove('pwordon')); if (!fromBk) dropBack('wordpop'); }
  function wordPop(w, o = {}) {
    let el = $('#pWordPop'); const fresh = !el;
    if (!el) { el = document.createElement('div'); el.id = 'pWordPop'; el.className = 'pwpop'; document.body.appendChild(el); pushBack(fb => wordPopClose(fb), 'wordpop'); }
    const key = (w.strongs && w.strongs[0]) || w.word || '';
    el.innerHTML = `<div class="pwbar" title="Drag to move"><span class="pwgrip"></span><b>${esc(w.word || key)}</b>${w.strongs && w.strongs[0] ? `<span class="pwk">${esc(w.strongs.join(' '))}</span>` : ''}<span class="grow"></span><button type="button" class="pwx" aria-label="Close">${ic('close', 18)}</button></div>
      <div class="pwbody"><div class="pcards"></div></div>
      <div class="pwft"><button type="button" class="pill" data-big>${ic('lexicon', 15)} Dictionary</button><button type="button" class="pill" data-find>${ic('search', 15)} Find ${esc(key)}</button></div>`;
    const cards = el.querySelector('.pcards');
    dictCards(cards, w, { limit: 3 });
    el.querySelector('.pwx').onclick = () => wordPopClose();
    el.querySelector('[data-big]').onclick = () => { wordPopClose(); setTimeout(() => (o.big || wordSheet)(w), 60); };
    el.querySelector('[data-find]').onclick = () => { wordPopClose(); search({ q: key }); };
    cards.addEventListener('click', e => { if (e.target.closest('[data-open], [data-find]')) wordPopClose(); });
    // where: the place it was dragged to, else just under (or above) the word
    const W = innerWidth, Hh = innerHeight, pw = Math.min(360, W - 24);
    el.style.width = pw + 'px';
    if (wpPos) place(el, wpPos.x, wpPos.y);
    else if (fresh || !o.keep) { const r = w.el && w.el.getBoundingClientRect ? w.el.getBoundingClientRect() : { left: 12, bottom: Hh / 3, top: Hh / 3 };
      const ph = Math.min(Hh * .5, 420); let y = r.bottom + 8; if (y + ph > Hh - 12) y = Math.max(12, r.top - ph - 8); place(el, r.left, y); }
    drag(el, el.querySelector('.pwbar'));
    return el;
  }
  function place(el, x, y) {
    const W = innerWidth, Hh = innerHeight, w = el.offsetWidth || 300, h = Math.min(el.offsetHeight || 200, Hh - 24);
    el.style.left = Math.round(Math.min(Math.max(8, x), W - w - 8)) + 'px'; el.style.top = Math.round(Math.min(Math.max(8, y), Hh - Math.min(h, 120) - 8)) + 'px';
  }
  function drag(el, bar) {
    bar.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return; e.preventDefault();
      const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; try { bar.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      el.classList.add('moving');
      const mv = ev => place(el, ev.clientX - dx, ev.clientY - dy);
      const up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); el.classList.remove('moving');
        wpPos = { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }; };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  }

  async function xrefList(box, ref) {
    box.innerHTML = '<p class="phint">Looking for cross-references…</p>';
    const all = await api.xrefsChapter(ref.b, ref.c).catch(() => ({})); const refs = all[ref.v] || [];
    if (!refs.length) { box.innerHTML = `<p class="phint">No cross-references on ${esc(rn(ref))}.</p><div class="pills"><button type="button" class="pill" data-add>${ic('plus', 16)} Add a cross-reference</button></div>`; box.querySelector('[data-add]').onclick = () => { closeSheet(); TimotheosModules.addXref(ref.v); }; return 0; }
    const items = await Promise.all(refs.slice(0, 40).map(async r => ({ r, html: await versePreview(r.b, r.c, r.v, r.v + r.span).catch(() => '') })));
    box.innerHTML = items.map(({ r, html }) => { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('sup').forEach(z => z.remove()); const h = d.querySelector('h4'); const label = h ? h.textContent : rn(r); if (h) h.remove();
      return `<button type="button" class="pxrow" data-go="${r.b}.${r.c}.${r.v}"><b>${esc(label)}${r.back ? ' ↩' : ''}${r.user ? ' ★' : ''}</b><span>${esc(text(d.innerHTML)).slice(0, 220)}</span></button>`; }).join('') + `<div class="pills"><button type="button" class="pill" data-add>${ic('plus', 16)} Add a cross-reference</button></div>`;
    box.onclick = e => { const g = e.target.closest('[data-go]'); if (g) { closeSheet(); go(parseKey(g.dataset.go)); } if (e.target.closest('[data-add]')) { closeSheet(); TimotheosModules.addXref(ref.v); } };
    return refs.length;
  }
  function xrefSheet(ref) { const s = sheet('<div class="pxr"></div>', { title: `Cross-references · ${esc(rn(ref))}`, cls: 'tall' }); xrefList(s.querySelector('.pxr'), ref); }

  async function compareSheet(ref) {
    const s = sheet('<div class="pcmp"><p class="phint">Reading the verse in your Bibles…</p></div>', { title: `Compare · ${esc(rn(ref))}`, cls: 'tall' });
    const open = state.settings.openBibles || []; const ids = [...new Set([...open, ...state.modules.bibles.map(b => b.id)])].slice(0, 16);
    const rows = [];
    for (const id of ids) { try { const r = await TimotheosStudy.verseText(id, ref.b, ref.c, ref.v); const t = r && (r.text || (r.vs && r.vs.map(x => x.text).join(' ')) || (Array.isArray(r) ? r.map(x => x.text).join(' ') : '')); if (t) rows.push({ id, t }); } catch (e) { /* not in this Bible */ } }
    const box = s.querySelector('.pcmp'); if (!box) return;
    box.innerHTML = rows.length ? rows.map(x => `<div class="cmp"><b>${esc(bibleAbbr(x.id) || x.id)}</b><p>${esc(x.t)}</p></div>`).join('') : '<p class="phint">This verse is not in your other Bibles.</p>';
  }
  function bookmarkSheet(ref) {
    const bm = ud().bookmarks || {}; const at = d => bm[d === 0 ? 9 : d - 1];
    const s = sheet(`<p class="phint">Put ${esc(rn(ref))} on a bookmark key (1–0). Tap a key that is in use to replace it.</p><div class="bmgrid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(d => `<button type="button" data-d="${d}"><b>${d}</b><small>${at(d) ? esc(rn(at(d))) : 'empty'}</small></button>`).join('')}</div>`, { title: 'Bookmark' });
    s.onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; closeSheet(); if (state.ref.v !== ref.v) selectVerse(ref.v, false); setBookmark(+b.dataset.d); };
  }

  /* ================================================================ Go to: book → chapter (→ verse) */
  function books(filter) { return (state.nav || []).filter(b => !filter || filter === 'all' || b.grp === filter || (filter === 'AP' && b.grp === 'APX')); }
  /** Quiet Reader: a grid of book names, then the chapters */
  function goSheetGrid() {
    const groups = [...new Set((state.nav || []).map(b => b.grp))]; const hasAp = groups.some(g => g === 'AP' || g === 'APX');
    const cur = bookOf(state.ref.b);
    const s = sheet(`<div class="pseg" data-seg>${[['OT', 'Old Testament'], ['all', 'All'], ['NT', 'New'], ...(hasAp ? [['AP', 'Apocrypha']] : [])].map(([k, l]) => `<button type="button" data-f="${k}" class="${k === 'all' ? 'on' : ''}">${l}</button>`).join('')}</div><div class="gbody"></div>`, { title: 'Go to <em>Book · Chapter · Verse</em>', cls: 'go tall' });
    const body = s.querySelector('.gbody'); let f = 'all', selB = 0, selC = 0;
    const showBooks = () => { body.innerHTML = `<div class="bgrid">${books(f).map(b => `<button type="button" data-b="${b.id}" class="${cur && b.id === cur.id ? 'hl' : ''}">${esc(b.abbr || b.name)}</button>`).join('')}</div>`; const h = body.querySelector('.hl'); if (h) h.scrollIntoView({ block: 'center' }); };
    const showCh = b => { const k = bookOf(b); body.innerHTML = `<div class="ghead"><button type="button" class="pib" data-backb>${ic('chevL', 20)}</button><b>${esc(k.name)}</b><small>${k.chapterList.length} chapters</small></div><div class="cgrid">${k.chapterList.map(c => `<button type="button" data-c="${c}" class="${b === state.ref.b && c === state.ref.c ? 'hl' : ''}">${c}</button>`).join('')}</div>`; selB = b; };
    const showVs = (b, c) => { const n = verseCountOf(b, c); if (!n) { closeSheet(); return go({ b, c, v: 1 }); }
      body.innerHTML = `<div class="ghead"><button type="button" class="pib" data-backc>${ic('chevL', 20)}</button><b>${esc(chapterTitle(b, c))}</b><small>choose a verse</small></div><div class="cgrid">${Array.from({ length: n }, (_, k) => `<button type="button" data-v="${k + 1}">${k + 1}</button>`).join('')}</div>`; selC = c; };
    showBooks();
    s.addEventListener('click', e => {
      const t = e.target.closest('[data-f]'); if (t) { f = t.dataset.f; $$('[data-f]', s).forEach(x => x.classList.toggle('on', x === t)); return showBooks(); }
      if (e.target.closest('[data-backb]')) return showBooks();
      if (e.target.closest('[data-backc]')) return showCh(selB);
      const c = e.target.closest('[data-c]'); if (c) { closeSheet(); return go({ b: selB, c: +c.dataset.c, v: 1 }); }
      const v = e.target.closest('[data-v]'); if (v) { closeSheet(); return go({ b: selB, c: selC, v: +v.dataset.v }); }
      const b = e.target.closest('[data-b]'); if (b) return showCh(+b.dataset.b);
    });
    // a long press on a chapter number asks for the verse
    let lp = null; s.addEventListener('touchstart', e => { const c = e.target.closest('[data-c]'); if (!c) return; lp = setTimeout(() => { lp = 'done'; showVs(selB, +c.dataset.c); }, 480); }, { passive: true });
    s.addEventListener('touchend', e => { if (lp === 'done') { e.preventDefault(); } clearTimeout(lp); lp = null; });
  }
  function verseCountOf(b, c) { try { return typeof verseCount === 'function' ? verseCount(b, c) : 0; } catch (e) { return 0; } }
  const recents = () => { const out = []; const seen = new Set([`${state.ref.b}.${state.ref.c}`]); for (const r of [...(state.back || [])].reverse()) { const k = `${r.b}.${r.c}`; if (seen.has(k)) continue; seen.add(k); out.push(r); if (out.length >= 6) break; } return out; };
  /** Clear Tabs: type a reference, a recent place, or Book → Chapter */
  function goSheetList() {
    const s = sheet(`<label class="pfield">${ic('search', 18)}<input id="pRefQ" type="text" placeholder="Type a reference — Ps 23, Jn 3:16" autocomplete="off" spellcheck="false" enterkeyhint="go"></label>
      ${recents().length ? `<h4 class="sec">Recent ${ic('history', 16)}</h4><div class="pchips">${recents().map(r => `<button type="button" class="pchip" data-go="${r.b}.${r.c}.${r.v || 1}">${esc(rn({ b: r.b, c: r.c, v: r.v || 1 }))}</button>`).join('')}</div>` : ''}
      <h4 class="sec">Books <span>${[...new Set((state.nav || []).map(b => GRP[b.grp] && b.grp))].filter(Boolean).map(g => ({ OT: 'OT', NT: 'NT', AP: 'Apocrypha', APX: 'Other' }[g])).join(' · ')}</span></h4><div class="gbody"></div>`, { cls: 'go tall' });
    const body = s.querySelector('.gbody'); let selB = 0;
    const showBooks = () => { body.innerHTML = `<div class="rows">${(state.nav || []).map(b => `<button type="button" class="prr${b.id === state.ref.b ? ' hl' : ''}" data-b="${b.id}">${ic('book', 18)}<span>${esc(b.name)}</span><small>${b.chapterList.length} chapter${b.chapterList.length === 1 ? '' : 's'}</small></button>`).join('')}</div>`; };
    const showCh = b => { const k = bookOf(b); selB = b; body.innerHTML = `<div class="rows"><button type="button" class="prr hl" data-backb>${ic('book', 18)}<span>${esc(k.name)}</span><small>choose a chapter</small></button></div><div class="cgrid">${k.chapterList.map(c => `<button type="button" data-c="${c}" class="${b === state.ref.b && c === state.ref.c ? 'hl' : ''}">${c}</button>`).join('')}</div>`; };
    showBooks();
    const q = s.querySelector('#pRefQ');
    q.onkeydown = async e => { if (e.key !== 'Enter') return; e.preventDefault(); const r = await api.parseRef(q.value).catch(() => null); if (r && r.b) { closeSheet(); go({ b: r.b, c: r.c || 1, v: r.v || 1 }); } else flash('Not a reference: ' + q.value); };
    q.oninput = () => { const t = q.value.trim().toLowerCase(); if (!t || /\d/.test(t)) return showBooks(); body.innerHTML = `<div class="rows">${(state.nav || []).filter(b => b.name.toLowerCase().startsWith(t) || (b.abbrs || []).some(a => a.toLowerCase().startsWith(t))).map(b => `<button type="button" class="prr" data-b="${b.id}">${ic('book', 18)}<span>${esc(b.name)}</span><small>${b.chapterList.length} chapters</small></button>`).join('') || '<p class="phint">No book starts with that.</p>'}</div>`; };
    s.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'); if (g) { closeSheet(); return go(parseKey(g.dataset.go)); }
      if (e.target.closest('[data-backb]')) return showBooks();
      const c = e.target.closest('[data-c]'); if (c) { closeSheet(); return go({ b: selB, c: +c.dataset.c, v: 1 }); }
      const b = e.target.closest('[data-b]'); if (b) return showCh(+b.dataset.b);
    });
  }

  /* ================================================================ Bible view: choose the Bible, view options, look */
  function viewBtn(a) { const sec = $(`#workbench .bv[data-i="${state.active}"]`) || $('#workbench .bv'); return sec && sec.querySelector(`[data-a="${a}"]`); }
  function viewAction(a) { const b = viewBtn(a); if (b) { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); } return !!b; }
  const chooseBible = () => viewAction('bible');
  /* the text's side margins and line height, three levels each (kept on this device) */
  const RD = { m: [['Narrow', '6px'], ['Normal', '26px'], ['Wide', '46px']], l: [['Tight', '1.27'], ['Normal', '1.72'], ['Roomy', '2']] };
  const rdGet = () => { try { const o = JSON.parse(localStorage.getItem('tw.rd') || '{}'); return { m: [0, 1, 2].includes(o.m) ? o.m : 1, l: [0, 1, 2].includes(o.l) ? o.l : 1 }; } catch (e) { return { m: 1, l: 1 }; } };
  function rdApply() { const o = rdGet(); root.style.setProperty('--rd-mx', RD.m[o.m][1]); root.style.setProperty('--rd-ex', o.m === 0 ? '0px' : ''); root.style.setProperty('--rd-lh', RD.l[o.l][1]); }
  function rdSet(k, i) { const o = rdGet(); o[k] = i; try { localStorage.setItem('tw.rd', JSON.stringify(o)); } catch (e) { /* not kept */ } rdApply(); }
  rdApply();
  /** the text format sheet for one Bible view (with two Bibles on screen, each has its own) */
  function formatFor(i) { if (i != null) par.focus(i); readingSheet(); }
  function readingSheet() {
    const v = views()[state.active] || {}; const sh = Object.assign({}, state.settings.show, v.show || {});
    const tog = (k, l, i) => `<button type="button" class="tgl${sh[k] ? ' on' : ''}" data-show="${k}">${ic(i, 20)}<span>${l}</span></button>`;
    const s = sheet(`<div class="prow"><span>Bible</span><button type="button" class="pchip" data-x="bible">${esc(bibleAbbr() || 'Choose')} ${ic('chevD', 14)}</button></div>
      <div class="prow"><span>Text size</span><span class="stepper"><button type="button" class="pib" data-z="-1">${ic('textDown', 20)}</button><b>${Math.round((v.zoom || 1) * 100)}%</b><button type="button" class="pib" data-z="1">${ic('textUp', 20)}</button></span></div>
      <div class="prow pr3"><span>Margins</span><div class="pseg" data-rd="m">${RD.m.map((x, i) => `<button type="button" data-i="${i}" class="${rdGet().m === i ? 'on' : ''}">${x[0]}</button>`).join('')}</div></div>
      <div class="prow pr3"><span>Line height</span><div class="pseg" data-rd="l">${RD.l.map((x, i) => `<button type="button" data-i="${i}" class="${rdGet().l === i ? 'on' : ''}">${x[0]}</button>`).join('')}</div></div>
      <h4 class="sec">Show in the text</h4><div class="tgls">${tog('strongs', "Strong's", 'lexicon')}${tog('morph', 'Morphology', 'hash')}${tog('columns', 'Interlinear', 'compare')}${tog('footnotes', 'Footnotes', 'note')}${tog('headings', 'Headings', 'outline')}${tog('woj', 'Words of Jesus', 'fontColor')}${tog('added', 'Added words', 'type')}${tog('xrefs', 'Cross-refs', 'xref')}${tog('cmtLinks', 'Commentary marks', 'commentary')}${tog('highlights', 'My highlights', 'highlight')}${tog('notes', 'My notes', 'note')}</div>
      <h4 class="sec">This view</h4><div class="pills"><button type="button" class="pill" data-x="font">${ic('type', 16)} Font</button><button type="button" class="pill" data-x="hfont">${ic('outline', 16)} Heading font</button><button type="button" class="pill" data-x="fcolor">${ic('fontColor', 16)} Text colour</button><button type="button" class="pill" data-x="selbg">${ic('verseBg', 16)} Active verse colour</button><button type="button" class="pill" data-x="pen">${ic('highlighter', 16)} Highlighter pen</button><button type="button" class="pill" data-x="ul">${ic('underline', 16)} Underline pen</button><button type="button" class="pill${v.linked ? ' on' : ''}" data-x="link">${ic('link', 16)} Move with other views</button><button type="button" class="pill" data-x="vn">${ic('hash', 16)} Verse numbers</button><button type="button" class="pill" data-x="menu">${ic('menu', 16)} All view options</button><button type="button" class="pill" data-x="info">${ic('info', 16)} About this Bible</button></div>`, { title: 'Reading view' });
    s.addEventListener('click', e => {
      const z = e.target.closest('[data-z]'); if (z) { zoomView(state.active, +z.dataset.z); const vv = views()[state.active] || {}; z.parentNode.querySelector('b').textContent = Math.round((vv.zoom || 1) * 100) + '%'; return; }
      const rb = e.target.closest('[data-rd] > button'); if (rb) { rdSet(rb.parentNode.dataset.rd, +rb.dataset.i); rb.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === rb)); return; }
      const t = e.target.closest('[data-show]'); if (t) { const on = !t.classList.contains('on'); setShow(t.dataset.show, on); t.classList.toggle('on', on); return; }
      const x = e.target.closest('[data-x]'); if (!x) return; const a = x.dataset.x;
      if (a === 'link') { toggleLink(state.active); x.classList.toggle('on'); return; }
      if (a === 'vn') { const ap = TimotheosOptions.appearance(); const vv = views()[state.active] || {}; setVerseNumbers(state.active, (vv.vnPos || ap.vnPos) === 'hidden'); return; }
      closeSheet(); setTimeout(() => viewAction(a), 120);
    });
  }

  /* ================================================================ Library */
  const KIND = [['dictionary', 'Dictionaries'], ['commentary', 'Commentaries'], ['book', 'Books'], ['devotional', 'Daily'], ['map', 'Maps'], ['readingplan', 'Plans']];
  const COVER = ['#8a3a33', '#3f5b4a', '#a98545', '#40506e', '#6e4a6a', '#2f6a6a', '#7a5a2a', '#4f5f8a'];
  const coverOf = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return COVER[Math.abs(h) % COVER.length]; };
  function libraryInto(box, o = {}) {
    const mods = (state.modules.books || []).filter(b => !b.hidden);
    const kinds = KIND.filter(([k]) => mods.some(m => m.kind === k));
    let cur = o.kind || (kinds[0] || [])[0];
    const draw = () => {
      const list = mods.filter(m => m.kind === cur).sort((a, z) => (a.title || a.name).localeCompare(z.title || z.name));
      box.innerHTML = `${kinds.length > 1 ? `<div class="pseg scroll">${kinds.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === cur ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        <div class="mods">${list.map(m => { const t = m.title || m.name.replace(/\.[^.]+(\.twm)?$/i, ''); return `<button type="button" class="mod${m.locked ? ' locked' : ''}" data-id="${esc(m.id)}"><span class="cov" style="background:${coverOf(t)}">${esc((m.abbr || t).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase())}</span><span class="mt"><b>${esc(t)}</b><span>${m.locked ? 'locked — opens only in theWord' : `${m.totalTopics ? m.totalTopics.toLocaleString() + ' entries · ' : ''}${esc((KIND.find(x => x[0] === m.kind) || [])[1] || m.kind)}${m.user ? ' · your own · editable' : ''}`}</span></span>${ic('chevR', 18)}</button>`; }).join('') || '<p class="phint">No modules of this kind. Import theWord or e-Sword modules from More → Modules.</p>'}</div>
        <div class="pills"><button type="button" class="pill" data-import>${ic('import', 16)} Import modules</button><button type="button" class="pill" data-newmod>${ic('plus', 16)} New user module</button></div>`;
    };
    draw();
    box.onclick = e => {
      const k = e.target.closest('[data-k]'); if (k) { cur = k.dataset.k; return draw(); }
      const m = e.target.closest('.mod'); if (m) { if (m.classList.contains('locked')) return flash('This module is locked: it opens only in theWord'); return openModule(m.dataset.id); }
      if (e.target.closest('[data-import]')) return TimotheosModules.importModules();
      if (e.target.closest('[data-newmod]')) return TimotheosModules.newUserModuleDialog(cur === 'book' ? 'book' : cur === 'dictionary' ? 'dictionary' : 'commentary');
    };
  }
  function library() { const p = pushPage({ title: 'Library', big: true, actions: `<button type="button" class="pib" data-x="import" aria-label="Import">${ic('import', 22)}</button><button type="button" class="pib" data-x="bsearch" aria-label="Search the books">${ic('search', 22)}</button>` });
    const box = document.createElement('div'); p.body.appendChild(box); libraryInto(box); wireLibBar(p.bar); return p; }
  function wireLibBar(bar) { bar.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return; if (x.dataset.x === 'import') TimotheosModules.importModules(); if (x.dataset.x === 'bsearch') search({ mode: 'books' }); }); }
  /** a module: its topics (with the filter), then a topic */
  async function openModule(id, tid) {
    const info = (state.modules.books || []).find(b => b.id === id) || {};
    const title = info.title || info.name || 'Module';
    const p = pushPage({ title, actions: `<button type="button" class="pib" data-x="speak" aria-label="Read aloud">${ic('speaker', 22)}</button><button type="button" class="pib" data-x="menu" aria-label="More">${ic('more', 22)}</button>`, cls: 'modpage' });
    p.body.innerHTML = '<div class="mtop"></div><div class="mentry hidden"><div class="mehead"><button type="button" class="pchip" data-x="list">' + ic('chevL', 14) + ' All topics</button><span class="grow"></span><button type="button" class="pib" data-x="prev">' + ic('chevL', 20) + '</button><button type="button" class="pib" data-x="next">' + ic('chevR', 20) + '</button></div><div class="mebody"></div><div class="pills mefoot"><button type="button" class="pill" data-x="find">' + ic('search', 15) + ' Find in Bible</button><button type="button" class="pill" data-x="copy">' + ic('copy', 15) + ' Copy</button><button type="button" class="pill" data-x="print">' + ic('print', 15) + ' Print</button></div></div>';
    const top = p.body.querySelector('.mtop'), entry = p.body.querySelector('.mentry'), ebody = p.body.querySelector('.mebody');
    const backs = [borrow($('#libFilter'), top), borrow($('#libCount'), top), borrow($('#libTopics'), top), borrow($('#libBody'), ebody)];
    $('#libFilter').placeholder = 'Find a topic…';
    const pageRef = stack[stack.length - 1]; pageRef.o.onClose = () => { backs.reverse().forEach(f => f()); };
    const showEntry = on => { entry.classList.toggle('hidden', !on); top.classList.toggle('hidden', on); p.body.scrollTop = 0; };
    $('#libTopics').addEventListener('click', e => { if (e.target.closest('li[data-tid]')) setTimeout(() => showEntry(true), 0); });
    p.body.addEventListener('click', e => {
      const x = e.target.closest('[data-x]'); if (!x) return; const a = x.dataset.x;
      if (a === 'list') showEntry(false);
      else if (a === 'prev') TimotheosModules.stepTopic(-1);
      else if (a === 'next') TimotheosModules.stepTopic(1);
      else if (a === 'find') { const h = $('#libBody h4'); search({ q: h ? h.textContent : '' }); }
      else if (a === 'copy') { const b = $('#libBody'); api.copyText(b.innerText, b.innerHTML).then(() => flash('Copied')); }
      else if (a === 'print') $('#libPrint').click();
    });
    p.bar.addEventListener('click', e => { const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'speak') $('#libSpeak').click();
      if (x.dataset.x === 'menu') moduleMenu(info);
    });
    const sameMod = TimotheosModules.lib.cur === id;
    await TimotheosModules.openBookModule(id, tid);
    if (sameMod && $('#libFilter').value) { $('#libFilter').value = ''; $('#libFilter').dispatchEvent(new Event('input', { bubbles: true })); }   // the whole list again
    showEntry(tid != null || info.kind === 'devotional' || info.kind === 'commentary' || !!$('#libBody .entry'));
    if (tid == null && info.kind !== 'devotional' && info.kind !== 'commentary') showEntry(false);
    return p;
  }
  function moduleMenu(info) {
    const btn = (id, i, l) => `<button type="button" class="pill" data-b="${id}">${ic(i, 16)} ${l}</button>`;
    const user = !!info.user;
    const s = sheet(`<div class="pills">${btn('libBack', 'back', 'Topic read before')}${!$('#libToday').classList.contains('hidden') ? btn('libToday', 'calendar', "Today's reading") : ''}${btn('libExport', 'import', 'Export topics')}${btn('libInfo', 'info', 'Properties')}${btn('libCompress', 'compress', 'Make the file smaller')}${btn('libPrint', 'print', 'Print')}</div>
      ${user ? `<h4 class="sec">Your own module</h4><div class="pills">${btn('libAddTopic', 'plus', 'New topic')}${info.kind === 'book' ? btn('libAddSub', 'plus', 'New sub-topic') : ''}${btn('libEditTopic', 'edit', 'Edit topic')}${btn('libRenameTopic', 'type', 'Rename')}${btn('libMoveUp', 'up', 'Move up')}${btn('libMoveDown', 'down', 'Move down')}${btn('libDelTopic', 'close', 'Delete topic')}</div>` : ''}`, { title: esc(info.title || 'Module') });
    s.onclick = e => { const b = e.target.closest('[data-b]'); if (!b) return; closeSheet(); setTimeout(() => { const t = document.getElementById(b.dataset.b); if (t) t.click(); }, 80); };
  }
  /** the lookup feed (dictionaries for a word, cross-references…) as a page */
  function feedPage(title) {
    const p = pushPage({ title: title || 'Lookup' }); const back = borrow($('#libFeed'), p.body);
    stack[stack.length - 1].o.onClose = back; return p;
  }

  /* ================================================================ Search */
  function engine() { const o = Object.assign({ defaultOr: false, whole: false, matchCase: false, matchDiac: false, regex: false, nearW: 30, nearV: 3, nearAcross: false, bibles: 'open', scope: 'all' }, state.settings.search || {});
    return { o, e: { defaultOr: o.defaultOr, wholeWords: o.whole, ignoreCase: !o.matchCase, ignoreDiacritics: !o.matchDiac, regex: o.regex, nearW: o.nearW, nearV: o.nearV, nearAcross: !!o.nearAcross, scope: o.scope, current: { b: state.ref.b, c: state.ref.c } } }; }
  function searchIds(o) { const open = state.settings.openBibles || []; if (o.bibles === 'first') return open.slice(0, 1); if (o.bibles === 'all') return state.modules.bibles.map(b => b.id); if (o.bibles === 'chosen' && (state.settings.searchBibleIds || []).length) return state.settings.searchBibleIds; return open; }
  const mark = (t, ms) => { let out = '', p = 0; for (const [s, e] of ms || []) { if (s < p) continue; out += esc(t.slice(p, s)) + '<mark>' + esc(t.slice(s, e)) + '</mark>'; p = e; } return out + esc(t.slice(p)); };
  function searchInto(box, o = {}) {
    let mode = o.mode || 'bible', scope = (state.settings.search || {}).scope || 'all', last = null, lastB = null, filterB = null;
    box.innerHTML = `<label class="pfield">${ic('search', 18)}<input class="sq" type="search" placeholder="Words, a phrase, G25 or H7462" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
      <div class="pseg sg"><button type="button" data-m="bible">Bible</button><button type="button" data-m="books">Books</button></div>
      <div class="pchips scopes"></div><div class="sres"></div>`;
    const q = box.querySelector('.sq'), res = box.querySelector('.sres'), sc = box.querySelector('.scopes');
    const drawScopes = () => {
      if (mode === 'bible') sc.innerHTML = [['all', 'Whole Bible'], ['OT', 'OT'], ['NT', 'NT'], ['book', 'This book']].map(([k, l]) => `<button type="button" class="pchip${scope === k ? ' acc' : ''}" data-s="${k}">${l}</button>`).join('') + `<button type="button" class="pchip" data-opts>${ic('tune', 15)} More</button>`;
      else sc.innerHTML = `<button type="button" class="pchip acc">All books</button><button type="button" class="pchip" data-opts>${ic('tune', 15)} More</button>`;
      $$('[data-m]', box).forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    };
    let seq = 0;
    const run = async () => {
      const t = q.value.trim(); if (!t) { res.innerHTML = ''; return; } const my = ++seq, m0 = mode;
      res.innerHTML = '<p class="phint">Searching…</p>';
      if (mode === 'bible') {
        const { o: so, e } = engine(); e.scope = scope; const ids = searchIds(so);
        try {
          const r = await api.search(ids, t, Object.assign(e, { limit: 3000 })); if (my !== seq || mode !== m0) return; last = r; filterB = null;
          const u = ud(); u.searchHistory = [t, ...(u.searchHistory || []).filter(x => x !== t)].slice(0, 50); api.setUserData('searchHistory', u.searchHistory);
          drawBible();
        } catch (err) { res.innerHTML = `<p class="phint">${esc(err.message)}</p>`; }
      } else {
        res.innerHTML = '<p class="phint bsprog">Searching the books… The first search reads every module and can take a while; the next ones are quick.</p>';
        try { const r = await api.bookSearchAll(t, { ids: [], whole: false, accents: false, regex: false }); if (!r || my !== seq || mode !== m0) return; lastB = r; drawBooks(); } catch (err) { res.innerHTML = `<p class="phint">${esc(err.message)}</p>`; }
      }
    };
    const drawBible = () => {
      const r = last; if (!r) return; const max = Math.max(1, ...r.books.map(b => b.n)); const top = r.books.slice().sort((a, z) => z.n - a.n)[0];
      const list = filterB ? r.results.filter(x => `${x.id}|${x.b}` === filterB) : r.results;
      res.innerHTML = r.total ? `<div class="bars">${r.books.map(b => `<button type="button" class="${filterB === b.id + '|' + b.b ? 'hi' : b === top ? 'top' : ''}" data-fb="${esc(b.id + '|' + b.b)}" style="height:${Math.max(4, Math.round(46 * b.n / max))}px" title="${esc(b.name)} ${b.n}" aria-label="${esc(b.name)}"></button>`).join('')}</div>
        <p class="pmeta">${r.total.toLocaleString()} verse${r.total === 1 ? '' : 's'} in ${r.books.length} book${r.books.length === 1 ? '' : 's'}${top ? ` · ${esc(top.name)} most` : ''}${filterB ? ` · <a data-all>show all</a>` : ''}${r.total > r.results.length ? ` · first ${r.results.length} listed` : ''}</p>
        <div class="pills"><button type="button" class="pill" data-tolist>${ic('study', 15)} Add to verse list</button><button type="button" class="pill" data-copyall>${ic('copy', 15)} Copy all</button></div>
        ${list.slice(0, 400).map((x, i) => `<button type="button" class="hit" data-i="${r.results.indexOf(x)}"><b>${esc(x.ref)}${new Set(r.results.map(z => z.id)).size > 1 ? ` <em>${esc(x.abbr)}</em>` : ''}</b><p>${mark(x.text, x.marks)}</p></button>`).join('')}${list.length > 400 ? `<p class="phint">${list.length - 400} more — narrow the search to see them.</p>` : ''}`
        : '<p class="phint">Nothing found.</p>';
    };
    const drawBooks = () => { const r = lastB;
      res.innerHTML = r.total ? `<p class="pmeta">${r.total.toLocaleString()} topic${r.total === 1 ? '' : 's'} in ${r.results.length} book${r.results.length === 1 ? '' : 's'}${r.shown < r.total ? ` · first ${r.shown} shown` : ''}</p>${r.results.map(m => m.hits.map(h => `<button type="button" class="hit" data-mod="${esc(m.id)}" data-tid="${esc(String(h.tid))}"><b>${esc(m.title)} · ${esc(h.subject)}</b><p>${h.snippet}</p></button>`).join('')).join('')}` : '<p class="phint">Nothing found in your books.</p>'; };
    box.addEventListener('click', e => {
      const m = e.target.closest('[data-m]'); if (m) { mode = m.dataset.m; drawScopes(); if (mode === 'bible' && last) drawBible(); else if (mode === 'books' && lastB) drawBooks(); else run(); return; }
      const s = e.target.closest('[data-s]'); if (s) { scope = s.dataset.s; const so = Object.assign({}, state.settings.search || {}, { scope }); window.save ? save({ search: so }) : null; drawScopes(); run(); return; }
      if (e.target.closest('[data-opts]')) return searchOptions(mode, run);
      const fb = e.target.closest('[data-fb]'); if (fb) { filterB = filterB === fb.dataset.fb ? null : fb.dataset.fb; return drawBible(); }
      if (e.target.closest('[data-all]')) { filterB = null; return drawBible(); }
      if (e.target.closest('[data-tolist]') && last) return TimotheosStudy.addToList((filterB ? last.results.filter(x => `${x.id}|${x.b}` === filterB) : last.results).map(x => ({ b: x.b, c: x.c, v: x.v, v2: x.v2 > x.v ? x.v2 : undefined })));
      if (e.target.closest('[data-copyall]') && last) return api.copyText(last.results.map(x => `${x.ref} ${x.text}`).join('\n')).then(() => flash(`${last.results.length} verses copied`));
      const h = e.target.closest('.hit'); if (!h) return;
      if (h.dataset.mod) { openModule(h.dataset.mod, isNaN(+h.dataset.tid) ? h.dataset.tid : +h.dataset.tid).then(() => { try { TimotheosBookSearch.markIn($('#libBody'), lastB.words); } catch (x) { /* */ } }); return; }
      const x = last.results[+h.dataset.i]; if (o.onGo) o.onGo(); go({ b: x.b, c: x.c, v: x.v });
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); q.blur(); run(); } });
    drawScopes();
    if (o.q) { q.value = o.q; run(); }
    return { focus: () => q.focus(), run: t => { q.value = t; run(); } };
  }
  function searchOptions(mode, rerun) {
    if (mode === 'books') { const s = sheet('<p class="phint">The Books search looks in every dictionary, commentary and book. For whole words, accents, a regular expression or one module only, use the full Book search.</p><div class="pills"><button type="button" class="pill" data-full>' + ic('book', 16) + ' Full Book search</button></div>', { title: 'Book search options' }); s.querySelector('[data-full]').onclick = () => { closeSheet(); fullPanel('bsearch'); }; return; }
    const so = Object.assign({ defaultOr: false, whole: false, matchCase: false, matchDiac: false, regex: false, bibles: 'open' }, state.settings.search || {});
    const tg = (k, l) => `<button type="button" class="tgl${so[k] ? ' on' : ''}" data-k="${k}"><span>${l}</span></button>`;
    const s = sheet(`<div class="tgls">${tg('whole', 'Whole words')}${tg('matchCase', 'Match case')}${tg('matchDiac', 'Match accents')}${tg('regex', 'Regular expression')}${tg('defaultOr', 'Any word (OR)')}</div>
      <h4 class="sec">Search in</h4><div class="pseg">${[['open', 'Open Bibles'], ['first', 'First Bible'], ['all', 'All Bibles']].map(([k, l]) => `<button type="button" data-b="${k}" class="${so.bibles === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="pills"><button type="button" class="pill" data-full>${ic('search', 16)} Full Bible search (near, ranges, statistics)</button><button type="button" class="pill" data-hist>${ic('history', 16)} Earlier searches</button></div>`, { title: 'Search options' });
    s.onclick = e => {
      const t = e.target.closest('[data-k]'); if (t) { so[t.dataset.k] = !so[t.dataset.k]; t.classList.toggle('on'); save({ search: Object.assign({}, state.settings.search || {}, so) }); return; }
      const b = e.target.closest('[data-b]'); if (b) { so.bibles = b.dataset.b; $$('[data-b]', s).forEach(x => x.classList.toggle('on', x === b)); save({ search: Object.assign({}, state.settings.search || {}, so) }); return; }
      if (e.target.closest('[data-full]')) { closeSheet(); return fullPanel('search'); }
      if (e.target.closest('[data-hist]')) { const h = (ud().searchHistory || []).slice(0, 25); const s2 = sheet(h.length ? `<div class="rows">${h.map(x => `<button type="button" class="prr" data-q="${esc(x)}">${ic('history', 18)}<span>${esc(x)}</span></button>`).join('')}</div>` : '<p class="phint">No searches yet.</p>', { title: 'Earlier searches' }); s2.onclick = ev => { const q = ev.target.closest('[data-q]'); if (q) { closeSheet(); search({ q: q.dataset.q }); } }; }
    };
    sheetClose = rerun;
  }
  /** one of the old full panels (search with all its options, book search), as a page */
  function fullPanel(id) {
    const el = { search: '#tab-search', bsearch: '#tab-bsearch', cmt: '#tab-cmt', study: '#tab-study', tree: '#pane-tree' }[id];
    const p = pushPage({ title: { search: 'Bible search', bsearch: 'Book search', cmt: 'Commentary', study: 'My Study', tree: 'Books & chapters' }[id] || '' , cls: 'fullpanel' });
    const back = borrow($(el), p.body); stack[stack.length - 1].o.onClose = back;
    try { if (id === 'search') window.TimotheosSearch.onOpen(true); if (id === 'bsearch') window.TimotheosBookSearch.onOpen(true); if (id === 'study') TimotheosStudy.onOpen(); if (id === 'cmt') TimotheosModules.updateCommentary(); } catch (e) { /* */ }
    return p;
  }
  function search(o = {}) { const p = pushPage({ title: 'Search', big: true }); const box = document.createElement('div'); p.body.appendChild(box); const s = searchInto(box, Object.assign({ onGo: () => clearPages() }, o)); if (!o.q) setTimeout(s.focus, 250); return p; }

  /* ================================================================ Study */
  function counts() {
    const u = ud(); let hl = 0; for (const id in (u.highlights || {})) hl += Object.keys(u.highlights[id] || {}).length;
    const bm = Object.values(u.bookmarks || {}).filter(Boolean).length;
    return { notes: Object.keys(u.notes || {}).length, hl, bm, lists: Object.keys(u.lists || {}).length, plans: (u.plans || []).length };
  }
  async function studyInto(box) {
    const u = ud(); const c = counts(); const plans = u.plans || [];
    const p = plans.find(x => x.sessions.some(s => !s.done)); let today = '';
    if (p) { const s = p.sessions.find(x => !x.done); const done = p.sessions.filter(x => x.done).length; const pct = Math.round(100 * done / Math.max(1, p.sessions.length));
      today = `<button type="button" class="card2" data-plan><div class="k">Today · ${esc(p.name)}</div><h5>${esc((s.readings || []).map(r => passLabel(r)).join(' · '))}</h5><p>Reading ${p.sessions.indexOf(s) + 1} of ${p.sessions.length} · ${pct}% done</p><div class="progress"><i style="width:${pct}%"></i></div></button>`;
    } else today = `<button type="button" class="card2" data-newplan><div class="k">Daily reading</div><h5>Start a reading plan</h5><p>Through the Bible in a year, the New Testament, Psalms and Proverbs…</p></button>`;
    const notes = Object.entries(u.notes || {}).sort((a, z) => (z[1].t || 0) - (a[1].t || 0)).slice(0, 4);
    box.innerHTML = `${today}<div class="qgrid"><button type="button" class="q" data-s="notes">${ic('note', 22)}<div>Notes<small>${c.notes}</small></div></button><button type="button" class="q" data-s="hl">${ic('highlight', 22)}<div>Highlights<small>${c.hl}</small></div></button><button type="button" class="q" data-s="marks">${ic('bookmark', 22)}<div>Bookmarks<small>${c.bm} · keys 1–0</small></div></button><button type="button" class="q" data-s="lists">${ic('study', 22)}<div>Verse lists<small>${c.lists}</small></div></button></div>
      <div class="pills"><button type="button" class="pill" data-s="plans">${ic('calendar', 16)} Reading plans (${c.plans})</button><button type="button" class="pill" data-dev>${ic('book', 16)} Devotionals today</button></div>
      ${notes.length ? `<h4 class="sec">Recent notes</h4><div class="glist">${notes.map(([k, n]) => `<button type="button" class="prr" data-go="${k}">${ic('note', 18)}<span>${esc(rn(parseKey(k)))}</span><small>${esc(text(n.html).slice(0, 34))}</small></button>`).join('')}</div>` : ''}`;
    box.onclick = e => {
      const g = e.target.closest('[data-go]'); if (g) { clearPages(); return go(parseKey(g.dataset.go)); }
      if (e.target.closest('[data-newplan]')) return newPlanDialog();
      if (e.target.closest('[data-plan]')) return studySection('plans');
      if (e.target.closest('[data-dev]')) return devotionals();
      const s = e.target.closest('[data-s]'); if (s) return s.dataset.s === 'hl' ? highlightsPage() : studySection(s.dataset.s);
    };
  }
  function studySection(seg) {
    const p = pushPage({ title: { notes: 'My notes', marks: 'Bookmarks', lists: 'Verse lists', plans: 'Reading plans' }[seg] || 'My Study', cls: 'fullpanel' });
    const back = borrow($('#studyBody'), p.body); stack[stack.length - 1].o.onClose = back;
    TimotheosStudy.study.seg = seg; TimotheosStudy.onOpen();
    return p;
  }
  async function highlightsPage() {
    const p = pushPage({ title: 'Highlights' }); const u = ud(); const rows = [];
    for (const id in (u.highlights || {})) for (const k in u.highlights[id]) rows.push({ id, k, r: parseKey(k), style: (u.highlights[id][k][0] || {}).style });
    const ord = r => { const i = (state.nav || []).findIndex(x => x.id === r.b); return (i < 0 ? 999 : i) * 1e6 + r.c * 1e3 + r.v; };
    rows.sort((a, z) => ord(a.r) - ord(z.r));
    p.body.innerHTML = rows.length ? `<div class="glist">${rows.map((x, i) => `<button type="button" class="prr hlrow" data-i="${i}"><i class="psw hl-${esc(x.style || 'yellow')}"></i><span>${esc(rn(x.r))} <em>${esc(bibleAbbr(x.id))}</em></span><small data-t="${i}"></small></button>`).join('')}</div>` : '<p class="phint">No highlights yet. Hold a verse (or tap it) and choose a colour.</p>';
    p.body.onclick = e => { const r = e.target.closest('[data-i]'); if (r) { clearPages(); go(rows[+r.dataset.i].r); } };
    rows.slice(0, 60).forEach((x, i) => TimotheosStudy.verseText(x.id, x.r.b, x.r.c, x.r.v).then(t => { const el = p.body.querySelector(`[data-t="${i}"]`); const s = t && (t.text || (t.vs && t.vs.map(z => z.text).join(' ')) || ''); if (el && s) el.textContent = s.slice(0, 40) + (s.length > 40 ? '…' : ''); }).catch(() => {}));
  }
  async function devotionals() {
    const d = new Date(); const dev = await api.devotionsToday(d.getMonth() + 1, d.getDate()).catch(() => []);
    const s = sheet(dev.length ? `<div class="rows">${dev.map(x => `<button type="button" class="prr" data-id="${esc(x.id)}" data-tid="${esc(String(x.topics[0].id))}">${ic('book', 18)}<span>${esc(x.title)}</span><small>${esc(x.topics[0].subject)}</small></button>`).join('')}</div>` : '<p class="phint">No devotional module has a reading for today. Import one (theWord .dev.twm) from More → Modules.</p>', { title: 'Devotionals today' });
    s.onclick = e => { const r = e.target.closest('[data-id]'); if (r) { closeSheet(); openModule(r.dataset.id, isNaN(+r.dataset.tid) ? r.dataset.tid : +r.dataset.tid); } };
  }
  function studyPage() { const p = pushPage({ title: 'Study', big: true }); const box = document.createElement('div'); p.body.appendChild(box); studyInto(box); return p; }

  /* ================================================================ Read aloud settings (the page of Clear Tabs, also used by the others) */
  async function readAloudInto(box) {
    const S = TimotheosSpeech; const c = S.cfg(); const all = await S.voices();
    const inf = bibleInfo(); const langs = [...new Set(['en', 'fil', S.langOf(inf.lang), ...Object.keys(c.voices || {})])];
    const vname = l => { const v = all.find(x => x.voiceURI === (c.voices || {})[l]); return v ? v.name : 'Automatic'; };
    const sl = (k, l, min, max, stp, val, fmt) => `<div class="sl"><span>${l}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${stp}" value="${val}"><em>${fmt(val)}</em></div>`;
    const pct = v => Math.round(v * 100) + '%', two = v => (+v).toFixed(2);
    box.innerHTML = `${S.have() ? '' : '<p class="phint">Reading aloud is not available on this device.</p>'}
      <div class="glist">${langs.map(l => `<button type="button" class="prr" data-l="${l}">${ic('speaker', 20)}<span>${esc(S.NAMES[l] || l)}</span><small>${esc(vname(l))} ${ic('chevR', 16)}</small></button>`).join('')}<button type="button" class="prr" data-addl>${ic('plus', 20)}<span>Another language</span><small>${ic('chevR', 16)}</small></button></div>
      <div class="glist">${sl('volume', 'Volume', 0, 1, 0.05, c.volume == null ? 1 : c.volume, pct)}${sl('pitch', 'Pitch', 0.5, 2, 0.05, c.pitch || 1, two)}${sl('rate', 'Tempo', 0.5, 2, 0.05, c.rate || 1, two)}</div>
      <h4 class="sec">When a chapter ends</h4><div class="pseg">${[['bible', 'Read on'], ['chapter', 'Repeat chapter'], ['range', 'Range']].map(([k, l]) => `<button type="button" data-mode="${k}" class="${c.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="rng${c.mode === 'range' ? '' : ' dim'}"><label class="pfield">${ic('book', 18)}<input data-r="from" placeholder="From, e.g. Ps 23:1" value="${esc(c.from ? rn(c.from) : '')}"></label><span>→</span><label class="pfield"><input data-r="to" placeholder="To, e.g. Ps 23:6" value="${esc(c.to ? rn(c.to) : '')}"></label></div>
      <div class="pills"><button type="button" class="pill gold" data-go>${ic('play', 16)} Read the chapter now</button><button type="button" class="pill" data-try>${ic('speaker', 16)} Try the voice</button></div>`;
    box.oninput = e => { const t = e.target.closest('[data-k]'); if (!t) return; S.setCfg(t.dataset.k, +t.value); t.nextElementSibling.textContent = t.dataset.k === 'volume' ? pct(+t.value) : two(+t.value); };
    box.onchange = async e => { const t = e.target.closest('[data-r]'); if (!t) return; const r = t.value.trim() ? await api.parseRef(t.value).catch(() => null) : null; if (t.value.trim() && !r) { flash('Not a reference: ' + t.value); return; } S.setCfg(t.dataset.r, r ? { b: r.b, c: r.c, v: r.v } : null); t.value = r ? rn(r) : ''; };
    box.onclick = e => {
      const m = e.target.closest('[data-mode]'); if (m) { S.setCfg('mode', m.dataset.mode); $$('[data-mode]', box).forEach(x => x.classList.toggle('on', x === m)); box.querySelector('.rng').classList.toggle('dim', m.dataset.mode !== 'range'); return; }
      const l = e.target.closest('[data-l]'); if (l) return voicePicker(l.dataset.l, all, () => readAloudInto(box));
      if (e.target.closest('[data-addl]')) { const s = sheet(`<div class="rows">${Object.entries(S.NAMES).filter(([k]) => !langs.includes(k)).map(([k, n]) => `<button type="button" class="prr" data-al="${k}"><span>${esc(n)}</span></button>`).join('')}</div>`, { title: 'Another language' }); s.onclick = ev => { const a = ev.target.closest('[data-al]'); if (!a) return; closeSheet(); voicePicker(a.dataset.al, all, () => readAloudInto(box)); }; return; }
      if (e.target.closest('[data-go]')) { clearPages(); closeSheet(); return S.speakView(state.active, null); }
      if (e.target.closest('[data-try]')) return S.sample(c.lang || S.langOf(inf.lang));
    };
  }
  function voicePicker(l, all, done) {
    const S = TimotheosSpeech; const c = S.cfg(); const same = all.filter(v => String(v.lang).toLowerCase().replace('_', '-').startsWith(l === 'fil' ? 'fil' : l) || (l === 'fil' && /^tl/i.test(v.lang)));
    const rest = all.filter(v => !same.includes(v));
    const row = v => `<button type="button" class="prr${(c.voices || {})[l] === v.voiceURI ? ' hl' : ''}" data-v="${esc(v.voiceURI)}"><span>${esc(v.name)}</span><small>${esc(v.lang)}</small></button>`;
    const s = sheet(`<div class="rows"><button type="button" class="prr${!(c.voices || {})[l] ? ' hl' : ''}" data-v=""><span>Automatic</span><small>${same.length ? 'the best voice for ' + esc(S.NAMES[l] || l) : 'no voice for this language'}</small></button>${same.map(row).join('')}</div>${rest.length ? `<h4 class="sec">Other languages</h4><div class="rows">${rest.slice(0, 60).map(row).join('')}</div>` : ''}`, { title: `Voice · ${esc(S.NAMES[l] || l)}`, cls: 'tall' });
    s.onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; const n = S.cfg(); n.voices = Object.assign({}, n.voices); if (b.dataset.v) n.voices[l] = b.dataset.v; else delete n.voices[l]; S.setCfg('voices', n.voices); closeSheet(); S.sample(l); if (done) done(); };
  }
  function readAloudPage() { const p = pushPage({ title: 'Read aloud' }); const box = document.createElement('div'); p.body.appendChild(box); readAloudInto(box); return p; }

  /* ================================================================ help, modules, options */
  function helpSheet() {
    const s = sheet(`<div class="rows"><button type="button" class="prr" data-c="guide">${ic('book', 20)}<span>User guide</span></button><button type="button" class="prr" data-c="keys">${ic('keyboard', 20)}<span>Keyboard shortcuts</span></button><button type="button" class="prr" data-c="about">${ic('info', 20)}<span>About Timotheos</span></button></div>`, { title: 'Help' });
    s.onclick = e => { const b = e.target.closest('[data-c]'); if (b) { closeSheet(); runCommand(b.dataset.c); } };
  }
  function modulesSheet() {
    const s = sheet(`<div class="rows"><button type="button" class="prr" data-c="import">${ic('import', 20)}<span>Import modules…</span><small>theWord, e-Sword</small></button><button type="button" class="prr" data-c="addFolder">${ic('folder', 20)}<span>Add module folder…</span></button><button type="button" class="prr" data-c="rescan">${ic('refresh', 20)}<span>Rescan modules</span></button><button type="button" class="prr" data-c="modulesFolder">${ic('folder', 20)}<span>Imported modules folder</span></button><button type="button" class="prr" data-c="newUserMod">${ic('plus', 20)}<span>New user module…</span></button><button type="button" class="prr" data-o="mods">${ic('layers', 20)}<span>Manage modules</span><small>show, hide, properties, uninstall</small></button><button type="button" class="prr" data-c="exportTopics">${ic('import', 20)}<span>Export topics…</span></button></div>`, { title: 'Modules' });
    s.onclick = e => { const b = e.target.closest('[data-c],[data-o]'); if (!b) return; closeSheet(); if (b.dataset.o) TimotheosOptions.open(b.dataset.o); else runCommand(b.dataset.c); };
  }

  /* ================================================================ players */
  function ttsInfo() { const S = window.TimotheosSpeech; return S ? { busy: S.isSpeaking(), paused: S.isPaused(), label: S.label() } : { busy: false }; }
  function ttsProgress() { const sp = $('.bv .speaking'); if (!sp) return 0; const rows = $$('tr[data-v], .pv[data-v]', sp.closest('.bvtext')); const i = rows.indexOf(sp); return rows.length ? (i + 1) / rows.length : 0; }

  /* ================================================================ verse taps and holds in the Bible text (the screens decide what they do) */
  const H = { tap: null, hold: null, word: null };
  function wordOf(e) {
    const w = e.target.closest && e.target.closest('.word[data-strong], [data-strong], [data-morph]');
    if (w) { const sp = k => (w.dataset[k] || '').split(/\s+/).filter(Boolean); return { word: (w.textContent || '').trim(), strongs: sp('strong'), morphs: sp('morph'), lemma: w.dataset.lemma, el: w }; }
    try { const t = TimotheosModules.wordAt(e); return t ? { word: t, strongs: [], morphs: [] } : null; } catch (x) { return null; }
  }
  function wire() {
    const wb = $('#workbench'); if (!wb) return;
    let t0 = null, lp = null, held = false, sx = 0, sy = 0;
    const inText = el => el && el.closest && el.closest('.bv .bvtext') && !el.closest('a, button, input, select, textarea, .menu, .xrs, sup.fn, sup.xref, .unote, .noteicon, .sk-ttl');
    wb.addEventListener('touchstart', e => {
      if (!root.classList.contains('sk') || e.touches.length !== 1 || root.classList.contains('sk-selecting')) return; held = false;
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; const tg = e.target;
      if (!inText(tg)) return; clearTimeout(lp);
      lp = setTimeout(() => { const x = verseOf(tg) || verseAt(sx, sy, tg); if (!x || !H.hold) return; held = true; const ev = { target: tg, clientX: sx, clientY: sy }; H.hold(x, wordOf(ev), { x: sx, y: sy }); }, 500);
    }, { passive: true });
    wb.addEventListener('touchmove', e => { const t = e.touches[0]; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(lp); }, { passive: true });
    wb.addEventListener('touchend', e => { clearTimeout(lp); if (held) { e.preventDefault(); } }, { passive: false });
    // the old right-click menu is replaced by the screen's own (a mouse right-click, or a long press that the system turns into one)
    wb.addEventListener('contextmenu', e => {
      if (!root.classList.contains('sk')) return; if (!inText(e.target) && !e.target.closest('.bv [data-v]')) return;
      e.preventDefault(); e.stopPropagation(); clearTimeout(lp); if (held) return; held = !!e.isTrusted && 'ontouchstart' in window;
      const x = verseOf(e.target) || verseAt(e.clientX, e.clientY, e.target); if (x && H.hold) H.hold(x, wordOf(e), { x: e.clientX, y: e.clientY });
    }, true);
    document.addEventListener('click', e => {
      if (!root.classList.contains('sk')) return;
      if (held) { held = false; e.preventDefault(); e.stopPropagation(); return; }
      const tg = e.target; if (!tg.closest || !tg.closest('.bv .bvtext')) return;
      if (tg.closest('sup.fn, sup.xref')) { e.preventDefault(); e.stopPropagation(); noteHtml(tg.closest('sup')).then(h => sheet(`<div class="pcards"><article class="pcard">${h || '<p class="phint">Nothing to show.</p>'}</article></div>`, { title: tg.closest('sup.fn') ? 'Footnote' : 'Cross-reference' })); return; }
      if (tg.closest('.sk-aa')) { e.preventDefault(); e.stopPropagation(); formatFor(+tg.closest('.bv').dataset.i); return; }
      if (tg.closest('.sk-ttl')) { if (H.title && H.title(tg.closest('.sk-ttl'), tg)) return; if (H.tap) H.tap(null, null, e); return; }
      if (tg.closest('a, button, input, .xrs, .unote, .noteicon')) return;     // links, cross-reference lists, notes: as before
      if (root.classList.contains('sk-selecting') || String(window.getSelection()).trim()) return;
      const x = verseOf(tg) || verseAt(e.clientX, e.clientY, tg); if (!x) { if (H.tap) H.tap(null, null, e); return; }
      e.stopPropagation(); selectVerse(x.v, false);        // the old click would open the Library for a word: the screen decides instead
      if (H.tap) H.tap(x, wordOf(e), e);
    }, true);
    document.addEventListener('selectionchange', () => { if (root.classList.contains('sk-selecting') && !String(window.getSelection()).trim()) { /* still choosing */ } });
  }
  window.addEventListener('load', wire);
  // the bottom bar (tab bar, capsule, dock) goes away when the text is swiped or scrolled, and comes back with a tap on the page
  (() => {
    // (the time of the last change is kept: the text is resized then, and that must not count as scrolling)
    const off = on => { if (root.classList.contains('sk-baroff') !== on) { window.PUI_barAt = performance.now(); root.classList.toggle('sk-baroff', on); } };
    const inText = t => t && t.closest && t.closest('.bvtext');
    const lastY = new WeakMap(); let sx = null, sy = 0, moved = false;
    document.addEventListener('scroll', e => { const t = e.target; if (!root.classList.contains('sk') || !t.classList || !t.classList.contains('bvtext')) return;
      const y = t.scrollTop, y0 = lastY.get(t); lastY.set(t, y); if (y0 !== undefined && Math.abs(y - y0) > 6) off(true); }, { capture: true, passive: true });
    document.addEventListener('pointerdown', e => { if (!inText(e.target)) { sx = null; return; } sx = e.clientX; sy = e.clientY; moved = false; }, { capture: true, passive: true });
    document.addEventListener('pointermove', e => { if (sx === null || moved) return; if (Math.abs(e.clientX - sx) > 12 || Math.abs(e.clientY - sy) > 12) { moved = true; if (root.classList.contains('sk')) off(true); } }, { capture: true, passive: true });
    document.addEventListener('pointerup', e => { if (sx !== null && !moved && root.classList.contains('sk')) off(false); sx = null; }, { capture: true, passive: true });
    document.addEventListener('pointercancel', () => { sx = null; }, { capture: true, passive: true });
    window.PUI_bars = off;
    // Options, a question, module properties, the reading settings sheet, quick settings and the command bar have the screen:
    // no bottom bar over them. A page that opens (Library, Search…) shows the bar again.
    let was = false, pend = false;
    const over = () => {
      pend = false; if (!root.classList.contains('sk')) { root.classList.remove('sk-dlg'); return; }
      const dlg = ['modal', 'optionsDlg', 'propsDlg'].some(i => { const d = document.getElementById(i); return d && !d.classList.contains('hidden'); })
        || !!document.getElementById('pSheet') || !!document.querySelector('.c-cc.on, .c-pal.on');
      if (dlg && !was) off(false);
      was = dlg; root.classList.toggle('sk-dlg', dlg);
      if (root.classList.contains('pg-open')) off(false);
    };
    window.PUI_over = over;
    const later = () => { if (!pend) { pend = true; requestAnimationFrame(over); } };
    new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('load', () => new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }));
  })();
  // the old dialogs (Options, a question, module properties) close with Back too
  window.addEventListener('load', () => {
    // while one of them is open, the screen's own bars (tab bar, capsule, dock, players) are hidden: the dialog has the whole screen
    const dlgMark = () => { if (window.PUI_over) window.PUI_over(); };
    const watch = (id, close) => { const el = document.getElementById(id); if (!el) return; let open = !el.classList.contains('hidden');
      new MutationObserver(() => { const now = !el.classList.contains('hidden'); if (now === open) return; open = now; if (now) pushBack(() => close(el), 'dlg:' + id); else dropBack('dlg:' + id); dlgMark(); }).observe(el, { attributes: true, attributeFilter: ['class'] }); };
    watch('modal', el => { const b = [...el.querySelectorAll('#modalButtons button, .btns button, button')].reverse().find(x => /cancel|close|no\b/i.test(x.textContent)); if (b) b.click(); else el.classList.add('hidden'); });
    watch('optionsDlg', el => { const b = el.querySelector('#optClose, .optclose, [data-close]'); if (b) b.click(); else el.classList.add('hidden'); });
    watch('propsDlg', el => { const b = el.querySelector('#ppClose, [data-close]'); if (b) b.click(); else el.classList.add('hidden'); });
  });
  // the progress of a Book search ("Searching Matthew Henry (3 of 24)…") shows wherever one is waiting
  window.addEventListener('load', () => { try { api.onBookSearchProgress(t => $$('.bsprog').forEach(e => { e.textContent = t; })); } catch (e) { /* none */ } });

  /* ---- two Bibles on screen (Parallel): the top and the bottom pane each have their own Bible and place ---- */
  const gIdx = id => { const m = /^bv(\d+)$/.exec(id || ''); return m ? +m[1] : null; };
  const par = {
    on: () => !!(window.TimotheosPhone && TimotheosPhone.splitId()),
    top: () => { if (!par.on()) return state.active; const i = gIdx(TimotheosPhone.current()); return i == null ? state.active : i; },
    bot: () => (par.on() ? gIdx(TimotheosPhone.splitId()) : null),
    ref: i => { try { return views()[i] ? refOfView(i) : state.ref; } catch (e) { return state.ref; } },
    abbr: i => { try { return (views()[i] && viewName(i)) || bibleAbbr() || 'Bible'; } catch (e) { return 'Bible'; } },
    label: i => { const r = par.ref(i), k = bookOf(r.b); return k ? `${k.name} ${r.c}` : ''; },
    linked: i => { const v = views()[i]; return !v || v.linked !== false; },
    // the pane a selector belongs to becomes the one that moves and changes Bible
    focus: i => { if (par.on() && i != null && i !== state.active && views()[i] && window.setActiveView) setActiveView(i); }
  };

  /* the place labels show the whole book name: a name too long for its space gets a smaller font (down to a floor), never cut */
  const FIT = [['.a-chrome .lab span', 13], ['.b-big h2 span', 18], ['.c-rail .ref span:last-child', 18], ['.pdiv .pd-ref span', 13]];
  function fitLabels() {
    for (const [s, min] of FIT) document.querySelectorAll(s).forEach(e => {
      e.style.fontSize = ''; if (!e.getClientRects().length) return;
      const max = parseFloat(getComputedStyle(e).fontSize);
      for (let k = 0; k < 3 && e.scrollWidth > e.clientWidth + 1; k++) {
        const now = parseFloat(getComputedStyle(e).fontSize); const nx = Math.max(min, Math.floor(now * e.clientWidth / e.scrollWidth * 10) / 10 - .2);
        if (nx >= now) break; e.style.fontSize = nx + 'px';
      }
      if (parseFloat(getComputedStyle(e).fontSize) >= max) e.style.fontSize = '';
    });
  }
  window.addEventListener('resize', () => requestAnimationFrame(fitLabels));
  window.PUI = { fitLabels, par, pushBack, dropBack, $, $$, ic, esc, flash, rn, bookOf, chapterTitle, bibleAbbr, activeBible, sheet, closeSheet, pushPage, popPage, clearPages, pageCount, borrow, decorate, decorateAll, verseOf, markVerse,
    act, HL, lastColor, setLastColor, verseSheet, formatFor, commentaryCards, commentarySheet, dictCards, wordSheet, wordPop, wordPopClose, xrefList, xrefSheet, compareSheet, bookmarkSheet,
    goSheetGrid, goSheetList, chooseBible, viewAction, readingSheet, libraryInto, library, openModule, feedPage, searchInto, search, fullPanel, studyInto, studySection,
    highlightsPage, devotionals, studyPage, readAloudInto, readAloudPage, helpSheet, modulesSheet, ttsInfo, ttsProgress, H, wordOf, recents, counts, debounce, text };
})();
