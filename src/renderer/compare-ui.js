'use strict';
/* Compare panel (Ctrl+M): the selected verse in many Bibles at once, with the words that are not in the
 * first Bible marked. Follows the verse you select. */
/* global api, state, save, esc, openTab, TWRender, go */
(function () {
  const $ = s => document.querySelector(s);
  const words = t => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}']+/gu) || [];
  const cfg = () => (state.settings.compare = Object.assign({ which: 'all', diff: true, ctx: false }, state.settings.compare || {}));
  /** mark the words of a verse that are not in the first Bible's verse */
  function markDiff(html, base) {
    const t = document.createElement('template'); t.innerHTML = html;
    const w = document.createTreeWalker(t.content, NodeFilter.SHOW_TEXT); const nodes = []; let n;
    while ((n = w.nextNode())) if (!(n.parentElement && n.parentElement.closest('sup, .strong, .morph'))) nodes.push(n);
    for (const tn of nodes) {
      const parts = tn.data.split(/([\p{L}\p{N}']+)/u); if (parts.length < 2) continue;
      const frag = document.createDocumentFragment();
      parts.forEach((p, i) => { if (i % 2 && !base.has(words(p)[0] || '')) { const m = document.createElement('mark'); m.className = 'cdiff'; m.textContent = p; frag.appendChild(m); } else frag.appendChild(document.createTextNode(p)); });
      tn.replaceWith(frag);
    }
    return t.innerHTML;
  }
  let seq = 0;
  async function render() {
    const box = $('#cmpBody'); if (!box || $('#tab-compare').classList.contains('hidden')) return;
    const my = ++seq; const c = cfg(); const r = state.ref;
    let ids = c.which === 'open' ? [...new Set(state.settings.openBibles)] : state.modules.bibles.map(b => b.id);
    if (!ids.length) { box.innerHTML = '<p class="hint">No Bibles yet.</p>'; return; }
    for (const id of ids) if (!state.infos.has(id)) { try { state.infos.set(id, await api.bibleInfo(id)); } catch (e) { /* unreadable */ } }
    ids = ids.filter(id => state.infos.has(id));
    const data = await api.chapter(ids, r.b, r.c); if (my !== seq) return;
    const show = Object.assign({}, state.settings.show, { strongs: false, morph: false, footnotes: false, xrefs: false, lemma: false, columns: false });
    const from = c.ctx ? Math.max(1, r.v - 2) : r.v, to = c.ctx ? r.v + 2 : r.v;
    const rows = data.rows.filter(x => x.v >= from && x.v <= to);
    const out = []; let base = null;
    ids.forEach((id, i) => {
      const inf = state.infos.get(id);
      const parts = rows.filter(x => x.cells[i] != null).map(x => `${c.ctx ? `<sup class="vno${x.v === r.v ? ' cur' : ''}" data-gov="${x.v}">${x.v}</sup>` : ''}${TWRender.render(x.cells[i], inf, show)}`);
      if (!parts.length) return;
      const html = parts.join(' '); let shown = html;
      if (c.diff) { const t = document.createElement('div'); t.innerHTML = html; t.querySelectorAll('sup, .strong, .morph').forEach(s => s.remove()); const ws = words(t.textContent || ''); if (!base) base = new Set(ws); else shown = markDiff(html, base); }
      out.push(`<div class="cmprow${inf.rtl ? ' rtl' : ''}"><div class="cab" title="${esc(inf.title)}">${esc(inf.abbr)}</div><div class="ctx">${shown}</div></div>`);
    });
    $('#cmpHead').innerHTML = `${esc(data.book.name)} ${r.c}:${from === to ? r.v : `${from}–${to}`} <span class="small">${out.length} Bible${out.length === 1 ? '' : 's'}${c.diff && out.length > 1 ? ' · words not in the first Bible are marked' : ''}</span>`;
    box.innerHTML = out.join('') || '<p class="hint">No Bible here has this verse.</p>';
  }
  function open() { openTab('compare'); render(); }
  function init() {
    const c = cfg();
    $('#cmpWhich').value = c.which; $('#cmpDiff').checked = c.diff; $('#cmpCtx').checked = c.ctx;
    $('#cmpWhich').onchange = () => { c.which = $('#cmpWhich').value; save({ compare: c }); render(); };
    $('#cmpDiff').onchange = () => { c.diff = $('#cmpDiff').checked; save({ compare: c }); render(); };
    $('#cmpCtx').onchange = () => { c.ctx = $('#cmpCtx').checked; save({ compare: c }); render(); };
    $('#cmpBody').addEventListener('click', e => { const v = e.target.closest('[data-gov]'); if (v) go({ b: state.ref.b, c: state.ref.c, v: +v.dataset.gov }); });
  }
  window.TanglawCompare = { init, open, render };
})();
