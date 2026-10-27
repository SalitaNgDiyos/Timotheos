'use strict';
// Book list, KJV versification and reference parsing.
// Books 1-66 follow the Protestant canon (theWord order).
// Books 67+ are the deuterocanonical / apocryphal books. Their numbering here is
// Tanglaw's own; e-Sword book numbers are mapped onto it in esword.js (editable).

const KJV = require('./kjv_versification.json'); // [book][chapter] = verse count, books 1-66

const BOOKS = [
  // id, name, abbreviations (first is the display abbreviation), testament
  [1, 'Genesis', ['Gen', 'Ge', 'Gn'], 'OT'], [2, 'Exodus', ['Exod', 'Ex', 'Exo'], 'OT'],
  [3, 'Leviticus', ['Lev', 'Le', 'Lv'], 'OT'], [4, 'Numbers', ['Num', 'Nu', 'Nm', 'Nb'], 'OT'],
  [5, 'Deuteronomy', ['Deut', 'De', 'Dt', 'Deu'], 'OT'], [6, 'Joshua', ['Josh', 'Jos', 'Jsh'], 'OT'],
  [7, 'Judges', ['Judg', 'Jdg', 'Jg', 'Jdgs'], 'OT'], [8, 'Ruth', ['Ruth', 'Rth', 'Ru'], 'OT'],
  [9, '1 Samuel', ['1Sam', '1Sa', '1S', '1 Sam'], 'OT'], [10, '2 Samuel', ['2Sam', '2Sa', '2S', '2 Sam'], 'OT'],
  [11, '1 Kings', ['1Kgs', '1Ki', '1K', '1 Kings'], 'OT'], [12, '2 Kings', ['2Kgs', '2Ki', '2K', '2 Kings'], 'OT'],
  [13, '1 Chronicles', ['1Chr', '1Ch', '1 Chron'], 'OT'], [14, '2 Chronicles', ['2Chr', '2Ch', '2 Chron'], 'OT'],
  [15, 'Ezra', ['Ezra', 'Ezr'], 'OT'], [16, 'Nehemiah', ['Neh', 'Ne'], 'OT'],
  [17, 'Esther', ['Esth', 'Est', 'Es'], 'OT'], [18, 'Job', ['Job', 'Jb'], 'OT'],
  [19, 'Psalms', ['Ps', 'Psa', 'Psalm', 'Pss', 'Psm'], 'OT'], [20, 'Proverbs', ['Prov', 'Pro', 'Pr', 'Prv'], 'OT'],
  [21, 'Ecclesiastes', ['Eccl', 'Ecc', 'Ec', 'Qoh'], 'OT'], [22, 'Song of Solomon', ['Song', 'SS', 'Sng', 'Cant', 'Song of Songs'], 'OT'],
  [23, 'Isaiah', ['Isa', 'Is'], 'OT'], [24, 'Jeremiah', ['Jer', 'Je', 'Jr'], 'OT'],
  [25, 'Lamentations', ['Lam', 'La'], 'OT'], [26, 'Ezekiel', ['Ezek', 'Eze', 'Ezk'], 'OT'],
  [27, 'Daniel', ['Dan', 'Da', 'Dn'], 'OT'], [28, 'Hosea', ['Hos', 'Ho'], 'OT'],
  [29, 'Joel', ['Joel', 'Jl'], 'OT'], [30, 'Amos', ['Amos', 'Am'], 'OT'],
  [31, 'Obadiah', ['Obad', 'Ob'], 'OT'], [32, 'Jonah', ['Jonah', 'Jon', 'Jnh'], 'OT'],
  [33, 'Micah', ['Mic', 'Mc'], 'OT'], [34, 'Nahum', ['Nah', 'Na'], 'OT'],
  [35, 'Habakkuk', ['Hab', 'Hb'], 'OT'], [36, 'Zephaniah', ['Zeph', 'Zep', 'Zp'], 'OT'],
  [37, 'Haggai', ['Hag', 'Hg'], 'OT'], [38, 'Zechariah', ['Zech', 'Zec', 'Zc'], 'OT'],
  [39, 'Malachi', ['Mal', 'Ml'], 'OT'],
  [40, 'Matthew', ['Matt', 'Mt', 'Mat'], 'NT'], [41, 'Mark', ['Mark', 'Mk', 'Mar', 'Mrk'], 'NT'],
  [42, 'Luke', ['Luke', 'Lk', 'Luk', 'Lu'], 'NT'], [43, 'John', ['John', 'Jn', 'Joh', 'Jhn'], 'NT'],
  [44, 'Acts', ['Acts', 'Ac', 'Act'], 'NT'], [45, 'Romans', ['Rom', 'Ro', 'Rm'], 'NT'],
  [46, '1 Corinthians', ['1Cor', '1Co', '1 Cor'], 'NT'], [47, '2 Corinthians', ['2Cor', '2Co', '2 Cor'], 'NT'],
  [48, 'Galatians', ['Gal', 'Ga'], 'NT'], [49, 'Ephesians', ['Eph', 'Ephes'], 'NT'],
  [50, 'Philippians', ['Phil', 'Php', 'Pp'], 'NT'], [51, 'Colossians', ['Col', 'Co'], 'NT'],
  [52, '1 Thessalonians', ['1Thess', '1Th', '1 Thess'], 'NT'], [53, '2 Thessalonians', ['2Thess', '2Th', '2 Thess'], 'NT'],
  [54, '1 Timothy', ['1Tim', '1Ti', '1 Tim'], 'NT'], [55, '2 Timothy', ['2Tim', '2Ti', '2 Tim'], 'NT'],
  [56, 'Titus', ['Titus', 'Tit', 'Ti'], 'NT'], [57, 'Philemon', ['Phlm', 'Phm', 'Philem'], 'NT'],
  [58, 'Hebrews', ['Heb', 'He'], 'NT'], [59, 'James', ['Jas', 'Jm', 'Jam'], 'NT'],
  [60, '1 Peter', ['1Pet', '1Pe', '1Pt', '1 Pet'], 'NT'], [61, '2 Peter', ['2Pet', '2Pe', '2Pt', '2 Pet'], 'NT'],
  [62, '1 John', ['1John', '1Jn', '1Jo', '1 John'], 'NT'], [63, '2 John', ['2John', '2Jn', '2Jo', '2 John'], 'NT'],
  [64, '3 John', ['3John', '3Jn', '3Jo', '3 John'], 'NT'], [65, 'Jude', ['Jude', 'Jud', 'Jd'], 'NT'],
  [66, 'Revelation', ['Rev', 'Re', 'Rv', 'Apoc'], 'NT'],
  // Deuterocanonical / Apocrypha (Tanglaw numbering)
  [67, 'Tobit', ['Tob', 'Tb'], 'AP'], [68, 'Judith', ['Jdt', 'Jth'], 'AP'],
  [69, 'Additions to Esther', ['AddEsth', 'EsthGr', 'AEs', 'GkEsth', 'RestEsth', 'Rest of Esther', 'The Rest of Esther'], 'AP'],
  [70, 'Wisdom of Solomon', ['Wis', 'Wisd', 'WisSol'], 'AP'], [71, 'Sirach', ['Sir', 'Ecclus', 'Ecclesiasticus'], 'AP'],
  [72, 'Baruch', ['Bar', 'Ba'], 'AP'], [73, 'Letter of Jeremiah', ['EpJer', 'LJe', 'LetJer', 'Epistle of Jeremy', 'Epistle of Jeremiah'], 'AP'],
  [74, 'Prayer of Azariah', ['PrAzar', 'SgThree', 'Song3', 'S3Y', 'Aza', 'Song of the Three Children', 'Three Children'], 'AP'],
  [75, 'Susanna', ['Sus'], 'AP'], [76, 'Bel and the Dragon', ['Bel'], 'AP'],
  [77, '1 Maccabees', ['1Macc', '1Ma', '1M', '1 Macc'], 'AP'], [78, '2 Maccabees', ['2Macc', '2Ma', '2M', '2 Macc'], 'AP'],
  [79, '1 Esdras', ['1Esd', '1Es', '1 Esdr'], 'AP'], [80, 'Prayer of Manasseh', ['PrMan', 'Man', 'PMa', 'Prayer of Manasses', 'Manasses'], 'AP'],
  [81, 'Psalm 151', ['Ps151', 'Psa151'], 'AP'], [82, '3 Maccabees', ['3Macc', '3Ma', '3M', '3 Macc'], 'AP'],
  [83, '2 Esdras', ['2Esd', '2Es', '2 Esdr', '4Ezra'], 'AP'], [84, '4 Maccabees', ['4Macc', '4Ma', '4M', '4 Macc'], 'AP'],
  [85, 'Odes', ['Odes', 'Ode'], 'AP'], [86, 'Psalms of Solomon', ['PsSol', 'PssSol'], 'AP'],
  [87, 'Laodiceans', ['EpLao', 'Laod'], 'AP'],
];

