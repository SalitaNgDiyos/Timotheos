// Transliteration of Greek and Hebrew words into Latin letters (a simple, general-purpose style
// close to the SBL Handbook's), for showing the original word in popups.

const GK: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'ē', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'ph', χ: 'ch', ψ: 'ps', ω: 'ō', ϝ: 'w', ϲ: 's',
};

/** Greek → Latin letters: breathing marks give h, υ is u after a vowel, γ before γ κ ξ χ is n */
export function greekTranslit(word: string): string {
  const out: string[] = [];
  const chars = [...word.normalize('NFD')];
  // group each base letter with its marks
  const letters: { b: string; rough: boolean; upper: boolean }[] = [];
  for (const ch of chars) {
    if (/[̀-ͯ]/.test(ch)) { if (ch === '̔' && letters.length) letters[letters.length - 1].rough = true; continue; }
    letters.push({ b: ch.toLowerCase(), rough: false, upper: ch !== ch.toLowerCase() });
  }
  for (let i = 0; i < letters.length; i++) {
    const { b, rough, upper } = letters[i]; const prev = letters[i - 1]?.b || ''; const next = letters[i + 1]?.b || '';
    let t = GK[b];
    if (t == null) { out.push(b); continue; }
    if (b === 'γ' && 'γκξχ'.includes(next)) t = 'n';
    if (b === 'υ' && 'αεηο'.includes(prev) && prev) t = 'u';
    if (b === 'ρ' && rough) t = 'rh';
    else if (rough) {
      // the rough breathing sits on the second vowel of a diphthong but sounds before the first
      const start = !prev || !GK[prev];
      if (start) t = 'h' + t; else { const j = out.length - 1; out[j] = (out[j][0] === out[j][0].toUpperCase() && out[j][0] !== out[j][0].toLowerCase() ? 'H' + out[j].toLowerCase() : 'h' + out[j]); }
    }
    if (upper) t = t[0].toUpperCase() + t.slice(1);
    out.push(t);
  }
  return out.join('').normalize('NFC');
}

const HB: Record<string, string> = {
  'א': 'ʾ', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'w', 'ז': 'z', 'ח': 'ḥ', 'ט': 'ṭ', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm', 'ם': 'm',
  'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'ʿ', 'פ': 'p', 'ף': 'p', 'צ': 'ṣ', 'ץ': 'ṣ', 'ק': 'q', 'ר': 'r', 'ש': 'š', 'ת': 't',
};
const HV: Record<string, string> = {
  'ְ': 'ə', 'ֱ': 'ĕ', 'ֲ': 'ă', 'ֳ': 'ŏ', 'ִ': 'i', 'ֵ': 'ē', 'ֶ': 'e', 'ַ': 'a', 'ָ': 'ā', 'ֹ': 'ō', 'ֺ': 'ō', 'ֻ': 'u', 'ׇ': 'o',
};

/** Hebrew → Latin letters (consonants and vowel points; dagesh doubles a letter after a vowel; final silent shewa dropped) */
export function hebrewTranslit(word: string): string {
  const s = [...word.normalize('NFD')]; let out = '';
  let prev: 'start' | 'vowel' | 'silent' = 'start';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (HB[ch] == null) {
      if (ch === '\u05BE' || ch === ' ') { out += ch === ' ' ? ' ' : '-'; prev = 'start'; continue; } // maqaf, space
      if (/[\u0591-\u05C7]/.test(ch)) continue;
      out += ch; prev = 'start'; continue;
    }
    const marks: string[] = []; let j = i + 1;
    while (j < s.length && /[\u0591-\u05C7]/.test(s[j]) && HB[s[j]] == null) marks.push(s[j++]);
    const last = j >= s.length || HB[s[j]] == null;
    const dagesh = marks.includes('\u05BC'); const vowel = marks.map(m => HV[m]).filter(Boolean).pop() || '';
    i = j - 1;
    if (ch === 'ו' && prev !== 'start' && !vowel && dagesh) { out += 'û'; prev = 'vowel'; continue; }  // shureq
    if (ch === 'ו' && prev !== 'start' && vowel === 'ō' && !dagesh) { out += 'ô'; prev = 'vowel'; continue; } // holem waw
    let c = ch === 'ש' ? (marks.includes('\u05C2') ? 'ś' : 'š') : HB[ch];
    if (dagesh && prev === 'vowel' && ch !== 'ה') c += c; // strong dagesh doubles
    if (ch === 'ה' && last && !vowel && !dagesh) c = ''; // final silent he
    if (ch === 'י' && !vowel && prev === 'vowel' && /[iēe]$/.test(out)) { out = out.replace(/i$/, 'î').replace(/ē$/, 'ê').replace(/e$/, 'ê'); prev = 'vowel'; continue; } // hireq/sere yod
    let v = vowel;
    if (v === 'ə') { if (last || prev === 'vowel') { v = ''; prev = 'silent'; } else prev = 'vowel'; }
    else prev = v ? 'vowel' : 'silent';
    if (ch === 'ח' && v === 'a' && last) { out += 'a' + c; continue; } // furtive patah
    out += c + v;
  }
  return out.normalize('NFC');
}

const GREEK = /[Ͱ-Ͽἀ-῿]/, HEBREW = /[֐-׿יִ-ﭏ]/;
/** the first Greek or Hebrew word in a piece of text (e.g. a dictionary entry) */
export function firstOriginal(text: string, want?: 'greek' | 'hebrew'): string {
  const re = want === 'hebrew' ? /[֐-׿יִ-ﭏ]+(?:[־\s][֐-׿יִ-ﭏ]+)?/ : want === 'greek' ? /[Ͱ-Ͽἀ-῿̀-ͯ]+/ : /[Ͱ-Ͽἀ-῿̀-ͯ]+|[֐-׿יִ-ﭏ]+/;
  const m = re.exec(text); return m ? m[0].trim() : '';
}
export function translit(word: string): string {
  if (GREEK.test(word)) return greekTranslit(word);
  if (HEBREW.test(word)) return hebrewTranslit(word);
  return '';
}
