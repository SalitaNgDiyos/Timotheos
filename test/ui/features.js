window.__errs = [];
window.addEventListener('error', e => window.__errs.push(e.message));
window.addEventListener('unhandledrejection', e => window.__errs.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (k, o = {}) => document.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o)));
const out = [];
const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
(async () => {
  await sleep(2500);
  document.getElementById('view').focus();
  // navigation keys
  key('ArrowRight'); await sleep(500); ok(state.ref.c === 4, 'Right arrow → next chapter (' + state.ref.c + ')');
  key('ArrowLeft', { altKey: true }); await sleep(500); ok(state.ref.c === 3, 'Alt+Left → back in history (' + state.ref.c + ')');
  key('ArrowRight', { altKey: true }); await sleep(500); ok(state.ref.c === 4, 'Alt+Right → forward (' + state.ref.c + ')');
  key('ArrowLeft', { altKey: true }); await sleep(500);
  key('1', { code: 'Digit1' }); key('2', { code: 'Digit2' }); await sleep(900); ok(state.ref.v === 12, 'typed 12 → verse ' + state.ref.v);
  key('ArrowDown'); await sleep(200); ok(state.ref.v === 13, 'Down → verse ' + state.ref.v);
  key('ArrowRight', { ctrlKey: true }); await sleep(500); ok(state.ref.b === 44, 'Ctrl+Right → next book (' + state.ref.b + ')');
  key('ArrowLeft', { altKey: true }); await sleep(500);
  // bookmarks
  selectVerse(16); key('!', { code: 'Digit1', ctrlKey: true, shiftKey: true }); await sleep(200);
  go({ b: 1, c: 1, v: 1 }); await sleep(500);
  key('1', { code: 'Digit1', ctrlKey: true }); await sleep(600); ok(state.ref.b === 43 && state.ref.c === 3 && state.ref.v === 16, 'Ctrl+Shift+1 / Ctrl+1 bookmark → ' + JSON.stringify(state.ref));
  // quick keys
  key('s'); await sleep(500); ok(effShow('strongs') === true && document.querySelector('#view .bv.active sup.strong:not(.hide)') && document.querySelector('#view .bv.active .bvside [data-k="strongs"].on'), 'S shows Strong\'s in the active view (side bar S lit)');
  key('s'); await sleep(400);
  key('p'); await sleep(600); ok(document.querySelector('.paraview'), 'P → paragraph mode');
  key('p'); await sleep(600); ok(document.querySelector('table.chapter'), 'P again → back to verses');
  // highlight via context menu with a selection
  const td = document.querySelector('#view tr[data-v="16"] td[data-col="0"]');
  const w = document.createTreeWalker(td, NodeFilter.SHOW_TEXT); let n, node, off; while ((n = w.nextNode())) { const i = n.textContent.indexOf('loved'); if (i >= 0) { node = n; off = i; break; } }
  const r = document.createRange(); r.setStart(node, off); r.setEnd(node, off + 5); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  const rect = r.getBoundingClientRect();
  node.parentElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: rect.left + 3, clientY: rect.top + 4 }));
  await sleep(200);
  ok(!document.getElementById('ctxMenu').classList.contains('hidden'), 'right-click menu opens');
  document.querySelector('#ctxMenu button[data-a="hl"][data-s="yellow"]').click(); await sleep(700);
  const mk = document.querySelector('#view tr[data-v="16"] mark.hl-yellow'); ok(mk && mk.textContent === 'loved', 'highlight "loved" (' + (mk && mk.textContent) + ')');
  // note
  TimotheosStudy.editNote('43.3.16'); await sleep(300);
  document.getElementById('noteEd').innerHTML = 'God\'s love: compare Rom 5:8 and 1 John 4:9.';
  [...document.querySelectorAll('#modalBtns button')].find(b => b.textContent === 'Save').click(); await sleep(800);
  const un = document.querySelector('.unote'); ok(un && un.querySelectorAll('a.link').length === 2, 'note saved under the verse with 2 reference links');
  // verse list
  key('l', { ctrlKey: true }); await sleep(300); ok((TimotheosStudy.study.ud.lists['My verses'] || []).length === 1, 'Ctrl+L adds to verse list');
  // search
  await TimotheosSearch.run('G26'); await sleep(300);
  ok(/\b106\b/.test(document.getElementById('searchStatus').textContent), 'search G26 → ' + document.getElementById('searchStatus').textContent.slice(0, 60));
  await TimotheosSearch.run('faith NEARv2 hope'); ok(/\b31\b/.test(document.getElementById('searchStatus').textContent), 'NEARv search in UI');
  await TimotheosSearch.run('Tobie'); ok(document.getElementById('searchResults').innerHTML.includes('Tob'), 'Wycliffe Apocrypha in results');
  // rows + diff
  key('j', { ctrlKey: true }); await sleep(600); ok(document.getElementById('view').dataset.arrange === 'rows', 'Ctrl+J: Bible views one under another');
  document.getElementById('diffToggle').click(); await sleep(700); ok(document.querySelector('mark.dif') && document.querySelector('.diffpct'), 'differences marked with %');
  document.getElementById('diffToggle').click(); key('h', { ctrlKey: true }); await sleep(600);
  // reading plan
  const plan = await api.createPlan({ name: 'Bible in a year', groups: ['Gen-Mal', 'Matt-Rev'], start: new Date().toISOString().slice(0, 10), mode: 'days', sessions: 365, days: [0,1,2,3,4,5,6] }, state.settings.openBibles);
  TimotheosStudy.study.ud.plans.push(plan); await api.setUserData('plans', TimotheosStudy.study.ud.plans);
  ok(plan.sessions.length > 300, 'reading plan created: ' + plan.sessions.length + ' sessions');
  // persisted?
  const ud = await api.userData(); ok(ud.notes['43.3.16'] && ud.highlights['tw:kjv.ont']['43.3.16'] && ud.bookmarks[0] && ud.lists['My verses'].length, 'study data saved to disk');
  ok(window.__errs.length === 0, 'no script errors ' + JSON.stringify(window.__errs));
  document.getElementById('lookup').innerHTML = '<pre style="white-space:pre-wrap;font-size:12px">' + out.join('\n') + '</pre>'; openTab('lookup');
  console.log('RESULT ' + out.join(' | '));
})();
