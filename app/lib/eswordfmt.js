/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// e-Sword text conventions and Apocrypha / Deuterocanonical OT book-mapping schemes
// shared by the Bible (.bblx / .bbli) and book-module (.cmtx / .cmti / .notx …) readers.
//
// Two generations of e-Sword modules exist:
//  * e-Sword 9/10 (.bblx .cmtx .dctx .topx .devx …): content is RTF (or RTF fragments).
//  * e-Sword 11+ (.bbli .cmti .dcti .topi .devi …): content is HTML with e-Sword's own tags:
//      <num>G26</num> Strong's number      <tvm>V-AAI-3S</tvm> morphology
//      <red>…</red> words of Christ        <blu>…</blu> link colour
//      <not>N1</not> note marker (text in the module's Notes table)
//      <ref>John 3:16</ref> cross-reference
const { rtfToHtml } = require('./rtf');
const canon = require('./canon');

// Standard e-Sword / BibleMultiConverter Apocrypha book numbers (67..87) -> Timotheos book ids.
const ESWORD_AP = {
  67: 67, // Tobit (14 ch)
  68: 68, // Judith (16 ch)
  69: 70, // Wisdom of Solomon (19 ch)
  70: 71, // Sirach / Ecclesiasticus (51 ch)
  71: 72, // Baruch (5 or 6 ch; ch 6 = Letter of Jeremiah)
  72: 77, // 1 Maccabees (16 ch)
  73: 78, // 2 Maccabees (15 ch)
  74: 79, // 1 Esdras (9 ch)
  75: 83, // 2 Esdras (16 ch)
  76: 82, // 3 Maccabees (7 ch)
  77: 84, // 4 Maccabees (18 ch)
  78: 80, // Prayer of Manasseh (1 ch)
  79: 69, // Additions to Esther (6/7/16 ch)
  80: 74, // Prayer of Azariah / Song of the Three Children (1 ch)
  81: 75, // Susanna (1 ch)
  82: 76, // Bel and the Dragon (1 ch)
  83: 73, // Letter of Jeremiah / Epistle of Jeremy (1 ch)
  84: 81, // Psalm 151 (1 ch)
  85: 85, // Odes (9–14 ch)
  86: 86, // Psalms of Solomon (18 ch)
  87: 87, // Laodiceans (1 ch)
};

function makeProtBase(extra) {
  const m = {};
  for (let i = 1; i <= 66; i++) m[i] = i;
  return Object.assign(m, extra);
}

// 73-book inline Catholic Douay-Rheims / Vulgate numbering (1..46 OT + 47..73 NT)
const MAP_CATHOLIC_DRB = (() => {
  const m = {};
  for (let i = 1; i <= 16; i++) m[i] = i; // Gen..Neh
  m[17] = 67; // Tobit
  m[18] = 68; // Judith
  m[19] = 17; // Esther
  for (let i = 20; i <= 24; i++) m[i] = i - 2; // Job..Song (18..22)
  m[25] = 70; // Wisdom
  m[26] = 71; // Sirach
  m[27] = 23; // Isaiah
  m[28] = 24; // Jeremiah
  m[29] = 25; // Lamentations
  m[30] = 72; // Baruch
  m[31] = 26; // Ezekiel
  m[32] = 27; // Daniel
  for (let i = 33; i <= 44; i++) m[i] = i - 5; // Hosea..Malachi (28..39)
  m[45] = 77; // 1 Maccabees
  m[46] = 78; // 2 Maccabees
  for (let i = 47; i <= 73; i++) m[i] = i - 7; // Matthew..Revelation (40..66)
  return m;
})();

