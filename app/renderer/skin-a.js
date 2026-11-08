'use strict';
/* Screen A · Quiet Reader: only the text and one floating capsule. A tap shows Back · Forward · Search · More; a swipe turns the
 * chapter; the capsule opens Book → Chapter → Verse; hold a verse for its tools; tap a word for its dictionary entry;
 * More holds everything else; reading aloud turns the capsule into a player. */
/* global PUI, state, views, go, step, runCommand, TimotheosSpeech, TimotheosStudy, TimotheosPhone */
(function () {
  const P = () => window.PUI; let ac = null, hideT = 0, els = [];
  const root = document.documentElement;
  function el(cls, html) { const d = document.createElement('div'); d.className = cls + ' skel'; d.innerHTML = html; document.body.appendChild(d); els.push(d); return d; }
  const ib = (a, i, t, cls = '') => `<button type="button" class="pib ${cls}" data-a="${a}" aria-label="${t}" title="${t}">${P().ic(i, 22)}</button>`;

  function showChrome(on, auto = true) {
    root.classList.toggle('a-show', on); clearTimeout(hideT);
    if (on && auto) hideT = setTimeout(() => { root.classList.remove('a-show'); P().fitLabels(); }, 5000);
    P().fitLabels();
  }
  // the big chapter title has scrolled under the strip: the strip shows the place in one line
  function compact() {
    let on = false;
    if (!root.classList.contains('psplitting')) {
      const t = document.querySelector(`#workbench .bv[data-i="${P().par.top()}"] .bvtext .sk-ttl`) || document.querySelector('#workbench .bv .bvtext .sk-ttl'), ch = document.querySelector('.a-chrome');
      if (t && ch) { const r = t.getBoundingClientRect(); on = r.height > 0 && r.bottom < ch.getBoundingClientRect().bottom + 2; }
    }
    root.classList.toggle('a-compact', on); P().fitLabels();
  }
  function refresh() {
    const p = P(); const k = p.bookOf(state.ref.b); if (!k) return;
    // the one-line place label of the top strip (shown once the big title has scrolled away)
    const ti = p.par.top(), lt = document.querySelector('.a-chrome .lab span'), lb = p.par.label(ti) || `${k.name} ${state.ref.c}`; if (lt && lt.textContent !== lb) lt.textContent = lb;
    const ae = document.querySelector('.a-chrome .lab em'), an = p.par.abbr(ti); if (ae && ae.textContent !== an) ae.textContent = an;
    compact();
    const tts = p.ttsInfo(); const caps = document.querySelector('.a-caps'); if (!caps) return;
    caps.classList.toggle('playing', !!tts.busy);
    const ref = caps.querySelector('.ref'); ref.textContent = tts.busy ? (tts.label || p.rn(state.ref)) : p.rn(state.ref).replace(/^(\S+(?: \S+)??) (\d+):(\d+)$/, (m) => m);
    const pz = caps.querySelector('[data-a="pause"]'); if (pz) pz.innerHTML = p.ic(tts.paused ? 'play' : 'pause', 22);
    const pr = caps.querySelector('.prog i'); if (pr) pr.style.transform = `scaleX(${p.ttsProgress()})`;
    const gb = document.getElementById('gBack'), gf = document.getElementById('gFwd');
    const b = document.querySelector('.a-chrome [data-a="back"]'), f = document.querySelector('.a-chrome [data-a="fwd"]');
    if (b) b.disabled = !gb || gb.disabled; if (f) f.disabled = !gf || gf.disabled;
  }

  const TILES = [['library', 'Library', 'Books, dictionaries', () => P().library()], ['search', 'Bible search', 'Words, phrases, G/H', () => P().search()], ['lexicon', 'Book search', 'Every library book', () => P().search({ mode: 'books' })],
    ['commentary', 'Commentary', 'Single or all', () => P().commentarySheet({ ...state.ref })], ['study', 'My Study', 'Notes, lists, marks', () => P().studyPage()], ['compare', 'Parallel views', 'Bibles side by side', () => window.TimotheosSkins.parallel()],
    ['copy', 'Copy verses', 'Ranges & formats', () => TimotheosStudy.copyDialog()], ['calendar', 'Daily readings', 'Plans, devotionals', () => P().studySection('plans')], ['speaker', 'Read aloud', 'Voices, repeat', () => readNow()],
    ['import', 'Modules', 'Import, folders', () => P().modulesSheet()], ['tune', 'Options', 'Skins, fonts, layout', () => runCommand('options')], ['guide', 'Help', 'Guide, shortcuts', () => P().helpSheet()]];
  const PILLS = [['text', 'Reading view', () => P().readingSheet()], ['gear', 'Read aloud settings', () => P().readAloudPage()], ['print', 'Print', () => runCommand('print')], ['clipboard', 'Clipboard monitor', () => runCommand('clipmon')],
    ['layers', 'Layouts', () => layouts()], ['bookmark', 'Bookmarks', () => P().studySection('marks')], ['highlight', 'Highlights', () => P().highlightsPage()], ['note', 'My notes', () => P().studySection('notes')],
    ['import', 'Export topics', () => runCommand('exportTopics')], ['print', 'Print library topic', () => runCommand('printTopic')], ['plus', 'New user module', () => runCommand('newUserMod')], ['keyboard', 'Shortcuts', () => runCommand('keys')],
    ['info', 'About', () => runCommand('about')], ['grid', 'Change screen', () => window.TimotheosSkins.picker(true)]];
  function layouts() { const s = P().sheet(`<div class="rows"><button type="button" class="prr" data-x="par">${P().ic('compare', 20)}<span>Two Bibles, one above the other</span></button><button type="button" class="prr" data-x="reset">${P().ic('layout', 20)}<span>Reset panel layout</span></button><button type="button" class="prr" data-x="screen">${P().ic('grid', 20)}<span>Change screen</span><small>Quiet Reader · Clear Tabs · Study Desk</small></button></div>`, { title: 'Layouts' });
    s.onclick = e => { const x = e.target.closest('[data-x]'); if (!x) return; P().closeSheet(); if (x.dataset.x === 'par') window.TimotheosSkins.parallel(); if (x.dataset.x === 'reset') runCommand('resetLayout'); if (x.dataset.x === 'screen') window.TimotheosSkins.picker(true); }; }
  function more() {
    const p = P();
    const s = p.sheet(`<label class="pfield">${p.ic('search', 19)}<input type="search" class="mq" placeholder="Search verses, books, commands…" autocomplete="off" spellcheck="false" enterkeyhint="search"></label>
      <div class="ptiles">${TILES.map(([i, l, d], k) => `<button type="button" class="ptile" data-t="${k}">${p.ic(i, 24)}<div>${l}<small>${d}</small></div></button>`).join('')}</div>
      <div class="grp">File · View · Help</div><div class="pills">${PILLS.map(([i, l], k) => `<button type="button" class="pill" data-p="${k}">${p.ic(i, 16)} ${l}</button>`).join('')}</div>`, { cls: 'more tall', height: '92vh' });
    const q = s.querySelector('.mq');
    q.oninput = () => { const t = q.value.trim().toLowerCase(); s.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('hide', !!t && !b.textContent.toLowerCase().includes(t))); s.querySelectorAll('[data-p]').forEach(b => { b.style.display = !t || b.textContent.toLowerCase().includes(t) ? '' : 'none'; }); };
    q.onkeydown = async e => { if (e.key !== 'Enter') return; e.preventDefault(); const t = q.value.trim(); if (!t) return; const r = await window.api.parseRef(t).catch(() => null); p.closeSheet(); if (r && r.b) go({ b: r.b, c: r.c || 1, v: r.v || 1 }); else p.search({ q: t }); };
    s.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { p.closeSheet(); setTimeout(TILES[+t.dataset.t][3], 120); return; }
      const pl = e.target.closest('[data-p]'); if (pl) { p.closeSheet(); setTimeout(PILLS[+pl.dataset.p][2], 120); }
    });
  }
  function readNow() {
    const S = TimotheosSpeech; if (S.isSpeaking()) { S.stop(); return; }
    S.speakView(state.active, null);
  }
  function onTap(x, w, e) {
    const p = P();
    if (x && w && w.word && (w.strongs.length || /\p{L}{2,}/u.test(w.word))) {
      document.querySelectorAll('.pwordon').forEach(z => z.classList.remove('pwordon')); if (w.el) w.el.classList.add('pwordon');
      showChrome(false); return p.wordSheet(w);
    }
    showChrome(!root.classList.contains('a-show'));
  }
  function onHold(x, w) { showChrome(false); P().verseSheet(x, w); }

  function mount() {
    ac = new AbortController(); const sig = { signal: ac.signal }; const p = P();
    el('a-chrome', ib('back', 'back', 'Back to the previous screen') + ib('fwd', 'fwd', 'Forward to the next screen') + `<div class="mid"><button type="button" class="lab" data-a="lab" title="Go to a book or chapter"><span></span><em title="Choose the Bible"></em></button></div>` + ib('search', 'search', 'Search') + ib('more', 'more', 'More'));
    el('a-fade', '');
    el('a-caps', `<button type="button" class="pib" data-a="prevc" data-r aria-label="Previous chapter">${p.ic('chevL', 22)}</button><button type="button" class="pib" data-a="prevv" data-p aria-label="Previous verse">${p.ic('prevv', 21)}</button><button type="button" class="pib gold" data-a="pause" data-p aria-label="Pause">${p.ic('pause', 22)}</button><button type="button" class="pib" data-a="nextv" data-p aria-label="Next verse">${p.ic('nextv', 21)}</button><span class="sep" data-p></span>`
      + `<button type="button" class="ref" data-a="go">John 3:16</button><button type="button" class="pib" data-a="nextc" data-r aria-label="Next chapter">${p.ic('chevR', 22)}</button><span class="sep" data-r></span><button type="button" class="pib gold" data-a="read" data-r aria-label="Read aloud">${p.ic('speaker', 22)}</button><button type="button" class="pib" data-a="stop" data-p aria-label="Stop">${p.ic('stop', 20)}</button><div class="prog"><i></i></div>`);
    document.addEventListener('click', e => {
      const b = e.target.closest('.skel [data-a]'); if (!b) return; const a = b.dataset.a; e.stopPropagation();
      if (a === 'lab') { showChrome(false); return e.target.closest('em') ? TimotheosSkins.bible(p.par.top()) : TimotheosSkins.place(p.par.top()); }
      if (b.closest('.a-chrome')) showChrome(true);
      if (a === 'back') { const g = document.getElementById('gBack'); if (g && !g.disabled) g.click(); }
      else if (a === 'fwd') { const g = document.getElementById('gFwd'); if (g && !g.disabled) g.click(); }
      else if (a === 'go') { if (p.ttsInfo().busy && b.classList.contains('ref')) return; showChrome(false); p.goSheetGrid(); }
      else if (a === 'search') { showChrome(false); p.search(); }
      else if (a === 'more') { showChrome(false); more(); }
      else if (a === 'prevc') step(-1); else if (a === 'nextc') step(1);
      else if (a === 'read') readNow();
      else if (a === 'pause' || a === 'stop') TimotheosSpeech.control(a);
      else if (a === 'prevv') TimotheosSpeech.control('prev'); else if (a === 'nextv') TimotheosSpeech.control('next');
      refresh();
    }, Object.assign({ capture: true }, sig));
    // scrolling back up shows the bar again, scrolling on hides it
    let lastY = new WeakMap();
    document.addEventListener('scroll', e => { const t = e.target; if (!t.classList || !t.classList.contains('bvtext')) return; const y = t.scrollTop, y0 = lastY.get(t) || 0; lastY.set(t, y); compact(); if (y < 30) return; if (Math.abs(y - y0) > 12 && root.classList.contains('a-show')) showChrome(false); }, Object.assign({ capture: true, passive: true }, sig));
    window.addEventListener('tw-tts', refresh, sig);
    P().H.tap = onTap; P().H.hold = onHold;
    // the big title and the translation label above it are the way to the Bible browser too
    P().H.title = (tt, tg) => { const sec = tt.closest('.bv'), i = sec ? +sec.dataset.i || 0 : undefined; showChrome(false); if (tg.closest('small')) TimotheosSkins.bible(i); else TimotheosSkins.place(i); return true; };
    showChrome(true);
  }
  function unmount() { if (ac) ac.abort(); ac = null; els.forEach(e => e.remove()); els = []; root.classList.remove('a-show', 'a-compact'); clearTimeout(hideT); }
  window.SkinA = { mount, unmount, refresh, more, showChrome };
})();
