// Read aloud: options page, voice/volume/pitch/tempo, the three reading modes (with a pretend speech engine)
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m);
 const spoken=[]; let cur=null,timer=null;
 const mock={getVoices:()=>[{name:'Mock EN',lang:'en-US',voiceURI:'mock-en',localService:true},{name:'Mock FIL',lang:'fil-PH',voiceURI:'mock-fil',localService:true}],
  speak(u){cur=u; spoken.push({text:u.text,voice:u.voice&&u.voice.name,lang:u.lang,volume:u.volume,pitch:u.pitch,rate:u.rate}); timer=setTimeout(()=>{cur=null; u.onend&&u.onend();},6);},
  cancel(){ if(timer){clearTimeout(timer);timer=null;} if(cur){const u=cur;cur=null;setTimeout(()=>u.onend&&u.onend(),1);} }, addEventListener(){}, pause(){}, resume(){}};
 Object.defineProperty(window,'speechSynthesis',{value:mock,configurable:true});
 if(typeof SpeechSynthesisUtterance==='undefined') window.SpeechSynthesisUtterance=function(t){this.text=t;};
 const S=TimotheosSpeech;
 // settings page
 TimotheosOptions.open('speech'); await sl(800);
 const nav=[...document.querySelectorAll('#optNav button')].find(b=>b.dataset.o==='speech'); ok(nav&&nav.classList.contains('on'),'Options has a Read aloud page');
 const root=document.getElementById('ttsOpt'); ok(root.querySelectorAll('[data-tl]').length>=2&&root.querySelector('#ttsVol')&&root.querySelector('#ttsPitch')&&root.querySelector('#ttsRate')&&root.querySelector('[name=ttsMode][value=range]'),'it has language/voice, volume, pitch, tempo and the three reading choices');
 const setR=(id,v)=>{const e=root.querySelector(id); e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}));};
 setR('#ttsVol',0.5); setR('#ttsPitch',1.5); setR('#ttsRate',1.25);
 const c=state.settings.tts; ok(c.volume===0.5&&c.pitch===1.5&&c.rate===1.25,'volume, pitch and tempo are saved: '+[c.volume,c.pitch,c.rate]);
 const sel=root.querySelector('[data-tl="en"]'); sel.value='mock-en'; sel.dispatchEvent(new Event('change',{bubbles:true}));
 document.getElementById('optionsDlg').classList.add('hidden');
 const starts=re=>spoken.filter(s=>re.test(s.text)).length;
 // 1. on to the end of the chapter and into the next
 await go({b:43,c:3,v:34}); await sl(1500); spoken.length=0;
 const p1=S.speakView(0,null); for(let k=0;k<80&&!spoken.some(s=>/Lord knew/.test(s.text));k++) await sl(150);
 S.stop(); await p1;
 ok(spoken.length>3&&spoken.some(s=>/Lord knew/.test(s.text)),'"read on" goes from the active verse into the next chapter ('+spoken.length+' pieces)');
 ok(spoken[0].volume===0.5&&spoken[0].pitch===1.5&&spoken[0].rate===1.25&&spoken[0].voice==='Mock EN'&&spoken[0].lang==='en-US','volume, pitch, tempo and the chosen voice are used: '+JSON.stringify(spoken[0]).slice(30,150));
 ok(!S.isSpeaking(),'stop stops');
 // 2. repeat the chapter
 let n=cfg=>{const t=state.settings.tts; Object.assign(t,cfg); save({tts:t});};
 n({mode:'chapter'}); await go({b:43,c:3,v:30}); await sl(1500); spoken.length=0;
 const p2=S.speakView(0,null); for(let k=0;k<200&&starts(/God so loved the world/)<2;k++) await sl(150); S.stop(); await p2;
 ok(starts(/God so loved the world/)>=2&&!spoken.some(s=>/Lord knew/.test(s.text)),'"repeat the chapter": John 3 again from verse 1, without going on to chapter 4 (v16 said '+starts(/God so loved the world/)+'x)');
 // 3. repeat a verse range
 n({mode:'range',from:{b:43,c:3,v:16},to:{b:43,c:3,v:18}}); await go({b:43,c:1,v:1}); await sl(1500); spoken.length=0;
 const p3=S.speakView(0,null); for(let k=0;k<200&&spoken.length<7;k++) await sl(100); S.stop(); await p3;
 const seq=spoken.slice(0,6).map(s=>/God so loved/.test(s.text)?16:/God sent not/.test(s.text)?17:/believeth on him is not/.test(s.text)?18:'?').join(',');
 ok(seq==='16,17,18,16,17,18','"repeat a verse range": John 3:16-18 again and again: '+seq);
 // 4. the end of the Bible
 n({mode:'bible'}); await go({b:66,c:22,v:20}); await sl(2000); spoken.length=0;
 let fin=false; const p4=S.speakView(0,null).then(()=>{fin=true;}); for(let k=0;k<100&&!fin;k++) await sl(150);
 ok(fin&&spoken.length>=2&&!S.isSpeaking(),'reading stops by itself at the end of the Bible ('+spoken.length+' pieces from Revelation 22:20)');
 // 5. another language
 n({lang:'fil'}); const sf=state.settings.tts; sf.voices.fil='mock-fil'; save({tts:sf}); await go({b:43,c:3,v:16}); await sl(1500); spoken.length=0;
 const p5=S.speakView(0,null); await sl(600); S.stop(); await p5;
 ok(spoken.length&&spoken[0].voice==='Mock FIL'&&spoken[0].lang==='fil-PH','"Read in" another language uses that language\'s voice: '+(spoken[0]&&spoken[0].voice));
 console.log('RESULT '+out.join(' | '));})();
