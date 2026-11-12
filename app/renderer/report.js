/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
'use strict';
/* Problem report: Timotheos keeps, in memory only, the last errors of this run and the last few things that were tapped
 * or clicked (the name of the button, never what was typed). "Copy problem report" (About, and Help on the phone) puts
 * them on the clipboard as plain text, with the version, the device and how the Bible views are set, so that a fault
 * seen on one device can be understood on another. Nothing is sent anywhere and nothing is written to disk. */
(function () {
  const errs = [], taps = [], t0 = Date.now();
  const at = () => '+' + ((Date.now() - t0) / 1000).toFixed(1) + 's';
  const keep = (list, line, max) => { list.push(line); if (list.length > max) list.shift(); };
  const short = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  window.addEventListener('error', e => keep(errs, `${at()} ${short(e.message, 200)} @ ${short((e.filename || '').split('/').pop(), 40)}:${e.lineno || 0}`, 20));
  window.addEventListener('unhandledrejection', e => keep(errs, `${at()} promise: ${short(e.reason && (e.reason.message || e.reason), 200)}`, 20));
  const name = el => {
    if (!el || !el.closest) return '';
    const b = el.closest('button, a, select, input, [role="button"], [data-a], [data-x], [data-c], [data-t], .pv, .dtab') || el;
    const typed = /^(INPUT|TEXTAREA)$/.test(b.tagName) || b.isContentEditable;
    const cls = short(typeof b.className === 'string' ? b.className : '', 30);
    const d = ['a', 'x', 'c', 't', 'k', 'o', 'font', 'b', 'v'].filter(k => b.dataset && b.dataset[k] != null).map(k => `${k}=${short(b.dataset[k], 24)}`).join(' ');
    const lbl = typed ? '' : short(b.getAttribute('aria-label') || b.title || (b.classList && b.classList.contains('pv') ? '' : b.textContent), 28);
    return `${b.tagName.toLowerCase()}${cls ? '.' + cls.split(' ').join('.') : ''}${d ? ' [' + d + ']' : ''}${lbl ? ' "' + lbl + '"' : ''}`;
  };
  document.addEventListener('click', e => keep(taps, `${at()} ${name(e.target)}`, 25), true);

  const hasFont = f => {
    try {
      const c = document.createElement('canvas').getContext('2d'), t = 'mmmmmmmmmmlli0Oq@Ωאα';
      const w = fam => { c.font = `72px ${fam}`; return c.measureText(t).width; };
      const q = `'${String(f).replace(/['\\]/g, '')}'`;
      return w(`${q}, monospace`) !== w('monospace') || w(`${q}, serif`) !== w('serif');
    } catch (e) { return null; }
  };
  const safe = (fn, d) => { try { const v = fn(); return v == null ? d : v; } catch (e) { return d; } };

  function text() {
    const R = document.documentElement, S = safe(() => state.settings, {}) || {};
    const H = window.TimotheosHost;
    const L = [];
    L.push('Timotheos problem report');
    L.push(`Version: ${S.version || '?'}   Made: ${new Date().toISOString()}   Running for: ${at().slice(1)}`);
    L.push(`Device: ${H ? (H.isAndroid ? 'Android' : H.isMobile ? 'mobile' : 'computer') : 'computer (Electron)'}   ${navigator.userAgent}`);
    L.push(`Window: ${innerWidth}×${innerHeight} at ${window.devicePixelRatio || 1}x   Language: ${S.lang || 'en'}`);
    L.push(`Phone screen: ${safe(() => window.TimotheosSkins && TimotheosSkins.current(), '') || 'none (desktop layout)'}   Skin: ${safe(() => TimotheosOptions.appearance().skin, '?')}   Classes: ${short(R.className, 120)}`);
    L.push(`Modules: ${safe(() => state.modules.bibles.length, '?')} Bibles, ${safe(() => state.modules.books.length + state.modules.dicts.length, '?')} library, ${safe(() => state.modules.errors.length, '?')} not read`);
    L.push(`Place: ${safe(() => `${state.ref.b}.${state.ref.c}.${state.ref.v}`, '?')}   Active view: ${safe(() => state.active, '?')}   Two Bibles (phone): ${safe(() => !!(window.PUI && PUI.par.on()), false)}`);
    const boxes = [...document.querySelectorAll('.bv')];
    safe(() => views(), []).forEach((v, i) => {
      const t = boxes[i] && boxes[i].querySelector('.bvtext'); const cs = t ? getComputedStyle(t) : null;
      const r = t ? t.getBoundingClientRect() : null;
      L.push(`View ${i}: Bible ${short(v.bible, 50)}   chosen font: ${v.font || '(as in Options)'}${v.font ? (hasFont(v.font) ? ' (on this device)' : ' (NOT on this device)') : ''}   shown font: ${cs ? short(cs.fontFamily, 70) : '?'}   size: ${cs ? cs.fontSize : '?'}   line: ${v.lh || '-'}   on screen: ${r ? Math.round(r.width) + '×' + Math.round(r.height) + ' at ' + Math.round(r.left) + ',' + Math.round(r.top) : 'no'}`);
    });
    L.push(`Fonts offered here: ${safe(() => TimotheosOptions.fonts().join(', '), '?')}`);
    L.push('');
    L.push(`Last taps and clicks (${taps.length}):`); taps.forEach(t => L.push('  ' + t));
    L.push('');
    L.push(`Errors in this run (${errs.length}):`); (errs.length ? errs : ['  none']).forEach(t => L.push(errs.length ? '  ' + t : t));
    return L.join('\n');
  }
  async function copy() {
    const t = text();
    try { await api.copyText(t); if (window.flashMsg) flashMsg('Problem report copied. Paste it where you report the problem.'); return true; }
    catch (e) { if (window.TimotheosModules) TimotheosModules.modal('Problem report', `<p>Copying was not possible here. Select the text and copy it:</p><pre class="legaltext sel">${t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</pre>`, [{ label: 'OK', value: true, primary: true }], true); return false; }
  }
  window.TimotheosReport = { text, copy, errors: () => errs.slice(), taps: () => taps.slice() };
})();
