/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Scans module folders, keeps loaded modules, answers chapter/search/lookup requests.
//   Bibles:        theWord .ont/.ot/.nt, theWord book modules holding Bible text (.gbk.twm),
//                  e-Sword .bblx/.bbli
//   Book modules:  theWord .twm (dictionary, commentary, book, map, devotional),
//                  e-Sword .cmtx/.cmti .dctx/.dcti .lexx/.lexi .topx/.topi .refx/.refi .devx/.devi .mapx/.mapi .harx/.hari .notx .jnlx
//   Cross-refs:    theWord .xrefs.twm sets
//   Overlays:      theWord .hdgs.twm (headings) and .prgs.twm (paragraphs) sets
// Folders whose name starts with "-" or "." are skipped (theWord's convention).
const fs = require('fs');
const path = require('path');
const theword = require('./theword');
const esword = require('./esword');
const twbook = require('./twbook');
const usfm = require('./usfm');
const bookmod = require('./bookmod');
const canon = require('./canon');
const search = require('./search');
const { linkHtml } = require('./refs');
const { Overlays } = require('./overlays');

const BIBLE_EXT = /\.(ont|ot|nt|bblx|bbli)$/i;
const ENCRYPTED_EXT = /\.(ontx|otx|ntx)$/i;
const BOOK_EXT = /\.(twm|cmtx|cmti|dctx|dcti|topx|topi|refx|refi|devx|devi|lexx|lexi|mapx|mapi|harx|hari|notx|jnlx)$/i;
const OVERLAY_TWM = /\.(hdgs|prgs)\.twm$/i;
const SKIP_TWM = /\.(lyts|vsls|bhls|rdp|layouts?)\.twm$/i;

class Library {
  constructor(settings, opts = {}) {
    this.settings = settings;
    this.extraFolders = opts.extraFolders || []; // e.g. Timotheos's own imported-modules folder
    this.bibles = new Map();     // id -> loaded Bible module
    this.bibleUse = new Map();   // id -> when it was last used
    this.entries = [];           // Bible files found
    this.books = new Map();      // id -> {file, name, kind, format, mod?}
    this.xrefFiles = [];
    this.overlayFiles = [];
    this.overlays = new Overlays();
    this.errors = [];
    this.probeCache = {};
    this.cacheFile = opts.cacheFile || null;   // remembers titles/kinds of book modules between runs
    this.cache = {};
    if (this.cacheFile) { try { this.cache = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8')); } catch (e) { this.cache = {}; } }
  }

  cacheKey(file) { try { const st = fs.statSync(file); return `${file}|${st.size}|${Math.round(st.mtimeMs)}`; } catch (e) { return file; } }
  remember(b) {
    const m = b.mod; if (!m) return;
    this.cache[this.cacheKey(b.file)] = {
      kind: m.kind, format: m.format, title: m.title, abbr: m.abbr, locked: !!m.locked, reason: m.reason || '',
      isStrong: !!m.isStrong, isMorph: !!m.isMorph, greek: !!m.greek, hebrew: !!m.hebrew,
      user: !!m.user, hasVerseSync: !!m.hasVerseSync, totalTopics: m.totalTopics || 0,
    };
  }
  saveCache() { if (this.cacheFile) { try { fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache)); } catch (e) { /* not important */ } } }

  /** open every book module once (one at a time, closing it again) to learn its title and kind */
  async describeAll() {
    let changed = false;
    for (const b of this.books.values()) {
      if (b.mod || this.cache[this.cacheKey(b.file)]) continue;
      try { b.mod = await bookmod.open(b.file); b.kind = b.mod.kind || b.kind; this.remember(b); changed = true; } catch (e) { /* listed as unopened */ }
      if (b.mod && !b.keep) { b.mod.close(); b.mod = null; }
    }
    if (changed) this.saveCache();
    return this.list();
  }

  folders() { return [...this.extraFolders, ...(this.settings.moduleFolders || [])]; }

