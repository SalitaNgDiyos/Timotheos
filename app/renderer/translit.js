/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Transliteration of Greek and Hebrew words into Latin letters (SBL-like), for intralinear view and popups.
// (Shared with the Tauri edition's src/translit.ts.)
var TimotheosTranslit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var translit_exports = {};
  __export(translit_exports, {
    firstOriginal: () => firstOriginal,
    greekTranslit: () => greekTranslit,
    hebrewTranslit: () => hebrewTranslit,
    translit: () => translit
  });
  const GK = {
    \u03B1: "a",
    \u03B2: "b",
    \u03B3: "g",
    \u03B4: "d",
    \u03B5: "e",
    \u03B6: "z",
    \u03B7: "\u0113",
    \u03B8: "th",
    \u03B9: "i",
    \u03BA: "k",
    \u03BB: "l",
    \u03BC: "m",
    \u03BD: "n",
    \u03BE: "x",
    \u03BF: "o",
    \u03C0: "p",
    \u03C1: "r",
    \u03C3: "s",
    \u03C2: "s",
    \u03C4: "t",
    \u03C5: "y",
    \u03C6: "ph",
    \u03C7: "ch",
    \u03C8: "ps",
    \u03C9: "\u014D",
    \u03DD: "w",
    \u03F2: "s"
  };
  function greekTranslit(word) {
    const out = [];
    const chars = [...word.normalize("NFD")];
    const letters = [];
    for (const ch of chars) {
      if (/[̀-ͯ]/.test(ch)) {
        if (ch === "\u0314" && letters.length) letters[letters.length - 1].rough = true;
        continue;
      }
      letters.push({ b: ch.toLowerCase(), rough: false, upper: ch !== ch.toLowerCase() });
    }
    for (let i = 0; i < letters.length; i++) {
      const { b, rough, upper } = letters[i];
      const prev = letters[i - 1]?.b || "";
      const next = letters[i + 1]?.b || "";
      let t = GK[b];
      if (t == null) {
        out.push(b);
        continue;
      }
      if (b === "\u03B3" && "\u03B3\u03BA\u03BE\u03C7".includes(next)) t = "n";
      if (b === "\u03C5" && "\u03B1\u03B5\u03B7\u03BF".includes(prev) && prev) t = "u";
      if (b === "\u03C1" && rough) t = "rh";
      else if (rough) {
        const start = !prev || !GK[prev];
        if (start) t = "h" + t;
        else {
          const j = out.length - 1;
          out[j] = out[j][0] === out[j][0].toUpperCase() && out[j][0] !== out[j][0].toLowerCase() ? "H" + out[j].toLowerCase() : "h" + out[j];
        }
      }
      if (upper) t = t[0].toUpperCase() + t.slice(1);
      out.push(t);
    }
    return out.join("").normalize("NFC");
  }
  const HB = {
    "\u05D0": "\u02BE",
    "\u05D1": "b",
    "\u05D2": "g",
    "\u05D3": "d",
    "\u05D4": "h",
    "\u05D5": "w",
    "\u05D6": "z",
    "\u05D7": "\u1E25",
    "\u05D8": "\u1E6D",
    "\u05D9": "y",
    "\u05DB": "k",
    "\u05DA": "k",
    "\u05DC": "l",
    "\u05DE": "m",
    "\u05DD": "m",
    "\u05E0": "n",
    "\u05DF": "n",
    "\u05E1": "s",
    "\u05E2": "\u02BF",
    "\u05E4": "p",
    "\u05E3": "p",
    "\u05E6": "\u1E63",
    "\u05E5": "\u1E63",
    "\u05E7": "q",
    "\u05E8": "r",
    "\u05E9": "\u0161",
    "\u05EA": "t"
  };
  const HV = {
    "\u05B0": "\u0259",
    "\u05B1": "\u0115",
    "\u05B2": "\u0103",
    "\u05B3": "\u014F",
    "\u05B4": "i",
    "\u05B5": "\u0113",
    "\u05B6": "e",
    "\u05B7": "a",
    "\u05B8": "\u0101",
    "\u05B9": "\u014D",
    "\u05BA": "\u014D",
    "\u05BB": "u",
    "\u05C7": "o"
  };
  function hebrewTranslit(word) {
    const s = [...word.normalize("NFD")];
    let out = "";
    let prev = "start";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (HB[ch] == null) {
        if (ch === "\u05BE" || ch === " ") {
          out += ch === " " ? " " : "-";
          prev = "start";
          continue;
        }
        if (/[\u0591-\u05C7]/.test(ch)) continue;
        out += ch;
        prev = "start";
        continue;
      }
      const marks = [];
      let j = i + 1;
      while (j < s.length && /[\u0591-\u05C7]/.test(s[j]) && HB[s[j]] == null) marks.push(s[j++]);
      const last = j >= s.length || HB[s[j]] == null;
      const dagesh = marks.includes("\u05BC");
      const vowel = marks.map((m) => HV[m]).filter(Boolean).pop() || "";
      i = j - 1;
      if (ch === "\u05D5" && prev !== "start" && !vowel && dagesh) {
        out += "\xFB";
        prev = "vowel";
        continue;
      }
      if (ch === "\u05D5" && prev !== "start" && vowel === "\u014D" && !dagesh) {
        out += "\xF4";
        prev = "vowel";
        continue;
      }
      let c = ch === "\u05E9" ? marks.includes("\u05C2") ? "\u015B" : "\u0161" : HB[ch];
      if (dagesh && prev === "vowel" && ch !== "\u05D4") c += c;
      if (ch === "\u05D4" && last && !vowel && !dagesh) c = "";
      if (ch === "\u05D9" && !vowel && prev === "vowel" && /[iēe]$/.test(out)) {
        out = out.replace(/i$/, "\xEE").replace(/ē$/, "\xEA").replace(/e$/, "\xEA");
        prev = "vowel";
        continue;
      }
      let v = vowel;
      if (v === "\u0259") {
        if (last || prev === "vowel") {
          v = "";
          prev = "silent";
        } else prev = "vowel";
      } else prev = v ? "vowel" : "silent";
      if (ch === "\u05D7" && v === "a" && last) {
        out += "a" + c;
        continue;
      }
      out += c + v;
    }
    return out.normalize("NFC");
  }
  const GREEK = /[Ͱ-Ͽἀ-῿]/;
  const HEBREW = /[֐-׿יִ-ﭏ]/;
  function firstOriginal(text, want) {
    const re = want === "hebrew" ? /[֐-׿יִ-ﭏ]+(?:[־\s][֐-׿יִ-ﭏ]+)?/ : want === "greek" ? /[Ͱ-Ͽἀ-῿̀-ͯ]+/ : /[Ͱ-Ͽἀ-῿̀-ͯ]+|[֐-׿יִ-ﭏ]+/;
    const m = re.exec(text);
    return m ? m[0].trim() : "";
  }
  function translit(word) {
    if (GREEK.test(word)) return greekTranslit(word);
    if (HEBREW.test(word)) return hebrewTranslit(word);
    return "";
  }
  return __toCommonJS(translit_exports);
})();
