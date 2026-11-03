'use strict';
// RichView (RVF) entries, as stored by theWord in dictionary, commentary, and book modules (content.type=rvf).
// Written from TRichView's public RVF specification (trichview.com/help/rvf_specification.html) and the
// Delphi component-stream layout it uses for styles; tested on real modules. Read only: text with its
// bold/italic/underline/colour/size, paragraphs (alignment, indents, spacing, blank lines), lists (-11),
// links, bookmarks, tabs, pictures (PNG, JPEG, GIF, BMP) and tables.
const COLORS = {
  clBlack: "#000", clMaroon: "#800000", clGreen: "#008000", clOlive: "#808000",
  clNavy: "#000080", clPurple: "#800080", clTeal: "#008080", clGray: "#808080",
  clSilver: "#c0c0c0", clRed: "#f00", clLime: "#0f0", clYellow: "#ff0",
  clBlue: "#00f", clFuchsia: "#f0f", clAqua: "#0ff", clWhite: "#fff",
  clMoneyGreen: "#c0dcc0", clSkyBlue: "#a6caf0", clCream: "#fffbf0",
  clMedGray: "#a0a0a4", clWindowText: "inherit", clWindow: "transparent",
  clInfoBk: "#ffffe1", clBtnFace: "#f0f0f0", clHighlight: "#3399ff",
};
const PLAINFONT = /^(arial|tahoma|segoe ui|times new roman|verdana|calibri|ms sans serif|microsoft sans serif|courier new)$/i;
const win1252 = new TextDecoder("windows-1252"), utf8 = new TextDecoder("utf-8"), utf16 = new TextDecoder("utf-16le");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function keepRvfFont(name, opts) {
  if (!name) return false;
  if (opts && opts.preserveFonts) return true;
  if (opts && Array.isArray(opts.preserveFontsList) && opts.preserveFontsList.length) {
    const low = name.toLowerCase();
    if (opts.preserveFontsList.some(f => low === f || low.startsWith(f))) return true;
  }
  return !PLAINFONT.test(name);
}

function preserveSpaces(s, atLineStart) {
  if (!s) return "";
  let res = s;
  if (atLineStart && res.startsWith(" ")) {
    res = res.replace(/^ +/, m => "\u00a0".repeat(m.length));
  }
  res = res.replace(/ {2,}/g, m => "\u00a0".repeat(m.length - 1) + " ");
  return res;
}

class DReader {
  constructor(b, i = 0) {
    this.b = b;
    this.i = i;
  }
  u8() {
    return this.b[this.i++];
  }
  i32() {
    const v = this.b[this.i] | this.b[this.i + 1] << 8 | this.b[this.i + 2] << 16 | this.b[this.i + 3] << 24;
    this.i += 4;
    return v;
  }
  sstr() {
    const n = this.u8();
    const s = win1252.decode(this.b.subarray(this.i, this.i + n));
    this.i += n;
    return s;
  }
  /** one value: numbers, strings, identifiers, sets, booleans, binary, lists and collections */
  value() {
    const t = this.u8();
    switch (t) {
      case 0:
      case 13:
        return null;
      case 1: {
        const out = [];
        while (this.b[this.i] !== 0 && this.i < this.b.length) out.push(this.value());
        this.i++;
        return out;
      }
      case 2: {
        const v = this.b[this.i] << 24 >> 24;
        this.i++;
        return v;
      }
      case 3: {
        const v = (this.b[this.i] | this.b[this.i + 1] << 8) << 16 >> 16;
        this.i += 2;
        return v;
      }
      case 4:
        return this.i32();
      case 5:
        this.i += 10;
        return 0;
      case 6:
      case 7:
        return this.sstr();
      case 8:
        return false;
      case 9:
        return true;
      case 10: {
        const n = this.i32();
        const v = this.b.subarray(this.i, this.i + n);
        this.i += n;
        return v;
      }
      case 11: {
        const out = [];
        for (; ; ) {
          const s = this.sstr();
          if (!s) break;
          out.push(s);
        }
        return out;
      }
      case 12:
      case 20: {
        const n = this.i32();
        const v = (t === 20 ? utf8 : win1252).decode(this.b.subarray(this.i, this.i + n));
        this.i += n;
        return v;
      }
      case 14:
        return this.collection();
      case 15:
        this.i += 4;
        return 0;
      case 16:
      case 17:
      case 19:
        this.i += 8;
        return 0;
      case 18: {
        const n = this.i32();
        const v = utf16.decode(this.b.subarray(this.i, this.i + 2 * n));
        this.i += 2 * n;
        return v;
      }
      default:
        throw new Error("unknown value type " + t);
    }
  }
  props() {
    const o = {};
    while (this.i < this.b.length && this.b[this.i] !== 0) {
      const k = this.sstr();
      o[k] = this.value();
    }
    this.i++;
    return o;
  }
  collection() {
    const out = [];
    while (this.i < this.b.length && this.b[this.i] !== 0) {
      const t = this.u8();
      if (t === 2 || t === 3 || t === 4) {
        this.i -= 1;
        this.value();
        continue;
      }
      if (t === 1) {
        out.push(this.props());
        continue;
      }
      // In Delphi TWriter.WriteCollection, an item without vaList (1) starts directly with the first property name length
      this.i -= 1;
      out.push(this.props());
    }
    this.i++;
    return out;
  }
}

