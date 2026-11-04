// the three phone screens (A Quiet Reader, B Clear Tabs, C Study Desk): run with EXTRA=',"windowBounds":{"width":390,"height":800}'
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; const ok=(c,m)=>out.push((c?'✓ ':'✗ ')+m); const $=s=>document.querySelector(s), R=document.documentElement;
 R.classList.add('mobile'); await sl(400);
 const S=TimotheosSkins, vis=s=>{const e=$(s);return !!e&&e.getBoundingClientRect().width>0;};
 S.picker(false); await sl(200); ok($$=document.querySelectorAll('#skPick .skp-card').length===3,'picker has 3 cards');
 $('#skPick .skp-card[data-k="b"]').click(); await sl(500); ok(!$('#skPick')&&R.classList.contains('sk-b'),'choosing B closes the picker');
 ok(document.querySelectorAll('svg.ic .d').length>10,'finer icons drawn ('+document.querySelectorAll('svg.ic .d').length+')');
 // B: tabs
 for(const [t,id] of [['lib','lib'],['search','search'],['study','study']]){ $(`#skTabs [data-t="${t}"]`).click(); await sl(700); ok(TimotheosPhone.current()===id||new RegExp(id).test(TimotheosPhone.current()),'B tab '+t+' -> '+TimotheosPhone.current()); }
 $('#skTabs [data-t="read"]').click(); await sl(500); ok(R.classList.contains('sk-bible'),'B Read returns to the Bible');
 $('#skPar').click(); await sl(700); ok(R.classList.contains('psplitting'),'B Parallel splits'); const d=$('#skDiv').getBoundingClientRect(); ok(d.height>10&&d.top>100,'divider shown at '+Math.round(d.top));
 $('#skPar').click(); await sl(500); ok(!R.classList.contains('psplitting'),'B Parallel off');
 $('#skTabs [data-t="more"]').click(); await sl(500); const tiles=[...document.querySelectorAll('#skMoreBody .sk-tiles button span')].map(x=>x.textContent);
 for(const n of ['Options','Import modules…','Read aloud settings','Copy verses…','About Timotheos','Change screen','Books & chapters','Daily readings','Reset panel layout','Keyboard shortcuts','Add module folder…','New user module…']) ok(tiles.includes(n),'More has '+n);
 $('#skMoreQ').value='aloud'; $('#skMoreQ').dispatchEvent(new Event('input')); ok(document.querySelectorAll('#skMoreBody .sk-tiles button').length===2,'More filter works'); S.closeSheet(); await sl(400);
 // verse menu
 const v=$('.bvtext [data-v="16"]'); const r=v.getBoundingClientRect(); v.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+50,clientY:r.top+8})); await sl(300);
 const cm=$('#ctxMenu').getBoundingClientRect(); ok(!$('#ctxMenu').classList.contains('hidden')&&cm.bottom>=innerHeight-40&&cm.width>=innerWidth-24,'verse menu is a bottom sheet ('+Math.round(cm.width)+'x'+Math.round(cm.bottom)+' in '+innerWidth+'x'+innerHeight+')'); $('#ctxMenu').classList.add('hidden');
 // C: drawers, split, command bar
 S.apply('c'); await sl(600); ok(R.classList.contains('sk-c')&&!R.classList.contains('sk-b'),'switched to C');
 $('#skDock [data-a="nav"]').click(); await sl(700); ok(R.classList.contains('pdrawer')&&/tree/.test($('.dgroup.pover .dtab.on')?.dataset.id||''),'C left drawer = Books & chapters'); const dw=$('.dgroup.pover').getBoundingClientRect(); ok(dw.left<8&&dw.width<innerWidth*.95,'drawer on the left, '+Math.round(dw.width)+' wide');
 await window.go({b:43,c:4,v:1}); await sl(600); ok(!R.classList.contains('pdrawer'),'choosing a chapter closes the drawer');
 $('#skDock [data-a="study"]').click(); await sl(700); ok(R.dataset.drawer==='r'&&vis('#skDrawerTabs'),'C right drawer with its tabs');
 document.querySelector('#skDrawerTabs [data-d="lib"]').click(); await sl(700); ok(/lib/.test($('.dgroup.pover .dtab.on')?.dataset.id||''),'drawer tab Library');
 document.body.click(); await sl(300); ok(!R.classList.contains('pdrawer'),'tapping outside closes the drawer');
 $('#skTop [data-a="cmd"]').click(); await sl(500); const q=$('#skCmdQ'); q.value='options'; q.dispatchEvent(new Event('input')); ok(document.querySelectorAll('#skCmdBody .pr').length>=2,'command bar finds commands'); S.closeSheet(); await sl(300);
 $('#skDock [data-a="split"]').click(); await sl(400); ok(document.querySelectorAll('#skSheetWrap [data-s]').length===4,'split chooser offers 4'); $('#skSheetWrap [data-s="cmt"]').click(); await sl(900); ok(R.classList.contains('psplitting'),'commentary beside the text');
 // A
 S.apply('a'); await sl(600); ok(R.classList.contains('sk-a')&&!R.classList.contains('psplitting'),'switched to A, split cleared');
 ok(!vis('#skTop')||getComputedStyle($('#skTop')).transform!=='none','A bars are hidden at first'); $('.bvtext').click(); await sl(400); ok(R.classList.contains('sk-chrome'),'a tap shows the bars'); $('.bvtext').click(); await sl(300); ok(!R.classList.contains('sk-chrome'),'a second tap hides them');
 ok(vis('#skCap')&&/John/.test($('#skRef').textContent),'capsule shows '+$('#skRef').textContent);
 // reading still works
 const before=state.ref.c; $('.bvtext').dispatchEvent(new Event('x')); await window.go({b:43,c:5,v:1}); await sl(500); ok(state.ref.c===5,'go() still works');
 console.log('RESULT '+out.join(' | '));
})();
