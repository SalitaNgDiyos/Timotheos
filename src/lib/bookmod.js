'use strict';
// Non-Bible modules of theWord (.twm: dictionaries, commentaries, books, maps, devotionals, reading plans)
// and e-Sword (.cmtx/.cmti commentaries, .dctx/.dcti/.lexx/.lexi dictionaries, .topx/.topi/.refx/.refi
// topic/reference books, .devx/.devi devotionals, .mapx/.mapi graphics, .harx/.hari harmonies,
// .notx/.jnlx study notes & journals).
// Every module is opened read-only; encrypted modules are reported and never decoded.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { openDb } = require('./sqlite');
const { rtfToHtml, isRtf } = require('./rtf');
const canon = require('./canon');
const esw = require('./eswordfmt');
const { rvfToHtml, looksRvf, imageUrl } = require('./rvf');

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const b = Buffer.from(v);
  const s = b.toString('utf8');
  return s.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(b) : s;
}
function inflate(v) {
  if (v == null) return null;
  const b = Buffer.from(v);
  for (const fn of [zlib.inflateSync, zlib.inflateRawSync, zlib.gunzipSync]) { try { return fn(b); } catch (e) { /* next */ } }
  return null;
}
function tableMap(db) {
  const r = db.exec("select name from sqlite_master where type in ('table','view')")[0];
  const m = {};
  if (r) for (const [n] of r.values) m[String(n).toLowerCase()] = String(n);
  return m;
}
function columns(db, t) {
  const r = db.exec(`pragma table_info("${t}")`)[0];
  return r ? r.values.map(x => String(x[1])) : [];
}
function pick(cols, names) {
  const low = cols.map(c => c.toLowerCase());
  for (const n of names) { const i = low.indexOf(n); if (i >= 0) return cols[i]; }
  return null;
}
function all(db, sql, params) {
  if (typeof db.all === 'function') return db.all(sql, params);
  const st = db.prepare(sql); const out = [];
  try { if (params) st.bind(params); while (st.step()) out.push(st.get()); } finally { st.free(); }
  return out;
}
function one(db, sql, params) { return all(db, sql, params)[0] || null; }

function refLabel(b, c1, v1, c2, v2) {
  const bk = canon.book(b);
  if (!c1) return bk.name;
  if (!v1) return `${bk.name} ${c1}${c2 && c2 !== c1 ? '–' + c2 : ''}`;
  let s = `${bk.name} ${c1}:${v1}`;
  if (c2 && c2 !== c1) s += `–${c2}:${v2 || ''}`; else if (v2 && v2 !== v1) s += `–${v2}`;
  return s;
}

/** HTML -> plain text (for Book search) */
function plain(html) {
  return String(html || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/[ \t]+/g, ' ');
}
/** RTF / HTML / e-Sword HTML -> safe-ish HTML (the renderer sanitizes again) */
function toHtml(body, hint, fontOpts) {
  if (!body) return '';
  if (isRtf(body) || hint === 'rtf' && /\\[a-z]+/.test(body)) return rtfToHtml(body, fontOpts);
  return esw.htmlish(body);
}

/** quick type guess from the file name (used before a module is opened) */
function guessKind(name) {
  const n = name.toLowerCase();
  if (/\.dct\.twm$|\.dct[xi]$|\.lex[xi]$/.test(n)) return 'dictionary';
  if (/\.cmt\.twm$|\.cmt[xi]$|\.notx$/.test(n)) return 'commentary';
  if (/\.dev\.twm$|\.dev[xi]$/.test(n)) return 'devotional';
  if (/\.map\.twm$|\.map[xi]$/.test(n)) return 'map';
  if (/\.rdp\.twm$/.test(n)) return 'readingplan';
  if (/\.gbk\.twm$|\.top[xi]$|\.ref[xi]$|\.har[xi]$|\.jnlx$|\.twm$/.test(n)) return 'book';
  return null;
}

async function open(file) {
  const base = path.basename(file);
  const stub = { id: 'bm:' + base, file, name: base, kind: guessKind(base) || 'book', format: /\.twm$/i.test(base) ? 'theWord' : 'e-Sword', title: base, abbr: base.replace(/\..*$/, '') };
  const head = Buffer.alloc(16); const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  if (head.toString('latin1', 0, 15) !== 'SQLite format 3') return locked(stub, 'not a readable database – the module is encrypted or in an unknown format');
  const db = openDb(file); // read from disk, not copied into memory
  const tabs = tableMap(db);
  try {
    if (tabs.config && (tabs.topics || tabs.content || tabs.bible_refs || tabs.rel_refs || tabs.plan || tabs.readings)) return openTheWord(db, tabs, stub);
    if (tabs.details || tabs.versecommentary || tabs.chaptercommentary || tabs.bookcommentary || tabs.dictionary || tabs.lexicon || tabs.topics || tabs.topic || tabs.reference || tabs.devotions || tabs.devotion || tabs.graphics || tabs.maps || tabs.map || tabs.harmony || tabs.harmonies || tabs.versenotes || tabs.chapternotes || tabs.booknotes || tabs.journal) return openESword(db, tabs, stub);
  } catch (e) { db.close(); throw e; }
  db.close();
  return locked(stub, 'unknown module layout (tables: ' + Object.values(tabs).join(', ') + ')');
}

