'use strict';
// RTF -> HTML converter for theWord dictionary/commentary/book entries and e-Sword modules.
// Handles: groups, font/colour tables, paragraph formatting (\pard, \li, \lin, \fi, \ri, \rin,
// \sb, \sa, \ql, \qc, \qr, \qj, \ilvl), character formatting (\b \i \ul \strike \super \sub \scaps
// \fsN \cfN \highlightN), \par (paragraphs), \line (soft line breaks), \tab (tab stops),
// leading/multiple space preservation, \'xx with per-font code pages, \uN (with \ucN),
// HYPERLINK fields, \bkmkstart bookmarks, \pict images, and preserve.fonts rules.

const CHARSET_CP = { 0: 'windows-1252', 1: 'windows-1252', 161: 'windows-1253', 162: 'windows-1254', 163: 'windows-1258', 177: 'windows-1255', 178: 'windows-1256', 186: 'windows-1257', 204: 'windows-1251', 238: 'windows-1250', 222: 'windows-874' };
const decoders = {};
function dec(cp) { return decoders[cp] || (decoders[cp] = new TextDecoder(cp)); }

// ordinary text fonts: their letters are Unicode, so Timotheos's own fonts are used instead (unless preserve.fonts=1)
const PLAIN_FONT = /^(times|arial|tahoma|segoe|calibri|cambria|verdana|georgia|courier|consolas|ms sans serif|microsoft sans serif|ms shell|system|helvetica|lucida|palatino|book antiqua|garamond|gentium|cardo|sbl |ezra sil|noto|dejavu|liberation|symbol$|wingdings|trebuchet|century|franklin|candara|constantia|corbel|default|times new roman)/i;
const SKIP_DEST = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'header', 'footer',
  'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata',
  'colorschememapping', 'datastore', 'latentstyles', 'pgdsctbl', 'revtbl', 'filetbl',
  'pn', 'pnseclvl', 'pntxta', 'pntxtb', 'bkmkend', 'formfield', 'datafield',
]);

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function keepFont(name, opts) {
  if (!name) return false;
  if (opts && opts.preserveFonts) return true;
  if (opts && Array.isArray(opts.preserveFontsList) && opts.preserveFontsList.length) {
    const low = name.toLowerCase();
    if (opts.preserveFontsList.some(f => low === f || low.startsWith(f))) return true;
  }
  return !PLAIN_FONT.test(name);
}

/** Preserve leading spaces (at start of line/paragraph) and runs of 2+ spaces so space-indented entries keep their layout */
function preserveSpaces(s, atLineStart) {
  if (!s) return '';
  let res = s;
  if (atLineStart && res.startsWith(' ')) {
    res = res.replace(/^ +/, m => '\u00a0'.repeat(m.length));
  }
  res = res.replace(/ {2,}/g, m => '\u00a0'.repeat(m.length - 1) + ' ');
  return res;
}