  async scan() {
    for (const b of this.books.values()) if (b.mod) b.mod.close();
    for (const m of this.bibles.values()) if (m.close) m.close();
    this.bibles.clear(); this.books.clear();
    this.entries = []; this.errors = []; this.xrefFiles = []; this.overlayFiles = [];
    const gbks = [];
    const seen = new Set(); const seenNames = new Set();
    const walk = (dir, depth) => {
      let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      // If a subfolder (not named "USFM") holds 2+ per-book .usfm/.sfm files, treat the subfolder as one USFM Bible
      const usfmFiles = items.filter(x => !x.isDirectory() && usfm.USFM_EXT.test(x.name));
      if (depth > 0 && !/^(usfm|theword|e-sword|modules)$/i.test(path.basename(dir)) && usfmFiles.length >= 2) {
        const dname = path.basename(dir);
        const dupKey = (dname + ".usfm").toLowerCase();
        if (!seenNames.has(dupKey)) { seenNames.add(dupKey); this.entries.push({ file: dir, name: dname, ext: ".usfm" }); }
        return;
      }
      for (const it of items) {
        let p = path.join(dir, it.name);
        let itemName = it.name;
        let viaLink = null;
        if (it.isDirectory()) { if (depth < 4 && !/^[-.]/.test(it.name)) walk(p, depth + 1); continue; }
        if (itemName.toLowerCase().endsWith('.timotheos-link')) {
          try {
            const target = fs.readFileSync(p, 'utf8').trim();
            if (!target || !fs.existsSync(target)) continue;
            viaLink = p;
            p = target;
            itemName = path.basename(target);
          } catch (e) { continue; }
        }
        if (seen.has(p)) continue; seen.add(p);
        const low = itemName.toLowerCase();
        // the same module in two folders (e.g. theWord's folder and Timotheos's imports): keep the first
        const dupKey = low;
        if (BIBLE_EXT.test(low)) { if (seenNames.has(dupKey)) continue; seenNames.add(dupKey); this.entries.push({ file: p, name: itemName, ext: path.extname(low), linkFile: viaLink }); }
        else if (usfm.isUsfmFile(low)) { if (seenNames.has(dupKey)) continue; seenNames.add(dupKey); this.entries.push({ file: p, name: itemName, ext: ".usfm", linkFile: viaLink }); }
        else if (usfm.isUsfxFile(low) || (low.endsWith(".xml") && usfm.probeXml(p))) { if (seenNames.has(dupKey)) continue; seenNames.add(dupKey); this.entries.push({ file: p, name: itemName, ext: ".usfx", linkFile: viaLink }); }
        else if (ENCRYPTED_EXT.test(low)) continue;
        else if (low.endsWith('.xrefs.twm')) this.xrefFiles.push(p);
        else if (OVERLAY_TWM.test(low)) this.overlayFiles.push(p);
        else if (SKIP_TWM.test(low)) continue;
        else if (BOOK_EXT.test(low)) {
          if (seenNames.has(dupKey)) continue; seenNames.add(dupKey);
          if (low.endsWith('.gbk.twm')) gbks.push({ file: p, name: itemName, linkFile: viaLink });
          else this.addBook(p, itemName, viaLink);
        }
      }
    };
    for (const d of this.folders()) walk(d, 0);
    // .gbk.twm: Bible text (e.g. the KJV Apocrypha) is shown as a Bible, anything else as a book
    for (const bk of gbks) {
      let st; try { st = fs.statSync(bk.file); } catch (e) { continue; }
      const key = bk.file + '|' + st.mtimeMs;
      if (!(key in this.probeCache)) { try { this.probeCache[key] = await twbook.probe(bk.file); } catch (e) { this.probeCache[key] = false; } }
      if (this.probeCache[key]) this.entries.push({ file: bk.file, name: bk.name, ext: '.gbk.twm', linkFile: bk.linkFile || null });
      else this.addBook(bk.file, bk.name, bk.linkFile || null);
    }
    await this.overlays.load(this.overlayFiles);
    return this.list();
  }

  addBook(file, name, linkFile = null) {
    const id = 'bm:' + name;
    const c = this.cache[this.cacheKey(file)];
    this.books.set(id, { id, file, name, linkFile, kind: (c && c.kind) || bookmod.guessKind(name) || 'book', format: /\.twm$/i.test(name) ? 'theWord' : 'e-Sword', mod: null });
  }

