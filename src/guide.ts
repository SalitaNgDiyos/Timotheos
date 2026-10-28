// The User Guide (F1 or the ? button): contents on the left, a find box, the sections on the right.
// It describes this version of Tanglaw only; keep it in step with the program.
import { $, esc } from './ui';

const K = (k: string) => k.split('+').map(x => `<kbd>${x}</kbd>`).join('+');
const SECTIONS: [string, string, string][] = [
  ['start', 'Getting started', `
<p>Tanglaw is a free Bible program that reads <b>theWord</b> and <b>e-Sword</b> modules: Bibles, commentaries, dictionaries, lexicons, books, devotionals and cross-references. It works without the internet. No modules come with it: use the ones you already have, or download free ones from the theWord and e-Sword module sites.</p>
<ol><li>Click <b>Bibles</b> (top left) → <b>Import modules…</b> and choose module files (or a <code>.zip</code>/<code>.twzip</code> that contains them). Tanglaw checks each file and shows a report of what it added and, for anything it could not use, why.</li>
<li>Or choose <b>Read modules from a folder…</b> to use a folder you already have, such as your theWord or e-Sword folder. Tanglaw looks four folders deep, like theWord.</li>
<li>Tick the Bibles you want to read. Several ticked Bibles are shown side by side.</li></ol>
<p>If Tanglaw 0.4 (the earlier edition) is on the same computer, its module folders, open Bibles, place, skin, highlights, notes, verse lists and your own cross-references are taken over automatically the first time. Tanglaw 0.4 itself is not changed.</p>`],
  ['screen', 'The screen', `
<p><b>Top bar:</b> Bibles menu · book, chapter and verse lists · previous/next chapter · Copy verses · Skin menu · Study (show or hide the panels) · ? (this guide).</p>
<p><b>Middle:</b> the Bible text. Under each verse you may see cross-references and your notes. A small <b>c</b> beside a verse number means a commentary has something on that verse; click it to open the Commentary.</p>
<p><b>Panels:</b> Commentary, Library, Search and My Study. At first they share one panel on the right; you can spread them out (see <a data-go="panels">Arranging the panels</a>).</p>
<p><b>Bottom line:</b> how many modules were found, and how many could not be opened.</p>`],
  ['reading', 'Reading the Bible', `
<h4>Going to a passage</h4>
<ul><li>Choose book, chapter and verse in the lists at the top, or use the arrows for the previous and next chapter.</li>
<li>Keyboard: ${K('←')} ${K('→')} chapter, ${K('Ctrl+←')} ${K('Ctrl+→')} book, ${K('↑')} ${K('↓')} verse. Type a number to go to that verse; hold ${K('Shift')} while typing to go to that chapter.</li>
<li>${K('Alt+←')} / ${K('Alt+→')} or ${K('Backspace')} go back and forward through the places you visited.</li>
<li>Click any Bible reference in a commentary, dictionary, book, note or cross-reference to go there. Resting the mouse on a reference shows the verse.</li></ul>
<h4>Several Bibles</h4><p>Tick more than one Bible in the Bibles menu to read them side by side. The order is the order you ticked them in.</p>
<h4>What to show</h4><p>In the <b>Skin</b> menu under <b>Show</b>: Strong's numbers, morphology, footnotes, headings, words of Jesus in red, added words in italics, cross-references, your highlighting and your notes.</p>
<h4>The Apocrypha</h4><p>Books such as Tobit, Judith and the Maccabees appear where the 1611 King James Bible placed them (between the Testaments). e-Sword's Daniel 13–14 are shown as Susanna and Bel and the Dragon, and its Esther 11–16 as the Additions to Esther.</p>`],
  ['words', "Strong's numbers and dictionaries", `
<p>With a Bible that has Strong's numbers and a Strong's dictionary or lexicon among your modules, rest the mouse on a word (tap it on a phone) to see its entry. In the entry, <b>Find in Bible</b> lists every verse with that Strong's number.</p>
<p>Greek entries are looked up in your Greek dictionaries first, Hebrew in your Hebrew ones.</p>`],
  ['library', 'Commentaries and the Library', `
<p>The <b>Commentary</b> panel follows the verse you select. The buttons at the top are your commentaries; a dot means it has something for this verse (a ring: for the passage or chapter around it).</p>
<p>The <b>Library</b> shows any commentary, dictionary, book or devotional. Choose it in the list; its topics are on the left. Use the filter box to find a topic, the arrows (or ${K('↑')} ${K('↓')} in the topic list) for the previous or next topic, and ← to go back.</p>
<p>Bible references in these modules are links, including plain written ones such as “John 3:16”, “1 Cor. 13:4-7” or e-Sword's “Joh_3:16”. Links to other modules (e.g. a dictionary entry) open in the Library.</p>
<p>The ⓘ button shows the module's <a data-go="props">properties</a>.</p>`],
  ['panels', 'Arranging the panels', `
<ul><li><b>Move a panel:</b> drag its tab to the left, right or bottom of the window (drop zones appear while you drag), or onto another tab. Or right-click the tab → <b>Move to the left / right / bottom</b>.</li>
<li>Panels in different places are on screen together, e.g. the Library on the left, the Commentary on the right and Search at the bottom.</li>
<li><b>Resize:</b> drag the thin edge between a panel and the Bible text.</li>
<li><b>Study</b> (top bar) hides or shows all panels. <b>Skin → Put all panels back on the right</b> undoes your arrangement.</li>
<li>On a phone there is one panel at a time, full screen; the buttons at the bottom open it.</li></ul>`],
  ['study', 'Your study: highlights, notes, lists, cross-references, reading plans', `
<p>Right-click a verse (long-press on a phone) for the verse menu.</p>
<ul><li><b>Highlight:</b> select a few words first to highlight only them, or nothing to highlight the whole verse. Five colours, underline and bold; ✕ removes it.</li>
<li><b>Notes:</b> “Add a note…”. References you type (e.g. Rom 5:8) become links. Notes show under the verse and in My Study → Notes.</li>
<li><b>Verse lists:</b> “Add to …” or ${K('Ctrl+L')}. My Study → Verse lists: switch lists, make new ones, copy a whole list.</li>
<li><b>Cross-references:</b> “Add a cross-reference…”. Your own are shown in bold and can be removed with ×. References in [brackets] are verses that point to this one. Cross-reference sets from theWord (<code>.xrefs.twm</code>) in your module folders are shown too.</li>
<li><b>Reading plans:</b> My Study → Reading → New reading plan. Choose what to read (whole Bible, New Testament, Psalms and Proverbs and more, or your own books), and finish in a number of days, by a date, or a number of chapters each time. Tick readings as done; “Catch up” moves unread readings forward.</li></ul>
<p>Your study data is saved as you work, and a copy is kept for each of the last 7 days.</p>`],
  ['search', 'Searching', `
<p>Type in the Search panel and press Enter. A line under the box tells you how Tanglaw understood your search.</p>
<table><tr><td><code>faith hope</code></td><td>both words in the verse (or either, if you choose “any may be” under Options)</td></tr>
<tr><td><code>faith OR hope</code>, <code>faith AND NOT works</code></td><td>AND, OR, NOT and brackets</td></tr>
<tr><td><code>"born again"</code></td><td>a phrase</td></tr><tr><td><code>believ*</code></td><td>a word beginning with “believ”</td></tr>
<tr><td><code>G26</code>, <code>H157</code></td><td>a Strong's number</td></tr><tr><td><code>m/ V-AAI-3S</code></td><td>a morphology code (* and ? allowed)</td></tr>
<tr><td><code>faith NEAR hope</code></td><td>within a number of words (Options)</td></tr><tr><td><code>faith NEARv2 hope</code></td><td>within 2 verses</td></tr></table>
<ul><li><b>Where:</b> the whole Bible, a Testament, groups such as the Gospels, the current book or chapter, or <b>Custom range…</b> (e.g. <code>Gen-Deut; Matt 5-7; Rom 3:21-26</code>), which you can save by name.</li>
<li><b>Which Bibles:</b> the open ones, the first only, or all.</li>
<li><b>Verses / Books / Statistics:</b> Books shows how many verses each book has (click one to list only its verses). Statistics shows how a Strong's word is translated, and the word forms found.</li>
<li>▾ beside the box lists earlier searches. <b>+ List</b> adds the results to your verse list; <b>Copy</b> copies them.</li></ul>`],
  ['copy', 'Copying verses', `
<p>${K('Ctrl+C')} copies the selected verse (when no text is selected). ${K('F5')} or the copy button opens <b>Copy verses</b>:</p>
<ul><li>Click <b>From</b> or <b>To</b> to choose book → chapter → verse. With the mouse over a button, the wheel (or ${K('PgUp')} / ${K('PgDn')}) adds or removes a verse; with ${K('Shift')}, a chapter.</li>
<li>Choose the Bible and the format; the preview shows exactly what will be copied. Under Templates you can make your own format. The window can be resized, and it remembers your choices.</li></ul>`],
  ['options', 'Skins and Options', `
<p><b>Skin</b> menu: eight colour skins, what to show, text size. <b>Options…</b> (${K('Ctrl+,')}):</p>
<ul><li>coloured or plain captions;</li><li>the font of the Bible text, and separate fonts for Greek and for Hebrew (fonts “Included with Tanglaw” work everywhere; others must be installed on your computer);</li>
<li>text size, line spacing, text width (fill the window or narrower columns);</li><li>background: the skin's colour or your own, with or without a paper texture;</li>
<li>verse numbers: in a column at the left, in the text, or hidden; plain, bold or in a circle.</li></ul>`],
  ['modules', 'Modules Tanglaw reads', `
<table><tr><td>theWord</td><td>Bibles <code>.ont .ot .nt</code>; commentaries, dictionaries, books, devotionals <code>.twm</code> (also compressed ones); cross-references <code>.xrefs.twm</code></td></tr>
<tr><td>e-Sword</td><td>Bibles <code>.bblx .bbli</code>; commentaries <code>.cmtx .cmti</code>; dictionaries and lexicons <code>.dctx .dcti .lexx .lexi</code>; topic notes <code>.topx .topi</code>; reference books <code>.refx .refi</code>; devotionals <code>.devx .devi</code></td></tr></table>
<p><b>Not read:</b> encrypted (paid or locked) modules such as theWord <code>.ontx</code> or locked <code>.twm</code> files and locked e-Sword modules. They are listed as “cannot be opened” and are never decoded. Also e-Sword harmonies and graphics, and e-Sword files older than version 9 (open them once in a current e-Sword to convert them). Some e-Sword 10 reference books (.refx) are stored in a form Tanglaw cannot read; the e-Sword 11 version (.refi) works.</p>`],
  ['props', 'Module properties and making files smaller', `
<p>The ⓘ button beside a Bible (in the Bibles menu) or in the Library opens <b>Properties</b>:</p>
<ul><li><b>About:</b> the module's description as a page. <b>Edit</b> lets you change it (bold, italic, underline, lists). It is saved in the form theWord or e-Sword expects.</li>
<li><b>Details</b> and <b>All settings:</b> title, abbreviation, author and the rest. Greyed-out settings belong to the program that made the module and are not changed.</li>
<li><b>File &amp; size:</b> <b>Make smaller</b> removes unused space from database modules (nothing in the module changes). For theWord books you can also compress the text. Tanglaw reads compressed modules; whether theWord reads one compressed by Tanglaw has not been checked, so try it in theWord first.</li></ul>
<p>Before the first change, Tanglaw keeps a copy of the original file next to it (<code>name.tanglaw-backup</code>). <b>Put the original file back</b> undoes all changes. Encrypted modules and read-only files cannot be changed.</p>`],
  ['keys', 'Keyboard shortcuts', `
<table><tr><td>${K('←')} ${K('→')}</td><td>previous / next chapter</td></tr><tr><td>${K('Ctrl+←')} ${K('Ctrl+→')}</td><td>previous / next book</td></tr>
<tr><td>${K('↑')} ${K('↓')}</td><td>previous / next verse</td></tr><tr><td>a number</td><td>go to that verse (${K('Shift')}: chapter)</td></tr>
<tr><td>${K('Alt+←')} ${K('Alt+→')}, ${K('Backspace')}</td><td>back / forward</td></tr><tr><td>${K('Ctrl+C')}</td><td>copy the selected verse</td></tr>
<tr><td>${K('F5')}</td><td>Copy verses</td></tr><tr><td>${K('Ctrl+L')}</td><td>add the verse to the current list</td></tr>
<tr><td>${K('Ctrl+,')}</td><td>Options</td></tr><tr><td>${K('F1')}</td><td>this guide</td></tr><tr><td>${K('Esc')}</td><td>close a popup, menu or window</td></tr></table>`],
  ['files', 'Where your things are kept', `
<p>Tanglaw's own folder: on Windows <code>%APPDATA%\\org.tanglaw.bible</code>, on Linux <code>~/.local/share/org.tanglaw.bible</code>. In it:</p>
<ul><li><code>modules</code> – modules you imported;</li><li><code>settings.json</code> – your settings;</li><li><code>my-study-data.json</code> – highlights, notes, verse lists, reading plans, search history; <code>backups</code> – a copy for each of the last 7 days;</li>
<li><code>My cross-references.xrefs.twm</code> – your own cross-references, in theWord's format.</li></ul>
<p>Modules read from your own folders stay where they are; Tanglaw changes one only when you save its properties or make it smaller.</p>`],
  ['about', 'About', `
<p>Tanglaw Bible is free software (GPL-3.0). Source: github.com/SalitaNgDiyos/Timotheos. It reads theWord and e-Sword modules through their open file formats; it contains no theWord or e-Sword program files or modules.</p>`],
];

