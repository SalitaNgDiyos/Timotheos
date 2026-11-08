/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// USFM (Unified Standard Format Markers 2.x / 3.0: .usfm, .sfm, .ptx, folders, and .zip archives)
// and USFX (Unified Scripture Format XML: .usfx, .usfx.xml, .xml with <usfx> root, and .zip archives)
// Bible module readers for Timotheos.
// Supports all 66 canonical books plus all Deuterocanonical / Apocryphal books (67..87) and embedded
// Deuterocanonical chapters (Daniel 13-14, Daniel 3:24-90, Esther 11-16, Baruch 6, Psalms 151).
const fs = require('fs');
const path = require('path');
const canon = require('./canon');
const zip = require('./zip');
const { linkHtml } = require('./refs');

const USFM_EXT = /\.(usfm|sfm|ptx)$/i;
const USFX_EXT = /\.(usfx|usfx\.xml)$/i;

const escT = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = s => escT(s).replace(/"/g, '&quot;');

function decodeXmlEnt(s) {
  return String(s || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Normalize a Strong's number from USFM/USFX (e.g. "H00430" -> "H430", unfoldingWord 5-digit "G35880" -> "G3588").
 */
function normStrong(raw) {
  const out = [];
  for (const tok of String(raw || '').split(/[\s,;]+/)) {
    const m = /^([GHgh])0*(\d+)([a-z]?)$/.exec(tok.trim());
    if (!m) continue;
    const L = m[1].toUpperCase();
    let num = parseInt(m[2], 10);
    const suf = m[3] || '';
    // unfoldingWord USFM 3.0 appends a 5th disambiguation digit (usually 0) when raw digits === 5
    if (m[2].length === 5 && ((L === 'G' && num > 5624) || (L === 'H' && num > 8674)) && num % 10 === 0) {
      num = Math.floor(num / 10);
    }
    if (num > 0) out.push(L + num + suf);
  }
  return out;
}

/**
 * Parse a USFM/USFX reference like "GEN.1.1", "JHN 3:16", "1MA.2.5" -> Timotheos {b, c, v}
 */
function parseUbsOrTextRef(str) {
  if (!str) return null;
  const s = String(str).trim();
  const mDot = /^([1-4]?[A-Za-z]{2,4})[.\s]+(\d+)(?:[.:](\d+))?/.exec(s);
  if (mDot) {
    const b = canon.bookFromUbsCode(mDot[1]) || canon.findBook(mDot[1]);
    if (b) return canon.normalizeRef({ b, c: +mDot[2] || 1, v: +mDot[3] || 1 });
  }
  return canon.parseRef(s);
}

/**
 * Map a (bookId, chapterNum) pair for embedded Deuterocanonical chapters when not present as standalone books.
 */
function mapDeutChapter(b, c, hasStandalone) {
  const standalone = id => hasStandalone && hasStandalone.has(id);
  if (b === 27 && c === 13 && !standalone(75)) return [75, 1];
  if (b === 27 && c === 14 && !standalone(76)) return [76, 1];
  if (b === 17 && c > 10 && !standalone(69)) return [69, c];
  if (b === 72 && c === 6 && !standalone(73)) return [73, 1];
  if (b === 19 && c === 151 && !standalone(81)) return [81, 1];
  return [b, c];
}

/**
 * Render a word with optional Strong's, morphology, and lemma into Timotheos's interactive HTML span.
 */
function renderTaggedWord(wordHtml, strongs, morphs, lemma) {
  const st = normStrong(strongs);
  const mo = String(morphs || '').split(/\s+/).map(x => x.trim()).filter(Boolean);
  const le = String(lemma || '').trim();
  if (!st.length && !mo.length && !le) return wordHtml;
  const attrs =
    (st.length ? ` data-strong="${escA(st.join(' '))}"` : '') +
    (mo.length ? ` data-morph="${escA(mo.join(' '))}"` : '') +
    (le ? ` data-lemma="${escA(le)}"` : '');
  return `<span class="word"${attrs}>${wordHtml}</span>` +
    st.map(x => `<sup class="strong" data-strong="${escA(x)}">${escT(x)}</sup>`).join('') +
    mo.map(x => `<sup class="morph" data-morph="${escA(x)}">${escT(x)}</sup>`).join('');
}

/* ============================================================================
 * 1. USFM 2.x / 3.0 Parser
 * ========================================================================== */

/**
 * Convert USFM inline markup within a single verse/heading fragment to Timotheos HTML.
 */
function usfmInlineToHtml(raw, state = {}) {
  let s = String(raw || '');

  // 1. Handle USFM 3.0 alignment milestones: \zaln-s |... \* ... \zaln-e\*
  const zalnStack = [];
  s = s.replace(/\\zaln-s\s*\|([^\\]*?)\\\*|\\zaln-e\\\*|\\w\s+([\s\S]*?)\\w\*/g, (m, zAttrs, wBody) => {
    if (zAttrs !== undefined) {
      const st = (/x-strong="([^"]*)"/.exec(zAttrs) || [])[1] || '';
      const mo = (/x-morph="([^"]*)"/.exec(zAttrs) || [])[1] || '';
      const le = (/x-lemma="([^"]*)"/.exec(zAttrs) || [])[1] || '';
      zalnStack.push({ st, mo, le });
      return '';
    }
    if (m.startsWith('\\zaln-e')) {
      zalnStack.pop();
      return '';
    }
    if (wBody !== undefined) {
      return renderUsfmWord(wBody, zalnStack[zalnStack.length - 1], state);
    }
    return m;
  });

  // Strip any other remaining USFM 3.0 milestones like \ts\*, \qt-s |...\*, \qt-e\*
  s = s.replace(/\\[a-z0-9]+-[se](?:\s*\|[^\\]*?)?\\\*/gi, '').replace(/\\ts\\\*/gi, '');

  // 2. Footnotes: \f + ... \f* and \fe + ... \fe*
  s = s.replace(/\\f(?:e)?\s+([^\s\\]+\s+)?([\s\S]*?)\\f(?:e)?\*/g, (_, _caller, body) => {
    const noteHtml = formatUsfmNote(body, false);
    return noteHtml ? `<sup class="fn" data-note="${escA(noteHtml)}">f</sup>` : '';
  });

  // 3. Cross-references: \x - ... \x*
  s = s.replace(/\\x\s+([^\s\\]+\s+)?([\s\S]*?)\\x\*/g, (_, _caller, body) => {
    const xrefHtml = formatUsfmNote(body, true);
    return xrefHtml ? `<sup class="fn xref" data-note="${escA(xrefHtml)}">x</sup>` : '';
  });

  // 4. Strip figures \fig ... \fig* and alternate verse/chapter numbers \va...\va*, \vp...\vp*, \ca...\ca*
  s = s.replace(/\\(?:fig|va|vp|ca)\b[\s\S]*?\\(?:fig|va|vp|ca)\*/g, '');

  // 5. Handle USFM 2.x word + adjacent \wg / \wh / \wm tags, and standalone \w ... \w*
  s = s.replace(/\\w\s+([\s\S]*?)\\w\*(?:\s*\\w([ghm])\s+([\s\S]*?)\\w\2\*)*/g, (m, wBody, kind, extra) => {
    let attrs = '';
    if (kind && extra) {
      const k = kind.toLowerCase();
      if (k === 'g' || k === 'h') attrs = `strong="${extra.trim()}"`;
      else if (k === 'm') attrs = `x-morph="${extra.trim()}"`;
    }
    return renderUsfmWord(attrs ? `${wBody}|${attrs}` : wBody, null, state);
  });
  // Standalone \wg H1234\wg* or \wh H1234\wh* not preceded by \w
  s = s.replace(/\\w([gh])\s+([^\s\\]+)\s*\\w\1\*/gi, (_, l, num) => {
    const st = normStrong(num.startsWith('G') || num.startsWith('H') ? num : l.toUpperCase() + num);
    if (!st.length) return '';
    state.hasStrongs = true;
    return st.map(x => `<sup class="strong" data-strong="${escA(x)}">${escT(x)}</sup>`).join('');
  });

  // 6. Paired character markers: \wj...\wj*, \add...\add*, \nd...\nd*, \bd...\bd*, \it...\it*, \bdit...\bdit*, \sc...\sc*, \qt...\qt*, \qs...\qs*, \tl...\tl*, \bk...\bk*, \k...\k*
  const charPairs = [
    ['wj', 'span', ' class="woj"'],
    ['add', 'span', ' class="added"'],
    ['nd', 'span', ' class="sc"'],
    ['sc', 'span', ' class="sc"'],
    ['bd', 'b', ''],
    ['it', 'i', ''],
    ['em', 'i', ''],
    ['bdit', 'b', ' style="font-style:italic"'],
    ['qt', 'i', ''],
    ['qs', 'i', ' class="selah"'],
    ['tl', 'i', ''],
    ['bk', 'i', ''],
    ['k', 'b', ''],
    ['sup', 'sup', ''],
  ];
  for (let pass = 0; pass < 2; pass++) {
    for (const [tag, elem, attr] of charPairs) {
      const re = new RegExp(`\\\\\\+?${tag}\\s+([\\s\\S]*?)\\\\\\+?${tag}\\*`, 'g');
      s = s.replace(re, (_, inner) => `<${elem}${attr}>${inner}</${elem}>`);
    }
  }

  // Strip any remaining unknown paired or unpaired backslash markers cleanly
  s = s.replace(/\\\+?[a-z0-9]+\*/gi, '');
  s = s.replace(/\\\+?[a-z0-9]+\s?/gi, '');
  // Clean up USFM ~ (non-breaking space) and // (optional line break)
  s = s.replace(/~/g, '\u00A0').replace(/\s*\/\/\s*/g, '<br>');
  return s.replace(/\s+/g, ' ').trim();
}