const byId = new Map(BOOKS.map(b => [b[0], { id: b[0], name: b[1], abbr: b[2][0], abbrs: b[2], t: b[3] }]));

// ---- Apocrypha placement -------------------------------------------------------------
// '1611': as in the 1611 King James Bible – the Apocrypha stands between Malachi and Matthew,
//         in the order of the 1611 table of contents, and counts as part of the Old Testament
//         section (navigation, Old Testament search scope).
// 'end' : the Apocrypha is a separate section after Revelation (Tanglaw 0.1 behaviour).
const AP_1611 = [79, 83, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 80, 77, 78];
// deuterocanonical books that the 1611 KJV does not contain: kept right after 2 Maccabees
const AP_OTHER = [82, 84, 81, 85, 86, 87];
const NAMES_1611 = {
  79: '1 Esdras', 83: '2 Esdras', 67: 'Tobit', 68: 'Judith', 69: 'The Rest of Esther', 70: 'Wisdom of Solomon',
  71: 'Ecclesiasticus', 72: 'Baruch', 73: 'Epistle of Jeremy', 74: 'Song of the Three Children', 75: 'Susanna',
  76: 'Bel and the Dragon', 80: 'Prayer of Manasses', 77: '1 Maccabees', 78: '2 Maccabees',
};

