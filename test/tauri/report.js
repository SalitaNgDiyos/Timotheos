/* SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (C) 2026 Edmund P. Valdez */
// The problem report: About has the button, the text names the version, the device and each Bible view, and it
// records errors and the buttons used (never what is typed).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms)); const out = []; const ok = (c, m) => out.push((c ? '✓ ' : '✗ ') + m);
  await sleep(2500);
  let copied = null; api.copyText = async t => { copied = t; };
  runCommand('about'); await sleep(500);
  const b = document.querySelector('#aboutReport'); ok(!!b, 'About has "Copy problem report"');
  setTimeout(() => { throw new Error('test fault 123'); }, 0); await sleep(200);
  const inp = document.querySelector('#searchInput'); inp.value = 'secret words'; inp.click();
  b.click(); await sleep(400);
  ok(!!copied && /^Timotheos problem report/.test(copied), 'the report is put on the clipboard');
  ok(/Version: \d/.test(copied || ''), 'it names the version');
  ok(/View 0: Bible .*shown font: /.test(copied || '') && /View 1: /.test(copied || ''), 'it describes each Bible view and the font it shows');
  ok(/test fault 123/.test(copied || ''), 'it lists an error of this run');
  ok(/Copy problem report/.test((copied || '').split('Last taps')[1] || ''), 'it lists the buttons used');
  ok(!/secret words/.test(copied || ''), 'it never holds what was typed');
  ok(!/\/home\/|\/tmp\/|C:\\/.test(copied || ''), 'it holds no folder names');
  views()[1].font = 'No Such Font XYZ'; ensurePanes(); await sleep(300);
  ok(/View 1: .*No Such Font XYZ \(NOT on this device\)/.test(TimotheosReport.text()), 'a chosen font the device lacks is marked');
  console.log('RESULT ' + out.join(' | '));
})();
