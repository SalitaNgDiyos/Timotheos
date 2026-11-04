// Android extras: chapter swipe, Tab name colour in a Bible view, copy to the clipboard. EXTRA=',"windowBounds":{"width":390,"height":800}'
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 document.documentElement.classList.add('mobile'); await sl(300);
 await go({b:43,c:3,v:1}); await sl(700);
 const t=document.querySelector('.dgroup.pactive .bvtext');
 const fire=(type,x,y)=>{const e=new Event(type,{bubbles:true,cancelable:true}); const pt={clientX:x,clientY:y,identifier:1,target:t}; e.touches=type==='touchend'?[]:[pt]; e.changedTouches=[pt]; t.dispatchEvent(e);};
 const swipe=async(dx,dy=5)=>{fire('touchstart',200,300);fire('touchend',200+dx,300+dy);await sl(2200);};
 await swipe(-120); ok(state.ref.b===43&&state.ref.c===2,'swipe left → previous chapter: John '+state.ref.c);
 await swipe(120); ok(state.ref.c===3,'swipe right → next chapter: John '+state.ref.c);
 await swipe(120); ok(state.ref.c===4,'swipe right again → John '+state.ref.c);
 await swipe(40); ok(state.ref.c===4,'a short swipe does nothing');
 await swipe(150,150); ok(state.ref.c===4,'a mostly vertical swipe does nothing');
 // tab name colour on the verse button
 TimotheosPanelSkin.set('bv0','tab','#ff0000'); await sl(200);
 const pill=document.querySelector('.dgroup.pactive .navpill'); ok(getComputedStyle(pill).color==='rgb(255, 0, 0)','Tab name colour reaches the verse button: '+getComputedStyle(pill).color);
 TimotheosPanelSkin.defaults('bv0'); await sl(200); ok(getComputedStyle(pill).color!=='rgb(255, 0, 0)','Default Colors takes it off again');
 // clipboard
 await api.copyText('Plain Zed 123','<b>Plain Zed 123</b>'); await sl(300); ok((await api.clipRead())==='Plain Zed 123','copy puts the text on the clipboard');
 console.log('RESULT '+out.join(' | '));})();