function locked(stub, reason) {
  return Object.assign(stub, { locked: true, reason, topics: () => [], topic: () => null, forVerse: () => null, verseMarks: () => new Set(), lookup: () => null, findWord: () => [], today: () => [], close() {} });
}

/* ------------------------------------------------------------------ theWord */
function openTheWord(db, tabs, stub) {
  const cfg = {};
  for (const [k, v] of all(db, 'select name, value from config')) cfg[String(k).toLowerCase()] = str(v);
  const type = +cfg.type || 0;
  let kind = { 1: 'dictionary', 2: 'commentary', 3: 'book', 4: 'map' }[type] || stub.kind;
  if (tabs.devotion) kind = 'devotional';
  if (/\.rdp\.twm$/i.test(stub.name)) kind = 'readingplan';
  const fontOpts = {
    preserveFonts: cfg['preserve.fonts'] === '1',
    preserveFontsList: (cfg['preserve.fonts.list'] || '').split(/[,;]/).map(s => s.trim().toLowerCase()).filter(Boolean),
  };
  const mod = Object.assign(stub, {
    format: 'theWord', kind, cfg, fontOpts,
    title: cfg.title || cfg.abbrev || stub.title, abbr: cfg.abbrev || cfg.id || stub.abbr,
    author: cfg.author || '', description: cfg.description || '',
    about: cfg.about ? toHtml(cfg.about, 'rtf', fontOpts) : '',
    isStrong: cfg.strong === '1', greek: cfg.strong === '1' && cfg['strong.g'] !== '0', hebrew: cfg.strong === '1' && cfg['strong.h'] === '1',
    isMorph: /morph/i.test([cfg.title, cfg.keywords, cfg.categories, stub.name].join(' ')) || cfg.morph === '1',
    rtl: cfg.r2l === '1', user: cfg.user === '1',
  });
  if (cfg.secure === '1' || cfg.encrypted === '1') { db.close(); return locked(mod, 'encrypted (a locked/paid theWord module) – it opens only in theWord'); }
  if (kind === 'readingplan') { db.close(); return locked(mod, 'theWord reading plan – import it via Import Modules or My Study → Reading to add it to your reading plans'); }

  const compressed = cfg.compressed === '1';
  const defType = (cfg['content.type'] || 'rtf').toLowerCase();
  const tcols = tabs.topics ? columns(db, tabs.topics) : [];
  const hasCT = tcols.map(c => c.toLowerCase()).includes('content_type');
  const hasOrig = tcols.map(c => c.toLowerCase()).includes('strong_orig_word');
  let fileSize = 0;
  try { fileSize = fs.statSync(stub.file).size; } catch (e) { /* ignore */ }
  let _statsLoaded = false, hasWordIndex = false, hasSubjectIndex = false, approxTopics = 0, isHugeTopics = fileSize > 40 * 1024 * 1024;
  function ensureStats() {
    if (_statsLoaded) return;
    _statsLoaded = true;
    hasWordIndex = !!(tabs.topics_wordindex && one(db, `select 1 from ${tabs.topics_wordindex} limit 1`));
    if (tabs.topics) {
      const maxIdRow = one(db, `select max(id) from ${tabs.topics}`);
      approxTopics = (maxIdRow && +maxIdRow[0] > 0) ? +maxIdRow[0] : 0;
      if (approxTopics > 10000) isHugeTopics = true;
      mod.totalTopics = approxTopics;
      if (isHugeTopics && !hasWordIndex) {
        try {
          for (const idx of all(db, `pragma index_list("${tabs.topics}")`)) {
            const ic = all(db, `pragma index_info("${idx[1]}")`).map(c => String(c[2]).toLowerCase());
            if (ic[0] === 'subject') { hasSubjectIndex = true; break; }
          }
        } catch (e) { /* ignore */ }
      }
    }
  }

  // Lazy commentary index (bible_refs) & hybrid book sync (rel_refs) so opening/probing is instant
  let refs = undefined;
  function getRefs() {
    if (refs !== undefined) return refs;
    refs = null;
    if (tabs.bible_refs) {
      const rc = columns(db, tabs.bible_refs);
      const col = n => pick(rc, n);
      const cT = col(['topic_id']), cB = col(['bi', 'book']), cC = col(['ci', 'chapter']), cF = col(['fvi', 'vi', 'verse']), cE = col(['tvi', 'evi']);
      if (cT && cB && cC && cF) {
        refs = all(db, `select ${cT}, ${cB}, ${cC}, ${cF}, ${cE || cF} from ${tabs.bible_refs}`).map(([t, b, c, f, e]) => ({ t, b, c, c2: c, f: f || 0, e: e || f || 0, pos: null }));
      }
    }
    return refs;
  }
  let relRefs = undefined;
  function getRelRefs() {
    if (relRefs !== undefined) return relRefs;
    relRefs = null;
    if (tabs.rel_refs) {
      const rc = columns(db, tabs.rel_refs);
      const col = n => pick(rc, n);
      const cT = col(['topic_id']), cPos = col(['topic_pos']), cB = col(['fbi', 'bi', 'book']), cC1 = col(['fci', 'ci', 'chapter']), cV1 = col(['fvi', 'vi', 'verse']), cC2 = col(['tci', 'fci', 'ci']), cV2 = col(['tvi', 'evi', 'fvi']);
      if (cT && cB && cC1 && cV1) {
        relRefs = all(db, `select ${cT}, ${cPos || "''"}, ${cB}, ${cC1}, ${cV1}, ${cC2 || cC1}, ${cV2 || cV1} from ${tabs.rel_refs}`).map(([t, pos, b, c1, v1, c2, v2]) => ({ t, pos: str(pos) || null, b, c: c1 || 0, c2: c2 || c1 || 0, f: v1 || 0, e: v2 || v1 || 0 }));
      }
    }
    return relRefs;
  }
  if (tabs.bible_refs && kind !== 'commentary' && !tabs.topics) kind = mod.kind = 'commentary';
  mod.hasVerseSync = !!(tabs.bible_refs || tabs.rel_refs);

  let topicList = null;
  function topics() {
    if (topicList) return topicList;
    ensureStats();
    const rList = getRefs();
    if (tabs.topics) {
      if (isHugeTopics && !rList) {
        // Large dictionary/book (e.g. 800+ MB Perseus Greek Analyses): return initial window via primary key without full-table scan/sort
        topicList = all(db, `select id, pid, subject from ${tabs.topics} limit 500`).map(([id, pid, s]) => ({ id, pid: pid || 0, subject: str(s) }));
      } else {
        topicList = all(db, `select id, pid, subject from ${tabs.topics} order by pid, rel_order, id`).map(([id, pid, s]) => ({ id, pid: pid || 0, subject: str(s) }));
        if (tabs.topics_flags) { const hidden = new Set(all(db, `select id from ${tabs.topics_flags} where hidden = 1`).map(r => r[0])); topicList = topicList.filter(t => !hidden.has(t.id)); }
      }
    } else topicList = [];
    if (rList) {
      // commentaries: label topics by their Bible reference, in Bible order
      const label = new Map();
      for (const r of rList) if (!label.has(r.t)) label.set(r.t, r);
      const byId = new Map(topicList.map(t => [t.id, t]));
      for (const [t, r] of label) {
        const subject = refLabel(r.b, r.c, r.f, r.c2 || r.c, r.e);
        if (byId.has(t)) byId.get(t).ref = r; else topicList.push({ id: t, pid: 0, subject, ref: r });
        const tt = byId.get(t); if (tt && !tt.subject) tt.subject = subject;
      }
      topicList.sort((x, y) => (x.ref && y.ref) ? (canon.orderKey(x.ref.b) - canon.orderKey(y.ref.b) || x.ref.c - y.ref.c || x.ref.f - y.ref.f) : 0);
    }
    return topicList;
  }

  function body(id) {
    const row = one(db, 'select data, data2 from content where topic_id = ?', [id]);
    if (!row) return null;
    let [data, data2] = row;
    let text = '';
    if (compressed && data2 != null) { const b = inflate(data2); text = b ? b.toString('utf8') : ''; }
    if (!text && data != null) {
      text = str(data);
      if (!/^\s*[{<]/.test(text) && compressed) { const b = inflate(data); if (b) text = b.toString('utf8'); }
    }
    if (!text && data2 != null) { const b = inflate(data2); text = b ? b.toString('utf8') : str(data2); }
    return text;
  }
  /** an entry as bytes, unpacked (RichView entries are binary) */
  function bodyBytes(id) {
    // as blobs: RichView bytes stored as text must not be decoded
    const row = one(db, 'select cast(data as blob), cast(data2 as blob) from content where topic_id = ?', [id]);
    if (!row) return null;
    const [data, data2] = row;
    const isZ = v => { const b = Buffer.from(v); return b.length > 2 && b[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(b[1]); };
    if (compressed && data2 != null) { const b = inflate(data2); if (b) return b; }
    if (data != null && typeof data !== 'string' && (compressed || isZ(data))) { const b = inflate(data); if (b && looksRvf(b)) return b; }
    if (data != null) return typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data);
    return data2 != null ? Buffer.from(data2) : null;
  }
  function contentType(id) {
    if (!hasCT) return defType;
    const r = one(db, `select content_type from ${tabs.topics} where id = ?`, [id]);
    return (r && r[0] ? String(r[0]) : defType).toLowerCase();
  }
  function plainFallback(id) {
    if (!tabs.content_search) return '';
    const r = one(db, 'select data from content_search where topic_id = ?', [id]);
    if (!r || r[0] == null) return '';
    let b = Buffer.from(r[0]);
    if (cfg['compressed.search.data'] === '1') b = inflate(b) || b;
    const s = b.length > 1 && b[1] === 0 ? b.toString('utf16le') : b.toString('utf8');
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\r?\n/g, '<br>');
  }
  function stripMarks(s) {
    return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  }
  function topicMeta(id) {
    if (tabs.topics) {
      const r = one(db, `select id, pid, subject from ${tabs.topics} where id = ?`, [id]);
      if (r && r[2] != null && String(r[2]) !== '') return { id: r[0], pid: r[1] || 0, subject: str(r[2]) };
      if (r && !tabs.bible_refs) return { id: r[0], pid: r[1] || 0, subject: str(r[2]) };
    }
    if (topicList) {
      const found = topicList.find(x => x.id === id);
      if (found) return found;
    }
    const rList = getRefs();
    if (rList) {
      const r = rList.find(x => x.t === id);
      if (r) return { id, pid: 0, subject: refLabel(r.b, r.c, r.f, r.c2 || r.c, r.e), ref: r };
    }
    return null;
  }

  function topic(id, depth = 0) {
    const t = topicMeta(id);
    const raw = body(id);
    if (raw == null && !t) return null;
    const ct = contentType(id);
    // [B2] Resolve Redirect Link-Topics (content_type = 'meta' or meta=_twmgc_)
    if (ct === 'meta' || (raw && /^\s*meta\s*=\s*_twmgc_/i.test(raw))) {
      if (depth < 5 && raw) {
        const kv = {};
        for (const ln of String(raw).replace(/\r+\n/g, '\n').split(/\r?\n/)) {
          const m = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(ln);
          if (m) kv[m[1].toLowerCase()] = m[2].trim();
        }
        const targetId = kv.id != null ? (isNaN(+kv.id) ? kv.id : +kv.id) : null;
        if (targetId != null && targetId !== id) {
          const target = topic(targetId, depth + 1);
          if (target) {
            return {
              id,
              targetId,
              anchor: kv.anchor || target.anchor || null,
              subject: (t && t.subject) ? t.subject : target.subject,
              html: target.html,
            };
          }
        }
      }
      return { id, subject: t ? t.subject : String(id), html: '' };
    }
    let html;
    if (ct === 'rvf' || /^-8 \d/.test(raw || '')) {
      // RichView: read the entry as bytes and show it with its formatting; plain text if it cannot be read
      let rv = null; const bb = bodyBytes(id);
      if (bb && looksRvf(bb)) { try { rv = rvfToHtml(bb, undefined, fontOpts); } catch (e) { rv = null; } }
      const plain = rv == null ? plainFallback(id) : '';
      html = rv != null ? rv : `<p class="note">This RichView entry could not be read.${plain ? ' Plain text:' : ''}</p>${plain}`;
    } else html = toHtml(raw || '', ct, fontOpts);
    return { id, subject: t ? t.subject : String(id), html };
  }

  function forVerse(b, c, v) {
    const rList = getRefs(), rrList = getRelRefs();
    const activeRefs = rList || rrList;
    if (!activeRefs) return null;
    let best = null, rank = 9, span = 1e9;
    for (const r of activeRefs) {
      if (r.b !== b) continue;
      const c2 = r.c2 || r.c;
      let lv;
      if (r.c === 0) lv = 3;
      else if (r.f === 0) { if (r.c > c || c2 < c) continue; lv = 2; }
      else {
        const startOk = r.c < c || (r.c === c && r.f <= v);
        const endOk = c2 > c || (c2 === c && Math.max(r.e, r.f) >= v);
        if (!startOk || !endOk) continue;
        lv = (r.c === c && c2 === c && r.f === v && r.e <= v) ? 0 : 1;
      }
      const sp = (c2 - r.c) * 200 + (Math.max(r.e, r.f) - r.f);
      if (lv < rank || (lv === rank && sp < span)) { best = r; rank = lv; span = sp; }
    }
    if (!best) return null;
    const tObj = rrList && !rList ? topicMeta(best.t) : null;
    return {
      id: best.t,
      anchor: best.pos || null,
      subject: tObj && tObj.subject ? `${tObj.subject} (${refLabel(best.b, best.c, best.f, best.c2 || best.c, best.e)})` : refLabel(best.b, best.c, best.f, best.c2 || best.c, best.e),
      level: ['verse', 'passage', 'chapter', 'book'][rank],
    };
  }
  function verseMarks(b, c) {
    const s = new Set();
    const activeRefs = getRefs() || getRelRefs();
    if (activeRefs) {
      for (const r of activeRefs) {
        const c2 = r.c2 || r.c;
        if (r.b === b && r.f > 0 && r.c <= c && c2 >= c) {
          const from = r.c === c ? r.f : 1;
          const to = c2 === c ? Math.max(r.e, r.f) : 200;
          for (let v = from; v <= Math.min(to, 200); v++) s.add(v);
        }
      }
    }
    return s;
  }

  function lookup(key) {
    if (!tabs.topics || !key) return null;
    ensureStats();
    const keys = [key];
    const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(key);
    if (m) { const L = m[1].toUpperCase(); keys.push(L + m[2] + m[3], L + m[2], L + m[2].padStart(4, '0') + m[3], L + m[2].padStart(4, '0')); }
    // 1. Fast indexed lookup via topics_wordindex (idx_topics_wordindex_word)
    if (hasWordIndex) {
      const tried = new Set();
      for (const k of keys) {
        for (const w of [String(k).toLowerCase(), String(k), stripMarks(String(k).toLowerCase())]) {
          if (!w || tried.has(w)) continue;
          tried.add(w);
          const rows = all(db, `select w.id, t.subject from ${tabs.topics_wordindex} w join ${tabs.topics} t on t.id = w.id where w.word = ? order by w.priority, w.id limit 10`, [w]);
          if (rows.length) {
            const kLow = String(k).toLowerCase();
            const exactRow = rows.find(([, s]) => str(s).trim().toLowerCase() === kLow) || rows[0];
            return topic(exactRow[0]);
          }
        }
      }
      if (isHugeTopics && !hasSubjectIndex) return null;
    }
    // 2. Fallback to topics.subject (use binary index first if present, then collate nocase on small modules)
    if (hasSubjectIndex) {
      for (const k of keys) {
        for (const v of [String(k), String(k).toLowerCase(), String(k).toUpperCase()]) {
          const r = one(db, `select id from ${tabs.topics} where subject = ? limit 1`, [v]);
          if (r) return topic(r[0]);
        }
      }
      if (isHugeTopics) return null;
    }
    for (const k of keys) {
      const r = one(db, `select id from ${tabs.topics} where subject = ? collate nocase limit 1`, [k]);
      if (r) return topic(r[0]);
    }
    if (hasOrig && !m && (!isHugeTopics || hasSubjectIndex)) {
      const r = one(db, `select id from ${tabs.topics} where strong_orig_word = ? limit 1`, [key]);
      if (r) return topic(r[0]);
    }
    return null;
  }
  function findWord(w, fuzzy) {
    if (!tabs.topics || !w) return [];
    ensureStats();
    const wTrim = String(w).trim();
    const wLow = wTrim.toLowerCase();
    const wStrip = stripMarks(wLow);
    if (hasWordIndex) {
      const seen = new Set();
      const exact = [];
      for (const q of [wLow, wTrim, wStrip]) {
        if (!q) continue;
        for (const [id, s] of all(db, `select w.id, t.subject from ${tabs.topics_wordindex} w join ${tabs.topics} t on t.id = w.id where w.word = ? order by w.priority, w.id limit 8`, [q])) {
          if (seen.has(id)) continue;
          seen.add(id);
          const subj = str(s);
          const isEx = subj.trim().toLowerCase() === wLow || stripMarks(subj.trim().toLowerCase()) === wStrip;
          exact.push({ id, subject: subj, exact: isEx });
          if (exact.length >= 5) break;
        }
        if (exact.length) break;
      }
      if (exact.length || !fuzzy) return exact;
      const stem = stemOf(wTrim);
      if (stem.length < 2) return [];
      const fuzzyOut = [];
      for (const pfx of [stem, stripMarks(stem)]) {
        if (!pfx) continue;
        for (const [id, s] of all(db, `select w.id, t.subject from ${tabs.topics_wordindex} w join ${tabs.topics} t on t.id = w.id where w.word >= ? and w.word < ? order by w.word, w.priority limit 16`, [pfx, pfx + '\uffff'])) {
          if (seen.has(id)) continue;
          const subj = str(s);
          if (stemOf(subj.split(/[\s,(]/)[0]) === stem) {
            seen.add(id);
            fuzzyOut.push({ id, subject: subj, exact: false });
            if (fuzzyOut.length >= 8) return fuzzyOut;
          }
        }
      }
      return fuzzyOut;
    }
    if (isHugeTopics && !hasSubjectIndex) return [];
    const exact = all(db, `select id, subject from ${tabs.topics} where subject = ? collate nocase limit 5`, [wTrim]).map(([id, s]) => ({ id, subject: str(s), exact: true }));
    if (exact.length || !fuzzy) return exact;
    const stem = stemOf(wTrim);
    return all(db, `select id, subject from ${tabs.topics} where subject like ? limit 8`, [stem + '%']).map(([id, s]) => ({ id, subject: str(s), exact: false }))
      .filter(t => stemOf(t.subject.split(/[\s,(]/)[0]) === stem);
  }
  function today(month, day) {
    if (!tabs.devotion) return [];
    return all(db, `select d.topic_id from ${tabs.devotion} d where d.monthOfYear = ? and d.dayOfMonth = ? order by d.morningOrEvening`, [month, day])
      .map(([id]) => { const t = topicMeta(id); return { id, subject: t ? t.subject : `${month}/${day}` }; });
  }
  function searchTopics(q, limit = 300) {
    ensureStats();
    if (!tabs.topics) return topics().filter(t => t.subject.toLowerCase().includes(q.toLowerCase())).slice(0, limit);
    const qTrim = String(q || '').trim();
    if (!qTrim) return topics();
    const qLow = qTrim.toLowerCase();
    const qStrip = stripMarks(qLow);
    const out = [];
    const seen = new Set();
    if (hasWordIndex) {
      for (const pfx of [qLow, qStrip, qTrim]) {
        if (!pfx) continue;
        for (const [id, pid, s] of all(db, `select w.id, t.pid, t.subject from ${tabs.topics_wordindex} w join ${tabs.topics} t on t.id = w.id where w.word >= ? and w.word < ? order by w.word, w.priority limit ${limit * 2}`, [pfx, pfx + '\uffff'])) {
          if (seen.has(id)) continue;
          seen.add(id);
          out.push({ id, pid: pid || 0, subject: str(s) });
          if (out.length >= limit) return out;
        }
      }
      if (isHugeTopics && !hasSubjectIndex) return out;
    }
    for (const [id, pid, s] of all(db, `select id, pid, subject from ${tabs.topics} where subject like ? order by (subject like ?) desc, subject limit ${limit}`, ['%' + qTrim + '%', qTrim + '%'])) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, pid: pid || 0, subject: str(s) });
      if (out.length >= limit) break;
    }
    return out;
  }
  /** every topic as plain text, one after another (Book search); theWord's own search text is used when the module has it */
  function* texts() {
    if (tabs.content_search) {
      const sql = tabs.topics
        ? `select cs.topic_id, t.subject, cast(cs.data as blob) from content_search cs left join ${tabs.topics} t on t.id = cs.topic_id`
        : 'select topic_id, null, cast(data as blob) from content_search';
      const st = db.prepare(sql);
      try {
        while (st.step()) {
          const [id, subj, d] = st.get(); if (d == null) continue;
          let b = Buffer.from(d); if (cfg['compressed.search.data'] === '1') b = inflate(b) || b;
          yield { id, subject: subj != null ? str(subj) : String(id), text: b.length > 1 && b[1] === 0 ? b.toString('utf16le') : b.toString('utf8') };
        }
      } finally { st.free(); }
      return;
    }
    if (tabs.topics && isHugeTopics) {
      const st = db.prepare(`select id, subject from ${tabs.topics}`);
      const ids = [];
      try { while (st.step()) { const [id, s] = st.get(); ids.push([id, str(s)]); } } finally { st.free(); }
      for (const [id, subj] of ids) { let x = null; try { x = topic(id); } catch (e) { /* unreadable */ } if (x) yield { id, subject: subj || x.subject, text: plain(x.html) }; }
      return;
    }
    for (const t of topics()) { let x = null; try { x = topic(t.id); } catch (e) { /* unreadable */ } if (x) yield { id: t.id, subject: t.subject, text: plain(x.html) }; }
  }
  return Object.assign(mod, { locked: false, topics, topic, forVerse, verseMarks, lookup, findWord, today, searchTopics, texts, close() { try { db.close(); } catch (e) { /* closed */ } } });
}

