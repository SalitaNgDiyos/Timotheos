/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
// Reads word-processor and text documents (.txt .rtf .docx .odt) into a list of blocks:
//   { h: 0 | 1..6, html, text }   h > 0 is a heading; html holds the block's own markup
//                                  (<p>, <ul>/<ol>, <table>, pictures) or, for a heading, its inline markup.
// Bold, italic, underline, headings, paragraphs, lists, tables and pictures (as data: URIs) are kept.
// No DOM is used (the backend runs in a worker), so the XML is read with a small tokenizer.
const fs = require('fs');
const zip = require('./zip');
const { rtfToHtml, isRtf } = require('./rtf');

const DOC_RE = /\.(txt|text|rtf|docx|odt)$/i;
const MAX_IMG = 6 * 1024 * 1024;       // a picture bigger than this is left out
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrEsc = s => esc(s).replace(/"/g, '&quot;');

/* ------------------------------------------------------------------ XML */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unent(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return ''; } }
    return ENT[e] != null ? ENT[e] : m;
  });
}
/** XML text → tree of {n: name, a: {attrs}, c: [children or strings]} */
function parseXml(xml) {
  const root = { n: '#root', a: {}, c: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>\/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[6] != null) { top.c.push(unent(m[6])); continue; }
    if (m[1] != null) { top.c.push(m[1]); continue; }          // CDATA
    if (m[3] == null) continue;                                // comment, PI, doctype
    if (m[2] === '/') { if (stack.length > 1) stack.pop(); continue; }
    const node = { n: m[3], a: {}, c: [] };
    const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let am;
    while ((am = ar.exec(m[4] || ''))) node.a[am[1]] = unent(am[2] != null ? am[2] : am[3]);
    top.c.push(node);
    if (m[5] !== '/') stack.push(node);
  }
  return root;
}
const kids = (n, name) => n.c.filter(x => typeof x !== 'string' && x.n === name);
const kid = (n, name) => n.c.find(x => typeof x !== 'string' && x.n === name);
const nodes = n => n.c.filter(x => typeof x !== 'string');

