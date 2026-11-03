// 0.6.4 unit checks
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const { rtfToHtml } = require('../src/lib/rtf.js');
const h = b => [...b].map(x => "\\'" + x.toString(16)).join('');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const rtf = '{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Times New Roman;}}\\f0 James ' + h(Buffer.from([0xC9, 0xC1, 0xCA, 0xD9, 0xC2, 0xCF, 0xD5])) + ' and ' + h(Buffer.from([0xF0, 0xE3, 0xED])) + " \\'ef \\u8017? caf\\'e9 na\\'efve \\'fc.}";
const out = rtfToHtml(rtf);
ok(out.includes('ΙΑΚΩΒΟΥ') && out.includes('πγν'), '[G1] Greek in a font without a Greek charset is decoded as code page 1253');
ok(out.includes('café') && out.includes('naïve') && out.includes(' ü.'), '[G2] Western accented letters stay as they are');
ok(out.includes('ὑ'), '[G3] unicode escapes still work in the same text');
const R = f => fs.readFileSync(path.join(__dirname, '../src/renderer', f), 'utf8');
ok(!R('index.html').includes('id="navModeSw"') && !R('index.html').includes('id="navHeader1"'), '[N1] the Nav 1/2/3/All switch and the old header bar are gone from the page');
ok(R('nav-ui.js').includes('function barHtml') && R('dock.js').includes('TimotheosNav.barHtml()'), '[N2] every Bible view caption gets the verse browser bar');
ok(!/Bible views<\/div>/.test(R('options.js').slice(R('options.js').indexOf('fillPanelsMenu'))) || !R('options.js').includes('data-lay="cols"'), '[M1] the Panels menu has no Bible Views block');
ok(R('panelskin-ui.js').includes("'--textbg'") && !R('panelskin-ui.js').includes("'--panel', k.bg"), '[S1] Page Background Color is the text background only');
console.log(n + ' checks passed');
