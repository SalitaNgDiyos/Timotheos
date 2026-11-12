/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Right-click: "Copy <word>" in the Bible (the selected word, or the one under the mouse); "Look up / Find / Copy <word>" in the other books.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const $ = s => document.querySelector(s); const copied = []; const orig = api.copyText; api.copyText = async (t) => { copied.push(t); };
  const looked = []; const origLook = window.showLookup; window.showLookup = async o => { looked.push(o.word); };
  const finds = []; const origFind = TimotheosSearch.find; TimotheosSearch.find = q => finds.push(q);
  try {
    for (let i = 0; i < 80 && !$('.bv .pv[data-v]'); i++) await sleep(250);
    const wordRect = (el, w) => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const i = n.textContent.indexOf(w); if (i >= 0 && !n.parentElement.closest('sup')) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + w.length); return { r, rect: r.getBoundingClientRect() }; } } return null; };
    const rc = (x, y, t) => { const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }); (document.elementFromPoint(x, y) || t).dispatchEvent(e); return e; };
    const menu = () => { const m = $('#ctxMenu'); return m.classList.contains('hidden') ? '' : m.textContent; };
    // ---- the Bible: no selection, the word under the mouse
    const v = $('.bv .pv[data-v="16"]') || $('.bv .pv[data-v]'); v.scrollIntoView({ block: 'center' }); await sleep(300);
    const plain = el => { const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n, t = ''; while ((n = tw.nextNode())) if (!n.parentElement.closest('sup, .vn, .vnum')) t += n.textContent; return t; };
    const txt = plain(v).match(/\p{L}{4,}/u)[0]; const wr = wordRect(v, txt);
    window.getSelection().removeAllRanges(); rc(wr.rect.left + wr.rect.width / 2, wr.rect.top + wr.rect.height / 2, v); await sleep(200);
    ok(menu().includes('Copy “' + txt + '”'), 'Bible, nothing selected: Copy “' + txt + '” is offered');
    [...$('#ctxMenu').querySelectorAll('button[data-a="copyword"]')][0].click(); await sleep(200);
    ok(copied[copied.length - 1] === txt, 'and it copies the word: ' + copied[copied.length - 1]);
    // ---- the Bible: a selected word wins over the one under the mouse
    const other = plain(v).match(/\p{L}{4,}/gu).find(w => w !== txt) || txt; const or = wordRect(v, other);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(or.r);
    rc(wr.rect.left + wr.rect.width / 2, wr.rect.top + wr.rect.height / 2, v); await sleep(200);
    ok(menu().includes('Copy “' + other + '”') && !menu().includes('Copy “' + txt + '”'), 'Bible, a word selected: Copy “' + other + '” (the selection comes first)');
    ok(menu().includes('Look up “' + other + '”') && menu().includes('Find “' + other + '”'), 'Look up and Find follow the selected word');
    // ---- the Bible: several words selected
    $('#ctxMenu').classList.add('hidden'); await sleep(700);   // let the screen settle after the clicks above
    let two = '', tr = null; { const tw = document.createTreeWalker(v, NodeFilter.SHOW_TEXT); let n; while (!tr && (n = tw.nextNode())) { const m = n.parentElement.closest('sup') ? null : n.textContent.match(/\p{L}{3,} \p{L}{3,}/u); if (m) { two = m[0]; tr = wordRect(v, two); } } } sel.removeAllRanges(); sel.addRange(tr.r);
    rc(tr.rect.left + 3, tr.rect.top + tr.rect.height / 2, v); await sleep(200);
    ok(menu().includes('Copy “' + two + '”'), 'Bible, a few words selected: Copy “' + two + '” (menu: ' + menu().slice(0, 80) + ')');
    $('#ctxMenu').classList.add('hidden');
    // ---- the other books: Library, Commentary, dictionaries
    const host = document.createElement('div'); host.className = 'lookup'; host.style.cssText = 'position:fixed;left:200px;top:120px;width:360px;background:#fff;color:#000;z-index:99999;padding:10px'; host.innerHTML = '<p>The beginning of wisdom is the fear of the Lord.</p>'; document.body.appendChild(host);
    const hr = wordRect(host, 'wisdom'); sel.removeAllRanges(); rc(hr.rect.left + hr.rect.width / 2, hr.rect.top + hr.rect.height / 2, host); await sleep(200);
    ok(/Look up “wisdom”/.test(menu()) && /Find “wisdom”/.test(menu()) && /Copy “wisdom”/.test(menu()), 'other books, nothing selected: Look up / Find / Copy “wisdom”');
    $('#ctxMenu button[data-a="look"]').click(); await sleep(100); ok(looked[looked.length - 1] === 'wisdom', 'Look up opens the lookup for it');
    rc(hr.rect.left + 3, hr.rect.top + 5, host); await sleep(150); $('#ctxMenu button[data-a="find"]').click(); await sleep(100); ok(finds[finds.length - 1] === 'wisdom', 'Find searches for it');
    const fr = wordRect(host, 'fear'); sel.removeAllRanges(); sel.addRange(fr.r); rc(hr.rect.left + 3, hr.rect.top + 5, host); await sleep(150);
    ok(/Look up “fear”/.test(menu()) && /Copy “fear”/.test(menu()), 'other books, a word selected: it is “fear”, not the word under the mouse');
    $('#ctxMenu button[data-a="copyword"]').click(); await sleep(150); ok(copied[copied.length - 1] === 'fear', 'Copy copies the selected word');
    const e2 = rc(20, 20, document.body); ok(menu() === '' || !menu().includes('Look up'), 'elsewhere (outside the books) nothing is added');
    host.remove();
    // ---- the Bible chooser: never longer than the window (it scrolls inside), and gone the moment the mouse leaves it
    const btn = $('.bvbible'); TimotheosViewUI.bibleMenu(btn, 0); await sleep(250); const m = $('.bvmenu.biblemenu');
    ok(!!m && m.getBoundingClientRect().bottom <= innerHeight && parseFloat(m.style.maxHeight) <= innerHeight - btn.getBoundingClientRect().bottom, 'the Bible list fits the window (max ' + (m && m.style.maxHeight) + ')');
    const list = m.querySelector('.bvlist'); for (let i = 0; i < 40; i++) list.insertAdjacentHTML('beforeend', '<button data-b="x' + i + '"><b>X' + i + '</b></button>'); await sleep(100);
    ok(m.scrollHeight > m.clientHeight && getComputedStyle(m).overflowY !== 'hidden', 'a long list scrolls inside the menu');
    m.scrollTop = 99999; await sleep(100); ok(m.scrollTop > 0, 'and it can be scrolled down');
    m.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false })); await sleep(60); ok(!$('.bvmenu.biblemenu'), 'the list goes away the moment the mouse leaves it (no delay)');
  } catch (e) { out.push('✗ ERROR ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  api.copyText = orig; window.showLookup = origLook; TimotheosSearch.find = origFind;
  console.log('RESULT ' + out.join(' | '));
})();