  bookInfo(b) {
    const m = b.mod || this.cache[this.cacheKey(b.file)];
    return {
      id: b.id, name: b.name, file: b.file, format: m ? m.format : b.format, kind: m ? m.kind : b.kind,
      title: m ? m.title : b.name, abbr: m ? m.abbr : b.name.replace(/\..*$/, ''), opened: !!m, loaded: !!b.mod,
      locked: m ? !!m.locked : false, reason: m ? m.reason || '' : '',
      isStrong: m ? !!m.isStrong : null, isMorph: m ? !!m.isMorph : null, greek: m ? !!m.greek : null, hebrew: m ? !!m.hebrew : null,
      user: m ? !!m.user : false, hasVerseSync: m ? !!m.hasVerseSync : b.kind === 'commentary', totalTopics: m ? (m.totalTopics || 0) : 0,
      author: m ? m.author || '' : '', description: m ? m.description || '' : '',
      lang: m && m.cfg ? String(m.cfg.lang || m.cfg.language || '') : '',
      imported: !!(b.linkFile || this.extraFolders.some(f => b.file.startsWith(f))),
    };
  }

  setHidden(ids) { this.hidden = new Set(ids || []); }
  list() {
    const hid = id => !!(this.hidden && this.hidden.has(id));
    const L = this._list();
    for (const b of L.bibles) b.hidden = hid(b.id);
    for (const b of L.books) b.hidden = hid(b.id);
    for (const b of L.dicts) b.hidden = hid(b.id);
    return L;
  }
  _list() {
    return {
      bibles: this.entries.map(e => {
        const m = this.bibles.get(this._bibleId(e));
        return { id: this._bibleId(e), name: e.name, file: e.file, abbr: m ? m.abbr : e.name.replace(/\.[^.]+$/, ''), title: m ? m.title : '', loaded: !!m, format: /^es:/.test(this._bibleId(e)) ? 'e-Sword' : /^usfm:/.test(this._bibleId(e)) ? 'USFM' : /^usfx:/.test(this._bibleId(e)) ? 'USFX' : 'theWord', imported: !!(e.linkFile || this.extraFolders.some(f => e.file.startsWith(f))) };
      }),
      books: [...this.books.values()].map(b => this.bookInfo(b)),
      dicts: [...this.books.values()].filter(b => b.kind === 'dictionary').map(b => this.bookInfo(b)),
      xrefFiles: this.xrefFiles,
      overlays: this.overlays.list(),
      errors: this.errors,
    };
  }

  _bibleId(e) { return (e.ext === '.bblx' || e.ext === '.bbli' ? 'es:' : e.ext === '.gbk.twm' ? 'bk:' : e.ext === '.usfm' ? 'usfm:' : e.ext === '.usfx' ? 'usfx:' : 'tw:') + e.name; }

  /** Bibles that are shown in a view stay loaded; the others are let go when nobody has used them for a while (RAM) */
  _openIds() { return new Set([...(this.settings.openBibles || []), ...((this.settings.views || []).map(v => v && v.bible))]); }
  _release(id) { const m = this.bibles.get(id); if (!m) return; try { if (m.close) m.close(); } catch (e) { /* closed */ } this.bibles.delete(id); this.bibleUse.delete(id); }
  sweepBibles(idleMs = 5 * 60 * 1000) {
    const keep = this._openIds(); const now = Date.now();
    for (const id of [...this.bibles.keys()]) if (!keep.has(id) && now - (this.bibleUse.get(id) || 0) >= idleMs) this._release(id);
  }
  async bible(id) {
    this.bibleUse.set(id, Date.now());
    if (!this._sweepT) { this._sweepT = setInterval(() => this.sweepBibles(), 60 * 1000); if (this._sweepT.unref) this._sweepT.unref(); }
    if (this.bibles.has(id)) return this.bibles.get(id);
    const e = this.entries.find(x => this._bibleId(x) === id);
    if (!e) throw new Error('Module not found: ' + id);
    const m = (e.ext === '.bblx' || e.ext === '.bbli') ? await esword.load(e.file, this.settings.eswordBookMap || {})
      : e.ext === '.gbk.twm' ? await twbook.load(e.file) : e.ext === '.usfm' ? usfm.loadUsfm(e.file) : e.ext === '.usfx' ? usfm.loadUsfx(e.file) : theword.load(e.file);
    m.id = id;
    this.bibles.set(id, m);
    return m;
  }

