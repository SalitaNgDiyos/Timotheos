'use strict';
/* The three phone screens, chosen at start-up on Android: A Quiet Reader, B Clear Tabs, C Study Desk.
 * A screen is a skin over the same panels and features: colours, a finer icon set, and its own way to reach things (bars, tabs,
 * drawers). It is chosen for this session; the picker is shown again at each start and from More → "Change screen". */
/* global TimotheosIcons, TimotheosPhone, TimotheosDock, TimotheosNav, TimotheosSkinIcons, state, openTab, go, refName, runCommand */
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement;
  const SK = {
    a: { name: 'Quiet Reader', dark: true, line: 'Only the text. Everything else is one tap away.' },
    b: { name: 'Clear Tabs', dark: false, line: 'Five tabs at the bottom. Familiar and easy to learn.' },
    c: { name: 'Study Desk', dark: true, line: 'Drawers from the edges, a command bar, a split pane.' }
  };
  let cur = null, timer = 0;
  const ic = (n, s = 22) => (window.TimotheosIcons ? TimotheosIcons.icon(n, s) : '');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* no storage */ } };
  const refLabel = () => { try { return typeof refName === 'function' && state && state.ref ? refName(state.ref) : 'Timotheos'; } catch (e) { return 'Timotheos'; } };
  const phoneState = () => (window.TimotheosPhone ? { cur: TimotheosPhone.current(), groups: TimotheosPhone.groups() } : { cur: null, groups: [] });
  const onBible = () => { const s = phoneState(); const g = s.groups.find(x => x.id === s.cur); return !g || g.bv; };
  const activeBv = () => $('.dgroup.pactive.isbv, .dgroup.pbase.isbv') || $('.dgroup.pactive');

  /* ---------------- things every screen can reach ---------------- */
  function page(id) { try { if (typeof openTab === 'function') openTab(id, true); else if (window.TimotheosDock) TimotheosDock.show(id); } catch (e) { /* panel missing */ } TimotheosPhone.show(id); setTimeout(() => TimotheosPhone.show(id), 80); }
  function dcapBtn(act) {
    const g = $('.dgroup.isbv.pactive') || $('.dgroup.pactive'); const b = g && g.querySelector(`.dcap [data-act="${act}"]`);
    if (b && act === 'skin') { root.classList.add('sk-showcap'); setTimeout(() => root.classList.remove('sk-showcap'), 9000); }
    if (b) b.click(); return !!b;
  }
  function navBtn(n) { const g = $('.dgroup.isbv.pactive, .dgroup.isbv.pbase') || $('.dgroup.isbv'); const b = g && g.querySelector(`.dcap [data-nav="${n}"]`); if (b) b.click(); return !!b; }
  /** a panel as a drawer over the page you are on (the page itself stays where it is) */
  function drawer(id, side) {
    const keep = TimotheosPhone.current();
    try { if (typeof openTab === 'function') openTab(id, false); } catch (e) { /* panel missing */ }
    TimotheosPhone.show(keep); TimotheosPhone.overlay(id, side); refresh();
  }
  function readAloud() { const b = $('.bv .bvspeak, .bvside .bvspeak'); if (b) b.click(); else if (window.TimotheosOptions) TimotheosOptions.open('speech'); }
  function openBook() { const a = $('#skTitle') || document.body; if (window.TimotheosNav) TimotheosNav.openNavPopover('book', a); }
  const CMDS = [
    ['Go to', [
      ['Books & chapters', 'tree', () => page('tree'), 'books bible tree'], ['Commentary', 'commentary', () => page('cmt'), 'notes'],
      ['Library', 'library', () => page('lib'), 'dictionary modules topics'], ['Bible search', 'search', () => page('search'), 'find words'],
      ['Book search', 'book', () => page('bsearch'), 'find in books'], ['My Study', 'study', () => page('study'), 'notes highlights bookmarks lists plans'],
      ['Go to reference', 'pin', () => openBook(), 'verse chapter jump goto'],
      ['Next verse', 'down', () => navBtn('nextVerse'), 'step'], ['Previous verse', 'up', () => navBtn('prevVerse'), 'step'],
      ['Next book', 'nextBook', () => navBtn('nextBook'), 'step'], ['Previous book', 'prevBook', () => navBtn('prevBook'), 'step']]],
    ['Reading', [
      ['Read aloud', 'speaker', () => readAloud(), 'speech tts voice'], ['Read aloud settings', 'gear', () => runCommand('voices'), 'voices language volume pitch tempo'],
      ['Split screen', 'split', () => splitChooser(), 'parallel compare beside two'], ['Copy verses…', 'copy', () => runCommand('copyVerses'), 'copy clipboard'], ['Daily readings', 'study', () => runCommand('daily'), 'plan'],
      ['Text smaller', 'textDown', () => dcapBtn('zoom-'), 'font size'], ['Text larger', 'textUp', () => dcapBtn('zoom+'), 'font size'],
      ['Panel colours & font', 'palette', () => dcapBtn('skin'), 'colours fonts tab name'], ['Print', 'print', () => runCommand('print'), 'chapter']]],
    ['Modules & files', [
      ['Import modules…', 'import', () => runCommand('import'), 'theword esword'], ['Add module folder…', 'folder', () => runCommand('addFolder'), ''],
      ['Rescan modules', 'refresh', () => runCommand('rescan'), ''], ['Imported modules folder', 'folder', () => runCommand('modulesFolder'), ''],
      ['New user module…', 'plus', () => runCommand('newUserMod'), 'commentary dictionary'], ['Export topics…', 'import', () => runCommand('exportTopics'), ''],
      ['Print library topic', 'print', () => runCommand('printTopic'), ''], ['Clipboard monitor', 'copy', () => runCommand('clipmon'), '']]],
    ['Settings & help', [
      ['Options', 'gear', () => runCommand('options'), 'fonts colours skins shortcuts modules'], ['Reset panel layout', 'layout', () => runCommand('resetLayout'), ''],
      ['Keyboard shortcuts', 'keyboard', () => runCommand('keys'), ''], ['User guide', 'book', () => runCommand('guide'), 'help'],
      ['About Timotheos', 'info', () => runCommand('about'), 'version'], ['Change screen', 'grid', () => picker(true), 'skin ui quiet reader clear tabs study desk']]]
  ];
  const flat = () => CMDS.flatMap(([g, items]) => items.map(i => ({ g, label: i[0], icon: i[1], run: i[2], kw: i[3] })));

  /* ---------------- sheets ---------------- */
  function closeSheet() { const w = $('#skSheetWrap'); if (w) { w.classList.remove('in'); setTimeout(() => w.remove(), 160); } }
  function sheet(html, cls) {
    const old = $('#skSheetWrap'); if (old) old.remove();
    const w = document.createElement('div'); w.id = 'skSheetWrap'; w.className = 'sk-sheetwrap ' + (cls || '');
    w.innerHTML = `<div class="sk-scrim"></div><div class="sk-sheet"><div class="sk-grab"></div>${html}</div>`;
    document.body.appendChild(w); w.querySelector('.sk-scrim').onclick = closeSheet; requestAnimationFrame(() => w.classList.add('in'));
    return w.querySelector('.sk-sheet');
  }
  function more() {
    const s = sheet(`<div class="sk-field">${ic('search', 18)}<input id="skMoreQ" type="search" placeholder="Find a feature…" autocomplete="off" spellcheck="false"></div><div id="skMoreBody"></div>`, 'more');
    const fill = q => {
      q = q.trim().toLowerCase();
      s.querySelector('#skMoreBody').innerHTML = CMDS.map(([g, items]) => {
        const its = items.filter(i => !q || (i[0] + ' ' + i[3]).toLowerCase().includes(q)); if (!its.length) return '';
        return `<h4>${g}</h4><div class="sk-tiles">${its.map(i => `<button type="button" data-k="${esc(i[0])}">${ic(i[1], 24)}<span>${esc(i[0])}</span></button>`).join('')}</div>`;
      }).join('') || '<p class="sk-none">Nothing matches.</p>';
    };
    fill(''); const q = s.querySelector('#skMoreQ'); q.oninput = () => fill(q.value);
    s.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const c = flat().find(x => x.label === b.dataset.k); closeSheet(); if (c) setTimeout(c.run, 120); });
  }

  /* ---------------- chrome ---------------- */
  function chrome() {
    $$('#skTop, #skTabs, #skCap, #skDock, #skDiv, #skDrawerTabs').forEach(n => n.remove());
    const mk = (id, html) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    const btn = (a, icon, t, cls = '') => `<button type="button" class="sk-ib ${cls}" data-a="${a}" title="${t}" aria-label="${t}">${ic(icon, 22)}</button>`;
    const hist = btn('back', 'back', 'Back to the previous screen') + btn('fwd', 'forward', 'Forward to the next screen');
    if (cur === 'a') {
      mk('skTop', hist + '<span class="grow"></span>' + btn('search', 'search', 'Search') + btn('more', 'grid', 'More'));
      mk('skCap', `<button type="button" class="cap-ref" data-a="book" id="skTitle"><span id="skRef"></span></button><button type="button" class="cap-read" data-a="read" title="Read aloud" aria-label="Read aloud">${ic('speaker', 22)}</button>`);
    } else if (cur === 'b') {
      mk('skTop', hist + `<button type="button" class="sk-title" data-a="book" id="skTitle"><span id="skRef"></span>${ic('down', 16)}</button><button type="button" class="sk-chip" data-a="parallel" id="skPar">${ic('panels', 16)}Parallel</button>` + btn('search', 'search', 'Search'));
      mk('skTabs', [['read', 'read', 'Read'], ['lib', 'library', 'Library'], ['search', 'search', 'Search'], ['study', 'study', 'Study'], ['more', 'grid', 'More']].map(([k, i, l]) => `<button type="button" data-t="${k}">${ic(i, 24)}<span>${l}</span></button>`).join(''));
    } else {
      mk('skTop', btn('nav', 'sidebar', 'Books & chapters') + `<button type="button" class="sk-title" data-a="book" id="skTitle"><span id="skRef"></span>${ic('down', 16)}</button>` + hist + btn('cmd', 'cmd', 'Command bar'));
      mk('skDock', btn('nav', 'sidebar', 'Books & chapters', 'dk') + btn('study', 'drawerR', 'Commentary, library and notes', 'dk') + btn('split', 'split', 'Split screen', 'dk') + '<span class="sep"></span>' + btn('read', 'speaker', 'Read aloud', 'dk') + btn('quick', 'tune', 'Quick settings', 'dk') + btn('more', 'grid', 'More', 'dk'));
      mk('skDrawerTabs', ['cmt:Commentary', 'lib:Library', 'study:My Study'].map(t => { const [i, l] = t.split(':'); return `<button type="button" data-d="${i}">${l}</button>`; }).join(''));
    }
    mk('skDiv', '<i></i>');
    $$('#skTop, #skTabs, #skCap, #skDock, #skDrawerTabs, #skDiv').forEach(n => n.classList.add('sk'));
    refresh();
  }
  function refresh() {
    if (!cur) return;
    const r = $('#skRef'); if (r) r.textContent = onBible() || cur !== 'a' ? refLabel() : 'Back to reading';
    const gb = $('#gBack'), gf = $('#gFwd');
    $$('#skTop [data-a="back"]').forEach(b => { b.disabled = !gb || gb.disabled; });
    $$('#skTop [data-a="fwd"]').forEach(b => { b.disabled = !gf || gf.disabled; });
    root.classList.toggle('sk-bible', onBible());
    const s = phoneState(), o = window.TimotheosPhone && TimotheosPhone.over();
    $$('#skTabs [data-t]').forEach(b => {
      const k = b.dataset.t; const on = (k === 'read' && onBible()) || (k !== 'more' && k !== 'read' && s.cur === k);
      b.classList.toggle('on', !!on);
    });
    $$('#skDrawerTabs [data-d]').forEach(b => b.classList.toggle('on', !!o && o.id === b.dataset.d));
    root.dataset.drawer = o ? o.side : '';
    const sp = window.TimotheosPhone && TimotheosPhone.splitId(); const par = $('#skPar'); if (par) par.classList.toggle('on', !!sp);
    $$('#skDock [data-a="split"]').forEach(b => b.classList.toggle('on', !!sp));
    $$('#skDock [data-a="study"]').forEach(b => b.classList.toggle('on', !!o && o.side === 'r'));
    $$('#skDock [data-a="nav"], #skTop [data-a="nav"]').forEach(b => b.classList.toggle('on', !!o && o.side === 'l'));
    positionDiv();
  }

  function split(id) { TimotheosPhone.split(id); setTimeout(() => { refresh(); positionDiv(); }, 60); }
  function otherBibleId() { const s = phoneState(); const g = s.groups.find(x => x.bv && x.id !== s.cur); return g ? g.id : null; }
  function parallel() {
    if (TimotheosPhone.splitId()) return split(null);
    split(otherBibleId() || 'cmt');                                   // a second Bible view if one is open, else the commentary
  }
  function splitChooser() {
    if (TimotheosPhone.splitId()) return split(null);
    const s = sheet(`<h4>Open beside the text</h4><div class="sk-tiles">${[['bible', 'Parallel Bible', 'par'], ['commentary', 'Commentary', 'cmt'], ['library', 'Library', 'lib'], ['search', 'Search', 'search']].map(([i, l, k]) => `<button type="button" data-s="${k}">${ic(i, 24)}<span>${l}</span></button>`).join('')}</div>`);
    s.addEventListener('click', e => { const b = e.target.closest('[data-s]'); if (!b) return; closeSheet(); if (b.dataset.s === 'par') parallel(); else { const keep = TimotheosPhone.current(); try { if (typeof openTab === 'function') openTab(b.dataset.s, false); } catch (x) { /* panel missing */ } TimotheosPhone.show(keep); split(b.dataset.s); } });
  }
  function positionDiv() {
    const d = $('#skDiv'); const on = root.classList.contains('psplitting'); if (!d) return;
    d.style.display = on ? 'grid' : 'none';
  }
  function wireDiv() {
    document.addEventListener('pointerdown', e => {
      const d = e.target.closest('#skDiv'); if (!d) return; e.preventDefault(); d.setPointerCapture(e.pointerId);
      const mv = ev => { const r = $('#workbench').getBoundingClientRect(); const top = parseFloat(getComputedStyle(root).getPropertyValue('--sk-top')) || 0; const bot = parseFloat(getComputedStyle(root).getPropertyValue('--sk-bot')) || 0; const h = r.height - top - bot; const f = Math.max(.2, Math.min(.8, (ev.clientY - r.top - top) / h)); root.style.setProperty('--sk-sp', f.toFixed(3)); };
      d.addEventListener('pointermove', mv); const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); d.removeEventListener('pointercancel', up); }; d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    });
  }

  /* command bar (Study Desk) */
  function commandBar() {
    const s = sheet(`<div class="sk-field">${ic('cmd', 18)}<input id="skCmdQ" type="text" placeholder="Verse, book or command" autocomplete="off" spellcheck="false" enterkeyhint="go"></div><div id="skCmdBody"></div>`, 'cmdbar');
    const q = s.querySelector('#skCmdQ'), body = s.querySelector('#skCmdBody');
    const fill = () => {
      const t = q.value.trim().toLowerCase(); let h = '';
      if (t) {
        const books = (state.nav || []).filter(b => b.name.toLowerCase().startsWith(t) || (b.abbr && String(b.abbr).toLowerCase() === t)).slice(0, 4);
        h += books.map(b => `<button type="button" class="pr" data-bk="${b.id}">${ic('book', 20)}<span>${esc(b.name)}</span><small>book</small></button>`).join('');
        h += `<button type="button" class="pr go" data-ref="1">${ic('pin', 20)}<span>Go to “${esc(q.value.trim())}”</span><small>↵</small></button>`;
      }
      const cs = flat().filter(c => !t || (c.label + ' ' + c.kw).toLowerCase().includes(t)).slice(0, t ? 8 : 12);
      h += cs.map(c => `<button type="button" class="pr" data-k="${esc(c.label)}">${ic(c.icon, 20)}<span>${esc(c.label)}</span><small>${esc(c.g)}</small></button>`).join('');
      body.innerHTML = h;
    };
    const goRef = () => { const f = $('#refForm'), i = $('#refInput'); if (!f || !i) return; i.value = q.value.trim(); closeSheet(); f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); TimotheosPhone.show(phoneState().groups.find(x => x.bv).id); };
    q.oninput = fill; q.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const first = body.querySelector('.pr'); if (first && first.dataset.bk) first.click(); else if (q.value.trim()) goRef(); } };
    body.addEventListener('click', e => {
      const b = e.target.closest('.pr'); if (!b) return;
      if (b.dataset.bk) { closeSheet(); go({ b: +b.dataset.bk, c: 1, v: 1 }); }
      else if (b.dataset.ref) goRef();
      else { const c = flat().find(x => x.label === b.dataset.k); closeSheet(); if (c) setTimeout(c.run, 120); }
    });
    fill(); setTimeout(() => q.focus(), 200);
  }
  function quick() {
    const s = sheet(`<h4>Quick settings</h4><div class="sk-tiles q4">${[['Text smaller', 'textDown'], ['Text larger', 'textUp'], ['Read aloud', 'speaker'], ['Voices', 'gear'], ['Colours', 'palette'], ['Options', 'gear'], ['Copy…', 'copy'], ['Search', 'search']].map(([l, i]) => `<button type="button" data-q="${l}">${ic(i, 24)}<span>${l}</span></button>`).join('')}</div>`, 'quick');
    s.addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (!b) return; const l = b.dataset.q; if (l !== 'Text smaller' && l !== 'Text larger') closeSheet();
      if (l === 'Text smaller') dcapBtn('zoom-'); else if (l === 'Text larger') dcapBtn('zoom+'); else if (l === 'Read aloud') readAloud(); else if (l === 'Voices') runCommand('voices');
      else if (l === 'Colours') setTimeout(() => dcapBtn('skin'), 150); else if (l === 'Options') runCommand('options'); else if (l === 'Copy…') runCommand('copyVerses'); else if (l === 'Search') page('search');
    });
  }

  /* ---------------- actions ---------------- */
  document.addEventListener('click', e => {
    if (root.classList.contains('pdrawer') && !e.target.closest('.dgroup.pover, #skDrawerTabs, #skSheetWrap, #ctxMenu, .menu, #modal, #navPop')) { e.preventDefault(); e.stopPropagation(); TimotheosPhone.overlay(null); refresh(); return; }
    const t = e.target.closest('#skTabs [data-t]');
    if (t) { const k = t.dataset.t; if (k === 'more') return more(); if (k === 'read') { TimotheosPhone.split(null); const b = phoneState().groups.find(x => x.bv); return TimotheosPhone.show(b ? b.id : 'bv0'); } return page(k); }
    const dt = e.target.closest('#skDrawerTabs [data-d]'); if (dt) return drawer(dt.dataset.d, 'r');
    const a = e.target.closest('.sk [data-a]'); if (!a) return; const k = a.dataset.a;
    if (k === 'back') { const b = $('#gBack'); if (b && !b.disabled) b.click(); }
    else if (k === 'fwd') { const b = $('#gFwd'); if (b && !b.disabled) b.click(); }
    else if (k === 'search') page('search');
    else if (k === 'more') more();
    else if (k === 'book') { if (!onBible()) { const b = phoneState().groups.find(x => x.bv); TimotheosPhone.show(b ? b.id : 'bv0'); } else openBook(); }
    else if (k === 'read') readAloud();
    else if (k === 'parallel') parallel();
    else if (k === 'split') splitChooser();
    else if (k === 'cmd') commandBar();
    else if (k === 'quick') quick();
    else if (k === 'nav') { const o = TimotheosPhone.over(); if (o && o.side === 'l') TimotheosPhone.overlay(null); else drawer('tree', 'l'); refresh(); }
    else if (k === 'study') { const o = TimotheosPhone.over(); if (o && o.side === 'r') TimotheosPhone.overlay(null); else drawer('cmt', 'r'); refresh(); }
  }, true);

  /* Quiet Reader: a tap on the text shows or hides the bars; a long press on a verse opens its menu (copy, highlight, note, cross-references…) */
  function wireTouch() {
    let lp = null, sx = 0, sy = 0, fired = false, edge = null;
    document.addEventListener('touchstart', e => {
      if (!cur || e.touches.length !== 1) return; const t = e.touches[0]; sx = t.clientX; sy = t.clientY; fired = false;
      edge = cur === 'c' && !$('#skSheetWrap') && (sx < 22 ? 'l' : sx > innerWidth - 22 ? 'r' : null);
      const v = e.target.closest && e.target.closest('.bvtext [data-v]');
      if (v && !e.target.closest('a, button, input, [data-strong]')) { clearTimeout(lp); lp = setTimeout(() => { fired = true; const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: sx, clientY: sy }); v.dispatchEvent(ev); }, 520); }
    }, { passive: true });
    document.addEventListener('touchmove', e => { const t = e.touches[0]; if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) clearTimeout(lp); }, { passive: true });
    document.addEventListener('touchend', e => {
      clearTimeout(lp); const t = e.changedTouches[0];
      if (edge && Math.abs(t.clientY - sy) < 60) { const dx = t.clientX - sx; if (edge === 'l' && dx > 60) drawer('tree', 'l'); if (edge === 'r' && dx < -60) drawer('cmt', 'r'); }
      edge = null;
    }, { passive: true });
    document.addEventListener('click', e => {
      if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); return; }
      if (cur !== 'a') return;
      const tx = e.target.closest && e.target.closest('.bvtext'); if (!tx || e.target.closest('a, button, input, .unote, .noteicon, [data-strong], sup')) return;
      if (String(window.getSelection && window.getSelection()).trim()) return;
      root.classList.toggle('sk-chrome');
    }, true);
  }

  /* ---------------- choosing ---------------- */
  function apply(k) {
    cur = k; ['a', 'b', 'c'].forEach(x => root.classList.toggle('sk-' + x, x === k)); root.classList.add('sk'); root.classList.remove('sk-chrome');
    root.dataset.theme = SK[k].dark ? 'dark' : 'light'; root.dataset.ui = k;
    if (window.TimotheosSkinIcons) TimotheosSkinIcons.install();
    TimotheosPhone.split(null); TimotheosPhone.overlay(null);
    chrome(); lsSet('tw.ui', k);
    try { sessionStorage.setItem('tw.ui', k); } catch (e) { /* */ }
    clearInterval(timer); timer = setInterval(refresh, 300);
    window.dispatchEvent(new Event('resize'));
  }
  const MINI = {
    a: '<div class="mp a"><i class="t"></i><i class="t s"></i><i class="t"></i><i class="t s"></i><i class="t"></i><b class="cap"></b></div>',
    b: '<div class="mp b"><u class="bar"></u><i class="t"></i><i class="t s"></i><i class="t"></i><i class="t s"></i><span class="tabs"><em></em><em class="on"></em><em></em><em></em><em></em></span></div>',
    c: '<div class="mp c"><u class="bar"></u><i class="t"></i><i class="t s"></i><i class="t"></i><s class="dr"></s><b class="dock"></b></div>'
  };
  function picker(again) {
    const old = $('#skPick'); if (old) old.remove(); closeSheet();
    const last = lsGet('tw.ui');
    const d = document.createElement('div'); d.id = 'skPick';
    d.innerHTML = `<div class="skp-in"><h1>Timotheos</h1><p class="skp-sub">Choose how the app looks and works for this session.</p><div class="skp-cards">${['a', 'b', 'c'].map(k => `<button type="button" class="skp-card" data-k="${k}">${MINI[k]}<span class="skp-t">${SK[k].name}${last === k ? '<em>last time</em>' : ''}</span><span class="skp-d">${SK[k].line}</span></button>`).join('')}</div><p class="skp-foot">All three have the same features. You can change this later in More → Change screen.</p>${again ? '<button type="button" class="skp-x" data-k="">Keep the current screen</button>' : ''}</div>`;
    document.body.appendChild(d);
    d.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const k = b.dataset.k; d.classList.add('out'); setTimeout(() => d.remove(), 220); if (k) apply(k); });
    return d;
  }
  function init() {
    wireDiv(); wireTouch();
    if (!root.classList.contains('mobile')) return;
    picker(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.TimotheosSkins = { picker, apply, current: () => cur, more, commandBar, quick, parallel, closeSheet };
})();
