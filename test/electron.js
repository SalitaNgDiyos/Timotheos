// The Electron edition's own parts: window title bar, modules dropped on the window, removing an imported module,
// F11 reading focus, the Apocrypha after the New Testament, reading straight from disk (non-UTF-8 text kept).
// Run: npm run electron:web; ELECTRON=1 test/run.sh test/electron.js shot.png 60
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 120 && !window.__tanglawReady; i++) await sleep(250);
  const T = window.__tanglaw; const out = [];
  const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  const I = (c, a) => window.tanglawNative.invoke(c, a || {});
  const $ = s => document.querySelector(s);
  try {
    await sleep(800);
    ok(window.tanglawNative && window.tanglawNative.electron && document.documentElement.classList.contains('electron'), 'running in the Electron edition (' + window.tanglawNative.platform + ')');
    ok(getComputedStyle($('.titlebar')).webkitAppRegion === 'drag' || getComputedStyle($('.titlebar')).getPropertyValue('-webkit-app-region') === 'drag', 'the title bar moves the window');
    ok(/^\d+\.\d+\.\d+$/.test(await I('app_version')), 'version: ' + await I('app_version'));
    // reading straight from disk: a UTF-16 e-Sword Bible and plain theWord text
    const kjv = T.bibles().find(b => /^kjv\.ont$/i.test(b.file.split(/[\\/]/).pop()));
    T.setOpen([kjv.id]); await T.go(43, 3, 16); await sleep(500);
    ok(/loved/.test($('#view [data-v="16"]').textContent) && /begotten/.test($('#view [data-v="16"]').textContent), 'John 3:16 shown: ' + $('#view [data-v="16"]').textContent.slice(0, 50));
    // text that is not UTF-8 comes over as bytes, unchanged (like the Tauri edition)
    const r = await I('sql', { path: kjv.file.replace(/kjv\.ont$/i, 'Test Dictionary.dct.twm'), query: "select cast(x'4772e2636500' as text), 'plain'", params: [] }).catch(e => ({ err: String(e) }));
    const v0 = r.rows && r.rows[0][0];
    ok(v0 instanceof Uint8Array && v0[2] === 0xe2 && r.rows[0][1] === 'plain', 'non-UTF-8 text kept as bytes: ' + (v0 instanceof Uint8Array ? [...v0].map(x => x.toString(16)).join(' ') : JSON.stringify(r).slice(0, 80)));
    // modules dropped on the window
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([1, 2, 3, 4])], 'Not a module.cmt.twm'));
    document.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); await sleep(100);
    ok(document.body.classList.contains('dropping'), 'dragging files over the window shows where to drop them');
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await sleep(2500);
    const rep = [...document.querySelectorAll('.dlg')].find(d => /Import report/.test(d.textContent));
    ok(rep && /Not a module\.cmt\.twm/.test(rep.textContent) && /skipped|not/i.test(rep.textContent), 'a dropped file is checked and reported: ' + (rep ? rep.querySelector('.dlgbox').textContent.replace(/\s+/g, ' ').slice(0, 90) : 'no report'));
    if (rep) { rep.querySelector('.primary').click(); await sleep(300); }
    // an imported module can be removed again (to the Recycle Bin)
    const made = await I('umod_create', { name: 'Remove Me.cmt.twm', statements: [['create table config(name text, value text)', []], ["insert into config values ('type','2'),('title','Remove Me'),('user','1')", []], ['create table topics(id integer primary key, pid int, subject text, rel_order int)', []], ['create table content(topic_id integer primary key, data text, data2 blob)', []]] });
    ok(await I('is_imported', { path: made }), 'a module in Tanglaw\'s own folder counts as imported');
    ok(!(await I('is_imported', { path: kjv.file })), 'a module in your own folders does not (it is never removed by Tanglaw)');
    let removed = ''; try { await I('remove_imported', { path: made }); removed = 'ok'; } catch (e) { removed = String(e); }
    const still = await I('is_imported', { path: made });
    ok(removed === 'ok' ? !still : /trash|recycle|gio|not supported|failed/i.test(removed), 'Remove from Tanglaw: ' + (removed === 'ok' ? 'moved to the Recycle Bin' : 'this test machine has no Recycle Bin (' + removed.slice(0, 60) + ')'));
    let refused = ''; try { await I('remove_imported', { path: kjv.file }); } catch (e) { refused = String(e); }
    ok(/only modules imported/.test(refused), 'removing a module outside Tanglaw\'s folder is refused');
    // only files chosen in a dialog may be read whole
    let fsr = ''; try { await I('fs_read', { path: kjv.file }); } catch (e) { fsr = String(e); }
    ok(/only files chosen/.test(fsr), 'other files cannot be read whole by the page');
    // F11 reading focus
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true, cancelable: true })); await sleep(300);
    ok(document.body.classList.contains('readfocus') && getComputedStyle($('#zone-right')).display === 'none', 'F11: only the Bible views');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F11', bubbles: true, cancelable: true })); await sleep(300);
    ok(!document.body.classList.contains('readfocus'), 'F11 again: the panels are back');
    // the Apocrypha after the New Testament (Tanglaw 0.4's option)
    const kjva = T.bibles().find(b => /KJVA11/i.test(b.abbr + b.file));
    if (kjva) {
      T.setOpen([kjva.id]); await sleep(400); await T.go(1, 1); await sleep(400);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true })); await sleep(600);
      const o = $('#oOrder'); o.value = 'end'; o.dispatchEvent(new Event('change')); await sleep(700);
      const names = [...document.querySelectorAll('#bookSel option')].map(x => x.textContent);
      const lastNT = Math.max(...['Matthew', 'Mark', 'Luke', 'John', 'Romans', 'Revelation'].map(n => names.indexOf(n)));
      ok(lastNT >= 0 && names.indexOf('Tobit') > lastNT && names.indexOf('Malachi') < names.indexOf('Tobit'), 'Apocrypha after the New Testament: ' + names.join(', '));
      document.querySelector('.dlgbox .primary')?.click(); await sleep(300);
    } else ok(false, 'no test Bible with the Apocrypha');
  } catch (e) { ok(false, 'error ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
  await window.__TAURI_INTERNALS__.invoke('test_report', { text: out.join(' | ') });
})();