// 73-book inline Catholic NAB / RSV-CE / Jerusalem numbering (1-2 Macc after Esther at 20-21)
const MAP_CATHOLIC_NAB = (() => {
  const m = {};
  for (let i = 1; i <= 16; i++) m[i] = i; // Gen..Neh
  m[17] = 67; // Tobit
  m[18] = 68; // Judith
  m[19] = 17; // Esther
  m[20] = 77; // 1 Maccabees
  m[21] = 78; // 2 Maccabees
  for (let i = 22; i <= 26; i++) m[i] = i - 4; // Job..Song (18..22)
  m[27] = 70; // Wisdom
  m[28] = 71; // Sirach
  m[29] = 23; // Isaiah
  m[30] = 24; // Jeremiah
  m[31] = 25; // Lamentations
  m[32] = 72; // Baruch
  for (let i = 33; i <= 46; i++) m[i] = i - 7; // Ezekiel..Malachi (26..39)
  for (let i = 47; i <= 73; i++) m[i] = i - 7; // Matthew..Revelation (40..66)
  return m;
})();

const ESWORD_SCHEMES = {
  standard: makeProtBase(ESWORD_AP),
  // 15-book 1611 KJV Apocrypha order (67..81)
  kjv1611: makeProtBase({
    67: 79, 68: 83, 69: 67, 70: 68, 71: 69, 72: 70, 73: 71, 74: 72,
    75: 73, 76: 74, 77: 75, 78: 76, 79: 80, 80: 77, 81: 78,
    82: 82, 83: 84, 84: 81, 85: 85, 86: 86, 87: 87,
  }),
  // 14-book 1611 KJV Apocrypha order (where Baruch + Epistle of Jeremy are combined as 6 ch in book 74)
  kjv14: makeProtBase({
    67: 79, 68: 83, 69: 67, 70: 68, 71: 69, 72: 70, 73: 71, 74: 72,
    75: 74, 76: 75, 77: 76, 78: 80, 79: 77, 80: 78,
    81: 82, 82: 84, 83: 81, 84: 85, 85: 86, 86: 87,
  }),
  // Catholic Deuterocanonical OT order appended at 67..73 (Tobit, Judith, 1Macc, 2Macc, Wisdom, Sirach, Baruch)
  catholic_appended: makeProtBase({
    67: 67, 68: 68, 69: 77, 70: 78, 71: 70, 72: 71, 73: 72,
    74: 73, 75: 69, 76: 74, 77: 75, 78: 76, 79: 79, 80: 83, 81: 80,
  }),
  // Septuagint / Brenton / Orthodox appended order
  lxx_brenton: makeProtBase({
    67: 79, 68: 67, 69: 68, 70: 70, 71: 71, 72: 72, 73: 73, 74: 74,
    75: 75, 76: 76, 77: 77, 78: 78, 79: 82, 80: 84, 81: 81, 82: 80,
    83: 83, 84: 85, 85: 86,
  }),
  // Direct Timotheos IDs (67..87)
  direct: (() => { const m = {}; for (let i = 1; i <= 87; i++) m[i] = i; return m; })(),
  catholic_inline_drb: MAP_CATHOLIC_DRB,
  catholic_inline_nab: MAP_CATHOLIC_NAB,
};

// Expected chapter counts for Timotheos Apocrypha/Deuterocanonical book IDs (67..87)
const EXPECTED_AP_CHS = {
  67: [14],
  68: [16],
  69: [6, 7, 10, 16],
  70: [19],
  71: [51],
  72: [5, 6],
  73: [1],
  74: [1],
  75: [1],
  76: [1],
  77: [16],
  78: [15],
  79: [9],
  80: [1],
  81: [1],
  82: [7],
  83: [16],
  84: [18],
  85: [9, 14, 15],
  86: [18],
  87: [1],
};

