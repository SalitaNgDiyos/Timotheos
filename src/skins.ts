// The eight skins of Tanglaw (same values as the Electron version).
export const SKINS: Record<string, { name: string; dark: boolean; v: Record<string, string> }> = {
    parchment: { name: 'Parchment', dark: false, v: {
      bg: '#f7f5f0', panel: '#efece5', card: '#fffdf8', line: '#ddd7cb', text: '#24221f', muted: '#6f6a60', accent: '#8a5a12', 'accent-soft': '#f1e3c8',
      woj: '#b3261e', added: '#5d5850', strong: '#2f6fb0', morph: '#7a4fa0', sel: '#fff1c9', heading: '#3b3428', fn: '#2f6fb0',
      textbg: '#fffdf8', tool: '#ebe6db', tooltext: '#2c2822', 'cap-bible': '#8a5a12', 'cap-lib': '#5e6b2f', 'cap-cmt': '#a2501f', 'cap-dict': '#6b4a91', 'cap-search': '#2f6a8a', 'cap-study': '#9a3d5c', captext: '#ffffff', tex: 'rgba(90,60,20,.05)' } },
    office: { name: 'Office Blue', dark: false, v: {
      bg: '#eef2f7', panel: '#e4eaf2', card: '#ffffff', line: '#cdd6e2', text: '#1d2633', muted: '#5b6676', accent: '#2a63b8', 'accent-soft': '#dde8f8',
      woj: '#c0262d', added: '#566070', strong: '#2a63b8', morph: '#7a4fa0', sel: '#fff3c4', heading: '#1d2a40', fn: '#2a63b8',
      textbg: '#ffffff', tool: '#dfe7f2', tooltext: '#1d2633', 'cap-bible': '#2a63b8', 'cap-lib': '#3d7f5a', 'cap-cmt': '#c2662a', 'cap-dict': '#6f4fb0', 'cap-search': '#1f8496', 'cap-study': '#b0436d', captext: '#ffffff', tex: 'rgba(30,60,110,.045)' } },
    sampaguita: { name: 'Sampaguita', dark: false, v: {
      bg: '#f4f6f1', panel: '#ecf0e8', card: '#ffffff', line: '#dde3da', text: '#1d2420', muted: '#5a645c', accent: '#2f7d4f', 'accent-soft': '#e1f0e6',
      woj: '#b3261e', added: '#56605a', strong: '#2f64a3', morph: '#7448ae', sel: '#fff6d6', heading: '#1d2a22', fn: '#2f64a3',
      textbg: '#ffffff', tool: '#ffffff', tooltext: '#1d2420', 'cap-bible': '#2f7d4f', 'cap-lib': '#5b7a2a', 'cap-cmt': '#b0541a', 'cap-dict': '#7448ae', 'cap-search': '#2f64a3', 'cap-study': '#a83e64', captext: '#ffffff', tex: 'rgba(40,90,50,.045)' } },
    narra: { name: 'Narra', dark: false, v: {
      bg: '#f1e8dc', panel: '#eadfcf', card: '#fffaf2', line: '#e0d2bf', text: '#2e2218', muted: '#6a5948', accent: '#9c5b22', 'accent-soft': '#f4e3cf',
      woj: '#a3271e', added: '#5e4f40', strong: '#355e8c', morph: '#74466f', sel: '#fbebc8', heading: '#3b2a1e', fn: '#355e8c',
      textbg: '#fffaf2', tool: '#3b2a1e', tooltext: '#f6ebdd', 'cap-bible': '#7a4518', 'cap-lib': '#5f6b2c', 'cap-cmt': '#9c5b22', 'cap-dict': '#74466f', 'cap-search': '#355e8c', 'cap-study': '#8e3b3b', captext: '#fff8ee', tex: 'rgba(110,60,20,.06)' } },
    sepia: { name: 'Sepia', dark: false, v: {
      bg: '#efe4cf', panel: '#e8dcc4', card: '#f8efdc', line: '#d8c8a8', text: '#3a2e1f', muted: '#6e5f49', accent: '#8b5e2b', 'accent-soft': '#ead7b3',
      woj: '#9e2a1c', added: '#5f513e', strong: '#3d5f80', morph: '#6c4a7a', sel: '#f6e2a6', heading: '#3a2e1f', fn: '#3d5f80',
      textbg: '#f8efdc', tool: '#e3d4b6', tooltext: '#3a2e1f', 'cap-bible': '#8b5e2b', 'cap-lib': '#6b6a2e', 'cap-cmt': '#9a5530', 'cap-dict': '#6c4a7a', 'cap-search': '#3d5f80', 'cap-study': '#8e4253', captext: '#fffaf0', tex: 'rgba(100,70,30,.07)' } },
    slate: { name: 'Slate', dark: true, v: {
      bg: '#1d1f23', panel: '#23262b', card: '#272a30', line: '#393d45', text: '#e6e2d9', muted: '#a29d93', accent: '#e2b36a', 'accent-soft': '#3d3426',
      woj: '#ff8a80', added: '#b9b2a6', strong: '#8ab8f0', morph: '#c9a6f0', sel: '#3b3523', heading: '#efe6d2', fn: '#8ab8f0',
      textbg: '#202227', tool: '#16181b', tooltext: '#e6e2d9', 'cap-bible': '#6b5326', 'cap-lib': '#4a5a2e', 'cap-cmt': '#7a4526', 'cap-dict': '#55407a', 'cap-search': '#2d5870', 'cap-study': '#743650', captext: '#f4efe6', tex: 'rgba(255,255,255,.025)' } },
    midnight: { name: 'Midnight', dark: true, v: {
      bg: '#0f1522', panel: '#141b2b', card: '#1a2234', line: '#2a3550', text: '#e4e9f5', muted: '#9aa6bf', accent: '#7aa7ff', 'accent-soft': '#1f2d4d',
      woj: '#ff9a8f', added: '#b5bfd4', strong: '#8fc0ff', morph: '#d0a8ff', sel: '#2b3350', heading: '#f0f3fa', fn: '#8fc0ff',
      textbg: '#131a29', tool: '#0b101b', tooltext: '#e4e9f5', 'cap-bible': '#2c4a86', 'cap-lib': '#2f5a4a', 'cap-cmt': '#7a4a2a', 'cap-dict': '#4f3c86', 'cap-search': '#235f75', 'cap-study': '#6e3256', captext: '#f2f5fc', tex: 'rgba(255,255,255,.025)' } },
    dusk: { name: 'Dusk', dark: true, v: {
      bg: '#12161c', panel: '#171c24', card: '#1c222c', line: '#2c3441', text: '#e5e9ef', muted: '#9ea8b6', accent: '#5ed1b5', 'accent-soft': '#173a33',
      woj: '#ff9189', added: '#b3bcc8', strong: '#8bb6f5', morph: '#c7a2ff', sel: '#2a2f22', heading: '#f1f4f8', fn: '#8bb6f5',
      textbg: '#161b22', tool: '#0f1318', tooltext: '#e5e9ef', 'cap-bible': '#1f6b5c', 'cap-lib': '#4a6130', 'cap-cmt': '#7d4a24', 'cap-dict': '#56408a', 'cap-search': '#2b5d84', 'cap-study': '#7a3552', captext: '#f1f4f8', tex: 'rgba(255,255,255,.025)' } }
  };
export function applySkin(id: string): void {
  const sk = SKINS[id] || SKINS.parchment;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(sk.v)) root.style.setProperty('--' + k, v);
  root.dataset.theme = sk.dark ? 'dark' : 'light';
  root.dataset.skin = id;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', sk.v.tool);
}