  async info(id, o = {}) {
    const had = this.bibles.has(id);
    const m = await this.bible(id);
    if (o.transient && !had && !this._openIds().has(id)) setTimeout(() => { if (!this._openIds().has(id)) this._release(id); }, 0); // only its name and features were wanted
    return {
      id, abbr: m.abbr, title: m.title, format: m.format, rtl: m.rtl, books: m.books,
      rules: (m.props && m.props._rules) || [], tagRules: (m.props && m.props._tagRules) || [],
      warnings: m.warnings || [], hasStrongs: m.hasStrongs,
      strongsDct: m.strongsDct || null, morphDct: m.morphDct || null, lemmaDct: m.lemmaDct || null,
      font: (m.props && m.props.font) || '', lang: String((m.props && (m.props.lang || m.props.language)) || ''),
      about: m.about || (m.props && m.props.about) || '', description: (m.props && (m.props.description || m.props.information)) || '',
    };
  }

  /** chapter text for several modules at once: rows aligned by verse number (with external overlays applied) */
  async chapter(ids, b, c) {
    const mods = [];
    for (const id of ids) { try { mods.push(await this.bible(id)); } catch (e) { mods.push(null); } }
    let max = 0;
    for (const m of mods) if (m && m.books[b] && m.books[b][c - 1]) max = Math.max(max, m.books[b][c - 1]);
    const rows = [];
    const getV = (m, v) => {
      if (!m) return null;
      const raw = m.getVerse(b, c, v);
      return raw != null ? this.overlays.applyVerse(b, c, v, raw) : null;
    };
    const zero = mods.map(m => getV(m, 0));
    if (zero.some(x => x)) rows.push({ v: 0, cells: zero });
    for (let v = 1; v <= max; v++) rows.push({ v, cells: mods.map(m => getV(m, v)) });
    return { b, c, book: canon.book(+b, this.settings.apocryphaPlacement), rows };
  }

  /** union of books/chapters across the given modules (for navigation) */
  async navigation(ids) {
    const books = {};
    for (const id of ids) {
      let m; try { m = await this.bible(id); } catch (e) { continue; }
      for (const b in m.books) {
        const set = books[b] || (books[b] = new Set());
        m.books[b].forEach((n, i) => { if (n > 0) set.add(i + 1); });
      }
    }
    const mode = this.settings.apocryphaPlacement;
    return Object.keys(books).map(Number).filter(b => books[b].size).sort((a, b) => canon.orderKey(a, mode) - canon.orderKey(b, mode))
      .map(b => { const list = [...books[b]].sort((x, y) => x - y); return { ...canon.book(b, mode), chapters: list[list.length - 1], chapterList: list }; });
  }

