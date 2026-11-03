'use strict';
/* Title bar drawn by Timotheos (so it follows the skin): app name, File / View / Help menus,
 * and the keyboard shortcuts those menus list. Supports [E1] Tagalog localization and
 * [E2] customizable keyboard shortcuts. */
/* global api, TimotheosIcons, TimotheosOptions, TimotheosI18n */
(function () {
  const $ = s => document.querySelector(s);
  const tr = s => (window.TimotheosI18n ? TimotheosI18n.t(s) : s);
  const sc = id => (window.TimotheosOptions && TimotheosOptions.shortcuts ? TimotheosOptions.shortcuts()[id] || '' : '');

  function getMenus() {
    return [
      ['File', 'f', [
        ['New User Module…', '', 'newUserMod', 'plus'],
        ['Import Modules…', sc('import'), 'import', 'import'],
        ['Add Module Folder…', sc('addFolder'), 'addFolder', 'folder'],
        ['Show Imported Modules Folder', '', 'modulesFolder'],
        ['Rescan Modules', sc('rescan'), 'rescan', 'refresh'],
        '-',
        ['Export Topics…', '', 'exportTopics', 'import'],
        ['Print the Library Topic', '', 'printTopic', 'print'],
        ['Options…', sc('options'), 'options', 'gear'],
        ['Print…', 'Ctrl+P', 'print', 'print'],
        '-',
        ['Exit', 'Alt+F4', 'quit'],
      ]],
      ['View', 'v', [
        ['Bible Search', sc('search'), 'search', 'search'],
        ['Book Search', sc('bookSearch'), 'bookSearch', 'book'],
        ['Read Aloud: Voices…', '', 'voices', 'speaker'],
        ['Clipboard Monitor', '', 'clipmon', 'copy'],
        ['Go to Reference', sc('goto'), 'goto'],
        ['Copy Verses…', sc('copyVerses'), 'copyVerses', 'copy'],
        ['Daily Readings', '', 'daily', 'study'],
        '-',
        ['Toolbar: Go-to Box', '', 'tb:tbGoto'],
        ['Toolbar: Prev / Next Chapter', '', 'tb:tbPrevNext'],
        '-',
        ['Reset Panel Layout', '', 'resetLayout', 'layout'],
        '-',
        ['Developer Tools', sc('devtools'), 'devtools'],
      ]],
      ['Help', 'h', [
        ['User Guide', sc('guide'), 'guide', 'book'],
        ['Keyboard Shortcuts', '', 'keys', 'keyboard'],
        '-',
        ['About Timotheos', '', 'about'],
      ]],
    ];
  }

  let open = null;

  function build() {
    const bar = $('#tbMenus');
    if (!bar) return;
    const menus = getMenus();
    bar.innerHTML = menus.map(([name], i) => {
      const lbl = tr(name);
      return `<div class="tmwrap"><button class="tmenu" data-i="${i}" aria-haspopup="true"><u>${lbl[0]}</u>${lbl.slice(1)}</button><div class="menu tmdrop hidden" data-i="${i}"></div></div>`;
    }).join('');
    bar.querySelectorAll('.tmdrop').forEach(d => {
      const items = menus[+d.dataset.i][2];
      const ti = window.toolbarItemsState ? window.toolbarItemsState() : {};
      d.innerHTML = items.map(it => {
        if (it === '-') return '<div class="msep"></div>';
        const isTb = String(it[2] || '').startsWith('tb:');
        const tbKey = isTb ? it[2].slice(3) : '';
        const icHtml = isTb ? (ti[tbKey] !== false ? TimotheosIcons.icon('check', 14) : '') : (it[3] ? TimotheosIcons.icon(it[3], 15) : '');
        return `<button data-cmd="${it[2]}"><span class="tmic">${icHtml}</span><span class="tml">${tr(it[0])}</span>${it[1] ? `<kbd>${it[1]}</kbd>` : ''}</button>`;
      }).join('');
      d.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => { close(); if (b.dataset.cmd.startsWith('tb:') && window.setToolbarItem) window.setToolbarItem(b.dataset.cmd.slice(3)); else window.runCommand(b.dataset.cmd); });
    });
    bar.querySelectorAll('.tmenu').forEach(b => {
      b.onclick = e => { e.stopPropagation(); const i = +b.dataset.i; if (open === i) close(); else show(i); };
      b.onmouseenter = () => { if (open != null && open !== +b.dataset.i) show(+b.dataset.i); };
    });
  }
  function show(i) {
    close();
    const d = document.querySelector(`.tmdrop[data-i="${i}"]`); if (!d) return;
    d.classList.remove('hidden');
    document.querySelector(`.tmenu[data-i="${i}"]`).classList.add('on');
    open = i;
    const first = d.querySelector('button'); if (first) first.focus();
  }
  function close() {
    document.querySelectorAll('.tmdrop').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.tmenu.on').forEach(b => b.classList.remove('on'));
    open = null;
  }

  function keyName(e) {
    const k = e.key === ' ' ? 'space' : e.key.toLowerCase();
    return (e.ctrlKey ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey && !(e.key.length === 1 && !e.ctrlKey && !e.altKey) ? 'shift+' : '') + k;
  }
  function matchShortcut(e) {
    const kn = keyName(e);
    const cur = window.TimotheosOptions && TimotheosOptions.shortcuts ? TimotheosOptions.shortcuts() : {};
    const MENU_CMDS = ['import', 'addFolder', 'rescan', 'search', 'bookSearch', 'goto', 'copyVerses', 'guide', 'options', 'devtools'];
    for (const cmd of MENU_CMDS) {
      if (cur[cmd] && cur[cmd].toLowerCase() === kn) return cmd;
    }
    return null;
  }
  function wireKeys() {
    document.addEventListener('keydown', e => {
      const menus = getMenus();
      if (open != null) {
        const d = document.querySelector(`.tmdrop[data-i="${open}"]`); const items = [...d.querySelectorAll('button')]; const at = items.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); return; }
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); show((open + (e.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length); return; }
      }
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const i = menus.findIndex(m => m[1] === e.key.toLowerCase());
        if (i >= 0) { e.preventDefault(); e.stopPropagation(); show(i); return; }
      }
      if (e.target && e.target.classList && e.target.classList.contains('rec')) return; // recording a shortcut
      const cmd = matchShortcut(e); if (!cmd) return;
      const dialogOpen = !$('#modal').classList.contains('hidden') || !$('#optionsDlg').classList.contains('hidden') || !$('#propsDlg').classList.contains('hidden');
      if (dialogOpen && cmd !== 'devtools') return;
      e.preventDefault(); e.stopPropagation();
      window.runCommand(cmd);
    }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Alt') document.body.classList.add('altkeys'); });
    document.addEventListener('keyup', e => { if (e.key === 'Alt') document.body.classList.remove('altkeys'); });
    document.addEventListener('mousedown', e => { if (open != null && !e.target.closest('.tmwrap')) close(); });
    window.addEventListener('blur', close);
  }

  /** colour Windows' own min/max/close buttons like the skin */
  let last = '';
  function sync() {
    const cs = getComputedStyle(document.documentElement);
    const color = cs.getPropertyValue('--tool').trim(), symbolColor = cs.getPropertyValue('--tooltext').trim();
    const sig = color + symbolColor; if (sig === last) return; last = sig;
    if (api.setTitleBar && color) api.setTitleBar({ color, symbolColor, dark: document.documentElement.dataset.theme === 'dark' }).catch(() => {});
  }

  function init() { build(); wireKeys(); sync(); new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin', 'style'] }); }
  window.TimotheosTitlebar = { init, rebuild: build, sync, close };
})();
