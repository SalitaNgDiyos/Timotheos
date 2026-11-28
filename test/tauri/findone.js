(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms));const out=[];const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
try{await sl(1500);const ids=TimotheosState?0:0;}catch(e){}
try{ const st=window.state||(window.Timotheos&&Timotheos.state); const id=(st&&st.settings.openBibles[1])||null;
 await TimotheosSearch.find('God', id); await sl(2500);
 const t=document.querySelector('#searchStatus').textContent; ok(/in 1 Bible/.test(t),'search ran in only one Bible: '+t.slice(0,60));
}catch(e){ok(false,'error '+e.message);}
console.log('RESULT '+out.join(' | '));})();