  /* ---------------- book modules ---------------- */
  async openBook(id) {
    const b = this.books.get(id);
    if (!b) throw new Error('Module not found: ' + id);
    if (!b.mod) {
      try { b.mod = await bookmod.open(b.file); }
      catch (e) { b.mod = { locked: true, reason: e.message, kind: b.kind, format: b.format, title: b.name, abbr: b.name, topics: () => [], topic: () => null, forVerse: () => null, verseMarks: () => new Set(), lookup: () => null, findWord: () => [], today: () => [], searchTopics: () => [], close() {} }; }
      b.kind = b.mod.kind || b.kind;
      b.keep = true;
      this.remember(b); this.saveCache();
    }
    return b.mod;
  }
  async booksOfKind(kind) {
    const out = [];
    for (const b of this.books.values()) {
      if (b.kind !== kind && !(b.mod && b.mod.kind === kind)) continue;
      if (this.hidden && this.hidden.has(b.id)) continue; // removed from the lists by the user
      const m = await this.openBook(b.id);
      if (m.kind === kind && !m.locked) out.push([b.id, m]);
    }
    return out;
  }
  /** [B3] Commentaries + any hybrid books/maps that carry verse synchronization (rel_refs) */
  async verseSyncedModules() {
    const out = [];
    for (const b of this.books.values()) {
      const cached = this.cache[this.cacheKey(b.file)];
      const maybeSync = b.kind === 'commentary' || (b.mod && b.mod.hasVerseSync) || (cached && cached.hasVerseSync) || (!cached && b.format === 'theWord' && (b.kind === 'book' || b.kind === 'map'));
      if (!maybeSync) continue;
      const m = await this.openBook(b.id);
      if (!m.locked && (m.kind === 'commentary' || m.hasVerseSync)) out.push([b.id, m]);
    }
    return out;
  }
  async bookOpen(id) { await this.openBook(id); return this.bookInfo(this.books.get(id)); }
  async bookAbout(id) { const m = await this.openBook(id); return { about: m.about || '', description: m.description || '', author: m.author || '' }; }
  async bookTopics(id) { const m = await this.openBook(id); return m.topics(); }
  async bookSearch(id, q) { const m = await this.openBook(id); return m.searchTopics ? m.searchTopics(q) : []; }
  /** a topic; plain-text Bible references in it become links ("John 3:16", "1 Cor. 13:4-7") */
  async bookTopic(id, tid) { const m = await this.openBook(id); const t = m.topic(tid); if (t && t.html) t.html = linkHtml(t.html); return t; }
  async bookLookup(id, key) { const m = await this.openBook(id); const t = m.lookup(key); if (t && t.html) t.html = linkHtml(t.html); return t; }

  /** commentary (and hybrid verse-synced book) entries for a verse */
  async commentaries(b, c, v) {
    const out = [];
    for (const [id, m] of await this.verseSyncedModules()) {
      const hit = m.forVerse(b, c, v);
      if (m.kind === 'commentary' || hit) out.push({ id, abbr: m.abbr, title: m.title, kind: m.kind, user: !!m.user, hit });
    }
    return out;
  }
  async commentaryMarks(b, c) {
    const out = {};
    for (const [id, m] of await this.verseSyncedModules()) { const s = m.verseMarks(b, c); if (s.size) out[id] = { abbr: m.abbr, verses: [...s] }; }
    return out;
  }
  /** topics matching a word in every dictionary / book (non-Strong lookups) */
  async wordLookup(word, fuzzy = true) {
    const out = [];
    for (const kind of ['dictionary', 'book', 'map']) for (const [id, m] of await this.booksOfKind(kind)) {
      const hits = m.findWord(word, fuzzy);
      if (hits.length) out.push({ id, abbr: m.abbr, title: m.title, kind: m.kind, hits });
    }
    return out;
  }
  async devotionsToday(month, day) {
    const out = [];
    for (const [id, m] of await this.booksOfKind('devotional')) { const t = m.today(month, day); if (t.length) out.push({ id, abbr: m.abbr, title: m.title, topics: t }); }
    return out;
  }

  /** Find a dictionary module ID matching a property value (id, abbrev, or filename stem) */
  async resolveDictSpec(spec) {
    if (!spec) return null;
    const want = String(spec).trim().toLowerCase().replace(/^dct:|^bm:/, '');
    for (const b of this.books.values()) {
      if (b.kind !== 'dictionary') continue;
      if (b.id.toLowerCase() === 'bm:' + want || b.name.toLowerCase() === want || b.name.replace(/\.[^.]+(\.twm)?$/i, '').toLowerCase() === want) return b.id;
      const m = b.mod || this.cache[this.cacheKey(b.file)];
      if (m && ((m.abbr || '').toLowerCase() === want || (m.cfg && (m.cfg.id || '').toLowerCase() === want))) return b.id;
    }
    return null;
  }