function apMode(mode) { return mode === 'end' ? 'end' : '1611'; }

/** sort key for a book id under the chosen Apocrypha placement */
function orderKey(id, mode) {
  if (id <= 39) return id;
  if (id <= 66) return 200 + id;
  let i = AP_1611.indexOf(id); if (i < 0) { i = AP_OTHER.indexOf(id); i = i < 0 ? 90 + id : 50 + i; }
  return apMode(mode) === '1611' ? 100 + i : 400 + i;
}

/** section a book belongs to: OT, AP (1611 Apocrypha), APX (other deuterocanon), NT */
function group(id) {
  if (id <= 39) return 'OT';
  if (id <= 66) return 'NT';
  return AP_1611.includes(id) ? 'AP' : 'APX';
}

/** does a book fall inside a search scope (all | OT | NT | AP) under the chosen placement? */
function inScope(id, scope, mode) {
  if (!scope || scope === 'all') return true;
  if (scope === 'OT') return id <= 39 || (apMode(mode) === '1611' && id >= 67);
  if (scope === 'OTonly') return id <= 39;
  if (scope === 'NT') return id >= 40 && id <= 66;
  if (scope === 'AP') return id >= 67;
  return true;
}

function book(id, mode) {
  const b = byId.get(id) || { id, name: 'Book ' + id, abbr: 'B' + id, abbrs: [], t: 'AP' };
  const out = { ...b, grp: group(id), order: orderKey(id, mode) };
  if (apMode(mode) === '1611' && NAMES_1611[id]) out.name = NAMES_1611[id];
  return out;
}

/** verse counts per chapter for a canonical book (1-66) in KJV versification */
function kjvChapters(id) { return KJV[id - 1] || []; }

/** line index (0-based) of a verse inside a theWord .ont/.ot/.nt file */
const ONT_INDEX = (() => {
  const idx = new Map(); let n = 0;
  for (let b = 1; b <= 66; b++) {
    const ch = KJV[b - 1];
    for (let c = 1; c <= ch.length; c++) for (let v = 1; v <= ch[c - 1]; v++) idx.set(`${b}.${c}.${v}`, n++);
  }
  return { idx, total: n };
})();
const OT_LINES = 23145, NT_LINES = 7957;

function ontLine(b, c, v, kind) {
  const i = ONT_INDEX.idx.get(`${b}.${c}.${v}`);
  if (i === undefined) return -1;
  if (kind === 'ont') return i;
  if (kind === 'ot') return b <= 39 ? i : -1;
  if (kind === 'nt') return b >= 40 ? i - OT_LINES : -1;
  return -1;
}

const NAME_INDEX = (() => {
  const m = new Map();
  const norm = s => s.toLowerCase().replace(/[\s.]/g, '');
  for (const [id, name, abbrs] of BOOKS) {
    m.set(norm(name), id);
    for (const a of abbrs) m.set(norm(a), id);
  }
  // Tagalog names used by AMB
  const tl = { mateo: 40, marcos: 41, lucas: 42, juan: 43, gawa: 44, roma: 45, galacia: 48, efeso: 49, filipos: 50, colosas: 51, hebreo: 58, santiago: 59, judas: 65, pahayag: 66, tito: 56, filemon: 57, '1cor': 46, '2cor': 47, '1tes': 52, '2tes': 53, '1ped': 60, '2ped': 61, '1juan': 62, '2juan': 63, '3juan': 64, sant: 59, efe: 49, fil: 50, filem: 57, gen: 1, genesis: 1 };
  for (const k in tl) if (!m.has(k)) m.set(k, tl[k]);
  return { m, norm };
})();

function findBook(s) {
  const k = NAME_INDEX.norm(s);
  if (NAME_INDEX.m.has(k)) return NAME_INDEX.m.get(k);
  // unique prefix match on full names
  const hits = BOOKS.filter(b => NAME_INDEX.norm(b[1]).startsWith(k) || b[2].some(a => NAME_INDEX.norm(a).startsWith(k)));
  return hits.length >= 1 && k.length >= 2 ? hits[0][0] : null;
}

/** "Jn 3:16", "1 Cor 13", "Tob 1:3", "Sirach 24:1-5" -> {b,c,v} */
function parseRef(s) {
  const m = String(s).trim().match(/^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]*?)\s*(\d+)?(?:\s*[:.,]\s*(\d+))?(?:\s*[-–]\s*\d+)?\s*$/);
  if (!m) return null;
  const b = findBook(m[1]);
  if (!b) return null;
  return { b, c: m[2] ? +m[2] : 1, v: m[3] ? +m[3] : 1 };
}

module.exports = { BOOKS, book, orderKey, group, inScope, AP_1611, AP_OTHER, NAMES_1611, kjvChapters, ontLine, ONT_TOTAL: ONT_INDEX.total, OT_LINES, NT_LINES, parseRef, findBook };
