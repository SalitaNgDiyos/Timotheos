// The Options window: skin, Bible text font, size, line spacing, text width, background, verse numbers.
import { SKINS, applySkin } from './skins';
import { dialog, esc } from './ui';

export interface Look {
  fontText: string; lineH: number; textWidth: number; bgMode: 'skin' | 'color'; bgColor: string; texture: 'none' | 'paper';
  vnPos: 'margin' | 'inline' | 'hidden'; vnStyle: 'normal' | 'bold' | 'circle'; capColor: boolean;
}
export const LOOK: Look = { fontText: 'Gentium Plus', lineH: 1.65, textWidth: 0, bgMode: 'skin', bgColor: '#fffdf8', texture: 'none', vnPos: 'margin', vnStyle: 'normal', capColor: true };
const BUNDLED = ['Gentium Plus', 'Literata', 'Source Serif 4', 'Inter', 'Noto Serif Hebrew'];
const COMMON = ['Cambria', 'Constantia', 'Georgia', 'Palatino Linotype', 'Book Antiqua', 'Times New Roman', 'Segoe UI', 'Calibri', 'Verdana', 'Noto Serif', 'DejaVu Serif', 'Liberation Serif', 'Roboto'];
let installed: string[] | null = null;

export function applyLook(skin: string, size: number, l: Look): void {
  applySkin(skin);
  const r = document.documentElement.style;
  r.setProperty('--size', size + 'px');
  r.setProperty('--lh', String(l.lineH));
  r.setProperty('--font-text', `'TwGreek', '${l.fontText.replace(/'/g, '')}', 'Gentium Plus', Georgia, serif`);
  r.setProperty('--textw', l.textWidth ? l.textWidth + 'px' : 'none');
  if (l.bgMode === 'color') r.setProperty('--textbg', l.bgColor);
  const d = document.documentElement.dataset; d.texture = l.texture; d.vnpos = l.vnPos; d.vnstyle = l.vnStyle; d.caps = l.capColor ? 'color' : 'plain';
}

/** the Options window; calls change() after every change so the screen follows at once */
export async function optionsDialog(st: { skin: string; fontSize: number; look: Look }, change: (rerender: boolean) => void): Promise<void> {
  if (!installed) { try { const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts; if (q) installed = [...new Set((await q()).map(f => f.family))].sort(); } catch { installed = null; } }
  const fonts = (cur: string) => `<optgroup label="Included with Tanglaw">${BUNDLED.map(f => `<option${f === cur ? ' selected' : ''}>${esc(f)}</option>`).join('')}</optgroup><optgroup label="${installed ? 'Installed on this computer' : 'Common fonts (if installed)'}">${(installed || COMMON).filter(f => !BUNDLED.includes(f)).map(f => `<option${f === cur ? ' selected' : ''}>${esc(f)}</option>`).join('')}</optgroup>`;
  const l = st.look; const sk = SKINS[st.skin] || SKINS.parchment;
  const html = `<div class="opts">
    <h4>Skin</h4><div class="skins">${Object.entries(SKINS).map(([id, s]) => `<button data-skin="${id}" class="skin${id === st.skin ? ' on' : ''}" title="${s.name}"><span style="background:linear-gradient(135deg, ${s.v.textbg} 0 55%, ${s.v['cap-bible']} 55% 78%, ${s.v.tool} 78%)"></span>${s.name}</button>`).join('')}</div>
    <label class="ck"><input type="checkbox" id="oCap" ${l.capColor ? 'checked' : ''}> Coloured captions</label>
    <h4>Bible text</h4>
    <label class="fl">Font <select id="oFont">${fonts(l.fontText)}</select></label>
    <label class="fl">Size <span class="srow"><input type="range" id="oSize" min="12" max="34" value="${st.fontSize}"><b id="oSizeV">${st.fontSize} px</b></span></label>
    <label class="fl">Line spacing <span class="srow"><input type="range" id="oLh" min="1.2" max="2.4" step="0.05" value="${l.lineH}"><b id="oLhV">${l.lineH.toFixed(2)}</b></span></label>
    <label class="fl">Text width <select id="oW"><option value="0">Fill the window</option><option value="680">Narrow</option><option value="860">Medium</option><option value="1100">Wide</option></select></label>
    <label class="fl">Background <span class="srow"><select id="oBg"><option value="skin">Skin colour</option><option value="color">My colour</option></select><input type="color" id="oBgC" value="${l.bgMode === 'color' ? l.bgColor : sk.v.textbg}"><select id="oTex"><option value="none">No texture</option><option value="paper">Paper</option></select></span></label>
    <h4>Verse numbers</h4>
    <label class="fl">Where <select id="oVp"><option value="margin">In a column at the left</option><option value="inline">In the text</option><option value="hidden">Hidden</option></select></label>
    <label class="fl">Style <select id="oVs"><option value="normal">Normal</option><option value="bold">Bold</option><option value="circle">In a circle</option></select></label>
    <p class="small">${installed ? `${installed.length} fonts found on this computer.` : 'This system does not let Tanglaw list its fonts, so common ones are offered.'} The fonts “Included with Tanglaw” work everywhere.</p></div>`;
  await dialog('Options', html, [{ label: 'Done', value: 'ok', primary: true }], b => {
    const q = <T extends HTMLElement>(s: string) => b.querySelector(s) as T;
    q<HTMLSelectElement>('#oW').value = String(l.textWidth); q<HTMLSelectElement>('#oBg').value = l.bgMode; q<HTMLSelectElement>('#oTex').value = l.texture;
    q<HTMLSelectElement>('#oVp').value = l.vnPos; q<HTMLSelectElement>('#oVs').value = l.vnStyle;
    b.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach(x => x.onclick = () => { st.skin = x.dataset.skin!; b.querySelectorAll('.skin').forEach(y => y.classList.toggle('on', y === x)); change(false); });
    q<HTMLInputElement>('#oCap').onchange = () => { l.capColor = q<HTMLInputElement>('#oCap').checked; change(false); };
    q<HTMLSelectElement>('#oFont').onchange = () => { l.fontText = q<HTMLSelectElement>('#oFont').value; change(false); };
    q<HTMLInputElement>('#oSize').oninput = () => { st.fontSize = +q<HTMLInputElement>('#oSize').value; q('#oSizeV').textContent = st.fontSize + ' px'; change(false); };
    q<HTMLInputElement>('#oLh').oninput = () => { l.lineH = +q<HTMLInputElement>('#oLh').value; q('#oLhV').textContent = l.lineH.toFixed(2); change(false); };
    q<HTMLSelectElement>('#oW').onchange = () => { l.textWidth = +q<HTMLSelectElement>('#oW').value; change(false); };
    q<HTMLSelectElement>('#oBg').onchange = () => { l.bgMode = q<HTMLSelectElement>('#oBg').value as Look['bgMode']; change(false); };
    q<HTMLInputElement>('#oBgC').oninput = () => { l.bgMode = 'color'; l.bgColor = q<HTMLInputElement>('#oBgC').value; q<HTMLSelectElement>('#oBg').value = 'color'; change(false); };
    q<HTMLSelectElement>('#oTex').onchange = () => { l.texture = q<HTMLSelectElement>('#oTex').value as Look['texture']; change(false); };
    q<HTMLSelectElement>('#oVp').onchange = () => { l.vnPos = q<HTMLSelectElement>('#oVp').value as Look['vnPos']; change(true); };
    q<HTMLSelectElement>('#oVs').onchange = () => { l.vnStyle = q<HTMLSelectElement>('#oVs').value as Look['vnStyle']; change(false); };
  });
}
