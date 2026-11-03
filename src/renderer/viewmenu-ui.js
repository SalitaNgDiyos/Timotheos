'use strict';
/* The settings of one Bible view: the ☰ menu (what the view shows), the name of the view (click to choose a Bible,
 * double-click to rename), colour pickers for the text and the active verse, the highlighter and the underline pen.
 * Everything here belongs to one view, so several views keep their own looks side by side. */
/* global state, views, viewName, storeViews, ensurePanes, renderChapter, paneMenu, viewShow, effShow, toggleViewShow,
   setViewShowMany, setVerseNumbers, viewOptions, setBiblesDrawerOpen, setViews, ensureInfo, flashMsg, esc, TimotheosOptions,
   TimotheosStudy, TimotheosSpeech, TimotheosIcons */
(function () {
  const $ = s => document.querySelector(s);

  const HL_COLORS = [['yellow', '#fff09a'], ['green', '#c9f0c0'], ['blue', '#c8e2ff'], ['pink', '#ffd0e4'], ['orange', '#ffd8a8'], ['purple', '#e0ccff'], ['teal', '#b8ece8'], ['red', '#ffb3b3'], ['gray', '#d4d4d4']];
  const UL_STYLES = [['solid', 'Solid'], ['double', 'Double'], ['wavy', 'Wavy'], ['dotted', 'Dotted'], ['dashed', 'Dashed']];
  const UL_COLORS = [['red', '#c0392b'], ['blue', '#1f6fd1'], ['green', '#1e8a3e'], ['orange', '#d9822b'], ['purple', '#7b3fb3'], ['black', '#222222']];

  /** classes for the extra highlighter colours and every underline style/colour (the older yellow… stay in style.css) */
  function injectStyles() {
    let css = '';
    const dark = { purple: '#4b3478', teal: '#1d5a57', red: '#6d2a2a', gray: '#555555' };
    const light = { purple: '#e0ccff', teal: '#b8ece8', red: '#ffb3b3', gray: '#d4d4d4' };
    for (const k of Object.keys(light)) css += `.hl-${k}{background:${light[k]}}:root[data-theme="dark"] .hl-${k}{background:${dark[k]}}\n`;
    for (const [s] of UL_STYLES) for (const [c, hex] of UL_COLORS) css += `mark.hl-ul-${s}-${c}{background:transparent;text-decoration:underline ${s} 2px ${hex};text-underline-offset:3px}\n`;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }

  /* ---------------- the name of a view ---------------- */
  function rename(i, btn) {
    const v = views()[i]; if (!v) return;
    document.querySelectorAll('.bvmenu').forEach(m => m.remove());
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'bvrename'; inp.value = viewName(i); inp.maxLength = 40; inp.setAttribute('aria-label', 'Name of this Bible view');
    btn.hidden = true; btn.after(inp); inp.focus(); inp.select();
    let done = false;
    const finish = save => {
      if (done) return; done = true;
      if (save) setLabel(i, inp.value);
      inp.remove(); btn.hidden = false;
    };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('mousedown', e => e.stopPropagation());
  }
  function setLabel(i, text) {
    const v = views()[i]; if (!v) return;
    const inf = state.infos.get(v.bible); const t = String(text || '').trim();
    if (!t || (inf && t === inf.abbr)) delete v.label; else v.label = t;
    storeViews(); ensurePanes();
    if (window.TimotheosCompare) try { TimotheosCompare.render(); } catch (e) { /* not open */ }
  }

  /* ---------------- Bible chooser: opens on click or hover, stays while the mouse travels to it ---------------- */
  let openFor = null, leaveTimer = null;
  const keepOpen = () => clearTimeout(leaveTimer);
  function armClose(m) { clearTimeout(leaveTimer); leaveTimer = setTimeout(() => { const f = m.querySelector('input:focus'); if (!f) { m.remove(); openFor = null; } }, 550); }
  function bibleMenu(btn, i) {
    const v = views()[i]; if (!v) return;
    const list = state.modules.bibles.map(b => { const inf = state.infos.get(b.id); return `<button data-b="${esc(b.id)}" class="${b.id === v.bible ? 'on' : ''}"><b>${esc(inf ? inf.abbr : b.abbr)}</b> <span class="small">${esc(inf ? inf.title : b.name)}</span></button>`; }).join('');
    paneMenu(btn, `<div class="mh">Name of this view</div>
      <div class="bvname"><input type="text" class="bvnameinp" maxlength="40" value="${esc(viewName(i))}" placeholder="Name of this view" aria-label="Name of this Bible view"><button type="button" class="bvsave">Save</button><button type="button" class="bvreset" title="Back to the Bible's own abbreviation">Reset</button></div>
      <div class="mh">Bible of this view</div><div class="bvlist">${list}</div><div class="msep"></div><button type="button" class="bvm-open-drawer">📚 Open Bibles Drawer (side-by-side &amp; reorder)…</button>`, m => {
      m.classList.add('biblemenu'); openFor = btn;
      m.addEventListener('mouseenter', keepOpen); m.addEventListener('mouseleave', () => armClose(m));
      const inp = m.querySelector('.bvnameinp');
      const save = () => { setLabel(i, inp.value); m.remove(); openFor = null; };
      m.querySelector('.bvsave').onclick = save;
      m.querySelector('.bvreset').onclick = () => { setLabel(i, ''); m.remove(); openFor = null; };
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { m.remove(); openFor = null; } });
      const od = m.querySelector('.bvm-open-drawer'); if (od) od.onclick = () => { m.remove(); openFor = null; setBiblesDrawerOpen(true); };
      m.querySelectorAll('[data-b]').forEach(b => b.onclick = async () => {
        m.remove(); openFor = null; await ensureInfo(b.dataset.b);
        if (b.dataset.b !== v.bible) delete v.label; // a name you gave belongs to the Bible it was given for
        v.bible = b.dataset.b; await setViews([...views()]);
      });
    });
    // the menu sits right under the label: no gap to cross
    const m = document.querySelector('.bvmenu.biblemenu'); if (m) { const r = btn.getBoundingClientRect(); m.style.top = r.bottom + 'px'; m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 8) + 'px'; }
  }
  function wireBibleHover() {
    const host = $('#view'); let intent = null, over = null;
    host.addEventListener('mouseover', e => {
      const b = e.target.closest('.bvbible'); if (!b) return;
      keepOpen(); clearTimeout(intent); over = b;
      if (openFor === b) return;
      intent = setTimeout(() => { if (over === b && openFor !== b) bibleMenu(b, +b.closest('#view > .bv').dataset.i); }, 220);
    });
    host.addEventListener('mouseout', e => {
      const b = e.target.closest('.bvbible'); if (!b) return;
      clearTimeout(intent); over = null;
      const m = document.querySelector('.bvmenu.biblemenu'); if (m && !(e.relatedTarget && m.contains(e.relatedTarget))) armClose(m);
    });
    document.addEventListener('mousedown', e => { if (!e.target.closest('.bvmenu')) openFor = null; }, true);
  }

  /* ---------------- ☰ : what this view shows ---------------- */
  function mainMenu(btn, i) {
    const v = views()[i]; if (!v) return;
    const sh = viewShow(i); const ap = TimotheosOptions.appearance();
    const vnOn = (v.vnPos || ap.vnPos) !== 'hidden';
    const row = (id, label, on, kbd) => `<label><input type="checkbox" data-t="${id}"${on ? ' checked' : ''}> ${label}${kbd ? ` <kbd>${kbd}</kbd>` : ''}</label>`;
    paneMenu(btn, `<div class="mh">Shown in ${esc(viewName(i))}</div>
      ${row('sm', "Strong's and Morph", sh.strongs || sh.morph, 'S')}
      ${row('paragraph', 'Paragraph Mode', sh.paragraph, 'P')}
      ${row('woj', 'Words of Jesus', sh.woj, 'J')}
      ${row('footnotes', "Translator's Notes", sh.footnotes, 'F')}
      ${row('headings', 'Headings', sh.headings, 'H')}
      ${row('vnum', 'Verse numbers', vnOn, '')}
      <div class="msep"></div>
      <button type="button" data-t="opts">${TimotheosIcons.icon('gear', 14)} Options…</button>
      <div class="mh">More</div>
      ${row('lemma', 'Lemmas', sh.lemma, 'L')}
      ${row('columns', 'Intralinear View', sh.columns, 'Alt+I')}
      ${row('added', 'Added words in italics', sh.added, 'I')}
      ${row('xrefs', 'Cross-references', sh.xrefs, 'X')}
      <button type="button" data-t="speak">${TimotheosIcons.icon('speaker', 14)} Read this chapter aloud</button>`, m => {
      m.classList.add('mainmenu');
      m.addEventListener('change', e => {
        const t = e.target.dataset.t; if (!t) return;
        const on = e.target.checked;
        if (t === 'sm') setViewShowMany(i, { strongs: on, morph: on });
        else if (t === 'vnum') setVerseNumbers(i, on);
        else toggleViewShow(i, t, on);
      });
      m.addEventListener('click', e => {
        const b = e.target.closest('button[data-t]'); if (!b) return;
        m.remove();
        if (b.dataset.t === 'opts') viewOptions(i, btn);
        else if (b.dataset.t === 'speak' && window.TimotheosSpeech) TimotheosSpeech.speakView(i, btn);
      });
    });
  }

  /* ---------------- colours ---------------- */
  /** a spectrum of swatches (hue across, light to dark down) plus greys and "any colour" */
  function spectrum() {
    const hues = [0, 20, 40, 55, 90, 140, 170, 200, 220, 260, 290, 330];
    const rows = [[85, 62], [70, 50], [65, 40], [60, 30], [55, 20]];
    let h = '<div class="swgrid">';
    for (const [s, l] of rows) for (const hu of hues) { const c = hsl(hu, s, l); h += `<button type="button" class="swc" data-c="${c}" style="background:${c}" title="${c}"></button>`; }
    for (const g of [0, 15, 30, 45, 60, 75, 90, 100]) { const c = hsl(0, 0, g); h += `<button type="button" class="swc" data-c="${c}" style="background:${c}" title="${c}"></button>`; }
    return h + '</div>';
  }
  function hsl(h, s, l) {
    s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  function colorMenu(btn, title, current, onPick) {
    paneMenu(btn, `<div class="mh">${esc(title)}</div>${spectrum()}
      <div class="swrow"><label>Any colour <input type="color" class="swany" value="${/^#[0-9a-f]{6}$/i.test(current || '') ? current : '#808080'}"></label><button type="button" class="swdef">As in Options</button></div>`, m => {
      m.classList.add('colormenu');
      m.addEventListener('click', e => { const c = e.target.closest('.swc'); if (c) { onPick(c.dataset.c); m.remove(); } });
      m.querySelector('.swany').addEventListener('input', e => onPick(e.target.value));
      m.querySelector('.swdef').onclick = () => { onPick(null); m.remove(); };
    });
  }

  /* ---------------- the pen: highlighter and underline ---------------- */
  function setPen(pen) {
    state.pen = pen || null;
    if (window.refreshPaneLooks) window.refreshPaneLooks();
    flashMsg(pen ? `${pen.kind === 'ul' ? 'Underline' : 'Highlighter'}: ${pen.label} – select text to mark it (Esc: stop)` : 'Highlighter off');
  }
  function penMenu(btn) {
    const cur = state.pen && state.pen.kind === 'hl' ? state.pen.style : '';
    paneMenu(btn, `<div class="mh">Highlighter</div><div class="swgrid hlgrid">${HL_COLORS.map(([k, c]) => `<button type="button" class="swc${k === cur ? ' on' : ''}" data-k="${k}" data-c="${c}" style="background:${c}" title="${k}"></button>`).join('')}</div>
      <div class="swrow"><button type="button" class="swdef">Stop highlighting</button></div>
      <p class="small bvpenhint">Pick a colour, then select words in the Bible text: they are marked at once. “Clear” is in the right-click menu.</p>`, m => {
      m.addEventListener('click', e => { const c = e.target.closest('.swc'); if (c) { setPen({ kind: 'hl', style: c.dataset.k, color: c.dataset.c, label: c.dataset.k }); m.remove(); } });
      m.querySelector('.swdef').onclick = () => { setPen(null); m.remove(); };
    });
  }
  function underlineMenu(btn) {
    const cur = state.pen && state.pen.kind === 'ul' ? state.pen.style.split('-') : ['', 'solid', 'red'];
    paneMenu(btn, `<div class="mh">Underline style</div>
      <div class="ulstyles">${UL_STYLES.map(([k, n]) => `<label><input type="radio" name="uls" value="${k}"${k === cur[1] ? ' checked' : ''}> <span class="ulsamp" style="text-decoration:underline ${k} 2px;text-underline-offset:3px">${n}</span></label>`).join('')}</div>
      <div class="mh">Underline colour</div><div class="swgrid hlgrid">${UL_COLORS.map(([k, c]) => `<button type="button" class="swc${k === cur[2] ? ' on' : ''}" data-k="${k}" data-c="${c}" style="background:${c}" title="${k}"></button>`).join('')}</div>
      <div class="swrow"><button type="button" class="swdef">Stop underlining</button></div>`, m => {
      let color = cur[2] || 'red', hex = (UL_COLORS.find(x => x[0] === color) || UL_COLORS[0])[1];
      const apply = () => { const st = (m.querySelector('input[name="uls"]:checked') || {}).value || 'solid'; setPen({ kind: 'ul', style: `ul-${st}-${color}`, color: hex, label: `${st}, ${color}` }); };
      m.addEventListener('change', e => { if (e.target.name === 'uls') apply(); });
      m.addEventListener('click', e => { const c = e.target.closest('.swc'); if (c) { color = c.dataset.k; hex = c.dataset.c; m.querySelectorAll('.swc').forEach(x => x.classList.toggle('on', x === c)); apply(); } });
      m.querySelector('.swdef').onclick = () => { setPen(null); m.remove(); };
    });
  }
  function wirePen() {
    $('#view').addEventListener('mouseup', () => {
      if (!state.pen) return;
      setTimeout(() => {
        const sel = window.getSelection(); if (!sel || sel.isCollapsed || !state.pen) return;
        const n = sel.anchorNode; const el = n && (n.nodeType === 3 ? n.parentElement : n);
        if (!el || !el.closest || !el.closest('#view .bvtext')) return;
        const tgt = TimotheosStudy.selectionTarget(null);
        if (tgt && tgt.partial) TimotheosStudy.highlight(tgt, state.pen.style);
      }, 0);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && state.pen && !document.querySelector('.bvmenu, #modal:not(.hidden)')) setPen(null); });
  }

  function init() { injectStyles(); wireBibleHover(); wirePen(); }
  window.TimotheosViewUI = { init, bibleMenu, mainMenu, colorMenu, penMenu, underlineMenu, rename, setLabel, setPen };
})();