const colorOf = (v) => {
  if (typeof v === "string") return COLORS[v];
  if (typeof v === "number" && v >= 0) {
    const r = v & 255, g = v >> 8 & 255, b = v >> 16 & 255;
    return `rgb(${r},${g},${b})`;
  }
  return void 0;
};

function mapTextStyles(items) {
  return items.map((p) => {
    const st = p.Style || [];
    const sss = String(p.SubSuperScriptType || "");
    return {
      font: p.FontName,
      size: typeof p.Size === "number" ? p.Size : typeof p.SizeDouble === "number" ? p.SizeDouble / 2 : void 0,
      b: st.includes("fsBold"),
      i: st.includes("fsItalic"),
      u: st.includes("fsUnderline"),
      s: st.includes("fsStrikeOut"),
      color: colorOf(p.Color),
      back: colorOf(p.BackColor),
      jump: p.Jump === true,
      sup: /Super/.test(sss) ? "sup" : /Sub/.test(sss) ? "sub" : void 0
    };
  });
}

function mapParaStyles(items) {
  return items.map((p) => ({
    align: { rvaLeft: "left", rvaCenter: "center", rvaRight: "right", rvaJustify: "justify" }[String(p.Alignment || "")],
    first: typeof p.FirstIndent === "number" ? p.FirstIndent : 0,
    left: typeof p.LeftIndent === "number" ? p.LeftIndent : 0,
    right: typeof p.RightIndent === "number" ? p.RightIndent : 0,
    before: typeof p.SpaceBefore === "number" ? p.SpaceBefore : 0,
    after: typeof p.SpaceAfter === "number" ? p.SpaceAfter : null,
    lineSpacing: typeof p.LineSpacing === "number" ? p.LineSpacing : null,
    lineSpacingType: String(p.LineSpacingType || ""),
  }));
}

function mapListStyles(items) {
  return items.map((p) => {
    const levels = Array.isArray(p.Levels) ? p.Levels.map((lv, idx) => ({
      listType: String(lv.ListType || ""),
      left: typeof lv.LeftIndent === "number" ? lv.LeftIndent : (idx + 1) * 24,
      first: typeof lv.FirstIndent === "number" ? lv.FirstIndent : 0,
      markerIndent: typeof lv.MarkerIndent === "number" ? lv.MarkerIndent : 0,
      formatStr: typeof lv.FormatString === "string" ? lv.FormatString : "",
      startFrom: typeof lv.StartFrom === "number" ? lv.StartFrom : 1,
    })) : [];
    return { levels };
  });
}

