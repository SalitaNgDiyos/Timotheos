'use strict';
// Book list, KJV versification and reference parsing.
// Books 1-66 follow the Protestant canon (theWord order).
// Books 67+ are the deuterocanonical / apocryphal books. Their numbering here is
// Tanglaw's own; e-Sword book numbers are mapped onto it in esword.js (auto-detected & editable).

const KJV = require('./kjv_versification.json'); // [book][chapter] = verse count, books 1-66

const BOOKS = [
  // id, name, abbreviations (first is the display abbreviation), testament
  [1, 'Genesis', ['Gen', 'Ge', 'Gn'], 'OT'], [2, 'Exodus', ['Exod', 'Ex', 'Exo'], 'OT'],
  [3, 'Leviticus', ['Lev', 'Le', 'Lv'], 'OT'], [4, 'Numbers', ['Num', 'Nu', 'Nm', 'Nb'], 'OT'],
  [5, 'Deuteronomy', ['Deut', 'De', 'Dt', 'Deu'], 'OT'], [6, 'Joshua', ['Josh', 'Jos', 'Jsh', 'Josue'], 'OT'],
  [7, 'Judges', ['Judg', 'Jdg', 'Jg', 'Jdgs'], 'OT'], [8, 'Ruth', ['Ruth', 'Rth', 'Ru'], 'OT'],
  [9, '1 Samuel', ['1Sam', '1Sa', '1S', '1 Sam', '1Kgdms'], 'OT'], [10, '2 Samuel', ['2Sam', '2Sa', '2S', '2 Sam', '2Kgdms'], 'OT'],
  [11, '1 Kings', ['1Kgs', '1Ki', '1K', '1 Kings', '3Kgdms'], 'OT'], [12, '2 Kings', ['2Kgs', '2Ki', '2K', '2 Kings', '4Kgdms'], 'OT'],
  [13, '1 Chronicles', ['1Chr', '1Ch', '1 Chron', '1Paralipomenon', '1Par', '1 Paralipomenon'], 'OT'],
  [14, '2 Chronicles', ['2Chr', '2Ch', '2 Chron', '2Paralipomenon', '2Par', '2 Paralipomenon'], 'OT'],
  [15, 'Ezra', ['Ezra', 'Ezr', 'Esdras'], 'OT'], [16, 'Nehemiah', ['Neh', 'Ne', 'Nehemias'], 'OT'],
  [17, 'Esther', ['Esth', 'Est', 'Es'], 'OT'], [18, 'Job', ['Job', 'Jb', 'Iob'], 'OT'],
  [19, 'Psalms', ['Ps', 'Psa', 'Psalm', 'Pss', 'Psm'], 'OT'], [20, 'Proverbs', ['Prov', 'Pro', 'Pr', 'Prv'], 'OT'],
  [21, 'Ecclesiastes', ['Eccl', 'Ecc', 'Ec', 'Qoh'], 'OT'],
  [22, 'Song of Solomon', ['Song', 'SS', 'Sng', 'Cant', 'Song of Songs', 'Canticles', 'Canticle of Canticles'], 'OT'],
  [23, 'Isaiah', ['Isa', 'Is', 'Isaias', 'Esaias'], 'OT'], [24, 'Jeremiah', ['Jer', 'Je', 'Jr', 'Jeremias', 'Ieremias'], 'OT'],
  [25, 'Lamentations', ['Lam', 'La'], 'OT'], [26, 'Ezekiel', ['Ezek', 'Eze', 'Ezk', 'Ezechiel', 'Iezekiel'], 'OT'],
  [27, 'Daniel', ['Dan', 'Da', 'Dn'], 'OT'], [28, 'Hosea', ['Hos', 'Ho', 'Osee'], 'OT'],
  [29, 'Joel', ['Joel', 'Jl'], 'OT'], [30, 'Amos', ['Amos', 'Am'], 'OT'],
  [31, 'Obadiah', ['Obad', 'Ob', 'Abdias'], 'OT'], [32, 'Jonah', ['Jonah', 'Jon', 'Jnh', 'Jonas'], 'OT'],
  [33, 'Micah', ['Mic', 'Mc', 'Micheas'], 'OT'], [34, 'Nahum', ['Nah', 'Na'], 'OT'],
  [35, 'Habakkuk', ['Hab', 'Hb', 'Habacuc'], 'OT'], [36, 'Zephaniah', ['Zeph', 'Zep', 'Zp', 'Sophonias'], 'OT'],
  [37, 'Haggai', ['Hag', 'Hg', 'Aggeus'], 'OT'], [38, 'Zechariah', ['Zech', 'Zec', 'Zc', 'Zacharias'], 'OT'],
  [39, 'Malachi', ['Mal', 'Ml', 'Malachias'], 'OT'],
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
  [66, 'Revelation', ['Rev', 'Re', 'Rv', 'Apoc', 'Apocalypse'], 'NT'],
  // Deuterocanonical / Apocrypha (Tanglaw numbering)
  [67, 'Tobit', ['Tob', 'Tb', 'Tobias', 'Tobie'], 'AP'],
  [68, 'Judith', ['Jdt', 'Jth'], 'AP'],
  [69, 'Additions to Esther', ['AddEsth', 'EsthGr', 'AEs', 'GkEsth', 'RestEsth', 'Rest of Esther', 'The Rest of Esther'], 'AP'],
  [70, 'Wisdom of Solomon', ['Wis', 'Wisd', 'WisSol', 'Wisdom', 'Book of Wisdom', 'Wisdom of Salomon'], 'AP'],
  [71, 'Sirach', ['Sir', 'Ecclus', 'Ecclesiasticus', 'Ben Sira', 'Wisdom of Sirach'], 'AP'],
  [72, 'Baruch', ['Bar', 'Ba', 'Barouch'], 'AP'],
  [73, 'Letter of Jeremiah', ['EpJer', 'LJe', 'LetJer', 'Epistle of Jeremy', 'Epistle of Jeremiah', 'Letter of Ieremias'], 'AP'],
  [74, 'Prayer of Azariah', ['PrAzar', 'SgThree', 'Song3', 'S3Y', 'Aza', 'Song of the Three Children', 'Three Children', 'Prayer of Azarias'], 'AP'],
  [75, 'Susanna', ['Sus', 'Susannah'], 'AP'],
  [76, 'Bel and the Dragon', ['Bel', 'Bel and Dragon'], 'AP'],
  [77, '1 Maccabees', ['1Macc', '1Ma', '1M', '1 Macc', '1Machabees', '1Mach', '1Mac', '1 Machabees', '1 Makkabees'], 'AP'],
  [78, '2 Maccabees', ['2Macc', '2Ma', '2M', '2 Macc', '2Machabees', '2Mach', '2Mac', '2 Machabees', '2 Makkabees'], 'AP'],
  [79, '1 Esdras', ['1Esd', '1Es', '1 Esdr', '3Esdras', '3Esd', '3 Esdras'], 'AP'],
  [80, 'Prayer of Manasseh', ['PrMan', 'Man', 'PMa', 'Prayer of Manasses', 'Manasses'], 'AP'],
  [81, 'Psalm 151', ['Ps151', 'Psa151', 'Psalm151'], 'AP'],
  [82, '3 Maccabees', ['3Macc', '3Ma', '3M', '3 Macc', '3Machabees', '3Mach', '3Mac', '3 Machabees', '3 Makkabees'], 'AP'],
  [83, '2 Esdras', ['2Esd', '2Es', '2 Esdr', '4Ezra', '4 Ezra', '4Esdras', '4Esd', '4 Esdras'], 'AP'],
  [84, '4 Maccabees', ['4Macc', '4Ma', '4M', '4 Macc', '4Machabees', '4Mach', '4Mac', '4 Machabees', '4 Makkabees'], 'AP'],
  [85, 'Odes', ['Odes', 'Ode'], 'AP'],
  [86, 'Psalms of Solomon', ['PsSol', 'PssSol', 'Psalms of Salomon'], 'AP'],
  [87, 'Laodiceans', ['EpLao', 'Laod', 'Epistle to the Laodiceans'], 'AP'],
];

