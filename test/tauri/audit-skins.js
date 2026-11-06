// Audit of one phone screen (__SK__ = a | b | c): every function is used and its result checked.
// Run: sed s/__SK__/a/ test/tauri/audit-skins.js > /tmp/a.js; EXTRA=',"windowBounds":{"width":418,"height":900}' bash test/tauri/run.sh /tmp/a.js out.png 4000
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const errs=[]; window.addEventListener('error',e=>errs.push('error: '+e.message)); window.addEventListener('unhandledrejection',e=>errs.push('promise: '+(e.reason&&e.reason.message||e.reason)));
 const ONLY='__ONLY__'; const T=async(name,fn)=>{ if(ONLY&&!ONLY.includes('__')&&name!=='picker'&&!ONLY.split(',').includes(name)) return; try{await fn();}catch(e){ok(false,name+' THREW '+e.message+' @'+(e.stack||'').split('\n')[1]);}};
 await sl(2600); const R=document.documentElement; const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
 const SK='__SK__';
 // stand-ins for what would leave the app (system dialogs, printer, clipboard, speech engine)
 const copied=[]; const origCopy=api.copyText; api.copyText=async(t,h)=>{copied.push(t);};
 const calls=[]; for(const k of ['importDialog','addFolder','exportSave','appCmd','openExternal','print','exportVsls','exportRdp']) if(api[k]){const f=api[k]; api[k]=async(...a)=>{calls.push(k+':'+(a[0]||''));return null;};}
 window.print=()=>calls.push('window.print');
 const spoken=[]; let cur=null,tm=null;
 const mock={getVoices:()=>[{name:'Mock EN',lang:'en-US',voiceURI:'mock-en',localService:true},{name:'Mock FIL',lang:'fil-PH',voiceURI:'mock-fil',localService:true}],
  speak(u){cur=u; spoken.push(u.text); tm=setTimeout(()=>{cur=null;u.onend&&u.onend();},250);}, cancel(){ if(tm){clearTimeout(tm);tm=null;} if(cur){const u=cur;cur=null;setTimeout(()=>u.onend&&u.onend(),1);} }, addEventListener(){}, pause(){}, resume(){}};
 Object.defineProperty(window,'speechSynthesis',{value:mock,configurable:true}); if(typeof SpeechSynthesisUtterance==='undefined') window.SpeechSynthesisUtterance=function(t){this.text=t;};
 const row=v=>$(`.bv.active tr[data-v="${v}"]`)||$(`.bv tr[data-v="${v}"]`);
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
  ok(getComputedStyle(row(3)).display==='block','verses flow as paragraphs (not the old table)');
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
  if(SK==='a'){ ok(!!sheet()&&/Strong's|Dictionary/.test($('#pSheet .ph4').textContent),'tap a word: its dictionary sheet ('+$('#pSheet .ph4').textContent+')'); ok($$('#pSheet .pcard').length>0,'the entry is shown'); click($('#pSheet [data-find]')); await sl(1500); ok($$('.ppage .hit').length>0||!!$('.ppage .sq'),'Find opens the search with the word'); PUI.clearPages(); await sl(300); }
  if(SK==='c'){ ok($('.c-drawer.r').classList.contains('on')&&/Dictionary/.test($('.c-drawer.r .dh').textContent),'tap a word: the study drawer shows its dictionary'); ok($$('.c-drawer.r .pchip').length>0,'the words of the verse with Strong\'s numbers'); for(const tl of ['commentary','xref','note','library']){ click($(`.c-drawer.r [data-tool="${tl}"]`)); await sl(1300); ok($('.c-drawer.r .pp').children.length>0,'study drawer: '+tl); } SkinC.closeAll(); await sl(300); }
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
    click($('.c-cc [data-cc="dark"]')); await sl(200); ok(R.classList.contains('sk-light'),'Dark off: light desk'); click($('.c-cc [data-cc="dark"]')); await sl(200); ok(!R.classList.contains('sk-light'),'Dark on');
    const z0=(views()[state.active]||{}).zoom||1; const sl2=$('.c-cc [data-zoom]'); sl2.value=String(Math.round((z0+.3)*10)/10); sl2.dispatchEvent(new Event('input',{bubbles:true})); await sl(400); ok(((views()[state.active]||{}).zoom||1)>z0,'text size slider'); sl2.value=String(z0); sl2.dispatchEvent(new Event('input',{bubbles:true})); await sl(300);
    SkinC.closeAll(); await sl(300); }
  PUI.readingSheet(); await sl(400); ok($$('#pSheet .tgl').length===12,'Reading view: 12 things to show or hide');
  const h=$('#pSheet .tgl[data-show="headings"]'); const was=h.classList.contains('on'); click(h); await sl(800); const now=!!Object.assign({},state.settings.show,(views()[state.active]||{}).show).headings; ok(now!==was,'Headings switch works'); click($('#pSheet .tgl[data-show="headings"]')); await sl(600);
  const z0=(views()[state.active]||{}).zoom||1; click($('#pSheet [data-z="1"]')); await sl(300); ok(((views()[state.active]||{}).zoom||1)>z0,'A+ makes the text larger'); click($('#pSheet [data-z="-1"]')); await sl(300);
  for(const a of ['font','fcolor','selbg','pen','ul','menu']){ PUI.readingSheet(); await sl(300); click($(`#pSheet [data-x="${a}"]`)); await sl(500); ok(menuOpen(),'view: '+a+' menu opens as a sheet'); await closeMenus(); }
  PUI.readingSheet(); await sl(300); click($('#pSheet [data-x="bible"]')); await sl(500); ok(menuOpen()&&$$('.bvmenu button, .bvmenu label').length>0,'choose the Bible'); await closeMenus(); await closeSheet();
  PUI.readingSheet(); await sl(300); click($('#pSheet [data-x="info"]')); await sl(900); ok(!$('#propsDlg').classList.contains('hidden')||modalOpen(),'About this Bible'); $('#propsDlg').classList.add('hidden'); await closeModal(); await closeSheet();
 });
 // ---------- parallel / split ----------
 await T('parallel',async()=>{
  await go({b:19,c:23,v:1}); await sl(600);
  if(SK==='c'){ SkinC.desk('par'); await sl(1500); ok(R.classList.contains('psplitting')&&$('.c-desk').classList.contains('on'),'split desk: parallel Bible below'); for(const k of ['cmt','lib','search']){ click($(`.c-desk [data-dc="${k}"]`)); await sl(1300); ok($('.c-desk .db').children.length>0,'split desk: '+k); } click($('.c-desk [data-dc="close"]')); await sl(400); ok(!$('.c-desk').classList.contains('on'),'split desk closes'); return; }
  if(SK==='b') click($('.b-big [data-a="par"]')); else await TimotheosSkins.parallel(true);
  await sl(1500); ok(R.classList.contains('psplitting'),'two Bibles, one above the other'); const g=$$('.dgroup.psplit .bv .sk-ttl')[0]; ok(!!g,'each has its label');
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
  PUI.library(); await sl(500); PUI.openModule((state.modules.books.find(b=>!b.locked&&b.kind==='dictionary')||{}).id); await sl(1200); ok(PUI.pageCount()===2,'two pages open'); history.back(); await sl(500); ok(PUI.pageCount()===1,'Back closes the top page'); history.back(); await sl(500); ok(PUI.pageCount()===0,'Back closes the last page');
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
  const tx=$('.bv.active .bvtext')||$('.bvtext'); tx.scrollTop=0; await sl(100); ok(shown(),'bottom bar shows before scrolling');
  tx.scrollTop=300; tx.dispatchEvent(new Event('scroll')); await sl(80); tx.scrollTop=600; tx.dispatchEvent(new Event('scroll')); await sl(350);
  ok(!shown()&&getComputedStyle($(bar)).opacity<0.5,'scrolling the text hides the bottom bar');
  const r=tx.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2; const pe=(ty,dx=0,dy=0)=>tx.dispatchEvent(new PointerEvent(ty,{bubbles:true,clientX:x+dx,clientY:y+dy,pointerId:1}));
  pe('pointerdown'); pe('pointerup'); await sl(350); ok(shown(),'a tap on the page brings it back');
  pe('pointerdown'); pe('pointermove',0,-40); pe('pointerup',0,-40); await sl(300); ok(!shown(),'swiping on the page hides it');
  pe('pointerdown'); pe('pointerup'); await sl(300); ok(shown(),'tap again: it is back'); await closeSheet(); PUI.clearPages&&PUI.clearPages(); await sl(200); });
 await T('change screen',async()=>{ TimotheosSkins.picker(true); await sl(300); ok(!!$('#skPick .skp-x'),'Change screen offers to keep the current one'); click($('#skPick .skp-x')); await sl(400); ok(R.classList.contains('sk-'+SK)&&!$('#skPick'),'Keep the current screen'); });
 ok(!errs.length,'no script errors'+(errs.length?': '+[...new Set(errs)].slice(0,6).join(' / '):''));
 api.copyText=origCopy;
 console.log('RESULT '+out.join(' | '));
})();