function renderUsfmWord(wBody, zaln, state) {
  const parts = String(wBody || '').split('|');
  const wordText = escT(parts[0].trim());
  if (!wordText) return '';
  const attrStr = parts.slice(1).join('|').trim();
  let strongs = '', morphs = '', lemma = '';
  if (attrStr) {
    if (!attrStr.includes('=')) {
      strongs = attrStr;
    } else {
      strongs = ((/(?:x-)?strong="([^"]*)"/i.exec(attrStr) || [])[1]) || '';
      morphs = ((/(?:x-)?morph="([^"]*)"/i.exec(attrStr) || [])[1]) || '';
      lemma = ((/(?:x-)?lemma="([^"]*)"/i.exec(attrStr) || [])[1]) || '';
    }
  }
  if (zaln) {
    if (!strongs && zaln.st) strongs = zaln.st;
    if (!morphs && zaln.mo) morphs = zaln.mo;
    if (!lemma && zaln.le) lemma = zaln.le;
  }
  if (strongs) state.hasStrongs = true;
  return renderTaggedWord(wordText, strongs, morphs, lemma);
}

function formatUsfmNote(body, isXref) {
  let s = String(body || '');
  s = s.replace(/\\(?:fr|xo)\s+([^\\]+)/g, (_, r) => `<b>${escT(r.trim())}</b> `);
  s = s.replace(/\\(?:fk|xk)\s+([^\\]+)/g, (_, k) => `<b>${escT(k.trim())}:</b> `);
  s = s.replace(/\\(?:fq|fqa)\s+([^\\]+)/g, (_, q) => `<i>${escT(q.trim())}</i> `);
  s = s.replace(/\\(?:ft|xt|fv)\s+([^\\]+)/g, (_, t) => `${escT(t.trim())} `);
  s = s.replace(/\\[a-z0-9]+\*?/gi, '');
  s = s.replace(/\s+/g, ' ').trim();
  return isXref ? linkHtml(s) : s;
}

