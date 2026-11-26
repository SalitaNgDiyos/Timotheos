/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Translation Accuracy Rating (TAR, 0.6.121): the dialogs, the run over a verse / chapter / book / the whole translation,
 * the grades in the Parallel Bibles panel, and the saved results of each translation. The AI is the user's own choice
 * (AI settings). Grades: Poor (0–59), Not Bad (60–79), Good (80–91), Faithful (92–100). */
(function () {
  const MEASURES = [['lexical', 'Word meaning', 30], ['grammar', 'Grammar', 25], ['completeness', 'Completeness', 20], ['sense', 'Meaning & emphasis', 15], ['consistency', 'Consistency', 10]];
  const GRADES = [[92, 'Faithful', 'faithful'], [80, 'Good', 'good'], [60, 'Not Bad', 'notbad'], [0, 'Poor', 'poor']];
  const grade = s => { const g = GRADES.find(([m]) => s >= m) || GRADES[3]; return { name: g[1], cls: g[2] }; };
  const ORIG = /^(grc|gr|el|he|hbo|heb|arc)$/i;
  const S = () => state.settings;
  const cache = new Map();          // translation id -> saved results
  let run = null;                   // the rating going on: { stop, done, total, label }

  const ic = (n, s = 15) => (window.TimotheosIcons ? TimotheosIcons.icon(n, s) : '');
  const bibles = () => (state.modules && state.modules.bibles) || [];
  const titleOf = id => { const i = state.infos.get(id); const b = bibles().find(x => x.id === id); return (i && i.title) || (b && (b.title || b.name)) || id; };
  const abbrOf = id => { const i = state.infos.get(id); const b = bibles().find(x => x.id === id); return (i && i.abbr) || (b && b.abbr) || String(id).replace(/^\w+:/, ''); };
  const langOf = id => { const i = state.infos.get(id); return (i && (i.lang || i.language)) || ''; };
  const isOriginal = id => ORIG.test(langOf(id)) || /\b(TR|LXX|SBL|WH|NA2[78]|BYZ|TISCH|Scrivener|Textus Receptus|Septuagint|Brenton|Stephanus|WLC|Leningrad|Greek|Hebrew)\b/i.test(`${abbrOf(id)} ${titleOf(id)}`);
  const bookName = b => { const k = (state.nav || []).find(x => x.id === b); return k ? k.name : (window.BOOK_ABBR || {})[b] || String(b); };
  const flash = t => { if (typeof flashMsg === 'function') flashMsg(t); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------------------------------------------------------- saved results */
  async function results(id, fresh) {
    if (!fresh && cache.has(id)) return cache.get(id);
    let r; try { r = await api.tarLoad(id); } catch (e) { r = { translation: id, pairs: {} }; }
    cache.set(id, r); return r;
  }
  /** the saved grade of a verse of `tr`, against a source among `ids` (the chosen source first) */
  function gradeOf(tr, ids, b, c, v) {
    const r = cache.get(tr); if (!r || !r.pairs) return null;
    const pairs = Object.values(r.pairs).filter(p => p.source !== tr && (!ids || ids.includes(p.source)))
      .sort((a, b2) => (b2.source === S().tarSource) - (a.source === S().tarSource) || (b2.approach === (S().tarApproach || 'formal')) - (a.approach === (S().tarApproach || 'formal')));
    for (const p of pairs) { const g = p.verses[`${b}.${c}.${v}`]; if (g) return Object.assign({ source: p.source, approach: p.approach }, g); }
    return null;
  }
  /** a small grade button for a verse cell of the Parallel panel */
  function badge(tr, ids, b, c, v) {
    const g = gradeOf(tr, ids, b, c, v); if (!g) return '';
    const gr = grade(g.score);
    return ` <button type="button" class="tarb tar-${gr.cls}" data-tar="${esc(tr)}" data-src="${esc(g.source)}" data-appr="${esc(g.approach)}" data-ref="${b}.${c}.${v}" title="Translation Accuracy Rating against ${esc(abbrOf(g.source))}: ${g.score}% ${gr.name} (click for details)">${g.score}%</button>`;
  }
  async function preload(ids) { await Promise.all(ids.map(id => results(id))); }

  /* ---------------------------------------------------------------- AI settings */
  async function settingsDialog() {
    let cfg; try { cfg = await api.aiConfig(); } catch (e) { cfg = { provider: 'anthropic', providers: [] }; }
    const P = cfg.providers || [];
    const html = `<div class="aiset">
      <p class="hint">TAR asks an AI model of your choice. Use your own key from the service (it stays on this device and is never synced). A model on this computer (Ollama, LM Studio) needs no key and costs nothing, but small models grade less well.</p>
      <label class="field">AI service <select id="aiProv">${P.map(p => `<option value="${esc(p.id)}" ${p.id === cfg.provider ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label class="field">Address <input id="aiBase" type="text" placeholder="" value="${esc(cfg.base || '')}"><small class="hint" id="aiBaseHint"></small></label>
      <label class="field">Key <input id="aiKey" type="password" autocomplete="off" placeholder="${cfg.hasKey ? '•••••••• (saved; type to replace, or clear below)' : 'paste the key here'}"></label>
      <label class="field">Model <span class="airow"><input id="aiModel" type="text" list="aiModelList" placeholder="type a model name, or click List models" value="${esc(cfg.model || '')}"><button type="button" id="aiList">List models</button></span><datalist id="aiModelList"></datalist></label>
      <div class="airow"><button type="button" id="aiTest">Test</button>${cfg.hasKey ? '<button type="button" id="aiClear">Forget the saved key</button>' : ''}<span id="aiMsg" class="hint"></span></div></div>`;
    const p = TimotheosModules.modal('AI settings', html, [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }], true);
    const $m = s => document.querySelector('#modalBody ' + s);
    const prov = () => P.find(x => x.id === $m('#aiProv').value) || {};
    const showBase = () => { const x = prov(); $m('#aiBase').placeholder = x.base || 'https://…/v1'; $m('#aiBaseHint').textContent = x.base ? `Leave empty for ${x.base}` : 'The address of an OpenAI-compatible service, ending in /v1'; };
    showBase(); $m('#aiProv').onchange = () => { $m('#aiBase').value = ''; showBase(); };
    for (const inp of ['#aiBase', '#aiKey', '#aiModel']) $m(inp).addEventListener('keydown', e => { if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); } });
    const form = () => { const o = { provider: $m('#aiProv').value, base: $m('#aiBase').value.trim(), model: $m('#aiModel').value.trim() }; const k = $m('#aiKey').value.trim(); if (k) o.key = k; return o; };
    const msg = (t, bad) => { const m = $m('#aiMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); };
    $m('#aiList').onclick = async () => {
      msg('Asking for the models…');
      try { const list = await api.aiModels(form()); $m('#aiModelList').innerHTML = list.map(m => `<option value="${esc(m)}">`).join(''); msg(`${list.length} models. Click the Model box to choose one.`); }
      catch (e) { msg(e.message, true); }
    };
    $m('#aiTest').onclick = async () => { msg('Testing…'); try { await api.aiTest(form()); msg('It works.'); } catch (e) { msg(e.message, true); } };
    const clr = $m('#aiClear'); if (clr) clr.onclick = async () => { await api.aiSetConfig(Object.assign(form(), { key: '' })); msg('The saved key is forgotten.'); $m('#aiKey').placeholder = 'paste the key here'; };
    const v = await p;
    if (v !== 'ok') return null;
    const o = { provider: (document.getElementById('aiProv') || {}).value, base: ((document.getElementById('aiBase') || {}).value || '').trim(), model: ((document.getElementById('aiModel') || {}).value || '').trim() };
    const k = ((document.getElementById('aiKey') || {}).value || '').trim(); if (k) o.key = k;
    return api.aiSetConfig(o);
  }

  /* ---------------------------------------------------------------- the TAR dialog */
  async function open(opts = {}) {
    if (run) return progressDialog();
    const all = bibles(); if (all.length < 2) return TimotheosModules.modal('Translation Accuracy Rating', '<p>TAR needs a source text (such as the Textus Receptus or the LXX) and a translation: install at least two Bibles.</p>', [{ label: 'OK', value: 1, primary: true }]);
    await Promise.all(all.map(b => ensureInfo(b.id, true)));
    const setIds = opts.ids || [];
    const pool = [...setIds, ...all.map(b => b.id).filter(id => !setIds.includes(id))];
    const src0 = [S().tarSource, ...pool.filter(isOriginal)].find(id => id && pool.includes(id)) || pool[0];
    const tr0 = [opts.translation, ...setIds, ...pool].find(id => id && id !== src0);
    let ai; try { ai = await api.aiConfig(); } catch (e) { ai = {}; }
    const r = opts.ref || state.ref;
    const opt = (id, sel) => `<option value="${esc(id)}" ${id === sel ? 'selected' : ''}>${esc(abbrOf(id))} – ${esc(titleOf(id))}</option>`;
    const html = `<div class="tardlg">
      <p class="hint">An AI grades how faithfully the translation renders the source text: word meaning (30%), grammar (25%), completeness (20%), meaning &amp; emphasis (15%), consistency (10%). <b>Poor</b> 0–59 · <b>Not Bad</b> 60–79 · <b>Good</b> 80–91 · <b>Faithful</b> 92–100.</p>
      <div class="tar2"><label class="field">Source text (original language) <select id="tarSrc">${pool.map(id => opt(id, src0)).join('')}</select></label>
      <label class="field">Translation to rate <select id="tarTr">${pool.map(id => opt(id, tr0)).join('')}</select></label></div>
      <div class="field"><span>How much</span><div class="tarscope">
        <label><input type="radio" name="tarScope" value="verse" checked> This verse (${esc(bookName(r.b))} ${r.c}:${r.v})</label>
        <label><input type="radio" name="tarScope" value="chapter"> This chapter (${esc(bookName(r.b))} ${r.c})</label>
        <label><input type="radio" name="tarScope" value="book"> This book (${esc(bookName(r.b))})</label>
        <label><input type="radio" name="tarScope" value="all"> The entire translation</label></div></div>
      <div class="tar2"><label class="field">Judge it as <select id="tarAppr"><option value="formal" ${S().tarApproach !== 'dynamic' ? 'selected' : ''}>Word for word (formal)</option><option value="dynamic" ${S().tarApproach === 'dynamic' ? 'selected' : ''}>Thought for thought (dynamic)</option></select></label>
      <label class="field">Notes in <select id="tarLang"><option value="en">English</option><option value="tl" ${S().tarNoteLang === 'tl' ? 'selected' : ''}>Tagalog</option></select></label></div>
      <label class="tarchk"><input type="checkbox" id="tarAgain"> Rate again the verses already rated</label>
      <div class="tarai">${ic('star', 14)} AI: <b id="tarAiName">${esc(ai.model ? `${(ai.providers || []).find(p => p.id === ai.provider)?.name || ai.provider} · ${ai.model}` : 'not set up yet')}</b> <button type="button" id="tarAiBtn">AI settings…</button></div>
      <div id="tarEst" class="hint"></div>
      <div id="tarSaved" class="tarsaved"></div></div>`;
    const p = TimotheosModules.modal('Translation Accuracy Rating (TAR)', html, [{ label: 'Close', value: null }, { label: 'Start rating', value: 'go', primary: true }], true);
    const $m = s => document.querySelector('#modalBody ' + s);
    const okBtn = [...document.querySelectorAll('#modalBtns button')].find(b => b.classList.contains('primary'));
    const scope = () => (document.querySelector('input[name="tarScope"]:checked') || {}).value || 'verse';
    const refresh = async () => {
      const src = $m('#tarSrc').value, tr = $m('#tarTr').value;
      const same = src === tr;
      const plan = same ? null : await planFor(src, tr, scope(), r);
      const est = $m('#tarEst'); if (!est) return;
      if (same) est.textContent = 'Choose two different Bibles.';
      else if (!plan.chapters.length) est.textContent = 'These two Bibles share no verses in this part.';
      else est.innerHTML = `About <b>${plan.verses.toLocaleString()}</b> verses in <b>${plan.chapters.length.toLocaleString()}</b> chapter${plan.chapters.length === 1 ? '' : 's'}: about ${plan.requests.toLocaleString()} request${plan.requests === 1 ? '' : 's'} to the AI.${plan.requests > 40 ? ' <b>This can take hours and cost money with a paid service.</b> You can stop at any time; what was rated is kept, and a new start goes on where it stopped.' : ''}`;
      if (okBtn) okBtn.disabled = same || !plan || !plan.chapters.length || !ai.model;
      if (!ai.model && est) est.innerHTML += ' <b>Set up the AI first (AI settings).</b>';
      await savedTable(tr, src, $m('#tarAppr').value);
    };
    const savedTable = async (tr, src, appr) => {
      const box = $m('#tarSaved'); if (!box) return;
      let sum; try { sum = await api.tarSummary(tr, src, appr); } catch (e) { sum = null; }
      if (!sum || !sum.all.verses) { box.innerHTML = ''; return; }
      const row = (name, x) => `<tr><td>${esc(name)}</td><td>${x.verses}</td><td><b class="tar-${x.grade.cls}">${x.score}% ${x.grade.name}</b></td>${MEASURES.map(([k]) => `<td>${x.measures[k]}</td>`).join('')}</tr>`;
      const books = Object.entries(sum.books).sort((a, b) => +a[0] - +b[0]);
      box.innerHTML = `<div class="mh">Saved for ${esc(abbrOf(tr))} against ${esc(abbrOf(src))}</div>
        <div class="tartbl"><table><tr><th></th><th>Verses</th><th>TAR</th>${MEASURES.map(([, n]) => `<th>${esc(n)}</th>`).join('')}</tr>
        ${row('Everything rated', sum.all)}${books.map(([b, x]) => row(bookName(+b), x)).join('')}</table></div>
        ${sum.all.srcdiff ? `<p class="hint">${sum.all.srcdiff} verse${sum.all.srcdiff === 1 ? '' : 's'} follow a different source text; those differences were not counted.</p>` : ''}
        <button type="button" id="tarForget">Delete these saved results</button>`;
      $m('#tarForget').onclick = async () => { if (!await TimotheosModules.confirmBox('Delete saved TAR results', `Delete every saved grade of ${esc(abbrOf(tr))} against ${esc(abbrOf(src))}?`)) return open(opts); await api.tarRemove(tr, src, appr); cache.delete(tr); open(opts); };
    };
    ['#tarSrc', '#tarTr', '#tarAppr'].forEach(s => $m(s).addEventListener('change', refresh));
    document.querySelectorAll('input[name="tarScope"]').forEach(x => x.addEventListener('change', refresh));
    $m('#tarAiBtn').onclick = async () => {
      const keep = { src: $m('#tarSrc').value, tr: $m('#tarTr').value };
      document.querySelector('#modal').classList.add('hidden');
      await settingsDialog();
      return open(Object.assign({}, opts, { translation: keep.tr, source: keep.src }));
    };
    if (opts.source) $m('#tarSrc').value = opts.source;
    refresh();
    const v = await p;
    if (v !== 'go') return;
    const job = { source: document.getElementById('tarSrc').value, translation: document.getElementById('tarTr').value, scope: scope(), approach: document.getElementById('tarAppr').value, noteLang: document.getElementById('tarLang').value, again: document.getElementById('tarAgain').checked, ref: r };
    save({ tarSource: job.source, tarApproach: job.approach, tarNoteLang: job.noteLang });
    start(job);
  }

  /** the chapters (and verse estimate) a rating covers */
  async function planFor(src, tr, scope, r) {
    const a = await ensureInfo(src), b = await ensureInfo(tr);
    const books = id => (state.infos.get(id) || {}).books || {};
    const A = books(src), B = books(tr);
    const chapters = []; let verses = 0;
    const counts = (m, bk) => { const x = m[bk]; return Array.isArray(x) ? x : x && Array.isArray(x.verses) ? x.verses : null; };
    const want = scope === 'all' ? Object.keys(A).filter(k => B[k]).map(Number).sort((x, y) => x - y) : [r.b];
    for (const bk of want) {
      const ca = counts(A, bk), cb = counts(B, bk);
      const n = Math.min(ca ? ca.length : 0, cb ? cb.length : 0) || (A[bk] && B[bk] ? 1 : 0);
      for (let c = 1; c <= n; c++) {
        if ((scope === 'chapter' || scope === 'verse') && c !== r.c) continue;
        const vs = Math.min(ca ? +ca[c - 1] || 0 : 0, cb ? +cb[c - 1] || 0 : 0) || 25;
        chapters.push({ b: bk, c, n: vs }); verses += scope === 'verse' ? 1 : vs;
      }
    }
    if (!a || !b) return { chapters: [], verses: 0, requests: 0 };
    const requests = scope === 'verse' ? 1 : chapters.reduce((n, x) => n + Math.max(1, Math.ceil((x.n || 25) / 30)), 0);
    return { chapters, verses, requests };
  }

  /* ---------------------------------------------------------------- the run */
  const show = () => Object.assign({}, S().show || {}, { strongs: false, morph: false, lemma: false, columns: false, tags: false, footnotes: false, xrefs: false, xrefsFull: false, cmtLinks: false, headings: false });
  /** the source with [Strong's morphology lemma] after each tagged word */
  function sourceText(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    d.querySelectorAll('sup, .heading, .fnbody, .gloss, .vnum').forEach(x => x.remove());
    d.querySelectorAll('[data-strong],[data-morph],[data-lemma]').forEach(w => {
      const t = [w.dataset.strong, w.dataset.morph, w.dataset.lemma].filter(Boolean).join(' ').trim();
      if (t) w.after(document.createTextNode(`[${t}]`));
    });
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  /** the translation, with its added (italic) words in [brackets] */
  function translationText(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    d.querySelectorAll('sup, .heading, .fnbody, .gloss, .vnum').forEach(x => x.remove());
    d.querySelectorAll('i, em, .added').forEach(x => { if (x.textContent.trim()) x.textContent = `[${x.textContent.trim()}]`; });
    return d.textContent.replace(/\s+/g, ' ').trim();
  }
  async function start(job) {
    const plan = await planFor(job.source, job.translation, job.scope, job.ref);
    if (!plan.chapters.length) return flash('Nothing to rate.');
    run = { stop: false, chDone: 0, chTotal: plan.chapters.length, verses: 0, label: `${abbrOf(job.translation)} against ${abbrOf(job.source)}`, errors: 0, job };
    paintProgress();
    const infoS = state.infos.get(job.source) || EMPTY_MOD, infoT = state.infos.get(job.translation) || EMPTY_MOD;
    let failed = null;
    try {
      for (const { b, c } of plan.chapters) {
        if (run.stop) break;
        run.at = `${bookName(b)} ${c}`; paintProgress();
        const saved = await results(job.translation);
        const pair = saved.pairs[`${job.source}|${job.approach}`];
        const data = await api.chapter([job.source, job.translation], b, c);
        const verses = [];
        for (const row of data.rows) {
          if (!row.v || row.cells[0] == null || row.cells[1] == null) continue;
          if (job.scope === 'verse' && row.v !== job.ref.v) continue;
          if (!job.again && pair && pair.verses[`${b}.${c}.${row.v}`]) continue;
          const src = sourceText(TWRender.render(row.cells[0], infoS, show(), { fn: { n: 0 }, b }));
          const tr = translationText(TWRender.render(row.cells[1], infoT, show(), { fn: { n: 0 }, b }));
          if (src && tr) verses.push({ v: row.v, src, tr });
        }
        const parts = [];
        for (let k = 0; k < verses.length; k += 30) parts.push(verses.slice(k, k + 30));
        for (const part of parts) {
          if (run.stop) break;
          try {
            await api.tarRate({ source: job.source, translation: job.translation, sourceTitle: titleOf(job.source), translationTitle: titleOf(job.translation), sourceLang: langOf(job.source), translationLang: langOf(job.translation), approach: job.approach, noteLang: job.noteLang, b, c, bookName: bookName(b), verses: part });
            run.verses += part.length;
          } catch (e) {
            run.errors++;
            if (/^(401|403|404)\b|key|model|address|AI settings|No connection/i.test(e.message) || run.errors >= 3) { failed = e.message; run.stop = true; break; }
          }
          cache.delete(job.translation); await results(job.translation);
          paintProgress();
          if (window.TimotheosParallel) TimotheosParallel.render(false);
        }
        run.chDone++; paintProgress();
      }
    } catch (e) { failed = e.message; }
    const stopped = run.stop && !failed; const done = run;
    run = null; paintProgress();
    cache.delete(job.translation); await results(job.translation);
    if (window.TimotheosParallel) TimotheosParallel.render(false);
    resultDialog(job, done, failed, stopped);
  }
  async function resultDialog(job, done, failed, stopped) {
    let sum = null; try { sum = await api.tarSummary(job.translation, job.source, job.approach); } catch (e) { /* */ }
    let part = null;
    if (sum) {
      if (job.scope === 'verse') { const g = gradeOf(job.translation, [job.source], job.ref.b, job.ref.c, job.ref.v); if (g) return detailDialog(job.translation, job.source, job.approach, `${job.ref.b}.${job.ref.c}.${job.ref.v}`); }
      part = job.scope === 'all' ? sum.all : (sum.books[job.ref.b] || null);
    }
    const head = failed ? `<p class="bad">The rating stopped: ${esc(failed)}</p>` : stopped ? '<p>Stopped. What was rated is kept; start again to go on.</p>' : `<p>Done: ${done.verses.toLocaleString()} verse${done.verses === 1 ? '' : 's'} rated.</p>`;
    const body = part && part.verses ? `<div class="tarbig tar-${part.grade.cls}"><b>${part.score}%</b><span>${part.grade.name}</span></div>
      <p class="hint">${esc(abbrOf(job.translation))} against ${esc(abbrOf(job.source))} · ${job.scope === 'all' ? 'everything rated so far' : esc(bookName(job.ref.b)) + ', all rated verses'} · ${part.verses.toLocaleString()} verses</p>
      ${bars(part.measures)}` : '';
    await TimotheosModules.modal('Translation Accuracy Rating', head + body, [{ label: 'OK', value: 1, primary: true }]);
  }
  const bars = m => `<div class="tarbars">${MEASURES.map(([k, n, w]) => `<div class="tarbar"><span>${esc(n)} <small>${w}%</small></span><i><b class="tar-${grade(m[k]).cls}" style="width:${m[k]}%"></b></i><em>${m[k]}</em></div>`).join('')}</div>`;

  /** one verse: the grade, the five measures, the note and the words that lose something */
  async function detailDialog(tr, src, appr, ref) {
    const r = await results(tr); const p = r.pairs[`${src}|${appr}`]; const g = p && p.verses[ref];
    if (!g) return;
    const [b, c, v] = ref.split('.').map(Number); const gr = grade(g.score);
    const html = `<div class="tarbig tar-${gr.cls}"><b>${g.score}%</b><span>${gr.name}</span></div>
      <p class="hint">${esc(abbrOf(tr))} against ${esc(abbrOf(src))} · judged as ${appr === 'dynamic' ? 'thought for thought' : 'word for word'} · ${esc(g.model || '')} · ${esc((g.at || '').slice(0, 10))}</p>
      ${bars(g)}
      ${g.srcdiff ? '<p class="tarnote">This verse follows a different source text in places; those differences were not counted.</p>' : ''}
      ${g.note ? `<p class="tarnote">${esc(g.note)}</p>` : ''}
      ${g.issues && g.issues.length ? `<div class="tartbl"><table><tr><th>Translation</th><th>Source</th><th>What</th><th>Note</th></tr>${g.issues.map(i => `<tr><td>${esc(i.word)}</td><td>${esc(i.source)}</td><td>${esc(i.kind)}</td><td>${esc(i.note)}</td></tr>`).join('')}</table></div>` : ''}
      <p class="hint">An AI's grade is an opinion with reasons, not a final verdict. Check its notes against a lexicon and grammar.</p>`;
    const v2 = await TimotheosModules.modal(`TAR · ${bookName(b)} ${c}:${v}`, html, [{ label: 'Rate again', value: 'again' }, { label: 'OK', value: 1, primary: true }], true);
    if (v2 === 'again') start({ source: src, translation: tr, scope: 'verse', approach: appr, noteLang: S().tarNoteLang || 'en', again: true, ref: { b, c, v } });
  }

  /* the progress strip (bottom of the window) */
  function paintProgress() {
    let el = document.getElementById('tarProg');
    if (!run) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'tarProg'; el.className = 'tarprog'; document.body.appendChild(el); el.onclick = e => { if (e.target.closest('[data-stop]') && run) { run.stop = true; e.target.closest('[data-stop]').textContent = 'Stopping…'; } }; }
    const pct = run.chTotal ? Math.round(100 * run.chDone / run.chTotal) : 0;
    el.innerHTML = `<b>TAR</b> ${esc(run.label)} · ${esc(run.at || '')} · ${run.chDone}/${run.chTotal} chapters · ${run.verses.toLocaleString()} verses<i><b style="width:${pct}%"></b></i><button type="button" data-stop>Stop</button>`;
  }
  async function progressDialog() {
    const v = await TimotheosModules.modal('Translation Accuracy Rating', `<p>A rating is going on: ${esc(run.label)}, ${run.chDone} of ${run.chTotal} chapters.</p>`, [{ label: 'Stop it', value: 'stop' }, { label: 'Let it go on', value: 1, primary: true }]);
    if (v === 'stop' && run) run.stop = true;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('.tarb[data-tar]'); if (!b) return;
    e.stopPropagation(); detailDialog(b.dataset.tar, b.dataset.src, b.dataset.appr, b.dataset.ref);
  }, true);

  window.TimotheosTAR = { open, settingsDialog, badge, preload, results, grade, running: () => !!run };
})();
