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
 key=(k)=>document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));
 key('F5'); await sl(900);
 {const l=document.querySelector('.cvmleft'),r=document.querySelector('.cvmright'),sp=document.getElementById('cvSplit');
  const lb=l&&l.getBoundingClientRect(),rb=r&&r.getBoundingClientRect(),bx=document.querySelector('#modal .box').getBoundingClientRect();
  ok(lb&&rb&&rb.top>=lb.bottom-1,'Copy verses: settings above, preview below');
  ok(bx.width<=window.innerWidth+1,'Copy verses fits the screen width: '+Math.round(bx.width)+' of '+window.innerWidth);
  const h0=lb.height,y=sp.getBoundingClientRect().top+7,x=sp.getBoundingClientRect().left+100;
  const ev=(t,yy)=>sp.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:yy,pointerId:5,bubbles:true}));
  ev('pointerdown',y);ev('pointermove',y-80);ev('pointerup',y-80); await sl(200);
  const h1=l.getBoundingClientRect().height; ok(h1<h0-60,'dragging the divider up shrinks the settings: '+Math.round(h0)+' -> '+Math.round(h1));
  const y2=sp.getBoundingClientRect().top+7; ev('pointerdown',y2);ev('pointermove',y2+150);ev('pointerup',y2+150); await sl(200);
  ok(l.getBoundingClientRect().height>h1+100,'dragging it down grows the settings');}
 console.log('RESULT '+out.join(' | '));})();
