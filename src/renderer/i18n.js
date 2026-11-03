'use strict';
/* [E1] UI Localization: English ('en') and Tagalog / Filipino ('fil').
 * Translates toolbar buttons, menus, panel captions, Options tabs, and common labels live without reload. */
(function () {
  const TL = {
    // Menus
    'File': 'Talaksan',
    'View': 'Tingnan',
    'Help': 'Tulong',
    'New User Module…': 'Bagong Sariling Modyul…',
    'Import Modules…': 'Mag-import ng mga Modyul…',
    'Add Module Folder…': 'Magdagdag ng Folder ng Modyul…',
    'Show Imported Modules Folder': 'Buksan ang Folder ng mga Na-import',
    'Rescan Modules': 'I-scan Muli ang mga Modyul',
    'Export Topics…': 'I-export ang mga Paksa…',
    'Print the Library Topic': 'I-print ang Paksa sa Aklatan',
    'Options…': 'Mga Opsyon…',
    'Print…': 'I-print…',
    'Exit': 'Lumabas',
    'Bible Search': 'Paghahanap sa Bibliya',
    'Book Search': 'Paghahanap sa Aklat',
    'Compare the Verse': 'Ihambing ang Talata',
    'Read Aloud: Voices…': 'Basahin nang Malakas: Mga Tinig…',
    'Clipboard Monitor': 'Bantay-Clipboard',
    'Go to Reference': 'Pumunta sa Talata',
    'Copy Verses…': 'Kopyahin ang mga Talata…',
    'Daily Readings': 'Pang-araw-araw na Pagbasa',
    'Reading Focus': 'Pokus sa Pagbasa',
    'Reset Panel Layout': 'Ibalik ang Ayos ng mga Panel',
    'Developer Tools': 'Kasangkapan ng Developer',
    'User Guide': 'Gabay sa Paggamit',
    'Keyboard Shortcuts': 'Mga Shortcut sa Keyboard',
    'About Timotheos': 'Tungkol sa Timotheos',
    // Toolbar
    'Search': 'Hanapin',
    'Copy': 'Kopyahin',
    'Print': 'I-print',
    'Import': 'Mag-import',
    'Panels': 'Mga Panel',
    'Focus': 'Pokus',
    'Skin': 'Tema',
    'Options': 'Mga Opsyon',
    // Dock Panel Titles
    'Bibles': 'Mga Bibliya',
    'Books & chapters': 'Mga Aklat at Kabanata',
    'Modules': 'Mga Modyul',
    'Lookup': 'Saliksik',
    'Commentary': 'Komentaryo',
    'Library': 'Aklatan',
    'Bible search': 'Paghahanap sa Bibliya',
    'Book search': 'Paghahanap sa Aklat',
    'My Study': 'Aking Pag-aaral',
    'Compare': 'Ihambing',
    // Study segments & buttons
    'Verse lists': 'Listahan ng Talata',
    'Notes': 'Mga Tala',
    'Bookmarks': 'Mga Bookmark',
    'Reading': 'Pagbasa',
    'Verses': 'Mga Talata',
    'By book': 'Ayon sa Aklat',
    'Statistics': 'Estadistika',
    'Find': 'Hanapin',
    'Import modules…': 'Mag-import ng modyul…',
    'New user module…': 'Bagong sariling modyul…',
    // Options navigation
    'Skin & colours': 'Tema at Kulay',
    'Fonts': 'Mga Font',
    'Verse numbers': 'Bilang ng Talata',
    'Layout & toolbar': 'Ayos at Toolbar',
    'Modules': 'Mga Modyul',
    'Shortcuts': 'Mga Shortcut',
    'Done': 'Tapos Na',
    'Reset appearance': 'Ibalik ang dating anyo',
    // Categories
    'Commentaries': 'Mga Komentaryo',
    'Dictionaries': 'Mga Diksyunaryo',
    'Books': 'Mga Aklat',
    'Devotionals': 'Mga Debosyonal',
    'Maps & images': 'Mga Mapa at Larawan',
    'Reading plans': 'Mga Plano sa Pagbasa',
    'Old Testament': 'Lumang Tipan',
    'New Testament': 'Bagong Tipan',
    'Apocrypha': 'Apokripa',
  };

  const REV = Object.fromEntries(Object.entries(TL).map(([en, tl]) => [tl, en]));

  function lang() {
    return (window.state && state.settings && state.settings.lang) || 'en';
  }

  function t(str, lg = lang()) {
    if (!str) return str;
    const en = REV[str] || str;
    return lg === 'fil' ? (TL[en] || str) : en;
  }

  function apply(lg = lang()) {
    document.documentElement.lang = lg === 'fil' ? 'fil' : 'en';
    // Toolbar labels
    for (const [sel, en] of [
      ['#viewBtn .lbl', 'View'], ['#searchBtn .lbl', 'Search'], ['#copyBtn .lbl', 'Copy'],
      ['#printBtn .lbl', 'Print'], ['#importBtn2 .lbl', 'Import'], ['#panelsBtn .lbl', 'Panels'],
      ['#focusBtn .lbl', 'Focus'], ['#skinBtn .lbl', 'Skin'], ['#optionsBtn .lbl', 'Options'],
      ['#importBtn', 'Import modules…'], ['#newUserModBtn', 'New user module…'],
      ['#searchForm button[type="submit"]', 'Find'], ['#bsFind', 'Find'],
      ['#optDone', 'Done'], ['#optReset', 'Reset appearance'],
    ]) {
      const el = document.querySelector(sel);
      if (el) el.textContent = t(en, lg);
    }
    const refIn = document.getElementById('refInput');
    if (refIn) refIn.placeholder = lg === 'fil' ? 'Pumunta sa… (hal. Jn 3:16, Tob 1)' : 'Go to… (e.g. Jn 3:16, Tob 1)';
    // Study segments
    for (const [s, en] of [['lists', 'Verse lists'], ['notes', 'Notes'], ['marks', 'Bookmarks'], ['plans', 'Reading']]) {
      const b = document.querySelector(`#studySeg button[data-s="${s}"]`);
      if (b) b.textContent = t(en, lg);
    }
    // Search result tabs
    for (const [s, en] of [['res', 'Verses'], ['books', 'By book'], ['stats', 'Statistics']]) {
      const b = document.querySelector(`#searchTabs button[data-st="${s}"]`);
      if (b) b.textContent = t(en, lg);
    }
    // Options nav buttons
    for (const [o, en] of [['look', 'Skin & colours'], ['fonts', 'Fonts'], ['vnum', 'Verse numbers'], ['layout', 'Layout & toolbar'], ['mods', 'Modules'], ['keys', 'Shortcuts']]) {
      const b = document.querySelector(`#optNav button[data-o="${o}"]`);
      if (b) {
        const svg = b.querySelector('svg');
        b.textContent = t(en, lg);
        if (svg) b.prepend(svg);
      }
    }
    // Dock panel tabs
    if (window.TimotheosDock) {
      for (const p of TimotheosDock.panels()) {
        p.baseTitle = p.baseTitle || p.title;
        p.title = t(p.baseTitle, lg);
      }
      document.querySelectorAll('.dtab[data-id]').forEach(btn => {
        const sp = btn.querySelector('span');
        const p = TimotheosDock.panels().find(x => x.id === btn.dataset.id);
        if (sp && p) sp.textContent = p.title;
      });
    }
    if (window.TimotheosTitlebar && TimotheosTitlebar.rebuild) TimotheosTitlebar.rebuild();
  }

  window.TimotheosI18n = { t, apply, lang, TL };
})();
