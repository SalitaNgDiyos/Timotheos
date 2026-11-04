// Android-only bigger controls in the panel strips: run with EXTRA=',"windowBounds":{"width":390,"height":800}'
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const small=()=>{const g=document.querySelector('.dgroup.pactive');return [...g.querySelectorAll('.dcap .dbtn:not([style*="none"]) svg')].filter(s=>s.getBoundingClientRect().width>0).map(s=>Math.round(s.getBoundingClientRect().width));};
 const before=small()[0];
 document.documentElement.classList.add('mobile'); await sl(500);
 for(const id of ['bv0','cmt','lib','search','tree']){const b=[...document.querySelectorAll('#phonebar button')].find(x=>x.dataset.id===id)||null; if(b){b.click(); await sl(400);}
  const g=document.querySelector('.dgroup.pactive'),cap=g.querySelector('.dcap').getBoundingClientRect();
  const els=[...g.querySelectorAll('.dcap svg')].filter(s=>s.getBoundingClientRect().width>0);
  const sizes=els.map(s=>Math.round(s.getBoundingClientRect().width));
  const over=els.some(s=>{const r=s.getBoundingClientRect();return r.right>cap.right+1||r.left<cap.left-1;});
  const hid=[...g.querySelectorAll('.dcap [data-nav],.dcap .dbtn')].filter(b=>b.offsetWidth===0&&getComputedStyle(b).display==='none'&&!/float|max/.test(b.dataset.act||'')&&!(b.dataset.act||'').startsWith('zoom'));
  ok(sizes.length&&Math.min(...sizes)>=20&&!over&&!hid.length,id+': icons '+sizes.join(',')+' in a strip '+Math.round(cap.height)+' high'+(over?' (OVERFLOW)':'')+(hid.length?' HIDDEN:'+hid.map(b=>b.dataset.nav||b.dataset.act).join(','):''));}
 console.log('RESULT before='+before+' '+out.join(' | '));})();
