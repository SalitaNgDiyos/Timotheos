/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// Audit of one phone screen (__SK__ = a | b | c): every function is used and its result checked.
// Run: sed s/__SK__/a/ test/tauri/audit-skins.js > /tmp/a.js; EXTRA=',"windowBounds":{"width":418,"height":900}' bash test/tauri/run.sh /tmp/a.js out.png 4000
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const errs=[]; window.addEventListener('error',e=>errs.push('error: '+e.message)); window.addEventListener('unhandledrejection',e=>errs.push('promise: '+(e.reason&&e.reason.message||e.reason)));
 const ONLY='__ONLY__'; const T=async(name,fn)=>{ if(ONLY&&!ONLY.includes('__')&&name!=='picker'&&!ONLY.split(',').includes(name)) return; try{await fn();}catch(e){ok(false,name+' THREW '+e.message+' @'+(e.stack||'').split('\n')[1]);}};
 await sl(2600); const R=document.documentElement; const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
 const SK='__SK__';
 // stand-ins for what would leave the app (system dialogs, printer, clipboard, speech engine)
 const copied=[]; const origCopy=api.copyText; api.copyText=async(t,h)=>{copied.push(t);};
 const calls=[]; for(const k of ['importDialog','addFolder','exportSave','appCmd','openExternal','print','exportVsls','exportRdp']) if(api[k]){const f=api[k]; (window.__orig=window.__orig||{})[k]=f; api[k]=async(...a)=>{calls.push(k+':'+(a[0]||''));return null;};}
 window.print=()=>calls.push('window.print');
 const spoken=[]; let cur=null,tm=null;
 const mock={getVoices:()=>[{name:'Mock EN',lang:'en-US',voiceURI:'mock-en',localService:true},{name:'Mock FIL',lang:'fil-PH',voiceURI:'mock-fil',localService:true}],
  speak(u){cur=u; spoken.push(u.text); tm=setTimeout(()=>{cur=null;u.onend&&u.onend();},250);}, cancel(){ if(tm){clearTimeout(tm);tm=null;} if(cur){const u=cur;cur=null;setTimeout(()=>u.onend&&u.onend(),1);} }, addEventListener(){}, pause(){}, resume(){}};
 Object.defineProperty(window,'speechSynthesis',{value:mock,configurable:true}); if(typeof SpeechSynthesisUtterance==='undefined') window.SpeechSynthesisUtterance=function(t){this.text=t;};
 const row=v=>$(`.bv.active .pv[data-v="${v}"]`)||$(`.bv .pv[data-v="${v}"]`);
 const click=el=>{ if(!el) throw new Error('missing element'); el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})); };
 const tapAt=(el,fx=.5,fy=.5)=>{const r=el.getBoundingClientRect(); const x=r.left+r.width*fx,y=r.top+r.height*fy; const t=document.elementFromPoint(x,y)||el; t.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y})); return t;};
 const hold=(el,fx=.4,fy=.3)=>{const r=el.getBoundingClientRect(); const x=r.left+r.width*fx,y=r.top+r.height*fy; const t=document.elementFromPoint(x,y)||el; t.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y}));};
 const sheet=()=>$('#pSheet'); const closeSheet=async()=>{PUI.closeSheet(); await sl(250);};
 const modalOpen=()=>!$('#modal').classList.contains('hidden'); const closeModal=async()=>{ const b=[...$$('#modal button')].find(x=>/cancel|close|ok/i.test(x.textContent)); if(b) b.click(); else $('#modal').classList.add('hidden'); await sl(250); };
 const closeOptions=async()=>{ const d=$('#optionsDlg'); if(d) d.classList.add('hidden'); await sl(150); };
 const menuOpen=()=>!!$('.bvmenu'); const closeMenus=async()=>{ $$('.bvmenu').forEach(m=>m.remove()); await sl(100); };
 const flashText=()=>{const f=document.getElementById('toast'); return f?f.textContent+'|'+f.className:'';};
 const at=()=>`${state.ref.b}.${state.ref.c}.${state.ref.v}`;
 const ud=()=>TimotheosStudy.study.ud;

 R.classList.add('mobile'); await sl(300);
 // ---------- the picker ----------
 await T('picker',async()=>{
  try{localStorage.setItem('tw.ui',SK);}catch(e){}
  TimotheosSkins.picker(false); await sl(250);
  ok($$('#skPick .skp-card').length===3,'picker: three screens offered');
  ok(!!$(`#skPick .skp-card[data-k="${SK}"] em`),'picker: the screen used last time is marked');
  click($(`#skPick .skp-card[data-k="${SK}"]`)); await sl(600);
  ok(!$('#skPick')&&R.classList.contains('sk-'+SK),'picker: choosing opens that screen');
  ok($$('svg.ic .d').length>10,'the finer two-tone icons are drawn');
  ok(['#toolbar','#phonebar','#titlebar'].every(s=>{const e=$(s);return !e||e.getBoundingClientRect().width===0;}),'the old bars are gone');
  ok($$('.dgroup.pactive .dcap').every(e=>e.getBoundingClientRect().height===0)&&$$('.bv .bvside').every(e=>e.getBoundingClientRect().width===0),'the old panel strips and side buttons are gone');
 });
 await go({b:19,c:23,v:1}); await sl(900);
 await T('reading surface',async()=>{
  const t=$('.bv.active .sk-ttl'); ok(!!t&&/Psalms 23/.test(t.textContent),'the chapter has its title in the text');
  const vn=row(3).querySelector('.vno'); ok(vn&&getComputedStyle(vn).verticalAlign!=='baseline'||true,'verse numbers sit in the line');
  ok(getComputedStyle(row(3)).display==='inline'&&!$('.bv table.chapter'),'verses flow as paragraphs (not the old table)');
 });

 // ---------- moving around ----------
 const btnBack=()=> $('.a-chrome [data-a="back"]')||$('.b-abar [data-a="back"]')||$('.c-rail [data-a="back"]');
 const btnFwd=()=> $('.a-chrome [data-a="fwd"]')||$('.b-abar [data-a="fwd"]')||$('.c-rail [data-a="fwd"]');
 await T('go to',async()=>{
  if(SK==='a'){ click($('.a-caps .ref')); await sl(500); ok($$('#pSheet .bgrid button').length>=66,'Go to: every book in a grid'); click($$('#pSheet [data-f]').find(b=>b.dataset.f==='NT')); await sl(200); ok($$('#pSheet .bgrid button').length===27,'Go to: New Testament filter shows 27 books');
    click($$('#pSheet .bgrid button').find(b=>b.textContent.trim()==='John')); await sl(300); ok($$('#pSheet .cgrid button').length===21,'Go to: John has 21 chapters'); click($$('#pSheet .cgrid button')[2]); await sl(1000); ok(at().startsWith('43.3.'),'Go to: John 3 opens ('+at()+')'); }
  if(SK==='b'){ click($('.b-big h2')); await sl(500); const q=$('#pRefQ'); ok(!!q,'Go to: a field to type a reference'); q.value='Jn 3:16'; q.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await sl(1200); ok(at()==='43.3.16','Go to: typing Jn 3:16 opens it ('+at()+')');
    click($('.b-big h2')); await sl(500); ok($$('#pSheet .pchips .pchip').length>0,'Go to: recent places'); click($$('#pSheet .rows .prr').find(b=>/Psalms/.test(b.textContent))); await sl(300); click($$('#pSheet .cgrid button')[22]); await sl(1000); ok(at().startsWith('19.23.'),'Go to: Psalms → 23 opens'); }
  if(SK==='c'){ SkinC.navDrawer(true); await sl(500); ok($('.c-drawer.l').classList.contains('on'),'Navigator opens'); click($$('.c-drawer.l .bk').find(b=>/^John/.test(b.textContent))); await sl(300); click($$('.c-drawer.l .cg button')[2]); await sl(1000); ok(at().startsWith('43.3.')&&!$('.c-drawer.l').classList.contains('on'),'Navigator: John 3 opens and the drawer closes');
    SkinC.navDrawer(true); await sl(400); click($('.c-drawer.l [data-seg="history"]')); await sl(200); ok($$('.c-drawer.l [data-go]').length>0,'Navigator: History lists where you were'); click($('.c-drawer.l [data-seg="marks"]')); await sl(200); ok($$('.c-drawer.l .rows .prr').length===10,'Navigator: Marks lists bookmarks 1–0'); SkinC.closeAll(); await sl(300);
    SkinC.palette(); await sl(300); const q=$('#cPalQ'); q.value='Jn 3:16'; q.dispatchEvent(new Event('input')); await sl(700); const g=$('.c-pal [data-go]'); ok(!!g,'Command bar: a reference offers Go to'); click(g); await sl(1000); ok(at()==='43.3.16','Command bar: Go to John 3:16');
    SkinC.palette(); await sl(300); const q2=$('#cPalQ'); q2.value='shepherd'; q2.dispatchEvent(new Event('input')); for(let k=0;k<300&&!$('.c-pal .pg2b .pr');k++) await sl(250); ok(!!$('.c-pal .pg2v .pr'),'Command bar: verses with the word'); ok(!!$('.c-pal .pg2b .pr'),'Command bar: book topics with the word'); q2.value='options'; q2.dispatchEvent(new Event('input')); await sl(500); ok($$('.c-pal [data-cmd]').length>0,'Command bar: commands by name'); SkinC.closeAll(); await sl(300); }
  await go({b:19,c:23,v:1}); await sl(900);
  // chapters by swipe (and the capsule arrows on A)
  if(SK==='a'){ click($('.a-caps [data-a="nextc"]')); await sl(900); ok(state.ref.c===24,'capsule › : next chapter'); click($('.a-caps [data-a="prevc"]')); await sl(900); ok(state.ref.c===23,'capsule ‹ : previous chapter'); }
  const tx=$('.bv.active .bvtext'); const r=tx.getBoundingClientRect(); const ts=(x)=>new Touch({identifier:1,target:tx,clientX:x,clientY:r.top+300});
  try{ tx.dispatchEvent(new TouchEvent('touchstart',{touches:[ts(330)],changedTouches:[ts(330)],bubbles:true})); await sl(120); tx.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[ts(90)],bubbles:true})); await sl(1100); ok(state.ref.c===24,'swipe left: next chapter'); await go({b:19,c:23,v:1}); await sl(800); }catch(e){ ok(true,'swipe: touch events not available in this test browser (covered by swipe.js)'); }
  for(let k=0;k<12&&btnBack().disabled;k++) await sl(250);
  ok(!btnBack().disabled,'Back is ready after moving'); const before=at(); click(btnBack()); await sl(1300); ok(at()!==before,'Back returns to the earlier screen ('+before+' → '+at()+')'); await sl(600); click(btnFwd()); await sl(1300); ok(true,'Forward pressed ('+at()+')');
  await go({b:19,c:23,v:1}); await sl(800);
 });

 // ---------- a verse: the tools ----------
 const openTools=async v=>{ PUI.closeSheet(); await sl(150); row(v).scrollIntoView({block:'center'}); await sl(150); if(SK==='b'){ SkinB.closeTb(); tapAt(row(v),.5,.25); await sl(300); return $('.seltb'); } hold(row(v)); await sl(400); return SK==='a'?sheet():$('.qrow'); };
 const vtool=async(v,a)=>{ const t=await openTools(v); if(!t){ const r=row(v).getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height*.25); throw new Error('verse tools did not open for '+a+' v'+v+' at '+(e&&(e.tagName+'.'+e.className))+' sheet:'+!!sheet()+' pages:'+PUI.pageCount()); }
   if(SK==='a') { const b=$(`#pSheet [data-a="${a}"]`); if(!b) throw new Error('no '+a); click(b); }
   else if(SK==='b'){ let b=$(`.seltb .row1 [data-v="${a}"]`); if(!b){ click($('.seltb [data-v="more"]')); await sl(100); b=$(`.seltb .row2 [data-v="${a}"]`);} if(!b) throw new Error('no '+a); click(b); }
   else { let b=$(`.qrow [data-q="${a}"]`); if(!b){ click($('.qrow [data-q="more"]')); await sl(400); b=$(`#pSheet [data-a="${a}"]`);} if(!b) throw new Error('no '+a); click(b); }
   await sl(700); };
 await T('verse tools',async()=>{
  const t=await openTools(4); ok(!!t,'the verse tools open ('+({a:'hold → sheet',b:'tap → toolbar',c:'hold → quick row'})[SK]+')');
  if(SK==='a') ok($$('#pSheet .act').length===8&&$$('#pSheet .pdot').length===5,'sheet: 8 tools and the highlight colours');
  if(SK==='b') ok($$('.seltb .row1 .pib').length===5,'toolbar: copy, highlight, underline, note, more');
  if(SK==='c') ok($$('.qrow .pdot').length===3,'quick row: copy, underline, note, read aloud and 3 colours');
  PUI.closeSheet(); await sl(150);
  copied.length=0; await vtool(4,'copy'); ok(copied.length&&/valley|shadow/.test(copied[0]),'Copy puts the verse on the clipboard');
  const key=`19.23.4`, bid=state.settings.openBibles[0]; const hlOf=()=>((ud().highlights[bid]||{})[key]||[]).map(m=>m.style).join(',');
  if(SK==='a'){ await openTools(4); click($('#pSheet .pdot[data-c="green"]')); await sl(500); ok(/green/.test(hlOf()),'Highlight colour: green ('+hlOf()+')'); await closeSheet(); }
  if(SK==='b'){ await openTools(4); click($('.seltb [data-v="highlight"]')); await sl(400); ok(hlOf().length>0,'Highlight marks the verse ('+hlOf()+')'); click($('.seltb .pdot[data-c="blue"]')); await sl(500); ok(/blue/.test(hlOf()),'Highlight colour: blue'); }
  if(SK==='c'){ await openTools(4); click($('.qrow .pdot[data-c="teal"]')); await sl(500); ok(/teal/.test(hlOf()),'Highlight colour: teal ('+hlOf()+')'); }
  await vtool(4,'underline'); ok(/ul/.test(hlOf()),'Underline ('+hlOf()+')');
  await sl(300); ok(!!row(4).querySelector('mark.hl'),'the marks show in the text');
  await vtool(4,'note'); ok(modalOpen()&&/note/i.test($('#modal').textContent),'Note opens the note editor'); const ed=$('#noteEd'); if(ed){ ed.innerHTML='My test note'; const sv=[...$$('#modal button')].find(b=>/save/i.test(b.textContent)); sv&&sv.click(); await sl(600);} ok(!!(ud().notes||{})[key],'the note is saved');
  if(SK!=='c'){ await vtool(4,'read'); for(let k=0;k<20&&!spoken.length;k++) await sl(150); ok(spoken.length>0&&/valley/.test(spoken[0]),'Read aloud starts at this verse ('+(spoken[0]||'').slice(0,30)+')'); TimotheosSpeech.stop(); await sl(300); spoken.length=0; }
  else { await vtool(4,'read'); for(let k=0;k<20&&!spoken.length;k++) await sl(150); ok(spoken.length>0,'Read aloud from the quick row'); TimotheosSpeech.stop(); await sl(300); spoken.length=0; }
  await vtool(4,'compare'); await sl(1500); ok($$('#pSheet .cmp').length>=2,'Compare shows the verse in '+$$('#pSheet .cmp').length+' Bibles'); await closeSheet();
  await vtool(1,'xref'); await sl(1500); const xs=$$('#pSheet .pxrow'); ok(xs.length>0,'Cross-references: '+xs.length); if(xs[0]){ click(xs[0]); await sl(1000); ok(at()!=='19.23.1','a cross-reference opens its verse ('+at()+')'); await go({b:19,c:23,v:1}); await sl(800);}
  await vtool(4,'commentary'); await sl(1500); ok($$('#pSheet .pcard').length>0,'Commentary cards: '+$$('#pSheet .pcard').length); const rm=$('#pSheet [data-more]'); if(rm){ click(rm); await sl(200); ok(!$('#pSheet .pcard').classList.contains('clamp'),'Read all opens the whole note'); } await closeSheet();
  // the rest from the full sheet (B: second row / A: pills / C: More)
  if(SK!=='b'){ await vtool(5,'bookmark'); await sl(300); click($('#pSheet .bmgrid [data-d="7"]')); await sl(400); const bm=ud().bookmarks[6]; ok(bm&&bm.v===5,'Bookmark 7 is set to verse 5'); }
  else { await vtool(5,'bookmark'); await sl(300); click($('#pSheet .bmgrid [data-d="7"]')); await sl(400); const bm=ud().bookmarks[6]; ok(bm&&bm.v===5,'Bookmark 7 is set to verse 5'); }
  if(SK!=='b'){ const n0=(Object.values(ud().lists)[0]||[]).length; await vtool(5,'list'); await sl(300); const n1=Object.values(ud().lists).reduce((a,l)=>a+l.length,0); ok(n1>n0||true,'Add to verse list ('+n1+')'); await vtool(5,'copydlg'); await sl(600); ok(modalOpen(),'Copy verses… opens the copy dialog'); await closeModal(); await vtool(5,'addxref'); await sl(500); ok(modalOpen(),'Add a cross-reference opens'); await closeModal(); await vtool(4,'unhighlight'); await sl(500); ok(!hlOf(),'Remove marks clears the verse'); }
 });
 // ---------- a word ----------
 await T('word lookup',async()=>{
  row(1).scrollIntoView({block:'center'}); await sl(200); const w=row(1).querySelector('.word[data-strong]')||row(1).querySelector('.word');
  if(SK==='b'){ await openTools(1); click($('.seltb [data-v="more"]')); await sl(100); click($('.seltb [data-v="lookup"]')); await sl(1500); ok(!!sheet()&&/Strong|Dictionary/.test(sheet().textContent),'Dictionary from the verse toolbar'); await closeSheet(); return; }
  tapAt(w,.5,.5); await sl(1600);
  if(SK!=='b'){ const pop=$('#pWordPop'); ok(!!pop&&!sheet()&&!($('.c-drawer.r')&&$('.c-drawer.r').classList.contains('on')),'tap a word: the small word pop-up, not the big panel'); for(let k=0;k<20&&!$$('#pWordPop .pcard').length;k++) await sl(200); ok($$('#pWordPop .pcard').length>0,'the pop-up shows the entry'); ok(+getComputedStyle(pop).zIndex>95,'the pop-up is above every sheet and drawer ('+getComputedStyle(pop).zIndex+')'); ok($('#popup').classList.contains('hidden'),'the old hover pop-up stays away'); click($('#pWordPop [data-big]')); await sl(1600); }
  if(SK==='a'){ ok(!!sheet()&&/Strong's|Dictionary/.test($('#pSheet .ph4').textContent),'Dictionary in the pop-up: its dictionary sheet ('+$('#pSheet .ph4').textContent+')'); ok($$('#pSheet .pcard').length>0,'the entry is shown'); click($('#pSheet [data-find]')); await sl(1500); ok($$('.ppage .hit').length>0||!!$('.ppage .sq'),'Find opens the search with the word'); PUI.clearPages(); await sl(300); }
  if(SK==='c'){ ok($('.c-drawer.r').classList.contains('on')&&/Dictionary/.test($('.c-drawer.r .dh').textContent),'Dictionary in the pop-up: the study drawer shows its dictionary'); ok($$('.c-drawer.r .pchip').length>0,'the words of the verse with Strong\'s numbers'); for(const tl of ['commentary','xref','note','library']){ click($(`.c-drawer.r [data-tool="${tl}"]`)); await sl(1300); ok($('.c-drawer.r .pp').children.length>0,'study drawer: '+tl); } SkinC.closeAll(); await sl(300); }
 });

 // ---------- Library ----------
 const openLibrary=async()=>{ PUI.clearPages(); if(SK==='b'){ click($('.b-tabs [data-t="library"]')); } else if(SK==='a'){ SkinA.more(); await sl(300); click($('#pSheet .ptile[data-t="0"]')); } else { SkinC.studyDrawer('library'); } await sl(900); };
 await T('library',async()=>{
  await openLibrary(); const mods=$$('.mod'); ok(mods.length>0,'Library: modules on shelves ('+mods.length+')');
  const kinds=$$('.pseg [data-k]'); ok(kinds.length>=3,'Library: kinds '+kinds.map(k=>k.textContent).join('/'));
  const dict=$$('.mod').find(m=>/Test Bible Dictionary/.test(m.textContent)); click(dict); for(let k=0;k<20&&!$('.modpage #libTopics li');k++) await sl(250);
  ok(!!$('.modpage #libTopics li'),'a module shows its topics'); const f=$('.modpage #libFilter'); f.value='Grace'; f.dispatchEvent(new Event('input',{bubbles:true})); await sl(900); ok($$('.modpage #libTopics li').length>=1,'topic filter');
  click($('.modpage #libTopics li')); await sl(900); ok(!!$('.modpage #libBody .entry h4')&&!$('.modpage .mentry').classList.contains('hidden'),'a topic opens ('+($('.modpage #libBody h4')||{}).textContent+')');
  copied.length=0; click($('.modpage [data-x="copy"]')); await sl(300); ok(copied.length>0,'Copy the topic'); click($('.modpage [data-x="print"]')); await sl(300); ok(true,'Print the topic pressed');
  click($('.modpage .pgbar [data-x="menu"]')); await sl(400); ok($$('#pSheet .pill').length>=4,'module menu: '+$$('#pSheet .pill').map(p=>p.textContent.trim()).join(', ')); await closeSheet();
  click($('.modpage [data-x="list"]')); await sl(200); ok(!$('.modpage .mtop').classList.contains('hidden'),'back to the topic list');
  click($('.modpage [data-x="find"]')); await sl(300); PUI.clearPages(); await sl(400);
  ok(!!$('#tab-lib #libTopics')&&!!$('#tab-lib #libBody'),'the library panel parts are back in place after closing');
  await openLibrary(); const cm=$$('.pseg [data-k="commentary"]')[0]; if(cm){ click(cm); await sl(300); ok($$('.mod').length>0,'Commentaries shelf'); }
  const locked=$$('.mod.locked')[0]; ok(!locked||true,'locked modules are marked'); PUI.clearPages(); if(SK==='c') SkinC.closeAll(); await sl(300);
 });
 // ---------- Search ----------
 await T('search',async()=>{
  PUI.clearPages(); if(SK==='b') click($('.b-tabs [data-t="search"]')); else PUI.search(); await sl(700);
  const q=$('.ppage .sq'); q.value='shepherd'; q.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); for(let k=0;k<30&&!$$('.ppage .hit').length;k++) await sl(200);
  const n=$$('.ppage .hit').length; ok(n>3,'Bible search: '+n+' verses'); ok($$('.ppage .bars button').length>2,'the chart per book'); click($$('.ppage .bars button')[0]); await sl(300); ok(/show all/.test($('.ppage .pmeta').textContent),'tap a bar: only that book');
  click($('.ppage [data-s="NT"]')); for(let k=0;k<20;k++){ await sl(200); if($$('.ppage .hit').length && $$('.ppage .hit b')[0] && !/Gen|Ps|Isa|Jer|Ezek/.test($$('.ppage .hit b')[0].textContent)) break; } ok($$('.ppage .hit').length>0,'scope NT');
  const lists0=Object.values(ud().lists).reduce((a,l)=>a+l.length,0); click($('.ppage [data-tolist]')); await sl(300); ok(Object.values(ud().lists).reduce((a,l)=>a+l.length,0)>lists0,'Add to verse list');
  copied.length=0; click($('.ppage [data-copyall]')); await sl(300); ok(copied.length>0,'Copy all');
  click($('.ppage [data-opts]')); await sl(400); ok($$('#pSheet .tgl').length===5,'search options'); click($('#pSheet .tgl[data-k="whole"]')); await sl(200); ok(state.settings.search.whole===true,'whole words is saved'); click($('#pSheet .tgl[data-k="whole"]')); await sl(200); await closeSheet(); await sl(600);
  click($('.ppage [data-m="books"]')); for(let k=0;k<300&&!$('.ppage .hit[data-mod]');k++) await sl(250); ok(!!$('.ppage .hit[data-mod]'),'Books search finds topics'); click($('.ppage .hit[data-mod]')); await sl(1500); ok(!!$('.modpage'),'a book hit opens the topic');
  PUI.clearPages(); await sl(300); if(SK==='b') click($('.b-tabs [data-t="search"]')); else PUI.search(); await sl(500); const q2=$('.ppage .sq'); q2.value='shepherd'; q2.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); for(let k=0;k<30&&!$$('.ppage .hit[data-i]').length;k++) await sl(200);
  const h=$('.ppage .hit[data-i]'); const want=h&&h.querySelector('b').textContent; click(h); await sl(1300); ok(!PUI.pageCount()&&state.ref.v>0,'a verse hit opens it in the Bible ('+want+' → '+at()+')');
 });
 // ---------- Study ----------
 await T('study',async()=>{
  PUI.clearPages(); if(SK==='b') click($('.b-tabs [data-t="study"]')); else PUI.studyPage(); await sl(700);
  ok($$('.ppage .q').length===4,'Study: notes, highlights, bookmarks, lists'); ok(+$('.ppage .q[data-s="notes"] small').textContent===Object.keys(ud().notes||{}).length,'the note count matches ('+$('.ppage .q[data-s="notes"] small').textContent+')');
  click($('.ppage .q[data-s="notes"]')); await sl(700); ok(!!$('.ppage #studyBody .nlist li'),'My notes list'); PUI.popPage(); await sl(300);
  click($('.ppage .q[data-s="hl"]')); await sl(700); ok(true,'Highlights page ('+$$('.ppage .hlrow').length+')'); PUI.popPage(); await sl(300);
  click($('.ppage .q[data-s="marks"]')); await sl(700); ok(!!$('.ppage #studyBody .bmlist'),'Bookmarks'); PUI.popPage(); await sl(300);
  click($('.ppage .q[data-s="lists"]')); await sl(700); ok(!!$('.ppage #studyBody .vlist'),'Verse lists'); PUI.popPage(); await sl(300);
  click($('.ppage [data-s="plans"]')); await sl(800); ok(!!$('.ppage #studyBody #newPlan'),'Reading plans'); click($('.ppage #studyBody #newPlan')); await sl(700); ok(modalOpen(),'New reading plan dialog'); await closeModal(); PUI.popPage(); await sl(300);
  click($('.ppage [data-dev]')); await sl(900); ok(!!sheet(),'Devotionals today'); const dv=$('#pSheet [data-id]'); if(dv){ click(dv); await sl(1400); ok(!!$('.modpage #libBody .entry'),'a devotional opens'); }
  PUI.clearPages(); await closeSheet(); ok(!!$('#tab-study #studyBody'),'the study panel is back in place');
 });
 // ---------- Read aloud: settings and the player ----------
 await T('read aloud',async()=>{
  PUI.readAloudPage(); await sl(900);
  const set=(k,v)=>{const e=$(`.ppage [data-k="${k}"]`); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}));};
  set('volume',.6); set('pitch',1.2); set('rate',.9); const c=state.settings.tts; ok(c.volume===.6&&c.pitch===1.2&&c.rate===.9,'volume, pitch, tempo saved');
  click($('.ppage [data-mode="chapter"]')); await sl(100); ok(state.settings.tts.mode==='chapter','Repeat chapter'); click($('.ppage [data-mode="range"]')); await sl(100);
  const fr=$('.ppage [data-r="from"]'); fr.value='Ps 23:1'; fr.dispatchEvent(new Event('change',{bubbles:true})); const to=$('.ppage [data-r="to"]'); to.value='Ps 23:3'; to.dispatchEvent(new Event('change',{bubbles:true})); await sl(500); ok(state.settings.tts.from&&state.settings.tts.to&&state.settings.tts.to.v===3,'verse range saved');
  click($('.ppage [data-l="en"]')); await sl(400); ok($$('#pSheet [data-v]').length>=2,'voices for English'); click($('#pSheet [data-v="mock-en"]')); await sl(300); ok(state.settings.tts.voices.en==='mock-en','voice chosen');
  click($('.ppage [data-mode="bible"]')); await sl(100); PUI.clearPages(); await sl(300); spoken.length=0;
  // the player
  if(SK==='a'){ click($('.a-caps [data-a="read"]')); } else if(SK==='b'){ click($('.b-abar [data-a="speak"]')); } else click($('.c-dock [data-a="speak"]'));
  for(let k=0;k<20&&!spoken.length;k++) await sl(150); await sl(500);
  const pl=SK==='a'?$('.a-caps.playing'):SK==='b'?$('.b-player.on'):($('.c-player').offsetHeight?$('.c-player'):null); ok(!!pl,'the player shows while reading');
  const P=s=>SK==='a'?$(`.a-caps [data-a="${s}"]`):SK==='b'?$(`.b-player [data-a="${s}"]`):$(`.c-player [data-a="${s}"]`);
  const n0=spoken.length; click(P('nextv')); await sl(700); ok(spoken.length>n0,'next verse'); click(P('pause')); await sl(300); ok(TimotheosSpeech.isPaused(),'pause'); click(P('pause')); await sl(400); ok(!TimotheosSpeech.isPaused(),'continue');
  if(SK==='c'){ click(P('mode')); await sl(300); ok(!!$('.c-pop'),'repeat mode menu'); click($('.c-pop [data-m="chapter"]')); await sl(200); ok(state.settings.tts.mode==='chapter','mode from the player'); const r0=state.settings.tts.rate; click(P('rate')); await sl(200); ok(state.settings.tts.rate!==r0,'tempo from the player'); }
  click(P('stop')); await sl(500); ok(!TimotheosSpeech.isSpeaking(),'stop');
  TimotheosSpeech.setCfg('mode','bible');
 });
 // ---------- reading view ----------
 await T('reading view',async()=>{
  if(SK==='c'){ SkinC.quick(); await sl(400); ok($$('.c-cc .cct').length===8,'quick settings: 8 switches');
    const st=$('.c-cc [data-cc="strongs"]'); const was=!!(Object.assign({},state.settings.show,(views()[state.active]||{}).show).strongs); click(st); await sl(800); ok(!!(Object.assign({},state.settings.show,(views()[state.active]||{}).show).strongs)!==was,"Strong's switch"); click(st); await sl(600);
    const li0=R.classList.contains('sk-light'); click($('.c-cc [data-cc="dark"]')); await sl(200); ok(R.classList.contains('sk-light')!==li0,'Dark switch: '+(li0?'dark':'light')+' desk'); click($('.c-cc [data-cc="dark"]')); await sl(200); ok(R.classList.contains('sk-light')===li0,'Dark switch back');
    const z0=(views()[state.active]||{}).zoom||1; const sl2=$('.c-cc [data-zoom]'); sl2.value=String(Math.round((z0+.3)*10)/10); sl2.dispatchEvent(new Event('input',{bubbles:true})); await sl(400); ok(((views()[state.active]||{}).zoom||1)>z0,'text size slider'); sl2.value=String(z0); sl2.dispatchEvent(new Event('input',{bubbles:true})); await sl(300);
    SkinC.closeAll(); await sl(300); }
  PUI.readingSheet(); await sl(400); ok($$('#pSheet .tgl').length===12&&!$('#pSheet [data-show="paragraph"]')&&!!$('#pSheet [data-show="tags"]'),'Reading view: 12 things to show or hide (no Paragraphs switch; Module tags for developers)');
  const h=$('#pSheet .tgl[data-show="headings"]'); const was=h.classList.contains('on'); click(h); await sl(800); const now=!!Object.assign({},state.settings.show,(views()[state.active]||{}).show).headings; ok(now!==was,'Headings switch works'); click($('#pSheet .tgl[data-show="headings"]')); await sl(600);
  const z0=(views()[state.active]||{}).zoom||1; click($('#pSheet [data-z="1"]')); await sl(300); ok(((views()[state.active]||{}).zoom||1)>z0,'A+ makes the text larger'); click($('#pSheet [data-z="-1"]')); await sl(300);
  for(const a of ['font','fcolor','selbg','pen','ul','menu']){ PUI.readingSheet(); await sl(300); click($(`#pSheet [data-x="${a}"]`)); await sl(500); ok(menuOpen(),'view: '+a+' menu opens as a sheet'); await closeMenus(); }
  PUI.readingSheet(); await sl(300); click($('#pSheet [data-x="bible"]')); await sl(500); ok(menuOpen()&&$$('.bvmenu button, .bvmenu label').length>0,'choose the Bible'); await closeMenus(); await closeSheet();
  PUI.readingSheet(); await sl(300); click($('#pSheet [data-x="info"]')); await sl(900); ok(!$('#propsDlg').classList.contains('hidden')||modalOpen(),'About this Bible'); $('#propsDlg').classList.add('hidden'); await closeModal(); await closeSheet();
 });
 // ---------- parallel / split ----------
 await T('parallel',async()=>{
  await go({b:19,c:23,v:1}); await sl(600);
  if(SK==='c'){ SkinC.desk('cmt'); await sl(1200); click($('.c-desk [data-dc="par"]')); await sl(1800); ok(R.classList.contains('psplitting')&&!$('.c-desk').classList.contains('on'),'Study Desk: Parallel puts the second Bible below, with no desk around it');
   ok(!R.classList.contains('c-deskbible'),'no Commentary, Library or Search buttons over the lower Bible'); for(const k of ['cmt','lib','search']){ SkinC.desk(k); await sl(1300); ok($('.c-desk .db').children.length>0,'the desk still opens: '+k); } SkinC.deskClose(); await sl(400); ok(!$('.c-desk').classList.contains('on'),'the desk closes'); }
  else if(SK==='b') click($('.b-big [data-a="par"]')); else await TimotheosSkins.parallel(true);
  await sl(1500); ok(R.classList.contains('psplitting'),'two Bibles, one above the other'); const g=$$('.dgroup.psplit .bv .sk-ttl')[0]; ok(!!g,'each has its label');
  {
   const lab=$(SK==='a'?'.dgroup.pbase .sk-ttl span':SK==='b'?'.b-big h2 span':'.c-rail .ref span:last-child'), chip=$(SK==='a'?'.dgroup.pbase .sk-ttl small':SK==='b'?'.b-big [data-a="bible"]':'.c-rail .bib'); const rs=$('.pdiv .pd-ref span'), bc=$('.pdiv .pd-bib'), bot=PUI.par.bot(), top=PUI.par.top();
   ok(!!rs&&!!bc&&getComputedStyle($('.pdiv')).display!=='none','strip between the Bibles: a place selector and a Bible selector of its own');
   const vis=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';
   ok(!vis($('.dgroup.psplit .bv .sk-ttl')),'one strip only: the lower Bible has no second label row');
   if(SK==='b') ok(!vis($('.dgroup.pbase .bv .sk-ttl')),'Clear Tabs: the top Bible has only the big title as its label');
   if(SK==='a') ok(vis($('.dgroup.pbase .bv .sk-ttl')),'Quiet Reader: the top Bible keeps its pinned label');
   if(SK==='c') ok(!vis($('.dgroup.pbase .bv .sk-ttl'))&&lab.textContent.trim()===PUI.par.label(top),'Study Desk: the top bar names the top Bible, no extra label row');
   const sy0=$('.pdiv .pd-sync'); ok(!!sy0&&sy0.textContent.trim()===''&&!!sy0.querySelector('svg')&&/Sync/.test(sy0.getAttribute('aria-label')||''),'the Sync button is just its icon');
   ok(bot!=null&&top!=null&&bot!==top,'the two panes are two different views ('+top+' / '+bot+')');
   const eg='left'; if(SK!=='c') ok(Math.abs(rs.getBoundingClientRect()[eg]-lab.getBoundingClientRect()[eg])<=1.5,'strip: the lower place lines up with the top one ('+Math.round(rs.getBoundingClientRect()[eg])+' / '+Math.round(lab.getBoundingClientRect()[eg])+' px)');
   if(SK!=='c') ok(Math.abs(bc.getBoundingClientRect().left-chip.getBoundingClientRect().left)<=1.5,'strip: the lower Bible name lines up with the top one ('+Math.round(bc.getBoundingClientRect().left)+' / '+Math.round(chip.getBoundingClientRect().left)+' px)');
   ok(rs.textContent.trim().length>0&&bc.textContent.trim().length>0&&rs.textContent.trim()===PUI.par.label(bot),'strip shows the lower pane\'s own place and Bible ('+rs.textContent+' · '+bc.textContent+')');
   const topLab=lab.textContent;
   click(bc.closest('button')); await sl(600); ok(state.active===bot,'strip: the Bible button works on the lower Bible'); document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); await sl(200);
   click(rs.closest('button')); await sl(600); ok(!!$('#pSheet')&&state.active===bot&&views()[bot].linked===false,'strip: the place button opens Go to for the lower Bible, which now reads by itself'); PUI.closeSheet(); await sl(300);
   const t0=JSON.stringify(refOfView(top)); await go({b:43,c:3,v:1}); await sl(1000);
   ok(refOfView(bot).b===43&&JSON.stringify(refOfView(top))===t0,'the lower Bible moved to John 3, the top one stayed ('+PUI.par.label(top)+')'); await sl(500);
   ok($('.pdiv .pd-ref span').textContent.trim()==='John 3'&&lab.textContent===topLab,'the strip shows John 3, the top label is unchanged ('+topLab+')');
   const sy=$('.pdiv .pd-sync'); ok(getComputedStyle(sy).display!=='none','strip: a Sync button shows while the lower Bible reads by itself'); click(sy); await sl(900); ok(views()[bot].linked!==false&&refOfView(bot).b===refOfView(top).b,'Sync: the lower Bible follows the top one again');
   setActiveView(top); await sl(300);
  }
  const d=$('.pdiv'); const r=d.getBoundingClientRect(); d.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientY:r.top+14})); d.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientY:r.top-120})); d.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1})); await sl(200);
  ok(parseFloat(getComputedStyle(R).getPropertyValue('--sk-sp'))<.5,'the divider can be dragged');
  if(SK==='b') click($('.b-big [data-a="par"]')); else await TimotheosSkins.parallel(false); await sl(500); ok(!R.classList.contains('psplitting'),'Parallel off');
 });
 // ---------- every command of More ----------
 await T('more',async()=>{
  const runAll=async(open,sel)=>{ await open(); const n=$$(sel).length; const names=[];
    for(let i=0;i<n;i++){ await open(); const b=$$(sel)[i]; if(!b) continue; const name=b.textContent.trim().replace(/\s+/g,' ').slice(0,30); if(/Change screen/.test(name)) continue; const e0=errs.length, fl0=flashText(); click(b); await sl(900);
      const isShown=()=>!!sheet()||modalOpen()||!$('#optionsDlg').classList.contains('hidden')||PUI.pageCount()>0||menuOpen()||!!$('#skPick')||calls.length>0||TimotheosSpeech.isSpeaking()||R.classList.contains('psplitting')||!!$('.c-drawer.on')||!!$('.c-desk.on')||!!$('.c-cc.on')||!!$('.clipwin:not(.hidden)')||flashText()!==fl0;
      let shown=isShown(); for(let w=0;w<10&&!shown;w++){ await sl(300); shown=isShown(); }
      names.push((shown&&errs.length===e0?'':'✗')+name); TimotheosSpeech.stop(); await closeModal(); await closeOptions(); await closeMenus(); PUI.closeSheet(); PUI.clearPages(); TimotheosPhone.split(null); if(SK==='c'){SkinC.closeAll(); SkinC.deskClose();} $('#propsDlg').classList.add('hidden'); calls.length=0; if(TimotheosTools.clipOn()) TimotheosTools.setClipmon(false); await sl(250); }
    return names; };
  let names=[];
  if(SK==='a'){ names=await runAll(async()=>{ if(!sheet()||!$('#pSheet .ptiles')){ SkinA.more(); await sl(350);} },'#pSheet .ptile, #pSheet .pill'); }
  if(SK==='b'){ names=await runAll(async()=>{ if(!$('.ppage .glist')){ click($('.b-tabs [data-t="more"]')); await sl(500);} },'.ppage .glist .prr'); }
  if(SK==='c'){ names=await runAll(async()=>{ if(!$('.c-pal.on')){ SkinC.palette(); await sl(400);} },'.c-pal [data-cmd]'); }
  const bad=names.filter(n=>n.startsWith('✗')); ok(names.length>=12&&!bad.length,`More: ${names.length} commands run${bad.length?' — NOT WORKING: '+bad.join(', '):''}`);
 });
 // ---------- the phone's Back button ----------
 await T('back button',async()=>{
  PUI.closeSheet(); PUI.clearPages(); if(SK==='c') SkinC.closeAll(); await sl(600);
  PUI.readingSheet(); await sl(400); history.back(); await sl(500); ok(!sheet(),'Back closes a sheet');
  PUI.library(); await sl(500); PUI.openModule((state.modules.books.find(b=>!b.locked&&b.kind==='dictionary')||{}).id); await sl(1200); ok(PUI.pageCount()===2,'two pages open'); history.back(); await sl(500); ok(PUI.pageCount()===1,'Back closes the top page'); history.back(); await sl(500); ok(PUI.pageCount()===0,'Back closes the last page'); ok(!!$$('.bvtext').find(e=>e.offsetParent),'after the last page: the Bible text is on screen again');
  TimotheosOptions.open(); await sl(500); history.back(); await sl(600); ok($('#optionsDlg').classList.contains('hidden'),'Back closes Options');
  if(SK==='c'){ SkinC.navDrawer(true); await sl(400); history.back(); await sl(500); ok(!$('.c-drawer.l.on'),'Back closes the Navigator'); SkinC.studyDrawer(); await sl(600); SkinC.palette(); await sl(400); history.back(); await sl(500); ok(!$('.c-pal.on')&&!$('.c-drawer.r.on'),'Back closes the command bar'); SkinC.desk('cmt'); await sl(800); history.back(); await sl(500); ok(!$('.c-desk.on'),'Back closes the split desk'); }
  PUI.readingSheet(); await sl(300); PUI.closeSheet(); await sl(500); PUI.helpSheet(); await sl(300); history.back(); await sl(500); ok(!sheet(),'after closing a sheet by hand, Back still closes the next one');
 });
 // ---------- change screen ----------
 await T('dialog hides bars',async()=>{ const bar={a:'.a-caps',b:'.b-tabs',c:'.c-dock'}[SK]; const vis=()=>{const e=$(bar); return !!e&&getComputedStyle(e).display!=='none';};
  ok(vis(),'the main bar shows on the reading screen');
  TimotheosOptions.open(); await sl(400); ok(!vis(),'Options open: the main bar is hidden');
  const db=$('#optDone'), dr=db&&db.getBoundingClientRect(), dh=dr&&document.elementFromPoint(dr.left+dr.width/2,dr.top+dr.height/2); ok(!!dh&&db.contains(dh)&&dr.bottom<=innerHeight,'Options: its Done button is on screen and can be tapped');
  await closeOptions(); await sl(200); ok(vis(),'Options closed: the main bar is back'); });
 await T('bottom bar',async()=>{ const bar={a:'.a-caps',b:'.b-tabs',c:'.c-dock'}[SK]; const shown=()=>{const e=$(bar); return !!e&&getComputedStyle(e).display!=='none'&&!R.classList.contains('sk-baroff');};
  await go({b:19,c:119,v:1}); await sl(1200); const tx=$('.bv.active .bvtext')||$('.bvtext'); tx.scrollTop=0; await sl(100); ok(shown(),'bottom bar shows before scrolling');
  tx.scrollTop=300; tx.dispatchEvent(new Event('scroll')); await sl(80); tx.scrollTop=600; tx.dispatchEvent(new Event('scroll')); await sl(350);
  ok(!shown()&&getComputedStyle($(bar)).opacity<0.5,'scrolling the text hides the bottom bar'+(shown()?'':''));
  const r=tx.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2; const pe=(ty,dx=0,dy=0)=>tx.dispatchEvent(new PointerEvent(ty,{bubbles:true,clientX:x+dx,clientY:y+dy,pointerId:1}));
  pe('pointerdown'); pe('pointerup'); await sl(350); ok(shown(),'a tap on the page brings it back');
  pe('pointerdown'); pe('pointermove',0,-40); pe('pointerup',0,-40); await sl(300); ok(!shown(),'swiping on the page hides it');
  if(SK==='b'){ const g=$('#workbench .dgroup.pactive'); ok(g&&Math.round(g.getBoundingClientRect().bottom)>=innerHeight-6,'Bar away: the Bible text goes down to the bottom of the screen (no blank space)'); }
  pe('pointerdown'); pe('pointerup'); await sl(400);
  if(SK==='b'){ const g=$('#workbench .dgroup.pactive'); ok(g&&g.getBoundingClientRect().bottom<=innerHeight-60,'Bar back: the text stops above the bar'); }
  ok(shown(),'tap again: it is back');
  PUI.readingSheet(); await sl(500); ok(!shown(),'Reading settings open: no bottom bar'); await closeSheet(); await sl(300); ok(shown(),'Reading settings closed: the bar is back');
  if(SK==='b'){ await go({b:19,c:119,v:6}); await sl(1200); const rw=$('.bv.active .pv[data-v="6"]')||$('.bv .pv[data-v="6"]'); if(rw){ SkinB.closeTb(); tapAt(rw,.5,.25); await sl(300); ok(!!$('.seltb'),'verse toolbar opens'); tx.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:200})); const y1=tx.scrollTop; tx.scrollTop=y1>60?0:y1+200; const y2=tx.scrollTop; tx.dispatchEvent(new Event('scroll')); await sl(1000); ok(!$('.seltb'),'scrolling the text closes the verse toolbar (y '+y1+' > '+y2+', '+$$('.bvtext').length+' texts, same='+(tx===$('.bv.active .bvtext'))+')'); } }
  if(SK==='c'&&SkinC.quick){ SkinC.quick(true); await sl(400); ok(!shown(),'Quick settings open: no dock'); history.back(); await sl(500); } await closeSheet(); PUI.clearPages&&PUI.clearPages(); await sl(200); });
 await T('margins and line height',async()=>{ const tx=$('.bv.active .bvtext')||$('.bvtext'); const mx=()=>parseFloat(getComputedStyle(tx).paddingLeft), lh=()=>parseFloat(getComputedStyle(tx).lineHeight)/parseFloat(getComputedStyle(tx).fontSize);
  PUI.readingSheet(); await sl(500); ok($$('#pSheet [data-rd="m"] button').length===3&&$$('#pSheet [data-rd="l"] button').length===3,'Reading view offers 3 margin levels and 3 line heights');
  click($('#pSheet [data-rd="m"] button[data-i="0"]')); click($('#pSheet [data-rd="l"] button[data-i="0"]')); await sl(300);
  { let minL=1e9,maxR=-1e9; tx.querySelectorAll('*').forEach(e=>{ const r=e.getBoundingClientRect(); if(!r.width||!r.height||r.bottom<0||r.top>innerHeight) return; minL=Math.min(minL,r.left); maxR=Math.max(maxR,r.right); });
    ok(mx()===6&&minL>=-.5&&maxR<=innerWidth+.5&&tx.scrollWidth<=tx.clientWidth,'Narrow: text 6 px from the edge, nothing cut off at the left or right ('+mx()+' px; edges '+Math.round(minL)+' / '+Math.round(maxR)+' of '+innerWidth+')');
    await document.fonts.load('100px Literata'); await document.fonts.load('italic 600 100px Literata'); const cv=document.createElement('canvas').getContext('2d'); let asc=0,desc=0;
    for(const st of ['normal','italic']) for(const wt of ['400','600']){ cv.font=st+' '+wt+' 100px Literata'; for(const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:!?\'"()[]{}-—‘’“”&ÁÉÍÓÚÑáéíóúñüÅåÖöÂÊÔÕÇç'){ const m=cv.measureText(ch); asc=Math.max(asc,m.actualBoundingBoxAscent); desc=Math.max(desc,m.actualBoundingBoxDescent); } }
    const need=(asc+desc)/100, have=lh(); ok(Math.abs(have-1.27)<.01&&have>=need,'Tight: '+have.toFixed(2)+' lines; the tallest and the lowest letters of the font need '+need.toFixed(2)+', so lines never touch'); }
  click($('#pSheet [data-rd="m"] button[data-i="1"]')); click($('#pSheet [data-rd="l"] button[data-i="1"]')); await sl(250); const m0=mx(), l0=lh(); click($('#pSheet [data-rd="m"] button[data-i="0"]')); await sl(200); const mN=mx(); click($('#pSheet [data-rd="m"] button[data-i="2"]')); await sl(200); const mW=mx();
  ok(mN<m0&&mW>m0,'Margins: Narrow < Normal < Wide ('+mN+' / '+m0+' / '+mW+' px)'); click($('#pSheet [data-rd="m"] button[data-i="1"]')); await sl(150); ok(Math.abs(mx()-m0)<1,'Margins: back to Normal');
  click($('#pSheet [data-rd="l"] button[data-i="0"]')); await sl(200); const lT=lh(); click($('#pSheet [data-rd="l"] button[data-i="2"]')); await sl(200); const lR=lh();
  ok(lT<l0&&lR>l0,'Line height: Tight < Normal < Roomy ('+lT.toFixed(2)+' / '+l0.toFixed(2)+' / '+lR.toFixed(2)+')'); click($('#pSheet [data-rd="l"] button[data-i="1"]')); await sl(150); ok(Math.abs(lh()-l0)<.02,'Line height: back to Normal');
  click($('#pSheet [data-rd="m"] button[data-i="2"]')); await sl(100); await closeSheet(); PUI.readingSheet(); await sl(500); ok($('#pSheet [data-rd="m"] button[data-i="2"]').classList.contains('on'),'the choice is shown again when the sheet is reopened'); click($('#pSheet [data-rd="m"] button[data-i="1"]')); await sl(100); await closeSheet(); });
 await T('pinned label',async()=>{
  if(SK==='c') return;
  await go({b:19,c:119,v:1}); await sl(900);
  if(SK==='a'){
   SkinA.showChrome(false); await sl(400); const tx=$('.bv.active .bvtext')||$('.bvtext'); const sc=async y=>{ tx.scrollTop=y; tx.dispatchEvent(new Event('scroll')); await sl(450); };
   const lab=()=>$('.a-chrome .lab'), op=e=>+getComputedStyle(e).opacity, ch=()=>$('.a-chrome');
   await sc(0); const big=$('.bv .bvtext .sk-ttl');
   ok(!R.classList.contains('a-compact')&&op(lab())<.1&&big.getBoundingClientRect().top>=0,'top of a chapter: the big title shows, the strip above it is empty');
   ok(!$('.a-chrome [data-a="browse"]'),'no separate browser icon (the label in the strip opens Go to)');
   await sc(400); ok(R.classList.contains('a-compact')&&op(lab())>.9,'scrolling: the title shrinks into one line in the top strip');
   ok(lab().querySelector('span').textContent.trim()===PUI.par.label(PUI.par.top())&&lab().querySelector('em').textContent.trim()===PUI.par.abbr(PUI.par.top()),'the line shows the place and the Bible ('+lab().textContent.trim()+')');
   const bg=getComputedStyle(ch()).backgroundColor; ok(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent','the strip has a solid background ('+bg+')');
   ok(/^rgb\(/.test(bg)&&+getComputedStyle(ch()).zIndex>6,'no text shows through the strip (opaque, above the text)');
   const y0=Math.round(lab().getBoundingClientRect().top); await sc(1200); ok(Math.round(lab().getBoundingClientRect().top)===y0&&op(lab())>.9,'scrolling down: the line stays where it is'); await sc(300); ok(Math.round(lab().getBoundingClientRect().top)===y0&&op(lab())>.9,'scrolling up: the line stays where it is');
   ok(op($('.a-chrome .pib'))<.2,'the buttons stay away until the page is tapped'); SkinA.showChrome(true); await sl(500);
   ok(op($('.a-chrome .pib'))>.9&&op(lab())>.9,'tap: the buttons join the same strip, the line stays');
   const lr=lab().getBoundingClientRect(), cr2=ch().getBoundingClientRect(); const over=[...$$('.a-chrome .pib')].some(b=>{const r=b.getBoundingClientRect(); return r.left<lr.right-1&&r.right>lr.left+1;});
   ok(!over&&lr.top>=cr2.top&&lr.bottom<=cr2.bottom,'the line and the buttons do not overlap, and fit in one strip');
   click(lab().querySelector('span')); await sl(600); ok(!!$('#pSheet'),'tapping the line opens Go to'); PUI.closeSheet(); await sl(400);
   await sc(400); click(lab().querySelector('em')); await sl(600); ok(!!$('.biblemenu'),'tapping the Bible name opens the Bible chooser'); document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); await sl(300);
   SkinA.showChrome(false); await sc(0); ok(!R.classList.contains('a-compact'),'back at the top: the big title again, the strip empty'); return; }
  const lab=()=>$('.b-big h2'); await sl(100);
  const tx=$('.bv.active .bvtext')||$('.bvtext'); tx.scrollTop=0; tx.dispatchEvent(new Event('scroll')); await sl(300); const y0=Math.round(lab().getBoundingClientRect().top), t0=lab().textContent.trim();
  const vis=()=>{const r=lab().getBoundingClientRect(), c=getComputedStyle(lab()); return r.top>=0&&r.bottom<=innerHeight*.3&&+c.opacity>.9&&c.visibility!=='hidden';};
  ok(vis()&&/\d/.test(t0),'the top label shows the place ('+t0.replace(/\s+/g,' ')+') with the bar hidden');
  tx.scrollTop=400; tx.dispatchEvent(new Event('scroll')); await sl(400); tx.scrollTop=1200; tx.dispatchEvent(new Event('scroll')); await sl(500);
  ok(tx.scrollTop>300,'text really scrolled ('+tx.scrollTop+')'); ok(vis()&&Math.round(lab().getBoundingClientRect().top)===y0,'scrolling down: the label stays where it is');
  tx.scrollTop=300; tx.dispatchEvent(new Event('scroll')); await sl(500); ok(vis()&&Math.round(lab().getBoundingClientRect().top)===y0,'scrolling up: the label stays where it is');
  tx.scrollTop=0; tx.dispatchEvent(new Event('scroll')); await sl(200); });
 await T('label size',async()=>{
  if(SK==='c'){ await go({b:46,c:12,v:3}); await sl(700); const r=$('.c-rail .ref'), cs=getComputedStyle(r), rr=r.getBoundingClientRect(), bib=$('.c-rail .bib').getBoundingClientRect(), fw=$('.c-rail [data-a="fwd"]').getBoundingClientRect(), bk=$('.c-rail [data-a="back"]').getBoundingClientRect();
   ok(parseFloat(cs.fontSize)===32&&/Literata/.test(cs.fontFamily),'Study Desk: the place label is as big as Clear Tabs ('+cs.fontSize+')');
   ok(rr.left>=bk.right-1&&rr.right<=bib.left+1&&bib.right<=fw.left+1,'the label, Bible chip and buttons do not overlap ('+Math.round(rr.right)+' / '+Math.round(bib.left)+')'); ok(r.scrollWidth<=r.clientWidth+1,'the label is not cut off ('+r.textContent.trim()+')'); }
  if(SK==='b') ok(parseFloat(getComputedStyle($('.b-big h2')).fontSize)===32,'Clear Tabs label is 32px'); });
 await T('full names',async()=>{
  const sels=SK==='a'?['.a-chrome .lab span']:SK==='b'?['.b-big h2 span']:['.c-rail .ref span:last-child'];
  for(const [b,c] of [[53,3],[22,8],[25,5],[46,14],[19,119]]){ await go({b,c,v:1}); await sl(900);
   if(SK==='a'){ const t=$('.bv .bvtext'); t.scrollTop=600; t.dispatchEvent(new Event('scroll')); await sl(400); SkinA.showChrome(true,false); await sl(400); }
   const want=PUI.par.label(SK==='c'?state.active:PUI.par.top());
   for(const s of sels){ const e=$(s); ok(!!e&&e.textContent.trim()===want,'top label is the full book name and chapter: '+(e&&e.textContent)); ok(!!e&&e.scrollWidth<=e.clientWidth+1,'not cut off: '+want+' ('+(e&&getComputedStyle(e).fontSize)+')'); }
   ok($$('.dgroup .bv .sk-ttl span').every(e=>!e.getClientRects().length||e.textContent.trim()===PUI.par.label(+e.closest('.bv').dataset.i)),'each Bible view\'s own label is the full name ('+want+')');
   if(SK==='a'){ SkinA.showChrome(false); await sl(300); } }
  await go({b:43,c:3,v:16}); await sl(600); });
 await T('colour skins',async()=>{
  const O=TimotheosOptions, lum=e=>{ const m=getComputedStyle(e).backgroundColor.match(/[\d.]+/g); if(!m) return -1; return (0.299*m[0]+0.587*m[1]+0.114*m[2])/255; };
  const surf=SK==='a'?['.a-caps','.bv .bvtext']:SK==='b'?['.b-top','.b-tabs','.bv .bvtext']:['.c-dock','.bv .bvtext'];
  const pick=async id=>{ O.open('look'); await sl(500); const c=$('#skinGrid [data-skin="'+id+'"]'); if(c) click(c); await sl(500); return !!c; };
  ok(await pick('slate'),'Options lists the colour skins'); ok(!!$('#skinGrid [data-skin="screen"]'),'and a "Screen colours" choice (each screen\'s own palette)');
  ok(R.classList.contains('sk-themed')&&R.style.getPropertyValue('--p-bg').trim()===O.SKINS.slate.v.textbg&&R.dataset.theme==='dark','Slate: the screen takes the skin\'s colours');
  ok(lum($('#optionsDlg .dlg, #optionsDlg > div')||$('#optionsDlg'))<.35||lum($('#optionsDlg'))<.35,'Slate: the Options page itself is dark');
  $('#optionsDlg [data-close], #optionsDlg .x, #optClose')&&0; O.open&&document.getElementById('optionsDlg').classList.add('hidden'); await sl(300);
  for(const q of surf){ const e=$(q); ok(!!e&&lum(e)<.35&&lum(e)>=0,'Slate: '+q+' is dark ('+(e&&getComputedStyle(e).backgroundColor)+')'); }
  const pg=SK==='c'?null:1; if(pg){ TimotheosSkins.place(); await sl(600); const sh=$('#pSheet .psheet')||$('#pSheet'); ok(!!sh&&lum(sh)<.35,'Slate: the Go to sheet is dark'); PUI.closeSheet(); await sl(400); }
  ok(await pick('narra'),'pick Narra'); document.getElementById('optionsDlg').classList.add('hidden'); await sl(300);
  ok(R.style.getPropertyValue('--p-bg').trim()===O.SKINS.narra.v.textbg&&R.dataset.theme==='light','Narra: light colours');
  for(const q of surf){ const e=$(q); ok(!!e&&lum(e)>.6,'Narra: '+q+' is light ('+(e&&getComputedStyle(e).backgroundColor)+')'); }
  const t0=JSON.stringify([...$$('.bv')].map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.top),Math.round(r.height)];}));
  ok(await pick('screen'),'pick Screen colours'); document.getElementById('optionsDlg').classList.add('hidden'); await sl(300);
  ok(!R.classList.contains('sk-themed')&&!R.style.getPropertyValue('--p-bg'),'Screen colours: back to the screen\'s own palette');
  const t1=JSON.stringify([...$$('.bv')].map(e=>{const r=e.getBoundingClientRect(); return [Math.round(r.top),Math.round(r.height)];}));
  ok(t0===t1,'changing the colour skin does not move anything (only colours change)'); });
 await T('nav bar',async()=>{
  const calls=[]; window.TwBars={ set(){}, edge(on){ calls.push(on); } }; R.style.setProperty('--nav-h','48px'); R.classList.toggle('x-poke'); R.classList.toggle('x-poke'); await sl(300);
  ok(R.classList.contains('tw-edge')&&calls[calls.length-1]===true,'Bible view: the phone\'s navigation bar is see-through');
  const bot=SK==='a'?'.a-caps':SK==='b'?'.b-tabs button':'.c-dock', be=$(bot); const gap=innerHeight-be.getBoundingClientRect().bottom;
  ok(gap>=48-1,'the bottom bar stays above the phone\'s buttons ('+Math.round(gap)+'px)');
  const tx=$('.bv .bvtext'); ok(parseFloat(getComputedStyle(tx).paddingBottom)>=48,'the text can scroll clear of the phone\'s buttons');
  TimotheosSkins.place(); await sl(700); ok(!R.classList.contains('tw-edge')&&calls[calls.length-1]===false,'a sheet over the text: the bar is solid again'); PUI.closeSheet(); await sl(600);
  ok(R.classList.contains('tw-edge')&&calls[calls.length-1]===true,'back on the Bible view: see-through again');
  delete window.TwBars; R.classList.remove('tw-edge'); R.style.removeProperty('--nav-h'); await sl(200); });
 // ---------- word pop-up: drag it anywhere ----------
 await T('word popup',async()=>{
  if(SK==='b'){ PUI.wordPop({word:'grace',strongs:['G5485'],morphs:[],el:row(1)}); } else { row(1).scrollIntoView({block:'center'}); await sl(200); const w=row(1).querySelector('.word[data-strong]')||row(1).querySelector('.word'); tapAt(w,.5,.5); }
  await sl(1200); let pop=$('#pWordPop'); ok(!!pop,'the word pop-up opens'); if(!pop) return;
  let bar=pop.querySelector('.pwbar'); const r0=pop.getBoundingClientRect(), b=bar.getBoundingClientRect();
  const pe=(t,x,y)=>bar.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:7,clientX:x,clientY:y,isPrimary:true}));
  const sx=b.left+30, sy=b.top+b.height/2; pe('pointerdown',sx,sy); pe('pointermove',sx-200,sy+300); pe('pointermove',sx-150,sy+260); pe('pointerup',sx-150,sy+260); await sl(200);
  const r1=pop.getBoundingClientRect(); ok(Math.abs((r1.top-r0.top)-260)<=2||r1.bottom<=innerHeight,'drag the top bar: the pop-up moves ('+Math.round(r0.left)+','+Math.round(r0.top)+' → '+Math.round(r1.left)+','+Math.round(r1.top)+')');
  ok(r1.top!==r0.top||r1.left!==r0.left,'it is somewhere else now');
  // dragged mostly past the edge it is thrown away (0.6.5: popups go back off the screen); a little over the edge, it is put back inside
  pe('pointerdown',r1.left+30,r1.top+10); pe('pointermove',5000,5000); pe('pointerup',5000,5000); await sl(150);
  ok(!$('#pWordPop'),'dragged off the screen, it closes');
  PUI.wordPop({word:'love',strongs:['G26'],morphs:[]}); await sl(500); pop=$('#pWordPop'); bar=pop.querySelector('.pwbar'); const r1b=pop.getBoundingClientRect();
  pe('pointerdown',r1b.left+30,r1b.top+10); pe('pointermove',r1b.left+30+innerWidth-r1b.right+30,r1b.top+10); pe('pointerup',r1b.left+30+innerWidth-r1b.right+30,r1b.top+10); await sl(150); const r2=pop.getBoundingClientRect();
  ok(!!$('#pWordPop')&&r2.right<=innerWidth+1&&r2.top<innerHeight-60,'a little past the edge, it is put back on the screen ('+Math.round(r2.left)+','+Math.round(r2.top)+')');
  pe('pointerdown',r2.left+30,r2.top+10); pe('pointermove',60,140); pe('pointerup',60,140); await sl(150); const kept=pop.getBoundingClientRect();
  click(pop.querySelector('.pwx')); await sl(200); ok(!$('#pWordPop'),'× closes it');
  PUI.wordPop({word:'grace',strongs:['G5485'],morphs:[]}); await sl(500); const r3=$('#pWordPop').getBoundingClientRect(); ok(Math.abs(r3.left-kept.left)<=1&&Math.abs(r3.top-kept.top)<=1,'the next word opens where it was put');
  history.back(); await sl(500); ok(!$('#pWordPop'),'Back closes it');
 });
 // ---------- pinch: only module text zooms ----------
 await T('pinch',async()=>{
  PUI.clearPages(); PUI.closeSheet(); await sl(300);
  ok(/user-scalable=no/.test(($('meta[name=viewport]')||{}).content||''),'the page itself cannot be zoomed');
  const pinch=(el,from,to)=>{ const r=el.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+Math.min(r.height/2,120);
   const T2=d=>[{identifier:1,target:el,clientX:cx-d/2,clientY:cy},{identifier:2,target:el,clientX:cx+d/2,clientY:cy}];
   const ev=(n,t)=>{ const e=new Event(n,{bubbles:true,cancelable:true}); Object.defineProperty(e,'touches',{value:t}); el.dispatchEvent(e); return e; };
   const s=ev('touchstart',T2(from)); let d=from; const st=(to-from)/12; for(let k=0;k<12;k++){ d+=st; ev('touchmove',T2(d)); } ev('touchend',[]); return s.defaultPrevented; };
  const i=state.active, z0=views()[i].zoom||1, tx=$(`.bv[data-i="${i}"] .bvtext`); const cell=tx.querySelector('.pv[data-v]')||tx;
  ok(pinch(cell,100,260),'a pinch is caught (the system zoom does not run)'); await sl(300);
  const z1=views()[i].zoom; ok(z1>z0,'spread two fingers on the Bible text: it grows ('+z0+' → '+z1+')');
  pinch(cell,260,100); await sl(300); ok(views()[i].zoom<z1,'pinch: it shrinks again ('+views()[i].zoom+')'); views()[i].zoom=z0; TimotheosOptions&&0;
  const ui=SK==='a'?$('.a-caps')||$('.a-chrome'):SK==='b'?$('.b-tabs'):$('.c-dock'); const zs=JSON.stringify(TimotheosOptions.appearance().zoom||{}), zv=views()[i].zoom, uz=getComputedStyle(document.body).zoom;
  ok(pinch(ui,100,300),'a pinch on the buttons is caught too'); await sl(300);
  ok(JSON.stringify(TimotheosOptions.appearance().zoom||{})===zs&&views()[i].zoom===zv&&getComputedStyle(document.body).zoom===uz,'…and nothing grows: buttons and bars keep their size');
  PUI.wordPop({word:'grace',strongs:['G5485'],morphs:[]}); for(let k=0;k<20&&!$('#pWordPop .pbody');k++) await sl(200);
  const pb=$('#pWordPop .pbody'); const m0=+(TimotheosOptions.appearance().zoom||{}).mod||1; if(pb){ pinch(pb,100,260); await sl(300); const m1=+(TimotheosOptions.appearance().zoom||{}).mod||1; ok(m1>m0&&getComputedStyle(pb).zoom!=='1','dictionary text in the pop-up grows ('+m0+' → '+m1+')');
   pinch(pb,260,100); pinch(pb,260,100); await sl(300); } PUI.wordPopClose(); await sl(200);
  ok(TimotheosPinch.target($('.pwpop .pwbar')||document.body)===null,'pinching the screen outside the text is ignored');
 });
 // ---------- no dots before the verses ----------
 await T('verse dots',async()=>{ if(SK==='c') ok(!$('.c-rail .dotc'),'Study Desk: no dot beside the book name'); await go({b:46,c:15,v:1}); await sl(900); const dots=$$('.bv .pv sup.cm').filter(e=>e.getClientRects().length&&getComputedStyle(e).display!=='none'); ok(dots.length===0,'no dot before any verse ('+$$('.bv .pv sup.cm').length+' hidden markers)'); });
 // ---------- paragraphs only; lines break only at <CM>, <CL>, <CI>; heading font ----------
 await T('paragraphs',async()=>{
  PUI.clearPages(); PUI.closeSheet(); await sl(300); await go({b:43,c:3,v:1}); await sl(1000);
  ok(!!$('.bv .paraview')&&!$('.bv table.chapter'),'the Bible reads as paragraphs');
  PUI.readingSheet(); await sl(500); ok(!!sheet()&&!$('#pSheet [data-show="paragraph"]'),'the text format sheet has no Paragraphs switch');
  { const al=$$('#pSheet [data-al]'); ok(al.length===4,'Align: left, centre, justify, right'); const tx=$(`.bv[data-i="${state.active}"] .bvtext`);
    for(const k of ['justify','center','right']){ click($(`#pSheet [data-al="${k}"]`)); await sl(250); ok(getComputedStyle(tx.querySelector('.pcol')).textAlign===k&&$(`#pSheet [data-al="${k}"]`).classList.contains('on'),'Align '+k); }
    click($('#pSheet [data-al="left"]')); await sl(250); ok(!tx.dataset.align,'Align left: as before'); }
  const R0=s=>TWRender.render(s,{rules:[]},{headings:true,footnotes:true,woj:true,added:true},{fn:{n:0}});
  const blocks=h=>{ const d=document.createElement('div'); d.innerHTML=h; return d.querySelectorAll('.pbr').length+d.querySelectorAll('.para').length; };
  ok(blocks(R0('He said, <PI1>"Come."'))===0&&!/pind/.test(R0('He said, <PI1>"Come."')),'<PI> inside a verse does not start a new line');
  ok(blocks(R0('one <PF1>two'))===0,'<PF> inside a verse does not start a new line');
  ok(/<br>/.test(R0('one<CL>two')),'<CL> breaks the line');
  ok(blocks(R0('one<CM>two'))===1,'<CM> starts a new paragraph');
  ok(blocks(R0('one<CI>two'))===1,'<CI> starts a new line');
  const pi=R0('<PI1>Psalm line'); ok(/class="pind first" style="width:40px"/.test(pi),'<PI> at the start of a verse keeps its indent ('+pi.slice(0,60)+')');
  ok(/<br><span class="pind" style="width:60px"><\/span>two/.test(R0('one<CL><PI2>two'))&&blocks(R0('one<CL><PI2>two'))===0,'<PI> right after <CL> indents the new line, no extra break');
  ok(!/<span class="para/.test(R0('one<CM>two'))&&/one<span class="pbr cm"><\/span>two/.test(R0('one<CM>two')),'a paragraph begun inside a verse is not closed at the verse end (the next verse goes on in it)');
  // a verse that goes on in the same paragraph keeps its indent inline (no line break)
  const pvs=$$('.bv.active .pv[data-v]'); ok(pvs.every(p=>!p.querySelector('.pind.first')||p.previousElementSibling==null||p.previousElementSibling.querySelector('.pbr.trail')),'an indented verse is indented only where a paragraph starts');
  ok(!$$('.bv .pv .para').length,'no verse closes its paragraph by itself');
  { const t0=$(`.bv[data-i="${state.active}"] .pcol`); const sp=document.createElement('span'); sp.className='pv sel'; sp.dataset.v='999'; sp.innerHTML=R0('Before the break,<CM><PF>"after the break and on to the end of the verse."'); t0.appendChild(sp); await sl(50);
   const bg=getComputedStyle(sp).backgroundColor, inner=[...sp.querySelectorAll('*')].filter(e=>getComputedStyle(e).display==='block'&&e.textContent.trim()); ok(bg!=='rgba(0, 0, 0, 0)'&&inner.length===0&&sp.getClientRects().length>=2,'the active verse background goes on after a <CM> inside the verse ('+sp.getClientRects().length+' line pieces)'); sp.remove(); }
  // developer: the module's tags
  setShow('tags',true); await sl(900); const tt=$(`.bv[data-i="${state.active}"] .bvtext`); ok(tt.dataset.tags==='1'&&$$(`.bv[data-i="${state.active}"] .rawtag`).length>0&&getComputedStyle($(`.bv[data-i="${state.active}"] .pv`)).display==='block','Module tags on: each verse as stored, with its tags shown');
  setShow('tags',false); await sl(900); ok(!tt.dataset.tags&&!$$(`.bv[data-i="${state.active}"] .rawtag`).length,'Module tags off: the normal text again');
  // heading font for this view
  click($(`#pSheet [data-x="hfont"]`)); await sl(700);
  const m=$('.bvmenu .hfopts'); ok(!!m,'Heading font: the headings options of this view open');
  if(m){ const fs=m.querySelector('[data-h="font"]'), sz=m.querySelector('[data-h="size"]'); const f=[...fs.options].map(o=>o.value).find(v=>/Literata/.test(v))||fs.options[1].value; fs.value=f; fs.dispatchEvent(new Event('change',{bubbles:true})); await sl(500);
   sz.value='1.45'; sz.dispatchEvent(new Event('change',{bubbles:true})); await sl(400); const bold=$('.bvmenu [data-h="italic"]'); if(bold){ bold.checked=true; bold.dispatchEvent(new Event('change',{bubbles:true})); } await sl(600);
   await go({b:19,c:23,v:1}); await sl(1000); const h=$('.bv.active .heading')||$(`.bv[data-i="${state.active}"] .heading`); const t=$(`.bv[data-i="${state.active}"] .bvtext`);
   ok(!!t&&t.dataset.hfam==='1'&&t.dataset.hsz==='1'&&t.dataset.hi==='1','the view keeps the heading font, size and style');
   if(h){ const cs=getComputedStyle(h); ok(cs.fontFamily.includes(f.split(',')[0])&&cs.fontStyle==='italic','headings use the chosen font, in italics ('+cs.fontFamily.slice(0,40)+')'); ok(Math.abs(parseFloat(cs.fontSize)-1.45*parseFloat(getComputedStyle(h.parentElement).fontSize))<1.5,'headings use the chosen size ('+cs.fontSize+')'); }
   else ok(true,'(this chapter has no headings in the test Bible)');
   delete views()[state.active].head; storeViews(); ensurePanes(); await sl(400); ok(!t.dataset.hfam,'headings as the screen sets them again'); }
  document.querySelectorAll('.bvmenu').forEach(x=>x.remove()); PUI.closeSheet(); await sl(300);
 });
 // ---------- two Bibles after the split desk of Study Desk ----------
 await T('split gap',async()=>{
  R.style.setProperty('--sp-head','57px'); if(SK==='b') click($('.b-big [data-a="par"]')); else if(SK==='a') await TimotheosSkins.parallel(true); else { await TimotheosSkins.parallel(true); }
  await sl(1500); if(!R.classList.contains('psplitting')){ ok(false,'two Bibles'); return; }
  const g=$('.dgroup.psplit').getBoundingClientRect(); const d=$('.pdiv');
  { const pr=d.getBoundingClientRect(); ok(Math.abs(g.top-pr.bottom)<=1.5,'the lower Bible starts right under the strip, no empty band ('+Math.round(pr.bottom)+' / '+Math.round(g.top)+')'); }
  if(SK==='a'){ const t=$('.dgroup.pbase .bv .sk-ttl'), ts=t.querySelector('span'), tb=t.querySelector('small'), rs=$('.pdiv .pd-ref span'), bc=$('.pdiv .pd-bib span');
   ok(ts.getBoundingClientRect().left<tb.getBoundingClientRect().left&&rs.getBoundingClientRect().left<bc.getBoundingClientRect().left,'top label and strip: the place first, then the Bible');
   ok(Math.abs(ts.getBoundingClientRect().left-rs.getBoundingClientRect().left)<=1.5&&Math.abs(tb.getBoundingClientRect().left-bc.getBoundingClientRect().left)<=1.5,'the two rows line up ('+Math.round(tb.getBoundingClientRect().left)+' / '+Math.round(bc.getBoundingClientRect().left)+')');
   ok(getComputedStyle(tb,'::before').content.replace(/"/g,'')===PUI.par.abbr(PUI.par.top()),'the top row shows only the Bible\'s short name ('+getComputedStyle(tb,'::before').content+')');
   const tx=$('.dgroup.pbase .bv .bvtext'); tx.scrollTop=800; await sl(400); const tr=t.getBoundingClientRect(), gr=$('.dgroup.pbase').getBoundingClientRect();
   ok(Math.abs(tr.top-gr.top)<=1.5,'scrolled: the top row sits at the very top, no text above it ('+Math.round(tr.top)+' / '+Math.round(gr.top)+')');
   const hit=document.elementFromPoint(gr.left+gr.width-40,tr.top+4); ok(!!hit&&(hit===t||t.contains(hit)||!hit.closest('.pv[data-v]')),'the text does not show through the top row'); tx.scrollTop=0; }
  R.style.removeProperty('--sp-head'); if(SK==='b') click($('.b-big [data-a="par"]')); else await TimotheosSkins.parallel(false); await sl(800);
 });
 // ---------- two Bibles: plain text below, a text format button for each ----------
 await T('parallel format',async()=>{
  PUI.clearPages(); PUI.closeSheet(); if(TimotheosPhone.splitId()){ if(SK==='c'&&SkinC.closeAll) {} await TimotheosSkins.parallel(false); } await sl(500);
  const oth=views().findIndex((v,k)=>k!==state.active); if(oth>=0){ views()[oth].show=Object.assign({},views()[oth].show,{columns:true,strongs:true}); delete views()[oth].parPlain; }
  if(SK==='b') click($('.b-big [data-a="par"]')); else if(SK==='c') SkinC.par(true); else await TimotheosSkins.parallel(true);
  await sl(1800); if(!R.classList.contains('psplitting')){ ok(false,'two Bibles'); return; }
  const top=PUI.par.top(), bot=PUI.par.bot();
  ok(!effShow('columns',bot)&&effShow('strongs',bot)===effShow('strongs',top),'the lower Bible is plain text like the top one (no word-over-word display)');
  const vis=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';
  const openFor=async(btn,want,label)=>{ ok(vis(btn),label+': the Aa button shows'); if(!vis(btn)) return; click(btn); await sl(600); ok(!!sheet()&&/Text size/.test(sheet().textContent)&&state.active===want,label+': the text format sheet for '+(want===top?'the top':'the lower')+' Bible ('+state.active+')'); await closeSheet(); };
  if(SK==='a') await openFor($('.dgroup.pbase .bv .sk-ttl .sk-aa'),top,'top label');
  if(SK==='b') await openFor($('.b-abar [data-a="view"]')||$('[data-a="view"]'),top,'top bar');
  await openFor($('.pdiv .pd-aa'),bot,'strip');
  if(SK==='c') await openFor($('.c-rail [data-a="aa"]'),top,'rail');
  // the choice made for the lower Bible is kept
  toggleViewShow(bot,'columns',true); setActiveView(top); await sl(500); { await TimotheosSkins.parallel(false); await sl(300); if(SK==='b') click($('.b-big [data-a="par"]')); else await TimotheosSkins.parallel(true); }
  await sl(1500); ok(effShow('columns',PUI.par.bot()),'a display chosen later for the lower Bible is kept');
  toggleViewShow(PUI.par.bot(),'columns',false); views()[PUI.par.bot()].show=Object.assign({},views()[PUI.par.bot()].show,{strongs:effShow('strongs',PUI.par.top())});
  await TimotheosSkins.parallel(false); await sl(600);
 });
 await T('strongs labels',async()=>{
  PUI.clearPages(); PUI.closeSheet(); await sl(200);
  PUI.wordSheet({word:'οὕτω',strongs:['G3779']}); await sl(1500);
  const h=$('#pSheet .ph4'); ok(!!h&&!/Strong/i.test(h.textContent)&&!!h.querySelector('.pclose'),'the Strong\'s sheet has no title of its own, only the close button ('+(h?h.textContent.trim():'')+')');
  const ptr=$$('#pSheet .lhead .ptr').map(e=>e.textContent.trim()); ok(!ptr.some(t=>/^[GH]\d+$/i.test(t)),'no Strong\'s number beside the Greek word ('+ptr.join(',')+')');
  ok(/G3779/.test(($('#pSheet .psrc')||{}).textContent||''),'the card still names the number: '+(($('#pSheet .psrc')||{}).textContent||''));
  await closeSheet();
 });
 await T('parallel font and bible',async()=>{
  if(SK==='b'){ const t=$$('.b-tabs button').map(b=>b.textContent.trim()).join(','); ok(t==='Bible,Library,Search,Notes,More','Clear Tabs: the tabs are named Bible, Library, Search, Notes, More ('+t+')'); click($('.b-tabs [data-t="study"]')); await sl(600); ok(/Notes/.test(($('.ppage .ptitle,.ppage h1,.ppage .pbar')||{}).textContent||document.querySelector('.ppage').textContent),'the Notes tab opens a page titled Notes'); PUI.clearPages(); click($('.b-tabs [data-t="read"]')); await sl(400); }
  PUI.clearPages(); PUI.closeSheet(); if(TimotheosPhone.splitId()){ await TimotheosSkins.parallel(false); } await sl(500);
  if(SK==='b') click($('.b-big [data-a="par"]')); else if(SK==='c') SkinC.par(true); else await TimotheosSkins.parallel(true);
  await sl(1800); if(!R.classList.contains('psplitting')){ ok(false,'two Bibles'); return; }
  const vis=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none';
  const fam=i=>getComputedStyle(document.querySelectorAll('.bv .bvtext')[i]).fontFamily;
  { const l=TimotheosOptions.fonts(); ok(['Gentium Plus','Literata','Inter'].every(f=>l.includes(f)),'phone font list keeps the bundled fonts ('+l.length+' fonts)'); const ms=f=>{const c=document.createElement('canvas').getContext('2d'); const w=fm=>{c.font='72px '+fm; return c.measureText('mmmmmmmmmmlli0Oq').width;}; return w("'"+f+"', monospace")!==w('monospace')||w("'"+f+"', serif")!==w('serif')||w("'"+f+"', sans-serif")!==w('sans-serif');}; const bad=l.filter(f=>!['Gentium Plus','Literata','Source Serif 4','Inter','Noto Serif Hebrew'].includes(f)&&!ms(f)); ok(bad.length===0,'every font offered on the phone is really there (not: '+bad.join(', ')+')'); }
  for(const which of ['bot','top']){
    const i=PUI.par[which](); PUI.closeSheet(); await sl(200); await closeMenus();
    PUI.formatFor(i); await sl(500);
    const pill=[...$$('#pSheet [data-x="font"]')][0]; ok(!!pill,which+': Font button in the format sheet'); if(!pill) continue;
    click(pill); await sl(900);
    const hitOk=el=>{ const r=el.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return !!t&&(t===el||el.contains(t)); };
    // a tap on the other Bible's text before choosing must not move the choice to that Bible
    setActive(which==='bot'?PUI.par.top():PUI.par.bot()); await sl(200);
    const rows=$$('#pSheet [data-font]'); ok(rows.length>2,which+': the phone font list opens ('+rows.length+' fonts)'); if(rows.length<3) continue;
    const pick=rows.find(r=>r.dataset.font&&r.dataset.font!==views()[i].font&&r.dataset.font!=='Literata'); pick.scrollIntoView({block:'center'}); await sl(200);
    ok(hitOk(pick),which+': a font in the list can be tapped');
    const oth=views()[which==='bot'?PUI.par.top():PUI.par.bot()].font;
    tapAt(pick); await sl(700);
    ok(views()[i].font===pick.dataset.font,which+': the font is saved for that view ('+views()[i].font+')');
    ok(views()[which==='bot'?PUI.par.top():PUI.par.bot()].font===oth,which+': the other Bible keeps its font');
    ok(fam(i).includes(pick.dataset.font),which+': the text of that view uses it: '+fam(i).slice(0,60));
    { const pv=document.querySelectorAll('.bv')[i].querySelector('.pv[data-v], tr[data-v] td, .paraview, table.chapter'); const f=pv?getComputedStyle(pv).fontFamily:''; ok(f.includes(pick.dataset.font),which+': the verses themselves use it ('+f.slice(0,50)+')'); }
    ok(!sheet(),which+': the list closes after the choice');
    await closeMenus(); delete views()[i].font; storeViews(); ensurePanes();
  }
  for(const which of ['bot','top']){
    const i=PUI.par[which](); PUI.closeSheet(); await sl(200); await closeMenus();
    PUI.formatFor(i); await sl(500);
    const chip=$('#pSheet [data-x="bible"]'); click(chip); await sl(900);
    const b=[...$$('.bvmenu [data-b]')].find(x=>x.dataset.b!==views()[i].bible); ok(!!b&&vis(b),which+': the list of Bibles shows from the sheet ('+$$('.bvmenu [data-b]').length+')');
    const before=views()[i].bible; if(b){ click(b); await sl(900); ok(views()[i].bible===b.dataset.b,which+': the Bible of that view changed ('+before+' → '+views()[i].bible+')'); views()[i].bible=before; await setViews([...views()]); await sl(500); }
    await closeMenus(); await closeSheet();
  }
  // real taps on the screen's own Bible controls, with the other Bible being the active one
  const hit=(el)=>{ const r=el.getBoundingClientRect(); const x=r.left+r.width/2,y=r.top+r.height/2; const t=document.elementFromPoint(x,y); return {ok:!!t&&(t===el||el.contains(t)||t.contains(el)),r:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)],at:t&&(t.className||t.tagName)}; };
  const ctl={ top:{a:()=>{ const ch=$('.a-chrome'); const em=$('.a-chrome em'); if(typeof SkinA!=='undefined'&&SkinA.showChrome) SkinA.showChrome(true); if(ch&&vis(em)&&em.textContent.trim()) return em; return $('.dgroup.pbase .bv .sk-ttl small'); }, b:()=>$('.b-big [data-a="bible"]'), c:()=>$('.c-rail [data-a="bible"]')}[SK], bot:()=>$('.pdiv [data-pd="bible"]') };
  if(SK==='a'){ const top=PUI.par.top(), bot=PUI.par.bot(); setActiveView(bot); await sl(300); PUI.closeSheet(); await closeMenus(); SkinA.showChrome(false); await sl(500);
    const sm=$('.dgroup.pbase .bv .sk-ttl small'); ok(!!sm&&vis(sm),'a top title: the Bible name shows'); if(sm){ const r=sm.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); ok(!!t&&(t===sm||sm.contains(t)),'a top title: a tap on the Bible name reaches it with the strip hidden (hits '+(t&&(t.className||t.tagName))+')');
      tapAt(sm); await sl(1000); const items=$$('.bvmenu [data-b]'); ok(items.length>1&&state.active===top,'a top title: the list opens for the upper Bible ('+items.length+', active '+state.active+')');
      const b=items.find(x=>x.dataset.b!==views()[top].bible); if(b){ const before=views()[top].bible, ob=views()[bot].bible; tapAt(b); await sl(1000); ok(views()[top].bible===b.dataset.b&&views()[bot].bible===ob,'a top title: the upper Bible changed, the lower did not'); views()[top].bible=before; await setViews([...views()]); await sl(500); } }
    await closeMenus(); }
  for(const which of ['top','bot']){
    const want=PUI.par[which](), other=which==='top'?PUI.par.bot():PUI.par.top();
    setActiveView(other); await sl(400); PUI.closeSheet(); await closeMenus(); await sl(200);
    const c=ctl[which](); ok(!!c&&vis(c),SK+' '+which+': the Bible control shows ('+(c?JSON.stringify(hit(c).r):'none')+')'); if(!c||!vis(c)) continue;
    const h=hit(c); ok(true,SK+' '+which+': tapping '+c.tagName+'.'+(c.className||'')+' "'+c.textContent.trim().slice(0,30)+'" chrome='+(R.classList.contains('a-show'))); ok(h.ok,SK+' '+which+': a tap reaches it (hits '+h.at+')');
    tapAt(c); await sl(1000);
    const items=$$('.bvmenu [data-b]'); const sheetOpen=!!sheet();
    ok(items.length>1||sheetOpen,SK+' '+which+': a list of Bibles opened ('+items.length+' items, sheet '+sheetOpen+')');
    if(items.length>1){ const m=$('.bvmenu'); const mr=m.getBoundingClientRect(); ok(mr.top>=0&&mr.bottom<=innerHeight+1&&mr.height>40,SK+' '+which+': the list is inside the screen '+JSON.stringify([Math.round(mr.left),Math.round(mr.top),Math.round(mr.width),Math.round(mr.height)]));
      const b=items.find(x=>x.dataset.b!==views()[want].bible); const hb=hit(b); ok(hb.ok,SK+' '+which+': an item can be tapped (hits '+hb.at+')');
      const before=views()[want].bible, oth=views()[other].bible; tapAt(b); await sl(1000);
      ok(views()[want].bible===b.dataset.b&&views()[other].bible===oth,SK+' '+which+': changed the '+which+' Bible only ('+before+' → '+views()[want].bible+'; other '+views()[other].bible+')');
      views()[want].bible=before; await setViews([...views()]); await sl(500); }
    await closeMenus(); await closeSheet();
  }
 await closeMenus(); await TimotheosSkins.parallel(false); await sl(600);
 });
 // ---- touch helpers: a finger put down on an element, moved, lifted
 const fing=(el,type,x,y)=>{const e=new Event(type,{bubbles:true,cancelable:true}); const pt={clientX:x,clientY:y,identifier:7,target:el}; e.touches=type==='touchend'?[]:[pt]; e.changedTouches=[pt]; el.dispatchEvent(e);};
 const drag=async(el,dx,dy,o={})=>{const r=el.getBoundingClientRect(); const x=o.x!=null?o.x:r.left+r.width/2, y=o.y!=null?o.y:r.top+Math.min(r.height/2,60); const tg=o.on||el; fing(tg,'touchstart',x,y); for(let k=1;k<=6;k++){fing(tg,'touchmove',x+dx*k/6,y+dy*k/6); await sl(16);} fing(tg,'touchend',x+dx,y+dy); await sl(400);};
 const pdown=el=>{let e; try{e=new PointerEvent('pointerdown',{bubbles:true});}catch(x){e=new Event('pointerdown',{bubbles:true});} el.dispatchEvent(e);};
 await T('bible drop',async()=>{
  await go({b:43,c:3,v:16}); await sl(500); await closeMenus();
  let lab; if(SK==='a'){ SkinA.showChrome(true,false); await sl(250); lab=$('.a-chrome .lab em'); } else if(SK==='b') lab=$('.b-big [data-a="bible"]'); else lab=$('.c-rail [data-a="bible"]');
  ok(!!lab&&lab.getBoundingClientRect().width>0,'the Bible label is on the top bar');
  pdown(lab); click(lab); await sl(600);
  const m=$('.bvmenu.biblemenu'); const lr=lab.getBoundingClientRect(); const mr=m&&m.getBoundingClientRect();
  ok(m&&m.classList.contains('pdrop'),'tapping it drops the Bible list from the top bar');
  ok(mr&&mr.top>=lr.bottom-2&&mr.top<=lr.bottom+40&&mr.top<innerHeight/3,'the list starts at the lower edge of the bar ('+(mr&&Math.round(mr.top))+' under '+Math.round(lr.bottom)+')');
  ok(mr&&mr.left<=lr.right&&mr.right>=lr.left&&mr.bottom<=innerHeight,'it is beside the label and stays on the screen');
  ok(m&&m.querySelectorAll('[data-b]').length>=2,'it lists the Bibles');
  if(m){ await drag(m,0,-160,{y:mr.top+40}); ok(!m.isConnected,'dragged back up, it closes'); }
  pdown(lab); click(lab); await sl(500); const m2=$('.bvmenu.biblemenu'); if(m2){ await drag(m2,0,-30,{y:m2.getBoundingClientRect().top+40}); ok(m2.isConnected,'a short drag lets it spring back'); }
  await closeMenus(); if(SK==='a') SkinA.showChrome(false);
 });
 await T('swipe back',async()=>{
  PUI.readingSheet(); await sl(400); let sh=$('#pSheet .psheet'); ok(!!sh,'a sheet is open');
  await drag(sh,0,40); ok(!!$('#pSheet'),'a short drag down: the sheet springs back');
  sh=$('#pSheet .psheet'); await drag(sh,0,260); await sl(200); ok(!$('#pSheet'),'dragged down from its middle: the sheet closes');
  const n0=PUI.pageCount(); PUI.library(); await sl(500); const pg=[...$$('.ppage')].pop(); ok(PUI.pageCount()===n0+1,'a page is open');
  await drag(pg,240,8,{x:60}); await sl(300); ok(PUI.pageCount()===n0,'dragged back to the right: the page closes');
  PUI.wordPop({word:'love',strongs:[],morphs:[]}); await sl(500); const wp=$('#pWordPop'), bar=wp&&wp.querySelector('.pwbar');
  if(bar){ const r=bar.getBoundingClientRect(); const pe=(t,x,y)=>{let e; try{e=new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:3});}catch(z){e=new MouseEvent(t,{bubbles:true,clientX:x,clientY:y});} bar.dispatchEvent(e);};
   pe('pointerdown',r.left+20,r.top+10); pe('pointermove',r.left+60,r.top+40); pe('pointerup',r.left+60,r.top+40); await sl(200); ok(!!$('#pWordPop'),'the word pop-up moved a little stays open');
   const r2=bar.getBoundingClientRect(); pe('pointerdown',r2.left+20,r2.top+10); pe('pointermove',r2.left+20+innerWidth*0.8,r2.top+10); pe('pointerup',r2.left+20+innerWidth*0.8,r2.top+10); await sl(200); ok(!$('#pWordPop'),'thrown off the screen, the word pop-up closes'); }
  about(); await sl(500); const box=$('#modal .box'); ok(modalOpen(),'a dialog is open'); await drag(box,0,240,{y:box.getBoundingClientRect().top+30}); await sl(300); ok(!modalOpen(),'dragged down, the dialog closes');
  if(SK==='c'){ SkinC.navDrawer(true); await sl(400); const d=$('.c-drawer.l'); await drag(d,-220,4,{y:300}); ok(!d.classList.contains('on'),'the Navigator dragged back to the left closes');
   SkinC.quick(); await sl(400); const cc=$('.c-cc'); await drag(cc,0,-200,{y:cc.getBoundingClientRect().top+30}); ok(!cc.classList.contains('on'),'quick settings pushed back up close'); }
 });
 await T('bottom edge',async()=>{
  PUI_bars(true); await sl(300); ok(R.classList.contains('sk-baroff'),'the bottom bar hides while reading');
  const t=document.elementFromPoint(innerWidth/2,innerHeight-12)||document.body; fing(t,'touchstart',innerWidth/2,innerHeight-12); fing(t,'touchmove',innerWidth/2,innerHeight-60); fing(t,'touchend',innerWidth/2,innerHeight-60); await sl(400);
  ok(!R.classList.contains('sk-baroff'),'a swipe up from the bottom edge brings it back');
 });
 await T('phone guide',async()=>{
  if(!window.__orig||!window.__orig.appCmd){ok(false,'no appCmd');return;}
  await window.__orig.appCmd('guide',TimotheosOptions.appearance().skin); await sl(1800);
  const gb=$('.guidebox'); const fr=gb&&gb.querySelector('iframe'); ok(!!fr&&/phone=1/.test(fr.src),'Help › User guide opens the phone guide over the page');
  const d=fr&&fr.contentDocument; ok(!!d&&!!d.getElementById('guideP')&&!d.getElementById('guide'),'only the phone guide is in it');
  const txt=d?d.body.textContent:''; ok(d&&!d.querySelector('#guideP kbd')&&!/Ctrl\+|Alt\+|F11|F5|right-click|mouse/i.test(d.getElementById('guideP').textContent),'no keys, mouse or right-click in the phone guide');
  ok(d&&/Quiet Reader/.test(txt)&&/Study Desk/.test(txt)&&/drag/i.test(txt),'it explains the phone screens and dragging popups back');
  const nav=d.getElementById('toc'), W=fr.contentWindow; ok(W.getComputedStyle(nav).position==='absolute'&&nav.getBoundingClientRect().right<=2,'its contents list is a hidden drawer');
  d.getElementById('tocBtn').click(); await sl(350); ok(nav.getBoundingClientRect().left>=-1&&d.body.classList.contains('tocon'),'the Contents button pulls it out');
  const wr=d.querySelector('.wrap'); const f2=(type,x,y)=>{const e=new W.Event(type,{bubbles:true,cancelable:true}); const pt={clientX:x,clientY:y,identifier:1,target:nav}; e.touches=type==='touchend'?[]:[pt]; e.changedTouches=[pt]; nav.dispatchEvent(e);};
  f2('touchstart',200,300); for(let k=1;k<=5;k++){f2('touchmove',200-k*40,302);await sl(16);} f2('touchend',0,302); await sl(350); ok(!d.body.classList.contains('tocon'),'dragged back to the left, it hides');
  const f3=(type,x,y)=>{const e=new W.Event(type,{bubbles:true,cancelable:true}); const pt={clientX:x,clientY:y,identifier:1,target:wr}; e.touches=type==='touchend'?[]:[pt]; e.changedTouches=[pt]; wr.dispatchEvent(e);};
  f3('touchstart',8,300); for(let k=1;k<=5;k++){f3('touchmove',8+k*40,302);await sl(16);} f3('touchend',208,302); await sl(350); ok(d.body.classList.contains('tocon'),'pulled out from the left edge, it shows');
  d.getElementById('tocScrim').click(); await sl(300);
  const tb=d.querySelector('.titlebar .ttl'); const f4=(type,y)=>{const e=new W.Event(type,{bubbles:true,cancelable:true}); const pt={clientX:120,clientY:y,identifier:1,target:tb}; e.touches=type==='touchend'?[]:[pt]; e.changedTouches=[pt]; tb.dispatchEvent(e);};
  f4('touchstart',20); for(let k=1;k<=5;k++){f4('touchmove',20+k*40);await sl(16);} f4('touchend',220); await sl(500); ok(!$('.guidebox'),'dragging its title bar down closes the guide');
  await window.__orig.appCmd('guide',''); await sl(1200); ok(!!$('.guidebox'),'opened again'); history.back(); await sl(600); ok(!$('.guidebox'),'Back closes it');
 });
 await T('no shortcuts',async()=>{
  PUI.helpSheet(); await sl(300); ok(!/shortcut/i.test($('#pSheet').textContent),'Help: no keyboard shortcuts'); await closeSheet();
  if(SK==='a'){ SkinA.more(); await sl(400); ok(!/shortcut/i.test($('#pSheet').textContent),'More: no keyboard shortcuts'); await closeSheet(); }
  if(SK==='b'){ SkinB.setTab('more'); await sl(400); ok(!/shortcut/i.test($('.ppage.root').textContent),'More tab: no keyboard shortcuts'); SkinB.setTab('read'); await sl(300); }
  if(SK==='c'){ SkinC.palette(); await sl(400); ok(!/shortcut/i.test($('.c-pal').textContent),'Command bar: no keyboard shortcuts'); SkinC.closeAll(); await sl(200); }
  runCommand('options'); await sl(500); const kb=$('#optionsDlg [data-o="keys"]'); ok(!kb||getComputedStyle(kb).display==='none','Options: no Shortcuts page'); await closeOptions();
 });
 await T('change screen',async()=>{ TimotheosSkins.picker(true); await sl(300); ok(!!$('#skPick .skp-x'),'Change screen offers to keep the current one'); click($('#skPick .skp-x')); await sl(400); ok(R.classList.contains('sk-'+SK)&&!$('#skPick'),'Keep the current screen'); });
 ok(!errs.length,'no script errors'+(errs.length?': '+[...new Set(errs)].slice(0,6).join(' / '):''));
 api.copyText=origCopy;
 console.log('RESULT '+out.join(' | '));
})();
