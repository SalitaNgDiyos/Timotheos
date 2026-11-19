// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Edmund P. Valdez
// Import a document in the real app: the "what should it become" window, then the result.
// Needs /tmp/docs/{src.docx,notes.docx}: cp test/unit/docs/* /tmp/docs/  then  bash test/tauri/run.sh test/tauri/docs.js /tmp/docs.png 1500
(async () => { const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m); const sl = ms => new Promise(r => setTimeout(r, ms));
const until = async (f, n = 60) => { for (let i = 0; i < n; i++) { try { if (f()) return true; } catch (e) { /* not yet */ } await sl(250); } return false; };
const click = txt => { const b = [...document.querySelectorAll('#modalBtns button')].find(x => x.textContent.trim() === txt); if (b) b.click(); return !!b; };
try {
  for (let i = 0; i < 80 && !(state.nav && state.nav.length); i++) await sl(250);
  const p = importModules(['/tmp/docs/src.docx']);
  ok(await until(() => /Import a document/.test(document.querySelector('#modalTitle').textContent)), 'asks what the document becomes');
  const radios = [...document.querySelectorAll('#modalBody input[name=docAs]')].map(r => r.value);
  ok(radios.join() === 'book,bible,notes', 'three choices: ' + radios);
  ok(document.querySelector('#docTitle').value === 'src', 'name prefilled: ' + document.querySelector('#docTitle').value);
  document.querySelector('#docTitle').value = 'Doc Test';
  document.querySelector('#modalBody input[value=notes]').click(); await sl(200);
  ok(document.querySelector('#docTitleRow').style.display === 'none', 'name hidden for notes');
  document.querySelector('#modalBody input[value=book]').click(); await sl(200);
  ok(document.querySelector('#docTitleRow').style.display !== 'none', 'name back for book');
  await sl(300); await window.api.__shot && 0;
  click('Import');
  await p;
  ok(await until(() => /Import: 1 module/.test(document.querySelector('#modalTitle').textContent)), 'result window: ' + document.querySelector('#modalTitle').textContent);
  ok(/Doc Test/.test(document.querySelector('#modalBody').innerText) && /by headings/.test(document.querySelector('#modalBody').innerText), 'result row names the book and sections');
  click('OK'); await sl(500);
  const L = await api.listModules();
  const bk = (L.books || []).find(b => /Doc Test/.test(b.title || b.name || ''));
  ok(!!bk, 'book is in the library: ' + (L.books || []).map(b => b.title).join(','));
  if (bk) {
    const m = await api.bookTopics(bk.id); const tops = m.topics || m;
    ok(tops.length === 4, 'sections: ' + tops.map(t => t.subject).join('|'));
    const t = await api.bookTopic(bk.id, tops.find(x => x.subject === 'Section 1.1').id);
    ok(/<table>/.test(t.html) && /<img/.test(t.html), 'table and picture in the section');
  }
} catch (e) { out.push('✗ script error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
console.log('RESULT ' + out.join(' | ')); })();