const byId = new Map(BOOKS.map(b => [b[0], { id: b[0], name: b[1], abbr: b[2][0], abbrs: b[2], t: b[3] }]));

// ---- Apocrypha / Deuterocanonical OT placement ---------------------------------------
// '1611'    : as in the 1611 King James Bible – the Apocrypha stands between Malachi and Matthew,
//             in the order of the 1611 table of contents, and counts as part of the Old Testament
//             section (navigation, Old Testament search scope).
// 'end'     : the Apocrypha is a separate section after Revelation (Tanglaw 0.1 behaviour).
// 'catholic': Roman Catholic / Western Deuterocanonical 46-book Old Testament order (Tobit and Judith
//             after Nehemiah; 1–2 Maccabees after Esther; Wisdom and Sirach after Song of Solomon;
//             Baruch and Letter of Jeremiah after Lamentations; Greek Daniel additions after Daniel).
// 'nets'    : Septuagint order of the New English Translation of the Septuagint (NETS); the additional
//             books stand among the other Old Testament books, not as a separate section.
// 'orthodox': the order of the Old Testament in Greek Orthodox Bibles; 4 Maccabees, the Prayer of
//             Manasseh, the Psalms of Solomon and 2 Esdras (4 Ezra) follow as an appendix.
const AP_1611 = [79, 83, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 80, 77, 78];
// deuterocanonical books that the 1611 KJV does not contain: kept right after 2 Maccabees
const AP_OTHER = [82, 84, 81, 85, 86, 87];
const NAMES_1611 = {
  79: '1 Esdras', 83: '2 Esdras', 67: 'Tobit', 68: 'Judith', 69: 'The Rest of Esther', 70: 'Wisdom of Solomon',
  71: 'Ecclesiasticus', 72: 'Baruch', 73: 'Epistle of Jeremy', 74: 'Song of the Three Children', 75: 'Susanna',
  76: 'Bel and the Dragon', 80: 'Prayer of Manasses', 77: '1 Maccabees', 78: '2 Maccabees',
};

