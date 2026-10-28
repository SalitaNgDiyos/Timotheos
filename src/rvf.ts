// RichView (RVF) entries, as stored by theWord in many user-made book modules (content.type=rvf).
// Written from TRichView's public RVF specification (trichview.com/help/rvf_specification.html) and the
// Delphi component-stream layout it uses for styles; tested on real modules. Read only: text with its
// bold/italic/underline/colour/size, paragraphs (alignment, indents), links, bookmarks, tabs, pictures
// (PNG, JPEG, GIF, BMP) and tables. Anything else is left out quietly.

interface TStyle { font?: string; size?: number; b?: boolean; i?: boolean; u?: boolean; s?: boolean; color?: string; back?: string; jump?: boolean; sup?: 'sup' | 'sub' }
interface PStyle { align?: string; first?: number; left?: number; right?: number; before?: number; after?: number }
export interface RvfStyles { text: TStyle[]; para: PStyle[] }

const COLORS: Record<string, string> = { clBlack: '#000', clMaroon: '#800000', clGreen: '#008000', clOlive: '#808000', clNavy: '#000080', clPurple: '#800080', clTeal: '#008080', clGray: '#808080', clSilver: '#c0c0c0', clRed: '#f00', clLime: '#0f0', clYellow: '#ff0', clBlue: '#00f', clFuchsia: '#f0f', clAqua: '#0ff', clWhite: '#fff', clMoneyGreen: '#c0dcc0', clSkyBlue: '#a6caf0', clCream: '#fffbf0', clMedGray: '#a0a0a4' };
const PLAINFONT = /^(arial|tahoma|segoe ui|times new roman|verdana|calibri|ms sans serif|microsoft sans serif|courier new)$/i;
const win1252 = new TextDecoder('windows-1252'), utf8 = new TextDecoder('utf-8'), utf16 = new TextDecoder('utf-16le');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ---------------------------------------------------------------- Delphi component streams (styles) */
class DReader {
  constructor(public b: Uint8Array, public i = 0) {}
  u8() { return this.b[this.i++]; }
  i32() { const v = this.b[this.i] | (this.b[this.i + 1] << 8) | (this.b[this.i + 2] << 16) | (this.b[this.i + 3] << 24); this.i += 4; return v; }
  sstr() { const n = this.u8(); const s = win1252.decode(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
  /** one value: numbers, strings, identifiers, sets, booleans, binary, lists and collections */
  value(): unknown {
    const t = this.u8();
    switch (t) {
      case 0: case 13: return null;
      case 1: { const out: unknown[] = []; while (this.b[this.i] !== 0 && this.i < this.b.length) out.push(this.value()); this.i++; return out; }
      case 2: { const v = (this.b[this.i] << 24) >> 24; this.i++; return v; }
      case 3: { const v = ((this.b[this.i] | (this.b[this.i + 1] << 8)) << 16) >> 16; this.i += 2; return v; }
      case 4: return this.i32();
      case 5: this.i += 10; return 0;
      case 6: case 7: return this.sstr();
      case 8: return false;
      case 9: return true;
      case 10: { const n = this.i32(); const v = this.b.subarray(this.i, this.i + n); this.i += n; return v; }
      case 11: { const out: string[] = []; for (;;) { const s = this.sstr(); if (!s) break; out.push(s); } return out; }
      case 12: case 20: { const n = this.i32(); const v = (t === 20 ? utf8 : win1252).decode(this.b.subarray(this.i, this.i + n)); this.i += n; return v; }
      case 14: return this.collection();
      case 15: this.i += 4; return 0;
      case 16: case 17: case 19: this.i += 8; return 0;
      case 18: { const n = this.i32(); const v = utf16.decode(this.b.subarray(this.i, this.i + 2 * n)); this.i += 2 * n; return v; }
      default: throw new Error('unknown value type ' + t);
    }
  }
  props(): Record<string, unknown> { const o: Record<string, unknown> = {}; while (this.i < this.b.length && this.b[this.i] !== 0) { const k = this.sstr(); o[k] = this.value(); } this.i++; return o; }
  collection(): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    while (this.i < this.b.length && this.b[this.i] !== 0) { const t = this.u8(); if (t === 2 || t === 3 || t === 4) { this.i -= 1; this.value(); continue; } if (t !== 1) break; out.push(this.props()); }
    this.i++; return out;
  }
}
const colorOf = (v: unknown): string | undefined => {
  if (typeof v === 'string') return COLORS[v];
  if (typeof v === 'number' && v >= 0) { const r = v & 255, g = (v >> 8) & 255, b = (v >> 16) & 255; return `rgb(${r},${g},${b})`; }
  return undefined;
};
function textStyles(b: Uint8Array): TStyle[] {
  const r = new DReader(b); if (r.u8() !== 14) return [];
  return r.collection().map(p => {
    const st = (p.Style as string[]) || [];
    const sss = String(p.SubSuperScriptType || '');
    return { font: p.FontName as string | undefined, size: typeof p.Size === 'number' ? p.Size : undefined, b: st.includes('fsBold'), i: st.includes('fsItalic'), u: st.includes('fsUnderline'), s: st.includes('fsStrikeOut'),
      color: colorOf(p.Color), back: colorOf(p.BackColor), jump: p.Jump === true, sup: /Super/.test(sss) ? 'sup' : /Sub/.test(sss) ? 'sub' : undefined };
  });
}
function paraStyles(b: Uint8Array): PStyle[] {
  const r = new DReader(b); if (r.u8() !== 14) return [];
  return r.collection().map(p => ({ align: ({ rvaCenter: 'center', rvaRight: 'right', rvaJustify: 'justify' } as Record<string, string>)[String(p.Alignment || '')], first: p.FirstIndent as number, left: p.LeftIndent as number, right: p.RightIndent as number, before: p.SpaceBefore as number, after: p.SpaceAfter as number }));
}

/* ---------------------------------------------------------------- the RVF records */
export function looksRvf(b: Uint8Array): boolean { return b.length > 4 && b[0] === 0x2d && b[1] === 0x38 && b[2] === 0x20; } // "-8 "
/** RVF bytes → HTML. Styles come from the document (nested documents, e.g. table cells, use their parent's) */
export function rvfToHtml(b: Uint8Array, inherited?: RvfStyles): string {
  const styles: RvfStyles = inherited ? { text: inherited.text, para: inherited.para } : { text: [], para: [] };
  const n = b.length; let i = 0;
  const line = (): Uint8Array => { let j = i; while (j < n && !(b[j] === 13 && b[j + 1] === 10) && b[j] !== 10) j++; const out = b.subarray(i, j); i = j < n ? (b[j] === 13 ? j + 2 : j + 1) : n; return out; };
  const binary = (): Uint8Array => { const sz = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24); const out = b.subarray(i + 4, i + 4 + sz); i += 4 + sz; return out; };
  const uniPara = (): string => { let j = i; while (j + 1 < n && !(b[j] === 0x29 && b[j + 1] === 0x20)) j += 2; const s = utf16.decode(b.subarray(i, j)); i = Math.min(n, j + 2); if (b[i] === 13 && b[i + 1] === 10) i += 2; return s; };
  let out = ''; let open = false;
  const startPara = (p: number) => {
    if (open) out += '</p>';
    const ps = styles.para[p] || {}; const css: string[] = [];
    if (ps.align) css.push('text-align:' + ps.align);
    if (ps.left) css.push(`margin-left:${ps.left}px`); if (ps.right) css.push(`margin-right:${ps.right}px`);
    if (ps.first) css.push(`text-indent:${ps.first}px`);
    if (ps.before) css.push(`margin-top:${ps.before}px`); if (ps.after != null) css.push(`margin-bottom:${ps.after}px`);
    out += `<p class="rvp"${css.length ? ` style="${css.join(';')}"` : ''}>`; open = true;
  };
  const textOf = (s: string, st: number, tag: string) => {
    const t = styles.text[st] || {}; const css: string[] = [];
    if (t.b) css.push('font-weight:bold'); if (t.i) css.push('font-style:italic');
    if (t.u || t.s) css.push(`text-decoration:${t.u ? 'underline' : ''} ${t.s ? 'line-through' : ''}`.trim());
    if (t.color && t.color !== '#000' && !t.jump) css.push('color:' + t.color);
    if (t.back && t.back !== '#fff') css.push('background:' + t.back);
    if (t.size && t.size !== 10) css.push(`font-size:${Math.round(t.size * 10)}%`);
    if (t.font && !PLAINFONT.test(t.font)) css.push(`font-family:'${t.font.replace(/['"<>]/g, '')}'`);
    let h = esc(s);
    if (t.sup) h = `<${t.sup}>${h}</${t.sup}>`;
    if (css.length) h = `<span style="${css.join(';')}">${h}</span>`;
    if (t.jump && tag) h = `<a href="${esc(tag)}">${h}</a>`;
    return h;
  };
  const tagOf = (rest: string): string => { const m = /^"((?:[^"]|"")*)"/.exec(rest.trim()); return m ? m[1].replace(/""/g, '"').replace(/\x01/g, '\r').replace(/\x02/g, '\n') : ''; };
  let anchor = '';
  line(); // the version line ("-8 1 3")
  let guard = 0;
  while (i < n && guard++ < 1e6) {
    const h = win1252.decode(line()); if (!h.trim()) continue;
    const m = /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) ?(.*)$/s.exec(h); if (!m) break;
    const type = +m[1], cnt = +m[2], para = +m[3], opt = +m[4], query = +m[5]; const rest = m[6];
    const newPara = para >= 0 && !(opt & 1);
    const restParts = rest.split(' ');
    if (type >= 0) { // text
      const tag = tagOf(rest);
      for (let k = 0; k < cnt; k++) {
        let s: string;
        if ((opt & 8) && query === 0) s = uniPara();
        else if (query === 3) { const hx = win1252.decode(line()); const bytes = new Uint8Array(hx.length / 2); for (let q = 0; q < bytes.length; q++) bytes[q] = parseInt(hx.substr(q * 2, 2), 16); s = utf16.decode(bytes); }
        else s = win1252.decode(line());
        if (k === 0) { if (newPara || !open) startPara(Math.max(0, para)); else if (opt & 4) out += '<br>'; } else startPara(Math.max(0, para));
        if (anchor) { out += `<a class="bkm" id="bkm:${esc(anchor)}"></a>`; anchor = ''; }
        out += textOf(s, type, tag);
      }
      continue;
    }
    // non-text records
    const lines: (Uint8Array | null)[] = [];
    for (let k = 0; k < cnt; k++) lines.push(query === 2 && k === cnt - 1 ? binary() : line());
    if (type === -9) { // document properties: 1 text styles, 2 paragraph styles
      const kind = +restParts[restParts.length - 1] || +rest;
      try { const data = lines[cnt - 1]; if (data && kind === 1) styles.text = textStyles(data); if (data && kind === 2) styles.para = paraStyles(data); } catch { /* styles not understood: plain text */ }
      continue;
    }
    if (type === -2) { anchor = win1252.decode(lines[0] || new Uint8Array()).trim(); continue; } // checkpoint (bookmark)
    if (newPara || !open) startPara(Math.max(0, para)); else if (opt & 4) out += '<br>';
    if (type === -12) { out += ' '; continue; } // tab
    if (type === -1) { out += '<hr>'; continue; }      // break
    if (type === -3 || type === -10 || type === -4) { // picture, hot picture, hotspot
      const data = lines[cnt - 1]; if (data && query === 2) { const img = imageUrl(data); if (img) out += `<img class="rtfimg" src="${img}" alt="">`; }
      continue;
    }
    if (type === -60 && query === 2) { const data = lines[cnt - 1]; if (data) { if (open) { out += '</p>'; open = false; } out += table(data, styles); } continue; }
  }
  if (open) out += '</p>';
  return out;
}
function imageUrl(data: Uint8Array): string {
  for (const off of [0, 4, 8]) {
    const d = data.subarray(off);
    const kind = d[0] === 0x89 && d[1] === 0x50 ? 'png' : d[0] === 0xff && d[1] === 0xd8 ? 'jpeg' : d[0] === 0x47 && d[1] === 0x49 ? 'gif' : d[0] === 0x42 && d[1] === 0x4d ? 'bmp' : '';
    if (kind) { let s = ''; for (let k = 0; k < d.length; k += 0x8000) s += String.fromCharCode(...d.subarray(k, k + 0x8000)); return `data:image/${kind};base64,${btoa(s)}`; }
  }
  return '';
}
/** a table: a Delphi stream whose cells hold small RVF documents ("C.Data") */
function table(data: Uint8Array, styles: RvfStyles): string {
  // columns: the integer pair after the "C" collection marker; cells: every "C.Data" in order
  const cells: string[] = []; let cols = 0;
  const s = win1252.decode(data);
  const mc = /\x01C\x02([\s\S])\x02([\s\S])/.exec(s); if (mc) cols = mc[2].charCodeAt(0);
  const key = 'C.Data\n';
  for (let p = s.indexOf(key); p >= 0; p = s.indexOf(key, p + key.length)) {
    const at = p + key.length; const len = data[at] | (data[at + 1] << 8) | (data[at + 2] << 16) | (data[at + 3] << 24);
    const inner = data.subarray(at + 4, at + 4 + len);
    const sz = inner[0] | (inner[1] << 8) | (inner[2] << 16) | (inner[3] << 24);
    const doc = sz > 0 && sz <= inner.length - 4 ? inner.subarray(4, 4 + sz) : inner;
    try { cells.push(rvfToHtml(doc, styles)); } catch { cells.push(''); }
  }
  if (!cells.length) return '';
  if (!cols || cells.length % cols) cols = cells.length % 2 === 0 && cells.length > 2 ? 2 : 1;
  let h = '<table class="rvtable">';
  for (let r = 0; r < cells.length; r += cols) h += '<tr>' + cells.slice(r, r + cols).map(c => `<td>${c}</td>`).join('') + '</tr>';
  return h + '</table>';
}