function parseStyleBlock(b, hintKind, styles) {
  // Some RVF streams prefix the style binary with a short header before the 0x0E (vaCollection) byte
  let start = 0;
  while (start < Math.min(b.length, 32) && b[start] !== 14) start++;
  if (start >= b.length || b[start] !== 14) return;
  const r = new DReader(b, start);
  if (r.u8() !== 14) return;
  const items = r.collection();
  if (!items.length) return;

  // Auto-detect style table kind from property keys if present, falling back to hintKind
  const keys = new Set();
  for (const it of items) for (const k of Object.keys(it)) keys.add(k);
  const isList = keys.has("Levels") || keys.has("OneLevelPreview") || keys.has("ListType");
  const isPara = keys.has("LeftIndent") || keys.has("FirstIndent") || keys.has("RightIndent") || keys.has("SpaceBefore") || keys.has("SpaceAfter") || keys.has("Alignment") || keys.has("Tabs");
  const isText = keys.has("FontName") || keys.has("Size") || keys.has("SizeDouble") || keys.has("Style") || keys.has("Jump") || keys.has("SubSuperScriptType") || keys.has("Charset");

  if (isList || (!isText && !isPara && hintKind === 3)) {
    styles.list = mapListStyles(items);
  } else if (isPara && !isText) {
    styles.para = mapParaStyles(items);
  } else if (isText && !isPara) {
    styles.text = mapTextStyles(items);
  } else if (hintKind === 1) {
    styles.text = mapTextStyles(items);
  } else if (hintKind === 2) {
    styles.para = mapParaStyles(items);
  } else if (hintKind === 3) {
    styles.list = mapListStyles(items);
  }
}

function looksRvf(b) {
  return b.length > 4 && b[0] === 45 && b[1] === 56 && b[2] === 32;
}