/* ---------------------------------------------------------------- pictures */
function imgMime(name, buf) {
  const b = buf;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
  if (b.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
  if (/\.svg$/i.test(name)) return 'image/svg+xml';
  return null;                                           // wmf, emf, tiff … a browser cannot show these
}
function picture(name, buf, ctx, alt) {
  if (!buf) return '';
  const mime = imgMime(name, buf);
  if (!mime || buf.length > MAX_IMG) { ctx.skippedPics++; return ''; }
  ctx.pics++;
  return `<img src="data:${mime};base64,${buf.toString('base64')}" alt="${attrEsc(alt || '')}">`;
}

/* ------------------------------------------------------------ run → html */
function wrap(txt, f) {
  if (!txt) return '';
  let o = txt;
  if (f.sup) o = `<sup>${o}</sup>`;
  if (f.sub) o = `<sub>${o}</sub>`;
  if (f.s) o = `<s>${o}</s>`;
  if (f.u) o = `<u>${o}</u>`;
  if (f.i) o = `<i>${o}</i>`;
  if (f.b) o = `<b>${o}</b>`;
  return o;
}
/** merge neighbouring identical formatting: "<b>a</b><b>b</b>" → "<b>ab</b>" */
function tidy(h) {
  let prev;
  do { prev = h; h = h.replace(/<\/(b|i|u|s|sup|sub)><\1>/g, ''); } while (h !== prev);
  return h;
}
const plainOf = h => h.replace(/<img[^>]*>/g, ' ').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/* ================================================================== DOCX */
function readDocx(buf) {
  const ents = zip.entries(buf);
  const get = n => { const e = ents.find(x => x.name === n); return e ? zip.extract(buf, e) : null; };
  const docBuf = get('word/document.xml');
  if (!docBuf) throw new Error('this .docx has no document text (is it a real Word file?)');
  const ctx = { pics: 0, skippedPics: 0 };
  const doc = parseXml(docBuf.toString('utf8'));
  const body = (function find(n) { for (const x of nodes(n)) { if (x.n === 'w:body') return x; const f = find(x); if (f) return f; } return null; })(doc);
  if (!body) throw new Error('this .docx has no document body');

  // relationships: rId → target (pictures) or URL (links)
  const rels = {};
  const rb = get('word/_rels/document.xml.rels');
  if (rb) for (const r of nodes(nodes(parseXml(rb.toString('utf8')))[0] || { c: [] })) rels[r.a.Id] = { target: r.a.Target, ext: r.a.TargetMode === 'External' };
  const media = rid => {
    const r = rels[rid]; if (!r || r.ext) return null;
    const p = r.target.startsWith('/') ? r.target.slice(1) : 'word/' + r.target.replace(/^\.\//, '');
    const b = get(p.replace(/\/[^/]+\/\.\.\//g, '/')); return b ? { name: p, buf: b } : null;
  };

  // styles: id → {name, basedOn, b, i, u, outline}
  const styles = {};
  const sb = get('word/styles.xml');
  if (sb) {
    const sroot = parseXml(sb.toString('utf8'));
    const list = (function find(n) { for (const x of nodes(n)) { if (x.n === 'w:styles') return x; const f = find(x); if (f) return f; } return null; })(sroot);
    for (const s of list ? kids(list, 'w:style') : []) {
      const nm = kid(s, 'w:name'); const bo = kid(s, 'w:basedOn');
      const pPr = kid(s, 'w:pPr'); const rPr = kid(s, 'w:rPr');
      styles[s.a['w:styleId']] = { name: nm ? nm.a['w:val'] || '' : '', basedOn: bo ? bo.a['w:val'] : null, rPr, outline: pPr && kid(pPr, 'w:outlineLvl') ? +kid(pPr, 'w:outlineLvl').a['w:val'] + 1 : 0, numPr: pPr ? kid(pPr, 'w:numPr') : null };
    }
  }
  const styleChain = id => { const out = []; let g = 0; while (id && styles[id] && g++ < 12) { out.push(styles[id]); id = styles[id].basedOn; } return out; };
  const headingLevel = id => {
    for (const s of styleChain(id)) {
      const m = /^heading\s*(\d)/i.exec(s.name); if (m) return +m[1];
      if (/^title$/i.test(s.name)) return 0.5;        // above Heading 1
      if (/^subtitle$/i.test(s.name)) return 0.75;
      if (s.outline) return Math.min(6, s.outline);
    }
    return 0;
  };
  // numbering: numId → ilvl → bullet?
  const nums = {}; const abs = {};
  const nb = get('word/numbering.xml');
  if (nb) {
    const nroot = parseXml(nb.toString('utf8'));
    const nl = (function find(n) { for (const x of nodes(n)) { if (x.n === 'w:numbering') return x; const f = find(x); if (f) return f; } return null; })(nroot);
    if (nl) {
      for (const a of kids(nl, 'w:abstractNum')) { const lv = {}; for (const l of kids(a, 'w:lvl')) { const f = kid(l, 'w:numFmt'); lv[+l.a['w:ilvl']] = f ? f.a['w:val'] : 'decimal'; } abs[a.a['w:abstractNumId']] = lv; }
      for (const n of kids(nl, 'w:num')) { const a = kid(n, 'w:abstractNumId'); if (a) nums[n.a['w:numId']] = abs[a.a['w:val']] || {}; }
    }
  }
  const isBullet = (numId, lvl) => { const f = (nums[numId] || {})[lvl]; return f === 'bullet' || f === 'none' || f == null; };

  const flagsOf = rPr => {
    const f = {};
    if (!rPr) return f;
    const on = n => { const x = kid(rPr, n); return x ? !(x.a['w:val'] === '0' || x.a['w:val'] === 'false' || x.a['w:val'] === 'off') : null; };
    const b = on('w:b'); if (b != null) f.b = b;
    const i = on('w:i'); if (i != null) f.i = i;
    const st = on('w:strike'); if (st != null) f.s = st;
    const u = kid(rPr, 'w:u'); if (u) f.u = u.a['w:val'] !== 'none';
    const va = kid(rPr, 'w:vertAlign'); if (va) { f.sup = va.a['w:val'] === 'superscript'; f.sub = va.a['w:val'] === 'subscript'; }
    return f;
  };
  const styleFlags = id => { const f = {}; for (const s of styleChain(id).reverse()) Object.assign(f, flagsOf(s.rPr)); return f; };

  function runs(p, base) {
    let h = '';
    const walk = (n, link) => {
      for (const x of nodes(n)) {
        if (x.n === 'w:r') {
          const rPr = kid(x, 'w:rPr'); const rs = rPr && kid(rPr, 'w:rStyle');
          const f = Object.assign({}, base, rs ? styleFlags(rs.a['w:val']) : {}, flagsOf(rPr));
          let t = '';
          for (const y of nodes(x)) {
            if (y.n === 'w:t' || y.n === 'w:delText') t += esc(y.c.filter(z => typeof z === 'string').join(''));
            else if (y.n === 'w:tab') t += '&emsp;';
            else if (y.n === 'w:br' || y.n === 'w:cr') { if (y.a['w:type'] === 'page') continue; h += wrap(t, f); t = ''; h += '<br>'; }
            else if (y.n === 'w:drawing' || y.n === 'w:pict' || y.n === 'mc:AlternateContent' || y.n === 'w:object') {
              h += wrap(t, f); t = '';
              const found = []; (function find(z) { for (const q of nodes(z)) { if (q.n === 'a:blip' && q.a['r:embed']) found.push([q.a['r:embed'], q]); else if (q.n === 'v:imagedata' && q.a['r:id']) found.push([q.a['r:id'], q]); else if (q.n === 'mc:Fallback') continue; else find(q); } })(y);
              const seen = new Set();
              for (const [rid] of found) { if (seen.has(rid)) continue; seen.add(rid); const mm = media(rid); if (mm) h += picture(mm.name, mm.buf, ctx); else ctx.skippedPics++; }
            }
          }
          const txt = wrap(t, f);
          h += link ? `<a href="${attrEsc(link)}">${txt}</a>` : txt;
        } else if (x.n === 'w:hyperlink') {
          const rid = x.a['r:id']; const url = rid && rels[rid] && rels[rid].ext ? rels[rid].target : null;
          if (url && /^(https?:|mailto:)/i.test(url)) { let inner = ''; const save = h; h = ''; walk(x, null); inner = h; h = save + `<a href="${attrEsc(url)}">${inner}</a>`; } else walk(x, null);
        } else if (['w:ins', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml'].includes(x.n)) walk(x, link);
      }
    };
    walk(p, null);
    return tidy(h);
  }

  const blocks = [];
  let curList = null;      // {items:[{lvl, bullet, html}]} being collected
  const flushList = () => {
    if (!curList) return;
    // build nested ul/ol from [lvl, bullet, html]
    let out = ''; const open = [];
    for (const it of curList) {
      while (open.length > it.lvl + 1) out += `</li></${open.pop()}>`;
      if (open.length === it.lvl + 1) out += '</li>';
      while (open.length < it.lvl + 1) { const tg = it.bullet ? 'ul' : 'ol'; open.push(tg); out += `<${tg}>`; }
      out += `<li>${it.html}`;
    }
    while (open.length) out += `</li></${open.pop()}>`;
    blocks.push({ h: 0, html: out, text: curList.map(i => plainOf(i.html)).join('\n') });
    curList = null;
  };
  const para = (p, inCell) => {
    const pPr = kid(p, 'w:pPr');
    const ps = pPr && kid(pPr, 'w:pStyle'); const sid = ps ? ps.a['w:val'] : null;
    const base = styleFlags(sid);
    const html = runs(p, base);
    let numPr = pPr && kid(pPr, 'w:numPr');
    if (!numPr) for (const s of styleChain(sid)) if (s.numPr) { numPr = s.numPr; break; }
    const lvlN = headingLevel(sid);
    const text = plainOf(html);
    if (!inCell && lvlN && (text || /<img/.test(html))) {
      flushList();
      // a heading's own bold is the style's, not emphasis
      const inner = html.replace(/<\/?b>/g, '');
      if (text) blocks.push({ h: lvlN, html: inner, text }); else blocks.push({ h: 0, html: `<p>${html}</p>`, text: '' });
      return null;
    }
    const nid = numPr && kid(numPr, 'w:numId'); const il = numPr && kid(numPr, 'w:ilvl');
    if (nid && nid.a['w:val'] !== '0') {
      const lvl = il ? +il.a['w:val'] : 0;
      return { list: true, lvl, bullet: isBullet(nid.a['w:val'], lvl), html };
    }
    return { list: false, html, text };
  };
  const cellHtml = tc => {
    const parts = [];
    for (const x of nodes(tc)) {
      if (x.n === 'w:p') { const r = para(x, true); if (r && (r.html || '').trim()) parts.push(r.list ? '&bull; ' + r.html : r.html); }
      else if (x.n === 'w:tbl') parts.push(tableHtml(x));
    }
    return parts.join('<br>');
  };
  const tableHtml = tbl => {
    let o = '<table>';
    for (const tr of kids(tbl, 'w:tr')) {
      o += '<tr>';
      for (const tc of kids(tr, 'w:tc')) {
        const pr = kid(tc, 'w:tcPr'); const gs = pr && kid(pr, 'w:gridSpan'); const vm = pr && kid(pr, 'w:vMerge');
        if (vm && vm.a['w:val'] !== 'restart') { o += '<td></td>'; continue; }
        o += `<td${gs && +gs.a['w:val'] > 1 ? ` colspan="${+gs.a['w:val']}"` : ''}>${cellHtml(tc)}</td>`;
      }
      o += '</tr>';
    }
    return o + '</table>';
  };
  const walkBody = n => {
    for (const x of nodes(n)) {
      if (x.n === 'w:p') {
        const r = para(x, false);
        if (!r) continue;
        if (r.list) {
          if (curList && r.lvl === 0 && curList.some(i => i.lvl === 0 && i.bullet !== r.bullet)) flushList();   // a numbered list after a bulleted one is a new list
          (curList = curList || []).push(r);
        }
        else { flushList(); if (r.html.trim()) blocks.push({ h: 0, html: `<p>${r.html}</p>`, text: r.text }); }
      } else if (x.n === 'w:tbl') { flushList(); const t = tableHtml(x); blocks.push({ h: 0, html: t, text: plainOf(t.replace(/<\/t[dh]>/g, ' | ').replace(/<\/tr>/g, '\n')) }); }
      else if (['w:sdt', 'w:sdtContent', 'w:ins', 'w:customXml'].includes(x.n)) walkBody(x);
    }
  };
  walkBody(body);
  flushList();
  return { blocks, pics: ctx.pics, skippedPics: ctx.skippedPics };
}

/* =================================================================== ODT */
function readOdt(buf) {
  const ents = zip.entries(buf);
  const get = n => { const e = ents.find(x => x.name === n); return e ? zip.extract(buf, e) : null; };
  const cb = get('content.xml');
  if (!cb) throw new Error('this .odt has no content (is it a real OpenDocument file?)');
  const ctx = { pics: 0, skippedPics: 0 };
  const content = parseXml(cb.toString('utf8'));
  const stylesRoot = get('styles.xml') ? parseXml(get('styles.xml').toString('utf8')) : { c: [] };
  const find = (n, name) => { for (const x of nodes(n)) { if (x.n === name) return x; const f = find(x, name); if (f) return f; } return null; };

  // styles: name → {parent, b, i, u, s, sup, sub, display}
  const styles = {}; const listStyles = {};
  const collect = root => {
    for (const grp of ['office:automatic-styles', 'office:styles']) {
      const g = find(root, grp); if (!g) continue;
      for (const s of kids(g, 'style:style')) {
        const tp = kid(s, 'style:text-properties'); const o = { parent: s.a['style:parent-style-name'] || null, display: s.a['style:display-name'] || s.a['style:name'], family: s.a['style:family'] };
        if (tp) {
          if (tp.a['fo:font-weight']) o.b = /bold|[6-9]00/.test(tp.a['fo:font-weight']);
          if (tp.a['fo:font-style']) o.i = /italic|oblique/.test(tp.a['fo:font-style']);
          if (tp.a['style:text-underline-style']) o.u = tp.a['style:text-underline-style'] !== 'none';
          if (tp.a['style:text-line-through-style']) o.s = tp.a['style:text-line-through-style'] !== 'none';
          const pos = tp.a['style:text-position']; if (pos) { o.sup = /^super|^[1-9]/.test(pos); o.sub = /^sub|^-/.test(pos); }
        }
        const pp = kid(s, 'style:paragraph-properties'); if (pp && pp.a['fo:text-align']) o.align = pp.a['fo:text-align'];
        styles[s.a['style:name']] = o;
      }
      for (const l of kids(g, 'text:list-style')) {
        const lv = {}; for (const x of nodes(l)) { const k = +x.a['text:level']; lv[k] = x.n === 'text:list-level-style-bullet' || x.n === 'text:list-level-style-image' ? 'bullet' : 'number'; }
        listStyles[l.a['style:name']] = lv;
      }
    }
  };
  collect(stylesRoot); collect(content);
  const flagsFor = name => { const chain = []; let g = 0; while (name && styles[name] && g++ < 12) { chain.push(styles[name]); name = styles[name].parent; } const f = {}; for (const s of chain.reverse()) for (const k of ['b', 'i', 'u', 's', 'sup', 'sub']) if (s[k] != null) f[k] = s[k]; return f; };
  const rootName = name => { let g = 0; const names = []; while (name && styles[name] && g++ < 12) { names.push(styles[name].display || name); name = styles[name].parent; } return names; };
  const headingOf = name => { for (const nm of rootName(name)) { const m = /^heading[\s_]*(?:20_)?(\d)/i.exec(nm.replace(/_20_/g, ' ')); if (m) return +m[1]; if (/^title$/i.test(nm)) return 0.5; if (/^subtitle$/i.test(nm)) return 0.75; } return 0; };
  const pic = href => { const b = get(href); return b ? picture(href, b, ctx) : ''; };

  function inline(n, base) {
    let h = '';
    for (const x of n.c) {
      if (typeof x === 'string') { h += wrap(esc(x), base); continue; }
      switch (x.n) {
        case 'text:span': h += inline(x, Object.assign({}, base, flagsFor(x.a['text:style-name']))); break;
        case 'text:a': { const href = x.a['xlink:href']; const inner = inline(x, base); h += href && /^(https?:|mailto:)/i.test(href) ? `<a href="${attrEsc(href)}">${inner}</a>` : inner; break; }
        case 'text:s': h += '&nbsp;'.repeat(+(x.a['text:c'] || 1)); break;
        case 'text:tab': h += '&emsp;'; break;
        case 'text:line-break': h += '<br>'; break;
        case 'draw:frame': case 'draw:a': { const im = find(x, 'draw:image'); if (im && im.a['xlink:href'] && !/^(https?:)/i.test(im.a['xlink:href'])) { const p = pic(im.a['xlink:href']); if (p) h += p; else ctx.skippedPics++; } else if (im) ctx.skippedPics++; break; }
        case 'draw:image': { if (x.a['xlink:href']) h += pic(x.a['xlink:href']); break; }
        case 'text:note': case 'text:bookmark': case 'text:bookmark-start': case 'text:bookmark-end': case 'office:annotation': break;
        default: if (/^text:/.test(x.n)) h += inline(x, base);
      }
    }
    return tidy(h);
  }
  const blocks = [];
  const listHtml = (lst, depth, inheritStyle) => {
    const sname = lst.a['text:style-name'] || inheritStyle;
    const kind = (listStyles[sname] || {})[depth + 1] || 'bullet';
    const tg = kind === 'bullet' ? 'ul' : 'ol';
    let o = `<${tg}>`;
    for (const it of kids(lst, 'text:list-item').concat(kids(lst, 'text:list-header'))) {
      o += '<li>';
      let first = true;
      for (const x of nodes(it)) {
        if (x.n === 'text:p' || x.n === 'text:h') { o += (first ? '' : '<br>') + inline(x, flagsFor(x.a['text:style-name'])); first = false; }
        else if (x.n === 'text:list') o += listHtml(x, depth + 1, sname);
      }
      o += '</li>';
    }
    return o + `</${tg}>`;
  };
  const tableHtml = t => {
    let o = '<table>';
    const rows = n => { let r = []; for (const x of nodes(n)) { if (x.n === 'table:table-row') r.push(x); else if (x.n === 'table:table-header-rows' || x.n === 'table:table-row-group') r = r.concat(rows(x)); } return r; };
    for (const tr of rows(t)) {
      o += '<tr>';
      for (const tc of kids(tr, 'table:table-cell')) {
        const sp = +(tc.a['table:number-columns-spanned'] || 1);
        const parts = [];
        for (const x of nodes(tc)) {
          if (x.n === 'text:p' || x.n === 'text:h') { const h = inline(x, flagsFor(x.a['text:style-name'])); if (h) parts.push(h); }
          else if (x.n === 'text:list') parts.push(listHtml(x, 0, null));
          else if (x.n === 'table:table') parts.push(tableHtml(x));
        }
        o += `<td${sp > 1 ? ` colspan="${sp}"` : ''}>${parts.join('<br>')}</td>`;
      }
      o += '</tr>';
    }
    return o + '</table>';
  };
  const walk = n => {
    for (const x of nodes(n)) {
      if (x.n === 'text:h') {
        const lvl = +(x.a['text:outline-level'] || headingOf(x.a['text:style-name']) || 1);
        const h = inline(x, {}); const t = plainOf(h);
        if (t) blocks.push({ h: Math.min(6, Math.max(1, lvl)), html: h, text: t }); else if (/<img/.test(h)) blocks.push({ h: 0, html: `<p>${h}</p>`, text: '' });
      } else if (x.n === 'text:p') {
        const sn = x.a['text:style-name']; const lv = headingOf(sn);
        const h = inline(x, flagsFor(sn)); const t = plainOf(h);
        if (lv && t) blocks.push({ h: lv, html: h.replace(/<\/?b>/g, ''), text: t });
        else if (h.trim()) blocks.push({ h: 0, html: `<p>${h}</p>`, text: t });
      } else if (x.n === 'text:list') { const h = listHtml(x, 0, null); blocks.push({ h: 0, html: h, text: plainOf(h.replace(/<\/li>/g, '\n')) }); }
      else if (x.n === 'table:table') { const t = tableHtml(x); blocks.push({ h: 0, html: t, text: plainOf(t.replace(/<\/td>/g, ' | ').replace(/<\/tr>/g, '\n')) }); }
      else if (['text:section', 'text:tracked-changes'].includes(x.n)) { if (x.n === 'text:section') walk(x); }
    }
  };
  const textBody = find(content, 'office:text');
  if (!textBody) throw new Error('this .odt has no text (it may be a spreadsheet or a presentation)');
  walk(textBody);
  return { blocks, pics: ctx.pics, skippedPics: ctx.skippedPics };
}

/* ============================================================ txt / rtf */
function decodeText(buf) {
  if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return buf.toString('utf8', 3);
  if (buf[0] === 0xFF && buf[1] === 0xFE) return buf.toString('utf16le', 2);
  if (buf[0] === 0xFE && buf[1] === 0xFF) { const sw = Buffer.from(buf.slice(2)); for (let i = 0; i + 1 < sw.length; i += 2) { const t = sw[i]; sw[i] = sw[i + 1]; sw[i + 1] = t; } return sw.toString('utf16le'); }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
/** does this single line look like a title? (short, no sentence ending, a word like Chapter/Part, ALL CAPS, numbered, or Markdown #) */
function titleLine(s, prevBlank, nextBlank) {
  const t = s.trim();
  let m = /^(#{1,6})\s+(.+?)\s*#*$/.exec(t);
  if (m) return { level: m[1].length, text: m[2] };
  if (!t || t.length > 80 || !prevBlank || !nextBlank) return null;
  if (/[.,;:!?)]$/.test(t) && !/^(chapter|part|book|section|lesson)\b/i.test(t)) return null;
  if (/^(chapter|part|book|section|lesson|unit|kabanata|aralin|bahagi|aklat|kapitulo)\b/i.test(t)) return { level: /^(part|book|aklat|bahagi)\b/i.test(t) ? 1 : 2, text: t };
  if (/^[IVXLC]+[.)]\s+\S/.test(t) || /^\d+(\.\d+)*[.)]\s+[A-ZÀ-Þ]/.test(t) && t.length <= 60) return { level: 2, text: t };
  const letters = t.replace(/[^A-Za-zÀ-ɏ]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && t.split(/\s+/).length <= 10) return { level: 1, text: t };
  return null;
}
function readTxt(buf) {
  const text = decodeText(buf).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const hasBlank = lines.some((l, i) => !l.trim() && i > 0 && i < lines.length - 1);
  const blocks = [];
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const joined = hasBlank ? para.map(esc).join('<br>') : esc(para[0]);
    blocks.push({ h: 0, html: `<p>${joined}</p>`, text: para.join(' ').replace(/\s+/g, ' ').trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1].trim();
    const tl = (hasBlank ? (prevBlank && nextBlank) : true) && titleLine(l, prevBlank || !hasBlank, nextBlank || !hasBlank);
    if (tl) { flush(); blocks.push({ h: tl.level, html: esc(tl.text), text: tl.text }); continue; }
    if (hasBlank) para.push(l.trim()); else { para.push(l.trim()); flush(); }
  }
  flush();
  return { blocks, pics: 0, skippedPics: 0 };
}
/** RTF → blocks: the paragraph text keeps bold/italic/underline/pictures; big or bold-only short lines become headings;
 *  hanging-indent lines with a bullet or number become lists. (Tables in RTF arrive as tab-separated lines.) */
function readRtf(buf) {
  const src = buf.toString('latin1');
  if (!isRtf(src)) throw new Error('this does not look like an RTF file');
  const html = rtfToHtml(src, {});
  const paras = html.split(/(?=<p class="rtfp)/).filter(x => /^<p class="rtfp/.test(x) && !/^<p class="rtfp rtf-blank"/.test(x));
  const sizes = [];
  const spanRe = /<span(?: class="[^"]*")?(?: style="([^"]*)")?>([\s\S]*?)<\/span>/g;
  for (const p of paras) { if (/text-indent:-/.test(p)) continue; for (const m of p.matchAll(spanRe)) { if (!plainOf(m[2])) continue; const sz = /font-size:(\d+)%/.exec(m[1] || ''); sizes.push(sz ? +sz[1] : 100); } }
  sizes.sort((a, b) => a - b); const common = sizes[sizes.length >> 1] || 100;
  const blocks = []; let pics = 0;
  const lists = [];
  const render = (p, ignoreSize) => {
    let size = 0, allBold = true, any = false;
    let out = p.replace(/^<p[^>]*>/, '').replace(/<\/p>\s*$/, '');
    out = out.replace(spanRe, (m, st, inner) => {
      st = st || '';
      if (/class="rtftab"/.test(m)) return '&emsp;';
      const t = plainOf(inner);
      const sz = /font-size:(\d+)%/.exec(st); if (sz && t) size = Math.max(size, +sz[1]);
      const f = { b: /font-weight:\s*bold/.test(st), i: /font-style:\s*italic/.test(st), u: /text-decoration:[^;]*underline/.test(st), s: /line-through/.test(st) };
      if (t) { any = true; if (!f.b) allBold = false; }
      return wrap(inner, f);
    });
    return { out: tidy(out), size: ignoreSize ? 0 : size, allBold: allBold && any };
  };
  for (const p of paras) {
    const hang = /text-indent:-/.test(p) && /rtftab/.test(p);
    const r = render(p, hang);
    r.out = r.out.replace(/(&emsp;)+$/, '');
    const text = plainOf(r.out);
    const imgs = (r.out.match(/<img /g) || []).length; pics += imgs;
    if (!text && !imgs) continue;
    if (hang) {
      const i = r.out.indexOf('&emsp;'); const marker = plainOf(r.out.slice(0, i)); const rest = r.out.slice(i + 6);
      const num = /^\(?([0-9]+|[a-zA-Z]|[ivxlcIVXLC]+)[.)]$/.test(marker) && !/^[•·▪◦o]$/.test(marker);
      blocks.push({ h: 0, list: num ? 'ol' : 'ul', item: rest, html: '', text: plainOf(rest) });
      continue;
    }
    const big = r.size && r.size >= common * 1.25;
    if (text && !imgs && text.length <= 90 && !/[.;,]$/.test(text) && (big || r.allBold)) {
      blocks.push({ h: r.size >= common * 1.8 ? 1 : big ? 2 : 3, html: r.out.replace(/<\/?b>/g, ''), text });
    } else blocks.push({ h: 0, html: `<p>${r.out}</p>`, text });
  }
  // neighbouring list items become one list
  const merged = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (b.list) {
      if (last && last.list === b.list && last.items) { last.items.push(b.item); last.text += '\n' + b.text; }
      else merged.push({ h: 0, list: b.list, items: [b.item], text: b.text });
    } else merged.push(b);
  }
  for (const b of merged) if (b.items) { b.html = `<${b.list}>${b.items.map(i => `<li>${i}</li>`).join('')}</${b.list}>`; delete b.items; delete b.list; }
  return { blocks: merged, pics, skippedPics: 0 };
}

/* ---------------------------------------------------------------- public */
function read(file) {
  const buf = fs.readFileSync(file);
  const ext = (/\.([a-z]+)$/i.exec(file) || [])[1] || '';
  let r;
  if (/^docx$/i.test(ext)) r = readDocx(buf);
  else if (/^odt$/i.test(ext)) r = readOdt(buf);
  else if (/^rtf$/i.test(ext)) r = readRtf(buf);
  else r = readTxt(buf);
  // a .rtf or .txt that is really another type of file is read by its content
  r.words = r.blocks.reduce((n, b) => n + (b.text ? b.text.split(/\s+/).filter(Boolean).length : 0), 0);
  r.headings = r.blocks.filter(b => b.h).length;
  return r;
}

module.exports = { read, DOC_RE, parseXml, decodeText, plainOf };