/**
 * Parse one or more USFM text strings into a Timotheos book/chapter/verse map.
 */
function parseUsfmTexts(texts) {
  const meta = { title: '', abbr: '', about: '', lang: '', hasStrongs: false };
  const standaloneBooks = new Set();
  const entries = []; // [{b, c, v, html}]

  for (const text of texts) {
    const lines = String(text || '').replace(/^\uFEFF/, '').replace(/\r+\n/g, '\n').split(/\r\n|\n|\r/);
    let curBook = null;
    let curChap = 0;
    let curVerse = 0;
    let pendingHeading = '';
    let vBuf = '';

    const flushVerse = (trailBreak = '') => {
      if (!curBook || !curChap || !curVerse) { vBuf = ''; return; }
      const htmlBody = usfmInlineToHtml(vBuf, meta);
      vBuf = '';
      if (!htmlBody && !pendingHeading) return;
      const fullHtml = (pendingHeading ? pendingHeading : '') + htmlBody + trailBreak;
      pendingHeading = '';
      entries.push({ b: curBook, c: curChap, v: curVerse, html: fullHtml });
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('#')) {
        const mMeta = /^#\s*timotheos\.(title|abbr|lang)\s*=\s*(.+)$/i.exec(line);
        if (mMeta) meta[mMeta[1].toLowerCase()] = mMeta[2].trim();
        continue;
      }

      const mId = /^\\id\s+([1-4]?[A-Za-z]{2,4})(?:\s+(.*))?$/.exec(line);
      if (mId) {
        flushVerse();
        curBook = canon.bookFromUbsCode(mId[1]);
        if (curBook && curBook >= 67) standaloneBooks.add(curBook);
        curChap = 0;
        curVerse = 0;
        pendingHeading = '';
        if (mId[2] && !meta.about) meta.about = escT(mId[2].trim());
        continue;
      }

      if (!curBook) continue;
      if (/^\\(ide|sts|rem|h|toc[1-3]?|mt[1-4]?|mte[1-2]?|i[pm]|iot|io[1-4]?|is[1-2]?)\b/.test(line)) continue;

      const mChap = /^\\c\s+(\d+)/.exec(line);
      if (mChap) {
        flushVerse();
        curChap = parseInt(mChap[1], 10);
        curVerse = 0;
        pendingHeading = '';
        continue;
      }

      if (!curChap) continue;

      const mSec = /^\\(s[1-4]?|ms[1-3]?|mr|d|sp|r)\b\s*(.*)$/.exec(line);
      if (mSec) {
        flushVerse('<span class="para cm"></span>');
        const mk = mSec[1];
        const txt = usfmInlineToHtml(mSec[2], meta);
        if (txt) {
          if (mk === 'r') {
            pendingHeading += `<span class="heading h3">${linkHtml(txt)}</span>`;
          } else if (mk === 'd' || mk === 'sp') {
            pendingHeading += `<span class="heading h3"><i>${txt}</i></span>`;
          } else {
            const lvl = mk.endsWith('2') ? 'h2' : mk.endsWith('3') || mk.endsWith('4') ? 'h3' : 'h1';
            pendingHeading += `<span class="heading ${lvl}">${txt}</span>`;
          }
        }
        continue;
      }

      let rest = line;
      const mPar = /^\\(p|m|pmo|pm|pmc|pmr|pi[1-3]?|mi|nb|pc|pr|cls|q[1-4]?|qr|qc|qm[1-2]?|qd|b|li[1-3]?)\b\s*(.*)$/.exec(rest);
      if (mPar) {
        const pTag = mPar[1];
        rest = mPar[2];
        const isQ = pTag.startsWith('q') || pTag === 'b';
        if (curVerse > 0) {
          if (!rest || /^\\v\s+\d+/.test(rest)) {
            // Paragraph/poetry break occurs between the current verse and the next verse
            flushVerse(isQ ? '<br>' : '<span class="para cm"></span>');
            curVerse = 0;
          } else if (vBuf) {
            vBuf += isQ ? '<br>\u00A0\u00A0' : '<br>';
          }
        }
      }

      if (!rest) continue;

      const vParts = rest.split(/(?=\\v\s+\d+)/);
      for (const part of vParts) {
        const mv = /^\\v\s+(\d+)(?:-\d+)?[a-z]?\s*([\s\S]*)$/.exec(part);
        if (mv) {
          flushVerse();
          curVerse = parseInt(mv[1], 10);
          vBuf = mv[2] || '';
        } else if (curVerse > 0) {
          vBuf += (vBuf ? ' ' : '') + part;
        }
      }
    }
    flushVerse();
  }

  return finalizeParsedBible(entries, standaloneBooks, meta);
}