function rvfToHtml(b, inherited, opts = {}) {
  const styles = inherited ? { text: inherited.text, para: inherited.para, list: inherited.list || [] } : { text: [], para: [], list: [] };
  const n = b.length;
  let i = 0;
  const line = () => {
    let j = i;
    while (j < n && !(b[j] === 13 && b[j + 1] === 10) && b[j] !== 10) j++;
    const out2 = b.subarray(i, j);
    i = j < n ? b[j] === 13 ? j + 2 : j + 1 : n;
    return out2;
  };
  const binary = () => {
    const sz = b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24;
    const out2 = b.subarray(i + 4, i + 4 + sz);
    i += 4 + sz;
    if (i + 1 < n && b[i] === 13 && b[i + 1] === 10) i += 2;
    else if (i < n && b[i] === 10) i += 1;
    return out2;
  };
  const uniPara = () => {
    let j = i;
    while (j + 1 < n && !(b[j] === 41 && b[j + 1] === 32) && !(b[j] === 13 && b[j + 1] === 0 && j + 3 < n && b[j + 2] === 10 && b[j + 3] === 0)) j += 2;
    const s = utf16.decode(b.subarray(i, j));
    if (j + 1 < n && b[j] === 41 && b[j + 1] === 32) i = Math.min(n, j + 2);
    else if (j + 3 < n && b[j] === 13 && b[j + 1] === 0 && b[j + 2] === 10 && b[j + 3] === 0) i = Math.min(n, j + 4);
    else i = Math.min(n, j);
    if (b[i] === 13 && b[i + 1] === 10) i += 2;
    else if (b[i] === 10) i += 1;
    return s;
  };

  let out = "";
  let open = false;
  let paraHasContent = false;
  let atLineStart = true;

  const closePara = () => {
    if (!open) return;
    if (!paraHasContent) out += "<br>";
    out += "</p>";
    open = false;
    paraHasContent = false;
    atLineStart = true;
  };

  const startPara = (p, extraIndentPx = 0) => {
    closePara();
    const ps = styles.para[p] || {};
    const css = [];
    if (ps.align && ps.align !== "left") css.push("text-align:" + ps.align);
    let leftPx = (ps.left || 0) + extraIndentPx;
    const firstPx = ps.first || 0;
    if (leftPx + firstPx < 0) leftPx = -firstPx;
    if (leftPx) css.push(`margin-left:${leftPx}px`);
    if (ps.right) css.push(`margin-right:${ps.right}px`);
    if (firstPx) css.push(`text-indent:${firstPx}px`);
    if (ps.before) css.push(`margin-top:${ps.before}px`);
    if (ps.after != null && ps.after > 0) css.push(`margin-bottom:${ps.after}px`);
    out += `<p class="rvp"${css.length ? ` style="${css.join(";")}"` : ""}>`;
    open = true;
    paraHasContent = false;
    atLineStart = true;
  };

  const textOf = (s, st, tag) => {
    if (!s) return "";
    const t = styles.text[st] || {};
    const css = [];
    if (t.b) css.push("font-weight:bold");
    if (t.i) css.push("font-style:italic");
    if (t.u || t.s) css.push(`text-decoration:${t.u ? "underline" : ""} ${t.s ? "line-through" : ""}`.trim());
    if (t.color && t.color !== "#000" && t.color !== "inherit" && !t.jump) css.push("color:" + t.color);
    if (t.back && t.back !== "#fff" && t.back !== "transparent") css.push("background:" + t.back);
    if (t.size && t.size !== 10) css.push(`font-size:${Math.round(t.size * 10)}%`);
    if (t.font && keepRvfFont(t.font, opts)) css.push(`font-family:'${t.font.replace(/['"<>]/g, "")}'`);

    // Handle embedded newlines (\r\n, \n, U+2028) and tabs (\t) inside text runs
    const lines = String(s).split(/\r?\n|\u2028/);
    const htmlLines = lines.map((ln, idx) => {
      const lineStart = idx === 0 ? atLineStart : true;
      const parts = ln.split("\t");
      return parts.map((pt, pIdx) => esc(preserveSpaces(pt, pIdx === 0 ? lineStart : false))).join('<span class="rtftab">\u2003</span>');
    });
    atLineStart = lines.length > 1 && lines[lines.length - 1] === "";
    let h = htmlLines.join("<br>");
    if (h.length > 0) paraHasContent = true;
    if (t.sup) h = `<${t.sup}>${h}</${t.sup}>`;
    if (css.length) h = `<span style="${css.join(";")}">${h}</span>`;
    if (t.jump && tag) h = `<a href="${esc(tag)}">${h}</a>`;
    return h;
  };

  const tagOf = (rest) => {
    const m = /^"((?:[^"]|"")*)"/.exec(rest.trim());
    return m ? m[1].replace(/""/g, '"').replace(/\x01/g, "\r").replace(/\x02/g, "\n") : "";
  };

  let anchor = "";
  const listCounters = {};
  line();
  let guard = 0;
  while (i < n && guard++ < 1e6) {
    const h = win1252.decode(line());
    if (!h.trim()) continue;
    const m = /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) ?(.*)$/s.exec(h);
    if (!m) break;
    const type = +m[1], cnt = +m[2], para = +m[3], opt = +m[4], query = +m[5];
    const rest = m[6];
    const newPara = para >= 0 && !(opt & 1);
    const restParts = rest.trim() ? rest.trim().split(/\s+/) : [];
    if (type >= 0) {
      const tag = tagOf(rest);
      for (let k = 0; k < cnt; k++) {
        let s;
        if (query === 2) {
          const rawBytes = binary();
          s = (opt & 8) ? utf16.decode(rawBytes) : win1252.decode(rawBytes);
        } else if (opt & 8 && query === 0) {
          s = uniPara();
        } else if (query === 3) {
          const hx = win1252.decode(line());
          const bytes = new Uint8Array(hx.length / 2);
          for (let q = 0; q < bytes.length; q++) bytes[q] = parseInt(hx.substr(q * 2, 2), 16);
          s = utf16.decode(bytes);
        } else {
          s = win1252.decode(line());
        }
        if (k === 0) {
          if (newPara || !open) startPara(Math.max(0, para));
          else if (opt & 4) { out += "<br>"; paraHasContent = true; atLineStart = true; }
        } else {
          startPara(Math.max(0, para));
        }
        if (anchor) {
          out += `<a class="bkm" id="bkm:${esc(anchor)}"></a>`;
          anchor = "";
        }
        out += textOf(s, type, tag);
      }
      continue;
    }
    const lines = [];
    for (let k = 0; k < cnt; k++) lines.push(query === 2 && k === cnt - 1 ? binary() : line());
    if (type === -9) {
      // In real TRichView RVF files, the style subtype (1=TextStyles, 2=ParaStyles, 3=ListStyles)
      // is stored in `para` (the 3rd header integer) when `rest` is empty, or in `rest` in 6-integer headers.
      const kind = +restParts[restParts.length - 1] || +rest || para;
      try {
        const data = lines[cnt - 1];
        if (data) parseStyleBlock(data, kind, styles);
      } catch {
      }
      continue;
    }
    if (type === -2) {
      anchor = win1252.decode(lines[0] || new Uint8Array()).trim();
      continue;
    }
    if (type === -11) {
      // rvsListMarker: bulleted or numbered list item
      const listNo = +restParts[0] || 0;
      const level = +restParts[1] || 0;
      const startFrom = +restParts[2] || 1;
      const useStart = +restParts[3] || 0;
      const ls = (styles.list && styles.list[listNo] && styles.list[listNo].levels && styles.list[listNo].levels[level]) || null;
      const extraIndent = ls ? ls.left : (level + 1) * 24;
      startPara(Math.max(0, para), extraIndent);
      const ck = `${listNo}:${level}`;
      if (useStart) listCounters[ck] = startFrom;
      else listCounters[ck] = (listCounters[ck] || (ls ? ls.startFrom : 1));
      const num = listCounters[ck]++;
      const ltype = ls ? ls.listType : "";
      let marker = "• ";
      if (/Decimal|Arab/i.test(ltype)) marker = `${num}. `;
      else if (/LowerAlpha/i.test(ltype)) marker = `${String.fromCharCode(96 + ((num - 1) % 26) + 1)}. `;
      else if (/UpperAlpha/i.test(ltype)) marker = `${String.fromCharCode(64 + ((num - 1) % 26) + 1)}. `;
      else if (/LowerRoman/i.test(ltype)) marker = `(${num}) `;
      out += `<span class="rvlist-mk">${esc(marker)}</span>`;
      paraHasContent = true;
      atLineStart = false;
      continue;
    }
    if (newPara || !open) startPara(Math.max(0, para));
    else if (opt & 4) { out += "<br>"; paraHasContent = true; atLineStart = true; }
    if (type === -12) {
      out += '<span class="rtftab">\u2003</span>';
      paraHasContent = true;
      atLineStart = false;
      continue;
    }
    if (type === -1) {
      out += "<hr>";
      paraHasContent = true;
      atLineStart = true;
      continue;
    }
    if (type === -3 || type === -10 || type === -4) {
      const data = lines[cnt - 1];
      if (data && query === 2) {
        const img = imageUrl(data);
        if (img) {
          out += `<img class="rtfimg" src="${img}" alt="">`;
          paraHasContent = true;
          atLineStart = false;
        }
      }
      continue;
    }
    if (type === -60 && query === 2) {
      const data = lines[cnt - 1];
      if (data) {
        closePara();
        out += table(data, styles, opts);
      }
      continue;
    }
  }
  closePara();
  return out;
}

