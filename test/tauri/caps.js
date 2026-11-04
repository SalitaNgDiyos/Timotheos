// desktop: panel icons sit at the right edge of every caption; About can be resized
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const caps=[...document.querySelectorAll('.dgroup')].filter(g=>g.offsetParent&&g.querySelector('.dcap'));
 for(const g of caps){const c=g.querySelector('.dcap').getBoundingClientRect(),b=g.querySelector('.dbtns').getBoundingClientRect();
  ok(c.right-b.right<8,(g.querySelector('.dtab.on')||{}).dataset.id+': icons at right edge, gap '+Math.round(c.right-b.right));}
 about(); await sl(500); const bx=document.querySelector('#modal .box'),cs=getComputedStyle(bx);
 ok(cs.resize==='both','About window is resizable ('+cs.resize+')');
 document.querySelector('#modalBtns button').click(); await sl(200);
 ok(getComputedStyle(document.querySelector('#modal .box')).resize==='none','resize turned off for other dialogs');
 console.log('RESULT '+out.join(' | '));})();