export function openGuide(at?: string): void {
  let wrap = document.getElementById('guide');
  if (!wrap) {
    wrap = document.createElement('div'); wrap.id = 'guide'; wrap.className = 'dlg';
    wrap.innerHTML = `<div class="dlgbox guidebox" role="dialog" aria-label="User guide"><div class="ghead"><h3>Tanglaw Bible – User guide</h3><input id="gFind" class="txt" type="search" placeholder="Find in the guide…"><button id="gClose" class="ib" aria-label="Close">✕</button></div>
      <div class="gwrap"><nav id="gToc">${SECTIONS.map(([id, t]) => `<a data-go="${id}">${esc(t)}</a>`).join('')}</nav>
      <main id="gMain">${SECTIONS.map(([id, t, h]) => `<section id="g-${id}"><h2>${esc(t)}</h2>${h}</section>`).join('')}<p id="gNone" class="hint hidden">Nothing found.</p></main></div></div>`;
    document.body.appendChild(wrap);
    const main = $('#gMain'); const secs = [...main.querySelectorAll<HTMLElement>('section')]; const orig = new Map(secs.map(s => [s, s.innerHTML]));
    const close = () => { wrap!.classList.add('hidden'); document.removeEventListener('keydown', key, true); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    (wrap as HTMLElement & { _key?: typeof key })._key = key;
    $('#gClose').onclick = close;
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
    wrap.addEventListener('click', e => { const a = (e.target as HTMLElement).closest<HTMLElement>('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go!); } });
    const spy = () => { let cur = secs[0]; for (const s of secs) if (!s.classList.contains('hidden') && s.offsetTop - main.scrollTop < 80) cur = s; $('#gToc').querySelectorAll<HTMLElement>('a').forEach(a => a.classList.toggle('on', 'g-' + a.dataset.go === cur.id)); };
    main.addEventListener('scroll', spy);
    let t = 0;
    $<HTMLInputElement>('#gFind').oninput = () => { clearTimeout(t); t = window.setTimeout(find, 150); };
    function find(): void {
      const q = $<HTMLInputElement>('#gFind').value.trim().toLowerCase(); let any = false;
      for (const s of secs) {
        s.innerHTML = orig.get(s)!;
        if (!q) { s.classList.remove('hidden'); continue; }
        const hit = s.textContent!.toLowerCase().includes(q); s.classList.toggle('hidden', !hit);
        if (hit) { any = true; mark(s, q); }
      }
      $('#gNone').classList.toggle('hidden', !q || any);
      $('#gToc').querySelectorAll<HTMLElement>('a').forEach(a => a.classList.toggle('hidden', !!q && $('#g-' + a.dataset.go).classList.contains('hidden')));
      main.scrollTop = 0; spy();
    }
    function mark(root: HTMLElement, q: string): void {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes: Text[] = []; for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n as Text);
      for (const n of nodes) {
        const i = n.data.toLowerCase().indexOf(q); if (i < 0) continue;
        const m = document.createElement('mark'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); r.surroundContents(m);
      }
    }
    function go(id: string): void { const s = document.getElementById('g-' + id); if (!s) return; if (s.classList.contains('hidden')) { $<HTMLInputElement>('#gFind').value = ''; find(); } main.scrollTop = s.offsetTop - 4; spy(); }
    (wrap as HTMLElement & { _go?: typeof go })._go = go;
    spy();
  }
  wrap.classList.remove('hidden');
  const w = wrap as HTMLElement & { _key?: (e: KeyboardEvent) => void; _go?: (id: string) => void };
  document.addEventListener('keydown', w._key!, true);
  if (at) w._go!(at);
  setTimeout(() => $<HTMLInputElement>('#gFind').focus(), 50);
}
