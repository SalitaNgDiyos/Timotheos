'use strict';
// e-Sword text conventions shared by the Bible and book-module readers.
//
// Two generations of e-Sword modules exist:
//  * e-Sword 9/10 (.bblx .cmtx .dctx .topx .devx …): content is RTF (or RTF fragments).
//  * e-Sword 11+ (.bbli .cmti .dcti .topi .devi …): content is HTML with e-Sword's own tags:
//      <num>G26</num> Strong's number      <tvm>V-AAI-3S</tvm> morphology
//      <red>…</red> words of Christ        <blu>…</blu> link colour
//      <not>N1</not> note marker (text in the module's Notes table)
//      <ref>John 3:16</ref> cross-reference
// Sources: the e-Sword v11 exporter in BibleMultiConverter (github.com/schierlm/BibleMultiConverter,
// ESwordV11.java). Not yet checked against modules made by e-Sword itself – see README.
const { rtfToHtml } = require('./rtf');
const canon = require('./canon');

// e-Sword book numbers 67+ (order used by e-Sword's Apocrypha, per the exporter above)
// -> Tanglaw book ids. 1-66 are identical.
const ESWORD_AP = { 67: 67 /* Tobit */, 68: 68 /* Judith */, 69: 70 /* Wisdom */, 70: 71 /* Sirach */, 71: 72 /* Baruch */,
  72: 77 /* 1 Macc */, 73: 78 /* 2 Macc */, 74: 79 /* 1 Esdras */, 75: 83 /* 2 Esdras */, 76: 82 /* 3 Macc */,
  77: 84 /* 4 Macc */, 78: 80 /* Prayer of Manasseh */ };
let override = {};
function setOverride(m) { override = m || {}; }
function bookMap() {
  const m = {};
  for (let i = 1; i <= 66; i++) m[i] = i;
  Object.assign(m, ESWORD_AP);
  for (const k in override) m[+k] = +override[k];
  return m;
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

// e-Sword writes plain-text references with an underscore: Php_1:17, 1Co_13:4-7
const UNDERSCORE_REF = /(^|[^\w>"=])((?:[1-4]\s?)?[A-Z][a-z]{1,5})_(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?(?![\w<])/g;
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

/**
 * e-Sword 11 HTML -> Tanglaw HTML.
 * @param notes optional map "N1" -> note html (Bible Notes table)
 */
function v11(s, notes, inline) {
  let h = clean(s);
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
  if (inline) h = h.replace(/<p\b[^>]*>/gi, '<br>').replace(/<\/p>/gi, '').replace(/^(\s*<br>)+/, '');
  return linkUnderscoreRefs(h);
}

/** e-Sword verse/entry text (either generation) -> HTML */
function eswordToHtml(s, notes, inline) {
  if (!s) return '';
  if (looksRtf(s)) {
    // e-Sword fragments carry no font table; in e-Sword's convention font 1 is Greek and font 2 Hebrew
    let html = rtfToHtml(/^\s*\{\\rtf/.test(s) ? s : '{' + s + '}', { colors: { 15: '#c00000', 6: '#7a7a7a' }, fragmentFonts: { 1: 'windows-1253', 2: 'windows-1255' } });
    html = linkUnderscoreRefs(html);
    // older modules show Strong's numbers as plain (superscript) text: make them hoverable
    html = html.replace(/\b([GH])(\d{1,5})\b/g, (m, l, n) => `<a class="strong" data-strong="${l}${n}">${l}${n}</a>`);
    return html;
  }
  if (/<[a-z/][^>]*>/i.test(s)) return v11(s, notes, inline);
  return escT(s.trim()).replace(/\r?\n/g, '<br>');
}

/** generic HTML-ish content from a book module (theWord html topics, e-Sword topics) */
function htmlish(s) {
  if (!s) return '';
  if (/<[a-z/][^>]*>/i.test(s)) return v11(s);
  return escT(s).replace(/\r?\n/g, '<br>');
}

module.exports = { bookMap, setOverride, eswordToHtml, htmlish, looksRtf, ESWORD_AP, clean };