/* ------------------------------------------------------------------ e-Sword */
function openESword(db, tabs, stub) {
  const details = {};
  if (tabs.details) {
    const r = db.exec(`select * from ${tabs.details} limit 1`)[0];
    if (r) r.columns.forEach((c, i) => { details[c.toLowerCase()] = r.values[0][i]; });
  }
  const bookMap = esw.bookMap();
  const tb = n => tabs[n];
  let kind = stub.kind;
  if (tb('versecommentary') || tb('chaptercommentary') || tb('bookcommentary') || tb('versenotes') || tb('chapternotes') || tb('booknotes')) kind = 'commentary';
  else if (tb('devotions') || tb('devotion')) kind = 'devotional';
  else if (tb('dictionary') || tb('lexicon')) kind = 'dictionary';
  else if (tb('graphics') || tb('maps') || tb('map')) kind = 'map';
  else if (tb('harmony') || tb('harmonies') || tb('topics') || tb('topic') || tb('reference') || tb('journal')) kind = 'book';
  const mod = Object.assign(stub, {
    format: 'e-Sword', kind, cfg: details,
    title: str(details.title || details.description || stub.title), abbr: str(details.abbreviation || stub.abbr),
    about: details.comments || details.information ? toHtml(str(details.comments || details.information)) : '',
    rtl: details.righttoleft == 1, isStrong: false, greek: false, hebrew: false, isMorph: false, hasVerseSync: kind === 'commentary',
  });

  let items = []; // [{id, subject, sql:[table, rowid], ref?}]
  let content = null; // (id) -> raw text or html
  let byKey = null;
  if (kind === 'commentary') {
    const parts = [];
    const add = (t, level) => {
      if (!tabs[t]) return;
      const cols = columns(db, tabs[t]);
      const cB = pick(cols, ['book']), cText = pick(cols, ['comments', 'commentary', 'notes', 'text']);
      const cC1 = pick(cols, ['chapterbegin', 'chapter']), cV1 = pick(cols, ['versebegin', 'verse']);
      const cC2 = pick(cols, ['chapterend']), cV2 = pick(cols, ['verseend']);
      if (!cB || !cText) return;
      const sel = [cB, cC1 || '0', cV1 || '0', cC2 || cC1 || '0', cV2 || cV1 || '0'].join(', ');
      for (const [rowid, b, c1, v1, c2, v2] of all(db, `select rowid, ${sel} from ${tabs[t]}`)) {
        const [bb, cc1] = level === 'book' ? [bookMap[b] || b, 0] : esw.mapChapter(b, c1, bookMap);
        const [, cc2] = level === 'verse' ? esw.mapChapter(b, c2 || c1, bookMap) : [bb, cc1];
        const lv = level === 'verse' ? 'v' : level === 'chapter' ? 'c' : 'b';
        const ref = { b: bb, c: level === 'book' ? 0 : cc1, f: level === 'verse' ? v1 : 0, c2: level === 'verse' ? cc2 : cc1, e: level === 'verse' ? (v2 || v1) : 0 };
        parts.push({ id: `${lv}${rowid}`, pid: 0, subject: refLabel(bb, ref.c, ref.f, ref.c2, ref.e), ref, table: tabs[t], rowid, col: cText });
      }
    };
    add('bookcommentary', 'book'); add('chaptercommentary', 'chapter'); add('versecommentary', 'verse');
    add('booknotes', 'book'); add('chapternotes', 'chapter'); add('versenotes', 'verse');
    parts.sort((x, y) => canon.orderKey(x.ref.b) - canon.orderKey(y.ref.b) || x.ref.c - y.ref.c || x.ref.f - y.ref.f);
    items = parts;
  } else if (tb('graphics') || tb('maps') || tb('map')) {
    // [D5] e-Sword .mapx / .mapi graphics modules
    const t = tb('graphics') || tb('maps') || tb('map');
    const cols = columns(db, t);
    const cTitle = pick(cols, ['topic', 'title', 'subject', 'name', 'caption', 'description']);
    const cBlob = pick(cols, ['graphic', 'image', 'picture', 'map', 'data', 'blob', 'content']);
    const cCap = pick(cols, ['comments', 'notes', 'caption', 'description', 'text']);
    if (!details.title && !details.description) mod.title = stub.name.replace(/\.[^.]+$/, '');
    if (!cBlob && !cCap) { db.close(); return locked(mod, `unexpected e-Sword map table layout (${cols.join(', ')})`); }
    items = all(db, `select rowid, ${cTitle || 'rowid'} from ${t}`).map(([rowid, ttl]) => ({
      id: 'm' + rowid, pid: 0, subject: str(ttl) || `Map ${rowid}`, table: t, rowid, colBlob: cBlob, colCap: cCap && cCap !== cTitle ? cCap : null, isMap: true,
    }));
  } else if (tb('harmony') || tb('harmonies')) {
    // [D5] e-Sword .harx / .hari gospel harmony modules
    const t = tb('harmony') || tb('harmonies');
    const cols = columns(db, t);
    const cTitle = pick(cols, ['topic', 'title', 'event', 'subject', 'section', 'name']) || cols[0];
    const cText = pick(cols, ['comments', 'notes', 'passages', 'text', 'content', 'harmony']);
    if (!details.title && !details.description) mod.title = stub.name.replace(/\.[^.]+$/, '');
    items = all(db, `select rowid, ${cTitle} from ${t}`).map(([rowid, ttl]) => ({
      id: 'h' + rowid, pid: 0, subject: str(ttl) || `Harmony ${rowid}`, table: t, rowid, col: cText, cols, isHarmony: true,
    }));
  } else {
    const t = tb('dictionary') || tb('lexicon') || tb('topics') || tb('topic') || tb('reference') || tb('devotions') || tb('devotion') || tb('journal');
    if (!t) { db.close(); return locked(mod, 'no readable content table – encrypted or unknown e-Sword module'); }
    const cols = columns(db, t);
    const cTitle = pick(cols, ['topic', 'title', 'chapter', 'subject', 'name', 'word', 'date']);
    const cText = pick(cols, ['definition', 'notes', 'comments', 'devotion', 'content', 'text', 'description', 'journal']);
    const cMonth = pick(cols, ['month']), cDay = pick(cols, ['day']), cYear = pick(cols, ['year']);
    if (!details.title && !details.description) mod.title = stub.name.replace(/\.[^.]+$/, ''); // .topx / .jnlx files have no Details table
    if (!cText || !(cTitle || (cMonth && cDay))) { db.close(); return locked(mod, `unexpected e-Sword table layout (${cols.join(', ')})`); }
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const sel = cTitle ? `rowid, ${cTitle}` : cYear && cMonth && cDay ? `rowid, ${cYear}, ${cMonth}, ${cDay}` : `rowid, ${cMonth}, ${cDay}`;
    items = all(db, `select ${sel} from ${t}${cMonth ? ` order by ${cYear ? cYear + ', ' : ''}${cMonth}, ${cDay}` : ''}`).map(r => ({
      id: 'r' + r[0], pid: 0,
      subject: cTitle ? str(r[1]) : cYear ? `${r[1]}-${String(r[2]).padStart(2, '0')}-${String(r[3]).padStart(2, '0')}` : `${months[(r[1] || 1) - 1]} ${r[2]}`,
      table: t, rowid: r[0], col: cText, md: cMonth && !cYear ? [r[cTitle ? 0 : 1], r[cTitle ? 0 : 2]] : null,
    }));
    if (cMonth && cDay && cTitle && !cYear) { const md = all(db, `select rowid, ${cMonth}, ${cDay} from ${t}`); const m = new Map(md.map(r => [r[0], [r[1], r[2]]])); for (const it of items) it.md = m.get(it.rowid); }
    if (kind === 'dictionary') {
      const strongish = items.filter(i => /^[GH]\d+[a-z]?$/i.test(i.subject.trim())).length;
      if (strongish > items.length * 0.5) {
        mod.isStrong = true;
        mod.greek = items.some(i => /^G\d/i.test(i.subject)); mod.hebrew = items.some(i => /^H\d/i.test(i.subject));
      }
      mod.isMorph = /morph|rmac|robinson|packard|parsing/i.test(mod.title + ' ' + stub.name);
    }
    byKey = new Map();
    for (const it of items) { const k = it.subject.trim().toLowerCase(); if (!byKey.has(k)) byKey.set(k, it); }
  }
  content = it => {
    if (it.isMap) {
      const selCols = [it.colBlob, it.colCap].filter(Boolean).join(', ');
      const r = one(db, `select ${selCols} from ${it.table} where rowid = ?`, [it.rowid]);
      if (!r) return '';
      let blob = it.colBlob ? r[0] : null;
      const cap = it.colCap ? str(r[it.colBlob ? 1 : 0]) : '';
      let imgHtml = '';
      if (blob != null) {
        let buf = Buffer.from(blob);
        const inf = inflate(buf); if (inf) buf = inf;
        const url = imageUrl(new Uint8Array(buf));
        if (url) imgHtml = `<p><img class="rtfimg" src="${url}" alt="${it.subject.replace(/"/g, '&quot;')}"></p>`;
      }
      return { isRenderedHtml: true, html: imgHtml + (cap ? esw.eswordToHtml(cap) : '') };
    }
    if (it.isHarmony && !it.col) {
      const r = one(db, `select * from ${it.table} where rowid = ?`, [it.rowid]);
      if (!r) return '';
      const parts = [];
      it.cols.forEach((cName, idx) => {
        if (idx === 0 || r[idx] == null || String(r[idx]).trim() === '') return;
        parts.push(`<p><b>${cName}:</b> ${esw.eswordToHtml(str(r[idx]))}</p>`);
      });
      return { isRenderedHtml: true, html: parts.join('') };
    }
    const r = one(db, `select ${it.col} from ${it.table} where rowid = ?`, [it.rowid]);
    if (!r || r[0] == null) return '';
    const v = r[0];
    // e-Sword 10 reference books (.refx) store their text compressed (per the e-Sword 10.4 User's Guide);
    // try the usual zlib/deflate forms before treating the entry as unreadable
    if (typeof v !== 'string') {
      const buf = Buffer.from(v);
      const text = buf.toString('utf8');
      if (!/^[\s\S]{0,40}[{<\w]/.test(text) || text.includes('\uFFFD')) { const inf = inflate(buf); if (inf) return inf.toString('utf8'); }
    }
    return str(v);
  };
  const byId = new Map(items.map(i => [i.id, i]));

  function topic(id) {
    const it = byId.get(id); if (!it) return null;
    const raw = content(it);
    if (raw && typeof raw === 'object' && raw.isRenderedHtml) return { id, subject: it.subject, html: raw.html };
    if (raw && (!/^[\s\S]{0,40}[{<\w&]/.test(raw) || (raw.match(/[\u0000-\u0008\uFFFD]/g) || []).length > 3)) return { id, subject: it.subject, html: '<p class="note">This entry is stored in a compressed or encrypted form that Timotheos cannot read. If this is an e-Sword 10 reference book (.refx), the e-Sword 11 version of the same book (.refi) will work.</p>' };
    return { id, subject: it.subject, html: esw.eswordToHtml(raw) };
  }
  function forVerse(b, c, v) {
    if (kind !== 'commentary') return null;
    let best = null, rank = 9, span = 1e9;
    for (const it of items) {
      const r = it.ref; if (r.b !== b) continue;
      let lv;
      if (r.c === 0) lv = 3;
      else if (r.f === 0) { if (r.c !== c) continue; lv = 2; }
      else {
        const startOk = r.c < c || (r.c === c && r.f <= v);
        const endOk = r.c2 > c || (r.c2 === c && r.e >= v);
        if (!startOk || !endOk) continue;
        lv = (r.c === c && r.f === v && r.c2 === c && r.e === v) ? 0 : 1;
      }
      const sp = (r.c2 - r.c) * 200 + (r.e - r.f);
      if (lv < rank || (lv === rank && sp < span)) { best = it; rank = lv; span = sp; }
    }
    return best ? { id: best.id, subject: best.subject, level: ['verse', 'passage', 'chapter', 'book'][rank] } : null;
  }
  function verseMarks(b, c) {
    const s = new Set();
    if (kind === 'commentary') for (const it of items) { const r = it.ref; if (r.b === b && r.f > 0 && r.c <= c && r.c2 >= c) { const from = r.c === c ? r.f : 1, to = r.c2 === c ? r.e : 200; for (let v = from; v <= Math.min(to, 200); v++) s.add(v); } }
    return s;
  }
  function lookup(key) {
    if (!byKey) return null;
    const keys = [key];
    const m = /^([GH])0*(\d+)([a-z]?)$/i.exec(key);
    if (m) { const L = m[1].toUpperCase(); keys.push(L + m[2] + m[3], L + m[2], L + m[2].padStart(4, '0'), L + m[2].padStart(5, '0')); }
    for (const k of keys) { const it = byKey.get(k.toLowerCase()); if (it) return topic(it.id); }
    return null;
  }
  function findWord(w, fuzzy) {
    if (!byKey || !w) return [];
    const it = byKey.get(w.toLowerCase());
    if (it) return [{ id: it.id, subject: it.subject, exact: true }];
    if (!fuzzy) return [];
    const stem = stemOf(w);
    return items.filter(i => stemOf(i.subject.split(/[\s,(]/)[0]) === stem).slice(0, 8).map(i => ({ id: i.id, subject: i.subject, exact: false }));
  }
  function today(month, day) { return items.filter(i => i.md && +i.md[0] === month && +i.md[1] === day).map(i => ({ id: i.id, subject: i.subject })); }
  function searchTopics(q, limit = 300) {
    ensureStats(); const l = q.toLowerCase(); return items.filter(i => i.subject.toLowerCase().includes(l)).sort((a, b) => (b.subject.toLowerCase().startsWith(l)) - (a.subject.toLowerCase().startsWith(l))).slice(0, limit).map(({ id, pid, subject }) => ({ id, pid, subject })); }
  function* texts() {
    for (const it of items) {
      let t = '';
      try {
        const raw = content(it);
        t = plain(raw && typeof raw === 'object' && raw.isRenderedHtml ? raw.html : esw.eswordToHtml(raw));
      } catch (e) { /* unreadable */ }
      yield { id: it.id, subject: it.subject, text: t };
    }
  }
  return Object.assign(mod, { locked: false, topics: () => items.map(({ id, pid, subject }) => ({ id, pid, subject })), topic, forVerse, verseMarks, lookup, findWord, today, searchTopics, texts, close() { try { db.close(); } catch (e) { /* closed */ } } });
}

/** very small English/Tagalog-agnostic stemmer for "fuzzy" topic matching */
function stemOf(w) {
  let s = String(w || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
  for (const suf of ['eth', 'est', 'ing', 'edst', 'ed', 'es', 's']) if (s.length > suf.length + 2 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1); // love/loved, grace/graces
  return s;
}

module.exports = { open, guessKind, stemOf, refLabel };
