'use strict';
/* A finer icon set for the phone skins: thin 1.5 px lines with a soft second tone (the shapes marked class="d" are filled with the
 * line colour at low strength). Original artwork. It replaces the entries of TimotheosIcons.ICONS and redraws the icons already
 * on the screen, so the old flat icons are never seen on a skin. */
(function () {
  const NEW = {
    back: '<path d="M10 6 4 12l6 6M4.5 12h15"/>', forward: '<path d="m14 6 6 6-6 6M19.5 12h-15"/>',
    prev: '<path d="m14.5 6-6 6 6 6"/>', next: '<path d="m9.5 6 6 6-6 6"/>', up: '<path d="m6 14.5 6-6 6 6"/>', down: '<path d="m6 9.5 6 6 6-6"/>',
    prevBook: '<path d="M6 5.5v13M18 6l-8 6 8 6z"/>', nextBook: '<path d="M18 5.5v13M6 6l8 6-8 6z"/>',
    grid: '<rect class="d" x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
    pin: '<path class="d" d="M12 20.5s-6-5-6-9.6a6 6 0 1 1 12 0c0 4.6-6 9.6-6 9.6z"/><path d="M12 20.5s-6-5-6-9.6a6 6 0 1 1 12 0c0 4.6-6 9.6-6 9.6z"/><circle cx="12" cy="11" r="2.2"/>',
    outline: '<path d="M9 6h11M9 12h11M9 18h11"/><circle class="d" cx="4.8" cy="6" r="1.4"/><circle cx="4.8" cy="6" r="1.4"/><circle cx="4.8" cy="12" r="1.4"/><circle cx="4.8" cy="18" r="1.4"/>',
    history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9"/><path d="M12 8v4.3l3 1.8"/>',
    bible: '<path class="d" d="M6.5 3.8H18v14.7H6.5A1.5 1.5 0 0 0 5 20z"/><path d="M5 5.3A1.5 1.5 0 0 1 6.5 3.8H18v14.7H6.5A1.5 1.5 0 0 0 5 20zM5 20a1.5 1.5 0 0 0 1.5 1.5H18v-3M11.5 7v6M9 9.5h5"/>',
    book: '<path class="d" d="M3.5 5.5c2.8-.9 5.6-.6 8.5 1.2v12.6c-2.9-1.8-5.7-2.1-8.5-1.2z"/><path d="M12 6.7c2.9-1.8 5.7-2.1 8.5-1.2v12.6c-2.8-.9-5.6-.6-8.5 1.2M12 6.7C9.1 4.9 6.3 4.6 3.5 5.5v12.6c2.8-.9 5.6-.6 8.5 1.2zM12 6.7v12.6"/>',
    textDown: '<path d="M3.5 18 8 6l4.5 12M5.2 13.8h5.6M15.5 12h5"/>', textUp: '<path d="M3.5 18 8 6l4.5 12M5.2 13.8h5.6M15.5 12h5M18 9.5v5"/>',
    info: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
    compress: '<path class="d" d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8-4 8 4v10l-8 4-8-4zM12 3v18M9 9l3 3 3-3M9 15l3-3 3 3"/>',
    sidebar: '<rect class="d" x="3.5" y="4.5" width="7" height="15" rx="2"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M10.5 4.5v15"/>',
    edit: '<path class="d" d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7z"/><path d="M4.5 19.5h3.8L19 8.8 15.2 5 4.5 15.7zM13.3 6.9l3.8 3.8"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    tree: '<path d="M5 5h4M5 12h4M5 19h4M9 5h10M12 12h7M12 19h7"/><path d="M7 5v14"/>',
    library: '<path class="d" d="M4 4.5h3.5v15H4z"/><path d="M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5zM15.2 5.6l3.3-1 3 14.4-3.3 1z"/><path d="M4 8h3.5M9.5 8H13"/>',
    lookup: '<rect class="d" x="4" y="3.5" width="16" height="17" rx="2.5"/><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 15.5 10.5 8l2.5 7.5M8.8 13.2h3.4M15 9.5c1.3 0 2 .8 2 2v4"/>',
    commentary: '<path class="d" d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4zM8 9.5h8M8 12.5h5"/>',
    toc: '<circle class="d" cx="5" cy="6.5" r="1.5"/><circle cx="5" cy="6.5" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="5" cy="17.5" r="1.5"/><path d="M10 6.5h9.5M10 12h9.5M10 17.5h6"/>',
    search: '<circle class="d" cx="10.5" cy="10.5" r="6"/><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    study: '<path class="d" d="M6 3.5h9l3.5 3.5v13.5H6z"/><path d="M6 3.5h9l3.5 3.5v13.5H6zM15 3.5V7h3.5M9 11h6.5M9 14h6.5M9 17h4"/>',
    eye: '<path class="d" d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z"/><path d="M2.5 12s3.4-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.4 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    panels: '<rect class="d" x="3.5" y="4.5" width="17" height="15" rx="2.5"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15M9.5 13h11"/>',
    layout: '<rect class="d" x="3.5" y="3.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="3.5" width="7" height="9" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.8"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.8"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.8"/>',
    gear: '<circle class="d" cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    palette: '<path class="d" d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-2.9 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.8-3.7c0-3.6-3.7-6.5-8.2-6.5z"/><path d="M12 3.8a8.2 8.2 0 1 0 0 16.4c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-2.9 0-1 .8-1.6 1.8-1.6h2.1a3.7 3.7 0 0 0 3.8-3.7c0-3.6-3.7-6.5-8.2-6.5z"/><circle cx="8" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.6" r="1" fill="currentColor"/><circle cx="14.7" cy="7.8" r="1" fill="currentColor"/>',
    print: '<path d="M7 9V4h10v5"/><rect class="d" x="4" y="9" width="16" height="7.5" rx="2"/><rect x="4" y="9" width="16" height="7.5" rx="2"/><path d="M7 14h10v6H7z"/>',
    copy: '<rect class="d" x="8" y="8" width="11.5" height="11.5" rx="2.5"/><rect x="8" y="8" width="11.5" height="11.5" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    import: '<path class="d" d="M4 14.5h4.5l1.5 2.5h4l1.5-2.5H20v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 14.5h4.5l1.5 2.5h4l1.5-2.5H20v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 3.5v9M8.5 9l3.5 3.5L15.5 9"/>',
    grip: '<circle cx="9" cy="6" r="1.1" fill="currentColor"/><circle cx="15" cy="6" r="1.1" fill="currentColor"/><circle cx="9" cy="12" r="1.1" fill="currentColor"/><circle cx="15" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="18" r="1.1" fill="currentColor"/><circle cx="15" cy="18" r="1.1" fill="currentColor"/>',
    float: '<rect class="d" x="8" y="3.5" width="12.5" height="10.5" rx="2"/><rect x="8" y="3.5" width="12.5" height="10.5" rx="2"/><path d="M5 8.5h-.5A1.5 1.5 0 0 0 3 10v9.5A1.5 1.5 0 0 0 4.5 21H14a1.5 1.5 0 0 0 1.5-1.5V19"/>',
    dockIn: '<rect class="d" x="14.5" y="3.5" width="6" height="17" rx="2"/><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M14.5 3.5v17M10 9l3 3-3 3"/>',
    max: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', restore: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    folder: '<path class="d" d="M3.5 6.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="M3.5 6.5a2 2 0 0 1 2-2h3.8l2 2.2h7.2a2 2 0 0 1 2 2v8.3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    refresh: '<path d="M5 9.5a7.3 7.3 0 0 1 12.9-2.6L19.5 9M19 14.5a7.3 7.3 0 0 1-12.9 2.6L4.5 15M19.5 4.5V9H15M4.5 19.5V15H9"/>',
    type: '<path d="M4.5 7V5.5h15V7M9.5 19.5h5M12 5.5v14"/>', hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
    image: '<rect class="d" x="3.5" y="4.5" width="17" height="15" rx="2.5"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 15.5-4.5-4.5-8.5 8.5"/>',
    puzzle: '<path class="d" d="M10 3.5h4v3a1.5 1.5 0 0 0 3 0v-1h3v5h-1a1.5 1.5 0 0 0 0 3h1v6h-6v-1a1.5 1.5 0 0 0-3 0v1H4v-6h1a1.5 1.5 0 0 0 0-3H4v-5h6z"/><path d="M10 3.5h4v3a1.5 1.5 0 0 0 3 0v-1h3v5h-1a1.5 1.5 0 0 0 0 3h1v6h-6v-1a1.5 1.5 0 0 0-3 0v1H4v-6h1a1.5 1.5 0 0 0 0-3H4v-5h6z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    dots: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    keyboard: '<rect class="d" x="2.5" y="6" width="19" height="12" rx="2.5"/><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    fontColor: '<path d="M5.5 16 12 4l6.5 12M8 12h8"/><path d="M5 20h14" stroke-width="2.4" opacity=".55"/>',
    verseBg: '<rect class="d" x="3.5" y="6.5" width="17" height="6.5" rx="1.8"/><rect x="3.5" y="6.5" width="17" height="6.5" rx="1.8"/><path d="M5.5 17h13M5.5 20h8"/>',
    highlighter: '<path class="d" d="m9 15 7.6-9.4a2 2 0 0 1 2.9-.3 2 2 0 0 1 .3 2.9L12 15.6z"/><path d="m9 15 7.6-9.4a2 2 0 0 1 2.9-.3 2 2 0 0 1 .3 2.9L12 15.6zM9 15l-1.5 3.5L11 17M3.5 20.5h17"/>',
    underline: '<path d="M7 4.5v6a5 5 0 0 0 10 0v-6M5 20h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    speaker: '<path class="d" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    stop: '<rect class="d" x="6" y="6" width="12" height="12" rx="2"/><rect x="6" y="6" width="12" height="12" rx="2"/>',
    read: '<path class="d" d="M5 5.5c2.5-.7 5-.4 7 1v13c-2-1.4-4.5-1.7-7-1z"/><path d="M12 6.5c2-1.4 4.5-1.7 7-1v13c-2.5-.7-5-.4-7 1M12 6.5c-2-1.4-4.5-1.7-7-1v13c2.5-.7 5-.4 7 1zM12 6.5v13"/>',
    split: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path class="d" d="M4 12h16v6a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18z"/><path d="M4 12h16"/>',
    drawerR: '<rect class="d" x="13.5" y="4.5" width="7" height="15" rx="2"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M13.5 4.5v15"/>',
    tune: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="d" cx="15" cy="7" r="2.2"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
    cmd: '<rect class="d" x="3.5" y="6" width="17" height="12" rx="3"/><rect x="3.5" y="6" width="17" height="12" rx="3"/><path d="m7.5 10 2.5 2-2.5 2M12 14h4.5"/>',
    chevL: '<path d="m14.5 6-6 6 6 6"/>', chevR: '<path d="m9.5 6 6 6-6 6"/>', chevD: '<path d="m6 9.5 6 6 6-6"/>', chevU: '<path d="m6 14.5 6-6 6 6"/>',
    fwd: '<path d="m14 6 6 6-6 6M19.5 12h-15"/>', more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor"/>',
    play: '<path class="d" d="M7.5 5.2v13.6L19 12z"/><path d="M7.5 5.2v13.6L19 12z"/>',
    pause: '<rect class="d" x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/>',
    prevv: '<path d="M6.5 5.5v13M18 6l-8 6 8 6z"/>', nextv: '<path d="M17.5 5.5v13M6 6l8 6-8 6z"/>',
    highlight: '<path class="d" d="m9 15 7.6-9.4a2 2 0 0 1 2.9-.3 2 2 0 0 1 .3 2.9L12 15.6z"/><path d="m9 15 7.6-9.4a2 2 0 0 1 2.9-.3 2 2 0 0 1 .3 2.9L12 15.6zM9 15l-1.5 3.5L11 17M3.5 20.5h17"/>',
    compare: '<rect class="d" x="3.5" y="4.5" width="7.5" height="15" rx="2"/><rect x="3.5" y="4.5" width="7.5" height="15" rx="2"/><rect x="13" y="4.5" width="7.5" height="15" rx="2"/><path d="M6 9h2.5M6 12h2.5M15.5 9H18M15.5 12H18"/>',
    xref: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    note: '<path class="d" d="M5 4.5h14v9.5l-5 5.5H5z"/><path d="M5 4.5h14v9.5l-5 5.5H5zM14 19.5V14h5M8.5 9h7M8.5 12h4"/>',
    lexicon: '<rect class="d" x="4" y="3.5" width="16" height="17" rx="2.5"/><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 15.5 10.5 8l2.5 7.5M8.8 13.2h3.4M15 9.5c1.3 0 2 .8 2 2v4M17 13c-.3-.6-1-.9-1.7-.9-1 0-1.6.6-1.6 1.6s.7 1.7 1.6 1.7c.8 0 1.4-.4 1.7-1"/>',
    layers: '<path class="d" d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m12 4 8.5 4.5L12 13 3.5 8.5zM3.5 12.2 12 16.7l8.5-4.5M3.5 15.8 12 20.3l8.5-4.5"/>',
    text: '<path d="M3.5 18 8 6l4.5 12M5.2 13.8h5.6M15 11.2c.6-.7 1.4-1 2.3-1 1.6 0 2.5 1 2.5 2.6V18M19.8 14.5c-.6-.4-1.3-.6-2-.6-1.4 0-2.4.8-2.4 2.1 0 1.2.9 2 2.2 2 1 0 1.8-.5 2.2-1.3"/>',
    bookmark: '<path class="d" d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/><path d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/>',
    calendar: '<rect class="d" x="4" y="5.5" width="16" height="14.5" rx="2.5"/><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 13.5h2M14 13.5h2M8 16.5h2"/>',
    guide: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.6v.6M12 17v.2"/>',
    sync: '<path d="M5 9.5a7.3 7.3 0 0 1 12.9-2.6L19.5 9M19 14.5a7.3 7.3 0 0 1-12.9 2.6L4.5 15M19.5 4.5V9H15M4.5 19.5V15H9"/>',
    clipboard: '<rect class="d" x="5" y="4.5" width="14" height="16" rx="2.5"/><rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 4.5V3.8c0-.4.3-.8.8-.8h4.4c.5 0 .8.4.8.8v.7M9 10h6M9 13.5h6M9 17h3.5"/>',
    star: '<path class="d" d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/><path d="m12 4 2.4 5 5.4.7-4 3.7 1 5.4L12 16.2 7.2 18.8l1-5.4-4-3.7 5.4-.7z"/>',
    drawerL: '<rect class="d" x="3.5" y="4.5" width="7" height="15" rx="2"/><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M10.5 4.5v15"/>',
    select: '<path d="M5 4.5h2M5 19.5h2M17 4.5h2M17 19.5h2M4.5 5v2M19.5 5v2M4.5 17v2M19.5 17v2"/><path d="M9 9h6M9 12h6M9 15h3"/>',
    study2: '<path class="d" d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/><path d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/>'
  };
  let installed = false, swapObs = null;
  function install() {
    if (installed || !window.TimotheosIcons) return; installed = true;
    const I = TimotheosIcons, old = Object.assign({}, I.ICONS), rev = new Map();
    const norm = h => { const t = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); t.innerHTML = h; return t.innerHTML; };   // the browser writes the same artwork back differently from how it was typed
    for (const [k, v] of Object.entries(old)) { const n = norm(v); if (!rev.has(n)) rev.set(n, k); }
    Object.assign(I.ICONS, NEW);
    const swap = svg => {                                  // an icon already drawn: find its name from its old artwork and draw it again
      const n = rev.get(svg.innerHTML); if (n && NEW[n]) svg.innerHTML = NEW[n];
    };
    const all = root => root.querySelectorAll && root.querySelectorAll('svg.ic').forEach(swap);
    all(document);
    swapObs = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; if (n.matches && n.matches('svg.ic')) swap(n); all(n); } });
    swapObs.observe(document.documentElement, { childList: true, subtree: true });
    document.documentElement.classList.add('fineicons');
  }
  window.TimotheosSkinIcons = { install, NEW };
})();
