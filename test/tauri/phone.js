// phone layout: run with EXTRA=',"windowBounds":{"width":390,"height":800}' bash test/tauri/run.sh test/tauri/phone.js out.png
(async()=>{const sl=ms=>new Promise(r=>setTimeout(r,ms)); await sl(2500);
 const out=[]; out.push('start='+document.querySelector('#phonebar button.on')?.dataset.id);
 // choose a book from the tree while on the Books panel
 TimotheosPhone.show('tree'); await sl(300);
 const b=[...document.querySelectorAll('[data-panel=tree] .bk, [data-panel=tree] li, [data-panel=tree] .book')][3]; out.push('item='+(b&&b.textContent.trim().slice(0,20)));
 await go({b:19,c:23,v:1}); await sl(800); out.push('afterGo='+document.querySelector('#phonebar button.on')?.dataset.id);
 console.log('RESULT '+out.join(' | '));})();
