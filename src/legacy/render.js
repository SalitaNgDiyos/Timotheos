'use strict';
// theWord verse markup -> HTML.  Works in the browser (window.TWRender) and in Node (module.exports).
(function (root) {
  const NAMED_TOGGLES = { footnotes: 'footnotes', xrefs: 'footnotes', strong: 'strongs', strongs: 'strongs', morph: 'morph', woj: 'woj', added: 'added', headings: 'headings', cmts: 'footnotes' };

  function toggleOn(name, show) {
    if (!name) return true;
    const neg = name[0] === '^'; const n = neg ? name.slice(1) : name;
    const key = NAMED_TOGGLES[n.toLowerCase()];
    let on = key ? !!show[key] : (show.custom && n in show.custom ? !!show.custom[n] : true);
    return neg ? !on : on;
  }

  const ruleCache = new WeakMap();
  function compile(mod) {
    if (ruleCache.has(mod)) return ruleCache.get(mod);
    const out = [];
    for (const raw of mod.rules || []) {
      const args = parseQuoted(raw);
      if (args.length < 2) continue;
      let [pat, rep, ...opts] = args;
      const o = opts.join(' ');
      const toggle = (o.match(/toggle=(\^?[\w]+)/) || [])[1] || null;
      pat = pat.replace(/\(\?>/g, '(?:').replace(/([*+?}])\+/g, '$1');
      rep = rep.replace(/\\(\d)/g, '$$$1');
      let re = null;
      try { re = new RegExp(pat, 'g'); } catch (e) { try { re = new RegExp(pat, 'gu'); } catch (e2) { re = null; } }
      if (re) out.push({ re, rep, toggle });
    }
    ruleCache.set(mod, out);
    return out;
  }
  function parseQuoted(s) {
    const out = []; let i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      if (s[i] === '"') {
        let j = i + 1, b = '';
        while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { b += '"'; j += 2; continue; } break; } b += s[j++]; }
        out.push(b); i = j + 1;
      } else { let j = i; while (j < s.length && !/\s/.test(s[j])) j++; out.push(s.slice(i, j)); i = j; }
    }
    return out;
  }

  function attr(tag, name) {
    const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|([^\\s>]+))', 'i').exec(tag);
    return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
  }
  const esc = s => String(s).replace(/&(?![#\w]+;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /** parse href metadata like _STRONG_G976|_MORPH_N-NSF|_LEMMA_βίβλος|_NOLINK_ */
  function hrefMeta(href) {
    const meta = {}; let nolink = false; let target = [];
    for (const part of href.split('|')) {
      const m = /^_(STRONG\d?|MORPH\d?|LEMMA|ORIGWORD|LEMHOM)_(.*)$/.exec(part);
      if (m) { (meta[m[1]] = meta[m[1]] || []).push(m[2]); continue; }
      if (part === '_NOLINK_') { nolink = true; continue; }
      if (part === '_IGNORE_' || part === '_AUTODETECT_' || part === '') continue;
      target.push(part);
    }
    return { meta, nolink, target: target.join('|') };
  }

  /**
   * @param raw  verse text
   * @param mod  {rules:[...]}
   * @param show {strongs, morph, footnotes, headings, woj, added, custom:{}}
   * @param ctx  {fnCounter:{n}}  shared footnote counter
   */
  function render(raw, mod, show, ctx = { fn: { n: 0 } }) {
    if (raw == null) return '';
    if (raw.startsWith('<_HTML_>')) { // e-Sword / book-module text: already HTML; apply the view toggles
      let h = raw.slice(8);
      if (!show.strongs) h = h.replace(/class="strong"/g, 'class="strong hide"');
      if (!show.morph) h = h.replace(/class="morph"/g, 'class="morph hide"');
      if (!show.woj) h = h.replace(/class="woj"/g, 'class="woj plain"');
      if (!show.footnotes) h = h.replace(/<sup class="fn"[^>]*>[^<]*<\/sup>/g, '');
      if (!show.headings) h = h.replace(/<span class="heading[^"]*">[^<]*<\/span>/g, '');
      return h;
    }
    let s = raw;
    for (const r of compile(mod)) if (toggleOn(r.toggle, show)) { try { s = s.replace(r.re, r.rep); } catch (e) { /* bad rule */ } }
    s = s.replace(/<_CM>/g, '');

    const toks = s.match(/<[^>]*>|[^<]+/g) || [];
    // paragraphs: [{cls, pi, pf, html}]
    const paras = [{ cls: 'first', pi: null, pf: null, html: '' }];
    let cur = paras[0];
    const inline = []; // open inline elements: {open, close}
    const owners = []; let lastText = null;
    const emit = h => { cur.html += h; };
    const pushInline = (open, close) => { inline.push({ open, close }); emit(open); };
    const popInline = () => { const e = inline.pop(); if (e) emit(e.close); };
    const newPara = cls => {
      for (let i = inline.length - 1; i >= 0; i--) emit(inline[i].close);
      cur = { cls, pi: null, pf: null, html: '' }; paras.push(cur);
      for (const e of inline) emit(e.open);
      lastText = null;
    };
    const ownerFor = () => {
      if (!lastText || lastText.para !== cur) return null;
      if (lastText.owner) return lastText.owner;
      const seg = cur.html.slice(lastText.start);
      const m = /(\S+)$/.exec(seg);
      if (!m) return null;
      const w = m[1].replace(/[,.;:!?·"“”'’)\]]+$/, '');
      if (!w) return null;
      const pos = cur.html.length - m[1].length;
      const o = { id: owners.length, strong: [], morph: [], lemma: null };
      owners.push(o);
      cur.html = cur.html.slice(0, pos) + `<span class="word" data-owner="${o.id}">` + w + '</span>' + m[1].slice(w.length);
      lastText.owner = o;
      return o;
    };

    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t[0] !== '<') { lastText = { start: cur.html.length, para: cur }; emit(t); continue; }
      if (!/^<W[GHT]/.test(t)) lastText = null;
      if (/^<RF\b/.test(t)) {
        let body = ''; k++;
        while (k < toks.length && toks[k] !== '<Rf>') body += toks[k++];
        if (show.footnotes) { const q = attr(t, 'q'); const n = ++ctx.fn.n; emit(`<sup class="fn"${q ? ` data-q="${esc(q)}"` : ''} data-note="${esc(body)}">${esc(q || n)}</sup>`); }
        continue;
      }
      if (/^<TS\d?>/.test(t)) {
        let body = ''; k++;
        while (k < toks.length && toks[k] !== '<Ts>') body += toks[k++];
        const lvl = (/^<TS(\d)/.exec(t) || [])[1] || '1';
        if (show.headings) { if (cur.html.replace(/<[^>]*>/g, '').trim()) newPara('ci'); emit(`<span class="heading h${lvl}">${body.replace(/<[^>]*>/g, '')}</span>`); newPara('ci'); }
        continue;
      }
      if (/^<R[Xx]\s/.test(t)) {
        const ref = t.slice(4, -1).trim().split(/\s+/)[0];
        if (show.footnotes) emit(`<sup class="xref" data-xref="${esc(ref)}">${esc(attr(t, 'q') || '+')}</sup>`);
        continue;
      }
      const sm = /^<W([GH])(\d+)([sx]?)>$/.exec(t);
      if (sm) {
        const code = sm[1] + sm[2];
        const ow = ownerFor(); if (ow) ow.strong.push(code);
        emit(`<sup class="strong${show.strongs ? '' : ' hide'}${sm[3] ? ' strong-' + sm[3] : ''}" data-strong="${code}">${code}</sup>`);
        lastText = lastText || null; continue;
      }
      if (/^<WT/.test(t)) {
        const code = (/^<WT([^\s>]+)/.exec(t) || [])[1] || '';
        const lemma = attr(t, 'l');
        const ow = ownerFor(); if (ow) { ow.morph.push(code); if (lemma && !ow.lemma) ow.lemma = lemma; }
        emit(`<sup class="morph${show.morph ? '' : ' hide'}" data-morph="${esc(code)}"${lemma ? ` data-lemma="${esc(lemma)}"` : ''}>${esc(code)}</sup>`);
        continue;
      }
      switch (t) {
        case '<FI>': pushInline(`<span class="added${show.added ? '' : ' plain'}">`, '</span>'); continue;
        case '<FR>': pushInline(`<span class="woj${show.woj ? '' : ' plain'}">`, '</span>'); continue;
        case '<FO>': pushInline('<span class="otq">', '</span>'); continue;
        case '<FU>': pushInline('<span class="u">', '</span>'); continue;
        case '<Fi>': case '<Fr>': case '<Fo>': case '<Fu>': popInline(); continue;
        case '<CL>': emit('<br>'); continue;
        case '<CM>': newPara('cm'); continue;
        case '<CI>': newPara('ci'); continue;
        case '<v>': pushInline('<span class="variant">', '</span>'); continue;
        case '</v>': popInline(); continue;
        case '<wt>': case '<Q>': case '<q>': case '<E>': case '<e>': case '<T>': case '<t>': case '<_MORPH_>':
        case '<NB>': case '<Nb>': case '<ST>': case '<St>': continue;
      }
      let m;
      // switchable text: <NB toggle=name>…<Nb>, <ST toggle=name>…<St> – hidden while the module's switch is off
      if (/^<(NB|ST)\s/.test(t)) {
        const tg = attr(t, 'toggle'); const close = t.startsWith('<NB') ? '<Nb>' : '<St>';
        if (tg && !toggleOn(tg, show)) { let depth = 0; k++; while (k < toks.length && !(toks[k] === close && depth === 0)) { if (toks[k].startsWith(t.slice(0, 3))) depth++; else if (toks[k] === close) depth--; k++; } }
        continue;
      }
      if ((m = /^<PI(\d?)>$/.exec(t)) || t === '<Pi>') { const lvl = t === '<Pi>' ? 0 : (m[1] === '' ? 1 : +m[1]); if (cur.html.replace(/<[^>]*>/g, '').trim()) newPara('pi'); cur.pi = lvl ? 20 + 20 * lvl : 0; continue; }
      if ((m = /^<PF(\d?)>$/.exec(t)) || t === '<Pf>') { const lvl = t === '<Pf>' ? 0 : (m[1] === '' ? 1 : +m[1]); cur.pf = 20 * lvl; continue; }
      if (/^<a\s/i.test(t)) {
        const href = attr(t, 'href') || '';
        const { meta, nolink, target } = hrefMeta(href);
        const data = [];
        const st = [].concat(meta.STRONG || [], meta.STRONG2 || [], meta.STRONG3 || [], meta.STRONG4 || [], meta.STRONG5 || [], meta.STRONG6 || []).filter(Boolean);
        const mo = [].concat(meta.MORPH || [], meta.MORPH2 || [], meta.MORPH3 || []).filter(Boolean);
        if (st.length) data.push(`data-strong="${esc(st.join(' '))}"`);
        if (mo.length) data.push(`data-morph="${esc(mo.join(' '))}"`);
        if (meta.LEMMA && meta.LEMMA[0]) data.push(`data-lemma="${esc(meta.LEMMA[0])}"`);
        if (nolink || !target) pushInline(`<span class="word"${data.length ? ' ' + data.join(' ') : ''}>`, '</span>');
        else pushInline(`<a class="link" data-href="${esc(target)}"${data.length ? ' ' + data.join(' ') : ''}>`, '</a>');
        continue;
      }
      if (/^<\/a>$/i.test(t)) { popInline(); continue; }
      if (/^<(b|i|u|s|sup|sub|em|strong|small|big)\b[^>]*>$/i.test(t)) { const n = /^<(\w+)/.exec(t)[1].toLowerCase(); pushInline(`<${n}>`, `</${n}>`); continue; }
      if (/^<\/(b|i|u|s|sup|sub|em|strong|small|big)>$/i.test(t)) { popInline(); continue; }
      if (/^<br\s*\/?>$/i.test(t)) { emit('<br>'); continue; }
      if (/^<p\b[^>]*>$/i.test(t)) { newPara('cm'); continue; }
      if (/^<\/p>$/i.test(t)) continue;
      if (/^<font\b/i.test(t)) {
        const color = attr(t, 'color'); const size = attr(t, 'size'); const face = attr(t, 'face');
        const st = [];
        if (color) st.push('color:' + (/^[0-9a-f]{6}$/i.test(color) ? '#' + color : color.replace(/[^#\w(),.\s]/g, '')));
        if (size) { const n = parseInt(size, 10) || 0; st.push('font-size:' + (size[0] === '+' ? 100 + 15 * n : size[0] === '-' ? 100 - 12 * Math.abs(n) : 100) + '%'); }
        if (face && !/^\[/.test(face)) st.push(`font-family:'${face.replace(/'/g, '')}'`);
        pushInline(`<span style="${st.join(';')}">`, '</span>'); continue;
      }
      if (/^<\/font>$/i.test(t)) { popInline(); continue; }
      if (/^<span\b/i.test(t)) { const st = attr(t, 'style') || ''; pushInline(`<span style="${esc(st.replace(/[^\w\s:;#%().,-]/g, ''))}">`, '</span>'); continue; }
      if (/^<\/span>$/i.test(t)) { popInline(); continue; }
      if (/^<(rtl|ltr)>$/i.test(t)) { pushInline(`<span dir="${t.slice(1, 4).toLowerCase()}">`, '</span>'); continue; }
      if (/^<\/(rtl|ltr)>$/i.test(t)) { popInline(); continue; }
      // unknown theWord tag: ignore
    }
    for (let i = inline.length - 1; i >= 0; i--) emit(inline[i].close);

    let out = '';
    for (const p of paras) {
      if (!p.html.replace(/<[^>]*>/g, '').trim() && !/class="(fn|xref|heading)/.test(p.html)) continue; // empty paragraph
      const st = [];
      if (p.pi) st.push(`margin-left:${p.pi}px`);
      if (p.pf) st.push(`text-indent:${p.pf}px`);
      const block = p !== paras[0] || p.pi || p.pf;
      out += block ? `<span class="para ${p.cls}"${st.length ? ` style="${st.join(';')}"` : ''}>${p.html}</span>` : p.html;
    }
    if (owners.length) out = out.replace(/data-owner="(\d+)"/g, (m, i) => {
      const o = owners[+i]; const a = [];
      if (o.strong.length) a.push(`data-strong="${o.strong.join(' ')}"`);
      if (o.morph.length) a.push(`data-morph="${esc(o.morph.join(' '))}"`);
      if (o.lemma) a.push(`data-lemma="${esc(o.lemma)}"`);
      return a.join(' ');
    });
    return out;
  }

  /** the module's own switches: toggle names in its rules that are not the standard ones */
  function customToggles(mod) {
    const out = new Set();
    for (const r of compile(mod)) {
      for (const t of [r.toggle, ...(String(r.rep).match(/toggle\s*=\s*"?\^?[\w]+/g) || []).map(x => x.replace(/^toggle\s*=\s*"?/, ''))]) { if (!t) continue; const n = t.replace(/^\^/, ''); if (!NAMED_TOGGLES[n.toLowerCase()]) out.add(n); }
    }
    return [...out];
  }
  const api = { render, hrefMeta, toggleOn, customToggles };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