// First-verse (Chapter 1, Verse 1) text fingerprints for disambiguating Apocrypha books
const VERSE1_HINTS = [
  [/\b(tobit|tobias|tobie|thobit|thisbe|naphthali)\b/i, 67],
  [/\b(arphaxad|ecbatane|medes|judith|nabuchodonosor)\b/i, 68],
  [/\b(mardocheus|mordecai|artaxerxes|assuerus)\b/i, 69],
  [/\b(love righteousness|judges of the earth|love justice)\b/i, 70],
  [/\b(all wisdom cometh from the lord|all wisdom is from the lord|prologue of jesus|son of sirach)\b/i, 71],
  [/\b(words of the book.*baruch|nerias|jechonias)\b/i, 72],
  [/\b(copy of an epistle.*jerem|letter of jerem)\b/i, 73],
  [/\b(azarias stood|walked in the midst of the flame|blessed art thou, o lord god of our fathers)\b/i, 74],
  [/\b(dwelt a man in babylon.*joacim|joakim|susanna)\b/i, 75],
  [/\b(king astyages|bel.*idol|cyrus the persian)\b/i, 76],
  [/\b(alexander.*philip.*macedon|chittim|chethiim)\b/i, 77],
  [/\b(brethren, the jews that be in judea|jews in egypt)\b/i, 78],
  [/\b(josias held the feast of the passover|josiah kept the passover)\b/i, 79],
  [/\b(o lord, almighty god of our fathers, abraham|manasses)\b/i, 80],
  [/\b(small among my brethren|youngest in my father's house)\b/i, 81],
  [/\b(philopator|ptolemy|raphia)\b/i, 82],
  [/\b(second book of the prophet esdras|salathiel)\b/i, 83],
  [/\b(philosophical.*reason|devout reason is sovereign over the passions)\b/i, 84],
  [/\b(paul, an apostle, not of men.*laodicea)\b/i, 87],
];

// Unique chapter counts that unambiguously identify a Deuterocanonical book when no text hint matches
const UNIQUE_CH_BOOK = {
  51: 71, // Sirach
  19: 70, // Wisdom of Solomon
  14: 67, // Tobit
  15: 78, // 2 Maccabees
  9: 79,  // 1 Esdras
  7: 82,  // 3 Maccabees
  5: 72,  // Baruch
  18: 84, // 4 Maccabees
};

let override = {};
function setOverride(m) { override = m || {}; }
function bookMap() {
  const m = {};
  for (let i = 1; i <= 66; i++) m[i] = i;
  Object.assign(m, ESWORD_AP);
  for (const k in override) m[+k] = +override[k];
  return m;
}

/**
 * Automatically detect the e-Sword module's Apocrypha / Deuterocanonical OT book-numbering scheme
 * from its { [eb]: maxChapter } map and optional { [eb]: verse1Text } samples.
 */
function detectBookMap(chCounts = {}, firstVerses = {}, customOverride = {}) {
  const ov = Object.assign({}, override, customOverride || {});
  const ebs = Object.keys(chCounts).map(Number);

  // 1. Check for 73-book inline Catholic numbering (where OT is 1..46 and NT is 47..73: Matt=47 [28 ch], Rev=73 [22 ch])
  if (chCounts[47] === 28 && chCounts[73] === 22 && chCounts[17] === 14 && chCounts[18] === 16 && !chCounts[74]) {
    const isNab = chCounts[20] === 16 && chCounts[21] === 15;
    const scheme = isNab ? 'catholic_inline_nab' : 'catholic_inline_drb';
    const map = Object.assign({}, ESWORD_SCHEMES[scheme]);
    for (const k in ov) map[+k] = +ov[k];
    return { map, scheme };
  }

  // 2. Score appended schemes (67+)
  const apBooks = ebs.filter(eb => eb >= 67);
  if (!apBooks.length) {
    const map = Object.assign({}, ESWORD_SCHEMES.standard);
    for (const k in ov) map[+k] = +ov[k];
    return { map, scheme: 'standard' };
  }

  const candidateOrder = ['standard', 'kjv1611', 'kjv14', 'catholic_appended', 'lxx_brenton', 'direct'];
  let bestScheme = 'standard';
  let bestScore = -1;

  for (const name of candidateOrder) {
    const smap = ESWORD_SCHEMES[name];
    let score = 0;
    for (const eb of apBooks) {
      const tb = smap[eb];
      const exp = EXPECTED_AP_CHS[tb];
      const ch = chCounts[eb];
      if (exp && exp.includes(ch)) score += (ch > 1 ? 3 : 1);
      const v1 = firstVerses[eb] || '';
      if (v1) {
        for (const [re, hintId] of VERSE1_HINTS) {
          if (re.test(v1) && hintId === tb) { score += 5; break; }
        }
      }
    }
    if (score > bestScore) { bestScore = score; bestScheme = name; }
  }

  const map = Object.assign({}, ESWORD_SCHEMES[bestScheme]);
  const usedTargets = new Set();
  for (const eb of apBooks) {
    const tb = map[eb];
    const exp = EXPECTED_AP_CHS[tb];
    const ch = chCounts[eb];
    const v1 = firstVerses[eb] || '';
    let matchedHint = null;
    if (v1) {
      for (const [re, hintId] of VERSE1_HINTS) {
        if (re.test(v1)) { matchedHint = hintId; break; }
      }
    }
    if (matchedHint) {
      map[eb] = matchedHint;
      usedTargets.add(matchedHint);
    } else if (exp && exp.includes(ch)) {
      usedTargets.add(tb);
    } else if (UNIQUE_CH_BOOK[ch] && !usedTargets.has(UNIQUE_CH_BOOK[ch])) {
      map[eb] = UNIQUE_CH_BOOK[ch];
      usedTargets.add(map[eb]);
    } else if (ch === 16) {
      // 16 chapters can be Judith (68), 1 Maccabees (77), or 2 Esdras (83)
      for (const cand of [68, 77, 83]) {
        if (!usedTargets.has(cand)) { map[eb] = cand; usedTargets.add(cand); break; }
      }
    }
  }

  for (const k in ov) map[+k] = +ov[k];
  return { map, scheme: bestScheme };
}

/**
 * Map an e-Sword (Book, Chapter) pair to Timotheos [book, chapter], splitting embedded
 * Deuterocanonical chapters (Daniel 13 -> Susanna, Daniel 14 -> Bel, Esther 11-16 -> Additions to Esther,
 * Baruch 6 -> Letter of Jeremiah, Psalms 151 -> Psalm 151) when no standalone book already occupies that ID.
 */
function mapChapter(eb, ec, map, hasStandalone) {
  const m = map || bookMap();
  const b = m[eb] || eb;
  const standalone = id => hasStandalone && hasStandalone.has ? hasStandalone.has(id) : false;
  if (b === 27 && ec === 13 && !standalone(75)) return [75, 1];
  if (b === 27 && ec === 14 && !standalone(76)) return [76, 1];
  if (b === 17 && ec > 10 && !standalone(69)) return [69, ec];
  if (b === 72 && ec === 6 && !standalone(73)) return [73, 1];
  if (b === 19 && ec === 151 && !standalone(81)) return [81, 1];
  return [b, ec];
}

const escT = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => escT(s).replace(/"/g, '&quot;');

function looksRtf(s) { return /^\s*\{\\rtf/.test(s) || /\\(par|cf\d|i0?|b0?|super|fs\d+|f\d+|plain|u-?\d+)\b/.test(s); }

/** strip active content from HTML coming out of a module */
function clean(html) {
  return html
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1=""');
}

// e-Sword writes plain-text references with an underscore: Php_1:17, 1Co_13:4-7, 1Macc_1:1, WisSol_2:12
const UNDERSCORE_REF = /(^|[^\w>"=])((?:[1-4]\s?)?[A-Z][A-Za-z]{1,9})_(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?(?![\w<])/g;
function linkUnderscoreRefs(html) {
  // only touch text outside tags and outside existing links
  return html.replace(/(<a\b[\s\S]*?<\/a>)|(<[^>]*>)|([^<]+)/g, (m, a, tag, text) => {
    if (a || tag) return m;
    return text.replace(UNDERSCORE_REF, (q, pre, bk, c, v, v2) => {
      const r = canon.parseRef(`${bk} ${c}:${v}`);
      return r ? `${pre}<a class="link" data-href="tw://bible.*?id=${r.b}.${r.c}.${r.v}${v2 ? '-' + r.b + '.' + r.c + '.' + v2 : ''}">${bk} ${c}:${v}${v2 ? '-' + v2 : ''}</a>` : q;
    });
  });
}

function refLink(txt) {
  const r = canon.parseRef(txt.replace(/_/g, ' '));
  return r ? `<a class="link" data-href="tw://bible.*?id=${r.b}.${r.c}.${r.v}">${escT(txt)}</a>` : escT(txt);
}

/** Preserve tabs, leading spaces on lines, and runs of 2+ spaces in HTML/plain text outside tags */
function preserveHtmlIndentAndBreaks(html, convertNewlines) {
  let atLineStart = true;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, txt) => {
    if (tag) {
      if (/^<\/?(p|div|br|li|tr|h[1-6]|blockquote|hr)\b/i.test(tag)) atLineStart = true;
      return tag;
    }
    let s = txt;
    if (convertNewlines && /\r?\n/.test(s)) {
      const lines = s.replace(/\r+\n/g, '\n').split(/\r?\n/);
      return lines.map((ln, idx) => {
        const lineStart = idx === 0 ? atLineStart : true;
        let r = ln.replace(/\t/g, '<span class="rtftab">\u2003</span>');
        if (lineStart && r.startsWith(' ')) r = r.replace(/^ +/, sp => '&nbsp;'.repeat(sp.length));
        r = r.replace(/ {2,}/g, sp => '&nbsp;'.repeat(sp.length - 1) + ' ');
        atLineStart = r.length === 0;
        return r;
      }).join('<br>');
    }
    let r = s.replace(/\t/g, '<span class="rtftab">\u2003</span>');
    if (atLineStart && r.startsWith(' ')) r = r.replace(/^ +/, sp => '&nbsp;'.repeat(sp.length));
    r = r.replace(/ {2,}/g, sp => '&nbsp;'.repeat(sp.length - 1) + ' ');
    if (r.trim().length > 0) atLineStart = false;
    return r;
  });
}

function formatPlainTextTopic(s, inline) {
  if (inline) return escT(s.trim()).replace(/\r?\n/g, '<br>');
  const lines = String(s).replace(/^\r?\n+|\s+$/g, '').replace(/\r+\n/g, '\n').split(/\r?\n/);
  return lines.map(ln => {
    if (!ln.trim()) return '<p class="rtfp rtf-blank"><br></p>';
    let r = escT(ln).replace(/\t/g, '<span class="rtftab">\u2003</span>');
    if (r.startsWith(' ')) r = r.replace(/^ +/, sp => '&nbsp;'.repeat(sp.length));
    r = r.replace(/ {2,}/g, sp => '&nbsp;'.repeat(sp.length - 1) + ' ');
    return `<p class="rtfp">${r}</p>`;
  }).join('');
}

/**
 * e-Sword 11 HTML -> Timotheos HTML.
 * @param notes optional map "N1" -> note html (Bible Notes table)
 */
function v11(s, notes, inline) {
  let h = clean(s);
  const hasBlockTags = /<\s*(p|div|br|table|ul|ol|li|blockquote|pre)\b/i.test(h);
  // a word followed by Strong's / morphology tags becomes a hoverable word
  h = h.replace(/([^\s<>]+)(\s*)((?:<num>\s*[^<]*<\/num>\s*)+)((?:<tvm>\s*[^<]*<\/tvm>\s*)*)/gi, (m, word, sp, nums, tvms) => {
    const st = [...nums.matchAll(/<num>\s*([^<]*?)\s*<\/num>/gi)].map(x => x[1].replace(/^([GHgh])0*(\d)/, (q, l, d) => l.toUpperCase() + d)).filter(Boolean);
    const mo = [...tvms.matchAll(/<tvm>\s*([^<]*?)\s*<\/tvm>/gi)].map(x => x[1]).filter(Boolean);
    const punct = /^(.*?)([,.;:!?·"”’)\]]*)$/.exec(word);
    const attrs = (st.length ? ` data-strong="${escA(st.join(' '))}"` : '') + (mo.length ? ` data-morph="${escA(mo.join(' '))}"` : '');
    return `<span class="word"${attrs}>${punct[1]}</span>${punct[2]}`
      + st.map(x => `<sup class="strong" data-strong="${escA(x)}">${escT(x)}</sup>`).join('')
      + mo.map(x => `<sup class="morph" data-morph="${escA(x)}">${escT(x)}</sup>`).join('') + (sp || (tvms || nums).match(/\s$/) ? ' ' : '');
  });
  h = h.replace(/<num>\s*([^<]*?)\s*<\/num>/gi, (m, x) => `<sup class="strong" data-strong="${escA(x)}">${escT(x)}</sup>`);
  h = h.replace(/<tvm>\s*([^<]*?)\s*<\/tvm>/gi, (m, x) => `<sup class="morph" data-morph="${escA(x)}">${escT(x)}</sup>`);
  h = h.replace(/<red>/gi, '<span class="woj">').replace(/<\/red>/gi, '</span>');
  h = h.replace(/<blu>/gi, '<span class="blu">').replace(/<\/blu>/gi, '</span>');
  h = h.replace(/<ref>\s*([^<]*?)\s*<\/ref>/gi, (m, x) => refLink(x));
  h = h.replace(/<not>\s*([^<]*?)\s*<\/not>\s?/gi, (m, id) => {
    const n = notes && notes[id];
    return n ? `<sup class="fn" data-note="${escA(n)}">${escT(id.replace(/^N/, '') || '*')}</sup>` : '';
  });
  h = h.replace(/<h(\d)[^>]*>([\s\S]*?)<\/h\1>/gi, (m, l, t) => `<span class="heading h${Math.min(3, Math.max(1, l - 1))}">${t.replace(/<[^>]*>/g, '')}</span>`);
  h = h.replace(/<grk>/gi, '<span class="greek">').replace(/<\/grk>/gi, '</span>');
  h = h.replace(/<heb>/gi, '<span class="hebrew" dir="rtl">').replace(/<\/heb>/gi, '</span>');
  // Bible verses are inline text: paragraphs become line breaks; book entries keep their paragraphs
  if (inline) {
    h = h.replace(/<p\b[^>]*>/gi, '<br>').replace(/<\/p>/gi, '').replace(/^(\s*<br>)+/, '');
  } else {
    h = preserveHtmlIndentAndBreaks(h, !hasBlockTags);
  }
  return linkUnderscoreRefs(h);
}

/** e-Sword verse/entry text (either generation) -> HTML */
function eswordToHtml(s, notes, inline) {
  if (!s) return '';
  if (looksRtf(s)) {
    // e-Sword fragments carry no font table; in e-Sword's convention font 1 is Greek and font 2 Hebrew
    let html = rtfToHtml(/^\s*\{\\rtf/.test(s) ? s : '{' + s + '}', { colors: { 15: '#c00000', 6: '#7a7a7a' }, fragmentFonts: { 1: 'windows-1253', 2: 'windows-1255' }, inline: !!inline });
    html = linkUnderscoreRefs(html);
    // older modules show Strong's numbers as plain (superscript) text: make them hoverable
    html = html.replace(/\b([GH])(\d{1,5})\b/g, (m, l, n) => `<a class="strong" data-strong="${l}${n}">${l}${n}</a>`);
    return html;
  }
  if (/<[a-z/][^>]*>/i.test(s)) return v11(s, notes, inline);
  return formatPlainTextTopic(s, inline);
}

/** generic HTML-ish content from a book module (theWord html topics, e-Sword topics) */
function htmlish(s) {
  if (!s) return '';
  if (/<[a-z/][^>]*>/i.test(s)) return v11(s, null, false);
  return formatPlainTextTopic(s, false);
}

module.exports = {
  bookMap, setOverride, detectBookMap, mapChapter,
  eswordToHtml, htmlish, looksRtf,
  ESWORD_AP, ESWORD_SCHEMES, EXPECTED_AP_CHS, clean,
};