  async lookup(kind, key, bibleId) {
    // kind: 'strong' | 'morph' | 'lemma'
    const order = [];
    const all = [...this.books.values()].filter(b => b.kind === 'dictionary').map(b => b.id);

    // [C3] Check per-Bible default dictionary properties (strongs.dct, morph.dct, lemma.dct) first
    const activeBible = bibleId || (this.settings.openBibles && this.settings.openBibles[0]);
    if (activeBible && this.bibles.has(activeBible)) {
      const bm = this.bibles.get(activeBible);
      const propSpec = kind === 'strong' ? bm.strongsDct : kind === 'morph' ? bm.morphDct : bm.lemmaDct;
      if (propSpec) {
        for (const part of String(propSpec).split(/[,;]/)) {
          const hit = await this.resolveDictSpec(part);
          if (hit && all.includes(hit) && !order.includes(hit)) order.push(hit);
        }
      }
    }

    const prefer = kind === 'strong' ? (key[0].toUpperCase() === 'H' ? this.settings.hebrewDict : this.settings.greekDict) : this.settings.morphDict;
    const pref = prefer && prefer.replace(/^dct:/, 'bm:');
    if (pref && all.includes(pref) && !order.includes(pref)) order.push(pref);
    for (const id of all) if (!order.includes(id)) order.push(id);
    for (const id of order) {
      const mod = await this.openBook(id);
      if (!mod || mod.locked) continue;
      if (kind === 'strong' && !mod.isStrong) continue;
      if (kind === 'strong' && key[0].toUpperCase() === 'H' && !mod.hebrew) continue;
      if (kind === 'strong' && key[0].toUpperCase() === 'G' && !mod.greek) continue;
      if (kind === 'morph' && !mod.isMorph) continue;
      const r = mod.lookup(key);
      if (r) return { dict: mod.title, dictId: id, ...r, html: linkHtml(r.html) };
    }
    return null;
  }

  async search(ids, query, opts = {}) {
    const mods = [];
    for (const id of ids) { try { const m = await this.bible(id); mods.push({ id, abbr: m.abbr, mod: m }); } catch (e) { /* skip */ } }
    return search.run(mods, query, Object.assign({}, opts, { mode: this.settings.apocryphaPlacement }));
  }

  /** chapter count of a book in the given Bibles (for reading plans) */
  async chapterCount(ids, b) {
    let n = 0;
    for (const id of ids) { try { const m = await this.bible(id); if (m.books[b]) n = Math.max(n, m.books[b].length); } catch (e) { /* skip */ } }
    return n || canon.kjvChapters(b).length || ({ 67: 14, 68: 16, 69: 16, 70: 19, 71: 51, 72: 5, 73: 1, 74: 1, 75: 1, 76: 1, 77: 16, 78: 15, 79: 9, 80: 1, 83: 16 }[b] || 0);
  }

  /** the file behind a module id (Bible or book) */
  linkFileOf(file) {
    for (const b of this.books.values()) if (b.file === file && b.linkFile) return b.linkFile;
    for (const e of this.entries) if (e.file === file && e.linkFile) return e.linkFile;
    return null;
  }
  fileOf(id) {
    if (this.books.has(id)) return this.books.get(id).file;
    const e = this.entries.find(x => this._bibleId(x) === id);
    if (!e) throw new Error('Module not found: ' + id);
    return e.file;
  }

  /** close every module whose file is in this folder (before files there are replaced) */
  releaseUnder(dir) {
    const inDir = f => path.resolve(f).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
    for (const [id, m] of this.bibles) if (m.file && inDir(m.file)) { if (m.close) m.close(); this.bibles.delete(id); }
    for (const b of this.books.values()) if (b.mod && inDir(b.file)) { b.mod.close(); b.mod = null; }
  }
  /** forget a module (closing it) – used before deleting or modifying a module file */
  release(file) {
    for (const [id, m] of this.bibles) if (m.file === file) { if (m.close) m.close(); this.bibles.delete(id); }
    for (const b of this.books.values()) if (b.file === file && b.mod) { b.mod.close(); b.mod = null; delete this.cache[this.cacheKey(file)]; }
  }
}

function plainText(raw) {
  return raw.replace(/<_HTML_>/, '').replace(/<RF[^>]*>[\s\S]*?<Rf>/g, '').replace(/<TS\d?>[\s\S]*?<Ts>/g, '')
    .replace(/<sup class="(strong|morph|fn)[^"]*"[^>]*>[^<]*<\/sup>/g, '')
    .replace(/<(CM|CI|CL|br)\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

module.exports = { Library, plainText };
