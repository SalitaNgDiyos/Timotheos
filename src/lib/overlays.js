'use strict';
// External headings (.hdgs.twm) and paragraph break overlay sets (.prgs.twm) in theWord's format.
// Applied onto Bible modules that do not carry built-in <TS> headings or <CM>/<CI> paragraph marks.
const path = require('path');
const { openDb } = require('./sqlite');

function str(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  const b = Buffer.from(v);
  const s = b.toString('utf8');
  return s.includes('') ? new TextDecoder('windows-1252').decode(b) : s;
}

class Overlays {
  constructor() {
    this.headingSets = [];   // [{name, file, disabled, map: Map("b.c.v" -> [{level, text}])}]
    this.paragraphSets = []; // [{name, file, disabled, map: Map("b.c.v" -> "<CM>"|"<CI>")}]
    this.errors = [];
  }

  async load(files = []) {
    this.headingSets = [];
    this.paragraphSets = [];
    this.errors = [];
    for (const f of files) {
      const low = f.toLowerCase();
      try {
        const db = openDb(f);
        const tables = (db.exec("select name from sqlite_master where type='table'")[0] || { values: [] }).values.map(r => String(r[0]));
        const T = n => tables.find(t => t.toLowerCase() === n);
        const cfg = {};
        if (T('config')) {
          for (const [k, v] of (db.exec(`select name, value from "${T('config')}"`)[0] || { values: [] }).values) {
            cfg[String(k).toLowerCase()] = str(v);
          }
        }
        if (low.endsWith('.hdgs.twm') || T('headings') || cfg.type === '6') {
          const map = new Map();
          const hTab = T('headings');
          if (hTab) {
            const cols = (db.exec(`pragma table_info("${hTab}")`)[0] || { values: [] }).values.map(c => String(c[1]).toLowerCase());
            const cB = cols.find(c => c === 'bi' || c === 'book') || 'bi';
            const cC = cols.find(c => c === 'ci' || c === 'chapter') || 'ci';
            const cV = cols.find(c => c === 'vi' || c === 'fvi' || c === 'verse') || 'vi';
            const cL = cols.find(c => c === 'level' || c === 'lvl') || null;
            const cT = cols.find(c => c === 'text' || c === 'heading' || c === 'title' || c === 'data') || 'text';
            const rows = (db.exec(`select ${cB}, ${cC}, ${cV}, ${cL || '1'}, ${cT} from "${hTab}"`)[0] || { values: [] }).values;
            for (const [b, c, v, lvl, txt] of rows) {
              const t = str(txt).trim();
              if (!t) continue;
              const k = `${b}.${c}.${v}`;
              let list = map.get(k); if (!list) { list = []; map.set(k, list); }
              list.push({ level: Math.min(3, Math.max(1, +lvl || 1)), text: t });
            }
          } else if (T('bible_refs') && T('content')) {
            const rows = (db.exec(`select r.bi, r.ci, r.fvi, c.data from "${T('bible_refs')}" r join "${T('content')}" c on c.topic_id = r.topic_id`)[0] || { values: [] }).values;
            for (const [b, c, v, d] of rows) {
              const t = str(d).replace(/<[^>]*>/g, '').trim();
              if (!t) continue;
              const k = `${b}.${c}.${v}`;
              let list = map.get(k); if (!list) { list = []; map.set(k, list); }
              list.push({ level: 1, text: t });
            }
          }
          this.headingSets.push({ name: cfg.title || path.basename(f).replace(/\.hdgs\.twm$/i, ''), file: f, disabled: false, map });
        } else if (low.endsWith('.prgs.twm') || T('paragraphs') || cfg.type === '7') {
          const map = new Map();
          const pTab = T('paragraphs') || T('prgs');
          if (pTab) {
            const cols = (db.exec(`pragma table_info("${pTab}")`)[0] || { values: [] }).values.map(c => String(c[1]).toLowerCase());
            const cB = cols.find(c => c === 'bi' || c === 'book') || 'bi';
            const cC = cols.find(c => c === 'ci' || c === 'chapter') || 'ci';
            const cV = cols.find(c => c === 'vi' || c === 'verse') || 'vi';
            const cK = cols.find(c => c === 'kind' || c === 'type' || c === 'mark') || null;
            const rows = (db.exec(`select ${cB}, ${cC}, ${cV}, ${cK || "'CM'"} from "${pTab}"`)[0] || { values: [] }).values;
            for (const [b, c, v, kind] of rows) {
              const ks = String(kind || 'CM').toUpperCase();
              map.set(`${b}.${c}.${v}`, ks.includes('CI') || ks === '2' ? '<CI>' : '<CM>');
            }
          }
          this.paragraphSets.push({ name: cfg.title || path.basename(f).replace(/\.prgs\.twm$/i, ''), file: f, disabled: false, map });
        }
        db.close();
      } catch (e) {
        this.errors.push(`${path.basename(f)}: ${e.message}`);
      }
    }
  }

  /** decorate raw verse text with external headings and paragraph marks when the module has none */
  applyVerse(b, c, v, raw) {
    if (raw == null) return raw;
    let out = String(raw);
    const k = `${b}.${c}.${v}`;
    const isHtml = out.startsWith('<_HTML_>');
    const body = isHtml ? out.slice(8) : out;
    let prefix = '';

    // External headings
    if (!/<TS\d?>|class="heading/i.test(body)) {
      for (const s of this.headingSets) {
        if (s.disabled) continue;
        const hs = s.map.get(k);
        if (hs && hs.length) {
          for (const h of hs) {
            const clean = h.text.replace(/<[^>]*>/g, '');
            prefix += isHtml ? `<span class="heading h${h.level}">${clean}</span>` : `<TS${h.level}>${clean}<Ts>`;
          }
          break;
        }
      }
    }

    // External paragraphs
    if (!isHtml && !/<(CM|CI|CL)\b/i.test(body)) {
      for (const s of this.paragraphSets) {
        if (s.disabled) continue;
        const p = s.map.get(k);
        if (p) { prefix += p; break; }
      }
    }

    if (!prefix) return out;
    return isHtml ? '<_HTML_>' + prefix + body : prefix + body;
  }

  list() {
    return {
      headings: this.headingSets.map((s, i) => ({ i, name: s.name, file: s.file, count: s.map.size, disabled: !!s.disabled })),
      paragraphs: this.paragraphSets.map((s, i) => ({ i, name: s.name, file: s.file, count: s.map.size, disabled: !!s.disabled })),
    };
  }
}

module.exports = { Overlays };
