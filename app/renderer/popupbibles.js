/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Multi-Bible verse-link popup selection, Deuterocanon filtering, and legacy Deuterocanon book-link parsing.
(function () {
  'use strict';

  /** Map a Timotheos book ID to its verse-link popup setting key. */
  function popupGroupKey(b) {
    const id = +b;
    if (id >= 1 && id <= 39) return 'popupOT';
    if (id >= 40 && id <= 66) return 'popupNT';
    if (id >= 67) return 'popupAP';
    return '';
  }

  /** Normalize a saved popup Bible setting (legacy single string or array of IDs) to a deduplicated array. */
  function normalizePopupIds(val, installedIds) {
    const raw = Array.isArray(val) ? val : (typeof val === 'string' && val.trim() ? [val.trim()] : []);
    const allowed = installedIds ? new Set(installedIds) : null;
    const out = [];
    const seen = new Set();
    for (const item of raw) {
      const id = typeof item === 'string' ? item.trim() : '';
      if (!id || seen.has(id)) continue;
      if (allowed && !allowed.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  /** Check whether a loaded Bible info object contains any book in the given popup group. Returns null if info is not loaded. */
  function bibleHasGroup(info, key) {
    if (!info || !info.books) return null;
    const keys = Object.keys(info.books);
    if (key === 'popupOT') return keys.some(k => +k >= 1 && +k <= 39 && info.books[k]);
    if (key === 'popupNT') return keys.some(k => +k >= 40 && +k <= 66 && info.books[k]);
    if (key === 'popupAP') return keys.some(k => +k >= 67 && info.books[k]);
    return keys.length > 0;
  }

  /** Filter installed Bibles for a popup group. Deuterocanon (popupAP) shows only Bibles that contain Deuterocanon books. */
  function filterBiblesForGroup(bibles, infosMap, key) {
    const list = [];
    let loading = false;
    for (const b of bibles || []) {
      const info = infosMap && typeof infosMap.get === 'function' ? infosMap.get(b.id) : (infosMap && infosMap[b.id]);
      const has = bibleHasGroup(info, key);
      if (has === null) {
        loading = true;
        if (key !== 'popupAP') list.push(b);
      } else if (has) {
        list.push(b);
      }
    }
    return { list, loading };
  }

  /** Resolve the ordered list of Bible IDs to display in a verse hover popup. */
  function resolvePopupTargets({ b, settings, bibles, infosMap, openBibles, modSpec, resolveBibleSpecFn }) {
    const explicit = typeof resolveBibleSpecFn === 'function' ? resolveBibleSpecFn(modSpec) : null;
    if (explicit) return [explicit];

    const installed = (bibles || []).map(x => x.id);
    const key = popupGroupKey(b);
    const selected = key ? normalizePopupIds(settings && settings[key], installed) : [];
    if (selected.length) return selected;

    const getInfo = id => (infosMap && typeof infosMap.get === 'function' ? infosMap.get(id) : (infosMap && infosMap[id]));
    const hasBook = id => {
      const inf = getInfo(id);
      return !!(inf && inf.books && inf.books[b]);
    };

    const opens = (openBibles || []).filter(id => installed.includes(id));
    for (const id of opens) if (hasBook(id)) return [id];
    if (+b >= 67) {
      for (const id of installed) if (hasBook(id)) return [id];
    }
    if (opens.length) return [opens[0]];
    for (const id of installed) if (hasBook(id)) return [id];
    return installed.length ? [installed[0]] : [];
  }

  // English and Tagalog Deuterocanon / Apocrypha book names and abbreviations -> Timotheos book ID (67..87)
  const DEUTERO_PATTERNS = [
    [/^(?:tobit|tobias|tobie|tob|tb)\.?\s+/i, 67],
    [/^(?:judith|judit|jdt|jth)\.?\s+/i, 68],
    [/^(?:additions?\s+to\s+esther|the\s+rest\s+of\s+esther|rest\s+of\s+esther|dagdag\s+sa\s+ester|addesth|esthgr|aes|gkesth|restesth)\.?\s+/i, 69],
    [/^(?:wisdom\s+of\s+solomon|wisdom\s+of\s+salomon|book\s+of\s+wisdom|wisdom|karunungan|wisd|wissol|wis|kar)\.?\s+/i, 70],
    [/^(?:wisdom\s+of\s+sirach|ecclesiasticus|eclesiastico|ben\s+sira|sirach|ecclus|sir)\.?\s+/i, 71],
    [/^(?:baruch|barouch|baruc|bar|ba)\.?\s+/i, 72],
    [/^(?:letter\s+of\s+jeremiah|letter\s+of\s+ieremias|epistle\s+of\s+jeremiah|epistle\s+of\s+jeremy|sulat\s+ni\s+jeremias|epjer|letjer|lje)\.?\s+/i, 73],
    [/^(?:prayer\s+of\s+azariah|prayer\s+of\s+azarias|song\s+of\s+the\s+three(?:\s+holy)?\s+children|three\s+children|panalangin\s+ni\s+azarias|prazar|sgthree|song3|s3y|aza)\.?\s+/i, 74],
    [/^(?:susannah|susanna|susana|sus)\.?\s+/i, 75],
    [/^(?:bel\s+and\s+the\s+dragon|bel\s+and\s+dragon|bel)\.?\s+/i, 76],
    [/^(?:1\s*(?:maccabees|makkabees|machabees|maccabeo|macabeo|macc|mach|mac|ma|m))\.?\s+/i, 77],
    [/^(?:2\s*(?:maccabees|makkabees|machabees|maccabeo|macabeo|macc|mach|mac|ma|m))\.?\s+/i, 78],
    [/^(?:3\s*(?:maccabees|makkabees|machabees|maccabeo|macabeo|macc|mach|mac|ma|m))\.?\s+/i, 82],
    [/^(?:4\s*(?:maccabees|makkabees|machabees|maccabeo|macabeo|macc|mach|mac|ma|m))\.?\s+/i, 84],
    [/^(?:1\s*(?:esdras|esdr|esd|es)|3\s*(?:esdras|esdr|esd))\.?\s+/i, 79],
    [/^(?:2\s*(?:esdras|esdr|esd|es)|4\s*(?:ezra|esdras|esdr|esd))\.?\s+/i, 83],
    [/^(?:prayer\s+of\s+manasseh|prayer\s+of\s+manasses|panalangin\s+ni\s+manases|manasses|prman|pma|man)\.?\s+/i, 80],
    [/^(?:psalm\s*151|psalms?\s*151|awit\s*151|ps151|psa151)\.?\s*/i, 81],
    [/^(?:odes|ode)\.?\s+/i, 85],
    [/^(?:psalms?\s+of\s+solomon|psalms?\s+of\s+salomon|psssol|pssol)\.?\s+/i, 86],
    [/^(?:epistle\s+to\s+the\s+laodiceans|laodiceans|eplao|laod)\.?\s+/i, 87],
  ];

  /**
   * Parse a legacy theWord Deuterocanon book link (e.g. tw://bk.DeuteroKJV?tid=135#v1-v2 with text "Sirach 46:1 (LXX)")
   * into { b, c, v1, v2 }. Returns null if the link is not a Deuterocanon passage reference.
   */
  function parseLegacyDeuteroLink(href, linkText) {
    if (!/^tw:\/\/bk\./i.test(String(href || ''))) return null;
    const raw = String(linkText || '').replace(/^[\s,;:.]+/, '').replace(/\s*\([^)]*\)\s*$/, '').replace(/[\s,;:.]+$/, '').trim();
    if (!raw) return null;
    for (const [re, b] of DEUTERO_PATTERNS) {
      const m = re.exec(raw);
      if (!m) continue;
      const rest = raw.slice(m[0].length).trim();
      if (b === 81) {
        const vm = /^(?::\s*)?(\d+)(?:\s*[-–—]\s*(\d+))?/.exec(rest);
        if (vm) return { b: 81, c: 1, v1: +vm[1], v2: vm[2] ? +vm[2] : +vm[1] };
        const hm = /#v(\d+)(?:-v(\d+))?/i.exec(String(href));
        if (hm) return { b: 81, c: 1, v1: +hm[1], v2: hm[2] ? Math.max(+hm[1], +hm[2] - 1) : +hm[1] };
        return { b: 81, c: 1, v1: 1, v2: 1 };
      }
      const cv = /^(\d+)\s*:\s*(\d+)(?:\s*[-–—]\s*(\d+))?/.exec(rest);
      if (cv) {
        const c = +cv[1], v1 = +cv[2], v2 = cv[3] ? Math.max(v1, +cv[3]) : v1;
        return { b, c, v1, v2 };
      }
      const chOnly = /^(\d+)$/.exec(rest);
      if (chOnly) {
        const hm = /#v(\d+)(?:-v(\d+))?/i.exec(String(href));
        if (hm) return { b, c: +chOnly[1], v1: +hm[1], v2: hm[2] ? Math.max(+hm[1], +hm[2] - 1) : +hm[1] };
        return { b, c: +chOnly[1], v1: 1, v2: 1 };
      }
    }
    return null;
  }

  /** Move an ID up (-1) or down (+1) in the ordered selected popup Bible list. */
  function reorderPopupIds(ids, id, delta) {
    const out = Array.isArray(ids) ? ids.slice() : [];
    const idx = out.indexOf(id);
    if (idx < 0) return out;
    const next = idx + (delta < 0 ? -1 : 1);
    if (next < 0 || next >= out.length) return out;
    const tmp = out[idx];
    out[idx] = out[next];
    out[next] = tmp;
    return out;
  }

  /** Order checklist Bibles with selected ones pinned at the top in their exact display order, followed by unselected ones. */
  function orderBiblesForChecklist(list, selectedIds) {
    const byId = new Map((list || []).map(b => [b.id, b]));
    const sel = [];
    const seen = new Set();
    for (const id of selectedIds || []) {
      const b = byId.get(id);
      if (b && !seen.has(id)) { sel.push(b); seen.add(id); }
    }
    const rest = (list || []).filter(b => !seen.has(b.id));
    return { selected: sel, unselected: rest };
  }

  const apiObj = { popupGroupKey, normalizePopupIds, bibleHasGroup, filterBiblesForGroup, resolvePopupTargets, parseLegacyDeuteroLink, reorderPopupIds, orderBiblesForChecklist };
  if (typeof window !== 'undefined') window.TimotheosPopupBibles = apiObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = apiObj;
})();
