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
<p><b>Top bar:</b> Bibles menu · book, chapter and verse lists · previous/next chapter · Copy verses · Skin · ? (this guide) · Options · Layouts.</p>
<p><b>Middle:</b> the Bible text. Under each verse you may see cross-references and your notes. A small <b>c</b> beside a verse number means a commentary has something on that verse; click it to open the Commentary.</p>
<p><b>Panes:</b> Commentary, Library, Search and My Study at first, on the right. More can be added – Dictionary, more Bible views and book views, each in a pane of its own – and every pane can go to the left, the right or the bottom (see <a data-go="panels">Panes and layouts</a>).</p>
<p><b>Bottom line:</b> how many modules were found.</p>`],
  ['reading', 'Reading the Bible', `
<h4>Going to a passage</h4>
<ul><li>Choose book, chapter and verse in the lists at the top, or click the ☰ icon on the Bible caption for the list of books and chapters, or use the arrows for the previous and next chapter.</li>
<li>Keyboard: ${K('←')} ${K('→')} chapter, ${K('Ctrl+←')} ${K('Ctrl+→')} book, ${K('↑')} ${K('↓')} verse. Type a number to go to that verse; hold ${K('Shift')} while typing to go to that chapter.</li>
<li>${K('Alt+←')} / ${K('Alt+→')} or ${K('Backspace')} go back and forward through the places you visited.</li>
<li>Click any Bible reference in a commentary, dictionary, book, note or cross-reference to go there. Resting the mouse on a reference shows the verse.</li></ul>
<h4>Several Bibles</h4><p>Tick more than one Bible in the Bibles menu to read them side by side. The order is the order you ticked them in; the ↑ ↓ buttons beside a ticked Bible move it left or right.</p>
<ul><li><b>Hide</b> a Bible you never read with ⊘ beside it: it leaves the list (and the lists of Bible views). “Show the hidden Bibles” at the bottom brings them back for a moment; ◌ shows one for good.</li>
<li><b>Bible sets:</b> tick the Bibles you read together, then <b>Save the ticked Bibles as a set…</b>. Later one click on the set's name opens those Bibles in that order.</li>
<li><b>Aa</b> beside a Bible gives that Bible its own font and size (e.g. a larger size for a Greek or Hebrew Bible).</li></ul>
<h4>Paragraphs</h4><p><b>Options → Paragraph mode</b> (or ${K('P')}) lets the verses run on as ordinary paragraphs, broken where the Bible marks a new paragraph. A Bible without paragraph marks takes them from another open Bible that has them. Click a small verse number to select that verse.</p>
<h4>Column text (interlinear)</h4><p><b>Options → Column text</b> (or ${K('Alt+I')}) stands each tagged word over its original Greek or Hebrew word, the transliteration, the Strong's number, the morphology code and the lemma, like an interlinear. Choose which of these lines to show under <b>Column text lines</b> in the same menu. The original word is the lemma the Bible gives, or else it is taken from your Strong's dictionary (it appears a moment after the text). Point at a number or code for its entry.</p>
<h4>A Bible's own switches</h4><p>Some Bibles define switches of their own, for example V for variant readings or I for an interlinear line. They appear in the <b>Options</b> menu under <b>This Bible's own switches</b>; a one-letter switch is also a key (press V to show or hide the variants).</p>
<h4>Footnotes</h4><p>Footnote marks are counted through the chapter, each Bible on its own. Rest the mouse on a mark to read the note. In <b>Options…</b> choose numbers, letters or a star for the marks, and whether every footnote is also listed under the chapter (click one there to select its verse). A Bible's own marks, where it gives them, are kept.</p>
<h4>What to show</h4><p>In the <b>Options</b> menu under <b>Show</b>: Strong's numbers, morphology, footnotes, headings, words of Jesus in red, added words in italics, cross-references, your highlighting, your notes, and <b>lemmas</b> (the dictionary form of the Greek or Hebrew word, shown small after each word, in Bibles that give it).</p>
<h4>The Apocrypha and the order of the books</h4><p>Books such as Tobit, Judith and the Maccabees appear where the 1611 King James Bible placed them (between the Testaments). In <b>Options → Order of the books</b> you can choose instead the <b>Septuagint order of NETS</b> (A New English Translation of the Septuagint) or the order of the <b>Greek Orthodox</b> Old Testament: then these books stand among the other Old Testament books (e.g. Judith and Tobit after Esther, Baruch after Jeremiah), not as a separate section. In the Greek Orthodox order, 4 Maccabees, the Prayer of Manasseh, the Psalms of Solomon and 2 Esdras (4 Ezra) follow as an appendix. Search ranges and reading plans keep their usual meaning whichever order you choose.</p>
<p>e-Sword's Daniel 13–14 are shown as Susanna and Bel and the Dragon, and its Esther 11–16 as the Additions to Esther.</p>`],
  ['words', "Strong's numbers and dictionaries", `
<p>With a Bible that has Strong's numbers and a Strong's dictionary or lexicon among your modules, rest the mouse on a word (tap it on a phone) to see its entry. The popup goes away when you move the mouse off the word (moving into the popup keeps it); clicking a word keeps its popup until you click elsewhere. Drag the popup's corner to make it wider or taller; the next popups use that size. In the entry, <b>Find in Bible</b> lists every verse with that Strong's number.</p>
<p>If the Bible is tagged with morphology codes (e.g. V-AAI-3S) and you have a morphology dictionary (Robinson, Packard or similar), the popup shows the meaning of the code first, above the dictionary entry.</p>
<p>Some dictionaries draw Hebrew or Greek with a special font of their own (for example the Ancient Hebrew Lexicon of the Bible). Tanglaw uses that font when it is installed on your computer; without it you see the Latin letters the font is built on.</p>
<p>Greek entries are looked up in your Greek dictionaries first, Hebrew in your Hebrew ones. With several Strong's dictionaries, choose which one comes first for Greek, for Hebrew and for morphology in the <b>Options</b> menu under <b>Word popups</b>.</p>
<p>At the top of the popup is the <b>original word</b> with its <b>transliteration</b> (how it sounds in Latin letters, in a simple SBL-like style). The word is the lemma the Bible gives, or else the first Greek or Hebrew word of the dictionary entry; the transliteration is worked out by Tanglaw, so treat it as a guide. Under <b>Word popups</b> you can switch this off, and choose whether the morphology or the Strong's entry comes first.</p>
<p><b>Word lookup dictionaries</b> (theWord's “word lookup”): rest the mouse on <i>any</i> word of the Bible text – not only words with Strong's numbers – to see it in the dictionaries you choose (e.g. a Bible dictionary or Webster). Choose them under <b>Tools → Word lookup dictionaries…</b>; switch the lookup on and off with ${K('D')}. Tanglaw also tries the word without endings such as -s, -eth, -ed or -ing; with the option ticked, a word's lemma is looked up first.</p>
<p>The bar at the top of a popup: 📌 keeps it open until you close it (it then stays while you click elsewhere, and new words you point at are shown in it), copy, show it in the Dictionary panel, × close. A verse popup (a cross-reference) shows the verse in every open Bible, or only the first if you untick <b>Verse popups: all open Bibles</b>; its → button goes to the verse.</p>`],
  ['library', 'Commentaries and the Library', `
<p>The <b>Commentary</b> panel follows the verse you select. The buttons at the top are your commentaries; a dot means it has something for this verse (a ring: for the passage or chapter around it).</p>
<p>The <b>Library</b> shows any commentary, dictionary, book or devotional. Choose it in the list; its topics are on the left. Use the filter box to find a topic, the arrows (or ${K('↑')} ${K('↓')} in the topic list) for the previous or next topic, and ← to go back.</p>
<p>Bible references in these modules are links, including plain written ones such as “John 3:16”, “1 Cor. 13:4-7” or e-Sword's “Joh_3:16”. Links to other modules (e.g. a dictionary entry) open in the Library.</p>
<p>The ⓘ button shows the module's <a data-go="props">properties</a>. The printer button prints the topic; the export button saves this topic, or all topics of the module, as a Word document (.docx), Rich Text (.rtf), web page (.html) or plain text (.txt). Book views have the same two buttons.</p>
<p><b>Your marks:</b> select words in a commentary, dictionary or book topic and a small bar appears: highlight in a colour, bold, underline, ⌫ to remove your marks from the selection, ✕ all to remove all your marks from the topic. The module itself is not changed; your marks are kept with your study data and come back whenever you open the topic.</p>
<p><b>Pictures</b> in a module (maps, charts) are shown in the entry; click one to open the <b>graphics viewer</b>: the wheel or + / − zooms, drag to move, ‹ › (or ${K('←')} ${K('→')}) for the other pictures of the entry, ${K('Esc')} closes. Tanglaw shows PNG and JPEG pictures; older Windows-metafile pictures are left out.</p>
<p>A <b>module set</b> chooses which modules a book view offers: the first list in its bar (it appears once you have made a set).</p>`],
  ['panels', 'Panes and layouts', `
<p>The Bible text stays in the middle. Panels sit in <b>panes</b> at the left, the right or the bottom; each side can hold several panes, one above the other (side by side at the bottom), and a pane can hold several panels as tabs.</p>
<ul><li><b>Move a panel:</b> drag its tab (or the pane's title bar). Arrows appear at the left, right and bottom edges of the window – drop on one for a new pane on that side. Over another pane a small compass appears: the middle adds it as a tab there, the arrows put it above or below (left or right at the bottom). Dropping anywhere else makes it a floating window.</li>
<li><b>Pane buttons</b> (top right of each pane): A− / A+ smaller or larger text (or ${K('Ctrl')} + mouse wheel over the pane), float as a window / dock again, maximize / restore, close. Double-click a title bar to float or dock it.</li>
<li><b>Resize:</b> drag the edge between a side and the Bible text, or between two panes. In the Library and book views, drag the edge beside the topic list to make the list wider or narrower.</li>
<li><b>Layouts</b> menu: tick or untick panels to open or close them; <b>Dictionary</b> shows the entry of the word under the mouse. <b>+ New Bible view</b> and <b>+ New book view</b> each open in a pane of their own; add as many as you like. A Bible view follows the main text; untick “follow” to read elsewhere in it. A book view can follow too: tick its “follow” and a commentary shows the verse you read, a dictionary the word you point at (by Strong's number, lemma or the word itself).</li>
<li><b>Compare:</b> <b>Layouts → + Compare view</b> (or ${K('Ctrl+M')}) shows the current verse in all your Bibles, the open ones or a Bible set, one under the other. Words not found in the first Bible's verse are marked, so differences stand out; untick “differences” to read them plainly, tick “±2 verses” for the verses around it. It follows the verse you select.</li>
<li><b>Books and chapters:</b> the ☰ icon on the caption of the Bible text (and of every Bible view) opens the list of books; choose a book, a chapter and a verse. ‹ › in a Bible view go to the previous or next chapter.</li>
<li>Ready-made layouts: Standard, Study, Word study, Compact and Reading (the Bible only). <b>Save this layout…</b> keeps your arrangement under a name. <b>Hide all panels</b> gives the whole window to the Bible.</li>
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
<li><b>Verses / References / Books / Statistics:</b> References lists only the verse numbers, by book with the number found; rest the mouse on one to read it, click it to go there. Tanglaw remembers whether you last used Verses or References. Books shows how many verses each book has (click one to list only its verses). Statistics shows how a Strong's word is translated, and the word forms found.</li>
<li><b>Books:</b> the Bibles / Books switch at the top of the panel searches your commentaries, dictionaries, books and devotionals instead. Choose which modules: all, one kind, one module, or a <b>module set</b> of your own (the ⋯ button, or <b>Tools → Module sets…</b>). Words must all be in the topic (or any, under Options); "a phrase", love* and -word (leave out) work too. The first search of a module reads it once (large modules take a moment; ${K('Esc')} stops). Results are listed by module with the words in context; rest the mouse on a title to read the whole topic, click it to open it in the Library. <b>Export…</b> saves the topics found as a document.</li>
<li><b>Several search panels:</b> <b>Layouts → + New search view</b> opens another search panel with its own search, options and results, so you can keep one search while making another.</li>
<li>▾ beside the box lists earlier searches. <b>+ List</b> adds the results to your verse list; <b>Copy</b> copies them.</li></ul>`],
  ['copy', 'Copying verses', `
<p>${K('Ctrl+C')} copies the selected verse (when no text is selected). ${K('F5')} or the copy button opens <b>Copy verses</b>:</p>
<ul><li>Click <b>From</b> or <b>To</b> to choose book → chapter → verse. With the mouse over a button, the wheel (or ${K('PgUp')} / ${K('PgDn')}) adds or removes a verse; with ${K('Shift')}, a chapter.</li>
<li>Choose the Bible and the format; the preview shows exactly what will be copied. Under Templates you can make your own format. The window can be resized, and it remembers your choices.</li></ul>`],
  ['options', 'Skins and Options', `
<p><b>Skin</b> menu: the eight colour skins. <b>Options</b> menu: what to show (Strong's numbers, morphology, footnotes, headings, red letters, italics, cross-references, your highlighting and notes), text size, the order of the books, and <b>Options…</b> (${K('Ctrl+,')}), the window with everything else:</p>
<ul><li>coloured or plain captions;</li><li>the font of the Bible text, and separate fonts for Greek and for Hebrew (fonts “Included with Tanglaw” work everywhere; others must be installed on your computer);</li>
<li>text size, line spacing, text width (fill the window or narrower columns);</li><li>background: the skin's colour or your own, with or without a paper texture;</li>
<li>verse numbers: in a column at the left, in the text, or hidden; plain, bold or in a circle;</li><li>words of Jesus in the skin's red or a colour of your own; added words in italics, [brackets] or grey; headings bold, in small capitals or small and quiet;</li><li>footnote marks: numbers, letters or a star, and whether the footnotes are also listed under the chapter;</li><li>the order of the books: 1611 King James, Septuagint (NETS) or Greek Orthodox.</li></ul>`],
  ['mine', 'Your own modules', `
<p>Write your own commentary, dictionary or book: <b>Tools → New module of your own…</b>. Choose the kind (a <b>commentary</b> for notes on verses, chapters and books; a <b>dictionary</b> for words and subjects; a <b>book</b> for topics within topics), a title and an abbreviation. Tanglaw makes a theWord module (.twm) in its modules folder, so theWord can open it too; its name in the Library has a ✎.</p>
<ul><li>In the Library a bar above the topic offers <b>✎ Edit</b>, <b>+ Topic</b> (or <b>+ Comment</b> in a commentary), <b>Rename</b> (<b>Verses…</b> in a commentary) and <b>Delete</b>.</li>
<li>A new comment asks for its place: a verse (<code>John 3:16</code>), verses (<code>John 3:16-18</code>), a chapter (<code>John 3</code>) or a book (<code>John</code>, an introduction). It then shows in the Commentary panel like any commentary.</li>
<li>A new topic in a book can go after the current topic or inside it (a sub-topic).</li>
<li>While writing: bold, italic, underline, superscript, heading, list, plain text, and <b>🔗 Verse</b> (${K('Ctrl+K')}) to link the selected words to a Bible verse. References you type, such as “Rom 5:8”, become links by themselves. ${K('Ctrl+S')} or <b>Save</b> saves; <b>Cancel</b> or ${K('Esc')} leaves without saving.</li>
<li><b>⚓ Section</b> (theWord's topic links): select the words that begin a part of a long topic, such as its heading, and press ⚓ Section. That part gets its own line in the topic list, under the topic; clicking it opens the topic at that place.</li></ul>
<p>Only modules marked as user modules can be changed this way; other modules stay as they are (their properties can be changed under <a data-go="props">Module properties</a>). Pictures cannot be added yet.</p>`],
  ['tools', 'Tools: clipboard monitor, printing', `
<p>The <b>Tools</b> menu in the title bar:</p>
<ul><li><b>New module of your own…</b> (see <a data-go="mine">Your own modules</a>).</li>
<li><b>Tagalog translation…</b>: Tanglaw's menus and windows can be in Tagalog – choose <b>Language / Wika</b> at the top of the <b>Options</b> menu. The Tagalog is Tanglaw's own and may need correcting: this window lists every phrase with its Tagalog, so you can change any of them or fill in those still in English. The Bible text, the modules and this guide are not translated.</li>
<li><b>Clipboard monitor:</b> while it is ticked, Tanglaw watches what you copy in any program (an e-mail, a web page, a document). When the copied text contains Bible references, a small window lists them with their text. Click a reference to go there; <b>+ List</b> adds them all to your verse list; choose the Bible in the window. Normally Tanglaw's button in the taskbar flashes; tick “to front” to have Tanglaw come to the front instead. References Tanglaw copies itself are ignored.</li>
<li><b>Word lookup dictionaries…</b> and <b>Module sets…</b> (see <a data-go="words">Strong's numbers and dictionaries</a> and <a data-go="search">Searching</a>).</li>
<li><b>Print the chapter</b> (${K('Ctrl+P')}): the chapter as you see it (all open Bibles, without your notes and cross-reference lists). <b>Print the Library topic</b> prints the topic open in the Library.</li>
<li><b>Export…</b> saves topics of the module open in the Library as a document.</li></ul>`],
  ['modules', 'Modules Tanglaw reads', `
<table><tr><td>theWord</td><td>Bibles <code>.ont .ot .nt</code>; commentaries, dictionaries, books, devotionals <code>.twm</code> (also compressed ones); cross-references <code>.xrefs.twm</code></td></tr>
<tr><td>e-Sword</td><td>Bibles <code>.bblx .bbli</code>; commentaries <code>.cmtx .cmti</code>; dictionaries and lexicons <code>.dctx .dcti .lexx .lexi</code>; topic notes <code>.topx .topi</code>; reference books <code>.refx .refi</code>; devotionals <code>.devx .devi</code></td></tr></table>
<p><b>Not read:</b> encrypted (paid or locked) modules such as theWord <code>.ontx</code> or locked <code>.twm</code> files and locked e-Sword modules. Tanglaw skips them quietly and never decodes them; when you import one, the import report says why it was not added. Also e-Sword harmonies and graphics, and e-Sword files older than version 9 (open them once in a current e-Sword to convert them). Some e-Sword 10 reference books (.refx) are stored in a form Tanglaw cannot read; the e-Sword 11 version (.refi) works.</p>`],
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
<tr><td>${K('S')} ${K('M')} ${K('L')}</td><td>Strong's numbers / morphology / lemmas on or off</td></tr><tr><td>${K('F')} ${K('H')} ${K('J')} ${K('X')} ${K('U')}</td><td>footnotes / headings / words of Jesus in red / cross-references / your highlighting on or off</td></tr><tr><td>${K('Ctrl+F')}</td><td>Search</td></tr><tr><td>${K('Ctrl+M')}</td><td>compare the verse in all Bibles</td></tr><tr><td>${K('Ctrl+/')}</td><td>the list of shortcuts (change them there)</td></tr><tr><td>${K('P')}</td><td>paragraph mode on / off</td></tr><tr><td>${K('Alt+I')}</td><td>column text on / off</td></tr><tr><td>${K('D')}</td><td>word lookup on / off</td></tr><tr><td>a Bible's switch letter</td><td>that switch on / off (e.g. ${K('V')})</td></tr><tr><td>${K('Ctrl+P')}</td><td>print the chapter</td></tr><tr><td>${K('Ctrl+,')}</td><td>Options</td></tr><tr><td>${K('F1')}</td><td>this guide</td></tr><tr><td>${K('Esc')}</td><td>close a popup, menu or window</td></tr></table>
<p><b>Your own keys:</b> ${K('Ctrl+/')} (or <b>Tools → Keyboard shortcuts…</b>) lists every shortcut; click one and press the key you want instead. A key taken from another action leaves that action without a key. <b>All back to normal</b> undoes your changes.</p>`],
  ['files', 'Where your things are kept', `
<p>Tanglaw's own folder: on Windows <code>%APPDATA%\\org.tanglaw.bible</code>, on Linux <code>~/.local/share/org.tanglaw.bible</code>. In it:</p>
<ul><li><code>modules</code> – modules you imported;</li><li><code>settings.json</code> – your settings;</li><li><code>my-study-data.json</code> – highlights, notes, verse lists, reading plans, search history; <code>backups</code> – a copy for each of the last 7 days;</li>
<li><code>My cross-references.xrefs.twm</code> – your own cross-references, in theWord's format.</li></ul>
<p>Modules read from your own folders stay where they are; Tanglaw changes one only when you save its properties or make it smaller.</p>`],
  ['about', 'About', `
<p><b>New versions:</b> once a day, when it starts, Tanglaw asks the project's releases page on GitHub whether a newer version is out (untick <b>Tools → Look for new versions when Tanglaw starts</b> to stop this; <b>Check for a new version…</b> asks now). It downloads and installs nothing by itself: it shows what is new and opens the download page in your browser. Your settings, notes and modules stay when you install a new version.</p>
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
