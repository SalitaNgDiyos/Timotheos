// phone layout: run with EXTRA=',"windowBounds":{"width":390,"height":800}' bash test/tauri/run.sh test/tauri/phone.js out.png
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const on=()=>document.querySelector('#phonebar button.on');
 ok(document.documentElement.classList.contains('phone'),'phone layout is on');
 ok(/^bv/.test(on().dataset.id),'starts on a Bible view');
 const btn=[...document.querySelectorAll('#phonebar button')].find(b=>/search/.test(b.dataset.id)); ok(btn&&btn.textContent.trim()==='Search','the search place is called "Search": '+(btn&&btn.textContent.trim()));
 btn.click(); await sl(500); ok(/search/.test(on().dataset.id),'tap Search shows the search page');
 document.querySelector('.dgroup.pactive .dtab[data-id="bsearch"]').click(); await sl(600);
 ok(document.querySelector('.dgroup.pactive [data-panel="bsearch"]') && !document.querySelector('.dgroup.pactive')?.classList.contains('isbv'),'Book search stays on the search page');
 document.querySelector('.dgroup.pactive .dtab[data-id="search"]').click(); await sl(600);
 ok(document.querySelector('.dgroup.pactive [data-panel="search"]') && /Search/.test(on().textContent),'Bible search stays on the search page');
 await go({b:19,c:23,v:1}); await sl(600); ok(/^bv/.test(on().dataset.id),'choosing a chapter shows the Bible');
 console.log('RESULT '+out.join(' | '));})();