const ORDER_CATHOLIC = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  67, 68, 17, 69, 77, 78,
  18, 19, 81, 20, 21, 22, 70, 71,
  23, 24, 25, 72, 73, 26, 27, 74, 75, 76,
  28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  79, 83, 80, 82, 84, 85, 86,
];
const ORDER_NETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 79, 15, 16, 17, 69, 68, 67, 77, 78, 82, 84, 19, 81, 80, 85, 20, 21, 22, 18, 70, 71, 86,
  28, 30, 33, 29, 31, 32, 34, 35, 36, 37, 38, 39, 23, 24, 72, 25, 73, 26, 75, 27, 74, 76, 83];
const ORDER_ORTHODOX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 79, 15, 16, 67, 68, 17, 69, 77, 78, 82, 19, 81, 85, 18, 20, 21, 22, 70, 71,
  28, 30, 33, 29, 31, 32, 34, 35, 36, 37, 38, 39, 23, 24, 72, 25, 73, 26, 27, 74, 75, 76, 84, 80, 86, 83];
const LXX = { catholic: ORDER_CATHOLIC, nets: ORDER_NETS, orthodox: ORDER_ORTHODOX };
// the order used when a caller does not name one (set from the user's choice)
let current = '1611';
function setOrder(mode) { current = ['1611', 'end', 'catholic', 'nets', 'orthodox'].includes(mode) ? mode : '1611'; }
function getOrder() { return current; }
function apMode(mode) { const m = mode || current; return m === 'end' ? 'end' : LXX[m] ? m : '1611'; }

