'use strict';
/* Tools (0.4.8+): picture viewer, clipboard monitor, export of topics (with Word styles.xml),
 * your own marks in books, printing a topic. */
/* global api, state, save, esc, go, TWRender, TanglawModules, TanglawStudy, TanglawIcons */
(function () {
  const $ = s => document.querySelector(s);
  const flash = m => TanglawStudy.flash(m);
  const icon = (n, s) => TanglawIcons.icon(n, s);

  /* ------------------------------------------------------------ picture viewer */
  let imgs = [], at = 0, zoom = 1, fit = true, px = 0, py = 0, caption = '';
  function openImage(img) {
    const scope = img.closest('.entry, #popup') || document.body;
    imgs = [...scope.querySelectorAll('img')].filter(i => i.src); at = Math.max(0, imgs.indexOf(img));
    const h4 = scope.querySelector('h4'), src = scope.querySelector('.src');
    caption = [src && src.textContent, h4 && h4.textContent.replace(/Find \S+$/, '')].filter(Boolean).join(' – ');
    let v = $('#gview');
    if (!v) {
      v = document.createElement('div'); v.id = 'gview'; v.className = 'gview';
      v.innerHTML = `<div class="gbar"><button class="tb" data-g="prev" title="Previous picture (←)">${icon('prev', 16)}</button><button class="tb" data-g="next" title="Next picture (→)">${icon('next', 16)}</button>
        <button class="tb" data-g="out" title="Smaller (mouse wheel)">−</button><select class="gzoom" title="Zoom"><option value="fit">Fit</option><option value="0.5">50%</option><option value="1">100%</option><option value="2">200%</option><option value="4">400%</option></select><button class="tb" data-g="in" title="Larger (mouse wheel)">+</button>
        <span class="gcap small"></span><button class="tb" data-g="close" title="Close (Esc)">${icon('close', 16)}</button></div><div class="gstage"><img class="gimg" alt=""></div>`;
      document.body.appendChild(v); wireViewer(v);
    }
    v.classList.remove('hidden'); fit = true; showImg();
  }
  function showImg() {
    const v = $('#gview'), im = v.querySelector('.gimg'), src = imgs[at]; if (!src) return;
    im.src = src.src; px = py = 0;
    v.querySelector('.gcap').textContent = `${caption}${imgs.length > 1 ? ` (${at + 1} of ${imgs.length})` : ''}`;
    const apply = () => { if (fit) { const st = v.querySelector('.gstage'); zoom = Math.min(1, st.clientWidth / (im.naturalWidth || 1), st.clientHeight / (im.naturalHeight || 1)) || 1; } place(); };
    if (im.complete) apply(); else im.onload = apply;
  }
  function place() {
    const v = $('#gview'), im = v.querySelector('.gimg');
    im.style.width = Math.round((im.naturalWidth || 100) * zoom) + 'px'; im.style.transform = `translate(${px}px, ${py}px)`;
    const z = v.querySelector('.gzoom'); z.value = fit ? 'fit' : String(zoom); if (z.selectedIndex < 0) z.options[z.options.length - 1].text = Math.round(zoom * 100) + '%';
  }
  const closeViewer = () => { const v = $('#gview'); if (v) v.classList.add('hidden'); };
  function wireViewer(v) {
    v.addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) { if (e.target === v) closeViewer(); return; }
      const g = b.dataset.g;
      if (g === 'close') closeViewer();
      if (g === 'prev' && imgs.length > 1) { at = (at - 1 + imgs.length) % imgs.length; fit = true; showImg(); }
      if (g === 'next' && imgs.length > 1) { at = (at + 1) % imgs.length; fit = true; showImg(); }
      if (g === 'in' || g === 'out') { fit = false; zoom = Math.max(0.05, Math.min(16, zoom * (g === 'in' ? 1.25 : 0.8))); place(); }
    });
    v.querySelector('.gzoom').onchange = e => { const val = e.target.value; if (val === 'fit') { fit = true; showImg(); } else { fit = false; zoom = +val; place(); } };
    const st = v.querySelector('.gstage');
    st.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); fit = false; zoom = Math.max(0.05, Math.min(16, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); place(); }, { passive: false });
    st.addEventListener('pointerdown', e => {
      const x0 = e.clientX - px, y0 = e.clientY - py; st.setPointerCapture(e.pointerId); st.classList.add('drag');
      const mv = ev => { px = ev.clientX - x0; py = ev.clientY - y0; place(); };
      const up = () => { st.removeEventListener('pointermove', mv); st.removeEventListener('pointerup', up); st.classList.remove('drag'); };
      st.addEventListener('pointermove', mv); st.addEventListener('pointerup', up);
    });
    document.addEventListener('keydown', e => {
      if (v.classList.contains('hidden')) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeViewer(); }
      else if (e.key === 'ArrowRight' && imgs.length > 1) { e.stopPropagation(); e.preventDefault(); at = (at + 1) % imgs.length; fit = true; showImg(); }
      else if (e.key === 'ArrowLeft' && imgs.length > 1) { e.stopPropagation(); e.preventDefault(); at = (at - 1 + imgs.length) % imgs.length; fit = true; showImg(); }
    }, true);
  }

  /* ------------------------------------------------------------ clipboard monitor */
  const ccfg = () => (state.settings.clipmon = Object.assign({}, state.settings.clipmon || {}));
  let timer = 0, lastSeen = null, refs = [], reader = () => api.clipRead(), myCopy = '';
  function setClipmon(on) { const c = ccfg(); c.on = on; save({ clipmon: c }); if (on) startClip(); else stopClip(); flash(on ? 'Clipboard monitor on: copy text with Bible references in any program' : 'Clipboard monitor off'); syncMenu(); }
  function startClip() { stopClip(); lastSeen = null; timer = setInterval(poll, 1200); poll(); }
  function stopClip() { clearInterval(timer); timer = 0; }
  async function poll() {
    let t = ''; try { t = (await reader()) || ''; } catch (e) { return; }
    if (lastSeen === null) { lastSeen = t; return; }
    if (t === lastSeen) return; lastSeen = t;
    if (!t.trim() || t === myCopy) return;
    const found = await api.findRefs(t).catch(() => []); if (!found.length) return;
    refs = found.slice(0, 60); await renderClip();
  }
  async function renderClip() {
    let box = $('#clipwin');
    if (!box) { box = document.createElement('div'); box.id = 'clipwin'; box.className = 'clipwin'; document.body.appendChild(box); wireClip(box); }
    const all = state.modules.bibles; const c = ccfg();
    const id = (all.find(b => b.id === c.bible) || {}).id || state.settings.openBibles[0] || (all[0] || {}).id;
    let inf = state.infos.get(id); if (!inf && id) { try { inf = await api.bibleInfo(id); state.infos.set(id, inf); } catch (e) { /* none */ } }
    const show = Object.assign({}, state.settings.show, { strongs: false, morph: false, footnotes: false });
    let body = '';
    for (const r of refs) {
      let txt = '';
      if (id) { const d = await api.chapter([id], r.b, r.c).catch(() => null); const rows = d ? d.rows.filter(x => x.v >= r.v && x.v <= (r.v2 || r.v) && x.cells[0] != null) : []; txt = rows.map(x => `${rows.length > 1 ? `<sup>${x.v}</sup>` : ''}${TWRender.render(x.cells[0], inf || { rules: [] }, show)}`).join(' '); }
      body += `<div class="cref" data-go="${r.b}.${r.c}.${r.v}"><a class="cgo">${esc(r.label)}</a> <span>${txt || '<span class="small">(not in this Bible)</span>'}</span></div>`;
    }
    box.innerHTML = `<div class="clcap"><b>Clipboard: ${refs.length} reference${refs.length === 1 ? '' : 's'}</b><select class="cbible" title="Bible">${all.map(b => `<option value="${esc(b.id)}"${b.id === id ? ' selected' : ''}>${esc((state.infos.get(b.id) || {}).abbr || b.abbr)}</option>`).join('')}</select>
      <button class="tb clist" title="Add all to the current verse list">+ List</button><label class="small" title="Bring Tanglaw to the front when references are copied"><input type="checkbox" class="cfront"${c.front ? ' checked' : ''}> to front</label><button class="tb cclose" title="Close (the monitor stays on)">×</button></div><div class="cbody">${body}</div>`;
    box.classList.remove('hidden');
    if (c.front) api.appCmd('front').catch(() => {});
  }
  function wireClip(box) {
    box.addEventListener('click', e => {
      if (e.target.closest('.cclose')) { box.classList.add('hidden'); return; }
      if (e.target.closest('.clist')) { TanglawStudy.addToList(refs.map(r => ({ b: r.b, c: r.c, v: r.v, v2: r.v2 }))); return; }
      const g = e.target.closest('.cgo') && e.target.closest('[data-go]'); if (g) { const [b, c, v] = g.dataset.go.split('.').map(Number); go({ b, c, v }); }
    });
    box.addEventListener('change', e => {
      const c = ccfg();
      if (e.target.matches('.cbible')) { c.bible = e.target.value; save({ clipmon: c }); renderClip(); }
      if (e.target.matches('.cfront')) { c.front = e.target.checked; save({ clipmon: c }); }
    });
    box.addEventListener('pointerdown', e => {
      if (!e.target.closest('.clcap') || e.target.closest('select, button, input, label')) return;
      const r = box.getBoundingClientRect(); const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = ev => { box.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + 'px'; box.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; };
      const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    });
  }

  /* ------------------------------------------------------------ export of topics */
  function blocks(html) {
    const t = document.createElement('template'); t.innerHTML = html; const out = []; let cur = { kind: 'p', runs: [] };
    const flush = () => { if (cur.runs.some(r => r.t.trim() || r.anchor)) out.push(cur); cur = { kind: 'p', runs: [] }; };
    const walk = (n, f) => {
      if (n.nodeType === 3) { const s = (n.textContent || '').replace(/\s+/g, ' '); if (s) cur.runs.push(Object.assign({ t: s }, f)); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase(); if (tag === 'script' || tag === 'style') return;
      const block = /^(p|div|li|h[1-6]|tr|blockquote|section)$/.test(tag);
      if (tag === 'br') { flush(); return; }
      if (block) flush();
      if (/^h[1-6]$/.test(tag)) cur.kind = tag === 'h1' || tag === 'h2' ? 'h1' : 'h2';
      if (tag === 'li') cur.kind = 'li';
      if (tag === 'a' && (n.id || '').startsWith('bkm:')) cur.runs.push({ t: '', anchor: n.id.slice(4) });
      if (n.classList.contains('hide')) return;
      const st = n.getAttribute('style') || '';
      const href = tag === 'a' ? (n.dataset.href || n.getAttribute('href') || undefined) : f.href;
      const g = { b: f.b || /^(b|strong|h\d)$/.test(tag) || /font-weight:\s*(bold|[6-9]00)/.test(st), i: f.i || /^(i|em)$/.test(tag) || /font-style:\s*italic/.test(st), u: f.u || tag === 'u' || /underline/.test(st), sup: f.sup || tag === 'sup' || /vertical-align:\s*super/.test(st), href };
      for (const c of [...n.childNodes]) walk(c, g);
      if (block) flush();
    };
    for (const c of [...t.content.childNodes]) walk(c, {});
    flush(); return out;
  }
  const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // [F3] Include word/styles.xml, document.xml.rels, and w:rFonts for Microsoft Word compatibility
  function docxFiles(blks) {
    const run = (r, size) => `<w:r><w:rPr><w:rFonts w:ascii="Gentium Plus" w:hAnsi="Gentium Plus" w:cs="Noto Serif Hebrew"/>${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.u ? '<w:u w:val="single"/>' : ''}${r.sup ? '<w:vertAlign w:val="superscript"/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(r.t)}</w:t></w:r>`;
    blks = blks.map(b => b.kind === 'li' ? { kind: 'p', runs: [{ t: '• ' }, ...b.runs] } : b);
    const body = blks.map(b => `<w:p>${b.kind === 'p' ? '<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr>' : `<w:pPr><w:pStyle w:val="${b.kind === 'h1' ? 'Heading1' : 'Heading2'}"/><w:spacing w:before="240" w:after="120"/><w:keepNext/></w:pPr>`}${b.runs.map(r => run(b.kind === 'p' ? r : Object.assign({}, r, { b: true }), b.kind === 'h1' ? 32 : b.kind === 'h2' ? 26 : 24)).join('')}</w:p>`).join('');
    return {
      '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
      'word/_rels/document.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
      'word/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Gentium Plus" w:hAnsi="Gentium Plus" w:cs="Noto Serif Hebrew"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>',
      'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`,
    };
  }
  function rtfText(s) { let o = ''; for (const ch of s) { const c = ch.codePointAt(0); if (ch === '\\' || ch === '{' || ch === '}') o += '\\' + ch; else if (c < 128) o += ch; else if (c < 0x10000) o += `\\u${c > 32767 ? c - 65536 : c}?`; else { const h = Math.floor((c - 0x10000) / 0x400) + 0xd800, l = ((c - 0x10000) % 0x400) + 0xdc00; o += `\\u${h - 65536}?\\u${l - 65536}?`; } } return o; }
  function rtfRun(r) {
    if (r.anchor) return `{\\*\\bkmkstart ${rtfText(r.anchor)}}{\\*\\bkmkend ${rtfText(r.anchor)}}`;
    const fl = `${r.b ? '\\b' : ''}${r.i ? '\\i' : ''}${r.u ? '\\ul' : ''}${r.sup ? '\\super' : ''}`;
    const fmt = `{${fl}${fl ? ' ' : ''}${rtfText(r.t)}}`;
    return r.href ? `{\\field{\\*\\fldinst HYPERLINK "${rtfText(r.href)}"}{\\fldrslt ${fmt}}}` : fmt;
  }
  function rtf(blks, size = 24) {
    const merge = runs => { const o = []; for (const r of runs) { const l = o[o.length - 1]; if (l && r.href && l.href === r.href && !!l.b === !!r.b && !!l.i === !!r.i && !!l.u === !!r.u && !!l.sup === !!r.sup) l.t += r.t; else o.push(Object.assign({}, r)); } return o; };
    return `{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\froman Gentium Plus;}}\\f0\\fs${size}\n` + blks.map(b => (b.kind === 'h1' || b.kind === 'h2' ? `\\sb240\\sa120\\b\\fs${b.kind === 'h1' ? 32 : 26} ` : b.kind === 'li' ? '{\\pntext \\u8226?\\tab}' : '') + merge(b.runs).map(rtfRun).join('') + (b.kind === 'h1' || b.kind === 'h2' ? `\\b0\\fs${size}\\sb0\\sa0` : '') + '\\par\n').join('') + '}';
  }
  /** export the open topic, or every topic of the module */
  async function exportTopics() {
    const id = TanglawModules.lib.cur; if (!id) return flash('Open a module in the Library first');
    const info = (state.modules.books || []).find(b => b.id === id) || {}; const curLi = $('#libTopics li.cur');
    const r = await TanglawModules.modal('Export topics', `<p>From <b>${esc(info.title || info.name || '')}</b></p>
      <label class="field">What <select id="exW"><option value="one">The open topic${curLi ? ': ' + esc(curLi.textContent.trim().slice(0, 50)) : ''}</option><option value="all">All ${TanglawModules.lib.topics.length} topics of the module</option></select></label>
      <label class="field">Format <select id="exF"><option value="docx">Word document (.docx)</option><option value="rtf">Rich Text (.rtf)</option><option value="html">Web page (.html)</option><option value="txt">Plain text (.txt)</option></select></label>
      <label><input type="checkbox" id="exT" checked> Topic titles as headings</label>
      <p class="small">Locked (encrypted) modules are never read, so they cannot be exported.</p>`, [{ label: 'Cancel', value: null }, { label: 'Export…', value: 'ok', primary: true }]);
    const what = ($('#exW') || {}).value, fmt = ($('#exF') || {}).value || 'docx', titles = ($('#exT') || {}).checked !== false;
    if (r !== 'ok') return;
    const tids = what === 'all' ? TanglawModules.lib.topics.map(t => t.id) : [curLi ? (isNaN(+curLi.dataset.tid) ? curLi.dataset.tid : +curLi.dataset.tid) : null].filter(x => x != null);
    if (!tids.length) return flash('Open a topic first');
    let html = '', first = '', n = 0;
    for (const tid of tids) { const t = await api.bookTopic(id, tid).catch(() => null); if (!t) continue; n++; if (!first) first = t.subject; html += (titles ? `<h2>${esc(t.subject)}</h2>` : '') + `<div>${window.sanitize ? sanitize(t.html) : t.html}</div>`; if (n % 50 === 0) flash(`Reading ${n} of ${tids.length}…`); }
    const base = (tids.length > 1 ? info.title || 'topics' : `${info.abbr || info.title} - ${first}`).replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
    const data = fmt === 'docx' ? docxFiles(blocks(html)) : fmt === 'rtf' ? rtf(blocks(html))
      : fmt === 'html' ? `<!doctype html><html><head><meta charset="utf-8"><title>${esc(base)}</title><style>body{font:16px/1.6 'Gentium Plus',Georgia,serif;max-width:46em;margin:2em auto;padding:0 1em}h1{font-size:1.5em}h2{font-size:1.2em;margin-top:1.6em}</style></head><body>${html.replace(/ data-[\w-]+="[^"]*"/g, '')}</body></html>`
      : blocks(html).map(b => (b.kind === 'p' ? '' : '\n') + b.runs.map(x => x.t).join('').trim()).join('\n') + '\n';
    try { const p = await api.exportSave(`${base}.${fmt}`, fmt, data); if (p) flash(`Exported ${n} topic${n === 1 ? '' : 's'} to ${p.split(/[\\/]/).pop()}`); }
    catch (e) { flash('Could not save: ' + e.message); }
  }

  /* ------------------------------------------------------------ your own marks in books */
  const STYLES = ['yellow', 'green', 'blue', 'pink', 'orange', 'bold', 'ul'];
  const store = () => (TanglawStudy.study.ud.bookMarks = TanglawStudy.study.ud.bookMarks || {});
  const saveMarks = () => api.setUserData('bookMarks', store()).catch(() => {});
  const textNodes = el => { const out = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) out.push(n); return out; };
  const orig = new WeakMap();
  /** the body of a topic as shown, ready for marks */
  const bodyHtml = (mod, tid, html) => `<div class="ebody" data-amod="${esc(mod)}" data-atid="${esc(String(tid))}">${html}</div>`;
  function applyMarks(root) {
    const els = [...root.querySelectorAll('.ebody[data-amod]')]; if (root.matches && root.matches('.ebody[data-amod]')) els.push(root);
    for (const el of els) {
      if (orig.has(el)) el.innerHTML = orig.get(el); else orig.set(el, el.innerHTML);
      const list = (store()[el.dataset.amod] || {})[el.dataset.atid]; if (!list || state.settings.show.bookMarks === false) continue;
      for (const m of list) wrap(el, m.s, m.e, m.style);
    }
  }
  function wrap(el, s, e, style) {
    let pos = 0;
    for (const n of textNodes(el)) {
      const len = n.length, a = Math.max(s, pos), z = Math.min(e, pos + len);
      if (a < z) { const r = document.createRange(); r.setStart(n, a - pos); r.setEnd(n, z - pos); const mk = document.createElement('mark'); mk.className = 'hl hl-' + style; try { r.surroundContents(mk); } catch (x) { /* crosses a tag */ } }
      pos += len; if (pos >= e) break;
    }
  }
  function selected() {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount || !String(sel).trim()) return null;
    const range = sel.getRangeAt(0); const c = range.commonAncestorContainer;
    const el = (c.nodeType === 3 ? c.parentElement : c).closest('.ebody[data-amod]'); if (!el || el.isContentEditable) return null;
    let pos = 0, s = null, e = 0;
    for (const n of textNodes(el)) { if (range.intersectsNode(n)) { const from = n === range.startContainer ? range.startOffset : 0, to = n === range.endContainer ? range.endOffset : n.length; if (s === null) s = pos + from; e = pos + to; } pos += n.length; }
    return s !== null && e > s ? { el, s, e } : null;
  }
  function markSelection(style) {
    const t = selected(); if (!t) return false;
    const mod = t.el.dataset.amod, tid = t.el.dataset.atid; const all = store(); const byMod = all[mod] || (all[mod] = {});
    const deco = x => ['ul', 'bold'].includes(x || '');
    const list = (byMod[tid] || []).filter(x => x.e <= t.s || x.s >= t.e || (style !== null && x.style !== style && deco(x.style) !== deco(style)));
    if (style) list.push({ s: t.s, e: t.e, style });
    list.sort((a, b) => a.s - b.s);
    if (list.length) byMod[tid] = list; else { delete byMod[tid]; if (!Object.keys(byMod).length) delete all[mod]; }
    saveMarks(); window.getSelection().removeAllRanges(); hideBar(); applyMarks(t.el); return true;
  }
  function hideBar() { const b = $('#abar'); if (b) b.classList.add('hidden'); }
  function wireMarks() {
    document.addEventListener('mouseup', e => {
      if (e.target instanceof Element && e.target.closest('#abar')) return;
      setTimeout(() => {
        const t = selected(); if (!t) { hideBar(); return; }
        const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
        let bar = $('#abar');
        if (!bar) {
          bar = document.createElement('div'); bar.id = 'abar'; bar.className = 'abar';
          bar.innerHTML = STYLES.map(s => `<button data-as="${s}" class="hlb hl-${s}" title="${s === 'bold' ? 'Bold' : s === 'ul' ? 'Underline' : 'Highlight ' + s}">${s === 'bold' ? '<b>B</b>' : s === 'ul' ? '<u>U</u>' : ''}</button>`).join('') + '<button data-as="" title="Remove my marks from the selected text">⌫</button>';
          bar.addEventListener('mousedown', ev => ev.preventDefault());
          bar.addEventListener('click', ev => { const b = ev.target.closest('[data-as]'); if (b) markSelection(b.dataset.as || null); });
          document.body.appendChild(bar);
        }
        bar.classList.remove('hidden');
        bar.style.left = Math.max(6, Math.min(innerWidth - bar.offsetWidth - 6, r.left + r.width / 2 - bar.offsetWidth / 2)) + 'px';
        bar.style.top = Math.max(6, r.top - bar.offsetHeight - 6) + 'px';
      }, 10);
    });
  }

  /* ------------------------------------------------------------ printing the Library topic */
  function printTopic() {
    const e = $('#libBody .entry'); if (!e) return flash('Open a topic first');
    let p = $('#printArea'); if (!p) { p = document.createElement('div'); p.id = 'printArea'; document.body.appendChild(p); }
    p.innerHTML = e.innerHTML; p.querySelectorAll('button, input, select').forEach(x => x.remove());
    document.body.classList.add('printing-topic');
    setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing-topic'), 500); }, 50);
  }

  function syncMenu() { const b = $('#clipBtn'); if (b) b.classList.toggle('on', !!ccfg().on); }
  function init() {
    document.addEventListener('click', e => { if (!(e.target instanceof Element)) return; const im = e.target.closest('.lookup img, #popup img'); if (im && !e.target.closest('a')) { e.preventDefault(); openImage(im); } });
    wireMarks();
    if (ccfg().on) startClip();
    const ex = $('#libExport'); if (ex) ex.onclick = exportTopics;
    const pr = $('#libPrint'); if (pr) pr.onclick = printTopic;
    // what Tanglaw itself copies is not shown by the clipboard monitor
    document.addEventListener('copy', () => { setTimeout(() => api.clipRead().then(t => { myCopy = t; lastSeen = t; }).catch(() => {}), 50); });
  }
  window.TanglawTools = { init, openImage, setClipmon, clipOn: () => !!ccfg().on, exportTopics, printTopic, applyMarks, bodyHtml, markSelection, clipTestReader: f => { reader = f; }, docxFiles, rtf, blocks };
})();
