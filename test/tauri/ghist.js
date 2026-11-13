/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Android: global Back / Forward in the top bar. EXTRA=',"windowBounds":{"width":390,"height":800}'
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 document.documentElement.classList.add('mobile'); await sl(800);
 const B=document.getElementById('gBack'),F=document.getElementById('gFwd'),on=()=>document.querySelector('#phonebar button.on').dataset.id;
 const bar=document.getElementById('toolbar').getBoundingClientRect(),bb=B.getBoundingClientRect(),fb=F.getBoundingClientRect(),mm=document.getElementById('tbMenus').getBoundingClientRect();
 ok(bb.width>0&&fb.width>0&&bb.left>mm.right&&fb.right<bar.right-100,'Back and Forward sit in the middle of the top bar: '+Math.round(bb.left)+'-'+Math.round(fb.right)+' of '+Math.round(bar.width));
 ok(B.disabled&&F.disabled,'both are off before anything has happened');
 const first=on(); let id=null;
 for(const m of (state.modules.books||[])){ await TimotheosModules.openBookModule(m.id); await sl(400); if(TimotheosModules.lib.cur===m.id){id=m.id;break;} }
 await sl(800);
 ok(on()==='lib'&&!B.disabled,'opening a library entry shows the Library page; Back is on: '+on());
 let n=0; while(on()!==first&&n<8&&!B.disabled){B.click(); await sl(1800); n++;}
 ok(on()===first&&!F.disabled,'Back (x'+n+') shows the Bible again: '+on());
 for(let k=0;k<n;k++){F.click(); await sl(1800);} ok(on()==='lib'&&TimotheosModules.lib.cur===id,'Forward shows the library entry again: '+on()+' '+TimotheosModules.lib.cur);
 // a chapter, then back
 [...document.querySelectorAll('#phonebar button')].find(b=>/^bv/.test(b.dataset.id)).click(); await sl(800);
 await go({b:19,c:23,v:1}); await sl(1500);
 B.click(); await sl(2500); ok(state.ref.b!==19,'Back undoes the move to Psalm 23: book '+state.ref.b);
 F.click(); await sl(2500); ok(state.ref.b===19&&state.ref.c===23,'Forward goes to Psalm 23 again');
 // a word lookup: Bible → lookup page → Back → Forward
 [...document.querySelectorAll('#phonebar button')].find(b=>/^bv/.test(b.dataset.id)).click(); await sl(1200);
 const bibleId=on(); await showLookup({word:'God',strongs:['G2316']}); await sl(1800);
 ok(on()==='lib'&&document.getElementById('tab-lib').classList.contains('lookfeed'),'a word lookup shows its entry on the Library page');
 const title=document.getElementById('lkpTitle').textContent; await sl(800);
 B.click(); await sl(2000); ok(on()===bibleId,'Back from the lookup shows the Bible again: '+on());
 F.click(); await sl(2000); ok(on()==='lib'&&document.getElementById('tab-lib').classList.contains('lookfeed')&&document.getElementById('lkpTitle').textContent===title,'Forward shows the same lookup entry again: '+document.getElementById('lkpTitle').textContent);
 // the translation: Bible A, then Bible B on the same verse → Back shows Bible A again, Forward Bible B
 [...document.querySelectorAll('#phonebar button')].find(b=>/^bv/.test(b.dataset.id)).click(); await sl(1200);
 await go({b:43,c:3,v:16}); await sl(1500);
 const bibles=(state.modules.bibles||[]).map(x=>x.id), A=views()[0].bible, Bb=bibles.find(x=>x!==A);
 ok(!!Bb,'two Bibles are installed to switch between');
 if(Bb){ await useBible(Bb); await sl(2200); ok(views()[0].bible===Bb,'the view now shows the other Bible');
  B.click(); await sl(3000); ok(views()[0].bible===A&&state.ref.b===43&&state.ref.c===3,'Back shows the first Bible again on the same verse: '+views()[0].bible);
  F.click(); await sl(3000); ok(views()[0].bible===Bb&&state.ref.b===43&&state.ref.c===3,'Forward shows the second Bible again: '+views()[0].bible); }
 console.log('RESULT '+out.join(' | '));})();