/** sort key for a book id under the chosen order */
function orderKey(id, mode) {
  const m = apMode(mode);
  if (LXX[m]) { if (id >= 40 && id <= 66) return 200 + id; if (id === 87) return 300; const i = LXX[m].indexOf(id); return i < 0 ? 150 + id : i; }
  if (id <= 39) return id;
  if (id <= 66) return 200 + id;
  let i = AP_1611.indexOf(id); if (i < 0) { i = AP_OTHER.indexOf(id); i = i < 0 ? 90 + id : 50 + i; }
  return m === '1611' ? 100 + i : 400 + i;
}

/** section a book belongs to: OT, AP (1611 Apocrypha), APX (other deuterocanon), NT */
function group(id, mode) {
  if (id <= 39) return 'OT';
  if (id <= 66 || id === 87) return 'NT';
  if (LXX[apMode(mode)]) return 'OT';
  return AP_1611.includes(id) ? 'AP' : 'APX';
}

/** does a book fall inside a search scope (all | OT | NT | AP) under the chosen placement? */
function inScope(id, scope, mode) {
  if (!scope || scope === 'all') return true;
  if (scope === 'OT') return id <= 39 || (apMode(mode) !== 'end' && id >= 67 && id !== 87);
  if (scope === 'OTonly') return id <= 39;
  if (scope === 'NT') return id >= 40 && id <= 66;
  if (scope === 'AP') return id >= 67;
  return true;
}

