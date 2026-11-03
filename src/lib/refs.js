'use strict';
// Bible references in running text: "John 3:16", "1 Cor. 13:4-7", e-Sword's "Php_1:17", and follow-ons like
// "; 5:30" or ", 8". Used to make them links in book entries and to find them in copied text (clipboard
// monitor). (Shared with the Tauri edition's src/refs.ts.)
const canon = require('./canon');
const BOOK = String.raw`((?:[1-4]|I{1,3}|IV)\s?)?([A-Z][a-z]{1,13}\.?)`;
const RE = new RegExp(String.raw`(^|[^\w>])` + BOOK + String.raw`(?:\s|_|&nbsp;)(\d{1,3}):(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?(?![\w:])`, "g");
const MORE = /^((?:[;,]|\s(?:and|&amp;))\s*)(?:(\d{1,3}):)?(\d{1,3})(?:\s?[-–]\s?(\d{1,3}))?(?![\w:])/;
const ROMAN = { I: "1", II: "2", III: "3", IV: "4" };
const NOT = /* @__PURE__ */ new Set(["see", "at", "ch", "chap", "chapter", "ver", "verse", "vol", "p", "pp", "page", "part", "no", "cf", "ibid", "in", "on", "to", "and", "the", "or", "by", "of", "art", "sec", "line", "note", "app", "fig", "col", "ps.", "time"]);
function bookOf(num, name) {
  const n = name.replace(/\.$/, "");
  if (!num && NOT.has(n.toLowerCase())) return null;
  const pre = num ? ROMAN[num.trim()] || num.trim() : "";
  const id = canon.findBook(pre + n) || (pre ? canon.findBook(pre + " " + n) : null);
  if (!id) return null;
  const bk = canon.book(id);
  const k = (pre + n).toLowerCase().replace(/\s/g, "");
  const known = [bk.name, ...bk.abbrs].some((a) => a.toLowerCase().replace(/\s/g, "") === k);
  return known || n.length >= 4 ? id : null;
}
const link = (b, c, v, v2, text) => `<a class="link bref" data-href="tw://bible.*?id=${b}.${c}.${v}${v2 && v2 > v ? `-${b}.${c}.${v2}` : ""}">${text}</a>`;
function linkText(t) {
  let out = "", i = 0;
  RE.lastIndex = 0;
  let m;
  while (m = RE.exec(t)) {
    const [all, pre, num, name, c, v, v2] = m;
    const b = bookOf(num, name);
    if (!b) continue;
    out += t.slice(i, m.index) + pre + link(b, +c, +v, v2 ? +v2 : void 0, all.slice(pre.length).replace(/_/g, " "));
    let j = m.index + all.length, cc = +c;
    for (let f; f = MORE.exec(t.slice(j)); ) {
      if (!f[2] && f[1].trim() === ";") break;
      if (f[2]) cc = +f[2];
      out += f[1] + link(b, cc, +f[3], f[4] ? +f[4] : void 0, f[0].slice(f[1].length));
      j += f[0].length;
    }
    i = j;
    RE.lastIndex = j;
  }
  return out + t.slice(i);
}

function findRefs(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const out = [];
  for (const m of linkText(esc).matchAll(/data-href="tw:\/\/bible\.\*\?id=(\d+)\.(\d+)\.(\d+)(?:-\d+\.\d+\.(\d+))?">([^<]*)<\/a>/g)) {
    const r = { b: +m[1], c: +m[2], v: +m[3], v2: m[4] ? +m[4] : void 0, label: "" };
    r.label = `${canon.book(r.b).name} ${r.c}:${r.v}${r.v2 ? "\u2013" + r.v2 : ""}`;
    if (!out.some((x) => x.label === r.label)) out.push(r);
  }
  return out;
}

/** link the plain-text references in an HTML fragment, leaving tags, existing links and headings alone */
function linkHtml(html) {
  if (!html || !/\d:\d/.test(html)) return html;
  let out = '', inA = 0, inH = 0;
  for (const part of String(html).split(/(<[^>]*>)/)) {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part)) inA++; else if (/^<\/a>/i.test(part)) inA = Math.max(0, inA - 1);
      if (/^<(h4|script|style)[\s>]/i.test(part)) inH++; else if (/^<\/(h4|script|style)>/i.test(part)) inH = Math.max(0, inH - 1);
      out += part;
    } else out += inA || inH || !/\d:\d/.test(part) ? part : linkText(part);
  }
  return out;
}

module.exports = { linkText, linkHtml, findRefs };
