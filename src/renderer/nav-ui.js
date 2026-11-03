'use strict';
/* global api, state, $, esc, go, selectVerse, step, stepBook, historyGo, refName, save, activeText,
   TanglawIcons, TanglawStudy, TanglawDock, TWRender, EMPTY_MOD */
// 0.5.4: Three theWord-inspired Bible View Navigation systems + interactive switcher (1 | 2 | 3 | All):
// - Design 1: Interactive Bible View Header Bar ([Book] [Chapter] [:Verse] pills), 3-Step Visual Grid Popover,
//             directional step icons (Prev/Next Book, Chapter, Verse), and Passage History dropdown menu.
// - Design 2: Collapsible Horizontal Chapter Strip, Verse Minimap Bar (with note/highlight indicators),
//             Chapter Pericope/Headings Outline menu, and Quick Bookmark Ribbon (1–0).
// - Design 3: Enhanced Sidebar Bible Tree with 9 Canon Division Icons & Color Accents,
//             List Tree vs. Compact 66/88-Book Tile Matrix toggle, instant filter, and inline Chapter → Verse grid.

(function () {
  const CATEGORIES = {
    law:   { id: 'law',   icon: '📜', label: 'Pentateuch / Law',         short: 'Law',       color: '#b47b18' },
    hist:  { id: 'hist',  icon: '👑', label: 'Historical Books',         short: 'History',   color: '#9e5028' },
    poet:  { id: 'poet',  icon: '🎵', label: 'Poetic & Wisdom',          short: 'Wisdom',    color: '#2b7a58' },
    maj:   { id: 'maj',   icon: '🔥', label: 'Major Prophets',           short: 'Major Pr.', color: '#a83232' },
    min:   { id: 'min',   icon: '⚡', label: 'Minor Prophets',           short: 'Minor Pr.', color: '#c46218' },
    deut:  { id: 'deut',  icon: '🏛️', label: 'Deuterocanon / Apocrypha', short: 'Apocrypha', color: '#6b4a91' },
    gosp:  { id: 'gosp',  icon: '✝️', label: 'Gospels & Acts',           short: 'Gospels',   color: '#9a2842' },
    epist: { id: 'epist', icon: '✉️', label: 'Epistles',                 short: 'Epistles',  color: '#2f6a8a' },
    apoc:  { id: 'apoc',  icon: '🌟', label: 'Apocalypse / Prophecy',    short: 'Prophecy',  color: '#7a4298' },
  };

  function bookCategory(bId, grp) {
    if (grp === 'AP' || grp === 'APX' || bId >= 67) return CATEGORIES.deut;
    if (bId >= 1 && bId <= 5) return CATEGORIES.law;
    if (bId >= 6 && bId <= 17) return CATEGORIES.hist;
    if (bId >= 18 && bId <= 22) return CATEGORIES.poet;
    if (bId >= 23 && bId <= 27) return CATEGORIES.maj;
    if (bId >= 28 && bId <= 39) return CATEGORIES.min;
    if (bId >= 40 && bId <= 44) return CATEGORIES.gosp;
    if (bId >= 45 && bId <= 65) return CATEGORIES.epist;
    return CATEGORIES.apoc;
  }

  let popState = {
    open: false,
    step: 'book',       // 'book' | 'chapter' | 'verse'
    selB: 43,
    selC: 1,
    filter: '',
    targetPane: null,   // null = active view, or pane index for unlinked view
  };

  let chapterRowsCache = []; // cached rows of active chapter for heading/verse count extraction

  function verseCountOf(b, c) {
    let maxV = 0;
    const openIds = (state.settings && state.settings.openBibles) || [];
    for (const id of openIds) {
      const inf = state.infos && state.infos.get(id);
      const n = inf && inf.books && inf.books[b] ? (inf.books[b][c - 1] || 0) : 0;
      if (n > maxV) maxV = n;
    }
    if (!maxV && b === state.ref.b && c === state.ref.c && chapterRowsCache.length) {
      for (const r of chapterRowsCache) if (r.v > maxV) maxV = r.v;
    }
    if (!maxV && b === state.ref.b && c === state.ref.c) {
      const domVs = [...document.querySelectorAll('#view [data-v]')].map(el => +el.dataset.v || 0);
      if (domVs.length) maxV = Math.max(...domVs);
    }
    return maxV || 1;
  }

  function stepVerse(d) {
    const t = typeof activeText === 'function' ? activeText() : $('#view');
    const vs = [...new Set([...(t ? t.querySelectorAll('[data-v]') : [])].map(x => +x.dataset.v))].sort((a, b) => a - b);
    if (!vs.length) return;
    const i = vs.indexOf(state.ref.v);
    if (i + d < 0) return step(-1);
    if (i + d >= vs.length) return step(1);
    selectVerse(vs[i + d], true);
  }

  function init() {
    const mode = (state.settings && state.settings.navDesign) || 'all';
    applyNavDesign(mode, false);
    const showVs = state.settings && state.settings.showVerseStrip !== false;
    const vsRow = $('#stripVersesRow'), vsBtn = $('#toggleVerseStripBtn');
    if (vsRow) vsRow.classList.toggle('hidden', !showVs);
    if (vsBtn) vsBtn.classList.toggle('on', showVs);

    wireHeaderBar();
    wireStripBar();
    wireTreeToolbar();
  }

  /* ======================================================================= Navigation Mode Switcher (1 | 2 | 3 | All) */
  function applyNavDesign(mode, announce = true) {
    if (!['1', '2', '3', 'all'].includes(mode)) mode = 'all';
    document.documentElement.dataset.navdesign = mode;
    if (state.settings) {
      state.settings.navDesign = mode;
      save({ navDesign: mode });
    }
    document.querySelectorAll('#navModeSw button[data-navmode]').forEach(b => {
      b.classList.toggle('on', b.dataset.navmode === mode);
    });
    const h1 = $('#navHeader1'), chHead = $('#chapterHead'), strip = $('#navStripBar');
    if (h1) h1.classList.toggle('hidden', mode === '2' || mode === '3');
    if (chHead) chHead.classList.toggle('hidden', mode === '1' || mode === 'all');
    if (strip) strip.classList.toggle('hidden', mode === '1' || mode === '3');

    if (mode === '3' && window.TanglawDock) {
      TanglawDock.show('tree');
    }
    if (announce && window.TanglawStudy) {
      const names = {
        '1': 'Nav Design 1: Interactive Header Pills, 3-Step Visual Grid & Step Icons',
        '2': 'Nav Design 2: Chapter Strip, Verse Minimap, Headings Outline & Bookmarks',
        '3': 'Nav Design 3: Color-Coded Sidebar Bible Tree & Book Tile Matrix',
        'all': 'All 3 Bible Navigation Designs Active',
      };
      TanglawStudy.flash(names[mode]);
    }
  }

  /* ======================================================================= Design 1: Interactive Header & 3-Step Popover */
  function wireHeaderBar() {
    const sw = $('#navModeSw');
    if (sw) {
      sw.onclick = e => {
        const b = e.target.closest('button[data-navmode]');
        if (b) applyNavDesign(b.dataset.navmode, true);
      };
    }

    const vSel = $('#verseSel');
    if (vSel) {
      vSel.onchange = () => {
        const v = +vSel.value;
        if (v > 0) selectVerse(v, true);
      };
    }

    const bookBtn = $('#navBookBtn'), chapBtn = $('#navChapBtn'), verseBtn = $('#navVerseBtn'), chHead = $('#chapterHead');
    if (bookBtn) {
      bookBtn.onclick = e => { e.stopPropagation(); openNavPopover('book', bookBtn); };
      bookBtn.addEventListener('wheel', e => { e.preventDefault(); stepBook(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    }
    if (chapBtn) {
      chapBtn.onclick = e => { e.stopPropagation(); openNavPopover('chapter', chapBtn); };
      chapBtn.addEventListener('wheel', e => { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    }
    if (verseBtn) {
      verseBtn.onclick = e => { e.stopPropagation(); openNavPopover('verse', verseBtn); };
      verseBtn.addEventListener('wheel', e => { e.preventDefault(); stepVerse(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    }
    if (chHead) {
      chHead.style.cursor = 'pointer';
      chHead.title = 'Click to open Book, Chapter & Verse visual picker';
      chHead.onclick = e => { e.stopPropagation(); openNavPopover('book', chHead); };
    }

    if ($('#navPrevBook')) $('#navPrevBook').onclick = () => stepBook(-1);
    if ($('#navPrevChap')) $('#navPrevChap').onclick = () => step(-1);
    if ($('#navPrevVerse')) $('#navPrevVerse').onclick = () => stepVerse(-1);
    if ($('#navNextVerse')) $('#navNextVerse').onclick = () => stepVerse(1);
    if ($('#navNextChap')) $('#navNextChap').onclick = () => step(1);
    if ($('#navNextBook')) $('#navNextBook').onclick = () => stepBook(1);
    if ($('#navHistBtn')) $('#navHistBtn').onclick = e => { e.stopPropagation(); openHistoryMenu($('#navHistBtn')); };

    document.addEventListener('mousedown', e => {
      const pop = $('#navPop');
      if (pop && !pop.classList.contains('hidden')) {
        if (!pop.contains(e.target) && !e.target.closest('#navBookBtn, #navChapBtn, #navVerseBtn, #chapterHead, .bvref')) {
          closeNavPopover();
        }
      }
    }, true);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeNavPopover();
    });
  }

  function closeNavPopover() {
    const pop = $('#navPop');
    if (pop) pop.classList.add('hidden');
    popState.open = false;
  }

  function openNavPopover(initialStep, anchorEl, paneIdx = null) {
    const pop = $('#navPop');
    if (!pop || !state.nav || !state.nav.length) return;
    if (popState.open && popState.step === initialStep && !pop.classList.contains('hidden')) {
      return closeNavPopover();
    }
    popState.open = true;
    popState.step = initialStep || 'book';
    popState.selB = state.ref.b;
    popState.selC = state.ref.c;
    popState.filter = '';
    popState.targetPane = paneIdx;

    drawNavPopover();
    pop.classList.remove('hidden');

    if (anchorEl) {
      const cRect = $('#center').getBoundingClientRect();
      const aRect = anchorEl.getBoundingClientRect();
      const pw = Math.min(640, cRect.width - 16);
      const left = Math.max(8, Math.min(aRect.left - cRect.left, cRect.width - pw - 8));
      const top = Math.max(34, aRect.bottom - cRect.top + 4);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }
    const fi = $('#npFilter');
    if (fi) setTimeout(() => fi.focus(), 20);
  }

  function drawNavPopover() {
    const pop = $('#navPop');
    if (!pop) return;
    const layout = (state.settings && state.settings.navPopLayout) || 'cascade'; // 'cascade' | 'columns'
    const tileStyle = (state.settings && state.settings.navBookStyle) || 'tiles'; // 'tiles' | 'list'
    const bk = state.nav.find(x => x.id === popState.selB) || state.nav[0];
    if (!bk) return;
    if (!bk.chapterList.includes(popState.selC)) popState.selC = bk.chapterList[0] || 1;
    const vMax = verseCountOf(bk.id, popState.selC);
    const cat = bookCategory(bk.id, bk.grp);

    const headerHtml = `
      <div class="nphdr">
        <div class="npsteps">
          <button type="button" class="npstep ${popState.step === 'book' && layout === 'cascade' ? 'on' : ''}" data-npstep="book">
            <span class="npcat-dot" style="background:${cat.color}"></span>
            <b>1. Book:</b> ${esc(bk.name)}
          </button>
          <span class="np-arr">›</span>
          <button type="button" class="npstep ${popState.step === 'chapter' && layout === 'cascade' ? 'on' : ''}" data-npstep="chapter">
            <b>2. Ch:</b> ${popState.selC} <span class="small">/${bk.chapterList.length}</span>
          </button>
          <span class="np-arr">›</span>
          <button type="button" class="npstep ${popState.step === 'verse' && layout === 'cascade' ? 'on' : ''}" data-npstep="verse">
            <b>3. Vs:</b> :${popState.selB === state.ref.b && popState.selC === state.ref.c ? state.ref.v : 1} <span class="small">/${vMax}</span>
          </button>
        </div>
        <span class="grow"></span>
        <input id="npFilter" type="search" value="${esc(popState.filter)}" placeholder="Filter book or type ref (e.g. Rom 8:28)…" spellcheck="false" autocomplete="off">
        <div class="nptoggles">
          <button type="button" id="npBookStyleBtn" class="nptog" title="Switch Book display between compact 3-letter Abbreviation Tiles and Full Names">${tileStyle === 'tiles' ? 'Tiles' : 'Names'}</button>
          <button type="button" id="npLayoutBtn" class="nptog" title="Switch between 3-Step Cascade and 3-Column All-in-One view">${layout === 'cascade' ? '3-Step' : '3-Col'}</button>
        </div>
        <button type="button" id="npGoNow" class="primary npgo" title="Go directly to ${esc(bk.name)} ${popState.selC}:1">Go ${esc(bk.abbr)} ${popState.selC}</button>
        <button type="button" id="npClose" class="cpx" title="Close (Esc)">${TanglawIcons.icon('close', 14)}</button>
      </div>`;

    let bodyHtml = '';
    if (layout === 'columns') {
      bodyHtml = `
        <div class="npbody npcols">
          <div class="npcol npcol-books">${buildBooksHtml(bk, tileStyle)}</div>
          <div class="npcol npcol-chaps">
            <div class="npcol-title">Chapters in ${esc(bk.name)} (${bk.chapterList.length})</div>
            <div class="npgrid npgrid-ch">${buildChaptersHtml(bk)}</div>
          </div>
          <div class="npcol npcol-verses">
            <div class="npcol-title">Verses in ${esc(bk.abbr)} ${popState.selC} (${vMax})</div>
            <div class="npgrid npgrid-vs">${buildVersesHtml(bk, popState.selC, vMax)}</div>
          </div>
        </div>`;
    } else {
      if (popState.step === 'book') {
        bodyHtml = `<div class="npbody npcascade">${buildBooksHtml(bk, tileStyle)}</div>`;
      } else if (popState.step === 'chapter') {
        bodyHtml = `
          <div class="npbody npcascade">
            <div class="np-subbar">
              <span><b style="color:${cat.color}">${cat.icon} ${esc(bk.name)}</b> — Select a chapter (${bk.chapterList.length} chapters):</span>
              <span class="grow"></span>
              <button type="button" class="nplink" data-npstep="book">← Change Book</button>
            </div>
            <div class="npgrid npgrid-ch large">${buildChaptersHtml(bk)}</div>
          </div>`;
      } else {
        bodyHtml = `
          <div class="npbody npcascade">
            <div class="np-subbar">
              <span><b style="color:${cat.color}">${cat.icon} ${esc(bk.name)} ${popState.selC}</b> — Select a verse (${vMax} verses):</span>
              <span class="grow"></span>
              <button type="button" class="nplink" data-npstep="chapter">← Change Chapter</button>
            </div>
            <div class="npgrid npgrid-vs large">${buildVersesHtml(bk, popState.selC, vMax)}</div>
          </div>`;
      }
    }

    pop.innerHTML = headerHtml + bodyHtml;
    wireNavPopoverEvents(pop, bk, layout, tileStyle);
  }

  function buildBooksHtml(activeBk, tileStyle) {
    const q = (popState.filter || '').trim().toLowerCase();
    let html = '';
    let lastCat = null;
    const filtered = state.nav.filter(x => {
      if (!q) return true;
      return x.name.toLowerCase().includes(q) || (x.abbr || '').toLowerCase().includes(q) || (x.abbrs || []).some(a => a.toLowerCase().startsWith(q));
    });
    if (!filtered.length) {
      return `<p class="small" style="padding:12px">No books matching “${esc(popState.filter)}”. Press <b>Enter</b> to jump if this is a verse reference.</p>`;
    }
    for (const x of filtered) {
      const cat = bookCategory(x.id, x.grp);
      if (cat.id !== lastCat) {
        if (lastCat !== null) html += `</div>`;
        lastCat = cat.id;
        html += `<div class="npcat-hdr" style="--cat-col:${cat.color}"><span>${cat.icon} ${esc(cat.label)}</span></div><div class="npbook-group ${tileStyle === 'tiles' ? 'tiles' : 'list'}">`;
      }
      const isCur = x.id === activeBk.id;
      if (tileStyle === 'tiles') {
        html += `<button type="button" class="npb-tile ${isCur ? 'on' : ''}" data-b="${x.id}" style="--cat-col:${cat.color}" title="${esc(x.name)} (${x.chapterList.length} ch)">${esc(x.abbr)}</button>`;
      } else {
        html += `<button type="button" class="npb-row ${isCur ? 'on' : ''}" data-b="${x.id}" style="--cat-col:${cat.color}"><span class="npb-abbr">${esc(x.abbr)}</span><span class="npb-name">${esc(x.name)}</span><span class="npb-chc">${x.chapterList.length}</span></button>`;
      }
    }
    if (lastCat !== null) html += `</div>`;
    return html;
  }

  function buildChaptersHtml(bk) {
    return bk.chapterList.map(c => `<button type="button" data-c="${c}" class="${c === popState.selC ? 'on' : ''}">${c}</button>`).join('');
  }

  function buildVersesHtml(bk, c, vMax) {
    const curV = (bk.id === state.ref.b && c === state.ref.c) ? state.ref.v : 1;
    const out = [];
    for (let v = 1; v <= vMax; v++) {
      out.push(`<button type="button" data-v="${v}" class="${v === curV ? 'on' : ''}">:${v}</button>`);
    }
    return out.join('');
  }

  function wireNavPopoverEvents(pop, bk, layout, tileStyle) {
    $('#npClose').onclick = closeNavPopover;
    $('#npGoNow').onclick = () => {
      go({ b: bk.id, c: popState.selC, v: 1 });
      closeNavPopover();
    };
    $('#npBookStyleBtn').onclick = () => {
      const next = tileStyle === 'tiles' ? 'list' : 'tiles';
      state.settings.navBookStyle = next;
      save({ navBookStyle: next });
      drawNavPopover();
    };
    $('#npLayoutBtn').onclick = () => {
      const next = layout === 'cascade' ? 'columns' : 'cascade';
      state.settings.navPopLayout = next;
      save({ navPopLayout: next });
      drawNavPopover();
    };
    pop.querySelectorAll('[data-npstep]').forEach(bt => {
      bt.onclick = () => {
        popState.step = bt.dataset.npstep;
        if (layout !== 'cascade') {
          state.settings.navPopLayout = 'cascade';
          save({ navPopLayout: 'cascade' });
        }
        drawNavPopover();
      };
    });

    const fi = $('#npFilter');
    if (fi) {
      fi.oninput = () => {
        popState.filter = fi.value;
        if (popState.step !== 'book' && layout === 'cascade') popState.step = 'book';
        const pos = fi.selectionStart;
        drawNavPopover();
        const fi2 = $('#npFilter');
        if (fi2) { fi2.focus(); try { fi2.setSelectionRange(pos, pos); } catch (_) {} }
      };
      fi.onkeydown = async e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const raw = fi.value.trim();
          if (raw) {
            const parsed = await api.parseRef(raw);
            if (parsed) {
              closeNavPopover();
              return go(parsed);
            }
            const firstBtn = pop.querySelector('[data-b]');
            if (firstBtn) firstBtn.click();
          }
        }
      };
    }

    pop.querySelectorAll('[data-b]').forEach(bt => {
      bt.onclick = () => {
        popState.selB = +bt.dataset.b;
        const nb = state.nav.find(x => x.id === popState.selB) || state.nav[0];
        popState.selC = nb.chapterList[0] || 1;
        popState.filter = '';
        if (nb.chapterList.length === 1) {
          go({ b: nb.id, c: popState.selC, v: 1 });
          popState.step = 'verse';
        } else {
          popState.step = 'chapter';
        }
        drawNavPopover();
      };
      bt.ondblclick = () => {
        const nb = state.nav.find(x => x.id === +bt.dataset.b) || state.nav[0];
        go({ b: nb.id, c: nb.chapterList[0] || 1, v: 1 });
        closeNavPopover();
      };
    });

    pop.querySelectorAll('[data-c]').forEach(bt => {
      bt.onclick = async () => {
        popState.selC = +bt.dataset.c;
        await go({ b: popState.selB, c: popState.selC, v: 1 });
        popState.step = 'verse';
        drawNavPopover();
      };
    });

    pop.querySelectorAll('[data-v]').forEach(bt => {
      bt.onclick = async () => {
        const v = +bt.dataset.v;
        closeNavPopover();
        if (popState.selB !== state.ref.b || popState.selC !== state.ref.c) {
          await go({ b: popState.selB, c: popState.selC, v });
        } else {
          selectVerse(v, true);
        }
      };
    });

    const curBookEl = pop.querySelector('[data-b].on');
    if (curBookEl) curBookEl.scrollIntoView({ block: 'nearest' });
  }

  /* ======================================================================= Passage History Menu (⟲) */
  function openHistoryMenu(btn) {
    document.querySelectorAll('.bvmenu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'menu bvmenu histmenu';
    const back = (state.back || []).slice(-20).reverse();
    const fwd = (state.fwd || []).slice(-10).reverse();

    let html = `<div class="mh">Passage History</div>`;
    if (fwd.length) {
      html += `<div class="mh small">Forward (Alt+→)</div>`;
      fwd.forEach((r, idx) => {
        html += `<button type="button" data-hdir="fwd" data-hidx="${idx}">↪ <b>${esc(refName(r))}</b></button>`;
      });
    }
    html += `<button type="button" class="on" disabled>● <b>${esc(refName(state.ref))}</b> <span class="small">(current)</span></button>`;
    if (back.length) {
      html += `<div class="mh small">Earlier Passages (Alt+←)</div>`;
      back.forEach((r, idx) => {
        html += `<button type="button" data-hdir="back" data-hidx="${idx}">↩ ${esc(refName(r))}</button>`;
      });
    } else if (!fwd.length) {
      html += `<div class="small" style="padding:6px 12px">No earlier passages in history yet.</div>`;
    }

    m.innerHTML = html;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - 260)) + 'px';
    m.style.top = (r.bottom + 4) + 'px';

    m.querySelectorAll('button[data-hdir]').forEach(bt => {
      bt.onclick = () => {
        m.remove();
        const dir = bt.dataset.hdir;
        const steps = +bt.dataset.hidx + 1;
        for (let s = 0; s < steps; s++) historyGo(dir === 'back' ? -1 : 1);
      };
    });

    setTimeout(() => {
      document.addEventListener('mousedown', function off(e) {
        if (!m.contains(e.target) && e.target !== btn) {
          m.remove();
          document.removeEventListener('mousedown', off, true);
        }
      }, true);
    }, 0);
  }

  /* ======================================================================= Design 2: Collapsible Chapter Strip, Verse Minimap, Pericopes & Bookmarks */
  function wireStripBar() {
    const chBox = $('#stripChaps');
    if (chBox) {
      chBox.onclick = e => {
        const bt = e.target.closest('button[data-c]');
        if (bt) go({ b: state.ref.b, c: +bt.dataset.c, v: 1 });
      };
      chBox.addEventListener('wheel', e => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          chBox.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }

    const vsBox = $('#stripVerses');
    if (vsBox) {
      vsBox.onclick = e => {
        const bt = e.target.closest('button[data-v]');
        if (bt) selectVerse(+bt.dataset.v, true);
      };
      vsBox.addEventListener('wheel', e => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          vsBox.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      }, { passive: false });
    }

    const vsBtn = $('#toggleVerseStripBtn');
    if (vsBtn) {
      vsBtn.onclick = () => {
        const vsRow = $('#stripVersesRow');
        const next = vsRow.classList.toggle('hidden');
        vsBtn.classList.toggle('on', !next);
        state.settings.showVerseStrip = !next;
        save({ showVerseStrip: !next });
      };
    }

    const hBtn = $('#navHeadingsBtn');
    if (hBtn) {
      hBtn.onclick = e => {
        e.stopPropagation();
        openHeadingsMenu(hBtn);
      };
    }

    const bmBox = $('#stripBookmarks');
    if (bmBox) {
      bmBox.onclick = e => {
        const bt = e.target.closest('button[data-bm]');
        if (!bt || !window.TanglawStudy || !TanglawStudy.study.ud) return;
        const d = +bt.dataset.bm;
        const slotIdx = d === 0 ? 9 : d - 1;
        const curBm = TanglawStudy.study.ud.bookmarks[slotIdx];
        if (e.ctrlKey || e.shiftKey || !curBm) {
          TanglawStudy.study.ud.bookmarks[slotIdx] = { ...state.ref };
          api.setUserData('bookmarks', TanglawStudy.study.ud.bookmarks).catch(() => {});
          TanglawStudy.flash(`Bookmark ${d} set to ${refName(state.ref)}`);
          renderBookmarkRibbon();
        } else {
          go(curBm);
        }
      };
      bmBox.oncontextmenu = e => {
        const bt = e.target.closest('button[data-bm]');
        if (!bt || !window.TanglawStudy || !TanglawStudy.study.ud) return;
        e.preventDefault();
        const d = +bt.dataset.bm;
        const slotIdx = d === 0 ? 9 : d - 1;
        TanglawStudy.study.ud.bookmarks[slotIdx] = { ...state.ref };
        api.setUserData('bookmarks', TanglawStudy.study.ud.bookmarks).catch(() => {});
        TanglawStudy.flash(`Bookmark ${d} set to ${refName(state.ref)}`);
        renderBookmarkRibbon();
      };
    }
  }

  function extractChapterHeadings() {
    const out = [];
    const seen = new Set();
    const t = typeof activeText === 'function' ? activeText() : $('#view');
    if (t) {
      for (const hEl of t.querySelectorAll('.heading')) {
        const vEl = hEl.closest('[data-v]');
        const v = vEl ? +vEl.dataset.v : 1;
        const txt = (hEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (txt && !seen.has(v + ':' + txt)) {
          seen.add(v + ':' + txt);
          out.push({ v, title: txt, kind: 'heading' });
        }
      }
    }
    if (!out.length && chapterRowsCache.length) {
      for (const r of chapterRowsCache) {
        const raw = String((r.cells && r.cells[0]) || '');
        const re = /<TS\d?>([\s\S]*?)<Ts>/gi;
        let m;
        while ((m = re.exec(raw))) {
          const txt = m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
          if (txt && !seen.has(r.v + ':' + txt)) {
            seen.add(r.v + ':' + txt);
            out.push({ v: r.v, title: txt, kind: 'heading' });
          }
        }
      }
    }
    return out;
  }

  function openHeadingsMenu(btn) {
    document.querySelectorAll('.bvmenu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'menu bvmenu hdgsmenu';
    const bk = state.nav.find(x => x.id === state.ref.b);
    const headings = extractChapterHeadings();

    let html = `<div class="mh">${esc(bk ? bk.name : '')} ${state.ref.c} — Chapter Outline</div>`;
    if (headings.length) {
      for (const h of headings) {
        html += `<button type="button" data-hv="${h.v}" class="${h.v === state.ref.v ? 'on' : ''}"><span class="hv-badge">v. ${h.v}</span> <span>${esc(h.title)}</span></button>`;
      }
    } else {
      // Fallback: show paragraph starts or verse milestones so the user can still jump by section
      const t = typeof activeText === 'function' ? activeText() : $('#view');
      const vEls = t ? [...t.querySelectorAll('tr[data-v], .pv[data-v]')] : [];
      html += `<div class="small" style="padding:4px 12px">No section headings in this chapter; showing passage sections:</div>`;
      for (let i = 0; i < vEls.length; i++) {
        const vEl = vEls[i];
        const v = +vEl.dataset.v;
        const hasPara = v === 1 || i % 5 === 0 || !!vEl.querySelector('.para');
        if (!hasPara) continue;
        const clone = vEl.cloneNode(true);
        clone.querySelectorAll('sup, .vn, .vnum, .xrs, .unote, .noteicon').forEach(n => n.remove());
        const snip = (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 62);
        if (snip) {
          html += `<button type="button" data-hv="${v}" class="${v === state.ref.v ? 'on' : ''}"><span class="hv-badge">v. ${v}</span> <span>${esc(snip)}…</span></button>`;
        }
      }
    }

    m.innerHTML = html;
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - 320)) + 'px';
    m.style.top = (r.bottom + 4) + 'px';

    m.querySelectorAll('button[data-hv]').forEach(bt => {
      bt.onclick = () => {
        m.remove();
        selectVerse(+bt.dataset.hv, true);
      };
    });

    setTimeout(() => {
      document.addEventListener('mousedown', function off(e) {
        if (!m.contains(e.target) && e.target !== btn) {
          m.remove();
          document.removeEventListener('mousedown', off, true);
        }
      }, true);
    }, 0);
  }

  function renderBookmarkRibbon() {
    const bmBox = $('#stripBookmarks');
    if (!bmBox) return;
    const ud = (window.TanglawStudy && TanglawStudy.study && TanglawStudy.study.ud) || { bookmarks: [] };
    const bms = ud.bookmarks || [];
    let html = `<span class="nslbl" title="Bookmarks 1–0">🔖</span>`;
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
      const slotIdx = d === 0 ? 9 : d - 1;
      const r = bms[slotIdx];
      const isHere = r && r.b === state.ref.b && r.c === state.ref.c && r.v === state.ref.v;
      const tip = r
        ? `Bookmark ${d}: ${refName(r)} (Click to go · Right-click or Ctrl+click to set to current verse)`
        : `Bookmark ${d}: empty (Click to save ${refName(state.ref)} here)`;
      html += `<button type="button" data-bm="${d}" class="bmchip ${r ? 'on' : ''} ${isHere ? 'here' : ''}" title="${esc(tip)}">${d}</button>`;
    }
    bmBox.innerHTML = html;
  }

  /* ======================================================================= Design 3: Enhanced Sidebar Bible Tree & Tile Matrix */
  function wireTreeToolbar() {
    const fi = $('#treeFilter');
    if (fi) {
      fi.oninput = () => renderEnhancedTree(true);
      fi.onkeydown = async e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const raw = fi.value.trim();
          if (!raw) return;
          const parsed = await api.parseRef(raw);
          if (parsed) {
            fi.value = '';
            renderEnhancedTree(true);
            return go(parsed);
          }
          const firstBook = $('#bibleTree [data-b]');
          if (firstBook) {
            const bId = +firstBook.dataset.b;
            const bk = state.nav.find(x => x.id === bId);
            if (bk) go({ b: bk.id, c: bk.chapterList[0] || 1, v: 1 });
          }
        }
      };
    }
    document.querySelectorAll('#treeToolbar [data-tmode]').forEach(bt => {
      bt.onclick = () => {
        const m = bt.dataset.tmode;
        state.settings.treeMode = m;
        save({ treeMode: m });
        document.querySelectorAll('#treeToolbar [data-tmode]').forEach(x => x.classList.toggle('on', x.dataset.tmode === m));
        renderEnhancedTree(true);
      };
    });
  }

  let lastTreeKey = '';
  function renderEnhancedTree(force = false) {
    const box = $('#bibleTree');
    if (!box || !state.nav || !state.nav.length) return;
    const tmode = (state.settings && state.settings.treeMode) || 'tree';
    document.querySelectorAll('#treeToolbar [data-tmode]').forEach(x => x.classList.toggle('on', x.dataset.tmode === tmode));
    const q = (($('#treeFilter') && $('#treeFilter').value) || '').trim().toLowerCase();
    const vMax = verseCountOf(state.ref.b, state.ref.c);
    const key = `${tmode}|${q}|${state.ref.b}.${state.ref.c}:${vMax}|` + state.nav.map(b => b.id + ':' + b.chapterList.length).join(',');

    if (!force && key === lastTreeKey) {
      syncTreeHighlight(box);
      return;
    }
    lastTreeKey = key;

    const filtered = state.nav.filter(x => {
      if (!q) return true;
      return x.name.toLowerCase().includes(q) || (x.abbr || '').toLowerCase().includes(q) || (x.abbrs || []).some(a => a.toLowerCase().startsWith(q));
    });

    if (tmode === 'tiles') {
      const curBk = state.nav.find(x => x.id === state.ref.b) || state.nav[0];
      const curCat = bookCategory(curBk.id, curBk.grp);
      let html = `<div class="ttiles-wrap">`;
      let lastCat = null;
      for (const bk of filtered) {
        const cat = bookCategory(bk.id, bk.grp);
        if (cat.id !== lastCat) {
          if (lastCat !== null) html += `</div>`;
          lastCat = cat.id;
          html += `<div class="tgrp-cat" style="--cat-col:${cat.color}"><span>${cat.icon} ${esc(cat.label)}</span></div><div class="ttile-grid">`;
        }
        html += `<button type="button" class="ttile ${bk.id === state.ref.b ? 'cur' : ''}" data-b="${bk.id}" style="--cat-col:${cat.color}" title="${esc(bk.name)} (${bk.chapterList.length} chapters)">${esc(bk.abbr)}</button>`;
      }
      if (lastCat !== null) html += `</div>`;
      html += `</div>`;

      // Pinned Chapter & Verse grids at the bottom of Tiles mode
      html += `
        <div class="tpinned">
          <div class="tpin-hdr" style="--cat-col:${curCat.color}">
            <span>${curCat.icon} <b>${esc(curBk.name)}</b> — Chapters (${curBk.chapterList.length})</span>
          </div>
          <div class="chgrid tpin-ch">${curBk.chapterList.map(c => `<button type="button" data-b="${curBk.id}" data-c="${c}" class="${c === state.ref.c ? 'cur' : ''}">${c}</button>`).join('')}</div>
          <div class="tpin-hdr">
            <span>📍 <b>${esc(curBk.abbr)} ${state.ref.c}</b> — Verses (${vMax})</span>
          </div>
          <div class="chgrid tpin-vs">${Array.from({ length: vMax }, (_, i) => i + 1).map(v => `<button type="button" data-v="${v}" class="${v === state.ref.v ? 'cur' : ''}">:${v}</button>`).join('')}</div>
        </div>`;

      box.innerHTML = html;
      box.onclick = e => {
        const bBtn = e.target.closest('button.ttile[data-b]');
        if (bBtn) {
          const nb = state.nav.find(x => x.id === +bBtn.dataset.b);
          if (nb) go({ b: nb.id, c: nb.chapterList[0] || 1, v: 1 });
          return;
        }
        const cBtn = e.target.closest('button[data-c]');
        if (cBtn) {
          go({ b: +cBtn.dataset.b, c: +cBtn.dataset.c, v: 1 });
          return;
        }
        const vBtn = e.target.closest('button[data-v]');
        if (vBtn) selectVerse(+vBtn.dataset.v, true);
      };
      return;
    }

    // List Tree mode with 9 Canon Division headers & inline Chapter -> Verse expansion
    let html = '';
    let lastCat = null;
    for (const bk of filtered) {
      const cat = bookCategory(bk.id, bk.grp);
      if (cat.id !== lastCat) {
        lastCat = cat.id;
        html += `<div class="tgrp tgrp-cat" style="--cat-col:${cat.color}"><span>${cat.icon} ${esc(cat.label)}</span></div>`;
      }
      const isOpen = bk.id === state.ref.b || !!q;
      html += `
        <details data-b="${bk.id}" class="tbook ${bk.id === state.ref.b ? 'active-book' : ''}" style="--cat-col:${cat.color}" ${isOpen ? 'open' : ''}>
          <summary><span class="tb-dot" style="background:${cat.color}"></span><span class="tb-name">${esc(bk.name)}</span><span class="tb-chc">${bk.chapterList.length} ch</span></summary>
          <div class="chgrid">${bk.chapterList.map(c => `<button type="button" data-b="${bk.id}" data-c="${c}" class="${bk.id === state.ref.b && c === state.ref.c ? 'cur' : ''}">${c}</button>`).join('')}</div>
          ${bk.id === state.ref.b ? `<div class="tvs-wrap"><div class="tvs-lbl">📍 Verses in ${esc(bk.abbr)} ${state.ref.c}:</div><div class="chgrid tvs-grid">${Array.from({ length: vMax }, (_, i) => i + 1).map(v => `<button type="button" data-v="${v}" class="${v === state.ref.v ? 'cur' : ''}">:${v}</button>`).join('')}</div></div>` : ''}
        </details>`;
    }
    box.innerHTML = html;
    box.onclick = e => {
      const cBtn = e.target.closest('button[data-c]');
      if (cBtn) {
        go({ b: +cBtn.dataset.b, c: +cBtn.dataset.c, v: 1 });
        return;
      }
      const vBtn = e.target.closest('button[data-v]');
      if (vBtn) {
        selectVerse(+vBtn.dataset.v, true);
      }
    };
  }

  function syncTreeHighlight(box) {
    box.querySelectorAll('button[data-c].cur, button.ttile.cur, button[data-v].cur').forEach(x => x.classList.remove('cur'));
    const curC = box.querySelector(`button[data-b="${state.ref.b}"][data-c="${state.ref.c}"]`);
    if (curC) curC.classList.add('cur');
    const curB = box.querySelector(`button.ttile[data-b="${state.ref.b}"]`);
    if (curB) curB.classList.add('cur');
    box.querySelectorAll(`button[data-v="${state.ref.v}"]`).forEach(v => v.classList.add('cur'));
  }

  /* ======================================================================= Sync All Navigation Bars on Reference / Chapter Render */
  function syncAll(rows) {
    if (Array.isArray(rows) && rows.length) chapterRowsCache = rows;
    if (!state.nav || !state.nav.length) return;
    const r = state.ref;
    const bk = state.nav.find(x => x.id === r.b) || state.nav[0];
    if (!bk) return;
    const cat = bookCategory(bk.id, bk.grp);
    const vMax = verseCountOf(bk.id, r.c);

    // 1. Update top toolbar #verseSel
    const vSel = $('#verseSel');
    if (vSel) {
      if (+vSel.dataset.max !== vMax) {
        vSel.dataset.max = vMax;
        let opts = '';
        for (let v = 1; v <= vMax; v++) opts += `<option value="${v}">:${v}</option>`;
        vSel.innerHTML = opts;
      }
      vSel.value = String(Math.min(r.v || 1, vMax));
    }

    // 2. Update Design 1 Interactive Header Pills
    const bCatEl = $('#navBookCat'), bLblEl = $('#navBookLbl'), cLblEl = $('#navChapLbl'), vLblEl = $('#navVerseLbl');
    if (bCatEl) bCatEl.textContent = cat.icon;
    if (bLblEl) bLblEl.textContent = bk.name;
    if (cLblEl) cLblEl.textContent = `Ch ${r.c}`;
    if (vLblEl) vLblEl.textContent = `:${r.v || 1}`;
    const histBtn = $('#navHistBtn');
    if (histBtn) histBtn.disabled = !(state.back && state.back.length) && !(state.fwd && state.fwd.length);

    // 3. Update Design 2 Chapter Strip, Headings Count, Bookmarks & Verse Minimap
    const chBox = $('#stripChaps');
    if (chBox) {
      if (+chBox.dataset.b !== bk.id || +chBox.dataset.len !== bk.chapterList.length) {
        chBox.dataset.b = bk.id;
        chBox.dataset.len = bk.chapterList.length;
        chBox.innerHTML = bk.chapterList.map(c => `<button type="button" data-c="${c}" class="${c === r.c ? 'cur' : ''}">${c}</button>`).join('');
      } else {
        chBox.querySelectorAll('button.cur').forEach(x => x.classList.remove('cur'));
        const curBtn = chBox.querySelector(`button[data-c="${r.c}"]`);
        if (curBtn) curBtn.classList.add('cur');
      }
      const curChBtn = chBox.querySelector('button.cur');
      if (curChBtn) curChBtn.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    const vsBox = $('#stripVerses');
    if (vsBox) {
      const ud = (window.TanglawStudy && TanglawStudy.study && TanglawStudy.study.ud) || {};
      const notes = ud.notes || {};
      const openId = (state.settings && state.settings.openBibles && state.settings.openBibles[state.active || 0]) || '';
      const hls = (ud.highlights && ud.highlights[openId]) || {};

      let vsHtml = '';
      for (let v = 1; v <= vMax; v++) {
        const nk = `${bk.id}.${r.c}.${v}`;
        const hasNote = !!notes[nk];
        const hasHl = !!(hls[nk] && hls[nk].length);
        const cls = [
          v === r.v ? 'cur' : '',
          hasNote ? 'has-note' : '',
          hasHl ? 'has-hl' : '',
        ].filter(Boolean).join(' ');
        const tip = `${bk.abbr} ${r.c}:${v}${hasNote ? ' (has personal note)' : ''}${hasHl ? ' (highlighted)' : ''}`;
        vsHtml += `<button type="button" data-v="${v}" class="${cls}" title="${esc(tip)}">${v}</button>`;
      }
      vsBox.innerHTML = vsHtml;
      const curVBtn = vsBox.querySelector('button.cur');
      if (curVBtn) curVBtn.scrollIntoView({ inline: 'center', block: 'nearest' });
    }

    const hLbl = $('#navHeadingsLbl');
    if (hLbl) {
      const hdgs = extractChapterHeadings();
      hLbl.textContent = hdgs.length ? `Headings (${hdgs.length})` : 'Outline';
    }

    renderBookmarkRibbon();

    // 4. Update Design 3 Sidebar Bible Tree
    renderEnhancedTree(false);
  }

  window.TanglawNav = {
    init,
    syncAll,
    renderEnhancedTree,
    openNavPopover,
    closeNavPopover,
    applyNavDesign,
    bookCategory,
  };
})();