function book(id, mode) {
  const b = byId.get(id) || { id, name: 'Book ' + id, abbr: 'B' + id, abbrs: [], t: 'AP' };
  const out = { ...b, grp: group(id, mode), order: orderKey(id, mode) };
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

// Complete Tagalog book names and abbreviations (Ang Dating Biblia / Magandang Balita + Deuterocanon)
const TAGALOG_NAMES = {
  1: ['Genesis', 'Gen'], 2: ['Exodo', 'Exo'], 3: ['Levitico', 'Lev'], 4: ['Mga Bilang', 'Bil', 'Bilang'],
  5: ['Deuteronomio', 'Deut'], 6: ['Josue', 'Jos'], 7: ['Mga Hukom', 'Huk', 'Hukom'], 8: ['Ruth', 'Rut'],
  9: ['1 Samuel', '1Sam'], 10: ['2 Samuel', '2Sam'], 11: ['1 Mga Hari', '1Hari', '1Ha'], 12: ['2 Mga Hari', '2Hari', '2Ha'],
  13: ['1 Mga Cronica', '1Cron', '1Cr'], 14: ['2 Mga Cronica', '2Cron', '2Cr'], 15: ['Ezra', 'Ezr'], 16: ['Nehemias', 'Neh'],
  17: ['Ester', 'Est'], 18: ['Job', 'Job'], 19: ['Mga Awit', 'Awit', 'Salmo', 'Mga Salmo'], 20: ['Mga Kawikaan', 'Kaw', 'Kawikaan'],
  21: ['Eclesiastes', 'Ecl', 'Mangangaral'], 22: ['Awit ni Solomon', 'Awit ni Sol'], 23: ['Isaias', 'Isa'], 24: ['Jeremias', 'Jer'],
  25: ['Mga Panaghoy', 'Pan', 'Panaghoy'], 26: ['Ezekiel', 'Eze'], 27: ['Daniel', 'Dan'], 28: ['Oseas', 'Ose'],
  29: ['Joel', 'Joe'], 30: ['Amos', 'Amo'], 31: ['Obadias', 'Oba'], 32: ['Jonas', 'Jon'],
  33: ['Mikas', 'Mik'], 34: ['Nahum', 'Nah'], 35: ['Habakkuk', 'Hab'], 36: ['Zefanias', 'Zef', 'Sofonias'],
  37: ['Hagai', 'Hag'], 38: ['Zacarias', 'Zac'], 39: ['Malakias', 'Mal'],
  40: ['Mateo', 'Mat'], 41: ['Marcos', 'Mar'], 42: ['Lucas', 'Luc'], 43: ['Juan', 'Jn'],
  44: ['Mga Gawa', 'Gawa', 'Gaw'], 45: ['Mga Taga-Roma', 'Roma', 'Rom'], 46: ['1 Mga Taga-Corinto', '1Cor', '1 Corinto'],
  47: ['2 Mga Taga-Corinto', '2Cor', '2 Corinto'], 48: ['Mga Taga-Galacia', 'Galacia', 'Gal'], 49: ['Mga Taga-Efeso', 'Efeso', 'Efe'],
  50: ['Mga Taga-Filipos', 'Filipos', 'Fil'], 51: ['Mga Taga-Colosas', 'Colosas', 'Col'],
  52: ['1 Mga Taga-Tesalonica', '1Tes', '1 Tesalonica'], 53: ['2 Mga Taga-Tesalonica', '2Tes', '2 Tesalonica'],
  54: ['1 Timoteo', '1Tim'], 55: ['2 Timoteo', '2Tim'], 56: ['Tito', 'Tit'], 57: ['Filemon', 'Filem'],
  58: ['Mga Hebreo', 'Hebreo', 'Heb'], 59: ['Santiago', 'Sant'], 60: ['1 Pedro', '1Ped'], 61: ['2 Pedro', '2Ped'],
  62: ['1 Juan', '1Jn', '1Juan'], 63: ['2 Juan', '2Jn', '2Juan'], 64: ['3 Juan', '3Jn', '3Juan'],
  65: ['Judas', 'Jud'], 66: ['Pahayag', 'Pah', 'Apocalipsis'],
  67: ['Tobit', 'Tobias'], 68: ['Judit'], 69: ['Dagdag sa Ester', 'Ang Nalabi sa Ester'],
  70: ['Karunungan ni Solomon', 'Karunungan', 'Kar'], 71: ['Sirac', 'Eclesiastico', 'Anak ni Sirac'],
  72: ['Baruc'], 73: ['Sulat ni Jeremias', 'Liham ni Jeremias'],
  74: ['Panalangin ni Azarias', 'Awit ng Tatlong Kabataan'], 75: ['Susana', 'Kasaysayan ni Susana'],
  76: ['Bel at ang Dragon', 'Si Bel at ang Dragon'], 77: ['1 Mga Macabeo', '1 Macabeo', '1Mac'],
  78: ['2 Mga Macabeo', '2 Macabeo', '2Mac'], 79: ['1 Esdras', '3 Esdras'],
  80: ['Panalangin ni Manases', 'Manases'], 81: ['Awit 151', 'Salmo 151'],
  82: ['3 Mga Macabeo', '3 Macabeo', '3Mac'], 83: ['2 Esdras', '4 Esdras'],
  84: ['4 Mga Macabeo', '4 Macabeo', '4Mac'], 85: ['Mga Oda', 'Oda'],
  86: ['Mga Awit ni Solomon', 'Mga Salmo ni Solomon'], 87: ['Mga Taga-Laodicea', 'Laodicea'],
};


// Standard 3-letter UBS / Paratext / USFM / USFX book identifiers (including Deuterocanon / Apocrypha)
const UBS_CODES = {
  GEN: 1, EXO: 2, LEV: 3, NUM: 4, DEU: 5, JOS: 6, JDG: 7, RUT: 8,
  "1SA": 9, "2SA": 10, "1KI": 11, "2KI": 12, "1CH": 13, "2CH": 14, EZR: 15, NEH: 16,
  EST: 17, JOB: 18, PSA: 19, PRO: 20, ECC: 21, SNG: 22, ISA: 23, JER: 24,
  LAM: 25, EZK: 26, DAN: 27, DAG: 27, HOS: 28, JOL: 29, AMO: 30, OBA: 31,
  JON: 32, MIC: 33, NAM: 34, HAB: 35, ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
  MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44, ROM: 45, "1CO": 46, "2CO": 47,
  GAL: 48, EPH: 49, PHP: 50, COL: 51, "1TH": 52, "2TH": 53, "1TI": 54, "2TI": 55,
  TIT: 56, PHM: 57, HEB: 58, JAS: 59, "1PE": 60, "2PE": 61, "1JN": 62, "2JN": 63,
  "3JN": 64, JUD: 65, REV: 66,
  TOB: 67, JDT: 68, ESG: 69, ADE: 69, AES: 69, WIS: 70, SIR: 71, BAR: 72,
  LJE: 73, S3Y: 74, AZA: 74, SUS: 75, BEL: 76, "1MA": 77, "2MA": 78, "1ES": 79,
  ES1: 79, MAN: 80, PS2: 81, PSB: 81, "3MA": 82, "2ES": 83, ES2: 83, "4EZ": 83,
  EZA: 83, "4MA": 84, ODE: 85, ODA: 85, PSS: 86, PSL: 86, LAO: 87,
};

function bookFromUbsCode(code) {
  if (!code) return null;
  const k = String(code).trim().toUpperCase();
  return UBS_CODES[k] || null;
}

const NAME_INDEX = (() => {
  const m = new Map();
  const norm = s => s.toLowerCase().replace(/[\s.]/g, '');
  for (const [id, name, abbrs] of BOOKS) {
    m.set(norm(name), id);
    for (const a of abbrs) m.set(norm(a), id);
  }
  for (const [id, names] of Object.entries(TAGALOG_NAMES)) {
    for (const nm of names) if (!m.has(norm(nm))) m.set(norm(nm), +id);
  }
  for (const [code, id] of Object.entries(UBS_CODES)) {
    if (!m.has(norm(code))) m.set(norm(code), id);
  }
  return { m, norm };
})();

function findBook(s) {
  const k = NAME_INDEX.norm(s);
  if (NAME_INDEX.m.has(k)) return NAME_INDEX.m.get(k);
  // unique prefix match on full names
  const hits = BOOKS.filter(b => NAME_INDEX.norm(b[1]).startsWith(k) || b[2].some(a => NAME_INDEX.norm(a).startsWith(k)));
  return hits.length >= 1 && k.length >= 2 ? hits[0][0] : null;
}

/**
 * Normalize Deuterocanonical chapter references embedded in canonical books
 * (e.g. Dan 13 -> Susanna 1, Dan 14 -> Bel 1, Esth 11-16 -> AddEsth 11-16, Bar 6 -> EpJer 1, Ps 151 -> Ps151 1).
 */
function normalizeRef(r) {
  if (!r) return null;
  const { b, c, v } = r;
  if (b === 27 && c === 13) return { b: 75, c: 1, v };
  if (b === 27 && c === 14) return { b: 76, c: 1, v };
  if (b === 17 && c > 10) return { b: 69, c, v };
  if (b === 72 && c === 6) return { b: 73, c: 1, v };
  if (b === 19 && c === 151) return { b: 81, c: 1, v };
  return r;
}

/** "Jn 3:16", "1 Cor 13", "Tob 1:3", "Sirach 24:1-5", "Dan 13:42", "Bar 6:1" -> {b,c,v} */
function parseRef(s) {
  const m = String(s).trim().match(/^((?:[1-4]\s*)?[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .-]*?)\s*(\d+)?(?:\s*[:.,]\s*(\d+))?(?:\s*[-–]\s*\d+)?\s*$/);
  if (!m) return null;
  const b = findBook(m[1]);
  if (!b) return null;
  return normalizeRef({ b, c: m[2] ? +m[2] : 1, v: m[3] ? +m[3] : 1 });
}

module.exports = {
  BOOKS, TAGALOG_NAMES, UBS_CODES, bookFromUbsCode, ORDER_CATHOLIC, ORDER_NETS, ORDER_ORTHODOX,
  setOrder, getOrder, book, orderKey, group, inScope,
  AP_1611, AP_OTHER, NAMES_1611, kjvChapters, ontLine,
  ONT_TOTAL: ONT_INDEX.total, OT_LINES, NT_LINES, parseRef, normalizeRef, findBook,
};
