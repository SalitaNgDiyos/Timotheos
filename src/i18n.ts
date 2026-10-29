// Tagalog for Tanglaw's own words (menus, buttons, windows). Bible text and modules are never touched.
// The words on screen are translated as they appear (exact phrases); phrases without a translation stay in
// English and are collected, so they can be translated in Tools → Tagalog translation… (your corrections are kept).
// The user guide stays in English for now.

export const TL: Record<string, string> = {
  // title bar and menus
  'Tanglaw Bible': 'Tanglaw Bible', 'Bibles': 'Mga Biblia', 'Skin': 'Itsura', 'Options': 'Mga Opsyon', 'Layouts': 'Ayos', 'Tools': 'Kagamitan', 'User guide': 'Gabay', 'User guide (F1)': 'Gabay (F1)',
  'Skin and view': 'Itsura at kulay', 'Minimise': 'Paliitin', 'Maximise': 'Palakihin', 'Close': 'Isara',
  'Previous chapter (←)': 'Nakaraang kabanata (←)', 'Next chapter (→)': 'Susunod na kabanata (→)', 'Previous chapter': 'Nakaraang kabanata', 'Next chapter': 'Susunod na kabanata',
  'Copy verses (F5)': 'Kopyahin ang mga talata (F5)', 'Copy verses': 'Kopyahin ang mga talata', 'Copy verses…': 'Kopyahin ang mga talata…',
  'Options: what to show, text size, order of the books, the Options window': 'Mga Opsyon: ano ang ipapakita, laki ng titik, ayos ng mga aklat, ang window ng Mga Opsyon',
  'Layouts: which panels are open, add panels, saved layouts': 'Ayos: aling panel ang bukas, magdagdag ng panel, mga naka-save na ayos',
  'Tools: clipboard monitor, word lookup, module sets, print, export': 'Kagamitan: bantay sa clipboard, paghahanap ng salita, mga pangkat ng module, pag-print, pag-export',
  '(tick to read side by side)': '(lagyan ng tsek para basahin nang magkatabi)', 'Import modules…': 'Mag-angkat ng mga module…', 'Read modules from a folder…': 'Basahin ang mga module mula sa isang folder…',
  'Bible sets': 'Mga pangkat ng Biblia', 'Save the ticked Bibles as a set…': 'I-save bilang pangkat ang mga Bibliang may tsek…', 'Save a Bible set': 'I-save ang pangkat ng Biblia',
  'Move left': 'Ilipat pakaliwa', 'Move right': 'Ilipat pakanan', 'Hide from this list': 'Itago sa listahang ito', 'Show in this list again': 'Ipakita muli sa listahan', 'Delete this set': 'Burahin ang pangkat na ito',
  'Tick some Bibles first': 'Lagyan muna ng tsek ang ilang Biblia', 'None of the Bibles in this set are here': 'Wala rito ang alinman sa mga Biblia ng pangkat na ito',
  'Show': 'Ipakita', "Strong's numbers": 'Mga bilang ni Strong', 'Morphology': 'Morpolohiya', 'Footnotes': 'Mga talababa', 'Headings': 'Mga pamagat', 'Words of Jesus in red': 'Mga salita ni Jesus sa pula',
  'Added words in italics': 'Mga idinagdag na salita sa italiko', 'Cross-references': 'Mga kaugnay na talata', 'My highlighting': 'Aking mga marka', 'My notes under the verses': 'Aking mga tala sa ilalim ng talata',
  'Lemmas': 'Mga lema', 'Paragraph mode (P)': 'Talata-talata bilang parapo (P)', 'Column text – words over their originals (Alt+I)': 'Hanay ng salita – bawat salita sa ibabaw ng orihinal (Alt+I)',
  'Column text lines': 'Mga linya ng hanay', 'Original word': 'Orihinal na salita', 'Transliteration': 'Transliterasyon', "Strong's number": 'Bilang ni Strong', 'Lemma': 'Lema',
  "This Bible's own switches": 'Sariling mga switch ng Bibliang ito', 'Word lookup (D)': 'Paghahanap ng salita (D)', 'Word lookup dictionaries…': 'Mga diksiyonaryo sa paghahanap ng salita…', 'Word lookup dictionaries': 'Mga diksiyonaryo sa paghahanap ng salita',
  'Word popups': 'Popup ng salita', 'Original word and transliteration': 'Orihinal na salita at transliterasyon', 'Morphology first': 'Morpolohiya muna', "Strong's entry first": 'Lahok ni Strong muna',
  'Verse popups: all open Bibles': 'Popup ng talata: lahat ng bukas na Biblia', "Greek Strong's": 'Strong (Griyego)', "Hebrew Strong's": 'Strong (Hebreo)', 'Automatic': 'Awtomatiko',
  'Text size': 'Laki ng titik', 'Order of the books': 'Ayos ng mga aklat', '1611 King James (Apocrypha between)': '1611 King James (Apokripa sa pagitan)', 'Septuagint – NETS': 'Septuaginta – NETS', 'Apocrypha after the New Testament': 'Apokripa pagkatapos ng Bagong Tipan', 'The Apocrypha after the New Testament': 'Ang Apokripa pagkatapos ng Bagong Tipan', 'Greek Orthodox': 'Griyegong Ortodokso',
  'Options…': 'Mga Opsyon…', 'Panels': 'Mga panel', '+ New Bible view': '+ Bagong tanaw ng Biblia', '+ New book view': '+ Bagong tanaw ng aklat', '+ New search view': '+ Bagong paghahanap',
  'Hide all panels': 'Itago ang lahat ng panel', 'Show the panels': 'Ipakita ang mga panel', 'Save this layout…': 'I-save ang ayos na ito…', 'Save this layout': 'I-save ang ayos na ito', 'Delete this layout': 'Burahin ang ayos na ito',
  'Standard': 'Karaniwan', 'Study': 'Pag-aaral', 'Word study': 'Pag-aaral ng salita', 'Compact': 'Siksik', 'Reading': 'Pagbasa',
  'Clipboard monitor': 'Bantay sa clipboard', 'Module sets…': 'Mga pangkat ng module…', 'Module sets': 'Mga pangkat ng module', 'New module of your own…': 'Bagong sariling module…', 'New module of your own': 'Bagong sariling module',
  'Print the chapter': 'I-print ang kabanata', 'Print the Library topic': 'I-print ang paksa sa Aklatan', 'Tagalog translation…': 'Salin sa Tagalog…', 'Language': 'Wika',
  // panels
  'Commentary': 'Komentaryo', 'Library': 'Aklatan', 'Search': 'Paghahanap', 'My Study': 'Aking Pag-aaral', 'Dictionary': 'Diksiyonaryo', 'Bible': 'Biblia', 'Book': 'Aklat',
  'Drag to move this panel': 'Hilahin para ilipat ang panel', 'Smaller text (Ctrl + mouse wheel down)': 'Mas maliit na titik (Ctrl + gulong pababa)', 'Larger text (Ctrl + mouse wheel up)': 'Mas malaking titik (Ctrl + gulong pataas)',
  'Close (open it again from the Layouts menu)': 'Isara (buksan muli mula sa menu na Ayos)', 'Float as a window': 'Gawing hiwalay na window', 'Maximize': 'Palakihin', 'Restore': 'Ibalik',
  'Choose a module…': 'Pumili ng module…', 'Find a topic…': 'Maghanap ng paksa…', 'Previous topic': 'Nakaraang paksa', 'Next topic': 'Susunod na paksa', 'Back': 'Bumalik',
  'Properties of this module': 'Mga katangian ng module na ito', 'Print this topic': 'I-print ang paksang ito', 'Export this topic or the whole module (Word, RTF, web page, text)': 'I-export ang paksang ito o ang buong module (Word, RTF, web page, teksto)',
  'Export this topic or the whole module': 'I-export ang paksang ito o ang buong module', 'Choose a commentary, dictionary or book.': 'Pumili ng komentaryo, diksiyonaryo o aklat.',
  'Drag to make the topic list wider or narrower': 'Hilahin para lumapad o kumitid ang listahan ng paksa', 'follow': 'sumunod',
  'Follow the main Bible text (untick to read elsewhere in this Bible)': 'Sundan ang pangunahing teksto (alisin ang tsek para magbasa sa ibang bahagi)',
  'A commentary follows the verse you read; a dictionary follows the word you point at': 'Sinusundan ng komentaryo ang talatang binabasa mo; ng diksiyonaryo ang salitang itinuturo mo',
  'Books and chapters: choose where to read': 'Mga aklat at kabanata: pumili kung saan babasa', 'Module set: which modules to choose from': 'Pangkat ng module: saan pipili ng module', 'All': 'Lahat',
  // search
  'Find': 'Hanapin', 'Earlier searches': 'Mga naunang paghahanap', 'Where to search': 'Saan maghahanap', 'Which Bibles': 'Aling mga Biblia', 'Open Bibles': 'Mga bukas na Biblia', 'First Bible only': 'Unang Biblia lamang', 'All Bibles': 'Lahat ng Biblia',
  'Custom range…': 'Sariling saklaw…', 'Remove a saved range…': 'Alisin ang naka-save na saklaw…', 'Current book': 'Kasalukuyang aklat', 'Current chapter': 'Kasalukuyang kabanata',
  'Words without AND/OR': 'Mga salitang walang AND/OR', 'all must be in the verse': 'dapat lahat ay nasa talata', 'any may be': 'kahit alin', 'whole words': 'buong salita', 'match case': 'tugma ang malaki/maliit na titik',
  'match accents': 'tugma ang mga tuldik', 'regular expression': 'regular expression', 'NEAR = within': 'NEAR = sa loob ng', 'words /': 'salita /', 'verses': 'talata',
  'Verses': 'Mga talata', 'References': 'Mga sanggunian', 'Books': 'Mga aklat', 'Statistics': 'Estadistika', 'Topics': 'Mga paksa', 'Modules': 'Mga module', '+ List': '+ Listahan', 'Copy': 'Kopyahin', 'Export…': 'I-export…',
  'Search the commentaries, dictionaries and books': 'Hanapin sa mga komentaryo, diksiyonaryo at aklat', 'Only the references, by book: point at one to read the verse': 'Mga sanggunian lamang, ayon sa aklat: ituro para mabasa ang talata',
  'Add the verses shown to the current verse list': 'Idagdag ang mga talatang ipinakita sa kasalukuyang listahan', 'Copy what is shown': 'Kopyahin ang ipinapakita', 'Save the topics found as a document': 'I-save bilang dokumento ang mga paksang natagpuan',
  'Click a book to list only its verses.': 'Pindutin ang isang aklat para ilista lamang ang mga talata nito.', 'Click a module to list only its topics.': 'Pindutin ang isang module para ilista lamang ang mga paksa nito.',
  'How the tagged words are translated': 'Paano isinalin ang mga salitang may tag', 'Word forms found': 'Mga anyo ng salitang natagpuan', 'No statistics for this search.': 'Walang estadistika para sa paghahanap na ito.',
  'All book modules': 'Lahat ng module ng aklat', 'Commentaries': 'Mga komentaryo', 'Dictionaries': 'Mga diksiyonaryo', 'Devotionals': 'Mga debosyonal', 'Maps and graphics': 'Mga mapa at larawan', 'My module sets': 'Aking mga pangkat ng module', 'One module': 'Isang module',
  'Module sets: make your own groups of modules': 'Mga pangkat ng module: gumawa ng sariling pangkat', 'Which modules (module sets)': 'Aling mga module (pangkat)', 'Searching…': 'Naghahanap…',
  // popups
  'Keep this popup open (it stays until you close it)': 'Panatilihing bukas ang popup (mananatili hanggang isara mo)', 'Copy the text': 'Kopyahin ang teksto', 'Show in the Dictionary panel': 'Ipakita sa panel ng Diksiyonaryo', 'Go to this verse': 'Pumunta sa talatang ito',
  'Find in Bible': 'Hanapin sa Biblia', 'Footnote': 'Talababa', 'Copied': 'Nakopya',
  // windows
  'Cancel': 'Kanselahin', 'Save': 'I-save', 'Done': 'Tapos', 'OK': 'OK', 'Delete': 'Burahin', 'Remove': 'Alisin', 'Add': 'Idagdag', 'Rename': 'Palitan ang pangalan', 'Name': 'Pangalan', 'Title': 'Pamagat', 'Kind': 'Uri', 'Where': 'Saan',
  'Font': 'Font', 'Size': 'Laki', 'Line spacing': 'Puwang ng linya', 'Text width': 'Lapad ng teksto', 'Background': 'Likuran', 'Fill the window': 'Punuin ang window', 'Narrow': 'Makitid', 'Medium': 'Katamtaman', 'Wide': 'Malapad',
  'Skin colour': 'Kulay ng itsura', 'My colour': 'Sariling kulay', 'No texture': 'Walang tekstura', 'Paper': 'Papel', 'Coloured captions': 'May kulay na pamagat ng panel', 'Bible text': 'Teksto ng Biblia', 'Greek': 'Griyego', 'Hebrew': 'Hebreo',
  'Verse numbers': 'Bilang ng talata', 'In a column at the left': 'Sa hanay sa kaliwa', 'In the text': 'Sa loob ng teksto', 'Hidden': 'Nakatago', 'Style': 'Estilo', 'Normal': 'Karaniwan', 'Bold': 'Makapal', 'In a circle': 'Nasa bilog',
  'Marks': 'Mga marka', 'Text': 'Teksto', 'Numbers 1 2 3': 'Mga bilang 1 2 3', 'Letters a b c': 'Mga titik a b c', 'A star *': 'Isang bituin *', 'Shown when the mark is pointed at': 'Ipinapakita kapag itinuro ang marka', 'Also listed under the chapter': 'Nakalista rin sa ilalim ng kabanata',
  'Old Testament': 'Lumang Tipan', 'Export topics': 'I-export ang mga paksa', 'Format': 'Anyo', 'Word document (.docx)': 'Dokumentong Word (.docx)', 'Rich Text (.rtf)': 'Rich Text (.rtf)', 'Web page (.html)': 'Web page (.html)', 'Plain text (.txt)': 'Payak na teksto (.txt)',
  'Topic titles as headings': 'Mga pamagat ng paksa bilang heading', 'Name of the module before its topics': 'Pangalan ng module bago ang mga paksa nito', 'This topic': 'Ang paksang ito',
  'Show every dictionary that has the word, not only the first': 'Ipakita ang lahat ng diksiyonaryong may salita, hindi lamang ang una', 'If the word has a lemma, look up the lemma': 'Kung may lema ang salita, hanapin ang lema', 'Word lookup on (key D)': 'Bukas ang paghahanap ng salita (key D)',
  'New set…': 'Bagong pangkat…', 'Name of the set': 'Pangalan ng pangkat', 'Save set': 'I-save ang pangkat', 'Properties': 'Mga katangian', 'Description': 'Paglalarawan', 'About': 'Tungkol dito', 'Abbreviation': 'Daglat', 'Version': 'Bersiyon',
  'Custom search range': 'Sariling saklaw ng paghahanap', 'Use range': 'Gamitin ang saklaw', 'Save as (optional)': 'I-save bilang (hindi kailangan)', 'Passages, separated by ; or new lines': 'Mga talata, hinihiwalay ng ; o bagong linya', 'Range': 'Saklaw',
  // your modules
  'Your module': 'Iyong module', '✎ Edit': '✎ Isulat', '+ Topic': '+ Paksa', '+ Comment': '+ Komento', 'Verses…': 'Mga talata…', 'Write in this topic': 'Sumulat sa paksang ito', 'Make it': 'Gawin', 'Language ': 'Wika',
  'New topic': 'Bagong paksa', 'New comment': 'Bagong komento', 'Rename topic': 'Palitan ang pangalan ng paksa', 'Delete topic': 'Burahin ang paksa', 'After the current topic': 'Pagkatapos ng kasalukuyang paksa', 'Inside the current topic (a sub-topic)': 'Sa loob ng kasalukuyang paksa (sub-paksa)', 'At the end': 'Sa dulo',
  'Bold (Ctrl+B)': 'Makapal (Ctrl+B)', 'Italic (Ctrl+I)': 'Italiko (Ctrl+I)', 'Underline (Ctrl+U)': 'Salungguhit (Ctrl+U)', 'Superscript': 'Superscript', 'Heading': 'Pamagat', 'List': 'Listahan', 'Plain text': 'Payak na teksto',
  'Link to a Bible verse (Ctrl+K)': 'Kawing sa talata ng Biblia (Ctrl+K)', 'Save (Ctrl+S)': 'I-save (Ctrl+S)', 'Saved': 'Na-save', 'Link to a Bible verse': 'Kawing sa talata ng Biblia', 'Verse, verses, chapter or book': 'Talata, mga talata, kabanata o aklat',
  // study, copy, plans
  'Verse lists': 'Mga listahan ng talata', 'Notes': 'Mga tala', 'Your reading plans': 'Iyong mga plano sa pagbasa', 'New reading plan…': 'Bagong plano sa pagbasa…', 'New list…': 'Bagong listahan…', 'Copy verse': 'Kopyahin ang talata',
  'Add a cross-reference…': 'Magdagdag ng kaugnay na talata…', 'Remove highlighting': 'Alisin ang marka', 'Clear': 'Burahin', 'Start': 'Simulan', 'Restart': 'Simulan muli', 'Catch up': 'Humabol', 'Read': 'Nabasa',
  'Preview': 'Silip', 'Templates': 'Mga template', 'Copy and close': 'Kopyahin at isara', 'Short book names': 'Maikling pangalan ng aklat', 'Plain text only': 'Payak na teksto lamang', 'Step 1: the verses': 'Hakbang 1: ang mga talata', 'Step 2: Bible and format': 'Hakbang 2: Biblia at anyo',
  // graphics viewer, clipboard monitor, marks
  'Previous image': 'Nakaraang larawan', 'Next image': 'Susunod na larawan', 'Smaller (wheel)': 'Mas maliit (gulong)', 'Larger (wheel)': 'Mas malaki (gulong)', 'Zoom': 'Laki', 'Fit': 'Kasya', 'Close (Esc)': 'Isara (Esc)',
  'Add all to the current verse list': 'Idagdag lahat sa kasalukuyang listahan', 'to front': 'sa harap', 'Close (the monitor stays on)': 'Isara (patuloy ang pagbabantay)', 'Bring Tanglaw to the front when references are copied': 'Dalhin sa harap ang Tanglaw kapag may kinopyang sanggunian',
  'Remove my marks from the selected text': 'Alisin ang aking marka sa piniling teksto', 'Remove all my marks from this topic': 'Alisin lahat ng aking marka sa paksang ito', 'Underline': 'Salungguhit',
  // messages
  'No Bibles yet': 'Wala pang Biblia', 'Open a topic first': 'Magbukas muna ng paksa', 'Give the module a title': 'Bigyan ng pamagat ang module', 'Give the topic a title': 'Bigyan ng pamagat ang paksa', 'Give the set a name': 'Bigyan ng pangalan ang pangkat',
  'Tick some modules for the set': 'Lagyan ng tsek ang ilang module para sa pangkat', 'Paragraph mode': 'Parapo', 'Verse by verse': 'Talata-talata', 'Word lookup on': 'Bukas ang paghahanap ng salita', 'Word lookup off': 'Sarado ang paghahanap ng salita',
  // Bible views, book views, reading aloud (0.7)
  "Reading focus (only the Bible views)": "Pokus sa pagbasa (mga tanaw ng Biblia lamang)", "Reading focus – F11 shows the panels again": "Pokus sa pagbasa – ipinapakita muli ng F11 ang mga panel", "Panels shown": "Ipinakita ang mga panel", "Drop theWord or e-Sword modules to import them": "Ihulog dito ang mga module ng theWord o e-Sword para i-angkat",
  "Remove this module from Tanglaw": "Alisin ang module na ito sa Tanglaw", "The file goes to the Recycle Bin, so it can still be brought back.": "Mapupunta ang file sa Recycle Bin, kaya maibabalik pa ito.", "Remove this module": "Alisin ang module na ito",
  "Bible search": "Paghahanap sa Biblia", "Book search": "Paghahanap sa aklat", "+ New Bible search": "+ Bagong paghahanap sa Biblia",
  "+ New book search": "+ Bagong paghahanap sa aklat", "Books and chapters": "Mga aklat at kabanata", "Move together with the other Bible views (untick to read on by itself)": "Sumabay sa ibang tanaw ng Biblia (alisin ang tsek para magbasa nang mag-isa)",
  "Font and size of this view": "Font at laki ng tanaw na ito", "Read aloud": "Basahin nang malakas", "All options of this view": "Lahat ng opsyon ng tanaw na ito",
  "Bible of this view": "Biblia ng tanaw na ito", "Verse": "Talata", "Font of this view": "Font ng tanaw na ito",
  "Lines": "Pagitan ng linya", "As in Options": "Gaya sa Mga Opsyon", "As in Options (reset)": "Gaya sa Mga Opsyon (ibalik)",
  "This Bible view": "Ang tanaw ng Bibliang ito", "Footnote marks": "Mga marka ng talababa", "List the footnotes under the chapter": "Ilista ang mga talababa sa ilalim ng kabanata",
  "Added words marked": "May marka ang mga idinagdag na salita", "Paragraphs": "Mga talata-talataan", "Column text": "Teksto sa hanay",
  "Use these for new Bible views": "Gamitin ito sa mga bagong tanaw ng Biblia", "New Bible views start with these settings": "Ganito magsisimula ang mga bagong tanaw ng Biblia", "Use these in all Bible views": "Gamitin ito sa lahat ng tanaw ng Biblia",
  "Back to the general settings": "Bumalik sa pangkalahatang setting", "New Bible views will start like this one": "Magsisimula ang mga bagong tanaw ng Biblia na gaya nito", "All Bible views now look like this one": "Kamukha na nito ang lahat ng tanaw ng Biblia",
  "Strong's numbers (S)": "Mga bilang ni Strong (S)", "Morphology codes (M)": "Mga code ng morpolohiya (M)", "Lemmas (L)": "Mga lema (L)",
  "Paragraphs (P)": "Mga talata-talataan (P)", "Column text: words over their originals (Alt+I)": "Teksto sa hanay: mga salita sa ibabaw ng orihinal (Alt+I)", "Footnotes (F)": "Mga talababa (F)",
  "Cross-references (X)": "Mga kaugnay na talata (X)", "Headings (H)": "Mga pamagat (H)", "Words of Jesus in red (J)": "Mga salita ni Jesus sa pula (J)",
  "This view moves with the others": "Sumasabay ang tanaw na ito sa iba", "This view reads on by itself": "Nagbabasa nang mag-isa ang tanaw na ito", "Choose a Bible": "Pumili ng Biblia",
  "New Testament": "Bagong Tipan", "Other books": "Ibang mga aklat", "This Bible has no books.": "Walang aklat ang Bibliang ito.",
  "No Bible view open": "Walang bukas na tanaw ng Biblia", "Open a Bible view to read:": "Magbukas ng tanaw ng Biblia para magbasa:", "Layouts \u2192 + New Bible view": "Ayos \u2192 + Bagong tanaw ng Biblia",
  "Show or hide the topic list": "Ipakita o itago ang listahan ng paksa", "Smaller text": "Mas maliit na titik", "Larger text": "Mas malaking titik",
  "Show your own marks (highlighting) in the topics": "Ipakita ang sarili mong mga marka sa mga paksa", "Save the Bibles of the open views as a set\u2026": "I-save bilang pangkat ang mga Biblia ng mga bukas na tanaw\u2026", "What a Bible view shows is set in its own side bar.": "Ang ipinapakita ng tanaw ng Biblia ay itinatakda sa sarili nitong gilid.",
  "Read aloud: voices\u2026": "Basahin nang malakas: mga boses\u2026", "Read aloud: voices": "Basahin nang malakas: mga boses", "System voices": "Mga boses ng system",
  "Web-engine voices": "Mga boses ng web engine", "Other languages": "Ibang mga wika", "Another language": "Ibang wika",
  "Add\u2026": "Idagdag\u2026", "Speed": "Bilis", "Try it": "Subukan",
  "In a Bible, go on into the next chapter": "Sa Biblia, magpatuloy sa susunod na kabanata", "Stop reading": "Itigil ang pagbasa", "Drag to resize": "Hilahin para baguhin ang laki",
  "Open in a Bible view": "Buksan sa tanaw ng Biblia", "No Bible here has this verse.": "Walang Biblia rito na may talatang ito.",
};
/** phrases with numbers or names in them */
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^(\d+) topics?$/, n => `${n} paksa`],
  [/^(\d+) Bibles? · (\d+) library modules \((\d+) Strong's dictionaries\) · (\d+) ms$/, (b, l, d, ms) => `${b} Biblia · ${l} module ng aklatan (${d} diksiyonaryo ni Strong) · ${ms} ms`],
  [/^Bible view: (.*)$/, x => `Tanaw ng Biblia: ${x}`], [/^Book view: (.*)$/, x => `Tanaw ng aklat: ${x}`], [/^Search (\d+)$/, n => `Paghahanap ${n}`], [/^Bible search (\d+)$/, n => `Paghahanap sa Biblia ${n}`], [/^Book search (\d+)$/, n => `Paghahanap sa aklat ${n}`],
  [/^Font for (.*)$/, x => `Font para sa ${x}`], [/^Properties of (.*)$/, x => `Mga katangian ng ${x}`], [/^Export from (.*)…$/, x => `I-export mula sa ${x}…`],
  [/^All (\d+) topics$/, n => `Lahat ng ${n} paksa`], [/^Clipboard: (\d+) references?$/, n => `Clipboard: ${n} sanggunian`],
];

let lang: 'en' | 'tl' = 'en'; let fixes: Record<string, string> = {}; const missing = new Set<string>(); const made = new Set<string>();
const SKIP = '#view, .entry, .ebody, .vtext, .s-results, .cbody, #libTopics, .vtopics, #printArea, #gview .gcap, .fnlist, #sheetBody .entry, .dlg .tlx, kbd, code, .brow .small, .vbible, .vmod, #libMod, .mslist label, .wldicts label';
export const missingPhrases = () => [...missing];
export const phrase = (en: string): string => lang === 'tl' ? (fixes[en] ?? TL[en] ?? en) : en;
function tr(s: string): string | null {
  const k = s.trim(); if (!k || !/[A-Za-z]/.test(k) || made.has(k)) return null;
  const f = fixes[k] ?? TL[k]; if (f != null) { made.add(f.trim()); return f === k ? null : s.replace(k, f); }
  for (const [re, fn] of PATTERNS) { const m = re.exec(k); if (m) { const o = fn(...m.slice(1)); made.add(o); return s.replace(k, o); } }
  if (k.length < 120 && !/^\d/.test(k)) missing.add(k);
  return null;
}
function walk(root: Node): void {
  if (root.nodeType === 3) { const p = root.parentElement; if (p && !p.closest(SKIP)) { const t = tr(root.textContent || ''); if (t != null) root.textContent = t; } return; }
  if (root.nodeType !== 1) return;
  const el = root as HTMLElement; if (el.closest(SKIP)) return;
  for (const a of ['title', 'placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v) { const t = tr(v); if (t != null) el.setAttribute(a, t); } }
  if (el.tagName === 'OPTION' || el.tagName === 'OPTGROUP') { const lb = el.getAttribute('label'); if (lb) { const t = tr(lb); if (t != null) el.setAttribute('label', t); } }
  for (const c of [...el.childNodes]) walk(c);
}
/** switch the screen to Tagalog (English needs a restart of the window, which reloads the page) */
export function initLang(l: string, userFixes: Record<string, string>): void {
  lang = l === 'tl' ? 'tl' : 'en'; fixes = userFixes || {};
  document.documentElement.lang = lang === 'tl' ? 'fil' : 'en';
  if (lang !== 'tl') return;
  walk(document.body);
  new MutationObserver(list => { for (const m of list) { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk); if (m.type === 'attributes' && m.target.nodeType === 1) walk(m.target); } })
    .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
}
export const currentLang = () => lang;

/** Tools → Tagalog translation…: correct a translation or add a missing one (kept in your settings) */
export function translationTable(): { en: string; tl: string; mine: boolean }[] {
  const keys = new Set([...Object.keys(TL), ...missing, ...Object.keys(fixes)]);
  return [...keys].sort((a, b) => Number(!!(TL[b] ?? fixes[b])) - Number(!!(TL[a] ?? fixes[a])) || a.localeCompare(b)).map(en => ({ en, tl: fixes[en] ?? TL[en] ?? '', mine: en in fixes }));
}