/* ============================================================================
 * 2. USFX (Unified Scripture Format XML) Parser
 * ========================================================================== */

function parseUsfxXml(xmlStr) {
  const meta = { title: '', abbr: '', about: '', lang: '', hasStrongs: false };
  const standaloneBooks = new Set();
  const entries = [];

  const s = String(xmlStr || '').replace(/^\uFEFF/, '');
  const mLang = /<languageCode>\s*([^<]+?)\s*<\/languageCode>/i.exec(s);
  if (mLang) meta.lang = decodeXmlEnt(mLang[1].trim());

  // Extract each <book id="..."> ... </book>
  const bookRe = /<book\b([^>]*)>([\s\S]*?)<\/book>/gi;
  let bm;
  while ((bm = bookRe.exec(s))) {
    const attrs = bm[1] || '';
    const body = bm[2] || '';
    let code = ((/\bid\s*=\s*["']([^"']+)["']/i.exec(attrs) || [])[1]) || '';
    if (!code) {
      const mIdTag = /<id\b[^>]*\bid\s*=\s*["']([^"']+)["']/i.exec(body) || /<id\b[^>]*>\s*([1-4]?[A-Za-z]{2,4})\b/i.exec(body);
      if (mIdTag) code = mIdTag[1];
    }
    const b = canon.bookFromUbsCode(code);
    if (!b) continue;
    if (b >= 67) standaloneBooks.add(b);

    let curChap = 0;
    let curVerse = 0;
    let pendingHeading = '';
    let vBuf = '';

    const flushVerse = (trailBreak = '') => {
      if (!b || !curChap || !curVerse) { vBuf = ''; return; }
      const cleaned = vBuf.replace(/^(\s*<br>\s*)+/, '').replace(/(\s*<br>\s*)+$/, '').replace(/\s+/g, ' ').trim();
      vBuf = '';
      if (!cleaned && !pendingHeading) return;
      entries.push({ b, c: curChap, v: curVerse, html: (pendingHeading || '') + cleaned + trailBreak });
      pendingHeading = '';
    };

    // Tokenize tags and text inside <book>
    const tokRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([a-zA-Z0-9_:-]+)([^>]*?)(\/?)>|([^<]+)/g;
    let tm;
    const skipStack = [];
    const tagStack = [];
    let inHeading = null; // 'h1' | 'h2' | 'h3' | 'd' | 'r'
    let headingBuf = '';
    let inNote = null;    // { kind: 'f'|'x', buf: '' }
    let inWord = null;    // { strongs, morphs, lemma, buf: '' }

    while ((tm = tokRe.exec(body))) {
      if (tm[0].startsWith('<!') || tm[0].startsWith('<?')) continue;
      const isClose = tm[1] === '/';
      const rawTag = tm[2];
      const tag = rawTag ? rawTag.toLowerCase() : '';
      const tAttrs = tm[3] || '';
      const selfClose = tm[4] === '/';
      const textNode = tm[5];

      if (textNode !== undefined) {
        if (skipStack.length) continue;
        const decoded = escT(decodeXmlEnt(textNode));
        if (inNote) { inNote.buf += decoded; continue; }
        if (inWord) { inWord.buf += decoded; continue; }
        if (inHeading) { headingBuf += decoded; continue; }
        if (curChap > 0 && curVerse > 0) vBuf += decoded;
        continue;
      }

      // Chapter <c id="1"/> or <c id="1"> and Verse <v id="1"/> or <ve/> always end any skipped header block
      if (tag === 'c') {
        skipStack.length = 0;
        if (!isClose) {
          flushVerse();
          const cid = (/\bid\s*=\s*["'](\d+)["']/i.exec(tAttrs) || [])[1];
          if (cid) { curChap = parseInt(cid, 10); curVerse = 0; pendingHeading = ''; }
        }
        continue;
      }
      if (tag === 'v') {
        skipStack.length = 0;
        if (isClose) {
          flushVerse();
          curVerse = 0;
        } else {
          flushVerse();
          const vid = (/\bid\s*=\s*["'](\d+)/i.exec(tAttrs) || [])[1];
          if (vid) curVerse = parseInt(vid, 10);
        }
        continue;
      }
      if (tag === 've') {
        flushVerse();
        curVerse = 0;
        continue;
      }

      // If currently inside a skipped header/intro tag (<id>, <h>, <toc>, <mt>, <p sfm="mt">, etc.),
      // pop when the matching closing tag is reached and skip everything inside.
      if (skipStack.length) {
        if (isClose && skipStack[skipStack.length - 1] === tag) {
          skipStack.pop();
        } else if (!isClose && !selfClose && skipStack[skipStack.length - 1] === tag) {
          skipStack.push(tag);
        }
        continue;
      }

      // Skip book-level metadata tags (<id>, <h>, <toc>, <mt>, <rem>, <sts>, <periph>)
      if (['id', 'h', 'toc', 'mt', 'mte', 'rem', 'sts', 'periph', 'cl', 'cp'].includes(tag)) {
        if (!selfClose && !isClose) skipStack.push(tag);
        continue;
      }

      // Footnotes <f>...</f>, <fe>...</fe> and Cross-references <x>...</x>
      if (tag === 'f' || tag === 'fe' || tag === 'x') {
        if (!isClose && !selfClose) {
          inNote = { kind: tag === 'x' ? 'x' : 'f', buf: '' };
        } else if (isClose && inNote) {
          const noteHtml = inNote.kind === 'x' ? linkHtml(inNote.buf.trim()) : inNote.buf.trim();
          if (noteHtml && curChap > 0 && curVerse > 0) {
            vBuf += `<sup class="fn${inNote.kind === 'x' ? ' xref' : ''}" data-note="${escA(noteHtml)}">${inNote.kind}</sup>`;
          }
          inNote = null;
        }
        continue;
      }
      if (inNote) {
        if (tag === 'fr' || tag === 'xo' || tag === 'fk' || tag === 'xk') {
          inNote.buf += isClose ? '</b> ' : '<b>';
        } else if (tag === 'fq' || tag === 'fqa') {
          inNote.buf += isClose ? '</i> ' : '<i>';
        } else if (tag === 'ref' && !isClose) {
          const tgt = (/\btgt\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1];
          const r = parseUbsOrTextRef(tgt);
          if (r) { inNote.buf += `<a class="link" data-href="tw://bible.*?id=${r.b}.${r.c}.${r.v}">`; inNote.inRef = true; }
        } else if (tag === 'ref' && isClose && inNote.inRef) {
          inNote.buf += '</a>';
          inNote.inRef = false;
        }
        continue;
      }

      // Headings: <s level="1">...</s>, <d>...</d>, <ms>...</ms>
      if (tag === 's' || tag === 'd' || tag === 'ms') {
        if (!isClose && !selfClose) {
          flushVerse('<span class="para cm"></span>');
          const lvl = (/\blevel\s*=\s*["'](\d+)["']/i.exec(tAttrs) || [])[1] || '1';
          inHeading = tag === 'd' ? 'd' : `h${Math.min(3, +lvl || 1)}`;
          headingBuf = '';
        } else if (isClose && inHeading) {
          const htxt = headingBuf.trim();
          if (htxt) {
            if (inHeading === 'd') pendingHeading += `<span class="heading h3"><i>${htxt}</i></span>`;
            else pendingHeading += `<span class="heading ${inHeading}">${htxt}</span>`;
          }
          inHeading = null;
          headingBuf = '';
        }
        continue;
      }

      if (tag === 'p' || tag === 'q') {
        if (!isClose && !selfClose) {
          const sfm = ((/\bsfm\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1] || '').toLowerCase();
          if (/^(mt|mte|h|toc|ip|im|iot|io|is|ide|sts|rem)/.test(sfm)) {
            skipStack.push(tag);
            continue;
          }
          if (/^(s[1-4]?|ms[1-3]?|d|r|sp)$/.test(sfm)) {
            flushVerse('<span class="para cm"></span>');
            inHeading = sfm === 'd' || sfm === 'sp' ? 'd' : sfm === 'r' ? 'r' : sfm.endsWith('2') ? 'h2' : sfm.endsWith('3') ? 'h3' : 'h1';
            headingBuf = '';
            tagStack.push({ tag, isHeading: true });
            continue;
          }
          const isQ = tag === 'q' || sfm.startsWith('q');
          tagStack.push({ tag, isHeading: false, isQ });
          if (curVerse > 0 && vBuf) vBuf += isQ ? '<br>\u00A0\u00A0' : '<br>';
        } else if (isClose) {
          const top = tagStack.pop();
          if (top && top.isHeading && inHeading) {
            const htxt = headingBuf.trim();
            if (htxt) {
              if (inHeading === 'r') pendingHeading += `<span class="heading h3">${linkHtml(htxt)}</span>`;
              else if (inHeading === 'd') pendingHeading += `<span class="heading h3"><i>${htxt}</i></span>`;
              else pendingHeading += `<span class="heading ${inHeading}">${htxt}</span>`;
            }
            inHeading = null;
            headingBuf = '';
          } else if (top && !top.isHeading && !curVerse && entries.length && entries[entries.length - 1].b === b && entries[entries.length - 1].c === curChap) {
            // Paragraph/poetry tag closed right after <ve/>: mark paragraph break on the just-flushed verse
            const lastEnt = entries[entries.length - 1];
            const brk = top.isQ ? '<br>' : '<span class="para cm"></span>';
            if (!lastEnt.html.endsWith(brk)) lastEnt.html += brk;
          }
        }
        continue;
      }

      // Word tag <w s="H0430" m="..." l="...">...</w>
      if (tag === 'w') {
        if (!isClose && !selfClose) {
          const st = ((/\b(?:s|strong)\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1]) || '';
          const mo = ((/\b(?:m|morph)\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1]) || '';
          const le = ((/\b(?:l|lemma)\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1]) || '';
          if (st) meta.hasStrongs = true;
          inWord = { strongs: st, morphs: mo, lemma: le, buf: '' };
        } else if (isClose && inWord) {
          const rendered = renderTaggedWord(inWord.buf, inWord.strongs, inWord.morphs, inWord.lemma);
          if (inHeading) headingBuf += rendered;
          else if (curChap > 0 && curVerse > 0) vBuf += rendered;
          inWord = null;
        }
        continue;
      }

      // Inline formatting tags (<wj>, <add>, <nd>, <sc>, <bd>, <it>, <bdit>, <qt>, <qs>, <ref>)
      const targetAdd = txt => {
        if (inHeading) headingBuf += txt;
        else if (curChap > 0 && curVerse > 0) vBuf += txt;
      };
      if (tag === 'wj') targetAdd(isClose ? '</span>' : '<span class="woj">');
      else if (tag === 'add') targetAdd(isClose ? '</span>' : '<span class="added">');
      else if (tag === 'nd' || tag === 'sc') targetAdd(isClose ? '</span>' : '<span class="sc">');
      else if (tag === 'bd' || tag === 'k') targetAdd(isClose ? '</b>' : '<b>');
      else if (tag === 'it' || tag === 'qt' || tag === 'qs' || tag === 'tl' || tag === 'bk') targetAdd(isClose ? '</i>' : '<i>');
      else if (tag === 'bdit') targetAdd(isClose ? '</i></b>' : '<b><i>');
      else if (tag === 'b' && selfClose) targetAdd('<br>');
      else if (tag === 'ref') {
        if (!isClose && !selfClose) {
          const tgt = (/\btgt\s*=\s*["']([^"']+)["']/i.exec(tAttrs) || [])[1];
          const r = parseUbsOrTextRef(tgt);
          targetAdd(r ? `<a class="link" data-href="tw://bible.*?id=${r.b}.${r.c}.${r.v}">` : '<span>');
        } else if (isClose) {
          targetAdd('</a>');
        }
      }
    }
    flushVerse();
  }

  return finalizeParsedBible(entries, standaloneBooks, meta);
}

/**
 * Shared post-processor that builds `books`, `verseMap`, embedded Deuterocanonical chapter splits
 * (Susanna, Bel, Additions to Esther, Letter of Jeremiah, Prayer of Azariah, Psalm 151), and warnings.
 */
function finalizeParsedBible(entries, standaloneBooks, meta) {
  const verseMap = new Map(); // "b.c.v" -> '<_HTML_>' + html
  const books = {};
  const warnings = [];
  let daniel3MaxV = 0;

  for (const { b: rawB, c: rawC, v, html } of entries) {
    const [b, c] = mapDeutChapter(rawB, rawC, standaloneBooks);
    const tagged = '<_HTML_>' + html;
    const key = `${b}.${c}.${v}`;
    if (verseMap.has(key)) {
      verseMap.set(key, verseMap.get(key) + ' ' + html);
    } else {
      verseMap.set(key, tagged);
    }
    const rawKey = `${rawB}.${rawC}.${v}`;
    if (!verseMap.has(rawKey)) verseMap.set(rawKey, tagged);
    if (b === 69 && c > 10 && !verseMap.has(`69.${c - 10}.${v}`)) {
      verseMap.set(`69.${c - 10}.${v}`, tagged);
    }

    const chArr = books[b] || (books[b] = []);
    if (!chArr[c - 1] || v > chArr[c - 1]) chArr[c - 1] = v;
    if (rawB === 27 && rawC === 3 && v > daniel3MaxV) daniel3MaxV = v;
  }

  if (daniel3MaxV > 35 && !books[74]) {
    let maxAz = 0;
    for (let v = 24; v <= Math.min(91, daniel3MaxV); v++) {
      const dv = verseMap.get(`27.3.${v}`);
      if (dv) {
        maxAz = v - 23;
        verseMap.set(`74.1.${maxAz}`, dv);
      }
    }
    if (maxAz > 0) books[74] = [maxAz];
  }

  for (const b in books) {
    const arr = books[b];
    for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = 0;
  }

  return { verseMap, books, warnings, meta };
}

/* ============================================================================
 * 3. Module Loaders, Probing, and Archive Bundling
 * ========================================================================== */

function isUsfmFile(name) {
  return USFM_EXT.test(name) || /\.usfm\.zip$/i.test(name);
}

function isUsfxFile(name) {
  return USFX_EXT.test(name) || /\.usfx\.zip$/i.test(name);
}

/**
 * Quick check whether an .xml file is a USFX Bible (<usfx ...> root tag in the first 4 KB).
 */
function probeXml(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const head = buf.slice(0, n).toString('utf8');
    return /<usfx\b/i.test(head);
  } catch (e) {
    return false;
  }
}

function makeBibleMod(idPrefix, formatLabel, kindLabel, file, parsed) {
  const baseName = path.basename(file).replace(/[_-]?(usfm|usfx)?\.(usfm\.zip|usfx\.zip|usfx\.xml|usfm|sfm|ptx|usfx|xml)$/i, '');
  const abbr = parsed.meta.abbr || baseName.slice(0, 12);
  const title = parsed.meta.title || baseName.replace(/[_-]+/g, ' ');
  return {
    id: `${idPrefix}:${path.basename(file)}`,
    file,
    format: formatLabel,
    kind: kindLabel,
    abbr,
    title,
    props: {
      title,
      abbrev: abbr,
      lang: parsed.meta.lang || '',
      about: parsed.meta.about || '',
    },
    rules: [],
    books: parsed.books,
    warnings: parsed.warnings,
    about: parsed.meta.about || '',
    rtl: /^(heb|ara|arc|fas|urd|syr|he|ar|fa|ur)$/i.test(parsed.meta.lang || ''),
    hasStrongs: !!parsed.meta.hasStrongs,
    getVerse(b, c, v) {
      return parsed.verseMap.get(`${b}.${c}.${v}`) || null;
    },
    close() {},
    *allVerses() {
      const bks = Object.keys(parsed.books).map(Number).sort((a, b) => a - b);
      for (const b of bks) {
        const chs = parsed.books[b] || [];
        for (let c = 1; c <= chs.length; c++) {
          const maxV = chs[c - 1] || 0;
          for (let v = 1; v <= maxV; v++) {
            const val = parsed.verseMap.get(`${b}.${c}.${v}`);
            if (val != null) yield [b, c, v, val];
          }
        }
      }
    },
  };
}

function loadUsfm(fileOrDir) {
  const st = fs.statSync(fileOrDir);
  const texts = [];
  if (st.isDirectory()) {
    const files = fs.readdirSync(fileOrDir)
      .filter(f => USFM_EXT.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const f of files) texts.push(fs.readFileSync(path.join(fileOrDir, f), 'utf8'));
  } else if (/\.zip$/i.test(fileOrDir)) {
    const buf = fs.readFileSync(fileOrDir);
    const ents = zip.entries(buf)
      .filter(e => !e.name.endsWith('/') && USFM_EXT.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const e of ents) texts.push(zip.extract(buf, e).toString('utf8'));
  } else {
    texts.push(fs.readFileSync(fileOrDir, 'utf8'));
  }
  const parsed = parseUsfmTexts(texts);
  if (!Object.keys(parsed.books).length) {
    throw new Error('no readable USFM books (\\id ... \\c ... \\v ...) found in ' + path.basename(fileOrDir));
  }
  return makeBibleMod('usfm', 'USFM', 'usfm', fileOrDir, parsed);
}

function loadUsfx(file) {
  let xmlStr = '';
  if (/\.zip$/i.test(file)) {
    const buf = fs.readFileSync(file);
    const ent = zip.entries(buf).find(e => !e.name.endsWith('/') && /\.(usfx|xml)$/i.test(e.name));
    if (!ent) throw new Error('no USFX XML file found in archive ' + path.basename(file));
    xmlStr = zip.extract(buf, ent).toString('utf8');
  } else {
    xmlStr = fs.readFileSync(file, 'utf8');
  }
  const parsed = parseUsfxXml(xmlStr);
  if (!Object.keys(parsed.books).length) {
    throw new Error('no readable USFX <book> chapters/verses found in ' + path.basename(file));
  }
  return makeBibleMod('usfx', 'USFX', 'usfx', file, parsed);
}

/**
 * Bundle multiple USFM text buffers/strings into a single consolidated .usfm file sorted in canonical order.
 */
function bundleUsfmTexts(textItems, outFile, defaultTitle = '') {
  const withBook = textItems.map(txt => {
    const m = /^\\id\s+([1-4]?[A-Za-z]{2,4})\b/m.exec(txt);
    const b = m ? (canon.bookFromUbsCode(m[1]) || 999) : 999;
    return { b, txt: String(txt || '').replace(/^\uFEFF/, '').trim() };
  }).filter(x => x.txt);
  withBook.sort((a, b) => a.b - b.b);
  const header = defaultTitle ? `# timotheos.title=${defaultTitle}\n` : '';
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, header + withBook.map(x => x.txt).join('\n\n') + '\n', 'utf8');
  return outFile;
}

module.exports = {
  USFM_EXT,
  USFX_EXT,
  isUsfmFile,
  isUsfxFile,
  probeXml,
  loadUsfm,
  loadUsfx,
  parseUsfmTexts,
  parseUsfxXml,
  bundleUsfmTexts,
};