function imageUrl(data) {
  for (const off of [0, 4, 8]) {
    const d = data.subarray(off);
    const kind = d[0] === 137 && d[1] === 80 ? "png" : d[0] === 255 && d[1] === 216 ? "jpeg" : d[0] === 71 && d[1] === 73 ? "gif" : d[0] === 66 && d[1] === 77 ? "bmp" : "";
    if (kind) {
      let s = "";
      for (let k = 0; k < d.length; k += 32768) s += String.fromCharCode(...d.subarray(k, k + 32768));
      return `data:image/${kind};base64,${typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64")}`;
    }
  }
  return "";
}

function table(data, styles, opts) {
  const cells = [];
  let cols = 0;
  const s = win1252.decode(data);
  const mc = /\x01C\x02([\s\S])\x02([\s\S])/.exec(s);
  if (mc) cols = mc[2].charCodeAt(0);
  const key = "C.Data\n";
  for (let p = s.indexOf(key); p >= 0; p = s.indexOf(key, p + key.length)) {
    const at = p + key.length;
    const len = data[at] | data[at + 1] << 8 | data[at + 2] << 16 | data[at + 3] << 24;
    const inner = data.subarray(at + 4, at + 4 + len);
    const sz = inner[0] | inner[1] << 8 | inner[2] << 16 | inner[3] << 24;
    const doc = sz > 0 && sz <= inner.length - 4 ? inner.subarray(4, 4 + sz) : inner;
    try {
      cells.push(rvfToHtml(doc, styles, opts));
    } catch {
      cells.push("");
    }
  }
  if (!cells.length) return "";
  if (!cols || cells.length % cols) cols = cells.length % 2 === 0 && cells.length > 2 ? 2 : 1;
  let h = '<table class="rvtable">';
  for (let r = 0; r < cells.length; r += cols) h += "<tr>" + cells.slice(r, r + cols).map((c) => `<td>${c}</td>`).join("") + "</tr>";
  return h + "</table>";
}

module.exports = { rvfToHtml, looksRvf, imageUrl };