function rtfToHtml(rtf, opts = {}) {
  if (!rtf) return '';
  rtf = String(rtf);
  const inlineMode = !!opts.inline;
  const fonts = {}; const colors = [null];
  // pre-scan font table for charsets
  const ft = rtf.match(/\{\\fonttbl([\s\S]*?)\}\s*(?:\{\\colortbl|\\|\{\\\*)/);
  if (ft) for (const m of ft[1].matchAll(/\\f(\d+)[^;{}]*?\\fcharset(\d+)/g)) fonts[m[1]] = CHARSET_CP[+m[2]] || 'windows-1252';
  // font names: a "special" font or one preserved via preserve.fonts(.list) is kept as font-family
  const families = {};
  if (ft) for (const m of ft[1].matchAll(/\{?\\f(\d+)((?:\\[a-z]+-?\d* ?)*)\s*([^;{}\\]+?)\s*;/g)) { const name = m[3].trim(); if (keepFont(name, opts)) families[m[1]] = name; }
  // RTF fragments without a font table (e-Sword entries): the caller may say which code page each font uses
  else if (opts.fragmentFonts) Object.assign(fonts, opts.fragmentFonts);
  const ct = rtf.match(/\{\\colortbl\s*;?([^}]*)\}/);
  if (ct) for (const part of ct[1].split(';')) {
    const r = /\\red(\d+)/.exec(part), g = /\\green(\d+)/.exec(part), b = /\\blue(\d+)/.exec(part);
    if (r || g || b) colors.push(`rgb(${r ? r[1] : 0},${g ? g[1] : 0},${b ? b[1] : 0})`);
  }
  const defaultColors = opts.colors || {};

  let paras = [];
  let out = ''; // current paragraph buffer (or full buffer in inlineMode)
  let baseFs = null;
  let st = {
    b: 0, i: 0, u: 0, s: 0, sup: 0, sub: 0, scaps: 0,
    cf: 0, cb: 0, f: null, fs: null, uc: 1, skip: 0,
    li: 0, ri: 0, fi: 0, sb: 0, sa: 0, align: '', ilvl: 0,
  };
  const stack = [];
  let open = ''; // currently open span signature
  let pendingBytes = [];
  let field = null; // {inst:'', result:''}
  let atLineStart = true;

  const effFs = st => (st.fs && (st.fs > 25 || st.fs < 18)) ? st.fs : '';
  const sig = () => `${st.b}${st.i}${st.u}${st.s}${st.sup}${st.sub}${st.scaps}|${st.cf}|${st.cb}|${effFs(st)}|${st.f !== null && families[st.f] ? st.f : ''}`;

  function emitText(t) {
    if (st.skip || !t) return;
    if (field && field.inInst) { field.inst += t; return; }
    if (baseFs === null && st.fs && !st.sup && !st.sub) baseFs = st.fs;
    const formatted = preserveSpaces(t, atLineStart);
    atLineStart = false;
    const s = sig();
    if (s !== open) {
      if (open) out += '</span>';
      const css = [];
      if (st.b) css.push('font-weight:bold');
      if (st.i) css.push('font-style:italic');
      if (st.u || st.s) css.push('text-decoration:' + [st.u ? 'underline' : '', st.s ? 'line-through' : ''].join(' ').trim());
      if (st.scaps) css.push('font-variant:small-caps');
      if (st.sup) css.push('vertical-align:super;font-size:75%');
      else if (st.sub) css.push('vertical-align:sub;font-size:75%');
      else if (st.fs && (st.fs > 25 || st.fs < 18)) {
        const pct = Math.max(75, Math.min(200, Math.round((st.fs / 22) * 100)));
        css.push(`font-size:${pct}%`);
      }
      const col = st.cf ? (defaultColors[st.cf] || colors[st.cf]) : null;
      if (col) css.push('color:' + col);
      const bg = st.cb ? colors[st.cb] : null;
      if (bg && bg !== 'rgb(255,255,255)') css.push('background-color:' + bg);
      if (st.f !== null && families[st.f]) css.push(`font-family:'${families[st.f].replace(/['"<>]/g, '')}'`);
      out += css.length ? `<span style="${css.join(';')}">` : '<span>';
      open = s;
    }
    out += esc(formatted);
  }

  function flushBytes() {
    if (!pendingBytes.length) return;
    const cp = (st.f !== null && fonts[st.f]) || opts.codepage || 'windows-1252';
    emitText(dec(cp).decode(new Uint8Array(pendingBytes)));
    pendingBytes = [];
  }

  function closeSpan() { if (open) { out += '</span>'; open = ''; } }

  function paraStyleAttr() {
    const css = [];
    if (st.align && st.align !== 'left') css.push(`text-align:${st.align}`);
    let leftTwips = st.li || (st.ilvl > 0 ? st.ilvl * 360 : 0);
    const firstTwips = st.fi || 0;
    if (leftTwips + firstTwips < 0) leftTwips = -firstTwips; // prevent negative hanging indent from clipping off left edge
    const leftPx = Math.round(leftTwips / 15);
    const rightPx = Math.round((st.ri || 0) / 15);
    const firstPx = Math.round(firstTwips / 15);
    const topPx = Math.round((st.sb || 0) / 15);
    const botPx = Math.round((st.sa || 0) / 15);
    if (leftPx) css.push(`margin-left:${leftPx}px`);
    if (rightPx > 0) css.push(`margin-right:${rightPx}px`);
    if (firstPx) css.push(`text-indent:${firstPx}px`);
    if (topPx > 0) css.push(`margin-top:${topPx}px`);
    if (botPx > 0) css.push(`margin-bottom:${botPx}px`);
    return css.length ? ` style="${css.join(';')}"` : '';
  }

  function flushPara(isExplicitPar) {
    closeSpan();
    if (inlineMode) {
      if (isExplicitPar) { out += '<br>'; atLineStart = true; }
      return;
    }
    const content = out;
    out = '';
    atLineStart = true;
    const hasVisible = content.replace(/<a class="bkm"[^>]*><\/a>/g, '').trim().length > 0;
    const hasBkm = content.includes('class="bkm"');
    if (hasVisible || hasBkm) {
      paras.push(`<p class="rtfp"${paraStyleAttr()}>${content}</p>`);
    } else if (isExplicitPar && paras.length > 0) {
      // Preserve intentional blank paragraphs between sections (avoiding more than 2 consecutive blank lines)
      if (!paras[paras.length - 1].includes('rtf-blank')) {
        paras.push(`<p class="rtfp rtf-blank"><br></p>`);
      }
    }
  }

  let i = 0; const n = rtf.length; let ucSkip = 0;
  while (i < n) {
    const ch = rtf[i];
    if (ch === '{' && (rtf.startsWith('\\pict', i + 1) || rtf.startsWith('\\*\\shppict', i + 1))) {
      // a picture: PNG and JPEG pictures become images (other kinds, e.g. Windows metafiles, are left out)
      let d = 0, j = i;
      for (; j < n; j++) { const c = rtf[j]; if (c === '\\') { j++; continue; } if (c === '{') d++; else if (c === '}' && --d === 0) break; }
      const grp = rtf.slice(i, j + 1); i = j + 1;
      const kind = /\\(pngblip|jpegblip)/.exec(grp);
      if (kind && !st.skip) {
        const pict = grp.slice(grp.indexOf(kind[0]));
        const body = pict.replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[^0-9a-f]/gi, '');
        const end = body.length - (body.length % 2); let bin = '';
        for (let k = 0; k < end; k += 2) bin += String.fromCharCode(parseInt(body.substr(k, 2), 16));
        const wg = /\\picwgoal(\d+)/.exec(pict), sx = /\\picscalex(\d+)/.exec(pict);
        const w = wg ? Math.round(+wg[1] / 15 * (sx ? +sx[1] / 100 : 1)) : 0;
        const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
        if (bin.length > 16) { closeSpan(); out += `<img class="rtfimg" src="data:image/${kind[1] === 'pngblip' ? 'png' : 'jpeg'};base64,${b64}"${w ? ` style="width:${w}px"` : ''} alt="">`; atLineStart = false; }
      }
      continue;
    }
    if (ch === '{') {
      flushBytes();
      stack.push({ ...st, fieldDepth: field ? field.depth : null });
      i++;
      // destination?
      const m = /^\\\*?\\?([a-z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (rtf.startsWith('\\*', i)) {
        const m2 = /^\\\*\\([a-z]+)/.exec(rtf.slice(i, i + 40));
        if (m2 && m2[1] === 'fldinst' && field) { field.inInst = true; field.instDepth = stack.length; }
        else if (m2 && m2[1] === 'bkmkstart') {
          // a bookmark (the target of a topic link): an anchor in the text
          const e = rtf.indexOf('}', i); const name = rtf.slice(i + m2[0].length, e).trim();
          if (name && !st.skip) { closeSpan(); out += `<a class="bkm" id="bkm:${esc(name).replace(/"/g, '')}"></a>`; }
          st.skip = 1;
        }
        else st.skip = 1;
      } else if (m && SKIP_DEST.has(m[1])) st.skip = 1;
      else if (m && m[1] === 'field') { field = { inst: '', depth: stack.length, start: null }; }
      else if (m && m[1] === 'fldrslt' && field) { closeSpan(); field.resStart = out.length; field.resDepth = stack.length; }
      continue;
    }
    if (ch === '}') {
      flushBytes();
      const depth = stack.length;
      if (field && field.inInst && depth === field.instDepth) field.inInst = false;
      if (field && field.resDepth === depth) {
        closeSpan();
        const inner = out.slice(field.resStart);
        const hm = /HYPERLINK\s+"([^"]*)"/.exec(field.inst) || /HYPERLINK\s+(\S+)/.exec(field.inst);
        if (hm) out = out.slice(0, field.resStart) + `<a href="${esc(hm[1])}">${inner}</a>`;
        field.resDepth = -1;
      }
      if (field && depth === field.depth) field = null;
      const prev = stack.pop();
      if (prev) {
        delete prev.fieldDepth;
        // Note: in RTF, when paragraph properties (\pard, \li, \fi, etc.) are set inside the main document group,
        // restoring a parent group pops st. Keep paragraph state if we are still inside the same open paragraph
        // and the group was only an inline character run (like {\b word}).
        const hadInlineText = out.length > 0;
        const keepPara = hadInlineText && !st.skip ? { li: st.li, ri: st.ri, fi: st.fi, sb: st.sb, sa: st.sa, align: st.align, ilvl: st.ilvl } : null;
        st = prev;
        if (keepPara && prev.li === 0 && prev.fi === 0 && !prev.align) Object.assign(st, keepPara);
      }
      i++; continue;
    }
    if (ch === '\\') {
      const nx = rtf[i + 1];
      if (nx === "'") {
        const hex = rtf.substr(i + 2, 2);
        if (ucSkip > 0) { ucSkip--; i += 4; continue; }
        if (!st.skip) pendingBytes.push(parseInt(hex, 16));
        i += 4; continue;
      }
      if (nx === '\\' || nx === '{' || nx === '}') { flushBytes(); emitText(nx); i += 2; continue; }
      if (nx === '~') { flushBytes(); emitText('\u00a0'); i += 2; continue; }
      if (nx === '-' || nx === '_') { i += 2; continue; }
      if (nx === '\n' || nx === '\r') {
        flushBytes();
        if (!st.skip) { closeSpan(); out += '<br>'; atLineStart = true; }
        i += (nx === '\r' && rtf[i + 2] === '\n') ? 3 : 2;
        continue;
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
      if (!m) { i++; continue; }
      flushBytes();
      const word = m[1], arg = m[2] !== undefined ? +m[2] : null;
      i += m[0].length;
      switch (word) {
        case 'b': st.b = arg === 0 ? 0 : 1; break;
        case 'i': st.i = arg === 0 ? 0 : 1; break;
        case 'ul': st.u = arg === 0 ? 0 : 1; break;
        case 'ulnone': st.u = 0; break;
        case 'strike': st.s = arg === 0 ? 0 : 1; break;
        case 'scaps': st.scaps = arg === 0 ? 0 : 1; break;
        case 'super': st.sup = 1; st.sub = 0; break;
        case 'sub': st.sub = 1; st.sup = 0; break;
        case 'nosupersub': st.sup = st.sub = 0; break;
        case 'plain': st.b = st.i = st.u = st.s = st.sup = st.sub = st.scaps = 0; st.cf = 0; st.cb = 0; st.fs = baseFs; break;
        case 'cf': st.cf = arg || 0; break;
        case 'highlight':
        case 'cb':
        case 'cbpat':
        case 'chcbpat': st.cb = arg || 0; break;
        case 'f': st.f = arg; break;
        case 'fs': st.fs = arg || null; break;
        case 'uc': st.uc = arg !== null ? arg : 1; break;
        // Paragraph formatting controls
        case 'pard':
          st.li = 0; st.ri = 0; st.fi = 0; st.sb = 0; st.sa = 0; st.align = ''; st.ilvl = 0;
          break;
        case 'li':
        case 'lin': st.li = arg || 0; break;
        case 'ri':
        case 'rin': st.ri = arg || 0; break;
        case 'fi': st.fi = arg || 0; break;
        case 'sb': st.sb = arg || 0; break;
        case 'sa': st.sa = arg || 0; break;
        case 'ilvl': st.ilvl = arg || 0; break;
        case 'ql': st.align = 'left'; break;
        case 'qc': st.align = 'center'; break;
        case 'qr': st.align = 'right'; break;
        case 'qj': st.align = 'justify'; break;
        case 'u': {
          let cp = arg; if (cp < 0) cp += 65536;
          // Handle UTF-16 surrogate pairs (\u-10187?\u-9216?)
          if (cp >= 0xD800 && cp <= 0xDBFF) {
            let tmpSkip = st.uc;
            let k = i;
            while (tmpSkip > 0 && k < n) {
              if (rtf[k] === '\\' && rtf[k + 1] === "'") { k += 4; tmpSkip--; }
              else if (rtf[k] === '\\' || rtf[k] === '{' || rtf[k] === '}') break;
              else { k++; tmpSkip--; }
            }
            const mLow = /^\\u(-?\d+) ?/.exec(rtf.slice(k, k + 20));
            if (mLow) {
              let low = +mLow[1]; if (low < 0) low += 65536;
              if (low >= 0xDC00 && low <= 0xDFFF) {
                i = k + mLow[0].length;
                emitText(String.fromCodePoint(((cp - 0xD800) << 10) + (low - 0xDC00) + 0x10000));
                ucSkip = st.uc;
                while (ucSkip > 0 && i < n) {
                  if (rtf[i] === '\\' && rtf[i + 1] === "'") { i += 4; ucSkip--; }
                  else if (rtf[i] === '\\' || rtf[i] === '{' || rtf[i] === '}') break;
                  else { i++; ucSkip--; }
                }
                ucSkip = 0;
                break;
              }
            }
          }
          emitText(String.fromCharCode(cp)); ucSkip = st.uc;
          // skip the fallback characters immediately following
          while (ucSkip > 0 && i < n) {
            if (rtf[i] === '\\' && rtf[i + 1] === "'") { i += 4; ucSkip--; }
            else if (rtf[i] === '\\' || rtf[i] === '{' || rtf[i] === '}') break;
            else { i++; ucSkip--; }
          }
          ucSkip = 0; break;
        }
        case 'par':
        case 'sect':
        case 'row':
          if (!st.skip) flushPara(true);
          break;
        case 'line':
          if (!st.skip) { closeSpan(); out += '<br>'; atLineStart = true; }
          break;
        case 'tab':
        case 'cell':
          if (!st.skip) { closeSpan(); out += '<span class="rtftab">\u2003</span>'; atLineStart = false; }
          break;
        case 'emdash': emitText('\u2014'); break;
        case 'endash': emitText('\u2013'); break;
        case 'lquote': emitText('\u2018'); break;
        case 'rquote': emitText('\u2019'); break;
        case 'ldblquote': emitText('\u201c'); break;
        case 'rdblquote': emitText('\u201d'); break;
        case 'bullet': emitText('\u2022'); break;
        default: break;
      }
      continue;
    }
    if (ch === '\r' || ch === '\n') { i++; continue; }
    flushBytes();
    // plain text run
    let j = i;
    while (j < n && !'\\{}\r\n'.includes(rtf[j])) j++;
    emitText(rtf.slice(i, j));
    i = j;
  }
  flushBytes();
  if (inlineMode) {
    closeSpan();
    return out.replace(/^(<br>)+|(<br>)+$/g, '');
  }
  flushPara(false);
  // Trim trailing blank paragraphs
  while (paras.length && paras[paras.length - 1].includes('rtf-blank')) paras.pop();
  return paras.join('');
}

function isRtf(s) { return /^\s*\{\\rtf/.test(s); }

module.exports = { rtfToHtml, isRtf, keepFont };
